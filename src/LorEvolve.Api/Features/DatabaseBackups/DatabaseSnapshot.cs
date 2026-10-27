using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Data.Sqlite;

namespace LorEvolve.Api.Features.DatabaseBackups;

/// <summary>
/// One backup's manifest (ADR 0064): written last, and only after the uploaded object was read back and hashed, so its
/// presence is what "verified" means. Everything a restore needs to trust and place the object is here; no credential,
/// connection string or account data ever is.
/// </summary>
public sealed record DatabaseBackupManifest(
    string Format,
    int ManifestVersion,
    string Environment,
    DateTime CreatedAt,
    DateTime VerifiedAt,
    string Trigger,
    DatabaseBackupProvenance Provenance,
    DatabaseBackupDatabase Database,
    DatabaseBackupObject StoredObject)
{
    public const string FormatName = "lorevolve-sqlite-backup";

    public const int CurrentVersion = 1;

    public static JsonSerializerOptions Json { get; } = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };
}

/// <summary>
/// Where the snapshot came from: the app's version, the host it ran on, the database file it read and that file's journal
/// mode as the app found it (<c>wal</c> for a database LorEvolve created) - so the first backup of a deployment states it.
/// </summary>
public sealed record DatabaseBackupProvenance(string AppVersion, string Host, string? Site, string DataSource, string? SourceJournalMode = null);

/// <summary>
/// The snapshot itself: the newest migration it holds (the schema version), how many, what the app running the backup expects,
/// and the integrity check's verdict.
/// </summary>
public sealed record DatabaseBackupDatabase(
    string? SchemaVersion,
    int Migrations,
    string? AppSchemaVersion,
    string IntegrityCheck,
    long Bytes,
    string Sha256);

/// <summary>The uploaded object: a gzip of the snapshot, its size and SHA-256 as uploaded and as read back.</summary>
public sealed record DatabaseBackupObject(string Key, string Compression, long Bytes, string Sha256);

/// <summary>A snapshot on local disk, checked and compressed, ready to upload.</summary>
public sealed record DatabaseSnapshotFile(
    string SourceJournalMode,
    string DatabasePath,
    string CompressedPath,
    DatabaseBackupDatabase Database,
    long CompressedBytes,
    string CompressedSha256);

/// <summary>
/// A consistent online snapshot of the live database through SQLite's own backup API - never a copy of the file, which
/// could miss what is still in the WAL or catch a page mid-write. Then <c>PRAGMA integrity_check</c> on the copy, the
/// schema version read from the copy's own migration history, and a gzip of it with both SHA-256s.
/// </summary>
public static class DatabaseSnapshot
{
    public static async Task<DatabaseSnapshotFile> CreateAsync(
        SqliteConnection source,
        string directory,
        string? appSchemaVersion,
        CancellationToken cancellationToken)
    {
        CreatePrivateDirectory(directory);
        var databasePath = Path.Combine(directory, "lorevolve.db");
        var compressedPath = databasePath + ".gz";

        var journalMode = "unknown";
        var wasClosed = source.State != System.Data.ConnectionState.Open;
        if (wasClosed)
        {
            await source.OpenAsync(cancellationToken);
        }

        try
        {
            await using var target = new SqliteConnection(Target(databasePath));
            await target.OpenAsync(cancellationToken);

            // Page by page under SQLite's own locking: readers and the one writer carry on (WAL), and what lands is one
            // consistent moment of the database.
            await using (var mode = source.CreateCommand())
            {
                mode.CommandText = "PRAGMA journal_mode;";
                journalMode = Convert.ToString(await mode.ExecuteScalarAsync(cancellationToken), System.Globalization.CultureInfo.InvariantCulture) ?? "unknown";
            }

            source.BackupDatabase(target);

            // A file that stands alone: rollback journal, nothing left in a -wal beside it.
            await ExecuteAsync(target, "PRAGMA journal_mode=DELETE;", cancellationToken);
        }
        finally
        {
            if (wasClosed)
            {
                await source.CloseAsync();
            }
        }

        var database = await InspectAsync(databasePath, appSchemaVersion, cancellationToken);
        if (database.IntegrityCheck != "ok")
        {
            throw new DatabaseBackupException($"The snapshot failed its integrity check: {database.IntegrityCheck}");
        }

        await using (var input = File.OpenRead(databasePath))
        await using (var output = File.Create(compressedPath))
        await using (var gzip = new GZipStream(output, CompressionLevel.Optimal))
        {
            await input.CopyToAsync(gzip, cancellationToken);
        }

        var (compressedBytes, compressedSha) = await HashAsync(compressedPath, cancellationToken);
        return new DatabaseSnapshotFile(journalMode, databasePath, compressedPath, database, compressedBytes, compressedSha);
    }

