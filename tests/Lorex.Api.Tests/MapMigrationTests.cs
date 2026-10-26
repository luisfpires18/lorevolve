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
/// Maps (<c>AddUniverseMaps</c>, issue #52), walked down and back up over a real SQLite file. Two new tables and nothing
/// else touched: rolling back drops them alone, and the database itself holds a pin to its map and its entry, takes the
/// pin with the map, and only severs its link when the entry goes.
/// </summary>
public sealed class MapMigrationTests : IDisposable
{
    /// <summary>The migration immediately before maps.</summary>
    private const string Before = "20261025141528_AddPlatformAdmin";

    private readonly string _directory = Path.Combine(Path.GetTempPath(), "lorex-map-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Rolled_back_and_forward_only_the_map_tables_move_and_a_pin_lives_with_its_map_and_outlives_its_entry()
    {
        Directory.CreateDirectory(_directory);

        Guid universe;
        Guid entry;
        Guid map;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-mapmigrate", "user-mapmigrate@example.test", $"m-{Guid.NewGuid():n}")))
                .EnsureSuccessStatusCode();
            universe = (await PlotTestClient.CreateUniverse(client, "Map migrate")).Id;
            entry = await PlotTestClient.CreateEntity(client, universe, "Kept");
            map = (await CreateMap(client, universe, "Kept map", RestoreTestClient.Png(120, 80))).Id;
            await AddPin(client, universe, map, "Kept", 0.5, 0.5, entry);
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            Assert.Contains("IX_UniverseMaps_UniverseId_Name on UniverseMaps", indexes);
            Assert.Contains("IX_MapPins_MapId_EntityId on MapPins", indexes);
            Assert.Equal(1, await db.UniverseMaps.CountAsync());
            Assert.Equal(1, await db.MapPins.CountAsync());

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name IN ('UniverseMaps', 'MapPins', 'MapCalibrations')"));
            Assert.Equal(
                LaterSchema.WithDropped(indexes).Where(LaterSchema.BeforeAiMedia).Where(name => !name.EndsWith(" on UniverseMaps", StringComparison.Ordinal) && !name.EndsWith(" on MapPins", StringComparison.Ordinal) && !name.EndsWith(" on MapCalibrations", StringComparison.Ordinal)),
                await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM \"Entities\"").SingleAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(indexes, await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(0, await db.UniverseMaps.CountAsync());

            // A pin needs its map.
            db.MapPins.Add(Pin(Guid.NewGuid(), entry));
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();

            // A map needs its universe, and a pin's entry its row.
            db.UniverseMaps.Add(Map(Guid.NewGuid()));
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();

            var kept = Map(universe);
            db.UniverseMaps.Add(kept);
            await db.SaveChangesAsync();
            db.MapPins.Add(Pin(kept.Id, Guid.NewGuid()));
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();

            // One entry once per map.
            db.MapPins.Add(Pin(kept.Id, entry));
            await db.SaveChangesAsync();
            db.MapPins.Add(Pin(kept.Id, entry));
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();

            // Two annotations are fine: the filtered index ignores them.
            db.MapPins.Add(Pin(kept.Id, null));
            db.MapPins.Add(Pin(kept.Id, null));
            await db.SaveChangesAsync();
            Assert.Equal(3, await db.MapPins.CountAsync());

            // The entry erased: the pin stays, unlinked.
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"Entities\" WHERE \"Id\" = {0}", entry.ToString().ToUpperInvariant());
            Assert.Equal(3, await db.MapPins.CountAsync());
            Assert.Equal(0, await db.MapPins.CountAsync(pin => pin.EntityId != null));

            // The map gone: its pins go with it.
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"UniverseMaps\" WHERE \"Id\" = {0}", kept.Id.ToString().ToUpperInvariant());
            Assert.Equal(0, await db.MapPins.CountAsync());
        }
    }

    private static UniverseMap Map(Guid universeId) => new()
    {
        Id = Guid.NewGuid(),
        UniverseId = universeId,
        Name = $"Map {Guid.NewGuid():n}",
        AssetId = Guid.NewGuid(),
        OriginalKey = "k/original.png",
        DisplayKey = "k/display.webp",
        ContentType = "image/png",
        Width = 10,
        Height = 10,
        ByteSize = 1,
        UploadedAt = DateTime.UtcNow,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };

    private static MapPin Pin(Guid mapId, Guid? entityId) => new()
    {
        Id = Guid.NewGuid(),
        MapId = mapId,
        EntityId = entityId,
        Title = "Pin",
        X = 0.5,
        Y = 0.5,
        PlacedOnAssetId = Guid.NewGuid(),
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

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

        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }
}
