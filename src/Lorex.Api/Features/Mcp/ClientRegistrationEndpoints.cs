using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using OpenIddict.Abstractions;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace Lorex.Api.Features.Mcp;

/// <summary>An RFC 7591 registration request: only the fields LoreX reads. Everything else a client sends is ignored.</summary>
public sealed record ClientRegistrationRequest(
    [property: JsonPropertyName("redirect_uris")] string[]? RedirectUris,
    [property: JsonPropertyName("client_name")] string? ClientName,
    [property: JsonPropertyName("token_endpoint_auth_method")] string? TokenEndpointAuthMethod,
    [property: JsonPropertyName("grant_types")] string[]? GrantTypes,
    [property: JsonPropertyName("response_types")] string[]? ResponseTypes);

/// <summary>
/// OAuth 2.0 Dynamic Client Registration (RFC 7591), for the MCP clients that predate client metadata documents (ADR
/// 0046). Open by design - a client registers before anyone has signed in - so it is bounded instead: a small body, a
/// shared rate limit, the same redirect and name rules as every client, and a registration never used is removed after a
/// day (<see cref="McpMaintenance"/>).
///
/// A registration vouches for nothing. Its name is the client's own claim, and the consent screen says it is unverified.
/// There is no management endpoint (RFC 7592): a client that loses its id registers again.
/// </summary>
public static class ClientRegistrationEndpoints
{
    public const string RegisterPath = "/oauth/register";

    /// <summary>LoreX's own client ids carry this prefix, so they can never be taken for a metadata document's URL.</summary>
    public const string ClientIdPrefix = "lorex-dcr-";

    /// <summary>
    /// A registration's id: the prefix, when it was made (Unix seconds as ten hex digits, so ids sort by age as plain
    /// strings and the sweep can ask the database for the old ones), then 128 random bits.
    /// </summary>
    public static string ClientIdFor(DateTimeOffset issuedAt) =>
        AgeBound(issuedAt) + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));

    /// <summary>Every id issued before <paramref name="moment"/> sorts below this string, every later one at or above it.</summary>
    public static string AgeBound(DateTimeOffset moment) =>
        ClientIdPrefix + moment.ToUnixTimeSeconds().ToString("x10", System.Globalization.CultureInfo.InvariantCulture) + "-";

    public static IEndpointRouteBuilder MapClientRegistrationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost(RegisterPath, RegisterAsync)
            .WithTags("MCP")
            .WithName("RegisterOAuthClient")
            .RequireRateLimiting(McpSetup.RegistrationRateLimit)
            .WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(McpLimits.RegistrationBodyBytes))
            .AllowAnonymous();

        return endpoints;
    }

    private static async Task<IResult> RegisterAsync(
        HttpRequest http,
        IOpenIddictApplicationManager applications,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (!http.HasJsonContentType())
        {
            return Refuse("invalid_client_metadata", "Send the registration as application/json.");
        }

        ClientRegistrationRequest? request;
        try
        {
            request = await JsonSerializer.DeserializeAsync<ClientRegistrationRequest>(http.Body, cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            return Refuse("invalid_client_metadata", "The registration is not a JSON object LoreX can read.");
        }

        if (request is null)
        {
            return Refuse("invalid_client_metadata", "The registration is empty.");
        }

        var uris = request.RedirectUris ?? [];
        if (uris.Length is 0 or > McpLimits.RedirectUriLimit)
        {
            return Refuse("invalid_redirect_uri", $"Register between 1 and {McpLimits.RedirectUriLimit} redirect URIs.");
        }

        List<Uri> redirects = [];
        foreach (var uri in uris)
        {
            if (ClientRules.RedirectUri(uri) is not { } redirect)
            {
                return Refuse("invalid_redirect_uri", "Every redirect URI must use https, or http on a loopback address.");
            }

            redirects.Add(redirect);
        }

        var name = string.IsNullOrWhiteSpace(request.ClientName) ? "Unnamed app" : request.ClientName.Trim();
        if (ClientRules.NameProblem(name) is { } nameProblem)
        {
            return Refuse("invalid_client_metadata", nameProblem);
        }

        // RFC 7591's default is client_secret_basic; MCP clients mostly ask for none (PKCE alone).
        var method = request.TokenEndpointAuthMethod ?? ClientAuthenticationMethods.ClientSecretBasic;
        if (method is not (ClientAuthenticationMethods.None or ClientAuthenticationMethods.ClientSecretBasic or ClientAuthenticationMethods.ClientSecretPost))
        {
            return Refuse("invalid_client_metadata", "Use none, client_secret_basic or client_secret_post at the token endpoint.");
        }

        // Only the authorization code flow, with refresh. A client asking for anything else is refused, not trimmed.
        var grants = request.GrantTypes ?? [GrantTypes.AuthorizationCode];
        if (!grants.Contains(GrantTypes.AuthorizationCode)
            || grants.Any(grant => grant is not (GrantTypes.AuthorizationCode or GrantTypes.RefreshToken)))
        {
            return Refuse("invalid_client_metadata", "Only the authorization_code and refresh_token grants are supported.");
        }

        if (request.ResponseTypes is { } responses && (responses.Length == 0 || responses.Any(type => type != ResponseTypes.Code)))
        {
            return Refuse("invalid_client_metadata", "Only the code response type is supported.");
        }

        var issuedAt = clock.GetUtcNow();
        var clientId = ClientIdFor(issuedAt);
        var secret = method == ClientAuthenticationMethods.None ? null : Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

        await applications.CreateAsync(ClientRules.Describe(clientId, name, redirects, ClientRules.RegistrationSource, secret), cancellationToken);

        // The secret is hashed by OpenIddict as it is stored: this answer is the only place it is ever written out.
        var answer = new Dictionary<string, object?>
        {
            ["client_id"] = clientId,
            ["client_id_issued_at"] = issuedAt.ToUnixTimeSeconds(),
            ["client_name"] = name,
            ["redirect_uris"] = redirects.Select(uri => uri.AbsoluteUri).ToArray(),
            ["grant_types"] = new[] { GrantTypes.AuthorizationCode, GrantTypes.RefreshToken },
            ["response_types"] = new[] { ResponseTypes.Code },
            ["token_endpoint_auth_method"] = method,
            ["scope"] = McpLimits.ReadScope,
        };

        if (secret is not null)
        {
            answer["client_secret"] = secret;
            answer["client_secret_expires_at"] = 0;
        }

        http.HttpContext.Response.Headers.CacheControl = "no-store";
        return Results.Json(answer, statusCode: StatusCodes.Status201Created);
    }

    private static IResult Refuse(string error, string description) =>
        Results.Json(new Dictionary<string, string> { ["error"] = error, ["error_description"] = description }, statusCode: StatusCodes.Status400BadRequest);
}
