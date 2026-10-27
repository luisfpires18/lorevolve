using Microsoft.AspNetCore.HttpOverrides;

namespace LorEvolve.Api.Hosting;

/// <summary>
/// Teaches the app to believe the reverse proxy in front of it about the request scheme.
///
/// Azure App Service terminates TLS and forwards plain HTTP to the container, so without this
/// every request looks like <c>http</c> from inside: a Secure session cookie would be dropped
/// and any absolute URL the app builds would be wrong.
///
/// Only <c>X-Forwarded-Proto</c> is honoured, and only when configuration turns this on. The
/// proxy's address is not known ahead of time on App Service, so the known-network and
/// known-proxy lists have to be cleared - which means a client talking to the app directly
/// could claim any scheme. That is acceptable for exactly one header whose only effect is to
/// make the app stricter (an <c>https</c> claim adds Secure, it never removes it), and is why
/// <c>X-Forwarded-For</c> is deliberately not forwarded: nothing here reads the client address,
/// so accepting a spoofable one would buy nothing.
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
            options.ForwardedHeaders = ForwardedHeaders.XForwardedProto;
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
