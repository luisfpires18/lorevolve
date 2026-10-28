using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;
using OpenIddict.EntityFrameworkCore.Models;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace LorEvolve.Api.Features.Mcp;

/// <summary>Whether a connection can be used right now.</summary>
public enum ConnectedAppStatus
{
    /// <summary>Approved, and the app holds a live refresh token.</summary>
    Active,

    /// <summary>The account can no longer read the universe: nothing is served, and nothing refreshes.</summary>
    NoAccess,

    /// <summary>
    /// Its tokens ran out: unused for <see cref="McpLimits.RefreshTokenLifetime"/>, or its code never exchanged within
    /// <see cref="McpLimits.AuthorizationCodeLifetime"/>.
    /// </summary>
    Expired,
}

/// <summary>
/// One of the signed-in account's connections, as Profile -> Connected Apps lists it. No token, secret or code.
/// <paramref name="CanPropose"/>: the person also let it propose changes for review (ADR 0047); <paramref name="CanProposeSchema"/>:
/// those proposals may hold types, fields and groups too (ADR 0062).
/// </summary>
public sealed record ConnectedApp(
    Guid Id,
    string ClientName,
    string? VerifiedHost,
    Guid UniverseId,
    string UniverseName,
    DateTime CreatedAt,
    DateTime? LastUsedAt,
    ConnectedAppStatus Status,
    bool CanPropose = false,
    bool CanProposeSchema = false);

/// <summary>
/// Where a universe's MCP server is, for Connect to AI: the friendly URL to copy (ADR 0062), or null when MCP is not set up here.
/// <paramref name="CanonicalUrl"/> is the address by id, which connections made with it keep using; <paramref name="SuggestedName"/>
/// a name to give the connection in the AI app.
/// </summary>
public sealed record McpConnectInfo(string? McpUrl, string? CanonicalUrl = null, string? SuggestedName = null);

/// <summary>
/// The account's own connections (ADR 0046): listed and revoked from the session alone, like the rest of
/// <c>/api/profile</c>. One account never sees or revokes another's, a revoke ends that connection's tokens at once and
/// touches nothing else - not the LorEvolve session, not another connection.
/// </summary>
public static class ConnectedAppEndpoints
{
    public static IEndpointRouteBuilder MapConnectedAppEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/profile/connected-apps").WithTags("MCP").RequireAuthorization();
        group.MapGet("/", ListAsync).WithName("ListConnectedApps");
        group.MapDelete("/{connectionId:guid}", RevokeConnectionAsync).WithName("RevokeConnectedApp");
        group.MapDelete("/{connectionId:guid}/proposals", StopProposalsAsync).WithName("StopConnectedAppProposals");
        group.MapDelete("/{connectionId:guid}/schema", StopSchemaAsync).WithName("StopConnectedAppSchemaProposals");

        // Connect to AI: any member may connect their own client, so this is a Read.
        endpoints.MapGet("/api/universes/{universeId:guid}/mcp", ConnectInfoAsync)
            .WithTags("MCP")
            .WithName("GetMcpConnectInfo")
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> ListAsync(ClaimsPrincipal principal, LorEvolveDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();
        var now = clock.GetUtcNow().UtcDateTime;

        // Just approved, the app has a code to exchange and no refresh token yet: that is a connection starting, not a lapsed one.
        var exchanging = now - McpLimits.AuthorizationCodeLifetime;
        var applications = db.Set<OpenIddictEntityFrameworkCoreApplication>();
        var tokens = db.Set<OpenIddictEntityFrameworkCoreToken>();

        var rows = await db.McpConnections.AsNoTracking()
            .Where(connection => connection.UserId == userId)
            .OrderByDescending(connection => connection.CreatedAt)
            .ThenBy(connection => connection.Id)
            .Select(connection => new
            {
                connection.Id,
                connection.ClientId,
                Application = applications
                    .Where(application => application.ClientId == connection.ClientId)
                    .Select(application => new { application.DisplayName, application.Properties })
                    .FirstOrDefault(),
                connection.UniverseId,
                UniverseName = connection.Universe!.Name,
                connection.CreatedAt,
                connection.LastUsedAt,
                connection.CanPropose,
                connection.CanProposeSchema,
                HasAccess = connection.Universe.OwnerId == userId
                    || db.UniverseMemberships.Any(membership => membership.UniverseId == connection.UniverseId && membership.UserId == userId),
                CanRefresh = connection.CreatedAt > exchanging
                    || tokens.Any(token => token.Authorization!.Id == connection.AuthorizationId
                        && token.Type == TokenTypeIdentifiers.RefreshToken
                        && token.Status == Statuses.Valid
                        && token.ExpirationDate > now),
            })
            .ToListAsync(cancellationToken);

        return Results.Ok(rows.Select(row => new ConnectedApp(
            row.Id,
            row.Application?.DisplayName ?? "Unnamed app",
            IsVerified(row.Application?.Properties) ? new Uri(row.ClientId).Host : null,
            row.UniverseId,
            row.UniverseName,
            row.CreatedAt,
            row.LastUsedAt,
            !row.HasAccess ? ConnectedAppStatus.NoAccess : row.CanRefresh ? ConnectedAppStatus.Active : ConnectedAppStatus.Expired,
            row.CanPropose,
            row.CanPropose && row.CanProposeSchema)));
    }

