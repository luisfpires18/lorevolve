using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Mcp;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.McpTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// The authorization server and the MCP endpoint's front door (ADR 0046), over HTTP the way an MCP client and a
/// person's browser use them: discovery, registration, PKCE, redirect and resource checks, consent, the code exchange,
/// refresh and rotation, and every way a token stops working. Credentials are obviously synthetic.
/// </summary>
public sealed class McpOAuthTests(LorexApiFactory api) : IClassFixture<LorexApiFactory>
{
    // ---------- Discovery ----------

    [Fact]
    public async Task Discovery_names_the_configured_origin_and_offers_what_MCP_clients_need()
    {
        var anonymous = api.CreateClient();
        var oauth = await anonymous.GetStringAsync("/.well-known/oauth-authorization-server");
        Assert.Equal(oauth, await anonymous.GetStringAsync("/.well-known/openid-configuration"));

        // A forged Host header names nothing: every URL is the configured origin's.
        using var forged = new HttpRequestMessage(HttpMethod.Get, "/.well-known/oauth-authorization-server");
        forged.Headers.Host = "attacker.example";
        Assert.Equal(oauth, await (await anonymous.SendAsync(forged)).Content.ReadAsStringAsync());

        using var json = JsonDocument.Parse(oauth);
        var root = json.RootElement;
        Assert.Equal("http://localhost/", root.GetProperty("issuer").GetString());
        Assert.Equal("http://localhost/oauth/authorize", root.GetProperty("authorization_endpoint").GetString());
        Assert.Equal("http://localhost/oauth/token", root.GetProperty("token_endpoint").GetString());
        Assert.Equal("http://localhost/oauth/register", root.GetProperty("registration_endpoint").GetString());
        Assert.Equal(["S256"], Strings(root, "code_challenge_methods_supported"));
        Assert.Equal(["code"], Strings(root, "response_types_supported"));
        Assert.Equal(["authorization_code", "refresh_token"], Strings(root, "grant_types_supported").Order());
        Assert.Equal(["lorex.read", "offline_access"], Strings(root, "scopes_supported").Order());
        Assert.Contains("none", Strings(root, "token_endpoint_auth_methods_supported"));
        Assert.DoesNotContain("private_key_jwt", Strings(root, "token_endpoint_auth_methods_supported"));
        Assert.True(root.GetProperty("client_id_metadata_document_supported").GetBoolean());
        Assert.True(root.GetProperty("authorization_response_iss_parameter_supported").GetBoolean());
        Assert.False(root.TryGetProperty("jwks_uri", out _));
        Assert.False(root.TryGetProperty("claims_supported", out _));
    }

    [Fact]
    public async Task Each_universe_has_its_own_protected_resource_metadata_whether_or_not_it_exists()
    {
        var u = Guid.NewGuid();
        using var json = JsonDocument.Parse(await api.CreateClient().GetStringAsync($"/.well-known/oauth-protected-resource/mcp/universes/{u}"));
        Assert.Equal(Resource(u), json.RootElement.GetProperty("resource").GetString());
        Assert.Equal(["http://localhost/"], Strings(json.RootElement, "authorization_servers"));
        Assert.Equal(["lorex.read"], Strings(json.RootElement, "scopes_supported"));
        Assert.Equal(["header"], Strings(json.RootElement, "bearer_methods_supported"));
    }

    [Fact]
    public async Task An_MCP_request_without_a_token_is_told_where_to_authorize()
    {
        var u = Guid.NewGuid();
        var response = await Post(api.CreateClient(), u, null, Initialize());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var challenge = response.Headers.WwwAuthenticate.ToString();
        Assert.Contains($"resource_metadata=\"http://localhost/.well-known/oauth-protected-resource/mcp/universes/{u}\"", challenge, StringComparison.Ordinal);
        Assert.Contains("scope=\"lorex.read\"", challenge, StringComparison.Ordinal);
        Assert.DoesNotContain("error=", challenge, StringComparison.Ordinal);
    }

    // ---------- The flow ----------

