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
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The plot migration, walked down and back up over a real SQLite file holding a real story in chapters.
///
/// It only creates tables, so the risks are narrow, and each is read back from the file rather than trusted from the
/// generated code. An existing story database must come through with every story, chapter, scene and link exactly as
/// it was, and an empty plot. Each new reference must delete in the direction it claims - a plot row never takes a
/// scene, a chapter or an entry with it. The unique orders and the pair keys must hold in the database itself. And a
/// rollback with a plot in the file must drop it without touching a story.
/// </summary>
public sealed class PlotMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before plot arcs and beats.</summary>
    private const string BeforePlot = "20260913104555_AddStoryChapters";

    private static readonly string[] PlotTables = ["PlotArcs", "PlotBeatEntities", "PlotBeatScenes", "PlotBeats"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-plot-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task A_story_database_gains_an_empty_plot_whose_references_never_delete_a_story_and_rolls_back_cleanly()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid storyId;
        Guid arlen;
        Guid arrival;
        Guid gate;
        Guid inside;
        Guid loose;

        // A story in chapters, with lore, written by the current host - and a plot, so the first rollback has one to drop.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-plotmigrate", "user-plotmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World plotmigrate")).Id;
            arlen = await CreateEntity(client, universeId, "Arlen");
            storyId = await CreateStory(client, universeId, "The Ashen Road");
            var story = Story(universeId, storyId);

            arrival = (await PostJson<ChapterResponse>(
                client, $"{story}/chapters", new ChapterRequest("Arrival", "They reach the gate.", null))).Id;
            gate = (await PostJson<SceneResponse>(
                client, $"{story}/scenes", new SceneRequest("At the gate", "Snow.", null, arlen, null, [arlen], arrival))).Id;
            inside = await CreateScene(client, universeId, storyId, "Inside", arrival);
            loose = await CreateScene(client, universeId, storyId, "Loose thread");

            var doomed = await CreateArc(client, universeId, storyId, "Written before a rollback");
            await CreateBeat(client, universeId, storyId, doomed.Id, "Doomed beat", [gate, loose], [arlen]);
        }

        SqliteConnection.ClearAllPools();

        List<string> scenes;
        List<string> chapters;
        int sceneLinks;

        // Down to the schema before plot: the plot goes, and not one story row changes.
        await using (var db = Context())
        {
            scenes = await SceneRows(db);
            chapters = await ChapterRows(db);
            sceneLinks = await db.SceneEntityLinks.CountAsync();
            Assert.Equal(3, scenes.Count);
            Assert.Single(chapters);

            await db.GetService<IMigrator>().MigrateAsync(BeforePlot);

            Assert.Empty((await Tables(db)).Intersect(PlotTables));
            Assert.Equal(scenes, await SceneRows(db));
            Assert.Equal(chapters, await ChapterRows(db));
            Assert.Equal(sceneLinks, await db.SceneEntityLinks.CountAsync());
            Assert.Empty(await ForeignKeyViolations(db));
        }

        SqliteConnection.ClearAllPools();

        // Up: an existing story database gains an empty plot, and nothing else about it changes.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(PlotTables, (await Tables(db)).Intersect(PlotTables).Order(StringComparer.Ordinal));

            Assert.Equal(scenes, await SceneRows(db));
            Assert.Equal(chapters, await ChapterRows(db));
            Assert.Equal(sceneLinks, await db.SceneEntityLinks.CountAsync());
            Assert.Equal(0, await db.PlotArcs.CountAsync());
            Assert.Equal(0, await db.PlotBeats.CountAsync());
            Assert.Equal(0, await db.PlotBeatScenes.CountAsync());
            Assert.Equal(0, await db.PlotBeatEntities.CountAsync());

            // Which way each reference deletes: ownership runs down from the story, and a scene or an entry going
            // takes only its link.
            Assert.Equal(["Stories.StoryId:CASCADE"], await ForeignKeys(db, "PlotArcs"));
            Assert.Equal(["PlotArcs.PlotArcId:CASCADE"], await ForeignKeys(db, "PlotBeats"));
            Assert.Equal(
                ["PlotBeats.PlotBeatId:CASCADE", "Scenes.SceneId:CASCADE"],
                (await ForeignKeys(db, "PlotBeatScenes")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["Entities.EntityId:CASCADE", "PlotBeats.PlotBeatId:CASCADE"],
                (await ForeignKeys(db, "PlotBeatEntities")).Order(StringComparer.Ordinal));

            // Nothing on a scene or a chapter points at the plot: no arc id on a chapter, no beat id on a scene.
            Assert.Equal(
                ["Chapters.ChapterId:NO ACTION", "ChronologyCalendarMonths.MonthId:NO ACTION", "ChronologyEras.EraId:NO ACTION", "Entities.PovEntityId:SET NULL", "Stories.StoryId:CASCADE"],
                (await ForeignKeys(db, "Scenes")).Order(StringComparer.Ordinal));
            Assert.Equal(["Stories.StoryId:CASCADE"], await ForeignKeys(db, "Chapters"));

            // name:unique:partial - one unique order per story and per arc among live rows (partial since content recovery,
            // ADR 0029: a row in the Trash holds no place), and a lookup for each reference.
            Assert.Contains("IX_PlotArcs_StoryId_SortOrder:1:1", await Indexes(db, "PlotArcs"));
            Assert.Contains("IX_PlotBeats_PlotArcId_SortOrder:1:1", await Indexes(db, "PlotBeats"));
            Assert.Contains("IX_PlotBeatScenes_SceneId:0:0", await Indexes(db, "PlotBeatScenes"));
            Assert.Contains("IX_PlotBeatEntities_EntityId:0:0", await Indexes(db, "PlotBeatEntities"));
            Assert.Equal(["PlotBeatId", "SceneId"], await PrimaryKey(db, "PlotBeatScenes"));
            Assert.Equal(["PlotBeatId", "EntityId"], await PrimaryKey(db, "PlotBeatEntities"));
        }

        SqliteConnection.ClearAllPools();

        // The upgraded file is a working LorEvolve, and every delete keeps to its own side of each reference.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-plotmigrate", Password)))
                .EnsureSuccessStatusCode();

            Assert.Equal(
                ["Loose thread", "At the gate", "Inside"],
                (await ReadStory(client, universeId, storyId)).Scenes.Select(scene => scene.Title));
            Assert.Empty(await Plot(client, universeId, storyId));

            var fall = await CreateArc(client, universeId, storyId, "Fall of the King");
            var mira = await CreateArc(client, universeId, storyId, "Mira's Betrayal");
            var learns = await CreateBeat(client, universeId, storyId, fall.Id, "Learns", [gate, loose], [arlen]);
            await CreateBeat(client, universeId, storyId, fall.Id, "Breach", [inside]);
            await CreateBeat(client, universeId, storyId, mira.Id, "Reveals the gate", [gate], [arlen]);
            await CreateBeat(client, universeId, storyId, mira.Id, "Flees");

            // A scene moved to the Trash takes only its link out of the beat.
            (await client.DeleteAsync($"{Story(universeId, storyId)}/scenes/{loose}")).EnsureSuccessStatusCode();
            var kept = await ReadBeat(client, universeId, storyId, learns.Id);
            Assert.Equal([gate], kept.SceneIds);
            Assert.Equal(0, kept.SortOrder);

            // An arc moved to the Trash takes its beats with it, and no scene, chapter or entry.
            (await client.DeleteAsync(Arc(universeId, storyId, fall.Id))).EnsureSuccessStatusCode();
            var remaining = Assert.Single(await Plot(client, universeId, storyId));
            Assert.Equal((mira.Id, 0), (remaining.Id, remaining.SortOrder));
            Assert.Equal(["Reveals the gate", "Flees"], remaining.Beats.Select(beat => beat.Title));

            var read = await ReadStory(client, universeId, storyId);
            Assert.Equal(["At the gate", "Inside"], read.Scenes.Select(scene => scene.Title));
            Assert.Equal([arrival], read.Chapters.Select(chapter => chapter.Id));
            (await client.GetAsync($"/api/universes/{universeId}/entities/{arlen}")).EnsureSuccessStatusCode();

            // A chapter deleted moves its scenes, and the beat still names the one it linked.
            (await client.DeleteAsync($"{Story(universeId, storyId)}/chapters/{arrival}")).EnsureSuccessStatusCode();
            Assert.Equal([gate], Assert.Single(await Plot(client, universeId, storyId)).Beats[0].SceneIds);

            // A second arc, so the database's own order guard has a neighbour to clash with.
            await CreateArc(client, universeId, storyId, "Search for the Crown");
        }

        SqliteConnection.ClearAllPools();

        // The database itself holds what the API never sends, and an entry row deleted for good takes only its links.
        await using (var db = Context())
        {
            var pair = await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                """INSERT INTO "PlotBeatScenes" ("PlotBeatId", "SceneId") SELECT "PlotBeatId", "SceneId" FROM "PlotBeatScenes" LIMIT 1"""));
            Assert.Contains("UNIQUE", pair.Message, StringComparison.Ordinal);

            var arcClash = await Assert.ThrowsAsync<SqliteException>(
                () => db.Database.ExecuteSqlAsync($"UPDATE \"PlotArcs\" SET \"SortOrder\" = 0 WHERE \"Title\" = 'Search for the Crown'"));
            Assert.Contains("UNIQUE", arcClash.Message, StringComparison.Ordinal);

            var beatClash = await Assert.ThrowsAsync<SqliteException>(
                () => db.Database.ExecuteSqlAsync($"UPDATE \"PlotBeats\" SET \"SortOrder\" = 0 WHERE \"Title\" = 'Flees'"));
            Assert.Contains("UNIQUE", beatClash.Message, StringComparison.Ordinal);

            await db.Entities.Where(entity => entity.Id == arlen).ExecuteDeleteAsync();

            // Nothing in the Trash is erased (ADR 0029): the arc's two beats, the loose scene and every scene link are still
            // stored. The entry row, deleted for good, took only its own links.
            Assert.Equal(4, await db.PlotBeats.CountAsync());
            Assert.Equal(0, await db.PlotBeatEntities.CountAsync());
            Assert.Equal(4, await db.PlotBeatScenes.CountAsync());
            Assert.Equal(3, await db.Scenes.CountAsync());
            Assert.Empty(await ForeignKeyViolations(db));
        }

        SqliteConnection.ClearAllPools();

        // Down again with a plot in the file - the plot goes, every live scene stays - and up once more to an empty plot. The
        // schema before content recovery had no Trash, so rolling past it discards the scene that was in it.
        await using (var db = Context())
        {
            var before = (await SceneRows(db))
                .Where(row => !row.Contains(loose.ToString(), StringComparison.OrdinalIgnoreCase))
                .ToList();

            await db.GetService<IMigrator>().MigrateAsync(BeforePlot);

            Assert.Empty((await Tables(db)).Intersect(PlotTables));
            Assert.Equal(before, await SceneRows(db));
            Assert.Empty(await ForeignKeyViolations(db));

            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(0, await db.PlotArcs.CountAsync());
            Assert.Equal(before, await SceneRows(db));
            Assert.Empty(await ForeignKeyViolations(db));
        }
    }

    // ---------- Reading the file ----------

    /// <summary>
    /// Every scene as one line - story, title, chapter, place, id, point of view, summary and link count. Plain SQL, so
    /// it reads both schemas the same way.
    /// </summary>
    private static async Task<List<string>> SceneRows(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                """
                SELECT st."Title" || '|' || s."Title" || '|' || COALESCE(s."ChapterId", '-') || '|' || s."SortOrder" || '|'
                    || s."Id" || '|' || COALESCE(s."PovEntityId", '-') || '|' || COALESCE(s."Summary", '-') || '|'
                    || (SELECT COUNT(*) FROM "SceneEntityLinks" AS l WHERE l."SceneId" = s."Id") AS Value
                FROM "Scenes" AS s
                JOIN "Stories" AS st ON st."Id" = s."StoryId"
                ORDER BY st."Title", COALESCE(s."ChapterId", ''), s."SortOrder"
                """)
            .ToListAsync();

    /// <summary>Every chapter as one line: story, title, place, id and summary.</summary>
    private static async Task<List<string>> ChapterRows(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                """
                SELECT c."StoryId" || '|' || c."Title" || '|' || c."SortOrder" || '|' || c."Id" || '|'
                    || COALESCE(c."Summary", '-') AS Value
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

    private static async Task<List<string>> Indexes(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name || ':' || \"unique\" || ':' || partial AS Value FROM pragma_index_list({table})")
            .ToListAsync();

    /// <summary>The primary key's columns, in key order.</summary>
    private static async Task<List<string>> PrimaryKey(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table}) WHERE pk > 0 ORDER BY pk")
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
