using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Ideas;
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
/// The migration that made arcs story structure and moved beats into scenes (ADR 0070), walked down and back up over a real
/// SQLite file.
///
/// Going up, every old plot row goes - arcs, beats, their links, the ideas' references to them, their search rows and any AI
/// change proposal that held a beat change - and not one story, chapter, scene, link or idea moves. The new tables cascade the
/// way they claim. Going down, the plot beat tables and their search triggers come back empty, and the chapters' arcs and the
/// scenes' beats go without touching a chapter or a scene.
/// </summary>
public sealed class StoryArcMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before arcs became structure.</summary>
    private const string BeforeArcs = "20261107150710_AddImageDisplayCopies";

    private static readonly string[] PlotBeatTables = ["IdeaPlotBeatReferences", "PlotBeatEntities", "PlotBeatScenes", "PlotBeats"];

    private static readonly string[] NewTables = ["ChapterArcs", "SceneBeats"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-arc-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Old_plot_is_dropped_whole_and_the_story_stays_exactly_as_it_was_both_ways()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid storyId;
        Guid arlen;
        Guid arrival;
        Guid gate;
        Guid loose;
        Guid idea;
        string ownerId;

        // A story in an arc, with beats, written by the current host.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-arcmigrate", "user-arcmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World arcmigrate")).Id;
            arlen = await CreateEntity(client, universeId, "Arlen");
            storyId = await CreateStory(client, universeId, "The Ashen Road");
            arrival = await CreateChapter(client, universeId, storyId, "Arrival");
            gate = await CreateScene(client, universeId, storyId, "At the gate", arrival);
            loose = await CreateScene(client, universeId, storyId, "Loose thread");
            var arc = await CreateArc(client, universeId, storyId, "Pestilence Weapon");
            await MoveChapterToArc(client, universeId, storyId, arrival, arc.Id);
            await SetBeats(client, universeId, storyId, gate, "Marcus reads orders", "Marcus instructs Theo");
            idea = (await IdeaTestClient.CreateIdea(client, "What if", "Words.", universeId, [new IdeaReferenceInput(IdeaReferenceKind.Scene, gate)])).Id;
        }

        SqliteConnection.ClearAllPools();

        List<string> scenes;
        List<string> chapters;

        // Down: the new tables go, the plot beat tables and their triggers come back empty, and no story row changes.
        await using (var db = Context())
        {
            scenes = await SceneRows(db);
            chapters = await ChapterRows(db);
            ownerId = await db.Universes.Where(universe => universe.Id == universeId).Select(universe => universe.OwnerId).SingleAsync();
            Assert.Equal(2, scenes.Count);

            await db.GetService<IMigrator>().MigrateAsync(BeforeArcs);

            var tables = await Names(db, "table");
            Assert.Empty(tables.Intersect(NewTables));
            Assert.Equal(PlotBeatTables, tables.Intersect(PlotBeatTables).Order(StringComparer.Ordinal));
            Assert.Contains("StorySearchIndex_PlotBeatInserted", await Names(db, "trigger"));
            Assert.Equal(scenes, await SceneRows(db));
            Assert.Equal(chapters, await ChapterRows(db));
            Assert.Empty(await ForeignKeyViolations(db));

            // An old plot, as the old schema held it: a second arc with a beat linking a scene and an entry, an idea naming
            // both, and an AI change proposal holding a beat change beside an entry change.
            var oldArc = Guid.NewGuid();
            var oldBeat = Guid.NewGuid();
            var proposal = Guid.NewGuid();
            var now = DateTime.UtcNow.ToString("O");
            await Sql(db, $"""INSERT INTO "PlotArcs" ("Id", "StoryId", "Title", "SortOrder", "CreatedAt", "UpdatedAt", "Visibility") VALUES ('{Key(oldArc)}', '{Key(storyId)}', 'Old thread', 1, '{now}', '{now}', 0)""");
            await Sql(db, $"""INSERT INTO "PlotBeats" ("Id", "PlotArcId", "Title", "Description", "SortOrder", "CreatedAt", "UpdatedAt") VALUES ('{Key(oldBeat)}', '{Key(oldArc)}', 'Old beat', 'Searchable words', 0, '{now}', '{now}')""");
            await Sql(db, $"""INSERT INTO "PlotBeatScenes" ("PlotBeatId", "SceneId") VALUES ('{Key(oldBeat)}', '{Key(gate)}')""");
            await Sql(db, $"""INSERT INTO "PlotBeatEntities" ("PlotBeatId", "EntityId") VALUES ('{Key(oldBeat)}', '{Key(arlen)}')""");
            await Sql(db, $"""INSERT INTO "IdeaPlotBeatReferences" ("IdeaId", "PlotBeatId") VALUES ('{Key(idea)}', '{Key(oldBeat)}')""");
            await Sql(db, $"""INSERT INTO "IdeaPlotArcReferences" ("IdeaId", "PlotArcId") VALUES ('{Key(idea)}', '{Key(oldArc)}')""");
            await Sql(db, $"""INSERT INTO "AiChangeProposals" ("Id", "UniverseId", "ProposedByUserId", "Source", "Status", "Revision", "CreatedAt", "ExpiresAt") VALUES ('{Key(proposal)}', '{Key(universeId)}', '{ownerId}', 0, 0, 1, '{now}', '{now}')""");
            await Sql(db, $"""INSERT INTO "AiChangeOperations" ("Id", "ProposalId", "Sequence", "Key", "Resource", "Action", "Proposed", "DependsOn", "Status") VALUES ('{Key(Guid.NewGuid())}', '{Key(proposal)}', 0, 'beat', 9, 0, '{"{}"}', '[]', 0)""");
            await Sql(db, $"""INSERT INTO "AiChangeOperations" ("Id", "ProposalId", "Sequence", "Key", "Resource", "Action", "Proposed", "DependsOn", "Status") VALUES ('{Key(Guid.NewGuid())}', '{Key(proposal)}', 1, 'entry', 0, 0, '{"{}"}', '[]', 0)""");
            Assert.Equal(1, await Scalar(db, "SELECT COUNT(*) AS Value FROM StorySearchIndex WHERE Kind = 'beat'"));
        }

        SqliteConnection.ClearAllPools();

        // Up: every old plot row goes, and nothing else does.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));

            var tables = await Names(db, "table");
            Assert.Empty(tables.Intersect(PlotBeatTables));
            Assert.Equal(NewTables, tables.Intersect(NewTables).Order(StringComparer.Ordinal));
            Assert.DoesNotContain(await Names(db, "trigger"), name => name.StartsWith("StorySearchIndex_PlotBeat", StringComparison.Ordinal));
            Assert.Equal(0, await Scalar(db, "SELECT COUNT(*) AS Value FROM StorySearchIndex WHERE Kind IN ('beat', 'arc')"));
            Assert.Equal(0, await db.PlotArcs.CountAsync());
            Assert.Equal(0, await db.IdeaPlotArcReferences.CountAsync());
            Assert.Equal(0, await db.AiChangeOperations.CountAsync());
            Assert.Equal(0, await db.AiChangeProposals.CountAsync());

            Assert.Equal(scenes, await SceneRows(db));
            Assert.Equal(chapters, await ChapterRows(db));
            Assert.Equal(1, await db.IdeaSceneReferences.CountAsync(reference => reference.IdeaId == idea));
            Assert.True(await db.Entities.AnyAsync(entity => entity.Id == arlen));
            Assert.Equal(0, await db.ChapterArcs.CountAsync());
            Assert.Equal(0, await db.SceneBeats.CountAsync());

            // A side row per chapter and a row per beat, each cascading from what it belongs to.
            Assert.Equal(["ChapterId"], await PrimaryKey(db, "ChapterArcs"));
            Assert.Equal(
                ["Chapters.ChapterId:CASCADE", "PlotArcs.PlotArcId:CASCADE"],
                (await ForeignKeys(db, "ChapterArcs")).Order(StringComparer.Ordinal));
            Assert.Equal(["Scenes.SceneId:CASCADE"], await ForeignKeys(db, "SceneBeats"));
            Assert.Contains("IX_SceneBeats_SceneId_SortOrder:1:0", await Indexes(db, "SceneBeats"));

            // The new structure works on the upgraded file: a chapter in an arc, a scene with a beat, and both go with them.
            var arc = Guid.NewGuid();
            var now = DateTime.UtcNow.ToString("O");
            await Sql(db, $"""INSERT INTO "PlotArcs" ("Id", "StoryId", "Title", "SortOrder", "CreatedAt", "UpdatedAt", "Visibility") VALUES ('{Key(arc)}', '{Key(storyId)}', 'New', 0, '{now}', '{now}', 0)""");
            await Sql(db, $"""INSERT INTO "ChapterArcs" ("ChapterId", "PlotArcId") VALUES ('{Key(arrival)}', '{Key(arc)}')""");
            await Sql(db, $"""INSERT INTO "SceneBeats" ("Id", "SceneId", "Title", "SortOrder", "CreatedAt", "UpdatedAt") VALUES ('{Key(Guid.NewGuid())}', '{Key(loose)}', 'One', 0, '{now}', '{now}')""");
            await Sql(db, $"""DELETE FROM "PlotArcs" WHERE "Id" = '{Key(arc)}'""");
            Assert.Equal(0, await db.ChapterArcs.CountAsync());
            Assert.Equal(chapters, await ChapterRows(db));
            await Sql(db, $"""DELETE FROM "Scenes" WHERE "Id" = '{Key(loose)}'""");
            Assert.Equal(0, await db.SceneBeats.CountAsync());
            Assert.Empty(await ForeignKeyViolations(db));
        }
    }

    // ---------- Reading the file ----------

    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

    /// <summary>Plain SQL, run as written: braces in a JSON value are text, never format placeholders.</summary>
    private static Task Sql(LorEvolveDbContext db, string sql) =>
        db.Database.ExecuteSqlRawAsync(sql.Replace("{", "{{", StringComparison.Ordinal).Replace("}", "}}", StringComparison.Ordinal));

    private static async Task<int> Scalar(LorEvolveDbContext db, string sql) =>
        (await db.Database.SqlQueryRaw<int>(sql).ToListAsync()).Single();

    /// <summary>Every scene as one line: story, title, chapter, place and id. Plain SQL, so it reads both schemas the same way.</summary>
    private static async Task<List<string>> SceneRows(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                """
                SELECT st."Title" || '|' || s."Title" || '|' || COALESCE(s."ChapterId", '-') || '|' || s."SortOrder" || '|' || s."Id"
                    || '|' || s."Version" AS Value
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

    private static async Task<List<string>> Names(LorEvolveDbContext db, string type) =>
        await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM sqlite_master WHERE type = {type}")
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
