using System.Net.Http.Json;
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
/// <c>AddSemanticFindings</c> (#154) rolled back and forward on a real file database.
///
/// <para>The migration only creates tables, so what matters is that it takes nothing else with it: rolling back must
/// drop its two tables and leave the universe, its entries, its rules and the deterministic findings exactly as they
/// were, and rolling forward must leave no pending model change. A universe backup carries none of this on purpose
/// (<see cref="BackupInventoryTests"/> records why), so a rollback losing the claims is expected and the author's
/// world is what must survive.</para>
/// </summary>
public sealed class SemanticFindingMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before this one, which is what a rollback targets.</summary>
    private const string BeforeSemanticFindings = "20261115154205_AddWorldLogicFindings";

    private static readonly string[] SemanticTables = ["SemanticFindings", "SemanticFindingCitations"];

    /// <summary>What must still be there afterwards: the World Logic the claims were about.</summary>
    private static readonly string[] KeptTables =
    [
        "LoreSystems", "SystemRules", "SystemRuleDependencies", "WorldLogicFindings", "WorldLogicFindingEvidence",
    ];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-semantic-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task The_semantic_finding_tables_come_and_go_alone_and_the_world_is_untouched()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid entryId;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-semmigrate", "user-semmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World semmigrate")).Id;
            entryId = await CreateEntity(client, universeId, "Arlen");
        }

        SqliteConnection.ClearAllPools();

        List<string> kept;
        List<string> triggersBefore;

        await using (var db = Context())
        {
            // One claim waiting, so the rollback has something of its own to drop.
            var submitted = await SemanticFindingSubmissions.SubmitAsync(
                db,
                TimeProvider.System,
                universeId,
                "mcp-submitter",
                Guid.NewGuid(),
                "A connected client",
                new SemanticFindingInput(
                    "Two records disagree",
                    "One of them must be wrong.",
                    Citations: [new SemanticCitationInput("lore_entry", entryId.ToString(), "the entry")]),
                CancellationToken.None);

            Assert.NotNull(submitted.Finding);

            kept = await Rows(db);
            triggersBefore = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            Assert.NotEmpty(triggersBefore);

            await db.GetService<IMigrator>().MigrateAsync(BeforeSemanticFindings);

            var tables = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table'");
            Assert.All(SemanticTables, table => Assert.DoesNotContain(table, tables));

            // Everything the claims were about is still there, and so is everything else.
            Assert.All(KeptTables, table => Assert.Contains(table, tables));
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
            Assert.Equal(kept, await Rows(db));

            // The claim the rollback dropped is gone, as a backup of this universe would never have carried it.
            Assert.Equal(0, await db.SemanticFindings.CountAsync());

            Assert.Equal(
                ["CreativeProjects.ProjectId:CASCADE", "SystemRules.RuleId:CASCADE", "Universes.UniverseId:CASCADE"],
                (await ForeignKeys(db, "SemanticFindings")).Order(StringComparer.Ordinal));
            Assert.Equal(["SemanticFindings.FindingId:CASCADE"], await ForeignKeys(db, "SemanticFindingCitations"));
        }

        SqliteConnection.ClearAllPools();

        // And the upgraded database serves the feature again through the real host.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-semmigrate", Password)))
                .EnsureSuccessStatusCode();

            var page = await client.GetFromJsonAsync<WorldLogicPage<SemanticFindingRow>>(
                $"/api/universes/{universeId}/world-logic/semantic-findings");

            Assert.Empty(page!.Items);
        }
    }

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

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

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
