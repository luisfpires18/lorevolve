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
/// The link field's allowed type (<c>AddEntityReferenceTargetType</c>, 036), walked down and back up over a real SQLite file.
///
/// It adds one nullable column with its key and index, and fills nothing in: a link field that existed before it is open to
/// any type afterwards, whatever it is called or whatever it already links. Every field, value and entry survives both ways.
/// </summary>
public sealed class EntityReferenceTargetMigrationTests : IDisposable
{
    /// <summary>The migration immediately before the allowed type.</summary>
    private const string Before = "20261003004411_AddUniverseInvitations";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-reference-target-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Rolled_back_and_forward_every_field_survives_and_none_is_limited_by_guesswork()
    {
        Directory.CreateDirectory(_directory);

        Guid kingdomField;
        Guid strengthField;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            var password = $"m-{Guid.NewGuid():n}";
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-reftarget", "user-reftarget@example.test", password)))
                .EnsureSuccessStatusCode();

            var universe = (await PlotTestClient.CreateUniverse(client, "Reference targets")).Id;
            var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universe}/entity-types"))!;
            var character = types.Single(type => type.Name == "Character").Id;
            var kingdoms = (await PlotTestClient.PostJson<EntityTypeResponse>(
                client, $"/api/universes/{universe}/entity-types", new EntityTypeRequest("Kingdoms", null, null, null, null))).Id;

            // Called after a type and limited to it, and a number field beside it.
            var withKingdom = await PlotTestClient.PostJson<EntityTypeResponse>(
                client,
                $"/api/universes/{universe}/entity-types/{character}/fields",
                new FieldDefinitionRequest("Kingdom", EntityFieldKind.EntityReference, false, null, null, null, TargetEntityTypeId: kingdoms));
            kingdomField = withKingdom.Fields.Single(field => field.Name == "Kingdom").Id;
            var withStrength = await PlotTestClient.PostJson<EntityTypeResponse>(
                client,
                $"/api/universes/{universe}/entity-types/{character}/fields",
                new FieldDefinitionRequest("Strength", EntityFieldKind.Number, false, null, null, null));
            strengthField = withStrength.Fields.Single(field => field.Name == "Strength").Id;

            var arkazia = await PlotTestClient.PostJson<EntityDetail>(
                client, $"/api/universes/{universe}/entities", new EntityRequest(kingdoms, "Arkazia", null, CanonStatus.Canon, null, null, null));
            await PlotTestClient.PostJson<EntityDetail>(
                client,
                $"/api/universes/{universe}/entities",
                new EntityRequest(character, "Mara", null, CanonStatus.Canon, null, null, [
                    new FieldValueInput(kingdomField, null, null, null, null, null, arkazia.Id),
                    new FieldValueInput(strengthField, null, 7, null, null, null, null),
                ]));
        }

        SqliteConnection.ClearAllPools();

        List<string> triggers;
        List<string> indexes;
        int fieldCount;
        int valueCount;

        await using (var db = Context())
        {
            triggers = await Triggers(db);
            indexes = await Indexes(db);
            fieldCount = await db.EntityFieldDefinitions.CountAsync();
            valueCount = await db.EntityFieldValues.CountAsync();
            Assert.Contains("IX_EntityFieldDefinitions_TargetEntityTypeId on EntityFieldDefinitions", indexes);

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.DoesNotContain("TargetEntityTypeId", await Columns(db, "EntityFieldDefinitions"));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(triggers.Where(LaterSchema.BeforeTypeGroups), await Triggers(db));
            Assert.Equal(LaterSchema.WithDropped(indexes).Where(LaterSchema.BeforeReferenceTargets), await Indexes(db));
            Assert.Equal(fieldCount, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM \"EntityFieldDefinitions\"").SingleAsync());
            Assert.Equal(valueCount, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM \"EntityFieldValues\"").SingleAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.Empty(await ForeignKeyViolations(db));
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(triggers, await Triggers(db));
            Assert.Equal(indexes, await Indexes(db));
            Assert.Equal(fieldCount, await db.EntityFieldDefinitions.CountAsync());
            Assert.Equal(valueCount, await db.EntityFieldValues.CountAsync());

            // Nothing guessed back: the link field called "Kingdom" is open to any type, the number field has nothing.
            Assert.Null((await db.EntityFieldDefinitions.SingleAsync(field => field.Id == kingdomField)).TargetEntityTypeId);
            Assert.Null((await db.EntityFieldDefinitions.SingleAsync(field => field.Id == strengthField)).TargetEntityTypeId);
            Assert.Equal(0, await db.EntityFieldDefinitions.CountAsync(field => field.TargetEntityTypeId != null));

            // The key is there, to the types.
            var keys = await db.Database
                .SqlQueryRaw<string>("SELECT \"from\" || ' -> ' || \"table\" AS Value FROM pragma_foreign_key_list('EntityFieldDefinitions')")
                .ToListAsync();
            Assert.Contains("TargetEntityTypeId -> EntityTypes", keys);
        }
    }

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Columns(LorEvolveDbContext db, string table) =>
        await db.Database.SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table})").ToListAsync();

    private static async Task<List<string>> Triggers(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
            .ToListAsync();

    private static async Task<List<string>> Indexes(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorEvolveDbContext db) =>
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
