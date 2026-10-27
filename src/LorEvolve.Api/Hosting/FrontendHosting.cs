using LorEvolve.Api.Features.Seo;
using Microsoft.AspNetCore.StaticFiles;

namespace LorEvolve.Api.Hosting;

/// <summary>
/// Serves the built React client from the API's own <c>wwwroot</c>, so a deployment is one
/// process on one origin: no CORS, no second host, and the session cookie stays same-origin
/// exactly as it is behind the Vite proxy in development.
///
/// Everything here is conditional on <c>wwwroot/index.html</c> actually being present. The
/// frontend is copied in at publish time and is not part of the repository, so development and
/// the test host see no static-file middleware and no fallback route at all - their behaviour
/// is unchanged.
/// </summary>
public static partial class FrontendHosting
{
    /// <summary>True when a built client has been published alongside the API.</summary>
    public static bool HasBuiltFrontend(this IWebHostEnvironment environment) =>
        !string.IsNullOrEmpty(environment.WebRootPath)
        && File.Exists(Path.Combine(environment.WebRootPath, "index.html"));

    /// <summary>
    /// Static files, before authentication: build output is public by definition, and the app
    /// shell has to load before anyone can sign in.
    /// </summary>
    public static WebApplication UseLorEvolveFrontend(this WebApplication app)
    {
        if (!app.Environment.HasBuiltFrontend())
        {
            return app;
        }

        app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = SetCacheHeaders });
        return app;
    }

    /// <summary>
    /// The client-side routing fallback. Mapped after every API route, and paired with a
    /// catch-all under <c>/api</c> so an unknown API path stays a 404 instead of being answered
    /// with the app shell and a 200.
    ///
    /// The shell is the built <c>index.html</c> with each page's head written in on the server
    /// (<see cref="SeoEndpoints.RenderShellAsync"/>, ADR 0038), so a crawler or link preview that
    /// runs no JavaScript still reads a public page's title, description and Open Graph. The
    /// template is <c>Frontend:ShellPath</c> when configured (development points it at the source
    /// <c>index.html</c> so the head can be checked over HTTP), else <c>wwwroot/index.html</c>.
    /// </summary>
    public static WebApplication MapLorEvolveFrontendFallback(this WebApplication app)
    {
        var shellPath = ShellPath(app);
        if (shellPath is null)
        {
            return app;
        }

        var template = new ShellTemplate(File.ReadAllText(shellPath));
        if (!template.HasMarkers)
        {
            LogNoMarkers(app.Logger, shellPath);
        }

        app.Map("/api/{**path}", () => Results.NotFound());

        // "/" is LorEvolve's home page (031), answered by the shell like every other page, with its own head. Paths that look
        // like files ("nonfile" excludes them) stay 404s, as MapFallbackToFile left them.
        app.MapFallback("{*path:nonfile}", context => SeoEndpoints.RenderShellAsync(context, template)).AllowAnonymous();
        return app;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The app shell at {Path} has no lorevolve:head markers; pages are served without their own metadata.")]
    private static partial void LogNoMarkers(ILogger logger, string path);

    private static string? ShellPath(WebApplication app)
    {
        var configured = app.Configuration["Frontend:ShellPath"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            var full = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, configured));
            return File.Exists(full) ? full : null;
        }

        return app.Environment.HasBuiltFrontend() ? Path.Combine(app.Environment.WebRootPath, "index.html") : null;
    }

    /// <summary>
    /// Vite content-hashes everything under <c>/assets/</c>, so those URLs are immutable and can
    /// be cached for a year. Everything else - the app shell, the manifest, the icons and above
    /// all <c>sw.js</c> - is revalidated on every load, because a stale service worker or a stale
    /// index.html would pin a browser to a frontend build the API no longer matches.
    /// </summary>
    private static void SetCacheHeaders(StaticFileResponseContext context)
    {
        var isHashedAsset = context.Context.Request.Path.StartsWithSegments("/assets");
        context.Context.Response.Headers.CacheControl = isHashedAsset
            ? "public, max-age=31536000, immutable"
            : "no-cache";
    }
}
