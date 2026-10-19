using System.Text.Json;
using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;
using OpenIddict.EntityFrameworkCore.Models;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace Lorex.Api.Features.Mcp;

/// <summary>
/// Keeps the OAuth tables to what is still needed (ADR 0046), once an hour, after the schema is ready:
///
/// <list type="bullet">
/// <item>an authorization whose connection is gone - its universe or account deleted - is revoked, so nothing could ever
/// refresh it even past the token endpoint's own check;</item>
/// <item>OpenIddict's own pruning removes expired, redeemed and revoked tokens and dead authorizations a while after they
/// stopped mattering;</item>
/// <item>a dynamic registration never used for a connection is removed after a day, so open registration cannot grow the
/// table without bound.</item>
/// </list>
///
/// Best effort: a failed sweep is logged and the next one tries again. Nothing a request relies on waits for it.
/// </summary>
internal sealed partial class McpMaintenance(
    IServiceScopeFactory scopes,
    LorexDatabaseInitializer database,
    TimeProvider clock,
    ILogger<McpMaintenance> logger) : BackgroundService
{
    /// <summary>How long after they stopped mattering OpenIddict's dead rows are kept, for diagnosing a refused refresh.</summary>
    private static readonly TimeSpan PruneAfter = TimeSpan.FromDays(7);

    /// <summary>The most unused registrations looked at in one sweep.</summary>
    private const int RegistrationBatch = 500;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await database.EnsureSchemaAsync(stoppingToken);

        using var timer = new PeriodicTimer(McpLimits.MaintenanceInterval, clock);
        do
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                LogSweepFailed(logger, exception);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    internal async Task SweepAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var db = services.GetRequiredService<LorexDbContext>();
        var authorizations = services.GetRequiredService<IOpenIddictAuthorizationManager>();
        var tokens = services.GetRequiredService<IOpenIddictTokenManager>();
        var applications = services.GetRequiredService<IOpenIddictApplicationManager>();
        var now = clock.GetUtcNow();

        var orphans = await db.Set<OpenIddictEntityFrameworkCoreAuthorization>().AsNoTracking()
            .Where(authorization => authorization.Status == Statuses.Valid
                && !db.McpConnections.Any(connection => connection.AuthorizationId == authorization.Id))
            .Select(authorization => authorization.Id!)
            .ToListAsync(cancellationToken);

        foreach (var id in orphans)
        {
            if (await authorizations.FindByIdAsync(id, cancellationToken) is { } authorization)
            {
                await authorizations.TryRevokeAsync(authorization, cancellationToken);
            }

            await tokens.RevokeByAuthorizationIdAsync(id, cancellationToken);
        }

        await tokens.PruneAsync(now - PruneAfter, cancellationToken);
        await authorizations.PruneAsync(now - PruneAfter, cancellationToken);

        var unused = await db.Set<OpenIddictEntityFrameworkCoreApplication>().AsNoTracking()
            .Where(application => application.ClientId!.StartsWith(ClientRegistrationEndpoints.ClientIdPrefix)
                && !db.Set<OpenIddictEntityFrameworkCoreAuthorization>().Any(authorization => authorization.Application!.Id == application.Id))
            .Select(application => new { application.ClientId, application.Properties })
            .Take(RegistrationBatch)
            .ToListAsync(cancellationToken);

        foreach (var candidate in unused.Where(candidate => RegisteredBefore(candidate.Properties, now - McpLimits.UnusedRegistrationLifetime)))
        {
            if (await applications.FindByClientIdAsync(candidate.ClientId!, cancellationToken) is { } application)
            {
                await applications.DeleteAsync(application, cancellationToken);
            }
        }
    }

    private static bool RegisteredBefore(string? properties, DateTimeOffset threshold)
    {
        if (string.IsNullOrEmpty(properties))
        {
            return true;
        }

        using var json = JsonDocument.Parse(properties);
        return !json.RootElement.TryGetProperty(ClientRules.RegisteredAtProperty, out var registered)
            || !registered.TryGetDateTimeOffset(out var at)
            || at < threshold;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The MCP maintenance sweep failed; the next one will try again.")]
    private static partial void LogSweepFailed(ILogger logger, Exception exception);
}
