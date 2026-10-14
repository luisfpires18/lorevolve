using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Trash;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// The Trash for a story's content (ADR 0029): a story, a chapter, a scene, an arc and a beat.
///
/// The invariants under test: deleting any of them takes it out of every read and erases nothing it held; the Trash lists
/// it with what it is and where it was; one restore brings it back whole, appended rather than inserted, and never into a
/// container that is itself in the Trash; a chapter still never takes a scene with it; a link from a beat to a scene in the
/// Trash is kept through edits nobody could see it in; and a Trash belongs to one universe and one owner.
/// </summary>
public sealed class StoryTrashTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_story_in_the_trash_leaves_every_read_and_one_restore_brings_back_exactly_what_it_held()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trstory");
        var u = universe.Id;
        var arlen = await CreateEntity(client, u, "Arlen");
        var story = await CreateStory(client, u, "The Long Winter");
        var arrival = await CreateChapter(client, u, story, "Arrival");
        var gate = await SceneWith(client, u, story, "At the gate", arrival, arlen);
        var loose = await CreateScene(client, u, story, "Loose thread");
        await WriteManuscript(client, u, story, gate, "A first draft.");
        await WriteManuscript(client, u, story, gate, Prose);
        var arc = await CreateArc(client, u, story, "Fall of the King");
        var beat = await CreateBeat(client, u, story, arc.Id, "Learns", [gate, loose], [arlen]);

        var storyRead = await client.GetStringAsync(Story(u, story));
        var plotRead = await client.GetStringAsync(Arcs(u, story));
        var prose = await ReadManuscript(client, u, story, gate);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Story(u, story))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Story(u, story))).StatusCode);

        // Out of the list, and out of every route into it, for reading and for writing alike.
        Assert.DoesNotContain("The Long Winter", await client.GetStringAsync(Stories(u)), StringComparison.Ordinal);
        foreach (var path in new[]
        {
            Story(u, story),
            $"{Story(u, story)}/chapters",
            $"{Story(u, story)}/chapters/{arrival}",
            $"{Story(u, story)}/scenes",
            $"{Story(u, story)}/scenes/{gate}",
            Manuscript(u, story, gate),
            $"{Manuscript(u, story, gate)}/revisions",
            Arcs(u, story),
            Beat(u, story, beat.Id),
        })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path)).StatusCode);
        }

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"{Story(u, story)}/scenes", new SceneRequest("Smuggled", null, null, null, null, null))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await PutManuscript(client, u, story, gate, "Written into the Trash.", prose.Version)).StatusCode);

        var listed = Assert.Single((await Trash(client, u)).Items);
        Assert.Equal((TrashItemKind.Story, story, "The Long Winter", (Guid?)story, TrashRestoreBlock.None), (listed.Kind, listed.Id, listed.Name, listed.StoryId, listed.BlockedBy));

        var restored = await RestoreRoute(client, u, "stories", story);
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        Assert.Equal(
            new TrashRestored(TrashItemKind.Story, story, story),
            await restored.Content.ReadFromJsonAsync<TrashRestored>());
        Assert.Equal(HttpStatusCode.NotFound, (await RestoreRoute(client, u, "stories", story)).StatusCode);

        // Exactly as it was, down to its timestamps: nothing in it was written, so nothing moved.
        Assert.Equal(storyRead, await client.GetStringAsync(Story(u, story)));
        Assert.Equal(plotRead, await client.GetStringAsync(Arcs(u, story)));
        var back = await ReadManuscript(client, u, story, gate);
        Assert.Equal(Prose, back.Content, StringComparer.Ordinal);
        SameMoment(prose.UpdatedAt, back.UpdatedAt);
        Assert.Equal(2, (await client.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>($"{Manuscript(u, story, gate)}/revisions"))!.Count);
        Assert.Empty((await Trash(client, u)).Items);
    }

    [Fact]
    public async Task A_scene_in_the_trash_closes_its_gap_keeps_its_prose_and_links_and_comes_back_last_in_its_chapter()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trscene");
        var u = universe.Id;
        var arlen = await CreateEntity(client, u, "Arlen");
        var story = await CreateStory(client, u, "Cut and kept");
        var chapter = await CreateChapter(client, u, story, "Arrival");
        var a = await CreateScene(client, u, story, "A", chapter);
        var b = await SceneWith(client, u, story, "B", chapter, arlen);
        var c = await CreateScene(client, u, story, "C", chapter);
        await WriteManuscript(client, u, story, b, Prose);
        var arc = await CreateArc(client, u, story, "Thread");
        var beat = await CreateBeat(client, u, story, arc.Id, "Step", [a, b], [arlen]);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{Story(u, story)}/scenes/{b}")).StatusCode);

        // The gap closes, the scene leaves the story and its beat, and its prose is out of reach.
        var read = await ReadStory(client, u, story);
        Assert.Equal(new (Guid, int)[] { (a, 0), (c, 1) }, read.Scenes.Select(scene => (scene.Id, scene.SortOrder)));
        Assert.Equal([a], (await ReadBeat(client, u, story, beat.Id)).SceneIds);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Manuscript(u, story, b))).StatusCode);

        // The live order is whole without it: a new scene lands after C, and a reorder names only the live scenes.
        var d = await CreateScene(client, u, story, "D", chapter);
        Assert.Equal(2, (await client.GetFromJsonAsync<SceneResponse>($"{Story(u, story)}/scenes/{d}"))!.SortOrder);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.PutAsJsonAsync($"{Story(u, story)}/scenes/order", new SceneOrderRequest([a, b, c, d], chapter))).StatusCode);
        await PutJson<List<SceneResponse>>(client, $"{Story(u, story)}/scenes/order", new SceneOrderRequest([c, a, d], chapter));

        var listed = Assert.Single((await Trash(client, u)).Items);
        Assert.Equal(
            (TrashItemKind.Scene, b, "B", (Guid?)story, "Cut and kept", TrashRestoreBlock.None),
            (listed.Kind, listed.Id, listed.Name, listed.StoryId, listed.StoryTitle, listed.BlockedBy));

        var restored = await RestoreRoute(client, u, "scenes", b);
        Assert.Equal(new TrashRestored(TrashItemKind.Scene, b, story), await restored.Content.ReadFromJsonAsync<TrashRestored>());

        // Last in its own chapter, after the order the author set while it was away - nothing else moved.
        read = await ReadStory(client, u, story);
        Assert.Equal(
            new (Guid, Guid?, int)[] { (c, chapter, 0), (a, chapter, 1), (d, chapter, 2), (b, chapter, 3) },
            read.Scenes.Select(scene => (scene.Id, scene.ChapterId, scene.SortOrder)));

        var scene = read.Scenes.Single(candidate => candidate.Id == b);
        Assert.Equal(arlen, scene.Pov!.EntityId);
        Assert.Equal([arlen], scene.Entities.Select(entity => entity.EntityId));
        Assert.Equal(Prose, (await ReadManuscript(client, u, story, b)).Content, StringComparer.Ordinal);
        Assert.Equal([a, b], (await ReadBeat(client, u, story, beat.Id)).SceneIds);

        // Twice is refused rather than repeated, in both directions.
        Assert.Equal(HttpStatusCode.NotFound, (await RestoreRoute(client, u, "scenes", b)).StatusCode);
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{b}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"{Story(u, story)}/scenes/{b}")).StatusCode);
    }

    [Fact]
    public async Task A_beat_edited_while_its_scene_is_in_the_trash_keeps_the_link_nobody_could_see()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trbeatlink");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Links");
        var council = await CreateScene(client, u, story, "The Council");
        var siege = await CreateScene(client, u, story, "The Siege");
        var cut = await CreateScene(client, u, story, "Never linked");
        var arc = await CreateArc(client, u, story, "Thread");
        var beat = await CreateBeat(client, u, story, arc.Id, "Step", [council, siege]);

        (await client.DeleteAsync($"{Story(u, story)}/scenes/{council}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{cut}")).EnsureSuccessStatusCode();

        // The form sends back what it was shown: the live scene only. The hidden link survives the save.
        var shown = await ReadBeat(client, u, story, beat.Id);
        Assert.Equal([siege], shown.SceneIds);
        var edited = await PutJson<PlotBeatResponse>(
            client, Beat(u, story, beat.Id), new PlotBeatRequest("Step, renamed", null, null, shown.SceneIds, []));
        Assert.Equal([siege], edited.SceneIds);

        // A scene in the Trash cannot be newly linked, in the same words as one that is not there at all.
        var trashed = await Errors(await client.PutAsJsonAsync(
            Beat(u, story, beat.Id), new PlotBeatRequest("Step", null, null, [siege, cut], [])));
        var unknown = await Errors(await client.PutAsJsonAsync(
            Beat(u, story, beat.Id), new PlotBeatRequest("Step", null, null, [siege, Guid.NewGuid()], [])));
        Assert.Equal(unknown, trashed);

        (await RestoreRoute(client, u, "scenes", council)).EnsureSuccessStatusCode();

        var back = await ReadBeat(client, u, story, beat.Id);
        Assert.Equal("Step, renamed", back.Title);
        Assert.Equal([siege, council], back.SceneIds);
    }

    [Fact]
    public async Task A_chapter_in_the_trash_holds_no_scene_and_comes_back_empty_and_last()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trchapter");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Shaped");
        var one = await CreateChapter(client, u, story, "One");
        var two = await CreateChapter(client, u, story, "Two");
        var three = await CreateChapter(client, u, story, "Three");
        var loose = await CreateScene(client, u, story, "Loose");
        var x = await CreateScene(client, u, story, "x", two);
        var y = await CreateScene(client, u, story, "y", two);
        var z = await CreateScene(client, u, story, "z", two);
        await WriteManuscript(client, u, story, y, "Kept prose.");

        // x goes first, on its own; then its chapter.
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{x}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{Story(u, story)}/chapters/{two}")).StatusCode);

        // The existing guarantee holds: every live scene of the chapter is told last in Unchaptered, with its prose.
        var read = await ReadStory(client, u, story);
        Assert.Equal(new (Guid, int)[] { (one, 0), (three, 1) }, read.Chapters.Select(chapter => (chapter.Id, chapter.SortOrder)));
        Assert.Equal(
            new (Guid, Guid?, int)[] { (loose, null, 0), (y, null, 1), (z, null, 2) },
            read.Scenes.Select(scene => (scene.Id, scene.ChapterId, scene.SortOrder)));
        Assert.Equal("Kept prose.", (await ReadManuscript(client, u, story, y)).Content);

        // And the scene already in the Trash left the chapter too, so a chapter in the Trash holds none.
        await WithDb(_factory, async db =>
            Assert.Null((await db.Scenes.AsNoTracking().SingleAsync(scene => scene.Id == x)).ChapterId));

        var four = await CreateChapter(client, u, story, "Four");
        Assert.Equal(
            [TrashItemKind.Chapter, TrashItemKind.Scene],
            (await Trash(client, u)).Items.Select(item => item.Kind));

        (await RestoreRoute(client, u, "chapters", two)).EnsureSuccessStatusCode();

        // Last among the chapters, holding nothing: no scene is pulled back out of the place the author now has it.
        read = await ReadStory(client, u, story);
        Assert.Equal(
            new (Guid, int)[] { (one, 0), (three, 1), (four, 2), (two, 3) },
            read.Chapters.Select(chapter => (chapter.Id, chapter.SortOrder)));
        Assert.DoesNotContain(read.Scenes, scene => scene.ChapterId == two);
        Assert.Equal([loose, y, z], read.Scenes.Select(scene => scene.Id));

        // The scene that went before its chapter comes back to Unchaptered, with the chapter's other scenes.
        (await RestoreRoute(client, u, "scenes", x)).EnsureSuccessStatusCode();
        read = await ReadStory(client, u, story);
        Assert.Equal(
            new (Guid, Guid?, int)[] { (loose, null, 0), (y, null, 1), (z, null, 2), (x, null, 3) },
            read.Scenes.Select(scene => (scene.Id, scene.ChapterId, scene.SortOrder)));
    }

    [Fact]
    public async Task Content_whose_story_or_arc_is_in_the_trash_waits_for_it_and_is_never_attached_elsewhere()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trparent");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Held back");
        var other = await CreateStory(client, u, "Elsewhere");
        var chapter = await CreateChapter(client, u, story, "Arrival");
        var scene = await CreateScene(client, u, story, "The Council", chapter);
        var arc = await CreateArc(client, u, story, "Fall of the King");
        var beat = await CreateBeat(client, u, story, arc.Id, "Learns", [scene]);
        var otherRead = await client.GetStringAsync(Story(u, other));

        // A beat, then its arc.
        (await client.DeleteAsync(Beat(u, story, beat.Id))).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Arc(u, story, arc.Id))).EnsureSuccessStatusCode();

        Assert.Equal(TrashRestoreBlock.ArcInTrash, (await Item(client, u, beat.Id)).BlockedBy);
        Assert.Equal("Fall of the King", (await Item(client, u, beat.Id)).PlotArcTitle);

        var beatRefused = await RestoreRoute(client, u, "plot-beats", beat.Id);
        Assert.Equal(("arc", "Fall of the King"), await ParentRefusal(beatRefused));
        Assert.Empty(await Plot(client, u, story));

        // Then a scene, its chapter and the story itself.
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{scene}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"{Story(u, story)}/chapters/{chapter}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Story(u, story))).EnsureSuccessStatusCode();

        var trash = (await Trash(client, u)).Items.ToDictionary(item => item.Id);
        Assert.Equal(TrashRestoreBlock.None, trash[story].BlockedBy);
        Assert.All(
            new[] { chapter, scene, arc.Id, beat.Id },
            id => Assert.Equal(TrashRestoreBlock.StoryInTrash, trash[id].BlockedBy));

        foreach (var (route, id) in new[] { ("chapters", chapter), ("scenes", scene), ("plot-arcs", arc.Id), ("plot-beats", beat.Id) })
        {
            Assert.Equal(("story", "Held back"), await ParentRefusal(await RestoreRoute(client, u, route, id)));
        }

        // Nothing was attached to the other story, or anywhere else.
        Assert.Equal(otherRead, await client.GetStringAsync(Story(u, other)));
        Assert.Equal(5, (await Trash(client, u)).TotalCount);

        // The story comes back holding what it held when it went - none of these, which went before it.
        (await RestoreRoute(client, u, "stories", story)).EnsureSuccessStatusCode();
        var read = await ReadStory(client, u, story);
        Assert.Empty(read.Chapters);
        Assert.Empty(read.Scenes);
        Assert.Empty(await Plot(client, u, story));

        // Each comes back once what it belongs to is there: the beat only after its arc.
        Assert.Equal(("arc", "Fall of the King"), await ParentRefusal(await RestoreRoute(client, u, "plot-beats", beat.Id)));
        (await RestoreRoute(client, u, "plot-arcs", arc.Id)).EnsureSuccessStatusCode();
        (await RestoreRoute(client, u, "plot-beats", beat.Id)).EnsureSuccessStatusCode();
        (await RestoreRoute(client, u, "chapters", chapter)).EnsureSuccessStatusCode();
        (await RestoreRoute(client, u, "scenes", scene)).EnsureSuccessStatusCode();

        read = await ReadStory(client, u, story);
        Assert.Equal([chapter], read.Chapters.Select(candidate => candidate.Id));
        Assert.Equal(new (Guid, Guid?)[] { (scene, null) }, read.Scenes.Select(candidate => (candidate.Id, candidate.ChapterId)));
        Assert.Equal([scene], Assert.Single(Assert.Single(await Plot(client, u, story)).Beats).SceneIds);
        Assert.Empty((await Trash(client, u)).Items);
    }

    [Fact]
    public async Task The_trash_lists_every_kind_newest_first_with_where_each_one_was()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trlist");
        var u = universe.Id;
        var entry = await CreateEntity(client, u, "Gatewarden");
        var story = await CreateStory(client, u, "Planned");
        var gone = await CreateStory(client, u, "Abandoned");
        var chapter = await CreateChapter(client, u, story, "Arrival");
        var scene = await CreateScene(client, u, story, "The Council");
        var arc = await CreateArc(client, u, story, "Fall of the King");
        var beat = await CreateBeat(client, u, story, arc.Id, "Learns");

        (await client.DeleteAsync(Beat(u, story, beat.Id))).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{scene}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"{Story(u, story)}/chapters/{chapter}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"/api/universes/{u}/entities/{entry}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Story(u, gone))).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Arc(u, story, arc.Id))).EnsureSuccessStatusCode();

        var first = await Trash(client, u, page: 1, pageSize: 4);
        var second = await Trash(client, u, page: 2, pageSize: 4);

        Assert.Equal((6, 2), (first.TotalCount, first.TotalPages));
        Assert.Equal([arc.Id, gone, entry, chapter], first.Items.Select(item => item.Id));
        Assert.Equal([scene, beat.Id], second.Items.Select(item => item.Id));
        Assert.All(first.Items.Concat(second.Items), item => Assert.Equal(DateTimeKind.Utc, item.TrashedAt.Kind));

        var items = first.Items.Concat(second.Items).ToDictionary(item => item.Id);
        Assert.Equal((TrashItemKind.Entry, "Character", (Guid?)null), (items[entry].Kind, items[entry].EntityTypeName, items[entry].StoryId));
        Assert.Equal((TrashItemKind.Story, (Guid?)gone, (string?)null), (items[gone].Kind, items[gone].StoryId, items[gone].StoryTitle));
        Assert.Equal((TrashItemKind.PlotArc, "Planned"), (items[arc.Id].Kind, items[arc.Id].StoryTitle));
        Assert.Equal((TrashItemKind.Chapter, "Planned"), (items[chapter].Kind, items[chapter].StoryTitle));
        Assert.Equal((TrashItemKind.Scene, "Planned", TrashRestoreBlock.None), (items[scene].Kind, items[scene].StoryTitle, items[scene].BlockedBy));
        Assert.Equal(
            (TrashItemKind.PlotBeat, (Guid?)arc.Id, "Fall of the King", TrashRestoreBlock.ArcInTrash),
            (items[beat.Id].Kind, items[beat.Id].PlotArcId, items[beat.Id].PlotArcTitle, items[beat.Id].BlockedBy));

        // Names and places only: the Trash is not a second reader.
        var raw = await client.GetStringAsync($"/api/universes/{u}/trash");
        Assert.DoesNotContain("\"content\"", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("\"notes\"", raw, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_trash_and_its_restores_belong_to_one_universe_and_one_owner()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "trowner");
        var u = universe.Id;
        var elsewhere = await CreateUniverse(owner, "World trowner two");
        var story = await CreateStory(owner, u, "Private telling");
        var trashedStory = await CreateStory(owner, u, "Private and binned");
        var chapter = await CreateChapter(owner, u, story, "Private chapter");
        var scene = await CreateScene(owner, u, story, "Private scene");
        var arc = await CreateArc(owner, u, story, "Private arc");
        var beat = await CreateBeat(owner, u, story, arc.Id, "Private beat");

        (await owner.DeleteAsync(Beat(u, story, beat.Id))).EnsureSuccessStatusCode();
        (await owner.DeleteAsync($"{Story(u, story)}/scenes/{scene}")).EnsureSuccessStatusCode();
        (await owner.DeleteAsync($"{Story(u, story)}/chapters/{chapter}")).EnsureSuccessStatusCode();
        (await owner.DeleteAsync(Arc(u, story, arc.Id))).EnsureSuccessStatusCode();
        (await owner.DeleteAsync(Story(u, trashedStory))).EnsureSuccessStatusCode();

        var (stranger, strangerUniverse) = await SignedInWithUniverse(_factory, "trstranger");
        var routes = new[]
        {
            ("stories", trashedStory), ("chapters", chapter), ("scenes", scene), ("plot-arcs", arc.Id), ("plot-beats", beat.Id),
        };

        var listed = await stranger.GetAsync($"/api/universes/{u}/trash");
        Assert.Equal(HttpStatusCode.NotFound, listed.StatusCode);
        Assert.DoesNotContain("Private", await listed.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        foreach (var (route, id) in routes)
        {
            // Through the owner's universe, through the stranger's own, and by the owner through another of theirs.
            Assert.Equal(HttpStatusCode.NotFound, (await RestoreRoute(stranger, u, route, id)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await RestoreRoute(stranger, strangerUniverse.Id, route, id)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await RestoreRoute(owner, elsewhere.Id, route, id)).StatusCode);
        }

        Assert.Empty((await Trash(stranger, strangerUniverse.Id)).Items);
        Assert.Empty((await Trash(owner, elsewhere.Id)).Items);
        Assert.Equal(5, (await Trash(owner, u)).TotalCount);
    }

    [Fact]
    public async Task An_era_a_scene_in_the_trash_is_dated_in_cannot_be_removed()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trera");
        var u = universe.Id;
        var eras = await TheFall(client, u);
        var story = await CreateStory(client, u, "Dated");
        var scene = (await PostJson<SceneResponse>(
            client,
            $"{Story(u, story)}/scenes",
            new SceneRequest("After", null, null, null, new ChronologyValue(eras[1].Id, 3, null, null), null))).Id;

        (await client.DeleteAsync($"{Story(u, story)}/scenes/{scene}")).EnsureSuccessStatusCode();

        // Removing the era would leave the restorable scene's year in no era at all, so it is refused - naming the Trash.
        var refused = await client.PutAsJsonAsync(
            $"/api/universes/{u}/chronology",
            new ChronologyRequest([
                new ChronologyEraRequest(eras[0].Id, eras[0].Name, eras[0].Abbreviation, eras[0].Direction, eras[0].LabelPosition),
            ]));

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains("Trash", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        (await RestoreRoute(client, u, "scenes", scene)).EnsureSuccessStatusCode();
        Assert.Equal(eras[1].Id, Assert.Single((await ReadStory(client, u, story)).Scenes).Chronology!.EraId);
    }

    [Fact]
    public async Task Story_content_in_the_trash_changes_no_lore_and_trashed_lore_stays_out_of_search()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trsearch");
        var u = universe.Id;
        var warden = await CreateEntity(client, u, "Gatewarden");
        await ArticleTestClient.WriteArticle(
            client,
            u,
            warden,
            """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"She kept the Halloway tide."}]}]}""");
        var entryBefore = await client.GetStringAsync($"/api/universes/{u}/entities/{warden}");

        var story = await CreateStory(client, u, "Halloway");
        var scene = (await PostJson<SceneResponse>(
            client, $"{Story(u, story)}/scenes", new SceneRequest("Halloway tide", null, null, warden, null, [warden]))).Id;
        await WriteManuscript(client, u, story, scene, "The Halloway tide turned.");

        Assert.Equal(1, await Hits(client, u, "Halloway"));

        // The entry goes to the Trash: its article leaves search. Story content never entered it, in or out of the Trash.
        (await client.DeleteAsync($"/api/universes/{u}/entities/{warden}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{scene}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Story(u, story))).EnsureSuccessStatusCode();
        Assert.Equal(0, await Hits(client, u, "Halloway"));

        (await RestoreRoute(client, u, "stories", story)).EnsureSuccessStatusCode();
        (await RestoreRoute(client, u, "scenes", scene)).EnsureSuccessStatusCode();
        Assert.Equal(0, await Hits(client, u, "Halloway"));

        (await client.PostAsync($"/api/universes/{u}/trash/{warden}/restore", content: null)).EnsureSuccessStatusCode();
        Assert.Equal(1, await Hits(client, u, "Halloway"));
        Assert.Equal(entryBefore, await client.GetStringAsync($"/api/universes/{u}/entities/{warden}"));

        var conflicts = (await client.GetFromJsonAsync<JsonElement>($"/api/universes/{u}/canon-conflicts?pageSize=100"));
        Assert.Equal(0, conflicts.GetProperty("totalCount").GetInt32());
    }

    // ---------- Steps ----------

    private static async Task<Guid> SceneWith(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        string title,
        Guid? chapterId,
        Guid entity) =>
        (await PostJson<SceneResponse>(
            client,
            $"{Story(universeId, storyId)}/scenes",
            new SceneRequest(title, null, null, entity, null, [entity], chapterId))).Id;

    private static async Task<TrashPage> Trash(HttpClient client, Guid universeId, int page = 1, int pageSize = 50) =>
        (await client.GetFromJsonAsync<TrashPage>($"/api/universes/{universeId}/trash?page={page}&pageSize={pageSize}"))!;

    private static async Task<TrashItem> Item(HttpClient client, Guid universeId, Guid id) =>
        (await Trash(client, universeId)).Items.Single(item => item.Id == id);

    private static Task<HttpResponseMessage> RestoreRoute(HttpClient client, Guid universeId, string route, Guid id) =>
        client.PostAsync($"/api/universes/{universeId}/trash/{route}/{id}/restore", content: null);

    /// <summary>The 409 a restore gets while its container is in the Trash: what it names, and the title it gives.</summary>
    private static async Task<(string BlockedBy, string Title)> ParentRefusal(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(StoryContentRestore.ParentInTrashCode, root.GetProperty("code").GetString());

        var detail = root.GetProperty("detail").GetString()!;
        var title = detail[(detail.IndexOf('“') + 1)..detail.IndexOf('”')];
        return (root.GetProperty("blockedBy").GetString()!, title);
    }

    private static async Task<int> Hits(HttpClient client, Guid universeId, string word) =>
        (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universeId}/entities?search={word}"))!.TotalCount;

    private static async Task<IReadOnlyList<ChronologyEraResponse>> TheFall(HttpClient client, Guid universeId)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
    }
}
