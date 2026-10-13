using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Comments;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Lorex.Api.Tests;

/// <summary>
/// Review comments (<c>AddCommentThreads</c>, task 043), walked down and back up over a real SQLite file. Two new tables
/// and nothing else touched: rolling back drops them alone, and the database itself holds a thread to exactly one subject
/// and its comments to the thread.
/// </summary>
public sealed class CommentMigrationTests : IDisposable
{
    /// <summary>The migration immediately before comments.</summary>
    private const string Before = "20261013221828_AddRevisionActors";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-comment-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Rolled_back_and_forward_only_the_comment_tables_move_and_they_guard_themselves()
    {
        Directory.CreateDirectory(_directory);

        Guid universe;
        Guid entry;
        Guid story;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-commentmigrate", "user-commentmigrate@example.test", $"m-{Guid.NewGuid():n}")))
                .EnsureSuccessStatusCode();
            universe = (await PlotTestClient.CreateUniverse(client, "Comment migrate")).Id;
            entry = await PlotTestClient.CreateEntity(client, universe, "Kept");
            story = await PlotTestClient.CreateStory(client, universe, "Kept story");
            (await client.PostAsJsonAsync($"/api/universes/{universe}/entities/{entry}/comments", new CommentRequest("Kept note.")))
                .EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            Assert.Contains("IX_CommentThreads_EntityId on CommentThreads", indexes);

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name IN ('CommentThreads', 'Comments')"));
            Assert.Equal(indexes.Where(LaterSchema.BeforeComments), await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM \"Entities\"").SingleAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(indexes, await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(0, await db.CommentThreads.CountAsync());

            // One subject, never none or two.
            await Assert.ThrowsAsync<DbUpdateException>(() => Thread(db, entityId: null, storyId: null));
            await Assert.ThrowsAsync<DbUpdateException>(() => Thread(db, entry, story));
            await Thread(db, entry, storyId: null);

            // A comment needs its thread.
            db.Comments.Add(new Comment { Id = Guid.NewGuid(), ThreadId = Guid.NewGuid(), AuthorUserId = "anyone", Body = "Orphan.", CreatedAt = DateTime.UtcNow });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    private static async Task Thread(LorexDbContext db, Guid? entityId, Guid? storyId)
    {
        db.ChangeTracker.Clear();
        db.CommentThreads.Add(new CommentThread { Id = Guid.NewGuid(), EntityId = entityId, StoryId = storyId, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
    }

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

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
