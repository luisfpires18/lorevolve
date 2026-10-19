using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Mcp;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OpenIddict.EntityFrameworkCore.Models;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.McpTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Profile -> Connected Apps (ADR 0046): an account sees and revokes only its own connections, a revoke ends that one
/// connection at once and nothing else, and what the list says about each one is true - including after time passes.
/// Each test has a host of its own, because some move its clock.
/// </summary>
public sealed class McpConnectedAppTests : IDisposable
{
    private readonly LorexApiFactory _api = new();

    public void Dispose() => _api.Dispose();

    [Fact]
    public async Task An_account_lists_its_own_connections_and_nobody_else_s()
    {
        var w = await NewSharedWorld(_api, "caown");
        var viewer = await SignIn(_api, "user-caown-viewer");
        var editor = await SignIn(_api, "user-caown-editor");
        var second = (await CreateUniverse(w.Owner, "Second shelf")).Id;
        await Join(_api, second, w.ViewerId, Lorex.Api.Features.Universes.UniverseRole.Viewer);

        var first = await Connect(_api, viewer, w.U);
        await Connect(_api, viewer, second);
        await Connect(_api, editor, w.U);

        var listed = await viewer.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps");
        Assert.Equal(2, listed!.Count);
        Assert.All(listed, app =>
        {
            Assert.Equal("Test MCP client", app.ClientName);
            Assert.Null(app.VerifiedHost);
            Assert.Equal(ConnectedAppStatus.Active, app.Status);
        });
        Assert.Equal([second, w.U], listed.Select(app => app.UniverseId));
        Assert.Equal(["Second shelf", "Shared caown"], listed.Select(app => app.UniverseName).Order(StringComparer.Ordinal));

        // Not a credential in sight.
        var raw = await viewer.GetStringAsync("/api/profile/connected-apps");
        Assert.DoesNotContain(first.AccessToken, raw, StringComparison.Ordinal);
        Assert.DoesNotContain(first.RefreshToken, raw, StringComparison.Ordinal);
        Assert.DoesNotContain(first.ClientId, raw, StringComparison.Ordinal);

        Assert.Single((await editor.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _api.CreateClient().GetAsync("/api/profile/connected-apps")).StatusCode);
    }

    [Fact]
    public async Task Revoking_ends_that_connection_at_once_and_nothing_else()
    {
        var w = await NewSharedWorld(_api, "carevoke");
        var viewer = await SignIn(_api, "user-carevoke-viewer");
        var kept = await Connect(_api, viewer, w.U);
        var revoked = await Connect(_api, viewer, w.U);
        var connections = (await viewer.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!;
        var target = connections.Single(app => app.CreatedAt == connections.Max(other => other.CreatedAt)).Id;

        // Another account cannot revoke it - and cannot tell it exists.
        var outsider = await SignIn(_api, "user-carevoke-editor");
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.DeleteAsync($"/api/profile/connected-apps/{target}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.DeleteAsync($"/api/profile/connected-apps/{Guid.NewGuid()}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await viewer.DeleteAsync($"/api/profile/connected-apps/{target}")).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(_api.CreateClient(), w.U, revoked.AccessToken, ListTools())).StatusCode);
        Assert.Equal("invalid_grant", (await Refresh(_api.CreateClient(), revoked.ClientId, revoked.RefreshToken)).Error);

