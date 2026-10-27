using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Stories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static LorEvolve.Api.Tests.ManuscriptTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The manuscript migration, walked down and back up over a real SQLite file holding a story in chapters with a plot.
///
/// It only creates one table, so the risks are narrow, and each is read back from the file rather than trusted from the
/// generated code. An existing story database must come through with every story, chapter, scene and plot link exactly as
/// it was, and no prose. The new table must be keyed by the scene, hold long text, and delete with the scene and nothing
/// else - so a chapter delete, a move or a reorder keeps every word. And a rollback with prose in the file must drop it
/// without touching a scene.
/// </summary>
public sealed class SceneManuscriptMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before scene manuscripts.</summary>
    private const string BeforeManuscripts = "20260913114657_AddStoryPlotArcsAndBeats";

    private const string Table = "SceneManuscripts";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-manuscript-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task A_story_database_gains_empty_manuscripts_that_live_and_die_with_their_scenes_and_rolls_back_cleanly()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid storyId;
        Guid arrival;
        Guid gate;
        Guid inside;
        Guid loose;

        // A story in chapters, with lore and a plot, written by the current host - and prose, so the first rollback has
        // some to drop.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-msmigrate", "user-msmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World msmigrate")).Id;
            var arlen = await CreateEntity(client, universeId, "Arlen");
            storyId = await CreateStory(client, universeId, "The Ashen Road");
            var story = Story(universeId, storyId);

            arrival = await CreateChapter(client, universeId, storyId, "Arrival");
            gate = (await PostJson<SceneResponse>(
                client, $"{story}/scenes", new SceneRequest("At the gate", "Snow.", null, arlen, null, [arlen], arrival))).Id;
            inside = await CreateScene(client, universeId, storyId, "Inside", arrival);
            loose = await CreateScene(client, universeId, storyId, "Loose thread");

            var fall = await CreateArc(client, universeId, storyId, "Fall of the King");
            await CreateBeat(client, universeId, storyId, fall.Id, "Learns", [gate, loose], [arlen]);

            await WriteManuscript(client, universeId, storyId, gate, "Written before a rollback.");
        }

        SqliteConnection.ClearAllPools();

        List<string> scenes;
        List<string> chapters;
        int beatScenes;

        // Down to the schema before manuscripts: the prose goes, and not one story row changes.
        await using (var db = Context())
        {
            scenes = await SceneRows(db);
            chapters = await ChapterRows(db);
            beatScenes = await db.PlotBeatScenes.CountAsync();
            Assert.Equal(3, scenes.Count);
            Assert.Single(chapters);
            Assert.Equal(1, await db.SceneManuscripts.CountAsync());

            await db.GetService<IMigrator>().MigrateAsync(BeforeManuscripts);

            Assert.DoesNotContain(Table, await Tables(db));
            Assert.Equal(scenes, await SceneRows(db));
            Assert.Equal(chapters, await ChapterRows(db));
            Assert.Equal(beatScenes, await db.PlotBeatScenes.CountAsync());
            Assert.Empty(await ForeignKeyViolations(db));
        }

        SqliteConnection.ClearAllPools();

        // Up: an existing story database gains the table, empty, and nothing else about it changes.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Contains(Table, await Tables(db));
            Assert.Equal(0, await db.SceneManuscripts.CountAsync());

            Assert.Equal(scenes, await SceneRows(db));
            Assert.Equal(chapters, await ChapterRows(db));
            Assert.Equal(beatScenes, await db.PlotBeatScenes.CountAsync());

            // Keyed by the scene, deleted with the scene, and long text with no length of its own.
            Assert.Equal(["Scenes.SceneId:CASCADE"], await ForeignKeys(db, Table));
            Assert.Equal(["SceneId"], await PrimaryKey(db, Table));
            Assert.Equal(
                ["Content:TEXT:1", "SceneId:TEXT:1", "UpdatedAt:TEXT:1", "Version:INTEGER:1"],
                (await Columns(db, Table)).Order(StringComparer.Ordinal));

            // Nothing on a scene points at its prose, and no other table's delete actions moved.
            Assert.Equal(
                ["Chapters.ChapterId:NO ACTION", "ChronologyCalendarMonths.MonthId:NO ACTION", "ChronologyEras.EraId:NO ACTION", "Entities.PovEntityId:SET NULL", "Stories.StoryId:CASCADE"],
                (await ForeignKeys(db, "Scenes")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["PlotBeats.PlotBeatId:CASCADE", "Scenes.SceneId:CASCADE"],
                (await ForeignKeys(db, "PlotBeatScenes")).Order(StringComparer.Ordinal));
        }

        SqliteConnection.ClearAllPools();

        // The upgraded file is a working LorEvolve: scenes open empty, prose saves, and it survives every structural change.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-msmigrate", Password)))
                .EnsureSuccessStatusCode();
            var story = Story(universeId, storyId);

            foreach (var scene in new[] { gate, inside, loose })
            {
                Assert.Equal(string.Empty, (await ReadManuscript(client, universeId, storyId, scene)).Content);
            }

            var gateSaved = await WriteManuscript(client, universeId, storyId, gate, Prose);
            var insideSaved = await WriteManuscript(client, universeId, storyId, inside, "Warm, at last.");
            await WriteManuscript(client, universeId, storyId, loose, "A thread left hanging.");

            await PutJson<List<SceneResponse>>(client, $"{story}/scenes/order", new SceneOrderRequest([inside, gate], arrival));
            await PutJson<StoryDetail>(client, $"{story}/scenes/{gate}/position", new ScenePositionRequest(null, 0));
            (await client.DeleteAsync($"{story}/chapters/{arrival}")).EnsureSuccessStatusCode();

            Assert.Equal(
                ["At the gate", "Loose thread", "Inside"],
                (await ReadStory(client, universeId, storyId)).Scenes.Select(scene => scene.Title));

            var gateKept = await ReadManuscript(client, universeId, storyId, gate);
            Assert.Equal(Prose, gateKept.Content, StringComparer.Ordinal);
            SameMoment(gateSaved.UpdatedAt, gateKept.UpdatedAt);
            SameMoment(insideSaved.UpdatedAt, (await ReadManuscript(client, universeId, storyId, inside)).UpdatedAt);

            // A scene moved to the Trash takes its prose out of reach, and only its own.
            (await client.DeleteAsync($"{story}/scenes/{loose}")).EnsureSuccessStatusCode();
            Assert.Equal(
                HttpStatusCode.NotFound,
                (await client.GetAsync(Manuscript(universeId, storyId, loose))).StatusCode);

            // A second story with prose, so deleting a story in the database has something to take.
            var second = await CreateStory(client, universeId, "Second");
            var secondScene = await CreateScene(client, universeId, second, "Elsewhere");
            await WriteManuscript(client, universeId, second, secondScene, "Elsewhere prose.");
        }

        SqliteConnection.ClearAllPools();

        // The database itself holds what the API never sends.
        await using (var db = Context())
        {
            // The scene in the Trash keeps its prose (ADR 0029).
            Assert.Equal(4, await db.SceneManuscripts.CountAsync());

            var orphan = await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                """INSERT INTO "SceneManuscripts" ("SceneId", "Content", "UpdatedAt") VALUES ('7F1D6C0A-0000-4000-8000-000000000001', 'orphan', '2026-09-13 00:00:00')"""));
            Assert.Contains("FOREIGN KEY", orphan.Message, StringComparison.Ordinal);

            var twice = await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                """INSERT INTO "SceneManuscripts" ("SceneId", "Content", "UpdatedAt") SELECT "SceneId", 'again', "UpdatedAt" FROM "SceneManuscripts" LIMIT 1"""));
            Assert.Contains("UNIQUE", twice.Message, StringComparison.Ordinal);

            // A story row deleted cascades through its scenes to their prose, and to no other story's.
            await db.Stories.Where(story => story.Title == "Second").ExecuteDeleteAsync();

            Assert.Equal(3, await db.SceneManuscripts.CountAsync());
            Assert.Equal(
                new[] { gate, inside, loose }.Order(),
                (await db.SceneManuscripts.Select(row => row.SceneId).ToListAsync()).Order());
            Assert.Empty(await ForeignKeyViolations(db));
        }

        SqliteConnection.ClearAllPools();

        // Down again with prose in the file - the prose goes, every live scene stays - and up once more to none. The schema
        // before content recovery had no Trash, so rolling past it discards the scene that was in it.
        await using (var db = Context())
        {
            var before = (await SceneRows(db))
                .Where(row => !row.Contains(loose.ToString(), StringComparison.OrdinalIgnoreCase))
                .ToList();

            await db.GetService<IMigrator>().MigrateAsync(BeforeManuscripts);

            Assert.DoesNotContain(Table, await Tables(db));
            Assert.Equal(before, await SceneRows(db));
            Assert.Empty(await ForeignKeyViolations(db));

            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(0, await db.SceneManuscripts.CountAsync());
            Assert.Equal(before, await SceneRows(db));
            Assert.Empty(await ForeignKeyViolations(db));
        }
    }

    // ---------- Reading the file ----------

    /// <summary>Every scene as one line - story, title, chapter, place, id and summary. Plain SQL, so both schemas read alike.</summary>
    private static async Task<List<string>> SceneRows(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                """
                SELECT st."Title" || '|' || s."Title" || '|' || COALESCE(s."ChapterId", '-') || '|' || s."SortOrder" || '|'
                    || s."Id" || '|' || COALESCE(s."Summary", '-') AS Value
                FROM "Scenes" AS s
                JOIN "Stories" AS st ON st."Id" = s."StoryId"
                ORDER BY st."Title", COALESCE(s."ChapterId", ''), s."SortOrder"
                """)
            .ToListAsync();

    /// <summary>Every chapter as one line: story, title, place and id.</summary>
    private static async Task<List<string>> ChapterRows(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                """
                SELECT c."StoryId" || '|' || c."Title" || '|' || c."SortOrder" || '|' || c."Id" AS Value
                FROM "Chapters" AS c
                ORDER BY c."StoryId", c."SortOrder"
                """)
            .ToListAsync();

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Tables(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'table'")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeys(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list({table})")
            .ToListAsync();

    /// <summary>The primary key's columns, in key order.</summary>
    private static async Task<List<string>> PrimaryKey(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table}) WHERE pk > 0 ORDER BY pk")
            .ToListAsync();

    /// <summary>Every column as name:type:notnull.</summary>
    private static async Task<List<string>> Columns(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name || ':' || type || ':' || \"notnull\" AS Value FROM pragma_table_info({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check")
            .ToListAsync();

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
            // A handle Windows has not let go of yet. The directory is under the temp root and named for this run, so
            // leaving it costs nothing.
        }
    }
}
