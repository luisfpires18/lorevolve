using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.DataProtection;

namespace Lorex.Api.Tests;

/// <summary>
/// The invitations migration walked down and up over a real SQLite file, and the races that only a real file - with
/// its own connections and Microsoft.Data.Sqlite's IMMEDIATE transactions - can show (ADR 0041 amendment). Memberships
/// written before the table existed come through untouched; the table refuses a second invitation for one address,
/// an Owner role and an orphan. Two accepts at once make one membership; two identical invitations at once make one
/// row; nothing answers 500.
/// </summary>
public sealed class UniverseInvitationMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before invitations.</summary>
    private const string Before = "20261002160204_AddUniverseMemberships";

    /// <summary>The migration immediately before the invitation's account binding was dropped (issue #33, H-1).</summary>
    private const string BeforeDroppingTheBinding = "20261025214044_AddMcpUniverseAliases";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-invitation-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Memberships_survive_the_upgrade_and_the_table_guards_itself()
    {
        Directory.CreateDirectory(_directory);
        Guid universeId;
        string memberId;

        await using (var host = new FileHost(DataSource))
        {
            var (owner, _) = await Register(host, "user-invmig-owner", "invmig-owner@example.test");
            (_, memberId) = await Register(host, "user-invmig-member", "invmig-member@example.test");
            universeId = (await PlotTestClient.CreateUniverse(owner, "Invitation migrate")).Id;
            await PlotTestClient.CreateEntity(owner, universeId, "Kept");
        }

        SqliteConnection.ClearAllPools();

        // Down to memberships only, with a membership the way 029 left it.
        string before;
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(Before);
            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name = 'UniverseInvitations'"));
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO UniverseMemberships (UniverseId, UserId, Role, CreatedAt, UpdatedAt) VALUES ({0}, {1}, 2, '2026-10-02 00:00:00', '2026-10-02 00:00:00')",
                Key(universeId), memberId);
            before = string.Join("\n", await Strings(db, "SELECT UniverseId || UserId || Role || CreatedAt AS Value FROM UniverseMemberships"))
                + (await Strings(db, "SELECT COUNT(*) || '' AS Value FROM Entities"))[0];
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();
            Assert.False(db.Database.HasPendingModelChanges());

            var after = string.Join("\n", await Strings(db, "SELECT UniverseId || UserId || Role || CreatedAt AS Value FROM UniverseMemberships"))
                + (await Strings(db, "SELECT COUNT(*) || '' AS Value FROM Entities"))[0];
            Assert.Equal(before, after);
            Assert.Equal(0, await db.UniverseInvitations.CountAsync());
            Assert.Equal(
                ["CreatedAt", "Email", "ExpiresAt", "Id", "NormalizedEmail", "Role", "UniverseId"],
                await Strings(db, "SELECT name AS Value FROM pragma_table_info('UniverseInvitations') ORDER BY name"));
            Assert.Equal(["Universes CASCADE"], await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('UniverseInvitations') ORDER BY \"table\""));

            await Insert(db, Guid.NewGuid(), universeId, "ANA@EXAMPLE.TEST", (int)UniverseRole.Editor);
            await Assert.ThrowsAsync<SqliteException>(() => Insert(db, Guid.NewGuid(), universeId, "ANA@EXAMPLE.TEST", (int)UniverseRole.Viewer));
            await Assert.ThrowsAsync<SqliteException>(() => Insert(db, Guid.NewGuid(), universeId, "BEN@EXAMPLE.TEST", (int)UniverseRole.Owner));
            await Assert.ThrowsAsync<SqliteException>(() => Insert(db, Guid.NewGuid(), universeId, "BEN@EXAMPLE.TEST", 4));
            await Assert.ThrowsAsync<SqliteException>(() => Insert(db, Guid.NewGuid(), Guid.NewGuid(), "BEN@EXAMPLE.TEST", (int)UniverseRole.Viewer));

            await db.Database.ExecuteSqlRawAsync("DELETE FROM Universes WHERE Id = {0}", Key(universeId));
            Assert.Equal(0, await db.UniverseInvitations.CountAsync());
            Assert.Equal(0, await db.UniverseMemberships.CountAsync());
        }
    }

    [Fact]
    public async Task Racing_accepts_and_racing_invitations_each_land_once_and_never_fail()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new FileHost(DataSource);
        var (owner, _) = await Register(host, "user-invrace-owner", "invrace-owner@example.test");
        var universeId = (await PlotTestClient.CreateUniverse(owner, "Invitation race")).Id;

        // The same invitation created twice at once: one row, and the other answer names it.
        var invites = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => owner.PostAsJsonAsync(
            $"/api/universes/{universeId}/invitations", new InvitationRequest("invrace-ana@example.test", UniverseRole.Editor))));
        Assert.Equal(1, invites.Count(response => response.StatusCode == HttpStatusCode.Created));
        Assert.All(invites, response => Assert.Contains(response.StatusCode, new[] { HttpStatusCode.Created, HttpStatusCode.Conflict }));
        var invitation = (await invites.Single(response => response.StatusCode == HttpStatusCode.Created)
            .Content.ReadFromJsonAsync<PendingInvitationResponse>())!;

        // The invitee accepts its link from two tabs at once: one membership, one success, the other told it is spent.
        var (ana, anaId) = await Register(host, "user-invrace-ana", "invrace-ana@example.test");
        var second = host.CreateHttpsClient();
        (await second.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-invrace-ana", Password))).EnsureSuccessStatusCode();

        var accepts = await Task.WhenAll(
            ana.PostAsync($"{CollaboratorInvitationTests.Claim(invitation.ClaimToken)}/accept", null),
            second.PostAsync($"{CollaboratorInvitationTests.Claim(invitation.ClaimToken)}/accept", null),
            ana.PostAsync($"{CollaboratorInvitationTests.Claim(invitation.ClaimToken)}/accept", null));
        Assert.Equal(1, accepts.Count(response => response.StatusCode == HttpStatusCode.OK));
        Assert.All(accepts, response => Assert.Contains(response.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.NotFound }));

        // A revoke racing an accept: one of them wins, cleanly.
        var late = (await (await owner.PostAsJsonAsync($"/api/universes/{universeId}/invitations", new InvitationRequest("invrace-ben@example.test", UniverseRole.Viewer)))
            .Content.ReadFromJsonAsync<PendingInvitationResponse>())!;
        var (ben, benId) = await Register(host, "user-invrace-ben", "invrace-ben@example.test");
        var raced = await Task.WhenAll(
            ben.PostAsync($"{CollaboratorInvitationTests.Claim(late.ClaimToken)}/accept", null),
            owner.DeleteAsync($"/api/universes/{universeId}/invitations/{late.Id}"));
        Assert.All(raced, response => Assert.True((int)response.StatusCode < 500, $"{(int)response.StatusCode}"));

        SqliteConnection.ClearAllPools();
        await using var db = Context();
        Assert.Equal(1, await db.UniverseMemberships.CountAsync(row => row.UniverseId == universeId && row.UserId == anaId));
        Assert.Equal(0, await db.UniverseInvitations.CountAsync());
        Assert.True(await db.UniverseMemberships.CountAsync(row => row.UserId == benId) <= 1);
    }

    [Fact]
    public async Task Dropping_the_binding_keeps_pending_invitations_and_only_the_link_claims_them()
    {
        Directory.CreateDirectory(_directory);
        Guid universeId;
        string anaId;
        string boundId;

        await using (var host = new FileHost(DataSource))
        {
            var (owner, _) = await Register(host, "user-invdrop-owner", "invdrop-owner@example.test");
            (_, anaId) = await Register(host, "user-invdrop-ana", "invdrop-ana@example.test");
            (_, boundId) = await Register(host, "user-invdrop-bound", "invdrop-bound@example.test");
            universeId = (await PlotTestClient.CreateUniverse(owner, "Invitation drop")).Id;
        }

        SqliteConnection.ClearAllPools();

        // Down to the binding, with an invitation to Ana's address bound - by email alone, as it was - to another account.
        var invitationId = Guid.NewGuid();
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(BeforeDroppingTheBinding);
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO UniverseInvitations (Id, UniverseId, Email, NormalizedEmail, TargetUserId, Role, CreatedAt, ExpiresAt) VALUES ({0}, {1}, 'invdrop-ana@example.test', 'INVDROP-ANA@EXAMPLE.TEST', {2}, 1, '2026-10-20 00:00:00', '2099-01-01 00:00:00')",
                Key(invitationId), Key(universeId), boundId);
        }

        SqliteConnection.ClearAllPools();

        // Up again on start, as a deployment does: the invitation survives, the binding does not.
        await using var upgraded = new FileHost(DataSource);
        var bound = await LogIn(upgraded, "user-invdrop-bound");
        var ana = await LogIn(upgraded, "user-invdrop-ana");

        await using (var db = Context())
        {
            Assert.DoesNotContain("TargetUserId", await Strings(db, "SELECT name AS Value FROM pragma_table_info('UniverseInvitations')"));
            Assert.Equal(UniverseRole.Viewer, (await db.UniverseInvitations.SingleAsync(row => row.Id == invitationId)).Role);
        }

        var link = CollaboratorInvitationTests.Claim(
            InvitationClaims.Issue(upgraded.Services.GetRequiredService<IDataProtectionProvider>(), invitationId, "INVDROP-ANA@EXAMPLE.TEST"));
        Assert.Equal(HttpStatusCode.Forbidden, (await bound.PostAsync($"{link}/accept", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ana.PostAsync($"{link}/accept", null)).StatusCode);

        SqliteConnection.ClearAllPools();
        await using (var db = Context())
        {
            Assert.Equal(UniverseRole.Viewer, (await db.UniverseMemberships.SingleAsync(row => row.UniverseId == universeId && row.UserId == anaId)).Role);
            Assert.False(await db.UniverseMemberships.AnyAsync(row => row.UniverseId == universeId && row.UserId == boundId));
        }
    }

    private static async Task<HttpClient> LogIn(FileHost host, string username)
    {
        var client = host.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(username, Password))).EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<(HttpClient Client, string UserId)> Register(FileHost host, string username, string email)
    {
        var client = host.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(username, email, Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    private static Task<int> Insert(LorexDbContext db, Guid id, Guid universeId, string normalized, int role) =>
        db.Database.ExecuteSqlRawAsync(
            "INSERT INTO UniverseInvitations (Id, UniverseId, Email, NormalizedEmail, Role, CreatedAt, ExpiresAt) VALUES ({0}, {1}, {2}, {2}, {3}, '2026-10-02 00:00:00', '2026-11-01 00:00:00')",
            Key(id), Key(universeId), normalized, role);

    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

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
