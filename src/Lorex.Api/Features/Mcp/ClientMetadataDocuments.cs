using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading.RateLimiting;
using Lorex.Api.Features.Publishing;
using OpenIddict.Abstractions;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace Lorex.Api.Features.Mcp;

/// <summary>
/// The rules every OAuth client of LoreX is held to, however it was introduced (ADR 0046): what a redirect URI may be,
/// what a client's name may be, and the one shape of OpenIddict application each becomes.
/// </summary>
internal static class ClientRules
{
    /// <summary>Who vouched for a client's details: its own metadata document (CIMD), or nobody (DCR).</summary>
    public const string SourceProperty = "lorex_source";

    public const string MetadataDocumentSource = "metadata_document";

    public const string RegistrationSource = "registration";

    /// <summary>Until when a fetched metadata document is trusted without fetching it again.</summary>
    public const string FreshUntilProperty = "lorex_fresh_until";

    /// <summary>
    /// Until when the document may still stand if it cannot be fetched again for want of a ration: a short grace the
    /// publisher's own caching allowed, never one LoreX extends.
    /// </summary>
    public const string StaleUntilProperty = "lorex_stale_until";

    /// <summary>
    /// MCP: a redirect URI is HTTPS, or a loopback address (a program on the user's own device). Never a fragment, user
    /// info, or a custom scheme - a custom scheme can be claimed by any installed program.
    /// </summary>
    public static Uri? RedirectUri(string? value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > McpLimits.RedirectUriLength
            || !Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || value.Contains('#', StringComparison.Ordinal) || !string.IsNullOrEmpty(uri.UserInfo))
        {
            return null;
        }

        return uri.Scheme == Uri.UriSchemeHttps || (uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback) ? uri : null;
    }

    /// <summary>A client's own name, trimmed, or the problem with it. It is only ever shown as the client's claim.</summary>
    public static string? NameProblem(string? name)
    {
        var trimmed = name?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "The client has no name.";
        }

        if (trimmed.Length > McpLimits.ClientNameLength)
        {
            return $"The client name is longer than {McpLimits.ClientNameLength} characters.";
        }

        return PublicNameEndpoints.HasInvisibleControls(trimmed) ? "The client name contains invisible control characters." : null;
    }

    /// <summary>
    /// The one application a client becomes: the authorization code flow with PKCE and refresh, for the read scope only.
    /// Loopback redirect URIs make it a native application, so OpenIddict accepts them on any port (RFC 8252 section
    /// 7.3) - a desktop or command-line client picks a free port each time.
    /// </summary>
    public static OpenIddictApplicationDescriptor Describe(
        string clientId,
        string name,
        IReadOnlyCollection<Uri> redirectUris,
        string source,
        string? secret = null)
    {
        var descriptor = new OpenIddictApplicationDescriptor
        {
            ClientId = clientId,
            ClientSecret = secret,
            ClientType = secret is null ? ClientTypes.Public : ClientTypes.Confidential,
            ApplicationType = redirectUris.Any(uri => uri.IsLoopback) ? ApplicationTypes.Native : ApplicationTypes.Web,
            ConsentType = ConsentTypes.Explicit,
            DisplayName = name.Trim(),
            Permissions =
            {
                Permissions.Endpoints.Authorization,
                Permissions.Endpoints.Token,
                Permissions.Endpoints.Revocation,
                Permissions.GrantTypes.AuthorizationCode,
                Permissions.GrantTypes.RefreshToken,
                Permissions.ResponseTypes.Code,
                Permissions.Prefixes.Scope + McpLimits.ReadScope,
            },
            Requirements = { Requirements.Features.ProofKeyForCodeExchange },
        };

        descriptor.RedirectUris.UnionWith(redirectUris);
        descriptor.Properties[SourceProperty] = JsonSerializer.SerializeToElement(source);
        return descriptor;
    }
}

