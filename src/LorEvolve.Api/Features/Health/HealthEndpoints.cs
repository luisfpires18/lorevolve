using System.Reflection;

namespace LorEvolve.Api.Features.Health;

/// <summary>Liveness surface used by the local launcher, tests and future monitoring.</summary>
public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapHealthChecks("/health");

        endpoints.MapGet("/api/health", () => Results.Ok(new HealthResponse(
                Status: "healthy",
                Service: "LorEvolve.Api",
                Version: Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0",
                TimestampUtc: DateTimeOffset.UtcNow)))
            .WithName("GetHealth")
            .WithSummary("Reports API liveness.");

        return endpoints;
    }
}

public sealed record HealthResponse(string Status, string Service, string Version, DateTimeOffset TimestampUtc);
