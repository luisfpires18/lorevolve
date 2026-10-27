using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace LorEvolve.Api.Features.Restore;

/// <summary>
/// One validated upload waiting for its restore: a file on this machine's temporary disk and the
/// account it belongs to. Nothing about it is in the database, and nothing survives a restart.
/// </summary>
internal sealed class StagedBackup(string token, string ownerId, string path, DateTimeOffset expiresAt) : IDisposable
{
    private readonly SemaphoreSlim _busy = new(1, 1);

    public string Token { get; } = token;

    public string OwnerId { get; } = ownerId;

    /// <summary>Built from <see cref="Token"/> alone, never from anything the upload said about itself.</summary>
    public string Path { get; } = path;

    public DateTimeOffset ExpiresAt { get; } = expiresAt;

    /// <summary>Disk counted against the shared budget: reserved at upload, then the file's real size.</summary>
    public long Bytes { get; set; }

    /// <summary>Validated, and so eligible for a restore. False while the upload is still arriving or being read.</summary>
    public bool Ready { get; set; }

    /// <summary>One restore at a time, so a double-submitted form cannot build two universes from one upload.</summary>
    public bool TryBegin() => _busy.Wait(0);

    public void End() => _busy.Release();

    public bool InUse => _busy.CurrentCount == 0;

    public void Dispose() => _busy.Dispose();
}

/// <summary>
/// Where validated uploads wait between <c>validate</c> and <c>restore</c>, and the rules that keep
/// that from becoming a file-storage service. See ADR 0032.
///
/// <para><b>Why keep the file at all.</b> The alternative - sending the archive again with the
/// restore - is simpler, but it uploads a large file twice over the kind of connection the upload
/// progress bar exists for (ADR 0019), and asks the browser to hold it meanwhile. Keeping it here
/// means the restore reads exactly the bytes that were validated, which the client cannot have
/// changed, and validation still runs again on them before anything is written.</para>
///
/// <para><b>What bounds it.</b> A random 256-bit token, which is the file's only name and never a
/// path fragment from the request. One waiting upload per account - a new one replaces the last.
/// <see cref="BackupRestoreLimits.MaxStagedBackups"/> uploads and
/// <see cref="BackupRestoreLimits.MaxStagedBytes"/> of disk across everyone, refused rather than
/// queued when full. <see cref="BackupRestoreLimits.StagedLifetime"/>, after which a token stops
/// working and its file is deleted by the next request that looks. Deleted on restore, on discard,
/// and on refusal.</para>
///
/// <para><b>What a restart does.</b> The map of tokens is in memory, so a restart forgets every
/// waiting upload and the author chooses the file again. The files live in a folder of this process's
/// own, and the next start deletes any such folder older than a lifetime. The folder is under the
/// system temporary path unless <c>Backups:RestoreStagingPath</c> says otherwise - never
/// the database's share, and never inside the application.</para>
/// </summary>
internal sealed partial class BackupRestoreStaging : IDisposable
{
    private readonly Dictionary<string, StagedBackup> _staged = new(StringComparer.Ordinal);
    private readonly Lock _lock = new();
    private readonly TimeProvider _clock;
    private readonly ILogger<BackupRestoreStaging> _logger;
    private readonly string _root;

