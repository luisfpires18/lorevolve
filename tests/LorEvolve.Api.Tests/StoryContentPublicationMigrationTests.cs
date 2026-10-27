using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The story content publication migration, walked down and back up over a real SQLite file (Product refinement 015,
/// ADR 0039).
///
/// What it has to prove is that the upgrade publishes nothing: a public story in a public universe, whose scene has an
/// outline and prose and whose plot has an arc, comes out of it with every part private - its page still answers, with
/// nothing inside - and the universe is its author's own, crediting no one. Rolling back drops only what it added, with
/// SQLite's own <c>DROP COLUMN</c>; every trigger (the scene search index's among them) and index is read back both ways.
/// </summary>
public sealed class StoryContentPublicationMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before story content publication.</summary>
    private const string Before = "20260928131117_AddPublicReading";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-story-content-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Every_existing_story_part_stays_private_and_every_universe_stays_its_authors_own()
    {
        Directory.CreateDirectory(_directory);

        List<string> triggers;
        List<string> indexes;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-partmigrate", "user-partmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            var u = (await PlotTestClient.PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest("Parts migrated", null, null))).Id;
            (await client.PutAsJsonAsync($"/api/universes/{u}/publication", new PublicationDetailsRequest("Already public.", UniverseCategory.Original, [UniverseGenres.Mystery])))
                .EnsureSuccessStatusCode();
            (await PublishingTestClient.UploadArtwork(client, u, PublishingTestClient.Png(800, 500))).EnsureSuccessStatusCode();
            (await client.PutAsJsonAsync("/api/profile/public-name", new PublicNameRequest("Part Migrator"))).EnsureSuccessStatusCode();
            (await client.PostAsync($"/api/universes/{u}/publish", null)).EnsureSuccessStatusCode();

            var story = (await PlotTestClient.PostJson<StoryDetail>(client, PlotTestClient.Stories(u), new StoryRequest("Migrated parts", null, StoryStatus.Drafting))).Id;
            (await client.PutAsJsonAsync($"{PlotTestClient.Story(u, story)}/publication", new StoryPublicationRequest("For readers."))).EnsureSuccessStatusCode();
            (await client.PostAsync($"{PlotTestClient.Story(u, story)}/publish", null)).EnsureSuccessStatusCode();

            var scene = (await PlotTestClient.PostJson<SceneResponse>(
                client, $"{PlotTestClient.Story(u, story)}/scenes", new SceneRequest("Scene before", "Outline before.", null, null, null, null))).Id;
            await ManuscriptTestClient.WriteManuscript(client, u, story, scene, "Prose before.");
            await PlotTestClient.CreateArc(client, u, story, "Arc before");
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            triggers = await Triggers(db);
            indexes = await Indexes(db);

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.DoesNotContain("Visibility", await Columns(db, "Scenes"));
            Assert.DoesNotContain("ManuscriptVisibility", await Columns(db, "Scenes"));
            Assert.DoesNotContain("Visibility", await Columns(db, "PlotArcs"));
            Assert.DoesNotContain("OriginalCreator", await Columns(db, "Universes"));
            Assert.DoesNotContain("OriginalWork", await Columns(db, "Universes"));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(triggers.Where(LaterSchema.BeforeNestedTypes), await Triggers(db));
            Assert.Equal(LaterSchema.WithDropped(indexes).Where(LaterSchema.BeforeNestedTypes), await Indexes(db));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.Empty(await ForeignKeyViolations(db));
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(triggers, await Triggers(db));
            Assert.Equal(indexes, await Indexes(db));

            var scene = await db.Scenes.AsNoTracking().SingleAsync();
            Assert.Equal((ContentVisibility.Private, ContentVisibility.Private), (scene.Visibility, scene.ManuscriptVisibility));
            Assert.Equal(ContentVisibility.Private, (await db.PlotArcs.AsNoTracking().SingleAsync()).Visibility);
            var universe = await db.Universes.AsNoTracking().SingleAsync();
            Assert.Equal((null, null), (universe.OriginalCreator, universe.OriginalWork));
            Assert.Equal("Prose before.", (await db.SceneManuscripts.AsNoTracking().SingleAsync()).Content);
        }

        SqliteConnection.ClearAllPools();

        await using (var host = new FileHost(DataSource))
        {
            var page = (await host.CreateHttpsClient().GetFromJsonAsync<PublicStoryDetail>("/api/public/universes/parts-migrated/stories/migrated-parts"))!;
            Assert.Equal((0, 0, 0), (page.Scenes.Count, page.Manuscript.Count, page.Plot.Count));
        }
    }

    // ---------- Reading the file ----------

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
