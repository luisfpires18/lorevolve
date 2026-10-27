using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Features.CanonIntegrity;

/// <summary>How badly a conflict undermines the lore it was found in.</summary>
public enum CanonConflictSeverity
{
    /// <summary>Suspicious, worth a look. Never a reason to block anything.</summary>
    Low = 0,

    /// <summary>A likely inconsistency. Should be addressed, but the lore still stands.</summary>
    Medium = 1,

    /// <summary>
    /// Logically incompatible or structurally impossible. The only severity that blocks: a
    /// write that would introduce a new one is refused with 409 by
    /// <see cref="CanonPromotionGate"/>. High findings already on record block nothing.
    /// </summary>
    High = 2,
}

/// <summary>
/// Where a conflict stands with its author. The lifecycle is deterministic: detection
/// opens a conflict, the issue disappearing closes it, and only the author dismisses one.
/// </summary>
public enum CanonConflictStatus
{
    /// <summary>Detected and not yet acted on.</summary>
    Pending = 0,

    /// <summary>No longer detected. Set by evaluation, never by the author.</summary>
    Resolved = 1,

    /// <summary>The author has seen it and chosen to live with it. Never reopened by evaluation.</summary>
    Dismissed = 2,
}

/// <summary>
/// The kind of record a conflict points at. Conflicts reference heterogeneous lore, so
/// the reference table carries a kind and a raw id rather than one nullable foreign key
/// per table. Only kinds the current rules actually produce exist here.
/// </summary>
public enum CanonSubjectKind
{
    Entity = 0,
    Relationship = 1,
    TimelineEntry = 2,

    /// <summary>
    /// A field definition, not a stored value: the value row is rewritten whenever the
    /// entity is saved, so its id would churn, while the definition's id is stable.
    /// </summary>
    EntityField = 3,

    /// <summary>A world rule whose structured check a finding is about (ADR 0034). Named only while the rule is live.</summary>
    WorldRule = 4,
}

/// <summary>
/// One problem a rule found in one universe.
///
/// A conflict is a derived finding, not lore. Nothing here is authored, and nothing here
/// changes the records it describes: LorEvolve records that something looks wrong and leaves
/// the source lore exactly as the author wrote it. The whole table is regenerable from
/// the lore by running evaluation again, apart from the author's own dismissals.
/// </summary>
public sealed class CanonConflict
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>Stable identifier of the rule that produced this, such as "CANON-REL-001".</summary>
    public required string RuleCode { get; set; }

    public CanonConflictSeverity Severity { get; set; }

    public CanonConflictStatus Status { get; set; }

    /// <summary>
    /// A hash over the rule code and the ids the finding is about. Two evaluations of the
    /// same unchanged problem produce the same fingerprint, which is what lets a repeated
    /// run recognise a conflict it has already recorded instead of duplicating it.
    /// Materially different facts hash differently and open a new conflict.
    /// </summary>
    public required string Fingerprint { get; set; }

    public required string Title { get; set; }

    public required string Explanation { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>Set when the issue stopped being detected. Cleared if it comes back.</summary>
    public DateTime? ResolvedAt { get; set; }

    public ICollection<CanonConflictSubject> Subjects { get; } = [];
}

/// <summary>
/// One record involved in one conflict, with the part it plays. Kept relational rather
/// than as a JSON list so the rows stay queryable, but deliberately without a foreign key:
/// the target may live in any of several tables, and a conflict is regenerable, so a
/// dangling row survives only until the next evaluation.
/// </summary>
public sealed class CanonConflictSubject
{
    public Guid ConflictId { get; set; }

    public CanonConflict? Conflict { get; set; }

    public CanonSubjectKind SubjectKind { get; set; }

    public Guid SubjectId { get; set; }

    /// <summary>What this record is to the conflict: "relationship", "owner", "reference".</summary>
    public required string Role { get; set; }
}
