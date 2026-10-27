namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// A row in the history list. Carries what the entry was called and where it stood at that
/// version, so the list reads as a document history without a request per row.
///
/// <paramref name="ActorName"/> is the username of the account that made the version, and nothing else of it - no id,
/// no email. Null when no account was recorded: a version from before attribution, or one restored from a backup.
/// </summary>
public sealed record EntityRevisionSummary(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    EntityRevisionChange Changes,
    string Name,
    CanonStatus CanonStatus,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    string? ActorName);

/// <summary>
/// One value as it stood, with the text it displayed then rather than a live join.
/// <paramref name="EraLabel"/> is what was written beside a year at the time, so the version
/// still reads correctly once the era is renamed or removed.
/// </summary>
public sealed record EntityRevisionFieldResponse(
    Guid FieldDefinitionId,
    string Name,
    EntityFieldKind Kind,
    string? Text,
    double? Number,
    bool? Boolean,
    DateTime? Date,
    IReadOnlyList<string> OptionValues,
    string? ReferencedEntityName,
    Guid? EraId,
    string? EraLabel);

/// <summary>
/// One whole version, shaped like <see cref="EntityDetail"/> so the dossier can render an
/// older version with the components it already has.
///
/// <paramref name="Content"/> is the article as it read then, only for a version recorded
/// before articles kept their own history, and null otherwise. It is shown for reference and
/// restoring the version never applies it (ADR 0028).
/// </summary>
public sealed record EntityRevisionDetail(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    EntityRevisionChange Changes,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    Guid EntityTypeId,
    string EntityTypeName,
    string Name,
    string? Summary,
    string? Content,
    CanonStatus CanonStatus,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    IReadOnlyList<EntityRevisionFieldResponse> Fields);

/// <summary>Puts an entry's older version back, naming the entry's version it was chosen over - as a save does (ADR 0043).</summary>
public sealed record EntityRevisionRestoreRequest(int? ExpectedVersion);
