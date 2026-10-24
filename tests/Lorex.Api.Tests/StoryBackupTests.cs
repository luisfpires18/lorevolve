using System.IO.Compression;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Tests;

/// <summary>
/// Stories in the universe backup (format version 8; the plot version 7 added is <c>PlotBackupTests</c>, and the prose
/// version 8 added is <c>SceneManuscriptBackupTests</c>).
///
/// A story is authored work, so a backup that dropped it would not be a backup. What it carries is the
/// author's structure - each story, its chapters in order, its scenes with the chapter each is told in and
/// its place there, the point of view, where each scene sits in the world, and which lore it links - as ids
/// and numbers only. Nothing a reader could derive from the rest of the file, such as an entry's name, a
/// formatted date or a chapter number, is repeated in it.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class StoryBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_backup_carries_every_story_with_its_scenes_in_narrative_order()
    {
        var (client, universe) = await SignedInWithUniverse("storybackup");
        var world = await BuildStories(client, universe.Id);

        var backup = await Backup(client, universe.Id);

        Assert.Equal(31, backup.FormatVersion);
        var stories = backup.Payload.Stories!;

        // By title, ordinally: "Aftermath" before "The Long Winter".
        Assert.Equal(["Aftermath", "The Long Winter"], stories.Select(story => story.Title));

        var winter = stories[1];
        Assert.Equal(world.Winter, winter.Id);
        Assert.Equal("Told backwards.", winter.Premise);
        Assert.Equal(StoryStatus.Drafting, winter.Status);

        // A story with no chapters carries an empty list, and every scene in it is Unchaptered.
        Assert.Empty(winter.Chapters!);
        Assert.All(winter.Scenes, scene => Assert.Null(scene.ChapterId));

        // The order the author set, not the order of creation and not the order of the world.
        Assert.Equal(["Childhood", "The Council", "The Battle"], winter.Scenes.Select(scene => scene.Title));
        Assert.Equal([0, 1, 2], winter.Scenes.Select(scene => scene.SortOrder));

        var council = winter.Scenes[1];
        Assert.Equal(world.Arlen, council.PovEntityId);
        Assert.Equal("Nine voices.", council.Summary);
        Assert.Equal("Check the vote count.", council.Notes);
        Assert.Equal(new BackupChronologyValue(world.After, 12, 3, null), council.Chronology);
        Assert.Equal(
            new[] { world.Arlen, world.Tower }.Select(id => id.ToString()).Order(StringComparer.Ordinal),
            council.LinkedEntityIds.Select(id => id.ToString()));

        var childhood = winter.Scenes[0];
        Assert.Equal(new BackupChronologyValue(world.Before, 40, null, null), childhood.Chronology);
        Assert.Null(childhood.PovEntityId);

        Assert.Null(winter.Scenes[2].Chronology);
        Assert.Empty(stories[0].Scenes);
    }

    [Fact]
    public async Task A_backup_carries_chapters_their_order_and_the_chapter_each_scene_is_told_in()
    {
        var (client, universe) = await SignedInWithUniverse("storybackupchapters");
        var world = await BuildChapters(client, universe.Id);

        var backup = await Backup(client, universe.Id);

        Assert.Equal(31, backup.FormatVersion);
        var story = Assert.Single(backup.Payload.Stories!);
        var chapters = story.Chapters!;

        // The order the author set, which is not the order they were written in.
        Assert.Equal(["Ashes", "Arrival"], chapters.Select(chapter => chapter.Title));
        Assert.Equal([0, 1], chapters.Select(chapter => chapter.SortOrder));

        var arrival = chapters[1];
        Assert.Equal(world.Arrival, arrival.Id);
        Assert.Equal("They reach the gate.", arrival.Summary);
        Assert.Equal("Open cold.", arrival.Notes);
        Assert.Null(chapters[0].Summary);
        Assert.Null(chapters[0].Notes);

        // Reading order - Unchaptered first, then chapter by chapter - with each scene's container and
        // its place inside it written out.
        Assert.Equal(
            ["Loose idea", "Another idea", "Embers", "Inside", "At the gate"],
            story.Scenes.Select(scene => scene.Title));
        Assert.Equal(
            new (Guid?, int)[] { (null, 0), (null, 1), (world.Ashes, 0), (world.Arrival, 0), (world.Arrival, 1) },
            story.Scenes.Select(scene => (scene.ChapterId, scene.SortOrder)));

        // Every chapter a scene names is one of its own story's chapters in the same file.
        var own = chapters.Select(chapter => chapter.Id).ToHashSet();
        Assert.All(story.Scenes, scene =>
        {
            if (scene.ChapterId is { } chapterId)
            {
                Assert.Contains(chapterId, own);
            }
        });

        var gate = story.Scenes.Single(scene => scene.Title == "At the gate");
        Assert.Equal(world.Arlen, gate.PovEntityId);
        Assert.Equal([world.Arlen], gate.LinkedEntityIds);
    }

    [Fact]
    public async Task A_chapter_in_a_backup_is_its_place_and_its_text_and_nothing_derived()
    {
        var (client, universe) = await SignedInWithUniverse("storybackupchaptershape");
        await BuildChapters(client, universe.Id);

        var archive = await RawArchive(client, universe.Id);
        using var document = JsonDocument.Parse(DocumentText(archive));
        var chapter = document.RootElement
            .GetProperty("payload").GetProperty("stories")[0].GetProperty("chapters")[0];

        // No number, no count, no copy of the scenes: each scene names its chapter itself. Only whether it is in the Trash.
        Assert.Equal(
            ["createdAt", "deletedAt", "id", "notes", "sortOrder", "summary", "title", "updatedAt"],
            chapter.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Every_reference_in_a_story_resolves_inside_the_same_file_the_Trash_included()
    {
        var (client, universe) = await SignedInWithUniverse("storybackuprefs");
        var world = await BuildStories(client, universe.Id);

        // Linked and point of view, then thrown away: the scene still holds it, so the file must too.
        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{world.Arlen}")).EnsureSuccessStatusCode();

        var payload = (await Backup(client, universe.Id)).Payload;
        var entities = payload.Entities.ToDictionary(entity => entity.Id);
        var eras = payload.ChronologyEras!.Select(era => era.Id).ToHashSet();

        var scenes = payload.Stories!.SelectMany(story => story.Scenes).ToList();
        Assert.NotEmpty(scenes);

        foreach (var scene in scenes)
        {
            if (scene.PovEntityId is { } pov)
            {
                Assert.True(entities.ContainsKey(pov));
            }

            Assert.All(scene.LinkedEntityIds, id => Assert.True(entities.ContainsKey(id)));

            if (scene.Chronology?.EraId is { } era)
            {
                Assert.Contains(era, eras);
            }
        }

        Assert.NotNull(entities[world.Arlen].DeletedAt);
        Assert.Contains(scenes, scene => scene.PovEntityId == world.Arlen);
    }

    [Fact]
    public async Task A_story_in_a_backup_holds_references_and_never_the_lore_it_points_at()
    {
        var (client, universe) = await SignedInWithUniverse("storybackupnocopy");
        await BuildStories(client, universe.Id);

        var archive = await RawArchive(client, universe.Id);
        using var document = JsonDocument.Parse(DocumentText(archive));
        var stories = document.RootElement.GetProperty("payload").GetProperty("stories").GetRawText();

        // Names of the entries and of the eras live in their own collections; a scene repeats neither.
        Assert.DoesNotContain("Arlen", stories, StringComparison.Ordinal);
        Assert.DoesNotContain("White Tower", stories, StringComparison.Ordinal);
        Assert.DoesNotContain("After the Fall", stories, StringComparison.Ordinal);
        Assert.DoesNotContain("\"AF", stories, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Unchanged_stories_produce_the_same_payload()
    {
        var (client, universe) = await SignedInWithUniverse("storybackupstable");
        await BuildStories(client, universe.Id);
        await BuildChapters(client, universe.Id);

        var first = PayloadText(DocumentText(await RawArchive(client, universe.Id)));
        var second = PayloadText(DocumentText(await RawArchive(client, universe.Id)));

        Assert.Equal(first, second);
    }

    [Fact]
    public async Task A_universe_with_no_stories_carries_an_empty_list()
    {
        var (client, universe) = await SignedInWithUniverse("storybackupnone");

        var backup = await Backup(client, universe.Id);

        Assert.NotNull(backup.Payload.Stories);
        Assert.Empty(backup.Payload.Stories);
    }

    /// <summary>
    /// Nothing reads a backup back in yet, so what a reader of an older file gets is exactly what the
    /// records make of it. A version 5 document has no chapters and no chapter ids: every scene comes out
    /// Unchaptered, and its story-wide order is its order there - a null, never an error and never a guess.
    /// </summary>
    [Fact]
    public void A_version_five_document_reads_every_scene_as_Unchaptered_in_its_story_order()
    {
        const string document = """
            {
              "format": "lorex.universe.backup",
              "formatVersion": 5,
              "generatedAt": "2026-09-13T00:00:00Z",
              "payload": {
                "universe": {
                  "id": "7c1e0a52-2f3b-4d6e-8a19-0b4c5d6e7f02", "name": "A world before chapters", "description": null,
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
                    "id": "5a0f1c2e-3b4d-4e5f-8a6b-7c8d9e0f1a2b", "title": "The Long Winter", "premise": null,
                    "status": "Drafting", "createdAt": "2026-09-12T00:00:00Z", "updatedAt": "2026-09-12T00:00:00Z",
                    "scenes": [
                      {
                        "id": "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e", "sortOrder": 0, "title": "Childhood",
                        "summary": null, "notes": null, "povEntityId": null, "chronology": null, "linkedEntityIds": [],
                        "createdAt": "2026-09-12T00:00:00Z", "updatedAt": "2026-09-12T00:00:00Z"
                      },
                      {
                        "id": "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "sortOrder": 1, "title": "The Council",
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

        Assert.Equal(5, backup.FormatVersion);
        var story = Assert.Single(backup.Payload.Stories!);
        Assert.Null(story.Chapters);
        Assert.Equal(["Childhood", "The Council"], story.Scenes.Select(scene => scene.Title));
        Assert.All(story.Scenes, scene => Assert.Null(scene.ChapterId));
        Assert.Equal([0, 1], story.Scenes.Select(scene => scene.SortOrder));
    }

    /// <summary>A version 4 document holds no stories, and must come out as none.</summary>
    [Fact]
    public void A_version_four_document_reads_as_a_world_with_no_stories()
    {
        const string document = """
            {
              "format": "lorex.universe.backup",
              "formatVersion": 4,
              "generatedAt": "2026-09-13T00:00:00Z",
              "payload": {
                "universe": {
                  "id": "7c1e0a52-2f3b-4d6e-8a19-0b4c5d6e7f01", "name": "A world before stories", "description": null,
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
                "dismissedConflicts": []
              }
            }
            """;

        var backup = JsonSerializer.Deserialize<UniverseBackup>(document, UniverseBackupJson.Options)!;

        Assert.Equal(4, backup.FormatVersion);
        Assert.Null(backup.Payload.Stories);
        Assert.Equal("A world before stories", backup.Payload.Universe.Name);
    }

    // ---------- Building ----------

    private sealed record StoryWorld(Guid Winter, Guid Arlen, Guid Tower, Guid Before, Guid After);

    /// <summary>
    /// Two stories. One is empty; the other holds three scenes written in one order, lived in another,
    /// and then reordered by the author into a third.
    /// </summary>
    private static async Task<StoryWorld> BuildStories(HttpClient client, Guid universeId)
    {
        var eras = await PutJson<ChronologyResponse>(
            client,
            HttpMethod.Put,
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        var before = eras.Eras[0].Id;
        var after = eras.Eras[1].Id;

        var character = await CharacterType(client, universeId);

        var arlen = await PutJson<EntityDetail>(
            client, HttpMethod.Post, $"/api/universes/{universeId}/entities",
            new EntityRequest(character, "Arlen", null, CanonStatus.Canon, null, null, null));
        var tower = await PutJson<EntityDetail>(
            client, HttpMethod.Post, $"/api/universes/{universeId}/entities",
            new EntityRequest(character, "White Tower", null, CanonStatus.Canon, null, null, null));

        var stories = $"/api/universes/{universeId}/stories";
        var winter = await PutJson<StoryDetail>(
            client, HttpMethod.Post, stories, new StoryRequest("The Long Winter", "Told backwards.", StoryStatus.Drafting));
        await PutJson<StoryDetail>(client, HttpMethod.Post, stories, new StoryRequest("Aftermath", null, StoryStatus.Planning));

        var scenes = $"{stories}/{winter.Id}/scenes";
        var council = await PutJson<SceneResponse>(
            client, HttpMethod.Post, scenes,
            new SceneRequest(
                "The Council", "Nine voices.", "Check the vote count.", arlen.Id,
                new ChronologyValue(after, 12, 3, null), [tower.Id, arlen.Id]));
        var battle = await PutJson<SceneResponse>(
            client, HttpMethod.Post, scenes, new SceneRequest("The Battle", null, null, null, null, null));
        var childhood = await PutJson<SceneResponse>(
            client, HttpMethod.Post, scenes,
            new SceneRequest("Childhood", null, null, null, new ChronologyValue(before, 40, null, null), [arlen.Id]));

        await PutJson<List<SceneResponse>>(
            client, HttpMethod.Put, $"{scenes}/order", new SceneOrderRequest([childhood.Id, council.Id, battle.Id]));

        return new StoryWorld(winter.Id, arlen.Id, tower.Id, before, after);
    }

    private sealed record ChapteredWorld(Guid Story, Guid Arrival, Guid Ashes, Guid Arlen);

    /// <summary>
    /// One story in two chapters, written Arrival then Ashes and reordered Ashes first. Arrival's two
    /// scenes are reordered inside it; two more scenes stay Unchaptered, one written after the chapters.
    /// </summary>
    private static async Task<ChapteredWorld> BuildChapters(HttpClient client, Guid universeId)
    {
        var arlen = await PutJson<EntityDetail>(
            client, HttpMethod.Post, $"/api/universes/{universeId}/entities",
            new EntityRequest(await CharacterType(client, universeId), "Arlen of the chapters", null, CanonStatus.Canon, null, null, null));

        var story = await PutJson<StoryDetail>(
            client, HttpMethod.Post, $"/api/universes/{universeId}/stories",
            new StoryRequest("Told in chapters", null, StoryStatus.Drafting));

        var path = $"/api/universes/{universeId}/stories/{story.Id}";
        var arrival = await PutJson<ChapterResponse>(
            client, HttpMethod.Post, $"{path}/chapters", new ChapterRequest("Arrival", "They reach the gate.", "Open cold."));
        var ashes = await PutJson<ChapterResponse>(
            client, HttpMethod.Post, $"{path}/chapters", new ChapterRequest("Ashes", null, null));

        await PutJson<SceneResponse>(client, HttpMethod.Post, $"{path}/scenes", new SceneRequest("Loose idea", null, null, null, null, null));
        var gate = await PutJson<SceneResponse>(
            client, HttpMethod.Post, $"{path}/scenes", new SceneRequest("At the gate", null, null, arlen.Id, null, [arlen.Id], arrival.Id));
        var inside = await PutJson<SceneResponse>(
            client, HttpMethod.Post, $"{path}/scenes", new SceneRequest("Inside", null, null, null, null, null, arrival.Id));
        await PutJson<SceneResponse>(
            client, HttpMethod.Post, $"{path}/scenes", new SceneRequest("Embers", null, null, null, null, null, ashes.Id));
        await PutJson<SceneResponse>(client, HttpMethod.Post, $"{path}/scenes", new SceneRequest("Another idea", null, null, null, null, null));

        await PutJson<List<ChapterResponse>>(
            client, HttpMethod.Put, $"{path}/chapters/order", new ChapterOrderRequest([ashes.Id, arrival.Id]));
        await PutJson<List<SceneResponse>>(
            client, HttpMethod.Put, $"{path}/scenes/order", new SceneOrderRequest([inside.Id, gate.Id], arrival.Id));

        return new ChapteredWorld(story.Id, arrival.Id, ashes.Id, arlen.Id);
    }

    private static async Task<Guid> CharacterType(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!
        .First(type => type.Name == "Character").Id;

    private static async Task<T> PutJson<T>(HttpClient client, HttpMethod method, string path, object body)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    // ---------- Reading the archive ----------

    private static async Task<UniverseBackup> Backup(HttpClient client, Guid universeId) =>
        JsonSerializer.Deserialize<UniverseBackup>(
            DocumentText(await RawArchive(client, universeId)),
            UniverseBackupJson.Options)!;

    private static async Task<byte[]> RawArchive(HttpClient client, Guid universeId)
    {
        var response = await client.GetAsync($"/api/universes/{universeId}/export");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync();
    }

    private static string DocumentText(byte[] archive)
    {
        using var zip = new ZipArchive(new MemoryStream(archive, writable: false), ZipArchiveMode.Read);
        var entry = zip.GetEntry(BackupArchive.DocumentPath)
            ?? throw new InvalidOperationException("No document in the archive.");

        using var reading = entry.Open();
        using var buffer = new MemoryStream();
        reading.CopyTo(buffer);
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private static string PayloadText(string raw)
    {
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.GetProperty("payload").GetRawText();
    }

    private async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(string tag)
    {
        var client = _factory.CreateClient();
        var username = $"user-{tag}";
        (await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password))).EnsureSuccessStatusCode();

        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest($"World {tag}", null, null));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<UniverseDetail>())!);
    }
}
