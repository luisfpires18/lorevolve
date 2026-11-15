using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.RuleValidation.Conditions;
using LorEvolve.Api.Features.Systems;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Persisted findings over a universe's own rows, through the real host (#153, ADR 0072).
///
/// <para>The fixtures prove the semantics and #151 proved the mapping. What is new here is the recording: that the
/// three outcomes worth reporting are kept apart, that a finding names the rule version that produced it and the
/// evidence it depended on, that a second sweep over unchanged lore recognises what it already recorded, that a
/// finding the rules stop producing is closed rather than left standing, and that a dismissal is the author's and
/// survives both a sweep and a restore.</para>
///
/// <para>Nothing here touches Canon. <c>Features/CanonIntegrity</c> keeps its own conflicts and its own promotion
/// gate, and <see cref="Canon_conflicts_are_untouched_by_a_world_logic_sweep"/> holds that line.</para>
/// </summary>
public sealed class WorldLogicFindingTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    /// <summary>
    /// The acceptance criterion the whole table exists for: a proven violation, missing data and a broken rule are
    /// three different findings, and none of them is reported as another.
    /// </summary>
    [Fact]
    public async Task A_sweep_keeps_a_violation_an_unknown_and_an_evaluator_error_apart()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfind");

        var violation = await Rule(client, universe.Id, "A dragon is on record", DragonExists());
        var unknown = await Rule(client, universe.Id, "Purity floor", PurityAtLeast(2));
        var error = await Rule(client, universe.Id, "Mismatched", TextAtLeastNumber());

        var summary = await Sweep(client, universe.Id);
        Assert.Equal(3, summary.Detected);
        Assert.Equal(3, summary.Created);
        Assert.Equal(0, summary.Closed);
        Assert.False(summary.IsTruncated);

        var findings = await List(client, universe.Id);
        Assert.Equal(3, findings.TotalCount);

        var proven = findings.Items.Single(row => row.RuleId == violation);
        Assert.Equal("violation", proven.Outcome);
        Assert.Equal("high", proven.Severity);
        Assert.Equal("open", proven.Status);
        Assert.Null(proven.ErrorCode);

        // A rule written with self and asked without a target cannot be answered from the stored facts. That is
        // missing data, never a violation: ADR 0072's rule that unknown is never coerced to false.
        var missing = findings.Items.Single(row => row.RuleId == unknown);
        Assert.Equal("unknown", missing.Outcome);
        Assert.Equal("low", missing.Severity);
        Assert.Null(missing.ErrorCode);

        // A rule comparing text with a number is a modelling mistake the author must see, not a pass and not a
        // violation of the lore.
        var broken = findings.Items.Single(row => row.RuleId == error);
        Assert.Equal("error", broken.Outcome);
        Assert.Equal("medium", broken.Severity);
        Assert.Equal(ConditionErrors.TypeMismatch, broken.ErrorCode);

        // What needs attention leads: the violation, then the error, then the unknown.
        Assert.Equal(["violation", "error", "unknown"], findings.Items.Select(row => row.Outcome));
    }

    /// <summary>
    /// Reproducibility: a finding names the rule and the version that produced it, the schema version it was
    /// written against, the evidence the outcome depended on and the evaluator's own trace.
    /// </summary>
    [Fact]
    public async Task A_finding_records_the_rule_version_the_evidence_and_the_trace()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfindevidence");
        var entry = await CreateEntity(client, universe.Id, "Arlen");

        // A rule about one named entry rather than about the evaluation target, so a sweep can answer it, and its
        // outcome depends on that entry: the finding has to record it as the evidence it rested on.
        var ruleId = await Rule(client, universe.Id, "Arlen is a dragon", EntryIsOfType(entry, "Dragon"));

        await Sweep(client, universe.Id);

        var row = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal("violation", row.Outcome);
        Assert.Equal(1, row.RuleVersion);
        Assert.Equal(ConditionSchema.CurrentVersion, row.SchemaVersion);

        var detail = (await client.GetFromJsonAsync<WorldLogicFindingDetail>(Finding(universe.Id, row.Id)))!;
        Assert.Equal(row.Id, detail.Finding.Id);
        Assert.NotEmpty(detail.Rationale);
        Assert.Equal(detail.Evidence.Count, detail.Finding.EvidenceCount);
        Assert.Contains(detail.Evidence, item => item.Source == "subjects" && item.Id == entry.ToString());

        // The history opens with the detection, and no account made it: evaluation did.
        var detected = Assert.Single(detail.History);
        Assert.Equal("detected", detected.Action);
        Assert.Null(detected.ActorId);

        // Editing the rule's words moves the version the finding reports, and does not open a second finding: the
        // fingerprint is over the problem, not over the wording.
        await PutJson<SystemRuleDetail>(
            client,
            $"{Rules(universe.Id)}/{ruleId}",
            new SystemRuleRequest("Arlen is a dragon", "Edited.", null, 1, Parse(EntryIsOfType(entry, "Dragon")), null, 1));

        await Sweep(client, universe.Id);

        var refreshed = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(row.Id, refreshed.Id);
        Assert.Equal(2, refreshed.RuleVersion);
    }

    /// <summary>A sweep is idempotent: a second run over unchanged lore and unchanged rules records nothing new.</summary>
    [Fact]
    public async Task A_second_sweep_over_unchanged_lore_recognises_what_it_already_recorded()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfindagain");
        await Rule(client, universe.Id, "A dragon is on record", DragonExists());

        var first = await Sweep(client, universe.Id);
        Assert.Equal(1, first.Created);

        var second = await Sweep(client, universe.Id);
        Assert.Equal(1, second.Detected);
        Assert.Equal(0, second.Created);
        Assert.Equal(1, second.Persisted);
        Assert.Equal(0, second.Reopened);
        Assert.Equal(0, second.Closed);

        Assert.Equal(1, (await List(client, universe.Id)).TotalCount);
    }

    /// <summary>
    /// The acceptance criterion about stale findings: a finding the rules no longer produce is closed by
    /// evaluation, and the closing is in its history.
    /// </summary>
    [Fact]
    public async Task A_finding_the_rules_no_longer_produce_is_closed_by_the_next_sweep()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfindstale");
        await CreateEntity(client, universe.Id, "Arlen");
        var ruleId = await Rule(client, universe.Id, "A dragon is on record", DragonExists());

        await Sweep(client, universe.Id);
        var row = Assert.Single((await List(client, universe.Id)).Items);

        // The rule now asks about a type the universe does have, so it holds and the finding is gone.
        await PutJson<SystemRuleDetail>(
            client,
            $"{Rules(universe.Id)}/{ruleId}",
            new SystemRuleRequest("A character is on record", null, null, 1, Parse(TypeExists("Character")), null, 1));

        var closing = await Sweep(client, universe.Id);
        Assert.Equal(0, closing.Detected);
        Assert.Equal(1, closing.Closed);

        var detail = (await client.GetFromJsonAsync<WorldLogicFindingDetail>(Finding(universe.Id, row.Id)))!;
        Assert.Equal("resolved", detail.Finding.Status);
        Assert.NotNull(detail.Finding.ResolvedAt);
        Assert.Equal(["detected", "closed"], detail.History.Select(entry => entry.Action));
        Assert.All(detail.History, entry => Assert.Null(entry.ActorId));
    }

    /// <summary>
    /// A dismissal is the author's. Evaluation never reopens it while the problem is still there, and closes it
    /// once the problem is actually gone, so the same problem reintroduced later is raised again rather than
    /// swallowed by a decision made about the old occurrence.
    /// </summary>
    [Fact]
    public async Task A_dismissal_survives_a_sweep_and_is_closed_only_once_the_problem_is_gone()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfinddismiss");
        await CreateEntity(client, universe.Id, "Arlen");
        var ruleId = await Rule(client, universe.Id, "A dragon is on record", DragonExists());

        await Sweep(client, universe.Id);
        var row = Assert.Single((await List(client, universe.Id)).Items);

        var dismissed = await Decide(client, universe.Id, row.Id, "dismiss", "Deliberate: this world has no dragons.");
        Assert.Equal("dismissed", dismissed.Finding.Status);
        Assert.Equal(["detected", "dismissed"], dismissed.History.Select(entry => entry.Action));
        Assert.Equal("Deliberate: this world has no dragons.", dismissed.History.Last().Note);
        Assert.NotNull(dismissed.History.Last().ActorId);

        var again = await Sweep(client, universe.Id);
        Assert.Equal(1, again.Detected);
        Assert.Equal(0, again.Reopened);
        Assert.Equal(0, again.Closed);

        var kept = (await client.GetFromJsonAsync<WorldLogicFindingDetail>(Finding(universe.Id, row.Id)))!;
        Assert.Equal("dismissed", kept.Finding.Status);
        Assert.Equal(2, kept.History.Count);

        // Once the rule stops producing it there is nothing left to suppress, so the dismissal is closed.
        await PutJson<SystemRuleDetail>(
            client,
            $"{Rules(universe.Id)}/{ruleId}",
            new SystemRuleRequest("A character is on record", null, null, 1, Parse(TypeExists("Character")), null, 1));

        Assert.Equal(1, (await Sweep(client, universe.Id)).Closed);

        var closed = (await client.GetFromJsonAsync<WorldLogicFindingDetail>(Finding(universe.Id, row.Id)))!;
        Assert.Equal("resolved", closed.Finding.Status);
    }

    /// <summary>
    /// The author saying the lore is fixed is not a suppression. If the next sweep still produces the finding it
    /// reopens, because the problem is still there; suppressing a live problem is what a dismissal is for.
    /// </summary>
    [Fact]
    public async Task A_finding_the_author_resolved_reopens_while_the_rules_still_produce_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfindreopen");
        await CreateEntity(client, universe.Id, "Arlen");
        await Rule(client, universe.Id, "A dragon is on record", DragonExists());

        await Sweep(client, universe.Id);
        var row = Assert.Single((await List(client, universe.Id)).Items);

        var reviewed = await Decide(client, universe.Id, row.Id, "review");
        Assert.Equal("reviewing", reviewed.Finding.Status);

        var resolved = await Decide(client, universe.Id, row.Id, "resolve");
        Assert.Equal("resolved", resolved.Finding.Status);
        Assert.Equal(["detected", "reviewed", "resolved"], resolved.History.Select(entry => entry.Action));

        var sweep = await Sweep(client, universe.Id);
        Assert.Equal(1, sweep.Reopened);

        var reopened = (await client.GetFromJsonAsync<WorldLogicFindingDetail>(Finding(universe.Id, row.Id)))!;
        Assert.Equal("open", reopened.Finding.Status);
        Assert.Null(reopened.Finding.ResolvedAt);
        Assert.Equal(["detected", "reviewed", "resolved", "reopened"], reopened.History.Select(entry => entry.Action));

        // A closed finding is settled: the two decisions about a live finding are refused rather than silently
        // reversing evaluation's answer.
        await PutJson<SystemRuleDetail>(
            client,
            $"{Rules(universe.Id)}/{(await List(client, universe.Id)).Items[0].RuleId}",
            new SystemRuleRequest("A character is on record", null, null, 1, Parse(TypeExists("Character")), null, 1));

        await Sweep(client, universe.Id);

        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync($"{Finding(universe.Id, row.Id)}/dismiss", new WorldLogicFindingDecisionRequest())).StatusCode);
    }

    /// <summary>
    /// A rule that is words only has no condition and would answer unknown for every universe forever. Recording
    /// that would bury the unknowns that mean something, so it produces no finding at all.
    /// </summary>
    [Fact]
    public async Task A_rule_that_is_words_only_produces_no_finding()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfindwords");

        await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Blink has a cost", "Nobody has written down what."));

        var summary = await Sweep(client, universe.Id);
        Assert.Equal(0, summary.Detected);
        Assert.Equal(0, summary.Created);
        Assert.Equal(0, (await List(client, universe.Id)).TotalCount);
    }

    /// <summary>
    /// A project sweep is its own scope. A project-scoped exception applies only when a project is named, so the
    /// same rule can answer differently per project; each scope therefore keeps its own findings, and one sweep
    /// never closes another scope's.
    /// </summary>
    [Fact]
    public async Task A_project_sweep_keeps_its_own_findings_and_closes_no_other_scopes()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfindproject");

        var project = await PostJson<ProjectDetail>(
            client,
            "/api/projects",
            new ProjectRequest("The siege", ProjectKind.Writing, ProjectLifecycle.Active, null, null, universe.Id, null));

        await Rule(client, universe.Id, "A dragon is on record", DragonExists());

        Assert.Equal(1, (await Sweep(client, universe.Id)).Created);
        Assert.Equal(1, (await Sweep(client, universe.Id, project.Id)).Created);

        var all = await List(client, universe.Id);
        Assert.Equal(2, all.TotalCount);
        Assert.Equal([null, project.Id], all.Items.Select(row => row.ProjectId).Order());

        // Two scopes, two fingerprints, and neither sweep closed the other's finding.
        Assert.Equal(2, all.Items.Select(row => row.Fingerprint).Distinct(StringComparer.Ordinal).Count());
        Assert.All(all.Items, row => Assert.Equal("open", row.Status));

        var again = await Sweep(client, universe.Id);
        Assert.Equal(0, again.Closed);
        Assert.Equal(1, again.Persisted);

        // A project of another universe is refused rather than swept as if it were this universe's.
        var (_, other) = await SignedInWithUniverse(_factory, "wlfindproject-other");
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.PostAsync($"{Findings(universe.Id)}/evaluate?projectId={other.Id}", null)).StatusCode);
    }

    /// <summary>
    /// Sweeping and the three decisions write, so each needs <c>EditContent</c>; reading needs only <c>Read</c>.
    /// The access matrix holds every refusal, and this holds the half the matrix cannot: that a member who may edit
    /// gets through and leaves their own account in the history.
    /// </summary>
    [Fact]
    public async Task Sweeping_and_deciding_need_edit_access_and_name_the_account_that_decided()
    {
        var world = await CollaborationTestClient.NewSharedWorld(_factory, "wlfindaccess");

        await Rule(world.Owner, world.U, "A dragon is on record", DragonExists());

        // A Viewer may read the list and may not sweep it.
        (await world.Viewer.GetAsync(Findings(world.U))).EnsureSuccessStatusCode();
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await world.Viewer.PostAsync($"{Findings(world.U)}/evaluate", null)).StatusCode);

        Assert.Equal(1, (await Sweep(world.Editor, world.U)).Created);
        var row = (await List(world.Editor, world.U)).Items.Single(item => item.Outcome == "violation");

        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await world.Viewer.PostAsJsonAsync($"{Finding(world.U, row.Id)}/dismiss", new WorldLogicFindingDecisionRequest())).StatusCode);

        var dismissed = await Decide(world.Editor, world.U, row.Id, "dismiss", "The Editor's call.");
        Assert.Equal(world.EditorId, dismissed.History.Last().ActorId);

        // A finding of another universe is a 404, never a confirmation that it exists.
        var (_, other) = await SignedInWithUniverse(_factory, "wlfindaccess-other");
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await world.Owner.GetAsync(Finding(other.Id, row.Id))).StatusCode);
    }

    /// <summary>
    /// A backup carries the dismissals and nothing else, and a restore puts them back against the findings the
    /// restored rules produce. The fingerprint is a hash over ids the restored universe no longer uses, so what the
    /// hash was taken over is carried and the hash is taken again: that is the part that would be silently wrong.
    /// </summary>
    [Fact]
    public async Task A_backup_carries_only_the_dismissals_and_a_restore_applies_them_to_the_restored_findings()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfindbackup");
        var entry = await CreateEntity(client, universe.Id, "Arlen");

        await Rule(client, universe.Id, "A dragon is on record", DragonExists());

        // The dismissal to carry rests on an entry's id, which is the part a restore has to translate: the
        // fingerprint is a hash over it, and the restored universe no longer uses that id.
        await Rule(client, universe.Id, "Arlen is a dragon", EntryIsOfType(entry, "Dragon"));

        await Sweep(client, universe.Id);
        var findings = await List(client, universe.Id);
        Assert.Equal(2, findings.TotalCount);

        var keep = findings.Items.Single(row => row.RuleTitle == "Arlen is a dragon");
        await Decide(client, universe.Id, keep.Id, "dismiss", "Arlen is deliberately not one.");

        var backup = await Backup(client, universe.Id);

        // Only the dismissal. The other finding is derived and the next sweep produces it again.
        var carried = Assert.Single(backup.Payload.DismissedFindings!);
        Assert.Equal(WorldLogicFindingOutcome.Violation, carried.Outcome);
        Assert.Null(carried.ProjectId);
        Assert.Equal(1, carried.RuleVersion);
        Assert.Contains(carried.Evidence, item => item.Id == entry.ToString());

        var restored = await RestoreArchive(client, await RawArchive(client, universe.Id), "World wlfindbackup restored");

        // The restored universe starts with the dismissal and nothing else: the rest is re-derived by sweeping.
        var afterRestore = await List(client, restored.Id);
        var restoredDismissal = Assert.Single(afterRestore.Items);
        Assert.Equal("dismissed", restoredDismissal.Status);
        Assert.Equal("Arlen is a dragon", restoredDismissal.RuleTitle);
        Assert.NotEqual(keep.RuleId, restoredDismissal.RuleId);

        // The restore's own history entry names no account, because no account made it.
        var restoredDetail = (await client.GetFromJsonAsync<WorldLogicFindingDetail>(
            Finding(restored.Id, restoredDismissal.Id)))!;

        var restored_entry = Assert.Single(restoredDetail.History);
        Assert.Equal("dismissed", restored_entry.Action);
        Assert.Null(restored_entry.ActorId);

        // The carried evidence came back pointing at the restored entry, not the exported one, which is what
        // proves the fingerprint was taken again over the restored ids.
        Assert.DoesNotContain(restoredDetail.Evidence, item => item.Id == entry.ToString());

        // And the sweep over the restored lore matches its own finding to the carried dismissal rather than
        // opening a second one beside it, which is what proves the fingerprint was computed from the restored ids.
        var sweep = await Sweep(client, restored.Id);
        Assert.Equal(2, sweep.Detected);
        Assert.Equal(1, sweep.Created);
        Assert.Equal(1, sweep.Persisted);
        Assert.Equal(0, sweep.Reopened);

        var swept = await List(client, restored.Id);
        Assert.Equal(2, swept.TotalCount);
        Assert.Equal("dismissed", swept.Items.Single(row => row.Id == restoredDismissal.Id).Status);
    }

    /// <summary>
    /// Codex round 1 on #153: deleting a rule cascades its findings, so an author's dismissal would go with it
    /// without being mentioned. Every other finding of the rule is derived and goes, which is right; a dismissal
    /// is the one the author wrote, so the route refuses until it is resolved.
    /// </summary>
    [Fact]
    public async Task A_rule_with_a_dismissed_finding_is_not_deleted_until_the_author_resolves_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfinddelete");
        var entry = await CreateEntity(client, universe.Id, "Arlen");

        var open = await Rule(client, universe.Id, "A dragon is on record", DragonExists());
        var dismissed = await Rule(client, universe.Id, "Arlen is a dragon", EntryIsOfType(entry, "Dragon"));

        await Sweep(client, universe.Id);
        var findings = await List(client, universe.Id);
        var keep = findings.Items.Single(row => row.RuleId == dismissed);
        await Decide(client, universe.Id, keep.Id, "dismiss", "Arlen is deliberately not one.");

        // A rule whose findings are all derived is deleted, and they go with it: nothing of the author's is lost.
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"{Rules(universe.Id)}/{open}")).StatusCode);

        var left = await List(client, universe.Id);
        Assert.Equal(keep.Id, Assert.Single(left.Items).Id);

        // The dismissal is the author's, so the rule it is about is not deleted while it stands.
        var refused = await client.DeleteAsync($"{Rules(universe.Id)}/{dismissed}");
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);

        var body = await refused.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("rule_has_dismissals", body.GetProperty("code").GetString());
        Assert.Equal(1, body.GetProperty("dismissedFindings").GetInt32());
        Assert.Equal(1, (await List(client, universe.Id)).TotalCount);

        // Resolving it is the explicit way to say the decision no longer matters, and then the rule goes.
        await Decide(client, universe.Id, keep.Id, "resolve");

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"{Rules(universe.Id)}/{dismissed}")).StatusCode);

        Assert.Equal(0, (await List(client, universe.Id)).TotalCount);
    }

    /// <summary>
    /// The other half of Codex round 1, which the refusal above deliberately does not cover: a project-scoped
    /// finding cascades with its project, dismissals included, because a decision about one project's scope has
    /// nothing left to be about once the project is gone. Refusing that would be the undeletable-row failure this
    /// milestone has already paid for once, and a project has no delete route of its own today in any case: the
    /// cascade is reached by deleting the universe, or by the row going away beneath the API.
    ///
    /// What has to hold is that it leaves no invalid backup behind. A dismissal is only ever carried with its rule
    /// and its project, both of which a backup holds for the whole universe, so the payload after the cascade
    /// carries no dismissal naming anything missing, and it restores.
    /// </summary>
    [Fact]
    public async Task A_project_scoped_dismissal_goes_with_its_project_and_leaves_a_restorable_backup()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfindprojectgone");
        var entry = await CreateEntity(client, universe.Id, "Arlen");

        var project = await PostJson<ProjectDetail>(
            client,
            "/api/projects",
            new ProjectRequest("The siege", ProjectKind.Writing, ProjectLifecycle.Active, null, null, universe.Id, null));

        await Rule(client, universe.Id, "Arlen is a dragon", EntryIsOfType(entry, "Dragon"));

        await Sweep(client, universe.Id, project.Id);
        var scoped = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(project.Id, scoped.ProjectId);

        await Decide(client, universe.Id, scoped.Id, "dismiss", "Not in this story.");

        // While both stand, the dismissal is carried and names a rule and a project this backup holds. That is the
        // invariant a restore is validated against, and the one the cascade below must not be able to break.
        var before = await Backup(client, universe.Id);
        var carried = Assert.Single(before.Payload.DismissedFindings!);
        Assert.Contains(before.Payload.SystemRules!, rule => rule.Id == carried.RuleId);
        Assert.Contains(before.Payload.CreativeProjects!, candidate => candidate.Id == carried.ProjectId);

        // The project row goes, as a universe delete would take it.
        await WithDb(_factory, async db =>
        {
            await db.CreativeProjects
                .IgnoreQueryFilters()
                .Where(candidate => candidate.Id == project.Id)
                .ExecuteDeleteAsync();
        });

        // The finding went with it, and so did the decision about it.
        Assert.Equal(0, (await List(client, universe.Id)).TotalCount);

        var after = await Backup(client, universe.Id);
        Assert.Empty(after.Payload.DismissedFindings!);

        var restored = await RestoreArchive(
            client,
            await RawArchive(client, universe.Id),
            "World wlfindprojectgone restored");

        Assert.Equal(0, (await List(client, restored.Id)).TotalCount);

        // The rule itself survived, so the restored universe can still find the problem.
        Assert.Equal(1, (await Sweep(client, restored.Id)).Created);
    }

    /// <summary>
    /// The promise to ADR 0010: Canon keeps its own conflicts, its own rules and its own gate. A World Logic sweep
    /// writes no conflict and closes none, and a Canon evaluation writes no World Logic finding.
    /// </summary>
    [Fact]
    public async Task Canon_conflicts_are_untouched_by_a_world_logic_sweep()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfindcanon");
        await Rule(client, universe.Id, "A dragon is on record", DragonExists());

        (await client.PostAsync($"/api/universes/{universe.Id}/canon-conflicts/evaluate", null))
            .EnsureSuccessStatusCode();

        var conflictsBefore = await CanonCount(universe.Id);
        Assert.Equal(0, (await List(client, universe.Id)).TotalCount);

        Assert.Equal(1, (await Sweep(client, universe.Id)).Created);
        Assert.Equal(conflictsBefore, await CanonCount(universe.Id));

        // And a Canon evaluation leaves the World Logic finding exactly where the sweep left it.
        (await client.PostAsync($"/api/universes/{universe.Id}/canon-conflicts/evaluate", null))
            .EnsureSuccessStatusCode();

        var row = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal("open", row.Status);
    }

    /// <summary>
    /// The fingerprint is what makes a sweep idempotent, so what goes into it is worth pinning: the same evaluation
    /// hashes the same, a different outcome hashes differently, and the rule's version is deliberately out of it.
    /// </summary>
    [Fact]
    public void A_fingerprint_covers_the_problem_and_not_the_wording()
    {
        var rule = Guid.NewGuid();
        var project = Guid.NewGuid();
        ConditionEvidence[] evidence = [new("subjects", "s.ingot", "self")];

        var first = WorldLogicFingerprint.Of(rule, null, WorldLogicFindingOutcome.Violation, null, evidence);

        Assert.Equal(first, WorldLogicFingerprint.Of(rule, null, WorldLogicFindingOutcome.Violation, null, evidence));
        Assert.Equal(CanonIntegrityLimits.FingerprintLength, first.Length);

        Assert.NotEqual(first, WorldLogicFingerprint.Of(rule, project, WorldLogicFindingOutcome.Violation, null, evidence));
        Assert.NotEqual(first, WorldLogicFingerprint.Of(rule, null, WorldLogicFindingOutcome.Unknown, null, evidence));
        Assert.NotEqual(first, WorldLogicFingerprint.Of(Guid.NewGuid(), null, WorldLogicFindingOutcome.Violation, null, evidence));
        Assert.NotEqual(
            first,
            WorldLogicFingerprint.Of(rule, null, WorldLogicFindingOutcome.Violation, null, [new("subjects", "s.other", "self")]));

        // The evidence order is part of the record, so two different orders are two different problems.
        Assert.NotEqual(
            WorldLogicFingerprint.Of(rule, null, WorldLogicFindingOutcome.Error, ConditionErrors.TypeMismatch, [new("a", "1", "r"), new("a", "2", "r")]),
            WorldLogicFingerprint.Of(rule, null, WorldLogicFindingOutcome.Error, ConditionErrors.TypeMismatch, [new("a", "2", "r"), new("a", "1", "r")]));
    }

    /// <summary>A rationale longer than the column is stored shortened rather than failing the sweep, and reads back as lines.</summary>
    [Fact]
    public void A_long_rationale_is_shortened_from_the_end_and_still_reads_back()
    {
        var lines = Enumerable.Range(0, 400).Select(index => new string('x', 200) + index).ToList();
        var stored = WorldLogicRationale.Store(lines);

        Assert.True(stored.Length <= WorldLogicFindingLimits.RationaleMaxLength);

        var read = WorldLogicRationale.Read(stored);
        Assert.NotEmpty(read);
        Assert.True(read.Count < lines.Count);
        Assert.Equal(lines.Take(read.Count), read);

        // Text that is not a stored trace reads back as no rationale, rather than failing the request.
        Assert.Empty(WorldLogicRationale.Read("not a trace"));
    }

    // ---------- The world these tests sweep ----------

    private async Task<int> CanonCount(Guid universeId)
    {
        var count = 0;
        await WithDb(_factory, async db =>
        {
            count = await db.CanonConflicts.CountAsync(conflict => conflict.UniverseId == universeId);
        });

        return count;
    }

    private static async Task<Guid> Rule(HttpClient client, Guid universeId, string title, string condition) =>
        (await PostJson<SystemRuleDetail>(
            client,
            Rules(universeId),
            new SystemRuleRequest(title, null, null, 1, Parse(condition)))).Id;

    private static async Task<WorldLogicSweepResponse> Sweep(HttpClient client, Guid universeId, Guid? projectId = null)
    {
        var query = projectId is { } project ? $"?projectId={project}" : string.Empty;
        var response = await client.PostAsync($"{Findings(universeId)}/evaluate{query}", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WorldLogicSweepResponse>())!;
    }

    private static async Task<WorldLogicPage<WorldLogicFindingRow>> List(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<WorldLogicPage<WorldLogicFindingRow>>(Findings(universeId)))!;

    private static async Task<WorldLogicFindingDetail> Decide(
        HttpClient client,
        Guid universeId,
        Guid findingId,
        string verb,
        string? note = null)
    {
        var response = await client.PostAsJsonAsync(
            $"{Finding(universeId, findingId)}/{verb}",
            new WorldLogicFindingDecisionRequest(note));

        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<WorldLogicFindingDetail>())!;
    }

    private static string Rules(Guid universeId) => $"/api/universes/{universeId}/system-rules";

    private static string Findings(Guid universeId) => $"/api/universes/{universeId}/world-logic/findings";

    private static string Finding(Guid universeId, Guid findingId) => $"{Findings(universeId)}/{findingId}";

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    /// <summary>
    /// A rule about the universe rather than about one entry: it names no <c>self</c>, so a sweep can answer it.
    /// A universe with no entry of that type answers false.
    /// </summary>
    private static string TypeExists(string type) =>
        Exists("{\"field\":\"type\",\"op\":\"eq\",\"value\":\"" + type + "\",\"type\":\"text\"}");

    private static string DragonExists() => TypeExists("Dragon");

    /// <summary>
    /// One named entry is of that type. It names the entry by id rather than by <c>self</c>, so a sweep can
    /// answer it, and the entry is the evidence the outcome rests on.
    /// </summary>
    private static string EntryIsOfType(Guid entry, string type) =>
        "{\"kind\":\"compare\",\"left\":{\"field\":\"type\",\"from\":\"subjects\",\"of\":{\"subject\":\""
        + entry + "\"}},\"op\":\"eq\",\"right\":{\"literal\":\"" + type + "\",\"type\":\"text\"}}";

    /// <summary>An <c>exists</c> over the subjects, with one where clause.</summary>
    private static string Exists(string clause) =>
        "{\"kind\":\"exists\",\"query\":{\"from\":\"subjects\",\"where\":[" + clause + "]}}";

    /// <summary>A rule written with <c>self</c>, so a sweep with no target cannot answer it.</summary>
    private static string PurityAtLeast(int floor) =>
        "{\"kind\":\"compare\",\"left\":{\"attribute\":\"Purity\",\"of\":{\"subject\":\"self\"}},"
        + $"\"op\":\"gte\",\"right\":{{\"literal\":{floor},\"type\":\"number\"}}}}";

    /// <summary>Text against a number: a modelling mistake the author must see, never a pass.</summary>
    private static string TextAtLeastNumber() =>
        "{\"kind\":\"compare\",\"left\":{\"literal\":\"two\",\"type\":\"text\"},"
        + "\"op\":\"gte\",\"right\":{\"literal\":2,\"type\":\"number\"}}";
}
