namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// Everything a client may set on a plot arc. No order - a new arc is appended and only the arc order route
/// moves one - and no number: "Arc 2" is the arc's position, shown, never stored.
/// </summary>
public sealed record PlotArcRequest(string? Title, string? Description, string? Notes);

/// <summary>
/// One arc. <paramref name="SortOrder"/> is its place in the story, from 0; the chapters in it say so themselves
/// (<see cref="ChapterResponse.PlotArcId"/>, ADR 0070).
/// </summary>
public sealed record PlotArcResponse(
    Guid Id,
    Guid StoryId,
    int SortOrder,
    string Title,
    string? Description,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    Publishing.ContentVisibility Visibility = Publishing.ContentVisibility.Private);

/// <summary>The story's whole arc order: every arc id in the story, each exactly once, first first.</summary>
public sealed record PlotArcOrderRequest(IReadOnlyList<Guid>? PlotArcIds);
