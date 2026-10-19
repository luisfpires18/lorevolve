using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Lorex.Api.Features.Mcp;
using Microsoft.AspNetCore.WebUtilities;
using ModelContextProtocol.Authentication;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using static Lorex.Api.Tests.McpTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Client metadata documents, served to the authorization server by a stand-in for the internet. Records every URL it was
/// asked for, so a test can show a refused client id was never fetched at all.
/// </summary>
public sealed class StubDocuments : HttpMessageHandler
{
    private readonly Dictionary<string, Func<HttpResponseMessage>> _documents = [];

    public List<string> Requested { get; } = [];

    public void Serve(string url, string json, string mediaType = "application/json") =>
        _documents[url] = () => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, mediaType) };

    public void Serve(string url, Func<HttpResponseMessage> answer) => _documents[url] = answer;

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var url = request.RequestUri!.AbsoluteUri;
        Requested.Add(url);
        return Task.FromResult(_documents.TryGetValue(url, out var answer) ? answer() : new HttpResponseMessage(HttpStatusCode.NotFound));
    }
}

public sealed class McpInteropFixture : IDisposable
{
    public McpInteropFixture() => Api = new LorexApiFactory { ClientMetadata = Documents };

    public StubDocuments Documents { get; } = new();

    public LorexApiFactory Api { get; }

    public void Dispose() => Api.Dispose();
}

/// <summary>
/// Interoperability (ADR 0046): the official MCP C# SDK's client discovers the authorization server from the 401 by
/// itself, registers (DCR) or identifies itself by a metadata document (CIMD), runs PKCE with the resource indicator, and
/// reads - with only the person's approval played by the test, the way a browser would make it. Then the metadata
/// document rules, one by one.
/// </summary>
public sealed class McpClientInteropTests(McpInteropFixture fixture) : IClassFixture<McpInteropFixture>
{
    private const string ClaudeLikeDocument = "https://client.example/oauth/client.json";

    private static readonly string[] CodeOnly = ["code"];

    private LorexApiFactory Api => fixture.Api;

