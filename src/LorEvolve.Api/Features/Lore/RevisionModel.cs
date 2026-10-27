namespace LorEvolve.Api.Features.Lore;

/// <summary>What produced a revision. Presentation only - no rule reads this.</summary>
public enum EntityRevisionKind
{
    /// <summary>The entry's first version, written when it was created.</summary>
    Created = 0,

    /// <summary>An ordinary edit that changed something.</summary>
    Edited = 1,

    /// <summary>An older version put back. Ordinary in every other respect.</summary>
    Restored = 2,
}

/// <summary>
/// Which parts of an entry a revision changed, against the revision before it.
///
/// Flags rather than rows: the set is closed, small, and always read whole. It is
/// deliberately coarse - "the article changed", never which paragraph - because a prose
/// diff over Tiptap is explicitly out of scope, and because an author scanning a history
/// wants to know where to look, not to read a patch.
///
/// A field's *name* is not one of these. Renaming a field definition changes no lore, and
/// history that recorded it would fill with churn no author caused.
/// </summary>
[Flags]
public enum EntityRevisionChange
{
    None = 0,
    Name = 1 << 0,
    Summary = 1 << 1,

    /// <summary>
    /// The article changed. Set only on versions recorded before articles kept their own history
    /// (ADR 0028); an article save now records an <see cref="EntityArticleRevision"/> instead.
    /// </summary>
    Article = 1 << 2,
    CanonStatus = 1 << 3,
    EntityType = 1 << 4,
    Aliases = 1 << 5,
    Tags = 1 << 6,
    Fields = 1 << 7,

    /// <summary>
    /// The entry's primary image was set, replaced or taken away.
    ///
    /// Recorded, never snapshotted. A revision holds no image bytes, no asset id and no object
    /// key, because a replacement deletes the objects it supersedes (ADR 0019) - so a key kept
    /// here would name something that no longer exists, and history would be lying rather than
    /// remembering. What survives is the true and useful part: that the picture changed, and
    /// when. Restoring a version therefore leaves the entry's current image exactly as it is,
    /// which is what the history screen says out loud.
    /// </summary>
    Image = 1 << 8,
}

/// <summary>
/// One version of one entry, exactly as it stood after an accepted write.
///
/// A revision is a full snapshot, not a patch: every version is readable and restorable on
/// its own, with no chain to replay and nothing to corrupt if one link is wrong. It is
/// immutable once written - nothing in the API updates or deletes a revision - and it is
/// deliberately *not* joined to the lore it describes. The type, field, option and entity
/// ids it carries are raw values with no foreign key, so deleting a field definition or a
/// referenced entity cannot be blocked by, or silently rewrite, what history already says.
/// Every id therefore travels with the text that was shown at the time, and the reader never
/// depends on a join that may no longer resolve.
///
/// The one exception is <see cref="EntityId"/>, which is a real cascading foreign key.
/// History is history *of* an entry; when the entry goes, so does it. Trash and recovery are
/// a separate concern and not this phase's.
///
/// See <c>docs/architecture/decisions/0013-entity-revision-snapshots.md</c>.
/// </summary>
public sealed class EntityRevision
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    /// <summary>1 for the first version, incrementing per entry. What the author is shown.</summary>
    public int Number { get; set; }

    public EntityRevisionKind Kind { get; set; }

    public EntityRevisionChange Changes { get; set; }

    /// <summary>
    /// The revision this one put back, for a restore. A raw id: the revision it names lives
    /// in this same entry's history and dies with it, so a self-referencing key would buy
    /// nothing but a cascade cycle.
    /// </summary>
    public Guid? RestoredFromRevisionId { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// The account whose write produced this version. A raw id with no foreign key, like every other id a revision
    /// holds: history never blocks, and is never rewritten by, what happens to an account. Null for a version recorded
    /// before attribution, or restored from a backup, which carries no account (ADR 0041). Read as the account's
    /// username, live; never as anything else of the account.
    /// </summary>
    public string? ActorUserId { get; set; }

    // ---------- The snapshot ----------

    /// <summary>The type the entry had. Raw id; <see cref="EntityTypeName"/> is what is read.</summary>
    public Guid EntityTypeId { get; set; }

    public required string EntityTypeName { get; set; }

    public required string Name { get; set; }

    public string? Summary { get; set; }

    /// <summary>
    /// The article as it read at this version, for a version recorded before articles kept a
    /// history of their own; null for every version recorded since, which holds no copy of the
    /// article at all (<see cref="EntityArticleRevision"/> does). Never written again, never
    /// compared, and never applied by a restore - so an old version cannot put back, or wipe,
    /// an article saved after it. Kept because it is what the author wrote. See ADR 0028.
    /// </summary>
    public string? Content { get; set; }

    public CanonStatus CanonStatus { get; set; }

    public ICollection<EntityRevisionAlias> Aliases { get; } = [];

    public ICollection<EntityRevisionTag> Tags { get; } = [];

    public ICollection<EntityRevisionFieldValue> FieldValues { get; } = [];
}

/// <summary>One alias the entry carried at that version.</summary>
public sealed class EntityRevisionAlias
{
    public Guid Id { get; set; }

    public Guid RevisionId { get; set; }

    public EntityRevision? Revision { get; set; }

    public required string Value { get; set; }
}

/// <summary>
/// One tag the entry carried at that version, by name. The name rather than the tag id,
/// because a tag is universe-scoped shared data and a revision must keep reading correctly
/// however that row is later renamed or removed.
/// </summary>
public sealed class EntityRevisionTag
{
    public Guid Id { get; set; }

    public Guid RevisionId { get; set; }

    public EntityRevision? Revision { get; set; }

    public required string Name { get; set; }
}

/// <summary>
/// One stored custom-field value at that version, in the same typed columns the live table
/// uses - never a JSON bag, so a snapshot stays as queryable as the lore it copied.
///
/// It carries both halves of every reference: the id, so a restore can put the value back,
/// and the text that was displayed, so the history reads correctly even once the id points
/// at nothing. Multi-select stores one row per chosen option, exactly as the live value does.
/// </summary>
public sealed class EntityRevisionFieldValue
{
    public Guid Id { get; set; }

    public Guid RevisionId { get; set; }

    public EntityRevision? Revision { get; set; }

    /// <summary>Raw id of the field definition. No foreign key - see <see cref="EntityRevision"/>.</summary>
    public Guid FieldDefinitionId { get; set; }

    public required string FieldName { get; set; }

    public EntityFieldKind Kind { get; set; }

    /// <summary>The field's position on its type at the time, so a snapshot renders in the order it did.</summary>
    public int DisplayOrder { get; set; }

    public string? TextValue { get; set; }

    public double? NumberValue { get; set; }

    /// <summary>Raw id of the era the number was a year in. No foreign key, like every id here.</summary>
    public Guid? EraId { get; set; }

    /// <summary>
    /// What was written beside the year at the time - the era's short label, or its name - so a
    /// version still reads "BF 10" once the era is renamed or gone.
    /// </summary>
    public string? EraLabel { get; set; }

    public bool? BooleanValue { get; set; }

    public DateTime? DateValue { get; set; }

    public Guid? OptionId { get; set; }

    public string? OptionValue { get; set; }

    public Guid? ReferencedEntityId { get; set; }

    public string? ReferencedEntityName { get; set; }
}
