namespace LorEvolve.Api.Features.Universes;

/// <summary>Create input. Bound explicitly so no client can set ownership or timestamps.</summary>
public sealed record CreateUniverseRequest(string? Name, string? Description, string? AccentColor);

/// <summary>Update input. Same reason: the entity is never model-bound.</summary>
public sealed record UpdateUniverseRequest(string? Name, string? Description, string? AccentColor);

/// <summary>
/// Which card of a universe's artwork is current: the two ids the owner-only card address is built from, and nothing
/// else - no key, no URL, no file details. Both are fresh on every upload and the card id on every reframe, so the
/// address names one immutable picture.
///
/// Carried on <see cref="UniverseSummary"/> and <see cref="UniverseDetail"/> so a card and the workspace draw the art
/// on their first render instead of asking for it afterwards. Only ever set for the universe's owner: the artwork is a
/// publishing asset a collaborator's role cannot read (ADR 0041), so for anyone else it is null, as it is for a
/// universe with no artwork.
/// </summary>
public sealed record UniverseArtworkIdentity(Guid AssetId, Guid CardId);

/// <summary>
/// List row. Carries the caller's own effective role and nothing about anyone else: no owner, no other member, no
/// membership id (ADR 0041). <see cref="Artwork"/> is the owner's alone.
/// </summary>
public sealed record UniverseSummary(
    Guid Id,
    string Name,
    string? Description,
    string? AccentColor,
    bool IsArchived,
    DateTime UpdatedAt,
    UniverseRole AccessRole,
    UniverseArtworkIdentity? Artwork);

/// <summary>Single-universe view, with the caller's effective role and artwork as on <see cref="UniverseSummary"/>.</summary>
public sealed record UniverseDetail(
    Guid Id,
    string Name,
    string? Description,
    string? AccentColor,
    bool IsArchived,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    UniverseRole AccessRole,
    UniverseArtworkIdentity? Artwork);

/// <summary>One page of the universes the caller owns or is a member of.</summary>
public sealed record UniversePage(
    IReadOnlyList<UniverseSummary> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
