using Lorex.Api.Features.Seo;

namespace Lorex.Api.Features.Mcp;

/// <summary>
/// Where this deployment's MCP server and its authorization server live (ADR 0046): one configured origin, the OAuth
/// issuer on it, and one protected resource per universe on it.
///
/// <para><b>Configured, never guessed.</b> <c>Mcp:Origin</c>, else <c>PublicSite:Origin</c>, is the only source of every
/// absolute URL here - the issuer, the endpoints in the discovery documents, each universe's resource. The request's
/// <c>Host</c> header is never read for any of them: <c>AllowedHosts</c> is <c>*</c>, and a forged header would otherwise
/// name an attacker's origin as the place to send a user's sign-in. Unset, there is no MCP server and no authorization
/// server, and nothing else changes.</para>
///
/// <para><b>One resource per universe.</b> <c>{origin}/mcp/universes/{id}</c> is both the MCP endpoint a creator pastes
/// into an AI client and the RFC 8707 resource its token is issued for. The URL is an address, not a credential.</para>
/// </summary>
public sealed class McpSite
{
    public const string SectionName = "Mcp";

    /// <summary>The path every universe's MCP endpoint sits under.</summary>
    public const string ResourcePathPrefix = "/mcp/universes/";

    /// <summary>The RFC 9728 well-known prefix; a universe's metadata is this followed by its resource's path.</summary>
    public const string ResourceMetadataPrefix = "/.well-known/oauth-protected-resource";

    private McpSite(Uri? origin) => Origin = origin;

    /// <summary>Scheme, host and port only. Null when MCP is not set up on this deployment.</summary>
    public Uri? Origin { get; }

    public bool IsEnabled => Origin is not null;

    /// <summary>The issuer identifier: the origin itself, written as <see cref="Uri.AbsoluteUri"/> writes it (a trailing slash).</summary>
    public Uri Issuer => Origin ?? throw new InvalidOperationException("MCP is not set up on this deployment.");

    /// <summary>The origin with no trailing slash, for joining to a path.</summary>
    public string Base => Issuer.GetLeftPart(UriPartial.Authority);

    /// <summary>A universe's canonical resource URI - its MCP endpoint, exactly as the creator copies it.</summary>
    public string ResourceFor(Guid universeId) => $"{Base}{ResourcePathPrefix}{universeId:D}";

    /// <summary>Where a universe's protected resource metadata is served (RFC 9728 section 3.1, path inserted).</summary>
    public string ResourceMetadataFor(Guid universeId) => $"{Base}{ResourceMetadataPrefix}{ResourcePathPrefix}{universeId:D}";

    /// <summary>
    /// The universe a resource indicator names, or null when it names anything else: another origin, another path, a
    /// query, a fragment, a trailing slash. Scheme and host compare without case (MCP asks servers to accept upper case);
    /// the id must be the whole of the rest, so one universe has one resource.
    /// </summary>
    public Guid? UniverseOf(string? resource)
    {
        if (Origin is null || resource is null)
        {
            return null;
        }

        var prefix = Base + ResourcePathPrefix;
        return resource.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            && Guid.TryParseExact(resource.AsSpan(prefix.Length), "D", out var id)
                ? id
                : null;
    }

    /// <summary>
    /// Reads and checks the configuration. A malformed origin fails the host at startup, loudly. Outside Development and
    /// the test host the origin must be HTTPS: every authorization server endpoint has to be (MCP, OAuth 2.1).
    /// </summary>
    public static McpSite From(IConfiguration configuration, IHostEnvironment environment)
    {
        var text = configuration[$"{SectionName}:Origin"]?.Trim();

        // Unset, the portal's origin - when one is configured - is this deployment's origin too.
        var origin = string.IsNullOrEmpty(text) ? PublicSite.From(configuration).Origin : Parse(text);
        if (origin is null)
        {
            return new McpSite(null);
        }

        var plainHttpAllowed = environment.IsDevelopment() || environment.IsEnvironment("Testing");
        if (origin.Scheme == Uri.UriSchemeHttp && !plainHttpAllowed)
        {
            throw new InvalidOperationException($"The MCP origin ({origin.GetLeftPart(UriPartial.Authority)}) must use https outside Development.");
        }

        return new McpSite(origin);
    }

    private static Uri Parse(string text)
    {
        if (!Uri.TryCreate(text, UriKind.Absolute, out var parsed)
            || parsed.Scheme is not ("http" or "https")
            || parsed.AbsolutePath != "/"
            || !string.IsNullOrEmpty(parsed.Query)
            || !string.IsNullOrEmpty(parsed.Fragment)
            || !string.IsNullOrEmpty(parsed.UserInfo))
        {
            throw new InvalidOperationException(
                $"{SectionName}:Origin must be an absolute https origin with no path, such as https://lorex.example.");
        }

        return parsed;
    }
}
