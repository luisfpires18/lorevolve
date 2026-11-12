using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The group priority (<c>OrderTypeGroups</c>) over a real SQLite file: rolled back, the column goes in place - no table is
/// rebuilt, every index and trigger stays - and rolled forward again, groups take the name order they were listed in before
/// (ignoring case), so nothing moves on screen.
/// </summary>
public sealed class GroupOrderMigrationTests : IDisposable
{
    /// <summary>The migration immediately before the group priority.</summary>
    private const string Before = "20261111220746_KeepAuthorOrders";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-group-order-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Rolled_back_only_the_column_goes_and_rolled_forward_groups_keep_their_name_order()
    {
        Directory.CreateDirectory(_directory);

        Guid universe;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-groupmigrate", "user-groupmigrate@example.test", $"m-{Guid.NewGuid():n}")))
                .EnsureSuccessStatusCode();
            universe = (await PlotTestClient.CreateUniverse(client, "Group migrate")).Id;
            await PlotTestClient.PostJson<EntityTypeGroupResponse>(client, $"/api/universes/{universe}/entity-type-groups", new EntityTypeGroupCreateRequest("runes"));
            await PlotTestClient.PostJson<EntityTypeGroupResponse>(client, $"/api/universes/{universe}/entity-type-groups", new EntityTypeGroupCreateRequest("Arms"));
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.DoesNotContain("SortOrder", await Strings(db, "SELECT name AS Value FROM pragma_table_info('EntityTypeGroups')"));
            Assert.Equal(indexes, await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(6, await Scalar(db, "SELECT COUNT(*) AS Value FROM \"EntityTypeGroups\""));
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(indexes, await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));

            // As the list read before groups had a priority: by name, ignoring case.
            var groups = await db.EntityTypeGroups.Where(group => group.UniverseId == universe).OrderBy(group => group.SortOrder).ToListAsync();
            Assert.Equal(["Arms", "Characters", "Factions", "Objects", "Places", "runes"], groups.Select(group => group.Name));
            Assert.Equal([0, 1, 2, 3, 4, 5], groups.Select(group => group.SortOrder));
        }
    }

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Strings(LorEvolveDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    private static async Task<int> Scalar(LorEvolveDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<int>(sql).SingleAsync();

    /// <summary>The real host on the file, outside Development, so startup migrates it the way a deployment does.</summary>
    private sealed class FileHost(string dataSource) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
            builder.UseSetting("Media:Provider", "InMemory");
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
            // A handle Windows has not let go of yet; the directory is under the temp root and named for this run.
        }
    }
}
