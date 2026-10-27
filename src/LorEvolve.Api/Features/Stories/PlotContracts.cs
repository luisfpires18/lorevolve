namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// Everything a client may set on a plot arc. No order - a new arc is appended and only the arc order route
/// moves one - and no number: "Arc 2" is the arc's position, shown, never stored.
/// </summary>
public sealed record PlotArcRequest(string? Title, string? Description, string? Notes);

/// <summary>
/// One arc with its beats in order. <paramref name="SortOrder"/> is its place in the story's plot, from 0.
/// </summary>
public sealed record PlotArcResponse(
    Guid Id,
    Guid StoryId,
    int SortOrder,
    string Title,
    string? Description,
    string? Notes,
    IReadOnlyList<PlotBeatResponse> Beats,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    Publishing.ContentVisibility Visibility = Publishing.ContentVisibility.Private);

/// <summary>The story's whole arc order: every arc id in the story, each exactly once, first first.</summary>
public sealed record PlotArcOrderRequest(IReadOnlyList<Guid>? PlotArcIds);

/// <summary>
/// Everything a client may set on a beat. The order is absent: a new beat is appended to its arc, and only the
/// beat order route moves one inside it.
///
/// <paramref name="SceneIds"/> and <paramref name="EntityIds"/> are the beat's whole sets of links, replaced
/// on every save. Scenes must be from the same story, entries from the same universe; a repeated id links once.
///
/// <paramref name="PlotArcId"/> is read only by an update, where naming another arc of the same story moves the
/// beat there, last. Left out, it keeps the arc the beat is in - a beat always has one. A create takes its arc
/// from the route.
/// </summary>
public sealed record PlotBeatRequest(
    string? Title,
    string? Description,
    string? Notes,
    IReadOnlyList<Guid>? SceneIds,
    IReadOnlyList<Guid>? EntityIds,
    Guid? PlotArcId = null);

/// <summary>
/// One beat. <paramref name="SortOrder"/> is its place in its arc, from 0.
///
/// <paramref name="SceneIds"/> are the scenes it plays out in, in the story's reading order - Unchaptered first,
/// then chapter by chapter - as ids only: the story read already carries each scene's title and chapter, and a
/// scene that moves is still the same id. <paramref name="Entities"/> is its lore, read from the entries on every
/// request in the same shape a scene shows it, a trashed entry marked rather than dropped.
/// </summary>
public sealed record PlotBeatResponse(
    Guid Id,
    Guid PlotArcId,
    int SortOrder,
    string Title,
    string? Description,
    string? Notes,
    IReadOnlyList<Guid> SceneIds,
    IReadOnlyList<SceneLoreReference> Entities,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// One arc's whole beat order: every beat id in the arc the route names, each exactly once, first first. A beat
/// of another arc is refused rather than pulled across; moving between arcs is an edit's work.
/// </summary>
public sealed record PlotBeatOrderRequest(IReadOnlyList<Guid>? PlotBeatIds);
