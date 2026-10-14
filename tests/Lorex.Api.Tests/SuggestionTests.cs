using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Suggestions;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.VersionTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Suggested changes (task 045, ADR 0044): proposals to an entry, a story or a scene that write nothing until the owner or
/// an Editor accepts one - which then saves it through the target's ordinary write path, as the resolver, over the version
/// it was proposed against. Who may do what, what is refused, and how suggestions live with what they are about.
/// </summary>
public sealed class SuggestionTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private static string Name(string tag, string who) => $"user-{tag}-{who}";

    // ---------- Proposing ----------

    [Fact]
    public async Task A_reviewer_suggests_changes_to_an_entry_a_story_and_a_scene_and_nothing_is_written()
    {
        const string tag = "sg-propose";
        var w = await NewSharedWorld(_factory, tag);
        var (entry, story, scene) = Paths(w);
        var before = await Targets(w);
        var revisions = await Revisions(w);

        var onEntry = await Suggest<EntrySuggestion>(w.Reviewer, entry, new EntityRequest(
            w.CharacterType, "Ember Vale the Younger", "The heir, once.", CanonStatus.Draft, ["Em"], ["royal"], null, await CurrentVersion(w.Owner, entry)));
        var onStory = await Suggest<StorySuggestion>(w.Reviewer, story, new StoryRequest(
            "The drowned queen", "A tide comes in.", StoryStatus.Complete, await CurrentVersion(w.Owner, story)));
        var onScene = await Suggest<SceneSuggestion>(w.Reviewer, scene, new SceneRequest(
            "The causeway at night", "She crosses.", null, w.Other, null, [w.Other], w.Chapter, await CurrentVersion(w.Owner, scene)));

        Assert.All(new[] { onEntry.Status, onStory.Status, onScene.Status }, status => Assert.Equal(SuggestionStatus.Open, status));
        Assert.All(new[] { onEntry.ProposedByName, onStory.ProposedByName, onScene.ProposedByName }, name => Assert.Equal(Name(tag, "reviewer"), name));
        Assert.All(new[] { onEntry.TargetChanged, onStory.TargetChanged, onScene.TargetChanged }, changed => Assert.False(changed));
        Assert.Null(onEntry.ResolvedByName);
        Assert.Null(onEntry.ResolvedAt);
        Assert.Equal(DateTimeKind.Utc, onEntry.CreatedAt.Kind);

        // What was there, and what would be - in the target's own words.
        Assert.Equal(("Ember Vale", "The heir.", CanonStatus.Canon), (onEntry.Before.Name, onEntry.Before.Summary, onEntry.Before.CanonStatus));
        Assert.Equal(("Ember Vale the Younger", "The heir, once.", CanonStatus.Draft), (onEntry.Proposed.Name, onEntry.Proposed.Summary, onEntry.Proposed.CanonStatus));
        Assert.Equal(["Em"], onEntry.Proposed.Aliases);
        Assert.Equal(["royal"], onEntry.Proposed.Tags);
        Assert.Equal("Character", onEntry.Proposed.EntityTypeName);
        Assert.Equal(("The drowned heir", StoryStatus.Planning), (onStory.Before.Title, onStory.Before.Status));
        Assert.Equal(("The drowned queen", "A tide comes in.", StoryStatus.Complete), (onStory.Proposed.Title, onStory.Proposed.Premise, onStory.Proposed.Status));
        Assert.Equal("The causeway", onScene.Before.Title);
        Assert.Empty(onScene.Before.Entities);
        Assert.Equal(("The causeway at night", "She crosses.", w.Chapter), (onScene.Proposed.Title, onScene.Proposed.Summary, onScene.Proposed.ChapterId));
        Assert.Equal("Ash Vale", onScene.Proposed.Pov!.Name);
        Assert.Equal(["Ash Vale"], onScene.Proposed.Entities.Select(link => link.Name));

        // Nothing about the content moved: not a field, not its version, not its history.
        Assert.Equal(before, await Targets(w));
        Assert.Equal(revisions, await Revisions(w));

        Assert.Equal(onEntry.Id, Assert.Single(await List<EntrySuggestion>(w.Reviewer, entry)).Id);
        Assert.Equal(onStory.Id, Assert.Single(await List<StorySuggestion>(w.Owner, story)).Id);
        Assert.Equal(onScene.Id, Assert.Single(await List<SceneSuggestion>(w.Editor, scene)).Id);
    }

    [Fact]
    public async Task The_owner_and_an_editor_may_suggest_and_a_viewer_and_an_outsider_may_not()
    {
        var w = await NewSharedWorld(_factory, "sg-who");
        var (entry, story, scene) = Paths(w);

        await Suggest<StorySuggestion>(w.Owner, story, new StoryRequest("Owner's title", null, StoryStatus.Drafting, await CurrentVersion(w.Owner, story)));
        await Suggest<StorySuggestion>(w.Editor, story, new StoryRequest("Editor's title", null, StoryStatus.Drafting, await CurrentVersion(w.Owner, story)));
        var counted = await Count();

        var bodies = new (string Path, object Body)[]
        {
            (entry, new EntityRequest(w.CharacterType, "Taken", null, CanonStatus.Idea, null, null, null, await CurrentVersion(w.Owner, entry))),
            (story, new StoryRequest("Taken", null, StoryStatus.Planning, await CurrentVersion(w.Owner, story))),
            (scene, new SceneRequest("Taken", null, null, null, null, null, w.Chapter, await CurrentVersion(w.Owner, scene))),
        };

        foreach (var (path, body) in bodies)
        {
            await AssertDenied(await w.Viewer.PostAsJsonAsync($"{path}/suggestions", body), $"viewer: {path}");
            await AssertHidden(await w.Outsider.PostAsJsonAsync($"{path}/suggestions", body), $"outsider: {path}");
            await AssertHidden(await w.Outsider.GetAsync($"{path}/suggestions"), $"outsider list: {path}");
        }

        Assert.Equal(counted, await Count());
        Assert.Equal(2, (await List<StorySuggestion>(w.Viewer, story)).Count);
    }

    [Fact]
    public async Task A_proposal_that_changes_nothing_names_an_old_version_or_breaks_a_rule_is_refused_with_nothing_written()
    {
        var w = await NewSharedWorld(_factory, "sg-refuse");
        var (entry, story, scene) = Paths(w);
        var entryVersion = await CurrentVersion(w.Owner, entry);
        var storyVersion = await CurrentVersion(w.Owner, story);
        var sceneVersion = await CurrentVersion(w.Owner, scene);
        var counted = await Count();

        // The same values: nothing to suggest.
        var same = await w.Reviewer.PostAsJsonAsync($"{entry}/suggestions", new EntityRequest(
            w.CharacterType, "Ember Vale", "The heir.", CanonStatus.Canon, null, null, null, entryVersion));
        Assert.Equal(HttpStatusCode.BadRequest, same.StatusCode);
        Assert.Equal(SuggestionEndpoints.UnchangedCode, await PublishingTestClient.ProblemCode(same));

        // An old, a future or no version: refused exactly as the save would be, with the save's own code.
        foreach (var version in new int?[] { entryVersion - 1, entryVersion + 1, null })
        {
            var stale = await w.Reviewer.PostAsJsonAsync($"{entry}/suggestions", new EntityRequest(
                w.CharacterType, "Elsewhere", null, CanonStatus.Canon, null, null, null, version));
            Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
            Assert.Equal(EntityEndpoints.ChangedCode, await PublishingTestClient.ProblemCode(stale));
            Assert.Equal(entryVersion, (await stale.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("currentVersion").GetInt32());
        }

        var staleStory = await w.Reviewer.PostAsJsonAsync($"{story}/suggestions", new StoryRequest("Elsewhere", null, StoryStatus.Drafting, storyVersion + 1));
        Assert.Equal(StoryEndpoints.ChangedCode, await PublishingTestClient.ProblemCode(staleStory));
        var staleScene = await w.Reviewer.PostAsJsonAsync($"{scene}/suggestions", new SceneRequest("Elsewhere", null, null, null, null, null, w.Chapter, sceneVersion + 1));
        Assert.Equal(SceneEndpoints.ChangedCode, await PublishingTestClient.ProblemCode(staleScene));

        // The form's own validation: a blank name, a type from nowhere, a link to nothing.
        var blank = await w.Reviewer.PostAsJsonAsync($"{entry}/suggestions", new EntityRequest(
            w.CharacterType, " ", null, CanonStatus.Canon, null, null, null, entryVersion));
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
        var foreignType = await w.Reviewer.PostAsJsonAsync($"{entry}/suggestions", new EntityRequest(
            Guid.NewGuid(), "Ember Vale", null, CanonStatus.Canon, null, null, null, entryVersion));
        Assert.Equal(HttpStatusCode.BadRequest, foreignType.StatusCode);
        var nowhere = await w.Reviewer.PostAsJsonAsync($"{scene}/suggestions", new SceneRequest(
            "The causeway", null, null, null, null, [Guid.NewGuid()], w.Chapter, sceneVersion));
        Assert.Equal(HttpStatusCode.BadRequest, nowhere.StatusCode);

        Assert.Equal(counted, await Count());
        Assert.Equal((entryVersion, storyVersion, sceneVersion), (
            await CurrentVersion(w.Owner, entry), await CurrentVersion(w.Owner, story), await CurrentVersion(w.Owner, scene)));
    }

    [Fact]
    public async Task A_proposal_holds_only_what_the_form_edits_and_extra_members_reach_nothing()
    {
        var w = await NewSharedWorld(_factory, "sg-overpost");
        var (_, _, scene) = Paths(w);
        var otherStory = await CreateStory(w.Owner, w.U, "Another book");
        var version = await CurrentVersion(w.Owner, scene);

        // Every member a scene request does not declare - its story, publication, order, version, universe - is ignored.
        var response = await w.Reviewer.PostAsJsonAsync($"{scene}/suggestions", new Dictionary<string, object?>
        {
            ["title"] = "Retitled",
            ["chapterId"] = w.Chapter,
            ["expectedVersion"] = version,
            ["storyId"] = otherStory,
            ["visibility"] = 2,
            ["manuscriptVisibility"] = 2,
            ["sortOrder"] = 40,
            ["version"] = 99,
            ["universeId"] = Guid.NewGuid(),
            ["ownerId"] = w.ReviewerId,
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var suggestion = (await response.Content.ReadFromJsonAsync<SuggestionResponse<SceneSuggestion>>())!;

        string stored = "";
        await WithDb(_factory, async db => stored = await db.SuggestedChanges.Where(row => row.Id == suggestion.Id).Select(row => row.Proposed).SingleAsync());
        foreach (var member in new[] { "storyId", "visibility", "sortOrder", "version", "universeId", "ownerId" })
        {
            Assert.DoesNotContain($"\"{member}\"", stored, StringComparison.Ordinal);
        }

        await Ok(w.Owner.PostAsync(Accept(w, suggestion.Id), null));

        await WithDb(_factory, async db =>
        {
            var row = await db.Scenes.SingleAsync(candidate => candidate.Id == w.Scene);
            Assert.Equal(("Retitled", w.Story, w.Chapter, version + 1), (row.Title, row.StoryId, row.ChapterId, row.Version));
            Assert.Equal(Lorex.Api.Features.Publishing.ContentVisibility.Private, row.Visibility);
            Assert.Equal(Lorex.Api.Features.Publishing.ContentVisibility.Private, row.ManuscriptVisibility);
        });
    }

    // ---------- Accepting ----------

    [Fact]
    public async Task Accepting_saves_the_proposal_as_the_resolvers_edit_once_and_keeps_who_proposed_it()
    {
        const string tag = "sg-accept";
        var w = await NewSharedWorld(_factory, tag);
        var (entry, _, _) = Paths(w);
        var title = await AddField(w.Owner, w.U, w.CharacterType, "Title");
        var version = await CurrentVersion(w.Owner, entry);
        var history = (await EntryRevisions(w.Owner, entry)).Count;

        var suggestion = await Suggest<EntrySuggestion>(w.Reviewer, entry, new EntityRequest(
            w.CharacterType, "Ember of the Vale", "The heir.", CanonStatus.Canon, null, ["royal"],
            [new FieldValueInput(title, "Regent", null, null, null, null, null)], version));
        Assert.Equal("Regent", Assert.Single(suggestion.Proposed.Fields).Text);
        Assert.Empty(suggestion.Before.Fields);
        Assert.Equal(history, (await EntryRevisions(w.Owner, entry)).Count);

        var accepted = await Resolve<EntrySuggestion>(w.Owner, Accept(w, suggestion.Id));
        Assert.Equal(SuggestionStatus.Accepted, accepted.Status);
        Assert.Equal(Name(tag, "reviewer"), accepted.ProposedByName);
        Assert.Equal(Name(tag, "owner"), accepted.ResolvedByName);
        Assert.Equal(DateTimeKind.Utc, accepted.ResolvedAt!.Value.Kind);
        Assert.False(accepted.TargetChanged);
        Assert.Equal("Ember of the Vale", accepted.Proposed.Name);

        var saved = (await w.Owner.GetFromJsonAsync<EntityDetail>(entry))!;
        Assert.Equal(("Ember of the Vale", version + 1), (saved.Name, saved.Version));
        Assert.Equal(["royal"], saved.Tags);
        Assert.Equal("Regent", Assert.Single(saved.Fields).Text);

        // One ordinary version of the entry, made by the owner who accepted it - never by the Reviewer.
        var revisions = await EntryRevisions(w.Owner, entry);
        Assert.Equal(history + 1, revisions.Count);
        Assert.Equal(Name(tag, "owner"), revisions[0].ActorName);
        Assert.Equal(EntityRevisionKind.Edited, revisions[0].Kind);
        await WithDb(_factory, async db => Assert.Equal(
            w.OwnerId,
            await db.EntityRevisions.Where(row => row.EntityId == w.Entry).OrderByDescending(row => row.Number).Select(row => row.ActorUserId).FirstAsync()));

        // Once only: a second accept or a reject changes nothing.
        var again = await w.Editor.PostAsync(Accept(w, suggestion.Id), null);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal(SuggestionEndpoints.ResolvedCode, await PublishingTestClient.ProblemCode(again));
        Assert.Equal(SuggestionEndpoints.ResolvedCode, await PublishingTestClient.ProblemCode(await w.Owner.PostAsync(Reject(w, suggestion.Id), null)));
        Assert.Equal(version + 1, await CurrentVersion(w.Owner, entry));
        Assert.Equal(history + 1, (await EntryRevisions(w.Owner, entry)).Count);
        Assert.Equal(SuggestionStatus.Accepted, Assert.Single(await List<EntrySuggestion>(w.Viewer, entry)).Status);
    }

    [Fact]
    public async Task An_editor_accepts_story_and_scene_suggestions_through_their_ordinary_saves()
    {
        const string tag = "sg-editor";
        var w = await NewSharedWorld(_factory, tag);
        var (_, story, scene) = Paths(w);
        var storyVersion = await CurrentVersion(w.Owner, story);
        var sceneVersion = await CurrentVersion(w.Owner, scene);

        var onStory = await Suggest<StorySuggestion>(w.Reviewer, story, new StoryRequest("The drowned queen", "Tides.", StoryStatus.Complete, storyVersion));
        // Out of its chapter and into Unchaptered, with lore linked: a move the ordinary save makes.
        var onScene = await Suggest<SceneSuggestion>(w.Reviewer, scene, new SceneRequest("Low tide", null, "Check the moon.", null, null, [w.Other], null, sceneVersion));

        Assert.Equal(SuggestionStatus.Accepted, (await Resolve<StorySuggestion>(w.Editor, Accept(w, onStory.Id))).Status);
        var accepted = await Resolve<SceneSuggestion>(w.Editor, Accept(w, onScene.Id));
        Assert.Equal(Name(tag, "editor"), accepted.ResolvedByName);

        var read = await ReadStory(w.Owner, w.U, w.Story);
        Assert.Equal(("The drowned queen", "Tides.", StoryStatus.Complete, storyVersion + 1), (read.Title, read.Premise, read.Status, read.Version));
        var moved = read.Scenes.Single(candidate => candidate.Id == w.Scene);
        Assert.Equal(("Low tide", (Guid?)null, "Check the moon.", sceneVersion + 1), (moved.Title, moved.ChapterId, moved.Notes, moved.Version));
        Assert.Equal([w.Other], moved.Entities.Select(link => link.EntityId));
    }

    [Fact]
    public async Task Reviewers_and_viewers_can_neither_accept_nor_reject()
    {
        var w = await NewSharedWorld(_factory, "sg-noresolve");
        var (entry, _, _) = Paths(w);
        var suggestion = await Suggest<EntrySuggestion>(w.Reviewer, entry, Rename(w, "Taken", await CurrentVersion(w.Owner, entry)));
        var before = await Targets(w);

        foreach (var who in new[] { w.Reviewer, w.Viewer })
        {
            await AssertDenied(await who.PostAsync(Accept(w, suggestion.Id), null), "accept");
            await AssertDenied(await who.PostAsync(Reject(w, suggestion.Id), null), "reject");
            // A guessed id answers the same refusal: nothing about whether it exists.
            await AssertDenied(await who.PostAsync(Accept(w, Guid.NewGuid()), null), "accept a guess");
        }

        Assert.Equal(before, await Targets(w));
        Assert.Equal(SuggestionStatus.Open, Assert.Single(await List<EntrySuggestion>(w.Owner, entry)).Status);
    }

    // ---------- Rejecting ----------

    [Fact]
    public async Task Rejecting_leaves_the_content_alone_and_keeps_the_suggestion_to_read()
    {
        const string tag = "sg-reject";
        var w = await NewSharedWorld(_factory, tag);
        var (entry, story, _) = Paths(w);
        var older = await Suggest<EntrySuggestion>(w.Reviewer, entry, Rename(w, "First idea", await CurrentVersion(w.Owner, entry)));
        var newer = await Suggest<EntrySuggestion>(w.Reviewer, entry, Rename(w, "Second idea", await CurrentVersion(w.Owner, entry)));
        var onStory = await Suggest<StorySuggestion>(w.Reviewer, story, new StoryRequest("Nope", null, StoryStatus.Planning, await CurrentVersion(w.Owner, story)));
        var before = await Targets(w);
        var revisions = await Revisions(w);

        var rejected = await Resolve<EntrySuggestion>(w.Owner, Reject(w, older.Id));
        Assert.Equal((SuggestionStatus.Rejected, Name(tag, "owner")), (rejected.Status, rejected.ResolvedByName));
        Assert.Equal(DateTimeKind.Utc, rejected.ResolvedAt!.Value.Kind);
        Assert.Equal(Name(tag, "editor"), (await Resolve<StorySuggestion>(w.Editor, Reject(w, onStory.Id))).ResolvedByName);

        Assert.Equal(before, await Targets(w));
        Assert.Equal(revisions, await Revisions(w));

        // Decided once: no accept, no second reject.
        Assert.Equal(SuggestionEndpoints.ResolvedCode, await PublishingTestClient.ProblemCode(await w.Owner.PostAsync(Accept(w, older.Id), null)));
        Assert.Equal(SuggestionEndpoints.ResolvedCode, await PublishingTestClient.ProblemCode(await w.Editor.PostAsync(Reject(w, older.Id), null)));
        Assert.Equal(before, await Targets(w));

        // Open first, then decided, newest first within each - the same order every time.
        var listed = await List<EntrySuggestion>(w.Viewer, entry);
        Assert.Equal([newer.Id, older.Id], listed.Select(row => row.Id));
        Assert.Equal([SuggestionStatus.Open, SuggestionStatus.Rejected], listed.Select(row => row.Status));
        Assert.Equal("First idea", listed[1].Proposed.Name);
    }

    // ---------- A target saved since ----------

    [Fact]
    public async Task A_suggestion_made_before_another_save_can_be_read_and_rejected_but_never_accepted()
    {
        var w = await NewSharedWorld(_factory, "sg-stale");
        var (entry, _, _) = Paths(w);
        var version = await CurrentVersion(w.Owner, entry);
        var old = await Suggest<EntrySuggestion>(w.Reviewer, entry, Rename(w, "Reviewer's name", version));

        // An Editor saves something else - an unrelated field - in between. No merge: the suggestion is out of date.
        await Ok(w.Editor.PutVersionedAsync(entry, new EntityRequest(w.CharacterType, "Ember Vale", "Edited by the Editor.", CanonStatus.Canon, null, null, null)));
        var stale = Assert.Single(await List<EntrySuggestion>(w.Owner, entry));
        Assert.True(stale.TargetChanged);
        Assert.Equal(SuggestionStatus.Open, stale.Status);

        var refused = await w.Owner.PostAsync(Accept(w, old.Id), null);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(SuggestionEndpoints.TargetChangedCode, await PublishingTestClient.ProblemCode(refused));

        var kept = (await w.Owner.GetFromJsonAsync<EntityDetail>(entry))!;
        Assert.Equal(("Ember Vale", "Edited by the Editor.", version + 1), (kept.Name, kept.Summary, kept.Version));
        var still = Assert.Single(await List<EntrySuggestion>(w.Owner, entry));
        Assert.Equal((SuggestionStatus.Open, "Reviewer's name"), (still.Status, still.Proposed.Name));

        // Made again over what is there now, it goes through; the old one can still be turned down.
        var fresh = await Suggest<EntrySuggestion>(w.Reviewer, entry, new EntityRequest(
            w.CharacterType, "Reviewer's name", "Edited by the Editor.", CanonStatus.Canon, null, null, null, version + 1));
        Assert.False(fresh.TargetChanged);
        await Resolve<EntrySuggestion>(w.Owner, Accept(w, fresh.Id));
        await Resolve<EntrySuggestion>(w.Owner, Reject(w, old.Id));

        var final = (await w.Owner.GetFromJsonAsync<EntityDetail>(entry))!;
        Assert.Equal(("Reviewer's name", "Edited by the Editor.", version + 2), (final.Name, final.Summary, final.Version));
        // A decided suggestion is never called out of date.
        Assert.All(await List<EntrySuggestion>(w.Owner, entry), row => Assert.False(row.TargetChanged));
    }

    [Fact]
    public async Task Of_two_suggestions_on_one_version_only_the_first_accepted_applies()
    {
        var w = await NewSharedWorld(_factory, "sg-siblings");
        var (_, _, scene) = Paths(w);
        var version = await CurrentVersion(w.Owner, scene);
        var first = await Suggest<SceneSuggestion>(w.Reviewer, scene, new SceneRequest("First", null, null, null, null, null, w.Chapter, version));
        var second = await Suggest<SceneSuggestion>(w.Editor, scene, new SceneRequest("Second", null, null, null, null, null, w.Chapter, version));

        await Resolve<SceneSuggestion>(w.Owner, Accept(w, first.Id));

        var sibling = (await List<SceneSuggestion>(w.Owner, scene)).Single(row => row.Id == second.Id);
        Assert.True(sibling.TargetChanged);
        Assert.Equal(SuggestionEndpoints.TargetChangedCode, await PublishingTestClient.ProblemCode(await w.Owner.PostAsync(Accept(w, second.Id), null)));

        var applied = (await ReadStory(w.Owner, w.U, w.Story)).Scenes.Single(row => row.Id == w.Scene);
        Assert.Equal(("First", version + 1), (applied.Title, applied.Version));
    }

    [Fact]
    public async Task Accepting_checks_the_proposal_again_and_a_refusal_leaves_it_open_and_the_content_as_it_was()
    {
        var w = await NewSharedWorld(_factory, "sg-revalidate");
        var (_, _, scene) = Paths(w);
        var doomed = await CreateEntity(w.Owner, w.U, "Short-lived");
        var version = await CurrentVersion(w.Owner, scene);
        var suggestion = await Suggest<SceneSuggestion>(w.Reviewer, scene, new SceneRequest("The causeway", null, null, null, null, [doomed], w.Chapter, version));

        // The entry it would link goes to the Trash: the scene itself is not saved, so its version stands.
        await Ok(w.Owner.DeleteAsync($"/api/universes/{w.U}/entities/{doomed}"));
        Assert.Equal(version, await CurrentVersion(w.Owner, scene));

        var refused = await w.Owner.PostAsync(Accept(w, suggestion.Id), null);
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);

        Assert.Equal(version, await CurrentVersion(w.Owner, scene));
        Assert.Empty((await ReadStory(w.Owner, w.U, w.Story)).Scenes.Single(row => row.Id == w.Scene).Entities);
        Assert.Equal(SuggestionStatus.Open, Assert.Single(await List<SceneSuggestion>(w.Owner, scene)).Status);
    }

    // ---------- People ----------

    [Fact]
    public async Task Who_proposed_and_who_decided_stay_readable_after_they_leave()
    {
        const string tag = "sg-removed";
        var w = await NewSharedWorld(_factory, tag);
        var (entry, _, _) = Paths(w);
        var u = $"/api/universes/{w.U}";
        var suggestion = await Suggest<EntrySuggestion>(w.Reviewer, entry, Rename(w, "Before I go", await CurrentVersion(w.Owner, entry)));
        await Resolve<EntrySuggestion>(w.Editor, Reject(w, suggestion.Id));

        await Ok(w.Owner.DeleteAsync($"{u}/collaborators/{w.ReviewerId}"));
        await AssertHidden(await w.Reviewer.GetAsync($"{entry}/suggestions"), "former reviewer");
        var kept = Assert.Single(await List<EntrySuggestion>(w.Owner, entry));
        Assert.Equal((Name(tag, "reviewer"), Name(tag, "editor")), (kept.ProposedByName, kept.ResolvedByName));

        // An account no one answers to any more reads as no one, and the suggestion still reads.
        await WithDb(_factory, async db => await db.SuggestedChanges.Where(row => row.Id == suggestion.Id)
            .ExecuteUpdateAsync(set => set
                .SetProperty(row => row.ProposedByUserId, Guid.NewGuid().ToString())
                .SetProperty(row => row.ResolvedByUserId, Guid.NewGuid().ToString())));
        var orphaned = Assert.Single(await List<EntrySuggestion>(w.Owner, entry));
        Assert.Equal(((string?)null, (string?)null, "Before I go"), (orphaned.ProposedByName, orphaned.ResolvedByName, orphaned.Proposed.Name));
    }

    // ---------- Lifecycle ----------

    [Fact]
    public async Task The_Trash_hides_a_targets_suggestions_and_a_restore_brings_them_back()
    {
        var w = await NewSharedWorld(_factory, "sg-trash");
        var (entry, _, scene) = Paths(w);
        var u = $"/api/universes/{w.U}";
        var onEntry = await Suggest<EntrySuggestion>(w.Reviewer, entry, Rename(w, "Binned", await CurrentVersion(w.Owner, entry)));
        var onScene = await Suggest<SceneSuggestion>(w.Reviewer, scene, new SceneRequest("Binned", null, null, null, null, null, w.Chapter, await CurrentVersion(w.Owner, scene)));

        await Ok(w.Editor.DeleteAsync(entry));
        await Ok(w.Editor.DeleteAsync(scene));

        await AssertHidden(await w.Owner.GetAsync($"{entry}/suggestions"), "trashed entry's suggestions");
        await AssertHidden(await w.Owner.GetAsync($"{scene}/suggestions"), "trashed scene's suggestions");
        await AssertHidden(await w.Owner.PostAsync(Accept(w, onEntry.Id), null), "accept in the Trash");
        await AssertHidden(await w.Owner.PostAsync(Reject(w, onScene.Id), null), "reject in the Trash");

        await Ok(w.Editor.PostAsync($"{u}/trash/{w.Entry}/restore", null));
        await Ok(w.Editor.PostAsync($"{u}/trash/scenes/{w.Scene}/restore", null));

        Assert.Equal(onEntry.Id, Assert.Single(await List<EntrySuggestion>(w.Owner, entry)).Id);
        Assert.Equal(SuggestionStatus.Accepted, (await Resolve<EntrySuggestion>(w.Owner, Accept(w, onEntry.Id))).Status);
        Assert.Equal("Binned", (await w.Owner.GetFromJsonAsync<EntityDetail>(entry))!.Name);
        Assert.Single(await List<SceneSuggestion>(w.Owner, scene));
    }

    [Fact]
    public async Task Erasing_content_or_the_universe_takes_its_suggestions_with_it()
    {
        var w = await NewSharedWorld(_factory, "sg-erase");
        var u = $"/api/universes/{w.U}";
        var story = await CreateStory(w.Owner, w.U, "Doomed book");
        var scene = await CreateScene(w.Owner, w.U, story, "Doomed scene");
        var entry = await CreateEntity(w.Owner, w.U, "Doomed entry");
        await Suggest<EntrySuggestion>(w.Reviewer, $"{u}/entities/{entry}", new EntityRequest(
            (await w.Owner.GetFromJsonAsync<EntityDetail>($"{u}/entities/{entry}"))!.EntityTypeId, "Doomed too", null, CanonStatus.Idea, null, null, null,
            await CurrentVersion(w.Owner, $"{u}/entities/{entry}")));
        await Suggest<StorySuggestion>(w.Reviewer, Story(w.U, story), new StoryRequest("Doomed too", null, StoryStatus.Planning, 1));
        await Suggest<SceneSuggestion>(w.Reviewer, $"{Story(w.U, story)}/scenes/{scene}", new SceneRequest("Doomed too", null, null, null, null, null, null, 1));
        var kept = await Suggest<EntrySuggestion>(w.Reviewer, $"{u}/entities/{w.Entry}", Rename(w, "Kept", await CurrentVersion(w.Owner, $"{u}/entities/{w.Entry}")));

        await Ok(w.Owner.DeleteAsync($"{u}/entities/{entry}"));
        await Ok(w.Owner.DeleteAsync($"{u}/trash/{entry}"));
        await Ok(w.Owner.DeleteAsync(Story(w.U, story)));
        await Ok(w.Owner.DeleteAsync($"{u}/trash/stories/{story}"));

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.SuggestedChanges.AnyAsync(row => row.EntityId == entry || row.StoryId == story || row.SceneId == scene));
            Assert.True(await db.SuggestedChanges.AnyAsync(row => row.Id == kept.Id));
        });

        await Ok(w.Owner.PostAsync($"{u}/archive", null));
        await Ok(w.Owner.DeleteAsync(u));
        await WithDb(_factory, async db => Assert.False(await db.SuggestedChanges.AnyAsync(row => row.Id == kept.Id)));
    }

    // ---------- Isolation ----------

    [Fact]
    public async Task A_suggestion_is_reached_only_through_its_own_universe()
    {
        var w = await NewSharedWorld(_factory, "sg-isolate");
        var (entry, _, scene) = Paths(w);
        var suggestion = await Suggest<EntrySuggestion>(w.Reviewer, entry, Rename(w, "Mine", await CurrentVersion(w.Owner, entry)));

        // The same owner's other universe: its address never reaches this one's suggestion, entry or scene.
        var elsewhere = (await CreateUniverse(w.Owner, "Elsewhere")).Id;
        var there = $"/api/universes/{elsewhere}";
        await AssertHidden(await w.Owner.PostAsync($"{there}/suggestions/{suggestion.Id}/accept", null), "accept from another universe");
        await AssertHidden(await w.Owner.PostAsync($"{there}/suggestions/{suggestion.Id}/reject", null), "reject from another universe");
        await AssertHidden(await w.Owner.GetAsync($"{there}/entities/{w.Entry}/suggestions"), "entry through another universe");
        await AssertHidden(await w.Owner.GetAsync($"{there}/stories/{w.Story}/scenes/{w.Scene}/suggestions"), "scene through another universe");
        await AssertHidden(await w.Owner.PostAsJsonAsync($"{there}/entities/{w.Entry}/suggestions", Rename(w, "Smuggled", 1)), "suggest through another universe");

        // A scene reached through a story it is not in, and guesses.
        var otherStory = await CreateStory(w.Owner, w.U, "Not its story");
        await AssertHidden(await w.Owner.GetAsync($"{Story(w.U, otherStory)}/scenes/{w.Scene}/suggestions"), "scene under another story");
        await AssertHidden(await w.Owner.PostAsync(Accept(w, Guid.NewGuid()), null), "guessed accept");
        await AssertHidden(await w.Owner.PostAsync(Reject(w, Guid.NewGuid()), null), "guessed reject");
        await AssertHidden(await w.Owner.GetAsync($"/api/universes/{w.U}/entities/{Guid.NewGuid()}/suggestions"), "guessed entry");

        // An outsider learns nothing about it at all.
        await AssertHidden(await w.Outsider.PostAsync(Accept(w, suggestion.Id), null), "outsider accept");
        await AssertHidden(await w.Outsider.GetAsync($"{scene}/suggestions"), "outsider list");

        Assert.Equal(SuggestionStatus.Open, Assert.Single(await List<EntrySuggestion>(w.Owner, entry)).Status);
        Assert.Equal("Ember Vale", (await w.Owner.GetFromJsonAsync<EntityDetail>(entry))!.Name);
    }

    [Fact]
    public async Task A_backup_carries_no_suggestions_and_restores_without_them()
    {
        var w = await NewSharedWorld(_factory, "sg-backup");
        var (entry, _, _) = Paths(w);
        var open = await Suggest<EntrySuggestion>(w.Reviewer, entry, Rename(w, "Secret proposal", await CurrentVersion(w.Owner, entry)));
        var decided = await Suggest<EntrySuggestion>(w.Reviewer, entry, Rename(w, "Another secret", await CurrentVersion(w.Owner, entry)));
        await Resolve<EntrySuggestion>(w.Editor, Reject(w, decided.Id));

        var archive = await RawArchive(w.Owner, w.U);
        var document = DocumentText(archive);
        foreach (var word in new[] { "Secret proposal", "Another secret", "suggest", open.Id.ToString(), w.ReviewerId, w.EditorId })
        {
            Assert.DoesNotContain(word, document, StringComparison.OrdinalIgnoreCase);
        }

        var restored = await RestoreTestClient.RestoreArchive(w.Owner, archive, "Suggestions restored");
        Guid restoredEntry = default;
        await WithDb(_factory, async db => restoredEntry = await db.Entities
            .Where(row => row.UniverseId == restored.Id && row.Name == "Ember Vale").Select(row => row.Id).SingleAsync());
        Assert.Empty(await List<EntrySuggestion>(w.Owner, $"/api/universes/{restored.Id}/entities/{restoredEntry}"));
    }

    // ---------- Helpers ----------

    private static (string Entry, string Story, string Scene) Paths(SharedWorld w) =>
        ($"/api/universes/{w.U}/entities/{w.Entry}", Story(w.U, w.Story), $"{Story(w.U, w.Story)}/scenes/{w.Scene}");

    private static string Accept(SharedWorld w, Guid id) => $"/api/universes/{w.U}/suggestions/{id}/accept";

    private static string Reject(SharedWorld w, Guid id) => $"/api/universes/{w.U}/suggestions/{id}/reject";

    private static EntityRequest Rename(SharedWorld w, string name, int version) =>
        new(w.CharacterType, name, "The heir.", CanonStatus.Canon, null, null, null, version);

    private static async Task<SuggestionResponse<T>> Suggest<T>(HttpClient client, string target, object body)
    {
        var response = await client.PostAsJsonAsync($"{target}/suggestions", body);
        Assert.True(response.StatusCode == HttpStatusCode.Created, $"{target}: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<SuggestionResponse<T>>())!;
    }

    private static async Task<SuggestionResponse<T>> Resolve<T>(HttpClient client, string path)
    {
        var response = await client.PostAsync(path, null);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{path}: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<SuggestionResponse<T>>())!;
    }

    private static async Task<List<SuggestionResponse<T>>> List<T>(HttpClient client, string target) =>
        (await client.GetFromJsonAsync<List<SuggestionResponse<T>>>($"{target}/suggestions"))!;

    private static async Task<List<EntityRevisionSummary>> EntryRevisions(HttpClient owner, string entry) =>
        (await owner.GetFromJsonAsync<List<EntityRevisionSummary>>($"{entry}/revisions"))!;

    private static async Task<Guid> AddField(HttpClient client, Guid universeId, Guid type, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{type}/fields",
            new FieldDefinitionRequest(name, EntityFieldKind.ShortText, false, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.Single(field => field.Name == name).Id;
    }

    /// <summary>What the three targets hold, read straight from the database: every field their forms edit, and their versions.</summary>
    private async Task<string> Targets(SharedWorld w)
    {
        var parts = new List<object?>();
        await WithDb(_factory, async db =>
        {
            var entry = await db.Entities.AsNoTracking()
                .Include(row => row.Aliases).Include(row => row.EntityTags).Include(row => row.FieldValues)
                .SingleAsync(row => row.Id == w.Entry);
            parts.AddRange([entry.Name, entry.Summary, entry.CanonStatus, entry.EntityTypeId, entry.Version, entry.UpdatedAt,
                entry.Aliases.Count, entry.EntityTags.Count, entry.FieldValues.Count]);
            var story = await db.Stories.AsNoTracking().SingleAsync(row => row.Id == w.Story);
            parts.AddRange([story.Title, story.Premise, story.Status, story.Version, story.UpdatedAt]);
            var scene = await db.Scenes.AsNoTracking().Include(row => row.EntityLinks).SingleAsync(row => row.Id == w.Scene);
            parts.AddRange([scene.Title, scene.Summary, scene.Notes, scene.PovEntityId, scene.ChapterId, scene.Version, scene.UpdatedAt,
                scene.EntityLinks.Count]);
        });
        return string.Join("|", parts);
    }

    private async Task<int> Revisions(SharedWorld w)
    {
        var count = 0;
        await WithDb(_factory, async db => count = await db.EntityRevisions.CountAsync(row => row.EntityId == w.Entry));
        return count;
    }

    private async Task<int> Count()
    {
        var count = 0;
        await WithDb(_factory, async db => count = await db.SuggestedChanges.CountAsync());
        return count;
    }
}
