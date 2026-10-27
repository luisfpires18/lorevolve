using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The story migration, walked down and back up over a real SQLite file holding real lore.
///
/// The migration only creates tables, so the risk is not a rebuild losing rows. It is the schema the
/// tables arrive with: the unique narrative order, and the delete actions that decide what an entry,
/// an era or a story can take with it. SQLite reports those itself, so they are read back from the
/// file rather than trusted from the generated code. And an existing world - lore, chronology, a
/// timeline - must come through both directions exactly as it was, with no story data invented.
/// </summary>
public sealed class StoryMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before stories.</summary>
    private const string BeforeStories = "20260913010031_AddRelationshipTypeCanonConstraints";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-story-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task An_existing_world_upgrades_to_stories_unchanged_and_the_tables_hold_the_schema_they_claim()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        LoreCounts lore;

        // A world written on today's schema: eras, entries, a dated moment with a participant.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-storymigrate", "user-storymigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = await CreateUniverse(client, "World storymigrate");
            var eras = await TheFall(client, universeId);
            var arlen = await CreateEntity(client, universeId, "Arlen");
            await CreateEntity(client, universeId, "White Tower");

            (await client.PostAsJsonAsync(
                $"/api/universes/{universeId}/timeline",
                new TimelineEntryRequest(
                    "The fall", null, CanonStatus.Canon, TimelineDateKind.Exact, 1, null, null, null, null, null, null,
                    [arlen], eras[1].Id)))
                .EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        // Down to the schema before stories: that is what an existing database looks like.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(BeforeStories);

            var tables = await Tables(db);
            Assert.DoesNotContain("Stories", tables);
            Assert.DoesNotContain("Scenes", tables);
            Assert.DoesNotContain("SceneEntityLinks", tables);
            Assert.Empty(await ForeignKeyViolations(db));

            lore = await Count(db);
            Assert.Equal(new LoreCounts(2, 2, 1, 1), lore);
        }

        SqliteConnection.ClearAllPools();

        // Up: the tables arrive empty, with their constraints, and the lore is untouched.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(lore, await Count(db));

            Assert.Equal(0, await db.Stories.CountAsync());
            Assert.Equal(0, await db.Scenes.CountAsync());
            Assert.Equal(0, await db.SceneEntityLinks.CountAsync());

            // What each reference is allowed to do when the row it points at goes. The chapter reference
            // arrives with the later chapter migration, and the custom month's with calendars, both passed on the way up.
            Assert.Equal(
                ["Chapters.ChapterId:NO ACTION", "ChronologyCalendarMonths.MonthId:NO ACTION", "ChronologyEras.EraId:NO ACTION", "Entities.PovEntityId:SET NULL", "Stories.StoryId:CASCADE"],
                (await ForeignKeys(db, "Scenes")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["Entities.EntityId:CASCADE", "Scenes.SceneId:CASCADE"],
                (await ForeignKeys(db, "SceneEntityLinks")).Order(StringComparer.Ordinal));
            Assert.Equal(["Universes.UniverseId:CASCADE"], await ForeignKeys(db, "Stories"));

            // Two scenes can never claim the same place in one story's telling.
            Assert.Contains("IX_Scenes_StoryId_SortOrder:1", await Indexes(db, "Scenes"));
            Assert.Contains("IX_SceneEntityLinks_EntityId:0", await Indexes(db, "SceneEntityLinks"));
            Assert.Contains("IX_Stories_UniverseId_Title:0", await Indexes(db, "Stories"));
        }

        SqliteConnection.ClearAllPools();

        // The upgraded file is a working LorEvolve: a story is written against the old lore and its eras.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-storymigrate", Password)))
                .EnsureSuccessStatusCode();

            var timeline = (await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{universeId}/timeline"))!;
            var moment = Assert.Single(timeline.Items);
            Assert.Equal("The fall", moment.Title);

            var chronology = (await client.GetFromJsonAsync<ChronologyResponse>($"/api/universes/{universeId}/chronology"))!;
            var arlen = moment.Entities.Single().EntityId;

            var story = await PostJson<StoryDetail>(
                client, $"/api/universes/{universeId}/stories", new StoryRequest("After the upgrade", null, StoryStatus.Planning));
            var scene = await PostJson<SceneResponse>(
                client,
                $"/api/universes/{universeId}/stories/{story.Id}/scenes",
                new SceneRequest("First scene", null, null, arlen, new ChronologyValue(chronology.Eras[1].Id, 3, null, null), [arlen]));

            Assert.Equal("Arlen", scene.Pov!.Name);
        }

        SqliteConnection.ClearAllPools();

        // Down again with story data in it: the story tables go, and nothing else may.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(BeforeStories);

            Assert.DoesNotContain("Scenes", await Tables(db));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(lore, await Count(db));
        }

        SqliteConnection.ClearAllPools();

        // And up once more, empty again.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(0, await db.Stories.CountAsync());
            Assert.Equal(lore, await Count(db));
        }
    }

    // ---------- Reading the file ----------

    private sealed record LoreCounts(int Entities, int Eras, int Moments, int Participations);

    /// <summary>Counting selects no column, so it reads a rolled-back schema through today's model.</summary>
    private static async Task<LoreCounts> Count(LorEvolveDbContext db) =>
        new(
            await db.Entities.CountAsync(),
            await db.ChronologyEras.CountAsync(),
            await db.TimelineEntries.CountAsync(),
            await db.TimelineEntryLinks.CountAsync());

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Tables(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'table'")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeys(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list({table})")
            .ToListAsync();

    private static async Task<List<string>> Indexes(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name || ':' || \"unique\" AS Value FROM pragma_index_list({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check")
            .ToListAsync();

    // ---------- Writing through the API ----------

    private static async Task<T> PostJson<T>(HttpClient client, string path, object body)
    {
        var response = await client.PostAsJsonAsync(path, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<Guid> CreateUniverse(HttpClient client, string name) =>
        (await PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest(name, null, null))).Id;

    private static async Task<IReadOnlyList<ChronologyEraResponse>> TheFall(HttpClient client, Guid universeId)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
    }

    private static async Task<Guid> CreateEntity(HttpClient client, Guid universeId, string name)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        return (await PostJson<EntityDetail>(
            client,
            $"/api/universes/{universeId}/entities",
            new EntityRequest(types.First(type => type.Name == "Character").Id, name, null, CanonStatus.Idea, null, null, null)))
            .Id;
    }

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
