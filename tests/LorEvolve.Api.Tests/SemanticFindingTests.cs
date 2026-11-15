using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Systems;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.ManuscriptTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The author's side of a submitted semantic finding (#154): reading what a connected AI client claimed, and
/// accepting or dismissing it.
///
/// <para>The MCP tests drive submission through the real transport. These go straight at the store and the author's
/// routes, so what is pinned down here is the part a connection never sees: that a decision is recorded with its
/// note, that a citation goes stale when the record it cited changes, that the ceiling on waiting claims holds, and
/// that nothing here can write a status meaning a violation was proven.</para>
/// </summary>
public sealed class SemanticFindingTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_claim_is_listed_as_unverified_and_carries_what_it_cited()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semlist");
        var entry = await Entry(client, universe.Id, "Ember Vale");

        var id = await Submit(universe.Id, "The heir is named twice", entry);

        var page = await client.GetFromJsonAsync<WorldLogicPage<SemanticFindingRow>>(Findings(universe.Id));

        var row = Assert.Single(page!.Items);
        Assert.Equal(id, row.Id);
        Assert.Equal("unverified", row.Status);
        Assert.Equal("The heir is named twice", row.Title);
        Assert.Equal(1, row.CitationCount);
        Assert.Null(row.DecidedAt);

        var detail = await client.GetFromJsonAsync<SemanticFindingDetail>(Finding(universe.Id, id));
        var citation = Assert.Single(detail!.Citations);
        Assert.Equal("lore_entry", citation.Kind);
        Assert.Equal(entry, citation.SourceId);
    }

    /// <summary>
    /// Accepting records that the author wants to act on the claim. It is still not a proven violation: the status
    /// says accepted, the deterministic findings table is untouched, and there is no status that could say more.
    /// </summary>
    [Fact]
    public async Task Accepting_a_claim_records_the_decision_and_writes_no_deterministic_finding()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semaccept");
        var entry = await Entry(client, universe.Id, "Ember Vale");
        var id = await Submit(universe.Id, "Worth acting on", entry);

        var decided = await Decide(client, universe.Id, id, "accept", "Good catch, I will rewrite the article.");

        Assert.Equal("accepted", decided.Finding.Status);
        Assert.NotNull(decided.Finding.DecidedAt);
        Assert.Equal("Good catch, I will rewrite the article.", decided.DecisionNote);

        var findings = await client.GetFromJsonAsync<WorldLogicPage<WorldLogicFindingRow>>(
            $"/api/universes/{universe.Id}/world-logic/findings");
        Assert.Empty(findings!.Items);
    }

    /// <summary>
    /// A decision can be changed, unlike a deterministic finding's: nothing recomputes a claim, so the author's
    /// reading of one is allowed to change, and the note and the time go with it.
    /// </summary>
    [Fact]
    public async Task A_decision_can_be_changed_and_the_note_is_rewritten_with_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semredecide");
        var entry = await Entry(client, universe.Id, "Ember Vale");
        var id = await Submit(universe.Id, "On second thought", entry);

        await Decide(client, universe.Id, id, "accept", "I think it is right.");
        var dismissed = await Decide(client, universe.Id, id, "dismiss", "No, I had already changed that.");

        Assert.Equal("dismissed", dismissed.Finding.Status);
        Assert.Equal("No, I had already changed that.", dismissed.DecisionNote);
    }

    [Fact]
    public async Task A_note_longer_than_the_limit_is_refused_and_the_claim_is_left_alone()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semnote");
        var entry = await Entry(client, universe.Id, "Ember Vale");
        var id = await Submit(universe.Id, "Too much to say", entry);

        var response = await client.PostAsJsonAsync(
            $"{Finding(universe.Id, id)}/dismiss",
            new SemanticFindingDecisionRequest(new string('x', SemanticFindingLimits.DecisionNoteMaxLength + 1)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var detail = await client.GetFromJsonAsync<SemanticFindingDetail>(Finding(universe.Id, id));
        Assert.Equal("unverified", detail!.Finding.Status);
    }

    /// <summary>
    /// The version a citation recorded is what makes a claim checkable, so a read says plainly when the record has
    /// moved on. An unknown version never reads as stale, because not knowing is not evidence of a change.
    /// </summary>
    [Fact]
    public async Task A_citation_reads_as_stale_once_the_record_it_cited_has_changed()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semstale");
        var entry = await Entry(client, universe.Id, "Ember Vale");

        var id = await Submit(universe.Id, "About version one", entry, sourceVersion: 1);

        var fresh = await client.GetFromJsonAsync<SemanticFindingDetail>(Finding(universe.Id, id));
        Assert.False(fresh!.Citations[0].IsStale);
        Assert.Equal(1, fresh.Citations[0].CurrentVersion);

        await Rename(client, universe.Id, entry, "Ember Vale the Younger");

        var stale = await client.GetFromJsonAsync<SemanticFindingDetail>(Finding(universe.Id, id));
        Assert.True(stale!.Citations[0].IsStale);
        Assert.Equal(1, stale.Citations[0].SourceVersion);
        Assert.Equal(2, stale.Citations[0].CurrentVersion);
    }

    [Fact]
    public async Task A_citation_with_no_recorded_version_never_reads_as_stale()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semnoversion");
        var entry = await Entry(client, universe.Id, "Ember Vale");

        var id = await Submit(universe.Id, "No version read", entry);
        await Rename(client, universe.Id, entry, "Ember Vale the Younger");

        var detail = await client.GetFromJsonAsync<SemanticFindingDetail>(Finding(universe.Id, id));

        Assert.Null(detail!.Citations[0].SourceVersion);
        Assert.False(detail.Citations[0].IsStale);
    }

    /// <summary>
    /// A connection that keeps submitting stops being useful and starts being a way to bury the author, so the
    /// ceiling refuses the next one rather than trimming silently. Deciding one makes room again.
    /// </summary>
    [Fact]
    public async Task Submission_is_refused_once_too_many_claims_are_waiting_and_a_decision_makes_room()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semceiling");
        var entry = await Entry(client, universe.Id, "Ember Vale");

        // Fill to the ceiling straight in the store, because submitting two hundred over MCP would prove the same
        // thing far more slowly.
        await Fill(universe.Id, entry, SemanticFindingLimits.MaxUnverifiedPerUniverse);

        var refused = await SubmitRaw(universe.Id, "One too many", entry);
        Assert.Null(refused.Finding);
        Assert.Contains(refused.Problems, problem => problem.Code == "too_many_waiting");

        var waiting = await client.GetFromJsonAsync<WorldLogicPage<SemanticFindingRow>>(
            $"{Findings(universe.Id)}?status=0&pageSize=1");
        await Decide(client, universe.Id, waiting!.Items[0].Id, "dismiss");

        var accepted = await SubmitRaw(universe.Id, "Room again", entry);
        Assert.NotNull(accepted.Finding);
    }

    [Fact]
    public async Task A_claim_of_another_universe_is_not_readable_or_decidable()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semboundary");
        var entry = await Entry(client, universe.Id, "Ember Vale");
        var id = await Submit(universe.Id, "Mine", entry);

        var (other, elsewhere) = await SignedInWithUniverse(_factory, "semboundary2");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Finding(elsewhere.Id, id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"{Finding(elsewhere.Id, id)}/accept", new SemanticFindingDecisionRequest())).StatusCode);

        // And the other universe's author cannot see it at all. The answer is "not found" rather than "forbidden",
        // because an outsider is not told whether the universe exists, which is what the access matrix holds too.
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Finding(universe.Id, id))).StatusCode);
    }

    /// <summary>
    /// A submission is refused whole: when anything is wrong, every problem is listed and nothing is written, so a
    /// client can fix them all and send again rather than discovering them one at a time.
    /// </summary>
    [Fact]
    public async Task A_submission_with_several_problems_lists_them_all_and_stores_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semproblems");

        var refused = await Run(async (db, clock) => await SemanticFindingSubmissions.SubmitAsync(
            db,
            clock,
            universe.Id,
            "someone",
            Guid.NewGuid(),
            "A client",
            new SemanticFindingInput(
                null,
                null,
                RuleId: Guid.NewGuid().ToString(),
                Citations:
                [
                    new SemanticCitationInput("not_a_kind", Guid.NewGuid().ToString(), "says so"),
                ]),
            CancellationToken.None));

        Assert.Null(refused.Finding);
        Assert.Contains(refused.Problems, problem => problem.Field == "title" && problem.Code == "required");
        Assert.Contains(refused.Problems, problem => problem.Field == "claim" && problem.Code == "required");
        Assert.Contains(refused.Problems, problem => problem.Field == "ruleId" && problem.Code == "not_found");
        Assert.Contains(refused.Problems, problem => problem.Citation == 0 && problem.Code == "unknown_kind");

        var page = await client.GetFromJsonAsync<WorldLogicPage<SemanticFindingRow>>(Findings(universe.Id));
        Assert.Empty(page!.Items);
    }

    /// <summary>
    /// The scope boundary inside one universe. A rule definition can belong to one project (ADR 0072), and the rules
    /// a connection lists are scoped the same way, so a claim may only be about or cite a rule its own scope reaches:
    /// a claim about the whole universe cannot cite one project's rule, and a claim about project A cannot cite
    /// project B's.
    /// </summary>
    [Fact]
    public async Task A_claim_cannot_cite_a_rule_of_a_project_its_own_scope_does_not_reach()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semprojectscope");
        var entry = await Entry(client, universe.Id, "Ember Vale");
        var projectA = await Project(client, universe.Id, "The Tide Engine");
        var projectB = await Project(client, universe.Id, "The Second Game");
        var ruleOfB = await ProjectRule(client, universe.Id, projectB, "B's own rule");

        // A claim about the whole universe cannot reach a rule that belongs to one project.
        var universeWide = await SubmitCiting(universe.Id, null, ("system_rule", ruleOfB, null));
        Assert.Null(universeWide.Finding);
        Assert.Contains(universeWide.Problems, problem => problem.Code == "out_of_scope" && problem.Citation == 0);

        // Nor can a claim about another project.
        var wrongProject = await SubmitCiting(universe.Id, projectA, ("system_rule", ruleOfB, null));
        Assert.Null(wrongProject.Finding);
        Assert.Contains(wrongProject.Problems, problem => problem.Code == "out_of_scope" && problem.Citation == 0);

        // Scoped to its own project it is in scope, and a universe-wide record stays citable beside it.
        var right = await SubmitCiting(universe.Id, projectB, ("system_rule", ruleOfB, null), ("lore_entry", entry, null));
        Assert.NotNull(right.Finding);
    }

    [Fact]
    public async Task A_claim_cannot_be_about_a_rule_of_a_project_its_own_scope_does_not_reach()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semrulescope");
        var entry = await Entry(client, universe.Id, "Ember Vale");
        var project = await Project(client, universe.Id, "The Tide Engine");
        var rule = await ProjectRule(client, universe.Id, project, "The project's own rule");

        var refused = await Run(async (db, clock) => await SemanticFindingSubmissions.SubmitAsync(
            db, clock, universe.Id, "mcp-submitter", Guid.NewGuid(), "A connected client",
            new SemanticFindingInput(
                "About a project rule, from nowhere",
                "The lore breaks it.",
                RuleId: rule.ToString(),
                Citations: [new SemanticCitationInput("lore_entry", entry.ToString(), "the entry")]),
            CancellationToken.None));

        Assert.Null(refused.Finding);
        Assert.Contains(refused.Problems, problem => problem.Field == "ruleId" && problem.Code == "out_of_scope");
    }

    /// <summary>
    /// A range is a span of prose, and a manuscript is the only thing cited here that has any, so a range on another
    /// kind points into text that does not exist and is refused rather than stored.
    /// </summary>
    [Fact]
    public async Task A_range_on_a_kind_with_no_prose_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semrangekind");
        var entry = await Entry(client, universe.Id, "Ember Vale");

        var refused = await SubmitCiting(universe.Id, null, ("lore_entry", entry, (0, 5)));

        Assert.Null(refused.Finding);
        Assert.Contains(refused.Problems, problem => problem.Code == "range_not_supported");
    }

    /// <summary>
    /// A range past the end of the prose is refused, and the refusal says how long the prose is now. The check is
    /// against the current text, which is the only text there is: a claim read at an earlier version can therefore
    /// be refused because the manuscript has since been shortened, and that is the honest answer.
    /// </summary>
    [Fact]
    public async Task A_range_outside_the_manuscript_is_refused_and_one_inside_it_is_kept()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "semrangetext");
        var scene = await SceneWithProse(client, universe.Id, "Twelve chars");

        var past = await SubmitCiting(universe.Id, null, ("manuscript", scene, (0, 500)));
        Assert.Null(past.Finding);
        Assert.Contains(past.Problems, problem => problem.Code == "out_of_range" && problem.Citation == 0);

        var startedPastTheEnd = await SubmitCiting(universe.Id, null, ("manuscript", scene, (5_000, 1)));
        Assert.Null(startedPastTheEnd.Finding);
        Assert.Contains(startedPastTheEnd.Problems, problem => problem.Code == "out_of_range");

        var inside = await SubmitCiting(universe.Id, null, ("manuscript", scene, (0, 6)));
        Assert.NotNull(inside.Finding);

        var detail = await client.GetFromJsonAsync<SemanticFindingDetail>(
            Finding(universe.Id, inside.Finding!.Id));
        Assert.Equal(0, detail!.Citations[0].RangeStart);
        Assert.Equal(6, detail.Citations[0].RangeLength);
    }

    // ---------- Helpers ----------

    private static string Findings(Guid universeId) => $"/api/universes/{universeId}/world-logic/semantic-findings";

    private static string Finding(Guid universeId, Guid findingId) => $"{Findings(universeId)}/{findingId}";

    private async Task<Guid> Entry(HttpClient client, Guid universeId, string name)
    {
        var types = await client.GetFromJsonAsync<List<Api.Features.Lore.EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types");
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new { entityTypeId = types!.First(type => type.Name == "Character").Id, name, summary = "The heir." });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<Api.Features.Lore.EntityDetail>())!.Id;
    }

    private static async Task<Guid> Project(HttpClient client, Guid universeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new
            {
                name,
                kind = 1,
                lifecycle = 0,
                subtype = (string?)null,
                summary = string.Empty,
                universeId,
                expectedVersion = (int?)null,
            });

        response.EnsureSuccessStatusCode();
        using var created = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return created.RootElement.GetProperty("id").GetGuid();
    }

    /// <summary>A rule definition scoped to one project, which only a claim about that project may reach.</summary>
    private static async Task<Guid> ProjectRule(HttpClient client, Guid universeId, Guid projectId, string title) =>
        (await PostJson<SystemRuleDetail>(
            client,
            $"/api/universes/{universeId}/system-rules",
            new SystemRuleRequest(title, "Only inside this project.", projectId))).Id;

    /// <summary>A scene with prose of a known length, so a range can be checked against it.</summary>
    private static async Task<Guid> SceneWithProse(HttpClient client, Guid universeId, string prose)
    {
        var story = await CreateStory(client, universeId, "The drowned heir");
        var scene = await CreateScene(client, universeId, story, "The causeway");
        await WriteManuscript(client, universeId, story, scene, prose);
        return scene;
    }

    /// <summary>One save, so the entry's version moves on and a citation to the earlier one goes stale.</summary>
    private static async Task Rename(HttpClient client, Guid universeId, Guid entry, string name)
    {
        var current = await client.GetFromJsonAsync<Api.Features.Lore.EntityDetail>(
            $"/api/universes/{universeId}/entities/{entry}");

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/entities/{entry}",
            new
            {
                entityTypeId = current!.EntityTypeId,
                name,
                summary = current.Summary,
                canonStatus = current.CanonStatus,
                expectedVersion = current.Version,
            });

        response.EnsureSuccessStatusCode();
    }

    private async Task<Guid> Submit(Guid universeId, string title, Guid entry, int? sourceVersion = null) =>
        (await SubmitRaw(universeId, title, entry, sourceVersion)).Finding!.Id;

    private Task<SemanticFindingResult> SubmitRaw(Guid universeId, string title, Guid entry, int? sourceVersion = null) =>
        Run(async (db, clock) => await SemanticFindingSubmissions.SubmitAsync(
            db,
            clock,
            universeId,
            "mcp-submitter",
            Guid.NewGuid(),
            "A connected client",
            new SemanticFindingInput(
                title,
                "Two records disagree, and one of them must be wrong.",
                Citations:
                [
                    new SemanticCitationInput("lore_entry", entry.ToString(), "the entry in question", sourceVersion),
                ]),
            CancellationToken.None));

    /// <summary>One submission citing exactly what the test names, each with an optional range.</summary>
    private Task<SemanticFindingResult> SubmitCiting(
        Guid universeId,
        Guid? projectId,
        params (string Kind, Guid SourceId, (int Start, int Length)? Range)[] citations) =>
        Run(async (db, clock) => await SemanticFindingSubmissions.SubmitAsync(
            db,
            clock,
            universeId,
            "mcp-submitter",
            Guid.NewGuid(),
            "A connected client",
            new SemanticFindingInput(
                "Something worth a look",
                "Two records disagree, and one of them must be wrong.",
                ProjectId: projectId?.ToString(),
                Citations:
                [
                    .. citations.Select(citation => new SemanticCitationInput(
                        citation.Kind,
                        citation.SourceId.ToString(),
                        "what this contributes",
                        RangeStart: citation.Range?.Start,
                        RangeLength: citation.Range?.Length)),
                ]),
            CancellationToken.None));

    /// <summary>Waiting claims written straight in, to reach the ceiling without two hundred round trips.</summary>
    private Task Fill(Guid universeId, Guid entry, int count) =>
        Run(async (db, clock) =>
        {
            var now = clock.GetUtcNow().UtcDateTime;
            for (var index = 0; index < count; index++)
            {
                var finding = new SemanticFinding
                {
                    Id = Guid.NewGuid(),
                    UniverseId = universeId,
                    Title = $"Waiting {index}",
                    Claim = "Something the author has not read yet.",
                    Status = SemanticFindingStatus.Unverified,
                    ConnectionId = Guid.NewGuid(),
                    ClientName = "A connected client",
                    SubmittedByUserId = "mcp-submitter",
                    CreatedAt = now,
                    UpdatedAt = now,
                };

                finding.Citations.Add(new SemanticFindingCitation
                {
                    FindingId = finding.Id,
                    SortOrder = 0,
                    Kind = SemanticCitationKind.LoreEntry,
                    SourceId = entry,
                    Note = "the entry",
                });

                db.SemanticFindings.Add(finding);
            }

            await db.SaveChangesAsync();
            return true;
        });

    private static async Task<SemanticFindingDetail> Decide(
        HttpClient client,
        Guid universeId,
        Guid findingId,
        string verb,
        string? note = null)
    {
        var response = await client.PostAsJsonAsync(
            $"{Finding(universeId, findingId)}/{verb}",
            new SemanticFindingDecisionRequest(note));

        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SemanticFindingDetail>())!;
    }

    /// <summary>One unit of work on the host's own context, as the other store tests do it.</summary>
    private async Task<T> Run<T>(Func<LorEvolveDbContext, TimeProvider, Task<T>> work)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();
        return await work(db, clock);
    }
}
