using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Lorex.Api.Tests;

/// <summary>
/// The field-section migration (Issue #26) walked down and up over a real SQLite file: additive - a table, two columns, two
/// indexes and three triggers - with every existing type, field, value and id untouched and every field ungrouped, the
/// triggers already on <c>EntityFieldDefinitions</c> kept (nothing rebuilt), and the new triggers holding a field to its own
/// type's sections and ungrouping it when its section goes.
/// </summary>
public sealed class EntityFieldSectionMigrationTests : IDisposable
{
    /// <summary>The migration immediately before field sections.</summary>
    private const string Before = "20261024135339_AddEntityAppearances";

    private static readonly string[] Triggers =
    [
        "EntityFieldDefinitions_SectionOfType_Insert",
        "EntityFieldDefinitions_SectionOfType_Update",
        "EntityFieldSections_Ungroup_Delete",
    ];

    private readonly string _directory = Path.Combine(Path.GetTempPath(), "lorex-field-section-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Sections_are_added_beside_every_field_ungrouped_and_removed_cleanly()
    {
        Directory.CreateDirectory(_directory);
        Guid universeId;
        Guid characterId;
        Guid titleId;
        await using (var host = new GroupFileHost(DataSource))
        {
            var client = await GroupFileHost.Register(host, "user-efsmig", "efsmig@example.test");
            universeId = (await PlotTestClient.CreateUniverse(client, "Sectioned world")).Id;
            var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
            characterId = types.Single(type => type.Name == "Character").Id;
            var withField = await PlotTestClient.PostJson<EntityTypeResponse>(client, $"/api/universes/{universeId}/entity-types/{characterId}/fields",
                new FieldDefinitionRequest("Title", EntityFieldKind.ShortText, false, null, null, null));
            titleId = withField.Fields.Single(field => field.Name == "Title").Id;
            await PlotTestClient.CreateEntity(client, universeId, "Kept");
        }

        SqliteConnection.ClearAllPools();

        string before;
        await using (var db = Context())
        {
            var earlier = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' AND name NOT LIKE '%Section%' ORDER BY name");
            Assert.Contains("EntityFieldDefinitions_TargetGroup_Insert", earlier);
            Assert.Equal(Triggers, await TriggersOf(db));

            before = await Fingerprint(db);
            await db.GetService<IMigrator>().MigrateAsync(Before);
            Assert.Equal(before, await Fingerprint(db));

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table' AND name = 'EntityFieldSections'"));
            Assert.DoesNotContain("SectionId", await Strings(db, "SELECT name AS Value FROM pragma_table_info('EntityFieldDefinitions')"));
            Assert.DoesNotContain("FieldLayoutVersion", await Strings(db, "SELECT name AS Value FROM pragma_table_info('EntityTypes')"));
            Assert.Empty(await TriggersOf(db));

            // Rolling back took nothing that was there before it.
            Assert.Equal(earlier, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(Triggers, await TriggersOf(db));
            Assert.Equal(before, await Fingerprint(db));

            // Every existing type and field: no section, layout version 1.
            Assert.Equal(0, await db.EntityFieldSections.CountAsync());
            Assert.All(await db.EntityFieldDefinitions.ToListAsync(), field => Assert.Null(field.SectionId));
            Assert.All(await db.EntityTypes.ToListAsync(), type => Assert.Equal(1, type.FieldLayoutVersion));

            // A field may name only a section of its own type.
            var otherType = await db.EntityTypes.Where(type => type.UniverseId == universeId && type.Id != characterId).Select(type => type.Id).FirstAsync();
            var mine = Guid.NewGuid();
            var theirs = Guid.NewGuid();
            db.EntityFieldSections.AddRange(
                new EntityFieldSection { Id = mine, EntityTypeId = characterId, Name = "Identity", DisplayOrder = 1 },
                new EntityFieldSection { Id = theirs, EntityTypeId = otherType, Name = "Elsewhere", DisplayOrder = 1 });
            await db.SaveChangesAsync();

            var title = titleId.ToString().ToUpperInvariant();
            await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                "UPDATE EntityFieldDefinitions SET SectionId = {0} WHERE Id = {1}", theirs.ToString().ToUpperInvariant(), title));
            await db.Database.ExecuteSqlRawAsync("UPDATE EntityFieldDefinitions SET SectionId = {0} WHERE Id = {1}", mine.ToString().ToUpperInvariant(), title);

            // Removing the section ungroups its field, and a universe with sections still goes in one cascade.
            await db.Database.ExecuteSqlRawAsync("DELETE FROM EntityFieldSections WHERE Id = {0}", mine.ToString().ToUpperInvariant());
            Assert.Null((await db.EntityFieldDefinitions.AsNoTracking().SingleAsync(field => field.Id == titleId)).SectionId);
            await db.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = ON; DELETE FROM Universes WHERE Id = {0}", universeId.ToString().ToUpperInvariant());
            Assert.Equal((0, 0), (await db.EntityFieldSections.CountAsync(), await db.EntityTypes.CountAsync()));
        }
    }

    private LorexDbContext Context() => new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> TriggersOf(LorexDbContext db) =>
        await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%Section%' ORDER BY name");

    /// <summary>Everything that was there before: every table with its row count, and every field's and type's id and name.</summary>
    private static async Task<string> Fingerprint(LorexDbContext db)
    {
        var tables = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table' AND name <> 'EntityFieldSections' AND name <> 'EntityPrivateNotes' AND name <> 'KnowledgeRecords' AND name <> 'AdminAuditRecords' AND name <> 'AiChangeMedia' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%SearchIndex%' AND name <> '__EFMigrationsHistory' ORDER BY name");
        var parts = new List<string>();
        foreach (var table in tables)
        {
            parts.Add($"{table}:{(await Strings(db, $"SELECT COUNT(*) || '' AS Value FROM \"{table}\""))[0]}");
        }

        parts.AddRange(await Strings(db, "SELECT Id || Name || DisplayOrder || Version AS Value FROM EntityFieldDefinitions ORDER BY Id"));
        parts.AddRange(await Strings(db, "SELECT Id || Name || DisplayOrder AS Value FROM EntityTypes ORDER BY Id"));
        return string.Join(",", parts);
    }

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) => await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    public void Dispose() => GroupFileHost.Clean(_directory);
}
