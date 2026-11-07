using Microsoft.AspNetCore.HttpOverrides;

namespace LorEvolve.Api.Hosting;

/// <summary>
/// Teaches the app to believe the reverse proxy in front of it about the request scheme.
///
/// Azure App Service terminates TLS and forwards plain HTTP to the container, so without this
/// every request looks like <c>http</c> from inside: a Secure session cookie would be dropped
/// and any absolute URL the app builds would be wrong.
///
/// <c>X-Forwarded-Proto</c> and <c>X-Forwarded-For</c> are honoured, and only when configuration
/// turns this on. The proxy's address is not known ahead of time on App Service, so the
/// known-network and known-proxy lists have to be cleared - which means a client talking to the
/// app directly could claim any scheme or address. On App Service nothing reaches the app except
/// through its front end, which appends the client's <c>ip:port</c> as the rightmost value; with
/// <c>ForwardLimit</c> at one, that rightmost value is the only one read, so a client-supplied
/// list is never believed past the hop the front end added. The address feeds
/// <see cref="RateLimits"/> (issue #33, M-2) and nothing else. If the app is ever placed behind a
/// second proxy (Cloudflare in front of App Service), the limit becomes two and the lists name
/// that proxy's ranges.
/// </summary>
public static class ProxyHeaders
{
    public const string EnabledKey = "Hosting:UseForwardedHeaders";

    public static IServiceCollection AddLorEvolveForwardedHeaders(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        if (!configuration.GetValue(EnabledKey, defaultValue: false))
        {
            return services;
        }

        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor;
            options.ForwardLimit = 1;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });

        return services;
    }

    /// <summary>Must run before anything that reads the scheme, so it goes first in the pipeline.</summary>
    public static WebApplication UseLorEvolveForwardedHeaders(this WebApplication app)
    {
        if (app.Configuration.GetValue(EnabledKey, defaultValue: false))
        {
            app.UseForwardedHeaders();
        }

        return app;
    }
}