    [Fact]
    public async Task The_SDK_client_discovers_registers_authorizes_and_reads_on_its_own()
    {
        var (browser, _) = await NewBrowser(Api, "interop-dcr");
        var u = (await CreateUniverse(browser, "Interop world")).Id;
        await CreateEntity(browser, u, "Ember Vale");

        await using var client = await SdkClientWithOAuth(browser, u, new ClientOAuthOptions
        {
            RedirectUri = new Uri(Redirect),
            DynamicClientRegistration = new() { ClientName = "SDK test client" },
        });

        var tools = await client.ListToolsAsync();
        Assert.Contains(tools, tool => tool.Name == "search_universe");
        var found = await client.CallToolAsync("search_universe", new Dictionary<string, object?> { ["query"] = "Ember" });
        Assert.Contains("Ember Vale", Assert.IsType<TextContentBlock>(Assert.Single(found.Content)).Text, StringComparison.Ordinal);

        var connection = Assert.Single((await browser.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!);
        Assert.Equal("SDK test client", connection.ClientName);
        Assert.Null(connection.VerifiedHost);
    }

    [Fact]
    public async Task The_SDK_client_identifies_itself_by_a_metadata_document_and_is_shown_as_verified()
    {
        fixture.Documents.Serve(ClaudeLikeDocument, Document(ClaudeLikeDocument, "Claude-like", "http://localhost/callback", "http://127.0.0.1/callback"));
        var (browser, _) = await NewBrowser(Api, "interop-cimd");
        var u = (await CreateUniverse(browser, "Documented world")).Id;

        // A loopback redirect on a port the document never named: a desktop client picks a free one each time.
        await using var client = await SdkClientWithOAuth(browser, u, new ClientOAuthOptions
        {
            RedirectUri = new Uri("http://localhost:51234/callback"),
            ClientMetadataDocumentUri = new Uri(ClaudeLikeDocument),
        });

        Assert.NotEmpty(await client.ListToolsAsync());
        Assert.Contains(ClaudeLikeDocument, fixture.Documents.Requested);

        var connection = Assert.Single((await browser.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!);
        Assert.Equal("Claude-like", connection.ClientName);
        Assert.Equal("client.example", connection.VerifiedHost);

        var details = await browser.GetFromJsonAsync<ConnectionRequestDetails>(
            $"/api/oauth/authorization-request?client_id={Uri.EscapeDataString(ClaudeLikeDocument)}&redirect_uri={Uri.EscapeDataString("http://localhost:51234/callback")}&resource={Uri.EscapeDataString(Resource(u))}");
        Assert.Equal("client.example", details!.VerifiedHost);
        Assert.True(details.LoopbackOnly);
    }

    [Fact]
    public async Task A_metadata_document_that_does_not_hold_up_is_refused_and_nothing_is_redirected()
    {
        var (browser, _) = await NewBrowser(Api, "interop-bad");
        var u = (await CreateUniverse(browser, "Guarded world")).Id;
        var (_, challenge) = Pkce();

        var cases = new (string Url, Action<string> Setup)[]
        {
            ("https://bad.example/mismatch.json", url => fixture.Documents.Serve(url, Document("https://bad.example/other.json", "Mismatch", Redirect))),
            ("https://bad.example/custom-scheme.json", url => fixture.Documents.Serve(url, Document(url, "Custom", "cursor://callback"))),
            ("https://bad.example/plain-http.json", url => fixture.Documents.Serve(url, Document(url, "Plain", "http://app.example/callback"))),
            ("https://bad.example/nameless.json", url => fixture.Documents.Serve(url, Document(url, "", Redirect))),
            ("https://bad.example/secret.json", url => fixture.Documents.Serve(url, JsonSerializer.Serialize(new { client_id = url, client_name = "Keys", redirect_uris = new[] { Redirect }, token_endpoint_auth_method = "private_key_jwt" }))),
            ("https://bad.example/not-json.json", url => fixture.Documents.Serve(url, "<html>hello</html>", "text/html")),
            ("https://bad.example/huge.json", url => fixture.Documents.Serve(url, Document(url, "Huge", Redirect).Replace("}", $",\"padding\":\"{new string('x', 40_000)}\"}}", StringComparison.Ordinal))),
            ("https://bad.example/missing.json", _ => { }),
            ("https://bad.example/redirects.json", url => fixture.Documents.Serve(url, () => new HttpResponseMessage(HttpStatusCode.Found) { Headers = { Location = new Uri("http://169.254.169.254/latest") } })),
        };

        foreach (var (url, setup) in cases)
        {
            setup(url);
            var response = await StartAuthorization(browser, AuthorizeRequest(url, Resource(u), challenge));
            Assert.True(response.StatusCode == HttpStatusCode.Unauthorized, $"{url}: {response.StatusCode}");
            Assert.Contains("invalid_client", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
            Assert.Null(response.Headers.Location);
        }
    }

    [Fact]
    public async Task A_client_id_LoreX_would_not_fetch_is_refused_without_a_request()
    {
        var (browser, _) = await NewBrowser(Api, "interop-unfetched");
        var u = (await CreateUniverse(browser, "Unfetched world")).Id;
        var (_, challenge) = Pkce();

        foreach (var clientId in new[]
                 {
                     "https://10.0.0.5/client.json",
                     "https://[::1]/client.json",
                     "https://client.example:8443/client.json",
                     "https://client.example/",
                     "https://client.example/client.json?x=1",
                     "https://user@client.example/client.json",
                     "https://CLIENT.example/client.json",
                     "https://client.example/" + new string('a', 120),
                 })
        {
            var before = fixture.Documents.Requested.Count;
            var response = await StartAuthorization(browser, AuthorizeRequest(clientId, Resource(u), challenge));
            Assert.True(response.StatusCode == HttpStatusCode.Unauthorized, $"{clientId}: {response.StatusCode}");
            Assert.Null(response.Headers.Location);
            Assert.Equal(before, fixture.Documents.Requested.Count);
        }
    }

    [Fact]
    public async Task A_document_sent_too_slowly_is_cut_off_at_the_deadline()
    {
        var (browser, _) = await NewBrowser(Api, "interop-slow");
        var u = (await CreateUniverse(browser, "Patient world")).Id;
        var (_, challenge) = Pkce();
        const string slow = "https://slow.example/client.json";
        fixture.Documents.Serve(slow, () => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StreamContent(new DripStream()) { Headers = { ContentType = new("application/json") } },
        });

        var clock = System.Diagnostics.Stopwatch.StartNew();
        var response = await StartAuthorization(browser, AuthorizeRequest(slow, Resource(u), challenge));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.InRange(clock.Elapsed, McpLimits.MetadataFetchTimeout - TimeSpan.FromSeconds(1), McpLimits.MetadataFetchTimeout + TimeSpan.FromSeconds(10));
    }

    [Theory]
    [InlineData("8.8.8.8", true)]
    [InlineData("1.1.1.1", true)]
    [InlineData("2606:4700:4700::1111", true)]
    [InlineData("127.0.0.1", false)]
    [InlineData("10.1.2.3", false)]
    [InlineData("172.16.0.1", false)]
    [InlineData("172.31.255.255", false)]
    [InlineData("192.168.1.1", false)]
    [InlineData("169.254.169.254", false)]
    [InlineData("100.64.0.1", false)]
    [InlineData("0.0.0.0", false)]
    [InlineData("224.0.0.1", false)]
    [InlineData("255.255.255.255", false)]
    [InlineData("192.0.2.1", false)]
    [InlineData("198.18.0.1", false)]
    [InlineData("::1", false)]
    [InlineData("::", false)]
    [InlineData("fe80::1", false)]
    [InlineData("fd00::1", false)]
    [InlineData("ff02::1", false)]
    [InlineData("2001:db8::1", false)]
    [InlineData("2002:0a00:0001::1", false)]
    [InlineData("::ffff:10.0.0.1", false)]
    [InlineData("::ffff:8.8.8.8", true)]
    public void Only_public_addresses_are_ever_connected_to(string address, bool isPublic) =>
        Assert.Equal(isPublic, ClientMetadataDocuments.IsPublicAddress(IPAddress.Parse(address)));

    // ---------- Helpers ----------

    /// <summary>
    /// The SDK's client with its own OAuth, against this host. The test plays only the person: the authorization URL the
    /// SDK built is opened in a signed-in browser, handed to the consent screen, and approved; the code goes back to
    /// the SDK, which does everything else.
    /// </summary>
    private async Task<McpClient> SdkClientWithOAuth(HttpClient browser, Guid universeId, ClientOAuthOptions oauth)
    {
        oauth.AuthorizationCallbackHandler = async (context, cancellationToken) =>
        {
            var shown = await browser.GetAsync(context.AuthorizationUri, cancellationToken);
            Assert.Equal(HttpStatusCode.Redirect, shown.StatusCode);
            var screen = shown.Headers.Location!.OriginalString;
            Assert.StartsWith("/connect/authorize?", screen, StringComparison.Ordinal);
            var request = QueryHelpers.ParseQuery(screen[screen.IndexOf('?')..]).ToDictionary(pair => pair.Key, pair => (string?)pair.Value.ToString());

            Assert.Equal(Resource(universeId), request["resource"]);
            Assert.Equal("S256", request["code_challenge_method"]);

            var answer = RedirectParameters(await Decide(browser, request, "approve"));
            return new AuthorizationResult { Code = answer["code"], State = answer["state"], Iss = answer["iss"] };
        };

        var transport = new HttpClientTransport(
            new HttpClientTransportOptions
            {
                Endpoint = new Uri($"{LorexApiFactory.Origin}{McpPath(universeId)}"),
                TransportMode = HttpTransportMode.StreamableHttp,
                OAuth = oauth,
            },
            Api.CreateClient(),
            ownsHttpClient: true);
        return await McpClient.CreateAsync(transport);
    }

    private static string Document(string clientId, string name, params string[] redirects) => JsonSerializer.Serialize(new
    {
        client_id = clientId,
        client_name = name,
        redirect_uris = redirects,
        grant_types = CodeAndRefresh,
        response_types = CodeOnly,
        token_endpoint_auth_method = "none",
    });
}

/// <summary>A body that sends its first byte, then nothing more until it is given up on: a server answering a byte at a time.</summary>
internal sealed class DripStream : Stream
{
    private bool _sent;

    public override bool CanRead => true;

    public override bool CanSeek => false;

    public override bool CanWrite => false;

    public override long Length => throw new NotSupportedException();

    public override long Position { get => 0; set => throw new NotSupportedException(); }

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        if (!_sent)
        {
            _sent = true;
            buffer.Span[0] = (byte)'{';
            return 1;
        }

        await Task.Delay(TimeSpan.FromMinutes(5), cancellationToken);
        return 0;
    }

    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    public override void Flush()
    {
    }

    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

    public override void SetLength(long value) => throw new NotSupportedException();

    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}

/// <summary>The rations of metadata fetches, each test on a host of its own so no other test spends them.</summary>
public sealed class ClientMetadataFetchLimitTests
{
    [Fact]
    public async Task Made_up_client_ids_spend_only_the_new_clients_ration()
    {
        var documents = new StubDocuments();
        using var api = new LorexApiFactory { ClientMetadata = documents };
        var (browser, _) = await NewBrowser(api, "fetchnew");
        var u = (await CreateUniverse(browser, "Rationed world")).Id;
        var (_, challenge) = Pkce();

        const string known = "https://known.example/client.json";
        documents.Serve(known, Document(known, maxAge: null));
        Assert.Equal(HttpStatusCode.Redirect, (await StartAuthorization(browser, AuthorizeRequest(known, Resource(u), challenge))).StatusCode);

        // Made-up client ids spend the rest of the new clients' minute; the next one is refused unfetched.
        for (var i = 1; i < McpLimits.MetadataFetchesPerMinute; i++)
        {
            await StartAuthorization(browser, AuthorizeRequest($"https://many.example/client-{i}.json", Resource(u), challenge));
        }

        Assert.Equal(McpLimits.MetadataFetchesPerMinute, documents.Requested.Count);
        var refused = await StartAuthorization(browser, AuthorizeRequest("https://many.example/one-more.json", Resource(u), challenge));
        Assert.Equal(HttpStatusCode.Unauthorized, refused.StatusCode);
        Assert.Contains("busy", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal(McpLimits.MetadataFetchesPerMinute, documents.Requested.Count);

        // The known client, gone stale, is still checked again: from its own ration, with its current document.
        api.Clock.Offset = McpLimits.MetadataCacheDefault + TimeSpan.FromMinutes(5);
        Assert.Equal(HttpStatusCode.Redirect, (await StartAuthorization(browser, AuthorizeRequest(known, Resource(u), challenge))).StatusCode);
        Assert.Equal(2, documents.Requested.Count(url => url == known));
    }

    [Fact]
    public async Task With_its_own_ration_spent_a_known_client_stands_only_for_the_grace_its_publisher_allowed()
    {
        var documents = new StubDocuments();
        using var api = new LorexApiFactory { ClientMetadata = documents, MetadataFetchesPerMinute = 2 };
        var (browser, _) = await NewBrowser(api, "fetchgrace");
        var u = (await CreateUniverse(browser, "Graceful world")).Id;
        var (_, challenge) = Pkce();

        // One publisher allows caching for ten minutes; the other says not to store.
        const string cached = "https://cached.example/client.json";
        const string uncached = "https://uncached.example/client.json";
        documents.Serve(cached, Document(cached, maxAge: TimeSpan.FromMinutes(10)));
        documents.Serve(uncached, Document(uncached, maxAge: null, noStore: true));

        async Task<HttpStatusCode> Authorize(string clientId) =>
            (await StartAuthorization(browser, AuthorizeRequest(clientId, Resource(u), challenge))).StatusCode;

        Assert.Equal(HttpStatusCode.Redirect, await Authorize(cached));
        Assert.Equal(HttpStatusCode.Redirect, await Authorize(uncached));

        // Both stale: both checked again, which spends the known clients' ration.
        api.Clock.Offset = TimeSpan.FromMinutes(11);
        Assert.Equal(HttpStatusCode.Redirect, await Authorize(cached));
        Assert.Equal(HttpStatusCode.Redirect, await Authorize(uncached));
        Assert.Equal(4, documents.Requested.Count);

        // Stale again with the ration spent: the cacheable one stands within its five minutes of grace, unfetched; the
        // one whose publisher said not to store has no grace at all.
        api.Clock.Offset = TimeSpan.FromMinutes(22);
        Assert.Equal(HttpStatusCode.Redirect, await Authorize(cached));
        Assert.Equal(HttpStatusCode.Unauthorized, await Authorize(uncached));

        // Past the grace, nothing stands on an old document.
        api.Clock.Offset = TimeSpan.FromMinutes(27);
        Assert.Equal(HttpStatusCode.Unauthorized, await Authorize(cached));
        Assert.Equal(4, documents.Requested.Count);
    }

    private static Func<HttpResponseMessage> Document(string clientId, TimeSpan? maxAge, bool noStore = false) => () =>
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { client_id = clientId, client_name = "Rationed", redirect_uris = (string[])[Redirect], token_endpoint_auth_method = "none" }),
                System.Text.Encoding.UTF8,
                "application/json"),
        };
        if (maxAge is not null || noStore)
        {
            response.Headers.CacheControl = new() { MaxAge = maxAge, NoStore = noStore };
        }

        return response;
    };
}
