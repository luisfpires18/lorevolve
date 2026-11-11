using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Stories;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The author's orders (Product request 2026-11-11): a scene's lore reads in the order it was picked, not by name, and a
/// universe's stories read in the order the author sets, not by title. Both survive a save, the Trash and a backup.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class AuthorOrderTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- A scene's lore ----------

    [Fact]
    public async Task A_scenes_lore_reads_in_the_order_it_was_picked_and_a_new_order_is_a_change()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "loreorder");
        var u = universe.Id;
        var marcus = await CreateEntity(client, u, "Marcus Coyote");
        var ruth = await CreateEntity(client, u, "Ruth Lestasc");
        var fortis = await CreateEntity(client, u, "Fortis");
        var story = await CreateStory(client, u, "The Great Forging");
        var path = $"{Story(u, story)}/scenes";

        var created = await PostJson<SceneResponse>(
            client, path, new SceneRequest("King's Orders", null, null, null, null, [marcus, ruth, fortis]));
        Assert.Equal([marcus, ruth, fortis], created.Entities.Select(entity => entity.EntityId));

        // The story read and the scene read agree.
        var read = await ReadStory(client, u, story);
        Assert.Equal([marcus, ruth, fortis], read.Scenes.Single().Entities.Select(entity => entity.EntityId));

        // The same set in another order is a change: kept, and the version moves on.
        var reordered = await PutJson<SceneResponse>(
            client,
            $"{path}/{created.Id}",
            new SceneRequest("King's Orders", null, null, null, null, [fortis, marcus, ruth], null, created.Version));
        Assert.Equal([fortis, marcus, ruth], reordered.Entities.Select(entity => entity.EntityId));
        Assert.Equal(created.Version + 1, reordered.Version);

        // The same order again is no change.
        var same = await PutJson<SceneResponse>(
            client,
            $"{path}/{created.Id}",
            new SceneRequest("King's Orders", null, null, null, null, [fortis, marcus, ruth], null, reordered.Version));
        Assert.Equal(reordered.Version, same.Version);

        // A link added goes where it was sent, and one removed closes the gap.
        var theo = await CreateEntity(client, u, "Theo Blake");
        var changed = await PutJson<SceneResponse>(
            client,
            $"{path}/{created.Id}",
            new SceneRequest("King's Orders", null, null, null, null, [theo, fortis, ruth], null, same.Version));
        Assert.Equal([theo, fortis, ruth], changed.Entities.Select(entity => entity.EntityId));

        // The backup carries the order, and a restore keeps it.
        var backup = await Backup(client, u);
        Assert.Equal([theo, fortis, ruth], backup.Payload.Stories!.Single().Scenes.Single().LinkedEntityIds);

        var restored = await RestoreArchive(client, await RawArchive(client, u), "Lore order restored");
        var restoredStory = (await client.GetFromJsonAsync<List<StorySummary>>(Stories(restored.Id)))!.Single();
        var restoredScene = (await ReadStory(client, restored.Id, restoredStory.Id)).Scenes.Single();
        Assert.Equal(
            ["Theo Blake", "Fortis", "Ruth Lestasc"],
            restoredScene.Entities.Select(entity => entity.Name));
    }

    [Fact]
    public async Task A_version_37_backup_restores_each_scenes_lore_by_name_as_it_read_then()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "loreorderold");
        var u = universe.Id;
        var ruth = await CreateEntity(client, u, "Ruth Lestasc");
        var fortis = await CreateEntity(client, u, "Fortis");
        var story = await CreateStory(client, u, "Older");
        await PostJson<SceneResponse>(
            client, $"{Story(u, story)}/scenes", new SceneRequest("A scene", null, null, null, null, [ruth, fortis]));

        var restored = await RestoreArchive(client, Downgrade(await RawArchive(client, u), 37), "Lore order v37");
        var restoredStory = (await client.GetFromJsonAsync<List<StorySummary>>(Stories(restored.Id)))!.Single();
        var restoredScene = (await ReadStory(client, restored.Id, restoredStory.Id)).Scenes.Single();
        Assert.Equal(["Fortis", "Ruth Lestasc"], restoredScene.Entities.Select(entity => entity.Name));
    }

    // ---------- A universe's stories ----------

    [Fact]
    public async Task Stories_read_in_the_authors_order_a_new_one_goes_last_and_the_trash_keeps_none_in_place()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "storyorder");
        var u = universe.Id;
        var endless = await CreateStory(client, u, "The Endless War");
        var forging = await CreateStory(client, u, "The Great Forging");
        var legacy = await CreateStory(client, u, "The Legacy");
        var alpha = await CreateStory(client, u, "Alpha");

        // Created order, not title order.
        Assert.Equal([endless, forging, legacy, alpha], await Listed(client, u));

        var moved = await PutJson<List<StorySummary>>(
            client, $"{Stories(u)}/order", new StoryOrderRequest([forging, endless, alpha, legacy]));
        Assert.Equal([forging, endless, alpha, legacy], moved.Select(story => story.Id));
        Assert.Equal([forging, endless, alpha, legacy], await Listed(client, u));

        // The order is the list's: no story's edit version moves.
        Assert.Equal(1, (await ReadStory(client, u, forging)).Version);

        // A story in the Trash is not listed, nor may it be ordered; restored, it comes back last.
        (await client.DeleteAsync(Story(u, endless))).EnsureSuccessStatusCode();
        Assert.Equal([forging, alpha, legacy], await Listed(client, u));
        var withTrashed = await client.PutAsJsonAsync($"{Stories(u)}/order", new StoryOrderRequest([endless, forging, alpha, legacy]));
        Assert.Equal(HttpStatusCode.BadRequest, withTrashed.StatusCode);

        await PutJson<List<StorySummary>>(client, $"{Stories(u)}/order", new StoryOrderRequest([legacy, forging, alpha]));
        (await client.PostAsync($"/api/universes/{u}/trash/stories/{endless}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal([legacy, forging, alpha, endless], await Listed(client, u));

        // A new story goes last.
        var late = await CreateStory(client, u, "A late one");
        Assert.Equal([legacy, forging, alpha, endless, late], await Listed(client, u));
    }

    [Fact]
    public async Task A_story_order_must_name_every_live_story_once_and_nothing_else()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "storyorderrefused");
        var u = universe.Id;
        var a = await CreateStory(client, u, "A");
        var b = await CreateStory(client, u, "B");
        var (other, otherUniverse) = await SignedInWithUniverse(_factory, "storyorderother");
        var foreign = await CreateStory(other, otherUniverse.Id, "Elsewhere");

        foreach (var ids in new List<Guid>?[] { null, [a], [a, a, b], [a, b, foreign], [b, foreign] })
        {
            var refused = await client.PutAsJsonAsync($"{Stories(u)}/order", new StoryOrderRequest(ids));
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Contains("storyIds", await Errors(refused));
        }

        Assert.Equal([a, b], await Listed(client, u));
    }

    [Fact]
    public async Task Only_who_may_edit_content_orders_the_stories()
    {
        var w = await NewSharedWorld(_factory, "storyordershare");
        var a = await CreateStory(w.Owner, w.U, "First");
        var b = await CreateStory(w.Owner, w.U, "Second");
        var ids = (await Listed(w.Owner, w.U)).ToList();

        foreach (var (who, name) in new[] { (w.Reviewer, "reviewer"), (w.Viewer, "viewer") })
        {
            await AssertDenied(
                await who.PutAsJsonAsync($"{Stories(w.U)}/order", new StoryOrderRequest([.. ids.AsEnumerable().Reverse()])),
                $"{name} orders stories");
        }

        await PutJson<List<StorySummary>>(w.Editor, $"{Stories(w.U)}/order", new StoryOrderRequest([.. ids.AsEnumerable().Reverse()]));
        Assert.Equal([.. ids.AsEnumerable().Reverse()], await Listed(w.Owner, w.U));
        Assert.Contains(a, ids);
        Assert.Contains(b, ids);
    }

    [Fact]
    public async Task The_backup_carries_each_storys_place_and_an_older_file_restores_by_title()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "storyorderbackup");
        var u = universe.Id;
        var zeta = await CreateStory(client, u, "Zeta");
        var alpha = await CreateStory(client, u, "Alpha");
        var mid = await CreateStory(client, u, "Mid");
        await PutJson<List<StorySummary>>(client, $"{Stories(u)}/order", new StoryOrderRequest([mid, zeta, alpha]));

        var backup = await Backup(client, u);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);
        Assert.Equal(
            [("Mid", 0), ("Zeta", 1), ("Alpha", 2)],
            backup.Payload.Stories!.OrderBy(story => story.SortOrder).Select(story => (story.Title, story.SortOrder ?? -1)));

        var archive = await RawArchive(client, u);
        var restored = await RestoreArchive(client, archive, "Story order restored");
        Assert.Equal(["Mid", "Zeta", "Alpha"], await Titles(client, restored.Id));

        var older = await RestoreArchive(client, Downgrade(archive, 37), "Story order v37");
        Assert.Equal(["Alpha", "Mid", "Zeta"], await Titles(client, older.Id));
    }

    private static async Task<List<Guid>> Listed(HttpClient client, Guid universeId) =>
        [.. (await client.GetFromJsonAsync<List<StorySummary>>(Stories(universeId)))!.Select(story => story.Id)];

    private static async Task<List<string>> Titles(HttpClient client, Guid universeId) =>
        [.. (await client.GetFromJsonAsync<List<StorySummary>>(Stories(universeId)))!.Select(story => story.Title)];
}
