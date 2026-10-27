using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Admin;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.McpTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The Admin workspace (#40): only an Admin reaches <c>/api/admin</c>, and the server decides it on every request; the role
/// is granted by the configured id alone; block ends sessions and AI connections at once, refuses sign-in, is audited and
/// cannot lock an Admin out; and the dashboard counts what is there. Each test has a host of its own, so counts are exact.
/// Credentials are synthetic.
/// </summary>
public sealed class AdminWorkspaceTests : IDisposable
{
    private readonly LorEvolveApiFactory _api = new();

    public void Dispose() => _api.Dispose();

    private static readonly AdminActionRequest Because = new("Spam reported by two members.");

    private async Task<(HttpClient Client, string Id)> Account(string tag)
    {
        var (client, id) = await NewBrowser(_api, tag);
        return (client, id);
    }

    private async Task<(HttpClient Client, string Id)> Admin(string tag = "owner")
    {
        var account = await Account(tag);
        Assert.Equal(PlatformAdminProvisioning.ProvisionResult.Granted, await Provision(account.Id));
        return account;
    }

    /// <summary>What a start with <c>PlatformAdmin:OwnerUserId</c> set to <paramref name="id"/> does.</summary>
    private async Task<PlatformAdminProvisioning.ProvisionResult> Provision(string id)
    {
        using var scope = _api.Services.CreateScope();
        return (await PlatformAdminProvisioning.ProvisionAsync(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>(), id, CancellationToken.None)).Result;
    }

    private Task<List<string>> AdminIds() =>
        InDb(db => db.Users.Where(user => user.PlatformRole == PlatformRole.Admin).Select(user => user.Id).ToListAsync());

    /// <summary>Every admin route and both actions, from <paramref name="client"/>, answer <paramref name="status"/>.</summary>
    private static async Task AssertEveryAdminRoute(HttpClient client, string targetId, HttpStatusCode status)
    {
        foreach (var route in Routes(targetId))
        {
            Assert.Equal(status, (await client.GetAsync(route)).StatusCode);
        }

        Assert.Equal(status, (await Block(client, targetId)).StatusCode);
        Assert.Equal(status, (await Unblock(client, targetId)).StatusCode);
    }

    private async Task<T> InDb<T>(Func<LorEvolveDbContext, Task<T>> work)
    {
        using var scope = _api.Services.CreateScope();
        return await work(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>());
    }

    private static Task<HttpResponseMessage> Block(HttpClient client, string userId, AdminActionRequest? request = null) =>
        client.PostAsJsonAsync($"/api/admin/users/{userId}/block", request ?? Because);

    private static Task<HttpResponseMessage> Unblock(HttpClient client, string userId, AdminActionRequest? request = null) =>
        client.PostAsJsonAsync($"/api/admin/users/{userId}/unblock", request ?? new AdminActionRequest("Appeal accepted."));

    private static async Task<string?> Code(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    private static string[] Routes(string userId) =>
        ["/api/admin/overview", "/api/admin/users", $"/api/admin/users/{userId}"];

    [Fact]
    public async Task A_member_and_a_visitor_are_refused_every_admin_route()
    {
        // While the configured owner is Admin, beside them.
        var (owner, _) = await Admin();
        var (member, _) = await Account("member");
        var (_, otherId) = await Account("other");
        using var visitor = _api.CreateClient();

        foreach (var route in Routes(otherId))
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync(route)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.GetAsync(route)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await Block(member, otherId)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Unblock(member, otherId)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Block(visitor, otherId)).StatusCode);

        // Refused before the body is read: a member's malformed request learns nothing more than a well-formed one.
        using var junk = new StringContent("{", System.Text.Encoding.UTF8, "application/json");
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsync($"/api/admin/users/{otherId}/block", junk)).StatusCode);

        Assert.False((await member.GetFromJsonAsync<AuthUserResponse>("/api/auth/me"))!.IsAdmin);
        Assert.True((await owner.GetFromJsonAsync<AuthUserResponse>("/api/auth/me"))!.IsAdmin);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync("/api/admin/overview")).StatusCode);
        Assert.Null(await InDb(db => db.Users.Where(user => user.Id == otherId).Select(user => user.BlockedAt).FirstAsync()));
        Assert.Equal(0, await InDb(db => db.AdminAuditRecords.CountAsync()));
    }

    [Fact]
    public async Task Provisioning_grants_admin_by_immutable_id_only_and_is_safe_to_repeat()
    {
        var (owner, ownerId) = await Account("unreally");

        // A username, an email or a display name is never an id: nothing matches, nothing is granted.
        Assert.Equal(PlatformAdminProvisioning.ProvisionResult.NoSuchAccount, await Provision("user-unreally"));
        Assert.Equal(PlatformAdminProvisioning.ProvisionResult.NoSuchAccount, await Provision("unreally@example.test"));
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync("/api/admin/overview")).StatusCode);

        Assert.Equal(PlatformAdminProvisioning.ProvisionResult.Granted, await Provision(ownerId));
        Assert.Equal(PlatformAdminProvisioning.ProvisionResult.AlreadyAdmin, await Provision(ownerId));

        // The existing session sees it at once: the role is read from the database, not from the cookie.
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync("/api/admin/overview")).StatusCode);
        Assert.True((await owner.GetFromJsonAsync<AuthUserResponse>("/api/auth/me"))!.IsAdmin);
        Assert.Equal([ownerId], await AdminIds());
    }

    [Fact]
    public async Task A_role_taken_away_in_the_database_is_refused_at_the_next_request()
    {
        var (admin, adminId) = await Admin();
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/users")).StatusCode);

        await InDb(db => db.Users.Where(user => user.Id == adminId)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.PlatformRole, PlatformRole.Member)));

        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync("/api/admin/users")).StatusCode);
        Assert.False((await admin.GetFromJsonAsync<AuthUserResponse>("/api/auth/me"))!.IsAdmin);
    }

    [Fact]
    public async Task Blocking_ends_every_session_at_once_and_refuses_sign_in()
    {
        var (admin, _) = await Admin();
        var (member, memberId) = await Account("blocked");
        var second = await SignIn(_api, "user-blocked");
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync("/api/universes")).StatusCode);

        var blocked = await Block(admin, memberId);
        Assert.Equal(HttpStatusCode.OK, blocked.StatusCode);
        var detail = await blocked.Content.ReadFromJsonAsync<AdminUserDetail>();
        Assert.True(detail!.IsBlocked);
        Assert.NotNull(detail.BlockedAt);

        // Both sessions, on their very next request, without waiting for Identity's own revalidation.
        Assert.Equal(HttpStatusCode.Unauthorized, (await member.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/universes")).StatusCode);

        // The right password learns the account is blocked and gets no session; a wrong one learns nothing.
        using var browser = Browser(_api);
        var login = await browser.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-blocked", PublishingTestClient.Password));
        Assert.Equal(HttpStatusCode.Forbidden, login.StatusCode);
        Assert.Equal(AuthEndpoints.BlockedCode, await Code(login));
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/auth/me")).StatusCode);

        var wrong = await browser.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-blocked", "Not-the-password-1"));
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
    }

    [Fact]
    public async Task Unblocking_lets_the_account_sign_in_again_but_revives_no_old_session()
    {
        var (admin, _) = await Admin();
        var (member, memberId) = await Account("returning");
        Assert.Equal(HttpStatusCode.OK, (await Block(admin, memberId)).StatusCode);

        var unblocked = await Unblock(admin, memberId);
        Assert.Equal(HttpStatusCode.OK, unblocked.StatusCode);
        Assert.False((await unblocked.Content.ReadFromJsonAsync<AdminUserDetail>())!.IsBlocked);

        Assert.Equal(HttpStatusCode.Unauthorized, (await member.GetAsync("/api/auth/me")).StatusCode);
        var again = await SignIn(_api, "user-returning");
        Assert.Equal(HttpStatusCode.OK, (await again.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Blocking_revokes_every_ai_connection_at_once()
    {
        var (admin, _) = await Admin();
        var (member, memberId) = await Account("connected");
        var universe = await PlotTestClient.CreateUniverse(member, "Connected world");
        var connection = await Connect(_api, member, universe.Id);
        Assert.Equal(HttpStatusCode.OK, (await Post(_api.CreateClient(), universe.Id, connection.AccessToken, ListTools())).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await Block(admin, memberId)).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(_api.CreateClient(), universe.Id, connection.AccessToken, ListTools())).StatusCode);
        var refreshed = await Refresh(_api.CreateClient(), connection.ClientId, connection.RefreshToken);
        Assert.NotEqual(HttpStatusCode.OK, refreshed.Status);
        Assert.Null(refreshed.AccessToken);
        Assert.Equal(0, await InDb(db => db.McpConnections.CountAsync(row => row.UserId == memberId)));

        // Unblocking does not bring a connection back: the app has to be connected again.
        Assert.Equal(HttpStatusCode.OK, (await Unblock(admin, memberId)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(_api.CreateClient(), universe.Id, connection.AccessToken, ListTools())).StatusCode);
    }

    [Fact]
    public async Task Every_action_writes_an_audit_record_with_actor_target_action_reason_and_time()
    {
        var (admin, adminId) = await Admin();
        var (_, memberId) = await Account("audited");

        Assert.Equal(HttpStatusCode.OK, (await Block(admin, memberId)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Unblock(admin, memberId, new AdminActionRequest("  Appeal accepted.  "))).StatusCode);

        var records = await InDb(db => db.AdminAuditRecords.AsNoTracking().OrderBy(record => record.CreatedAt).ThenBy(record => record.Action).ToListAsync());
        Assert.Collection(
            records,
            block =>
            {
                Assert.Equal((adminId, memberId, AdminAction.Block, Because.Reason), (block.ActorUserId, block.TargetUserId, block.Action, block.Reason));
                Assert.True(DateTime.UtcNow - block.CreatedAt < TimeSpan.FromMinutes(1));
            },
            unblock => Assert.Equal((adminId, memberId, AdminAction.Unblock, "Appeal accepted."), (unblock.ActorUserId, unblock.TargetUserId, unblock.Action, unblock.Reason)));

        var raw = await admin.GetStringAsync($"/api/admin/users/{memberId}");
        var detail = JsonSerializer.Deserialize<AdminUserDetail>(raw, JsonSerializerOptions.Web)!;
        Assert.Equal(["Unblock", "Block"], detail.History.Select(entry => entry.Action));
        Assert.All(detail.History, entry => Assert.Equal("user-owner", entry.ActorUsername));

        // No email, password, stamp or token of the account is in what an Admin reads.
        Assert.DoesNotContain("@example.test", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("stamp", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", raw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Changing_the_configured_id_moves_the_role_and_never_leaves_two_admins()
    {
        var (first, firstId) = await Admin("first-owner");
        var (second, secondId) = await Account("second-owner");
        var (_, memberId) = await Account("bystander");
        Assert.Equal(HttpStatusCode.OK, (await first.GetAsync("/api/admin/overview")).StatusCode);

        // The setting now names another existing account, as a restart with the changed setting does.
        Assert.Equal(PlatformAdminProvisioning.ProvisionResult.Granted, await Provision(secondId));

        Assert.Equal([secondId], await AdminIds());
        Assert.False((await first.GetFromJsonAsync<AuthUserResponse>("/api/auth/me"))!.IsAdmin);
        await AssertEveryAdminRoute(first, memberId, HttpStatusCode.Forbidden);

        Assert.True((await second.GetFromJsonAsync<AuthUserResponse>("/api/auth/me"))!.IsAdmin);
        Assert.Equal(HttpStatusCode.OK, (await second.GetAsync("/api/admin/overview")).StatusCode);

        // And back again: still exactly one.
        Assert.Equal(PlatformAdminProvisioning.ProvisionResult.Granted, await Provision(firstId));
        Assert.Equal([firstId], await AdminIds());
        Assert.Equal(HttpStatusCode.Forbidden, (await second.GetAsync("/api/admin/overview")).StatusCode);

        // An id that names no account leaves no Admin at all, rather than keeping the last one.
        Assert.Equal(PlatformAdminProvisioning.ProvisionResult.NoSuchAccount, await Provision("not-an-account"));
        Assert.Empty(await AdminIds());
        Assert.Equal(HttpStatusCode.Forbidden, (await first.GetAsync("/api/admin/overview")).StatusCode);
    }

    [Fact]
    public async Task The_database_refuses_a_second_admin_whatever_writes_it()
    {
        var (_, ownerId) = await Admin();
        var (other, otherId) = await Account("intruder");

        await Assert.ThrowsAnyAsync<Exception>(() => InDb(db => db.Users.Where(user => user.Id == otherId)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.PlatformRole, PlatformRole.Admin))));

        Assert.Equal([ownerId], await AdminIds());
        Assert.False((await other.GetFromJsonAsync<AuthUserResponse>("/api/auth/me"))!.IsAdmin);
        await AssertEveryAdminRoute(other, ownerId, HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Only_the_configured_owner_can_block_or_unblock()
    {
        var (owner, _) = await Admin();
        var (member, _) = await Account("would-be");
        var (_, targetId) = await Account("target");

        Assert.Equal(HttpStatusCode.Forbidden, (await Block(member, targetId)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Block(owner, targetId)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Unblock(member, targetId)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Unblock(owner, targetId)).StatusCode);

        Assert.Equal(2, await InDb(db => db.AdminAuditRecords.CountAsync()));
        Assert.Equal(0, await InDb(db => db.Users.CountAsync(user => user.BlockedAt != null)));
    }

    [Fact]
    public async Task No_admin_can_be_blocked_so_nobody_locks_out_themselves_or_the_last_admin()
    {
        var (admin, adminId) = await Admin();

        var self = await Block(admin, adminId);
        Assert.Equal(HttpStatusCode.Conflict, self.StatusCode);
        Assert.Equal(AdminEndpoints.AdminTargetCode, await Code(self));

        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/overview")).StatusCode);
        Assert.Equal(0, await InDb(db => db.Users.CountAsync(user => user.BlockedAt != null)));
        Assert.Equal(0, await InDb(db => db.AdminAuditRecords.CountAsync()));
    }

    [Fact]
    public async Task An_action_needs_a_reason_a_real_account_and_the_state_it_changes()
    {
        var (admin, _) = await Admin();
        var (_, memberId) = await Account("guarded");

        Assert.Equal(HttpStatusCode.BadRequest, (await Block(admin, memberId, new AdminActionRequest("   "))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Block(admin, memberId, new AdminActionRequest(new string('x', AdminLimits.ReasonMaxLength + 1)))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Block(admin, "no-such-account")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/admin/users/no-such-account")).StatusCode);

        var notBlocked = await Unblock(admin, memberId);
        Assert.Equal(HttpStatusCode.Conflict, notBlocked.StatusCode);
        Assert.Equal(AdminEndpoints.StateChangedCode, await Code(notBlocked));

        Assert.Equal(HttpStatusCode.OK, (await Block(admin, memberId)).StatusCode);
        Assert.Equal(AdminEndpoints.StateChangedCode, await Code(await Block(admin, memberId)));
        Assert.Equal(1, await InDb(db => db.AdminAuditRecords.CountAsync()));
    }

    [Fact]
    public async Task An_admin_gains_no_access_to_a_member_s_private_universe()
    {
        var (admin, _) = await Admin();
        var (member, memberId) = await Account("private");
        var universe = await PlotTestClient.CreateUniverse(member, "Secret Realm");

        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/universes/{universe.Id}")).StatusCode);
        Assert.Equal(0, (await admin.GetFromJsonAsync<UniversePage>("/api/universes"))!.TotalCount);

        // Counts, never names.
        var raw = await admin.GetStringAsync($"/api/admin/users/{memberId}");
        Assert.DoesNotContain("Secret Realm", raw, StringComparison.Ordinal);
        Assert.Equal(1, JsonSerializer.Deserialize<AdminUserDetail>(raw, JsonSerializerOptions.Web)!.OwnedUniverses);
    }

    [Fact]
    public async Task The_users_grid_searches_and_pages_in_a_stable_order()
    {
        var (admin, _) = await Admin();
        for (var index = 0; index < AdminLimits.PageSize; index++)
        {
            await Account($"reader-{index:D2}");
        }

        var first = await admin.GetFromJsonAsync<AdminUserPage>("/api/admin/users");
        var second = await admin.GetFromJsonAsync<AdminUserPage>("/api/admin/users?page=2");
        Assert.Equal(AdminLimits.PageSize + 1, first!.TotalCount);
        Assert.Equal(2, first.TotalPages);
        Assert.Equal(AdminLimits.PageSize, first.Items.Count);
        Assert.Single(second!.Items);
        Assert.Empty(first.Items.Select(user => user.Id).Intersect(second.Items.Select(user => user.Id)));

        var found = await admin.GetFromJsonAsync<AdminUserPage>("/api/admin/users?search=READER-07");
        Assert.Equal("user-reader-07", Assert.Single(found!.Items).Username);
        Assert.Equal("Member", found.Items[0].Role);

        var none = await admin.GetFromJsonAsync<AdminUserPage>("/api/admin/users?search=%25");
        Assert.Equal(0, none!.TotalCount);
    }

    [Fact]
    public async Task The_overview_counts_what_is_recorded_and_nothing_else()
    {
        var (admin, _) = await Admin();
        var empty = await admin.GetFromJsonAsync<AdminOverview>("/api/admin/overview");
        Assert.Equal((1, 1, 0, 0, 0, 0, 0L, 0), (empty!.Accounts, empty.Admins, empty.BlockedAccounts, empty.Universes, empty.PublicUniverses, empty.Collaborations, empty.StoredImageBytes, empty.ConnectedApps));
        Assert.Equal(AdminLimits.TrendMonths, empty.UniversesCreatedByMonth.Count);
        Assert.All(empty.UniversesCreatedByMonth, month => Assert.Equal(0, month.Count));

        var (member, memberId) = await Account("counted");
        await Account("idle");
        var world = await PlotTestClient.CreateUniverse(member, "One");
        await PlotTestClient.CreateUniverse(member, "Two");
        await Connect(_api, member, world.Id);
        Assert.Equal(1, await InDb(db => db.McpConnections.CountAsync()));
        Assert.Equal(HttpStatusCode.OK, (await Block(admin, memberId)).StatusCode);

        var overview = await admin.GetFromJsonAsync<AdminOverview>("/api/admin/overview");
        Assert.Equal((3, 1, 1, 2, 0, 0, 0L, 0), (overview!.Accounts, overview.Admins, overview.BlockedAccounts, overview.Universes, overview.PublicUniverses, overview.Collaborations, overview.StoredImageBytes, overview.ConnectedApps));

        var now = DateTime.UtcNow;
        var thisMonth = overview.UniversesCreatedByMonth[^1];
        Assert.Equal((now.Year, now.Month, 2), (thisMonth.Year, thisMonth.Month, thisMonth.Count));
        Assert.Equal(0, overview.UniversesCreatedByMonth.Take(AdminLimits.TrendMonths - 1).Sum(month => month.Count));
    }
}
