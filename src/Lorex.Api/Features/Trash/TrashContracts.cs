using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.Trash;

/// <summary>What a row in the Trash is. Stored nowhere: each kind is its own table's marker (ADR 0015, ADR 0029, ADR 0033).</summary>
public enum TrashItemKind
{
    Entry = 0,
    Story = 1,
    Chapter = 2,
    Scene = 3,
    PlotArc = 4,
    PlotBeat = 5,
    WorldRule = 6,

    /// <summary>A relationship between two entries (ADR 0048).</summary>
    Relationship = 7,

    /// <summary>A timeline moment (ADR 0048).</summary>
    TimelineEvent = 8,
}

/// <summary>Why a row in the Trash cannot be put back yet, if it cannot. Never inferred from a name.</summary>
public enum TrashRestoreBlock
{
    /// <summary>It can be restored now.</summary>
    None = 0,

    /// <summary>The story it belongs to is in the Trash as well: the story comes back first.</summary>
    StoryInTrash = 1,

    /// <summary>The arc a beat belongs to is in the Trash as well: the arc comes back first.</summary>
    ArcInTrash = 2,

    /// <summary>An entry a relationship connects is in the Trash: that entry comes back first (ADR 0048).</summary>
    EntryInTrash = 3,
}

/// <summary>
/// What restoring a row would do on the public portal (Task 012). Trash keeps an entry's or story's public selection
/// (ADR 0036), so a restore can make it readable again at once; the Trash asks before that happens. Derived from the same
/// predicates the public API reads, never stored.
/// </summary>
public enum TrashRestorePublication
{
    /// <summary>Not selected for publication, or not a kind that can be: restoring shows nothing to anyone.</summary>
    None = 0,

    /// <summary>Selected, but restoring would not make it readable: its universe is private, or a story has no public summary.</summary>
    Hidden = 1,

    /// <summary>Selected in a public universe: restoring makes it readable on the public portal straight away.</summary>
    Visible = 2,
}

/// <summary>
/// One row in the Trash, as the list shows it.
///
/// Deliberately thin. The Trash is a recovery surface, not a second browser: it answers "what did I throw away, where was
/// it, and when". Nothing a row held - an article, fields, prose, notes, links - is reported here, and every word of it is
/// readable again the moment it is restored.
///
/// <paramref name="Kind"/> says what it is. The entry members - type and Canon status - are set for an entry only (and the
/// status for a moment); a world rule, a relationship and a moment carry none of the context members, because each sits in
/// nothing but its universe. A relationship's <paramref name="Name"/> reads it whole - "Arin rules Varn" - and a moment's is
/// its title; <paramref name="EntryId"/> is the entry a relationship starts from, where a client opens it once it is back.
/// <paramref name="StoryId"/> is set for everything from a story: the story itself, and the chapter, scene, arc or beat's
/// own story, whose <paramref name="StoryTitle"/> says where it was. <paramref name="PlotArcId"/> and
/// <paramref name="PlotArcTitle"/> are a beat's arc. <paramref name="BlockedBy"/> says the row cannot come back until what
/// it belongs to does. <paramref name="Publication"/> says whether restoring an entry or story would publish it again.
/// </summary>
public sealed record TrashItem(
    TrashItemKind Kind,
    Guid Id,
    string Name,
    DateTime TrashedAt,
    Guid? EntityTypeId,
    string? EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    CanonStatus? CanonStatus,
    Guid? StoryId,
    string? StoryTitle,
    Guid? PlotArcId,
    string? PlotArcTitle,
    TrashRestoreBlock BlockedBy,
    TrashRestorePublication Publication,
    Guid? EntryId = null);

public sealed record TrashPage(
    IReadOnlyList<TrashItem> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>What a restore of story content put back, and the story it is in: enough for a client to open it.</summary>
public sealed record TrashRestored(TrashItemKind Kind, Guid Id, Guid StoryId);

/// <summary>
/// What erasing a story from the Trash took with it that a client may hold something of: every scene of the story, live or
/// in the Trash on its own. Every other permanent delete answers 204, because a client already knows the one id it erased.
/// </summary>
public sealed record TrashErasedStory(Guid Id, IReadOnlyList<Guid> ErasedSceneIds);

/// <summary>One row in the Trash, named by its kind and id: what a bulk delete selects. The kind is never guessed from the id.</summary>
public sealed record TrashSelection(TrashItemKind Kind, Guid Id);

/// <summary>
/// Deletes these rows of one universe's Trash for good, of any mix of kinds, all or none. 1 to
/// <see cref="TrashPermanentDelete.BulkDeleteMaxItems"/> items, none twice.
/// </summary>
public sealed record BulkTrashDeleteRequest(IReadOnlyList<TrashSelection?>? Items);

/// <summary>
/// What a bulk delete erased: how many of the selected rows (each selected row counts once, also when a selected parent's
/// cascade took it), and the ids of every entry and scene that went - a selected story's scenes included, selected or not -
/// so a client can let go of exactly the recovery copies it keeps for them.
/// </summary>
public sealed record TrashBulkErased(int Deleted, IReadOnlyList<Guid> ErasedEntryIds, IReadOnlyList<Guid> ErasedSceneIds);
