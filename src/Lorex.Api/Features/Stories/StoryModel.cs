using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// How far along the telling of one story is. Closed and deliberately small: it says where the
/// author is with the narrative, never whether anything in it is true - truth is Lore's, and a
/// story has no Canon status at all.
/// </summary>
public enum StoryStatus
{
    Planning = 0,
    Drafting = 1,
    Complete = 2,
}

/// <summary>
/// One narrative an author tells using a universe.
///
/// Lore is what is true about the world; a story is how an author chooses to tell something in it.
/// A story may be a draft, hypothetical, nonlinear, alternate or unfinished, so nothing in one
/// becomes a fact: no Canon finding, no stored timeline moment, no relationship and no change to any entry
/// is ever produced from it. A scene with a world date is shown on the universe's timeline, read from the
/// scene each time and never stored there (ADR 0009 amendment, 038); being shown there makes it neither
/// Canon nor lore. Its scenes reference lore by id and never keep a copy of it.
///
/// Owned by the universe and deleted with it. Deleting a story moves it to the Trash with everything it
/// holds; only deleting the universe removes it for good. See
/// <c>docs/architecture/decisions/0024-story-scene-foundation.md</c> and
/// <c>docs/architecture/decisions/0029-content-recovery.md</c>.
/// </summary>
public sealed class Story : Publishing.IPublishable
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Title { get; set; }

    /// <summary>What the story is about, in a sentence or a paragraph. Optional.</summary>
    public string? Premise { get; set; }

    public StoryStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>When the story, its chapters, any of its scenes or their prose, or its plot was last written to.</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// The edit version of the story's own title, premise and status: server-owned, 1 when created, advanced once by every write that changes the story's own title, premise and status.
    /// A save names the version it was written over and is refused when it is no longer current (ADR 0043).
    /// </summary>
    public int Version { get; set; } = 1;

    /// <summary>
    /// When the story was moved to the Trash, or null while it is live. Only the story is marked: its chapters, scenes,
    /// prose and plot are left exactly as they were, unreachable while it is there and back with it on restore.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// Whether the author selected this story for the public portal - the story, never a chapter, scene, beat or note
    /// on its own. Read only together with its universe's visibility and <see cref="DeletedAt"/> -
    /// <see cref="Publishing.PublicationRules.PublicStories"/> - and changed only by the story's publish and unpublish
    /// routes (ADR 0036).
    /// </summary>
    public Publishing.ContentVisibility Visibility { get; set; }

    /// <summary>The story's public address inside its universe, minted at first publication and never changed after.</summary>
    public string? PublicSlug { get; set; }

    /// <summary>When the story was first published. Republishing keeps it.</summary>
    public DateTime? PublishedAt { get; set; }

    /// <summary>
    /// What a reader is told the story is, written for the public portal and nothing else (ADR 0036, Task 011). Never
    /// filled from <see cref="Premise"/>, which is the author's planning text: a story is readable publicly only once
    /// its author has written this. Saved on the story's publication route, never by a story save.
    /// </summary>
    public string? PublicSummary { get; set; }

    public ICollection<Chapter> Chapters { get; } = [];

    public ICollection<Scene> Scenes { get; } = [];

    /// <summary>The story's plot arcs (ADR 0026): planning that points at scenes and lore, and owns neither.</summary>
    public ICollection<PlotArc> PlotArcs { get; } = [];
}

/// <summary>
/// An optional grouping of a story's scenes.
///
/// A chapter is structure, not content: a title, a short summary, the author's notes and a place in the
/// story. It holds no prose, no chronology, no point of view and no Canon state, and a story needs none
/// at all - a scene that belongs to no chapter is <i>Unchaptered</i>, which is a null
/// <see cref="Scene.ChapterId"/> and never a row pretending to be a chapter.
///
/// The number an author reads - "Chapter 3" - is <see cref="SortOrder"/> plus one, worked out when it is
/// shown. It is not stored and it is not part of <see cref="Title"/>, so reordering renumbers every
/// chapter without touching a word the author wrote.
///
/// Owned by the story and deleted with it. Deleting only the chapter never deletes a scene: its scenes
/// move to the end of Unchaptered, in their order, and the chapter goes to the Trash holding none. See
/// <c>docs/architecture/decisions/0025-story-chapters.md</c> and
/// <c>docs/architecture/decisions/0029-content-recovery.md</c>.
/// </summary>
public sealed class Chapter
{
    public Guid Id { get; set; }

    public Guid StoryId { get; set; }

    public Story? Story { get; set; }

    public required string Title { get; set; }

    /// <summary>What the chapter covers, briefly. Planning text, not manuscript prose.</summary>
    public string? Summary { get; set; }

    /// <summary>The author's own planning notes.</summary>
    public string? Notes { get; set; }

