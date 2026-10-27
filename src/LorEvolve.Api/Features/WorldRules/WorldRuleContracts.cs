using LorEvolve.Api.Features.RuleValidation;

namespace LorEvolve.Api.Features.WorldRules;

/// <summary>
/// Creating a world rule, or saving one whole.
///
/// <paramref name="Title"/> is required and trimmed. <paramref name="Description"/> is plain text stored exactly as sent; null
/// reads as <c>""</c>.
///
/// <paramref name="ExpectedUpdatedAt"/> is the <c>updatedAt</c> the edit was written over, on an update. When the rule has
/// changed since - or none is named - the save is refused with 409 <c>world_rule_changed</c> and nothing is written. Ignored on
/// create.
///
/// <paramref name="Validation"/> is the rule's optional structured check (ADR 0034). Left out, a save keeps the stored check; its
/// kind <c>None</c> removes it. It is saved with the words, under the same stale-save protection.
/// </summary>
public sealed record WorldRuleRequest(
    string? Title,
    string? Description,
    DateTime? ExpectedUpdatedAt,
    WorldRuleValidationRequest? Validation = null);

/// <summary>
/// A list row: enough to find a rule again, never its whole description. <paramref name="Excerpt"/> is the start of the
/// description, and <paramref name="IsExcerptShortened"/> says there is more. <paramref name="HasCheck"/> says the rule carries a
/// structured check; what the check says and finds is on the rule itself.
/// </summary>
public sealed record WorldRuleSummary(
    Guid Id,
    string Title,
    string Excerpt,
    bool IsExcerptShortened,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool HasCheck = false);

public sealed record WorldRulePage(
    IReadOnlyList<WorldRuleSummary> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>
/// One rule, whole: what was written, and - only when the author attached one - its structured check.
///
/// <paramref name="Validation"/> and <paramref name="Check"/> are both null for a rule that is words only, which is never checked:
/// nothing reads its words. <paramref name="Check"/> is derived when the rule is read - what counting the timeline for this rule
/// establishes, including that it could not count everything - and is never stored.
/// </summary>
public sealed record WorldRuleDetail(
    Guid Id,
    string Title,
    string Description,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    WorldRuleValidationResponse? Validation = null,
    WorldRuleCheck? Check = null);
