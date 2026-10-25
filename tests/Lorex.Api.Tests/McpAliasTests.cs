using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Mcp;
using Lorex.Api.Features.Universes;
using static Lorex.Api.Tests.McpTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Friendly per-universe MCP addresses (issue 59, ADR 0062): <c>/mcp/u/{alias}</c> beside <c>/mcp/universes/{id}</c>. The
/// alias is stable through a rename, resolved server-side to exactly one universe, never a credential, and answered alike for
/// one that names nothing - and the address by id, and every connection made with it, keeps working.
/// </summary>
public sealed class McpAliasTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private static async Task<McpConnectInfo> Info(HttpClient browser, Guid u) =>
        (await browser.GetFromJsonAsync<McpConnectInfo>($"/api/universes/{u}/mcp"))!;

    private static string PathOf(string url) => new Uri(url).AbsolutePath;

    private static Task<HttpResponseMessage> Call(HttpClient client, string path, string? token, object message)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(message) };
        request.Headers.Accept.ParseAdd("application/json");
        request.Headers.Accept.ParseAdd("text/event-stream");
        request.Headers.Add("MCP-Protocol-Version", "2025-11-25");
        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        return client.SendAsync(request);
    }

    private async Task<(string ClientId, TokenAnswer Tokens)> ConnectAsync(HttpClient browser, string resource)
    {
        var clientId = await RegisterPublicClient(_factory.CreateClient());
        var (verifier, challenge) = Pkce();
        var approved = RedirectParameters(await Decide(browser, AuthorizeRequest(clientId, resource, challenge), "approve"));
        return (clientId, await Exchange(_factory.CreateClient(), clientId, approved["code"], verifier, resource));
    }

    [Fact]
    public async Task A_universe_gets_one_readable_alias_that_a_rename_never_moves()
    {
        var (browser, _) = await NewBrowser(_factory, "aliasstable");
        var u = (await PlotTestClient.CreateUniverse(browser, "The Lord of the Rings")).Id;

        var first = await Info(browser, u);
        Assert.Matches(@"^https?://[^/]+/mcp/u/the-lord-of-the-rings-[a-z2-9]{4}$", first.McpUrl);
        Assert.Equal(Resource(u), first.CanonicalUrl);
        Assert.Equal("LoreX - The Lord of the Rings", first.SuggestedName);

        (await browser.PutAsJsonAsync($"/api/universes/{u}", new UpdateUniverseRequest("Middle-earth", null, null))).EnsureSuccessStatusCode();
        Assert.Equal(first.McpUrl, (await Info(browser, u)).McpUrl);

        Assert.Equal("elan-vital", McpAliases.Readable("Élan  Vital!"));
        Assert.Equal("world", McpAliases.Readable("!!!"));
        Assert.Equal("a-very-long-universe", McpAliases.Readable("A very long universe name indeed"));
    }

    [Fact]
    public async Task A_connection_made_with_the_alias_reads_only_its_universe_and_the_address_by_id_keeps_working()
    {
        var (browser, _) = await NewBrowser(_factory, "aliasconnect");
        var u = (await PlotTestClient.CreateUniverse(browser, "Shire")).Id;
        var other = (await PlotTestClient.CreateUniverse(browser, "Mordor")).Id;
        var alias = (await Info(browser, u)).McpUrl!;
        var otherAlias = (await Info(browser, other)).McpUrl!;

        var (clientId, tokens) = await ConnectAsync(browser, alias);
        Assert.Equal(HttpStatusCode.OK, tokens.Status);

        // The friendly address and the address by id are one resource; the other universe's address is not.
        Assert.Equal(HttpStatusCode.OK, (await Call(_factory.CreateClient(), PathOf(alias), tokens.AccessToken, ListTools())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post(_factory.CreateClient(), u, tokens.AccessToken, ListTools())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Call(_factory.CreateClient(), PathOf(otherAlias), tokens.AccessToken, ListTools())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(_factory.CreateClient(), other, tokens.AccessToken, ListTools())).StatusCode);

        // A refresh stays on the one universe, and can't be moved to another by naming its alias.
        var refreshed = await Refresh(_factory.CreateClient(), clientId, tokens.RefreshToken!, alias);
        Assert.Equal(HttpStatusCode.OK, refreshed.Status);
        var moved = await Refresh(_factory.CreateClient(), clientId, refreshed.RefreshToken!, otherAlias);
        Assert.NotEqual(HttpStatusCode.OK, moved.Status);

        // An old connection by id is untouched.
        var (_, byId) = await ConnectAsync(browser, Resource(u));
        Assert.Equal(HttpStatusCode.OK, (await Post(_factory.CreateClient(), u, byId.AccessToken, ListTools())).StatusCode);
    }

    [Fact]
    public async Task An_alias_that_names_nothing_is_answered_like_any_address_and_connects_nothing()
    {
        var (browser, _) = await NewBrowser(_factory, "aliasnothing");
        var path = "/mcp/u/nowhere-zzzz";

        var unknown = await Call(_factory.CreateClient(), path, null, ListTools());
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        Assert.Contains("/.well-known/oauth-protected-resource/mcp/u/nowhere-zzzz", unknown.Headers.WwwAuthenticate.ToString(), StringComparison.Ordinal);

        using var metadata = JsonDocument.Parse(await (await _factory.CreateClient().GetAsync("/.well-known/oauth-protected-resource/mcp/u/nowhere-zzzz")).Content.ReadAsStringAsync());
        Assert.Equal($"{LorexApiFactory.Origin}{path}", metadata.RootElement.GetProperty("resource").GetString());

        var clientId = await RegisterPublicClient(_factory.CreateClient());
        var (_, challenge) = Pkce();
        var request = AuthorizeRequest(clientId, $"{LorexApiFactory.Origin}{path}", challenge);
        var refused = RedirectParameters(await Decide(browser, request, "approve"));
        Assert.Equal("invalid_target", refused["error"]);

        Assert.Equal(HttpStatusCode.NotFound, (await Call(_factory.CreateClient(), "/mcp/u/Not_An-Alias!", null, ListTools())).StatusCode);
    }

    [Fact]
    public async Task Someone_who_cant_read_the_universe_gets_no_alias_and_no_connection_through_one()
    {
        var (owner, _) = await NewBrowser(_factory, "aliasprivate");
        var u = (await PlotTestClient.CreateUniverse(owner, "Hidden")).Id;
        var alias = (await Info(owner, u)).McpUrl!;

        var (stranger, _) = await NewBrowser(_factory, "aliasprivate-stranger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/universes/{u}/mcp")).StatusCode);

        var clientId = await RegisterPublicClient(_factory.CreateClient());
        var (_, challenge) = Pkce();
        var refused = RedirectParameters(await Decide(stranger, AuthorizeRequest(clientId, alias, challenge), "approve"));
        Assert.Equal("access_denied", refused["error"]);
    }
}
