using System.Text.Json;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Stories;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Plot in the universe backup (format version 7).
///
/// Arcs and beats are authored - their text, their order and every link - so a backup that dropped them would lose
/// work. What it carries is exactly that: each story's arcs in order, each arc's beats in order, and each beat's
/// scene and entry links as ids. Nothing a reader could derive from the rest of the file - a scene's title, its
/// chapter, an entry's name, an arc or beat number - is repeated in it.
/// </summary>
public sealed class PlotBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_backup_carries_each_storys_arcs_and_beats_in_order_with_their_text_and_links()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "plotbackup");
        var world = await BuildPlot(client, universe.Id);

        // Plot arrived in version 7; prose, articles and the Trash moved the file on without changing how a live plot travels.
        var backup = await Backup(client, universe.Id);
        Assert.Equal(31, backup.FormatVersion);

        var stories = backup.Payload.Stories!;
        Assert.Equal(["Plotted", "Unplotted"], stories.Select(story => story.Title));

        // A story with no plot carries an empty list, not a missing one.
        Assert.NotNull(stories[1].PlotArcs);
        Assert.Empty(stories[1].PlotArcs!);

        // The order the author set, which is not the order the arcs and beats were written in.
        var arcs = stories[0].PlotArcs!;
        Assert.Equal(new (Guid, int)[] { (world.Mira, 0), (world.Fall, 1) }, arcs.Select(arc => (arc.Id, arc.SortOrder)));

        var fall = arcs[1];
        Assert.Equal("Fall of the King", fall.Title);
        Assert.Equal("The throne is lost.", fall.Description);
        Assert.Equal("Slow burn.", fall.Notes);
        Assert.Null(arcs[0].Description);
        Assert.Null(arcs[0].Notes);
        Assert.Equal(["Reveals the gate route"], arcs[0].Beats.Select(beat => beat.Title));

        Assert.Equal(new (Guid, int)[] { (world.Breach, 0), (world.Learns, 1) }, fall.Beats.Select(beat => (beat.Id, beat.SortOrder)));

        var learns = fall.Beats[1];
        Assert.Equal("Learns of the conspiracy", learns.Title);
        Assert.Equal("A letter.", learns.Description);
        Assert.Equal("Early.", learns.Notes);

        // Links sorted by id, so the bytes do not depend on the order they were chosen in.
        Assert.Equal(Ordinal(world.Siege, world.Escape), learns.LinkedSceneIds);
        Assert.Equal(Ordinal(world.Arlen, world.Tower), learns.LinkedEntityIds);

        Assert.Equal([world.Siege], fall.Beats[0].LinkedSceneIds);
        Assert.Empty(fall.Beats[0].LinkedEntityIds);
    }

    [Fact]
    public async Task A_plot_in_a_backup_is_ids_and_authored_text_and_nothing_derived()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "plotbackupshape");
        await BuildPlot(client, universe.Id);

        using var document = JsonDocument.Parse(DocumentText(await RawArchive(client, universe.Id)));
        var plotted = document.RootElement
            .GetProperty("payload")
            .GetProperty("stories")
            .EnumerateArray()
            .Single(story => story.GetProperty("title").GetString() == "Plotted");

        var arcs = plotted.GetProperty("plotArcs");
        var arc = arcs[1];
        var beat = arc.GetProperty("beats")[1];

        // No number, no count, and no copy of what a link points at. Only whether it is in the Trash (version 10).
        Assert.Equal(
            ["beats", "createdAt", "deletedAt", "description", "id", "notes", "sortOrder", "title", "updatedAt"],
            Names(arc));
        Assert.Equal(
            ["createdAt", "deletedAt", "description", "id", "linkedEntityIds", "linkedSceneIds", "notes", "sortOrder", "title", "updatedAt"],
            Names(beat));
        Assert.Equal(JsonValueKind.Null, arc.GetProperty("deletedAt").ValueKind);

        var plot = arcs.GetRawText();
        Assert.DoesNotContain("Arlen", plot, StringComparison.Ordinal);
        Assert.DoesNotContain("White Tower", plot, StringComparison.Ordinal);
        Assert.DoesNotContain("The Siege", plot, StringComparison.Ordinal);
        Assert.DoesNotContain("Ashes", plot, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Every_plot_reference_resolves_inside_the_same_file_the_Trash_included()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "plotbackuprefs");
        var world = await BuildPlot(client, universe.Id);

        // Linked, then thrown away: the beat still holds it, so the file must too.
        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{world.Arlen}")).EnsureSuccessStatusCode();

        var payload = (await Backup(client, universe.Id)).Payload;
        var entities = payload.Entities.ToDictionary(entity => entity.Id);
        var beats = new List<BackupPlotBeat>();

        foreach (var story in payload.Stories!)
        {
            // A beat's scenes are scenes of its own story.
            var scenes = story.Scenes.Select(scene => scene.Id).ToHashSet();

            foreach (var beat in story.PlotArcs!.SelectMany(arc => arc.Beats))
            {
                Assert.All(beat.LinkedSceneIds, id => Assert.Contains(id, scenes));
                Assert.All(beat.LinkedEntityIds, id => Assert.True(entities.ContainsKey(id)));
                beats.Add(beat);
            }
        }

        Assert.Equal(3, beats.Count);
        Assert.NotNull(entities[world.Arlen].DeletedAt);
        Assert.Contains(beats, beat => beat.LinkedEntityIds.Contains(world.Arlen));
    }

    [Fact]
    public async Task An_unchanged_plot_produces_the_same_payload()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "plotbackupstable");
        await BuildPlot(client, universe.Id);

        var first = PayloadText(DocumentText(await RawArchive(client, universe.Id)));
        var second = PayloadText(DocumentText(await RawArchive(client, universe.Id)));

        Assert.Equal(first, second);
    }

    /// <summary>
    /// Nothing reads a backup back in yet, so what a reader of an older file gets is exactly what the records make of
    /// it. A version 6 document has no <c>plotArcs</c>: every story in it comes out with no plot - a null, never an
    /// error and never a guess.
    /// </summary>
    [Fact]
    public void A_version_six_document_reads_as_stories_with_no_plot()
    {
        const string document = """
            {
              "format": "lorex.universe.backup",
              "formatVersion": 6,
              "generatedAt": "2026-09-13T00:00:00Z",
              "payload": {
                "universe": {
                  "id": "7c1e0a52-2f3b-4d6e-8a19-0b4c5d6e7f03", "name": "A world before plot", "description": null,
                  "accentColor": null, "isArchived": false,
                  "createdAt": "2026-09-12T00:00:00Z", "updatedAt": "2026-09-12T00:00:00Z"
                },
                "chronologyEras": [],
                "entityTypes": [],
                "tags": [],
                "entities": [],
                "relationshipTypes": [],
                "relationships": [],
                "timelineEntries": [],
                "stories": [
                  {
                    "id": "5a0f1c2e-3b4d-4e5f-8a6b-7c8d9e0f1a2c", "title": "The Long Winter", "premise": null,
                    "status": "Drafting", "createdAt": "2026-09-12T00:00:00Z", "updatedAt": "2026-09-12T00:00:00Z",
                    "chapters": [],
                    "scenes": [
                      {
                        "id": "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4f", "chapterId": null, "sortOrder": 0, "title": "The Council",
                        "summary": null, "notes": null, "povEntityId": null, "chronology": null, "linkedEntityIds": [],
                        "createdAt": "2026-09-12T00:00:00Z", "updatedAt": "2026-09-12T00:00:00Z"
                      }
                    ]
                  }
                ],
                "dismissedConflicts": []
              }
            }
            """;

        var backup = JsonSerializer.Deserialize<UniverseBackup>(document, UniverseBackupJson.Options)!;

        Assert.Equal(6, backup.FormatVersion);
        var story = Assert.Single(backup.Payload.Stories!);
        Assert.Null(story.PlotArcs);
        Assert.Empty(story.Chapters!);
        Assert.Equal(["The Council"], story.Scenes.Select(scene => scene.Title));
    }

    // ---------- Building ----------

    private sealed record PlottedWorld(
        Guid Story, Guid Fall, Guid Mira, Guid Learns, Guid Breach, Guid Siege, Guid Escape, Guid Arlen, Guid Tower);

    /// <summary>
    /// Two stories, one plotted and one not. The plotted one has a chapter, two scenes and two arcs, written Fall then
    /// Mira and reordered Mira first; Fall's two beats are reordered too, and one links both scenes and both entries.
    /// </summary>
    private static async Task<PlottedWorld> BuildPlot(HttpClient client, Guid universeId)
    {
        var arlen = await CreateEntity(client, universeId, "Arlen");
        var tower = await CreateEntity(client, universeId, "White Tower");

        var story = await CreateStory(client, universeId, "Plotted");
        await CreateStory(client, universeId, "Unplotted");

        var ashes = await CreateChapter(client, universeId, story, "Ashes");
        var siege = await CreateScene(client, universeId, story, "The Siege", ashes);
        var escape = await CreateScene(client, universeId, story, "Escape");

        var fall = await CreateArc(client, universeId, story, "Fall of the King", "The throne is lost.", "Slow burn.");
        var mira = await CreateArc(client, universeId, story, "Mira's Betrayal");

        var learns = await CreateBeat(
            client, universeId, story, fall.Id, "Learns of the conspiracy", [siege, escape], [tower, arlen], "A letter.", "Early.");
        var breach = await CreateBeat(client, universeId, story, fall.Id, "Capital is breached", [siege]);
        await CreateBeat(client, universeId, story, mira.Id, "Reveals the gate route");

        await PutJson<List<PlotArcResponse>>(
            client, $"{Arcs(universeId, story)}/order", new PlotArcOrderRequest([mira.Id, fall.Id]));
        await PutJson<List<PlotBeatResponse>>(
            client, $"{ArcBeats(universeId, story, fall.Id)}/order", new PlotBeatOrderRequest([breach.Id, learns.Id]));

        return new PlottedWorld(story, fall.Id, mira.Id, learns.Id, breach.Id, siege, escape, arlen, tower);
    }

    private static IEnumerable<Guid> Ordinal(params Guid[] ids) =>
        ids.OrderBy(id => id.ToString(), StringComparer.Ordinal);

    private static List<string> Names(JsonElement element) =>
        [.. element.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal)];
}
