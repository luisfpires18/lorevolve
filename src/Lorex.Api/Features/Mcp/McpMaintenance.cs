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
/// <item>a dynamic registration never used for a connection is removed after a day, and a metadata-document client with
/// no connection at once, so neither open registration nor fetching can grow the table without bound.</item>
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

    /// <summary>Unused clients removed per round of a sweep; a sweep goes round until none are left.</summary>
    private const int UnusedBatch = 500;

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

        // Clients nobody connected: registrations older than a day (their ids sort by when they were made), and every
        // metadata-document client - it is fetched again when someone connects it. In batches, until none are left, so a
        // sweep removes at least as many as open registration and fetching can make in an hour.
        var registrationsFrom = ClientRegistrationEndpoints.ClientIdPrefix;
        var registrationsBefore = ClientRegistrationEndpoints.AgeBound(now - McpLimits.UnusedRegistrationLifetime);
        while (true)
        {
            var unused = await db.Set<OpenIddictEntityFrameworkCoreApplication>().AsNoTracking()
                .Where(application => ((application.ClientId!.CompareTo(registrationsFrom) >= 0 && application.ClientId.CompareTo(registrationsBefore) < 0)
                        || application.ClientId.StartsWith("https://"))
                    && !db.Set<OpenIddictEntityFrameworkCoreAuthorization>().Any(authorization => authorization.Application!.Id == application.Id))
                .Select(application => application.ClientId!)
                .Take(UnusedBatch)
                .ToListAsync(cancellationToken);

            foreach (var clientId in unused)
            {
                if (await applications.FindByClientIdAsync(clientId, cancellationToken) is { } application)
                {
                    await applications.DeleteAsync(application, cancellationToken);
                }
            }

            if (unused.Count < UnusedBatch)
            {
                return;
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The MCP maintenance sweep failed; the next one will try again.")]
    private static partial void LogSweepFailed(ILogger logger, Exception exception);
}
