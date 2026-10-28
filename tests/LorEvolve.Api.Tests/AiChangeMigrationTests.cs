using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The Pending AI Changes migration (ADR 0047) walked down and up over a real SQLite file: additive - two tables and one
/// column defaulting to "no proposals" - nothing else touched, proposals gone with their universe, and a clean rollback.
/// </summary>
public sealed class AiChangeMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before Pending AI Changes.</summary>
    private const string Before = "20261020101841_AddEntityFieldVersion";

    private static readonly string[] Added = ["AiChangeOperations", "AiChangeProposals"];

    private readonly string _directory = Path.Combine(Path.GetTempPath(), "lorevolve-aichange-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task The_tables_and_the_column_are_added_beside_everything_else_and_removed_cleanly()
    {
        Directory.CreateDirectory(_directory);
        Guid universeId;
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-aimig", "aimig@example.test", Password))).EnsureSuccessStatusCode();
            universeId = (await PlotTestClient.CreateUniverse(client, "Migrated world")).Id;
            await PlotTestClient.CreateEntity(client, universeId, "Kept");
        }

        SqliteConnection.ClearAllPools();

        string before;
        await using (var db = Context())
        {
            Assert.Equal(Added, await Tables(db));
            Assert.Contains("CanPropose", await Strings(db, "SELECT name AS Value FROM pragma_table_info('McpConnections')"));
            Assert.Equal(
                ["Universes CASCADE"],
                await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('AiChangeProposals')"));

            before = await Fingerprint(db);
            await db.GetService<IMigrator>().MigrateAsync(Before);
            Assert.Empty(await Tables(db));
            Assert.DoesNotContain("CanPropose", await Strings(db, "SELECT name AS Value FROM pragma_table_info('McpConnections')"));
            Assert.Equal(before, await Fingerprint(db));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(Added, await Tables(db));
            Assert.Equal(before, await Fingerprint(db));

            // A proposal and its changes go when the universe does.
            var userId = (await Strings(db, "SELECT Id AS Value FROM AspNetUsers"))[0];
            var proposalId = Guid.NewGuid().ToString().ToUpperInvariant();
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO AiChangeProposals (Id, UniverseId, ProposedByUserId, Source, Status, Revision, CreatedAt, ExpiresAt) VALUES ({0}, {1}, {2}, 1, 0, 1, '2026-10-23 00:00:00', '2026-11-06 00:00:00')",
                proposalId, universeId.ToString().ToUpperInvariant(), userId);
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO AiChangeOperations (Id, ProposalId, Sequence, Key, Resource, Action, Proposed, DependsOn, Status) VALUES ({0}, {1}, 0, 'a', 0, 0, '{{}}', '[]', 0)",
                Guid.NewGuid().ToString().ToUpperInvariant(), proposalId);
            await db.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = ON; DELETE FROM Universes WHERE Id = {0}", universeId.ToString().ToUpperInvariant());
            Assert.Equal(0, await db.AiChangeOperations.CountAsync());
            Assert.Equal(0, await db.AiChangeProposals.CountAsync());
        }
    }

    [Fact]
    public async Task Four_approvals_of_one_proposal_at_once_apply_it_once()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new FileHost(DataSource);
        var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        var registered = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-airace", "airace@example.test", Password));
        var userId = (await registered.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id;
        var u = (await PlotTestClient.CreateUniverse(client, "Race world")).Id;
        var character = await AiChangeTestClient.TypeId(client, u, "Character");

        Guid proposalId;
        using (var scope = host.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
            var staged = await AiChangeStaging.StageAsync(
                db, TimeProvider.System, u, userId, new AiChangeOrigin(AiChangeSource.Assistant),
                new AiChangeSubmission("Race", [AiChangeTestClient.NewLore("a", character, "Raced once")]), default);
            proposalId = staged.Proposal!.Id;
        }

        var proposal = await AiChangeTestClient.Read(client, u, proposalId);
        var answers = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostAsJsonAsync(
            $"{AiChangeTestClient.Path(u, proposalId)}/approve",
            new AiChangeApproveRequest(proposal.Revision, [proposal.Operations[0].Id], Guid.NewGuid()))));

        Assert.Single(answers, answer => answer.StatusCode == HttpStatusCode.OK);
        foreach (var refused in answers.Where(answer => answer.StatusCode != HttpStatusCode.OK))
        {
            Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
            Assert.Contains(await PublishingTestClient.ProblemCode(refused), new[] { AiChangeCodes.NotOpen, AiChangeCodes.AlreadyDecided });
        }

        var found = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{u}/entities?search=Raced"))!;
        Assert.Equal(1, found.TotalCount);
    }

    [Fact]
    public async Task Four_copies_of_one_approval_at_once_apply_it_once_and_all_get_its_receipt()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new FileHost(DataSource);
        var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        var registered = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-aidup", "aidup@example.test", Password));
        var userId = (await registered.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id;
        var u = (await PlotTestClient.CreateUniverse(client, "Duplicate world")).Id;
        var character = await AiChangeTestClient.TypeId(client, u, "Character");

        Guid proposalId;
        using (var scope = host.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
            var staged = await AiChangeStaging.StageAsync(
                db, TimeProvider.System, u, userId, new AiChangeOrigin(AiChangeSource.Assistant),
                new AiChangeSubmission("Duplicate", [AiChangeTestClient.NewLore("a", character, "Doubled once")]), default);
            proposalId = staged.Proposal!.Id;
        }

        var proposal = await AiChangeTestClient.Read(client, u, proposalId);
        var request = new AiChangeApproveRequest(proposal.Revision, [proposal.Operations[0].Id], Guid.NewGuid());
        var answers = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostAsJsonAsync($"{AiChangeTestClient.Path(u, proposalId)}/approve", request)));

        Assert.All(answers, answer => Assert.Equal(HttpStatusCode.OK, answer.StatusCode));
        var made = new HashSet<Guid?>();
        foreach (var answer in answers)
        {
            made.Add((await answer.Content.ReadFromJsonAsync<AiChangeReceipt>())!.Applied.Single().ResultId);
        }

        Assert.Single(made);
        Assert.Equal(1, (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{u}/entities?search=Doubled"))!.TotalCount);
    }

    [Fact]
    public async Task Clients_registered_before_proposals_are_allowed_to_ask_for_them_and_the_rollback_takes_it_back()
    {
        Directory.CreateDirectory(_directory);
        await using (var host = new FileHost(DataSource))
        {
            _ = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
            using var scope = host.Services.CreateScope();
            var applications = scope.ServiceProvider.GetRequiredService<OpenIddict.Abstractions.IOpenIddictApplicationManager>();
            await applications.CreateAsync(LorEvolve.Api.Features.Mcp.ClientRules.Describe(
                "lorevolve-dcr-old", "Old client", [new Uri("http://127.0.0.1:7777/callback")], LorEvolve.Api.Features.Mcp.ClientRules.RegistrationSource));
        }

        SqliteConnection.ClearAllPools();
        const string permissions = "SELECT Permissions AS Value FROM OpenIddictApplications WHERE ClientId = 'lorevolve-dcr-old'";

        await using (var db = Context())
        {
            Assert.Contains("\"scp:lorevolve.propose\"", (await Strings(db, permissions))[0], StringComparison.Ordinal);

            // As it was stored before ADR 0047: read alone.
            await db.GetService<IMigrator>().MigrateAsync("20261023082544_AddAiChangeProposals");
            var old = (await Strings(db, permissions))[0];
            Assert.Contains("\"scp:lorevolve.read\"", old, StringComparison.Ordinal);
            Assert.DoesNotContain("lorevolve.propose", old, StringComparison.Ordinal);

            await db.GetService<IMigrator>().MigrateAsync();
            var upgraded = (await Strings(db, permissions))[0];
            Assert.Contains("\"scp:lorevolve.read\",\"scp:lorevolve.propose\"", upgraded, StringComparison.Ordinal);
            Assert.Single(System.Text.Json.JsonSerializer.Deserialize<string[]>(upgraded)!, permission => permission == "scp:lorevolve.propose");
        }
    }

    [Fact]
    public async Task Rolling_back_schema_proposals_drops_only_the_proposals_that_hold_schema()
    {
        Directory.CreateDirectory(_directory);
        Guid universeId;
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-aischemamig", "aischemamig@example.test", Password))).EnsureSuccessStatusCode();
            universeId = (await PlotTestClient.CreateUniverse(client, "Schema world")).Id;
        }

        SqliteConnection.ClearAllPools();

        await using var db = Context();
        var userId = (await Strings(db, "SELECT Id AS Value FROM AspNetUsers"))[0];
        async Task<string> ProposalAsync(int resource)
        {
            var id = Guid.NewGuid().ToString().ToUpperInvariant();
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO AiChangeProposals (Id, UniverseId, ProposedByUserId, Source, Status, Revision, CreatedAt, ExpiresAt) VALUES ({0}, {1}, {2}, 1, 0, 1, '2026-10-25 00:00:00', '2026-11-08 00:00:00')",
                id, universeId.ToString().ToUpperInvariant(), userId);
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO AiChangeOperations (Id, ProposalId, Sequence, Key, Resource, Action, Proposed, DependsOn, Status) VALUES ({0}, {1}, 0, 'a', {2}, 0, '{{}}', '[]', 0)",
                Guid.NewGuid().ToString().ToUpperInvariant(), id, resource);
            return id;
        }

        var content = await ProposalAsync(0);
        var schema = await ProposalAsync(13);

        await db.GetService<IMigrator>().MigrateAsync("20261025141528_AddPlatformAdmin");
        Assert.Equal([content], await Strings(db, "SELECT Id AS Value FROM AiChangeProposals"));
        Assert.DoesNotContain("CanProposeSchema", await Strings(db, "SELECT name AS Value FROM pragma_table_info('McpConnections')"));

        await db.GetService<IMigrator>().MigrateAsync();
        Assert.Contains("CanProposeSchema", await Strings(db, "SELECT name AS Value FROM pragma_table_info('McpConnections')"));
        Assert.NotEqual(schema, await ProposalAsync(14));
    }

    private LorEvolveDbContext Context() => new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Tables(LorEvolveDbContext db) =>
        await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table' AND name LIKE 'AiChange%' AND name <> 'AiChangeMedia' ORDER BY name");

    /// <summary>Everything that was there before: every other table with its row count.</summary>
    private static async Task<string> Fingerprint(LorEvolveDbContext db)
    {
        var tables = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'AiChange%' AND name NOT LIKE 'EntityEra%' AND name NOT LIKE 'EntityProgression%' AND name <> 'RelationshipPeriods' AND name NOT LIKE 'EntityForm%' AND name NOT LIKE 'EntityAbilit%' AND name NOT LIKE 'EntityAppearance%' AND name <> 'EntityFieldSections' AND name <> 'EntityPrivateNotes' AND name <> 'KnowledgeRecords' AND name <> 'AdminAuditRecords' AND name <> 'UniverseMaps' AND name <> 'MapPins' AND name <> 'MapCalibrations' AND name <> 'AiChangeMedia' AND name <> 'McpUniverseAliases' AND name <> 'UniverseAiHelpOff' AND name NOT LIKE 'IdeaBoard%' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%SearchIndex%' AND name <> '__EFMigrationsHistory' ORDER BY name");
        var parts = new List<string>();
        foreach (var table in tables)
        {
            parts.Add($"{table}:{(await Strings(db, $"SELECT COUNT(*) || '' AS Value FROM \"{table}\""))[0]}");
        }

        return string.Join(",", parts);
    }

    private static async Task<List<string>> Strings(LorEvolveDbContext db, string sql) => await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    private sealed class FileHost(string dataSource) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
            builder.UseSetting("Media:Provider", "InMemory");
        }
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
            // A handle Windows has not let go of yet; the directory is under the temp root and named for this run.
        }
    }
}
