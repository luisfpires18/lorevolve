namespace LorEvolve.Api.Hosting;

/// <summary>
/// The headers every response carries (issue #33, M-4). Before this, only the MCP consent pages refused framing and only
/// image responses said <c>nosniff</c>.
///
/// - <c>nosniff</c>: a browser never second-guesses a declared content type.
/// - <c>X-Frame-Options: DENY</c> and CSP <c>frame-ancestors 'none'</c>: no other site can frame LorEvolve.
/// - <c>Referrer-Policy: same-origin</c>: an invitation link (<c>/invite/{token}</c>) or any private address never leaves
///   in a <c>Referer</c> when an author follows a link out of an article.
/// - CSP <c>object-src 'none'; base-uri 'self'; form-action 'self'</c>: no plugins, an injected <c>&lt;base&gt;</c>
///   cannot re-point relative URLs, and an injected form cannot post anywhere else.
/// - <c>Permissions-Policy</c>: no camera, microphone or location; nothing here asks for them.
/// - HSTS outside Development (ASP.NET Core's own; it skips localhost), one year. Not <c>includeSubDomains</c>: that
///   would bind every <c>*.lorevolve.com</c> for a year, and the demo site is served by another host.
///
/// The CSP deliberately says nothing about scripts or styles: the shell's <c>index.html</c> carries inline scripts and a
/// style block, and a script policy needs hashes for them first. That is a recorded follow-up, not an oversight.
///
/// Written when the response starts, so a refusal, a file, the app shell and the exception handler's 500 (which clears
/// headers) all carry them. A header a route set for itself - the consent page's own CSP - is left alone.
/// </summary>
public static class SecurityHeaders
{
    public const string ContentSecurityPolicy = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

    public const string PermissionsPolicy = "camera=(), microphone=(), geolocation=()";

    public const string ReferrerPolicy = "same-origin";

    /// <summary>After the forwarded headers (HSTS needs the real scheme), before anything that answers.</summary>
    public static IServiceCollection AddLorEvolveSecurityHeaders(this IServiceCollection services) =>
        services.AddHsts(options => options.MaxAge = TimeSpan.FromDays(365));

    public static WebApplication UseLorEvolveSecurityHeaders(this WebApplication app)
    {
        if (!app.Environment.IsDevelopment())
        {
            app.UseHsts();
        }

        app.Use((http, next) =>
        {
            http.Response.OnStarting(() =>
            {
                var headers = http.Response.Headers;
                headers.TryAdd("X-Content-Type-Options", "nosniff");
                headers.TryAdd("X-Frame-Options", "DENY");
                headers.TryAdd("Content-Security-Policy", ContentSecurityPolicy);
                headers.TryAdd("Referrer-Policy", ReferrerPolicy);
                headers.TryAdd("Permissions-Policy", PermissionsPolicy);
                return Task.CompletedTask;
            });
            return next(http);
        });

        return app;
    }
}
