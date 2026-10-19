using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;
using OpenIddict.Validation.AspNetCore;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace Lorex.Api.Features.Mcp;

/// <summary>
/// Who an MCP request is for, once <see cref="McpEndpoints.UseMcpGate"/> has let it through: one account, reading one
/// universe. Scoped to the request; the tools read the universe from here and from nowhere else.
/// </summary>
public sealed class McpCaller
{
    public Guid UniverseId { get; private set; }

    public string UserId { get; private set; } = string.Empty;

    public string UniverseName { get; private set; } = string.Empty;

    public bool IsAllowed { get; private set; }

    internal void Allow(Guid universeId, string userId, string universeName)
    {
        UniverseId = universeId;
        UserId = userId;
        UniverseName = universeName;
        IsAllowed = true;
    }
}

/// <summary>Marks the MCP endpoints, so the gate knows which requests are its to check.</summary>
public sealed class McpUniverseEndpointMetadata;

/// <summary>
/// The MCP server's HTTP face (ADR 0046): each universe's protected resource metadata, and the universe's MCP endpoint
/// behind the gate.
///
/// <para><b>The gate, on every request.</b> A bearer token from the Authorization header only - never the LoreX session
/// cookie, never a query string - that OpenIddict accepts as live; issued for exactly this universe's resource; carrying
/// the read scope; whose connection still exists for this account, client and universe; and whose account can still read
/// the universe now. A revoked connection, a removed member, a deleted universe or a token for another universe stops at
/// the next request. Without a valid token the answer is 401 with the resource metadata to find the authorization server
/// by (RFC 9728, MCP).</para>
///
/// <para><b>Stateless.</b> The SDK serves each request on its own, with no session to lose on a restart or to pin to an
/// instance; GET and DELETE, which only a session would use, answer 405.</para>
/// </summary>
public static class McpEndpoints
{
    /// <summary>What a Streamable HTTP session would use, and a stateless server answers 405.</summary>
    private static readonly string[] SessionMethods = [HttpMethods.Get, HttpMethods.Delete];

    private static readonly string[] Scopes = [McpLimits.ReadScope];

    private static readonly string[] BearerMethods = ["header"];

    public static IEndpointRouteBuilder MapLorexMcpEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var site = endpoints.ServiceProvider.GetRequiredService<McpSite>();
        if (!site.IsEnabled)
        {
            return endpoints;
        }

        // RFC 9728, the path-inserted well-known for each universe's resource. Answered the same for any id, so it says
        // nothing about which universes exist.
        endpoints.MapGet($"{McpSite.ResourceMetadataPrefix}{McpSite.ResourcePathPrefix}{{universeId:guid}}", (Guid universeId) =>
                Results.Json(new Dictionary<string, object>
                {
                    ["resource"] = site.ResourceFor(universeId),
                    ["authorization_servers"] = (string[])[site.Issuer.AbsoluteUri],
                    ["scopes_supported"] = Scopes,
                    ["bearer_methods_supported"] = BearerMethods,
                    ["resource_name"] = "LoreX universe (read-only)",
                }))
            .WithTags("MCP")
            .WithName("GetMcpResourceMetadata")
            .AllowAnonymous();

        var pattern = $"{McpSite.ResourcePathPrefix}{{universeId:guid}}";
        endpoints.MapMcp(pattern).WithMetadata(new McpUniverseEndpointMetadata()).WithTags("MCP");
        endpoints.MapMethods(pattern, SessionMethods, (HttpContext http) =>
            {
                http.Response.Headers.Allow = HttpMethods.Post;
                return Results.StatusCode(StatusCodes.Status405MethodNotAllowed);
            })
            .WithMetadata(new McpUniverseEndpointMetadata())
            .WithTags("MCP");

