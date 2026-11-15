namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>A page as a save sends it (#147). Its place is changed by its own route, as every other place here is.</summary>
public sealed record ProjectPageRequest(string? Name, string? Notes);

/// <summary>
/// A panel as a save sends it. <paramref name="CanonEntityId"/> is the optional lore entry it shows, which is how a
/// panel reaches art: the entry's picture resolves through the existing Media feature on its own route.
/// </summary>
public sealed record ProjectPanelRequest(
    string? Description,
    string? Dialogue,
    Guid? CanonEntityId = null);

/// <summary>Where a panel goes: a place on a page, and the page it moves to when it changes page.</summary>
public sealed record ProjectPanelMoveRequest(int Place, Guid? PageId = null);

public sealed record ProjectPanelResponse(
    Guid Id,
    Guid PageId,
    string? Description,
    string? Dialogue,
    Guid? CanonEntityId,
    string? CanonEntityName,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record ProjectPageResponse(
    Guid Id,
    Guid EpisodeId,
    string? Name,
    string? Notes,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<ProjectPanelResponse> Panels);
