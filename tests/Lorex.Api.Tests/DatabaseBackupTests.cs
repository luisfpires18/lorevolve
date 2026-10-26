using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Admin;
using Lorex.Api.Features.DatabaseBackups;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Issue #54, ADR 0064: a database backup is a consistent snapshot through SQLite's backup API, checked, compressed,
/// uploaded, read back and hashed before its manifest is written; a failure leaves no manifest and is reported; runs never
/// overlap; retention keeps what the policy says and only after a verified backup; only an Admin sees or starts one; and a
/// restore drill proves a backup by its checksums, its integrity, this build's migrations and every universe read whole.
/// </summary>
public sealed class DatabaseBackupTests : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "lorex-db-backup-tests", Guid.NewGuid().ToString("N"));
    private readonly LorexApiFactory _api;

    public DatabaseBackupTests()
    {
        _api = new LorexApiFactory
        {
            Settings = new Dictionary<string, string?>
            {
                ["DatabaseBackup:Enabled"] = "true",
                ["DatabaseBackup:Automatic"] = "false",
                ["DatabaseBackup:Environment"] = "test",
                ["DatabaseBackup:Store"] = "FileSystem",
                ["DatabaseBackup:FileSystemPath"] = Path.Combine(_folder, "store"),
                ["DatabaseBackup:WorkingDirectory"] = Path.Combine(_folder, "work"),
            },
        };
    }

    public void Dispose()
    {
        _api.Dispose();
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(_folder, recursive: true);
        }
        catch (IOException)
        {
            // A temp folder a test still held; the OS cleans it.
        }
    }

    private string StoreFolder => Path.Combine(_folder, "store");

    private DatabaseBackupRunner Runner => _api.Services.GetRequiredService<DatabaseBackupRunner>();

    [Fact]
    public async Task A_backup_is_a_verified_consistent_snapshot_whose_manifest_is_written_last()
    {
        var client = await SignedIn(_api, "dbbackup-owner");
        var universe = await CreateUniverse(client, "Snapshot world");
        await CreateEntity(client, universe.Id, "Mira Vale");

        var attempt = await Runner.TryStart("test", CancellationToken.None)!;
        Assert.Equal(("Succeeded", null), (attempt.Outcome, attempt.Error));

        // One object and one manifest, keyed by environment, year, month and the second it was taken.
        var files = Directory.EnumerateFiles(StoreFolder, "*", SearchOption.AllDirectories)
            .Select(path => Path.GetRelativePath(StoreFolder, path).Replace('\\', '/')).Order(StringComparer.Ordinal).ToList();
        Assert.Equal(2, files.Count);
        Assert.Matches(@"^lorex-db/test/\d{4}/\d{2}/\d{8}T\d{6}Z-[0-9a-f]{8}\.db\.gz$", files[0]);
        Assert.Equal(files[0].Replace(".db.gz", ".manifest.json", StringComparison.Ordinal), files[1]);
        Assert.Equal(attempt.Key, files[0]);

        var manifest = JsonSerializer.Deserialize<DatabaseBackupManifest>(await File.ReadAllBytesAsync(Path.Combine(StoreFolder, files[1])), DatabaseBackupManifest.Json)!;
        string latest;
        using (var scope = _api.Services.CreateScope())
        {
            latest = scope.ServiceProvider.GetRequiredService<LorexDbContext>().Database.GetMigrations().Last();
        }

        Assert.Equal((DatabaseBackupManifest.FormatName, 1, "test", "test"), (manifest.Format, manifest.ManifestVersion, manifest.Environment, manifest.Trigger));
        Assert.Equal((latest, latest, "ok"), (manifest.Database.SchemaVersion, manifest.Database.AppSchemaVersion, manifest.Database.IntegrityCheck));
        Assert.True(manifest.VerifiedAt >= manifest.CreatedAt);
        Assert.False(string.IsNullOrWhiteSpace(manifest.Provenance.AppVersion));
        Assert.Equal("memory", manifest.Provenance.SourceJournalMode);

        // The object is what the manifest says, and inside it is the database as it was: the universe and the entry.
        var objectPath = Path.Combine(StoreFolder, files[0]);
        Assert.Equal((manifest.StoredObject.Bytes, manifest.StoredObject.Sha256), await DatabaseSnapshot.HashAsync(objectPath, CancellationToken.None));
        var restored = Path.Combine(_folder, "check.db");
        await using (var gzip = new GZipStream(File.OpenRead(objectPath), CompressionMode.Decompress))
        await using (var output = File.Create(restored))
        {
            await gzip.CopyToAsync(output);
        }

        Assert.Equal((manifest.Database.Bytes, manifest.Database.Sha256), await DatabaseSnapshot.HashAsync(restored, CancellationToken.None));
        await using (var copy = new LorexDbContext(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite(DatabaseSnapshot.Target(restored, readOnly: true)).Options))
        {
            Assert.True(await copy.Universes.AnyAsync(row => row.Name == "Snapshot world"));
            Assert.True(await copy.Entities.AnyAsync(row => row.Name == "Mira Vale"));
        }

        // Status: one verified backup, fresh, not stale, nothing due.
        var status = Runner.Status();
        Assert.Equal((1, false, 0), (status.VerifiedCount, status.Stale, status.ConsecutiveFailures));
        Assert.Equal(attempt.Key, status.LastVerified!.Key);
        Assert.True(status.LastVerifiedAgeHours < 1);
        Assert.False(Runner.IsDue());
        Assert.Empty(Directory.Exists(Path.Combine(_folder, "work")) ? Directory.EnumerateFileSystemEntries(Path.Combine(_folder, "work", "lorex-db-backup")) : []);
    }

    [Fact]
    public async Task The_restore_drill_proves_a_backup_and_refuses_a_tampered_one()
    {
        var client = await SignedIn(_api, "dbbackup-drill");
        var universe = await CreateUniverse(client, "Drilled world");
        var entry = await CreateEntity(client, universe.Id, "Ilen");
        await CollaborationTestClient.UploadImage(client, universe.Id, entry);
        var attempt = await Runner.TryStart("test", CancellationToken.None)!;
        var store = new FileSystemDatabaseBackupStore(StoreFolder);
        var manifestKey = attempt.Key!.Replace(".db.gz", ".manifest.json", StringComparison.Ordinal);

        var report = await DatabaseBackupCli.RestoreDrillAsync(
            new DatabaseBackupCli.DrillSource(store, manifestKey, null, null), Path.Combine(_folder, "drill"), _api.Media, null, CancellationToken.None);
        Assert.True(report.Passed);
        Assert.Equal(
            ["manifest", "download + object checksum", "decompress + database checksum + integrity_check + foreign_key_check", "migrations",
                "smoke: every universe read whole", "media originals in the media store"],
            report.Steps.Select(step => step.Name));
        Assert.Equal("1 of 1 present", report.Steps[^1].Detail);
        Assert.True(File.Exists(Path.Combine(_folder, "drill", "drill-report.json")));

        // A picture the database names but the media store lost: the drill says so instead of passing.
        var original = _api.Media.Keys.Single(key => key.Contains($"/entities/{entry:D}/", StringComparison.Ordinal) && key.Contains("/original.", StringComparison.Ordinal));
        _api.Media.Evict(original);
        var lost = await Assert.ThrowsAsync<DatabaseBackupException>(() => DatabaseBackupCli.RestoreDrillAsync(
            new DatabaseBackupCli.DrillSource(store, manifestKey, null, null), Path.Combine(_folder, "drill-media"), _api.Media, null, CancellationToken.None));
        Assert.Contains("not in the media store", lost.Message, StringComparison.Ordinal);

        // One flipped byte in the object fails its checksum before anything is opened.
        var objectPath = Path.Combine(StoreFolder, attempt.Key!);
        var bytes = await File.ReadAllBytesAsync(objectPath);
        bytes[^10] ^= 0xFF;
        await File.WriteAllBytesAsync(objectPath, bytes);
        var tampered = await Assert.ThrowsAsync<DatabaseBackupException>(() => DatabaseBackupCli.RestoreDrillAsync(
            new DatabaseBackupCli.DrillSource(store, manifestKey, null, null), Path.Combine(_folder, "drill-tampered"), null, null, CancellationToken.None));
        Assert.Contains("does not match the manifest", tampered.Message, StringComparison.Ordinal);

        // It writes into an empty folder only, and never over the live file.
        await Assert.ThrowsAsync<DatabaseBackupException>(() => DatabaseBackupCli.RestoreDrillAsync(
            new DatabaseBackupCli.DrillSource(store, manifestKey, null, null), Path.Combine(_folder, "drill"), null, null, CancellationToken.None));
        var live = Path.Combine(_folder, "live", "lorex.db");
        var refused = await Assert.ThrowsAsync<DatabaseBackupException>(() => DatabaseBackupCli.RestoreDrillAsync(
            new DatabaseBackupCli.DrillSource(store, manifestKey, null, null), Path.Combine(_folder, "live"), null, live, CancellationToken.None));
        Assert.Contains("never writes over", refused.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_drill_brings_an_older_schema_forward_and_refuses_one_from_a_newer_build()
    {
        string latest;
        string previous;
        using (var scope = _api.Services.CreateScope())
        {
            var all = scope.ServiceProvider.GetRequiredService<LorexDbContext>().Database.GetMigrations().ToList();
            (latest, previous) = (all[^1], all[^2]);
        }

        // A database one migration behind this build, as a backup taken before the last deploy would be.
        Directory.CreateDirectory(_folder);
        var older = Path.Combine(_folder, "older.db");
        await using (var db = new LorexDbContext(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite(DatabaseSnapshot.Target(older)).Options))
        {
            await db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>().MigrateAsync(previous);
        }

        var (manifest, data) = await Package(older, "older");
        var report = await DatabaseBackupCli.RestoreDrillAsync(
            new DatabaseBackupCli.DrillSource(null, null, manifest, data), Path.Combine(_folder, "drill-older"), null, null, CancellationToken.None);
        Assert.Equal($"applied 1, up to {latest}", report.Steps.Single(step => step.Name == "migrations").Detail);

        // A database from a build with a migration this one does not know: refused, never half-migrated.
        var newer = Path.Combine(_folder, "newer.db");
        File.Copy(Path.Combine(_folder, "drill-older", "lorex.db"), newer);
        await using (var connection = new SqliteConnection(DatabaseSnapshot.Target(newer)))
        {
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO \"__EFMigrationsHistory\" (MigrationId, ProductVersion) VALUES ('29991231000000_FromTheFuture', '10.0.0');";
            await command.ExecuteNonQueryAsync();
        }

        (manifest, data) = await Package(newer, "newer");
        var refused = await Assert.ThrowsAsync<DatabaseBackupException>(() => DatabaseBackupCli.RestoreDrillAsync(
            new DatabaseBackupCli.DrillSource(null, null, manifest, data), Path.Combine(_folder, "drill-newer"), null, null, CancellationToken.None));
        Assert.Contains("29991231000000_FromTheFuture", refused.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_run_that_cannot_verify_its_upload_writes_no_manifest_leaves_no_object_and_says_why()
    {
        var store = new FaultyStore(StoreFolder) { CorruptReads = true };
        using var runner = Detached(store);

        var attempt = await runner.TryStart("test", CancellationToken.None)!;
        Assert.Equal("Failed", attempt.Outcome);
        Assert.Equal("The uploaded snapshot did not read back as it was sent.", attempt.Error);
        Assert.Empty(Directory.Exists(StoreFolder) ? Directory.EnumerateFiles(StoreFolder, "*", SearchOption.AllDirectories) : []);

        var status = runner.Status();
        Assert.Equal((1, (VerifiedBackup?)null, true), (status.ConsecutiveFailures, status.LastVerified, status.Stale));

        // The schedule waits before trying again, rather than hammering a broken store every quarter hour.
        Assert.False(runner.IsDue());

        // A store that refuses the manifest: the object is removed again, and the error names no key and no secret.
        store.CorruptReads = false;
        store.RefuseManifests = true;
        var refused = await runner.TryStart("test", CancellationToken.None)!;
        Assert.Equal(("Failed", "Backup storage refused the request (403 AccessDenied)."), (refused.Outcome, refused.Error));
        Assert.Empty(Directory.EnumerateFiles(StoreFolder, "*", SearchOption.AllDirectories));
        Assert.Equal(2, runner.Status().ConsecutiveFailures);

        store.RefuseManifests = false;
        Assert.Equal("Succeeded", (await runner.TryStart("test", CancellationToken.None)!).Outcome);
        Assert.Equal(0, runner.Status().ConsecutiveFailures);
    }

    [Fact]
    public async Task Runs_never_overlap_and_a_second_request_is_refused_while_one_runs()
    {
        var store = new FaultyStore(StoreFolder) { Hold = new TaskCompletionSource() };
        using var runner = Detached(store);

        var first = runner.TryStart("first", CancellationToken.None);
        Assert.NotNull(first);
        await store.Reached.Task;
        Assert.Null(runner.TryStart("second", CancellationToken.None));
        Assert.True(runner.Status().Running);

        store.Hold.SetResult();
        Assert.Equal("Succeeded", (await first).Outcome);
        Assert.NotNull(runner.TryStart("third", CancellationToken.None));
    }

    [Fact]
    public async Task Retention_keeps_the_newest_the_recent_and_one_a_month_and_only_after_a_verified_backup()
    {
        var store = new FaultyStore(StoreFolder);
        var now = new DateTime(2026, 10, 26, 3, 0, 0, DateTimeKind.Utc);
        var stamps = new[]
        {
            now.AddDays(-1), now.AddDays(-20), now.AddDays(-29), // recent: kept
            now.AddDays(-40), now.AddDays(-45),                  // September: the earlier is its month's first
            new DateTime(2026, 3, 2, 3, 0, 0, DateTimeKind.Utc), new DateTime(2026, 3, 9, 3, 0, 0, DateTimeKind.Utc),
            new DateTime(2025, 6, 1, 3, 0, 0, DateTimeKind.Utc), // older than twelve months: gone
        };
        foreach (var stamp in stamps)
        {
            await Seed(store, stamp);
        }

        // An object whose run never wrote a manifest, two days old: swept. One from an hour ago may still be uploading: kept.
        await store.PutAsync($"lorex-db/test/2026/10/{now.AddDays(-2):yyyyMMdd'T'HHmmss'Z'}-deadbeef.db.gz", new MemoryStream([1]), "application/gzip", default);
        File.SetLastWriteTimeUtc(Path.Combine(StoreFolder, $"lorex-db/test/2026/10/{now.AddDays(-2):yyyyMMdd'T'HHmmss'Z'}-deadbeef.db.gz"), now.AddDays(-2));
        await store.PutAsync($"lorex-db/test/2026/10/{now.AddHours(-1):yyyyMMdd'T'HHmmss'Z'}-cafebabe.db.gz", new MemoryStream([1]), "application/gzip", default);
        // Another environment's backups are never this one's to prune.
        await store.PutAsync("lorex-db/prod/2025/01/20250101T030000Z-00000000.manifest.json", new MemoryStream([1]), "application/json", default);

        using var runner = Detached(store, new FixedClock(now), prune: true);
        Assert.Equal(4, await runner.PruneAsync(store, CancellationToken.None));

        string Name(DateTime stamp) => $"{stamp:yyyyMMdd'T'HHmmss'Z'}-00000000.manifest.json";
        var left = Directory.EnumerateFiles(StoreFolder, "*.manifest.json", SearchOption.AllDirectories).Select(path => Path.GetFileName(path)).ToHashSet(StringComparer.Ordinal);
        Assert.Equal(
            new[] { now.AddDays(-1), now.AddDays(-20), now.AddDays(-29), now.AddDays(-45), new DateTime(2026, 3, 2, 3, 0, 0, DateTimeKind.Utc) }
                .Select(Name).Append("20250101T030000Z-00000000.manifest.json").ToHashSet(StringComparer.Ordinal),
            left);
        Assert.False(File.Exists(Path.Combine(StoreFolder, $"lorex-db/test/2026/10/{now.AddDays(-2):yyyyMMdd'T'HHmmss'Z'}-deadbeef.db.gz")));
        Assert.True(File.Exists(Path.Combine(StoreFolder, $"lorex-db/test/2026/10/{now.AddHours(-1):yyyyMMdd'T'HHmmss'Z'}-cafebabe.db.gz")));
        Assert.Equal(left.Count - 1, Directory.EnumerateFiles(StoreFolder, "*00000000.db.gz", SearchOption.AllDirectories).Count());

        // A failed run prunes nothing, however old what is there.
        await Seed(store, new DateTime(2024, 1, 1, 3, 0, 0, DateTimeKind.Utc));
        store.CorruptReads = true;
        Assert.Equal("Failed", (await runner.TryStart("test", CancellationToken.None)!).Outcome);
        Assert.True(File.Exists(Path.Combine(StoreFolder, "lorex-db/test/2024/01/20240101T030000Z-00000000.manifest.json")));
    }

    [Fact]
    public async Task Only_an_admin_reads_the_status_or_starts_a_backup()
    {
        var (admin, adminId) = await PublishingTestClient.Account(_api, "dbbackup-admin");
        var (member, _) = await PublishingTestClient.Account(_api, "dbbackup-member");
        using (var scope = _api.Services.CreateScope())
        {
            await PlatformAdminProvisioning.ProvisionAsync(scope.ServiceProvider.GetRequiredService<LorexDbContext>(), adminId, CancellationToken.None);
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await _api.CreateClient().GetAsync("/api/admin/database-backups")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/admin/database-backups")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsync("/api/admin/database-backups/run", null)).StatusCode);
        Assert.Empty(Directory.Exists(StoreFolder) ? Directory.EnumerateFiles(StoreFolder, "*", SearchOption.AllDirectories) : []);

        var before = (await admin.GetFromJsonAsync<DatabaseBackupStatus>("/api/admin/database-backups"))!;
        Assert.Equal((true, false, "test", 0, (VerifiedBackup?)null, true), (before.Enabled, before.Automatic, before.Environment, before.VerifiedCount, before.LastVerified, before.Stale));

        var started = await admin.PostAsync("/api/admin/database-backups/run", null);
        Assert.Equal(HttpStatusCode.Accepted, started.StatusCode);
        Assert.Equal("Succeeded", (await Runner.Current!).Outcome);

        var after = (await admin.GetFromJsonAsync<DatabaseBackupStatus>("/api/admin/database-backups"))!;
        Assert.Equal((1, false, "admin"), (after.VerifiedCount, after.Stale, after.LastAttempt!.Trigger));
        Assert.NotNull(after.LastVerified);
        Assert.True(after.StoredBytes > 0);
    }

    [Fact]
    public async Task A_host_without_backups_says_so_and_runs_nothing()
    {
        using var api = new LorexApiFactory();
        var (admin, adminId) = await PublishingTestClient.Account(api, "dbbackup-off");
        using (var scope = api.Services.CreateScope())
        {
            await PlatformAdminProvisioning.ProvisionAsync(scope.ServiceProvider.GetRequiredService<LorexDbContext>(), adminId, CancellationToken.None);
        }

        var status = (await admin.GetFromJsonAsync<DatabaseBackupStatus>("/api/admin/database-backups"))!;
        Assert.Equal((false, false, (string?)null), (status.Enabled, status.Stale, status.Store));
        var refused = await admin.PostAsync("/api/admin/database-backups/run", null);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("database_backup_not_configured", await PublishingTestClient.ProblemCode(refused));
    }

    [Fact]
    public void The_working_folder_is_the_owner_s_alone()
    {
        // A snapshot is the whole database, password hashes included (issue #33, R-2).
        var folder = Path.Combine(_folder, "work", "lorex-db-backup", "run");
        DatabaseSnapshot.CreatePrivateDirectory(folder);
        Assert.True(Directory.Exists(folder));
        if (!OperatingSystem.IsWindows())
        {
            var ownerOnly = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute;
            Assert.Equal(ownerOnly, File.GetUnixFileMode(folder));
            Assert.Equal(ownerOnly, File.GetUnixFileMode(Path.GetDirectoryName(folder)!));
        }
    }

    [Fact]
    public void An_r2_target_needs_every_setting_and_never_describes_its_secret()
    {
        var options = new DatabaseBackupOptions
        {
            Enabled = true,
            Environment = "dev",
            R2 = new DatabaseBackupR2Options { AccountId = "acct", Bucket = "lorex-db-dev", AccessKeyId = "key-id", SecretAccessKey = "s3cr3t-value" },
        };
        var target = DatabaseBackupSetup.TargetFor(options);
        Assert.Null(target.Problem);
        Assert.Equal("R2 bucket lorex-db-dev", target.Store!.Describe);

        options.R2.SecretAccessKey = null;
        Assert.Contains("SecretAccessKey", DatabaseBackupSetup.TargetFor(options).Problem, StringComparison.Ordinal);
        Assert.Null(DatabaseBackupSetup.TargetFor(options).Store);

        options.R2.SecretAccessKey = "s3cr3t-value";
        options.Environment = "../prod";
        Assert.NotNull(DatabaseBackupSetup.TargetFor(options).Problem);
    }

    // ---------- Helpers ----------

    private DatabaseBackupRunner Detached(IDatabaseBackupStore store, TimeProvider? clock = null, bool prune = false) => new(
        _api.Services.GetRequiredService<IServiceScopeFactory>(),
        Options.Create(new DatabaseBackupOptions
        {
            Enabled = true,
            Environment = "test",
            WorkingDirectory = Path.Combine(_folder, "work"),
            Retention = new DatabaseBackupRetentionOptions { PruneEnabled = prune },
        }),
        new DatabaseBackupTarget(store, null),
        clock ?? TimeProvider.System,
        NullLogger<DatabaseBackupRunner>.Instance);

    private async Task<(string Manifest, string Data)> Package(string databasePath, string name)
    {
        SqliteConnection.ClearAllPools();
        var data = Path.Combine(_folder, name + ".db.gz");
        await using (var input = File.OpenRead(databasePath))
        await using (var output = File.Create(data))
        await using (var gzip = new GZipStream(output, CompressionLevel.Optimal))
        {
            await input.CopyToAsync(gzip);
        }

        var (bytes, sha) = await DatabaseSnapshot.HashAsync(data, CancellationToken.None);
        var manifest = new DatabaseBackupManifest(
            DatabaseBackupManifest.FormatName, 1, "test", DateTime.UtcNow, DateTime.UtcNow, "test",
            new DatabaseBackupProvenance("test", "test", null, databasePath),
            await DatabaseSnapshot.InspectAsync(databasePath, null, CancellationToken.None),
            new DatabaseBackupObject(name, "gzip", bytes, sha));
        var manifestPath = Path.Combine(_folder, name + ".manifest.json");
        await File.WriteAllBytesAsync(manifestPath, JsonSerializer.SerializeToUtf8Bytes(manifest, DatabaseBackupManifest.Json));
        return (manifestPath, data);
    }

    private static async Task Seed(IDatabaseBackupStore store, DateTime stamp)
    {
        var name = $"lorex-db/test/{stamp:yyyy}/{stamp:MM}/{stamp:yyyyMMdd'T'HHmmss'Z'}-00000000";
        await store.PutAsync(name + ".db.gz", new MemoryStream([1, 2, 3]), "application/gzip", default);
        await store.PutAsync(name + ".manifest.json", new MemoryStream("{}"u8.ToArray()), "application/json", default);
    }

    private sealed class FixedClock(DateTime now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(now, TimeSpan.Zero);
    }

    /// <summary>A folder store that can corrupt what it reads back, refuse manifests like R2 refusing a token, or hold an upload.</summary>
    private sealed class FaultyStore(string root) : IDatabaseBackupStore
    {
        private readonly FileSystemDatabaseBackupStore _inner = new(root);

        public bool CorruptReads { get; set; }

        public bool RefuseManifests { get; set; }

        public TaskCompletionSource? Hold { get; init; }

        public TaskCompletionSource Reached { get; } = new();

        public string Describe => _inner.Describe;

        public async Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken)
        {
            Reached.TrySetResult();
            if (Hold is not null)
            {
                await Hold.Task;
            }

            if (RefuseManifests && key.EndsWith(".manifest.json", StringComparison.Ordinal))
            {
                throw new Amazon.S3.AmazonS3Exception("Access Denied", Amazon.Runtime.ErrorType.Sender, "AccessDenied", "request", HttpStatusCode.Forbidden);
            }

            await _inner.PutAsync(key, content, contentType, cancellationToken);
        }

        public async Task<Stream?> OpenAsync(string key, CancellationToken cancellationToken)
        {
            var stream = await _inner.OpenAsync(key, cancellationToken);
            if (stream is null || !CorruptReads)
            {
                return stream;
            }

            await using (stream)
            {
                var copy = new MemoryStream();
                await stream.CopyToAsync(copy, cancellationToken);
                copy.WriteByte(0);
                copy.Position = 0;
                return copy;
            }
        }

        public Task<IReadOnlyList<StoredBackupObject>> ListAsync(string prefix, CancellationToken cancellationToken) => _inner.ListAsync(prefix, cancellationToken);

        public Task DeleteAsync(string key, CancellationToken cancellationToken) => _inner.DeleteAsync(key, cancellationToken);
    }
}
