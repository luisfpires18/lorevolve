using System.Globalization;
using System.Reflection;
using System.Text.Json;
using LorEvolve.Api.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LorEvolve.Api.Features.DatabaseBackups;

/// <summary>What this host was given: a store, or the reason it has none. Never a credential.</summary>
public sealed record DatabaseBackupTarget(IDatabaseBackupStore? Store, string? Problem);

/// <summary>The last verified backup, read from the store's own manifests - what is actually off the host.</summary>
public sealed record VerifiedBackup(string Key, DateTime CreatedAt, long Bytes, string Sha256, string? SchemaVersion);

/// <summary>One attempt and how it ended. <see cref="Error"/> is one line with nothing secret in it.</summary>
public sealed record BackupAttempt(string Trigger, DateTime StartedAt, DateTime? FinishedAt, string Outcome, string? Error, string? Key);

/// <summary>Everything Admin and the logs say about database backups.</summary>
public sealed record DatabaseBackupStatus(
    bool Enabled,
    bool Automatic,
    string? Environment,
    string? Store,
    string? Problem,
    bool Running,
    BackupAttempt? LastAttempt,
    int ConsecutiveFailures,
    VerifiedBackup? LastVerified,
    double? LastVerifiedAgeHours,
    bool Stale,
    int VerifiedCount,
    long StoredBytes,
    double IntervalHours,
    bool PruneEnabled,
    int? LastPruned,
    DateTime? CheckedAt);

