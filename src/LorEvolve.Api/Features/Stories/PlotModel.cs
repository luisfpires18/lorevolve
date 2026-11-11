using LorEvolve.Api.Features.Lore;

namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// A named narrative thread an author follows through one story: "Fall of the King", "Mira's Betrayal",
/// "Search for the Crown".
///
/// <b>Plot is intent.</b> Lore is what is true about the world; chapters and scenes are what the story shows
/// and in what order; an arc is a development the author means to track across that telling. It owns no
/// scene, asserts nothing about the world and never becomes Canon. LorEvolve reads nothing into its title: there
/// is no protagonist, romance or mystery arc unless an author one day models such a thing explicitly.
///
/// <see cref="SortOrder"/> is the arc's place among the story's arcs, set by the author and by nothing else -
/// not by its first scene, a chapter, a date or its title. The number shown ("Arc 2") is that position plus
/// one, worked out when it is drawn and never stored.
///
/// <b>Structure since ADR 0070.</b> An arc groups chapters: Story, then arcs, then chapters, then scenes. A chapter
/// is in at most one arc (<see cref="ChapterArc"/>) and may be in none. Owned by the story and deleted with it.
/// Deleting an arc moves it to the Trash alone and never touches a chapter, a scene or an entry: its chapters read as
/// in no arc until it comes back. See <c>docs/architecture/decisions/0070-story-arcs-as-structure.md</c> and
/// <c>docs/architecture/decisions/0029-content-recovery.md</c>.
/// </summary>
public sealed class PlotArc
{
    public Guid Id { get; set; }

    public Guid StoryId { get; set; }

    public Story? Story { get; set; }

    public required string Title { get; set; }

    /// <summary>What the thread is, briefly. Planning text.</summary>
    public string? Description { get; set; }

    /// <summary>The author's own planning notes.</summary>
    public string? Notes { get; set; }

    /// <summary>
    /// The arc's place in its story's plot, from 0. Contiguous and unique among the story's live arcs:
    /// creating appends, deleting closes the gap, and only the arc order route moves one. An arc in the
    /// Trash holds no place, and a restore appends it.
    /// </summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// When the arc was moved to the Trash, or null while it is live. Only the arc is marked: its chapters keep their
    /// link to it and come back into it with it.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// Whether the author published this arc to the story's public page: its title and its description - never its
    /// notes (ADR 0039). Plot is planning and often spoils the story, so
    /// nothing publishes it but this arc's own publish route; read only while the story is public.
    /// </summary>
    public Publishing.ContentVisibility Visibility { get; set; }

    public ICollection<ChapterArc> ChapterLinks { get; } = [];
}

/// <summary>
/// The arc one chapter is told in (ADR 0070). A side row rather than a column on <c>Chapters</c>, so no table the
/// search triggers name is rebuilt; at most one per chapter, its key. A chapter with no row is in no arc. Both foreign
/// keys cascade: deleting an arc for good takes only these rows, so its chapters fall back to no arc and keep every
/// scene. A chapter whose arc is in the Trash keeps its row and reads as in no arc until the arc is restored.
/// </summary>
public sealed class ChapterArc
{
    public Guid ChapterId { get; set; }

    public Chapter? Chapter { get; set; }

    public Guid PlotArcId { get; set; }

    public PlotArc? PlotArc { get; set; }
}

/// <summary>
/// One step inside one scene: "Marcus reads the orders" (ADR 0070). Owned by the scene and in its order, from 0; a title
/// and an optional note, plain planning text. Saved with the scene form, whole, and goes to the Trash and back with the
/// scene. It links nothing: the lore a scene draws on is the scene's.
/// </summary>
public sealed class SceneBeat
{
    public Guid Id { get; set; }

    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }

    public required string Title { get; set; }

    public string? Note { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
