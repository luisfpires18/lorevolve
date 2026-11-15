using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.RuleValidation.Conditions;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// What evaluating a rule found, as a finding records it (ADR 0072, specification section 4).
///
/// Three outcomes are worth recording, and keeping them apart is the point of the table: a proven violation is not
/// missing data, and neither is a rule this build could not run. <c>true</c> and <c>exempt</c> produce no finding at
/// all, because there is nothing to report: the rule held, or the author already wrote down why it does not have to.
///
/// Stored as an int, so the names may be reordered only by never reusing a number.
/// </summary>
public enum WorldLogicFindingOutcome
{
    /// <summary>
    /// The condition did not hold and no exception applied: the evaluator's <see cref="ConditionOutcome.False"/>.
    /// This is the only outcome that asserts the lore is wrong.
    /// </summary>
    Violation = 0,

    /// <summary>
    /// The stored facts do not settle the question: the evaluator's <see cref="ConditionOutcome.Unknown"/>. It says
    /// nothing about the lore, only that the universe does not yet record enough to answer.
    /// </summary>
    Unknown = 1,

    /// <summary>
    /// The rule, one of its dependencies or a budget failed: the evaluator's <see cref="ConditionOutcome.Error"/>,
    /// always with <see cref="WorldLogicFinding.ErrorCode"/>. A defect in the rule, not in the lore.
    /// </summary>
    Error = 2,
}

/// <summary>
/// How much a finding matters. A pure function of <see cref="WorldLogicFindingOutcome"/>
/// (<see cref="WorldLogicFindingSeverity.Of"/>), never stored and never guessed, because the only thing LorEvolve
/// knows deterministically about a finding is which of the three outcomes it is. There is no model and no
/// confidence number here.
/// </summary>
public enum WorldLogicSeverity
{
    /// <summary>An unknown. Worth filling in, never a reason to act.</summary>
    Low = 0,

    /// <summary>An evaluator error: the rule needs fixing before it can say anything about the lore.</summary>
    Medium = 1,

    /// <summary>A proven violation.</summary>
    High = 2,
}

/// <summary>Severity from outcome, in one place, so the API and any later screen cannot disagree.</summary>
public static class WorldLogicFindingSeverity
{
    public static WorldLogicSeverity Of(WorldLogicFindingOutcome outcome) => outcome switch
    {
        WorldLogicFindingOutcome.Violation => WorldLogicSeverity.High,
        WorldLogicFindingOutcome.Error => WorldLogicSeverity.Medium,
        _ => WorldLogicSeverity.Low,
    };
}

/// <summary>
/// Where a finding stands with its author. The lifecycle is deterministic and mirrors a Canon conflict's
/// (ADR 0010): evaluation opens a finding and closes it when the rules stop producing it, and only the author
/// dismisses one.
///
/// Stored as an int, so the names may be reordered only by never reusing a number.
/// </summary>
public enum WorldLogicFindingStatus
{
    /// <summary>Detected and not yet acted on.</summary>
    Open = 0,

    /// <summary>The author has seen it and is dealing with it. Still detected; evaluation leaves it here.</summary>
    Reviewing = 1,

    /// <summary>
    /// Set by evaluation when the rules no longer produce it, and by the author who says the lore is fixed. An
    /// author's resolve is not a suppression: if the next run still produces the finding it reopens, because the
    /// problem is still there.
    /// </summary>
    Resolved = 2,

    /// <summary>
    /// The author has seen it and chosen to live with it. Never reopened by evaluation. The one part of this table
    /// that is not derived from the lore, and so the only part a backup carries.
    /// </summary>
    Dismissed = 3,
}

/// <summary>What changed a finding's status, for the history that <see cref="WorldLogicFindingEvent"/> keeps.</summary>
public enum WorldLogicFindingAction
{
    /// <summary>Evaluation recorded the finding for the first time.</summary>
    Detected = 0,

    /// <summary>Evaluation recorded it again after it had been resolved.</summary>
    Reopened = 1,

    /// <summary>The author acknowledged it.</summary>
    Reviewed = 2,

    /// <summary>The author chose to live with it.</summary>
    Dismissed = 3,

    /// <summary>The author said the lore is fixed.</summary>
    Resolved = 4,

    /// <summary>Evaluation stopped producing it, so it was closed.</summary>
    Closed = 5,
}

/// <summary>
/// One thing evaluating one stored rule found in one universe (ADR 0072, LOREX-020).
///
/// <b>Derived, not authored.</b> Nothing here is written by hand and nothing here changes the lore it describes.
/// The whole table regenerates by evaluating again, apart from the author's own dismissals, exactly as a Canon
/// conflict does (ADR 0010).
///
/// <b>Everything is the evaluator's own answer, stored.</b> The outcome, the rule version, the schema version, the
/// error code, the evidence and the rationale are copied from <see cref="ConditionResult"/>; nothing is recomputed
/// here, interpreted here or softened here. That is what makes a finding reproducible: run the same rule at the
/// same version over the same facts and the same record comes back.
///
/// <b>No model reaches this table.</b> Evaluation is a pure function of stored rules and stored facts (ADR 0072).
/// AI reaches World Logic only through MCP and the staged-change path (ADR 0047), and nothing a model asserts is
/// ever recorded here as a proven violation.
/// </summary>
public sealed class WorldLogicFinding
{
    public Guid Id { get; set; }

