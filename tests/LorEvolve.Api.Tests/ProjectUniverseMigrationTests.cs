using LorEvolve.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Making a project's universe required (#171), walked over a real SQLite file.
///
/// The interesting case is the one #171 names: a project left behind with no universe by the design this corrects.
/// EF's own generated migration would have given such a row <c>00000000-0000-0000-0000-000000000000</c>, a universe id
/// no universe has, silently. The migration is hand-written to refuse instead, and this proves it refuses rather than
/// trusting the comment that says so.
/// </summary>
public sealed class ProjectUniverseMigrationTests : IDisposable
{
    /// <summary>The migration immediately before this one: projects exist, their universe is still optional.</summary>
    private const string Before = "20261114112312_AddCreativeProjects";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(),
        "lorevolve-project-universe-migration",
        Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task A_database_with_no_orphan_projects_migrates_and_the_column_becomes_required()
    {
        Directory.CreateDirectory(_directory);

        await using (var host = new FileHost(DataSource))
        {
            host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        }

        SqliteConnection.ClearAllPools();

        await using var db = Context();

        // Back to where a project's universe was still optional, then forward again.
        await db.GetService<IMigrator>().MigrateAsync(Before);
        Assert.Equal("1", await Scalar(db, Nullable()));

        await db.GetService<IMigrator>().MigrateAsync();

        Assert.Equal("0", await Scalar(db, Nullable()));
        Assert.False(db.Database.HasPendingModelChanges());

        // Both indexes survived the rebuild, and the foreign key is the cascading one.
        Assert.Equal(
            ["IX_CreativeProjects_OwnerId_UpdatedAt", "IX_CreativeProjects_UniverseId_UpdatedAt"],
            await Strings(
                db,
                """
                SELECT name AS Value FROM sqlite_master
                WHERE type = 'index' AND tbl_name = 'CreativeProjects' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                """));
        Assert.Equal(
            ["AspNetUsers CASCADE", "Universes CASCADE"],
            await Strings(
                db,
                """
                SELECT "table" || ' ' || on_delete AS Value
                FROM pragma_foreign_key_list('CreativeProjects') ORDER BY "table"
                """));
    }

    /// <summary>
    /// A project with no universe stops the migration, and nothing is written: #171 says not to invent a universe and
    /// not to delete the row, but to stop and let the owner decide which it is.
    /// </summary>
    [Fact]
    public async Task A_project_with_no_universe_stops_the_migration_and_is_left_exactly_as_it_was()
    {
        Directory.CreateDirectory(_directory);

        await using (var host = new FileHost(DataSource))
        {
            host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        }

        SqliteConnection.ClearAllPools();

        await using var db = Context();
        await db.GetService<IMigrator>().MigrateAsync(Before);

        // A row of the kind the old design allowed: an account's project belonging to no universe.
        var orphan = Guid.NewGuid();
        var ownerId = await Scalar(db, """SELECT "Id" AS Value FROM "AspNetUsers" LIMIT 1""")
            ?? await InsertAccountAsync(db);

        await db.Database.ExecuteSqlRawAsync(
            """
            INSERT INTO "CreativeProjects"
                ("Id", "OwnerId", "UniverseId", "Kind", "Subtype", "Lifecycle", "Name", "Summary", "CreatedAt", "UpdatedAt", "Version")
            VALUES ({0}, {1}, NULL, 0, NULL, 0, 'Left behind', '', '2026-11-14T00:00:00', '2026-11-14T00:00:00', 1)
            """,
            orphan.ToString(),
            ownerId);

        var thrown = await Assert.ThrowsAnyAsync<SqliteException>(
            () => db.GetService<IMigrator>().MigrateAsync());

        // The constraint's name is the message: whoever reads the failure is told what to do about it, because SQLite
        // puts the failed constraint's name in the error.
        Assert.Contains(
            "EveryProjectMustBelongToAUniverse_GiveTheseRowsOneFirst",
            thrown.ToString(),
            StringComparison.Ordinal);

        // Nothing was altered and nothing was deleted: the column is still optional and the row is still there, with
        // its universe still empty rather than filled in with an id no universe has.
        Assert.Equal("1", await Scalar(db, Nullable()));
        Assert.Equal(
            "Left behind",
            await Scalar(db, $"""SELECT "Name" AS Value FROM "CreativeProjects" WHERE "Id" = '{orphan}'"""));
        Assert.Equal(
            "1",
            await Scalar(db, """SELECT COUNT(*) || '' AS Value FROM "CreativeProjects" WHERE "UniverseId" IS NULL"""));
        Assert.Equal(
            "0",
            await Scalar(
                db,
                """
                SELECT COUNT(*) || '' AS Value FROM "CreativeProjects"
                WHERE "UniverseId" = '00000000-0000-0000-0000-000000000000'
                """));
    }

    // ---------- Helpers ----------

    /// <summary>Whether `CreativeProjects.UniverseId` still accepts a null, as `1` or `0`.</summary>
    private static string Nullable() =>
        """
        SELECT CASE WHEN "notnull" = 1 THEN '0' ELSE '1' END AS Value
        FROM pragma_table_info('CreativeProjects') WHERE name = 'UniverseId'
        """;

    private static async Task<string?> Scalar(LorEvolveDbContext db, string sql) =>
        (await db.Database.SqlQueryRaw<string?>(sql).ToListAsync()).FirstOrDefault();

    private static async Task<List<string>> Strings(LorEvolveDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    /// <summary>An account to own the orphan, for a database where startup created none.</summary>
    private static async Task<string> InsertAccountAsync(LorEvolveDbContext db)
    {
        var id = Guid.NewGuid().ToString();
        await db.Database.ExecuteSqlRawAsync(
            """
            INSERT INTO "AspNetUsers"
                ("Id", "UserName", "NormalizedUserName", "Email", "NormalizedEmail", "EmailConfirmed",
                 "PasswordHash", "SecurityStamp", "ConcurrencyStamp", "PhoneNumberConfirmed", "TwoFactorEnabled",
                 "LockoutEnabled", "AccessFailedCount", "CreatedAt", "PlatformRole", "StorageQuotaBytes")
            VALUES ({0}, 'orphanowner', 'ORPHANOWNER', 'orphan@example.test', 'ORPHAN@EXAMPLE.TEST', 1,
                    'x', 'x', 'x', 0, 0, 0, 0, '2026-11-14T00:00:00', 0, 0)
            """,
            id);
        return id;
    }

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    /// <summary>The real host on the file, outside Development, so startup migrates it the way a deployment does.</summary>
    private sealed class FileHost(string dataSource) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
            builder.UseSetting("Media:Provider", "InMemory");
        }
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