/// <summary>
/// OAuth Client ID Metadata Documents (CIMD), the way MCP prefers clients to be identified (ADR 0046): the client's id is
/// an HTTPS URL, and the document at that URL says what the client is called and where it may be sent back to. LoreX
/// fetches it, checks it, and keeps it as an ordinary OpenIddict application under that id.
///
/// <para><b>A request LoreX makes on a stranger's say-so.</b> Anyone can send an authorization request naming any URL, so
/// the fetch is held tight (SSRF): HTTPS on the default port to a host name - no IP literal - that resolves only to public
/// addresses, connected to the address that was checked, with no redirect followed, five seconds, 32 KB.</para>
///
/// <para><b>What it vouches for.</b> That the document was published on the client id's host. The name inside is still
/// the client's own claim, and the consent screen says so: it names the host as the verified part.</para>
/// </summary>
internal sealed partial class ClientMetadataDocuments(
    IHttpClientFactory clients,
    IOpenIddictApplicationManager applications,
    ClientMetadataFetchLimits limits,
    TimeProvider clock,
    ILogger<ClientMetadataDocuments> logger)
{
    public const string HttpClientName = "Lorex.ClientMetadataDocuments";

    /// <summary>Whether a client id is meant as a metadata document's URL rather than an id LoreX issued.</summary>
    public static bool IsDocumentClientId(string? clientId) =>
        clientId?.StartsWith("https://", StringComparison.OrdinalIgnoreCase) == true;

    /// <summary>
    /// The URL a client id names, when it is one LoreX will fetch: HTTPS, the default port, a host name rather than an
    /// address, a path, no query, fragment or user info, and written exactly as its normal form.
    /// </summary>
    public static Uri? DocumentUrl(string clientId)
    {
        if (clientId.Length > McpLimits.ClientIdLength
            || !Uri.TryCreate(clientId, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps
            || !uri.IsDefaultPort
            || uri.HostNameType != UriHostNameType.Dns
            || uri.AbsolutePath == "/"
            || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || !string.Equals(uri.AbsoluteUri, clientId, StringComparison.Ordinal))
        {
            return null;
        }

        return uri;
    }

    /// <summary>
    /// Makes sure the application for this client id reflects its current document: fetched again once what was fetched
    /// before is no longer fresh. Null when it does; otherwise what is wrong, in words for the person signing in.
    /// </summary>
    public async Task<string?> EnsureApplicationAsync(string clientId, CancellationToken cancellationToken)
    {
        if (DocumentUrl(clientId) is not { } url)
        {
            return "This app's client ID isn't a metadata document address LoreX can use.";
        }

        var existing = await applications.FindByClientIdAsync(clientId, cancellationToken);
        var now = clock.GetUtcNow();
        var properties = existing is null ? null : await applications.GetPropertiesAsync(existing, cancellationToken);
        if (When(properties, ClientRules.FreshUntilProperty) > now)
        {
            return null;
        }

        // Fetching is LoreX making a request on a stranger's say-so, before anyone has signed in: rationed, and refused
        // rather than queued when the ration is spent. Callers cannot be told apart (behind App Service the address is the
        // proxy's, ADR 0018), and anyone can name made-up client ids, so a client never seen before draws on one shared
        // ration, and a client LoreX has already checked on its own host's: neither a flood of made-up ids nor another
        // publisher's documents can keep it from being checked again. A known client whose host's ration is spent may
        // stand on its last document only for the short grace its publisher's caching allowed.
        using var lease = existing is null ? limits.NewClients.AttemptAcquire(string.Empty) : limits.KnownClients.AttemptAcquire(url.Host);
        if (!lease.IsAcquired)
        {
            var standing = When(properties, ClientRules.StaleUntilProperty) > now;
            LogRefused(logger, url.Host, standing
                ? "was not fetched again while fetches are rationed; its last document stands within its grace"
                : "was not fetched: too many client documents are being fetched right now");
            return standing ? null : "LoreX is busy checking other apps. Try connecting again in a minute.";
        }

        var (document, freshness, problem) = await FetchAsync(url, cancellationToken);
        if (document is null)
        {
            LogRefused(logger, url.Host, problem!);
            return "LoreX couldn't read this app's details from its publisher, so it can't be connected.";
        }

        var descriptor = ClientRules.Describe(clientId, document.Name, document.RedirectUris, ClientRules.MetadataDocumentSource);
        descriptor.Properties[ClientRules.FreshUntilProperty] = JsonSerializer.SerializeToElement(now + freshness.Fresh);
        descriptor.Properties[ClientRules.StaleUntilProperty] = JsonSerializer.SerializeToElement(now + freshness.Fresh + freshness.Grace);

        if (existing is null)
        {
            try
            {
                await applications.CreateAsync(descriptor, cancellationToken);
                return null;
            }
            catch (Exception exception) when (exception is OpenIddictExceptions.ConcurrencyException or Microsoft.EntityFrameworkCore.DbUpdateException)
            {
                // Another sign-in through the same client created it a moment ago: update that one instead.
                existing = await applications.FindByClientIdAsync(clientId, cancellationToken);
                if (existing is null)
                {
                    throw;
                }
            }
        }

        await applications.UpdateAsync(existing, descriptor, cancellationToken);
        return null;
    }

    /// <summary>A moment stored among an application's properties, or null.</summary>
    private static DateTimeOffset? When(System.Collections.Immutable.ImmutableDictionary<string, JsonElement>? properties, string name) =>
        properties is not null && properties.TryGetValue(name, out var value) && value.TryGetDateTimeOffset(out var moment)
            ? moment
            : null;

    private sealed record Document(string Name, IReadOnlyList<Uri> RedirectUris);

    /// <summary>The document, how long to trust it, or why not. Never throws for anything the remote end does.</summary>
    private async Task<(Document? Document, (TimeSpan Fresh, TimeSpan Grace) Freshness, string? Problem)> FetchAsync(Uri url, CancellationToken cancellationToken)
    {
        // One deadline for the whole exchange - connecting, headers and every byte of the body - so a server that answers
        // slowly, a byte at a time, holds nothing open past it. The client's own timeout ends at the headers.
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(McpLimits.MetadataFetchTimeout);

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var response = await clients.CreateClient(HttpClientName)
                .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token);

            if (response.StatusCode != HttpStatusCode.OK)
            {
                return (null, default, $"answered {(int)response.StatusCode}");
            }

            var mediaType = response.Content.Headers.ContentType?.MediaType;
            if (mediaType is null || !(mediaType == "application/json" || mediaType.EndsWith("+json", StringComparison.Ordinal)))
            {
                return (null, default, "did not answer with JSON");
            }

            if (response.Content.Headers.ContentLength > McpLimits.MetadataDocumentBytes)
            {
                return (null, default, "answered with too large a document");
            }

            await using var body = await response.Content.ReadAsStreamAsync(deadline.Token);
            var buffer = new byte[McpLimits.MetadataDocumentBytes + 1];
            var length = 0;
            int read;
            while (length < buffer.Length && (read = await body.ReadAsync(buffer.AsMemory(length), deadline.Token)) > 0)
            {
                length += read;
            }

            if (length > McpLimits.MetadataDocumentBytes)
            {
                return (null, default, "answered with too large a document");
            }

            using var json = JsonDocument.Parse(buffer.AsMemory(0, length), new JsonDocumentOptions { MaxDepth = 8 });
            var (document, problem) = Read(json.RootElement, url.AbsoluteUri);
            return (document, Freshness(response), problem);
        }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or SocketException
            || (exception is OperationCanceledException && !cancellationToken.IsCancellationRequested))
        {
            return (null, default, exception is JsonException ? "answered with something that is not JSON" : "could not be reached");
        }
    }

    /// <summary>
    /// The document's own checks (draft-ietf-oauth-client-id-metadata-document, MCP): its <c>client_id</c> is exactly its
    /// URL, it names the client, every redirect URI passes <see cref="ClientRules.RedirectUri"/>, and it can authenticate
    /// as a public client - LoreX holds no keys for anyone.
    /// </summary>
    private static (Document? Document, string? Problem) Read(JsonElement root, string url)
    {
        if (root.ValueKind != JsonValueKind.Object)
        {
            return (null, "is not a JSON object");
        }

        if (Text(root, "client_id") != url)
        {
            return (null, "names a different client_id");
        }

        var name = Text(root, "client_name");
        if (ClientRules.NameProblem(name) is { } nameProblem)
        {
            return (null, nameProblem);
        }

        if (!root.TryGetProperty("redirect_uris", out var uris) || uris.ValueKind != JsonValueKind.Array
            || uris.GetArrayLength() is 0 or > McpLimits.RedirectUriLimit)
        {
            return (null, "lists no redirect URIs, or too many");
        }

        List<Uri> redirects = [];
        foreach (var item in uris.EnumerateArray())
        {
            if (ClientRules.RedirectUri(item.ValueKind == JsonValueKind.String ? item.GetString() : null) is not { } redirect)
            {
                return (null, "lists a redirect URI that is neither HTTPS nor loopback");
            }

            redirects.Add(redirect);
        }

        // The singular method is a preference; the plural list, where a client publishes one, says what it can do.
        var single = Text(root, "token_endpoint_auth_method");
        var supported = root.TryGetProperty("token_endpoint_auth_methods_supported", out var methods) && methods.ValueKind == JsonValueKind.Array
            && methods.EnumerateArray().Any(method => method.ValueKind == JsonValueKind.String && method.GetString() == ClientAuthenticationMethods.None);
        if (!(single is null or ClientAuthenticationMethods.None || supported))
        {
            return (null, "cannot sign in as a public client");
        }

        if (!Lists(root, "grant_types", GrantTypes.AuthorizationCode) || !Lists(root, "response_types", ResponseTypes.Code))
        {
            return (null, "does not use the authorization code flow");
        }

        return (new Document(name!.Trim(), redirects), null);
    }

    private static string? Text(JsonElement root, string name) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    /// <summary>An optional list either absent or including the value.</summary>
    private static bool Lists(JsonElement root, string name, string value) =>
        !root.TryGetProperty(name, out var list)
        || (list.ValueKind == JsonValueKind.Array && list.EnumerateArray().Any(item => item.ValueKind == JsonValueKind.String && item.GetString() == value));

    /// <summary>The response's own max-age, held between the bounds; the default when it gives none or says not to store.</summary>
    /// <summary>
    /// How long to trust the document, and for how long after that it may still stand while it cannot be fetched again.
    /// Trust is the response's own max-age held between the bounds (the default when it gives none; the minimum when it
    /// says not to store). The grace exists only when the publisher allowed caching outright - a max-age, and neither
    /// no-store, no-cache nor must-revalidate - and is never longer than that max-age or <see cref="McpLimits.MetadataStaleGrace"/>.
    /// </summary>
    private static (TimeSpan Fresh, TimeSpan Grace) Freshness(HttpResponseMessage response)
    {
        var cache = response.Headers.CacheControl;
        if (cache is null || cache.NoStore || cache.NoCache)
        {
            return (cache is null ? McpLimits.MetadataCacheDefault : McpLimits.MetadataCacheMinimum, TimeSpan.Zero);
        }

        var maxAge = cache.MaxAge ?? McpLimits.MetadataCacheDefault;
        var fresh = maxAge < McpLimits.MetadataCacheMinimum ? McpLimits.MetadataCacheMinimum
            : maxAge > McpLimits.MetadataCacheMaximum ? McpLimits.MetadataCacheMaximum
            : maxAge;
        var grace = cache.MaxAge is { } allowed && !cache.MustRevalidate
            ? (allowed < McpLimits.MetadataStaleGrace ? allowed : McpLimits.MetadataStaleGrace)
            : TimeSpan.Zero;
        return (fresh, grace);
    }

    /// <summary>
    /// The connect step of every metadata fetch: the host is resolved here, every address it resolves to must be public,
    /// and the connection is made to one of those checked addresses - so neither a private record nor a DNS answer that
    /// changes between a check and a connect reaches anything inside.
    /// </summary>
    public static async ValueTask<Stream> ConnectToPublicAddressAsync(SocketsHttpConnectionContext context, CancellationToken cancellationToken)
    {
        var addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, cancellationToken);
        if (addresses.Length == 0 || !addresses.All(IsPublicAddress))
        {
            throw new HttpRequestException("The client metadata host does not resolve only to public addresses.");
        }

        var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try
        {
            await socket.ConnectAsync(addresses, context.DnsEndPoint.Port, cancellationToken);
            return new NetworkStream(socket, ownsSocket: true);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }

    /// <summary>
    /// Whether an address is on the public internet: not loopback, private, carrier-grade NAT, link-local, documentation,
    /// benchmarking, multicast or reserved, in either family (an IPv4-mapped IPv6 address is judged as its IPv4 self).
    /// IPv6 is public only within global unicast, less documentation, Teredo and 6to4.
    /// </summary>
    public static bool IsPublicAddress(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = address.GetAddressBytes();
            return !(b[0] is 0 or 10 or 127 or >= 224
                || (b[0] == 100 && b[1] is >= 64 and <= 127)
                || (b[0] == 169 && b[1] == 254)
                || (b[0] == 172 && b[1] is >= 16 and <= 31)
                || (b[0] == 192 && b[1] == 0 && b[2] is 0 or 2)
                || (b[0] == 192 && b[1] == 168)
                || (b[0] == 198 && b[1] is 18 or 19)
                || (b[0] == 198 && b[1] == 51 && b[2] == 100)
                || (b[0] == 203 && b[1] == 0 && b[2] == 113));
        }

        if (address.AddressFamily != AddressFamily.InterNetworkV6)
        {
            return false;
        }

        var v6 = address.GetAddressBytes();
        return (v6[0] & 0xE0) == 0x20
            && !(v6[0] == 0x20 && v6[1] == 0x01 && v6[2] == 0x0D && v6[3] == 0xB8)
            && !(v6[0] == 0x20 && v6[1] == 0x01 && v6[2] == 0x00 && v6[3] == 0x00)
            && !(v6[0] == 0x20 && v6[1] == 0x02);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Client metadata document from {Host} refused: it {Problem}.")]
    private static partial void LogRefused(ILogger logger, string host, string problem);
}

