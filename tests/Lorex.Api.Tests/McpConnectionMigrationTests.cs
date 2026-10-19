using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Lorex.Api.Tests;

/// <summary>
/// The MCP migration (ADR 0046) walked down and up over a real SQLite file: additive - five new tables and nothing else
/// touched - with a connection gone when its universe or account goes, and a rollback that drops exactly what it added.
/// </summary>
public sealed class McpConnectionMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before MCP.</summary>
    private const string Before = "20261014124009_AddSuggestedChanges";

    private static readonly string[] Added = ["McpConnections", "OpenIddictApplications", "OpenIddictAuthorizations", "OpenIddictScopes", "OpenIddictTokens"];

    private readonly string _directory = Path.Combine(Path.GetTempPath(), "lorex-mcp-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task The_tables_are_added_beside_everything_else_and_removed_cleanly()
    {
        Directory.CreateDirectory(_directory);
        Guid universeId;
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-mcpmig", "mcpmig@example.test", Password))).EnsureSuccessStatusCode();
            universeId = (await PlotTestClient.CreateUniverse(client, "Migrated world")).Id;
            await PlotTestClient.CreateEntity(client, universeId, "Kept");
        }

        SqliteConnection.ClearAllPools();

        string before;
        await using (var db = Context())
        {
            Assert.Equal(Added, await Tables(db));
            Assert.Equal(
                ["Id", "AuthorizationId", "ClientId", "UserId", "UniverseId", "CreatedAt", "LastUsedAt"],
                await Strings(db, "SELECT name AS Value FROM pragma_table_info('McpConnections') ORDER BY cid"));
            Assert.Equal(
                ["AspNetUsers CASCADE", "Universes CASCADE"],
                await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('McpConnections') ORDER BY \"table\""));

            before = await Fingerprint(db);
            await db.GetService<IMigrator>().MigrateAsync(Before);
            Assert.Empty(await Tables(db));
            Assert.Equal(before, await Fingerprint(db));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(Added, await Tables(db));
            Assert.Equal(before, await Fingerprint(db));

            // A connection to the universe goes when the universe does.
            var userId = (await Strings(db, "SELECT Id AS Value FROM AspNetUsers"))[0];
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO McpConnections (Id, AuthorizationId, ClientId, UserId, UniverseId, CreatedAt) VALUES ({0}, 'auth-1', 'client-1', {1}, {2}, '2026-10-19 00:00:00')",
                Guid.NewGuid().ToString().ToUpperInvariant(), userId, universeId.ToString().ToUpperInvariant());
            await db.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = ON; DELETE FROM Universes WHERE Id = {0}", universeId.ToString().ToUpperInvariant());
            Assert.Equal(0, await db.McpConnections.CountAsync());
        }
    }

    private LorexDbContext Context() => new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Tables(LorexDbContext db) =>
        await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table' AND (name LIKE 'OpenIddict%' OR name = 'McpConnections') ORDER BY name");

    /// <summary>Everything that was there before: every table but the new ones (and the later type groups), with its row count.</summary>
    private static async Task<string> Fingerprint(LorexDbContext db)
    {
        var tables = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'OpenIddict%' AND name <> 'McpConnections' AND name NOT LIKE 'EntityTypeGroup%' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%SearchIndex%' AND name <> '__EFMigrationsHistory' ORDER BY name");
        var parts = new List<string>();
        foreach (var table in tables)
        {
            parts.Add($"{table}:{(await Strings(db, $"SELECT COUNT(*) || '' AS Value FROM \"{table}\""))[0]}");
        }

        return string.Join(",", parts);
    }

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) => await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    /// <summary>The real host on the file, outside Development, so startup migrates it the way a deployment does.</summary>
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
