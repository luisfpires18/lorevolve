using System.Net;
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
/// The type-group migration (Issue #36) walked down and up over a real SQLite file: additive - two tables, one nullable column
/// with its key, three indexes and four triggers - with every existing type, field, entry and id untouched, no universe
/// classified on the way back up, and a universe's delete still one cascade.
/// </summary>
public sealed class EntityTypeGroupMigrationTests : IDisposable
{
    /// <summary>The migration immediately before type groups.</summary>
    private const string Before = "20261019133759_AddMcpConnections";

    private static readonly string[] Triggers =
    [
        "EntityFieldDefinitions_TargetGroup_Insert",
        "EntityFieldDefinitions_TargetGroup_Update",
        "EntityTypeGroupMembers_SameUniverse_Insert",
        "EntityTypeGroupMembers_SameUniverse_Update",
    ];

    private readonly string _directory = Path.Combine(Path.GetTempPath(), "lorex-type-group-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Groups_are_added_beside_everything_else_and_removed_cleanly_and_no_universe_is_classified()
    {
        Directory.CreateDirectory(_directory);
        Guid universeId;
        Guid runesField;
        await using (var host = new GroupFileHost(DataSource))
        {
            var client = await GroupFileHost.Register(host, "user-etgmig", "etgmig@example.test");
            universeId = (await PlotTestClient.CreateUniverse(client, "Migrated world")).Id;
            var runes = await PlotTestClient.PostJson<EntityTypeResponse>(client, $"/api/universes/{universeId}/entity-types",
                new EntityTypeRequest("Elemental Runes", null, null, null, null, Groups: [new(null, "Runes")]));
            var group = (await client.GetFromJsonAsync<List<EntityTypeGroupResponse>>($"/api/universes/{universeId}/entity-type-groups"))!.Single(one => one.Name == "Runes");
            var character = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!.Single(type => type.Name == "Character");
            var withField = await PlotTestClient.PostJson<EntityTypeResponse>(client, $"/api/universes/{universeId}/entity-types/{character.Id}/fields",
                new FieldDefinitionRequest("Required Rune", EntityFieldKind.EntityReference, false, null, null, null, TargetGroupId: group.Id));
            runesField = withField.Fields.Single(field => field.Name == "Required Rune").Id;
            await PlotTestClient.CreateEntity(client, universeId, "Kept");
            Assert.NotEqual(Guid.Empty, runes.Id);
        }

        SqliteConnection.ClearAllPools();

        string before;
        await using (var db = Context())
        {
            // At the latest schema: both tables, the column and its key, and all four triggers - none lost to a rebuild.
            Assert.Equal(Triggers, await TriggersOf(db));
            Assert.Contains("EntityTypeGroups NO ACTION", await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('EntityFieldDefinitions')"));
            Assert.Equal(
                ["EntityTypeGroups CASCADE", "EntityTypes CASCADE"],
                await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('EntityTypeGroupMembers') ORDER BY \"table\""));

            before = await Fingerprint(db);
            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table' AND name LIKE 'EntityTypeGroup%'"));
            Assert.DoesNotContain("TargetGroupId", await Strings(db, "SELECT name AS Value FROM pragma_table_info('EntityFieldDefinitions')"));
            Assert.Empty(await TriggersOf(db));
            Assert.Equal(before, await Fingerprint(db));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(Triggers, await TriggersOf(db));
            Assert.Equal(before, await Fingerprint(db));

            // The universe that existed is not classified on the way up: no group, no membership, no target.
            Assert.Equal(0, await db.EntityTypeGroups.CountAsync());
            Assert.Null((await db.EntityFieldDefinitions.SingleAsync(field => field.Id == runesField)).TargetGroupId);

            // A group written now, with a member and a field limited to it, goes with its universe in one delete.
            var groupId = Guid.NewGuid().ToString().ToUpperInvariant();
            var u = universeId.ToString().ToUpperInvariant();
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO EntityTypeGroups (Id, UniverseId, Name, CreatedAt, UpdatedAt) VALUES ({0}, {1}, 'Runes', '2026-10-19 00:00:00', '2026-10-19 00:00:00')", groupId, u);
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO EntityTypeGroupMembers (EntityTypeGroupId, EntityTypeId) SELECT {0}, Id FROM EntityTypes WHERE UniverseId = {1} AND Name = 'Elemental Runes'", groupId, u);
            await db.Database.ExecuteSqlRawAsync("UPDATE EntityFieldDefinitions SET TargetGroupId = {0} WHERE Id = {1}", groupId, runesField.ToString().ToUpperInvariant());
            await db.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = ON; DELETE FROM Universes WHERE Id = {0}", u);
            Assert.Equal((0, 0, 0), (await db.EntityTypeGroups.CountAsync(), await db.EntityTypeGroupMembers.CountAsync(), await db.EntityTypes.CountAsync()));
        }
    }

    private LorexDbContext Context() => new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> TriggersOf(LorexDbContext db) =>
        await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' AND (name LIKE 'EntityTypeGroup%' OR name LIKE 'EntityFieldDefinitions_TargetGroup%') ORDER BY name");

    /// <summary>Everything that was there before: every table but the new ones, with its row count, and every type's id.</summary>
    private static async Task<string> Fingerprint(LorexDbContext db)
    {
        var tables = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'EntityTypeGroup%' AND name NOT LIKE 'AiChange%' AND name NOT LIKE 'EntityEra%' AND name NOT LIKE 'EntityProgression%' AND name <> 'RelationshipPeriods' AND name NOT LIKE 'EntityForm%' AND name NOT LIKE 'EntityAbilit%' AND name NOT LIKE 'EntityAppearance%' AND name <> 'EntityFieldSections' AND name <> 'EntityPrivateNotes' AND name <> 'KnowledgeRecords' AND name <> 'AdminAuditRecords' AND name <> 'McpUniverseAliases' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%SearchIndex%' AND name <> '__EFMigrationsHistory' ORDER BY name");
        var parts = new List<string>();
        foreach (var table in tables)
        {
            parts.Add($"{table}:{(await Strings(db, $"SELECT COUNT(*) || '' AS Value FROM \"{table}\""))[0]}");
        }

