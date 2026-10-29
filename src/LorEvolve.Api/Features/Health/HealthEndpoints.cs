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

    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapHealthChecks("/health");

        endpoints.MapGet("/api/health", () => Results.Ok(new HealthResponse(
                Status: "healthy",
                Service: "LorEvolve.Api",
                Version: BuildVersion,
                TimestampUtc: DateTimeOffset.UtcNow)))
            .WithName("GetHealth")
            .WithSummary("Reports API liveness.");

        return endpoints;
    }
}

public sealed record HealthResponse(string Status, string Service, string Version, DateTimeOffset TimestampUtc);
