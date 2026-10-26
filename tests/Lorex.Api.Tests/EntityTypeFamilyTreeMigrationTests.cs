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
/// The Family Tree eligibility migration, walked down and back up over a real SQLite file (ADR 0040).
///
/// What it has to prove is the one rule it applies: the starter Character exactly as seeded comes back eligible, and nothing
/// else does - not a starter the author changed, not a custom type of theirs, not a species with family links on it. Every
/// type and relationship survives both ways, and rolling back drops only the column, with SQLite's own <c>DROP COLUMN</c>.
/// </summary>
public sealed class EntityTypeFamilyTreeMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before Family Tree eligibility.</summary>
    private const string Before = "20260929161715_AddStoryContentPublication";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-type-family-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Only_the_untouched_starter_character_comes_back_eligible()
    {
        Directory.CreateDirectory(_directory);

        Guid untouched;
        Guid edited;
        Guid species;
        Guid person;
        List<string> triggers;
        List<string> indexes;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-typemigrate", "user-typemigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            var first = (await PlotTestClient.CreateUniverse(client, "Untouched starters")).Id;
            var second = (await PlotTestClient.CreateUniverse(client, "Edited starters")).Id;
            var firstTypes = await Types(client, first);
            var secondTypes = await Types(client, second);

            untouched = firstTypes.Single(type => type.Name == "Character").Id;
            species = firstTypes.Single(type => type.Name == "Species").Id;
            edited = secondTypes.Single(type => type.Name == "Character").Id;

            // The author made the second world's Character their own, and it stays enabled until the rollback.
            (await client.PutAsJsonAsync(
                $"/api/universes/{second}/entity-types/{edited}",
                new EntityTypeRequest("Character", "Hobbits, mostly.", "character", "#4f6bd6", null))).EnsureSuccessStatusCode();

            person = (await PlotTestClient.PostJson<EntityTypeResponse>(
                client, $"/api/universes/{first}/entity-types", new EntityTypeRequest("Person", null, "character", null, null, true))).Id;

            // A species already in a family: its link survives, and gives its type nothing.
            var bore = await PlotTestClient.PostJson<RelationshipTypeResponse>(
                client,
                $"/api/universes/{first}/relationship-types",
                new RelationshipTypeRequest("bore", "born to", false, null, null, null, RelationshipFamilySemantic.BiologicalParent));
            var men = await PlotTestClient.PostJson<EntityDetail>(
                client, $"/api/universes/{first}/entities", new EntityRequest(species, "Men", null, CanonStatus.Canon, null, null, null));
            var aragorn = await PlotTestClient.PostJson<EntityDetail>(
                client, $"/api/universes/{first}/entities", new EntityRequest(untouched, "Aragorn", null, CanonStatus.Canon, null, null, null));
            await PlotTestClient.PostJson<RelationshipDetail>(
                client,
                $"/api/universes/{first}/relationships",
                new RelationshipRequest(bore.Id, men.Id, aragorn.Id, CanonStatus.Canon, null, null, null));
        }

        SqliteConnection.ClearAllPools();

        int typeCount;
        await using (var db = Context())
        {
            triggers = await Triggers(db);
            indexes = await Indexes(db);
            typeCount = await db.EntityTypes.CountAsync();

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.DoesNotContain("FamilyTreeEligible", await Columns(db, "EntityTypes"));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(triggers.Where(LaterSchema.BeforeNestedTypes), await Triggers(db));
            Assert.Equal(LaterSchema.WithDropped(indexes).Where(LaterSchema.BeforeNestedTypes), await Indexes(db));
            Assert.Equal(typeCount, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM \"EntityTypes\"").SingleAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.Empty(await ForeignKeyViolations(db));
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(triggers, await Triggers(db));
            Assert.Equal(indexes, await Indexes(db));
            Assert.Equal(typeCount, await db.EntityTypes.CountAsync());
            Assert.Equal(1, await db.Relationships.CountAsync());

            Assert.Equal([untouched], await db.EntityTypes.Where(type => type.FamilyTreeEligible).Select(type => type.Id).ToListAsync());
            Assert.False((await db.EntityTypes.SingleAsync(type => type.Id == edited)).FamilyTreeEligible);
            Assert.False((await db.EntityTypes.SingleAsync(type => type.Id == person)).FamilyTreeEligible);
            Assert.False((await db.EntityTypes.SingleAsync(type => type.Id == species)).FamilyTreeEligible);
        }
    }

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
