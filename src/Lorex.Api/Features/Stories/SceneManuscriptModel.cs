namespace Lorex.Api.Features.Stories;

/// <summary>
/// The prose of one scene: what the author actually writes, as opposed to what the scene plans.
///
/// A scene's title, summary, notes, point of view, chronology, chapter and lore links describe the scene - planning,
/// structure and references. Its manuscript is the telling itself. The two differ in size and in how often they are
/// written, so they are different rows: a story read, a reorder or a move never loads a word of prose, and only the
/// manuscript route reads or writes this one. <see cref="Scene"/> has no navigation back to it for the same reason.
///
/// <b>Plain text, kept exactly.</b> <see cref="Content"/> is stored as the author sent it - line breaks, blank lines,
/// punctuation, quotation marks and every Unicode character - with no trimming, no Markdown, no HTML and no editor
/// document structure.
///
/// <b>Narrative, not lore.</b> Nothing reads the text for meaning: no Canon finding, timeline entry, relationship, lore
/// link, plot link or search hit comes from a sentence in it.
///
/// At most one per scene, keyed by the scene and deleted with it. A scene with no row has an empty manuscript; the row
/// appears on the first save that writes something and stays, even when a later save empties it. Every such save also
/// records a <see cref="SceneManuscriptRevision"/>. See <c>docs/architecture/decisions/0027-scene-manuscript.md</c> and
/// <c>docs/architecture/decisions/0029-content-recovery.md</c>.
/// </summary>
public sealed class SceneManuscript
{
    /// <summary>The scene this is the prose of: both the key and the foreign key.</summary>
    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }

    public required string Content { get; set; }

    /// <summary>When the prose was last saved - and what a save names to show it was written over the latest text.</summary>
    public DateTime UpdatedAt { get; set; }
}

/// <summary>What a saved version of a manuscript was: the first one, an ordinary save, or an earlier version put back.</summary>
public enum SceneManuscriptRevisionKind
{
    Created = 0,
    Edited = 1,
    Restored = 2,
}

/// <summary>
/// One saved version of a scene's manuscript, exactly as it stood after a save that changed it.
///
/// Every save that changes the prose records the next version, so the newest is the manuscript as it stands, and each
/// holds the whole text: any one is readable and restorable on its own, with no chain to replay. A save that changes
/// nothing records nothing. Immutable once written. Only the scene is a real key;
/// <see cref="RestoredFromRevisionId"/> is a raw id into this same history, which dies with the scene.
///
/// Read only on the manuscript's own history routes - never with the manuscript, the story or anything else.
/// </summary>
public sealed class SceneManuscriptRevision
{
    public Guid Id { get; set; }

    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }

    /// <summary>1 for the first version, incrementing per scene.</summary>
    public int Number { get; set; }

    public SceneManuscriptRevisionKind Kind { get; set; }

    public Guid? RestoredFromRevisionId { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// The account that saved this version, as on <see cref="Lore.EntityRevision.ActorUserId"/>. Null when not recorded.
    /// </summary>
    public string? ActorUserId { get; set; }

    /// <summary>The prose as it was saved, or <c>""</c> for a save that emptied it.</summary>
    public required string Content { get; set; }
}
