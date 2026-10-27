using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.FamilyTrees;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The family meaning migration, walked down and back up over a real SQLite file (ADR 0035).
///
/// What it has to prove is mostly about names. The world it writes first is full of relation kinds called "parent", "mother",
/// "father", "child", "sibling" and "family", each with links on it, and every one of them comes back from the migration with no
/// family meaning: the column defaults to <c>None</c> and nothing reads a name, so a universe written before family trees existed
/// gains not one family connection. Adding the column is a plain <c>ALTER TABLE</c> and taking it away is SQLite's own
/// <c>DROP COLUMN</c>, so <c>RelationshipTypes</c> is never rebuilt under the relationships that point at it - and the indexes
/// and triggers the database already had are read back both ways to prove it.
/// </summary>
public sealed class FamilySemanticMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before family meanings.</summary>
    private const string BeforeFamilySemantics = "20260915175450_AddRuleValidation";

    private static readonly string[] FamilySoundingNames =
        ["parent", "parent of", "mother", "father", "child", "sibling", "family"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-family-semantic-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Every_kind_comes_back_with_no_family_meaning_whatever_it_is_called()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid elder;
        Guid young;
        List<string> triggers;
        List<string> indexes;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-fammigrate", "user-fammigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World fammigrate")).Id;
            var character = await CharacterType(client, universeId);

            elder = (await CreateEntity(client, universeId, character.Id, "Elder")).Id;
            young = (await CreateEntity(client, universeId, character.Id, "Young")).Id;

            foreach (var name in FamilySoundingNames)
            {
                var kind = await CreateKind(client, universeId, name, familySemantic: null);
                await Link(client, universeId, kind.Id, elder, young);
            }

            var bore = await CreateKind(client, universeId, "bore", RelationshipFamilySemantic.BiologicalParent);
            await Link(client, universeId, bore.Id, elder, young);

            // Before the rollback: one configured kind is read, and the six family-sounding ones are not.
            var tree = await Tree(client, universeId, young);
            Assert.Equal([elder], tree.Parents.Select(parent => parent.EntityId));
            Assert.Equal(RelationshipFamilySemantic.BiologicalParent, Assert.Single(tree.Links).Semantic);
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            triggers = await Triggers(db);
            indexes = await Indexes(db);

            // Down: one column goes. Nothing else may.
            await db.GetService<IMigrator>().MigrateAsync(BeforeFamilySemantics);

            var columns = await Columns(db, "RelationshipTypes");
            Assert.DoesNotContain("FamilySemantic", columns);
            Assert.Contains("AgeOrder", columns);
            Assert.Contains("InverseName", columns);
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(triggers.Where(LaterSchema.BeforeNestedTypes), await Triggers(db));

            // The walk down also passes back through the publishing migration after this one, which takes its own
            // indexes with it; every other index is exactly where it was.
            Assert.Equal(LaterSchema.WithDropped(indexes).Where(index => !IsPublishing(index)).Where(LaterSchema.BeforeNestedTypes), await Indexes(db));

            Assert.Equal(8, await db.RelationshipTypes.CountAsync());
            Assert.Equal(8, await db.Relationships.CountAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.Contains("FamilySemantic", await Columns(db, "RelationshipTypes"));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(triggers, await Triggers(db));
            Assert.Equal(indexes, await Indexes(db));

            // Every kind, including the one that had a meaning before the rollback and the six that are named as if they should.
            Assert.Equal(8, await db.RelationshipTypes.CountAsync(kind => kind.FamilySemantic == RelationshipFamilySemantic.None));
            Assert.Equal(8, await db.Relationships.CountAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-fammigrate", Password)))
                .EnsureSuccessStatusCode();

            var kinds = (await client.GetFromJsonAsync<List<RelationshipTypeResponse>>(
                $"/api/universes/{universeId}/relationship-types"))!;
            Assert.Equal(8, kinds.Count);
            Assert.All(kinds, kind => Assert.Equal(RelationshipFamilySemantic.None, kind.FamilySemantic));

            // A world of links called "parent" and "mother" has no family tree until someone says one of them means it.
            var empty = await Tree(client, universeId, young);
            Assert.Empty(empty.Links);
            Assert.Empty(empty.Parents);

            var parent = kinds.Single(kind => kind.Name == "parent");
            (await client.PutAsJsonAsync(
                $"/api/universes/{universeId}/relationship-types/{parent.Id}",
                new RelationshipTypeRequest(
                    parent.Name, parent.InverseName, false, null, null, null, RelationshipFamilySemantic.BiologicalParent)))
                .EnsureSuccessStatusCode();

            var derived = await Tree(client, universeId, young);
            Assert.Equal([elder], derived.Parents.Select(one => one.EntityId));
        }
    }

    // ---------- Reading the file ----------

    private static bool IsPublishing(string index) =>
        index.StartsWith("IX_Universes_PublicSlug ", StringComparison.Ordinal)
        || index.StartsWith("IX_Universes_Visibility_PublishedAt ", StringComparison.Ordinal)
        || index.EndsWith(" on UniverseArtworks", StringComparison.Ordinal)
        || index.StartsWith("IX_Entities_UniverseId_PublicSlug ", StringComparison.Ordinal)
        || index.StartsWith("IX_Stories_UniverseId_PublicSlug ", StringComparison.Ordinal)
        || index.StartsWith("IX_AspNetUsers_PublicAuthorSlug ", StringComparison.Ordinal);

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Columns(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table})")
            .ToListAsync();

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
        await db.Database
            .SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check")
            .ToListAsync();

    // ---------- Writing through the API ----------

    private static async Task<FamilyTreeResponse> Tree(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<FamilyTreeResponse>($"/api/universes/{universeId}/family-tree/{entityId}"))!;

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<EntityTypeResponse> CharacterType(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!.First(type => type.Name == "Character");

    private static async Task<EntityDetail> CreateEntity(HttpClient client, Guid universeId, Guid typeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, CanonStatus.Canon, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<RelationshipTypeResponse> CreateKind(
        HttpClient client,
        Guid universeId,
        string name,
        RelationshipFamilySemantic? familySemantic)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest(name, $"{name}, the other way", false, null, null, null, familySemantic));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;
    }

    private static async Task Link(HttpClient client, Guid universeId, Guid kindId, Guid parent, Guid child) =>
        (await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationships",
            new RelationshipRequest(kindId, parent, child, CanonStatus.Canon, null, null, null)))
            .EnsureSuccessStatusCode();

    /// <summary>The real host on the file, outside Development, so startup migrates it the way a deployment does.</summary>
    private sealed class FileHost(string dataSource) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
        }

        /// <summary>Outside Development the session cookie is secure-only, so it only travels over https.</summary>
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
            // A handle Windows has not let go of yet. The directory is under the temp root and named for this run, so leaving it
            // costs nothing.
        }
    }
}
