using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Lorex.Api.Tests;

/// <summary>
/// The membership migration, walked up from the version before it and back down over a real SQLite file (ADR 0041).
/// An owner-only database upgrades with every universe still owned exactly as it was and no content row touched; no
/// owner is copied into a membership. The new table then refuses a second row for the same pair, any role but Viewer,
/// Reviewer and Editor, and an orphan: deleting a universe takes its memberships. Rolling back drops the table alone.
/// </summary>
public sealed class UniverseMembershipMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before memberships.</summary>
    private const string Before = "20261001000029_AddEntityTypeHierarchy";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-membership-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task An_owner_only_database_upgrades_untouched_and_the_table_guards_itself()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        string ownerId;
        string memberId;

        await using (var host = new FileHost(DataSource))
        {
            var owner = host.CreateHttpsClient();
            var registered = await owner.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-membermigrate", "user-membermigrate@example.test", Password));
            registered.EnsureSuccessStatusCode();
            ownerId = (await registered.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id;
            universeId = (await PlotTestClient.CreateUniverse(owner, "Member migrate")).Id;
            await PlotTestClient.CreateEntity(owner, universeId, "Kept");
            var story = await PlotTestClient.CreateStory(owner, universeId, "Kept story");
            await PlotTestClient.CreateScene(owner, universeId, story, "Kept scene");

            var other = host.CreateHttpsClient();
            var second = await other.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-membermigrate2", "user-membermigrate2@example.test", Password));
            second.EnsureSuccessStatusCode();
            memberId = (await second.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id;
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;
        string content;

        // Down to owner-only: the table goes, and nothing else does.
        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name = 'UniverseMemberships'"));
            Assert.Equal(
                indexes.Where(index => !index.EndsWith(" on UniverseMemberships", StringComparison.Ordinal)
                    && !index.EndsWith(" on UniverseInvitations", StringComparison.Ordinal)
                    && LaterSchema.BeforeReferenceTargets(index)),
                await Indexes(db));
            Assert.Equal(triggers.Where(LaterSchema.BeforeTypeGroups), await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            content = await Content(db);
        }

        SqliteConnection.ClearAllPools();

        // Up again: every universe still has its owner, every content row is as it was, and no membership was invented.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(indexes, await Indexes(db));
            Assert.Equal(content, await Content(db));
            Assert.Equal(ownerId, await db.Universes.Where(row => row.Id == universeId).Select(row => row.OwnerId).SingleAsync());
            Assert.Equal(0, await db.UniverseMemberships.CountAsync());
            Assert.Equal(
                ["UniverseId", "UserId", "Role", "CreatedAt", "UpdatedAt"],
                await Strings(db, "SELECT name AS Value FROM pragma_table_info('UniverseMemberships') ORDER BY cid"));
            Assert.Equal(
                ["UniverseId", "UserId"],
                await Strings(db, "SELECT name AS Value FROM pragma_table_info('UniverseMemberships') WHERE pk > 0 ORDER BY pk"));
            Assert.Equal(
                ["AspNetUsers CASCADE", "Universes CASCADE"],
                await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('UniverseMemberships') ORDER BY \"table\""));
            Assert.Contains("IX_UniverseMemberships_UserId on UniverseMemberships", await Indexes(db));
        }

        SqliteConnection.ClearAllPools();

        // The database's own guarantees.
        await using (var db = Context())
        {
            await Insert(db, universeId, memberId, (int)UniverseRole.Editor);
            await Assert.ThrowsAsync<SqliteException>(() => Insert(db, universeId, memberId, (int)UniverseRole.Viewer));
            await Assert.ThrowsAsync<SqliteException>(() => Insert(db, universeId, ownerId, (int)UniverseRole.Owner));
            await Assert.ThrowsAsync<SqliteException>(() => Insert(db, universeId, ownerId, 4));
            await Assert.ThrowsAsync<SqliteException>(() => Insert(db, Guid.NewGuid(), memberId, (int)UniverseRole.Viewer));
            await Assert.ThrowsAsync<SqliteException>(() => Insert(db, universeId, "no-such-user", (int)UniverseRole.Viewer));
            Assert.Equal(1, await db.UniverseMemberships.CountAsync());
        }

        SqliteConnection.ClearAllPools();

        // Through the API: the owner keeps everything, the member reads, and the backup is still version 19.
        await using (var host = new FileHost(DataSource))
        {
            var owner = host.CreateHttpsClient();
            (await owner.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-membermigrate", Password))).EnsureSuccessStatusCode();
            var detail = (await owner.GetFromJsonAsync<UniverseDetail>($"/api/universes/{universeId}"))!;
            Assert.Equal(UniverseRole.Owner, detail.AccessRole);
            Assert.Equal(33, (await PlotTestClient.Backup(owner, universeId)).FormatVersion);
            Assert.Equal(33, UniverseBackup.CurrentVersion);

            var member = host.CreateHttpsClient();
            (await member.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-membermigrate2", Password))).EnsureSuccessStatusCode();
            Assert.Equal(UniverseRole.Editor, (await member.GetFromJsonAsync<UniverseDetail>($"/api/universes/{universeId}"))!.AccessRole);
            Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/universes/{universeId}/export")).StatusCode);
        }

        SqliteConnection.ClearAllPools();

        // Deleting the universe row leaves no membership behind.
        await using (var db = Context())
        {
            await db.Database.ExecuteSqlRawAsync("DELETE FROM Universes WHERE Id = {0}", Key(universeId));
            Assert.Equal(0, await db.UniverseMemberships.CountAsync());
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));
        }
    }

    private static Task<int> Insert(LorexDbContext db, Guid universeId, string userId, int role) =>
        db.Database.ExecuteSqlRawAsync(
            "INSERT INTO UniverseMemberships (UniverseId, UserId, Role, CreatedAt, UpdatedAt) VALUES ({0}, {1}, {2}, '2026-10-02 00:00:00', '2026-10-02 00:00:00')",
            Key(universeId), userId, role);

    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

    /// <summary>Every row of the content tables the fixture wrote to, column for column.</summary>
    private static async Task<string> Content(LorexDbContext db)
    {
        var tables = new[] { "Universes", "EntityTypes", "Entities", "EntityRevisions", "Stories", "Scenes", "AspNetUsers" };
        var rows = new List<string>();
        foreach (var table in tables)
        {
            // A scene's custom month (AddChronologyCalendars, 039), an account's storage allowance (AddAccountStorageQuota,
            // ADR 0042), a version's author (AddRevisionActors, 042), an edit version (AddContentEditVersions, ADR 0043) and a
            // type's field layout version (AddEntityFieldSections, Issue #26) arrive after memberships, so a rollback past them
            // takes them.
            var columns = (await Strings(db, $"SELECT name AS Value FROM pragma_table_info('{table}') ORDER BY cid"))
                .Where(column => column is not "MonthId" and not "StorageQuotaBytes" and not "ActorUserId" and not "Version" and not "FieldLayoutVersion");
            var select = string.Join(" || '|' || ", columns.Select(column => $"COALESCE(CAST(\"{column}\" AS TEXT), '~')"));
            rows.AddRange(await Strings(db, $"SELECT '{table}:' || {select} AS Value FROM \"{table}\" ORDER BY 1"));
        }

        return string.Join("\n", rows);
    }

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    private static Task<List<string>> Indexes(LorexDbContext db) =>
        Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");

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
