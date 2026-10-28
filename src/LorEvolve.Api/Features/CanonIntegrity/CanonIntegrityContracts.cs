namespace LorEvolve.Api.Features.CanonIntegrity;

/// <summary>
/// One record a conflict points at, resolved enough to render a link without a second
/// request. <see cref="Name"/> is null when the record has since been deleted and the
/// conflict has not been re-evaluated yet.
/// </summary>
public sealed record CanonConflictSubjectResponse(
    CanonSubjectKind Kind,
    Guid SubjectId,
    string Role,
    string? Name);

/// <summary>
/// A conflict as the review screen needs it. The fingerprint is deliberately absent: it is
/// an internal key, and the conflict id is already stable across evaluations.
/// </summary>
public sealed record CanonConflictResponse(
    Guid Id,
    string RuleCode,
    CanonConflictSeverity Severity,
    CanonConflictStatus Status,
    string Title,
    string Explanation,
    IReadOnlyList<CanonConflictSubjectResponse> Subjects,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? ResolvedAt);

public sealed record CanonConflictPage(
    IReadOnlyList<CanonConflictResponse> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>One record a blocking finding is about. Ids only; names are not resolved.</summary>
public sealed record CanonBlockingSubject(CanonSubjectKind Kind, Guid SubjectId, string Role);

/// <summary>
/// One High finding that a refused write would have introduced.
///
/// Unlike <see cref="CanonConflictResponse"/> this carries no conflict id, because no conflict
/// was recorded - the candidate was rolled back. The fingerprint stands in for identity here:
/// it is what the gate compared, and it lets a client tell two refusals apart.
/// </summary>
public sealed record CanonBlockingFinding(
    string RuleCode,
    CanonConflictSeverity Severity,
    string Fingerprint,
    string Title,
    string Explanation,
    IReadOnlyList<CanonBlockingSubject> Subjects);

/// <summary>
/// The 409 body a gated write answers with: ProblemDetails, as every other refusal on this
/// API is, with <c>code</c> and <c>blockingFindings</c> flattened alongside it. Declared so the
/// contract is written down and testable, not because anything serialises this type directly.
/// </summary>
public sealed record CanonPromotionBlockedResponse(
    string Title,
    string Detail,
    int Status,
    string Code,
    IReadOnlyList<CanonBlockingFinding> BlockingFindings);

/// <summary>What an evaluation run did, so a client can say so without diffing the list.</summary>
public sealed record CanonEvaluationResponse(
    int Detected,
    int Created,
    int Reopened,
    int Persisted,
    int Resolved,
    DateTime EvaluatedAt);
