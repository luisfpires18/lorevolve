using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Canon integrity: the lifecycle a conflict goes through, the fingerprint that keeps
/// repeated evaluation idempotent, the three production rules, and the invariant that
/// nothing crosses a universe boundary. Credentials here are obviously synthetic.
/// </summary>
public sealed class CanonIntegrityEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Detection ----------

    [Fact]
    public async Task Evaluation_opens_a_conflict_for_a_canon_relationship_resting_on_a_draft_entity()
    {
        var (client, universe) = await SignedInWithUniverse("ciopen");
        await CanonRelationshipOntoDraft(client, universe.Id);

        // The relationship write reconciles, so the conflict is already open. An explicit
        // evaluation then finds the same one and changes nothing.
        var conflict = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal("CANON-REL-001", conflict.RuleCode);

        var summary = await Evaluate(client, universe.Id);

        Assert.Equal(1, summary.Detected);
        Assert.Equal(0, summary.Created);
        Assert.Equal(1, summary.Persisted);
        Assert.Equal(0, summary.Resolved);
        Assert.Equal(conflict.UpdatedAt, Assert.Single((await List(client, universe.Id)).Items).UpdatedAt);
    }

    [Fact]
    public async Task A_new_conflict_starts_pending_and_keeps_the_severity_its_rule_declared()
    {
        var (client, universe) = await SignedInWithUniverse("cipending");
        await CanonRelationshipOntoDraft(client, universe.Id);
        await Evaluate(client, universe.Id);

        var conflict = Assert.Single((await List(client, universe.Id)).Items);

        Assert.Equal(CanonConflictStatus.Pending, conflict.Status);
        Assert.Equal(CanonConflictSeverity.Medium, conflict.Severity);
        Assert.Null(conflict.ResolvedAt);
    }

    [Fact]
    public async Task A_conflict_names_the_records_it_is_about()
    {
        var (client, universe) = await SignedInWithUniverse("cisubjects");
        var (relationship, _, target) = await CanonRelationshipOntoDraft(client, universe.Id);
        await Evaluate(client, universe.Id);

        var conflict = Assert.Single((await List(client, universe.Id)).Items);

        var relationshipSubject = Assert.Single(
            conflict.Subjects, subject => subject.Kind == CanonSubjectKind.Relationship);
        Assert.Equal(relationship.Id, relationshipSubject.SubjectId);
        Assert.Equal("relationship", relationshipSubject.Role);

        var entitySubject = Assert.Single(
            conflict.Subjects, subject => subject.Kind == CanonSubjectKind.Entity);
        Assert.Equal(target.Id, entitySubject.SubjectId);
        Assert.Equal("target", entitySubject.Role);
        Assert.Equal(target.Name, entitySubject.Name);

        // The offending entity is named in the explanation, so the author is not left
        // holding an id.
        Assert.Contains(target.Name, conflict.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Lore_that_is_wholly_canon_produces_no_conflict_at_all()
    {
        var (client, universe) = await SignedInWithUniverse("ciclean");

        var source = await CreateEntity(client, universe.Id, "Aragorn", CanonStatus.Canon);
        var target = await CreateEntity(client, universe.Id, "Gondor", CanonStatus.Canon);
        var type = await CreateRelationshipType(client, universe.Id, "rules", "ruled by");
        await CreateRelationship(client, universe.Id, type.Id, source.Id, target.Id, CanonStatus.Canon);

        var summary = await Evaluate(client, universe.Id);

        Assert.Equal(0, summary.Detected);
        Assert.Empty((await List(client, universe.Id)).Items);
    }

    [Fact]
    public async Task A_relationship_that_is_not_canon_is_free_to_rest_on_a_draft()
    {
        var (client, universe) = await SignedInWithUniverse("cidraftrel");

        var source = await CreateEntity(client, universe.Id, "Aragorn", CanonStatus.Canon);
        var target = await CreateEntity(client, universe.Id, "Gondor", CanonStatus.Draft);
        var type = await CreateRelationshipType(client, universe.Id, "rules", "ruled by");
        await CreateRelationship(client, universe.Id, type.Id, source.Id, target.Id, CanonStatus.Draft);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    // ---------- Idempotence ----------

    [Fact]
    public async Task Evaluating_twice_over_unchanged_lore_duplicates_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("ciidempotent");
        await CanonRelationshipOntoDraft(client, universe.Id);

        await Evaluate(client, universe.Id);
        var first = Assert.Single((await List(client, universe.Id)).Items);

        var second = await Evaluate(client, universe.Id);

        Assert.Equal(1, second.Detected);
        Assert.Equal(0, second.Created);
        Assert.Equal(1, second.Persisted);

        var again = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(first.Id, again.Id);

        // Nothing moved, so nothing was touched: the timestamp is the proof.
        Assert.Equal(first.UpdatedAt, again.UpdatedAt);
    }

    [Fact]
    public async Task Renaming_the_lore_refreshes_the_conflict_rather_than_opening_a_second_one()
    {
        var (client, universe) = await SignedInWithUniverse("cirename");
        var (_, _, target) = await CanonRelationshipOntoDraft(client, universe.Id);

        await Evaluate(client, universe.Id);
        var before = Assert.Single((await List(client, universe.Id)).Items);

        await Rename(client, universe.Id, target, "Minas Tirith");
        await Evaluate(client, universe.Id);

        var after = Assert.Single((await List(client, universe.Id)).Items);

        // Names are not part of the fingerprint, so this is the same conflict, reworded.
        Assert.Equal(before.Id, after.Id);
        Assert.Contains("Minas Tirith", after.Explanation, StringComparison.Ordinal);
    }

    // ---------- Lifecycle ----------

    [Fact]
    public async Task Fixing_the_underlying_issue_resolves_the_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("ciresolve");
        var (_, _, target) = await CanonRelationshipOntoDraft(client, universe.Id);

        await Evaluate(client, universe.Id);
        var opened = Assert.Single((await List(client, universe.Id)).Items);

        // The write itself reconciles, so the conflict is already Resolved before anything
        // asks for an evaluation.
        await SetStatus(client, universe.Id, target, CanonStatus.Canon);

        var resolved = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(opened.Id, resolved.Id);
        Assert.Equal(CanonConflictStatus.Resolved, resolved.Status);
        Assert.NotNull(resolved.ResolvedAt);

        // And an explicit evaluation afterwards has nothing left to find or to change.
        var summary = await Evaluate(client, universe.Id);
        Assert.Equal(0, summary.Detected);
        Assert.Equal(0, summary.Resolved);
        Assert.Equal(resolved.UpdatedAt, Assert.Single((await List(client, universe.Id)).Items).UpdatedAt);
    }

    [Fact]
    public async Task An_issue_that_comes_back_reopens_the_conflict_it_had_before()
    {
        var (client, universe) = await SignedInWithUniverse("cireopenauto");
        var (_, _, target) = await CanonRelationshipOntoDraft(client, universe.Id);

        await Evaluate(client, universe.Id);
        var opened = Assert.Single((await List(client, universe.Id)).Items);

        var promoted = await SetStatus(client, universe.Id, target, CanonStatus.Canon);
        Assert.Equal(
            CanonConflictStatus.Resolved,
            Assert.Single((await List(client, universe.Id)).Items).Status);

        await SetStatus(client, universe.Id, promoted, CanonStatus.Draft);

        var reopened = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(opened.Id, reopened.Id);
        Assert.Equal(CanonConflictStatus.Pending, reopened.Status);
        Assert.Null(reopened.ResolvedAt);

        var summary = await Evaluate(client, universe.Id);
        Assert.Equal(1, summary.Detected);
        Assert.Equal(0, summary.Created);
        Assert.Equal(0, summary.Reopened);
    }

    [Fact]
    public async Task A_dismissed_conflict_stays_dismissed_across_an_unchanged_evaluation()
    {
        var (client, universe) = await SignedInWithUniverse("cidismiss");
        await CanonRelationshipOntoDraft(client, universe.Id);
        await Evaluate(client, universe.Id);

        var conflict = Assert.Single((await List(client, universe.Id)).Items);
        var dismissed = await Dismiss(client, universe.Id, conflict.Id);
        Assert.Equal(CanonConflictStatus.Dismissed, dismissed.Status);

        // The issue is still there. Evaluation must not undo the author's decision.
        var summary = await Evaluate(client, universe.Id);
        Assert.Equal(1, summary.Detected);
        Assert.Equal(0, summary.Created);
        Assert.Equal(0, summary.Reopened);

        var after = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(conflict.Id, after.Id);
        Assert.Equal(CanonConflictStatus.Dismissed, after.Status);
        Assert.Null(after.ResolvedAt);

        // And nothing moved on the second look either.
        Assert.Equal(dismissed.UpdatedAt, after.UpdatedAt);
    }

    [Fact]
    public async Task A_dismissed_conflict_is_resolved_once_the_issue_is_actually_fixed()
    {
        var (client, universe) = await SignedInWithUniverse("cidismissfixed");
        var (_, _, target) = await CanonRelationshipOntoDraft(client, universe.Id);
        await Evaluate(client, universe.Id);

        var conflict = Assert.Single((await List(client, universe.Id)).Items);
        await Dismiss(client, universe.Id, conflict.Id);

        // A dismissal suppresses an issue that is still there. Once it is gone there is
        // nothing left to suppress, so the conflict resolves like any other - on the write
        // that fixed it, not on some later evaluation.
        await SetStatus(client, universe.Id, target, CanonStatus.Canon);

        var resolved = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(conflict.Id, resolved.Id);
        Assert.Equal(CanonConflictStatus.Resolved, resolved.Status);
        Assert.NotNull(resolved.ResolvedAt);

        var summary = await Evaluate(client, universe.Id);
        Assert.Equal(0, summary.Detected);
        Assert.Equal(0, summary.Resolved);
    }

    [Fact]
    public async Task An_issue_reintroduced_after_a_dismissal_and_a_fix_is_pending_again()
    {
        var (client, universe) = await SignedInWithUniverse("cidismissreturn");
        var (_, _, target) = await CanonRelationshipOntoDraft(client, universe.Id);
        await Evaluate(client, universe.Id);

        var conflict = Assert.Single((await List(client, universe.Id)).Items);
        await Dismiss(client, universe.Id, conflict.Id);

        var promoted = await SetStatus(client, universe.Id, target, CanonStatus.Canon);
        Assert.Equal(
            CanonConflictStatus.Resolved,
            Assert.Single((await List(client, universe.Id)).Items).Status);

        // The old dismissal was about the old occurrence. It must not swallow this one.
        await SetStatus(client, universe.Id, promoted, CanonStatus.Draft);

        var reopened = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(conflict.Id, reopened.Id);
        Assert.Equal(CanonConflictStatus.Pending, reopened.Status);
        Assert.Null(reopened.ResolvedAt);
    }

    [Fact]
    public async Task Evaluation_stays_idempotent_once_a_dismissed_conflict_has_resolved()
    {
        var (client, universe) = await SignedInWithUniverse("cidismissidempotent");
        var (_, _, target) = await CanonRelationshipOntoDraft(client, universe.Id);
        await Evaluate(client, universe.Id);

        var conflict = Assert.Single((await List(client, universe.Id)).Items);
        await Dismiss(client, universe.Id, conflict.Id);
        await SetStatus(client, universe.Id, target, CanonStatus.Canon);
        await Evaluate(client, universe.Id);

        var first = Assert.Single((await List(client, universe.Id)).Items);
        var summary = await Evaluate(client, universe.Id);

        Assert.Equal(0, summary.Detected);
        Assert.Equal(0, summary.Created);
        Assert.Equal(0, summary.Resolved);

        var second = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(CanonConflictStatus.Resolved, second.Status);
        Assert.Equal(first.UpdatedAt, second.UpdatedAt);
        Assert.Equal(first.ResolvedAt, second.ResolvedAt);
    }

    [Fact]
    public async Task Dismissing_twice_changes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("cidismisstwice");
        await CanonRelationshipOntoDraft(client, universe.Id);
        await Evaluate(client, universe.Id);

        var conflict = Assert.Single((await List(client, universe.Id)).Items);
        var first = await Dismiss(client, universe.Id, conflict.Id);
        var second = await Dismiss(client, universe.Id, conflict.Id);

        Assert.Equal(CanonConflictStatus.Dismissed, second.Status);
        Assert.Equal(first.UpdatedAt, second.UpdatedAt);
    }

    [Fact]
    public async Task A_dismissed_conflict_can_be_reopened_by_hand()
    {
        var (client, universe) = await SignedInWithUniverse("cireopen");
        await CanonRelationshipOntoDraft(client, universe.Id);
        await Evaluate(client, universe.Id);

        var conflict = Assert.Single((await List(client, universe.Id)).Items);
        await Dismiss(client, universe.Id, conflict.Id);

        var reopened = await Reopen(client, universe.Id, conflict.Id);

        Assert.Equal(conflict.Id, reopened.Id);
        Assert.Equal(CanonConflictStatus.Pending, reopened.Status);
    }

    [Fact]
    public async Task A_resolved_conflict_can_be_neither_dismissed_nor_reopened()
    {
        var (client, universe) = await SignedInWithUniverse("ciresolvedlocked");
        var (_, _, target) = await CanonRelationshipOntoDraft(client, universe.Id);

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single((await List(client, universe.Id)).Items);

        await SetStatus(client, universe.Id, target, CanonStatus.Canon);
        await Evaluate(client, universe.Id);

        // Both transitions are about a live issue. This one is gone, so dismissing would
        // suppress nothing and reopening would claim it is back when it is not.
        var dismiss = await client.PostAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/{conflict.Id}/dismiss", null);
        var reopen = await client.PostAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/{conflict.Id}/reopen", null);

        Assert.Equal(HttpStatusCode.BadRequest, dismiss.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, reopen.StatusCode);
        Assert.Equal(
            CanonConflictStatus.Resolved,
            (await Get(client, universe.Id, conflict.Id)).Status);
    }

    // ---------- Fingerprinting ----------

    [Fact]
    public async Task Materially_different_facts_open_a_new_conflict_and_close_the_old_one()
    {
        var (client, universe) = await SignedInWithUniverse("cifingerprint");
        var (relationship, source, _) = await CanonRelationshipOntoDraft(client, universe.Id);

        await Evaluate(client, universe.Id);
        var first = Assert.Single((await List(client, universe.Id)).Items);

        // A different entity is at fault now, so this is a different problem, not the same
        // one reworded.
        var other = await CreateEntity(client, universe.Id, "Rohan", CanonStatus.Draft);
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships/{relationship.Id}",
            new RelationshipRequest(
                relationship.RelationshipTypeId,
                source.Id,
                other.Id,
                CanonStatus.Canon,
                null,
                null,
                null));
        response.EnsureSuccessStatusCode();

        // The retarget reconciled as it landed: the old fingerprint is gone and a new one is
        // open, so a later evaluation has nothing left to do.
        var summary = await Evaluate(client, universe.Id);

        Assert.Equal(0, summary.Created);
        Assert.Equal(0, summary.Resolved);
        Assert.Equal(1, summary.Persisted);

        var page = await List(client, universe.Id);
        Assert.Equal(2, page.Items.Count);

        var stale = page.Items.Single(item => item.Id == first.Id);
        var fresh = page.Items.Single(item => item.Id != first.Id);

        Assert.Equal(CanonConflictStatus.Resolved, stale.Status);
        Assert.Equal(CanonConflictStatus.Pending, fresh.Status);
        Assert.Contains("Rohan", fresh.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_dismissal_does_not_cover_a_materially_different_problem()
    {
        var (client, universe) = await SignedInWithUniverse("cidismissnarrow");
        var (relationship, source, _) = await CanonRelationshipOntoDraft(client, universe.Id);

        await Evaluate(client, universe.Id);
        var first = Assert.Single((await List(client, universe.Id)).Items);
        await Dismiss(client, universe.Id, first.Id);

        var other = await CreateEntity(client, universe.Id, "Rohan", CanonStatus.Draft);
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships/{relationship.Id}",
            new RelationshipRequest(
                relationship.RelationshipTypeId,
                source.Id,
                other.Id,
                CanonStatus.Canon,
                null,
                null,
                null));
        response.EnsureSuccessStatusCode();

        await Evaluate(client, universe.Id);

        var pending = await List(client, universe.Id, status: CanonConflictStatus.Pending);
        var raised = Assert.Single(pending.Items);
        Assert.NotEqual(first.Id, raised.Id);
    }

    // ---------- The other two rules ----------

    [Fact]
    public async Task A_canon_timeline_entry_with_a_draft_participant_is_a_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("citimeline");

        var settled = await CreateEntity(client, universe.Id, "Frodo", CanonStatus.Canon);
        var sketch = await CreateEntity(client, universe.Id, "Tom Bombadil", CanonStatus.Idea);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/timeline",
            new TimelineEntryRequest(
                "The Council of Elrond",
                null,
                CanonStatus.Canon,
                TimelineDateKind.Exact,
                3018,
                10,
                25,
                null,
                null,
                null,
                null,
                [settled.Id, sketch.Id]));
        response.EnsureSuccessStatusCode();
        var entry = (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single((await List(client, universe.Id)).Items);

        Assert.Equal("CANON-TIME-001", conflict.RuleCode);
        Assert.Equal(CanonConflictSeverity.Medium, conflict.Severity);

        var entrySubject = Assert.Single(
            conflict.Subjects, subject => subject.Kind == CanonSubjectKind.TimelineEntry);
        Assert.Equal(entry.Id, entrySubject.SubjectId);
        Assert.Equal(entry.Title, entrySubject.Name);

        // The canon participant is not at fault and is not reported.
        var participant = Assert.Single(
            conflict.Subjects, subject => subject.Kind == CanonSubjectKind.Entity);
        Assert.Equal(sketch.Id, participant.SubjectId);
    }

    [Fact]
    public async Task A_canon_entity_reference_field_pointing_at_a_draft_is_a_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("cifield");

        var type = await CharacterType(client, universe.Id);
        var field = await AddReferenceField(client, universe.Id, type.Id, "Homeland");

        var homeland = await CreateEntity(client, universe.Id, "Gondor", CanonStatus.Draft);
        await CreateEntity(
            client,
            universe.Id,
            "Aragorn",
            CanonStatus.Canon,
            [new FieldValueInput(field.Id, null, null, null, null, null, homeland.Id)]);

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single((await List(client, universe.Id)).Items);

        Assert.Equal("CANON-FIELD-001", conflict.RuleCode);

        var fieldSubject = Assert.Single(
            conflict.Subjects, subject => subject.Kind == CanonSubjectKind.EntityField);
        Assert.Equal(field.Id, fieldSubject.SubjectId);
        Assert.Equal("Homeland", fieldSubject.Name);

        var reference = Assert.Single(
            conflict.Subjects, subject => subject.Role == "reference");
        Assert.Equal(homeland.Id, reference.SubjectId);

        // The field's name is data, never a rule input: nothing here knows what a
        // "Homeland" is, only that the field holds an entity reference.
        Assert.Contains("Gondor", conflict.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Repointing_a_field_at_a_different_entry_does_not_inherit_the_old_dismissal()
    {
        var (client, universe) = await SignedInWithUniverse("cifieldrepoint");

        var type = await CharacterType(client, universe.Id);
        var field = await AddReferenceField(client, universe.Id, type.Id, "Mentor");

        var elrond = await CreateEntity(client, universe.Id, "Elrond", CanonStatus.Draft);
        var galadriel = await CreateEntity(client, universe.Id, "Galadriel", CanonStatus.Draft);
        var owner = await CreateEntity(
            client,
            universe.Id,
            "Aragorn",
            CanonStatus.Canon,
            [new FieldValueInput(field.Id, null, null, null, null, null, elrond.Id)]);

        await Evaluate(client, universe.Id);
        var first = Assert.Single((await List(client, universe.Id)).Items);
        await Dismiss(client, universe.Id, first.Id);

        // Same owner, same field, different target. A dismissal covers one fact, not the
        // field, so this must be raised rather than swallowed.
        await SetReference(client, universe.Id, owner, field.Id, galadriel.Id);
        await Evaluate(client, universe.Id);

        var page = await List(client, universe.Id);
        Assert.Equal(2, page.Items.Count);

        var stale = page.Items.Single(item => item.Id == first.Id);
        Assert.Equal(CanonConflictStatus.Resolved, stale.Status);
        Assert.NotNull(stale.ResolvedAt);

        var raised = page.Items.Single(item => item.Id != first.Id);
        Assert.Equal(CanonConflictStatus.Pending, raised.Status);
        Assert.Equal(
            galadriel.Id,
            Assert.Single(raised.Subjects, subject => subject.Role == "reference").SubjectId);
    }

    [Fact]
    public async Task Renaming_a_referenced_entry_keeps_the_field_conflict_it_already_had()
    {
        var (client, universe) = await SignedInWithUniverse("cifieldrename");

        var type = await CharacterType(client, universe.Id);
        var field = await AddReferenceField(client, universe.Id, type.Id, "Mentor");

        var mentor = await CreateEntity(client, universe.Id, "Elrond", CanonStatus.Draft);
        await CreateEntity(
            client,
            universe.Id,
            "Aragorn",
            CanonStatus.Canon,
            [new FieldValueInput(field.Id, null, null, null, null, null, mentor.Id)]);

        await Evaluate(client, universe.Id);
        var before = Assert.Single((await List(client, universe.Id)).Items);

        await Rename(client, universe.Id, mentor, "Elrond Half-elven");
        await Evaluate(client, universe.Id);

        var after = Assert.Single((await List(client, universe.Id)).Items);
        Assert.Equal(before.Id, after.Id);
        Assert.Equal(CanonConflictStatus.Pending, after.Status);
        Assert.Contains("Elrond Half-elven", after.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Each_offending_endpoint_of_one_relationship_is_its_own_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("cibothends");

        var source = await CreateEntity(client, universe.Id, "Aragorn", CanonStatus.Draft);
        var target = await CreateEntity(client, universe.Id, "Gondor", CanonStatus.Draft);
        var type = await CreateRelationshipType(client, universe.Id, "rules", "ruled by");
        await CreateRelationship(client, universe.Id, type.Id, source.Id, target.Id, CanonStatus.Canon);

        await Evaluate(client, universe.Id);
        var opened = (await List(client, universe.Id)).Items;
        Assert.Equal(2, opened.Count);

        var targetConflict = Assert.Single(
            opened,
            item => item.Subjects.Any(subject => subject.SubjectId == target.Id));
        await Dismiss(client, universe.Id, targetConflict.Id);

        // Promoting the source fixes only the source's conflict. The other endpoint's
        // conflict, and the decision made about it, must survive untouched.
        await SetStatus(client, universe.Id, source, CanonStatus.Canon);
        await Evaluate(client, universe.Id);

        var after = await List(client, universe.Id);
        Assert.Equal(2, after.Items.Count);

        var stillDismissed = after.Items.Single(item => item.Id == targetConflict.Id);
        Assert.Equal(CanonConflictStatus.Dismissed, stillDismissed.Status);
        Assert.Equal(
            CanonConflictStatus.Resolved,
            after.Items.Single(item => item.Id != targetConflict.Id).Status);
    }

    // ---------- Listing ----------

    [Fact]
    public async Task The_listing_filters_by_severity()
    {
        var (client, universe) = await SignedInWithUniverse("ciseverity");
        await CanonRelationshipOntoDraft(client, universe.Id);
        await Evaluate(client, universe.Id);

        Assert.Single((await List(client, universe.Id, severity: CanonConflictSeverity.Medium)).Items);
        Assert.Empty((await List(client, universe.Id, severity: CanonConflictSeverity.High)).Items);
        Assert.Empty((await List(client, universe.Id, severity: CanonConflictSeverity.Low)).Items);
    }

    [Fact]
    public async Task The_listing_filters_by_status()
    {
        var (client, universe) = await SignedInWithUniverse("cistatus");
        var relationships = await ThreeCanonRelationshipsOntoDrafts(client, universe.Id);
        await Evaluate(client, universe.Id);

        var all = await List(client, universe.Id);
        Assert.Equal(relationships, all.Items.Count);

        await Dismiss(client, universe.Id, all.Items[0].Id);

        var pending = await List(client, universe.Id, status: CanonConflictStatus.Pending);
        var dismissed = await List(client, universe.Id, status: CanonConflictStatus.Dismissed);

        Assert.Equal(relationships - 1, pending.Items.Count);
        Assert.Equal(all.Items[0].Id, Assert.Single(dismissed.Items).Id);
        Assert.Empty((await List(client, universe.Id, status: CanonConflictStatus.Resolved)).Items);
    }

    [Fact]
    public async Task Paging_is_deterministic_across_repeated_requests()
    {
        var (client, universe) = await SignedInWithUniverse("cipaging");
        var total = await ThreeCanonRelationshipsOntoDrafts(client, universe.Id);
        await Evaluate(client, universe.Id);

        var first = await List(client, universe.Id, page: 1, pageSize: 2);
        var second = await List(client, universe.Id, page: 2, pageSize: 2);

        Assert.Equal(total, first.TotalCount);
        Assert.Equal(2, first.TotalPages);
        Assert.Equal(2, first.Items.Count);
        Assert.Single(second.Items);
        Assert.Empty(first.Items.Select(item => item.Id).Intersect(second.Items.Select(item => item.Id)));

        var again = await List(client, universe.Id, page: 1, pageSize: 2);
        Assert.Equal(
            first.Items.Select(item => item.Id),
            again.Items.Select(item => item.Id));
    }

    [Fact]
    public async Task Pending_conflicts_are_listed_before_the_rest()
    {
        var (client, universe) = await SignedInWithUniverse("ciorder");
        await ThreeCanonRelationshipsOntoDrafts(client, universe.Id);
        await Evaluate(client, universe.Id);

        var before = await List(client, universe.Id);
        await Dismiss(client, universe.Id, before.Items[0].Id);

        var after = await List(client, universe.Id);

        Assert.Equal(CanonConflictStatus.Dismissed, after.Items[^1].Status);
        Assert.All(
            after.Items.SkipLast(1),
            item => Assert.Equal(CanonConflictStatus.Pending, item.Status));
    }

    // ---------- Universe scoping ----------

    [Fact]
    public async Task Evaluating_one_universe_leaves_another_of_the_same_owner_alone()
    {
        var client = await SignedInClient("user-ciscope");
        var first = await CreateUniverse(client, "World one");
        var second = await CreateUniverse(client, "World two");

        // A write reconciles its own universe and no other. The first world's relationship
        // opens a conflict there and leaves the second world empty.
        var (_, _, firstTarget) = await CanonRelationshipOntoDraft(client, first.Id);

        var conflict = Assert.Single((await List(client, first.Id)).Items);
        Assert.Empty((await List(client, second.Id)).Items);

        // And the second world's own write opens its own conflict without disturbing the first.
        await CanonRelationshipOntoDraft(client, second.Id);

        Assert.Single((await List(client, second.Id)).Items);
        var stillThere = Assert.Single((await List(client, first.Id)).Items);
        Assert.Equal(conflict.Id, stillThere.Id);
        Assert.Equal(conflict.UpdatedAt, stillThere.UpdatedAt);

        await Evaluate(client, first.Id);

        // Every subject belongs to the universe the conflict was found in.
        Assert.Contains(
            conflict.Subjects,
            subject => subject.Kind == CanonSubjectKind.Entity && subject.SubjectId == firstTarget.Id);
        Assert.All(conflict.Subjects, subject => Assert.NotNull(subject.Name));
    }

    [Fact]
    public async Task A_conflict_of_another_universe_is_not_reachable_through_this_one()
    {
        var client = await SignedInClient("user-cicrossuniverse");
        var first = await CreateUniverse(client, "World one");
        var second = await CreateUniverse(client, "World two");

        await CanonRelationshipOntoDraft(client, first.Id);
        await Evaluate(client, first.Id);
        var conflict = Assert.Single((await List(client, first.Id)).Items);

        var response = await client.GetAsync(
            $"/api/universes/{second.Id}/canon-conflicts/{conflict.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------- Ownership ----------

    [Fact]
    public async Task Another_owner_cannot_read_these_conflicts()
    {
        var (owner, universe) = await SignedInWithUniverse("ciownerlist");
        await CanonRelationshipOntoDraft(owner, universe.Id);
        await Evaluate(owner, universe.Id);
        var conflict = Assert.Single((await List(owner, universe.Id)).Items);

        var intruder = await SignedInClient("user-ciintruderlist");

        var list = await intruder.GetAsync($"/api/universes/{universe.Id}/canon-conflicts");
        var one = await intruder.GetAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/{conflict.Id}");

        Assert.Equal(HttpStatusCode.NotFound, list.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, one.StatusCode);

        // Nothing in the body either: a 404 that described the universe would still leak.
        Assert.Empty(await list.Content.ReadAsStringAsync());
        Assert.Empty(await one.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Another_owner_cannot_evaluate_this_universe()
    {
        var (owner, universe) = await SignedInWithUniverse("ciownereval");
        await CanonRelationshipOntoDraft(owner, universe.Id);

        var intruder = await SignedInClient("user-ciintrudereval");
        var response = await intruder.PostAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/evaluate", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());

        // The refusal did no work either: what the owner sees is exactly what their own write
        // recorded, and nothing the intruder did opened, resolved or refreshed anything.
        var conflict = Assert.Single((await List(owner, universe.Id)).Items);
        var summary = await Evaluate(owner, universe.Id);

        Assert.Equal(0, summary.Created);
        Assert.Equal(0, summary.Resolved);
        Assert.Equal(1, summary.Persisted);
        Assert.Equal(conflict.UpdatedAt, Assert.Single((await List(owner, universe.Id)).Items).UpdatedAt);
    }

    [Fact]
    public async Task Another_owner_can_neither_dismiss_nor_reopen_this_conflict()
    {
        var (owner, universe) = await SignedInWithUniverse("ciownerdismiss");
        await CanonRelationshipOntoDraft(owner, universe.Id);
        await Evaluate(owner, universe.Id);
        var conflict = Assert.Single((await List(owner, universe.Id)).Items);

        var intruder = await SignedInClient("user-ciintruderdismiss");

        var dismiss = await intruder.PostAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/{conflict.Id}/dismiss", null);
        var reopen = await intruder.PostAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/{conflict.Id}/reopen", null);

        Assert.Equal(HttpStatusCode.NotFound, dismiss.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, reopen.StatusCode);

        Assert.Equal(
            CanonConflictStatus.Pending,
            (await Get(owner, universe.Id, conflict.Id)).Status);
    }

    [Fact]
    public async Task A_conflict_id_from_another_owner_is_refused_inside_ones_own_universe()
    {
        var (owner, theirs) = await SignedInWithUniverse("ciownerid");
        await CanonRelationshipOntoDraft(owner, theirs.Id);
        await Evaluate(owner, theirs.Id);
        var conflict = Assert.Single((await List(owner, theirs.Id)).Items);

        var intruder = await SignedInClient("user-ciintruderid");
        var mine = await CreateUniverse(intruder, "My own world");

        // Holding the id is not enough: it is re-resolved inside the route's universe.
        var response = await intruder.GetAsync(
            $"/api/universes/{mine.Id}/canon-conflicts/{conflict.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task The_conflict_routes_refuse_an_anonymous_caller()
    {
        var (owner, universe) = await SignedInWithUniverse("cianon");
        await CanonRelationshipOntoDraft(owner, universe.Id);
        await Evaluate(owner, universe.Id);

        var anonymous = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
        });

        var list = await anonymous.GetAsync($"/api/universes/{universe.Id}/canon-conflicts");
        var evaluate = await anonymous.PostAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/evaluate", null);

        Assert.NotEqual(HttpStatusCode.OK, list.StatusCode);
        Assert.NotEqual(HttpStatusCode.OK, evaluate.StatusCode);
    }

    // ---------- Helpers ----------

    /// <summary>
    /// The shape most of these tests need: a Canon relationship whose target is a Draft,
    /// which is exactly one CANON-REL-001 finding and nothing else.
    /// </summary>
    private static async Task<(RelationshipDetail Relationship, EntityDetail Source, EntityDetail Target)>
        CanonRelationshipOntoDraft(HttpClient client, Guid universeId)
    {
        var source = await CreateEntity(client, universeId, "Aragorn", CanonStatus.Canon);
        var target = await CreateEntity(client, universeId, "Gondor", CanonStatus.Draft);
        var type = await CreateRelationshipType(client, universeId, "rules", "ruled by");

        var relationship = await CreateRelationship(
            client, universeId, type.Id, source.Id, target.Id, CanonStatus.Canon);

        return (relationship, source, target);
    }

    /// <summary>Three separate findings, so listing, filtering and paging have something to sort.</summary>
    private static async Task<int> ThreeCanonRelationshipsOntoDrafts(HttpClient client, Guid universeId)
    {
        var source = await CreateEntity(client, universeId, "Aragorn", CanonStatus.Canon);
        var type = await CreateRelationshipType(client, universeId, "rules", "ruled by");

        foreach (var name in (string[])["Gondor", "Rohan", "Arnor"])
        {
            var target = await CreateEntity(client, universeId, name, CanonStatus.Draft);
            await CreateRelationship(client, universeId, type.Id, source.Id, target.Id, CanonStatus.Canon);
        }

        return 3;
    }

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        return (client, await CreateUniverse(client, $"World {tag}"));
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<EntityTypeResponse> CharacterType(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        return types.First(type => type.Name == "Character");
    }

    private static async Task<FieldDefinitionResponse> AddReferenceField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, EntityFieldKind.EntityReference, false, null, null, null));
        response.EnsureSuccessStatusCode();

        var type = (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
        return type.Fields.First(field => field.Name == name);
    }

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        string name,
        CanonStatus canonStatus,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var type = await CharacterType(client, universeId);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(type.Id, name, null, canonStatus, null, null, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static Task<EntityDetail> SetStatus(
        HttpClient client,
        Guid universeId,
        EntityDetail entity,
        CanonStatus status) =>
        Save(client, universeId, entity, entity.Name, status);

    /// <summary>Points one entity-reference field somewhere else, leaving the rest alone.</summary>
    private static async Task<EntityDetail> SetReference(
        HttpClient client,
        Guid universeId,
        EntityDetail entity,
        Guid fieldId,
        Guid referencedEntityId)
    {
        var response = await client.PutVersionedAsync(
            $"/api/universes/{universeId}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId,
                entity.Name,
                entity.Summary,
                entity.CanonStatus,
                entity.Aliases,
                entity.Tags,
                [new FieldValueInput(fieldId, null, null, null, null, null, referencedEntityId)]));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static Task<EntityDetail> Rename(
        HttpClient client,
        Guid universeId,
        EntityDetail entity,
        string name) =>
        Save(client, universeId, entity, name, entity.CanonStatus);

    private static async Task<EntityDetail> Save(
        HttpClient client,
        Guid universeId,
        EntityDetail entity,
        string name,
        CanonStatus status)
    {
        var response = await client.PutVersionedAsync(
            $"/api/universes/{universeId}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId,
                name,
                entity.Summary,
                status,
                entity.Aliases,
                entity.Tags,
                [.. entity.Fields.Select(field => new FieldValueInput(
                    field.FieldDefinitionId,
                    field.Text,
                    field.Number,
                    field.Boolean,
                    field.Date,
                    field.OptionIds,
                    field.ReferencedEntityId))]));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<RelationshipTypeResponse> CreateRelationshipType(
        HttpClient client,
        Guid universeId,
        string name,
        string? inverseName)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest(name, inverseName, false, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;
    }

    private static async Task<RelationshipDetail> CreateRelationship(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        Guid sourceId,
        Guid targetId,
        CanonStatus canonStatus)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationships",
            new RelationshipRequest(typeId, sourceId, targetId, canonStatus, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipDetail>())!;
    }

    private static async Task<CanonEvaluationResponse> Evaluate(HttpClient client, Guid universeId)
    {
        var response = await client.PostAsync(
            $"/api/universes/{universeId}/canon-conflicts/evaluate", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CanonEvaluationResponse>())!;
    }

    private static async Task<CanonConflictResponse> Get(
        HttpClient client,
        Guid universeId,
        Guid conflictId) =>
        (await client.GetFromJsonAsync<CanonConflictResponse>(
            $"/api/universes/{universeId}/canon-conflicts/{conflictId}"))!;

    private static async Task<CanonConflictResponse> Dismiss(
        HttpClient client,
        Guid universeId,
        Guid conflictId)
    {
        var response = await client.PostAsync(
            $"/api/universes/{universeId}/canon-conflicts/{conflictId}/dismiss", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CanonConflictResponse>())!;
    }

    private static async Task<CanonConflictResponse> Reopen(
        HttpClient client,
        Guid universeId,
        Guid conflictId)
    {
        var response = await client.PostAsync(
            $"/api/universes/{universeId}/canon-conflicts/{conflictId}/reopen", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CanonConflictResponse>())!;
    }

    private static async Task<CanonConflictPage> List(
        HttpClient client,
        Guid universeId,
        CanonConflictSeverity? severity = null,
        CanonConflictStatus? status = null,
        int page = 1,
        int pageSize = 25)
    {
        var query = $"?page={page}&pageSize={pageSize}";

        if (severity is { } wantedSeverity)
        {
            query += $"&severity={wantedSeverity}";
        }

        if (status is { } wantedStatus)
        {
            query += $"&status={wantedStatus}";
        }

        return (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universeId}/canon-conflicts{query}"))!;
    }
}
