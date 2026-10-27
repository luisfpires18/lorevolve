using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Data;

/// <summary>
/// Brings the database schema up to date, once per process, before anything else reads a table.
///
/// This exists because startup work is not free to assume a schema. The search-index backfill
/// runs as a hosted service and queries <c>Entities</c>; before this class, migrations were a
/// statement after <c>builder.Build()</c> that only ran in Development, so any other environment
/// started against an empty file and died with <c>no such table: Entities</c>. The test host ran
/// as "Testing" and was caught by the same gate, which is why it used to migrate itself.
///
/// Ordering is a dependency, not a convention. Callers that need the schema take this singleton
/// and await <see cref="EnsureSchemaAsync"/>; whoever asks first does the work and everyone else
/// awaits the same task. Registration order still puts this first among the hosted services, so
/// in practice the later ones await a task that has already completed - but reordering them
/// cannot reintroduce the bug, and nothing sleeps, polls or retries.
/// </summary>
public sealed partial class LorEvolveDatabaseInitializer(
    IServiceScopeFactory scopes,
    IConfiguration configuration,
    ILogger<LorEvolveDatabaseInitializer> logger) : IHostedService
{
    /// <summary>Set to false only when something outside the app applies migrations instead.</summary>
    public const string MigrateOnStartupKey = "Database:MigrateOnStartup";

    private readonly Lock _gate = new();
    private Task? _ready;

    public Task StartAsync(CancellationToken cancellationToken) => EnsureSchemaAsync(cancellationToken);

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    /// <summary>
    /// Completes when the schema is ready for queries. Idempotent: the first caller starts the
    /// work and every later one awaits that same task, so the migration runs at most once.
    ///
    /// The cancellation token of the first caller is the one that governs. Every caller here is
    /// host startup, sharing the host's own start token, so there is no second lifetime to honour.
    /// </summary>
    public Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            return _ready ??= MigrateAsync(cancellationToken);
        }
    }

    private async Task MigrateAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        var dataSource = db.Database.GetDbConnection().DataSource;

        if (!configuration.GetValue(MigrateOnStartupKey, defaultValue: true))
        {
            LogMigrationsSkipped(logger, MigrateOnStartupKey, dataSource);
            return;
        }

        var pending = (await db.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();
        if (pending.Count == 0)
        {
            LogSchemaUpToDate(logger, dataSource);
            return;
        }

        LogApplyingMigrations(logger, pending.Count, dataSource, pending[^1]);

        await db.Database.MigrateAsync(cancellationToken);
    }

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "{Key} is false: starting against '{DataSource}' without applying migrations. "
            + "Whatever deploys this is responsible for the schema.")]
    private static partial void LogMigrationsSkipped(ILogger logger, string key, string dataSource);

    [LoggerMessage(Level = LogLevel.Information, Message = "Database schema at '{DataSource}' is up to date.")]
    private static partial void LogSchemaUpToDate(ILogger logger, string dataSource);

    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Applying {Count} migration(s) to '{DataSource}', up to {Latest}.")]
    private static partial void LogApplyingMigrations(ILogger logger, int count, string dataSource, string latest);
}
