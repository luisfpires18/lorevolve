using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Stories;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Content recovery in the backup: format version 10 (ADR 0014, ADR 0029).
///
/// The invariants under test: a story's content in the Trash travels whole and marked, and after the live rows so the order a
/// reader sees is still the order the story is told in; a manuscript's saved versions travel oldest first, whole and exact;
/// a version 9 file still reads, with everything in it live and no saved versions; and nothing but saved writing is in a
/// backup.
/// </summary>
public sealed class ContentRecoveryBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task Story_content_in_the_trash_travels_whole_and_marked_after_the_live_rows()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "rcbackuptrash");
        var u = universe.Id;
        var arlen = await CreateEntity(client, u, "Arlen");

        var story = await CreateStory(client, u, "Live");
        var arrival = await CreateChapter(client, u, story, "Arrival");
        var discarded = await CreateChapter(client, u, story, "Discarded");
        var gate = await CreateScene(client, u, story, "The Gates", arrival);
        var cut = await CreateScene(client, u, story, "Cut scene", arrival);
        var loose = await CreateScene(client, u, story, "Loose");
        var carried = await CreateScene(client, u, story, "Carried", discarded);
        await WriteManuscript(client, u, story, cut, "Cut prose.");
        var fall = await CreateArc(client, u, story, "Fall of the King");
        var dropped = await CreateArc(client, u, story, "Dropped thread");
        var kept = await CreateBeat(client, u, story, fall.Id, "Kept", [gate, cut], [arlen]);
        var binned = await CreateBeat(client, u, story, fall.Id, "Binned", [gate]);

        (await client.DeleteAsync($"{Story(u, story)}/scenes/{cut}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Beat(u, story, binned.Id))).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Arc(u, story, dropped.Id))).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"{Story(u, story)}/chapters/{discarded}")).EnsureSuccessStatusCode();

        var gone = await CreateStory(client, u, "Gone");
        var goneScene = await CreateScene(client, u, gone, "Elsewhere");
        (await client.DeleteAsync(Story(u, gone))).EnsureSuccessStatusCode();

        var backup = await Backup(client, u);
        Assert.Equal(33, backup.FormatVersion);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);

        var stories = backup.Payload.Stories!;
        Assert.Equal(["Gone", "Live"], stories.Select(candidate => candidate.Title));

        // A whole story in the Trash, and only it marked: what it holds is carried as it stood.
        var goneBackup = stories[0];
        Assert.Equal(DateTimeKind.Utc, goneBackup.DeletedAt!.Value.Kind);
        var goneSceneBackup = Assert.Single(goneBackup.Scenes);
        Assert.Equal(goneScene, goneSceneBackup.Id);
        Assert.Null(goneSceneBackup.DeletedAt);

        var live = stories[1];
        Assert.Null(live.DeletedAt);

        // Live chapters in order, then the one in the Trash - holding no scene.
        Assert.Equal(
            new (Guid, bool)[] { (arrival, false), (discarded, true) },
            live.Chapters!.Select(chapter => (chapter.Id, chapter.DeletedAt is not null)));
        Assert.DoesNotContain(live.Scenes, scene => scene.ChapterId == discarded);

        // Reading order for the live scenes - Carried went to Unchaptered with its chapter - and the scene in the Trash after
        // the live ones of its own chapter, with its prose and the place it had.
        Assert.Equal([loose, carried, gate, cut], live.Scenes.Select(scene => scene.Id));
        var cutBackup = live.Scenes.Single(scene => scene.Id == cut);
        Assert.NotNull(cutBackup.DeletedAt);
        Assert.Equal((arrival, 1), (cutBackup.ChapterId!.Value, cutBackup.SortOrder));
        Assert.Equal("Cut prose.", cutBackup.Manuscript!.Content);
        Assert.Equal("Cut prose.", Assert.Single(cutBackup.Manuscript.Revisions!).Content);
        Assert.All(live.Scenes.Where(scene => scene.Id != cut), scene => Assert.Null(scene.DeletedAt));

        // Arcs and beats the same way, and a link to a scene in the Trash travels and resolves inside the file.
        Assert.Equal(
            new (Guid, bool)[] { (fall.Id, false), (dropped.Id, true) },
            live.PlotArcs!.Select(arc => (arc.Id, arc.DeletedAt is not null)));
        var beats = live.PlotArcs![0].Beats;
        Assert.Equal(new (Guid, bool)[] { (kept.Id, false), (binned.Id, true) }, beats.Select(beat => (beat.Id, beat.DeletedAt is not null)));
        Assert.Contains(cut, beats[0].LinkedSceneIds);
        Assert.Contains(cut, live.Scenes.Select(scene => scene.Id));

        // Unchanged content, unchanged bytes.
        Assert.Equal(
            PayloadText(DocumentText(await RawArchive(client, u))),
            PayloadText(DocumentText(await RawArchive(client, u))));
    }

    [Fact]
    public async Task A_manuscripts_saved_versions_travel_oldest_first_whole_and_exact()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "rcbackupversions");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Revised");
        var scene = await CreateScene(client, u, story, "The Council");

        await WriteManuscript(client, u, story, scene, "One.");
        await WriteManuscript(client, u, story, scene, Prose);

        var history = (await client.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>(
            $"{Manuscript(u, story, scene)}/revisions"))!;
        var current = await ReadManuscript(client, u, story, scene);
        (await client.PostAsJsonAsync(
                $"{Manuscript(u, story, scene)}/revisions/{history[1].Id}/restore",
                new SceneManuscriptRestoreRequest(current.Version)))
            .EnsureSuccessStatusCode();

        var manuscript = Assert.Single(Assert.Single((await Backup(client, u)).Payload.Stories!).Scenes).Manuscript!;
        var versions = manuscript.Revisions!;

        Assert.Equal("One.", manuscript.Content);
        Assert.Equal([1, 2, 3], versions.Select(version => version.Number));
        Assert.Equal(
            [SceneManuscriptRevisionKind.Created, SceneManuscriptRevisionKind.Edited, SceneManuscriptRevisionKind.Restored],
            versions.Select(version => version.Kind));
        Assert.Equal(["One.", Prose, "One."], versions.Select(version => version.Content));
        Assert.Equal(new Guid?[] { null, null, history[1].Id }, versions.Select(version => version.RestoredFromRevisionId));
        Assert.Equal(history[1].Id, versions[0].Id);
        Assert.All(versions, version => Assert.Equal(DateTimeKind.Utc, version.CreatedAt.Kind));
    }

    /// <summary>
    /// Nothing reads a backup back in yet, so what a reader of an older file gets is exactly what the records make of it. A
    /// version 9 document marks nothing and carries no saved versions: everything in it is live, and a manuscript is its text.
    /// </summary>
    [Fact]
    public void A_version_nine_document_reads_as_everything_live_with_no_saved_versions()
    {
        const string document = """
            {
              "format": "lorex.universe.backup",
              "formatVersion": 9,
              "generatedAt": "2026-09-14T00:00:00Z",
              "payload": {
                "universe": {
                  "id": "7c1e0a52-2f3b-4d6e-8a19-0b4c5d6e7f09", "name": "A world before the Trash held stories", "description": null,
                  "accentColor": null, "isArchived": false,
                  "createdAt": "2026-09-13T00:00:00Z", "updatedAt": "2026-09-13T00:00:00Z"
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
                    "id": "5a0f1c2e-3b4d-4e5f-8a6b-7c8d9e0f1a29", "title": "The Long Winter", "premise": null,
                    "status": "Drafting", "createdAt": "2026-09-13T00:00:00Z", "updatedAt": "2026-09-13T00:00:00Z",
                    "chapters": [
                      {
                        "id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c59", "sortOrder": 0, "title": "Arrival", "summary": null,
                        "notes": null, "createdAt": "2026-09-13T00:00:00Z", "updatedAt": "2026-09-13T00:00:00Z"
                      }
                    ],
                    "scenes": [
                      {
                        "id": "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d59", "chapterId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c59",
                        "sortOrder": 0, "title": "The Council", "summary": null, "notes": null, "povEntityId": null,
                        "chronology": null, "linkedEntityIds": [],
                        "manuscript": { "content": "The hall had emptied.", "updatedAt": "2026-09-13T00:00:00Z" },
                        "createdAt": "2026-09-13T00:00:00Z", "updatedAt": "2026-09-13T00:00:00Z"
                      }
                    ],
                    "plotArcs": [
                      {
                        "id": "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d69", "sortOrder": 0, "title": "Fall of the King",
                        "description": null, "notes": null, "createdAt": "2026-09-13T00:00:00Z", "updatedAt": "2026-09-13T00:00:00Z",
                        "beats": [
                          {
                            "id": "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e79", "sortOrder": 0, "title": "Learns", "description": null,
                            "notes": null, "linkedSceneIds": ["0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d59"], "linkedEntityIds": [],
                            "createdAt": "2026-09-13T00:00:00Z", "updatedAt": "2026-09-13T00:00:00Z"
                          }
                        ]
                      }
                    ]
                  }
                ],
                "dismissedConflicts": []
              }
            }
            """;

        var backup = JsonSerializer.Deserialize<UniverseBackup>(document, UniverseBackupJson.Options)!;

        Assert.Equal(9, backup.FormatVersion);
        var story = Assert.Single(backup.Payload.Stories!);
        Assert.Null(story.DeletedAt);
        Assert.Null(Assert.Single(story.Chapters!).DeletedAt);

        var scene = Assert.Single(story.Scenes);
        Assert.Null(scene.DeletedAt);
        Assert.Equal("The hall had emptied.", scene.Manuscript!.Content);
        Assert.Null(scene.Manuscript.Revisions);

        var arc = Assert.Single(story.PlotArcs!);
        Assert.Null(arc.DeletedAt);
        Assert.Null(Assert.Single(arc.Beats).DeletedAt);
    }

    [Fact]
    public async Task A_backup_holds_saved_writing_and_no_member_for_anything_unsaved()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "rcbackupunsaved");
        var u = universe.Id;
        var entry = await CreateEntity(client, u, "Arlen");
        await ArticleTestClient.WriteArticle(
            client, u, entry, """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Saved."}]}]}""");
        var story = await CreateStory(client, u, "Saved");
        var scene = await CreateScene(client, u, story, "The Council");
        await WriteManuscript(client, u, story, scene, "Saved prose.");

        // Unsaved writing is kept by a browser and never sent, so the file has nowhere it could be: no member anywhere names
        // a draft or a recovery copy.
        using var document = JsonDocument.Parse(DocumentText(await RawArchive(client, u)));
        var names = new List<string>();
        Collect(document.RootElement, names);

        Assert.NotEmpty(names);
        Assert.DoesNotContain(names, name => name.Contains("draft", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(names, name => name.Contains("recover", StringComparison.OrdinalIgnoreCase));

        static void Collect(JsonElement element, List<string> into)
        {
            if (element.ValueKind == JsonValueKind.Object)
            {
                foreach (var property in element.EnumerateObject())
                {
                    into.Add(property.Name);
                    Collect(property.Value, into);
                }
            }
            else if (element.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in element.EnumerateArray())
                {
                    Collect(item, into);
                }
            }
        }
    }
}
