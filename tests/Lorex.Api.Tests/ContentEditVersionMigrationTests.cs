using System.Net;
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
/// Edit versions (<c>AddContentEditVersions</c>, ADR 0043), walked down and back up over a real SQLite file.
///
/// Five plain columns. Down takes them with SQLite's own DROP COLUMN, so no table is rebuilt and every search trigger stays;
/// up gives every existing row version 1, so content from before is editable at once and a form naming 1 saves.
/// </summary>
public sealed class ContentEditVersionMigrationTests : IDisposable
{
    /// <summary>The migration immediately before edit versions.</summary>
    private const string Before = "20261013225228_AddCommentThreads";

    private static readonly string[] Tables = ["Entities", "EntityArticles", "Stories", "Scenes", "SceneManuscripts"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-edit-version-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Content_from_before_survives_both_ways_and_comes_back_editable_at_version_one()
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
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-versionmigrate", "user-versionmigrate@example.test", password)))
                .EnsureSuccessStatusCode();

            universe = (await PlotTestClient.CreateUniverse(client, "Version migrate")).Id;
            entry = await PlotTestClient.CreateEntity(client, universe, "Kept");
            await ArticleTestClient.WriteArticle(client, universe, entry, ArticleTestClient.Doc("First."));
            await ArticleTestClient.WriteArticle(client, universe, entry, ArticleTestClient.Doc("Second."));
            story = await PlotTestClient.CreateStory(client, universe, "Kept story");
            scene = await PlotTestClient.CreateScene(client, universe, story, "Kept scene");
            await ManuscriptTestClient.WriteManuscript(client, universe, story, scene, "She walked.");
            await ManuscriptTestClient.WriteManuscript(client, universe, story, scene, "She ran.");
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;
        List<string> content;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            content = await Content(db);
            Assert.Equal(2, await db.EntityArticles.Select(row => row.Version).SingleAsync());

            await db.GetService<IMigrator>().MigrateAsync(Before);

            foreach (var table in Tables)
            {
                Assert.DoesNotContain("Version", await Columns(db, table));
            }

            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));
            Assert.Equal(indexes.Where(LaterSchema.BeforeSuggestions), await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers.Where(LaterSchema.BeforeTypeGroups), await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(content, await Content(db));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(content, await Content(db));

            // Every row from before is version 1: nothing guessed from history or timestamps.
            foreach (var table in Tables)
            {
                Assert.Equal(["1"], await Strings(db, $"SELECT DISTINCT CAST(\"Version\" AS TEXT) AS Value FROM \"{table}\""));
            }
        }

        SqliteConnection.ClearAllPools();

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-versionmigrate", password))).EnsureSuccessStatusCode();

            var path = $"/api/universes/{universe}/entities/{entry}";
            var detail = (await client.GetFromJsonAsync<EntityDetail>(path))!;
            Assert.Equal(1, detail.Version);
            var request = new EntityRequest(detail.EntityTypeId, "Kept, edited", null, detail.CanonStatus, null, null, null, 1);
            Assert.Equal(2, (await (await client.PutAsJsonAsync(path, request)).Content.ReadFromJsonAsync<EntityDetail>())!.Version);
            Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(path, request)).StatusCode);

            Assert.Equal(1, (await ArticleTestClient.ReadArticle(client, universe, entry)).Version);
            Assert.Equal(2, (await ArticleTestClient.WriteArticle(client, universe, entry, ArticleTestClient.Doc("Third."))).Version);
            Assert.Equal(1, (await ManuscriptTestClient.ReadManuscript(client, universe, story, scene)).Version);
            Assert.Equal(1, (await client.GetFromJsonAsync<StoryDetail>(PlotTestClient.Story(universe, story)))!.Version);
            Assert.Equal(1, (await client.GetFromJsonAsync<SceneResponse>($"{PlotTestClient.Story(universe, story)}/scenes/{scene}"))!.Version);
        }
    }

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    /// <summary>Every row of the protected tables, every column but the version, as text.</summary>
    private static async Task<List<string>> Content(LorexDbContext db)
    {
        var rows = new List<string>();
        foreach (var table in Tables)
        {
            var columns = (await Columns(db, table)).Where(column => column != "Version");
            var select = string.Join(" || '|' || ", columns.Select(column => $"COALESCE(CAST(\"{column}\" AS TEXT), '~')"));
            rows.AddRange(await Strings(db, $"SELECT '{table}:' || {select} AS Value FROM \"{table}\" ORDER BY 1"));
        }

        return rows;
    }

    private static async Task<List<string>> Columns(LorexDbContext db, string table) =>
        await db.Database.SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table}) ORDER BY cid").ToListAsync();

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

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
