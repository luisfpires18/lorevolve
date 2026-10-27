using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Ideas;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static Lorex.Api.Tests.IdeaTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// The idea boards migration (ADR 0066), down and back up over a real SQLite file. It only adds: down removes the three
/// board tables and nothing else; up creates them with the delete actions and the payload check the model declares, read
/// back from SQLite; and a universe row deleted outside the API leaves its board, unassigned, without its entry cards.
/// </summary>
public sealed class IdeaBoardMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    private const string BeforeBoards = "20261026120312_DropInvitationTargetUser";

    private static readonly string[] BoardTables = ["IdeaBoards", "IdeaBoardCards", "IdeaBoardConnections"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-boards-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task The_board_tables_come_and_go_alone_and_the_schema_holds_their_lines()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid entityId;
        Guid boardId;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-boardmigrate", "user-boardmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World boardmigrate")).Id;
            entityId = await CreateEntity(client, universeId, "Arlen");
            var idea = await CreateIdea(client, "Loose", "Words.");
            boardId = await CreateBoard(client, universeId, entityId, idea.Id);
        }

        SqliteConnection.ClearAllPools();

        List<string> kept;

        await using (var db = Context())
        {
            kept = await Rows(db);

            await db.GetService<IMigrator>().MigrateAsync(BeforeBoards);

            var tables = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'table'");
            Assert.All(BoardTables, table => Assert.DoesNotContain(table, tables));
            Assert.Equal(kept, await Rows(db));
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));

            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(0, await db.IdeaBoards.CountAsync());
            Assert.Equal(
                ["AspNetUsers.OwnerId:CASCADE", "Universes.UniverseId:SET NULL"],
                (await ForeignKeys(db, "IdeaBoards")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["Entities.EntityId:CASCADE", "IdeaBoards.BoardId:CASCADE", "Ideas.IdeaId:CASCADE"],
                (await ForeignKeys(db, "IdeaBoardCards")).Order(StringComparer.Ordinal));
            Assert.Equal(
                ["IdeaBoardCards.BoardId:CASCADE", "IdeaBoardCards.BoardId:CASCADE", "IdeaBoardCards.FromCardId:CASCADE", "IdeaBoardCards.ToCardId:CASCADE"],
                (await ForeignKeys(db, "IdeaBoardConnections")).Order(StringComparer.Ordinal));
        }

        SqliteConnection.ClearAllPools();

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-boardmigrate", Password)))
                .EnsureSuccessStatusCode();

            var idea = await CreateIdea(client, "After the upgrade");
            boardId = await CreateBoard(client, universeId, entityId, idea.Id);
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            // The payload check, whatever path writes the row: a note holding an idea is refused by SQLite itself.
            var anyIdea = (await db.Ideas.FirstAsync()).Id;
            await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                "INSERT INTO \"IdeaBoardCards\" (\"BoardId\", \"Id\", \"Kind\", \"X\", \"Y\", \"Width\", \"Height\", \"Z\", \"Text\", \"IdeaId\", \"EntityId\") "
                + "VALUES ({0}, {1}, 0, 0, 0, 100, 100, 9, 'x', {2}, NULL)",
                Key(boardId), Key(Guid.NewGuid()), Key(anyIdea)));

            // Without the API's release step: the board stays unassigned, the entry card and its line go with the entry.
            await db.Database.ExecuteSqlRawAsync("DELETE FROM \"Universes\" WHERE \"Id\" = {0}", Key(universeId));

            var board = await db.IdeaBoards.AsNoTracking().SingleAsync(candidate => candidate.Id == boardId);
            Assert.Null(board.UniverseId);
            Assert.Equal(
                [IdeaBoardCardKind.Note, IdeaBoardCardKind.Idea],
                await db.IdeaBoardCards.Where(card => card.BoardId == boardId).OrderBy(card => card.Z).Select(card => card.Kind).ToListAsync());
            Assert.Equal(1, await db.IdeaBoardConnections.CountAsync(connection => connection.BoardId == boardId));
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));
        }
    }

    /// <summary>A note, an idea and an entry, the note joined to the other two.</summary>
    private static async Task<Guid> CreateBoard(HttpClient client, Guid universeId, Guid entityId, Guid ideaId)
    {
        var note = new IdeaBoardCardInput(Guid.NewGuid(), IdeaBoardCardKind.Note, 0, 0, 200, 120, "Note", null, null);
        var idea = new IdeaBoardCardInput(Guid.NewGuid(), IdeaBoardCardKind.Idea, 300, 0, 200, 120, null, ideaId, null);
        var entry = new IdeaBoardCardInput(Guid.NewGuid(), IdeaBoardCardKind.Entity, 600, 0, 200, 120, null, null, entityId);
        var board = await PostJson<IdeaBoardDetail>(client, "/api/idea-boards", new IdeaBoardRequest(
            "Board",
            universeId,
            [note, idea, entry],
            [new(Guid.NewGuid(), note.Id, idea.Id, null), new(Guid.NewGuid(), note.Id, entry.Id, "about")],
            null));
        return board.Id;
    }

    private static async Task<List<string>> Rows(LorexDbContext db) =>
        await Strings(db, """
            SELECT 'entity|' || "Name" || '|' || "Id" AS Value FROM "Entities"
            UNION ALL SELECT 'idea|' || "Title" || '|' || "Id" AS Value FROM "Ideas"
            UNION ALL SELECT 'universe|' || "Name" || '|' || "Id" AS Value FROM "Universes"
            ORDER BY Value
            """);

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    private static async Task<List<string>> ForeignKeys(LorexDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list({table})")
            .ToListAsync();

    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

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
            // A handle Windows has not let go of yet; the directory is under the temp root and named for this run.
        }
    }
}