        return endpoints;
    }

    /// <summary>Runs after authorization and before any MCP endpoint, for MCP endpoints only.</summary>
    public static IApplicationBuilder UseMcpGate(this IApplicationBuilder app) =>
        app.Use(async (http, next) =>
        {
            if (http.GetEndpoint()?.Metadata.GetMetadata<McpUniverseEndpointMetadata>() is null)
            {
                await next(http);
                return;
            }

            if (await RefuseAsync(http) is { } refusal)
            {
                await refusal.ExecuteAsync(http);
                return;
            }

            await next(http);
        });

    private static async Task<IResult?> RefuseAsync(HttpContext http)
    {
        var site = http.RequestServices.GetRequiredService<McpSite>();
        var universeId = Guid.Parse((string)http.GetRouteValue("universeId")!);
        var cancellationToken = http.RequestAborted;

        // DNS rebinding (Streamable HTTP: MUST): a page on another origin may not drive this endpoint from a browser.
        // Server-side clients send no Origin at all.
        if (http.Request.Headers.Origin is { Count: > 0 } origin
            && !string.Equals(origin.ToString(), site.Base, StringComparison.OrdinalIgnoreCase))
        {
            return Results.Json(new { error = "origin_not_allowed" }, statusCode: StatusCodes.Status403Forbidden);
        }

        var result = await http.AuthenticateAsync(OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme);
        if (result.Principal is not { } principal)
        {
            // No token at all is the start of discovery; a token that was refused is invalid_token.
            return Challenge(site, universeId, http.Request.Headers.Authorization.Count == 0 ? null : "The access token is not valid.");
        }

        // RFC 8707 / MCP: only a token issued for this very resource. A token for another universe is not one for this.
        if (!principal.GetAudiences().Contains(site.ResourceFor(universeId)))
        {
            return Challenge(site, universeId, "The access token was issued for a different resource.");
        }

        if (!principal.HasScope(McpLimits.ReadScope))
        {
            return InsufficientScope(site, universeId);
        }

        var userId = principal.GetClaim(Claims.Subject);
        var authorizationId = principal.GetAuthorizationId();
        var db = http.RequestServices.GetRequiredService<LorexDbContext>();
        var connection = await db.McpConnections.AsNoTracking()
            .Where(row => row.AuthorizationId == authorizationId)
            .Select(row => new { row.Id, row.UniverseId, row.UserId, row.ClientId, row.LastUsedAt, UniverseName = row.Universe!.Name })
            .FirstOrDefaultAsync(cancellationToken);

        if (connection is null || connection.UniverseId != universeId || connection.UserId != userId
            || connection.ClientId != principal.GetClaim(Claims.ClientId))
        {
            return Challenge(site, universeId, "This connection was disconnected.");
        }

        if (await UniverseAccess.RoleAsync(db, universeId, connection.UserId, cancellationToken) is not { } role
            || !UniverseAccess.Allows(role, UniverseCapability.Read))
        {
            return Challenge(site, universeId, "This connection no longer has access to the universe.");
        }

        var now = http.RequestServices.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        if (connection.LastUsedAt is not { } lastUsed || now - lastUsed >= McpLimits.LastUsedPrecision)
        {
            await db.McpConnections.Where(row => row.Id == connection.Id)
                .ExecuteUpdateAsync(update => update.SetProperty(row => row.LastUsedAt, now), cancellationToken);
        }

        http.RequestServices.GetRequiredService<McpCaller>().Allow(universeId, connection.UserId, connection.UniverseName);

        // The MCP endpoint is not a cookie-session endpoint: whatever else the request carried, the caller is the token.
        http.User = new ClaimsPrincipal(principal.Identity!);
        return null;
    }

    /// <summary>401 with where to find the authorization server, and the one scope to ask it for (RFC 6750, RFC 9728).</summary>
    private static ChallengeResult Challenge(McpSite site, Guid universeId, string? invalidToken) => new ChallengeResult(
        StatusCodes.Status401Unauthorized,
        invalidToken is null
            ? $"Bearer resource_metadata=\"{site.ResourceMetadataFor(universeId)}\", scope=\"{McpLimits.ReadScope}\""
            : $"Bearer error=\"invalid_token\", error_description=\"{invalidToken}\", resource_metadata=\"{site.ResourceMetadataFor(universeId)}\", scope=\"{McpLimits.ReadScope}\"");

    private static ChallengeResult InsufficientScope(McpSite site, Guid universeId) => new ChallengeResult(
        StatusCodes.Status403Forbidden,
        $"Bearer error=\"insufficient_scope\", scope=\"{McpLimits.ReadScope}\", resource_metadata=\"{site.ResourceMetadataFor(universeId)}\"");

    private sealed class ChallengeResult(int status, string header) : IResult
    {
        public Task ExecuteAsync(HttpContext http)
        {
            http.Response.StatusCode = status;
            http.Response.Headers.WWWAuthenticate = header;
            http.Response.Headers.CacheControl = "no-store";
            return Task.CompletedTask;
        }
    }
}
