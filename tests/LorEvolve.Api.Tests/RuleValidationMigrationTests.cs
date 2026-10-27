using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Search;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RuleValidationTestClient;
using static LorEvolve.Api.Tests.WorldRuleTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The rule validation migration, walked down and back up over a real SQLite file holding lore, moments, a story and rules (ADR
/// 0034).
///
/// It only adds three tables. Down removes them and nothing else - every trigger in the file, the search triggers on world rules
/// included, is still there by name - and up creates them with the delete actions and the unique name index the model declares.
/// Rules written before it are words only and moments have no details. The upgraded file checks a rule, keeps search in step, and
/// a universe row deleted outside the API takes its terms, checks and details with it.
/// </summary>
public sealed class RuleValidationMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before rule validation.</summary>
    private const string BeforeRuleValidation = "20260915083713_AddWorldRules";

    private static readonly string[] Tables = ["ValidationTerms", "WorldRuleValidations", "TimelineEntryValidations"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-rule-validation-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Three_tables_come_and_go_alone_and_the_upgraded_file_checks_rules()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId, arlen, wordsRule, ordinaryMoment;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-rvmigrate", "user-rvmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World rvmigrate")).Id;
            arlen = await CreateEntity(client, universeId, "Arlen");
            var storyId = await CreateStory(client, universeId, "The Long Winter");
            await CreateScene(client, universeId, storyId, "The Council");
            wordsRule = (await CreateRule(client, universeId, "One return per person", "Words.")).Id;
            ordinaryMoment = (await CreateMoment(client, universeId, Moment("The founding", null, linked: [arlen]))).Id;

            // Rows only the new schema can hold, which the rollback discards.
            var kind = await EventKind(client, universeId, "Rolled back kind");
            var method = await Method(client, universeId, "Rolled back method");
            await CreateCheckedRule(client, universeId, "Rolled back check", Limit(kind.Id, method.Id, 1));
            await CreateMoment(client, universeId, Moment("Rolled back details", Details(kind.Id, method.Id, arlen)));
        }

        SqliteConnection.ClearAllPools();

        List<string> authored, triggers;

        await using (var db = Context())
        {
            authored = await AuthoredRows(db);
            triggers = await Names(db, "trigger");
            Assert.Contains("WorldRuleSearchIndex_WorldRuleUpdated", triggers);

            await db.GetService<IMigrator>().MigrateAsync(BeforeRuleValidation);

            Assert.Empty((await Names(db, "table")).Intersect(Tables));
            Assert.Equal(triggers.Where(LaterSchema.BeforeNestedTypes).Order(StringComparer.Ordinal), (await Names(db, "trigger")).Order(StringComparer.Ordinal));
            Assert.Equal(authored, await AuthoredRows(db));
            Assert.Empty(await ForeignKeyViolations(db));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(authored, await AuthoredRows(db));
            Assert.Equal(triggers.Order(StringComparer.Ordinal), (await Names(db, "trigger")).Order(StringComparer.Ordinal));

            foreach (var table in Tables)
            {
                Assert.Equal(0, await Scalar(db, $"SELECT COUNT(*) AS Value FROM \"{table}\""));
            }

            Assert.Equal(["Universes.UniverseId:CASCADE"], await ForeignKeys(db, "ValidationTerms"));
            Assert.Equal(
                ["ValidationTerms.EventKindTermId:NO ACTION", "ValidationTerms.MethodTermId:NO ACTION", "WorldRules.WorldRuleId:CASCADE"],
                (await ForeignKeys(db, "WorldRuleValidations")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["Entities.ParticipantEntityId:SET NULL", "TimelineEntries.TimelineEntryId:CASCADE", "ValidationTerms.EventKindTermId:NO ACTION", "ValidationTerms.MethodTermId:NO ACTION"],
                (await ForeignKeys(db, "TimelineEntryValidations")).Order(StringComparer.Ordinal));
            Assert.Contains("IX_ValidationTerms_UniverseId_Kind_NormalizedName:1:0", await Indexes(db, "ValidationTerms"));
        }

        SqliteConnection.ClearAllPools();

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-rvmigrate", Password))).EnsureSuccessStatusCode();

            // What was written before is exactly what it was: a rule of words, a moment with no details.
            var rule = await ReadRule(client, universeId, wordsRule);
            Assert.Null(rule.Validation);
            Assert.Null(rule.Check);
            Assert.Null((await ReadMoment(client, universeId, ordinaryMoment)).Validation);
            Assert.Empty(await Findings(client, universeId, null));

            // The upgraded file checks a rule, reconciles on the write, and its rule search is still in step.
            var kind = await EventKind(client, universeId, "Resurrection");
            var method = await Method(client, universeId, "Rite of Ash");
            var checkedRule = await CreateCheckedRule(client, universeId, "Quorrel returns once", Limit(kind.Id, method.Id, 1));
            await CreateMoment(client, universeId, Moment("First", Details(kind.Id, method.Id, arlen)));
            await CreateMoment(client, universeId, Moment("Second", Details(kind.Id, method.Id, arlen)));
            Assert.Single(await Findings(client, universeId));
            Assert.Equal([checkedRule.Id], (await Search(client, universeId, "Quorrel")).Results.Select(result => result.Id));
        }

        SqliteConnection.ClearAllPools();

        // The schema's own guarantee, without the API: the universe row goes, and every term, check and set of details with it.
        await using (var db = Context())
        {
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"Universes\" WHERE \"Id\" = {0}", universeId.ToString().ToUpperInvariant());

            foreach (var table in Tables)
            {
                Assert.Equal(0, await Scalar(db, $"SELECT COUNT(*) AS Value FROM \"{table}\""));
            }

            Assert.Empty(await ForeignKeyViolations(db));
        }
    }

    // ---------- Reading the file ----------

    private const string AuthoredRowsSql = """
        SELECT 'entity|' || "Name" || '|' || "Id" AS Value FROM "Entities"
        UNION ALL SELECT 'story|' || "Title" || '|' || "Id" AS Value FROM "Stories"
        UNION ALL SELECT 'scene|' || "Title" || '|' || "Id" AS Value FROM "Scenes"
        UNION ALL SELECT 'rule|' || "Title" || '|' || "Description" || '|' || "Id" AS Value FROM "WorldRules"
        UNION ALL SELECT 'moment|' || "Title" || '|' || "CanonStatus" || '|' || coalesce("StartYear", '') || '|' || "Id" AS Value FROM "TimelineEntries"
        UNION ALL SELECT 'link|' || "TimelineEntryId" || '|' || "EntityId" AS Value FROM "TimelineEntryLinks"
        ORDER BY Value
        """;

    private static async Task<List<string>> AuthoredRows(LorEvolveDbContext db) =>
        await db.Database.SqlQueryRaw<string>(AuthoredRowsSql).ToListAsync();

    private static async Task<List<string>> Names(LorEvolveDbContext db, string type) =>
        await db.Database.SqlQuery<string>($"SELECT name AS Value FROM sqlite_master WHERE type = {type}").ToListAsync();

    private static async Task<int> Scalar(LorEvolveDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<int>(sql).SingleAsync();

    private static async Task<List<string>> Indexes(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name || ':' || \"unique\" || ':' || partial AS Value FROM pragma_index_list({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeys(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorEvolveDbContext db) =>
        await db.Database.SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check").ToListAsync();

    private static async Task<UniverseSearchResponse> Search(HttpClient client, Guid universeId, string query) =>
        (await client.GetFromJsonAsync<UniverseSearchResponse>($"/api/universes/{universeId}/search?q={Uri.EscapeDataString(query)}"))!;

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    /// <summary>The real host on the file, outside Development, so startup migrates it the way a deployment does.</summary>
    private sealed class FileHost(string dataSource) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
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
            // A handle Windows has not let go of yet; the directory is named for this run under the temp root.
        }
    }
}
