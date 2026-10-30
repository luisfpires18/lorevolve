using System.Diagnostics;
using System.Reflection;

namespace LorEvolve.Api.Features.Health;

/// <summary>Liveness surface used by the local launcher, tests and future monitoring.</summary>
public static class HealthEndpoints
{
    /// <summary>
    /// The version the web shows: package.json's (<c>1.0.0-alpha</c>), or on DEV its <c>-dev</c> patch, set in the csproj and
    /// by Deploy DEV. Health and the backup manifest both report it.
    /// </summary>
    public static readonly string BuildVersion =
        typeof(HealthEndpoints).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "unknown";

    /// <summary>
    /// When this process started. The deploy workflows wait for one newer than the deployment, so a release is only called
    /// good once the restarted process answers, not the old one still running beside the upload.
    /// </summary>
    public static readonly DateTimeOffset StartedUtc = Process.GetCurrentProcess().StartTime.ToUniversalTime();

    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapHealthChecks("/health");

        endpoints.MapGet("/api/health", () => Results.Ok(new HealthResponse(
                Status: "healthy",
                Service: "LorEvolve.Api",
                Version: BuildVersion,
                StartedUtc: StartedUtc,
                TimestampUtc: DateTimeOffset.UtcNow)))
            .WithName("GetHealth")
            .WithSummary("Reports API liveness.");

        return endpoints;
    }
}

public sealed record HealthResponse(string Status, string Service, string Version, DateTimeOffset StartedUtc, DateTimeOffset TimestampUtc);
