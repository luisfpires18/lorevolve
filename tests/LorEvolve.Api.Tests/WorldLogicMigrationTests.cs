using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Systems;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The World Logic migration (#150, ADR 0072), down and back up over a real SQLite file.
///
/// <para>It only adds: six tables and their indexes, with no column change and no table rebuild anywhere, so
/// rolling back has to take exactly those six and leave every world rule, every rule check and every other row
/// untouched. A rebuild would have been the thing to fear here, because an <c>ef_temp_</c> rebuild drops a table's
/// triggers without saying so, and this schema has triggers on the lore tables.</para>
///
/// <para>Up again it declares the delete actions the model does, read back from SQLite rather than from the model, so
/// a configuration that says cascade and a database that says no action cannot disagree quietly.</para>
/// </summary>
public sealed class WorldLogicMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration before this one: rolling back to it is rolling back exactly World Logic.</summary>
    private const string BeforeWorldLogic = "20261115094834_AllowProjectEntryProposals";

    private static readonly string[] WorldLogicTables =
    [
        "LoreSystems",
        "LoreSystemRevisions",
        "LoreSystemRules",
        "SystemRules",
        "SystemRuleRevisions",
        "SystemRuleDependencies",
    ];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-worldlogic-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task The_world_logic_tables_come_and_go_alone_and_the_schema_holds_their_lines()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-wlmigrate", "user-wlmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World wlmigrate")).Id;
            await CreateEntity(client, universeId, "Arlen");

            // A world rule with a check, so the rollback has something of ADR 0034 to preserve.
            var eventKind = await RuleValidationTestClient.EventKind(client, universeId, "Resurrection");
            var method = await RuleValidationTestClient.Method(client, universeId, "Rite of Ash");
            await RuleValidationTestClient.CreateCheckedRule(
                client,
                universeId,
                "One resurrection per person",
                RuleValidationTestClient.Limit(eventKind.Id, method.Id, 1));

            // And World Logic of its own, which the rollback is expected to take.
            var rule = await PostJson<SystemRuleDetail>(
                client,
                $"/api/universes/{universeId}/system-rules",
                new SystemRuleRequest("Purity", "At least two.", null, 1, Parse(PurityAtLeast(2))));

            var system = await PostJson<SystemDetail>(
                client,
                $"/api/universes/{universeId}/systems",
                new SystemRequest("Runeforging", "Metal."));

            await PutJson<SystemDetail>(
                client,
                $"/api/universes/{universeId}/systems/{system.Id}/rules/{rule.Id}",
                new { });
        }

        SqliteConnection.ClearAllPools();

        List<string> kept;
        List<string> triggersBefore;

        await using (var db = Context())
        {
            kept = await Rows(db);
            triggersBefore = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            Assert.NotEmpty(triggersBefore);

            await db.GetService<IMigrator>().MigrateAsync(BeforeWorldLogic);

            var tables = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table'");
            Assert.All(WorldLogicTables, table => Assert.DoesNotContain(table, tables));

            // Everything else is exactly as it was, triggers included: nothing was rebuilt on the way down.
            Assert.Equal(kept, await Rows(db));
            Assert.Equal(
                triggersBefore,
                await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));

            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(
                triggersBefore,
                await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));

            // The rows the rollback dropped are gone, and the rest came back untouched.
            Assert.Equal(0, await db.LoreSystems.CountAsync());
            Assert.Equal(0, await db.SystemRules.CountAsync());
            Assert.Equal(kept, await Rows(db));
            Assert.Equal(1, await db.WorldRuleValidations.IgnoreQueryFilters().CountAsync());

            // The delete actions SQLite itself holds, not the ones the model declares.
            Assert.Equal(
                ["CreativeProjects.ProjectId:CASCADE", "Universes.UniverseId:CASCADE"],
                (await ForeignKeys(db, "LoreSystems")).Order(StringComparer.Ordinal));

            Assert.Equal(
                ["CreativeProjects.ProjectId:CASCADE", "Universes.UniverseId:CASCADE"],
                (await ForeignKeys(db, "SystemRules")).Order(StringComparer.Ordinal));

            Assert.Equal(
                ["LoreSystems.SystemId:CASCADE", "SystemRules.RuleId:CASCADE"],
                (await ForeignKeys(db, "LoreSystemRules")).Order(StringComparer.Ordinal));

            Assert.Equal(
                ["SystemRules.DependsOnRuleId:CASCADE", "SystemRules.RuleId:CASCADE"],
                (await ForeignKeys(db, "SystemRuleDependencies")).Order(StringComparer.Ordinal));

            Assert.Equal(["LoreSystems.SystemId:CASCADE"], await ForeignKeys(db, "LoreSystemRevisions"));
            Assert.Equal(["SystemRules.RuleId:CASCADE"], await ForeignKeys(db, "SystemRuleRevisions"));
        }

        SqliteConnection.ClearAllPools();

        // And the upgraded database serves the feature again through the real host.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-wlmigrate", Password)))
                .EnsureSuccessStatusCode();

            var created = await PostJson<SystemDetail>(
                client,
                $"/api/universes/{universeId}/systems",
                new SystemRequest("After the upgrade", null));

            Assert.Equal(1, created.Version);

            var worldRules = await client.GetFromJsonAsync<JsonElement>($"/api/universes/{universeId}/world-rules");
            Assert.Equal(1, worldRules.GetProperty("totalCount").GetInt32());
            Assert.True(worldRules.GetProperty("items").EnumerateArray().First().GetProperty("hasCheck").GetBoolean());
        }
    }

    /// <summary>The rows the rollback must not touch: the lore, the world rules and the universe itself.</summary>
    private static async Task<List<string>> Rows(LorEvolveDbContext db) =>
        await Strings(db, """
            SELECT 'entity|' || "Name" || '|' || "Id" AS Value FROM "Entities"
            UNION ALL SELECT 'worldrule|' || "Title" || '|' || "Id" AS Value FROM "WorldRules"
            UNION ALL SELECT 'term|' || "Name" || '|' || "Id" AS Value FROM "ValidationTerms"
            UNION ALL SELECT 'check|' || "WorldRuleId" || '|' || "MaxOccurrences" AS Value FROM "WorldRuleValidations"
            UNION ALL SELECT 'universe|' || "Name" || '|' || "Id" AS Value FROM "Universes"
            ORDER BY Value
            """);

    private static async Task<List<string>> Strings(LorEvolveDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    private static async Task<List<string>> ForeignKeys(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list({table})")
            .ToListAsync();

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static string PurityAtLeast(int floor) =>
        "{\"kind\":\"compare\",\"left\":{\"attribute\":\"purity\",\"of\":{\"subject\":\"self\"}},"
        + $"\"op\":\"gte\",\"right\":{{\"literal\":{floor},\"type\":\"number\"}}}}";

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
            // A pooled handle can outlive the test on Windows; the temporary directory is cleaned up by the OS.
        }
    }
}