    /// <summary>
    /// The universe this was found in. Deliberately not a foreign key of its own: the finding reaches its universe
    /// through <see cref="Rule"/>, which cascades from the universe, so a second cascade path would buy nothing and
    /// the column exists to scope and index the review listing.
    /// </summary>
    public Guid UniverseId { get; set; }

    public Guid RuleId { get; set; }

    public SystemRule? Rule { get; set; }

    /// <summary>
    /// The project the evaluation named, or null for one over the whole universe. A project-scoped exception applies
    /// only when a project is named (ADR 0072, section 5.1), so the same rule and the same lore can answer
    /// differently per project. Each scope therefore keeps its own findings, and a sweep reconciles only its own.
    /// </summary>
    public Guid? ProjectId { get; set; }

    public CreativeProject? Project { get; set; }

    public WorldLogicFindingOutcome Outcome { get; set; }

    /// <summary>
    /// The specification's stable code (<see cref="ConditionErrors"/>) for an <see cref="WorldLogicFindingOutcome.Error"/>,
    /// null otherwise. Never localised, and shown as the code when a client does not know it.
    /// </summary>
    public string? ErrorCode { get; set; }

    /// <summary>The rule's version when this was found, so the finding names exactly the rule that produced it.</summary>
    public int RuleVersion { get; set; }

    /// <summary>The condition schema version the rule was written against.</summary>
    public int SchemaVersion { get; set; }

    /// <summary>
    /// A hash over the rule, the scope, the outcome, the error code and the evidence ids
    /// (<see cref="WorldLogicFingerprint"/>). Two evaluations of the same unchanged problem produce the same
    /// fingerprint, which is what lets a repeated run recognise a finding it already recorded instead of
    /// duplicating it. Materially different facts hash differently and open a new finding.
    /// </summary>
    public required string Fingerprint { get; set; }

    public WorldLogicFindingStatus Status { get; set; }

    /// <summary>
    /// The evaluator's rationale as a JSON array of strings, truncated to what the column holds
    /// (<see cref="WorldLogicFindingLimits.RationaleMaxLength"/>). Unlocalised diagnostic text, never prose for a
    /// reader and never translated (ADR 0072, specification section 9).
    /// </summary>
    public required string Rationale { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>Set when the finding stopped being produced, or when the author resolved it. Cleared if it comes back.</summary>
    public DateTime? ResolvedAt { get; set; }

    public ICollection<WorldLogicFindingEvidence> Evidence { get; } = [];

    public ICollection<WorldLogicFindingEvent> Events { get; } = [];
}

/// <summary>
/// One id the outcome depended on, and the part it played (ADR 0072, specification section 9).
///
/// Kept relational rather than as a JSON blob so the rows stay queryable, and deliberately without a foreign key on
/// <see cref="SourceRowId"/>: the evidence may point into any of several fact sources, the id is the evaluator's own
/// text rather than always a row of this database, and a finding is regenerable, so a dangling row survives only
/// until the next evaluation.
/// </summary>
public sealed class WorldLogicFindingEvidence
{
    public Guid FindingId { get; set; }

    public WorldLogicFinding? Finding { get; set; }

    /// <summary>The evaluator's order, which is part of the record: evidence is in evaluation order.</summary>
    public int SortOrder { get; set; }

    /// <summary>The fact source the id came from, as the specification names it: "subjects", "relations", "events".</summary>
    public required string Source { get; set; }

    /// <summary>The id exactly as the evaluator reported it. A row id in production; a fixture's own label in a test.</summary>
    public required string SourceRowId { get; set; }

    /// <summary>What this id was to the outcome: "self", "attribute:purity", "rule".</summary>
    public required string Role { get; set; }
}

/// <summary>
/// One entry in a finding's history: who changed its status, to what, and when.
///
/// Every author action leaves a row and so does every status change evaluation makes, so a dismissal or a
/// resolution can always be traced back to the account that made it. <see cref="ActorId"/> is null for the two
/// changes no account makes: evaluation opening, reopening or closing a finding, and a restore re-applying a
/// dismissal the backup carried.
///
/// This is review metadata about accounts, not the world, so a backup leaves it out (ADR 0041).
/// </summary>
public sealed class WorldLogicFindingEvent
{
    public Guid Id { get; set; }

    public Guid FindingId { get; set; }

    public WorldLogicFinding? Finding { get; set; }

    public WorldLogicFindingAction Action { get; set; }

    /// <summary>The account that did it, or null when evaluation or a restore did.</summary>
    public string? ActorId { get; set; }

    /// <summary>What the author wrote, or <c>""</c>. Plain text, never read for meaning.</summary>
    public required string Note { get; set; }

    public DateTime At { get; set; }
}
