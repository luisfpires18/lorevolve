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
/// The World Logic findings migration (#153, ADR 0072), down and back up over a real SQLite file.
///
/// <para>It only adds: three tables and their indexes, with no column change and no table rebuild anywhere, so
/// rolling back has to take exactly those three and leave the Systems, the rule definitions, the lore and the
/// triggers on the lore tables untouched. A rebuild would have been the thing to fear, because an
/// <c>ef_temp_</c> rebuild drops a table's triggers without saying so.</para>
///
/// <para>Up again it declares the delete actions the model does, read back from SQLite rather than from the model,
/// so a configuration that says cascade and a database that says no action cannot disagree quietly. That matters
/// most here: a finding reaches its universe through its rule, so a wrong action would leave a universe
/// undeletable.</para>
/// </summary>
public sealed class WorldLogicFindingMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration before this one: rolling back to it is rolling back exactly the findings.</summary>
    private const string BeforeFindings = "20261115140422_AddRuleExceptions";

    private static readonly string[] FindingTables =
    [
        "WorldLogicFindings",
        "WorldLogicFindingEvidence",
        "WorldLogicFindingEvents",
    ];

    private static readonly string[] SystemTables =
    [
        "LoreSystems",
        "SystemRules",
        "SystemRuleDependencies",
    ];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-findings-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task The_finding_tables_come_and_go_alone_and_the_schema_holds_their_lines()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-wlfmigrate", "user-wlfmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World wlfmigrate")).Id;
            await CreateEntity(client, universeId, "Arlen");

            // A rule with a condition that comes out false without a target, so the sweep has a finding to record.
            await PostJson<SystemRuleDetail>(
                client,
                $"/api/universes/{universeId}/system-rules",
                new SystemRuleRequest("A dragon is on record", "There is none.", null, 1, Parse(DragonExists())));

            var sweep = await client.PostAsync(
                $"/api/universes/{universeId}/world-logic/findings/evaluate",
                null);

            sweep.EnsureSuccessStatusCode();
            Assert.Equal(1, (await sweep.Content.ReadFromJsonAsync<WorldLogicSweepResponse>())!.Created);
        }

        SqliteConnection.ClearAllPools();

        List<string> kept;
        List<string> triggersBefore;

        await using (var db = Context())
        {
            kept = await Rows(db);
            triggersBefore = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            Assert.NotEmpty(triggersBefore);
            Assert.Equal(1, await db.WorldLogicFindings.CountAsync());

            await db.GetService<IMigrator>().MigrateAsync(BeforeFindings);

            var tables = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table'");
            Assert.All(FindingTables, table => Assert.DoesNotContain(table, tables));

            // The Systems and rule definitions the findings were about are still there, and so is everything else.
            Assert.All(SystemTables, table => Assert.Contains(table, tables));
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

            // The findings the rollback dropped are gone, and the rules that produced them came back untouched.
            Assert.Equal(0, await db.WorldLogicFindings.CountAsync());
            Assert.Equal(kept, await Rows(db));

            Assert.Equal(
                ["CreativeProjects.ProjectId:CASCADE", "SystemRules.RuleId:CASCADE"],
                (await ForeignKeys(db, "WorldLogicFindings")).Order(StringComparer.Ordinal));

            Assert.Equal(["WorldLogicFindings.FindingId:CASCADE"], await ForeignKeys(db, "WorldLogicFindingEvidence"));
            Assert.Equal(["WorldLogicFindings.FindingId:CASCADE"], await ForeignKeys(db, "WorldLogicFindingEvents"));
        }

        SqliteConnection.ClearAllPools();

        // And the upgraded database serves the feature again through the real host.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-wlfmigrate", Password)))
                .EnsureSuccessStatusCode();

            var sweep = await client.PostAsync(
                $"/api/universes/{universeId}/world-logic/findings/evaluate",
                null);

            sweep.EnsureSuccessStatusCode();
            Assert.Equal(1, (await sweep.Content.ReadFromJsonAsync<WorldLogicSweepResponse>())!.Created);
        }
    }

    /// <summary>The rows the rollback must not touch: the lore, the Systems, the rule definitions and the universe.</summary>
    private static async Task<List<string>> Rows(LorEvolveDbContext db) =>
        await Strings(db, """
            SELECT 'entity|' || "Name" || '|' || "Id" AS Value FROM "Entities"
            UNION ALL SELECT 'rule|' || "Title" || '|' || "Id" AS Value FROM "SystemRules"
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

    /// <summary>
    /// A rule that says the universe holds a dragon. It names no target, so it answers for the universe rather than
    /// for one entry, and a universe with no dragon answers false.
    /// </summary>
    private static string DragonExists() =>
        "{\"kind\":\"exists\",\"query\":{\"from\":\"subjects\",\"where\":"
        + "[{\"field\":\"type\",\"op\":\"eq\",\"value\":\"Dragon\",\"type\":\"text\"}]}}";

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
