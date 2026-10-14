using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Beats inside arcs, and what they point at.
///
/// The invariants under test: a beat's order is its place in its arc and nothing else's; its scenes and lore are
/// references in both directions - nothing a beat does touches a scene or an entry, and nothing a scene or an entry
/// goes through takes a beat with it; and every link is checked inside the same story or universe, refused in the
/// same words whoever's the foreign id is.
/// </summary>
public sealed class PlotBeatEndpointTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    // ---------- Writing and reading ----------

    [Fact]
    public async Task A_beat_is_appended_to_its_arc_read_and_updated_and_needs_no_link()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beatcreate");
        var story = await CreateStory(client, universe.Id, "Planned");
        var arc = await CreateArc(client, universe.Id, story, "Fall of the King");

        var learns = await CreateBeat(client, universe.Id, story, arc.Id, "  Learns of the conspiracy  ", description: " A letter. ", notes: " Early. ");
        var middle = await CreateBeat(client, universe.Id, story, arc.Id, "Draft");
        var exile = await CreateBeat(client, universe.Id, story, arc.Id, "Accepts exile");

        Assert.Equal("Learns of the conspiracy", learns.Title);
        Assert.Equal("A letter.", learns.Description);
        Assert.Equal("Early.", learns.Notes);
        Assert.Equal(arc.Id, learns.PlotArcId);
        Assert.Equal([0, 1, 2], new[] { learns.SortOrder, middle.SortOrder, exile.SortOrder });

        // Planned work not placed yet: no scene and no lore is a valid beat.
        Assert.Empty(middle.SceneIds);
        Assert.Empty(middle.Entities);

        var saved = await PutJson<PlotBeatResponse>(
            client,
            Beat(universe.Id, story, middle.Id),
            new PlotBeatRequest("Capital is breached", "The east gate gives.", null, null, null));

        Assert.Equal("Capital is breached", saved.Title);
        Assert.Equal("The east gate gives.", saved.Description);
        Assert.Equal(1, saved.SortOrder);

        Assert.Equal("Capital is breached", (await ReadBeat(client, universe.Id, story, middle.Id)).Title);
        Assert.Equal(
            ["Learns of the conspiracy", "Capital is breached", "Accepts exile"],
            Assert.Single(await Plot(client, universe.Id, story)).Beats.Select(beat => beat.Title));
    }

    [Fact]
    public async Task A_beat_needs_a_title_and_at_most_the_links_allowed()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beatinvalid");
        var story = await CreateStory(client, universe.Id, "Bounds");
        var arc = await CreateArc(client, universe.Id, story, "Thread");
        var beats = ArcBeats(universe.Id, story, arc.Id);

        Assert.Contains("\"title\"", await Errors(await client.PostAsJsonAsync(
            beats, new PlotBeatRequest(" ", null, null, null, null))), StringComparison.Ordinal);
        Assert.Contains("\"description\"", await Errors(await client.PostAsJsonAsync(
            beats, new PlotBeatRequest("Long", new string('d', StoryLimits.PlotDescriptionMaxLength + 1), null, null, null))), StringComparison.Ordinal);
        Assert.Contains("\"sceneIds\"", await Errors(await client.PostAsJsonAsync(
            beats, new PlotBeatRequest("Crowded", null, null, [.. Enumerable.Range(0, StoryLimits.MaxLinkedScenes + 1).Select(_ => Guid.NewGuid())], null))), StringComparison.Ordinal);
        Assert.Contains("\"entityIds\"", await Errors(await client.PostAsJsonAsync(
            beats, new PlotBeatRequest("Crowded", null, null, null, [.. Enumerable.Range(0, StoryLimits.MaxLinkedEntities + 1).Select(_ => Guid.NewGuid())]))), StringComparison.Ordinal);

        Assert.Empty(Assert.Single(await Plot(client, universe.Id, story)).Beats);
    }

    // ---------- Order ----------

    [Fact]
    public async Task Beats_are_reordered_inside_one_arc_and_no_other_arc_moves()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beatorder");
        var story = await CreateStory(client, universe.Id, "Two threads");
        var x = await CreateArc(client, universe.Id, story, "X");
        var y = await CreateArc(client, universe.Id, story, "Y");

        var a = await CreateBeat(client, universe.Id, story, x.Id, "a");
        var b = await CreateBeat(client, universe.Id, story, x.Id, "b");
        var c = await CreateBeat(client, universe.Id, story, x.Id, "c");
        var d = await CreateBeat(client, universe.Id, story, y.Id, "d");

        var order = $"{ArcBeats(universe.Id, story, x.Id)}/order";
        var reordered = await PutJson<List<PlotBeatResponse>>(client, order, new PlotBeatOrderRequest([c.Id, a.Id, b.Id]));

        Assert.Equal(
            new (string, int)[] { ("c", 0), ("a", 1), ("b", 2) },
            reordered.Select(beat => (beat.Title, beat.SortOrder)));

        Assert.Contains("\"plotBeatIds\"", await Errors(await client.PutAsJsonAsync(order, new PlotBeatOrderRequest(null))), StringComparison.Ordinal);
        Assert.Contains("\"plotBeatIds\"", await Errors(await client.PutAsJsonAsync(order, new PlotBeatOrderRequest([c.Id, a.Id]))), StringComparison.Ordinal);
        Assert.Contains("\"plotBeatIds\"", await Errors(await client.PutAsJsonAsync(order, new PlotBeatOrderRequest([c.Id, c.Id, a.Id]))), StringComparison.Ordinal);

        // A beat of the other arc is not pulled across, and is refused like an id that is nothing.
        var otherArc = await Errors(await client.PutAsJsonAsync(order, new PlotBeatOrderRequest([c.Id, a.Id, d.Id])));
        var unknown = await Errors(await client.PutAsJsonAsync(order, new PlotBeatOrderRequest([c.Id, a.Id, Guid.NewGuid()])));
        Assert.Equal(unknown, otherArc);

        var plot = await Plot(client, universe.Id, story);
        Assert.Equal([c.Id, a.Id, b.Id], plot[0].Beats.Select(beat => beat.Id));
        Assert.Equal(new (Guid, int)[] { (d.Id, 0) }, plot[1].Beats.Select(beat => (beat.Id, beat.SortOrder)));
    }

    [Fact]
    public async Task Deleting_a_beat_closes_the_gap_and_keeps_every_scene_and_entry_it_linked()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beatdelete");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var story = await CreateStory(client, universe.Id, "Losing a step");
        var council = await CreateScene(client, universe.Id, story, "The Council");
        var arc = await CreateArc(client, universe.Id, story, "Thread");

        var a = await CreateBeat(client, universe.Id, story, arc.Id, "a");
        var b = await CreateBeat(client, universe.Id, story, arc.Id, "b", [council], [arlen]);
        var c = await CreateBeat(client, universe.Id, story, arc.Id, "c");

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Beat(universe.Id, story, b.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Beat(universe.Id, story, b.Id))).StatusCode);

        Assert.Equal(
            new (Guid, int)[] { (a.Id, 0), (c.Id, 1) },
            Assert.Single(await Plot(client, universe.Id, story)).Beats.Select(beat => (beat.Id, beat.SortOrder)));

        // The beat waits in the Trash with its links, for a restore (ADR 0029).
        await WithDb(_factory, async db =>
        {
            Assert.True(await db.PlotBeats.AnyAsync(beat => beat.Id == b.Id && beat.DeletedAt != null));
            Assert.True(await db.PlotBeatScenes.AnyAsync(link => link.PlotBeatId == b.Id));
            Assert.True(await db.PlotBeatEntities.AnyAsync(link => link.PlotBeatId == b.Id));
        });

        Assert.Equal([council], (await ReadStory(client, universe.Id, story)).Scenes.Select(scene => scene.Id));
        (await client.GetAsync($"/api/universes/{universe.Id}/entities/{arlen}")).EnsureSuccessStatusCode();

        Assert.Equal(2, (await CreateBeat(client, universe.Id, story, arc.Id, "d")).SortOrder);
    }

    [Fact]
    public async Task A_beat_edited_into_another_arc_moves_there_last_and_stays_the_same_beat()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beatmove");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var story = await CreateStory(client, universe.Id, "Crossing threads");
        var elsewhere = await CreateStory(client, universe.Id, "Elsewhere");
        var gate = await CreateScene(client, universe.Id, story, "The Gate");

        var x = await CreateArc(client, universe.Id, story, "X");
        var y = await CreateArc(client, universe.Id, story, "Y");
        var foreignArc = await CreateArc(client, universe.Id, elsewhere, "Not this story's");

        var a = await CreateBeat(client, universe.Id, story, x.Id, "a");
        var b = await CreateBeat(client, universe.Id, story, x.Id, "b", [gate], [arlen]);
        var c = await CreateBeat(client, universe.Id, story, x.Id, "c");
        var d = await CreateBeat(client, universe.Id, story, y.Id, "d");

        var moved = await PutJson<PlotBeatResponse>(
            client, Beat(universe.Id, story, b.Id), new PlotBeatRequest("b", null, null, [gate], [arlen], y.Id));

        Assert.Equal(b.Id, moved.Id);
        Assert.Equal(y.Id, moved.PlotArcId);
        Assert.Equal(1, moved.SortOrder);
        Assert.Equal([gate], moved.SceneIds);
        Assert.Equal([arlen], moved.Entities.Select(entity => entity.EntityId));

        var plot = await Plot(client, universe.Id, story);
        Assert.Equal(new (Guid, int)[] { (a.Id, 0), (c.Id, 1) }, plot[0].Beats.Select(beat => (beat.Id, beat.SortOrder)));
        Assert.Equal(new (Guid, int)[] { (d.Id, 0), (b.Id, 1) }, plot[1].Beats.Select(beat => (beat.Id, beat.SortOrder)));

        // Naming the arc it is already in, or leaving the arc out, keeps its place.
        Assert.Equal(1, (await PutJson<PlotBeatResponse>(
            client, Beat(universe.Id, story, b.Id), new PlotBeatRequest("b, renamed", null, null, [gate], [arlen], y.Id))).SortOrder);
        var unnamed = await PutJson<PlotBeatResponse>(
            client, Beat(universe.Id, story, b.Id), new PlotBeatRequest("b, again", null, null, [gate], [arlen]));
        Assert.Equal((y.Id, 1), (unnamed.PlotArcId, unnamed.SortOrder));

        // An arc of another story is refused in the same words as an id that is nothing, and nothing moves.
        var foreign = await Errors(await client.PutAsJsonAsync(
            Beat(universe.Id, story, b.Id), new PlotBeatRequest("b", null, null, null, null, foreignArc.Id)));
        var unknown = await Errors(await client.PutAsJsonAsync(
            Beat(universe.Id, story, b.Id), new PlotBeatRequest("b", null, null, null, null, Guid.NewGuid())));
        Assert.Equal(unknown, foreign);
        Assert.Contains("\"plotArcId\"", foreign, StringComparison.Ordinal);

        var after = await ReadBeat(client, universe.Id, story, b.Id);
        Assert.Equal((y.Id, 1, "b, again"), (after.PlotArcId, after.SortOrder, after.Title));
        Assert.Equal([gate], after.SceneIds);
        Assert.Empty(Assert.Single(await Plot(client, universe.Id, elsewhere)).Beats);
    }

    // ---------- Scene links ----------

    [Fact]
    public async Task A_beat_links_no_scene_one_or_several_and_a_scene_carries_beats_from_several_arcs()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beatscenes");
        var story = await CreateStory(client, universe.Id, "Linked");
        var ashes = await CreateChapter(client, universe.Id, story, "Ashes");
        var siege = await CreateScene(client, universe.Id, story, "The Siege", ashes);
        var vision = await CreateScene(client, universe.Id, story, "Prologue vision");
        var escape = await CreateScene(client, universe.Id, story, "Escape");

        var fall = await CreateArc(client, universe.Id, story, "Fall of the King");
        var mira = await CreateArc(client, universe.Id, story, "Mira's Betrayal");

        var none = await CreateBeat(client, universe.Id, story, fall.Id, "Unplaced");
        var one = await CreateBeat(client, universe.Id, story, fall.Id, "Capital is breached", [siege]);

        // Repeated ids link once. The beat lists its scenes where the story reads them - Unchaptered first, then
        // chapter by chapter - whatever order they were sent in.
        var several = await CreateBeat(client, universe.Id, story, fall.Id, "Everything at once", [siege, escape, vision, escape]);
        var reveal = await CreateBeat(client, universe.Id, story, mira.Id, "Reveals the gate route", [siege]);

        Assert.Empty(none.SceneIds);
        Assert.Equal([siege], one.SceneIds);
        Assert.Equal([vision, escape, siege], several.SceneIds);
        Assert.Equal([siege], reveal.SceneIds);

        await WithDb(_factory, async db =>
        {
            Assert.Equal(3, await db.PlotBeatScenes.CountAsync(link => link.PlotBeatId == several.Id));
            Assert.Equal(3, await db.PlotBeatScenes.CountAsync(link => link.SceneId == siege));
        });

        // An edit replaces the whole set.
        var trimmed = await PutJson<PlotBeatResponse>(
            client, Beat(universe.Id, story, several.Id), new PlotBeatRequest("Everything at once", null, null, [escape], null));
        Assert.Equal([escape], trimmed.SceneIds);
    }

    [Fact]
    public async Task A_scene_from_another_story_or_universe_is_refused_in_the_same_words()
    {
        var (client, first) = await SignedInWithUniverse(_factory, "beatforeignscene");
        var second = await CreateUniverse(client, "World beatforeignscene two");

        var home = await CreateStory(client, first.Id, "Home");
        var neighbour = await CreateStory(client, first.Id, "Neighbour");
        var away = await CreateStory(client, second.Id, "Away");

        var own = await CreateScene(client, first.Id, home, "Own");
        var sibling = await CreateScene(client, first.Id, neighbour, "Sibling's");
        var distant = await CreateScene(client, second.Id, away, "Distant");

        var arc = await CreateArc(client, first.Id, home, "Thread");
        var beats = ArcBeats(first.Id, home, arc.Id);

        var fromNeighbour = await Errors(await client.PostAsJsonAsync(beats, new PlotBeatRequest("x", null, null, [own, sibling], null)));
        var fromAway = await Errors(await client.PostAsJsonAsync(beats, new PlotBeatRequest("x", null, null, [distant], null)));
        var fromNowhere = await Errors(await client.PostAsJsonAsync(beats, new PlotBeatRequest("x", null, null, [Guid.NewGuid()], null)));

        Assert.Contains("Link scenes from this story.", fromNeighbour, StringComparison.Ordinal);
        Assert.Equal(fromNowhere, fromNeighbour);
        Assert.Equal(fromNowhere, fromAway);

        var beat = await CreateBeat(client, first.Id, home, arc.Id, "Kept", [own]);
        Assert.Equal(fromNowhere, await Errors(await client.PutAsJsonAsync(
            Beat(first.Id, home, beat.Id), new PlotBeatRequest("Changed", null, null, [sibling], null))));

        var after = Assert.Single(Assert.Single(await Plot(client, first.Id, home)).Beats);
        Assert.Equal(("Kept", beat.Id), (after.Title, after.Id));
        Assert.Equal([own], after.SceneIds);
    }

    [Fact]
    public async Task Moving_reordering_or_redating_a_scene_keeps_its_beat_links_and_moves_no_beat()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beatscenemove");
        var story = await CreateStory(client, universe.Id, "Moving parts");
        var path = Story(universe.Id, story);
        var arrival = await CreateChapter(client, universe.Id, story, "Arrival");
        var ashes = await CreateChapter(client, universe.Id, story, "Ashes");
        var gate = await CreateScene(client, universe.Id, story, "At the gate", arrival);
        var inside = await CreateScene(client, universe.Id, story, "Inside", arrival);
        var embers = await CreateScene(client, universe.Id, story, "Embers");

        var arc = await CreateArc(client, universe.Id, story, "Fall of the King");
        var learns = await CreateBeat(client, universe.Id, story, arc.Id, "Learns of the conspiracy", [gate]);
        var breach = await CreateBeat(client, universe.Id, story, arc.Id, "Capital is breached", [inside, embers]);

        async Task Unmoved()
        {
            var beats = Assert.Single(await Plot(client, universe.Id, story)).Beats;
            Assert.Equal(new (Guid, int)[] { (learns.Id, 0), (breach.Id, 1) }, beats.Select(beat => (beat.Id, beat.SortOrder)));
            Assert.Equal([gate], beats[0].SceneIds);
            Assert.Equal(new[] { inside, embers }.Order(), beats[1].SceneIds.Order());
        }

        // Into another chapter by the position route.
        (await client.PutAsJsonAsync($"{path}/scenes/{gate}/position", new ScenePositionRequest(ashes, null)))
            .EnsureSuccessStatusCode();
        await Unmoved();

        // Into a chapter by an edit, placed in the world at the same time.
        (await client.PutVersionedAsync(
            $"{path}/scenes/{embers}",
            new SceneRequest("Embers", null, null, null, new ChronologyValue(null, 12, null, null), null, arrival)))
            .EnsureSuccessStatusCode();
        await Unmoved();

        // Reordered inside that chapter, and the chapters themselves swapped.
        (await client.PutAsJsonAsync($"{path}/scenes/order", new SceneOrderRequest([embers, inside], arrival)))
            .EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync($"{path}/chapters/order", new ChapterOrderRequest([ashes, arrival])))
            .EnsureSuccessStatusCode();
        await Unmoved();

        // A chapter deleted: its scene goes to Unchaptered and is still the scene the beat names.
        (await client.DeleteAsync($"{path}/chapters/{ashes}")).EnsureSuccessStatusCode();
        await Unmoved();

        // The beat lists its scenes where they read now - Embers before Inside, as the author reordered them.
        Assert.Equal([embers, inside], (await ReadBeat(client, universe.Id, story, breach.Id)).SceneIds);
    }

    [Fact]
    public async Task Deleting_a_scene_hides_only_its_links_and_every_beat_stays_in_place()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beatscenedelete");
        var story = await CreateStory(client, universe.Id, "Cut scenes");
        var council = await CreateScene(client, universe.Id, story, "The Council");
        var siege = await CreateScene(client, universe.Id, story, "The Siege");

        var arc = await CreateArc(client, universe.Id, story, "Thread");
        var a = await CreateBeat(client, universe.Id, story, arc.Id, "a", [council]);
        var b = await CreateBeat(client, universe.Id, story, arc.Id, "b", [council, siege]);
        var c = await CreateBeat(client, universe.Id, story, arc.Id, "c");

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{Story(universe.Id, story)}/scenes/{council}")).StatusCode);

        var beats = Assert.Single(await Plot(client, universe.Id, story)).Beats;
        Assert.Equal(new (Guid, int)[] { (a.Id, 0), (b.Id, 1), (c.Id, 2) }, beats.Select(beat => (beat.Id, beat.SortOrder)));
        Assert.Empty(beats[0].SceneIds);
        Assert.Equal([siege], beats[1].SceneIds);

        // Hidden, not removed: the scene is in the Trash, and its links come back with it (ADR 0029).
        await WithDb(_factory, async db => Assert.Equal(2, await db.PlotBeatScenes.CountAsync(link => link.SceneId == council)));
    }

    // ---------- Lore links ----------

    [Fact]
    public async Task A_beat_links_lore_from_its_own_universe_once_each()
    {
        var (client, first) = await SignedInWithUniverse(_factory, "beatlore");
        var second = await CreateUniverse(client, "World beatlore two");
        var arlen = await CreateEntity(client, first.Id, "Arlen");
        var tower = await CreateEntity(client, first.Id, "White Tower");
        var stranger = await CreateEntity(client, second.Id, "Arlen");

        var story = await CreateStory(client, first.Id, "Lore");
        var arc = await CreateArc(client, first.Id, story, "Thread");

        var beat = await CreateBeat(client, first.Id, story, arc.Id, "Learns", entities: [tower, arlen, arlen]);
        Assert.Equal(["Arlen", "White Tower"], beat.Entities.Select(entity => entity.Name));
        Assert.All(beat.Entities, entity => Assert.False(entity.IsTrashed));

        await WithDb(_factory, async db => Assert.Equal(2, await db.PlotBeatEntities.CountAsync(link => link.PlotBeatId == beat.Id)));

        var beats = ArcBeats(first.Id, story, arc.Id);
        var foreign = await Errors(await client.PostAsJsonAsync(beats, new PlotBeatRequest("x", null, null, null, [stranger])));
        var unknown = await Errors(await client.PostAsJsonAsync(beats, new PlotBeatRequest("x", null, null, null, [Guid.NewGuid()])));
        Assert.Contains("Link entries from this universe.", foreign, StringComparison.Ordinal);
        Assert.Equal(unknown, foreign);

        Assert.Single(Assert.Single(await Plot(client, first.Id, story)).Beats);
    }

    [Fact]
    public async Task An_entry_in_the_Trash_stays_on_a_beat_marked_and_cannot_be_newly_linked()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beattrash");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var tower = await CreateEntity(client, universe.Id, "White Tower");
        var story = await CreateStory(client, universe.Id, "Thrown away");
        var arc = await CreateArc(client, universe.Id, story, "Thread");

        var holds = await CreateBeat(client, universe.Id, story, arc.Id, "Holds both", entities: [arlen, tower]);
        var later = await CreateBeat(client, universe.Id, story, arc.Id, "Only the tower", entities: [tower]);

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{arlen}")).EnsureSuccessStatusCode();

        var read = await ReadBeat(client, universe.Id, story, holds.Id);
        Assert.Equal(
            new (string, bool)[] { ("Arlen", true), ("White Tower", false) },
            read.Entities.Select(entity => (entity.Name, entity.IsTrashed)));

        // Saving the beat whole keeps what it already holds.
        var saved = await PutJson<PlotBeatResponse>(
            client, Beat(universe.Id, story, holds.Id), new PlotBeatRequest("Holds both, renamed", null, null, null, [arlen, tower]));
        Assert.Equal(new[] { arlen, tower }.Order(), saved.Entities.Select(entity => entity.EntityId).Order());

        // But a trashed entry cannot be chosen anew - not on a new beat, and not added to another one.
        var refusal = "An entry in the Trash cannot be newly linked. Restore it first.";
        Assert.Contains(refusal, await Errors(await client.PostAsJsonAsync(
            ArcBeats(universe.Id, story, arc.Id), new PlotBeatRequest("New", null, null, null, [arlen]))), StringComparison.Ordinal);
        Assert.Contains(refusal, await Errors(await client.PutAsJsonAsync(
            Beat(universe.Id, story, later.Id), new PlotBeatRequest("Only the tower", null, null, null, [tower, arlen]))), StringComparison.Ordinal);

        Assert.Equal([tower], (await ReadBeat(client, universe.Id, story, later.Id)).Entities.Select(entity => entity.EntityId));
    }

    [Fact]
    public async Task An_entry_removed_from_the_database_for_good_takes_only_its_link()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beathardentity");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var tower = await CreateEntity(client, universe.Id, "White Tower");
        var story = await CreateStory(client, universe.Id, "Survives");
        var arc = await CreateArc(client, universe.Id, story, "Thread");
        var first = await CreateBeat(client, universe.Id, story, arc.Id, "First");
        var beat = await CreateBeat(client, universe.Id, story, arc.Id, "Survives", entities: [arlen, tower]);

        // Lorex has no permanent delete for an entry. This is the database's own answer if a row ever does go.
        await WithDb(_factory, async db => await db.Entities.Where(entity => entity.Id == arlen).ExecuteDeleteAsync());

        var read = await ReadBeat(client, universe.Id, story, beat.Id);
        Assert.Equal((beat.Id, 1), (read.Id, read.SortOrder));
        Assert.Equal([tower], read.Entities.Select(entity => entity.EntityId));
        Assert.Equal([first.Id, beat.Id], Assert.Single(await Plot(client, universe.Id, story)).Beats.Select(candidate => candidate.Id));
    }

    // ---------- Who may reach one ----------

    [Fact]
    public async Task A_beat_reached_through_another_story_answers_as_missing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "beatelsewhere");
        var home = await CreateStory(client, universe.Id, "Home");
        var neighbour = await CreateStory(client, universe.Id, "Neighbour");
        var arc = await CreateArc(client, universe.Id, home, "Thread");
        var beat = await CreateBeat(client, universe.Id, home, arc.Id, "Belongs home");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Beat(universe.Id, neighbour, beat.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync(
            Beat(universe.Id, neighbour, beat.Id), new PlotBeatRequest("Moved", null, null, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Beat(universe.Id, neighbour, beat.Id))).StatusCode);

        var intact = await ReadBeat(client, universe.Id, home, beat.Id);
        Assert.Equal(("Belongs home", 0), (intact.Title, intact.SortOrder));
    }
}
