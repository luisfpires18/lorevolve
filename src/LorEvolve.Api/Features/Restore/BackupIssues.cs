namespace LorEvolve.Api.Features.Restore;

/// <summary>
/// Why a backup cannot be restored, as the author is told it: a stable code the client may branch
/// on, and one sentence that says what is wrong in the author's terms. Never an exception message,
/// a stack, a SQL statement, an object key or a path on this machine.
/// </summary>
public sealed record BackupIssue(string Code, string Message);

/// <summary>The kind of refusal, which decides the response's status and top-level code.</summary>
public enum BackupRejection
{
    /// <summary>Not a LorEvolve backup at all: not a ZIP, not the envelope LorEvolve writes.</summary>
    NotABackup,

    /// <summary>A LorEvolve backup of a format version this build does not read.</summary>
    UnsupportedVersion,

    /// <summary>Recognisably a backup, but truncated, corrupt, or missing a part it names.</summary>
    Damaged,

    /// <summary>An archive shaped to escape or overwhelm the reader.</summary>
    Unsafe,

    /// <summary>Over one of <see cref="BackupRestoreLimits"/>.</summary>
    TooLarge,

    /// <summary>Readable, but its content cannot be reconstructed: broken references, bad values.</summary>
    Invalid,
}

/// <summary>
/// Raised wherever reading a backup has to stop. The one exception type the reader and the
/// validator throw on purpose, so everything else that escapes is a bug and is treated as one.
/// </summary>
public sealed class BackupRejectedException(BackupRejection rejection, IReadOnlyList<BackupIssue> issues, int moreIssues = 0)
    : Exception(issues.Count > 0 ? issues[0].Message : "The backup cannot be restored.")
{
    public BackupRejection Rejection { get; } = rejection;

    public IReadOnlyList<BackupIssue> Issues { get; } = issues;

    /// <summary>Problems found beyond the ones listed.</summary>
    public int MoreIssues { get; } = moreIssues;

    public static BackupRejectedException One(BackupRejection rejection, string code, string message) =>
        new(rejection, [new BackupIssue(code, message)]);
}

/// <summary>
/// The stable codes. The top-level ones name a <see cref="BackupRejection"/>; the rest name one
/// problem inside a backup.
/// </summary>
public static class BackupIssueCodes
{
    public const string NotABackup = "backup_not_lorevolve";
    public const string UnsupportedVersion = "backup_version_unsupported";
    public const string Damaged = "backup_damaged";
    public const string Unsafe = "backup_unsafe";
    public const string TooLarge = "backup_too_large";
    public const string Invalid = "backup_invalid";

    public const string MissingMember = "missing_member";
    public const string InvalidValue = "invalid_value";
    public const string TooLong = "too_long";
    public const string DuplicateId = "duplicate_id";
    public const string Duplicate = "duplicate";
    public const string MissingReference = "missing_reference";
    public const string InvalidOrder = "invalid_order";
    public const string MissingMedia = "missing_media";
    public const string InvalidImage = "invalid_image";
    public const string UnexpectedEntry = "unexpected_entry";
    public const string UnsafeEntry = "unsafe_entry";

    public static string For(BackupRejection rejection) => rejection switch
    {
        BackupRejection.NotABackup => NotABackup,
        BackupRejection.UnsupportedVersion => UnsupportedVersion,
        BackupRejection.Damaged => Damaged,
        BackupRejection.Unsafe => Unsafe,
        BackupRejection.TooLarge => TooLarge,
        _ => Invalid,
    };
}

/// <summary>
/// Collects content problems up to <see cref="BackupRestoreLimits.MaxReportedIssues"/> and counts
/// the rest, so a file with one systematic fault is described in a screenful rather than a
/// thousand lines.
/// </summary>
internal sealed class BackupIssueList
{
    private readonly List<BackupIssue> _issues = [];

    public int Count { get; private set; }

    public void Add(string code, string message)
    {
        Count++;

        if (_issues.Count < BackupRestoreLimits.MaxReportedIssues)
        {
            _issues.Add(new BackupIssue(code, message));
        }
    }

    public void ThrowIfAny(BackupRejection rejection = BackupRejection.Invalid)
    {
        if (Count > 0)
        {
            throw new BackupRejectedException(rejection, [.. _issues], Count - _issues.Count);
        }
    }
}
