using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.ManuscriptTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The Story phase as one product: a story with chapters, Unchaptered scenes, lore references, a plot and prose, taken
/// apart piece by piece. Each feature's own tests prove its corner of the ownership graph; these walk the whole graph in
/// one universe, beside a second story holding the same lore, so a change to one feature that reaches into another
/// shows up here.
///
/// The invariants: a story owns its chapters, scenes, plot and prose, and nothing it points at; a chapter owns no scene;
/// a scene owns its prose and its links and no beat; an arc owns its beats; and nothing a story does - telling, planning,
/// writing or deleting - changes the lore, its relationships, its timeline, its history, Canon Integrity or search.
/// </summary>
public sealed class StoryPhaseIntegrityTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_story_owns_its_chapters_scenes_plot_and_prose_and_nothing_it_points_at()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "phaseowns");
        var u = universe.Id;
        var arlen = await CreateEntity(client, u, "Arlen");
        var mira = await CreateEntity(client, u, "Mira");

        var story = await CreateStory(client, u, "The Long Winter");
        var arrival = await CreateChapter(client, u, story, "Arrival");
        var ashes = await CreateChapter(client, u, story, "Ashes");

        var prologue = await AddScene(client, u, story, "Prologue", null, mira, [arlen], year: 30);
        var gate = await AddScene(client, u, story, "The Gates", arrival, arlen, [mira], year: -40);
        var council = await AddScene(client, u, story, "The Council", arrival, null, [arlen, mira]);
        var breach = await AddScene(client, u, story, "The Breach", ashes, mira, []);
        Guid[] scenes = [prologue, gate, council, breach];

        var prose = new Dictionary<Guid, string>();
        foreach (var scene in scenes)
        {
            prose[scene] = $"{Prose}Scene {scene}.";
            await WriteManuscript(client, u, story, scene, prose[scene]);
        }

        var fall = (await CreateArc(client, u, story, "Fall of the King")).Id;
        var betrayal = (await CreateArc(client, u, story, "Mira's Betrayal")).Id;
        var refused = (await CreateBeat(client, u, story, fall, "The crown is refused", [gate, council], [arlen])).Id;
        var letter = (await CreateBeat(client, u, story, betrayal, "The letter", [prologue, council, breach], [mira])).Id;
        var unplaced = (await CreateBeat(client, u, story, betrayal, "Someone finally sits")).Id;
        Guid[] beats = [refused, letter, unplaced];

        // A second telling in the same universe, holding the same lore, which nothing below may touch.
        var other = await CreateStory(client, u, "Another telling");
        var elsewhere = await AddScene(client, u, other, "Elsewhere", null, arlen, [mira]);
        await WriteManuscript(client, u, other, elsewhere, "Prose from another telling.");
        var otherArc = (await CreateArc(client, u, other, "Another thread")).Id;
        var otherBeat = (await CreateBeat(client, u, other, otherArc, "Another step", [elsewhere], [arlen, mira])).Id;
        var otherHoldings = new Holdings(Chapters: 0, Scenes: 1, SceneLinks: 1, Manuscripts: 1, Arcs: 1, Beats: 1, BeatScenes: 1, BeatEntities: 2);
        Assert.Equal(otherHoldings, await HoldingsOf(other, [elsewhere], [otherBeat]));

        var whole = new Holdings(Chapters: 2, Scenes: 4, SceneLinks: 4, Manuscripts: 4, Arcs: 2, Beats: 3, BeatScenes: 5, BeatEntities: 2);
        Assert.Equal(whole, await HoldingsOf(story, scenes, beats));

        // Mira goes to the Trash: every reference to her stays, marked, and nothing the story holds goes with her.
        (await client.DeleteAsync($"/api/universes/{u}/entities/{mira}")).EnsureSuccessStatusCode();

        Assert.Equal(whole, await HoldingsOf(story, scenes, beats));
        var read = await ReadStory(client, u, story);
        Assert.True(read.Scenes.Single(scene => scene.Id == prologue).Pov!.IsTrashed);
        Assert.True(read.Scenes.Single(scene => scene.Id == gate).Entities.Single().IsTrashed);
        Assert.True(BeatIn(await Plot(client, u, story), letter).Entities.Single().IsTrashed);
        await AssertProse(client, u, story, prose);

        // Since content recovery every delete below is a move to the Trash (ADR 0029): each piece leaves every read, and not
        // one row the story held is erased - so the database holds exactly what it held before the first one.

        // Arrival is deleted: its scenes are told last in Unchaptered, with their prose and every beat pointing at them.
        (await client.DeleteAsync($"{Story(u, story)}/chapters/{arrival}")).EnsureSuccessStatusCode();

        read = await ReadStory(client, u, story);
        Assert.Equal([prologue, gate, council], read.Scenes.Where(scene => scene.ChapterId is null).Select(scene => scene.Id));
        Assert.Equal([ashes], read.Chapters.Select(chapter => chapter.Id));
        Assert.Equal(whole, await HoldingsOf(story, scenes, beats));
        Assert.Equal([gate, council], BeatIn(await Plot(client, u, story), refused).SceneIds);
        await AssertProse(client, u, story, prose);

        // The Council is deleted: its prose, its lore links and its place in two beats leave every read. Both beats stay.
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{council}")).EnsureSuccessStatusCode();
        prose.Remove(council);

        Assert.Equal(whole, await HoldingsOf(story, scenes, beats));
        var plot = await Plot(client, u, story);
        Assert.Equal([gate], BeatIn(plot, refused).SceneIds);
        Assert.Equal([prologue, breach], BeatIn(plot, letter).SceneIds);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Manuscript(u, story, council))).StatusCode);
        await AssertProse(client, u, story, prose);
        await AssertLore(live: arlen, trashed: mira);

        // The Fall of the King is deleted: it and its beat leave the plot. No scene, prose or entry moves.
        (await client.DeleteAsync(Arc(u, story, fall))).EnsureSuccessStatusCode();

        Assert.Equal(whole, await HoldingsOf(story, scenes, beats));
        Assert.Equal([betrayal], (await Plot(client, u, story)).Select(arc => arc.Id));
        await AssertProse(client, u, story, prose);
        await AssertLore(live: arlen, trashed: mira);

        // The story is deleted: every read of it answers as missing. The other telling and the lore stay exactly as they were.
        (await client.DeleteAsync(Story(u, story))).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Story(u, story))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Manuscript(u, story, gate))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Arcs(u, story))).StatusCode);
        Assert.Equal(whole, await HoldingsOf(story, scenes, beats));
        Assert.Equal(otherHoldings, await HoldingsOf(other, [elsewhere], [otherBeat]));
        Assert.Equal("Prose from another telling.", (await ReadManuscript(client, u, other, elsewhere)).Content);
        await AssertLore(live: arlen, trashed: mira);

        // Restored, the story comes back holding what it held when it went. What went before it - Arrival, The Council and
        // the Fall of the King - is still in the Trash on its own account.
        (await client.PostAsync($"/api/universes/{u}/trash/stories/{story}/restore", content: null)).EnsureSuccessStatusCode();

        read = await ReadStory(client, u, story);
        Assert.Equal([prologue, gate, breach], read.Scenes.Select(scene => scene.Id));
        Assert.Equal([ashes], read.Chapters.Select(chapter => chapter.Id));
        Assert.Equal([betrayal], (await Plot(client, u, story)).Select(arc => arc.Id));
        await AssertProse(client, u, story, prose);

        // Only deleting the universe removes any of it for good, and then it removes all of it.
        (await client.PostAsync($"/api/universes/{u}/archive", content: null)).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"/api/universes/{u}")).EnsureSuccessStatusCode();

        Assert.Equal(new Holdings(0, 0, 0, 0, 0, 0, 0, 0), await HoldingsOf(story, scenes, beats));
        Assert.Equal(new Holdings(0, 0, 0, 0, 0, 0, 0, 0), await HoldingsOf(other, [elsewhere], [otherBeat]));
    }

    [Fact]
    public async Task Telling_planning_writing_and_taking_apart_a_story_leaves_the_lore_exactly_as_it_was()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "phasenotlore");
        var u = universe.Id;
        var arlen = await CreateEntity(client, u, "Arlen");
        var mira = await CreateEntity(client, u, "Mira");
        Guid[] lore = [arlen, mira];

        var kind = await PostJson<RelationshipTypeResponse>(
            client,
            $"/api/universes/{u}/relationship-types",
            new RelationshipTypeRequest("Sworn to the gate of", "Holds the oath of", false, null, null));
        (await client.PostAsJsonAsync(
            $"/api/universes/{u}/relationships",
            new RelationshipRequest(kind.Id, arlen, mira, CanonStatus.Canon, null, null, null))).EnsureSuccessStatusCode();

        // Evaluated first, so whatever the lore itself gives rise to is already on record before a story exists.
        var detected = (await Evaluate(client, u)).Detected;
        var before = await Lore(client, u, lore);

        // A story that says a great deal about Arlen and Mira, none of it true until the lore says so.
        var story = await CreateStory(client, u, "What happened");
        var chapter = await CreateChapter(client, u, story, "The death of the king");
        var death = await AddScene(client, u, story, "Arlen dies", chapter, arlen, [arlen, mira], year: 340);
        var birth = await AddScene(client, u, story, "Arlen is born", null, arlen, [arlen], year: 312);
        await PutJson<StoryDetail>(client, $"{Story(u, story)}/scenes/{birth}/position", new ScenePositionRequest(chapter, 0));
        await WriteManuscript(
            client, u, story, death, "The king died before sunrise.\nArlen was born in 312 and died in 340, the year he married Mira.\n");
        var arc = (await CreateArc(client, u, story, "The king dies", "Arlen dies, and Mira marries again.")).Id;
        await CreateBeat(client, u, story, arc, "Mira marries Arlen", [death, birth], lore, "They are married in 339.");
        await PutJson<StoryDetail>(client, Story(u, story), new StoryRequest("What happened", "Arlen dies.", StoryStatus.Complete));

        Assert.Equal(detected, (await Evaluate(client, u)).Detected);
        Assert.Equal(before, await Lore(client, u, lore));

        // Lore search means lore: words only the story holds find nothing.
        foreach (var word in new[] { "sunrise", "married" })
        {
            var hits = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{u}/entities?search={word}"))!;
            Assert.Equal(0, hits.TotalCount);
        }

        // Taken apart, piece by piece and then whole, and still nothing about the lore has moved.
        (await client.DeleteAsync($"{Story(u, story)}/chapters/{chapter}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{birth}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Arc(u, story, arc))).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Story(u, story))).EnsureSuccessStatusCode();

        Assert.Equal(detected, (await Evaluate(client, u)).Detected);
        Assert.Equal(before, await Lore(client, u, lore));
    }

    // ---------- Steps ----------

    private static async Task<Guid> AddScene(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        string title,
        Guid? chapterId,
        Guid? pov,
        IReadOnlyList<Guid> lore,
        int? year = null) =>
        (await PostJson<SceneResponse>(
            client,
            $"{Story(universeId, storyId)}/scenes",
            new SceneRequest(title, null, null, pov, year is null ? null : new ChronologyValue(null, year, null, null), lore, chapterId))).Id;

    private static PlotBeatResponse BeatIn(List<PlotArcResponse> plot, Guid beatId) =>
        plot.SelectMany(arc => arc.Beats).Single(beat => beat.Id == beatId);

    private static Task<CanonEvaluationResponse> Evaluate(HttpClient client, Guid universeId) =>
        PostJson<CanonEvaluationResponse>(client, $"/api/universes/{universeId}/canon-conflicts/evaluate", new { });

    private static async Task AssertProse(HttpClient client, Guid universeId, Guid storyId, Dictionary<Guid, string> prose)
    {
        foreach (var (scene, text) in prose)
        {
            Assert.Equal(text, (await ReadManuscript(client, universeId, storyId, scene)).Content, StringComparer.Ordinal);
        }
    }

    private Task AssertLore(Guid live, Guid trashed) =>
        WithDb(_factory, async db =>
        {
            Assert.True(await db.Entities.AnyAsync(entity => entity.Id == live && entity.DeletedAt == null));
            Assert.True(await db.Entities.AnyAsync(entity => entity.Id == trashed && entity.DeletedAt != null));
        });

    /// <summary>What one story holds, counted straight from the database by the ids it was ever given.</summary>
    private sealed record Holdings(
        int Chapters,
        int Scenes,
        int SceneLinks,
        int Manuscripts,
        int Arcs,
        int Beats,
        int BeatScenes,
        int BeatEntities);

    private async Task<Holdings> HoldingsOf(Guid storyId, Guid[] sceneIds, Guid[] beatIds)
    {
        Holdings? holdings = null;
        await WithDb(_factory, async db =>
        {
            holdings = new Holdings(
                await db.Chapters.CountAsync(chapter => chapter.StoryId == storyId),
                await db.Scenes.CountAsync(scene => scene.StoryId == storyId),
                await db.SceneEntityLinks.CountAsync(link => sceneIds.Contains(link.SceneId)),
                await db.SceneManuscripts.CountAsync(manuscript => sceneIds.Contains(manuscript.SceneId)),
                await db.PlotArcs.CountAsync(arc => arc.StoryId == storyId),
                await db.PlotBeats.CountAsync(beat => beatIds.Contains(beat.Id)),
                await db.PlotBeatScenes.CountAsync(link => beatIds.Contains(link.PlotBeatId)),
                await db.PlotBeatEntities.CountAsync(link => beatIds.Contains(link.PlotBeatId)));
        });
        return holdings!;
    }

    /// <summary>
    /// Everything about the lore a story could conceivably reach: each entry as the API reads it - its timestamps
    /// included - the timeline, and every row a write to the lore leaves behind, counted.
    /// </summary>
    private async Task<string> Lore(HttpClient client, Guid universeId, Guid[] entities)
    {
        var parts = new List<string>();
        foreach (var entity in entities)
        {
            parts.Add(await client.GetStringAsync($"/api/universes/{universeId}/entities/{entity}"));
        }

        parts.Add(await client.GetStringAsync($"/api/universes/{universeId}/timeline"));

        await WithDb(_factory, async db =>
        {
            parts.Add($"entries {await db.Entities.CountAsync(entity => entity.UniverseId == universeId)}");
            parts.Add($"revisions {await db.EntityRevisions.CountAsync(revision => entities.Contains(revision.EntityId))}");
            parts.Add($"values {await db.EntityFieldValues.CountAsync(value => entities.Contains(value.EntityId))}");
            parts.Add($"relationships {await db.Relationships.CountAsync(link => entities.Contains(link.SourceEntityId))}");
            parts.Add($"timeline {await db.TimelineEntries.CountAsync(entry => entry.UniverseId == universeId)}");
            parts.Add($"conflicts {await db.CanonConflicts.CountAsync(conflict => conflict.UniverseId == universeId)}");
        });

        return string.Join('\n', parts);
    }
}