    /// <summary>The integrity check, the schema version from the file's own migration history, its size and SHA-256.</summary>
    public static async Task<DatabaseBackupDatabase> InspectAsync(string databasePath, string? appSchemaVersion, CancellationToken cancellationToken)
    {
        string integrity;
        string? schema;
        int migrations;
        await using (var connection = new SqliteConnection(Target(databasePath, readOnly: true)))
        {
            await connection.OpenAsync(cancellationToken);
            integrity = string.Join("; ", await RowsAsync(connection, "PRAGMA integrity_check;", cancellationToken));
            var history = await RowsAsync(
                connection,
                "SELECT CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE name = '__EFMigrationsHistory') THEN 1 ELSE 0 END;",
                cancellationToken);
            var ids = history.SingleOrDefault() == "1"
                ? await RowsAsync(connection, "SELECT MigrationId FROM \"__EFMigrationsHistory\" ORDER BY MigrationId;", cancellationToken)
                : [];
            schema = ids.LastOrDefault();
            migrations = ids.Count;
        }

        var (bytes, sha) = await HashAsync(databasePath, cancellationToken);
        return new DatabaseBackupDatabase(schema, migrations, appSchemaVersion, integrity, bytes, sha);
    }

    public static async Task<(long Bytes, string Sha256)> HashAsync(string path, CancellationToken cancellationToken)
    {
        await using var file = File.OpenRead(path);
        return await HashAsync(file, cancellationToken);
    }

    /// <summary>Reads the stream to its end, counting and hashing.</summary>
    public static async Task<(long Bytes, string Sha256)> HashAsync(Stream stream, CancellationToken cancellationToken)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[81920];
        long total = 0;
        int read;
        while ((read = await stream.ReadAsync(buffer, cancellationToken)) > 0)
        {
            hash.AppendData(buffer, 0, read);
            total += read;
        }

        return (total, Convert.ToHexStringLower(hash.GetHashAndReset()));
    }

    /// <summary>
    /// A folder only this account can enter: a snapshot is the whole database, password hashes included. Owner-only (0700)
    /// on Unix - App Service Linux - and the inherited ACL of the user's own temp folder on Windows.
    /// </summary>
    public static void CreatePrivateDirectory(string directory)
    {
        if (OperatingSystem.IsWindows())
        {
            Directory.CreateDirectory(directory);
        }
        else
        {
            // .NET gives the mode to the last folder only and creates missing parents 0755, so each is made here.
            var missing = new Stack<string>();
            for (var folder = Path.GetFullPath(directory); !Directory.Exists(folder); folder = Path.GetDirectoryName(folder)!)
            {
                missing.Push(folder);
            }

            foreach (var folder in missing)
            {
                Directory.CreateDirectory(folder, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            }
        }
    }

    /// <summary>A connection string for one file, unpooled so the file is released the moment it is closed.</summary>
    public static string Target(string path, bool readOnly = false) => new SqliteConnectionStringBuilder
    {
        DataSource = path,
        Pooling = false,
        Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate,
    }.ToString();

    private static async Task ExecuteAsync(SqliteConnection connection, string sql, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<List<string>> RowsAsync(SqliteConnection connection, string sql, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<string>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(Convert.ToString(reader.GetValue(0), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty);
        }

        return rows;
    }
}

/// <summary>A backup or drill step that failed for a reason worth saying in one line, with nothing secret in it.</summary>
public sealed class DatabaseBackupException(string message, Exception? inner = null) : Exception(message, inner);