    [Fact]
    public async Task A_member_connects_reads_refreshes_and_the_refresh_rotates()
    {
        var w = await NewSharedWorld(api, "oaflow");
        var viewer = await SignIn(api, "user-oaflow-viewer");
        var connection = await Connect(api, viewer, w.U);

        var listed = await Post(api.CreateClient(), w.U, connection.AccessToken, ListTools());
        Assert.Equal(HttpStatusCode.OK, listed.StatusCode);
        Assert.True((await Message(listed)).GetProperty("result").GetProperty("tools").GetArrayLength() > 0);

        var refreshed = await Refresh(api.CreateClient(), connection.ClientId, connection.RefreshToken, Resource(w.U));
        Assert.Equal(HttpStatusCode.OK, refreshed.Status);
        Assert.NotEqual(connection.RefreshToken, refreshed.RefreshToken);
        Assert.NotEqual(connection.AccessToken, refreshed.AccessToken);
        Assert.InRange(refreshed.ExpiresIn!.Value, 890, 900);
        Assert.Equal(["lorex.read", "offline_access"], refreshed.Scope!.Split(' ').Order());
        Assert.Equal(HttpStatusCode.OK, (await Post(api.CreateClient(), w.U, refreshed.AccessToken, ListTools())).StatusCode);

        // Opaque: nothing a client could read the account, the universe or anything else out of.
        Assert.DoesNotContain(".", connection.AccessToken, StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_authorization_request_is_handed_to_the_consent_screen_unchanged()
    {
        var w = await NewSharedWorld(api, "oahand");
        var client = await RegisterPublicClient(api.CreateClient());
        var (_, challenge) = Pkce();
        var request = AuthorizeRequest(client, Resource(w.U), challenge);

        // Without a session, as a cross-site navigation arrives: shown, never decided.
        var response = await StartAuthorization(Browser(api), request);
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!.OriginalString;
        Assert.StartsWith("/connect/authorize?", location, StringComparison.Ordinal);
        Assert.Equal(request, QueryHelpers.ParseQuery(location[location.IndexOf('?')..]).ToDictionary(pair => pair.Key, pair => (string?)pair.Value.ToString()));

        // With a session it is still only shown: a GET decides nothing.
        var owner = await SignIn(api, "user-oahand-owner");
        Assert.StartsWith("/connect/authorize?", (await StartAuthorization(owner, request)).Headers.Location!.OriginalString, StringComparison.Ordinal);
        Assert.Equal(0, await Connections(w.U));
    }

    [Fact]
    public async Task A_post_without_the_session_approves_nothing_and_goes_back_to_the_screen()
    {
        var w = await NewSharedWorld(api, "oacsrf");
        var client = await RegisterPublicClient(api.CreateClient());
        var (_, challenge) = Pkce();

        var response = await Decide(Browser(api), AuthorizeRequest(client, Resource(w.U), challenge), "approve");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.StartsWith("/connect/authorize?", response.Headers.Location!.OriginalString, StringComparison.Ordinal);
        Assert.DoesNotContain("lorex_decision", response.Headers.Location!.OriginalString, StringComparison.Ordinal);
        Assert.Equal(0, await Connections(w.U));
    }

    [Fact]
    public async Task A_post_riding_the_session_without_the_screen_s_token_approves_nothing()
    {
        var w = await NewSharedWorld(api, "oaforge");
        var owner = await SignIn(api, "user-oaforge-owner");
        var other = await SignIn(api, "user-oaforge-editor");
        var client = await RegisterPublicClient(api.CreateClient());
        var (_, challenge) = Pkce();
        var request = AuthorizeRequest(client, Resource(w.U), challenge);

        // What a forged same-site form can send: the session cookie, but no token, a made-up one, or another account's.
        var othersToken = (await (await other.GetAsync("/api/oauth/consent-token")).Content.ReadFromJsonAsync<ConsentToken>())!.Token;
        foreach (var token in new string?[] { null, "forged-token", othersToken })
        {
            var response = await McpTestClient.Post(owner, request, "approve", token);
            Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
            var location = response.Headers.Location!.OriginalString;
            Assert.StartsWith("/connect/authorize?", location, StringComparison.Ordinal);
            Assert.DoesNotContain("lorex_decision", location, StringComparison.Ordinal);
            Assert.DoesNotContain("lorex_consent_token", location, StringComparison.Ordinal);
        }

        // The token without its cookie - another browser's - is no better.
        var cookieless = Browser(api);
        (await cookieless.PostAsJsonAsync("/api/auth/login", new Lorex.Api.Features.Auth.LoginRequest("user-oaforge-owner", PublishingTestClient.Password))).EnsureSuccessStatusCode();
        var ownersToken = (await (await owner.GetAsync("/api/oauth/consent-token")).Content.ReadFromJsonAsync<ConsentToken>())!.Token;
        Assert.StartsWith("/connect/authorize?", (await McpTestClient.Post(cookieless, request, "approve", ownersToken)).Headers.Location!.OriginalString, StringComparison.Ordinal);

        Assert.Equal(0, await Connections(w.U));

        // The screen's own post, token and all, still connects.
        Assert.True(RedirectParameters(await Decide(owner, request, "approve")).ContainsKey("code"));
        Assert.Equal(1, await Connections(w.U));
    }

    [Fact]
    public async Task The_consent_token_is_for_signed_in_accounts_and_never_cached()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Browser(api).GetAsync("/api/oauth/consent-token")).StatusCode);

