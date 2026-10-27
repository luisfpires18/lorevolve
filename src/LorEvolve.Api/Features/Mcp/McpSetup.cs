using System.Threading.RateLimiting;
using LorEvolve.Api.Data;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection.Extensions;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace LorEvolve.Api.Features.Mcp;

/// <summary>The numbers of the MCP connection (ADR 0046), in one place.</summary>
public static class McpLimits
{
    /// <summary>The permission every connection has: read the connected universe.</summary>
    public const string ReadScope = "lorevolve.read";

    /// <summary>
    /// A separate permission to propose changes for a person to review in LorEvolve (ADR 0047). Never a write: nothing it
    /// allows changes the universe. Granted only when the person ticks it at consent, and only to a role that can propose.
    /// </summary>
    public const string ProposeScope = "lorevolve.propose";

    /// <summary>
    /// The two scopes' names before the rename to LorEvolve (ADR 0067). Still registered and still honoured, so a
    /// connection made earlier - its refresh token, its registration's permissions - keeps working without reconnecting.
    /// Nothing issues them any more.
    /// </summary>
    public const string LegacyReadScope = "lorex.read";

    public const string LegacyProposeScope = "lorex.propose";

    /// <summary>Short-lived (MCP: SHOULD). Every request is checked against the live authorization anyway.</summary>
    public static readonly TimeSpan AccessTokenLifetime = TimeSpan.FromMinutes(15);

    /// <summary>
    /// Rotated on every use and slid forward each time, so a connection used at least once a month stays connected until
    /// it is revoked; one left unused this long asks to be connected again.
    /// </summary>
    public static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(30);

    public static readonly TimeSpan AuthorizationCodeLifetime = TimeSpan.FromMinutes(5);

    /// <summary>How finely "last used" is kept: refreshed at most once in this window.</summary>
    public static readonly TimeSpan LastUsedPrecision = TimeSpan.FromMinutes(5);

    /// <summary>A client id: ours (DCR) or the URL of a client's metadata document (CIMD). OpenIddict's own column length.</summary>
    public const int ClientIdLength = 100;

    public const int ClientNameLength = 80;

    public const int RedirectUriLimit = 10;

    public const int RedirectUriLength = 400;

    /// <summary>A client metadata document is a few hundred bytes; anything past this is refused unread.</summary>
    public const int MetadataDocumentBytes = 32 * 1024;

    /// <summary>The whole fetch of a metadata document, body included.</summary>
    public static readonly TimeSpan MetadataFetchTimeout = TimeSpan.FromSeconds(5);

    /// <summary>Documents of never-seen clients fetched at the same moment, all together.</summary>
    public const int MetadataFetchesAtOnce = 4;

    /// <summary>Documents of never-seen clients fetched in a minute, all together (<c>Mcp:MetadataFetchesPerMinute</c>).</summary>
    public const int MetadataFetchesPerMinute = 60;

    /// <summary>Known clients' documents checked again at the same moment, per publishing host.</summary>
    public const int MetadataRechecksAtOncePerHost = 2;

    /// <summary>
    /// Known clients' documents checked again in a minute, per publishing host (<c>Mcp:MetadataRechecksPerHostPerMinute</c>).
    /// One document is checked again at most once per freshness (at least five minutes), so this is room for a host that
    /// publishes several.
    /// </summary>
    public const int MetadataRechecksPerHostPerMinute = 30;

    /// <summary>Known clients' documents checked again at the same moment, all hosts together: the cap on outbound work.</summary>
    public const int MetadataRechecksAtOnce = 8;

    /// <summary>
    /// Known clients' documents checked again in a minute, all hosts together (<c>Mcp:MetadataRechecksPerMinute</c>). Generous
    /// beside what real publishers need - a handful of documents, each about hourly - and a ceiling all the same.
    /// </summary>
    public const int MetadataRechecksPerMinute = 240;

    /// <summary>
    /// The most a document past its freshness may still stand while its ration is spent - and only when its publisher
    /// allowed caching (a max-age, no no-store, no-cache or must-revalidate), and never longer than that max-age.
    /// </summary>
    public static readonly TimeSpan MetadataStaleGrace = TimeSpan.FromMinutes(5);

    /// <summary>How long a fetched document is trusted when its response says nothing; its own max-age is held to the bounds.</summary>
    public static readonly TimeSpan MetadataCacheDefault = TimeSpan.FromHours(1);

    public static readonly TimeSpan MetadataCacheMaximum = TimeSpan.FromHours(24);

    /// <summary>
    /// Dynamic registrations, across every caller, in a minute (<c>Mcp:RegistrationsPerMinute</c> overrides it). Registration
    /// is open by design, so it is bounded.
    /// </summary>
    public const int RegistrationsPerMinute = 30;

