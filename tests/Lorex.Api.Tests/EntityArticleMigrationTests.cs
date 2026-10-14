using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Stories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static Lorex.Api.Tests.ArticleTestClient;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;

using static Lorex.Api.Tests.VersionTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// The article migration, walked down and back up over a real SQLite file holding lore that other tables point at.
///
/// The risks are the ones a moved column carries, and each is read back from the file rather than trusted from the
/// generated code. Every article must move byte for byte and become version 1 of its own history, with an id the rest of the
/// schema can query; an entry with no article must gain nothing. <c>Entities</c> must lose its column without being rebuilt -
/// every other lore table keeps its foreign keys and the search index keeps its delete trigger. Entry versions keep the
/// copy of the article they already held. And a rollback with articles in the file puts each one back on its entry.
/// </summary>
public sealed partial class EntityArticleMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before entry articles.</summary>
    private const string BeforeArticles = "20260913141656_AddSceneManuscripts";

    private const string Trigger = "EntitySearchIndex_EntityDeleted";

    /// <summary>Every table with a foreign key into <c>Entities</c>, whose delete actions must not move.</summary>
    private static readonly string[] Dependants =
    [
        "EntityAliases", "EntityFieldValues", "EntityTags", "EntityImages", "EntityRevisions", "Relationships",
        "TimelineEntryLinks", "Scenes", "SceneEntityLinks", "PlotBeatEntities",
    ];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-article-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Articles_move_into_their_own_rows_with_a_first_version_and_roll_back_onto_their_entries()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid warden;
        Guid coast;
        Guid cleared;
        Guid ghost;
        var legacyArticle = Doc("Written before the move, by an older Lorex.");
        var legacySnapshot = Doc("As the article read at the entry's first version.");

        // Lore with articles, written by the current host, and pointed at by aliases, a relationship and a scene.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-artmigrate", "user-artmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World artmigrate")).Id;
            var character = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
                $"/api/universes/{universeId}/entity-types"))!.First(type => type.Name == "Character").Id;

            warden = (await PostJson<EntityDetail>(
                client,
                $"/api/universes/{universeId}/entities",
                new EntityRequest(character, "Warden", "Keeper of the coast.", CanonStatus.Canon, ["The Warden"], ["coast"], null))).Id;
            coast = await CreateEntity(client, universeId, "Coast");
            cleared = await CreateEntity(client, universeId, "Cleared");
            ghost = await CreateEntity(client, universeId, "Ghost");

            await WriteArticle(client, universeId, warden, RichDocument);
            await WriteArticle(client, universeId, cleared, Doc("A false start."));
            await WriteArticle(client, universeId, cleared, string.Empty);
            await WriteArticle(client, universeId, ghost, Doc("Thrown away, not erased."));
            (await client.DeleteAsync($"/api/universes/{universeId}/entities/{ghost}")).EnsureSuccessStatusCode();

            var kind = await PostJson<RelationshipTypeResponse>(
                client,
                $"/api/universes/{universeId}/relationship-types",
                new RelationshipTypeRequest("guards", "guarded by", false, null, null));
            (await client.PostAsJsonAsync(
                $"/api/universes/{universeId}/relationships",
                new RelationshipRequest(kind.Id, warden, coast, CanonStatus.Canon, null, null, null))).EnsureSuccessStatusCode();

            var story = await CreateStory(client, universeId, "The Watch");
            await PostJson<SceneResponse>(
                client, $"{Story(universeId, story)}/scenes", new SceneRequest("At the wall", null, null, warden, null, [warden, coast]));
        }

        SqliteConnection.ClearAllPools();

        List<string> entities;
        Dictionary<string, List<string>> keys;
        Dictionary<string, int> counts;

        // Down to the schema before articles: each article goes back on its entry, and nothing else moves.
        await using (var db = Context())
        {
            entities = await EntityRows(db);
            keys = await DependantKeys(db);
            counts = await Counts(db);
            Assert.Equal(3, await db.EntityArticles.CountAsync());

            await db.GetService<IMigrator>().MigrateAsync(BeforeArticles);

            Assert.DoesNotContain("EntityArticles", await Tables(db));
            Assert.DoesNotContain("EntityArticleRevisions", await Tables(db));
            Assert.Equal(RichDocument, await LegacyContent(db, warden));
            Assert.Null(await LegacyContent(db, coast));
            Assert.Null(await LegacyContent(db, cleared));
            Assert.Equal(Doc("Thrown away, not erased."), await LegacyContent(db, ghost));

            Assert.Equal(entities, await EntityRows(db));
            Assert.Equal(keys, await DependantKeys(db));
            Assert.Equal(counts, await Counts(db));
            Assert.Contains(Trigger, await Triggers(db));
            Assert.Empty(await ForeignKeyViolations(db));

            // What an older Lorex would have written meanwhile: an article on the Coast, a blank one, and an entry version
            // holding its copy of the article. The Coast's index row goes, so the next start indexes it from its new row.
            await db.Database.ExecuteSqlAsync($"""UPDATE "Entities" SET "Content" = {legacyArticle} WHERE "Id" = {coast}""");
            await db.Database.ExecuteSqlAsync($"""UPDATE "Entities" SET "Content" = '   ' WHERE "Id" = {cleared}""");
            await db.Database.ExecuteSqlAsync(
                $"""UPDATE "EntityRevisions" SET "Content" = {legacySnapshot} WHERE "EntityId" = {warden} AND "Number" = 1""");
            await db.Database.ExecuteSqlAsync($"DELETE FROM EntitySearchIndex WHERE EntityId = {coast}");
            entities = await EntityRows(db);
            counts = await Counts(db);
        }

        SqliteConnection.ClearAllPools();

        // Up: every article in its own row, exactly, as version 1; the column gone without a rebuild.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.DoesNotContain(await Columns(db, "Entities"), column => column.StartsWith("Content:", StringComparison.Ordinal));

            Assert.Equal(entities, await EntityRows(db));
            Assert.Equal(keys, await DependantKeys(db));
            Assert.Equal(counts, await Counts(db));
            Assert.Contains(Trigger, await Triggers(db));

            var moved = await db.EntityArticles.AsNoTracking().ToDictionaryAsync(row => row.EntityId, row => row.Content);
            Assert.Equal(3, moved.Count);
            Assert.Equal(RichDocument, moved[warden], StringComparer.Ordinal);
            Assert.Equal(legacyArticle, moved[coast], StringComparer.Ordinal);
            Assert.Equal(Doc("Thrown away, not erased."), moved[ghost], StringComparer.Ordinal);
            Assert.False(moved.ContainsKey(cleared));

            // One version each, dated by the entry's last change, holding exactly the article.
            Assert.Equal(
                3,
                await db.Database.SqlQueryRaw<int>(
                    """
                    SELECT COUNT(*) AS Value FROM "EntityArticleRevisions" AS r
                    JOIN "EntityArticles" AS a ON a."EntityId" = r."EntityId"
                    JOIN "Entities" AS e ON e."Id" = r."EntityId"
                    WHERE r."Number" = 1 AND r."Kind" = 0 AND r."RestoredFromRevisionId" IS NULL
                      AND r."Content" = a."Content" AND r."CreatedAt" = a."UpdatedAt" AND a."UpdatedAt" = e."UpdatedAt"
                    """).SingleAsync());
            Assert.Equal(3, await db.EntityArticleRevisions.CountAsync());

            // Minted ids take the same stored form as every other Guid in the schema, and are distinct.
            var ids = await db.Database.SqlQueryRaw<string>("""SELECT "Id" AS Value FROM "EntityArticleRevisions" """).ToListAsync();
            var entityIds = await db.Database.SqlQueryRaw<string>("""SELECT "Id" AS Value FROM "Entities" """).ToListAsync();
            Assert.All(ids.Concat(entityIds), id => Assert.Matches(StoredGuid(), id));
            Assert.Equal(ids.Count, ids.Distinct(StringComparer.Ordinal).Count());

            Assert.Equal(["Entities.EntityId:CASCADE"], await ForeignKeys(db, "EntityArticles"));
            Assert.Equal(["EntityId"], await PrimaryKey(db, "EntityArticles"));
            Assert.Equal(["Entities.EntityId:CASCADE"], await ForeignKeys(db, "EntityArticleRevisions"));
        }

        SqliteConnection.ClearAllPools();

        // The upgraded file is a working Lorex: articles read, their versions resolve by id, search reads the moved row, and
        // an entry version keeps the copy it held without ever applying it.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-artmigrate", Password)))
                .EnsureSuccessStatusCode();

            Assert.Equal(RichDocument, (await ReadArticle(client, universeId, warden)).Content, StringComparer.Ordinal);
            var baseline = Assert.Single(await ArticleRevisions(client, universeId, warden));
            Assert.Equal((1, EntityRevisionKind.Created), (baseline.Number, baseline.Kind));
            Assert.Equal(RichDocument, (await ArticleRevision(client, universeId, warden, baseline.Id)).Content);

            Assert.Equal(legacyArticle, (await ReadArticle(client, universeId, coast)).Content);
            Assert.Equal(new EntityArticleResponse(cleared, string.Empty, null, 0), await ReadArticle(client, universeId, cleared));

            var found = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universeId}/entities?search=older"))!;
            var hit = Assert.Single(found.Items);
            Assert.Equal(coast, hit.Id);
            Assert.Contains(hit.ArticleExcerpt!, part => part.IsMatch && part.Text == "older");

            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(ArticlePath(universeId, ghost))).StatusCode);
            (await client.PostAsync($"/api/universes/{universeId}/trash/{ghost}/restore", null)).EnsureSuccessStatusCode();
            Assert.Equal(Doc("Thrown away, not erased."), (await ReadArticle(client, universeId, ghost)).Content);

            var versions = (await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
                $"/api/universes/{universeId}/entities/{warden}/revisions"))!;
            var first = versions.Single(version => version.Number == 1);
            Assert.Equal(
                legacySnapshot,
                (await client.GetFromJsonAsync<EntityRevisionDetail>(
                    $"/api/universes/{universeId}/entities/{warden}/revisions/{first.Id}"))!.Content);

            var saved = await WriteArticle(client, universeId, warden, Doc("Rewritten after the move."));
            Assert.Equal([2, 1], (await ArticleRevisions(client, universeId, warden)).Select(version => version.Number));

            var wardenDetail = (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{universeId}/entities/{warden}"))!;
            (await client.PutVersionedAsync(
                $"/api/universes/{universeId}/entities/{warden}",
                new EntityRequest(
                    wardenDetail.EntityTypeId, "Warden", "Keeper of the drowned coast.", CanonStatus.Canon, ["The Warden"], ["coast"], null)))
                .EnsureSuccessStatusCode();
            var newest = (await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
                $"/api/universes/{universeId}/entities/{warden}/revisions"))!.First();
            Assert.Equal(EntityRevisionChange.Summary, newest.Changes);

            (await RestoreEntryVersion(client, $"/api/universes/{universeId}/entities/{warden}", first.Id)).EnsureSuccessStatusCode();
            var kept = await ReadArticle(client, universeId, warden);
            Assert.Equal(Doc("Rewritten after the move."), kept.Content);
            SameMoment(saved.UpdatedAt, kept.UpdatedAt);
        }

        SqliteConnection.ClearAllPools();

        // The database itself holds what the API never sends.
        await using (var db = Context())
        {
            var orphan = await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                """INSERT INTO "EntityArticles" ("EntityId", "Content", "UpdatedAt") VALUES ('7F1D6C0A-0000-4000-8000-000000000001', 'orphan', '2026-09-13 00:00:00')"""));
            Assert.Contains("FOREIGN KEY", orphan.Message, StringComparison.Ordinal);

            var twice = await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                """INSERT INTO "EntityArticles" ("EntityId", "Content", "UpdatedAt") SELECT "EntityId", 'again', "UpdatedAt" FROM "EntityArticles" LIMIT 1"""));
            Assert.Contains("UNIQUE", twice.Message, StringComparison.Ordinal);

            var number = await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                """INSERT INTO "EntityArticleRevisions" ("Id", "EntityId", "Number", "Kind", "CreatedAt", "Content") SELECT '7F1D6C0A-0000-4000-8000-000000000002', "EntityId", "Number", 1, "CreatedAt", 'again' FROM "EntityArticleRevisions" LIMIT 1"""));
            Assert.Contains("UNIQUE", number.Message, StringComparison.Ordinal);

            // An entry row deleted takes its article, its versions and its index row, and nobody else's.
            await db.Entities.Where(entity => entity.Id == ghost).ExecuteDeleteAsync();
            Assert.False(await db.EntityArticles.AnyAsync(row => row.EntityId == ghost));
            Assert.False(await db.EntityArticleRevisions.AnyAsync(row => row.EntityId == ghost));
            Assert.Equal(0, await db.Database.SqlQuery<int>($"SELECT COUNT(*) AS Value FROM EntitySearchIndex WHERE EntityId = {ghost}").SingleAsync());
            Assert.Equal(2, await db.EntityArticles.CountAsync());
            Assert.Empty(await ForeignKeyViolations(db));
        }

        SqliteConnection.ClearAllPools();

        // Down again with articles and history in the file: each article goes back on its entry, the history goes, and up
        // once more each article is version 1 again.
        await using (var db = Context())
        {
            var before = await EntityRows(db);

            await db.GetService<IMigrator>().MigrateAsync(BeforeArticles);

            Assert.Equal(Doc("Rewritten after the move."), await LegacyContent(db, warden));
            Assert.Equal(legacyArticle, await LegacyContent(db, coast));
            Assert.Null(await LegacyContent(db, cleared));
            Assert.Equal(before, await EntityRows(db));
            Assert.Contains(Trigger, await Triggers(db));
            Assert.Empty(await ForeignKeyViolations(db));

            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(before, await EntityRows(db));
            Assert.Equal(2, await db.EntityArticles.CountAsync());
            Assert.Equal(2, await db.EntityArticleRevisions.CountAsync());
            Assert.Equal(
                Doc("Rewritten after the move."),
                (await db.EntityArticleRevisions.SingleAsync(row => row.EntityId == warden)).Content);
            Assert.Contains(Trigger, await Triggers(db));
            Assert.Empty(await ForeignKeyViolations(db));
        }
    }

    // ---------- Reading the file ----------

    /// <summary>Every entry as one line, without any article. Plain SQL, so both schemas read alike.</summary>
    private static async Task<List<string>> EntityRows(LorexDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                """
                SELECT e."Id" || '|' || e."Name" || '|' || COALESCE(e."Summary", '-') || '|' || e."CanonStatus" || '|'
                    || COALESCE(e."DeletedAt", '-') || '|' || e."UpdatedAt" AS Value
                FROM "Entities" AS e
                ORDER BY e."Id"
                """)
            .ToListAsync();

    private static async Task<string?> LegacyContent(LorexDbContext db, Guid entityId) =>
        await db.Database
            .SqlQuery<string?>($"""SELECT "Content" AS Value FROM "Entities" WHERE "Id" = {entityId}""")
            .SingleAsync();

    private static async Task<Dictionary<string, List<string>>> DependantKeys(LorexDbContext db)
    {
        var keys = new Dictionary<string, List<string>>();
        foreach (var table in Dependants)
        {
            // A scene's custom month (AddChronologyCalendars, 039) arrives after articles, so a rollback past it takes its key.
            keys[table] =
            [
                .. (await ForeignKeys(db, table))
                    .Where(key => !key.StartsWith("ChronologyCalendarMonths.", StringComparison.Ordinal))
                    .Order(StringComparer.Ordinal),
            ];
        }

        return keys;
    }

    private static async Task<Dictionary<string, int>> Counts(LorexDbContext db) => new()
    {
        ["aliases"] = await db.EntityAliases.CountAsync(),
        ["tags"] = await db.EntityTags.CountAsync(),
        ["revisions"] = await db.EntityRevisions.CountAsync(),
        ["relationships"] = await db.Relationships.CountAsync(),
        ["sceneLinks"] = await db.SceneEntityLinks.CountAsync(),
        ["index"] = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM EntitySearchIndex").SingleAsync(),
    };

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Tables(LorexDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'table'")
            .ToListAsync();

    private static async Task<List<string>> Triggers(LorexDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'trigger'")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeys(LorexDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list({table})")
            .ToListAsync();

    /// <summary>The primary key's columns, in key order.</summary>
    private static async Task<List<string>> PrimaryKey(LorexDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table}) WHERE pk > 0 ORDER BY pk")
            .ToListAsync();

    /// <summary>Every column as name:type:notnull.</summary>
    private static async Task<List<string>> Columns(LorexDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name || ':' || type || ':' || \"notnull\" AS Value FROM pragma_table_info({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorexDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check")
            .ToListAsync();

    [GeneratedRegex("^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$")]
    private static partial Regex StoredGuid();

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
            // A handle Windows has not let go of yet. The directory is under the temp root and named for this run, so
            // leaving it costs nothing.
        }
    }
}
