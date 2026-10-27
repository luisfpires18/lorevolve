using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Mcp;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using ModelContextProtocol.Client;

namespace LorEvolve.Api.Tests;

/// <summary>What a token endpoint answered: the tokens, or the OAuth error.</summary>
internal sealed record TokenAnswer(HttpStatusCode Status, string? AccessToken, string? RefreshToken, int? ExpiresIn, string? Scope, string? Error)
{
    public static async Task<TokenAnswer> From(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        string? Text(string name) => json.RootElement.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
        int? Number(string name) => json.RootElement.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetInt32() : null;
        return new(response.StatusCode, Text("access_token"), Text("refresh_token"), Number("expires_in"), Text("scope"), Text("error"));
    }
}

/// <summary>One approved connection: the client it was made for and the tokens it was issued.</summary>
internal sealed record Connection(string ClientId, Guid UniverseId, string AccessToken, string RefreshToken);

/// <summary>
/// An OAuth client and a browser, played by tests against the real authorization server (ADR 0046): dynamic
/// registration, PKCE, the authorization request, the consent post, the code exchange and refreshes, all over HTTP the
/// way an MCP client and a person's browser make them. Credentials are obviously synthetic.
/// </summary>
internal static class McpTestClient
{
    public const string Redirect = "http://127.0.0.1:7777/callback";

    public static readonly string[] CodeAndRefresh = ["authorization_code", "refresh_token"];

    public static string Resource(Guid universeId) => $"{LorEvolveApiFactory.Origin}/mcp/universes/{universeId:D}";

    public static string McpPath(Guid universeId) => $"/mcp/universes/{universeId:D}";

    /// <summary>A browser: it keeps its cookies and, like a test of redirects needs, follows none.</summary>
    public static HttpClient Browser(LorEvolveApiFactory factory) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    /// <summary>A browser signed in as an account a test made earlier.</summary>
    public static async Task<HttpClient> SignIn(LorEvolveApiFactory factory, string username)
    {
        var browser = Browser(factory);
        (await browser.PostAsJsonAsync("/api/auth/login", new LoginRequest(username, PublishingTestClient.Password))).EnsureSuccessStatusCode();
        return browser;
    }