    public const int RegistrationBodyBytes = 16 * 1024;

    /// <summary>
    /// A dynamically registered client never used for a connection is removed after this. A metadata-document client
    /// with no connection is removed at the next sweep: it is fetched again the next time anyone connects it.
    /// </summary>
    public static readonly TimeSpan UnusedRegistrationLifetime = TimeSpan.FromDays(1);

    public static readonly TimeSpan MaintenanceInterval = TimeSpan.FromHours(1);

    /// <summary>
    /// The longer side of a picture's preview (issue #56): the whole picture, fitted, as WebP - enough for a client's model to
    /// look at, a few hundred kilobytes at most, and well under what any client's context should spend on one picture.
    /// </summary>
    public const int ImagePreviewSide = 1024;

    /// <summary>
    /// The largest original handed over inline, when one is asked for. Base64 adds a third again, and a tool result is
    /// held whole by the client; an original past this is refused and the preview stands in.
    /// </summary>
    public const long ImageOriginalBytes = 4L * 1024 * 1024;

    /// <summary>Appearance pictures named in one listing at most; more says the list was cut. List first, fetch on demand.</summary>
    public const int ImageListLimit = 100;
}

/// <summary>
/// Registers the MCP connection (ADR 0046): OpenIddict as the OAuth 2.1 authorization server and token validator on the
/// one <see cref="LorEvolveDbContext"/>, the official MCP SDK's Streamable HTTP server, and what binds them to LorEvolve's own
/// accounts and universes.
///
/// OpenIddict's managers are always registered, so Connected Apps can list and revoke what an earlier configuration
/// approved. The authorization server, the token validation and the MCP server exist only when <see cref="McpSite"/> has
/// an origin: without one there is nothing to issue tokens for.
/// </summary>
public static class McpSetup
{
    public const string RegistrationRateLimit = "mcp-client-registration";

