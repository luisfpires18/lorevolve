using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// Gives an author address to every account that already has a public universe but no address yet, once, at startup
/// (ADR 0037).
///
/// Addresses are minted when an account first publishes. Accounts that published before author addresses existed
/// (Tasks 008-010) have public worlds and no address; this mints theirs the same way - from the public name they chose,
/// never the username or email - so their worlds keep answering (the public predicate requires an author address)
/// and their names can link somewhere. It does nothing for any account without a public universe: registering never
/// makes anyone publicly addressable.
///
/// Runs before the first request is served, like the search backfill, and waits for the schema first. One query when
/// there is nothing to do. Addresses are chosen one at a time against what is already taken, so two authors of one
/// name get <c>name</c> and <c>name-2</c>, in a fixed order.
/// </summary>
public sealed partial class PublicAuthorBackfill(
    LorEvolveDatabaseInitializer database,
    IServiceScopeFactory scopes,
    ILogger<PublicAuthorBackfill> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await database.EnsureSchemaAsync(cancellationToken);

        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();

        var minted = await BackfillAsync(db, cancellationToken);
        if (minted > 0)
        {
            LogBackfilled(logger, minted);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    internal static async Task<int> BackfillAsync(LorEvolveDbContext db, CancellationToken cancellationToken)
    {
        var authors = await db.Users
            .Where(user => user.PublicAuthorSlug == null
                && user.PublicDisplayName != null
                && db.Universes.Any(universe => universe.OwnerId == user.Id && universe.Visibility == UniverseVisibility.Public))
            .OrderBy(user => user.Id)
            .ToListAsync(cancellationToken);

        foreach (var author in authors)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            author.PublicAuthorSlug = await PublicSlugs.ChooseAsync(
                db.Users.AsNoTracking().Select(user => user.PublicAuthorSlug),
                author.PublicDisplayName!,
                PublicSlugs.AuthorFallback,
                cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        return authors.Count;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Minted public author addresses for {Count} accounts.")]
    private static partial void LogBackfilled(ILogger logger, int count);
}
