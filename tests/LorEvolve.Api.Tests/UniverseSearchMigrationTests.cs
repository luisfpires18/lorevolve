using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Search;
using LorEvolve.Api.Features.Stories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static LorEvolve.Api.Tests.ArticleTestClient;
using static LorEvolve.Api.Tests.IdeaTestClient;
using static LorEvolve.Api.Tests.ManuscriptTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The universe search migration, walked down and back up over a real SQLite file holding lore, a story with everything in
/// it, prose, a scene in the Trash and ideas (ADR 0031).
///
/// Down removes the three indexes and every trigger and touches no authored row. Up creates them filled from what was
/// already written - including text changed while there was no trigger to see it - and the upgraded file searches, stays in
/// step on the next write, and has the lore index's marker-holding row written again, cleaned, by the startup backfill.
/// Every trigger is read back from SQLite by name, so a later migration that rebuilds one of these tables and drops its
/// trigger fails here rather than quietly leaving search behind.
/// </summary>
public sealed class UniverseSearchMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before the universe search.</summary>
    private const string BeforeSearch = "20260914113507_AddIdeas";

    private static readonly string[] IndexTables = ["StorySearchIndex", "SceneManuscriptSearchIndex", "IdeaSearchIndex"];

    /// <summary>Every trigger the migration creates. Read back by name from <c>sqlite_master</c>.</summary>
    public static readonly string[] Triggers =
    [
        .. new[] { "Story", "Chapter", "Scene", "PlotArc", "PlotBeat" }.SelectMany(name => new[]
        {
            $"StorySearchIndex_{name}Inserted", $"StorySearchIndex_{name}Updated", $"StorySearchIndex_{name}Deleted",
        }),
        "SceneManuscriptSearchIndex_ManuscriptInserted",
        "SceneManuscriptSearchIndex_ManuscriptUpdated",
        "SceneManuscriptSearchIndex_ManuscriptDeleted",
        "IdeaSearchIndex_IdeaInserted",
        "IdeaSearchIndex_IdeaUpdated",
        "IdeaSearchIndex_IdeaDeleted",
    ];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-search-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task The_indexes_come_and_go_alone_are_filled_from_what_was_written_and_the_upgraded_file_searches()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid entityId;
        Guid storyId;
        Guid sceneId;
        Guid trashedSceneId;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-searchmigrate", "user-searchmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World searchmigrate")).Id;
            entityId = await CreateEntity(client, universeId, "Arlen");
            await WriteArticle(client, universeId, entityId, Doc("Arlen kept the harbour ledger."));

            storyId = (await PostJson<StoryDetail>(
                client, Stories(universeId), new StoryRequest("The Long Winter", "A siege.", StoryStatus.Drafting))).Id;
            var chapterId = await CreateChapter(client, universeId, storyId, "Arrival");
            sceneId = await CreateScene(client, universeId, storyId, "The Council", chapterId);
            await WriteManuscript(client, universeId, storyId, sceneId, "The hall had emptied.");
            var arc = await CreateArc(client, universeId, storyId, "Fall of the King");
            await CreateBeat(client, universeId, storyId, arc.Id, "The crown is refused");

            trashedSceneId = await CreateScene(client, universeId, storyId, "Obsidian in the Trash");
            (await client.DeleteAsync($"{Story(universeId, storyId)}/scenes/{trashedSceneId}")).EnsureSuccessStatusCode();

            await CreateIdea(client, "Mira betrays Arlen", "Maybe.", universeId);
            await CreateIdea(client, "Obsidian, unassigned", "No world.");
        }

        SqliteConnection.ClearAllPools();

        List<string> authored;

        await using (var db = Context())
        {
            authored = await AuthoredRows(db);

            await db.GetService<IMigrator>().MigrateAsync(BeforeSearch);

            var tables = await Names(db, "table");
            Assert.All(IndexTables, table => Assert.DoesNotContain(table, tables));
            Assert.Empty((await Names(db, "trigger")).Intersect(Triggers));
            Assert.Contains("EntitySearchIndex_EntityDeleted", await Names(db, "trigger"));
            Assert.Equal(authored, await AuthoredRows(db));
            Assert.Empty(await ForeignKeyViolations(db));

            // Written while no trigger was there to see it: the fill has to read the rows, not remember the writes.
            await db.Database.ExecuteSqlAsync($"UPDATE Scenes SET Summary = 'Obsidian gathers.' WHERE Id = {sceneId}");
            await db.Database.ExecuteSqlAsync($"UPDATE SceneManuscripts SET Content = 'Obsidian dust on the floor.' WHERE SceneId = {sceneId}");
            await db.Database.ExecuteSqlAsync($"UPDATE Stories SET Premise = 'An obsidian siege.' WHERE Id = {storyId}");
            await db.Database.ExecuteSqlRawAsync("UPDATE Ideas SET Body = 'Obsidian eyes.' WHERE Title = 'Mira betrays Arlen'");

            // A lore index row as a database from before the clean-up could hold it: a marker character in its copy.
            await db.Database.ExecuteSqlAsync(
                $"UPDATE EntitySearchIndex SET Summary = 'marked ' || char(57344) || ' summary' WHERE EntityId = {entityId}");

            authored = await AuthoredRows(db);
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(authored, await AuthoredRows(db));

            var tables = await Names(db, "table");
            Assert.All(IndexTables, table => Assert.Contains(table, tables));
            Assert.Equal(Triggers.Order(StringComparer.Ordinal), (await Names(db, "trigger")).Intersect(Triggers).Order(StringComparer.Ordinal));

            // Everything written is copied, the Trash and the unassigned idea included: whether a row is found is the
            // search's question, not the index's.
            Assert.Equal(await Scalar(db, "SELECT (SELECT COUNT(*) FROM Stories) + (SELECT COUNT(*) FROM Chapters) + (SELECT COUNT(*) FROM Scenes) + (SELECT COUNT(*) FROM PlotArcs) + (SELECT COUNT(*) FROM PlotBeats) AS Value"),
                await Scalar(db, "SELECT COUNT(*) AS Value FROM StorySearchIndex"));
            Assert.Equal(await Scalar(db, "SELECT COUNT(*) AS Value FROM SceneManuscripts"), await Scalar(db, "SELECT COUNT(*) AS Value FROM SceneManuscriptSearchIndex"));
            Assert.Equal(await Scalar(db, "SELECT COUNT(*) AS Value FROM Ideas"), await Scalar(db, "SELECT COUNT(*) AS Value FROM IdeaSearchIndex"));

            // The lore row holding a marker is gone, for the backfill to write again.
            Assert.Equal(0, await Scalar(db, $"SELECT COUNT(*) AS Value FROM EntitySearchIndex WHERE EntityId = '{Key(entityId)}'"));
        }

        SqliteConnection.ClearAllPools();

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-searchmigrate", Password)))
                .EnsureSuccessStatusCode();

            // Text written before the upgrade is found where it lives; the Trash and the unassigned idea are not.
            var found = await Search(client, universeId, "Obsidian");
            Assert.Equal(
                [UniverseSearchKind.Story, UniverseSearchKind.Scene, UniverseSearchKind.Manuscript, UniverseSearchKind.Idea],
                found.Results.Select(result => result.Kind).Order());
            Assert.DoesNotContain(found.Results, result => result.Id == trashedSceneId);

            // The backfill wrote the lore row again, from the entry, cleaned.
            Assert.Equal(UniverseSearchField.Article, Assert.Single((await Search(client, universeId, "ledger")).Results).MatchedIn);

            // And the upgraded file keeps the indexes in step on the next write.
            await PutJson<SceneResponse>(
                client,
                $"{Story(universeId, storyId)}/scenes/{sceneId}",
                new SceneRequest("The Council of Basalt", "Obsidian gathers.", null, null, null, null, (await ReadStory(client, universeId, storyId)).Scenes.Single(scene => scene.Id == sceneId).ChapterId));
            Assert.Equal([sceneId], (await Search(client, universeId, "Basalt")).Results.Select(result => result.Id));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            Assert.Equal(0, await Scalar(db, "SELECT COUNT(*) AS Value FROM EntitySearchIndex WHERE instr(Summary, char(57344)) > 0"));
            Assert.Equal(1, await Scalar(db, $"SELECT COUNT(*) AS Value FROM EntitySearchIndex WHERE EntityId = '{Key(entityId)}'"));
        }
    }

    // ---------- Reading the file ----------

    private const string AuthoredRowsSql = """
        SELECT 'entity|' || "Name" || '|' || coalesce("Summary", '') || '|' || "Id" AS Value FROM "Entities"
        UNION ALL SELECT 'article|' || "EntityId" || '|' || "Content" AS Value FROM "EntityArticles"
        UNION ALL SELECT 'story|' || "Title" || '|' || coalesce("Premise", '') || '|' || "Id" AS Value FROM "Stories"
        UNION ALL SELECT 'chapter|' || "Title" || '|' || "Id" AS Value FROM "Chapters"
        UNION ALL SELECT 'scene|' || "Title" || '|' || coalesce("Summary", '') || '|' || coalesce("DeletedAt", '') || '|' || "Id" AS Value FROM "Scenes"
        UNION ALL SELECT 'prose|' || "SceneId" || '|' || "Content" AS Value FROM "SceneManuscripts"
        UNION ALL SELECT 'arc|' || "Title" || '|' || "Id" AS Value FROM "PlotArcs"
        UNION ALL SELECT 'beat|' || "Title" || '|' || "Id" AS Value FROM "PlotBeats"
        UNION ALL SELECT 'idea|' || "Title" || '|' || "Body" || '|' || coalesce("UniverseId", '') || '|' || "Id" AS Value FROM "Ideas"
        ORDER BY Value
        """;

    private static async Task<List<string>> AuthoredRows(LorEvolveDbContext db) =>
        await db.Database.SqlQueryRaw<string>(AuthoredRowsSql).ToListAsync();

    private static async Task<List<string>> Names(LorEvolveDbContext db, string type) =>
        await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM sqlite_master WHERE type = {type}")
            .ToListAsync();

    private static async Task<int> Scalar(LorEvolveDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<int>(sql).SingleAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check")
            .ToListAsync();

    /// <summary>A Guid as the schema stores it.</summary>
    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

    private static async Task<UniverseSearchResponse> Search(HttpClient client, Guid universeId, string query) =>
        (await client.GetFromJsonAsync<UniverseSearchResponse>($"/api/universes/{universeId}/search?q={Uri.EscapeDataString(query)}"))!;

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

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
