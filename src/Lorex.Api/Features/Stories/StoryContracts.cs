using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// Everything a client may set on a story. Explicit, so the universe, the id and the timestamps
/// cannot be reached by posting extra fields. <paramref name="ExpectedVersion"/> is the story's <c>version</c> an edit was
/// written over; ignored on create (ADR 0043).
/// </summary>
public sealed record StoryRequest(string? Title, string? Premise, StoryStatus Status, int? ExpectedVersion = null);

/// <summary>One story in a universe's list, with how many scenes it has so far.</summary>
public sealed record StorySummary(
    Guid Id,
    string Title,
    string? Premise,
    StoryStatus Status,
    int SceneCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// One story with its whole structure and every lore reference already resolved, so the story page is
/// one request however many chapters and scenes it holds.
///
/// <paramref name="Chapters"/> are in story order. <paramref name="Scenes"/> is every scene, each naming
/// its container by <c>chapterId</c> (null for Unchaptered), listed Unchaptered first and then chapter
/// by chapter, each container in its own narrative order.
/// </summary>
public sealed record StoryDetail(
    Guid Id,
    string Title,
    string? Premise,
    StoryStatus Status,
    IReadOnlyList<ChapterResponse> Chapters,
    IReadOnlyList<SceneResponse> Scenes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int Version);

/// <summary>
/// Everything a client may set on a chapter. The order is absent - a new chapter is appended and only
/// the chapter order route moves one - and so is any number: "Chapter 3" is the chapter's position,
/// shown, never stored.
/// </summary>
public sealed record ChapterRequest(string? Title, string? Summary, string? Notes);

/// <summary>One chapter. <paramref name="SortOrder"/> is its place in the story, from 0.</summary>
public sealed record ChapterResponse(
    Guid Id,
    Guid StoryId,
    int SortOrder,
    string Title,
    string? Summary,
    string? Notes,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>The story's whole chapter order: every chapter id in the story, each exactly once, first first.</summary>
public sealed record ChapterOrderRequest(IReadOnlyList<Guid>? ChapterIds);

/// <summary>
/// Everything a client may set on a scene. <c>SortOrder</c> is deliberately absent: a new scene is
/// appended to its container, and only the order and position routes move one inside it.
///
/// <paramref name="EntityIds"/> is the scene's whole set of linked lore, replaced on every save.
/// <paramref name="Chronology"/> is null for a scene not placed in time.
///
/// <paramref name="ChapterId"/> is the chapter the scene is told in, or null for Unchaptered - the same
/// meaning it has everywhere a scene is described. Like the point of view, it is part of the whole scene
/// sent on every save: changing it moves the scene to the end of that chapter, and a request that leaves
/// it out means Unchaptered.
/// </summary>
public sealed record SceneRequest(
    string? Title,
    string? Summary,
    string? Notes,
    Guid? PovEntityId,
    ChronologyValue? Chronology,
    IReadOnlyList<Guid>? EntityIds,
    Guid? ChapterId = null,
    int? ExpectedVersion = null);

/// <summary>
/// A lore entry as a scene shows it, read from the entry itself on every request - never stored on
/// the scene.
///
/// <paramref name="IsTrashed"/> says the entry is in the Trash. It is still reported, deliberately:
/// the form sends the scene's point of view and links back whole on every save, so dropping it here
/// would delete the reference the next time the author edited an unrelated field. The client shows
/// it as unavailable and does not link it.
/// </summary>
public sealed record SceneLoreReference(
    Guid EntityId,
    string Name,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    bool IsTrashed,
    EntityImageRef? Image);

/// <summary>
/// One scene. <paramref name="ChapterId"/> is its container - null for Unchaptered - and
/// <paramref name="SortOrder"/> its place in that container's telling, from 0.
/// <paramref name="Chronology"/> is where it happens in the world, or null. Order and chronology are
/// independent.
/// </summary>
public sealed record SceneResponse(
    Guid Id,
    Guid StoryId,
    Guid? ChapterId,
    int SortOrder,
    string Title,
    string? Summary,
    string? Notes,
    SceneLoreReference? Pov,
    ChronologyValue? Chronology,
    IReadOnlyList<SceneLoreReference> Entities,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    Publishing.ContentVisibility Visibility = Publishing.ContentVisibility.Private,
    Publishing.ContentVisibility ManuscriptVisibility = Publishing.ContentVisibility.Private,
    int Version = 1);

/// <summary>
/// One container's whole narrative order: every scene id in the chapter named by
/// <paramref name="ChapterId"/> - or in Unchaptered, when it is null - each exactly once, first told
/// first. A scene in any other container is refused rather than pulled across; moving between
/// containers is the position route's work.
/// </summary>
public sealed record SceneOrderRequest(IReadOnlyList<Guid>? SceneIds, Guid? ChapterId = null);

/// <summary>
/// Where a scene should be told: in the chapter named by <paramref name="ChapterId"/>, or Unchaptered
/// when it is null, at <paramref name="Position"/> inside it - from 0, counted among the scenes already
/// there - or at the end when <paramref name="Position"/> is null. The scene keeps its id and everything
/// else it holds; both containers are renumbered.
/// </summary>
public sealed record ScenePositionRequest(Guid? ChapterId, int? Position);
