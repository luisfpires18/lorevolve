using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Maps;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static Lorex.Api.Tests.MapTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A map's scale (<c>AddMapCalibrations</c>, issue 53), walked down and back up over a real SQLite file. One new table and
/// nothing else touched: rolling back drops it alone, and the database itself holds a scale to its map and takes it with the
/// map.
/// </summary>
public sealed class MapCalibrationMigrationTests : IDisposable
{
    /// <summary>The migration immediately before the calibration table.</summary>
    private const string Before = "20261025163224_AddUniverseMaps";

    private readonly string _directory = Path.Combine(Path.GetTempPath(), "lorex-map-calibration-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Rolled_back_and_forward_only_the_calibration_table_moves_and_a_scale_lives_and_dies_with_its_map()
    {
        Directory.CreateDirectory(_directory);

        Guid universe;
        Guid map;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-calmigrate", "user-calmigrate@example.test", $"m-{Guid.NewGuid():n}")))
                .EnsureSuccessStatusCode();
            universe = (await PlotTestClient.CreateUniverse(client, "Calibration migrate")).Id;
            map = (await CreateMap(client, universe, "Scaled", RestoreTestClient.Png(200, 100))).Id;
            (await client.PutAsJsonAsync($"{Map(universe, map)}/calibration", new MapCalibrationRequest(0.1, 0.5, 0.9, 0.5, 160, "km"))).EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            Assert.Contains("sqlite_autoindex_MapCalibrations_1 on MapCalibrations", indexes);
            Assert.Equal(1, await db.MapCalibrations.CountAsync());

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name = 'MapCalibrations'"));
            Assert.Equal(
                indexes.Where(LaterSchema.BeforeAiMedia).Where(name => !name.EndsWith(" on MapCalibrations", StringComparison.Ordinal)),
                await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(1, await db.UniverseMaps.CountAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(indexes, await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(0, await db.MapCalibrations.CountAsync());

            // A scale needs its map.
            db.MapCalibrations.Add(Calibration(Guid.NewGuid()));
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();

            // One scale a map.
            db.MapCalibrations.Add(Calibration(map));
            await db.SaveChangesAsync();
            db.ChangeTracker.Clear();
            db.MapCalibrations.Add(Calibration(map));
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();

            // And goes with the map.
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"UniverseMaps\" WHERE \"Id\" = {0}", map.ToString().ToUpperInvariant());
            Assert.Equal(0, await db.MapCalibrations.CountAsync());
        }
    }

    private static MapCalibration Calibration(Guid mapId) => new()
    {
        MapId = mapId,
        AssetId = Guid.NewGuid(),
        X1 = 0.1,
        Y1 = 0.5,
        X2 = 0.9,
        Y2 = 0.5,
        Distance = 160,
        Unit = "km",
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

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

        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }
}
