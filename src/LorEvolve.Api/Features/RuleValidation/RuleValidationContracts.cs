namespace LorEvolve.Api.Features.RuleValidation;

/// <summary>Creating a term: its kind, stated explicitly, and its name.</summary>
public sealed record ValidationTermRequest(ValidationTermKind Kind, string? Name);

/// <summary>Renaming a term. The kind cannot change: every rule and moment naming the term would change meaning with it.</summary>
public sealed record ValidationTermRenameRequest(string? Name);

/// <summary>
/// One term of the universe's vocabulary, with how many rules and moments name it - which is what decides whether it can be
/// deleted. <paramref name="RuleCount"/> includes rules in the Trash, which still hold their check.
/// </summary>
public sealed record ValidationTermResponse(
    Guid Id,
    ValidationTermKind Kind,
    string Name,
    int RuleCount,
    int MomentCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>A term as something else names it: the id that means it, and the name to show.</summary>
public sealed record ValidationTermReference(Guid Id, string Name);

/// <summary>
/// A world rule's structured check, on a save. <see cref="WorldRuleValidationKind.None"/> removes any check the rule has; the
/// pattern needs all three parts. Left out of a save altogether - null - the stored check is kept as it is.
/// </summary>
public sealed record WorldRuleValidationRequest(
    WorldRuleValidationKind Kind,
    Guid? EventKindId,
    Guid? MethodId,
    int? MaxOccurrences);

/// <summary>A world rule's structured check, as stored: every part an explicit id or number, with the terms' names to show.</summary>
public sealed record WorldRuleValidationResponse(
    WorldRuleValidationKind Kind,
    ValidationTermReference EventKind,
    ValidationTermReference Method,
    int MaxOccurrences);

/// <summary>What checking a rule against the timeline could establish.</summary>
public enum WorldRuleCheckOutcome
{
    /// <summary>Every moment that could match was counted. Whether any participant is over the limit is exact.</summary>
    Checked = 0,

    /// <summary>
    /// Some moments that may match could not be counted. A participant found over the limit is still over it - an uncounted
    /// moment can only add to a count - but "no participant is over the limit" cannot be claimed.
    /// </summary>
    Incomplete = 1,

    /// <summary>The check itself cannot be run as stored. Nothing was counted and nothing passes.</summary>
    CannotCheck = 2,
}

/// <summary>Why a moment that may match a rule was not counted.</summary>
public enum UncountedReason
{
    /// <summary>It has the rule's event kind and method, but no participant.</summary>
    NoParticipant = 0,

    /// <summary>Its participant is in the Trash.</summary>
    ParticipantInTrash = 1,

    /// <summary>It has the rule's method but no event kind.</summary>
    NoEventKind = 2,

    /// <summary>It has the rule's event kind but no method.</summary>
    NoMethod = 3,
}

/// <summary>One moment a rule's check could not count, and why.</summary>
public sealed record WorldRuleUncountedMoment(Guid TimelineEntryId, string Title, UncountedReason Reason);

/// <summary>
/// The derived state of one rule's check, worked out when the rule is read - never stored and never in a backup.
///
/// <paramref name="CountedMoments"/> are the Canon moments counted; <paramref name="ParticipantsOverLimit"/> how many participants
/// they put over the limit, each of which is a Canon finding. <paramref name="NotCanonMoments"/> matched but are not Canon, and are
/// not counted - by design, as every Canon rule reads Canon only. <paramref name="UncountedMoments"/> may match but could not be
/// counted; <paramref name="Uncounted"/> names the first of them. <paramref name="Problem"/> says why a check cannot run at all.
/// </summary>
public sealed record WorldRuleCheck(
    WorldRuleCheckOutcome Outcome,
    int CountedMoments,
    int ParticipantsOverLimit,
    int NotCanonMoments,
    int UncountedMoments,
    IReadOnlyList<WorldRuleUncountedMoment> Uncounted,
    string? Problem);

/// <summary>
/// A moment's structured details, on a save. Every part is optional and independent; all three absent removes the details.
/// Left out of a save altogether - null - the stored details are kept as they are.
/// </summary>
public sealed record TimelineValidationRequest(Guid? EventKindId, Guid? MethodId, Guid? ParticipantEntityId);

/// <summary>A moment's participant for a check. <paramref name="IsTrashed"/>: in the Trash, kept and not counted.</summary>
public sealed record TimelineValidationParticipant(Guid EntityId, string Name, bool IsTrashed);

/// <summary>A moment's structured details as stored, with names to show. Each part may be absent.</summary>
public sealed record TimelineValidationResponse(
    ValidationTermReference? EventKind,
    ValidationTermReference? Method,
    TimelineValidationParticipant? Participant);