        var (browser, _) = await NewBrowser(api, "oatoken");
        var response = await browser.GetAsync("/api/oauth/consent-token");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        Assert.Equal("lorex_consent_token", (await response.Content.ReadFromJsonAsync<ConsentToken>())!.FieldName);
        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"), value => value.StartsWith("lorex.consent=", StringComparison.Ordinal));
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Denying_grants_nothing_and_says_so_to_the_client()
    {
        var w = await NewSharedWorld(api, "oadeny");
        var owner = await SignIn(api, "user-oadeny-owner");
        var client = await RegisterPublicClient(api.CreateClient());
        var (_, challenge) = Pkce();

        var answer = RedirectParameters(await Decide(owner, AuthorizeRequest(client, Resource(w.U), challenge, state: "deny-state"), "deny"));

        Assert.Equal("access_denied", answer["error"]);
        Assert.Equal("deny-state", answer["state"]);
        Assert.Equal("http://localhost/", answer["iss"]);
        Assert.False(answer.ContainsKey("code"));
        Assert.Equal(0, await Connections(w.U));
    }

    [Fact]
    public async Task Prompt_none_is_refused_because_every_connection_is_approved_by_a_person()
    {
        var w = await NewSharedWorld(api, "oanone");
        var owner = await SignIn(api, "user-oanone-owner");
        await Connect(api, owner, w.U);
        var client = await RegisterPublicClient(api.CreateClient());
        var (_, challenge) = Pkce();
        var request = AuthorizeRequest(client, Resource(w.U), challenge);
        request["prompt"] = "none";

        var answer = RedirectParameters(await StartAuthorization(owner, request));
        Assert.Equal("consent_required", answer["error"]);
    }

    [Fact]
    public async Task An_outsider_cannot_connect_even_to_a_public_universe()
    {
        var (owner, _) = await NewBrowser(api, "oaout-owner");
        var u = (await PublishingTestClient.Ready(owner, "Public world")).Id;
        await PublishingTestClient.Published(owner, u);
        var (outsider, _) = await NewBrowser(api, "oaout-outsider");
        var client = await RegisterPublicClient(api.CreateClient());
        var (_, challenge) = Pkce();

        var answer = RedirectParameters(await Decide(outsider, AuthorizeRequest(client, Resource(u), challenge), "approve"));

        Assert.Equal("access_denied", answer["error"]);
        Assert.Equal(0, await Connections(u));

        // The consent screen's own read says the same, whether the universe exists or not.
        var existing = await outsider.GetAsync($"/api/oauth/authorization-request?client_id={client}&redirect_uri={Uri.EscapeDataString(Redirect)}&resource={Uri.EscapeDataString(Resource(u))}");
        var missing = await outsider.GetAsync($"/api/oauth/authorization-request?client_id={client}&redirect_uri={Uri.EscapeDataString(Redirect)}&resource={Uri.EscapeDataString(Resource(Guid.NewGuid()))}");
        Assert.Equal(HttpStatusCode.NotFound, existing.StatusCode);
        Assert.Equal(await missing.Content.ReadAsStringAsync(), await existing.Content.ReadAsStringAsync());
    }

    // ---------- PKCE, redirects, resources ----------

