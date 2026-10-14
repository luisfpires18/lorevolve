using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A scene's manuscript: the prose itself, read and written on its own route.
///
/// The invariants under test: the text is stored and returned exactly as written; a scene with nothing written reads as
/// an empty manuscript; a save written over text that has since changed is refused and writes nothing; the prose is
/// reachable only through the owner's universe, story and scene; it lives and dies with its scene and nothing else; and
/// it never appears in the story, scene or plot reads, nor becomes Canon, timeline, lore or a search hit.
/// </summary>
public sealed class SceneManuscriptEndpointTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    // ---------- Reading and writing ----------

    [Fact]
    public async Task A_scene_with_nothing_written_reads_as_an_empty_manuscript()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msempty");
        var story = await CreateStory(client, universe.Id, "Unwritten");
        var scene = await CreateScene(client, universe.Id, story, "The Council");

        var read = await ReadManuscript(client, universe.Id, story, scene);

        Assert.Equal(new SceneManuscriptResponse(scene, string.Empty, null, 0), read);
        await WithDb(_factory, async db => Assert.False(await db.SceneManuscripts.AnyAsync(row => row.SceneId == scene)));
    }

    [Fact]
    public async Task The_first_save_creates_the_prose_and_a_later_save_replaces_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "mssave");
        var story = await CreateStory(client, universe.Id, "Drafted");
        var scene = await CreateScene(client, universe.Id, story, "The Council");
        var before = await ReadStory(client, universe.Id, story);

        var first = await PutManuscript(client, universe.Id, story, scene, "The hall had emptied.", 0);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var created = (await first.Content.ReadFromJsonAsync<SceneManuscriptResponse>())!;
        Assert.Equal("The hall had emptied.", created.Content);
        Assert.NotNull(created.UpdatedAt);

        var read = await ReadManuscript(client, universe.Id, story, scene);
        Assert.Equal("The hall had emptied.", read.Content);
        SameMoment(created.UpdatedAt, read.UpdatedAt);

        var second = await PutManuscript(client, universe.Id, story, scene, "Long before Arlen understood.", read.Version);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal("Long before Arlen understood.", (await ReadManuscript(client, universe.Id, story, scene)).Content);

        await WithDb(_factory, async db =>
            Assert.Equal(1, await db.SceneManuscripts.CountAsync(row => row.SceneId == scene)));

        // The author worked on the story, so the story moved; the scene's planning did not change, so the scene did not.
        var after = await ReadStory(client, universe.Id, story);
        Assert.True(after.UpdatedAt > before.UpdatedAt);
        Assert.Equal(before.Scenes.Single().UpdatedAt, after.Scenes.Single().UpdatedAt);
        Assert.Equal(before.Scenes.Single().Title, after.Scenes.Single().Title);
    }

    [Fact]
    public async Task Clearing_a_manuscript_leaves_it_empty_rather_than_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msclear");
        var story = await CreateStory(client, universe.Id, "Second thoughts");
        var scene = await CreateScene(client, universe.Id, story, "The Council");
        await WriteManuscript(client, universe.Id, story, scene, "A false start.");

        var cleared = await WriteManuscript(client, universe.Id, story, scene, string.Empty);

        Assert.Equal(string.Empty, cleared.Content);
        var read = await ReadManuscript(client, universe.Id, story, scene);
        Assert.Equal(string.Empty, read.Content);
        SameMoment(cleared.UpdatedAt, read.UpdatedAt);
    }

    [Fact]
    public async Task Prose_comes_back_exactly_as_written_every_line_break_blank_line_and_character()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msexact");
        var story = await CreateStory(client, universe.Id, "Exact");
        var scene = await CreateScene(client, universe.Id, story, "The Council");

        var saved = await WriteManuscript(client, universe.Id, story, scene, Prose);
        Assert.Equal(Prose, saved.Content, StringComparer.Ordinal);

        // Read back over the wire, and straight from the column: nothing trimmed, normalised or re-encoded on either side.
        Assert.Equal(Prose, (await ReadManuscript(client, universe.Id, story, scene)).Content, StringComparer.Ordinal);
        await WithDb(_factory, async db =>
            Assert.Equal(Prose, (await db.SceneManuscripts.SingleAsync(row => row.SceneId == scene)).Content, StringComparer.Ordinal));
    }

    [Fact]
    public async Task A_manuscript_at_the_limit_saves_and_one_character_more_is_refused_without_writing()
    {
        // The web client mirrors this exact number, and says so before a save rather than after.
        Assert.Equal(1_000_000, StoryLimits.ManuscriptMaxLength);

        var (client, universe) = await SignedInWithUniverse(_factory, "mslimit");
        var story = await CreateStory(client, universe.Id, "Long");
        var scene = await CreateScene(client, universe.Id, story, "The whole war");

        var full = new string('a', StoryLimits.ManuscriptMaxLength);
        var saved = await WriteManuscript(client, universe.Id, story, scene, full);
        Assert.Equal(StoryLimits.ManuscriptMaxLength, saved.Content.Length);

        var over = await PutManuscript(client, universe.Id, story, scene, full + "b", saved.Version);
        Assert.Contains("\"content\"", await Errors(over), StringComparison.Ordinal);

        var kept = await ReadManuscript(client, universe.Id, story, scene);
        Assert.Equal(StoryLimits.ManuscriptMaxLength, kept.Content.Length);
        SameMoment(saved.UpdatedAt, kept.UpdatedAt);
    }

    [Fact]
    public async Task A_save_without_the_text_is_refused_and_wipes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msnull");
        var story = await CreateStory(client, universe.Id, "Careful");
        var scene = await CreateScene(client, universe.Id, story, "The Council");
        var saved = await WriteManuscript(client, universe.Id, story, scene, "Keep me.");

        var missing = await client.PutAsync(
            Manuscript(universe.Id, story, scene),
            JsonContent.Create(new { expectedUpdatedAt = saved.UpdatedAt }));
        Assert.Contains("\"content\"", await Errors(missing), StringComparison.Ordinal);

        var empty = await client.PutAsync(Manuscript(universe.Id, story, scene), JsonContent.Create(new { }));
        Assert.Contains("\"content\"", await Errors(empty), StringComparison.Ordinal);

        Assert.Equal("Keep me.", (await ReadManuscript(client, universe.Id, story, scene)).Content);
    }

    // ---------- Stale saves ----------

    [Fact]
    public async Task A_save_written_over_prose_that_has_since_changed_is_refused_and_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msstale");
        var story = await CreateStory(client, universe.Id, "Two windows");
        var scene = await CreateScene(client, universe.Id, story, "The Council");

        // Both windows open the empty scene. The first saves.
        var opened = await ReadManuscript(client, universe.Id, story, scene);
        var first = await PutManuscript(client, universe.Id, story, scene, "From the first window.", opened.Version);
        var firstSaved = (await first.Content.ReadFromJsonAsync<SceneManuscriptResponse>())!;

        // The second still believes nothing was saved, and is told otherwise - with what is stored now.
        var second = await PutManuscript(client, universe.Id, story, scene, "From the second window.", opened.Version);
        var (code, current, currentVersion) = await Refusal(second);
        Assert.Equal(SceneManuscriptEndpoints.ChangedCode, code);
        SameMoment(firstSaved.UpdatedAt, current);
        Assert.Equal((0, 1, 1), (opened.Version, firstSaved.Version, currentVersion));
        Assert.Equal("From the first window.", (await ReadManuscript(client, universe.Id, story, scene)).Content);

        // Having seen that, its author chooses to keep their own text: naming the version stored now is a deliberate save.
        var kept = await PutManuscript(client, universe.Id, story, scene, "From the second window.", currentVersion);
        Assert.Equal(HttpStatusCode.OK, kept.StatusCode);
        var keptSaved = (await kept.Content.ReadFromJsonAsync<SceneManuscriptResponse>())!;
        Assert.Equal(2, keptSaved.Version);

        // A save naming a version that is no longer the latest is just as stale.
        var older = await PutManuscript(client, universe.Id, story, scene, "Stale again.", firstSaved.Version);
        var olderRefusal = await Refusal(older);
        SameMoment(keptSaved.UpdatedAt, olderRefusal.UpdatedAt);
        Assert.Equal(keptSaved.Version, olderRefusal.CurrentVersion);
        Assert.Equal("From the second window.", (await ReadManuscript(client, universe.Id, story, scene)).Content);

        // A save naming no version, or one ahead of the stored one, is refused the same way.
        await Refusal(await PutManuscript(client, universe.Id, story, scene, "Unnamed.", null));
        await Refusal(await PutManuscript(client, universe.Id, story, scene, "Ahead.", keptSaved.Version + 1));
        Assert.Equal("From the second window.", (await ReadManuscript(client, universe.Id, story, scene)).Content);

        // And a save naming a manuscript that was never written is refused, saying nothing is stored.
        var other = await CreateScene(client, universe.Id, story, "Untouched");
        var imagined = await PutManuscript(client, universe.Id, story, other, "Over nothing.", 1);
        Assert.Equal((SceneManuscriptEndpoints.ChangedCode, (DateTime?)null, 0), await Refusal(imagined));
        await WithDb(_factory, async db => Assert.False(await db.SceneManuscripts.AnyAsync(row => row.SceneId == other)));
    }

    // ---------- Who may reach one ----------

    [Fact]
    public async Task Someone_else_cannot_read_or_write_a_manuscript_and_is_told_nothing_about_it()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "msmine");
        var story = await CreateStory(owner, universe.Id, "Private");
        var scene = await CreateScene(owner, universe.Id, story, "The Council");
        var saved = await WriteManuscript(owner, universe.Id, story, scene, "Only mine.");

        var stranger = await SignedIn(_factory, "user-msyours");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Manuscript(universe.Id, story, scene))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await PutManuscript(stranger, universe.Id, story, scene, "Mine now.", saved.Version)).StatusCode);

        // Not even the shape of a refusal: an invalid body from a stranger is the same 404, never a 400.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await PutManuscript(stranger, universe.Id, story, scene, null, null)).StatusCode);

        var kept = await ReadManuscript(owner, universe.Id, story, scene);
        Assert.Equal("Only mine.", kept.Content);
        SameMoment(saved.UpdatedAt, kept.UpdatedAt);
    }

    [Fact]
    public async Task A_scene_reached_through_another_story_universe_or_account_is_not_found()
    {
        var (client, first) = await SignedInWithUniverse(_factory, "msforeign");
        var second = await CreateUniverse(client, "World msforeign two");

        var story = await CreateStory(client, first.Id, "Home");
        var sibling = await CreateStory(client, first.Id, "Sibling");
        var elsewhere = await CreateStory(client, second.Id, "Elsewhere");
        var scene = await CreateScene(client, first.Id, story, "The Council");
        await WriteManuscript(client, first.Id, story, scene, "Where it belongs.");

        var (stranger, strangerUniverse) = await SignedInWithUniverse(_factory, "msforeignother");
        var strangerStory = await CreateStory(stranger, strangerUniverse.Id, "Theirs");
        var strangerScene = await CreateScene(stranger, strangerUniverse.Id, strangerStory, "Their scene");

        foreach (var (universeId, storyId, sceneId) in new[]
        {
            (first.Id, sibling, scene),
            (second.Id, story, scene),
            (second.Id, elsewhere, scene),
            (first.Id, story, Guid.NewGuid()),
            (first.Id, Guid.NewGuid(), scene),
            (first.Id, story, strangerScene),
        })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Manuscript(universeId, storyId, sceneId))).StatusCode);
            Assert.Equal(
                HttpStatusCode.NotFound,
                (await PutManuscript(client, universeId, storyId, sceneId, "Smuggled.", null)).StatusCode);
        }

        Assert.Equal("Where it belongs.", (await ReadManuscript(client, first.Id, story, scene)).Content);
        Assert.Equal(string.Empty, (await ReadManuscript(stranger, strangerUniverse.Id, strangerStory, strangerScene)).Content);
    }

    // ---------- What a manuscript lives and dies with ----------

    [Fact]
    public async Task Moving_reordering_and_deleting_a_chapter_keep_every_manuscript_exactly()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msmoves");
        var story = await CreateStory(client, universe.Id, "Restructured");
        var arrival = await CreateChapter(client, universe.Id, story, "Arrival");
        var ashes = await CreateChapter(client, universe.Id, story, "Ashes");

        var gate = await CreateScene(client, universe.Id, story, "The Gates", arrival);
        var council = await CreateScene(client, universe.Id, story, "The Council", arrival);
        var breach = await CreateScene(client, universe.Id, story, "The Breach", ashes);
        var prologue = await CreateScene(client, universe.Id, story, "Prologue");

        var written = new Dictionary<Guid, SceneManuscriptResponse>();
        foreach (var (id, text) in new[] { (gate, "Snow at the gates."), (council, Prose), (breach, "Fire."), (prologue, "Before.") })
        {
            written[id] = await WriteManuscript(client, universe.Id, story, id, text);
        }

        // Reordered inside a chapter, moved across by position, and moved by an edit to its chapter.
        await PutJson<List<SceneResponse>>(
            client, $"{Story(universe.Id, story)}/scenes/order", new SceneOrderRequest([council, gate], arrival));
        await PutJson<StoryDetail>(
            client, $"{Story(universe.Id, story)}/scenes/{breach}/position", new ScenePositionRequest(arrival, 0));
        await PutJson<SceneResponse>(
            client,
            $"{Story(universe.Id, story)}/scenes/{council}",
            new SceneRequest("The Council", "Mira betrays him.", null, null, null, null, ashes));

        // A chapter deleted moves its scenes to Unchaptered, and every one keeps its prose.
        (await client.DeleteAsync($"{Story(universe.Id, story)}/chapters/{arrival}")).EnsureSuccessStatusCode();

        var read = await ReadStory(client, universe.Id, story);
        Assert.Equal(["Prologue", "The Breach", "The Gates", "The Council"], read.Scenes.Select(scene => scene.Title));

        foreach (var (id, saved) in written)
        {
            var kept = await ReadManuscript(client, universe.Id, story, id);
            Assert.Equal(saved.Content, kept.Content, StringComparer.Ordinal);
            SameMoment(saved.UpdatedAt, kept.UpdatedAt);
        }
    }

    [Fact]
    public async Task Deleting_a_scene_puts_its_manuscript_out_of_reach_with_it_and_touches_no_other()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msscenedelete");
        var story = await CreateStory(client, universe.Id, "Cut");
        var doomed = await CreateScene(client, universe.Id, story, "Cut scene");
        var kept = await CreateScene(client, universe.Id, story, "Kept scene");
        await WriteManuscript(client, universe.Id, story, doomed, "Cut prose.");
        await WriteManuscript(client, universe.Id, story, kept, "Kept prose.");

        (await client.DeleteAsync($"{Story(universe.Id, story)}/scenes/{doomed}")).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Manuscript(universe.Id, story, doomed))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await PutManuscript(client, universe.Id, story, doomed, "Written into the Trash.", 1)).StatusCode);
        Assert.Equal("Kept prose.", (await ReadManuscript(client, universe.Id, story, kept)).Content);

        // Kept, word for word, for the scene's restore (ADR 0029).
        await WithDb(_factory, async db =>
            Assert.Equal("Cut prose.", (await db.SceneManuscripts.SingleAsync(row => row.SceneId == doomed)).Content));
    }

    [Fact]
    public async Task A_story_in_the_trash_keeps_its_manuscripts_and_deleting_the_universe_takes_them_for_good()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msstorydelete");
        var doomedStory = await CreateStory(client, universe.Id, "Abandoned");
        var keptStory = await CreateStory(client, universe.Id, "Kept");
        var doomedScene = await CreateScene(client, universe.Id, doomedStory, "Abandoned scene");
        var keptScene = await CreateScene(client, universe.Id, keptStory, "Kept scene");
        await WriteManuscript(client, universe.Id, doomedStory, doomedScene, "Abandoned prose.");
        await WriteManuscript(client, universe.Id, keptStory, keptScene, "Kept prose.");

        (await client.DeleteAsync(Story(universe.Id, doomedStory))).EnsureSuccessStatusCode();

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(Manuscript(universe.Id, doomedStory, doomedScene))).StatusCode);
        Assert.Equal("Kept prose.", (await ReadManuscript(client, universe.Id, keptStory, keptScene)).Content);

        await WithDb(_factory, async db =>
        {
            Assert.True(await db.SceneManuscripts.AnyAsync(row => row.SceneId == doomedScene));
            Assert.True(await db.SceneManuscriptRevisions.AnyAsync(row => row.SceneId == doomedScene));
            Assert.True(await db.SceneManuscripts.AnyAsync(row => row.SceneId == keptScene));
        });

        (await client.PostAsync($"/api/universes/{universe.Id}/archive", content: null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{universe.Id}")).StatusCode);

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.SceneManuscripts.AnyAsync(row => row.SceneId == keptScene || row.SceneId == doomedScene));
            Assert.False(await db.SceneManuscriptRevisions.AnyAsync(row => row.SceneId == keptScene || row.SceneId == doomedScene));
        });
    }

    [Fact]
    public async Task Trashing_the_lore_a_scene_points_at_leaves_its_manuscript_alone()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "mstrash");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var story = await CreateStory(client, universe.Id, "Through his eyes");
        var scene = (await PostJson<SceneResponse>(
            client,
            $"{Story(universe.Id, story)}/scenes",
            new SceneRequest("The Council", null, null, arlen, null, [arlen]))).Id;
        var saved = await WriteManuscript(client, universe.Id, story, scene, "Arlen watched the hall empty.");

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{arlen}")).EnsureSuccessStatusCode();

        var kept = await ReadManuscript(client, universe.Id, story, scene);
        Assert.Equal("Arlen watched the hall empty.", kept.Content);
        SameMoment(saved.UpdatedAt, kept.UpdatedAt);
    }

    // ---------- Prose is not lore, and not the outline ----------

    [Fact]
    public async Task Prose_creates_no_canon_no_timeline_no_lore_change_no_plot_and_no_search_hit()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msnotlore");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var entryBefore = await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{arlen}");

        var story = await CreateStory(client, universe.Id, "What happened");
        var scene = (await PostJson<SceneResponse>(
            client,
            $"{Story(universe.Id, story)}/scenes",
            new SceneRequest("The Council", null, null, arlen, null, [arlen]))).Id;

        await WriteManuscript(
            client,
            universe.Id,
            story,
            scene,
            "The king died before sunrise.\nArlen was born in 312 and died in 340, the year he married Mira.\n");

        var conflicts = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universe.Id}/canon-conflicts?pageSize=100"))!;
        Assert.Empty(conflicts.Items);

        var timeline = (await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{universe.Id}/timeline"))!;
        Assert.Equal(0, timeline.TotalCount);

        Assert.Equal(entryBefore, await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{arlen}"));
        Assert.Empty(await Plot(client, universe.Id, story));

        // Lore search means lore: a word only the prose holds finds nothing, and the name finds only the entry.
        var sunrise = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universe.Id}/entities?search=sunrise"))!;
        Assert.Equal(0, sunrise.TotalCount);
        var name = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universe.Id}/entities?search=Arlen"))!;
        Assert.Equal([arlen], name.Items.Select(item => item.Id));
    }

    [Fact]
    public async Task No_story_scene_chapter_or_plot_read_carries_prose_however_long_it_is()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "mspayload");
        var story = await CreateStory(client, universe.Id, "Outlined");
        var chapter = await CreateChapter(client, universe.Id, story, "Arrival");
        var council = await CreateScene(client, universe.Id, story, "The Council", chapter);
        var gate = await CreateScene(client, universe.Id, story, "The Gates", chapter);
        var arc = await CreateArc(client, universe.Id, story, "Fall of the King");
        await CreateBeat(client, universe.Id, story, arc.Id, "Capital is breached", [council]);

        string[] reads =
        [
            Stories(universe.Id),
            Story(universe.Id, story),
            $"{Story(universe.Id, story)}/scenes",
            $"{Story(universe.Id, story)}/scenes/{council}",
            $"{Story(universe.Id, story)}/chapters",
            $"{Story(universe.Id, story)}/chapters/{chapter}",
            Arcs(universe.Id, story),
        ];

        var before = new Dictionary<string, string>();
        foreach (var path in reads)
        {
            before[path] = await client.GetStringAsync(path);
        }

        // A long scene: well over four hundred thousand characters, every line marked.
        const string marker = "ZQXJ-PROSE-ONLY";
        var prose = string.Concat(Enumerable.Repeat($"{marker} The hall had emptied long before Arlen understood.\n", 8_000));
        await WriteManuscript(client, universe.Id, story, council, prose);

        foreach (var path in reads)
        {
            var after = await client.GetStringAsync(path);
            Assert.DoesNotContain(marker, after, StringComparison.Ordinal);

            // Only the story's own timestamp moved; a few characters either way, never the prose.
            Assert.InRange(after.Length, before[path].Length - 16, before[path].Length + 16);
        }

        // Nor any write that answers with the story's structure.
        var reordered = await client.PutAsJsonAsync(
            $"{Story(universe.Id, story)}/scenes/order", new SceneOrderRequest([gate, council], chapter));
        var moved = await client.PutAsJsonAsync(
            $"{Story(universe.Id, story)}/scenes/{council}/position", new ScenePositionRequest(null, null));
        var edited = await client.PutVersionedAsync(
            $"{Story(universe.Id, story)}/scenes/{council}",
            new SceneRequest("The Council", "Mira betrays him.", null, null, null, null));

        foreach (var response in new[] { reordered, moved, edited })
        {
            response.EnsureSuccessStatusCode();
            Assert.DoesNotContain(marker, await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }

        Assert.Equal(prose, (await ReadManuscript(client, universe.Id, story, council)).Content, StringComparer.Ordinal);
    }
}
