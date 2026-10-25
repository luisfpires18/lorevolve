using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using OpenIddict.Abstractions;
using OpenIddict.Server.AspNetCore;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace Lorex.Api.Features.Mcp;

/// <summary>The consent form's antiforgery field and the token to put in it.</summary>
public sealed record ConsentToken(string FieldName, string Token);

/// <summary>
/// What the consent screen shows about a request: the client as it claims to be, and the universe it asks for.
/// <paramref name="ProposalsRequested"/>: the app also asked to propose changes (ADR 0047); <paramref name="CanPropose"/>:
/// the person's role could grant that. The screen offers the choice only when both are true, unticked.
/// <paramref name="CanProposeSchema"/>: the role could also let those proposals hold types, fields and groups (ADR 0062) - a
/// second unticked choice, beneath the first.
/// </summary>
public sealed record ConnectionRequestDetails(
    string ClientName,
    string? VerifiedHost,
    string RedirectHost,
    bool LoopbackOnly,
    Guid UniverseId,
    string UniverseName,
    UniverseRole Role,
    bool ProposalsRequested = false,
    bool CanPropose = false,
    bool CanProposeSchema = false);

/// <summary>
/// The two OAuth endpoints LoreX answers itself, after OpenIddict has validated the request (ADR 0046), and the consent
/// screen's read of a request.
///
/// <para><b>Authorization: shown, then decided.</b> A client sends the browser to <c>GET /oauth/authorize</c>, usually from
/// another site - so LoreX's <c>SameSite=Strict</c> session cookie is not sent, and nothing is decided there. The request,
/// once OpenIddict has checked the client, its redirect URI, PKCE, the scope and the universe resource, is handed to the
/// consent screen (<c>/connect/authorize</c>) unchanged. The screen posts the same parameters back with the person's
/// decision; that post is same-site, carries the session, and is validated by OpenIddict all over again. Only an explicit
/// approval by a signed-in member of that universe creates anything. A post from another site arrives without the session
/// and is sent back to the screen.</para>
///
/// <para><b>Token: refreshed only while still allowed.</b> Every code exchange and every refresh is checked against the
/// live connection: it must still exist, belong to this client and account, and the account must still be able to read the
/// universe. The token carries exactly what was approved - never more, never another universe.</para>
/// </summary>
public static class OAuthEndpoints
{
    public const string ConsentPath = "/connect/authorize";

    public const string DecisionField = "lorex_decision";

    public const string Approve = "approve";

    /// <summary>The consent form's separate choice to let the app propose changes for review (ADR 0047), and its one value.</summary>
    public const string ProposeField = "lorex_propose";

    public const string AllowProposals = "allow";

    /// <summary>The consent form's separate choice to let those proposals hold schema too (ADR 0062). Its value is <see cref="AllowProposals"/>.</summary>
    public const string SchemaField = "lorex_schema";

    /// <summary>The consent form's antiforgery field, and the cookie its token is paired with.</summary>
    public const string ConsentTokenField = "lorex_consent_token";

    public const string ConsentTokenCookie = "lorex.consent";

    public static IEndpointRouteBuilder MapOAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        // Without an origin there is no authorization server: none of its endpoints, nor the consent screen's reads.
        if (!endpoints.ServiceProvider.GetRequiredService<McpSite>().IsEnabled)
        {
            return endpoints;
        }

        endpoints.MapMethods("/oauth/authorize", [HttpMethods.Get, HttpMethods.Post], AuthorizeAsync)
            .WithTags("MCP")
            .WithName("AuthorizeConnection")
            .AllowAnonymous()
            .DisableAntiforgery();

        endpoints.MapPost("/oauth/token", TokenAsync)
            .WithTags("MCP")
            .WithName("IssueConnectionToken")
            .AllowAnonymous()
            .DisableAntiforgery();

        endpoints.MapGet("/api/oauth/authorization-request", DescribeAsync)
            .WithTags("MCP")
            .WithName("DescribeConnectionRequest")
            .RequireAuthorization();

