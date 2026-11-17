using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.RuleValidation.Conditions;
using LorEvolve.Api.Features.Systems;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Machine findings through the real host (#360, ADR 0073, state machine specification, sections 4 to 6).
///
/// <para>The fixtures prove the two checks; <see cref="WorldLogicMachineFixtureTests"/> runs them. What is new here
/// is the recording: a machine record becomes an ordinary finding with no rule, the sweep reconciles it as it does a
/// rule finding, the author's three decisions work on it, a truncated sweep closes nothing, and deleting the System
/// or the universe takes its machine findings with it, so no finding is ever left naming neither a rule nor a
/// machine.</para>
/// </summary>
public sealed class WorldLogicMachineFindingTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task An_undeclared_value_opens_one_finding_and_fixing_it_closes_it()
    {
        var world = await World("wlmfundeclared");
        var entry = await Entry(world, "Ilsa", "grandmaster");

        var first = await Sweep(world);
        Assert.Equal(1 + GuardRuleFindings, first.Created);

        var row = Assert.Single(await Machines(world));
        Assert.Null(row.RuleId);
        Assert.Null(row.RuleTitle);
        Assert.Equal("violation", row.Outcome);
        Assert.Equal("open", row.Status);
        Assert.Equal(world.SystemVersion, row.RuleVersion);

        var machine = row.Machine!;
        Assert.Equal(world.SystemId, machine.SystemId);
        Assert.Equal("Rank", machine.SystemName);
        Assert.Equal("undeclared_state", machine.Check);
        Assert.Null(machine.StateId);
        Assert.Null(machine.StateName);
        Assert.Equal(entry, machine.SubjectId);
        Assert.Equal("Ilsa", machine.SubjectName);
        await AssertInvariant(world.UniverseId);

        await SetRank(entry, "novice");

        var fixedSweep = await Sweep(world);
        Assert.Equal(GuardRuleFindings, fixedSweep.Detected);
        Assert.Equal(1, fixedSweep.Closed);
        Assert.Equal("resolved", Assert.Single(await Machines(world)).Status);
    }

    [Fact]
    public async Task All_guards_failing_is_a_violation()
    {
        var world = await World("wlmfviolation");
        var entry = await Entry(world, "Corin", "journeyman", years: 1);

        Assert.Equal(1 + GuardRuleFindings, (await Sweep(world)).Created);

        var row = Assert.Single(await Machines(world));
        Assert.Equal("violation", row.Outcome);
        Assert.Equal("high", row.Severity);
        Assert.Equal("no_transition_holds", row.Machine!.Check);
        Assert.Equal(world.Journeyman, row.Machine.StateId);
        Assert.Equal("Journeyman", row.Machine.StateName);

        // Section 5: the subject, the bound attribute, then each transition tried and its guard's own evidence.
        var detail = await Detail(world, row.Id);
        Assert.Equal(new ConditionEvidenceRow("subjects", entry.ToString(), "self"), detail.Evidence[0]);
        Assert.Equal(new ConditionEvidenceRow("subjects", entry.ToString(), "attribute:rank"), detail.Evidence[1]);
        Assert.Equal(new ConditionEvidenceRow("transitions", world.Advance.ToString(), "guard:false"), detail.Evidence[2]);
        Assert.Contains(detail.Rationale, line => line.Contains(world.Advance.ToString(), StringComparison.Ordinal));
        await AssertInvariant(world.UniverseId);
    }

    [Fact]
    public async Task Unknown_and_error_guards_follow_the_spec()
    {
        var world = await World("wlmfunknown");
        await Entry(world, "Unrecorded", "journeyman");
        await Entry(world, "Titled", "master");
        await Entry(world, "Waived", "journeyman", years: 1, waived: true);

        var summary = await Sweep(world);
        Assert.Equal(2 + GuardRuleFindings, summary.Created);

        var rows = await Machines(world);

        // A missing attribute makes the guard unknown, never a violation.
        var unknown = rows.Single(row => row.Machine!.SubjectName == "Unrecorded");
        Assert.Equal("unknown", unknown.Outcome);
        Assert.Equal("low", unknown.Severity);
        Assert.Null(unknown.ErrorCode);

        // A guard that compares text with a number is an error with its code, not a violation of the lore.
        var error = rows.Single(row => row.Machine!.SubjectName == "Titled");
        Assert.Equal("error", error.Outcome);
        Assert.Equal("medium", error.Severity);
        Assert.Equal(ConditionErrors.TypeMismatch, error.ErrorCode);
        Assert.Equal(world.Master, error.Machine!.StateId);

        // An exempt guard counts as met, so the waived entry has no finding.
        Assert.DoesNotContain(rows, row => row.Machine!.SubjectName == "Waived");
    }

    [Fact]
    public async Task Two_sweeps_over_unchanged_data_create_nothing_new()
    {
        var world = await World("wlmftwice");
        await Entry(world, "Corin", "journeyman", years: 1);
        await Entry(world, "Ilsa", "grandmaster");

        var first = await Sweep(world);
        Assert.Equal(2 + GuardRuleFindings, first.Created);

        var second = await Sweep(world);
        Assert.Equal(2 + GuardRuleFindings, second.Detected);
        Assert.Equal(0, second.Created);
        Assert.Equal(0, second.Reopened);
        Assert.Equal(2 + GuardRuleFindings, second.Persisted);
        Assert.Equal(0, second.Closed);
        Assert.Equal(2, (await Machines(world)).Count);
    }

    /// <summary>
    /// Guard evidence is out of the fingerprint (specification section 6), so a second way into the state that also
    /// fails refreshes the same finding, and its stored evidence shows the guards as they answer now. A sweep over
    /// the data as it then stands writes nothing.
    /// </summary>
    [Fact]
    public async Task A_refreshed_machine_finding_shows_the_guards_as_they_answer_now()
    {
        var world = await World("wlmfrefresh");
        await Entry(world, "Corin", "journeyman", years: 1);
        await Sweep(world);

        var before = Assert.Single(await Machines(world));
        var first = await Detail(world, before.Id);
        Assert.DoesNotContain(first.Evidence, item => item.Source == "transitions" && item.Role != "guard:false");
        Assert.Single(first.Evidence, item => item.Source == "transitions");

        // A second way into journeyman, guarded by the same rule, which fails for Corin too.
        var machine = await MachineDetail(world);
        var second = Guid.NewGuid();
        var returned = machine.States.Single(state => state.Value == "returned").Id;
        await PutJson<SystemMachineDetail>(world.Client, Machine(world.UniverseId, world.SystemId), new SystemMachineRequest(
            1,
            machine.Binding,
            machine.States,
            [.. machine.Transitions, new(second, returned, world.Journeyman, "Readmitted", world.ServedRule)],
            machine.Version));

        var refreshed = await Sweep(world);
        Assert.Equal(0, refreshed.Created);
        Assert.Equal(0, refreshed.Closed);

        var after = Assert.Single(await Machines(world));
        Assert.Equal(before.Id, after.Id);
        Assert.Equal(before.Fingerprint, after.Fingerprint);
        Assert.Equal("open", after.Status);
        Assert.Equal(before.CreatedAt, after.CreatedAt);

        var now = await Detail(world, after.Id);
        Assert.Equal(
            [$"{world.Advance}:guard:false", $"{second}:guard:false"],
            now.Evidence.Where(item => item.Source == "transitions").Select(item => $"{item.Id}:{item.Role}"));
        Assert.Equal(first.Evidence.Take(2), now.Evidence.Take(2));
        Assert.Equal(first.History, now.History);

        // Unchanged data: nothing is rewritten, so the finding's last change stays where the refresh put it.
        await Sweep(world);
        var still = await Detail(world, after.Id);
        Assert.Equal(now.Finding.UpdatedAt, still.Finding.UpdatedAt);
        Assert.Equal(now.Evidence, still.Evidence);
    }

    /// <summary>
    /// The type holds more entries than one run reads, so the machine did not see them all, and the sweep must not
    /// conclude that a finding it did not see again is gone.
    /// </summary>
    [Fact]
    public async Task A_truncated_sweep_closes_nothing()
    {
        var world = await World("wlmftruncated");
        var entry = await Entry(world, "Corin", "journeyman", years: 1);
        Assert.Equal(1 + GuardRuleFindings, (await Sweep(world)).Created);

        await SetRank(entry, "novice");

        await WithDb(_factory, async db =>
        {
            var now = DateTime.UtcNow;
            db.Entities.AddRange(Enumerable.Range(0, ConditionBudget.Default.MaxQueryRows + 1).Select(index => new LoreEntity
            {
                Id = Guid.NewGuid(),
                UniverseId = world.UniverseId,
                EntityTypeId = world.Type,
                Name = $"Seeded {index}",
                CanonStatus = CanonStatus.Canon,
                CreatedAt = now,
                UpdatedAt = now,
                FieldValues = [new EntityFieldValue { Id = Guid.NewGuid(), FieldDefinitionId = world.Rank, TextValue = "novice" }],
            }));
            await db.SaveChangesAsync();
        });

        var summary = await Sweep(world);
        Assert.True(summary.IsTruncated);
        Assert.Equal(0, summary.Closed);
        Assert.Equal("open", Assert.Single(await Machines(world)).Status);
    }

    [Fact]
    public async Task Review_dismiss_and_resolve_work_on_a_machine_finding()
    {
        var world = await World("wlmfdecide");
        await Entry(world, "Corin", "journeyman", years: 1);
        await Sweep(world);
        var row = Assert.Single(await Machines(world));

        Assert.Equal("reviewing", (await Decide(world, row.Id, "review", "Looking into it.")).Finding.Status);
        Assert.Equal("dismissed", (await Decide(world, row.Id, "dismiss", "Corin was raised early.")).Finding.Status);

        // A dismissal survives a sweep while the problem is still there.
        Assert.Equal(1 + GuardRuleFindings, (await Sweep(world)).Persisted);
        Assert.Equal("dismissed", Assert.Single(await Machines(world)).Status);

        var resolved = await Decide(world, row.Id, "resolve", "Fixed, I think.");
        Assert.Equal("resolved", resolved.Finding.Status);
        Assert.Equal(["detected", "reviewed", "dismissed", "resolved"], resolved.History.Select(entry => entry.Action));
        Assert.All(resolved.History.Skip(1), entry => Assert.NotNull(entry.ActorId));

        // The author's resolve is not a suppression: the sweep still produces it, so it reopens.
        Assert.Equal(1, (await Sweep(world)).Reopened);
        Assert.Equal("open", Assert.Single(await Machines(world)).Status);
    }

    [Fact]
    public async Task A_project_sweep_leaves_other_scopes_alone()
    {
        var world = await World("wlmfscope");
        var entry = await Entry(world, "Corin", "journeyman", years: 1);
        var project = await CreateProject(world);

        Assert.Equal(1 + GuardRuleFindings, (await Sweep(world)).Created);
        Assert.Equal(1 + GuardRuleFindings, (await Sweep(world, project)).Created);
        Assert.Equal(2, (await Machines(world)).Count);

        await SetRank(entry, "novice");

        // The project's sweep closes the project's finding, and leaves the universe's where it was.
        Assert.Equal(1, (await Sweep(world, project)).Closed);

        var rows = await Machines(world);
        Assert.Equal("resolved", rows.Single(row => row.ProjectId == project).Status);
        Assert.Equal("open", rows.Single(row => row.ProjectId == null).Status);
        await AssertInvariant(world.UniverseId);
    }

    [Fact]
    public async Task Deleting_the_system_or_the_universe_removes_its_machine_findings()
    {
        var world = await World("wlmfdelete");
        await Entry(world, "Corin", "journeyman", years: 1);
        await RuleFinding(world);

        Assert.Equal(2 + GuardRuleFindings, (await Sweep(world)).Created);
        var machineFinding = Assert.Single(await Machines(world)).Id;

        Assert.Equal(HttpStatusCode.NoContent, (await world.Client.DeleteAsync(System(world.UniverseId, world.SystemId))).StatusCode);

        // The rule finding is the rule's and stays; the machine finding went with its System, history and all.
        var left = (await List(world)).Items;
        Assert.Equal(1 + GuardRuleFindings, left.Count);
        Assert.All(left, row => Assert.NotNull(row.RuleId));
        await WithDb(_factory, async db =>
        {
            Assert.Equal(0, await db.WorldLogicFindingEvidence.CountAsync(item => item.FindingId == machineFinding));
            Assert.Equal(0, await db.WorldLogicFindingEvents.CountAsync(item => item.FindingId == machineFinding));
            Assert.Equal(0, await db.WorldLogicFindingMachines.CountAsync(link => link.FindingId == machineFinding));
        });
        await AssertInvariant(world.UniverseId);

        // A second System's machine findings go with the universe.
        var again = await World("wlmfdeleteuniverse");
        await Entry(again, "Corin", "journeyman", years: 1);
        Assert.Equal(1 + GuardRuleFindings, (await Sweep(again)).Created);

        (await again.Client.PostAsync($"/api/universes/{again.UniverseId}/archive", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await again.Client.DeleteAsync($"/api/universes/{again.UniverseId}")).StatusCode);

        await WithDb(_factory, async db =>
        {
            Assert.Equal(0, await db.WorldLogicFindings.CountAsync(finding => finding.UniverseId == again.UniverseId));
        });
    }

    [Fact]
    public async Task Trying_an_entry_returns_every_guard_and_the_record()
    {
        var world = await World("wlmftry");
        var entry = await Entry(world, "Titled", "master", years: 5);

        var tried = await Try(world, entry);
        Assert.Equal("master", tried.Value);

        // Every transition, in declared order, without the short-circuit: the advance holds, the raise errs.
        Assert.Equal(
            [
                new SystemMachineGuardRow(world.Advance, "true", null),
                new SystemMachineGuardRow(world.Raise, "error", ConditionErrors.TypeMismatch),
                new SystemMachineGuardRow(world.Return, "none", null),
            ],
            tried.Transitions);

        var record = Assert.Single(tried.Records);
        Assert.Equal(world.SystemId, record.SystemId);
        Assert.Equal(world.SystemVersion, record.SystemVersion);
        Assert.Equal(1, record.SchemaVersion);
        Assert.Equal("no_transition_holds", record.Check);
        Assert.Equal(world.Master, record.StateId);
        Assert.Equal(entry, record.SubjectId);
        Assert.Equal("error", record.Outcome);
        Assert.Equal(ConditionErrors.TypeMismatch, record.ErrorCode);
        Assert.Equal(new ConditionEvidenceRow("transitions", world.Raise.ToString(), "guard:error"), record.Evidence[2]);
        Assert.NotEmpty(record.Rationale);

        // It wrote nothing.
        Assert.Equal(0, (await Machines(world)).Count);

        // An entry in the initial state has no record, and an entry outside the universe is not found.
        Assert.Empty((await Try(world, await Entry(world, "New", "novice"))).Records);

        var other = await CreateUniverse(world.Client, "World wlmftry second");
        var foreign = await CreateEntity(world.Client, other.Id, "Elsewhere");
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await world.Client.PostAsync($"{Machine(world.UniverseId, world.SystemId)}/evaluate/{foreign}", null)).StatusCode);

        // A System with no machine answers empty lists.
        var bare = await PostJson<SystemDetail>(world.Client, Systems(world.UniverseId), new SystemRequest("Bare", null));
        var empty = (await (await world.Client.PostAsync($"{Machine(world.UniverseId, bare.Id)}/evaluate/{entry}", null))
            .Content.ReadFromJsonAsync<SystemMachineTryResponse>())!;
        Assert.Null(empty.Value);
        Assert.Empty(empty.Transitions);
        Assert.Empty(empty.Records);
    }

    [Fact]
    public async Task The_machine_reads_back_open_counts_per_state()
    {
        var world = await World("wlmfcounts");
        await Entry(world, "Corin", "journeyman", years: 1);
        await Entry(world, "Dara", "journeyman", years: 2);
        await Entry(world, "Titled", "master");
        await Entry(world, "Ilsa", "grandmaster");
        await Sweep(world);

        var read = await MachineDetail(world);
        Assert.Equal(
            [new SystemMachineOpenFindings(world.Journeyman, 2), new SystemMachineOpenFindings(world.Master, 1)],
            read.OpenFindings);

        // A reviewing finding still counts; a dismissed one does not.
        var rows = (await Machines(world)).Where(row => row.Machine!.StateId == world.Journeyman).ToList();
        await Decide(world, rows[0].Id, "review");
        await Decide(world, rows[1].Id, "dismiss");

        Assert.Equal(
            [new SystemMachineOpenFindings(world.Journeyman, 1), new SystemMachineOpenFindings(world.Master, 1)],
            (await MachineDetail(world)).OpenFindings);
    }

    // ---------- The world these tests sweep ----------

    /// <summary>
    /// A universe whose Character type carries a text field <c>rank</c> and the numbers and flags the guards read,
    /// and a System Rank whose machine is: novice (initial), journeyman reached when the entry has served three
    /// years unless waived, master reached by a guard that compares text with a number (an error for every entry),
    /// and a returned state reached by an unguarded transition.
    /// </summary>
    private async Task<MachineWorld> World(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universe.Id}/entity-types"))!;
        var type = types.First(candidate => candidate.Name == "Character").Id;

        var rank = (await AiChangeTestClient.Field(client, universe.Id, type,
            new FieldDefinitionRequest("rank", EntityFieldKind.ShortText, false, null, null, null))).Id;
        var years = (await AiChangeTestClient.Field(client, universe.Id, type,
            new FieldDefinitionRequest("years", EntityFieldKind.Number, false, null, null, null))).Id;
        var waived = (await AiChangeTestClient.Field(client, universe.Id, type,
            new FieldDefinitionRequest("waived", EntityFieldKind.Boolean, false, null, null, null))).Id;

        var served = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest(
            "Served", null, null, 1, Parse(SelfAtLeast("years", 3)), null, null, Parse(Waived())));
        var mismatched = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest(
            "Rank at least one", null, null, 1, Parse(SelfAtLeast("rank", 1))));

        var system = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Rank", null));
        Guid novice = Guid.NewGuid(), journeyman = Guid.NewGuid(), master = Guid.NewGuid(), returned = Guid.NewGuid();
        Guid advance = Guid.NewGuid(), raise = Guid.NewGuid(), back = Guid.NewGuid();

        var machine = await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), new SystemMachineRequest(
            1,
            new SystemMachineBinding("Character", "rank"),
            [
                new(novice, "Novice", "novice", true, 0, 0),
                new(journeyman, "Journeyman", "journeyman", false, 320, 0),
                new(master, "Master", "master", false, 640, 0),
                new(returned, "Returned", "returned", false, 640, 200),
            ],
            [
                new(advance, novice, journeyman, "Advanced", served.Id),
                new(raise, journeyman, master, "Raised", mismatched.Id),
                new(back, journeyman, returned, "Returned", null),
            ],
            system.Version));

        return new MachineWorld(client, universe.Id, system.Id, machine.Version, type, rank, years, waived,
            journeyman, master, advance, raise, back, served.Id);
    }

    private sealed record MachineWorld(
        HttpClient Client,
        Guid UniverseId,
        Guid SystemId,
        int SystemVersion,
        Guid Type,
        Guid Rank,
        Guid Years,
        Guid Waived,
        Guid Journeyman,
        Guid Master,
        Guid Advance,
        Guid Raise,
        Guid Return,
        Guid ServedRule);

    private static async Task<Guid> Entry(MachineWorld world, string name, string rank, double? years = null, bool waived = false)
    {
        List<FieldValueInput> fields = [new(world.Rank, rank, null, null, null, null, null)];
        if (years is { } served)
        {
            fields.Add(new(world.Years, null, served, null, null, null, null));
        }

        // Always written: a missing flag would make the waiver unknown, and the guard with it.
        fields.Add(new(world.Waived, null, null, waived, null, null, null));

        return (await PostJson<EntityDetail>(
            world.Client,
            $"/api/universes/{world.UniverseId}/entities",
            new EntityRequest(world.Type, name, null, CanonStatus.Canon, null, null, fields))).Id;
    }

    /// <summary>A plain rule finding beside the machine ones: a universe with no dragon.</summary>
    private static Task<SystemRuleDetail> RuleFinding(MachineWorld world) =>
        PostJson<SystemRuleDetail>(world.Client, Rules(world.UniverseId), new SystemRuleRequest(
            "A dragon is on record", null, null, 1,
            Parse("{\"kind\":\"exists\",\"query\":{\"from\":\"subjects\",\"where\":[{\"field\":\"type\",\"op\":\"eq\",\"value\":\"Dragon\",\"type\":\"text\"}]}}")));

    /// <summary>Moves an entry's rank behind the API, as fixing the lore would, without touching anything else.</summary>
    private async Task SetRank(Guid entry, string rank) =>
        await WithDb(_factory, async db =>
        {
            var value = await db.EntityFieldValues.SingleAsync(candidate =>
                candidate.EntityId == entry && candidate.FieldDefinition!.Name == "rank");
            value.TextValue = rank;
            await db.SaveChangesAsync();
        });

    /// <summary>Every finding of the universe names a rule or a machine, never both and never neither.</summary>
    private async Task AssertInvariant(Guid universeId) =>
        await WithDb(_factory, async db =>
        {
            var broken = await db.WorldLogicFindings
                .Where(finding => finding.UniverseId == universeId)
                .CountAsync(finding => (finding.RuleId == null) == (finding.Machine == null));
            Assert.Equal(0, broken);
        });

    private static async Task<Guid> CreateProject(MachineWorld world) =>
        (await PostJson<ProjectDetail>(
            world.Client,
            "/api/projects",
            new ProjectRequest("Saga", ProjectKind.Game, ProjectLifecycle.Planning, null, null, world.UniverseId, null))).Id;

    private static async Task<WorldLogicSweepResponse> Sweep(MachineWorld world, Guid? projectId = null)
    {
        var query = projectId is { } project ? $"?projectId={project}" : string.Empty;
        var response = await world.Client.PostAsync($"{Findings(world.UniverseId)}/evaluate{query}", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WorldLogicSweepResponse>())!;
    }

    /// <summary>
    /// The two guards are rules written with <c>self</c>, so a sweep with no target answers each one unknown and
    /// records it beside the machine findings, as it does for any such rule (ADR 0072).
    /// </summary>
    private const int GuardRuleFindings = 2;

    /// <summary>The machine findings of the universe, without the guard rules' own.</summary>
    private static async Task<List<WorldLogicFindingRow>> Machines(MachineWorld world) =>
        [.. (await List(world)).Items.Where(row => row.Machine is not null)];

    private static async Task<WorldLogicPage<WorldLogicFindingRow>> List(MachineWorld world) =>
        (await world.Client.GetFromJsonAsync<WorldLogicPage<WorldLogicFindingRow>>($"{Findings(world.UniverseId)}?pageSize=100"))!;

    private static async Task<WorldLogicFindingDetail> Detail(MachineWorld world, Guid findingId) =>
        (await world.Client.GetFromJsonAsync<WorldLogicFindingDetail>($"{Findings(world.UniverseId)}/{findingId}"))!;

    private static async Task<WorldLogicFindingDetail> Decide(MachineWorld world, Guid findingId, string verb, string? note = null)
    {
        var response = await world.Client.PostAsJsonAsync(
            $"{Findings(world.UniverseId)}/{findingId}/{verb}",
            new WorldLogicFindingDecisionRequest(note));

        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WorldLogicFindingDetail>())!;
    }

    private static async Task<SystemMachineTryResponse> Try(MachineWorld world, Guid entry)
    {
        var response = await world.Client.PostAsync($"{Machine(world.UniverseId, world.SystemId)}/evaluate/{entry}", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SystemMachineTryResponse>())!;
    }

    private static async Task<SystemMachineDetail> MachineDetail(MachineWorld world) =>
        (await world.Client.GetFromJsonAsync<SystemMachineDetail>(Machine(world.UniverseId, world.SystemId)))!;

    private static string Findings(Guid universeId) => $"/api/universes/{universeId}/world-logic/findings";

    private static string Systems(Guid universeId) => $"/api/universes/{universeId}/systems";

    private static string System(Guid universeId, Guid systemId) => $"{Systems(universeId)}/{systemId}";

    private static string Machine(Guid universeId, Guid systemId) => $"{System(universeId, systemId)}/machine";

    private static string Rules(Guid universeId) => $"/api/universes/{universeId}/system-rules";

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    /// <summary>A rule about <c>self</c>: its attribute is at least the number.</summary>
    private static string SelfAtLeast(string attribute, int floor) =>
        "{\"kind\":\"compare\",\"left\":{\"attribute\":\"" + attribute + "\",\"of\":{\"subject\":\"self\"}},"
        + $"\"op\":\"gte\",\"right\":{{\"literal\":{floor},\"type\":\"number\"}}}}";

    /// <summary>The exception list that waives the service rule for an entry marked waived.</summary>
    private static string Waived() =>
        "[{\"id\":\"ex.waiver\",\"scope\":{\"kind\":\"universe\"},\"when\":"
        + "{\"kind\":\"compare\",\"left\":{\"attribute\":\"waived\",\"of\":{\"subject\":\"self\"}},"
        + "\"op\":\"eq\",\"right\":{\"literal\":true,\"type\":\"boolean\"}}}]";
}
