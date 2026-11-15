namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>A season as a save sends it (#145). The place in the list is not here: it is changed by its own route.</summary>
public sealed record ProjectSeasonRequest(string? Name, string? Summary);

/// <summary>
/// An episode as a save sends it. <paramref name="Script"/> travels with the episode, because an author writing a
/// script is writing the episode; it is bounded and versioned, and a save that omits it clears it, the same way every
/// other complete-document save in LorEvolve works.
/// </summary>
public sealed record ProjectEpisodeRequest(
    string? Title,
    string? Synopsis,
    string? Script = null,
    int? ExpectedVersion = null);

/// <summary>Where something goes: the season it belongs to, if it moves, and its place among its siblings.</summary>
public sealed record ProjectMoveRequest(int Place, Guid? SeasonId = null);

public sealed record ProjectEpisodeResponse(
    Guid Id,
    Guid SeasonId,
    string Title,
    string? Synopsis,
    bool HasScript,
    int ScriptLength,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int Version);

/// <summary>One episode with its script, which the list deliberately leaves out.</summary>
public sealed record ProjectEpisodeDetail(
    Guid Id,
    Guid SeasonId,
    string Title,
    string? Synopsis,
    string? Script,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int Version);

public sealed record ProjectSeasonResponse(
    Guid Id,
    string Name,
    string? Summary,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<ProjectEpisodeResponse> Episodes);
