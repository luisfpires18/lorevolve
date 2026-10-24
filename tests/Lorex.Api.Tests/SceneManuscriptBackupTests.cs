using System.Text.Json;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Stories;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Scene prose in the universe backup (format version 8).
///
/// A manuscript is the writing itself, so a backup that dropped it would lose the most authored thing a world holds. What
/// it carries is exactly that: each scene's text as stored - byte for byte once decoded - with when it was last saved,
/// beside the scene it belongs to. Nothing derived from it - a word count, a rendering, a copy of the scene's planning - is
/// in the file.
/// </summary>
public sealed class SceneManuscriptBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_backup_carries_each_scenes_prose_exactly_beside_the_scene_it_belongs_to()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msbackup");
        var world = await BuildManuscripts(client, universe.Id);

        var backup = await Backup(client, universe.Id);
        Assert.Equal(27, backup.FormatVersion);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);

        var scenes = Assert.Single(backup.Payload.Stories!).Scenes.ToDictionary(scene => scene.Id);

        // Written: the exact text, and the moment the manuscript route reports.
        var council = scenes[world.Council].Manuscript!;
        Assert.Equal(Prose, council.Content, StringComparer.Ordinal);
        SameMoment(world.CouncilSaved, council.UpdatedAt);

        // Never written: no manuscript at all. Written and then emptied: an empty one.
        Assert.Null(scenes[world.Gate].Manuscript);
        Assert.Equal(string.Empty, scenes[world.Cleared].Manuscript!.Content);

        // The Council was moved out of its chapter between drafts, and its prose went with it.
        Assert.Null(scenes[world.Council].ChapterId);
    }

    [Fact]
    public async Task Prose_travels_once_as_plain_text_and_nothing_derived_travels_with_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msbackupshape");
        var world = await BuildManuscripts(client, universe.Id);

        var text = DocumentText(await RawArchive(client, universe.Id));
        using var document = JsonDocument.Parse(text);

        var scene = document.RootElement
            .GetProperty("payload")
            .GetProperty("stories")[0]
            .GetProperty("scenes")
            .EnumerateArray()
            .Single(candidate => candidate.GetProperty("id").GetGuid() == world.Council);

        Assert.Contains("manuscript", Names(scene));
        var manuscript = scene.GetProperty("manuscript");
        Assert.Equal(["content", "revisions", "updatedAt"], Names(manuscript));
        Assert.Equal(Prose, manuscript.GetProperty("content").GetString(), StringComparer.Ordinal);

        // Its saved versions travel beside it since version 10, oldest first, each the whole text and nothing derived from it:
        // the first draft, then the prose as it stands.
        var versions = manuscript.GetProperty("revisions").EnumerateArray().ToList();
        Assert.Equal(2, versions.Count);
        Assert.All(versions, version => Assert.Equal(["content", "createdAt", "id", "kind", "number", "restoredFromRevisionId"], Names(version)));
        Assert.Equal(("Created", "A first draft."), (versions[0].GetProperty("kind").GetString(), versions[0].GetProperty("content").GetString()));
        Assert.Equal(("Edited", Prose), (versions[1].GetProperty("kind").GetString(), versions[1].GetProperty("content").GetString()));

        // A scene never written for says so with a null, not an absent member.
        var gate = document.RootElement.GetProperty("payload").GetProperty("stories")[0].GetProperty("scenes")
            .EnumerateArray()
            .Single(candidate => candidate.GetProperty("id").GetGuid() == world.Gate);
        Assert.Equal(JsonValueKind.Null, gate.GetProperty("manuscript").ValueKind);

        // Twice in the whole file - the prose as it stands, and its one saved version - and not repeated on a plot beat, a
        // chapter or anywhere else.
        Assert.Equal(2, Occurrences(text, "The hall had emptied long before Arlen understood"));
    }

    [Fact]
    public async Task An_unchanged_manuscript_produces_the_same_payload()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "msbackupstable");
        await BuildManuscripts(client, universe.Id);

        var first = PayloadText(DocumentText(await RawArchive(client, universe.Id)));
        var second = PayloadText(DocumentText(await RawArchive(client, universe.Id)));

        Assert.Equal(first, second);
    }

    /// <summary>
    /// Nothing reads a backup back in yet, so what a reader of an older file gets is exactly what the records make of it. A
    /// version 7 document has no <c>manuscript</c> on any scene: every scene comes out with nothing written - a null, never
    /// an error and never a guess.
    /// </summary>
    [Fact]
    public void A_version_seven_document_reads_as_scenes_with_nothing_written()
    {
        const string document = """
            {
              "format": "lorex.universe.backup",
              "formatVersion": 7,
              "generatedAt": "2026-09-13T00:00:00Z",
              "payload": {
                "universe": {
                  "id": "7c1e0a52-2f3b-4d6e-8a19-0b4c5d6e7f04", "name": "A world before prose", "description": null,
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
                    "id": "5a0f1c2e-3b4d-4e5f-8a6b-7c8d9e0f1a2d", "title": "The Long Winter", "premise": null,
                    "status": "Drafting", "createdAt": "2026-09-12T00:00:00Z", "updatedAt": "2026-09-12T00:00:00Z",
                    "chapters": [],
                    "scenes": [
                      {
                        "id": "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d50", "chapterId": null, "sortOrder": 0, "title": "The Council",
                        "summary": "Arlen learns the truth.", "notes": null, "povEntityId": null, "chronology": null,
                        "linkedEntityIds": [], "createdAt": "2026-09-12T00:00:00Z", "updatedAt": "2026-09-12T00:00:00Z"
                      }
                    ],
                    "plotArcs": []
                  }
                ],
                "dismissedConflicts": []
              }
            }
            """;

        var backup = JsonSerializer.Deserialize<UniverseBackup>(document, UniverseBackupJson.Options)!;

        Assert.Equal(7, backup.FormatVersion);
        var scene = Assert.Single(Assert.Single(backup.Payload.Stories!).Scenes);
        Assert.Equal("The Council", scene.Title);
        Assert.Equal("Arlen learns the truth.", scene.Summary);
        Assert.Null(scene.Manuscript);
    }

    // ---------- Building ----------

    private sealed record ManuscriptWorld(Guid Council, Guid Gate, Guid Cleared, DateTime? CouncilSaved);

    /// <summary>
    /// One story with a chapter and three scenes: The Council drafted, moved out of the chapter and then written in full,
    /// The Gates never written, and a scene written and then emptied. A plot beat points at The Council, so a copy of its prose on the
    /// beat would show.
    /// </summary>
    private static async Task<ManuscriptWorld> BuildManuscripts(HttpClient client, Guid universeId)
    {
        var story = await CreateStory(client, universeId, "Told");
        var arrival = await CreateChapter(client, universeId, story, "Arrival");
        var council = await CreateScene(client, universeId, story, "The Council", arrival);
        var gate = await CreateScene(client, universeId, story, "The Gates", arrival);
        var cleared = await CreateScene(client, universeId, story, "A false start");

        await WriteManuscript(client, universeId, story, council, "A first draft.");
        await WriteManuscript(client, universeId, story, cleared, "Crossed out.");
        await WriteManuscript(client, universeId, story, cleared, string.Empty);

        var arc = await CreateArc(client, universeId, story, "Fall of the King");
        await CreateBeat(client, universeId, story, arc.Id, "Learns the truth", [council]);

        await PutJson<StoryDetail>(
            client, $"{Story(universeId, story)}/scenes/{council}/position", new ScenePositionRequest(null, null));
        var saved = await WriteManuscript(client, universeId, story, council, Prose);

        return new ManuscriptWorld(council, gate, cleared, saved.UpdatedAt);
    }

    private static List<string> Names(JsonElement element) =>
        [.. element.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal)];

    private static int Occurrences(string text, string value)
    {
        var count = 0;
        for (var at = text.IndexOf(value, StringComparison.Ordinal); at >= 0; at = text.IndexOf(value, at + 1, StringComparison.Ordinal))
        {
            count++;
        }

        return count;
    }
}
