using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Lorex.Api.Tests;

/// <summary>
/// A version's author (<c>AddRevisionActors</c>, task 042), walked down and back up over a real SQLite file.
///
/// Three nullable columns, nothing backfilled: every version saved before them reads as having no recorded author, every
/// version survives both ways, and the next one saved names its account again.
/// </summary>
public sealed class RevisionActorMigrationTests : IDisposable
{
    /// <summary>The migration immediately before authors.</summary>
    private const string Before = "20261006091128_AddAccountStorageQuota";

    private static readonly string[] Tables = ["EntityRevisions", "EntityArticleRevisions", "SceneManuscriptRevisions"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-revision-actor-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Versions_from_before_survive_both_ways_and_name_no_one()
    {
        Directory.CreateDirectory(_directory);

        var password = $"m-{Guid.NewGuid():n}";
        Guid universe;
        Guid entry;
        Guid story;
        Guid scene;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-actormigrate", "user-actormigrate@example.test", password)))
                .EnsureSuccessStatusCode();

            universe = (await PlotTestClient.CreateUniverse(client, "Actor migrate")).Id;
            entry = await PlotTestClient.CreateEntity(client, universe, "Kept");
            await ArticleTestClient.WriteArticle(client, universe, entry, ArticleTestClient.Doc("First."));
            await ArticleTestClient.WriteArticle(client, universe, entry, ArticleTestClient.Doc("Second."));
            story = await PlotTestClient.CreateStory(client, universe, "Kept story");
            scene = await PlotTestClient.CreateScene(client, universe, story, "Kept scene");
            await ManuscriptTestClient.WriteManuscript(client, universe, story, scene, "She walked.");
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;
        List<int> counts;

        await using (var db = Context())
        {
            indexes = await Indexes(db);
            triggers = await Triggers(db);
            counts = await Counts(db);
            Assert.Equal(new List<int> { 1, 2, 1 }, counts);

            await db.GetService<IMigrator>().MigrateAsync(Before);

            foreach (var table in Tables)
            {
                Assert.DoesNotContain("ActorUserId", await Columns(db, table));
            }

            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(indexes.Where(LaterSchema.BeforeComments), await Indexes(db));
            Assert.Equal(triggers.Where(LaterSchema.BeforeTypeGroups), await Triggers(db));
            Assert.Equal(counts, await Counts(db));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(indexes, await Indexes(db));
            Assert.Equal(triggers, await Triggers(db));
            Assert.Equal(counts, await Counts(db));

            // Nothing guessed back.
            Assert.False(await db.EntityRevisions.AnyAsync(row => row.ActorUserId != null));
            Assert.False(await db.EntityArticleRevisions.AnyAsync(row => row.ActorUserId != null));
            Assert.False(await db.SceneManuscriptRevisions.AnyAsync(row => row.ActorUserId != null));
        }

        SqliteConnection.ClearAllPools();

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-actormigrate", password))).EnsureSuccessStatusCode();

            var history = (await client.GetFromJsonAsync<List<EntityRevisionSummary>>($"/api/universes/{universe}/entities/{entry}/revisions"))!;
            Assert.Null(Assert.Single(history).ActorName);
            Assert.All(await ArticleTestClient.ArticleRevisions(client, universe, entry), version => Assert.Null(version.ActorName));
            Assert.Null(Assert.Single((await client.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>(
                $"{ManuscriptTestClient.Manuscript(universe, story, scene)}/revisions"))!).ActorName);

            // The next save names its account; the older version is left as it was.
            await ArticleTestClient.WriteArticle(client, universe, entry, ArticleTestClient.Doc("Third."));
            var article = await ArticleTestClient.ArticleRevisions(client, universe, entry);
            Assert.Equal("user-actormigrate", article[0].ActorName);
            Assert.All(article.Skip(1), version => Assert.Null(version.ActorName));
        }
    }

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<int>> Counts(LorexDbContext db)
    {
        var counts = new List<int>();
        foreach (var sql in Tables.Select(table => $"SELECT COUNT(*) AS Value FROM \"{table}\""))
        {
            counts.Add(await db.Database.SqlQueryRaw<int>(sql).SingleAsync());
        }

        return counts;
    }

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
