using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Admin;

/// <summary>
/// Makes the owner's account the one Admin (#40), from the server's configuration alone: <c>PlatformAdmin:OwnerUserId</c>
/// (environment <c>PlatformAdmin__OwnerUserId</c>) names the account by its immutable id - never by username, email or
/// display name. Nothing a request carries can reach this.
///
/// <para><b>One Admin, the configured one.</b> Runs once per start, after the schema. In one transaction every other Admin
/// goes back to Member, then the configured account becomes Admin - so changing the setting from one account to another
/// moves the role rather than adding a second holder, and an id that names no account leaves no Admin at all (and says
/// so). The database holds the same line on its own: a filtered unique index allows at most one Admin row, whatever
/// writes it. Safe to repeat. An empty setting changes nothing.</para>
/// </summary>
public sealed partial class PlatformAdminProvisioning(
    LorEvolveDatabaseInitializer database,
    IServiceScopeFactory scopes,
    IConfiguration configuration,
    ILogger<PlatformAdminProvisioning> logger) : IHostedService
{
    public const string OwnerUserIdKey = "PlatformAdmin:OwnerUserId";

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var ownerId = configuration[OwnerUserIdKey]?.Trim();
        if (string.IsNullOrEmpty(ownerId))
        {
            return;
        }

        await database.EnsureSchemaAsync(cancellationToken);
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();

        var (result, demoted) = await ProvisionAsync(db, ownerId, cancellationToken);
        if (demoted > 0)
        {
            LogDemoted(logger, demoted);
        }

        switch (result)
        {
            case ProvisionResult.Granted:
                LogGranted(logger, ownerId);
                break;
            case ProvisionResult.NoSuchAccount:
                LogNoSuchAccount(logger, OwnerUserIdKey);
                break;
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    internal enum ProvisionResult
    {
        Granted,
        AlreadyAdmin,
        NoSuchAccount,
    }

    /// <summary>
    /// Every Admin but <paramref name="ownerId"/> demoted, then <paramref name="ownerId"/> granted, in one transaction - the
    /// demotion first, because the unique index refuses two Admins even for a moment. Returns how many were demoted.
    /// </summary>
    internal static async Task<(ProvisionResult Result, int Demoted)> ProvisionAsync(
        LorEvolveDbContext db,
        string ownerId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var demoted = await db.Users
            .Where(user => user.PlatformRole == PlatformRole.Admin && user.Id != ownerId)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.PlatformRole, PlatformRole.Member), cancellationToken);

        var granted = await db.Users
            .Where(user => user.Id == ownerId && user.PlatformRole != PlatformRole.Admin)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.PlatformRole, PlatformRole.Admin), cancellationToken);

        var result = granted > 0 ? ProvisionResult.Granted
            : await db.Users.AnyAsync(user => user.Id == ownerId, cancellationToken) ? ProvisionResult.AlreadyAdmin
            : ProvisionResult.NoSuchAccount;

        await transaction.CommitAsync(cancellationToken);
        return (result, demoted);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Platform Admin granted to account {UserId} from configuration.")]
    private static partial void LogGranted(ILogger logger, string userId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Key} names no account. No account is Admin.")]
    private static partial void LogNoSuchAccount(ILogger logger, string key);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Count} account(s) that were Admin but are not the configured owner are Members again.")]
    private static partial void LogDemoted(ILogger logger, int count);
}
