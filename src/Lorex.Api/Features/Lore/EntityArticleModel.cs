namespace Lorex.Api.Features.Lore;

/// <summary>
/// An entry's article: the long-form prose that describes it, beside the structured lore the entry itself holds.
///
/// The entry's name, summary, type, status, aliases, tags and field values are structured lore - what Lorex can compare,
/// filter and check. The article is what the author writes about it. The two differ in size and in how often they are
/// written, so they are different rows: a structured edit, a Canon promotion, a trash or a restore loads and writes the
/// entry without a word of its article, and saving the article writes nothing structured. <see cref="LoreEntity"/> has no
/// navigation back to it for the same reason.
///
/// <b>Stored as the editor writes it.</b> <see cref="Content"/> is the Tiptap document, validated structurally on the way
/// in by <see cref="LoreContent"/>, or <c>""</c> for an article that was written and then cleared. It is never parsed for
/// meaning: no field, relationship, timeline entry or Canon finding comes from a sentence in it, and it has no status of
/// its own - it is as settled as the entry it belongs to.
///
/// At most one per entry, keyed by the entry and deleted with it. An entry with no row has no article; the row appears on
/// the first save that writes something. See <c>docs/architecture/decisions/0028-entity-article.md</c>.
/// </summary>
public sealed class EntityArticle
{
    /// <summary>The entry this is the article of: both the key and the foreign key.</summary>
    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public required string Content { get; set; }

    /// <summary>When the article was last saved - and what a save names to show it was written over the latest text.</summary>
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// One saved version of an entry's article, exactly as it stood after a save that changed it.
///
/// The article's own history, apart from the entry's (<see cref="EntityRevision"/>): a structured edit records no copy of
/// the article, and an article save records no copy of the structured lore. Each version is the whole document, so any
/// one is readable and restorable on its own. The newest is the article as it stands.
///
/// Immutable once written, like an entry revision. Only the entry is a real key; <see cref="RestoredFromRevisionId"/> is a
/// raw id into this same history, which dies with the entry.
/// </summary>
public sealed class EntityArticleRevision
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    /// <summary>1 for the first version, incrementing per entry.</summary>
    public int Number { get; set; }

    /// <summary>Created for the first version, Edited for a save, Restored for a version put back.</summary>
    public EntityRevisionKind Kind { get; set; }

    public Guid? RestoredFromRevisionId { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>The account that saved this version, as on <see cref="EntityRevision.ActorUserId"/>. Null when not recorded.</summary>
    public string? ActorUserId { get; set; }

    /// <summary>The document as it was saved, or <c>""</c> for a save that cleared the article.</summary>
    public required string Content { get; set; }
}
