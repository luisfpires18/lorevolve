using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Lorex.Api.Tests;

/// <summary>
/// Private notes (<c>AddEntityPrivateNotes</c>, issue 23), walked down and back up over a real SQLite file. One new table and
/// nothing else touched: rolling back drops it alone, and the database itself holds a note to a real entry and takes it with
/// the entry.
/// </summary>
public sealed class EntityPrivateNoteMigrationTests : IDisposable
{
    /// <summary>The migration immediately before private notes.</summary>
    private const string Before = "20261024204705_AddEntityFieldSections";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-private-note-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Rolled_back_and_forward_only_the_note_table_moves_and_a_note_lives_and_dies_with_its_entry()
    {
        Directory.CreateDirectory(_directory);

        Guid universe;
        Guid entry;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-notemigrate", "user-notemigrate@example.test", $"m-{Guid.NewGuid():n}")))
                .EnsureSuccessStatusCode();
            universe = (await PlotTestClient.CreateUniverse(client, "Note migrate")).Id;
            entry = await PlotTestClient.CreateEntity(client, universe, "Kept");
            (await client.PutAsJsonAsync($"/api/universes/{universe}/entities/{entry}/private-note", new EntityPrivateNoteRequest("Kept note.", 0)))
                .EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            Assert.Contains("sqlite_autoindex_EntityPrivateNotes_1 on EntityPrivateNotes", indexes);
            Assert.Equal(1, await db.EntityPrivateNotes.CountAsync());

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name = 'EntityPrivateNotes'"));
            Assert.Equal(indexes.Where(name => !name.EndsWith(" on EntityPrivateNotes", StringComparison.Ordinal) && !name.EndsWith(" on KnowledgeRecords", StringComparison.Ordinal) && !name.EndsWith(" on AdminAuditRecords", StringComparison.Ordinal) && !name.EndsWith(" on AiChangeMedia", StringComparison.Ordinal) && !name.EndsWith(" on McpUniverseAliases", StringComparison.Ordinal) && !name.StartsWith("IX_AspNetUsers_SoleAdmin ", StringComparison.Ordinal)), await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
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
            Assert.Equal(0, await db.EntityPrivateNotes.CountAsync());

            // A note needs its entry.
            db.EntityPrivateNotes.Add(new EntityPrivateNote { EntityId = Guid.NewGuid(), Content = "Orphan.", UpdatedAt = DateTime.UtcNow });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();

            // And goes with it.
            db.EntityPrivateNotes.Add(new EntityPrivateNote { EntityId = entry, Content = "Back.", UpdatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
            Assert.Equal(1, await db.EntityPrivateNotes.CountAsync());
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"Entities\" WHERE \"Id\" = {0}", entry.ToString().ToUpperInvariant());
            Assert.Equal(0, await db.EntityPrivateNotes.CountAsync());
        }
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
