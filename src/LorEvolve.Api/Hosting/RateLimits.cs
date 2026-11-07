using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace LorEvolve.Api.Hosting;

/// <summary>
/// Per-address ceilings on the routes anyone can call without an account (issue #33, M-2).
///
/// - <see cref="Auth"/>: sign-in, sign-up, forgot and reset password. Identity's lockout is per account; this is per
///   caller, so one address cannot try a password against every account, or mail a reset to each of them in turn.
/// - <see cref="Public"/>: the anonymous portal (lists, pages, pictures, stats, author pages), the sitemap and robots,
///   and the OAuth token route. Generous: Explore fetches about thirty things per visit.
///
/// Fixed one-minute windows, no queue, 429 with <c>Retry-After</c>. The address is
/// <see cref="ConnectionInfo.RemoteIpAddress"/>, which behind App Service is the client's only once
/// <see cref="ProxyHeaders"/> has applied <c>X-Forwarded-For</c>. A request with no address at all (the in-process test
/// server) is not limited: a real connection always has one, and a shared "unknown" bucket would only throttle the test
/// suite against itself. Numbers come from <c>RateLimits:AuthPerMinute</c> and <c>RateLimits:PublicPerMinute</c>, so an
/// operator can tune them without a build.
/// </summary>
public static class RateLimits
{
    public const string Auth = "auth";
    public const string Public = "public";

    public const int AuthPerMinuteDefault = 10;
    public const int PublicPerMinuteDefault = 300;

    public static IServiceCollection AddLorEvolveRateLimits(this IServiceCollection services, IConfiguration configuration)
    {
        var authPerMinute = configuration.GetValue("RateLimits:AuthPerMinute", AuthPerMinuteDefault);
        var publicPerMinute = configuration.GetValue("RateLimits:PublicPerMinute", PublicPerMinuteDefault);

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = (context, _) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter =
                        Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
                }

                return ValueTask.CompletedTask;
            };
            options.AddPolicy(Auth, http => PerAddress(http, authPerMinute));
            options.AddPolicy(Public, http => PerAddress(http, publicPerMinute));
        });

        return services;
    }

    private static RateLimitPartition<string> PerAddress(HttpContext http, int permitLimit)
    {
        var address = http.Connection.RemoteIpAddress?.ToString();
        return address is null
            ? RateLimitPartition.GetNoLimiter("no-address")
            : RateLimitPartition.GetFixedWindowLimiter(address, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permitLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            });
    }
}