    [Fact]
    public async Task PKCE_is_required_S256_only_and_the_verifier_must_match()
    {
        var w = await NewSharedWorld(api, "oapkce");
        var owner = await SignIn(api, "user-oapkce-owner");
        var client = await RegisterPublicClient(api.CreateClient());
        var (verifier, challenge) = Pkce();

        // Refused while OpenIddict validates - before the redirect URI is trusted - so shown here, sent nowhere.
        var none = AuthorizeRequest(client, Resource(w.U), challenge);
        none.Remove("code_challenge");
        none.Remove("code_challenge_method");
        var plain = AuthorizeRequest(client, Resource(w.U), verifier);
        plain["code_challenge_method"] = "plain";
        foreach (var request in new[] { none, plain })
        {
            var refused = await Decide(owner, request, "approve");
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Null(refused.Headers.Location);
        }

        Assert.Equal(0, await Connections(w.U));

        var code = RedirectParameters(await Decide(owner, AuthorizeRequest(client, Resource(w.U), challenge), "approve"))["code"];
        var (otherVerifier, _) = Pkce();
        Assert.Equal("invalid_grant", (await Exchange(api.CreateClient(), client, code, otherVerifier)).Error);

        // A wrong verifier redeems nothing; the client holding the right one still can.
        Assert.Equal(HttpStatusCode.OK, (await Exchange(api.CreateClient(), client, code, verifier)).Status);
    }

    [Fact]
    public async Task A_code_is_exchanged_once()
    {
        var w = await NewSharedWorld(api, "oaonce");
        var owner = await SignIn(api, "user-oaonce-owner");
        var client = await RegisterPublicClient(api.CreateClient());
        var (verifier, challenge) = Pkce();
        var code = RedirectParameters(await Decide(owner, AuthorizeRequest(client, Resource(w.U), challenge), "approve"))["code"];

        Assert.Equal(HttpStatusCode.OK, (await Exchange(api.CreateClient(), client, code, verifier)).Status);
        Assert.Equal("invalid_grant", (await Exchange(api.CreateClient(), client, code, verifier)).Error);
    }

    [Fact]
    public async Task An_unregistered_redirect_or_client_is_never_redirected_to()
    {
        var w = await NewSharedWorld(api, "oaredir");
        var owner = await SignIn(api, "user-oaredir-owner");
        var client = await RegisterPublicClient(api.CreateClient());
        var (_, challenge) = Pkce();

        foreach (var request in new[]
                 {
                     AuthorizeRequest(client, Resource(w.U), challenge, redirect: "https://attacker.example/callback"),
                     AuthorizeRequest(client, Resource(w.U), challenge, redirect: "http://127.0.0.1:7777/callback/../evil"),
                     AuthorizeRequest(client, Resource(w.U), challenge, redirect: Redirect + "?extra=1"),
                     AuthorizeRequest("lorex-dcr-unknown", Resource(w.U), challenge),
                 })
        {
            foreach (var response in new[] { await StartAuthorization(owner, request), await Decide(owner, request, "approve") })
            {
                Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
                Assert.Null(response.Headers.Location);
            }
        }

        Assert.Equal(0, await Connections(w.U));
    }

    [Fact]
    public async Task The_resource_must_be_exactly_one_universe_of_this_server()
    {
        var w = await NewSharedWorld(api, "oares");
        var owner = await SignIn(api, "user-oares-owner");
        var client = await RegisterPublicClient(api.CreateClient());
        var (_, challenge) = Pkce();

        foreach (var resource in new[]
                 {
                     null,
                     "https://attacker.example/mcp/universes/" + w.U,
                     "http://localhost/mcp/universes/" + w.U + "/",
                     "http://localhost/mcp/universes/" + w.U + "?x=1",
                     "http://localhost/mcp",
                     "http://localhost/api/universes/" + w.U,
                 })
        {
            var request = AuthorizeRequest(client, Resource(w.U), challenge);
            request["resource"] = resource;
            Assert.Equal("invalid_target", RedirectParameters(await Decide(owner, request, "approve"))["error"]);
        }

        var two = AuthorizeRequest(client, Resource(w.U), challenge).Where(pair => pair.Key != "resource").ToList();
        two.Add(new("resource", Resource(w.U)));
        two.Add(new("resource", Resource(Guid.NewGuid())));
        two.Add(new("lorex_decision", "approve"));
        var both = await owner.PostAsync("/oauth/authorize", new FormUrlEncodedContent(two.Select(pair => new KeyValuePair<string, string>(pair.Key, pair.Value!))));
        Assert.Equal("invalid_target", RedirectParameters(both)["error"]);

        // Upper-case scheme and host name the same universe (MCP asks servers to accept them).
        var upper = AuthorizeRequest(client, Resource(w.U).Replace("http://localhost", "HTTP://LOCALHOST", StringComparison.Ordinal), challenge);
        Assert.True(RedirectParameters(await Decide(owner, upper, "approve")).ContainsKey("code"));
    }

