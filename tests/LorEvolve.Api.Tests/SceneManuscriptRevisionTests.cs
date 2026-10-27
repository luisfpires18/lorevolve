using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.ManuscriptTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A manuscript's saved versions (ADR 0029).
///
/// The invariants under test: every save that changes the prose records the whole text as the next version, and a save that
/// changes nothing records nothing and moves nothing; the history lists without text and each version reads back exactly;
/// putting a version back records it again as the newest and rewrites nothing on record; a restore over prose that has
/// moved on since is refused like any stale save; and a history is reachable only through a live scene of the owner's story.
/// </summary>
public sealed class SceneManuscriptRevisionTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Each_save_that_changes_the_prose_records_the_whole_text_as_the_next_version()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msvsaves");
        var story = await CreateStory(client, universe.Id, "Versions");
        var scene = await CreateScene(client, universe.Id, story, "The Council");

        Assert.Empty(await History(client, universe.Id, story, scene));

        await WriteManuscript(client, universe.Id, story, scene, "A first draft.");
        await WriteManuscript(client, universe.Id, story, scene, Prose);
        await WriteManuscript(client, universe.Id, story, scene, string.Empty);

        // Newest first: the emptied manuscript, the full prose, the first draft.
        var history = await History(client, universe.Id, story, scene);
        Assert.Equal([3, 2, 1], history.Select(version => version.Number));
        Assert.Equal(
            [SceneManuscriptRevisionKind.Edited, SceneManuscriptRevisionKind.Edited, SceneManuscriptRevisionKind.Created],
            history.Select(version => version.Kind));
        Assert.Equal([true, false, false], history.Select(version => version.IsEmpty));
        Assert.All(history, version => Assert.Null(version.RestoredFromRevisionId));
        Assert.True(history[0].CreatedAt >= history[1].CreatedAt && history[1].CreatedAt >= history[2].CreatedAt);

        // The list is one small response: no version's text is in it.
        var listed = await client.GetStringAsync(Revisions(universe.Id, story, scene));
        Assert.DoesNotContain("A first draft.", listed, StringComparison.Ordinal);
        Assert.DoesNotContain("The hall had emptied", listed, StringComparison.Ordinal);

        // Each version, whole and exact - every line break and character.
        Assert.Equal("A first draft.", (await Version(client, universe.Id, story, scene, history[2].Id)).Content);
        Assert.Equal(Prose, (await Version(client, universe.Id, story, scene, history[1].Id)).Content, StringComparer.Ordinal);
        Assert.Equal(string.Empty, (await Version(client, universe.Id, story, scene, history[0].Id)).Content);

        await WithDb(_factory, async db =>
            Assert.Equal(3, await db.SceneManuscriptRevisions.CountAsync(version => version.SceneId == scene)));
    }

    [Fact]
    public async Task A_save_that_changes_nothing_records_no_version_and_moves_no_timestamp()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msvnoop");
        var story = await CreateStory(client, universe.Id, "Unchanged");
        var scene = await CreateScene(client, universe.Id, story, "The Council");

        // Nothing written and nothing sent: no row, no version, and the answer still says nothing was saved.
        var nothing = await PutManuscript(client, universe.Id, story, scene, string.Empty, 0);
        Assert.Equal(HttpStatusCode.OK, nothing.StatusCode);
        Assert.Equal(
            new SceneManuscriptResponse(scene, string.Empty, null, 0),
            await nothing.Content.ReadFromJsonAsync<SceneManuscriptResponse>());

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.SceneManuscripts.AnyAsync(row => row.SceneId == scene));
            Assert.False(await db.SceneManuscriptRevisions.AnyAsync(row => row.SceneId == scene));
        });

        var saved = await WriteManuscript(client, universe.Id, story, scene, "Once.");
        var storyBefore = await ReadStory(client, universe.Id, story);

        // The same text again: answered with the save that stands, and nothing recorded or touched.
        var again = await PutManuscript(client, universe.Id, story, scene, "Once.", saved.Version);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        SameMoment(saved.UpdatedAt, (await again.Content.ReadFromJsonAsync<SceneManuscriptResponse>())!.UpdatedAt);
        SameMoment(saved.UpdatedAt, (await ReadManuscript(client, universe.Id, story, scene)).UpdatedAt);
        Assert.Single(await History(client, universe.Id, story, scene));
        Assert.Equal(storyBefore.UpdatedAt, (await ReadStory(client, universe.Id, story)).UpdatedAt);

        // Still held to the stale check: an unchanged text written over an older save is refused, not answered as saved.
        var stale = await PutManuscript(client, universe.Id, story, scene, "Once.", null);
        Assert.Equal(SceneManuscriptEndpoints.ChangedCode, (await Refusal(stale)).Code);
    }

    [Fact]
    public async Task Putting_a_version_back_records_it_as_the_newest_and_rewrites_nothing_on_record()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msvrestore");
        var story = await CreateStory(client, universe.Id, "Second thoughts");
        var scene = await CreateScene(client, universe.Id, story, "The Council");

        await WriteManuscript(client, universe.Id, story, scene, Prose);
        await WriteManuscript(client, universe.Id, story, scene, "A cruder second pass.");
        await WriteManuscript(client, universe.Id, story, scene, "A third.");

        var history = await History(client, universe.Id, story, scene);
        var first = history[2];
        var current = await ReadManuscript(client, universe.Id, story, scene);
        var storyBefore = await ReadStory(client, universe.Id, story);

        var response = await Restore(client, universe.Id, story, scene, first.Id, current.Version);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var restored = (await response.Content.ReadFromJsonAsync<SceneManuscriptResponse>())!;

        // The prose is the first version again, every character of it, and the story was worked on.
        Assert.Equal(Prose, restored.Content, StringComparer.Ordinal);
        Assert.Equal(Prose, (await ReadManuscript(client, universe.Id, story, scene)).Content, StringComparer.Ordinal);
        Assert.True((await ReadStory(client, universe.Id, story)).UpdatedAt > storyBefore.UpdatedAt);

        // Recorded as the fourth version, naming where it came from; the three before it are exactly as they were.
        var after = await History(client, universe.Id, story, scene);
        Assert.Equal([4, 3, 2, 1], after.Select(version => version.Number));
        Assert.Equal(SceneManuscriptRevisionKind.Restored, after[0].Kind);
        Assert.Equal(first.Id, after[0].RestoredFromRevisionId);
        Assert.Equal(
            history.Select(version => (version.Id, version.Number, version.Kind, version.CreatedAt)),
            after.Skip(1).Select(version => (version.Id, version.Number, version.Kind, version.CreatedAt)));
        Assert.Equal("A third.", (await Version(client, universe.Id, story, scene, history[0].Id)).Content);

        // Putting back what already stands writes nothing at all.
        var latest = await ReadManuscript(client, universe.Id, story, scene);
        var same = await Restore(client, universe.Id, story, scene, first.Id, latest.Version);
        Assert.Equal(HttpStatusCode.OK, same.StatusCode);
        SameMoment(latest.UpdatedAt, (await same.Content.ReadFromJsonAsync<SceneManuscriptResponse>())!.UpdatedAt);
        Assert.Equal(4, (await History(client, universe.Id, story, scene)).Count);
    }

    [Fact]
    public async Task A_restore_over_prose_that_has_moved_on_is_refused_and_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msvstale");
        var story = await CreateStory(client, universe.Id, "Two windows");
        var scene = await CreateScene(client, universe.Id, story, "The Council");

        await WriteManuscript(client, universe.Id, story, scene, "Mine.");
        var opened = await ReadManuscript(client, universe.Id, story, scene);

        // Another window saves after this one read the manuscript and its history.
        await WriteManuscript(client, universe.Id, story, scene, "Theirs.");
        var history = await History(client, universe.Id, story, scene);

        var refused = await Restore(client, universe.Id, story, scene, history[1].Id, opened.Version);
        var (code, stored, _) = await Refusal(refused);
        Assert.Equal(SceneManuscriptEndpoints.ChangedCode, code);

        var kept = await ReadManuscript(client, universe.Id, story, scene);
        SameMoment(kept.UpdatedAt, stored);
        Assert.Equal("Theirs.", kept.Content);
        Assert.Equal(2, (await History(client, universe.Id, story, scene)).Count);

        // A restore that names no save at all is just as stale.
        Assert.Equal(
            SceneManuscriptEndpoints.ChangedCode,
            (await Refusal(await Restore(client, universe.Id, story, scene, history[1].Id, null))).Code);

        // Having seen the newer text, naming it is a deliberate restore.
        var chosen = await Restore(client, universe.Id, story, scene, history[1].Id, kept.Version);
        Assert.Equal(HttpStatusCode.OK, chosen.StatusCode);
        Assert.Equal("Mine.", (await ReadManuscript(client, universe.Id, story, scene)).Content);
    }

    [Fact]
    public async Task A_history_is_reached_only_through_a_live_scene_of_the_owners_story()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "msvmine");
        var elsewhere = await CreateUniverse(owner, "World msvmine two");
        var story = await CreateStory(owner, universe.Id, "Private");
        var sibling = await CreateStory(owner, universe.Id, "Sibling");
        var scene = await CreateScene(owner, universe.Id, story, "The Council");
        var neighbour = await CreateScene(owner, universe.Id, story, "The Gates");

        await WriteManuscript(owner, universe.Id, story, scene, "Only mine.");
        await WriteManuscript(owner, universe.Id, story, neighbour, "Next door.");
        var version = Assert.Single(await History(owner, universe.Id, story, scene));
        var neighbourVersion = Assert.Single(await History(owner, universe.Id, story, neighbour));
        var saved = await ReadManuscript(owner, universe.Id, story, scene);

        var stranger = await SignedIn(_factory, "user-msvyours");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Revisions(universe.Id, story, scene))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.GetAsync($"{Revisions(universe.Id, story, scene)}/{version.Id}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Restore(stranger, universe.Id, story, scene, version.Id, saved.Version)).StatusCode);

        // Not even the shape of a refusal: a stranger's malformed body is the same 404.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.PostAsync($"{Revisions(universe.Id, story, scene)}/{version.Id}/restore", JsonContent.Create(new { }))).StatusCode);

        // The owner's own ids, put together wrongly, answer as missing too.
        foreach (var (universeId, storyId, sceneId, revisionId) in new[]
        {
            (universe.Id, sibling, scene, version.Id),
            (elsewhere.Id, story, scene, version.Id),
            (universe.Id, story, scene, neighbourVersion.Id),
            (universe.Id, story, scene, Guid.NewGuid()),
        })
        {
            Assert.Equal(
                HttpStatusCode.NotFound,
                (await owner.GetAsync($"{Revisions(universeId, storyId, sceneId)}/{revisionId}")).StatusCode);
            Assert.Equal(
                HttpStatusCode.NotFound,
                (await Restore(owner, universeId, storyId, sceneId, revisionId, saved.Version)).StatusCode);
        }

        Assert.Equal("Only mine.", (await ReadManuscript(owner, universe.Id, story, scene)).Content);
        Assert.Single(await History(owner, universe.Id, story, scene));
    }

    [Fact]
    public async Task A_scene_in_the_trash_keeps_its_history_out_of_reach_until_it_comes_back()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msvtrash");
        var story = await CreateStory(client, universe.Id, "Cut and kept");
        var scene = await CreateScene(client, universe.Id, story, "The Council");

        await WriteManuscript(client, universe.Id, story, scene, "Draft.");
        await WriteManuscript(client, universe.Id, story, scene, Prose);
        var history = await History(client, universe.Id, story, scene);
        var saved = await ReadManuscript(client, universe.Id, story, scene);

        (await client.DeleteAsync($"{Story(universe.Id, story)}/scenes/{scene}")).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Revisions(universe.Id, story, scene))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"{Revisions(universe.Id, story, scene)}/{history[1].Id}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Restore(client, universe.Id, story, scene, history[1].Id, saved.Version)).StatusCode);

        (await client.PostAsync($"/api/universes/{universe.Id}/trash/scenes/{scene}/restore", content: null))
            .EnsureSuccessStatusCode();

        var back = await History(client, universe.Id, story, scene);
        Assert.Equal(history.Select(version => (version.Id, version.Number)), back.Select(version => (version.Id, version.Number)));
        Assert.Equal(Prose, (await ReadManuscript(client, universe.Id, story, scene)).Content, StringComparer.Ordinal);
        SameMoment(saved.UpdatedAt, (await ReadManuscript(client, universe.Id, story, scene)).UpdatedAt);
    }

    [Fact]
    public async Task An_old_version_is_carried_by_no_other_read_and_found_by_no_search()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msvnowhere");
        var story = await CreateStory(client, universe.Id, "Quiet");
        var scene = await CreateScene(client, universe.Id, story, "The Council");

        const string marker = "Zyqvorth";
        await WriteManuscript(client, universe.Id, story, scene, $"{marker} walked the hall.");
        await WriteManuscript(client, universe.Id, story, scene, "Someone walked the hall.");

        foreach (var path in new[]
        {
            Stories(universe.Id),
            Story(universe.Id, story),
            $"{Story(universe.Id, story)}/scenes",
            $"{Story(universe.Id, story)}/scenes/{scene}",
            Arcs(universe.Id, story),
            Manuscript(universe.Id, story, scene),
            $"/api/universes/{universe.Id}/trash",
        })
        {
            Assert.DoesNotContain(marker, await client.GetStringAsync(path), StringComparison.Ordinal);
        }

        var hits = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universe.Id}/entities?search={marker}"))!;
        Assert.Equal(0, hits.TotalCount);
    }

    // ---------- Steps ----------

    private static string Revisions(Guid universeId, Guid storyId, Guid sceneId) =>
        $"{Manuscript(universeId, storyId, sceneId)}/revisions";

    private static async Task<List<SceneManuscriptRevisionSummary>> History(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        Guid sceneId) =>
        (await client.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>(Revisions(universeId, storyId, sceneId)))!;

    private static async Task<SceneManuscriptRevisionDetail> Version(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        Guid revisionId) =>
        (await client.GetFromJsonAsync<SceneManuscriptRevisionDetail>(
            $"{Revisions(universeId, storyId, sceneId)}/{revisionId}"))!;

    private static Task<HttpResponseMessage> Restore(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        Guid revisionId,
        int? expectedVersion) =>
        client.PostAsJsonAsync(
            $"{Revisions(universeId, storyId, sceneId)}/{revisionId}/restore",
            new SceneManuscriptRestoreRequest(expectedVersion));
}
