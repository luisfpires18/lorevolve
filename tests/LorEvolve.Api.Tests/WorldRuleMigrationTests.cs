using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Search;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static LorEvolve.Api.Tests.IdeaTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.WorldRuleTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The world rules migration, walked down and back up over a real SQLite file holding lore, a story, an idea and a rule
/// (ADR 0033).
///
/// It only adds: down removes the rule table, its search index and their three triggers and nothing else - every other search
/// trigger is still there, read back by name - and up creates them with the delete action and index the model declares. The
/// upgraded file keeps search in step on a write, and the database's own last line of defence holds: a universe row deleted
/// outside the API takes its rules, and their index rows, with it.
/// </summary>
public sealed class WorldRuleMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before world rules.</summary>
    private const string BeforeWorldRules = "20260914163547_AddUniverseSearchIndex";

    /// <summary>Every trigger the migration creates. Read back by name from <c>sqlite_master</c>.</summary>
    public static readonly string[] Triggers =
    [
        "WorldRuleSearchIndex_WorldRuleInserted",
        "WorldRuleSearchIndex_WorldRuleUpdated",
        "WorldRuleSearchIndex_WorldRuleDeleted",
    ];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-world-rules-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task The_rule_table_and_its_index_come_and_go_alone_and_the_upgraded_file_keeps_search_in_step()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-rulemigrate", "user-rulemigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World rulemigrate")).Id;
            await CreateEntity(client, universeId, "Arlen");
            var storyId = await CreateStory(client, universeId, "The Long Winter");
            await CreateScene(client, universeId, storyId, "The Council");
            await CreateIdea(client, "Mira returns", "Maybe.", universeId);
            await CreateRule(client, universeId, "Rolled back", "Discarded by the rollback.");
        }

        SqliteConnection.ClearAllPools();

        List<string> authored;

        await using (var db = Context())
        {
            authored = await AuthoredRows(db);
            Assert.Equal(1, await db.WorldRules.CountAsync());

            await db.GetService<IMigrator>().MigrateAsync(BeforeWorldRules);

            var tables = await Names(db, "table");
            Assert.DoesNotContain("WorldRules", tables);
            Assert.DoesNotContain("WorldRuleSearchIndex", tables);
            Assert.Empty((await Names(db, "trigger")).Intersect(Triggers));

            // Every other search trigger is exactly where it was.
            Assert.Equal(
                UniverseSearchMigrationTests.Triggers.Order(StringComparer.Ordinal),
                (await Names(db, "trigger")).Intersect(UniverseSearchMigrationTests.Triggers).Order(StringComparer.Ordinal));
            Assert.Equal(authored, await AuthoredRows(db));
            Assert.Empty(await ForeignKeyViolations(db));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(authored, await AuthoredRows(db));

            // The schema before had no room for a rule, so the rollback took it; the table comes back empty.
            Assert.Equal(0, await db.WorldRules.CountAsync());
            Assert.Equal(0, await Scalar(db, "SELECT COUNT(*) AS Value FROM WorldRuleSearchIndex"));

            Assert.Equal(Triggers.Order(StringComparer.Ordinal), (await Names(db, "trigger")).Intersect(Triggers).Order(StringComparer.Ordinal));
            Assert.Equal(
                UniverseSearchMigrationTests.Triggers.Order(StringComparer.Ordinal),
                (await Names(db, "trigger")).Intersect(UniverseSearchMigrationTests.Triggers).Order(StringComparer.Ordinal));

            Assert.Equal(["Universes.UniverseId:CASCADE"], await ForeignKeys(db, "WorldRules"));
            Assert.Contains("IX_WorldRules_UniverseId_DeletedAt:0:0", await Indexes(db, "WorldRules"));
        }

        SqliteConnection.ClearAllPools();

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-rulemigrate", Password)))
                .EnsureSuccessStatusCode();

            var rule = await CreateRule(client, universeId, "Teleportation cannot cross the Veil", "Not even the Quorrel wardens.");
            Assert.Equal(UniverseSearchKind.WorldRule, Assert.Single((await Search(client, universeId, "Quorrel")).Results).Kind);

            await SaveRule(client, universeId, rule, title: "Teleportation cannot cross the Sea");
            Assert.Empty((await Search(client, universeId, "Veil")).Results);
            Assert.Equal([rule.Id], (await Search(client, universeId, "Sea")).Results.Select(result => result.Id));
        }

        SqliteConnection.ClearAllPools();

        // The schema's own guarantee, without the API: the universe row goes, and its rules and their index rows go with it.
        await using (var db = Context())
        {
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"Universes\" WHERE \"Id\" = {0}", Key(universeId));

            Assert.Equal(0, await db.WorldRules.CountAsync());
            Assert.Equal(0, await Scalar(db, "SELECT COUNT(*) AS Value FROM WorldRuleSearchIndex"));
            Assert.Empty(await ForeignKeyViolations(db));
        }
    }

    // ---------- Reading the file ----------

    private const string AuthoredRowsSql = """
        SELECT 'entity|' || "Name" || '|' || "Id" AS Value FROM "Entities"
        UNION ALL SELECT 'story|' || "Title" || '|' || "Id" AS Value FROM "Stories"
        UNION ALL SELECT 'scene|' || "Title" || '|' || "Id" AS Value FROM "Scenes"
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

    private static async Task<List<string>> Indexes(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name || ':' || \"unique\" || ':' || partial AS Value FROM pragma_index_list({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeys(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list({table})")
            .ToListAsync();

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
