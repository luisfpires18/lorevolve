using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.CanonIntegrity;
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
/// The relationship-constraint migration, walked down and back up over a real SQLite file.
///
/// Adding three columns is a plain <c>ALTER TABLE</c>, but taking them away again rebuilds
/// <c>RelationshipTypes</c> - a table relationships point at with a foreign key - and a rebuild is
/// where rows go missing or references come loose. So the lore is written through the ordinary API
/// first: a constrained type, an unconstrained one, and a Canon link on each that breaks the rule.
/// What has to survive both directions is every type and link; what has to come back is a world
/// checked against no rule at all, because nobody configured one on the schema it returned to.
/// </summary>
public sealed class RelationshipConstraintMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before relationship constraints.</summary>
    private const string BeforeConstraints = "20260912224403_AddUniverseChronology";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-relationship-constraint-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Types_and_links_survive_the_migration_both_ways_and_return_with_no_rule()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-relconsmigrate", "user-relconsmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World relconsmigrate")).Id;
            var character = await CharacterType(client, universeId);
            var born = await AddBornField(client, universeId, character.Id);

            var arlen = await CreateEntity(client, universeId, character.Id, "Arlen", born.Id, 12);
            var mira = await CreateEntity(client, universeId, character.Id, "Mira", born.Id, 4);

            var parent = await CreateKind(
                client, universeId, "parent of",
                new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, 12, null));
            var rules = await CreateKind(client, universeId, "rules", constraints: null);

            await Link(client, universeId, parent.Id, arlen.Id, mira.Id);
            await Link(client, universeId, rules.Id, arlen.Id, mira.Id);

            // The rule is live before the rollback: both halves of it are broken.
            var open = await OpenRuleCodes(client, universeId);
            Assert.Contains("CANON-REL-002", open);
            Assert.Contains("CANON-REL-003", open);
        }

        SqliteConnection.ClearAllPools();

        // Down: the three columns go. Nothing else may.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(BeforeConstraints);

            var columns = await Columns(db, "RelationshipTypes");
            Assert.DoesNotContain("AgeOrder", columns);
            Assert.DoesNotContain("MinAgeDifferenceYears", columns);
            Assert.DoesNotContain("MaxAgeDifferenceYears", columns);
            Assert.Contains("InverseName", columns);
            Assert.Empty(await ForeignKeyViolations(db));

            // Counting selects no column, so it reads the rolled-back tables through today's model.
            Assert.Equal(2, await db.RelationshipTypes.CountAsync());
            Assert.Equal(2, await db.Relationships.CountAsync());
        }

        SqliteConnection.ClearAllPools();

        // Up again, over types that have never had a constraint.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.Contains("AgeOrder", await Columns(db, "RelationshipTypes"));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.False(db.Database.HasPendingModelChanges());

            Assert.Equal(2, await db.RelationshipTypes.CountAsync(type =>
                type.AgeOrder == RelationshipAgeOrder.None
                && type.MinAgeDifferenceYears == null
                && type.MaxAgeDifferenceYears == null));
            Assert.Equal(2, await db.Relationships.CountAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-relconsmigrate", Password)))
                .EnsureSuccessStatusCode();

            var types = (await client.GetFromJsonAsync<List<RelationshipTypeResponse>>(
                $"/api/universes/{universeId}/relationship-types"))!;
            Assert.Equal(2, types.Count);
            Assert.All(types, type => Assert.Equal(RelationshipTypeCanonConstraints.None, type.CanonConstraints));

            // A world with no configured rule has nothing new to answer for, and what the old rule
            // had opened resolves on the next evaluation.
            var evaluation = await client.PostAsync(
                $"/api/universes/{universeId}/canon-conflicts/evaluate", content: null);
            evaluation.EnsureSuccessStatusCode();

            Assert.Equal(0, (await evaluation.Content.ReadFromJsonAsync<CanonEvaluationResponse>())!.Detected);
            Assert.Empty(await OpenRuleCodes(client, universeId));
        }
    }

    // ---------- Reading the file ----------

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Columns(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check")
            .ToListAsync();

    // ---------- Writing through the API ----------

    private static async Task<List<string>> OpenRuleCodes(HttpClient client, Guid universeId) =>
    [
        .. (await client.GetFromJsonAsync<CanonConflictPage>(
                $"/api/universes/{universeId}/canon-conflicts?pageSize=100"))!
            .Items.Where(conflict => conflict.Status == CanonConflictStatus.Pending)
            .Select(conflict => conflict.RuleCode),
    ];

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<EntityTypeResponse> CharacterType(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!.First(type => type.Name == "Character");

    private static async Task<FieldDefinitionResponse> AddBornField(HttpClient client, Guid universeId, Guid typeId)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest("Born", EntityFieldKind.Number, false, null, null, null, EntityFieldSemantic.BirthYear));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.First(field => field.Name == "Born");
    }

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        Guid bornFieldId,
        double born)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(
                typeId, name, null, CanonStatus.Canon, null, null,
                [new FieldValueInput(bornFieldId, null, born, null, null, null, null)]));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<RelationshipTypeResponse> CreateKind(
        HttpClient client,
        Guid universeId,
        string name,
        RelationshipTypeCanonConstraints? constraints)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest(name, $"{name}, reversed", false, null, null, constraints));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;
    }

    private static async Task Link(HttpClient client, Guid universeId, Guid typeId, Guid sourceId, Guid targetId) =>
        (await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationships",
            new RelationshipRequest(typeId, sourceId, targetId, CanonStatus.Canon, null, null, null)))
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
            // A handle Windows has not let go of yet. The directory is under the temp root and
            // named for this run, so leaving it costs nothing.
        }
    }
}
