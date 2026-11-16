using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The project ideas migration (#197), down and back up over a real SQLite file with ideas already in it.
///
/// <para>Ideas carries FTS5 search triggers, and EF would add the foreign key by rebuilding the table, which drops them
/// without saying so. The migration adds the column with SQLite's own ALTER instead, so what has to hold is: every
/// existing idea is byte for byte what it was, with no project; the triggers are the same set before, after the
/// rollback and after the upgrade; and the delete action SQLite reports is SET NULL.</para>
/// </summary>
public sealed class IdeaProjectMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration before this one: rolling back to it is rolling back exactly the project link.</summary>
    private const string BeforeIdeaProjects = "20261115170315_AddSemanticFindings";
    private const string AfterIdeaProjects = "20261115194350_AddIdeaProjects";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-idea-projects-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task The_project_link_comes_and_goes_without_touching_an_existing_idea_or_its_search_triggers()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-ipmigrate", "user-ipmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World ipmigrate")).Id;
            await IdeaTestClient.CreateIdea(client, "A floating city", "Maybe it floats.", universeId);
            await IdeaTestClient.CreateIdea(client, "Nowhere yet", "Belongs to no universe.");
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            // Rolled back first, so the "before" rows are read from the schema as it was before this change.
            await db.GetService<IMigrator>().MigrateAsync(BeforeIdeaProjects);

            Assert.DoesNotContain("ProjectId", await Columns(db));
            var ideasBefore = await Ideas(db);
            var triggersBefore = await Triggers(db);
            Assert.Equal(2, ideasBefore.Count);
            Assert.Contains("IdeaSearchIndex_IdeaInserted", triggersBefore);
            Assert.Contains("IdeaSearchIndex_IdeaUpdated", triggersBefore);
            Assert.Contains("IdeaSearchIndex_IdeaDeleted", triggersBefore);

            await db.GetService<IMigrator>().MigrateAsync(AfterIdeaProjects);

            Assert.Contains("ProjectId", await Columns(db));

            // Every existing idea is unchanged and on no project.
            Assert.Equal(ideasBefore, await Ideas(db));
            Assert.Equal(2, await db.Ideas.CountAsync(idea => idea.ProjectId == null));
            Assert.Equal(triggersBefore, await Triggers(db));
            Assert.Contains(
                "CreativeProjects.ProjectId:SET NULL",
                await Strings(db, "SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list('Ideas')"));
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));

            // And down again leaves the ideas and the triggers exactly as they were.
            await db.GetService<IMigrator>().MigrateAsync(BeforeIdeaProjects);
            Assert.DoesNotContain("ProjectId", await Columns(db));
            Assert.Equal(ideasBefore, await Ideas(db));
            Assert.Equal(triggersBefore, await Triggers(db));

            await db.GetService<IMigrator>().MigrateAsync();
            Assert.False(db.Database.HasPendingModelChanges());
        }

        SqliteConnection.ClearAllPools();

        // The upgraded database serves the feature through the real host, search included.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-ipmigrate", Password)))
                .EnsureSuccessStatusCode();

            Assert.Equal(["A floating city"], await IdeaTestClient.ListedTitles(client, $"?universeId={universeId}"));
            // The idea with no universe went with the migration that deletes them (#230).
            Assert.Empty(await IdeaTestClient.ListedTitles(client, "?unassigned=true"));
        }
    }

    private static Task<List<string>> Columns(LorEvolveDbContext db) =>
        Strings(db, "SELECT name AS Value FROM pragma_table_info('Ideas')");

    private static Task<List<string>> Triggers(LorEvolveDbContext db) =>
        Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");

    /// <summary>Every column an idea had before this change, as one string per idea.</summary>
    private static Task<List<string>> Ideas(LorEvolveDbContext db) =>
        Strings(db, """
            SELECT "Id" || '|' || "OwnerId" || '|' || coalesce("UniverseId", '-') || '|' || "Title" || '|' || "Body"
                || '|' || "CreatedAt" || '|' || "UpdatedAt" || '|' || coalesce("DeletedAt", '-') AS Value
            FROM "Ideas" ORDER BY "Id"
            """);

    private static async Task<List<string>> Strings(LorEvolveDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

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
            // A pooled handle can outlive the test on Windows; the temporary directory is cleaned up by the OS.
        }
    }
}
