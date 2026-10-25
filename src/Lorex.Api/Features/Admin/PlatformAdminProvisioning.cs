using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Admin;

/// <summary>
/// Makes the owner's account an Admin (#40), from the server's configuration alone: <c>PlatformAdmin:OwnerUserId</c>
/// (environment <c>PlatformAdmin__OwnerUserId</c>) names the account by its immutable id - never by username, email or
/// display name. Nothing a request carries can reach this.
///
/// Runs once per start, after the schema, and is safe to repeat: an account that is already Admin is left as it is, an id
/// that names no account grants nothing and says so, and an empty setting does nothing. It only ever grants; it never
/// demotes anyone, and removing the setting afterwards leaves the role where it is.
/// </summary>
public sealed partial class PlatformAdminProvisioning(
    LorexDatabaseInitializer database,
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
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();

        switch (await ProvisionAsync(db, ownerId, cancellationToken))
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

    /// <summary>One conditional update by id; a second run, or two at once, changes nothing more.</summary>
    internal static async Task<ProvisionResult> ProvisionAsync(LorexDbContext db, string ownerId, CancellationToken cancellationToken)
    {
        var granted = await db.Users
            .Where(user => user.Id == ownerId && user.PlatformRole != PlatformRole.Admin)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.PlatformRole, PlatformRole.Admin), cancellationToken);

        if (granted > 0)
        {
            return ProvisionResult.Granted;
        }

        return await db.Users.AnyAsync(user => user.Id == ownerId, cancellationToken)
            ? ProvisionResult.AlreadyAdmin
            : ProvisionResult.NoSuchAccount;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Platform Admin granted to account {UserId} from configuration.")]
    private static partial void LogGranted(ILogger logger, string userId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Key} names no account. No Admin was granted.")]
    private static partial void LogNoSuchAccount(ILogger logger, string key);
}
