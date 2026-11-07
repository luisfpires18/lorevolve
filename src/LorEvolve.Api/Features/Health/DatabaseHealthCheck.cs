using LorEvolve.Api.Data;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace LorEvolve.Api.Features.Health;

/// <summary>
/// Can the database be opened? One connection open and close, nothing read. App Service probes <c>/health</c> and the
/// deploy workflows gate on it, so a SQLite file on an unreachable <c>/home</c> share now fails the probe (F46).
/// </summary>
public sealed class DatabaseHealthCheck(LorEvolveDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            return await db.Database.CanConnectAsync(cancellationToken)
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy("The database cannot be opened.");
        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy("The database cannot be opened.", exception);
        }
    }
}
