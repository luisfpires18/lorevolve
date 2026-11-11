using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Stories;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Arcs, the chapters in them and the beats of scenes in the universe backup (format version 37, ADR 0070).
///
/// All of it is authored - an arc's text and order, which arc a chapter is in, a scene's beats and their order - so a backup
/// that dropped it would lose work. What it carries is exactly that, as ids and authored text: no number, no count, and no
/// copy of what an id points at. A file from before version 37 carried plot instead, and restores without any of it.
/// </summary>
public sealed class PlotBackupTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_backup_carries_each_storys_arcs_its_chapters_arcs_and_its_scenes_beats_in_order()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcbackup");
        var world = await BuildStructure(client, universe.Id);

        var backup = await Backup(client, universe.Id);
        Assert.Equal(38, UniverseBackup.CurrentVersion);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);

        var stories = backup.Payload.Stories!;
        Assert.Equal(["Plotted", "Unplotted"], stories.Select(story => story.Title));

        // A story with no arcs carries an empty list, not a missing one.
        Assert.NotNull(stories[1].PlotArcs);
        Assert.Empty(stories[1].PlotArcs!);

        // The order the author set, which is not the order the arcs were written in.
        var plotted = stories[0];
        Assert.Equal(new (Guid, int)[] { (world.Mira, 0), (world.Fall, 1) }, plotted.PlotArcs!.Select(arc => (arc.Id, arc.SortOrder)));
        var fall = plotted.PlotArcs![1];
        Assert.Equal(("Fall of the King", "The throne is lost.", "Slow burn."), (fall.Title, fall.Description, fall.Notes));

        Assert.Equal(world.Fall, plotted.Chapters!.Single(chapter => chapter.Id == world.Ashes).PlotArcId);
        Assert.Null(plotted.Chapters!.Single(chapter => chapter.Id == world.Loose).PlotArcId);

        var siege = plotted.Scenes.Single(scene => scene.Id == world.Siege);
        Assert.Equal(
            new (string, int)[] { ("Capital is breached", 0), ("Learns of the conspiracy", 1) },
            siege.Beats!.Select(beat => (beat.Title, beat.SortOrder)));
        Assert.Empty(plotted.Scenes.Single(scene => scene.Id == world.Escape).Beats!);
    }

    [Fact]
    public async Task Arcs_and_beats_in_a_backup_are_ids_and_authored_text_and_nothing_derived()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcbackupshape");
        await BuildStructure(client, universe.Id);

        using var document = JsonDocument.Parse(DocumentText(await RawArchive(client, universe.Id)));
        var plotted = document.RootElement
            .GetProperty("payload")
            .GetProperty("stories")
            .EnumerateArray()
            .Single(story => story.GetProperty("title").GetString() == "Plotted");

        var arc = plotted.GetProperty("plotArcs")[1];
        var beat = plotted.GetProperty("scenes").EnumerateArray()
            .Single(scene => scene.GetProperty("title").GetString() == "The Siege")
            .GetProperty("beats")[0];

        Assert.Equal(["createdAt", "deletedAt", "description", "id", "notes", "sortOrder", "title", "updatedAt"], Names(arc));
        Assert.Equal(["createdAt", "id", "note", "sortOrder", "title", "updatedAt"], Names(beat));
        Assert.Contains("plotArcId", Names(plotted.GetProperty("chapters")[0]));

        var arcs = plotted.GetProperty("plotArcs").GetRawText();
        Assert.DoesNotContain("Ashes", arcs, StringComparison.Ordinal);
        Assert.DoesNotContain("The Siege", arcs, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_restore_brings_back_every_chapters_arc_and_every_scenes_beats()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcrestore");
        var world = await BuildStructure(client, universe.Id);

        var restored = await RestoreArchive(client, await RawArchive(client, universe.Id), "Arcs restored");
        var story = (await client.GetFromJsonAsync<List<StorySummary>>(Stories(restored.Id)))!.Single(candidate => candidate.Title == "Plotted");
        var read = await ReadStory(client, restored.Id, story.Id);

        Assert.Equal(["Mira's Betrayal", "Fall of the King"], read.Arcs.Select(arc => arc.Title));
        var fall = read.Arcs[1].Id;
        Assert.Equal(fall, read.Chapters.Single(chapter => chapter.Title == "Ashes").PlotArcId);
        Assert.Null(read.Chapters.Single(chapter => chapter.Title == "Loose").PlotArcId);
        Assert.Equal(
            ["Capital is breached", "Learns of the conspiracy"],
            read.Scenes.Single(scene => scene.Title == "The Siege").Beats!.Select(beat => beat.Title));
        Assert.NotEqual(world.Fall, fall);
    }

    [Fact]
    public async Task A_file_from_before_version_37_restores_without_any_arc_or_beat()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcolder");
        await BuildStructure(client, universe.Id);

        var older = Downgrade(await RawArchive(client, universe.Id), 36);
        var restored = await RestoreArchive(client, older, "Arcs older");
        var story = (await client.GetFromJsonAsync<List<StorySummary>>(Stories(restored.Id)))!.Single(candidate => candidate.Title == "Plotted");
        var read = await ReadStory(client, restored.Id, story.Id);

        // Plot was retired: an older file's arcs were plot, and none of it comes back. Every chapter and scene does.
        Assert.Empty(read.Arcs);
        Assert.Equal(["Loose", "Ashes"], read.Chapters.Select(chapter => chapter.Title));
        Assert.All(read.Chapters, chapter => Assert.Null(chapter.PlotArcId));
        Assert.Equal(2, read.Scenes.Count);
        Assert.All(read.Scenes, scene => Assert.Empty(scene.Beats!));
    }

    [Fact]
    public async Task A_chapter_in_another_storys_arc_or_two_beats_in_one_place_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcrefused");
        var world = await BuildStructure(client, universe.Id);
        var archive = await RawArchive(client, universe.Id);
        var otherArc = (await CreateArc(client, universe.Id, world.Unplotted, "Elsewhere")).Id;
        var withOther = await RawArchive(client, universe.Id);

        var foreign = Rewrite(withOther, root =>
        {
            var chapter = StoryTitled(root, "Plotted")["chapters"]!.AsArray().First(item => item!["title"]!.GetValue<string>() == "Ashes")!;
            chapter["plotArcId"] = otherArc.ToString();
        });
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, (await Validate(client, foreign)).StatusCode);

        var clash = Rewrite(archive, root =>
        {
            var beats = SceneTitled(root, "The Siege")["beats"]!.AsArray();
            beats[1]!["sortOrder"] = 0;
        });
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, (await Validate(client, clash)).StatusCode);
    }

    [Fact]
    public async Task An_unchanged_story_produces_the_same_payload()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arcbackupstable");
        await BuildStructure(client, universe.Id);

        var first = PayloadText(DocumentText(await RawArchive(client, universe.Id)));
        var second = PayloadText(DocumentText(await RawArchive(client, universe.Id)));

        Assert.Equal(first, second);
    }

    // ---------- Building ----------

    private sealed record Structure(
        Guid Story, Guid Unplotted, Guid Fall, Guid Mira, Guid Ashes, Guid Loose, Guid Siege, Guid Escape);

    /// <summary>
    /// Two stories, one with arcs and one without. The first has two arcs, written Fall then Mira and reordered Mira first; a
    /// chapter in Fall and one in no arc; and a scene with two beats.
    /// </summary>
    private static async Task<Structure> BuildStructure(HttpClient client, Guid universeId)
    {
        var story = await CreateStory(client, universeId, "Plotted");
        var unplotted = await CreateStory(client, universeId, "Unplotted");

        var fall = await CreateArc(client, universeId, story, "Fall of the King", "The throne is lost.", "Slow burn.");
        var mira = await CreateArc(client, universeId, story, "Mira's Betrayal");
        await PutJson<List<PlotArcResponse>>(
            client, $"{Arcs(universeId, story)}/order", new PlotArcOrderRequest([mira.Id, fall.Id]));

        var ashes = await CreateChapter(client, universeId, story, "Ashes");
        var loose = await CreateChapter(client, universeId, story, "Loose");
        await MoveChapterToArc(client, universeId, story, ashes, fall.Id);
        var siege = await CreateScene(client, universeId, story, "The Siege", ashes);
        var escape = await CreateScene(client, universeId, story, "Escape");
        await SetBeats(client, universeId, story, siege, "Capital is breached", "Learns of the conspiracy");

        return new Structure(story, unplotted, fall.Id, mira.Id, ashes, loose, siege, escape);
    }

    private static List<string> Names(JsonElement element) =>
        [.. element.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal)];
}
