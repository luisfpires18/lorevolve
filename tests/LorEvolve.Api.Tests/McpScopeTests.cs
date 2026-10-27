using System.Net;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Mcp;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenIddict.Abstractions;
using static LorEvolve.Api.Tests.McpTestClient;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Per-client scope permissions stay enforced (ADR 0047): a client may only ask for the scopes its registration lists.
/// New registrations list read and propose; a client registered before proposals existed - here, one whose list holds
/// read alone, as the UpgradeMcpClientScopes migration found them - is refused the moment it asks for propose, and still
/// reads. Asking is never granting: a denied consent makes nothing, and an approval without the tick is read-only.
/// </summary>
public sealed class McpScopeTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private const string ReadAndPropose = "lorevolve.read lorevolve.propose offline_access";

    private async Task<string[]> PermissionsAsync(string clientId)
    {
        using var scope = _factory.Services.CreateScope();
        var applications = scope.ServiceProvider.GetRequiredService<IOpenIddictApplicationManager>();
        var application = await applications.FindByClientIdAsync(clientId);
        return [.. await applications.GetPermissionsAsync(application!)];
    }

    /// <summary>Makes a client look registered before ADR 0047: its scope list holds read and nothing else.</summary>
    private async Task MakeOldAsync(string clientId)
    {
        using var scope = _factory.Services.CreateScope();
        var applications = scope.ServiceProvider.GetRequiredService<IOpenIddictApplicationManager>();
        var application = await applications.FindByClientIdAsync(clientId);
        var descriptor = new OpenIddictApplicationDescriptor();
        await applications.PopulateAsync(descriptor, application!);
        descriptor.Permissions.Remove(Permissions.Prefixes.Scope + McpLimits.ProposeScope);
        await applications.UpdateAsync(application!, descriptor);
    }

    [Fact]
    public async Task A_new_registration_may_ask_for_read_and_propose_and_nothing_else()
    {
        var clientId = await RegisterPublicClient(_factory.CreateClient());
        var scopes = (await PermissionsAsync(clientId)).Where(permission => permission.StartsWith(Permissions.Prefixes.Scope, StringComparison.Ordinal)).Order();
        Assert.Equal(["scp:lorevolve.propose", "scp:lorevolve.read"], scopes);
    }

    [Fact]
    public async Task A_client_registered_before_proposals_cannot_ask_for_them_and_still_reads()
    {
        var w = await CollaborationTestClient.NewSharedWorld(_factory, "scopeold");
        var owner = await SignIn(_factory, "user-scopeold-owner");
        var clientId = await RegisterPublicClient(_factory.CreateClient());
        await MakeOldAsync(clientId);

        var (_, challenge) = Pkce();
        var asking = AuthorizeRequest(clientId, Resource(w.U), challenge, scope: ReadAndPropose);
        asking[OAuthEndpoints.ProposeField] = OAuthEndpoints.AllowProposals;
        // Refused by OpenIddict before any consent is weighed: its own 400, never a code.
        var refused = await Decide(owner, asking, "approve");
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("scope", await refused.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

        await PlotTestClient.WithDb(_factory, async db => Assert.False(await db.McpConnections.AnyAsync(row => row.ClientId == clientId)));

        // The same client asking for read only is served exactly as before.
        var connection = await Connect(_factory, owner, w.U, clientId);
        Assert.Equal(HttpStatusCode.OK, (await Post(_factory.CreateClient(), w.U, connection.AccessToken, ListTools())).StatusCode);
    }

    [Fact]
    public async Task Denying_a_request_for_proposals_makes_nothing()
    {
        var w = await CollaborationTestClient.NewSharedWorld(_factory, "scopedeny");
        var owner = await SignIn(_factory, "user-scopedeny-owner");
        var clientId = await RegisterPublicClient(_factory.CreateClient());
        var (_, challenge) = Pkce();
        var request = AuthorizeRequest(clientId, Resource(w.U), challenge, scope: ReadAndPropose);
        request[OAuthEndpoints.ProposeField] = OAuthEndpoints.AllowProposals;

        var denied = RedirectParameters(await Decide(owner, request, "deny"));
        Assert.Equal("access_denied", denied["error"]);
        await PlotTestClient.WithDb(_factory, async db =>
        {
            Assert.False(await db.McpConnections.AnyAsync(row => row.ClientId == clientId));
            Assert.Equal(0, await db.Set<OpenIddict.EntityFrameworkCore.Models.OpenIddictEntityFrameworkCoreAuthorization>()
                .CountAsync(row => row.Application!.ClientId == clientId));
        });
    }
}
