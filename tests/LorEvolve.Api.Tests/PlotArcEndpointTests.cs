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
/// Plot arcs inside a story: what one holds, the order only its author sets, what deleting one takes with it and
/// what it must never take, who may reach one, the plot read's fixed query count, and that planning a plot changes
/// nothing about the lore.
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
        Assert.Empty(fall.Beats);
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
            ["beats", "createdAt", "description", "id", "notes", "sortOrder", "storyId", "title", "updatedAt", "visibility"],
            document.RootElement.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal));
    }

    // ---------- What deleting takes, and never takes ----------

    [Fact]
    public async Task Deleting_an_arc_closes_the_gap_and_puts_its_beats_and_links_in_the_trash_with_it_but_no_scene_chapter_or_entry()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcdelete");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var story = await CreateStory(client, universe.Id, "Doomed thread");
        var ashes = await CreateChapter(client, universe.Id, story, "Ashes");
        var siege = await CreateScene(client, universe.Id, story, "The Siege", ashes);
        var escape = await CreateScene(client, universe.Id, story, "Escape");

        var first = await CreateArc(client, universe.Id, story, "First");
        var doomed = await CreateArc(client, universe.Id, story, "Fall of the King");
        var last = await CreateArc(client, universe.Id, story, "Last");

        var breach = await CreateBeat(client, universe.Id, story, doomed.Id, "Capital is breached", [siege, escape], [arlen]);
        var exile = await CreateBeat(client, universe.Id, story, doomed.Id, "Accepts exile");
        var kept = await CreateBeat(client, universe.Id, story, last.Id, "Kept", [siege], [arlen]);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Arc(universe.Id, story, doomed.Id))).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Arc(universe.Id, story, doomed.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Beat(universe.Id, story, breach.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Beat(universe.Id, story, exile.Id))).StatusCode);

        var plot = await Plot(client, universe.Id, story);
        Assert.Equal(
            new (Guid, int)[] { (first.Id, 0), (last.Id, 1) },
            plot.Select(arc => (arc.Id, arc.SortOrder)));
        Assert.Equal([siege], Assert.Single(plot[1].Beats).SceneIds);

        // Only the arc is marked: its beats keep their order and every link, out of every read, for a restore (ADR 0029).
        await WithDb(_factory, async db =>
        {
            Assert.True(await db.PlotArcs.AnyAsync(arc => arc.Id == doomed.Id && arc.DeletedAt != null));
            Assert.Equal(2, await db.PlotBeats.CountAsync(beat => beat.PlotArcId == doomed.Id && beat.DeletedAt == null));
            Assert.True(await db.PlotBeatScenes.AnyAsync(link => link.PlotBeatId == breach.Id));
            Assert.True(await db.PlotBeatEntities.AnyAsync(link => link.PlotBeatId == breach.Id));
            Assert.True(await db.PlotBeatScenes.AnyAsync(link => link.PlotBeatId == kept.Id && link.SceneId == siege));
            Assert.True(await db.PlotBeatEntities.AnyAsync(link => link.PlotBeatId == kept.Id && link.EntityId == arlen));
        });

        // Every scene, the chapter and the entry are exactly where they were.
        var read = await ReadStory(client, universe.Id, story);
        Assert.Equal([escape, siege], read.Scenes.Select(scene => scene.Id));
        Assert.Equal([ashes], read.Chapters.Select(chapter => chapter.Id));
        (await client.GetAsync($"/api/universes/{universe.Id}/entities/{arlen}")).EnsureSuccessStatusCode();

        // The next arc still lands last.
        Assert.Equal(2, (await CreateArc(client, universe.Id, story, "After")).SortOrder);
    }

    [Fact]
    public async Task A_story_in_the_trash_keeps_its_plot_out_of_reach_and_deleting_its_universe_takes_it_for_good()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcstorydelete");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");

        var doomed = await CreateStory(client, universe.Id, "Doomed");
        var scene = await CreateScene(client, universe.Id, doomed, "The Council");
        var arc = await CreateArc(client, universe.Id, doomed, "Thread");
        var beat = await CreateBeat(client, universe.Id, doomed, arc.Id, "Step", [scene], [arlen]);

        var survivor = await CreateStory(client, universe.Id, "Survivor");
        var survivorArc = await CreateArc(client, universe.Id, survivor, "Thread");
        await CreateBeat(client, universe.Id, survivor, survivorArc.Id, "Step", null, [arlen]);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Story(universe.Id, doomed))).StatusCode);

        // Out of reach through the story, and kept whole beneath it (ADR 0029).
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Arcs(universe.Id, doomed))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Beat(universe.Id, doomed, beat.Id))).StatusCode);

        await WithDb(_factory, async db =>
        {
            Assert.True(await db.PlotArcs.AnyAsync(candidate => candidate.StoryId == doomed && candidate.DeletedAt == null));
            Assert.True(await db.PlotBeats.AnyAsync(candidate => candidate.Id == beat.Id && candidate.DeletedAt == null));
            Assert.True(await db.PlotBeatScenes.AnyAsync(link => link.PlotBeatId == beat.Id));
            Assert.True(await db.PlotBeatEntities.AnyAsync(link => link.PlotBeatId == beat.Id));
            Assert.True(await db.Entities.AnyAsync(entity => entity.Id == arlen && entity.DeletedAt == null));
        });

        Assert.Single(await Plot(client, universe.Id, survivor));

        // The universe's own cascade meets the plot from both sides - through its stories and through its entries - and
        // takes the Trash with it.
        (await client.PostAsync($"/api/universes/{universe.Id}/archive", content: null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{universe.Id}")).StatusCode);

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.PlotArcs.AnyAsync(candidate => candidate.StoryId == survivor || candidate.StoryId == doomed));
            Assert.False(await db.PlotBeats.AnyAsync(candidate => candidate.Id == beat.Id));
            Assert.False(await db.PlotBeatEntities.AnyAsync(link => link.EntityId == arlen));
        });
    }

    // ---------- A plot is not lore ----------

    [Fact]
    public async Task Planning_a_plot_creates_no_canon_finding_no_timeline_entry_and_changes_no_entry()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcnotlore");
        var king = await CreateEntity(client, universe.Id, "King Arlen");
        var before = await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{king}");

        var story = await CreateStory(client, universe.Id, "What if");
        var scene = await CreateScene(client, universe.Id, story, "The Gate");
        var arc = await CreateArc(client, universe.Id, story, "Fall of the King", "The King dies.");
        var beat = await CreateBeat(
            client, universe.Id, story, arc.Id, "The King dies", [scene], [king], "Killed at the gate in year 40.");

        await PutJson<PlotBeatResponse>(
            client,
            Beat(universe.Id, story, beat.Id),
            new PlotBeatRequest("The King lives", "He does not die after all.", "Undecided.", [scene], [king]));

        var conflicts = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universe.Id}/canon-conflicts?pageSize=100"))!;
        Assert.Empty(conflicts.Items);

        var timeline = (await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{universe.Id}/timeline"))!;
        Assert.Equal(0, timeline.TotalCount);

        Assert.Equal(before, await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{king}"));
    }

    // ---------- Reading the whole plot ----------

    [Fact]
    public async Task The_plot_is_read_in_the_same_few_queries_however_many_arcs_beats_and_links_it_holds()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "plotqueries");

        var lore = new List<Guid>();
        for (var index = 0; index < 5; index++)
        {
            lore.Add(await CreateEntity(client, universe.Id, $"Entry {index}"));
        }

        var small = await CreateStory(client, universe.Id, "Small");
        var alone = await CreateScene(client, universe.Id, small, "Alone");
        var thread = await CreateArc(client, universe.Id, small, "Thread");
        await CreateBeat(client, universe.Id, small, thread.Id, "Step", [alone], [lore[0]]);

        var large = await CreateStory(client, universe.Id, "Large");
        var chapter = await CreateChapter(client, universe.Id, large, "Ashes");
        var scenes = new List<Guid>();
        for (var index = 0; index < 10; index++)
        {
            scenes.Add(await CreateScene(client, universe.Id, large, $"Scene {index}", index % 2 == 0 ? chapter : null));
        }

        for (var arcIndex = 0; arcIndex < 5; arcIndex++)
        {
            var arc = await CreateArc(client, universe.Id, large, $"Arc {arcIndex}");
            for (var beatIndex = 0; beatIndex < 10; beatIndex++)
            {
                await CreateBeat(
                    client, universe.Id, large, arc.Id, $"Beat {arcIndex}.{beatIndex}",
                    [scenes[beatIndex], scenes[(beatIndex + 3) % 10], scenes[(beatIndex + 7) % 10]],
                    [lore[beatIndex % 5], lore[(beatIndex + 1) % 5]]);
            }
        }

        var (smallQueries, _) = await CommandCounter.CountAsync(
            [universe.Id, small], () => Plot(client, universe.Id, small));
        var (largeQueries, plot) = await CommandCounter.CountAsync(
            [universe.Id, large], () => Plot(client, universe.Id, large));

        Assert.Equal(5, plot.Count);
        Assert.All(plot, arc =>
        {
            Assert.Equal(10, arc.Beats.Count);
            Assert.All(arc.Beats, beat =>
            {
                Assert.Equal(3, beat.SceneIds.Count);
                Assert.Equal(2, beat.Entities.Count);
            });
        });

        // One beat or fifty, one link or two hundred and fifty, the same queries: ownership, the arcs, the beats,
        // their scene links, their lore links and the entries named - nothing per arc, per beat or per link.
        Assert.Equal(smallQueries, largeQueries);
        Assert.InRange(largeQueries, 1, 8);
    }

    // ---------- Who may reach one ----------

    [Fact]
    public async Task Someone_else_cannot_list_read_change_reorder_or_delete_a_plot()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "arcmine");
        var story = await CreateStory(owner, universe.Id, "Private");
        var arc = await CreateArc(owner, universe.Id, story, "Mine");
        var beat = await CreateBeat(owner, universe.Id, story, arc.Id, "Also mine");

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

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync(
            ArcBeats(universe.Id, story, arc.Id), new PlotBeatRequest("Intruder", null, null, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutAsJsonAsync(
            $"{ArcBeats(universe.Id, story, arc.Id)}/order", new PlotBeatOrderRequest([beat.Id]))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Beat(universe.Id, story, beat.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutAsJsonAsync(
            Beat(universe.Id, story, beat.Id), new PlotBeatRequest("Taken", null, null, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync(Beat(universe.Id, story, beat.Id))).StatusCode);

        var plot = Assert.Single(await Plot(owner, universe.Id, story));
        Assert.Equal("Mine", plot.Title);
        Assert.Equal("Also mine", Assert.Single(plot.Beats).Title);
    }

    [Fact]
    public async Task An_arc_reached_through_another_story_or_universe_answers_as_missing()
    {
        var (client, first) = await SignedInWithUniverse(_factory, "arcelsewhere");
        var second = await CreateUniverse(client, "World arcelsewhere two");

        var home = await CreateStory(client, first.Id, "Home");
        var neighbour = await CreateStory(client, first.Id, "Neighbour");
        var arc = await CreateArc(client, first.Id, home, "Belongs home");
        var beat = await CreateBeat(client, first.Id, home, arc.Id, "Also home");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Arc(first.Id, neighbour, arc.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync(
            Arc(first.Id, neighbour, arc.Id), new PlotArcRequest("Moved", null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Arc(first.Id, neighbour, arc.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            ArcBeats(first.Id, neighbour, arc.Id), new PlotBeatRequest("Smuggled", null, null, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync(
            $"{ArcBeats(first.Id, neighbour, arc.Id)}/order", new PlotBeatOrderRequest([beat.Id]))).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Arcs(second.Id, home))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Arc(second.Id, home, arc.Id))).StatusCode);

        Assert.Empty(await Plot(client, first.Id, neighbour));
        var intact = Assert.Single(await Plot(client, first.Id, home));
        Assert.Equal("Belongs home", intact.Title);
        Assert.Equal([beat.Id], intact.Beats.Select(candidate => candidate.Id));
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
