using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.ArticleTestClient;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.VersionTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Concurrent edit protection (ADR 0043): every protected save names the version it was written over, and a save over a
/// version that is no longer current is refused whole, whoever made the newer one. Entries, articles, stories, scenes and
/// manuscripts alike.
/// </summary>
public sealed class ConcurrentEditTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    // ---------- One editor, one resource at a time ----------

    [Fact]
    public async Task An_entry_save_advances_its_version_once_and_a_stale_one_changes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ce-entry");
        var path = Entry(universe.Id, await CreateEntity(client, universe.Id, "Arlen"));
        var opened = await Read<EntityDetail>(client, path);
        Assert.Equal(1, opened.Version);

        var saved = await Saved<EntityDetail>(await client.PutAsJsonAsync(path, Edit(opened, "Arlen of the Marsh", 1)));
        Assert.Equal(2, saved.Version);

        // The same form, still open on version 1, is refused and nothing it sent is stored.
        await AssertChanged(await client.PutAsJsonAsync(path, Edit(opened, "Arlen the Stale", 1)), EntityEndpoints.ChangedCode, 2);
        var stored = await Read<EntityDetail>(client, path);
        Assert.Equal(("Arlen of the Marsh", 2), (stored.Name, stored.Version));
        await AssertRevisionCount(client, path, 2);

        // An unchanged save is accepted and leaves every other open form current.
        Assert.Equal(2, (await Saved<EntityDetail>(await client.PutAsJsonAsync(path, Edit(stored, stored.Name, 2)))).Version);
        await AssertRevisionCount(client, path, 2);

        // No version, or one ahead of the stored one, is never trusted.
        await AssertChanged(await client.PutAsJsonAsync(path, Edit(stored, "Unnamed", null)), EntityEndpoints.ChangedCode, 2);
        await AssertChanged(await client.PutAsJsonAsync(path, Edit(stored, "Ahead", 3)), EntityEndpoints.ChangedCode, 2);
        Assert.Equal("Arlen of the Marsh", (await Read<EntityDetail>(client, path)).Name);
    }

    [Fact]
    public async Task A_story_save_advances_its_version_once_and_a_stale_one_changes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ce-story");
        var path = Story(universe.Id, await CreateStory(client, universe.Id, "The Long Winter"));
        Assert.Equal(1, (await Read<StoryDetail>(client, path)).Version);

        var saved = await Saved<StoryDetail>(await client.PutAsJsonAsync(path, new StoryRequest("The Longer Winter", "A siege.", StoryStatus.Drafting, 1)));
        Assert.Equal(2, saved.Version);

        await AssertChanged(
            await client.PutAsJsonAsync(path, new StoryRequest("Stale", null, StoryStatus.Planning, 1)), StoryEndpoints.ChangedCode, 2);
        var stored = await Read<StoryDetail>(client, path);
        Assert.Equal(("The Longer Winter", "A siege.", StoryStatus.Drafting, 2), (stored.Title, stored.Premise, stored.Status, stored.Version));

        // Unchanged: accepted, version kept. No version: refused.
        Assert.Equal(2, (await Saved<StoryDetail>(await client.PutAsJsonAsync(path, new StoryRequest(" The Longer Winter ", "A siege.", StoryStatus.Drafting, 2)))).Version);
        await AssertChanged(await client.PutAsJsonAsync(path, new StoryRequest("Unnamed", null, StoryStatus.Planning)), StoryEndpoints.ChangedCode, 2);
    }

    [Fact]
    public async Task A_scene_save_advances_its_version_once_and_a_stale_one_changes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ce-scene");
        var story = await CreateStory(client, universe.Id, "Drafted");
        var path = Scene(universe.Id, story, await CreateScene(client, universe.Id, story, "The Council"));
        Assert.Equal(1, (await Read<SceneResponse>(client, path)).Version);

        var saved = await Saved<SceneResponse>(await client.PutAsJsonAsync(path, SceneEdit("The Council Breaks", "Voices rise.", 1)));
        Assert.Equal(2, saved.Version);

        await AssertChanged(await client.PutAsJsonAsync(path, SceneEdit("Stale", null, 1)), SceneEndpoints.ChangedCode, 2);
        var stored = await Read<SceneResponse>(client, path);
        Assert.Equal(("The Council Breaks", "Voices rise.", 2), (stored.Title, stored.Summary, stored.Version));

        Assert.Equal(2, (await Saved<SceneResponse>(await client.PutAsJsonAsync(path, SceneEdit("The Council Breaks", "Voices rise.", 2)))).Version);
        await AssertChanged(await client.PutAsJsonAsync(path, SceneEdit("Unnamed", null, null)), SceneEndpoints.ChangedCode, 2);
    }

    [Fact]
    public async Task A_scene_moved_to_another_chapter_invalidates_an_open_form_and_a_reorder_does_not()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ce-move");
        var story = await CreateStory(client, universe.Id, "Moves");
        var first = await CreateChapter(client, universe.Id, story, "One");
        var second = await CreateChapter(client, universe.Id, story, "Two");
        var scene = await CreateScene(client, universe.Id, story, "Wanderer", first);
        await CreateScene(client, universe.Id, story, "Neighbour", first);
        var path = Scene(universe.Id, story, scene);

        // A reorder inside its chapter changes nothing the form shows.
        (await client.PutAsJsonAsync($"{path}/position", new ScenePositionRequest(first, 1))).EnsureSuccessStatusCode();
        Assert.Equal(1, (await Read<SceneResponse>(client, path)).Version);

        // Moved to another chapter: the chapter on an open form is out of date, so its save is refused rather than
        // quietly moving the scene back.
        (await client.PutAsJsonAsync($"{path}/position", new ScenePositionRequest(second, 0))).EnsureSuccessStatusCode();
        Assert.Equal(2, (await Read<SceneResponse>(client, path)).Version);
        await AssertChanged(await client.PutAsJsonAsync(path, SceneEdit("Wanderer", null, 1, first)), SceneEndpoints.ChangedCode, 2);
        Assert.Equal(second, (await Read<SceneResponse>(client, path)).ChapterId);

        // A save that moves it counts once, not once for the form and again for the placement.
        Assert.Equal(3, (await Saved<SceneResponse>(await client.PutAsJsonAsync(path, SceneEdit("Wanderer", "Home again.", 2, first)))).Version);

        // A chapter sent to the Trash takes its scenes to Unchaptered: their forms are out of date too.
        (await client.DeleteAsync($"{Story(universe.Id, story)}/chapters/{first}")).EnsureSuccessStatusCode();
        var unchaptered = await Read<SceneResponse>(client, path);
        Assert.Equal((null, 4), (unchaptered.ChapterId, unchaptered.Version));
    }

    [Fact]
    public async Task Article_and_manuscript_saves_advance_their_own_version_and_not_the_entry_or_scene()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ce-prose");
        var entity = await CreateEntity(client, universe.Id, "Warden");
        var story = await CreateStory(client, universe.Id, "Prose");
        var scene = await CreateScene(client, universe.Id, story, "Gate");

        Assert.Equal(0, (await ReadArticle(client, universe.Id, entity)).Version);
        Assert.Equal(1, (await WriteArticle(client, universe.Id, entity, Doc("One."))).Version);
        Assert.Equal(2, (await WriteArticle(client, universe.Id, entity, Doc("Two."))).Version);
        Assert.Equal(1, (await Read<EntityDetail>(client, Entry(universe.Id, entity))).Version);

        Assert.Equal(0, (await ReadManuscript(client, universe.Id, story, scene)).Version);
        Assert.Equal(1, (await WriteManuscript(client, universe.Id, story, scene, "She walked.")).Version);
        Assert.Equal(2, (await WriteManuscript(client, universe.Id, story, scene, "She ran.")).Version);
        Assert.Equal(1, (await Read<SceneResponse>(client, Scene(universe.Id, story, scene))).Version);
        Assert.Equal(1, (await Read<StoryDetail>(client, Story(universe.Id, story))).Version);
    }

    // ---------- Collaborators ----------

    [Fact]
    public async Task Owner_and_editor_conflict_both_ways_on_every_protected_resource_and_history_keeps_only_saved_writes()
    {
        var w = await NewSharedWorld(_factory, "ce-collab");
        var entry = Entry(w.U, w.Entry);
        var story = Story(w.U, w.Story);
        var scene = Scene(w.U, w.Story, w.Scene);

        // Entry: both open the same version, the owner saves first, the editor's save is refused.
        var both = await Read<EntityDetail>(w.Owner, entry);
        var revisions = (await Revisions(w.Owner, entry)).Count;
        await Saved<EntityDetail>(await w.Owner.PutAsJsonAsync(entry, Edit(both, "Ember Vale, Regent", both.Version)));
        await AssertChanged(await w.Editor.PutAsJsonAsync(entry, Edit(both, "Ember Vale, Exile", both.Version)), EntityEndpoints.ChangedCode, both.Version + 1);

        // And the other way round: the editor saves first, the owner's stale save is refused. No owner bypass.
        var again = await Read<EntityDetail>(w.Editor, entry);
        await Saved<EntityDetail>(await w.Editor.PutAsJsonAsync(entry, Edit(again, "Ember Vale, Exile", again.Version)));
        await AssertChanged(await w.Owner.PutAsJsonAsync(entry, Edit(again, "Ember Vale, Queen", again.Version)), EntityEndpoints.ChangedCode, again.Version + 1);

        // History holds the two saves that landed, each with its author, and nothing of the refused ones.
        var history = await Revisions(w.Owner, entry);
        Assert.Equal(revisions + 2, history.Count);
        Assert.Equal(["Ember Vale, Exile", "Ember Vale, Regent"], history.Take(2).Select(version => version.Name));
        Assert.Equal(["user-ce-collab-editor", "user-ce-collab-owner"], history.Take(2).Select(version => version.ActorName));
        Assert.DoesNotContain(history, version => version.Name is "Ember Vale, Queen");

        // Article: the same both ways.
        var article = await ReadArticle(w.Editor, w.U, w.Entry);
        (await PutArticle(w.Editor, w.U, w.Entry, Doc("The editor's words."), article.Version)).EnsureSuccessStatusCode();
        var (articleCode, _, articleNow) = await ArticleRefusal(await PutArticle(w.Owner, w.U, w.Entry, Doc("The owner's words."), article.Version));
        Assert.Equal((EntityArticleEndpoints.ChangedCode, article.Version + 1), (articleCode, articleNow));
        Assert.Equal(Doc("The editor's words."), (await ReadArticle(w.Owner, w.U, w.Entry)).Content);

        // Story and scene.
        var storyOpened = await Read<StoryDetail>(w.Owner, story);
        await Saved<StoryDetail>(await w.Editor.PutAsJsonAsync(story, new StoryRequest("The drowned heir, revised", null, StoryStatus.Drafting, storyOpened.Version)));
        await AssertChanged(await w.Owner.PutAsJsonAsync(story, new StoryRequest("Owner's title", null, StoryStatus.Planning, storyOpened.Version)), StoryEndpoints.ChangedCode, storyOpened.Version + 1);

        var sceneOpened = await Read<SceneResponse>(w.Editor, scene);
        await Saved<SceneResponse>(await w.Owner.PutAsJsonAsync(scene, SceneEdit("The causeway at dusk", null, sceneOpened.Version, w.Chapter)));
        await AssertChanged(await w.Editor.PutAsJsonAsync(scene, SceneEdit("The causeway at dawn", null, sceneOpened.Version, w.Chapter)), SceneEndpoints.ChangedCode, sceneOpened.Version + 1);
        Assert.Equal("The causeway at dusk", (await Read<SceneResponse>(w.Editor, scene)).Title);

        // Manuscript: the editor's stale prose is refused and the history has no version of it.
        var prose = await ReadManuscript(w.Owner, w.U, w.Story, w.Scene);
        var proseVersions = (await ManuscriptRevisions(w.Owner, w)).Count;
        (await PutManuscript(w.Owner, w.U, w.Story, w.Scene, "She waded.", prose.Version)).EnsureSuccessStatusCode();
        var (proseCode, _, proseNow) = await Refusal(await PutManuscript(w.Editor, w.U, w.Story, w.Scene, "She flew.", prose.Version));
        Assert.Equal((SceneManuscriptEndpoints.ChangedCode, prose.Version + 1), (proseCode, proseNow));
        Assert.Equal(proseVersions + 1, (await ManuscriptRevisions(w.Owner, w)).Count);
        Assert.Equal("She waded.", (await ReadManuscript(w.Editor, w.U, w.Story, w.Scene)).Content);
    }

    [Fact]
    public async Task A_refused_editor_reads_the_latest_retries_from_it_and_is_refused_again_after_another_save()
    {
        var w = await NewSharedWorld(_factory, "ce-retry");
        var entry = Entry(w.U, w.Entry);

        // A and B open version N. A saves: N + 1. B is refused.
        var opened = await Read<EntityDetail>(w.Editor, entry);
        await Saved<EntityDetail>(await w.Owner.PutAsJsonAsync(entry, Edit(opened, "A's name", opened.Version)));
        await AssertChanged(await w.Editor.PutAsJsonAsync(entry, Edit(opened, "B's name", opened.Version)), EntityEndpoints.ChangedCode, opened.Version + 1);

        // B reads the latest, keeps their own words and adopts its version. C saves first: N + 2. B's retry is refused again.
        var reviewed = await Read<EntityDetail>(w.Editor, entry);
        Assert.Equal(("A's name", opened.Version + 1), (reviewed.Name, reviewed.Version));
        await Saved<EntityDetail>(await w.Owner.PutAsJsonAsync(entry, Edit(reviewed, "C's name", reviewed.Version)));
        await AssertChanged(await w.Editor.PutAsJsonAsync(entry, Edit(reviewed, "B's name", reviewed.Version)), EntityEndpoints.ChangedCode, opened.Version + 2);

        // Reviewed again, B's retry lands.
        var latest = await Read<EntityDetail>(w.Editor, entry);
        var landed = await Saved<EntityDetail>(await w.Editor.PutAsJsonAsync(entry, Edit(latest, "B's name", latest.Version)));
        Assert.Equal(("B's name", opened.Version + 3), (landed.Name, landed.Version));

        // The same for prose.
        var prose = await ReadManuscript(w.Editor, w.U, w.Story, w.Scene);
        (await PutManuscript(w.Owner, w.U, w.Story, w.Scene, "A wrote.", prose.Version)).EnsureSuccessStatusCode();
        await Refusal(await PutManuscript(w.Editor, w.U, w.Story, w.Scene, "B wrote.", prose.Version));
        var proseReviewed = await ReadManuscript(w.Editor, w.U, w.Story, w.Scene);
        (await PutManuscript(w.Owner, w.U, w.Story, w.Scene, "C wrote.", proseReviewed.Version)).EnsureSuccessStatusCode();
        await Refusal(await PutManuscript(w.Editor, w.U, w.Story, w.Scene, "B wrote.", proseReviewed.Version));
        var proseLatest = await ReadManuscript(w.Editor, w.U, w.Story, w.Scene);
        (await PutManuscript(w.Editor, w.U, w.Story, w.Scene, "B wrote.", proseLatest.Version)).EnsureSuccessStatusCode();
        Assert.Equal("B wrote.", (await ReadManuscript(w.Owner, w.U, w.Story, w.Scene)).Content);
    }

    // ---------- History restore ----------

    [Fact]
    public async Task A_history_restore_advances_the_version_and_refuses_an_editor_holding_the_one_before()
    {
        var w = await NewSharedWorld(_factory, "ce-restore");
        var entry = Entry(w.U, w.Entry);

        // A holds version N; B restores an old version, which becomes N + 1, never the old one's number.
        var held = await Read<EntityDetail>(w.Editor, entry);
        var restored = await Saved<EntityDetail>(await w.Owner.PostAsJsonAsync(
            $"{entry}/revisions/{w.EntryRevision}/restore", new EntityRevisionRestoreRequest(held.Version)));
        Assert.Equal(held.Version + 1, restored.Version);
        Assert.Equal("Ember Vale", restored.Name);
        Assert.Equal(EntityRevisionKind.Restored, (await Revisions(w.Owner, entry))[0].Kind);

        await AssertChanged(await w.Editor.PutAsJsonAsync(entry, Edit(held, "A's edit", held.Version)), EntityEndpoints.ChangedCode, held.Version + 1);

        // A restore chosen over a version that is no longer current, or naming none, is refused like a save.
        await AssertChanged(await w.Owner.PostAsJsonAsync(
            $"{entry}/revisions/{w.EntryRevision}/restore", new EntityRevisionRestoreRequest(held.Version)), EntityEndpoints.ChangedCode, held.Version + 1);
        await AssertChanged(await w.Owner.PostAsync($"{entry}/revisions/{w.EntryRevision}/restore", null), EntityEndpoints.ChangedCode, held.Version + 1);

        // Article and manuscript restores move their own versions on the same way.
        var article = await ReadArticle(w.Editor, w.U, w.Entry);
        var articleRestored = await Saved<EntityArticleResponse>(await RestoreArticle(w.Owner, w.U, w.Entry, w.ArticleRevision, article.Version));
        Assert.Equal(article.Version + 1, articleRestored.Version);
        await ArticleRefusal(await PutArticle(w.Editor, w.U, w.Entry, Doc("Over the restore."), article.Version));

        var prose = await ReadManuscript(w.Editor, w.U, w.Story, w.Scene);
        var proseRestored = await Saved<SceneManuscriptResponse>(await w.Owner.PostAsJsonAsync(
            $"{Manuscript(w.U, w.Story, w.Scene)}/revisions/{w.ManuscriptRevision}/restore", new SceneManuscriptRestoreRequest(prose.Version)));
        Assert.Equal(prose.Version + 1, proseRestored.Version);
        await Refusal(await PutManuscript(w.Editor, w.U, w.Story, w.Scene, "Over the restore.", prose.Version));
    }

    // ---------- The Trash ----------

    [Fact]
    public async Task A_save_to_trashed_content_is_missing_and_a_restore_does_not_revive_a_form_older_than_its_last_save()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ce-trash");
        var path = Entry(universe.Id, await CreateEntity(client, universe.Id, "Drifter"));
        var opened = await Read<EntityDetail>(client, path);

        // Changed, then trashed: an open form's save is missing while it is there, whatever version it names.
        var changed = await Saved<EntityDetail>(await client.PutAsJsonAsync(path, Edit(opened, "Drifter of the Shoals", opened.Version)));
        (await client.DeleteAsync(path)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync(path, Edit(opened, "Into the Trash", changed.Version))).StatusCode);

        // Restored as it was: the version is kept, so the form opened before that last save is still refused, and one
        // opened on it still saves.
        (await client.PostAsync($"/api/universes/{universe.Id}/trash/{changed.Id}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(changed.Version, (await Read<EntityDetail>(client, path)).Version);
        await AssertChanged(await client.PutAsJsonAsync(path, Edit(opened, "Stale", opened.Version)), EntityEndpoints.ChangedCode, changed.Version);
        Assert.Equal(changed.Version + 1, (await Saved<EntityDetail>(await client.PutAsJsonAsync(path, Edit(changed, "Current", changed.Version)))).Version);

        // A scene back from the Trash without its chapter is out of date on any form that still names that chapter.
        var story = await CreateStory(client, universe.Id, "Trash");
        var chapter = await CreateChapter(client, universe.Id, story, "Gone");
        var scene = await CreateScene(client, universe.Id, story, "Orphan", chapter);
        var scenePath = Scene(universe.Id, story, scene);
        (await client.DeleteAsync(scenePath)).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"{Story(universe.Id, story)}/chapters/{chapter}")).EnsureSuccessStatusCode();
        (await client.PostAsync($"/api/universes/{universe.Id}/trash/scenes/{scene}/restore", null)).EnsureSuccessStatusCode();
        var back = await Read<SceneResponse>(client, scenePath);
        Assert.Equal((null, 2), (back.ChapterId, back.Version));
        await AssertChanged(await client.PutAsJsonAsync(scenePath, SceneEdit("Orphan", null, 1, chapter)), SceneEndpoints.ChangedCode, 2);
    }

    // ---------- Who may ----------

    [Fact]
    public async Task Versions_grant_no_edit_and_reveal_nothing_across_universes()
    {
        var w = await NewSharedWorld(_factory, "ce-access");
        var entry = Entry(w.U, w.Entry);
        var current = await Read<EntityDetail>(w.Owner, entry);
        var story = Story(w.U, w.Story);
        var storyVersion = (await Read<StoryDetail>(w.Owner, story)).Version;

        // A Reviewer or Viewer naming the current version is still refused: a version is no capability.
        foreach (var who in new[] { w.Reviewer, w.Viewer })
        {
            await AssertDenied(await who.PutAsJsonAsync(entry, Edit(current, "Taken", current.Version)), "entry save");
            await AssertDenied(await who.PutAsJsonAsync(entry, Edit(current, "Taken", current.Version - 1)), "stale entry save");
            await AssertDenied(await who.PutAsJsonAsync(story, new StoryRequest("Taken", null, StoryStatus.Planning, storyVersion)), "story save");
            await AssertDenied(await PutArticle(who, w.U, w.Entry, Doc("Taken."), 0), "stale article save");
        }

        // An outsider, a guessed id and another universe's id are all the same 404, current version or stale: no 409 and
        // no current version to learn from.
        var (stranger, theirs) = await SignedInWithUniverse(_factory, "ce-stranger");
        foreach (var version in new int?[] { current.Version, current.Version - 1, 999, null })
        {
            await AssertHidden(await w.Outsider.PutAsJsonAsync(entry, Edit(current, "Taken", version)), "outsider entry save");
            await AssertHidden(await stranger.PutAsJsonAsync(Entry(theirs.Id, w.Entry), Edit(current, "Taken", version)), "foreign entry id");
            await AssertHidden(await w.Editor.PutAsJsonAsync(Entry(w.U, Guid.NewGuid()), Edit(current, "Taken", version)), "guessed entry id");
            await AssertHidden(await w.Editor.PutAsJsonAsync(Scene(w.U, w.Trash.Story, w.Scene), SceneEdit("Taken", null, version)), "scene through another story");
        }

        Assert.Equal(current.Version, (await Read<EntityDetail>(w.Owner, entry)).Version);
        Assert.Equal(current.Name, (await Read<EntityDetail>(w.Owner, entry)).Name);
    }

    [Fact]
    public async Task A_refusal_carries_its_code_and_current_version_and_none_of_the_content()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ce-body");
        var path = Entry(universe.Id, await CreateEntity(client, universe.Id, "Secretkeeper"));
        var opened = await Read<EntityDetail>(client, path);
        await Saved<EntityDetail>(await client.PutAsJsonAsync(path, Edit(opened, "The hidden name", 1)));

        var refused = await client.PutAsJsonAsync(path, Edit(opened, "Mine", 1));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var body = await refused.Content.ReadAsStringAsync();
        Assert.DoesNotContain("hidden name", body, StringComparison.OrdinalIgnoreCase);
        using var document = JsonDocument.Parse(body);
        Assert.Equal(
            ["code", "currentVersion", "detail", "status", "title", "type"],
            document.RootElement.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal));
    }

    // ---------- A restored backup ----------

    [Fact]
    public async Task A_restored_backup_starts_every_version_afresh()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ce-backup");
        var entity = await CreateEntity(client, universe.Id, "Archivist");
        var path = Entry(universe.Id, entity);
        var opened = await Read<EntityDetail>(client, path);
        await client.PutVersionedAsync(path, Edit(opened, "Archivist, twice", null));
        await client.PutVersionedAsync(path, Edit(opened, "Archivist, thrice", null));
        await WriteArticle(client, universe.Id, entity, Doc("One."));
        await WriteArticle(client, universe.Id, entity, Doc("Two."));
        Assert.Equal(3, (await Read<EntityDetail>(client, path)).Version);

        // A backup is the universe's content, not anyone's open form: no version leaves in it.
        Assert.DoesNotContain("\"version\"", PayloadText(DocumentText(await RawArchive(client, universe.Id))), StringComparison.OrdinalIgnoreCase);

        var restored = (await RestoreTestClient.RestoreArchive(client, await RawArchive(client, universe.Id), "Archivist restored")).Id;
        await WithDb(_factory, async db =>
        {
            Assert.All(await db.Entities.Where(row => row.UniverseId == restored).Select(row => row.Version).ToListAsync(), version => Assert.Equal(1, version));
            Assert.All(await db.EntityArticles.Where(row => row.Entity!.UniverseId == restored).Select(row => row.Version).ToListAsync(), version => Assert.Equal(1, version));
        });
    }

    // ---------- Helpers ----------

    private static string Entry(Guid universeId, Guid entityId) => $"/api/universes/{universeId}/entities/{entityId}";

    private static string Scene(Guid universeId, Guid storyId, Guid sceneId) => $"{Story(universeId, storyId)}/scenes/{sceneId}";

    private static EntityRequest Edit(EntityDetail detail, string name, int? expectedVersion) =>
        new(detail.EntityTypeId, name, detail.Summary, detail.CanonStatus, detail.Aliases, detail.Tags, null, expectedVersion);

    private static SceneRequest SceneEdit(string title, string? summary, int? expectedVersion, Guid? chapterId = null) =>
        new(title, summary, null, null, null, null, chapterId, expectedVersion);

    private static async Task<T> Read<T>(HttpClient client, string path) => (await client.GetFromJsonAsync<T>(path))!;

    private static async Task<T> Saved<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"Expected success, got {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task AssertChanged(HttpResponseMessage response, string code, int currentVersion)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(code, document.RootElement.GetProperty("code").GetString());
        Assert.Equal(currentVersion, document.RootElement.GetProperty("currentVersion").GetInt32());
    }

    private static async Task<List<EntityRevisionSummary>> Revisions(HttpClient client, string entityPath) =>
        (await client.GetFromJsonAsync<List<EntityRevisionSummary>>($"{entityPath}/revisions"))!;

    private static async Task AssertRevisionCount(HttpClient client, string entityPath, int count) =>
        Assert.Equal(count, (await Revisions(client, entityPath)).Count);

    private static async Task<List<SceneManuscriptRevisionSummary>> ManuscriptRevisions(HttpClient client, SharedWorld w) =>
        (await client.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>($"{Manuscript(w.U, w.Story, w.Scene)}/revisions"))!;
}
