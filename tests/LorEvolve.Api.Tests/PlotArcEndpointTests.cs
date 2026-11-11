using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Timeline;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Arcs inside a story (ADR 0070): what one holds, the order only its author sets, the chapters told in one and the beats a
/// scene holds, what deleting one takes with it and what it must never take, who may reach one, the story read's fixed query
/// count, and that planning changes nothing about the lore.
/// </summary>
public sealed class PlotArcEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Writing and reading ----------

    [Fact]
    public async Task An_arc_is_appended_read_listed_and_updated()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arccreate");
        var story = await CreateStory(client, universe.Id, "The Long Winter");

        Assert.Empty(await Plot(client, universe.Id, story));

        var fall = await CreateArc(client, universe.Id, story, "  Fall of the King  ", " The throne is lost. ", " Keep it slow. ");
        var mira = await CreateArc(client, universe.Id, story, "Mira's Betrayal");

        Assert.Equal("Fall of the King", fall.Title);
        Assert.Equal("The throne is lost.", fall.Description);
        Assert.Equal("Keep it slow.", fall.Notes);
        Assert.Equal(story, fall.StoryId);
        Assert.Equal([0, 1], new[] { fall.SortOrder, mira.SortOrder });

        var read = (await client.GetFromJsonAsync<PlotArcResponse>(Arc(universe.Id, story, mira.Id)))!;
        Assert.Equal("Mira's Betrayal", read.Title);
        Assert.Null(read.Description);
        Assert.Null(read.Notes);

        Assert.Equal(["Fall of the King", "Mira's Betrayal"], (await Plot(client, universe.Id, story)).Select(arc => arc.Title));

        var saved = await PutJson<PlotArcResponse>(
            client, Arc(universe.Id, story, fall.Id), new PlotArcRequest("The King Falls", null, "Faster."));

        Assert.Equal("The King Falls", saved.Title);
        Assert.Null(saved.Description);
        Assert.Equal("Faster.", saved.Notes);
        Assert.Equal(0, saved.SortOrder);
    }

    [Fact]
    public async Task An_arc_needs_a_title_and_keeps_its_text_within_bounds()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcinvalid");
        var story = await CreateStory(client, universe.Id, "Bounds");

        Assert.Contains("\"title\"", await Errors(await client.PostAsJsonAsync(
            Arcs(universe.Id, story), new PlotArcRequest("   ", null, null))), StringComparison.Ordinal);
        Assert.Contains("\"description\"", await Errors(await client.PostAsJsonAsync(
            Arcs(universe.Id, story), new PlotArcRequest("Long", new string('d', StoryLimits.PlotDescriptionMaxLength + 1), null))), StringComparison.Ordinal);
        Assert.Contains("\"notes\"", await Errors(await client.PostAsJsonAsync(
            Arcs(universe.Id, story), new PlotArcRequest("Long", null, new string('n', StoryLimits.PlotNotesMaxLength + 1)))), StringComparison.Ordinal);

        Assert.Empty(await Plot(client, universe.Id, story));

        var arc = await CreateArc(client, universe.Id, story, "Kept");
        Assert.Contains("\"title\"", await Errors(await client.PutAsJsonAsync(
            Arc(universe.Id, story, arc.Id), new PlotArcRequest("", null, null))), StringComparison.Ordinal);
        Assert.Equal("Kept", Assert.Single(await Plot(client, universe.Id, story)).Title);
    }

    // ---------- Order ----------

    [Fact]
    public async Task Arcs_are_reordered_only_as_a_whole_and_their_number_is_only_their_place()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcorder");
        var story = await CreateStory(client, universe.Id, "Three threads");
        var other = await CreateStory(client, universe.Id, "Someone else's threads");

        var a = await CreateArc(client, universe.Id, story, "Fall of the King");
        var b = await CreateArc(client, universe.Id, story, "Mira's Betrayal");
        var c = await CreateArc(client, universe.Id, story, "Search for the Crown");
        var foreign = await CreateArc(client, universe.Id, other, "Elsewhere");

        var reordered = await PutJson<List<PlotArcResponse>>(
            client, $"{Arcs(universe.Id, story)}/order", new PlotArcOrderRequest([c.Id, a.Id, b.Id]));

        // Renumbered by place; every title exactly as written.
        Assert.Equal(
            new (string, int)[] { ("Search for the Crown", 0), ("Fall of the King", 1), ("Mira's Betrayal", 2) },
            reordered.Select(arc => (arc.Title, arc.SortOrder)));

        var order = $"{Arcs(universe.Id, story)}/order";
        Assert.Contains("\"plotArcIds\"", await Errors(await client.PutAsJsonAsync(order, new PlotArcOrderRequest(null))), StringComparison.Ordinal);
        Assert.Contains("\"plotArcIds\"", await Errors(await client.PutAsJsonAsync(order, new PlotArcOrderRequest([c.Id, a.Id]))), StringComparison.Ordinal);
        Assert.Contains("\"plotArcIds\"", await Errors(await client.PutAsJsonAsync(order, new PlotArcOrderRequest([c.Id, c.Id, a.Id]))), StringComparison.Ordinal);

        // An arc of another story is refused in the same words as an id that is nothing at all.
        var foreignRefusal = await Errors(await client.PutAsJsonAsync(order, new PlotArcOrderRequest([c.Id, a.Id, foreign.Id])));
        var unknownRefusal = await Errors(await client.PutAsJsonAsync(order, new PlotArcOrderRequest([c.Id, a.Id, Guid.NewGuid()])));
        Assert.Equal(unknownRefusal, foreignRefusal);

        Assert.Equal([c.Id, a.Id, b.Id], (await Plot(client, universe.Id, story)).Select(arc => arc.Id));
        Assert.Equal(0, Assert.Single(await Plot(client, universe.Id, other)).SortOrder);

        // Nothing on the wire is a number: the order is the place, and the title is what the author wrote.
        var raw = await client.GetStringAsync(Arc(universe.Id, story, a.Id));
        using var document = JsonDocument.Parse(raw);
        Assert.Equal(
            ["createdAt", "description", "id", "notes", "sortOrder", "storyId", "title", "updatedAt", "visibility"],
            document.RootElement.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal));
    }

    // ---------- Arcs hold chapters (ADR 0070) ----------

    [Fact]
    public async Task A_chapter_moves_into_an_arc_last_there_and_out_again_and_only_into_an_arc_of_its_own_story()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcchapters");
        var u = universe.Id;
        var story = await CreateStory(client, u, "The Great Forging");
        var other = await CreateStory(client, u, "Another telling");
        var pestilence = await CreateArc(client, u, story, "Pestilence Weapon");
        var foreign = await CreateArc(client, u, other, "Elsewhere");

        var tragic = await CreateChapter(client, u, story, "Tragic Expedition");
        var jungle = await CreateChapter(client, u, story, "The Jungle Conflict");
        var loose = await CreateChapter(client, u, story, "Loose");
        var siege = await CreateScene(client, u, story, "The Siege", tragic);

        var moved = await MoveChapterToArc(client, u, story, jungle, pestilence.Id);
        Assert.Equal(pestilence.Id, moved.PlotArcId);
        await MoveChapterToArc(client, u, story, tragic, pestilence.Id);

        // Last in its arc is last in the story's one chapter order; its scenes go with it.
        var read = await ReadStory(client, u, story);
        Assert.Equal([pestilence.Id], read.Arcs.Select(arc => arc.Id));
        Assert.Equal([loose, jungle, tragic], read.Chapters.Select(chapter => chapter.Id));
        Assert.Equal(
            new Guid?[] { null, pestilence.Id, pestilence.Id },
            read.Chapters.Select(chapter => chapter.PlotArcId));
        Assert.Equal(tragic, read.Scenes.Single(scene => scene.Id == siege).ChapterId);

        // An arc of another story is refused in the same words as an arc that is nothing at all.
        var chapterArc = ChapterArc(u, story, loose);
        var foreignRefusal = await Errors(await client.PutAsJsonAsync(chapterArc, new ChapterArcRequest(foreign.Id)));
        var unknownRefusal = await Errors(await client.PutAsJsonAsync(chapterArc, new ChapterArcRequest(Guid.NewGuid())));
        Assert.Equal(unknownRefusal, foreignRefusal);
        Assert.Contains("\"plotArcId\"", foreignRefusal, StringComparison.Ordinal);

        // A new chapter may start in an arc; out again is null.
        var made = await PostJson<ChapterResponse>(client, $"{Story(u, story)}/chapters", new ChapterRequest("Late", null, null, pestilence.Id));
        Assert.Equal(pestilence.Id, made.PlotArcId);
        Assert.Null((await MoveChapterToArc(client, u, story, tragic, null)).PlotArcId);

        // An edit of a chapter's words never moves it out of its arc.
        var edited = await PutJson<ChapterResponse>(client, $"{Story(u, story)}/chapters/{jungle}", new ChapterRequest("Jungle", null, null));
        Assert.Equal(pestilence.Id, edited.PlotArcId);
    }

    [Fact]
    public async Task Deleting_an_arc_closes_the_gap_and_leaves_its_chapters_in_no_arc_until_it_is_restored()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcdelete");
        var u = universe.Id;
        var arlen = await CreateEntity(client, u, "Arlen");
        var story = await CreateStory(client, u, "Doomed thread");
        var first = await CreateArc(client, u, story, "First");
        var doomed = await CreateArc(client, u, story, "Fall of the King");
        var last = await CreateArc(client, u, story, "Last");
        var ashes = await CreateChapter(client, u, story, "Ashes");
        await MoveChapterToArc(client, u, story, ashes, doomed.Id);
        var siege = await CreateScene(client, u, story, "The Siege", ashes);
        await SetBeats(client, u, story, siege, "The wall falls");

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Arc(u, story, doomed.Id))).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Arc(u, story, doomed.Id))).StatusCode);
        var read = await ReadStory(client, u, story);
        Assert.Equal(new (Guid, int)[] { (first.Id, 0), (last.Id, 1) }, read.Arcs.Select(arc => (arc.Id, arc.SortOrder)));
        Assert.Null(Assert.Single(read.Chapters).PlotArcId);
        Assert.Equal(["The wall falls"], read.Scenes.Single().Beats!.Select(beat => beat.Title));
        (await client.GetAsync($"/api/universes/{u}/entities/{arlen}")).EnsureSuccessStatusCode();

        // Only the arc is marked: the chapter keeps its link, and comes back into the arc with it (ADR 0029).
        await WithDb(_factory, async db =>
            Assert.True(await db.ChapterArcs.AnyAsync(link => link.ChapterId == ashes && link.PlotArcId == doomed.Id)));
        (await client.PostAsync($"/api/universes/{u}/trash/plot-arcs/{doomed.Id}/restore", content: null)).EnsureSuccessStatusCode();
        Assert.Equal(doomed.Id, Assert.Single((await ReadStory(client, u, story)).Chapters).PlotArcId);

        // Deleted for good, the arc takes only the link: the chapter, its scene and its beat stay.
        (await client.DeleteAsync(Arc(u, story, doomed.Id))).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"/api/universes/{u}/trash/plot-arcs/{doomed.Id}")).EnsureSuccessStatusCode();
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.ChapterArcs.AnyAsync(link => link.ChapterId == ashes));
            Assert.True(await db.Chapters.AnyAsync(chapter => chapter.Id == ashes && chapter.DeletedAt == null));
            Assert.Equal(1, await db.SceneBeats.CountAsync(beat => beat.SceneId == siege));
        });

        // The next arc still lands last.
        Assert.Equal(2, (await CreateArc(client, u, story, "After")).SortOrder);
    }

    [Fact]
    public async Task Deleting_a_universe_takes_its_arcs_chapter_links_and_beats_for_good()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcuniverse");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Gone");
        var arc = await CreateArc(client, u, story, "Thread");
        var chapter = await CreateChapter(client, u, story, "Only");
        await MoveChapterToArc(client, u, story, chapter, arc.Id);
        var scene = await CreateScene(client, u, story, "The Council", chapter);
        await SetBeats(client, u, story, scene, "One", "Two");

        (await client.PostAsync($"/api/universes/{u}/archive", content: null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{u}")).StatusCode);

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.PlotArcs.AnyAsync(candidate => candidate.StoryId == story));
            Assert.False(await db.ChapterArcs.AnyAsync(link => link.ChapterId == chapter));
            Assert.False(await db.SceneBeats.AnyAsync(beat => beat.SceneId == scene));
        });
    }

    // ---------- Beats belong to a scene (ADR 0070) ----------

    [Fact]
    public async Task A_scene_saves_its_beats_in_order_keeps_them_when_a_save_leaves_them_out_and_clears_them_when_asked()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "scenebeats");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Orders");
        var scene = await CreateScene(client, u, story, "The King's Orders");
        var path = $"{Story(u, story)}/scenes/{scene}";

        var saved = await SetBeats(client, u, story, scene, "  Marcus reads orders  ", "Marcus instructs Theo");
        Assert.Equal(
            new (string, int)[] { ("Marcus reads orders", 0), ("Marcus instructs Theo", 1) },
            saved.Beats!.Select(beat => (beat.Title, beat.SortOrder)));
        Assert.Equal(2, saved.Version);

        // A save that does not name beats - an older client, a suggestion, an AI change - keeps them.
        var kept = await PutJson<SceneResponse>(client, path, new SceneRequest("The King's Orders", "Read aloud.", null, null, null, [], null, saved.Version));
        Assert.Equal(["Marcus reads orders", "Marcus instructs Theo"], kept.Beats!.Select(beat => beat.Title));

        // The same beats again change nothing, so the version stays; a new order is a change.
        var same = await SetBeats(client, u, story, scene, "Marcus reads orders", "Marcus instructs Theo");
        Assert.Equal(kept.Version, same.Version);
        var swapped = await SetBeats(client, u, story, scene, "Marcus instructs Theo", "Marcus reads orders");
        Assert.Equal(same.Version + 1, swapped.Version);
        Assert.Equal(["Marcus instructs Theo", "Marcus reads orders"], swapped.Beats!.Select(beat => beat.Title));

        Assert.Empty((await SetBeats(client, u, story, scene)).Beats!);
        await WithDb(_factory, async db => Assert.False(await db.SceneBeats.AnyAsync(beat => beat.SceneId == scene)));
    }

    [Fact]
    public async Task A_beat_needs_a_title_and_a_scene_holds_a_bounded_number_of_them()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beatbounds");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Bounds");
        var scene = await CreateScene(client, u, story, "Busy");
        var path = $"{Story(u, story)}/scenes/{scene}";

        SceneRequest With(params SceneBeatInput[] beats) => new("Busy", null, null, null, null, [], null, 1, beats);

        Assert.Contains("\"beats[1].title\"", await Errors(await client.PutAsJsonAsync(path, With(new("Kept", null), new("  ", null)))), StringComparison.Ordinal);
        Assert.Contains("\"beats[0].note\"", await Errors(await client.PutAsJsonAsync(
            path, With(new SceneBeatInput("Long", new string('n', StoryLimits.BeatNoteMaxLength + 1))))), StringComparison.Ordinal);
        Assert.Contains("\"beats\"", await Errors(await client.PutAsJsonAsync(
            path, With([.. Enumerable.Range(0, StoryLimits.MaxBeatsPerScene + 1).Select(index => new SceneBeatInput($"Beat {index}", null))]))), StringComparison.Ordinal);

        await WithDb(_factory, async db => Assert.False(await db.SceneBeats.AnyAsync(beat => beat.SceneId == scene)));
    }

    // ---------- Planning is not lore ----------

    [Fact]
    public async Task Arcs_and_beats_create_no_canon_finding_no_timeline_entry_and_change_no_entry()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcnotlore");
        var king = await CreateEntity(client, universe.Id, "King Arlen");
        var before = await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{king}");

        var story = await CreateStory(client, universe.Id, "What if");
        var arc = await CreateArc(client, universe.Id, story, "Fall of the King", "The King dies.");
        var chapter = await CreateChapter(client, universe.Id, story, "The Gate");
        await MoveChapterToArc(client, universe.Id, story, chapter, arc.Id);
        var scene = await CreateScene(client, universe.Id, story, "The Gate", chapter);
        await SetBeats(client, universe.Id, story, scene, "The King dies in year 40", "The King lives after all");

        var conflicts = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universe.Id}/canon-conflicts?pageSize=100"))!;
        Assert.Empty(conflicts.Items);

        var timeline = (await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{universe.Id}/timeline"))!;
        Assert.Equal(0, timeline.TotalCount);

        Assert.Equal(before, await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{king}"));
    }

    // ---------- Reading the whole story ----------

    [Fact]
    public async Task The_story_is_read_in_the_same_few_queries_however_many_arcs_chapters_and_beats_it_holds()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcqueries");

        var small = await CreateStory(client, universe.Id, "Small");
        var alone = await CreateScene(client, universe.Id, small, "Alone");
        await CreateArc(client, universe.Id, small, "Thread");
        await SetBeats(client, universe.Id, small, alone, "Step");

        var large = await CreateStory(client, universe.Id, "Large");
        for (var arcIndex = 0; arcIndex < 3; arcIndex++)
        {
            var arc = await CreateArc(client, universe.Id, large, $"Arc {arcIndex}");
            for (var chapterIndex = 0; chapterIndex < 2; chapterIndex++)
            {
                var chapter = await CreateChapter(client, universe.Id, large, $"Chapter {arcIndex}.{chapterIndex}");
                await MoveChapterToArc(client, universe.Id, large, chapter, arc.Id);
                var scene = await CreateScene(client, universe.Id, large, $"Scene {arcIndex}.{chapterIndex}", chapter);
                await SetBeats(client, universe.Id, large, scene, "One", "Two", "Three");
            }
        }

        var (smallQueries, _) = await CommandCounter.CountAsync([universe.Id, small], () => ReadStory(client, universe.Id, small));
        var (largeQueries, story) = await CommandCounter.CountAsync([universe.Id, large], () => ReadStory(client, universe.Id, large));

        Assert.Equal(3, story.Arcs.Count);
        Assert.All(story.Chapters, chapter => Assert.NotNull(chapter.PlotArcId));
        Assert.All(story.Scenes, scene => Assert.Equal(3, scene.Beats!.Count));

        // One arc or three, one beat or eighteen: the same queries, nothing per arc, chapter, scene or beat.
        Assert.Equal(smallQueries, largeQueries);
    }

    // ---------- Who may reach one ----------

    [Fact]
    public async Task Someone_else_cannot_list_read_change_reorder_or_delete_an_arc_or_move_a_chapter_into_one()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "arcmine");
        var story = await CreateStory(owner, universe.Id, "Private");
        var arc = await CreateArc(owner, universe.Id, story, "Mine");
        var chapter = await CreateChapter(owner, universe.Id, story, "Also mine");

        var stranger = await SignedIn(_factory, "user-arcyours");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Arcs(universe.Id, story))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Arc(universe.Id, story, arc.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync(
            Arcs(universe.Id, story), new PlotArcRequest("Intruder", null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutAsJsonAsync(
            Arc(universe.Id, story, arc.Id), new PlotArcRequest("Taken", null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutAsJsonAsync(
            $"{Arcs(universe.Id, story)}/order", new PlotArcOrderRequest([arc.Id]))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync(Arc(universe.Id, story, arc.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutAsJsonAsync(
            ChapterArc(universe.Id, story, chapter), new ChapterArcRequest(arc.Id))).StatusCode);

        Assert.Equal("Mine", Assert.Single(await Plot(owner, universe.Id, story)).Title);
        Assert.Null(Assert.Single((await ReadStory(owner, universe.Id, story)).Chapters).PlotArcId);
    }

    [Fact]
    public async Task An_arc_reached_through_another_story_or_universe_answers_as_missing()
    {
        var (client, first) = await SignedInWithUniverse(_factory, "arcelsewhere");
        var second = await CreateUniverse(client, "World arcelsewhere two");

        var home = await CreateStory(client, first.Id, "Home");
        var neighbour = await CreateStory(client, first.Id, "Neighbour");
        var arc = await CreateArc(client, first.Id, home, "Belongs home");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Arc(first.Id, neighbour, arc.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync(
            Arc(first.Id, neighbour, arc.Id), new PlotArcRequest("Moved", null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Arc(first.Id, neighbour, arc.Id))).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Arcs(second.Id, home))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Arc(second.Id, home, arc.Id))).StatusCode);

        Assert.Empty(await Plot(client, first.Id, neighbour));
        Assert.Equal("Belongs home", Assert.Single(await Plot(client, first.Id, home)).Title);
    }

    [Fact]
    public async Task An_anonymous_caller_is_challenged_rather_than_answered()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "arcanon");
        var story = await CreateStory(owner, universe.Id, "Hidden");

        var anonymous = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Arcs(universe.Id, story))).StatusCode);
    }
}