    /// <summary>A new account, signed in, in a browser.</summary>
    public static async Task<(HttpClient Browser, string UserId)> NewBrowser(LorEvolveApiFactory factory, string tag)
    {
        var browser = Browser(factory);
        var response = await browser.PostAsJsonAsync("/api/auth/register", new RegisterRequest($"user-{tag}", $"{tag}@example.test", PublishingTestClient.Password));
        response.EnsureSuccessStatusCode();
        return (browser, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    public static Task<HttpResponseMessage> Register(HttpClient client, object registration) =>
        client.PostAsJsonAsync("/oauth/register", registration);

    /// <summary>A public client, registered dynamically as most MCP clients do.</summary>
    public static async Task<string> RegisterPublicClient(HttpClient client, string name = "Test MCP client", string redirect = Redirect)
    {
        var response = await Register(client, new { client_name = name, redirect_uris = new[] { redirect }, token_endpoint_auth_method = "none", grant_types = CodeAndRefresh });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("client_id").GetString()!;
    }

    public static (string Verifier, string Challenge) Pkce()
    {
        var verifier = Base64Url(RandomNumberGenerator.GetBytes(32));
        return (verifier, Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier))));
    }

    public static Dictionary<string, string?> AuthorizeRequest(
        string clientId,
        string resource,
        string challenge,
        string state = "state-1",
        string redirect = Redirect,
        string scope = "lorevolve.read offline_access") => new()
    {
        ["response_type"] = "code",
        ["client_id"] = clientId,
        ["redirect_uri"] = redirect,
        ["scope"] = scope,
        ["state"] = state,
        ["code_challenge"] = challenge,
        ["code_challenge_method"] = "S256",
        ["resource"] = resource,
    };

    public static Task<HttpResponseMessage> StartAuthorization(HttpClient browser, IDictionary<string, string?> request) =>
        browser.GetAsync(QueryHelpers.AddQueryString("/oauth/authorize", request));

    /// <summary>The consent screen's post: the request as it arrived, and the person's decision.</summary>
    /// <summary>
    /// The consent screen's post: the request as it arrived, the person's decision, and - as the screen does - the
    /// antiforgery token it reads for the signed-in account (none for a browser that is not signed in).
    /// </summary>
    public static async Task<HttpResponseMessage> Decide(HttpClient browser, IDictionary<string, string?> request, string decision)
    {
        var token = await browser.GetAsync("/api/oauth/consent-token");
        return await Post(browser, request, decision, token.IsSuccessStatusCode ? (await token.Content.ReadFromJsonAsync<ConsentToken>())!.Token : null);
    }

    /// <summary>A decision posted with exactly the antiforgery token given, or none.</summary>
    public static Task<HttpResponseMessage> Post(HttpClient browser, IDictionary<string, string?> request, string decision, string? token)
    {
        var fields = request.Where(field => field.Value is not null).Select(field => new KeyValuePair<string, string>(field.Key, field.Value!)).ToList();
        fields.Add(new("lorevolve_decision", decision));
        if (token is not null)
        {
            fields.Add(new("lorevolve_consent_token", token));
        }

        return browser.PostAsync("/oauth/authorize", new FormUrlEncodedContent(fields));
    }

    /// <summary>The parameters of a redirect's target.</summary>
    public static Dictionary<string, string> RedirectParameters(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!;
        var query = location.IsAbsoluteUri ? location.Query : location.OriginalString[(location.OriginalString.IndexOf('?') is var at and >= 0 ? at : location.OriginalString.Length)..];
        return QueryHelpers.ParseQuery(query).ToDictionary(pair => pair.Key, pair => pair.Value.ToString());
    }

    public static async Task<TokenAnswer> Exchange(HttpClient client, string clientId, string code, string verifier, string? resource = null, string redirect = Redirect)
    {
        var fields = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["client_id"] = clientId,
            ["code"] = code,
            ["code_verifier"] = verifier,
            ["redirect_uri"] = redirect,
        };
        if (resource is not null)
        {
            fields["resource"] = resource;
        }

        return await TokenAnswer.From(await client.PostAsync("/oauth/token", new FormUrlEncodedContent(fields)));
    }

    public static async Task<TokenAnswer> Refresh(HttpClient client, string clientId, string refreshToken, string? resource = null)
    {
        var fields = new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["client_id"] = clientId,
            ["refresh_token"] = refreshToken,
        };
        if (resource is not null)
        {
            fields["resource"] = resource;
        }

        return await TokenAnswer.From(await client.PostAsync("/oauth/token", new FormUrlEncodedContent(fields)));
    }

    /// <summary>The whole flow, approved: registration (unless a client is given), authorization, consent, exchange.</summary>
    public static async Task<Connection> Connect(LorEvolveApiFactory factory, HttpClient browser, Guid universeId, string? clientId = null)
    {
        clientId ??= await RegisterPublicClient(factory.CreateClient());
        var (verifier, challenge) = Pkce();
        var request = AuthorizeRequest(clientId, Resource(universeId), challenge);

        var approved = RedirectParameters(await Decide(browser, request, "approve"));
        Assert.True(approved.ContainsKey("code"), $"No code: {string.Join(", ", approved)}");
        Assert.Equal("state-1", approved["state"]);

        var tokens = await Exchange(factory.CreateClient(), clientId, approved["code"], verifier, Resource(universeId));
        Assert.Equal(HttpStatusCode.OK, tokens.Status);
        return new Connection(clientId, universeId, tokens.AccessToken!, tokens.RefreshToken!);
    }

    /// <summary>One JSON-RPC message to a universe's MCP endpoint, as a Streamable HTTP client posts it.</summary>
    public static Task<HttpResponseMessage> Post(HttpClient client, Guid universeId, string? token, object message, string? origin = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, McpPath(universeId))
        {
            Content = JsonContent.Create(message),
        };
        request.Headers.Accept.ParseAdd("application/json");
        request.Headers.Accept.ParseAdd("text/event-stream");
        request.Headers.Add("MCP-Protocol-Version", "2025-11-25");
        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        if (origin is not null)
        {
            request.Headers.Add("Origin", origin);
        }

        return client.SendAsync(request);
    }

    public static object Initialize(int id = 1) => new
    {
        jsonrpc = "2.0",
        id,
        method = "initialize",
        @params = new { protocolVersion = "2025-11-25", capabilities = new { }, clientInfo = new { name = "lorevolve-tests", version = "1.0" } },
    };

    public static object ListTools(int id = 2) => new { jsonrpc = "2.0", id, method = "tools/list", @params = new { } };

    /// <summary>The JSON-RPC message in a Streamable HTTP response, whether it came back as JSON or as one SSE event.</summary>
    public static async Task<JsonElement> Message(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        var json = response.Content.Headers.ContentType?.MediaType == "text/event-stream"
            ? string.Join("\n", body.Split('\n').Where(line => line.StartsWith("data:", StringComparison.Ordinal)).Select(line => line[5..].Trim()))
            : body;
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    /// <summary>The official MCP SDK's client, over the real Streamable HTTP transport, holding a token.</summary>
    public static Task<McpClient> SdkClient(LorEvolveApiFactory factory, Guid universeId, string token)
    {
        var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var transport = new HttpClientTransport(
            new HttpClientTransportOptions { Endpoint = new Uri($"{LorEvolveApiFactory.Origin}{McpPath(universeId)}"), TransportMode = HttpTransportMode.StreamableHttp },
            http,
            ownsHttpClient: true);
        return McpClient.CreateAsync(transport);
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
