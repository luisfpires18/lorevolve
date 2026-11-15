namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// One submitted claim as a list row. <paramref name="Status"/> is text, and the one a submission produces is always
/// <c>unverified</c>: there is no value here that means a violation was proven, because nothing proved one.
/// </summary>
public sealed record SemanticFindingRow(
    Guid Id,
    string Title,
    string Excerpt,
    bool IsExcerptShortened,
    Guid? RuleId,
    string? RuleTitle,
    Guid? ProjectId,
    string Status,
    string? ClientName,
    int CitationCount,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DecidedAt);

/// <summary>One submitted claim in full, with the records it cites and what the author decided.</summary>
public sealed record SemanticFindingDetail(
    SemanticFindingRow Finding,
    string Claim,
    IReadOnlyList<SemanticCitationRow> Citations,
    string? DecisionNote);

/// <summary>
/// One record a claim cites: what kind it is, its id, the version the client read and the range inside it.
/// <paramref name="IsStale"/> says the record has changed since, so the claim was made about text that is no longer
/// there. It is computed on read rather than stored, because it is a fact about now.
/// </summary>
public sealed record SemanticCitationRow(
    string Kind,
    Guid SourceId,
    int? SourceVersion,
    int? CurrentVersion,
    bool IsStale,
    int? RangeStart,
    int? RangeLength,
    string Note);

/// <summary>What the author may say when accepting or dismissing a claim.</summary>
public sealed record SemanticFindingDecisionRequest(string? Note = null);