    public static IServiceCollection AddLorEvolveMcp(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var site = McpSite.From(configuration, environment);
        services.AddSingleton(site);
        services.AddScoped<McpCaller>();
        services.TryAddSingleton(TimeProvider.System);

        services.AddOpenIddict().AddCore(core => core.UseEntityFrameworkCore().UseDbContext<LorEvolveDbContext>());

        if (!site.IsEnabled)
        {
            return services;
        }

        var plainHttpAllowed = environment.IsDevelopment() || environment.IsEnvironment("Testing");

        services.AddOpenIddict()
            .AddServer(server =>
            {
                server.SetIssuer(site.Issuer);

                // Both discovery documents MCP clients try, one document. The JWKS endpoint is deliberately not exposed:
                // nothing this server issues is a JWT.
                server.SetConfigurationEndpointUris(".well-known/oauth-authorization-server", ".well-known/openid-configuration")
                    .SetAuthorizationEndpointUris("oauth/authorize")
                    .SetTokenEndpointUris("oauth/token")
                    .SetRevocationEndpointUris("oauth/revoke");

                server.AllowAuthorizationCodeFlow().AllowRefreshTokenFlow();

                // PKCE on every request, S256 only (OAuth 2.1, MCP).
                server.RequireProofKeyForCodeExchange();

                server.RegisterScopes(
                    McpLimits.ReadScope, McpLimits.ProposeScope, McpLimits.LegacyReadScope, McpLimits.LegacyProposeScope, Scopes.OfflineAccess);
                server.Configure(options =>
                {
                    options.CodeChallengeMethods.Remove(CodeChallengeMethods.Plain);

                    // Nothing issued here is a JWT, so there are no keys for a client to fetch.
                    options.JsonWebKeySetEndpointUris.Clear();

                    // Not an OpenID provider: no identity tokens, so no "openid" offered or accepted.
                    options.Scopes.Remove(Scopes.OpenId);

                    // Public clients (CIMD, and DCR asking for "none") authenticate with PKCE alone; confidential DCR
                    // clients with their secret. No signed assertions: no client publishes keys to LorEvolve.
                    options.ClientAuthenticationMethods.Remove(ClientAuthenticationMethods.PrivateKeyJwt);
                });

                server.SetAccessTokenLifetime(McpLimits.AccessTokenLifetime)
                    .SetRefreshTokenLifetime(McpLimits.RefreshTokenLifetime)
                    .SetAuthorizationCodeLifetime(McpLimits.AuthorizationCodeLifetime);

                // Opaque tokens: a random reference id, stored hashed, whose payload is a Data Protection blob in the
                // database. Every use is looked up, so a revocation is final at once.
                server.UseReferenceAccessTokens().UseReferenceRefreshTokens();
                server.UseDataProtection();

                // OpenIddict refuses to start without an asymmetric signing key and an encryption key. Every token it
                // issues here is a Data Protection token, so these sign and encrypt nothing that outlives the process.
                server.AddEphemeralEncryptionKey().AddEphemeralSigningKey();

                // A resource is one universe, so the set of resources is not a list to register: each request's
                // resource is checked against this deployment's own shape instead (OAuthServerEvents).
                server.DisableResourceValidation().IgnoreResourcePermissions();

                // Scope permissions stay enforced per client: a client may only ask for the scopes its registration lists
                // (ClientRules.Describe: read and propose). Asking is all a permission allows - what a token carries is
                // decided at consent (ADR 0047). Clients registered before lorevolve.propose existed were given it by the
                // UpgradeMcpClientScopes migration, the same list a registration gets today.

                OAuthServerEvents.Register(server);

                var aspNetCore = server.UseAspNetCore()
                    .EnableAuthorizationEndpointPassthrough()
                    .EnableTokenEndpointPassthrough();

                if (plainHttpAllowed)
                {
                    aspNetCore.DisableTransportSecurityRequirement();
                }
            })
            .AddValidation(validation =>
            {
                validation.UseLocalServer();
                validation.UseDataProtection();

                // A token is only good while its authorization is: revoking a connection ends it on the next request.
                validation.EnableAuthorizationEntryValidation().EnableTokenEntryValidation();

                // The Authorization header only. A token in a URL ends up in logs (MCP: MUST NOT).
                validation.UseAspNetCore()
                    .DisableAccessTokenExtractionFromBodyForm()
                    .DisableAccessTokenExtractionFromQueryString();
            });

        // The consent form's antiforgery token (OAuthEndpoints): its cookie as strict as the session's.
        services.AddAntiforgery(options =>
        {
            options.FormFieldName = OAuthEndpoints.ConsentTokenField;
            options.Cookie.Name = OAuthEndpoints.ConsentTokenCookie;
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = plainHttpAllowed ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        });

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddFixedWindowLimiter(RegistrationRateLimit, limiter =>
            {
                limiter.PermitLimit = configuration.GetValue($"{McpSite.SectionName}:RegistrationsPerMinute", McpLimits.RegistrationsPerMinute);
                limiter.Window = TimeSpan.FromMinutes(1);
                limiter.QueueLimit = 0;
            });
        });

        // A client metadata document is fetched from wherever its client_id says - so only from a public address, over
        // HTTPS, never following a redirect (ClientMetadataDocuments).
        services.AddHttpClient(ClientMetadataDocuments.HttpClientName, client =>
            {
                client.Timeout = McpLimits.MetadataFetchTimeout;
                client.MaxResponseContentBufferSize = McpLimits.MetadataDocumentBytes;
                client.DefaultRequestHeaders.UserAgent.ParseAdd("LorEvolve-OAuth/1.0");
            })
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                UseCookies = false,
                UseProxy = false,
                ConnectTimeout = McpLimits.MetadataFetchTimeout,
                MaxResponseHeadersLength = 16,
                ConnectCallback = ClientMetadataDocuments.ConnectToPublicAddressAsync,
            });
        services.AddSingleton<ClientMetadataFetchLimits>();
        services.AddScoped<ClientMetadataDocuments>();

        services.AddMcpServer(options =>
            {
                options.ServerInfo = new() { Name = "LorEvolve", Version = "1.0.0" };
                options.ServerInstructions = LorEvolveMcpTools.Instructions;
            })
            .WithHttpTransport(transport => transport.SessionMode = ModelContextProtocol.AspNetCore.HttpServerSessionMode.Stateless)
            .WithTools<LorEvolveMcpTools>()
            .WithTools<LorEvolveMcpImageTools>()
            .WithTools<LorEvolveMcpMapTools>()
            .WithTools<LorEvolveMcpProposalTools>()
            .WithRequestFilters(LorEvolveMcpProposalTools.Filters);

        services.AddHostedService<McpMaintenance>();

        return services;
    }

    /// <summary>
    /// After authorization: the consent screen's framing headers, the rate limiter the registration endpoint names, and the
    /// gate in front of every MCP request.
    /// </summary>
    public static WebApplication UseLorEvolveMcp(this WebApplication app)
    {
        if (!app.Services.GetRequiredService<McpSite>().IsEnabled)
        {
            return app;
        }

        // The consent screen and the OAuth endpoints are never shown inside another site's frame.
        app.Use((http, next) =>
        {
            if (http.Request.Path.StartsWithSegments("/connect") || http.Request.Path.StartsWithSegments("/oauth"))
            {
                http.Response.Headers.XFrameOptions = "DENY";
                http.Response.Headers.ContentSecurityPolicy = "frame-ancestors 'none'";
            }

            return next(http);
        });

        app.UseRateLimiter();
        app.UseMcpGate();
        return app;
    }
}
