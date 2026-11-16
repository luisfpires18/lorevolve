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
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The migration that deletes ideas and idea boards with no universe (#230), over a real SQLite file: rolled back to the
/// migration before it, one idea and one board are taken out of their universe by hand (the API no longer allows it), then
/// the upgrade removes exactly those, with the board's cards and the idea's search row, and keeps everything in a universe.
/// </summary>
public sealed class IdeaWithoutUniverseMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration before the one under test.</summary>
    private const string BeforeDelete = "20261116004315_AddEntityFieldImages";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-idea-without-universe-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task An_idea_and_a_board_with_no_universe_are_deleted_with_their_cards_and_search_row_and_the_rest_stays()
    {
        Directory.CreateDirectory(_directory);

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-ideasnouniverse", "user-ideasnouniverse@example.test", Password)))
                .EnsureSuccessStatusCode();

            var universeId = (await CreateUniverse(client, "World ideasnouniverse")).Id;
            await IdeaTestClient.CreateIdea(client, "Kept idea", "Stays.", universeId);
            await IdeaTestClient.CreateIdea(client, "Loose idea", "Goes.", universeId);
            await CreateBoard(client, "Kept board", universeId);
            await CreateBoard(client, "Loose board", universeId);
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(BeforeDelete);

            await db.Database.ExecuteSqlRawAsync("UPDATE Ideas SET UniverseId = NULL WHERE Title = 'Loose idea'");
            await db.Database.ExecuteSqlRawAsync("UPDATE IdeaBoards SET UniverseId = NULL WHERE Title = 'Loose board'");
            Assert.Equal(2, await Count(db, "SELECT COUNT(*) AS Value FROM IdeaBoardCards"));
            Assert.Equal(2, await Count(db, "SELECT COUNT(*) AS Value FROM IdeaSearchIndex"));

            await db.GetService<IMigrator>().MigrateAsync();

            Assert.Equal(["Kept idea"], await Strings(db, "SELECT Title AS Value FROM Ideas"));
            Assert.Equal(["Kept board"], await Strings(db, "SELECT Title AS Value FROM IdeaBoards"));
            Assert.Equal(1, await Count(db, "SELECT COUNT(*) AS Value FROM IdeaBoardCards"));
            Assert.Equal(1, await Count(db, "SELECT COUNT(*) AS Value FROM IdeaSearchIndex"));
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));
            Assert.False(db.Database.HasPendingModelChanges());
        }
    }

    private static async Task CreateBoard(HttpClient client, string title, Guid universeId)
    {
        var note = new IdeaBoardCardInput(Guid.NewGuid(), IdeaBoardCardKind.Note, 0, 0, 200, 120, title, null, null);
        (await client.PostAsJsonAsync("/api/idea-boards", new IdeaBoardRequest(title, universeId, [note], [], null)))
            .EnsureSuccessStatusCode();
    }

    private static async Task<int> Count(LorEvolveDbContext db, string sql) =>
        int.Parse((await Strings(db, sql))[0]);

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