        // The other connection, and the LoreX session, carry on.
        Assert.Equal(HttpStatusCode.OK, (await Post(_api.CreateClient(), w.U, kept.AccessToken, ListTools())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Refresh(_api.CreateClient(), kept.ClientId, kept.RefreshToken)).Status);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync("/api/auth/me")).StatusCode);
        Assert.Single((await viewer.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!);
    }

    [Fact]
    public async Task The_list_says_when_access_was_lost_and_when_a_connection_lapsed()
    {
        var w = await NewSharedWorld(_api, "castatus");
        var reviewer = await SignIn(_api, "user-castatus-reviewer");
        var owner = await SignIn(_api, "user-castatus-owner");
        await Connect(_api, reviewer, w.U);
        var ownerConnection = await Connect(_api, owner, w.U);

        (await w.Owner.DeleteAsync($"/api/universes/{w.U}/collaborators/{w.ReviewerId}")).EnsureSuccessStatusCode();
        Assert.Equal(ConnectedAppStatus.NoAccess, Assert.Single((await reviewer.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!).Status);

        // Unused past the refresh token's life: nothing refreshes, and the list says it needs connecting again.
        _api.Clock.Offset = McpLimits.RefreshTokenLifetime + TimeSpan.FromHours(1);
        Assert.Equal("invalid_grant", (await Refresh(_api.CreateClient(), ownerConnection.ClientId, ownerConnection.RefreshToken)).Error);
        var lapsed = Assert.Single((await (await SignIn(_api, "user-castatus-owner")).GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!);
        Assert.Equal(ConnectedAppStatus.Expired, lapsed.Status);
    }

    [Fact]
    public async Task A_connection_whose_code_was_never_exchanged_is_starting_then_lapsed()
    {
        var w = await NewSharedWorld(_api, "castart");
        var owner = await SignIn(_api, "user-castart-owner");
        var client = await RegisterPublicClient(_api.CreateClient());
        var (_, challenge) = Pkce();
        Assert.True(RedirectParameters(await Decide(owner, AuthorizeRequest(client, Resource(w.U), challenge), "approve")).ContainsKey("code"));

        Assert.Equal(ConnectedAppStatus.Active, Assert.Single((await owner.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!).Status);

        _api.Clock.Offset = McpLimits.AuthorizationCodeLifetime + TimeSpan.FromMinutes(1);
        Assert.Equal(ConnectedAppStatus.Expired, Assert.Single((await owner.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!).Status);
    }

    [Fact]
    public async Task Last_used_is_kept_to_the_minute_window_not_written_on_every_call()
    {
        var w = await NewSharedWorld(_api, "caused");
        var owner = await SignIn(_api, "user-caused-owner");
        var connection = await Connect(_api, owner, w.U);
        Assert.Null(Assert.Single((await owner.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!).LastUsedAt);

        await Post(_api.CreateClient(), w.U, connection.AccessToken, ListTools());
        var first = Assert.Single((await owner.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!).LastUsedAt;
        Assert.NotNull(first);

        _api.Clock.Offset = TimeSpan.FromMinutes(1);
        await Post(_api.CreateClient(), w.U, connection.AccessToken, ListTools());
        Assert.Equal(first, Assert.Single((await owner.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!).LastUsedAt);

        _api.Clock.Offset = McpLimits.LastUsedPrecision + TimeSpan.FromMinutes(1);
        await Post(_api.CreateClient(), w.U, connection.AccessToken, ListTools());
        Assert.True(Assert.Single((await owner.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!).LastUsedAt > first);
    }

    [Fact]
    public async Task An_access_token_expires_and_the_refresh_token_carries_the_connection_on()
    {
        var w = await NewSharedWorld(_api, "caexpire");
        var owner = await SignIn(_api, "user-caexpire-owner");
        var connection = await Connect(_api, owner, w.U);

        _api.Clock.Offset = McpLimits.AccessTokenLifetime + TimeSpan.FromMinutes(1);
        var expired = await Post(_api.CreateClient(), w.U, connection.AccessToken, ListTools());
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
        Assert.Contains("error=\"invalid_token\"", expired.Headers.WwwAuthenticate.ToString(), StringComparison.Ordinal);

        var refreshed = await Refresh(_api.CreateClient(), connection.ClientId, connection.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, refreshed.Status);
        Assert.Equal(HttpStatusCode.OK, (await Post(_api.CreateClient(), w.U, refreshed.AccessToken, ListTools())).StatusCode);
    }

    [Fact]
    public async Task A_replayed_refresh_token_is_refused_and_ends_the_chain()
    {
        var w = await NewSharedWorld(_api, "careplay");
        var owner = await SignIn(_api, "user-careplay-owner");
        var connection = await Connect(_api, owner, w.U);
        var rotated = await Refresh(_api.CreateClient(), connection.ClientId, connection.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, rotated.Status);

        // Past OpenIddict's short leeway for two refreshes racing, the old token is a replay.
        _api.Clock.Offset = TimeSpan.FromMinutes(2);
        Assert.Equal("invalid_grant", (await Refresh(_api.CreateClient(), connection.ClientId, connection.RefreshToken)).Error);

        // A replay suggests a stolen token, so everything issued under it is revoked with it.
        Assert.Equal("invalid_grant", (await Refresh(_api.CreateClient(), connection.ClientId, rotated.RefreshToken!)).Error);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(_api.CreateClient(), w.U, rotated.AccessToken, ListTools())).StatusCode);
    }

    [Fact]
    public async Task Connect_to_AI_gives_members_the_universe_s_URL_and_outsiders_nothing()
    {
        var w = await NewSharedWorld(_api, "cainfo");
        foreach (var who in Members)
        {
            var info = await w.Client(who).GetFromJsonAsync<McpConnectInfo>($"/api/universes/{w.U}/mcp");
            Assert.Equal(Resource(w.U), info!.McpUrl);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await w.Outsider.GetAsync($"/api/universes/{w.U}/mcp")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Owner.GetAsync($"/api/universes/{Guid.NewGuid()}/mcp")).StatusCode);
    }

    [Fact]
    public async Task Maintenance_revokes_orphans_and_removes_registrations_never_used()
    {
        var (owner, _) = await NewBrowser(_api, "camaint-owner");
        var u = (await CreateUniverse(owner, "Swept world")).Id;
        var used = await Connect(_api, owner, u);
        var unused = await RegisterPublicClient(_api.CreateClient(), "Never used");

        // The universe goes; its connection row goes with it, and the authorization is left for the sweep.
        (await owner.PostAsync($"/api/universes/{u}/archive", null)).EnsureSuccessStatusCode();
        (await owner.DeleteAsync($"/api/universes/{u}")).EnsureSuccessStatusCode();

        _api.Clock.Offset = McpLimits.UnusedRegistrationLifetime + TimeSpan.FromHours(1);
        await _api.Services.GetServices<IHostedService>().OfType<McpMaintenance>().Single().SweepAsync(CancellationToken.None);

        await WithDb(_api, async db =>
        {
            var applications = db.Set<OpenIddictEntityFrameworkCoreApplication>();
            Assert.False(await applications.AnyAsync(application => application.ClientId == unused));
            Assert.True(await applications.AnyAsync(application => application.ClientId == used.ClientId));
            Assert.False(await db.Set<OpenIddictEntityFrameworkCoreAuthorization>().AnyAsync(authorization => authorization.Status == "valid"));
        });
    }
}
