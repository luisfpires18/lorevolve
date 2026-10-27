using System.Net;
using System.Text.Json;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.RuleValidation;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RuleValidationTestClient;
using static LorEvolve.Api.Tests.WorldRuleTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// <c>CANON-WORLD-001</c> (ADR 0034): a participant with more Canon moments of one event kind by one method than a rule's check
/// allows. The count through every case it must count and every case it must refuse to count; the finding's references, identity,
/// dismissal and lifecycle through edits, deletes and the Trash; the check state that never claims a rule holds when it cannot
/// know; and that nothing but explicit ids is read, nothing is written, and nothing crosses a universe.
/// </summary>
public sealed class CanonWorldRuleOccurrenceRuleTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- The count ----------

    [Fact]
    public async Task One_moment_under_a_limit_of_one_is_no_finding_and_a_rule_checked_as_holding()
    {
        var world = await NewCheckedWorld(_factory, "cwone");

        await world.Occurrence("Arlen returns", world.Arlen);

        Assert.Empty(await world.Findings());
        var check = (await world.ReadRule()).Check!;
        Assert.Equal(WorldRuleCheckOutcome.Checked, check.Outcome);
        Assert.Equal((1, 0, 0, 0), (check.CountedMoments, check.ParticipantsOverLimit, check.NotCanonMoments, check.UncountedMoments));
    }

    [Fact]
    public async Task Two_moments_for_one_participant_under_a_limit_of_one_are_one_Medium_finding_the_moment_they_are_saved()
    {
        var world = await NewCheckedWorld(_factory, "cwtwo");
        var first = await world.Occurrence("Arlen returns from the pyre", world.Arlen);
        var second = await world.Occurrence("Arlen returns from the sea", world.Arlen);

        // No evaluation was asked for: the moment's save reconciled Canon.
        var finding = Assert.Single(await world.Findings());

        Assert.Equal(CanonConflictSeverity.Medium, finding.Severity);
        Assert.Equal(
            [
                (CanonSubjectKind.Entity, world.Arlen, "participant", (string?)"Arlen"),
                (CanonSubjectKind.TimelineEntry, first.Id, "moment", "Arlen returns from the pyre"),
                (CanonSubjectKind.TimelineEntry, second.Id, "moment", "Arlen returns from the sea"),
                (CanonSubjectKind.WorldRule, world.Rule.Id, "rule", "One return by the Rite"),
            ],
            finding.Subjects
                .Select(subject => (subject.Kind, subject.SubjectId, subject.Role, subject.Name))
                .OrderBy(subject => subject.Kind).ThenBy(subject => subject.Name, StringComparer.Ordinal));

        Assert.Contains("“Arlen” has 2 “Resurrection” moments by “Rite of Ash”", finding.Title, StringComparison.Ordinal);
        Assert.Contains("at most 1", finding.Title, StringComparison.Ordinal);
        foreach (var words in new[] { "One return by the Rite", "Arlen returns from the pyre", "Arlen returns from the sea" })
        {
            Assert.Contains(words, finding.Explanation, StringComparison.Ordinal);
        }

        Assert.DoesNotContain("Words nothing reads.", finding.Explanation, StringComparison.Ordinal);
        Assert.Equal(1, (await world.ReadRule()).Check!.ParticipantsOverLimit);
    }

    [Fact]
    public async Task The_same_event_kind_by_another_method_is_another_event()
    {
        var world = await NewCheckedWorld(_factory, "cwmethod");

        await world.Occurrence("By the rite", world.Arlen);
        await world.Occurrence("By the stones", world.Arlen, world.SevenStones);

        Assert.Empty(await world.Findings());
        Assert.Equal(1, (await world.ReadRule()).Check!.CountedMoments);
    }

    [Fact]
    public async Task One_method_is_counted_for_each_participant_separately()
    {
        var world = await NewCheckedWorld(_factory, "cwparticipants");

        await world.Occurrence("Arlen returns", world.Arlen);
        await world.Occurrence("Mira returns", world.Mira);
        Assert.Empty(await world.Findings());

        await world.Occurrence("Mira returns again", world.Mira);

        var finding = Assert.Single(await world.Findings());
        Assert.Equal(world.Mira, finding.Subjects.Single(subject => subject.Role == "participant").SubjectId);
    }

    [Fact]
    public async Task A_limit_of_two_allows_two_and_finds_the_third()
    {
        var world = await NewCheckedWorld(_factory, "cwlimit2", max: 2);

        await world.Occurrence("First", world.Arlen);
        await world.Occurrence("Second", world.Arlen);
        Assert.Empty(await world.Findings());

        await world.Occurrence("Third", world.Arlen);

        var finding = Assert.Single(await world.Findings());
        Assert.Contains("has 3", finding.Title, StringComparison.Ordinal);
        Assert.Equal(3, finding.Subjects.Count(subject => subject.Role == "moment"));
    }

    [Fact]
    public async Task Two_rules_over_the_same_terms_are_two_findings_and_another_event_kind_is_not_counted()
    {
        var world = await NewCheckedWorld(_factory, "cwtworules");
        var coronation = await EventKind(world.Client, world.Universe, "Coronation");
        var twin = await CreateCheckedRule(world.Client, world.Universe, "The same limit, said again", Limit(world.Resurrection, world.RiteOfAsh, 1));

        await world.Occurrence("First", world.Arlen);
        await world.Occurrence("Second", world.Arlen);
        await CreateMoment(world.Client, world.Universe, Moment("Crowned by the rite", Details(coronation.Id, world.RiteOfAsh, world.Arlen)));
        await CreateMoment(world.Client, world.Universe, Moment("An ordinary day", null, linked: [world.Arlen]));

        var findings = await world.Findings();
        Assert.Equal(2, findings.Count);
        Assert.Equal(
            new[] { world.Rule.Id, twin.Id }.Order(),
            findings.Select(finding => finding.Subjects.Single(subject => subject.Role == "rule").SubjectId).Order());
        Assert.All(findings, finding => Assert.Equal(2, finding.Subjects.Count(subject => subject.Role == "moment")));
    }

    // ---------- Nothing is inferred ----------

    [Fact]
    public async Task Words_never_match_and_a_rule_that_is_words_only_is_never_run()
    {
        var world = await NewCheckedWorld(_factory, "cwwords");
        var client = world.Client;
        var u = world.Universe;

        var wordsOnly = await CreateRule(client, u, "One resurrection per person", "Resurrection by the Rite of Ash, once, for Arlen.");
        await CreateMoment(client, u, Moment("Arlen: Resurrection by the Rite of Ash", null, linked: [world.Arlen], description: "Resurrection. Rite of Ash. Arlen."));
        await CreateMoment(client, u, Moment("Arlen: Resurrection by the Rite of Ash, again", null, linked: [world.Arlen], description: "Resurrection. Rite of Ash. Arlen."));

        Assert.Empty(await world.Findings());
        Assert.Equal(0, (await Evaluate(client, u)).Detected);
        Assert.Equal((WorldRuleCheckOutcome.Checked, 0), ((await world.ReadRule()).Check!.Outcome, (await world.ReadRule()).Check!.CountedMoments));
        Assert.Null((await ReadRule(client, u, wordsOnly.Id)).Check);
    }

    [Fact]
    public async Task A_linked_entry_is_never_the_participant_so_such_moments_leave_the_check_incomplete()
    {
        var world = await NewCheckedWorld(_factory, "cwlinked");
        var client = world.Client;

        var first = await CreateMoment(client, world.Universe, Moment("Arlen returns", Details(world.Resurrection, world.RiteOfAsh, null), linked: [world.Arlen]));
        await CreateMoment(client, world.Universe, Moment("Arlen returns again", Details(world.Resurrection, world.RiteOfAsh, null), linked: [world.Arlen]));

        Assert.Empty(await world.Findings());
        var check = (await world.ReadRule()).Check!;
        Assert.Equal(WorldRuleCheckOutcome.Incomplete, check.Outcome);
        Assert.Equal((0, 2), (check.CountedMoments, check.UncountedMoments));
        Assert.All(check.Uncounted, moment => Assert.Equal(UncountedReason.NoParticipant, moment.Reason));
        Assert.Contains(check.Uncounted, moment => moment.TimelineEntryId == first.Id && moment.Title == "Arlen returns");
    }

    [Fact]
    public async Task A_moment_missing_its_method_or_its_event_kind_is_named_as_uncounted_never_passed_over()
    {
        var world = await NewCheckedWorld(_factory, "cwmissing");
        var client = world.Client;
        var u = world.Universe;

        await CreateMoment(client, u, Moment("Kind, no method", Details(world.Resurrection, null, world.Arlen)));
        await CreateMoment(client, u, Moment("Method, no kind", Details(null, world.RiteOfAsh, world.Arlen)));
        await CreateMoment(client, u, Moment("Another method, no kind", Details(null, world.SevenStones, world.Arlen)));

        var check = (await world.ReadRule()).Check!;
        Assert.Equal(WorldRuleCheckOutcome.Incomplete, check.Outcome);
        Assert.Equal(
            [("Kind, no method", UncountedReason.NoMethod), ("Method, no kind", UncountedReason.NoEventKind)],
            check.Uncounted.Select(moment => (moment.Title, moment.Reason)));
        Assert.Empty(await world.Findings());
    }

    [Fact]
    public async Task A_participant_over_the_limit_is_found_even_while_other_moments_cannot_be_counted()
    {
        var world = await NewCheckedWorld(_factory, "cwpartial");

        await world.Occurrence("First", world.Arlen);
        await world.Occurrence("Second", world.Arlen);
        await world.Occurrence("Whose?", null);

        Assert.Single(await world.Findings());
        var check = (await world.ReadRule()).Check!;
        Assert.Equal((WorldRuleCheckOutcome.Incomplete, 2, 1, 1), (check.Outcome, check.CountedMoments, check.ParticipantsOverLimit, check.UncountedMoments));
    }

    [Fact]
    public async Task Only_Canon_moments_are_counted_and_promoting_one_raises_the_finding()
    {
        var world = await NewCheckedWorld(_factory, "cwcanon");

        await world.Occurrence("Settled", world.Arlen);
        var draft = await world.Occurrence("Still a draft", world.Arlen, status: CanonStatus.Draft);
        await world.Occurrence("Only an idea", world.Arlen, status: CanonStatus.Idea);

        Assert.Empty(await world.Findings());
        var check = (await world.ReadRule()).Check!;
        Assert.Equal((WorldRuleCheckOutcome.Checked, 1, 2), (check.Outcome, check.CountedMoments, check.NotCanonMoments));

        await world.Update(draft, Details(world.Resurrection, world.RiteOfAsh, world.Arlen), CanonStatus.Canon);

        Assert.Single(await world.Findings());
    }

    [Fact]
    public async Task Stories_scenes_and_ideas_establish_no_moment()
    {
        var world = await NewCheckedWorld(_factory, "cwstory");
        var client = world.Client;
        var u = world.Universe;

        await world.Occurrence("Arlen returns", world.Arlen);
        var story = await CreateStory(client, u, "Arlen returns by the Rite of Ash, twice");
        await CreateScene(client, u, story, "Resurrection by the Rite of Ash");
        await ManuscriptTestClient.WriteManuscript(client, u, story, (await ReadStory(client, u, story)).Scenes[0].Id, "Arlen was resurrected by the Rite of Ash a second time.");
        await IdeaTestClient.CreateIdea(client, "Arlen returns a second time", "By the Rite of Ash.", u, [IdeaTestClient.Ref(IdeaReferenceKind.Entity, world.Arlen)]);

        Assert.Empty(await world.Findings());
        Assert.Equal(1, (await world.ReadRule()).Check!.CountedMoments);
    }

    [Fact]
    public async Task A_stored_check_that_cannot_be_run_never_passes_and_raises_nothing()
    {
        var world = await NewCheckedWorld(_factory, "cwbroken");
        await world.Occurrence("First", world.Arlen);
        await world.Occurrence("Second", world.Arlen);
        Assert.Single(await world.Findings());

        // None of these can be saved through the API or a restore; each is written beneath both.
        foreach (var breakIt in new Action<WorldRuleValidation>[]
        {
            row => row.MaxOccurrences = 0,
            row => row.Kind = (WorldRuleValidationKind)9,
            row => row.EventKindTermId = world.SevenStones,
        })
        {
            await WithDb(_factory, async db =>
            {
                var row = await db.WorldRuleValidations.SingleAsync(validation => validation.WorldRuleId == world.Rule.Id);
                breakIt(row);
                await db.SaveChangesAsync();
            });

            await Evaluate(world.Client, world.Universe);
            var check = (await world.ReadRule()).Check!;
            Assert.Equal(WorldRuleCheckOutcome.CannotCheck, check.Outcome);
            Assert.False(string.IsNullOrWhiteSpace(check.Problem));
            Assert.Equal((0, 0), (check.CountedMoments, check.ParticipantsOverLimit));
            Assert.Empty(await world.Findings());

            await WithDb(_factory, async db =>
            {
                var row = await db.WorldRuleValidations.SingleAsync(validation => validation.WorldRuleId == world.Rule.Id);
                (row.MaxOccurrences, row.Kind, row.EventKindTermId) = (1, WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod, world.Resurrection);
                await db.SaveChangesAsync();
            });

            await Evaluate(world.Client, world.Universe);
            Assert.Single(await world.Findings());
        }
    }

    // ---------- Identity and lifecycle ----------

    [Fact]
    public async Task Evaluating_again_duplicates_nothing_and_touches_nothing()
    {
        var world = await NewCheckedWorld(_factory, "cwidempotent");
        await world.Occurrence("First", world.Arlen);
        await world.Occurrence("Second", world.Arlen);
        var before = Assert.Single(await world.Findings());

        await Evaluate(world.Client, world.Universe);
        var summary = await Evaluate(world.Client, world.Universe);

        Assert.Equal(0, summary.Created);
        var after = Assert.Single(await world.Findings(status: null));
        Assert.Equal((before.Id, before.UpdatedAt), (after.Id, after.UpdatedAt));
    }

    [Fact]
    public async Task The_fingerprint_is_the_rule_its_terms_the_participant_and_the_set_of_moments_and_a_new_moment_is_a_new_finding()
    {
        var world = await NewCheckedWorld(_factory, "cwfingerprint");
        var first = await world.Occurrence("First", world.Arlen);
        var second = await world.Occurrence("Second", world.Arlen);
        var finding = Assert.Single(await world.Findings());

        await WithDb(_factory, async db =>
        {
            var stored = await db.CanonConflicts.SingleAsync(conflict => conflict.Id == finding.Id);

            // The moments are a set: either order hashes to the stored key, and no display name goes in.
            Assert.Equal(CanonFingerprint.Of(RuleCode, [world.Rule.Id, world.Resurrection, world.RiteOfAsh, world.Arlen, first.Id, second.Id], 4), stored.Fingerprint);
            Assert.Equal(CanonFingerprint.Of(RuleCode, [world.Rule.Id, world.Resurrection, world.RiteOfAsh, world.Arlen, second.Id, first.Id], 4), stored.Fingerprint);
        });

        await world.Occurrence("Third", world.Arlen);

        var now = Assert.Single(await world.Findings());
        Assert.NotEqual(finding.Id, now.Id);
        Assert.Equal(finding.Id, Assert.Single(await world.Findings(CanonConflictStatus.Resolved)).Id);
    }

    [Fact]
    public async Task A_dismissal_holds_while_the_same_moments_break_the_rule_and_the_finding_returns_open_after_a_fix_is_undone()
    {
        var world = await NewCheckedWorld(_factory, "cwdismiss");
        await world.Occurrence("First", world.Arlen);
        var second = await world.Occurrence("Second", world.Arlen);
        var finding = Assert.Single(await world.Findings());

        (await world.Client.PostAsync($"/api/universes/{world.Universe}/canon-conflicts/{finding.Id}/dismiss", null)).EnsureSuccessStatusCode();

        // Reworded, re-evaluated: still the same dismissed finding.
        second = await world.Update(second, Details(world.Resurrection, world.RiteOfAsh, world.Arlen), title: "Second, retitled");
        await Evaluate(world.Client, world.Universe);
        var dismissed = Assert.Single(await world.Findings(CanonConflictStatus.Dismissed));
        Assert.Equal(finding.Id, dismissed.Id);
        Assert.Contains("Second, retitled", dismissed.Explanation, StringComparison.Ordinal);

        // Fixed by another method: resolved. The fix undone: the same finding, open again.
        second = await world.Update(second, Details(world.Resurrection, world.SevenStones, world.Arlen));
        Assert.Equal(finding.Id, Assert.Single(await world.Findings(CanonConflictStatus.Resolved)).Id);

        await world.Update(second, Details(world.Resurrection, world.RiteOfAsh, world.Arlen));
        Assert.Equal(finding.Id, Assert.Single(await world.Findings()).Id);
    }

    [Fact]
    public async Task Deleting_a_matching_moment_resolves_the_finding()
    {
        var world = await NewCheckedWorld(_factory, "cwdeletemoment");
        await world.Occurrence("First", world.Arlen);
        var second = await world.Occurrence("Second", world.Arlen);
        Assert.Single(await world.Findings());

        await DeleteMoment(world.Client, world.Universe, second.Id);

        Assert.Empty(await world.Findings());
        Assert.Single(await world.Findings(CanonConflictStatus.Resolved));
    }

    [Fact]
    public async Task A_rule_in_the_Trash_checks_nothing_and_a_restored_rule_finds_it_again()
    {
        var world = await NewCheckedWorld(_factory, "cwtrashrule");
        await world.Occurrence("First", world.Arlen);
        await world.Occurrence("Second", world.Arlen);
        var finding = Assert.Single(await world.Findings());

        await DeleteRule(world.Client, world.Universe, world.Rule.Id);
        Assert.Empty(await world.Findings());
        Assert.Equal(0, (await Evaluate(world.Client, world.Universe)).Detected);

        await RestoreRule(world.Client, world.Universe, world.Rule.Id);
        Assert.Equal(finding.Id, Assert.Single(await world.Findings()).Id);
    }

    [Fact]
    public async Task Changing_the_rules_method_or_removing_its_check_changes_what_matches()
    {
        var world = await NewCheckedWorld(_factory, "cwrulechange");
        var client = world.Client;
        var u = world.Universe;
        await world.Occurrence("By the rite", world.Arlen);
        await world.Occurrence("By the rite again", world.Arlen);
        await world.Occurrence("By the stones", world.Arlen, world.SevenStones);
        var byRite = Assert.Single(await world.Findings());

        var byStones = await SaveCheck(client, u, world.Rule, Limit(world.Resurrection, world.SevenStones, 1));
        Assert.Empty(await world.Findings());
        Assert.Equal(1, byStones.Check!.CountedMoments);

        await world.Occurrence("By the stones again", world.Arlen, world.SevenStones);
        var stonesFinding = Assert.Single(await world.Findings());
        Assert.NotEqual(byRite.Id, stonesFinding.Id);

        var removed = await SaveCheck(client, u, await world.ReadRule(), NoCheck);
        Assert.Empty(await world.Findings());
        Assert.Null(removed.Check);
        Assert.Equal("One return by the Rite", (await world.ReadRule()).Title);
    }

    [Fact]
    public async Task A_participant_in_the_Trash_is_not_counted_or_named_and_comes_back_with_the_finding()
    {
        var world = await NewCheckedWorld(_factory, "cwtrashentry");
        await world.Occurrence("First", world.Arlen);
        await world.Occurrence("Second", world.Arlen);
        var finding = Assert.Single(await world.Findings());

        await TrashEntity(world.Client, world.Universe, world.Arlen);

        Assert.Empty(await world.Findings());
        var check = (await world.ReadRule()).Check!;
        Assert.Equal(WorldRuleCheckOutcome.Incomplete, check.Outcome);
        Assert.All(check.Uncounted, moment => Assert.Equal(UncountedReason.ParticipantInTrash, moment.Reason));

        await RestoreEntity(world.Client, world.Universe, world.Arlen);
        Assert.Equal(finding.Id, Assert.Single(await world.Findings()).Id);
    }

    // ---------- Safety ----------

    [Fact]
    public async Task Evaluation_writes_no_lore_moment_rule_story_or_idea()
    {
        var world = await NewCheckedWorld(_factory, "cwreadonly");
        await world.Occurrence("First", world.Arlen);
        await world.Occurrence("Second", world.Arlen);
        var story = await CreateStory(world.Client, world.Universe, "A story");
        await CreateScene(world.Client, world.Universe, story, "A scene");
        await IdeaTestClient.CreateIdea(world.Client, "An idea", "Maybe.", world.Universe);

        var before = await Authored(world.Client, world.Universe);
        await Evaluate(world.Client, world.Universe);
        await Evaluate(world.Client, world.Universe);

        Assert.Equal(before, await Authored(world.Client, world.Universe));
    }

    [Fact]
    public async Task Nothing_crosses_a_universe_or_an_account()
    {
        var world = await NewCheckedWorld(_factory, "cwisolation");
        var twin = await NewCheckedWorld(_factory, "cwisolation-twin");
        var second = await CreateUniverse(world.Client, "World cwisolation second");

        // The same shape of history in another account's universe and in the owner's second universe, all over the limit.
        await twin.Occurrence("First", twin.Arlen);
        await twin.Occurrence("Second", twin.Arlen);
        var secondArlen = await CreateEntity(world.Client, second.Id, "Arlen");
        var secondKind = await EventKind(world.Client, second.Id, "Resurrection");
        var secondMethod = await Method(world.Client, second.Id, "Rite of Ash");
        await CreateMoment(world.Client, second.Id, Moment("First", Details(secondKind.Id, secondMethod.Id, secondArlen)));
        await CreateMoment(world.Client, second.Id, Moment("Second", Details(secondKind.Id, secondMethod.Id, secondArlen)));

        await world.Occurrence("Only once here", world.Arlen);

        Assert.Empty(await world.Findings());
        Assert.Equal(1, (await world.ReadRule()).Check!.CountedMoments);
        Assert.Single(await twin.Findings());
        Assert.Equal(HttpStatusCode.NotFound, (await twin.Client.GetAsync($"/api/universes/{world.Universe}/canon-conflicts")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await twin.Client.PostAsync($"/api/universes/{world.Universe}/canon-conflicts/evaluate", null)).StatusCode);

        // Another account's moment cannot be pointed at this universe's terms to provoke a finding here.
        var planted = await TryCreateMoment(twin.Client, twin.Universe, Moment("Planted", Details(world.Resurrection, world.RiteOfAsh, world.Arlen)));
        Assert.Equal(HttpStatusCode.BadRequest, planted.StatusCode);
        Assert.Empty(await world.Findings());
    }

    /// <summary>Everything authored in the universe, as its backup describes it; Canon conflicts, which are derived, left out.</summary>
    private static async Task<string> Authored(HttpClient client, Guid universeId)
    {
        var payload = (await Backup(client, universeId)).Payload with { DismissedConflicts = [] };
        return JsonSerializer.Serialize(payload);
    }
}
