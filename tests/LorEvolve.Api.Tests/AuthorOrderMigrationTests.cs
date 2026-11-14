using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Stories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The author's orders (<c>KeepAuthorOrders</c>) over a real SQLite file: rolled back, the two columns go in place - no
/// table is rebuilt, every index and trigger stays - and rolled forward again, stories take their title order and each
/// scene's lore its entries' name order, so nothing moves on screen.
/// </summary>
public sealed class AuthorOrderMigrationTests : IDisposable
{
    /// <summary>The migration immediately before the author's orders.</summary>
    private const string Before = "20261111165438_RestructureStoryArcs";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-author-order-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Rolled_back_only_the_two_columns_go_and_rolled_forward_the_old_orders_are_kept()
    {
        Directory.CreateDirectory(_directory);

        Guid universe;
        Guid scene;
        Guid ruth;
        Guid fortis;
        Guid marcus;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-ordermigrate", "user-ordermigrate@example.test", $"m-{Guid.NewGuid():n}")))
                .EnsureSuccessStatusCode();
            universe = (await PlotTestClient.CreateUniverse(client, "Order migrate")).Id;
            ruth = await PlotTestClient.CreateEntity(client, universe, "Ruth Lestasc");
            fortis = await PlotTestClient.CreateEntity(client, universe, "Fortis");
            marcus = await PlotTestClient.CreateEntity(client, universe, "Marcus Coyote");
            var zeta = await PlotTestClient.CreateStory(client, universe, "Zeta");
            await PlotTestClient.CreateStory(client, universe, "Alpha");
            scene = (await PlotTestClient.PostJson<SceneResponse>(
                client,
                $"{PlotTestClient.Story(universe, zeta)}/scenes",
                new SceneRequest("Orders", null, null, null, null, [ruth, marcus, fortis]))).Id;
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.DoesNotContain("SortOrder", await Strings(db, "SELECT name AS Value FROM pragma_table_info('Stories')"));
            Assert.DoesNotContain("SortOrder", await Strings(db, "SELECT name AS Value FROM pragma_table_info('SceneEntityLinks')"));
            Assert.Equal(indexes.Where(LaterSchema.BeforeProjects), await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(2, await Scalar(db, "SELECT COUNT(*) AS Value FROM \"Stories\""));
            Assert.Equal(3, await Scalar(db, "SELECT COUNT(*) AS Value FROM \"SceneEntityLinks\""));
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(indexes, await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));

            // As the lists read before the orders were kept: stories by title, a scene's lore by name.
            Assert.Equal(
                ["Alpha", "Zeta"],
                await db.Stories.Where(story => story.UniverseId == universe).OrderBy(story => story.SortOrder).Select(story => story.Title).ToListAsync());
            Assert.Equal(
                [fortis, marcus, ruth],
                await db.SceneEntityLinks.Where(link => link.SceneId == scene).OrderBy(link => link.SortOrder).Select(link => link.EntityId).ToListAsync());
            Assert.Equal(
                [0, 1, 2],
                await db.SceneEntityLinks.Where(link => link.SceneId == scene).OrderBy(link => link.SortOrder).Select(link => link.SortOrder).ToListAsync());
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