/// <summary>
/// How many client metadata documents this host fetches (<see cref="McpLimits"/>), in two rations. Client ids never seen
/// before - which anyone can make up, on any host - share one ration. Checking again a client LoreX has already accepted
/// draws first on a ration of that client's own host - one publisher, however many valid documents it hosts, spends only
/// its own share - and then on a ceiling for all re-checks together, so that how much LoreX fetches never depends on
/// how many hosts exist. A fetch past either is refused, never queued; a host over its own share spends none of the
/// ceiling.
/// </summary>
internal sealed class ClientMetadataFetchLimits(IConfiguration configuration) : IDisposable
{
    /// <summary>Never-seen clients, all together: the key is ignored.</summary>
    public PartitionedRateLimiter<string> NewClients { get; } = Ration(
        _ => string.Empty,
        McpLimits.MetadataFetchesAtOnce,
        configuration.GetValue($"{McpSite.SectionName}:MetadataFetchesPerMinute", McpLimits.MetadataFetchesPerMinute));

    /// <summary>Known clients: by the host that publishes their document, then all together.</summary>
    public PartitionedRateLimiter<string> KnownClients { get; } = PartitionedRateLimiter.CreateChained(
        Ration(
            host => host,
            McpLimits.MetadataRechecksAtOncePerHost,
            configuration.GetValue($"{McpSite.SectionName}:MetadataRechecksPerHostPerMinute", McpLimits.MetadataRechecksPerHostPerMinute)),
        Ration(
            _ => string.Empty,
            McpLimits.MetadataRechecksAtOnce,
            configuration.GetValue($"{McpSite.SectionName}:MetadataRechecksPerMinute", McpLimits.MetadataRechecksPerMinute)));

    public void Dispose()
    {
        NewClients.Dispose();
        KnownClients.Dispose();
    }

    /// <summary>So many at once and so many a minute, for each partition the key names.</summary>
    private static PartitionedRateLimiter<string> Ration(Func<string, string> partition, int atOnce, int perMinute) =>
        PartitionedRateLimiter.CreateChained(
            PartitionedRateLimiter.Create<string, string>(key => RateLimitPartition.GetConcurrencyLimiter(
                partition(key), _ => new ConcurrencyLimiterOptions { PermitLimit = atOnce, QueueLimit = 0 })),
            PartitionedRateLimiter.Create<string, string>(key => RateLimitPartition.GetFixedWindowLimiter(
                partition(key), _ => new FixedWindowRateLimiterOptions { PermitLimit = perMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })));
}