    public BackupRestoreStaging(IConfiguration configuration, TimeProvider clock, ILogger<BackupRestoreStaging> logger)
    {
        _clock = clock;
        _logger = logger;

        var parent = configuration["Backups:RestoreStagingPath"] is { Length: > 0 } configured
            ? configured
            : System.IO.Path.Combine(System.IO.Path.GetTempPath(), "lorevolve-restore");

        Directory.CreateDirectory(parent);
        SweepAbandonedFolders(parent);

        _root = System.IO.Path.Combine(parent, $"{Environment.ProcessId}-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_root);
    }

    /// <summary>
    /// Makes room for one account's upload of about <paramref name="expectedBytes"/>, replacing the
    /// account's previous one. Null when the shared budget cannot take it.
    /// </summary>
    public StagedBackup? Reserve(string ownerId, long expectedBytes)
    {
        List<StagedBackup> discarded = [];
        StagedBackup? reserved = null;

        lock (_lock)
        {
            discarded.AddRange(RemoveExpired());

            foreach (var previous in _staged.Values.Where(staged => staged.OwnerId == ownerId && !staged.InUse).ToList())
            {
                _staged.Remove(previous.Token);
                discarded.Add(previous);
            }

            if (_staged.Count < BackupRestoreLimits.MaxStagedBackups
                && _staged.Values.Sum(staged => staged.Bytes) + expectedBytes <= BackupRestoreLimits.MaxStagedBytes)
            {
                var token = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
                reserved = new StagedBackup(
                    token,
                    ownerId,
                    System.IO.Path.Combine(_root, $"{token}.upload"),
                    _clock.GetUtcNow() + BackupRestoreLimits.StagedLifetime)
                {
                    Bytes = expectedBytes,
                };

                _staged[token] = reserved;
            }
        }

        foreach (var staged in discarded)
        {
            DeleteFile(staged);
        }

        // Another process's start-up sweep may have taken an idle folder; it holds nothing a new upload needs.
        if (reserved is not null)
        {
            Directory.CreateDirectory(_root);
        }

        return reserved;
    }

    /// <summary>The upload has been validated; its real size replaces the reservation.</summary>
    public void MarkReady(StagedBackup staged, long bytes)
    {
        lock (_lock)
        {
            staged.Bytes = bytes;
            staged.Ready = true;
        }
    }

    /// <summary>
    /// The account's validated upload for <paramref name="token"/>, or null - and null alike for a token
    /// that never existed, one that expired and one that belongs to another account, so a token says
    /// nothing about anyone else's backup.
    /// </summary>
    public StagedBackup? Find(string? token, string ownerId)
    {
        if (token is null || !TokenPattern().IsMatch(token))
        {
            return null;
        }

        List<StagedBackup> expired;
        StagedBackup? found;

        lock (_lock)
        {
            expired = RemoveExpired();
            found = _staged.TryGetValue(token, out var staged) && staged.Ready && staged.OwnerId == ownerId ? staged : null;
        }

        foreach (var staged in expired)
        {
            DeleteFile(staged);
        }

        return found;
    }

    /// <summary>Forgets an upload and deletes its file. Safe to call twice.</summary>
    public void Discard(StagedBackup staged)
    {
        lock (_lock)
        {
            if (_staged.TryGetValue(staged.Token, out var current) && ReferenceEquals(current, staged))
            {
                _staged.Remove(staged.Token);
            }
        }

        DeleteFile(staged);
    }

    /// <summary>For tests: how many uploads are waiting, and whether any file is left on disk.</summary>
    internal (int Waiting, int Files) Census()
    {
        lock (_lock)
        {
            return (_staged.Count, Directory.Exists(_root) ? Directory.GetFiles(_root).Length : 0);
        }
    }

    public void Dispose()
    {
        lock (_lock)
        {
            foreach (var staged in _staged.Values)
            {
                staged.Dispose();
            }

            _staged.Clear();
        }

        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            LogCleanupFailed(_logger, exception);
        }
    }

    private List<StagedBackup> RemoveExpired()
    {
        var now = _clock.GetUtcNow();
        var expired = _staged.Values.Where(staged => staged.ExpiresAt <= now && !staged.InUse).ToList();

        foreach (var staged in expired)
        {
            _staged.Remove(staged.Token);
        }

        return expired;
    }

    private void DeleteFile(StagedBackup staged)
    {
        try
        {
            File.Delete(staged.Path);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            LogCleanupFailed(_logger, exception);
        }
    }

    /// <summary>Folders left by processes that stopped without cleaning up, once they are older than any upload could be.</summary>
    private void SweepAbandonedFolders(string parent)
    {
        var cutoff = _clock.GetUtcNow().UtcDateTime - (BackupRestoreLimits.StagedLifetime * 2);

        foreach (var folder in Directory.EnumerateDirectories(parent))
        {
            try
            {
                if (Directory.GetLastWriteTimeUtc(folder) < cutoff)
                {
                    Directory.Delete(folder, recursive: true);
                }
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                LogCleanupFailed(_logger, exception);
            }
        }
    }

    [GeneratedRegex("^[0-9a-f]{64}$")]
    private static partial Regex TokenPattern();

    [LoggerMessage(Level = LogLevel.Warning, Message = "A staged backup upload could not be deleted. It holds no database state and is safe to remove.")]
    private static partial void LogCleanupFailed(ILogger logger, Exception exception);
}
