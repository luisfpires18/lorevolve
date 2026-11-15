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
/// <paramref name="DependsOn"/> is the set of rule definitions this rule's <c>ruleHolds</c> nodes may name. A
/// reference to a rule outside it, a cycle, or an id from another universe is refused.
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
    int? ExpectedVersion = null);

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
    DateTime UpdatedAt);

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

public sealed record WorldLogicPage<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
