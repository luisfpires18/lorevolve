using Microsoft.AspNetCore.ResponseCompression;

namespace LorEvolve.Api.Hosting;

/// <summary>
/// Brotli, then gzip, for text responses (performance audit 2026-10-29, P01). Before this, the 263 KB stylesheet and the
/// 309 KB entry script went out raw on every first visit; a phone on a slow line moved about 1 MB before it could draw.
///
/// On over HTTPS on purpose, so the BREACH reasoning is written down:
/// - BREACH needs a secret in a compressed body beside text an attacker can make the page reflect. The session is an
///   HttpOnly cookie and is never written into a body.
/// - The bodies that do carry tokens - <c>/oauth</c> (tokens, codes) and <c>/mcp</c> (its streamed answers too) - are
///   left out by path.
/// - An invitation's claim token appears only in owner-only JSON with no attacker-controlled text beside it.
///
/// Both providers stay at their default <c>Fastest</c> level: milliseconds for the stylesheet even on F1's CPU, paid once
/// per browser per deploy because <c>/assets</c> is <c>immutable</c>. Already-compressed types (images, zip exports) are
/// not in the list and pass untouched.
/// </summary>
public static class ResponseCompression
{
    public static IServiceCollection AddLorEvolveResponseCompression(this IServiceCollection services) =>
        services.AddResponseCompression(options =>
        {
            options.EnableForHttps = true;
            options.Providers.Add<BrotliCompressionProvider>();
            options.Providers.Add<GzipCompressionProvider>();
            options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(
            [
                "text/javascript",
                "application/manifest+json",
                "application/problem+json",
                "image/svg+xml",
            ]);
        });

    /// <summary>Before the static files and every endpoint, so the client and the API are both compressed.</summary>
    public static WebApplication UseLorEvolveResponseCompression(this WebApplication app)
    {
        app.UseWhen(
            http => !http.Request.Path.StartsWithSegments("/oauth") && !http.Request.Path.StartsWithSegments("/mcp"),
            branch => branch.UseResponseCompression());
        return app;
    }
}