        parts.AddRange(await Strings(db, "SELECT Id || Name || COALESCE(TargetEntityTypeId, '') AS Value FROM EntityFieldDefinitions ORDER BY Id"));
        parts.AddRange(await Strings(db, "SELECT Id || Name || FamilyTreeEligible AS Value FROM EntityTypes ORDER BY Id"));
        return string.Join(",", parts);
    }

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) => await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    public void Dispose() => GroupFileHost.Clean(_directory);
}

/// <summary>
/// Membership changes, links and group creation racing each other on a real SQLite file, where each request has its own
/// connection and its own IMMEDIATE transaction - the in-memory test database shares one connection and cannot race.
/// </summary>
public sealed class EntityTypeGroupRaceTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "lorex-type-group-race", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Two_saves_racing_to_create_one_group_name_make_one_group()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new GroupFileHost(DataSource);
        var client = await GroupFileHost.Register(host, "user-etgname", "etgname@example.test");
        var u = (await PlotTestClient.CreateUniverse(client, "Race world")).Id;
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;

        var saves = await Task.WhenAll(types.Take(4).Select(type => client.PutAsJsonAsync(
            $"/api/universes/{u}/entity-types/{type.Id}",
            new EntityTypeRequest(type.Name, type.Description, type.Icon, type.AccentColor, null, Groups: [new(null, "Realms")]))));

        Assert.Equal(1, saves.Count(save => save.IsSuccessStatusCode));
        Assert.All(saves.Where(save => !save.IsSuccessStatusCode), save => Assert.Equal(HttpStatusCode.BadRequest, save.StatusCode));
        var groups = (await client.GetFromJsonAsync<List<EntityTypeGroupResponse>>($"/api/universes/{u}/entity-type-groups"))!;
        Assert.Single(groups.Single(group => group.Name == "Realms").TypeIds);
    }

    [Fact]
    public async Task A_type_leaving_a_group_and_a_link_relying_on_it_never_both_land()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new GroupFileHost(DataSource);
        var client = await GroupFileHost.Register(host, "user-etglink", "etglink@example.test");
        var u = (await PlotTestClient.CreateUniverse(client, "Race world")).Id;
        var elemental = (await PlotTestClient.PostJson<EntityTypeResponse>(client, $"/api/universes/{u}/entity-types",
            new EntityTypeRequest("Elemental Runes", null, null, null, null, Groups: [new(null, "Runes")]))).Id;
        var runes = (await client.GetFromJsonAsync<List<EntityTypeGroupResponse>>($"/api/universes/{u}/entity-type-groups"))!.Single(group => group.Name == "Runes").Id;
        var character = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!.Single(type => type.Name == "Character").Id;
        var field = (await PlotTestClient.PostJson<EntityTypeResponse>(client, $"/api/universes/{u}/entity-types/{character}/fields",
            new FieldDefinitionRequest("Required Rune", EntityFieldKind.EntityReference, false, null, null, null, TargetGroupId: runes))).Fields.Single(one => one.Name == "Required Rune").Id;

        string TypeRoute() => $"/api/universes/{u}/entity-types/{elemental}";

        for (var round = 0; round < 6; round++)
        {
            Assert.True((await client.PutAsJsonAsync(TypeRoute(), new EntityTypeRequest("Elemental Runes", null, null, null, null, Groups: [new(runes)]))).IsSuccessStatusCode);
            var rune = await PlotTestClient.PostJson<EntityDetail>(client, $"/api/universes/{u}/entities",
                new EntityRequest(elemental, $"Rune {round}", null, CanonStatus.Canon, null, null, null));

            var results = await Task.WhenAll(
                client.PutAsJsonAsync(TypeRoute(), new EntityTypeRequest("Elemental Runes", null, null, null, null, Groups: [])),
                client.PostAsJsonAsync($"/api/universes/{u}/entities", new EntityRequest(
                    character, $"Mage {round}", null, CanonStatus.Canon, null, null, [new FieldValueInput(field, null, null, null, null, null, rune.Id)])));

            // Either may win; both never do, and one always does.
            var left = results[0].IsSuccessStatusCode;
            var linked = results[1].IsSuccessStatusCode;
            Assert.False(left && linked, $"round {round}: the type left the group and a link relying on it was written");
            Assert.True(left || linked, $"round {round}: neither went through");

            if (linked)
            {
                var mage = (await results[1].Content.ReadFromJsonAsync<EntityDetail>())!;
                Assert.True((await client.PutAsJsonAsync($"/api/universes/{u}/entities/{mage.Id}", new EntityRequest(
                    character, mage.Name, null, CanonStatus.Canon, null, null, [], ExpectedVersion: mage.Version))).IsSuccessStatusCode);
            }
        }

        SqliteConnection.ClearAllPools();
        await using var db = new LorexDbContext(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);
        Assert.False(await db.EntityFieldValues.AnyAsync(value =>
            value.FieldDefinitionId == field
            && !db.EntityTypeGroupMembers.Any(member => member.EntityTypeGroupId == runes && member.EntityTypeId == value.ReferencedEntity!.EntityTypeId)));
    }

    [Fact]
    public async Task An_entry_changing_type_and_a_link_relying_on_its_type_never_both_land()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new GroupFileHost(DataSource);
        var client = await GroupFileHost.Register(host, "user-etgretype", "etgretype@example.test");
        var u = (await PlotTestClient.CreateUniverse(client, "Race world")).Id;
        var elemental = (await PlotTestClient.PostJson<EntityTypeResponse>(client, $"/api/universes/{u}/entity-types",
            new EntityTypeRequest("Elemental Runes", null, null, null, null, Groups: [new(null, "Runes")]))).Id;
        var kingdoms = (await PlotTestClient.PostJson<EntityTypeResponse>(client, $"/api/universes/{u}/entity-types",
            new EntityTypeRequest("Kingdoms", null, null, null, null))).Id;
        var runes = (await client.GetFromJsonAsync<List<EntityTypeGroupResponse>>($"/api/universes/{u}/entity-type-groups"))!.Single(group => group.Name == "Runes").Id;
        var character = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!.Single(type => type.Name == "Character").Id;
        var field = (await PlotTestClient.PostJson<EntityTypeResponse>(client, $"/api/universes/{u}/entity-types/{character}/fields",
            new FieldDefinitionRequest("Required Rune", EntityFieldKind.EntityReference, false, null, null, null, TargetGroupId: runes))).Fields.Single(one => one.Name == "Required Rune").Id;

        for (var round = 0; round < 6; round++)
        {
            var rune = await PlotTestClient.PostJson<EntityDetail>(client, $"/api/universes/{u}/entities",
                new EntityRequest(elemental, $"Rune {round}", null, CanonStatus.Canon, null, null, null));

            var results = await Task.WhenAll(
                client.PutAsJsonAsync($"/api/universes/{u}/entities/{rune.Id}", new EntityRequest(
                    kingdoms, rune.Name, null, CanonStatus.Canon, null, null, [], ExpectedVersion: rune.Version)),
                client.PostAsJsonAsync($"/api/universes/{u}/entities", new EntityRequest(
                    character, $"Mage {round}", null, CanonStatus.Canon, null, null, [new FieldValueInput(field, null, null, null, null, null, rune.Id)])));

            Assert.False(results[0].IsSuccessStatusCode && results[1].IsSuccessStatusCode, $"round {round}: retyped and linked");
            Assert.True(results[0].IsSuccessStatusCode || results[1].IsSuccessStatusCode, $"round {round}: neither went through");
        }

        SqliteConnection.ClearAllPools();
        await using var db = new LorexDbContext(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);
        Assert.False(await db.EntityFieldValues.AnyAsync(value =>
            value.FieldDefinitionId == field
            && !db.EntityTypeGroupMembers.Any(member => member.EntityTypeGroupId == runes && member.EntityTypeId == value.ReferencedEntity!.EntityTypeId)));
    }

    [Fact]
    public async Task A_field_created_against_a_group_being_deleted_gets_an_answer_not_a_server_error()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new GroupFileHost(DataSource);
        var client = await GroupFileHost.Register(host, "user-etgfield", "etgfield@example.test");
        var u = (await PlotTestClient.CreateUniverse(client, "Race world")).Id;
        var character = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!.Single(type => type.Name == "Character").Id;

        for (var round = 0; round < 6; round++)
        {
            await PlotTestClient.PostJson<EntityTypeResponse>(client, $"/api/universes/{u}/entity-types",
                new EntityTypeRequest($"Runes {round}", null, null, null, null, Groups: [new(null, $"Group {round}")]));
            var group = (await client.GetFromJsonAsync<List<EntityTypeGroupResponse>>($"/api/universes/{u}/entity-type-groups"))!.Single(one => one.Name == $"Group {round}").Id;

            var results = await Task.WhenAll(
                client.PostAsJsonAsync($"/api/universes/{u}/entity-types/{character}/fields", new FieldDefinitionRequest(
                    $"Rune {round}", EntityFieldKind.EntityReference, false, null, null, null, TargetGroupId: group)),
                client.DeleteAsync($"/api/universes/{u}/entity-type-groups/{group}"));

            // Field first: the delete is refused (409). Delete first: the field is refused (400). Never a 500, never both.
            Assert.All(results, result => Assert.True((int)result.StatusCode < 500, $"round {round}: {(int)result.StatusCode}"));
            Assert.True(results[0].IsSuccessStatusCode ^ results[1].IsSuccessStatusCode, $"round {round}: {results[0].StatusCode} / {results[1].StatusCode}");
        }
    }

    public void Dispose() => GroupFileHost.Clean(_directory);
}

/// <summary>The real host on a file, outside Development, so startup migrates it the way a deployment does.</summary>
internal sealed class GroupFileHost(string dataSource) : WebApplicationFactory<Program>
{
    private const string Password = "Test-password-123!";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Staging");
        builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
        builder.UseSetting("Media:Provider", "InMemory");
    }

    public static async Task<HttpClient> Register(GroupFileHost host, string username, string email)
    {
        var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(username, email, Password))).EnsureSuccessStatusCode();
        return client;
    }

    public static void Clean(string directory)
    {
        SqliteConnection.ClearAllPools();

        try
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, recursive: true);
            }
        }
        catch (IOException)
        {
            // A handle Windows has not let go of yet; the directory is under the temp root and named for this run.
        }
    }
}