        // The consent form's antiforgery token, bound to the signed-in account and to an HttpOnly cookie. Only a page that
        // can read this answer - LoreX's own, same-origin - can make a decision the server accepts.
        endpoints.MapGet("/api/oauth/consent-token", (HttpContext http, IAntiforgery antiforgery) =>
            {
                var tokens = antiforgery.GetAndStoreTokens(http);
                http.Response.Headers.CacheControl = "no-store";
                return Results.Ok(new ConsentToken(tokens.FormFieldName, tokens.RequestToken!));
            })
            .WithTags("MCP")
            .WithName("GetConsentToken")
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> AuthorizeAsync(
        HttpContext http,
        LorexDbContext db,
        McpSite site,
        IOpenIddictApplicationManager applications,
        IOpenIddictAuthorizationManager authorizations,
        IOpenIddictTokenManager tokens,
        IAntiforgery antiforgery,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var request = http.GetOpenIddictServerRequest()
            ?? throw new InvalidOperationException("The OpenIddict authorization request is missing.");

        // RFC 8707: one resource, and on this server a resource is one universe's MCP URL on the configured origin. Checked
        // here rather than while OpenIddict validates, so the refusal goes back to the client's (validated) redirect URI.
        var resources = request.GetResources();
        if (resources.Length != 1 || site.UniverseOf(resources[0]) is not { } universeId)
        {
            return Refuse(Errors.InvalidTarget, "Connect with one universe's LoreX MCP URL, exactly as Connect to AI shows it.");
        }

        // Every connection is approved by a person, every time. There is no silent re-approval to ask for.
        if (request.HasPromptValue(PromptValues.None))
        {
            return Refuse(Errors.ConsentRequired, "LoreX asks you to approve every connection.");
        }

        // The request exactly as it arrived - the address's parameters, or a post's fields less the decision - for the screen.
        if (!HttpMethods.IsPost(http.Request.Method))
        {
            return Results.Redirect(ConsentPath + http.Request.QueryString.ToUriComponent());
        }

        var form = await http.Request.ReadFormAsync(cancellationToken);
        var session = await http.AuthenticateAsync(IdentityConstants.ApplicationScheme);

        // A decision counts only from LoreX's own consent screen: signed in, and carrying the antiforgery token that screen
        // was given for this account. Anything else - a cross-site post without the session, or a same-site post that
        // rides it but never read the token - goes back to the screen, where a person decides.
        if (session.Succeeded && session.Principal is not null)
        {
            http.User = session.Principal;
        }

        if (!session.Succeeded || session.Principal is null || !await antiforgery.IsRequestValidAsync(http))
        {
            return Results.Redirect(ConsentPath + QueryString.Create(form
                .Where(field => field.Key is not (DecisionField or ConsentTokenField or ProposeField or SchemaField))
                .SelectMany(field => field.Value.Select(value => new KeyValuePair<string, string?>(field.Key, value)))).ToUriComponent());
        }

        if (form[DecisionField] != Approve)
        {
            return Refuse(Errors.AccessDenied, "The connection was not approved.");
        }

        var userId = session.Principal.RequireUserId();
        if (await UniverseAccess.RoleAsync(db, universeId, userId, cancellationToken) is not { } role
            || !UniverseAccess.Allows(role, UniverseCapability.Read))
        {
            return Refuse(Errors.AccessDenied, "You don't have access to that universe.");
        }

        var application = await applications.FindByClientIdAsync(request.ClientId!, cancellationToken)
            ?? throw new InvalidOperationException("OpenIddict validated a client that does not exist.");

        var identity = new ClaimsIdentity(
            authenticationType: TokenValidationParameters.DefaultAuthenticationType,
            nameType: Claims.Name,
            roleType: Claims.Role);
        identity.SetClaim(Claims.Subject, userId);

        var principal = new ClaimsPrincipal(identity);

        // Read, and the refresh that keeps the connection between conversations. Proposing only when the app asked for it, the
        // person ticked it on this very screen, and their role can propose at all - never by default, never from an earlier
        // approval (ADR 0047). Whatever else was asked for, nothing more.
        var canPropose = request.HasScope(McpLimits.ProposeScope)
            && form[ProposeField] == AllowProposals
            && AiChanges.AiChangePermissions.MayStageAnything(role);
        // Schema rides on proposing: a second tick on this same screen, from a role that edits types (ADR 0062). It is no
        // OAuth scope - the token is the same either way - so no client registration changes; the connection carries it.
        var canProposeSchema = canPropose
            && form[SchemaField] == AllowProposals
            && AiChanges.AiChangePermissions.MayStage(role, AiChanges.AiChangeResource.LoreType, AiChanges.AiChangeAction.Create);
        principal.SetScopes(canPropose
            ? [McpLimits.ReadScope, McpLimits.ProposeScope, Scopes.OfflineAccess]
            : [McpLimits.ReadScope, Scopes.OfflineAccess]);
        principal.SetResources(site.ResourceFor(universeId));
        principal.SetDestinations(static _ => [Destinations.AccessToken]);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // One connection per account, client and universe: approving again replaces the old one.
        foreach (var earlier in await db.McpConnections
                     .Where(connection => connection.UserId == userId && connection.UniverseId == universeId && connection.ClientId == request.ClientId)
                     .ToListAsync(cancellationToken))
        {
            await ConnectedAppEndpoints.RevokeAsync(db, authorizations, tokens, earlier, cancellationToken);
        }

        var authorization = await authorizations.CreateAsync(
            principal,
            subject: userId,
            client: (await applications.GetIdAsync(application, cancellationToken))!,
            type: AuthorizationTypes.Permanent,
            scopes: principal.GetScopes(),
            cancellationToken);
        var authorizationId = (await authorizations.GetIdAsync(authorization, cancellationToken))!;
        principal.SetAuthorizationId(authorizationId);

        db.McpConnections.Add(new McpConnection
        {
            Id = Guid.NewGuid(),
            AuthorizationId = authorizationId,
            ClientId = request.ClientId!,
            UserId = userId,
            UniverseId = universeId,
            CreatedAt = clock.GetUtcNow().UtcDateTime,
            CanPropose = canPropose,
            CanProposeSchema = canProposeSchema,
        });
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.SignIn(principal, properties: null, OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
    }

    private static async Task<IResult> TokenAsync(HttpContext http, LorexDbContext db, McpSite site, CancellationToken cancellationToken)
    {
        var request = http.GetOpenIddictServerRequest()
            ?? throw new InvalidOperationException("The OpenIddict token request is missing.");

        var result = await http.AuthenticateAsync(OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
        if (result.Principal is not { } principal)
        {
            return Refuse(Errors.InvalidGrant, "That grant is no longer valid.");
        }

        // RFC 8707: a token request may name the resource again - only the one universe it was approved for.
        var granted = site.UniverseOf(principal.GetResources().SingleOrDefault());
        if (granted is null || request.GetResources().Any(resource => site.UniverseOf(resource) != granted))
        {
            return Refuse(Errors.InvalidTarget, "This connection is for one universe only.");
        }

        var authorizationId = principal.GetAuthorizationId();
        var connection = await db.McpConnections.AsNoTracking()
            .FirstOrDefaultAsync(row => row.AuthorizationId == authorizationId, cancellationToken);

        if (connection is null
            || connection.UniverseId != granted
            || connection.UserId != principal.GetClaim(Claims.Subject)
            || connection.ClientId != request.ClientId)
        {
            return Refuse(Errors.InvalidGrant, "This connection was disconnected. Connect it again from LoreX.");
        }

        if (await UniverseAccess.RoleAsync(db, connection.UniverseId, connection.UserId, cancellationToken) is not { } role
            || !UniverseAccess.Allows(role, UniverseCapability.Read))
        {
            return Refuse(Errors.InvalidGrant, "This connection no longer has access to the universe.");
        }

        return Results.SignIn(principal, properties: null, OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
    }

    /// <summary>
    /// The consent screen's read of a request it was handed: the client, where it would send the browser back to, and the
    /// universe. 400 <c>connection_request_invalid</c> for anything OpenIddict would refuse about the client or the redirect
    /// URI; 404 <c>universe_unavailable</c> when the signed-in account cannot read that universe - the same for one that
    /// does not exist.
    /// </summary>
    private static async Task<IResult> DescribeAsync(
        [Microsoft.AspNetCore.Mvc.FromQuery(Name = Parameters.ClientId)] string? clientId,
        [Microsoft.AspNetCore.Mvc.FromQuery(Name = Parameters.RedirectUri)] string? redirectUri,
        [Microsoft.AspNetCore.Mvc.FromQuery(Name = Parameters.Resource)] string? resource,
        [Microsoft.AspNetCore.Mvc.FromQuery(Name = Parameters.Scope)] string? scope,
        ClaimsPrincipal principal,
        LorexDbContext db,
        McpSite site,
        IOpenIddictApplicationManager applications,
        CancellationToken cancellationToken)
    {
        var application = string.IsNullOrEmpty(clientId) ? null : await applications.FindByClientIdAsync(clientId, cancellationToken);
        if (application is null
            || string.IsNullOrEmpty(redirectUri)
            || !Uri.TryCreate(redirectUri, UriKind.Absolute, out var redirect)
            || !await applications.ValidateRedirectUriAsync(application, redirectUri, cancellationToken))
        {
            return Problem(StatusCodes.Status400BadRequest, "connection_request_invalid", "This connection request isn't valid.");
        }

        var universeId = site.UniverseOf(resource);
        var universe = universeId is null
            ? null
            : await db.Universes.AsNoTracking()
                .Where(row => row.Id == universeId)
                .Select(row => new { row.Id, row.Name })
                .FirstOrDefaultAsync(cancellationToken);
        var role = universe is null ? null : await UniverseAccess.RoleAsync(db, universe.Id, principal.RequireUserId(), cancellationToken);
        if (universe is null || role is not { } effective || !UniverseAccess.Allows(effective, UniverseCapability.Read))
        {
            return Problem(StatusCodes.Status404NotFound, "universe_unavailable", "You don't have access to that universe.");
        }

        var properties = await applications.GetPropertiesAsync(application, cancellationToken);
        var verified = properties.TryGetValue(ClientRules.SourceProperty, out var source)
            && source.GetString() == ClientRules.MetadataDocumentSource;
        var redirects = await applications.GetRedirectUrisAsync(application, cancellationToken);

        return Results.Ok(new ConnectionRequestDetails(
            await applications.GetDisplayNameAsync(application, cancellationToken) ?? "Unnamed app",
            verified ? new Uri(clientId!).Host : null,
            redirect.Host,
            redirects.All(uri => Uri.TryCreate(uri, UriKind.Absolute, out var parsed) && parsed.IsLoopback),
            universe.Id,
            universe.Name,
            effective,
            (scope ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains(McpLimits.ProposeScope, StringComparer.Ordinal),
            AiChanges.AiChangePermissions.MayStageAnything(effective),
            AiChanges.AiChangePermissions.MayStage(effective, AiChanges.AiChangeResource.LoreType, AiChanges.AiChangeAction.Create)));
    }

    /// <summary>An OAuth error, which OpenIddict writes back to the client's validated redirect URI or token response.</summary>
    private static IResult Refuse(string error, string description) =>
        Results.Forbid(
            new AuthenticationProperties(new Dictionary<string, string?>
            {
                [OpenIddictServerAspNetCoreConstants.Properties.Error] = error,
                [OpenIddictServerAspNetCoreConstants.Properties.ErrorDescription] = description,
            }),
            [OpenIddictServerAspNetCoreDefaults.AuthenticationScheme]);

    private static IResult Problem(int status, string code, string title) =>
        Results.Problem(title: title, statusCode: status, extensions: new Dictionary<string, object?> { ["code"] = code });
}
