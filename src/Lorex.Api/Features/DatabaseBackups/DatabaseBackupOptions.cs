namespace Lorex.Api.Features.DatabaseBackups;

/// <summary>
/// <c>DatabaseBackup:*</c> (issue #54, ADR 0064). Off unless <see cref="Enabled"/>; no credential has a default, and none is
/// ever committed - the R2 keys come from App Service settings (or user secrets locally).
/// </summary>
public sealed class DatabaseBackupOptions
{
    public const string Section = "DatabaseBackup";

    public bool Enabled { get; set; }

    /// <summary>
    /// Off for "manual only": no scheduled run, but Admin's Run now and the CLI still work. Tests and a restore drill use it.
    /// </summary>
    public bool Automatic { get; set; } = true;

    /// <summary>Provenance: written into every manifest and into every key, so DEV, alpha and production never mix.</summary>
    public string? Environment { get; set; }

    /// <summary><c>R2</c> (a deployment) or <c>FileSystem</c> (local drills and tests).</summary>
    public string Store { get; set; } = "R2";

    public string? FileSystemPath { get; set; }

    /// <summary>The first segment of every key: <c>{Prefix}/{Environment}/{yyyy}/{MM}/...</c>.</summary>
    public string Prefix { get; set; } = "lorex-db";

    /// <summary>How old the last verified backup may get before the next one is due.</summary>
    public TimeSpan Interval { get; set; } = TimeSpan.FromHours(24);

    /// <summary>When the last verified backup is older than this, status says stale and every check logs a warning.</summary>
    public TimeSpan StaleAfter { get; set; } = TimeSpan.FromHours(26);

    /// <summary>Where a snapshot is written before upload; the machine's temp folder when unset. Local disk, never <c>/home</c>.</summary>
    public string? WorkingDirectory { get; set; }

    public DatabaseBackupR2Options R2 { get; set; } = new();

    public DatabaseBackupRetentionOptions Retention { get; set; } = new();
}

/// <summary>Its own bucket and its own token, never the media bucket's: a backup key can read no live picture, and the reverse.</summary>
public sealed class DatabaseBackupR2Options
{
    public string? AccountId { get; set; }

    public string? Bucket { get; set; }

    public string? AccessKeyId { get; set; }

    public string? SecretAccessKey { get; set; }

    public string? ServiceUrl { get; set; }
}

/// <summary>
/// The proposed policy (ADR 0064): every backup younger than <see cref="KeepDays"/> days, the first of each month for
/// <see cref="KeepMonths"/> months, and always the newest <see cref="KeepNewest"/>. Pruning is off until the owner turns it
/// on, and then runs only after a fresh backup has been verified.
/// </summary>
public sealed class DatabaseBackupRetentionOptions
{
    public bool PruneEnabled { get; set; }

    public int KeepDays { get; set; } = 30;

    public int KeepMonths { get; set; } = 12;

    public int KeepNewest { get; set; } = 3;
}
