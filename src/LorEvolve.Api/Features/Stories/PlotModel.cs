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
/// Owned by the story and deleted with it. Deleting an arc moves it to the Trash with its beats and their
/// links, and never touches a scene, a chapter or an entry. See
/// <c>docs/architecture/decisions/0026-story-plot-arcs-beats.md</c> and
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
    /// When the arc was moved to the Trash, or null while it is live. Only the arc is marked: its beats keep
    /// their order and links and come back with it.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// Whether the author published this arc to the story's public page: its title, its description, and its live
    /// beats' titles and descriptions - never notes or links (ADR 0039). Plot is planning and often spoils the story, so
    /// nothing publishes it but this arc's own publish route; read only while the story is public.
    /// </summary>
    public Publishing.ContentVisibility Visibility { get; set; }

    public ICollection<PlotBeat> Beats { get; } = [];
}

/// <summary>
/// One step inside an arc: "Learns of the conspiracy", "The capital is breached".
///
/// <b>Its order is the arc's progression, and nothing else.</b> <see cref="SortOrder"/> is where the beat
/// sits in what the author intends the arc to go through. It is not the order its scenes are told in, the
/// chapters they sit in, or when they happen in the world. None of those moves a beat, and a beat moves none
/// of them.
///
/// <b>References, not ownership.</b> <see cref="SceneLinks"/> say which scenes the beat plays out in and
/// <see cref="EntityLinks"/> which lore it concerns - "relevant to this beat", and nothing more: not present,
/// not the cause, not changed by it. A beat with neither is valid, planned work not yet placed. A scene may
/// carry beats from several arcs. Deleting a scene or an entry removes only its link; deleting a beat
/// removes only its links.
/// </summary>
public sealed class PlotBeat
{
    public Guid Id { get; set; }

    public Guid PlotArcId { get; set; }

    public PlotArc? PlotArc { get; set; }

    public required string Title { get; set; }

    /// <summary>What develops, briefly. Planning text, not manuscript prose, and never a fact about the world.</summary>
    public string? Description { get; set; }

    /// <summary>The author's own planning notes.</summary>
    public string? Notes { get; set; }

    /// <summary>
    /// The beat's place in its arc, from 0. Contiguous and unique among the arc's live beats: creating
    /// appends, deleting or moving out closes the gap, and reordering rewrites one arc in one transaction.
    /// A beat in the Trash holds no place, and a restore appends it.
    /// </summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>When the beat was moved to the Trash, or null while it is live. Its links are kept and come back with it.</summary>
    public DateTime? DeletedAt { get; set; }

    public ICollection<PlotBeatScene> SceneLinks { get; } = [];

    public ICollection<PlotBeatEntity> EntityLinks { get; } = [];
}

/// <summary>
/// One scene of the same story that a beat plays out in. A relational row per pair, so the foreign keys are
/// real and a pair exists once. It names the scene by id only - never its title or chapter - so a scene
/// moved to another chapter, reordered or re-dated is still the scene the beat points at.
/// </summary>
public sealed class PlotBeatScene
{
    public Guid PlotBeatId { get; set; }

    public PlotBeat? PlotBeat { get; set; }

    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }
}

/// <summary>One lore entry of the same universe relevant to a beat. A reference, like a scene's linked lore.</summary>
public sealed class PlotBeatEntity
{
    public Guid PlotBeatId { get; set; }

    public PlotBeat? PlotBeat { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }
}
