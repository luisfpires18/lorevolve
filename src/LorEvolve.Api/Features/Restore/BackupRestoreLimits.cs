using LorEvolve.Api.Features.Media;

namespace LorEvolve.Api.Features.Restore;

/// <summary>
/// How much of an uploaded backup LorEvolve is willing to look at, and for how long. See ADR 0032.
///
/// Every number here exists because a backup is hostile input until it has been read: a few
/// kilobytes of ZIP can describe gigabytes of output, a central directory can claim millions of
/// entries, and JSON can nest until a parser runs out of stack. Each limit is checked against
/// what is actually read, never only against what the file says about itself.
///
/// They are sized from the export, not guessed. A backup is <c>backup.json</c> plus one original
/// per entry with a picture, and an original was refused above
/// <see cref="ImagePreparation.MaxUploadBytes"/> when it was uploaded, so no archive LorEvolve wrote
/// holds a larger one. The document is text, and history dominates it (ADR 0013, ADR 0014): a
/// universe with thousands of entries, hundreds of scenes and years of saved versions stays well
/// inside the bound.
/// </summary>
public static class BackupRestoreLimits
{
    /// <summary>The uploaded file as sent. Anything larger is refused while it is still arriving.</summary>
    public const long MaxUploadBytes = 512L * 1024 * 1024;

    /// <summary>Everything the archive holds once decompressed, summed as it is actually read.</summary>
    public const long MaxUncompressedBytes = 1024L * 1024 * 1024;

    /// <summary><c>backup.json</c> decompressed. It is parsed whole, so this is also the parser's memory bound.</summary>
    public const long MaxDocumentBytes = 128L * 1024 * 1024;

    /// <summary>One picture. The same ceiling the picture was uploaded under.</summary>
    public const long MaxMediaBytes = ImagePreparation.MaxUploadBytes;

    /// <summary>The document and at most this many pictures, counted before the archive is opened.</summary>
    public const int MaxArchiveEntries = 5_001;

    /// <summary>The ZIP's table of contents. Read into memory by the platform before any entry is, so bounded first.</summary>
    public const long MaxCentralDirectoryBytes = 8L * 1024 * 1024;

    /// <summary>Longest path an entry may have. LorEvolve writes at most 76 characters.</summary>
    public const int MaxEntryNameLength = 200;

    /// <summary>Rows the restore would write, across every table.</summary>
    public const int MaxRecords = 1_000_000;

    /// <summary>How deeply <c>backup.json</c> may nest. LorEvolve writes about ten levels.</summary>
    public const int MaxJsonDepth = 32;

    /// <summary>How long a validated upload waits for its restore.</summary>
    public static readonly TimeSpan StagedLifetime = TimeSpan.FromMinutes(30);

    /// <summary>Validated uploads waiting at once, across every account.</summary>
    public const int MaxStagedBackups = 16;

    /// <summary>Disk held by validated uploads at once, across every account.</summary>
    public const long MaxStagedBytes = 2L * 1024 * 1024 * 1024;

    /// <summary>Problems listed for one refused backup. The rest are counted, not listed.</summary>
    public const int MaxReportedIssues = 20;

    /// <summary>Pictures decoded, cut and stored at once during a validation or a restore.</summary>
    public const int ImageConcurrency = 4;
}