    /// <summary>
    /// The chapter's place in its story, from 0. Contiguous and unique among the story's live chapters:
    /// creating appends, deleting closes the gap, and only the chapter order route moves one. A chapter in
    /// the Trash holds no place - the number is what it had when it went - and a restore appends it.
    /// </summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>When the chapter was moved to the Trash, or null while it is live.</summary>
    public DateTime? DeletedAt { get; set; }

    public ICollection<Scene> Scenes { get; } = [];
}

/// <summary>
/// One scene of one story.
///
/// <b>Two orders, never one.</b> <see cref="SortOrder"/> is where the author tells the scene inside its
/// container - its chapter, or Unchaptered - and only the author moves it. The chronology - <see cref="EraId"/>,
/// <see cref="Year"/>, <see cref="Month"/>, <see cref="Day"/> - is where the scene happens in the
/// world, and is optional. Neither is derived from, checked against or reordered by the other, so a
/// story that opens on the aftermath and flashes back to a childhood is exactly as valid as one told
/// in order.
///
/// <b>References, not copies.</b> <see cref="PovEntityId"/> and <see cref="EntityLinks"/> point at
/// lore entries. The name, type, picture and summary shown for them are read from the entry every
/// time, so an edit to the lore is reflected in every scene at once. What a link means is only
/// "relevant to this scene" - not present, not alive, not taking part.
/// </summary>
public sealed class Scene
{
    public Guid Id { get; set; }

    public Guid StoryId { get; set; }

    public Story? Story { get; set; }

    public required string Title { get; set; }

    /// <summary>What happens in the scene, briefly. Not manuscript prose.</summary>
    public string? Summary { get; set; }

    /// <summary>The author's own planning notes. Not manuscript prose either.</summary>
    public string? Notes { get; set; }

    /// <summary>
    /// The chapter the scene is told in, or null when it is Unchaptered. Null is a real state, not a
    /// missing value: Unchaptered is a place in the story with its own order, and no chapter row stands
    /// in for it. A move between chapters changes this and the order, and nothing else about the scene.
    /// </summary>
    public Guid? ChapterId { get; set; }

    public Chapter? Chapter { get; set; }

    /// <summary>
    /// The scene's place inside its container - its chapter, or Unchaptered - from 0. Contiguous and
    /// unique among the container's live scenes, never across the whole story: creating appends to the
    /// container, deleting or moving out closes the gap, and reordering rewrites one container in one
    /// transaction. A scene in the Trash holds no place, and a restore appends it.
    /// </summary>
    public int SortOrder { get; set; }

    /// <summary>
    /// The entry whose point of view the scene is told from, if any. Any entry may be chosen - Lorex
    /// never decides from a type's name that only characters have a point of view.
    /// </summary>
    public Guid? PovEntityId { get; set; }

    public LoreEntity? PovEntity { get; set; }

    /// <summary>
    /// The era <see cref="Year"/> is counted in, on a universe that names its eras; null on the plain
    /// reckoning, or when the scene is not placed in time. An id, so renaming the era moves nothing.
    /// </summary>
    public Guid? EraId { get; set; }

    public ChronologyEra? Era { get; set; }

    /// <summary>Null when the scene is not placed in time. Signed on the plain reckoning, from 1 in an era.</summary>
    public int? Year { get; set; }

    /// <summary>The numeric month, on simple dates only.</summary>
    public int? Month { get; set; }

    /// <summary>The custom calendar's month by id, on a universe that has one; never set beside <see cref="Month"/>.</summary>
    public Guid? MonthId { get; set; }

    public ChronologyCalendarMonth? CalendarMonth { get; set; }

    public int? Day { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// The edit version of what the scene form edits - title, summary, notes, point of view, date, linked lore and chapter:
    /// server-owned, 1 when created, advanced once by every write that changes any of it, a move to another chapter
    /// included. A save names the version it was written over and is refused when it is no longer current (ADR 0043).
    /// </summary>
    public int Version { get; set; } = 1;

    /// <summary>
    /// When the scene was moved to the Trash, or null while it is live. Its prose, saved versions, lore
    /// links and the beats pointing at it are all kept, unreachable, and come back with it.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// Whether the author selected this scene for the story's public outline - its title and summary, and nothing else
    /// of it (ADR 0039). Read only while its story is public (<see cref="Publishing.PublicationRules.PublicScenes"/>), and
    /// changed only by the scene's publish and unpublish routes. Independent of <see cref="ManuscriptVisibility"/>.
    /// </summary>
    public Publishing.ContentVisibility Visibility { get; set; }

    /// <summary>
    /// Whether the author selected this scene's prose for the story's public manuscript, read under the scene's title
    /// (ADR 0039). Read only while its story is public; changed only by the manuscript's publish and unpublish routes.
    /// </summary>
    public Publishing.ContentVisibility ManuscriptVisibility { get; set; }

    public ICollection<SceneEntityLink> EntityLinks { get; } = [];
}

/// <summary>
/// One lore entry relevant to one scene. A relational row per link, never a JSON list of ids, so the
/// foreign keys are real and a pair can exist only once.
/// </summary>
public sealed class SceneEntityLink
{
    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }
}