/// <summary>
/// One backup run, end to end (issue #54, ADR 0064): snapshot through the SQLite backup API, integrity check, gzip, upload,
/// read the object back and compare its SHA-256, then - and only then - the manifest, read back too. A run that fails at any
/// step writes no manifest, so nothing half-done ever reads as a backup; its stray object is removed, or swept later.
///
/// One run at a time in this process. A second process (the minutes of a deploy when two may overlap) can at worst take a
/// second, separately keyed backup: keys carry the second and a random suffix, and pruning only ever deletes by policy.
/// </summary>
public sealed partial class DatabaseBackupRunner(
    IServiceScopeFactory scopes,
    IOptions<DatabaseBackupOptions> options,
    DatabaseBackupTarget target,
    TimeProvider clock,
    ILogger<DatabaseBackupRunner> logger) : IDisposable
{
    public const string ManifestSuffix = ".manifest.json";
    public const string DataSuffix = ".db.gz";

    /// <summary>After a failure, the schedule waits this long before trying again, so a broken store is not hammered.</summary>
    public static readonly TimeSpan RetryAfterFailure = TimeSpan.FromHours(1);

    private static readonly string AppVersion =
        typeof(DatabaseBackupRunner).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "unknown";

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Lock _state = new();
    private BackupAttempt? _lastAttempt;
    private int _failures;
    private VerifiedBackup? _lastVerified;
    private int _verifiedCount;
    private long _storedBytes;
    private int? _lastPruned;
    private DateTime? _checkedAt;
    private Task<BackupAttempt>? _current;

    private DatabaseBackupOptions Options => options.Value;

    public void Dispose() => _gate.Dispose();

    private string EnvironmentPrefix => $"{Options.Prefix.Trim('/')}/{Options.Environment}/";

    public bool IsReady => Options.Enabled && target.Store is not null;

    /// <summary>The run in progress, if any - for a caller that started one and wants its end.</summary>
    public Task<BackupAttempt>? Current
    {
        get
        {
            lock (_state)
            {
                return _current;
            }
        }
    }

    public DatabaseBackupStatus Status()
    {
        lock (_state)
        {
            var now = clock.GetUtcNow().UtcDateTime;
            double? age = _lastVerified is { } verified ? Math.Round((now - verified.CreatedAt).TotalHours, 2) : null;
            return new DatabaseBackupStatus(
                Options.Enabled,
                Options.Automatic,
                Options.Environment,
                target.Store?.Describe,
                Options.Enabled ? target.Problem : null,
                _current is { IsCompleted: false },
                _lastAttempt,
                _failures,
                _lastVerified,
                age,
                IsReady && (_lastVerified is null || now - _lastVerified.CreatedAt > Options.StaleAfter),
                _verifiedCount,
                _storedBytes,
                Options.Interval.TotalHours,
                Options.Retention.PruneEnabled,
                _lastPruned,
                _checkedAt);
        }
    }

    /// <summary>Due when nothing verified exists or the newest is an interval old - unless the last attempt failed within the hour.</summary>
    public bool IsDue()
    {
        lock (_state)
        {
            var now = clock.GetUtcNow().UtcDateTime;
            if (_lastAttempt is { Outcome: "Failed", StartedAt: var failedAt } && now - failedAt < RetryAfterFailure)
            {
                return false;
            }

            return _lastVerified is null || now - _lastVerified.CreatedAt >= Options.Interval;
        }
    }

    /// <summary>Reads what the store holds: the newest manifest, how many there are and what they occupy.</summary>
    public async Task RefreshAsync(CancellationToken cancellationToken)
    {
        if (target.Store is not { } store || !Options.Enabled)
        {
            return;
        }

        var objects = await store.ListAsync(EnvironmentPrefix, cancellationToken);
        var manifests = objects.Where(item => item.Key.EndsWith(ManifestSuffix, StringComparison.Ordinal))
            .OrderByDescending(item => item.Key, StringComparer.Ordinal)
            .ToList();
        VerifiedBackup? newest = null;
        foreach (var candidate in manifests)
        {
            if (await ReadManifestAsync(store, candidate.Key, cancellationToken) is { } manifest)
            {
                newest = new VerifiedBackup(
                    manifest.StoredObject.Key, manifest.CreatedAt, manifest.StoredObject.Bytes, manifest.StoredObject.Sha256, manifest.Database.SchemaVersion);
                break;
            }
        }

        lock (_state)
        {
            _lastVerified = newest;
            _verifiedCount = manifests.Count;
            _storedBytes = objects.Sum(item => item.Size);
            _checkedAt = clock.GetUtcNow().UtcDateTime;
        }
    }

    /// <summary>Starts a run unless one is going: the run, or null when busy or not configured.</summary>
    public Task<BackupAttempt>? TryStart(string trigger, CancellationToken cancellationToken)
    {
        if (!IsReady || !_gate.Wait(0, CancellationToken.None))
        {
            return null;
        }

        var run = RunHeldAsync(trigger, cancellationToken);
        lock (_state)
        {
            _current = run;
        }

        return run;
    }

    private async Task<BackupAttempt> RunHeldAsync(string trigger, CancellationToken cancellationToken)
    {
        try
        {
            await Task.Yield();
            return await RunAsync(trigger, cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<BackupAttempt> RunAsync(string trigger, CancellationToken cancellationToken)
    {
        var store = target.Store!;
        var started = clock.GetUtcNow().UtcDateTime;
        var attempt = new BackupAttempt(trigger, started, null, "Running", null, null);
        lock (_state)
        {
            _lastAttempt = attempt;
        }

        var stamp = started.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        var name = $"{EnvironmentPrefix}{started:yyyy}/{started:MM}/{stamp}-{Guid.NewGuid().ToString("N")[..8]}";
        var dataKey = name + DataSuffix;
        var manifestKey = name + ManifestSuffix;
        var workDirectory = Path.Combine(Options.WorkingDirectory ?? Path.GetTempPath(), "lorevolve-db-backup", Guid.NewGuid().ToString("N"));
        var uploaded = false;
        var verified = false;

        try
        {
            DatabaseSnapshotFile snapshot;
            string dataSource;
            await using (var scope = scopes.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
                var connection = (SqliteConnection)db.Database.GetDbConnection();
                dataSource = connection.DataSource;
                snapshot = await DatabaseSnapshot.CreateAsync(connection, workDirectory, db.Database.GetMigrations().LastOrDefault(), cancellationToken);
            }

            await using (var upload = File.OpenRead(snapshot.CompressedPath))
            {
                await store.PutAsync(dataKey, upload, "application/gzip", cancellationToken);
                uploaded = true;
            }

            await using (var readBack = await store.OpenAsync(dataKey, cancellationToken)
                ?? throw new DatabaseBackupException("The uploaded snapshot could not be read back."))
            {
                var (bytes, sha) = await DatabaseSnapshot.HashAsync(readBack, cancellationToken);
                if (bytes != snapshot.CompressedBytes || sha != snapshot.CompressedSha256)
                {
                    throw new DatabaseBackupException("The uploaded snapshot did not read back as it was sent.");
                }
            }

            var manifest = new DatabaseBackupManifest(
                DatabaseBackupManifest.FormatName,
                DatabaseBackupManifest.CurrentVersion,
                Options.Environment!,
                started,
                clock.GetUtcNow().UtcDateTime,
                trigger,
                new DatabaseBackupProvenance(AppVersion, System.Environment.MachineName, System.Environment.GetEnvironmentVariable("WEBSITE_SITE_NAME"), dataSource, snapshot.SourceJournalMode),
                snapshot.Database,
                new DatabaseBackupObject(dataKey, "gzip", snapshot.CompressedBytes, snapshot.CompressedSha256));

            using (var json = new MemoryStream(JsonSerializer.SerializeToUtf8Bytes(manifest, DatabaseBackupManifest.Json)))
            {
                await store.PutAsync(manifestKey, json, "application/json", cancellationToken);
            }

            if (await ReadManifestAsync(store, manifestKey, cancellationToken) is not { } stored || stored.StoredObject.Sha256 != snapshot.CompressedSha256)
            {
                throw new DatabaseBackupException("The manifest did not read back as it was sent.");
            }

            verified = true;
            attempt = attempt with { FinishedAt = clock.GetUtcNow().UtcDateTime, Outcome = "Succeeded", Key = dataKey };
            lock (_state)
            {
                _lastAttempt = attempt;
                _failures = 0;
            }

            LogSucceeded(logger, dataKey, snapshot.CompressedBytes, snapshot.Database.Bytes, snapshot.Database.SchemaVersion, (attempt.FinishedAt!.Value - started).TotalSeconds);

            if (Options.Retention.PruneEnabled)
            {
                await PruneSafelyAsync(store, cancellationToken);
            }

            await RefreshSafelyAsync(cancellationToken);
            return attempt;
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            var reason = Explain(exception);
            attempt = attempt with { FinishedAt = clock.GetUtcNow().UtcDateTime, Outcome = "Failed", Error = reason };
            int failures;
            lock (_state)
            {
                _lastAttempt = attempt;
                failures = ++_failures;
            }

            LogFailed(logger, exception, trigger, failures, reason);
            if (uploaded && !verified)
            {
                await DeleteQuietlyAsync(store, dataKey);
            }

            return attempt;
        }
        finally
        {
            try
            {
                if (Directory.Exists(workDirectory))
                {
                    Directory.Delete(workDirectory, recursive: true);
                }
            }
            catch (IOException exception)
            {
                LogCleanupFailed(logger, exception, workDirectory);
            }
        }
    }

    private async Task RefreshSafelyAsync(CancellationToken cancellationToken)
    {
        try
        {
            await RefreshAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // The backup is already verified; a failed listing must not record it as failed and trigger a duplicate run.
            LogRefreshFailed(logger, exception, Explain(exception));
        }
    }

    private async Task PruneSafelyAsync(IDatabaseBackupStore store, CancellationToken cancellationToken)
    {
        try
        {
            var deleted = await PruneAsync(store, cancellationToken);
            lock (_state)
            {
                _lastPruned = deleted;
            }

            if (deleted > 0)
            {
                LogPruned(logger, deleted);
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // A backup that was just verified stays a success; pruning tries again after the next one.
            LogPruneFailed(logger, exception, Explain(exception));
        }
    }

    /// <summary>
    /// The retention policy of ADR 0064, applied to this environment's prefix only: keep the newest few, everything younger
    /// than the window, and the first backup of each recent month; delete the rest manifest first, so a backup stops counting
    /// as verified before its object goes. An object with no manifest a day after it was written is an interrupted run's.
    /// </summary>
    public async Task<int> PruneAsync(IDatabaseBackupStore store, CancellationToken cancellationToken)
    {
        var retention = Options.Retention;
        var now = clock.GetUtcNow().UtcDateTime;
        var objects = await store.ListAsync(EnvironmentPrefix, cancellationToken);
        var backups = objects
            .Where(item => item.Key.EndsWith(ManifestSuffix, StringComparison.Ordinal))
            .Select(item => (Manifest: item.Key, Data: item.Key[..^ManifestSuffix.Length] + DataSuffix, CreatedAt: StampOf(item.Key)))
            .Where(item => item.CreatedAt is not null)
            .OrderByDescending(item => item.CreatedAt)
            .ToList();

        var keep = new HashSet<string>(StringComparer.Ordinal);
        foreach (var backup in backups.Take(Math.Max(1, retention.KeepNewest)))
        {
            keep.Add(backup.Manifest);
        }

        foreach (var backup in backups.Where(item => now - item.CreatedAt!.Value < TimeSpan.FromDays(retention.KeepDays)))
        {
            keep.Add(backup.Manifest);
        }

        var firstOfMonth = backups
            .GroupBy(item => (item.CreatedAt!.Value.Year, item.CreatedAt.Value.Month))
            .Where(month => (now.Year - month.Key.Year) * 12 + now.Month - month.Key.Month < retention.KeepMonths)
            .Select(month => month.MinBy(item => item.CreatedAt)!.Manifest);
        keep.UnionWith(firstOfMonth);

        var deleted = 0;
        foreach (var backup in backups.Where(item => !keep.Contains(item.Manifest)))
        {
            await store.DeleteAsync(backup.Manifest, cancellationToken);
            await store.DeleteAsync(backup.Data, cancellationToken);
            deleted++;
        }

        var manifests = backups.Select(item => item.Data).ToHashSet(StringComparer.Ordinal);
        foreach (var orphan in objects.Where(item => item.Key.EndsWith(DataSuffix, StringComparison.Ordinal)
                     && !manifests.Contains(item.Key)
                     && now - item.LastModified > TimeSpan.FromDays(1)))
        {
            await store.DeleteAsync(orphan.Key, cancellationToken);
            deleted++;
        }

        return deleted;
    }

    /// <summary>When a backup was taken, from its key's stamp (<c>yyyyMMddTHHmmssZ-xxxxxxxx</c>), or null for a foreign key.</summary>
    public static DateTime? StampOf(string key)
    {
        var name = key[(key.LastIndexOf('/') + 1)..];
        return name.Length >= 16 && DateTime.TryParseExact(
            name[..16], "yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var stamp)
            ? stamp
            : null;
    }

    public static async Task<DatabaseBackupManifest?> ReadManifestAsync(IDatabaseBackupStore store, string key, CancellationToken cancellationToken)
    {
        await using var stream = await store.OpenAsync(key, cancellationToken);
        if (stream is null)
        {
            return null;
        }

        try
        {
            var manifest = await JsonSerializer.DeserializeAsync<DatabaseBackupManifest>(stream, DatabaseBackupManifest.Json, cancellationToken);
            return manifest is { Format: DatabaseBackupManifest.FormatName } ? manifest : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>One line for status and logs. Provider messages, keys and secrets stay in the logged exception only.</summary>
    public static string Explain(Exception exception) => exception switch
    {
        DatabaseBackupException backup => backup.Message,
        SqliteException sqlite => $"The database could not be read (SQLite error {sqlite.SqliteErrorCode}).",
        IOException => "The snapshot could not be written to local disk (full, or not writable).",
        UnauthorizedAccessException => "The snapshot could not be written to local disk (not writable).",
        _ => R2DatabaseBackupStore.Explain(exception) ?? $"Unexpected failure ({exception.GetType().Name}).",
    };

    private async Task DeleteQuietlyAsync(IDatabaseBackupStore store, string key)
    {
        try
        {
            await store.DeleteAsync(key, CancellationToken.None);
        }
        catch (Exception exception)
        {
            LogStrayLeft(logger, exception, key);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Database backup verified: {Key} ({Bytes} bytes compressed, {DatabaseBytes} bytes, schema {Schema}) in {Seconds:0.0} s.")]
    private static partial void LogSucceeded(ILogger logger, string key, long bytes, long databaseBytes, string? schema, double seconds);

    [LoggerMessage(Level = LogLevel.Error, Message = "Database backup FAILED ({Trigger}, {Failures} in a row): {Reason}")]
    private static partial void LogFailed(ILogger logger, Exception exception, string trigger, int failures, string reason);

    [LoggerMessage(Level = LogLevel.Information, Message = "Database backup retention removed {Count} backup(s) or stray object(s).")]
    private static partial void LogPruned(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Database backup retention did not run: {Reason}")]
    private static partial void LogPruneFailed(ILogger logger, Exception exception, string reason);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Database backup list did not refresh after a verified backup: {Reason}")]
    private static partial void LogRefreshFailed(ILogger logger, Exception exception, string reason);

    [LoggerMessage(Level = LogLevel.Warning, Message = "An unverified backup object could not be removed and will be swept later: {Key}")]
    private static partial void LogStrayLeft(ILogger logger, Exception exception, string key);

    [LoggerMessage(Level = LogLevel.Warning, Message = "A database backup working folder could not be removed: {Directory}")]
    private static partial void LogCleanupFailed(ILogger logger, Exception exception, string directory);
}
