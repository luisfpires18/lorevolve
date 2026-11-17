using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
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
/// The machine findings migration (#360, ADR 0073), down and back up over a real SQLite file with real rows in it.
///
/// <para>It is the one migration that rebuilds the findings table, which holds the author's dismissals and their
/// history. A rebuild run inside a transaction would cascade-delete every finding's evidence and events when the old
/// table is dropped, because SQLite ignores <c>PRAGMA foreign_keys</c> there. So the test puts a dismissed rule
/// finding with a note in the table, rolls back and forward again, and compares every row of it, its evidence and its
/// history before and after.</para>
/// </summary>
public sealed class WorldLogicMachineFindingMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration before this one: rolling back to it is rolling back exactly the machine findings.</summary>
    private const string BeforeMachineFindings = "20261117133947_AddStoryProjectCoversAndProjectOrder";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-machine-findings-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task A_dismissed_finding_and_its_history_survive_down_and_up()
    {
        Directory.CreateDirectory(_directory);

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-wlmfmigrate", "user-wlmfmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            var universeId = (await CreateUniverse(client, "World wlmfmigrate")).Id;
            var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
            var type = types.First(candidate => candidate.Name == "Character").Id;
            var rank = (await AiChangeTestClient.Field(client, universeId, type,
                new FieldDefinitionRequest("rank", EntityFieldKind.ShortText, false, null, null, null))).Id;

            var entry = await PostJson<EntityDetail>(client, $"/api/universes/{universeId}/entities", new EntityRequest(
                type, "Ilsa", null, CanonStatus.Canon, null, null, [new FieldValueInput(rank, "grandmaster", null, null, null, null, null)]));

            // A rule finding with evidence that the author dismisses with a note, and a machine finding beside it.
            await PostJson<SystemRuleDetail>(
                client,
                $"/api/universes/{universeId}/system-rules",
                new SystemRuleRequest("Ilsa is a dragon", "She is not.", null, 1, Parse(EntryIsOfType(entry.Id, "Dragon"))));

            var system = await PostJson<SystemDetail>(client, $"/api/universes/{universeId}/systems", new SystemRequest("Rank", null));
            await PutJson<SystemMachineDetail>(client, $"/api/universes/{universeId}/systems/{system.Id}/machine", new SystemMachineRequest(
                1, new SystemMachineBinding("Character", "rank"), [new(Guid.NewGuid(), "Novice", "novice", true, 0, 0)], [], system.Version));

            var sweep = await client.PostAsync($"/api/universes/{universeId}/world-logic/findings/evaluate", null);
            sweep.EnsureSuccessStatusCode();
            Assert.Equal(2, (await sweep.Content.ReadFromJsonAsync<WorldLogicSweepResponse>())!.Created);

            var findings = (await client.GetFromJsonAsync<WorldLogicPage<WorldLogicFindingRow>>(
                $"/api/universes/{universeId}/world-logic/findings"))!;
            var ruleFinding = findings.Items.Single(row => row.RuleId is not null);
            Assert.Single(findings.Items, row => row.Machine is not null);

            (await client.PostAsJsonAsync(
                $"/api/universes/{universeId}/world-logic/findings/{ruleFinding.Id}/dismiss",
                new WorldLogicFindingDecisionRequest("The dragons all left.")))
                .EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        await using var db = Context();

        var kept = await RuleRows(db);
        Assert.Contains(kept, row => row.StartsWith("event|", StringComparison.Ordinal) && row.Contains("The dragons all left.", StringComparison.Ordinal));
        Assert.Contains(kept, row => row.StartsWith("evidence|", StringComparison.Ordinal));
        Assert.Equal(2, await db.WorldLogicFindings.CountAsync());
        Assert.Equal(0, await NotNull(db, "RuleId"));

        await db.GetService<IMigrator>().MigrateAsync(BeforeMachineFindings);

        // Down: the rule finding, its evidence and its history are exactly as they were; the machine finding and its
        // table are gone, and RuleId is required again.
        Assert.Equal(kept, await RuleRows(db));
        Assert.Equal(1, await Count(db, "SELECT COUNT(*) AS Value FROM \"WorldLogicFindings\""));
        Assert.DoesNotContain(
            "WorldLogicFindingMachines",
            await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table'"));
        Assert.Equal(1, await NotNull(db, "RuleId"));
        Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));

        await db.GetService<IMigrator>().MigrateAsync();

        // Up: the same rows, RuleId nullable, and every foreign key still cascading.
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Equal(kept, await RuleRows(db));
        Assert.Equal(0, await NotNull(db, "RuleId"));
        Assert.Equal(
            ["CreativeProjects.ProjectId:CASCADE", "SystemRules.RuleId:CASCADE"],
            (await ForeignKeys(db, "WorldLogicFindings")).Order(StringComparer.Ordinal));
        Assert.Equal(
            ["LoreSystems.SystemId:CASCADE", "WorldLogicFindings.FindingId:CASCADE"],
            (await ForeignKeys(db, "WorldLogicFindingMachines")).Order(StringComparer.Ordinal));
        Assert.Equal(["WorldLogicFindings.FindingId:CASCADE"], await ForeignKeys(db, "WorldLogicFindingEvidence"));
        Assert.Equal(["WorldLogicFindings.FindingId:CASCADE"], await ForeignKeys(db, "WorldLogicFindingEvents"));
        Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));
    }

    /// <summary>Every column of every rule finding, its evidence and its history, as text, in a stable order.</summary>
    private static async Task<List<string>> RuleRows(LorEvolveDbContext db) =>
        await Strings(db, """
            SELECT 'finding|' || "Id" || '|' || "UniverseId" || '|' || "RuleId" || '|' || IFNULL("ProjectId", '') || '|'
                || "Outcome" || '|' || IFNULL("ErrorCode", '') || '|' || "RuleVersion" || '|' || "SchemaVersion" || '|'
                || "Fingerprint" || '|' || "Status" || '|' || "Rationale" || '|' || "CreatedAt" || '|' || "UpdatedAt" || '|'
                || IFNULL("ResolvedAt", '') AS Value
            FROM "WorldLogicFindings" WHERE "RuleId" IS NOT NULL
            UNION ALL
            SELECT 'evidence|' || e."FindingId" || '|' || e."SortOrder" || '|' || e."Source" || '|' || e."SourceRowId" || '|' || e."Role" AS Value
            FROM "WorldLogicFindingEvidence" e JOIN "WorldLogicFindings" f ON f."Id" = e."FindingId" WHERE f."RuleId" IS NOT NULL
            UNION ALL
            SELECT 'event|' || v."Id" || '|' || v."FindingId" || '|' || v."Action" || '|' || IFNULL(v."ActorId", '') || '|' || v."Note" || '|' || v."At" AS Value
            FROM "WorldLogicFindingEvents" v JOIN "WorldLogicFindings" f ON f."Id" = v."FindingId" WHERE f."RuleId" IS NOT NULL
            ORDER BY Value
            """);

    /// <summary>Whether the column is declared NOT NULL, as SQLite itself reports it: 1 or 0.</summary>
    private static Task<int> NotNull(LorEvolveDbContext db, string column) =>
        Count(db, $"SELECT \"notnull\" AS Value FROM pragma_table_info('WorldLogicFindings') WHERE name = '{column}'");

    private static async Task<int> Count(LorEvolveDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<int>(sql).SingleAsync();

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

    /// <summary>One named entry is of that type: false for a character, with the entry as its evidence.</summary>
    private static string EntryIsOfType(Guid entry, string type) =>
        "{\"kind\":\"compare\",\"left\":{\"field\":\"type\",\"from\":\"subjects\",\"of\":{\"subject\":\""
        + entry + "\"}},\"op\":\"eq\",\"right\":{\"literal\":\"" + type + "\",\"type\":\"text\"}}";

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
