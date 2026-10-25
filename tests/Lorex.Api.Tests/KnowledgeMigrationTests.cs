using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Knowledge;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Lorex.Api.Tests;

/// <summary>
/// Knowledge records (<c>AddKnowledgeRecords</c>, issue 15), walked down and back up over a real SQLite file. One new table
/// and nothing else touched; the database itself holds that a record is anchored to a scene or known from the start, never
/// both or neither, and takes a record with its knower and its scene while a lost subject leaves it about nobody.
/// </summary>
public sealed class KnowledgeMigrationTests : IDisposable
{
    /// <summary>The migration immediately before knowledge records.</summary>
    private const string Before = "20261024222505_AddEntityPrivateNotes";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-knowledge-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Rolled_back_and_forward_only_the_table_moves_and_the_database_holds_the_anchor_rule()
    {
        Directory.CreateDirectory(_directory);

        Guid universe;
        Guid knower;
        Guid subject;
        Guid scene;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-knowmigrate", "user-knowmigrate@example.test", $"m-{Guid.NewGuid():n}")))
                .EnsureSuccessStatusCode();
            universe = (await PlotTestClient.CreateUniverse(client, "Knowledge migrate")).Id;
            knower = await PlotTestClient.CreateEntity(client, universe, "Mira");
            subject = await PlotTestClient.CreateEntity(client, universe, "The heir");
            var story = await PlotTestClient.CreateStory(client, universe, "Kept story");
            scene = await PlotTestClient.CreateScene(client, universe, story, "The Causeway");
            (await client.PostAsJsonAsync($"/api/universes/{universe}/knowledge", new KnowledgeRecordRequest(knower, subject, "The heir survived.", scene, false)))
                .EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            Assert.Contains("IX_KnowledgeRecords_KnowerEntityId on KnowledgeRecords", indexes);
            Assert.Equal(1, await db.KnowledgeRecords.CountAsync());

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name = 'KnowledgeRecords'"));
            Assert.Equal(indexes.Where(name => !name.EndsWith(" on KnowledgeRecords", StringComparison.Ordinal) && !name.EndsWith(" on AdminAuditRecords", StringComparison.Ordinal) && !name.EndsWith(" on UniverseMaps", StringComparison.Ordinal) && !name.EndsWith(" on MapPins", StringComparison.Ordinal) && !name.EndsWith(" on MapCalibrations", StringComparison.Ordinal) && !name.StartsWith("IX_AspNetUsers_SoleAdmin ", StringComparison.Ordinal)), await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(2, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM \"Entities\"").SingleAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(indexes, await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(0, await db.KnowledgeRecords.CountAsync());

            // A scene or known from the start, never both or neither.
            await Assert.ThrowsAsync<DbUpdateException>(() => Add(db, universe, knower, subject, sceneId: null, fromStart: false));
            await Assert.ThrowsAsync<DbUpdateException>(() => Add(db, universe, knower, subject, scene, fromStart: true));
            await Add(db, universe, knower, subject, scene, fromStart: false);
            await Add(db, universe, knower, null, sceneId: null, fromStart: true);

            // A knower and a scene must exist.
            await Assert.ThrowsAsync<DbUpdateException>(() => Add(db, universe, Guid.NewGuid(), null, scene, fromStart: false));
            await Assert.ThrowsAsync<DbUpdateException>(() => Add(db, universe, knower, null, Guid.NewGuid(), fromStart: false));
            db.ChangeTracker.Clear();

            // A lost subject leaves the record; a lost scene or knower takes it.
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"Entities\" WHERE \"Id\" = {0}", subject.ToString().ToUpperInvariant());
            Assert.Equal(2, await db.KnowledgeRecords.CountAsync());
            Assert.Equal(0, await db.KnowledgeRecords.CountAsync(record => record.SubjectEntityId != null));
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"Scenes\" WHERE \"Id\" = {0}", scene.ToString().ToUpperInvariant());
            Assert.Equal(1, await db.KnowledgeRecords.CountAsync());
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"Entities\" WHERE \"Id\" = {0}", knower.ToString().ToUpperInvariant());
            Assert.Equal(0, await db.KnowledgeRecords.CountAsync());
        }
    }

    private static async Task Add(LorexDbContext db, Guid universe, Guid knower, Guid? subject, Guid? sceneId, bool fromStart)
    {
        db.ChangeTracker.Clear();
        db.KnowledgeRecords.Add(new KnowledgeRecord
        {
            Id = Guid.NewGuid(),
            UniverseId = universe,
            KnowerEntityId = knower,
            SubjectEntityId = subject,
            Statement = "Known.",
            SceneId = sceneId,
            KnownFromStart = fromStart,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

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
