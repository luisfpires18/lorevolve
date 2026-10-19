using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Lorex.Api.Tests;

/// <summary>
/// The nested-types migration, walked up from the version before it and back down over a real SQLite file (ADR 0007 amendment,
/// 2026-10-01). Every existing type comes through as a root in the place it had, so no universe reorders; the database then
/// refuses a parent from another universe and the deletion of a type holding nested types, while a universe's own delete still
/// takes its whole tree; and rolling back drops only the column, its index and the three triggers - nothing is rebuilt, so
/// every other index and trigger is read back as it was.
/// </summary>
public sealed class NestedTypeMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before nested types.</summary>
    private const string Before = "20260929230621_AddEntityTypeFamilyTreeEligibility";

    private static readonly string[] HierarchyTriggers =
        ["EntityTypes_KeepsChildren_Delete", "EntityTypes_ParentInUniverse_Insert", "EntityTypes_ParentInUniverse_Update"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-nested-type-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Existing_types_become_roots_in_their_places_and_the_rollback_rebuilds_nothing()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid otherUniverseId;
        List<string> triggers;
        List<string> indexes;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-nestmigrate", "user-nestmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();
            universeId = (await PlotTestClient.CreateUniverse(client, "Nested migrate")).Id;
            otherUniverseId = (await PlotTestClient.CreateUniverse(client, "Nested migrate other")).Id;
            var types = await Types(client, universeId);
            await PlotTestClient.PostJson<EntityDetail>(
                client, $"/api/universes/{universeId}/entities", new EntityRequest(types[0].Id, "Kept", null, CanonStatus.Canon, null, null, null));
        }

        SqliteConnection.ClearAllPools();

        // Down to the version before nesting, with an order no fresh universe has: the flat order the file kept.
        await using (var db = Context())
        {
            triggers = await Triggers(db);
            indexes = await Indexes(db);
            Assert.Subset(triggers.ToHashSet(), HierarchyTriggers.ToHashSet());

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.DoesNotContain("ParentId", await Columns(db, "EntityTypes"));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(triggers.Except(HierarchyTriggers).Where(LaterSchema.BeforeTypeGroups), await Triggers(db));
            Assert.Equal(indexes.Where(LaterSchema.BeforeNestedTypes), await Indexes(db));

            await db.Database.ExecuteSqlRawAsync(
                "UPDATE EntityTypes SET DisplayOrder = 100 - DisplayOrder WHERE UniverseId = {0}", Key(universeId));
        }

        SqliteConnection.ClearAllPools();

        List<string> flat;
        await using (var db = Context())
        {
            flat = await db.Database.SqlQueryRaw<string>(
                "SELECT Name AS Value FROM EntityTypes WHERE UniverseId = {0} ORDER BY DisplayOrder, Name", Key(universeId)).ToListAsync();

            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(triggers, await Triggers(db));
            Assert.Equal(indexes, await Indexes(db));
            Assert.Equal(0, await db.EntityTypes.CountAsync(type => type.ParentId != null));
        }

        SqliteConnection.ClearAllPools();

        // Through the API: roots, in exactly the order they had.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-nestmigrate", Password))).EnsureSuccessStatusCode();
            var types = await Types(client, universeId);
            Assert.All(types, type => Assert.Null(type.ParentId));
            Assert.Equal(flat, types.Select(type => type.Name));
        }

        SqliteConnection.ClearAllPools();

        // The database's own guarantees, and a universe row's delete taking a nested tree with it.
        await using (var db = Context())
        {
            var ids = await db.EntityTypes.Where(type => type.UniverseId == universeId).Select(type => type.Id).ToListAsync();
            var foreign = await db.EntityTypes.Where(type => type.UniverseId == otherUniverseId).Select(type => type.Id).FirstAsync();

            await db.Database.ExecuteSqlRawAsync("UPDATE EntityTypes SET ParentId = {0} WHERE Id = {1}", Key(ids[0]), Key(ids[1]));
            await Assert.ThrowsAsync<SqliteException>(() =>
                db.Database.ExecuteSqlRawAsync("UPDATE EntityTypes SET ParentId = {0} WHERE Id = {1}", Key(foreign), Key(ids[2])));
            await Assert.ThrowsAsync<SqliteException>(() =>
                db.Database.ExecuteSqlRawAsync("DELETE FROM EntityTypes WHERE Id = {0}", Key(ids[0])));

            await db.Database.ExecuteSqlRawAsync("DELETE FROM Universes WHERE Id = {0}", Key(universeId));
            Assert.Equal(0, await db.EntityTypes.CountAsync(type => type.UniverseId == universeId));
            Assert.Equal(0, await db.Entities.CountAsync(entity => entity.UniverseId == universeId));
            Assert.Empty(await ForeignKeyViolations(db));
        }
    }

    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

    // ---------- Reading the file ----------

    private static async Task<List<EntityTypeResponse>> Types(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Columns(LorexDbContext db, string table) =>
        await db.Database.SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table})").ToListAsync();

    private static async Task<List<string>> Triggers(LorexDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
            .ToListAsync();

    private static async Task<List<string>> Indexes(LorexDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorexDbContext db) =>
        await db.Database.SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check").ToListAsync();

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