    [Fact]
    public async Task A_token_request_may_name_only_the_universe_it_was_approved_for()
    {
        var w = await NewSharedWorld(api, "oatokres");
        var owner = await SignIn(api, "user-oatokres-owner");
        var other = (await CreateUniverse(w.Owner, "Another world")).Id;
        var client = await RegisterPublicClient(api.CreateClient());
        var (verifier, challenge) = Pkce();
        var code = RedirectParameters(await Decide(owner, AuthorizeRequest(client, Resource(w.U), challenge), "approve"))["code"];

        Assert.Equal("invalid_target", (await Exchange(api.CreateClient(), client, code, verifier, Resource(other))).Error);
    }

    // ---------- Tokens that stop working ----------

    [Fact]
    public async Task A_token_reads_only_the_universe_it_was_issued_for()
    {
        var w = await NewSharedWorld(api, "oaaud");
        var owner = await SignIn(api, "user-oaaud-owner");
        var other = (await CreateUniverse(w.Owner, "Second world")).Id;
        var connection = await Connect(api, owner, w.U);

        var response = await Post(api.CreateClient(), other, connection.AccessToken, ListTools());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("error=\"invalid_token\"", response.Headers.WwwAuthenticate.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Only_a_live_bearer_token_in_the_header_is_accepted()
    {
        var w = await NewSharedWorld(api, "oabearer");
        var owner = await SignIn(api, "user-oabearer-owner");
        var connection = await Connect(api, owner, w.U);

        // Garbage, and a refresh token where an access token belongs.
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(api.CreateClient(), w.U, "not-a-token", ListTools())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(api.CreateClient(), w.U, connection.RefreshToken, ListTools())).StatusCode);

        // In the address instead of the header.
        using var query = new HttpRequestMessage(HttpMethod.Post, $"{McpPath(w.U)}?access_token={connection.AccessToken}") { Content = JsonContent.Create(ListTools()) };
        query.Headers.Accept.ParseAdd("application/json");
        query.Headers.Accept.ParseAdd("text/event-stream");
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.CreateClient().SendAsync(query)).StatusCode);

        // The LoreX session is not an MCP credential.
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(owner, w.U, null, ListTools())).StatusCode);
    }

    [Fact]
    public async Task A_browser_page_on_another_origin_cannot_drive_the_endpoint()
    {
        var w = await NewSharedWorld(api, "oaorigin");
        var owner = await SignIn(api, "user-oaorigin-owner");
        var connection = await Connect(api, owner, w.U);

        Assert.Equal(HttpStatusCode.Forbidden, (await Post(api.CreateClient(), w.U, connection.AccessToken, ListTools(), origin: "https://attacker.example")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post(api.CreateClient(), w.U, connection.AccessToken, ListTools(), origin: "http://localhost")).StatusCode);
    }

    [Fact]
    public async Task Removing_a_member_stops_reads_and_refreshes_at_once()
    {
        var w = await NewSharedWorld(api, "oaremove");
        var editor = await SignIn(api, "user-oaremove-editor");
        var connection = await Connect(api, editor, w.U);
        Assert.Equal(HttpStatusCode.OK, (await Post(api.CreateClient(), w.U, connection.AccessToken, ListTools())).StatusCode);

        (await w.Owner.DeleteAsync($"/api/universes/{w.U}/collaborators/{w.EditorId}")).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(api.CreateClient(), w.U, connection.AccessToken, ListTools())).StatusCode);
        Assert.Equal("invalid_grant", (await Refresh(api.CreateClient(), connection.ClientId, connection.RefreshToken)).Error);
    }

    [Fact]
    public async Task A_role_change_keeps_reading_and_never_adds_anything()
    {
        var w = await NewSharedWorld(api, "oarole");
        var viewer = await SignIn(api, "user-oarole-viewer");
        var connection = await Connect(api, viewer, w.U);
        var before = (await Message(await Post(api.CreateClient(), w.U, connection.AccessToken, ListTools()))).GetProperty("result").GetProperty("tools").ToString();

        (await w.Owner.PutAsJsonAsync($"/api/universes/{w.U}/collaborators/{w.ViewerId}", new CollaboratorRoleRequest(UniverseRole.Editor))).EnsureSuccessStatusCode();
        var after = (await Message(await Post(api.CreateClient(), w.U, connection.AccessToken, ListTools()))).GetProperty("result").GetProperty("tools").ToString();
        Assert.Equal(before, after);

        (await w.Owner.PutAsJsonAsync($"/api/universes/{w.U}/collaborators/{w.ViewerId}", new CollaboratorRoleRequest(UniverseRole.Viewer))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await Post(api.CreateClient(), w.U, connection.AccessToken, ListTools())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Refresh(api.CreateClient(), connection.ClientId, connection.RefreshToken)).Status);
    }

    [Fact]
    public async Task Deleting_the_universe_ends_its_connections()
    {
        var (owner, _) = await NewBrowser(api, "oadelete-owner");
        var u = (await CreateUniverse(owner, "Doomed world")).Id;
        var connection = await Connect(api, owner, u);

        (await owner.PostAsync($"/api/universes/{u}/archive", null)).EnsureSuccessStatusCode();
        (await owner.DeleteAsync($"/api/universes/{u}")).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(api.CreateClient(), u, connection.AccessToken, ListTools())).StatusCode);
        Assert.Equal("invalid_grant", (await Refresh(api.CreateClient(), connection.ClientId, connection.RefreshToken)).Error);
        Assert.Equal(0, await Connections(u));
    }

    [Fact]
    public async Task Approving_the_same_app_again_replaces_the_earlier_connection()
    {
        var w = await NewSharedWorld(api, "oaagain");
        var owner = await SignIn(api, "user-oaagain-owner");
        var first = await Connect(api, owner, w.U);
        var second = await Connect(api, owner, w.U, first.ClientId);

        Assert.Equal(1, await Connections(w.U));
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(api.CreateClient(), w.U, first.AccessToken, ListTools())).StatusCode);
        Assert.Equal("invalid_grant", (await Refresh(api.CreateClient(), first.ClientId, first.RefreshToken)).Error);
        Assert.Equal(HttpStatusCode.OK, (await Post(api.CreateClient(), w.U, second.AccessToken, ListTools())).StatusCode);
    }

    [Fact]
    public async Task A_refresh_token_from_another_client_is_refused()
    {
        var w = await NewSharedWorld(api, "oaclient");
        var owner = await SignIn(api, "user-oaclient-owner");
        var connection = await Connect(api, owner, w.U);
        var other = await RegisterPublicClient(api.CreateClient(), "Other client");

        Assert.Equal("invalid_grant", (await Refresh(api.CreateClient(), other, connection.RefreshToken)).Error);
    }

    // ---------- Registration ----------

    [Fact]
    public async Task Registration_accepts_only_https_or_loopback_redirects_and_the_code_flow()
    {
        var anonymous = api.CreateClient();

        foreach (var (registration, error) in new (object, string)[]
                 {
                     (new { redirect_uris = Array.Empty<string>() }, "invalid_redirect_uri"),
                     (new { redirect_uris = new[] { "http://attacker.example/callback" } }, "invalid_redirect_uri"),
                     (new { redirect_uris = new[] { "cursor://callback" } }, "invalid_redirect_uri"),
                     (new { redirect_uris = new[] { "https://app.example/callback#fragment" } }, "invalid_redirect_uri"),
                     (new { redirect_uris = new[] { "https://user:pass@app.example/callback" } }, "invalid_redirect_uri"),
                     (new { redirect_uris = Enumerable.Range(0, 11).Select(i => $"https://app.example/{i}").ToArray() }, "invalid_redirect_uri"),
                     (new { redirect_uris = new[] { "https://app.example/cb" }, grant_types = new[] { "client_credentials" } }, "invalid_client_metadata"),
                     (new { redirect_uris = new[] { "https://app.example/cb" }, grant_types = new[] { "authorization_code", "implicit" } }, "invalid_client_metadata"),
                     (new { redirect_uris = new[] { "https://app.example/cb" }, response_types = new[] { "token" } }, "invalid_client_metadata"),
                     (new { redirect_uris = new[] { "https://app.example/cb" }, token_endpoint_auth_method = "private_key_jwt" }, "invalid_client_metadata"),
                     (new { redirect_uris = new[] { "https://app.example/cb" }, client_name = "Spoof‮ed" }, "invalid_client_metadata"),
                     (new { redirect_uris = new[] { "https://app.example/cb" }, client_name = new string('n', 81) }, "invalid_client_metadata"),
                 })
        {
            var response = await Register(anonymous, registration);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal(error, json.RootElement.GetProperty("error").GetString());
        }

        var notJson = await anonymous.PostAsync("/oauth/register", new StringContent("redirect_uris=x", System.Text.Encoding.UTF8, "application/x-www-form-urlencoded"));
        Assert.Equal(HttpStatusCode.BadRequest, notJson.StatusCode);
    }

    [Fact]
    public async Task A_confidential_registration_gets_a_secret_once_and_must_use_it()
    {
        var w = await NewSharedWorld(api, "oasecret");
        var owner = await SignIn(api, "user-oasecret-owner");
        var registered = await Register(api.CreateClient(), new { client_name = "Server app", redirect_uris = (string[])["https://app.example/callback"] });
        Assert.Equal(HttpStatusCode.Created, registered.StatusCode);
        Assert.Equal("no-store", registered.Headers.CacheControl?.ToString());
        using var json = JsonDocument.Parse(await registered.Content.ReadAsStringAsync());
        var clientId = json.RootElement.GetProperty("client_id").GetString()!;
        var secret = json.RootElement.GetProperty("client_secret").GetString()!;
        Assert.Equal("client_secret_basic", json.RootElement.GetProperty("token_endpoint_auth_method").GetString());

        var (verifier, challenge) = Pkce();
        var code = RedirectParameters(await Decide(owner, AuthorizeRequest(clientId, Resource(w.U), challenge, redirect: "https://app.example/callback"), "approve"))["code"];

        var withoutSecret = await Exchange(api.CreateClient(), clientId, code, verifier, redirect: "https://app.example/callback");
        Assert.Equal("invalid_client", withoutSecret.Error);

        var code2 = RedirectParameters(await Decide(owner, AuthorizeRequest(clientId, Resource(w.U), challenge, redirect: "https://app.example/callback"), "approve"))["code"];
        var basic = api.CreateClient();
        basic.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{clientId}:{secret}")));
        var withSecret = await Exchange(basic, clientId, code2, verifier, redirect: "https://app.example/callback");
        Assert.Equal(HttpStatusCode.OK, withSecret.Status);

        // The secret is stored hashed: nowhere in the database is it written as sent.
        await WithDb(api, async db =>
            Assert.False(await db.Database.SqlQueryRaw<string>("SELECT ClientSecret AS Value FROM OpenIddictApplications").AnyAsync(stored => stored == secret)));
    }

    [Fact]
    public async Task A_dynamically_registered_app_is_shown_as_unverified()
    {
        var w = await NewSharedWorld(api, "oaunverified");
        var owner = await SignIn(api, "user-oaunverified-owner");
        var client = await RegisterPublicClient(api.CreateClient(), "Claude, honestly");

        var details = await owner.GetFromJsonAsync<ConnectionRequestDetails>(
            $"/api/oauth/authorization-request?client_id={client}&redirect_uri={Uri.EscapeDataString(Redirect)}&resource={Uri.EscapeDataString(Resource(w.U))}");

        Assert.Equal("Claude, honestly", details!.ClientName);
        Assert.Null(details.VerifiedHost);
        Assert.Equal("127.0.0.1", details.RedirectHost);
        Assert.True(details.LoopbackOnly);
        Assert.Equal(w.U, details.UniverseId);
        Assert.Equal(UniverseRole.Owner, details.Role);

        // A redirect the client never registered is not a request the screen will describe.
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.GetAsync(
            $"/api/oauth/authorization-request?client_id={client}&redirect_uri={Uri.EscapeDataString("https://attacker.example/cb")}&resource={Uri.EscapeDataString(Resource(w.U))}")).StatusCode);
    }

    // ---------- Helpers ----------

    private async Task<int> Connections(Guid universeId)
    {
        var count = 0;
        await WithDb(api, async db => count = await db.McpConnections.CountAsync(row => row.UniverseId == universeId));
        return count;
    }

    private static string[] Strings(JsonElement root, string name) =>
        [.. root.GetProperty(name).EnumerateArray().Select(item => item.GetString()!)];
}