    private static async Task<IResult> RevokeConnectionAsync(
        Guid connectionId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IOpenIddictAuthorizationManager authorizations,
        IOpenIddictTokenManager tokens,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();

        // Another account's connection is answered exactly like one that does not exist.
        var connection = await db.McpConnections
            .FirstOrDefaultAsync(row => row.Id == connectionId && row.UserId == userId, cancellationToken);
        if (connection is null)
        {
            return Results.NotFound();
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await RevokeAsync(db, authorizations, tokens, connection, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Results.NoContent();
    }

    /// <summary>
    /// Takes back one connection's permission to propose changes (ADR 0047) and keeps it reading. Checked on every proposal
    /// tool call, so it stops at the next one; proposals it already staged can then only be rejected. Getting it back means
    /// connecting again and ticking it on the consent screen - the old grant is never revived.
    /// </summary>
    private static async Task<IResult> StopProposalsAsync(
        Guid connectionId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();
        var changed = await db.McpConnections
            .Where(row => row.Id == connectionId && row.UserId == userId)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.CanPropose, false).SetProperty(row => row.CanProposeSchema, false), cancellationToken);
        return changed == 0 ? Results.NotFound() : Results.NoContent();
    }

    /// <summary>
    /// Takes back one connection's permission to propose schema (ADR 0062) and keeps it proposing content and reading. Checked
    /// on every proposal and approval, so a schema proposal it already staged can then only be rejected. Getting it back means
    /// connecting again and ticking it on the consent screen.
    /// </summary>
    private static async Task<IResult> StopSchemaAsync(
        Guid connectionId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();
        var changed = await db.McpConnections
            .Where(row => row.Id == connectionId && row.UserId == userId)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.CanProposeSchema, false), cancellationToken);
        return changed == 0 ? Results.NotFound() : Results.NoContent();
    }

    private static async Task<IResult> ConnectInfoAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        McpSite site,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!site.IsEnabled)
        {
            return Results.Ok(new McpConnectInfo(null));
        }

        var name = await db.Universes.AsNoTracking().Where(universe => universe.Id == universeId).Select(universe => universe.Name).SingleAsync(cancellationToken);
        return Results.Ok(new McpConnectInfo(
            McpAliases.Resource(site, await McpAliases.EnsureAsync(db, universeId, cancellationToken)),
            site.ResourceFor(universeId),
            $"LorEvolve - {name}"));
    }

    /// <summary>
    /// Ends one connection: its OpenIddict authorization revoked, every token issued under it revoked, the row removed.
    /// The caller holds the transaction. Nothing else - no other connection, no session - is touched.
    /// </summary>
    public static async Task RevokeAsync(
        LorEvolveDbContext db,
        IOpenIddictAuthorizationManager authorizations,
        IOpenIddictTokenManager tokens,
        McpConnection connection,
        CancellationToken cancellationToken)
    {
        if (await authorizations.FindByIdAsync(connection.AuthorizationId, cancellationToken) is { } authorization)
        {
            await authorizations.TryRevokeAsync(authorization, cancellationToken);
        }

        await tokens.RevokeByAuthorizationIdAsync(connection.AuthorizationId, cancellationToken);
        db.McpConnections.Remove(connection);
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Whether an application's details came from its own metadata document, read from OpenIddict's stored properties.</summary>
    private static bool IsVerified(string? properties)
    {
        if (string.IsNullOrEmpty(properties))
        {
            return false;
        }

        using var json = System.Text.Json.JsonDocument.Parse(properties);
        return (json.RootElement.TryGetProperty(ClientRules.SourceProperty, out var source)
                || json.RootElement.TryGetProperty(ClientRules.LegacySourceProperty, out source))
            && source.ValueKind == System.Text.Json.JsonValueKind.String
            && source.GetString() == ClientRules.MetadataDocumentSource;
    }
}
