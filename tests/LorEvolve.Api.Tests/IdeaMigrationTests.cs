using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Ideas;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static LorEvolve.Api.Tests.IdeaTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The ideas migration, walked down and back up over a real SQLite file holding lore, a story and ideas (ADR 0030).
///
/// It only adds: down removes the idea tables and nothing else, so every entry, story and scene is exactly as it was; up
/// creates them empty with the indexes and delete actions the model declares - read back from SQLite, not trusted from the
/// generated code - and the upgraded file works, including the database's own last line of defence: a universe row deleted
/// outside the API still leaves its ideas, unassigned, and takes only their references.
/// </summary>
public sealed class IdeaMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before ideas.</summary>
    private const string BeforeIdeas = "20260914094022_AddContentRecovery";

    private static readonly string[] IdeaTables =
        ["Ideas", "IdeaEntityReferences", "IdeaStoryReferences", "IdeaSceneReferences", "IdeaPlotArcReferences", "IdeaPlotBeatReferences"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-ideas-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task The_idea_tables_come_and_go_alone_and_the_upgraded_file_keeps_ideas_when_a_universe_row_goes()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid entityId;
        Guid storyId;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-ideamigrate", "user-ideamigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World ideamigrate")).Id;
            entityId = await CreateEntity(client, universeId, "Arlen");
            storyId = await CreateStory(client, universeId, "The Long Winter");
            await CreateScene(client, universeId, storyId, "The Council");

            await CreateIdea(client, "Assigned", "Words.", universeId, [Ref(IdeaReferenceKind.Entity, entityId), Ref(IdeaReferenceKind.Story, storyId)]);
            await CreateIdea(client, "Loose", "No world.");
        }

        SqliteConnection.ClearAllPools();

        List<string> lore;

        await using (var db = Context())
        {
            lore = await LoreRows(db);
            Assert.Equal(3, lore.Count);

            await db.GetService<IMigrator>().MigrateAsync(BeforeIdeas);

            var tables = await Tables(db);
            Assert.All(IdeaTables, table => Assert.DoesNotContain(table, tables));
            Assert.Equal(lore, await LoreRows(db));
            Assert.Empty(await ForeignKeyViolations(db));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(lore, await LoreRows(db));
            Assert.Equal(0, await db.Ideas.CountAsync());

            Assert.Equal(
                ["AspNetUsers.OwnerId:CASCADE", "Universes.UniverseId:SET NULL"],
                (await ForeignKeys(db, "Ideas")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["Entities.EntityId:CASCADE", "Ideas.IdeaId:CASCADE"],
                (await ForeignKeys(db, "IdeaEntityReferences")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["Ideas.IdeaId:CASCADE", "Stories.StoryId:CASCADE"],
                (await ForeignKeys(db, "IdeaStoryReferences")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["Ideas.IdeaId:CASCADE", "Scenes.SceneId:CASCADE"],
                (await ForeignKeys(db, "IdeaSceneReferences")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["Ideas.IdeaId:CASCADE", "PlotArcs.PlotArcId:CASCADE"],
                (await ForeignKeys(db, "IdeaPlotArcReferences")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["Ideas.IdeaId:CASCADE", "PlotBeats.PlotBeatId:CASCADE"],
                (await ForeignKeys(db, "IdeaPlotBeatReferences")).Order(StringComparer.Ordinal));

            var ideaIndexes = await Indexes(db, "Ideas");
            Assert.Contains("IX_Ideas_OwnerId_DeletedAt_UpdatedAt:0:0", ideaIndexes);
            Assert.Contains("IX_Ideas_UniverseId_DeletedAt_UpdatedAt:0:0", ideaIndexes);
            Assert.Contains("IX_IdeaEntityReferences_EntityId:0:0", await Indexes(db, "IdeaEntityReferences"));
            Assert.Contains("IX_IdeaPlotBeatReferences_PlotBeatId:0:0", await Indexes(db, "IdeaPlotBeatReferences"));
        }

        SqliteConnection.ClearAllPools();

        Guid assigned;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-ideamigrate", Password)))
                .EnsureSuccessStatusCode();

            assigned = (await CreateIdea(
                client, "After the upgrade", "Kept.", universeId, [Ref(IdeaReferenceKind.Entity, entityId), Ref(IdeaReferenceKind.Story, storyId)])).Id;
            Assert.Equal(2, (await ReadIdea(client, assigned)).References.Count);
        }

        SqliteConnection.ClearAllPools();

        // The schema's own guarantee, without the API's release step: the universe row goes, the idea stays unassigned with its
        // words, and its references go with the content they pointed at.
        await using (var db = Context())
        {
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"Universes\" WHERE \"Id\" = {0}", Key(universeId));

            var idea = await db.Ideas.AsNoTracking().SingleAsync(candidate => candidate.Id == assigned);
            Assert.Null(idea.UniverseId);
            Assert.Equal(("After the upgrade", "Kept."), (idea.Title, idea.Body));
            Assert.Equal(0, await db.IdeaEntityReferences.CountAsync());
            Assert.Equal(0, await db.IdeaStoryReferences.CountAsync());
            Assert.Empty(await ForeignKeyViolations(db));
        }
    }

    // ---------- Reading the file ----------

    private const string LoreRowsSql = """
        SELECT 'entity|' || "Name" || '|' || "Id" AS Value FROM "Entities"
        UNION ALL SELECT 'story|' || "Title" || '|' || "Id" AS Value FROM "Stories"
        UNION ALL SELECT 'scene|' || "Title" || '|' || "Id" AS Value FROM "Scenes"
        ORDER BY Value
        """;

    private static async Task<List<string>> LoreRows(LorEvolveDbContext db) =>
        await db.Database.SqlQueryRaw<string>(LoreRowsSql).ToListAsync();

    /// <summary>A Guid as the schema stores it.</summary>
    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Tables(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'table'")
            .ToListAsync();

    private static async Task<List<string>> Indexes(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name || ':' || \"unique\" || ':' || partial AS Value FROM pragma_index_list({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeys(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check")
            .ToListAsync();

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
