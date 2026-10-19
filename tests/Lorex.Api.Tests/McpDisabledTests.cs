using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Mcp;
using OpenIddict.EntityFrameworkCore.Models;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.McpTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A host with no MCP origin (ADR 0046): no authorization server, no registration, no MCP endpoint, no consent reads -
/// nothing that would answer without the protections an origin brings (the registration rate limit among them). What an
/// account already approved can still be listed and revoked.
/// </summary>
public sealed class McpDisabledTests : IDisposable
{
    private readonly LorexApiFactory _api = new() { McpOrigin = null };

    public void Dispose() => _api.Dispose();

    [Fact]
    public async Task Every_MCP_and_OAuth_endpoint_is_absent_and_registration_creates_nothing()
    {
        var anonymous = _api.CreateClient();
        var (browser, _) = await NewBrowser(_api, "mcpoff");
        var u = (await CreateUniverse(browser, "Unplugged world")).Id;

        // Far past what the registration limit would allow if it were in force: every one is refused the same way.
        for (var i = 0; i < 40; i++)
        {
            var registered = await Register(anonymous, new { client_name = "Nobody", redirect_uris = new[] { Redirect }, token_endpoint_auth_method = "none" });
            Assert.Equal(HttpStatusCode.NotFound, registered.StatusCode);
        }

        var (_, challenge) = Pkce();
        var request = AuthorizeRequest("lorex-dcr-anything", Resource(u), challenge);
        foreach (var response in new[]
                 {
                     await anonymous.GetAsync("/.well-known/oauth-authorization-server"),
                     await anonymous.GetAsync("/.well-known/openid-configuration"),
                     await anonymous.GetAsync($"/.well-known/oauth-protected-resource/mcp/universes/{u}"),
                     await StartAuthorization(browser, request),
                     await McpTestClient.Post(browser, request, "approve", null),
                     await anonymous.PostAsync("/oauth/token", new FormUrlEncodedContent([new("grant_type", "authorization_code")])),
                     await anonymous.PostAsync("/oauth/revoke", new FormUrlEncodedContent([new("token", "x")])),
                     await Post(anonymous, u, "anything", ListTools()),
                     await browser.GetAsync($"/api/oauth/authorization-request?client_id=x&redirect_uri=x&resource=x"),
                     await browser.GetAsync("/api/oauth/consent-token"),
                 })
        {
            Assert.True(response.StatusCode == HttpStatusCode.NotFound, $"{response.RequestMessage!.Method} {response.RequestMessage.RequestUri}: {response.StatusCode}");
        }

        await WithDb(_api, async db => Assert.Equal(0, await db.Set<OpenIddictEntityFrameworkCoreApplication>().CountAsync()));

        // Connect to AI says it is not set up; the account's connected apps still answer, empty.
        Assert.Null((await browser.GetFromJsonAsync<McpConnectInfo>($"/api/universes/{u}/mcp"))!.McpUrl);
        Assert.Empty((await browser.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!);
    }
}
