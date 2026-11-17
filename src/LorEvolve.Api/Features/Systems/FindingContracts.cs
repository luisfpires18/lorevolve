namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// What one sweep did (LOREX-020).
///
/// <paramref name="IsTruncated"/> is true when the rules produced more findings than one sweep records. Nothing is
/// closed in that case, because a sweep that did not see everything must not conclude that anything is gone.
/// </summary>
public sealed record WorldLogicSweepResponse(
    int Detected,
    int Created,
    int Reopened,
    int Persisted,
    int Closed,
    bool IsTruncated,
    DateTime EvaluatedAt);

/// <summary>
/// The order a page of findings comes back in.
///
/// <see cref="Attention"/> is the default and what every caller before #209 got: open findings first, then the worst
/// severity, then the oldest. <see cref="Newest"/> is the plain reverse-chronological order a list of records reads
/// in, which is what the World Logic page asks for.
///
/// Both end on the id, so a finding never swaps pages between two requests whichever order was asked for.
/// </summary>
public enum WorldLogicFindingSort
{
    Attention = 0,
    Newest = 1,
}

/// <summary>
/// One recorded finding, as a list row.
///
/// <paramref name="Outcome"/> is <c>violation</c>, <c>unknown</c> or <c>error</c>, and <paramref name="Status"/> is
/// <c>open</c>, <c>reviewing</c>, <c>resolved</c> or <c>dismissed</c>. Both are text rather than numbers, because a
/// client shows the word and a new value must not shift an existing one's meaning.
///
/// <paramref name="Severity"/> is <c>low</c>, <c>medium</c> or <c>high</c>, and is a pure function of the outcome
/// (<see cref="WorldLogicFindingSeverity"/>). It is not a confidence number and nothing estimates it.
///
/// <paramref name="RuleVersion"/> and <paramref name="SchemaVersion"/> are what the rule was when the finding was
/// produced, so the finding names exactly the rule that produced it.
///
/// A machine finding (#360) has a null <paramref name="RuleId"/> and <paramref name="RuleTitle"/>, names its System,
/// state and subject in <paramref name="Machine"/> instead, and its <paramref name="RuleVersion"/> is the System's
/// version. A rule finding has a null <paramref name="Machine"/>.
/// </summary>
public sealed record WorldLogicFindingRow(
    Guid Id,
    Guid? RuleId,
    string? RuleTitle,
    Guid? ProjectId,
    string Outcome,
    string Severity,
    string Status,
    string? ErrorCode,
    int RuleVersion,
    int SchemaVersion,
    string Fingerprint,
    int EvidenceCount,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? ResolvedAt,
    WorldLogicFindingMachineRow? Machine = null);

/// <summary>
/// What a machine finding is about. <paramref name="Check"/> is <c>undeclared_state</c> or
/// <c>no_transition_holds</c>. <paramref name="StateId"/> is null for <c>undeclared_state</c>, and a name is null
/// when the state or the entry is no longer there.
/// </summary>
public sealed record WorldLogicFindingMachineRow(
    Guid SystemId,
    string SystemName,
    string Check,
    Guid? StateId,
    string? StateName,
    Guid SubjectId,
    string? SubjectName);

/// <summary>
/// One recorded finding, whole: its row, the ids the outcome depended on, the evaluator's trace and the history of
/// what the author did about it.
///
/// <paramref name="Rationale"/> is diagnostic text in one language and is never rendered as prose to a reader
/// (ADR 0072, specification section 9).
/// </summary>
public sealed record WorldLogicFindingDetail(
    WorldLogicFindingRow Finding,
    IReadOnlyList<ConditionEvidenceRow> Evidence,
    IReadOnlyList<string> Rationale,
    IReadOnlyList<WorldLogicFindingEventRow> History);

/// <summary>
/// One entry in a finding's history. <paramref name="Action"/> is <c>detected</c>, <c>reopened</c>,
/// <c>reviewed</c>, <c>dismissed</c>, <c>resolved</c> or <c>closed</c>, and <paramref name="ActorId"/> is null for
/// the changes no account makes: evaluation opening, reopening or closing a finding, and a restore re-applying a
/// dismissal the backup carried.
/// </summary>
public sealed record WorldLogicFindingEventRow(
    string Action,
    string? ActorId,
    string Note,
    DateTime At);

/// <summary>What the author wrote when reviewing, dismissing or resolving a finding. Optional, and never read for meaning.</summary>
public sealed record WorldLogicFindingDecisionRequest(string? Note = null);
