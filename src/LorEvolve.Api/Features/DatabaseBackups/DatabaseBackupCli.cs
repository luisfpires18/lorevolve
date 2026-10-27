using System.Diagnostics;
using System.IO.Compression;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Media;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.DatabaseBackups;

/// <summary>
/// <c>dotnet LorEvolve.Api.dll database-backup &lt;command&gt;</c> (ADR 0064), with the app's own configuration:
///
/// - <c>run</c> - one backup of the configured database, now. For a local drill or a machine of the operator's; on App Service
///   use Admin's Run now, which runs inside the one process that writes the database.
/// - <c>list</c> - the verified backups of this environment, newest first.
/// - <c>restore-drill --target &lt;empty folder&gt; (--latest | --key &lt;manifest key&gt; | --manifest-file f --data-file f)
///   [--check-media]</c> - fetch, verify both SHA-256s, integrity and foreign keys, apply this build's migrations to the copy,
///   read every universe whole, optionally confirm every picture original in the media store, and time each step. It never
///   touches the configured database: it refuses a target that is the live file.
/// </summary>
public static class DatabaseBackupCli
{
    public const string Verb = "database-backup";

    public static async Task<int> RunAsync(string[] args)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args[1..] });
        builder.Services.AddLorEvolveDatabase(builder.Configuration, builder.Environment);
        builder.Services.AddLorEvolveMedia(builder.Configuration);
        builder.Services.AddLorEvolveDatabaseBackups(builder.Configuration);
        await using var host = builder.Build();
        var services = host.Services;
        using var cancel = new CancellationTokenSource();
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            cancel.Cancel();
        };

        try
        {
            return args.ElementAtOrDefault(1) switch
            {
                "run" => await RunBackupAsync(services, cancel.Token),
                "list" => await ListAsync(services, cancel.Token),
                "restore-drill" => await DrillAsync(services, args[2..], cancel.Token),
                _ => Usage(),
            };
        }
        catch (DatabaseBackupException failure)
        {
            await Console.Error.WriteLineAsync($"FAILED: {failure.Message}");
            return 1;
        }
    }

    private static int Usage()
    {
        Console.Error.WriteLine("usage: database-backup run | list | restore-drill --target <folder> (--latest | --key <manifest key> | --manifest-file <file> --data-file <file>) [--check-media]");
        return 2;
    }

    private static IDatabaseBackupStore Store(IServiceProvider services) =>
        services.GetRequiredService<DatabaseBackupTarget>() is { Store: { } store }
            ? store
            : throw new DatabaseBackupException(services.GetRequiredService<DatabaseBackupTarget>().Problem ?? "No backup store is configured.");

    private static async Task<int> RunBackupAsync(IServiceProvider services, CancellationToken cancellationToken)
    {
        var runner = services.GetRequiredService<DatabaseBackupRunner>();
        Store(services);
        await services.GetRequiredService<LorEvolveDatabaseInitializer>().EnsureSchemaAsync(cancellationToken);
        var attempt = await (runner.TryStart("cli", cancellationToken) ?? throw new DatabaseBackupException("A backup is already running."));
        Console.WriteLine($"{attempt.Outcome}: {attempt.Key ?? attempt.Error} ({(attempt.FinishedAt - attempt.StartedAt)?.TotalSeconds:0.0} s)");
        return attempt.Outcome == "Succeeded" ? 0 : 1;
    }

    private static async Task<int> ListAsync(IServiceProvider services, CancellationToken cancellationToken)
    {
        var store = Store(services);
        var options = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<DatabaseBackupOptions>>().Value;
        var manifests = (await store.ListAsync($"{options.Prefix.Trim('/')}/{options.Environment}/", cancellationToken))
            .Where(item => item.Key.EndsWith(DatabaseBackupRunner.ManifestSuffix, StringComparison.Ordinal))
            .OrderByDescending(item => item.Key, StringComparer.Ordinal);
        foreach (var item in manifests)
        {
            var manifest = await DatabaseBackupRunner.ReadManifestAsync(store, item.Key, cancellationToken);
            Console.WriteLine(manifest is null
                ? $"{item.Key}  (unreadable manifest)"
                : $"{item.Key}  {manifest.CreatedAt:yyyy-MM-dd HH:mm:ss}Z  {manifest.StoredObject.Bytes} bytes  schema {manifest.Database.SchemaVersion}");
        }

        return 0;
    }

    private static async Task<int> DrillAsync(IServiceProvider services, string[] args, CancellationToken cancellationToken)
    {
        string? Option(string name) => args.SkipWhile(arg => arg != name).Skip(1).FirstOrDefault();
        string? live;
        await using (var scope = services.CreateAsyncScope())
        {
            live = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>().Database.GetDbConnection().DataSource;
        }

        DrillSource source;
        if (Option("--manifest-file") is { } manifestFile)
        {
            source = new DrillSource(null, null, manifestFile, Option("--data-file") ?? throw new DatabaseBackupException("--data-file is required with --manifest-file."));
        }
        else
        {
            var store = Store(services);
            var key = Option("--key");
            if (key is null && args.Contains("--latest"))
            {
                var runner = services.GetRequiredService<DatabaseBackupRunner>();
                await runner.RefreshAsync(cancellationToken);
                key = runner.Status().LastVerified?.Key is { } dataKey
                    ? dataKey[..^DatabaseBackupRunner.DataSuffix.Length] + DatabaseBackupRunner.ManifestSuffix
                    : throw new DatabaseBackupException("There is no verified backup in this environment.");
            }

            source = new DrillSource(store, key ?? throw new DatabaseBackupException("Give --latest or --key."), null, null);
        }

        var report = await RestoreDrillAsync(
            source,
            Option("--target") ?? throw new DatabaseBackupException("--target <empty folder> is required."),
            args.Contains("--check-media") ? services.GetRequiredService<IMediaObjectStore>() : null,
            live,
            cancellationToken);
        foreach (var step in report.Steps)
        {
            Console.WriteLine($"ok  {step.Name,-70} {step.Seconds,7:0.00} s  {step.Detail}");
        }

        Console.WriteLine($"PASSED in {report.Steps.Sum(step => step.Seconds):0.00} s. Restored database: {report.RestoredPath}");
        return 0;
    }

    /// <summary>Where a drill reads from: a store and a manifest key, or a manifest file and a data file.</summary>
    public sealed record DrillSource(IDatabaseBackupStore? Store, string? ManifestKey, string? ManifestFile, string? DataFile);

    /// <summary>
    /// The restore drill. Throws <see cref="DatabaseBackupException"/> at the first check that fails; answers the timed steps
    /// when every one passed. Writes only under <paramref name="targetFolder"/>, which must be empty and is never the live file.
    /// </summary>
    public static async Task<DrillReport> RestoreDrillAsync(
        DrillSource source,
        string targetFolder,
        IMediaObjectStore? media,
        string? liveDataSource,
        CancellationToken cancellationToken)
    {
        targetFolder = Path.GetFullPath(targetFolder);
        if (Directory.Exists(targetFolder) && Directory.EnumerateFileSystemEntries(targetFolder).Any())
        {
            throw new DatabaseBackupException($"The target folder is not empty: {targetFolder}");
        }

        var restoredPath = Path.Combine(targetFolder, "lorevolve.db");
        if (!string.IsNullOrEmpty(liveDataSource) && string.Equals(Path.GetFullPath(liveDataSource), restoredPath, StringComparison.OrdinalIgnoreCase))
        {
            throw new DatabaseBackupException("The drill never writes over the configured database. Choose another --target.");
        }

        DatabaseSnapshot.CreatePrivateDirectory(targetFolder);
        var report = new DrillReport { RestoredPath = restoredPath };
        var clock = Stopwatch.StartNew();

        // 1. The manifest, and the object it names.
        DatabaseBackupManifest manifest;
        Stream data;
        if (source.ManifestFile is { } manifestFile)
        {
            await using (var file = File.OpenRead(manifestFile))
            {
                manifest = await JsonSerializer.DeserializeAsync<DatabaseBackupManifest>(file, DatabaseBackupManifest.Json, cancellationToken)
                    ?? throw new DatabaseBackupException("The manifest file is empty.");
            }

            data = File.OpenRead(source.DataFile ?? throw new DatabaseBackupException("A data file is required with a manifest file."));
        }
        else
        {
            var store = source.Store ?? throw new DatabaseBackupException("No backup store is configured.");
            manifest = await DatabaseBackupRunner.ReadManifestAsync(store, source.ManifestKey!, cancellationToken)
                ?? throw new DatabaseBackupException($"No readable manifest at {source.ManifestKey}.");
            data = await store.OpenAsync(manifest.StoredObject.Key, cancellationToken)
                ?? throw new DatabaseBackupException($"The manifest names an object the store does not hold: {manifest.StoredObject.Key}");
        }

        if (manifest.Format != DatabaseBackupManifest.FormatName || manifest.ManifestVersion > DatabaseBackupManifest.CurrentVersion)
        {
            throw new DatabaseBackupException("This is not a LorEvolve database backup manifest this build can read.");
        }

        report.Step("manifest", clock, $"{manifest.Environment} {manifest.CreatedAt:O} schema {manifest.Database.SchemaVersion} app {manifest.Provenance.AppVersion}");

        // 2. Download, and the object's checksum.
        var compressedPath = restoredPath + ".gz";
        await using (data)
        await using (var file = File.Create(compressedPath))
        {
            await data.CopyToAsync(file, cancellationToken);
        }

        var (compressedBytes, compressedSha) = await DatabaseSnapshot.HashAsync(compressedPath, cancellationToken);
        Check(compressedBytes == manifest.StoredObject.Bytes && compressedSha == manifest.StoredObject.Sha256,
            "The downloaded object does not match the manifest's size and SHA-256.");
        report.Step("download + object checksum", clock, $"{compressedBytes} bytes, sha256 {compressedSha}");

        // 3. Decompress, the database's checksum, integrity and foreign keys.
        await using (var input = File.OpenRead(compressedPath))
        await using (var gzip = new GZipStream(input, CompressionMode.Decompress))
        await using (var output = File.Create(restoredPath))
        {
            await gzip.CopyToAsync(output, cancellationToken);
        }

        var database = await DatabaseSnapshot.InspectAsync(restoredPath, null, cancellationToken);
        Check(database.Bytes == manifest.Database.Bytes && database.Sha256 == manifest.Database.Sha256,
            "The decompressed database does not match the manifest's size and SHA-256.");
        Check(database.IntegrityCheck == "ok", $"integrity_check: {database.IntegrityCheck}");
        await using (var connection = new SqliteConnection(DatabaseSnapshot.Target(restoredPath, readOnly: true)))
        {
            await connection.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA foreign_key_check;";
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            Check(!await reader.ReadAsync(cancellationToken), "foreign_key_check found rows that point at nothing.");
        }

        report.Step("decompress + database checksum + integrity_check + foreign_key_check", clock, $"{database.Bytes} bytes, {database.Migrations} migrations");

        // 4. This build's migrations on the copy: a backup from a newer LorEvolve is refused, an older one is brought forward.
        var dbOptions = new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite(DatabaseSnapshot.Target(restoredPath)).Options;
        await using (var db = new LorEvolveDbContext(dbOptions))
        {
            var known = db.Database.GetMigrations().ToHashSet(StringComparer.Ordinal);
            var unknown = (await db.Database.GetAppliedMigrationsAsync(cancellationToken)).Where(id => !known.Contains(id)).ToList();
            if (unknown.Count > 0)
            {
                throw new DatabaseBackupException($"The backup holds migrations this build does not know ({unknown[^1]}): restore it with that LorEvolve version or newer.");
            }

            var pending = (await db.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();
            await db.Database.MigrateAsync(cancellationToken);
            report.Step("migrations", clock, pending.Count == 0 ? "schema already current" : $"applied {pending.Count}, up to {pending[^1]}");
        }

        // 5. Smoke: every universe read whole, the way a backup reads it, and every picture original confirmed if asked.
        var missing = new List<string>();
        int universes;
        int pictures = 0;
        await using (var db = new LorEvolveDbContext(dbOptions))
        {
            var ids = await db.Universes.AsNoTracking().OrderBy(universe => universe.Id).Select(universe => universe.Id).ToListAsync(cancellationToken);
            universes = ids.Count;
            var accounts = await db.Users.CountAsync(cancellationToken);
            var entries = await db.Entities.CountAsync(cancellationToken);
            foreach (var id in ids)
            {
                var snapshot = await new UniverseBackupBuilder(db).BuildAsync(id, cancellationToken)
                    ?? throw new DatabaseBackupException($"Universe {id} could not be read back.");
                db.ChangeTracker.Clear();
                foreach (var item in media is null ? [] : snapshot.Media)
                {
                    pictures++;
                    await using var stored = (await media!.GetAsync(item.ObjectKey, cancellationToken))?.Content;
                    if (stored is null)
                    {
                        missing.Add(item.ObjectKey);
                    }
                }
            }

            report.Step("smoke: every universe read whole", clock, $"{accounts} accounts, {universes} universes, {entries} entries");
        }

        if (media is not null)
        {
            report.Step("media originals in the media store", clock, $"{pictures - missing.Count} of {pictures} present");
            Check(missing.Count == 0, $"{missing.Count} picture original(s) the database names are not in the media store; first: {missing.FirstOrDefault()}");
        }

        report.Passed = true;
        await File.WriteAllTextAsync(Path.Combine(targetFolder, "drill-report.json"), JsonSerializer.Serialize(report, DatabaseBackupManifest.Json), cancellationToken);
        return report;
    }

    private static void Check(bool condition, string failure)
    {
        if (!condition)
        {
            throw new DatabaseBackupException(failure);
        }
    }

    public sealed class DrillReport
    {
        private double _last;

        public bool Passed { get; set; }

        public string RestoredPath { get; init; } = string.Empty;

        public List<DrillStep> Steps { get; } = [];

        public void Step(string name, Stopwatch clock, string detail)
        {
            var now = clock.Elapsed.TotalSeconds;
            Steps.Add(new DrillStep(name, Math.Round(now - _last, 3), detail));
            _last = now;
        }
    }

    public sealed record DrillStep(string Name, double Seconds, string Detail);
}
