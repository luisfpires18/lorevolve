using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The chapter migration, walked down and back up over a real SQLite file holding real stories.
///
/// Three risks, each read back from the file rather than trusted from the generated code. Adding a
/// foreign key rebuilds <c>Scenes</c> on SQLite, and a rebuild must keep every scene - its id, its
/// place, its point of view, its year and its links - exactly. The narrative order index changes from
/// one per story to one per container, and a unique index over a nullable column would not have guarded
/// Unchaptered at all, so both filtered indexes are proved to refuse a clash. And rolling back with
/// chapters in the file has to fit every scene back into one order per story without losing any.
/// </summary>
public sealed class ChapterMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before chapters.</summary>
    private const string BeforeChapters = "20260913014528_AddStories";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-chapter-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Existing_scenes_upgrade_to_Unchaptered_in_their_order_and_roll_back_in_reading_order()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid winterId;

        // Stories written with scenes in an order their author set.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-chaptermigrate", "user-chaptermigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await PostJson<UniverseDetail>(
                client, "/api/universes", new CreateUniverseRequest("World chaptermigrate", null, null))).Id;
            var after = await AfterTheFall(client, universeId);
            var arlen = await CreateEntity(client, universeId, "Arlen");
            var tower = await CreateEntity(client, universeId, "White Tower");

            var stories = $"/api/universes/{universeId}/stories";
            winterId = (await PostJson<StoryDetail>(
                client, stories, new StoryRequest("The Long Winter", null, StoryStatus.Drafting))).Id;

            var scenes = $"{stories}/{winterId}/scenes";
            var a = await PostJson<SceneResponse>(
                client, scenes,
                new SceneRequest("A", "What happens.", "Notes.", arlen, new ChronologyValue(after, 12, 3, null), [arlen, tower]));
            var b = await PostJson<SceneResponse>(client, scenes, new SceneRequest("B", null, null, null, null, null));
            var c = await PostJson<SceneResponse>(client, scenes, new SceneRequest("C", null, null, null, null, [tower]));

            (await client.PutAsJsonAsync($"{scenes}/order", new SceneOrderRequest([c.Id, a.Id, b.Id])))
                .EnsureSuccessStatusCode();

            var otherId = (await PostJson<StoryDetail>(
                client, stories, new StoryRequest("Another story", null, StoryStatus.Planning))).Id;
            await PostJson<SceneResponse>(client, $"{stories}/{otherId}/scenes", new SceneRequest("X", null, null, null, null, null));
            await PostJson<SceneResponse>(client, $"{stories}/{otherId}/scenes", new SceneRequest("Y", null, null, null, null, null));
        }

        SqliteConnection.ClearAllPools();

        List<string> legacy;
        int links;

        // Down to the schema before chapters: what an existing database with stories looks like.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(BeforeChapters);

            Assert.DoesNotContain("Chapters", await Tables(db));
            Assert.DoesNotContain("ChapterId", await Columns(db, "Scenes"));
            Assert.Contains("IX_Scenes_StoryId_SortOrder:1:0", await Indexes(db, "Scenes"));
            Assert.Empty(await ForeignKeyViolations(db));

            legacy = await SceneRows(db);
            links = await db.SceneEntityLinks.CountAsync();

            Assert.Equal(
                ["Another story|X|0", "Another story|Y|1", "The Long Winter|C|0", "The Long Winter|A|1", "The Long Winter|B|2"],
                Placement(legacy));
            Assert.Equal(3, links);
        }

        SqliteConnection.ClearAllPools();

        // Up: the table is rebuilt, and every scene comes through it Unchaptered, in exactly its place.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));

            Assert.Equal(legacy, await SceneRows(db));
            Assert.Equal(links, await db.SceneEntityLinks.CountAsync());
            Assert.Equal(0, await db.Chapters.CountAsync());
            Assert.Equal(0, await db.Scenes.CountAsync(scene => scene.ChapterId != null));

            // What each reference may do when the row it points at goes.
            Assert.Equal(
                ["Chapters.ChapterId:NO ACTION", "ChronologyCalendarMonths.MonthId:NO ACTION", "ChronologyEras.EraId:NO ACTION", "Entities.PovEntityId:SET NULL", "Stories.StoryId:CASCADE"],
                (await ForeignKeys(db, "Scenes")).Order(StringComparer.Ordinal));
            Assert.Equal(["Stories.StoryId:CASCADE"], await ForeignKeys(db, "Chapters"));

            // One unique, filtered order per kind of container, a plain index for the story read, and a
            // unique chapter order. name:unique:partial.
            var sceneIndexes = await Indexes(db, "Scenes");
            Assert.Contains("IX_Scenes_StoryId_SortOrder:1:1", sceneIndexes);
            Assert.Contains("IX_Scenes_ChapterId_SortOrder:1:1", sceneIndexes);
            Assert.Contains("IX_Scenes_StoryId:0:0", sceneIndexes);
            Assert.Contains("IX_Scenes_EraId:0:0", sceneIndexes);
            Assert.Contains("IX_Scenes_PovEntityId:0:0", sceneIndexes);
            // Partial since content recovery (ADR 0029): the order guards live chapters, and a chapter in the Trash holds no place.
            Assert.Contains("IX_Chapters_StoryId_SortOrder:1:1", await Indexes(db, "Chapters"));

            // Unchaptered is guarded - which is exactly what a unique index over (StoryId, ChapterId,
            // SortOrder) would not have done, since it treats every null ChapterId as distinct.
            var clash = await Assert.ThrowsAsync<SqliteException>(
                () => db.Database.ExecuteSqlAsync($"UPDATE \"Scenes\" SET \"SortOrder\" = 0 WHERE \"Title\" = 'Y'"));
            Assert.Contains("UNIQUE", clash.Message, StringComparison.Ordinal);
        }

        SqliteConnection.ClearAllPools();

        // The upgraded file is a working LorEvolve: the old scenes read as they did, and take chapters.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-chaptermigrate", Password)))
                .EnsureSuccessStatusCode();

            var story = $"/api/universes/{universeId}/stories/{winterId}";
            var read = (await client.GetFromJsonAsync<StoryDetail>(story))!;

            Assert.Empty(read.Chapters);
            Assert.Equal(["C", "A", "B"], read.Scenes.Select(scene => scene.Title));
            Assert.All(read.Scenes, scene => Assert.Null(scene.ChapterId));

            var a = read.Scenes.Single(scene => scene.Title == "A");
            Assert.Equal("Arlen", a.Pov!.Name);
            Assert.Equal(["Arlen", "White Tower"], a.Entities.Select(entity => entity.Name));

            var arrival = await PostJson<ChapterResponse>(client, $"{story}/chapters", new ChapterRequest("Arrival", null, null));
            var ashes = await PostJson<ChapterResponse>(client, $"{story}/chapters", new ChapterRequest("Ashes", null, null));

            await PostJson<SceneResponse>(
                client, $"{story}/scenes", new SceneRequest("D", null, null, null, null, null, arrival.Id));

            (await client.PutAsJsonAsync($"{story}/scenes/{a.Id}/position", new ScenePositionRequest(ashes.Id, null)))
                .EnsureSuccessStatusCode();
            var c = read.Scenes.Single(scene => scene.Title == "C");
            (await client.PutAsJsonAsync($"{story}/scenes/{c.Id}/position", new ScenePositionRequest(arrival.Id, 0)))
                .EnsureSuccessStatusCode();

            var structured = (await client.GetFromJsonAsync<StoryDetail>(story))!;
            Assert.Equal(
                new (string, Guid?, int)[] { ("B", null, 0), ("C", arrival.Id, 0), ("D", arrival.Id, 1), ("A", ashes.Id, 0) },
                structured.Scenes.Select(scene => (scene.Title, scene.ChapterId, scene.SortOrder)));
        }

        SqliteConnection.ClearAllPools();

        // A chapter's own order is guarded too.
        await using (var db = Context())
        {
            var clash = await Assert.ThrowsAsync<SqliteException>(
                () => db.Database.ExecuteSqlAsync($"UPDATE \"Scenes\" SET \"SortOrder\" = 0 WHERE \"Title\" = 'D'"));
            Assert.Contains("UNIQUE", clash.Message, StringComparison.Ordinal);
            Assert.Empty(await ForeignKeyViolations(db));
        }

        SqliteConnection.ClearAllPools();

        List<string> flattened;

        // Down with chapters in the file: the chapters go, and every scene takes its place in the whole
        // story as the story read - Unchaptered first, then chapter by chapter. Nothing else changes.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(BeforeChapters);

            Assert.DoesNotContain("Chapters", await Tables(db));
            Assert.DoesNotContain("ChapterId", await Columns(db, "Scenes"));
            Assert.Contains("IX_Scenes_StoryId_SortOrder:1:0", await Indexes(db, "Scenes"));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(links, await db.SceneEntityLinks.CountAsync());

            flattened = await SceneRows(db);
            Assert.Equal(
                [
                    "Another story|X|0", "Another story|Y|1",
                    "The Long Winter|B|0", "The Long Winter|C|1", "The Long Winter|D|2", "The Long Winter|A|3",
                ],
                Placement(flattened));

            // Every scene that was there before chapters is still itself: id, point of view, year, text, links.
            Assert.Equal(
                legacy.Select(WithoutPlace).Order(StringComparer.Ordinal),
                flattened.Where(row => !row.Contains("|D|", StringComparison.Ordinal)).Select(WithoutPlace).Order(StringComparer.Ordinal));
        }

        SqliteConnection.ClearAllPools();

        // And up once more: every scene Unchaptered, in the order the rollback left.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(0, await db.Chapters.CountAsync());
            Assert.Equal(flattened, await SceneRows(db));
            Assert.Equal(links, await db.SceneEntityLinks.CountAsync());
        }
    }

    // ---------- Reading the file ----------

    /// <summary>
    /// Every scene as one line - story, title, place, id, point of view, year, summary and link count - by
    /// story and place. Plain SQL, so it reads both schemas the same way.
    /// </summary>
    private static async Task<List<string>> SceneRows(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                """
                SELECT st."Title" || '|' || s."Title" || '|' || s."SortOrder" || '|' || s."Id" || '|'
                    || COALESCE(s."PovEntityId", '-') || '|' || COALESCE(s."Year", '-') || '|'
                    || COALESCE(s."Summary", '-') || '|'
                    || (SELECT COUNT(*) FROM "SceneEntityLinks" AS l WHERE l."SceneId" = s."Id") AS Value
                FROM "Scenes" AS s
                JOIN "Stories" AS st ON st."Id" = s."StoryId"
                ORDER BY st."Title", s."SortOrder"
                """)
            .ToListAsync();

    /// <summary>Story, title and place only.</summary>
    private static List<string> Placement(List<string> rows) =>
        [.. rows.Select(row => string.Join('|', row.Split('|')[..3]))];

    /// <summary>Everything but the place.</summary>
    private static string WithoutPlace(string row)
    {
        var parts = row.Split('|');
        return string.Join('|', parts.Take(2).Concat(parts.Skip(3)));
    }

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Tables(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'table'")
            .ToListAsync();

    private static async Task<List<string>> Columns(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeys(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list({table})")
            .ToListAsync();

    private static async Task<List<string>> Indexes(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name || ':' || \"unique\" || ':' || partial AS Value FROM pragma_index_list({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check")
            .ToListAsync();

    // ---------- Writing through the API ----------

    private static async Task<T> PostJson<T>(HttpClient client, string path, object body)
    {
        var response = await client.PostAsJsonAsync(path, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<Guid> AfterTheFall(HttpClient client, Guid universeId)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras[1].Id;
    }

    private static async Task<Guid> CreateEntity(HttpClient client, Guid universeId, string name)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        return (await PostJson<EntityDetail>(
            client,
            $"/api/universes/{universeId}/entities",
            new EntityRequest(types.First(type => type.Name == "Character").Id, name, null, CanonStatus.Idea, null, null, null)))
            .Id;
    }

    /// <summary>The real host on the file, outside Development, so startup migrates it the way a deployment does.</summary>
    private sealed class FileHost(string dataSource) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
        }

        /// <summary>Outside Development the session cookie is secure-only, so it only travels over https.</summary>
        public HttpClient CreateHttpsClient() => CreateClient(
            new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();

        try
        {
            if (Directory.Exists(_directory))
            {
                Directory.Delete(_directory, recursive: true);
            }
        }
        catch (IOException)
        {
            // A handle Windows has not let go of yet. The directory is under the temp root and
            // named for this run, so leaving it costs nothing.
        }
    }
}
