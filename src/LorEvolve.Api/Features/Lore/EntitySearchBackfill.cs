using LorEvolve.Api.Data;

namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// Fills the search index for entries that have no row in it, once, at startup.
///
/// This is how lore written before full-text search existed becomes findable, and how a future
/// change to what is indexed gets picked up: the migration that changes the index empties the
/// table, and the next start rebuilds it. It is not a maintenance command and not a button in
/// Settings - an index the author has to remember to rebuild is an index that quietly lies about
/// what a universe contains.
///
/// Runs before the first request is served, and does one query when there is nothing to do. It
/// waits on <see cref="LorEvolveDatabaseInitializer"/> first, because it reads <c>Entities</c> and a
/// schema is not something startup work may assume. It still fails loudly if the tables are not
/// there afterwards, because a start that carried on would answer every search with an error
/// instead.
/// </summary>
public sealed partial class EntitySearchBackfill(
    LorEvolveDatabaseInitializer database,
    IServiceScopeFactory scopes,
    ILogger<EntitySearchBackfill> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await database.EnsureSchemaAsync(cancellationToken);

        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();

        var indexed = await EntitySearchIndex.BackfillAsync(db, cancellationToken);
        if (indexed > 0)
        {
            LogBackfilled(logger, indexed);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    [LoggerMessage(Level = LogLevel.Information, Message = "Search index backfilled {Count} entries.")]
    private static partial void LogBackfilled(ILogger logger, int count);
}

public static class LoreSearchSetup
{
    public static IServiceCollection AddLoreSearch(this IServiceCollection services)
    {
        services.AddHostedService<EntitySearchBackfill>();
        return services;
    }
}
