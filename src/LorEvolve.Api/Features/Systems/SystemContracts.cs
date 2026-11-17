using System.Text.Json;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// Creating a System, or saving one whole.
///
/// <paramref name="Name"/> is required and trimmed, and unique within the universe and the scope.
/// <paramref name="Summary"/> is plain text stored exactly as sent; null reads as <c>""</c>.
///
/// <paramref name="ProjectId"/> is the project the System belongs to, or null for the whole universe. It is fixed
/// at creation: moving a System between scopes would re-mean every project-scoped exception its rules carry, so a
/// save that names a different one is refused.
///
/// <paramref name="ExpectedVersion"/> is the <c>version</c> the edit was written over, on an update. When the
/// System has changed since, or none is named, the save is refused with 409 <c>system_changed</c> and nothing is
/// written. Ignored on create.
/// </summary>
public sealed record SystemRequest(
    string? Name,
    string? Summary,
    Guid? ProjectId = null,
    int? ExpectedVersion = null);

/// <summary>
/// A list row: enough to find a System again, never its whole summary. <paramref name="RuleCount"/> is how many
/// rule definitions it references.
/// </summary>
public sealed record SystemSummary(
    Guid Id,
    string Name,
    string Excerpt,
    bool IsExcerptShortened,
    WorldLogicScope Scope,
    Guid? ProjectId,
    int RuleCount,
    int Version,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>One System, whole, with the rule definitions it references in the author's order for this System.</summary>
public sealed record SystemDetail(
    Guid Id,
    string Name,
    string Summary,
    WorldLogicScope Scope,
    Guid? ProjectId,
    int Version,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<SystemRuleSummary> Rules);

/// <summary>
/// Creating a rule definition, or saving one whole.
///
/// <paramref name="Condition"/> is the typed condition tree (ADR 0072), or null for a rule that is words only.
/// Sending it requires <paramref name="SchemaVersion"/>; the pair is validated structurally before anything is
/// written, and a tree the specification does not describe is refused with the specification's own error code.
///
/// <paramref name="Exceptions"/> is the rule's explicit exceptions, an array of
/// <c>{ id, scope: { kind, projectId? }, when }</c>, or null for a rule with none (ADR 0072, section 5.1). Each
/// <c>when</c> is an ordinary condition tree and is validated as one. They are evaluated only when the condition
/// came out false, a project-scoped one outranks a universe-scoped one, and declared order decides inside a scope.
///
/// <paramref name="DependsOn"/> is the set of rule definitions this rule's <c>ruleHolds</c> nodes may name, in the
/// condition and in any exception. A reference to a rule outside it, a cycle, or an id from another universe is
/// refused.
///
/// <paramref name="ProjectId"/> and <paramref name="ExpectedVersion"/> behave as they do for a System.
/// </summary>
public sealed record SystemRuleRequest(
    string? Title,
    string? Description,
    Guid? ProjectId = null,
    int? SchemaVersion = null,
    JsonElement? Condition = null,
    IReadOnlyList<Guid>? DependsOn = null,
    int? ExpectedVersion = null,
    JsonElement? Exceptions = null);

/// <summary>
/// A rule definition's list row. <paramref name="HasCondition"/> says the rule carries a condition tree; what the
/// tree says is on the rule itself, and what it finds is a finding (LOREX-020).
/// </summary>
public sealed record SystemRuleSummary(
    Guid Id,
    string Title,
    string Excerpt,
    bool IsExcerptShortened,
    WorldLogicScope Scope,
    Guid? ProjectId,
    bool HasCondition,
    int SystemCount,
    int Version,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// One rule definition, whole. <paramref name="Systems"/> is every System that references it, which is also what
/// makes a deletion refusable, and <paramref name="DependsOn"/> is the declared dependency set.
/// </summary>
public sealed record SystemRuleDetail(
    Guid Id,
    string Title,
    string Description,
    WorldLogicScope Scope,
    Guid? ProjectId,
    int? SchemaVersion,
    JsonElement? Condition,
    IReadOnlyList<Guid> DependsOn,
    IReadOnlyList<SystemReference> Systems,
    int Version,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    JsonElement? Exceptions = null);

/// <summary>A System named from somewhere else: its id and the name a reader recognises.</summary>
public sealed record SystemReference(Guid Id, string Name);

/// <summary>One saved state of a System or a rule definition, newest first.</summary>
public sealed record WorldLogicRevisionRow(
    int Version,
    DateTime SavedAt,
    string Title,
    string Body,
    bool HasCondition);

/// <summary>
/// One row of the unified World Logic rule list: a legacy world rule or a rule definition, reported with its own
/// id and the table it came from.
///
/// <paramref name="Source"/> is <c>worldRule</c> or <c>systemRule</c>, and it is what a client uses to choose the
/// route to open the row with. The two kinds keep their own endpoints: nothing here replaces either, and a world
/// rule's id is the same id it has always had (ADR 0033).
/// </summary>
public sealed record WorldLogicRuleRow(
    Guid Id,
    string Source,
    string Title,
    string Excerpt,
    bool IsExcerptShortened,
    bool HasCheck,
    bool HasCondition,
    WorldLogicScope Scope,
    Guid? ProjectId,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// One evaluation of one rule against one target (ADR 0072, specification section 9).
///
/// <paramref name="Outcome"/> is <c>true</c>, <c>false</c>, <c>unknown</c>, <c>error</c> or <c>exempt</c>, as text
/// rather than a number, because a client shows the word and a new outcome must not shift an existing one's
/// meaning. <paramref name="Evidence"/> is the ids the outcome depended on, in evaluation order.
/// <paramref name="Rationale"/> is a diagnostic trace in one language: it is never rendered as prose to a reader.
///
/// Nothing is stored by an evaluation through this route. Persisting a finding is LOREX-020.
/// </summary>
public sealed record ConditionEvaluationResponse(
    Guid RuleId,
    int RuleVersion,
    int SchemaVersion,
    string Outcome,
    string? ErrorCode,
    string? ExemptionId,
    IReadOnlyList<ConditionEvidenceRow> Evidence,
    IReadOnlyList<string> Rationale);

/// <summary>One record an outcome depended on: which table, which row, and the part it played.</summary>
public sealed record ConditionEvidenceRow(string Source, string Id, string Role);

public sealed record WorldLogicPage<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>Which attribute of which subject type a machine's states are values of, compared as text (ADR 0073).</summary>
public sealed record SystemMachineBinding(string? SubjectType, string? Attribute);

/// <summary>
/// One state of a machine. <paramref name="Id"/> is the client's, unique within the document.
/// <paramref name="Name"/> is trimmed; <paramref name="Value"/> is stored exactly as sent.
/// </summary>
public sealed record SystemMachineState(Guid Id, string? Name, string? Value, bool Initial, double X, double Y);

/// <summary>One transition, in declared order. <paramref name="GuardRuleId"/> names a rule definition, or is null.</summary>
public sealed record SystemMachineTransition(Guid Id, Guid FromStateId, Guid ToStateId, string? Label, Guid? GuardRuleId);

/// <summary>
/// Saving a System's machine whole (state machine specification, section 3). An empty document - no binding, no
/// states, no transitions - removes the machine. <paramref name="ExpectedVersion"/> is the System's version and
/// behaves as it does for a System save.
/// </summary>
public sealed record SystemMachineRequest(
    int SchemaVersion,
    SystemMachineBinding? Binding,
    IReadOnlyList<SystemMachineState>? States,
    IReadOnlyList<SystemMachineTransition>? Transitions,
    int? ExpectedVersion);

/// <summary>
/// A System's machine, whole, with the System's version. A System with none has a null binding and empty lists.
/// <paramref name="OpenFindings"/> counts the open and reviewing machine findings per state, in the System's own
/// scope (#360); a state with none is not listed.
/// </summary>
public sealed record SystemMachineDetail(
    Guid SystemId,
    int Version,
    int SchemaVersion,
    SystemMachineBinding? Binding,
    IReadOnlyList<SystemMachineState> States,
    IReadOnlyList<SystemMachineTransition> Transitions,
    IReadOnlyList<SystemMachineOpenFindings> OpenFindings);

public sealed record SystemMachineOpenFindings(Guid StateId, int Count);

/// <summary>
/// "Try an entry" (#360): the entry's bound value, every transition's guard for it, and the records both checks
/// produce, in the shape of state machine specification section 5. Nothing is written.
/// <paramref name="Value"/> is null when the entry is of another type, has no value, or holds one that is not text.
/// </summary>
public sealed record SystemMachineTryResponse(
    string? Value,
    IReadOnlyList<SystemMachineGuardRow> Transitions,
    IReadOnlyList<SystemMachineRecordRow> Records);

/// <summary>
/// One transition's guard for the entry. <paramref name="Guard"/> is <c>true</c>, <c>false</c>, <c>unknown</c>,
/// <c>error</c> or <c>none</c>; an exempt rule counts as met and reads <c>true</c>.
/// </summary>
public sealed record SystemMachineGuardRow(Guid TransitionId, string Guard, string? ErrorCode);

/// <summary>
/// One record, as section 5 writes it. <paramref name="Check"/> is <c>undeclared_state</c> or
/// <c>no_transition_holds</c>, and <paramref name="Outcome"/> is <c>violation</c>, <c>unknown</c> or <c>error</c>.
/// </summary>
public sealed record SystemMachineRecordRow(
    Guid SystemId,
    int SystemVersion,
    int SchemaVersion,
    string Check,
    Guid? StateId,
    Guid SubjectId,
    string Outcome,
    string? ErrorCode,
    IReadOnlyList<ConditionEvidenceRow> Evidence,
    IReadOnlyList<string> Rationale);
