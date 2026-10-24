using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;

namespace Lorex.Api.Features.Progression;

/// <summary>
/// An entry's progression (Issue #30): the creator-defined eras of one Lore entry, and - as later parts of #30 arrive - its
/// forms, abilities and appearances. Never a second entry: everything here hangs off the one <see cref="LoreEntity"/> by its
/// id, so links, relationships, scenes and the timeline keep pointing at the same identity whatever era is being read.
///
/// Optional and apart, like the article (ADR 0028). A row exists only once something was saved; an entry without one has no
/// progression and reads exactly as it always did. The entry's own save, a suggestion, an AI change and a revision restore of
/// the entry never read or write any of it, and this aggregate's saves never touch the entry's structured lore.
///
/// <see cref="Version"/> is the aggregate's edit version (ADR 0043): 0 with no row, 1 when first saved, advanced once by every
/// save that changes anything here. A save names the version it was written over.
/// </summary>
public sealed class EntityProgression
{
    /// <summary>The entry this is the progression of: both the key and the foreign key.</summary>
    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public DateTime UpdatedAt { get; set; }

    public int Version { get; set; } = 1;
}

/// <summary>
/// One era of one entry (Issue #41): a named stretch of that entry's story - "Frieza Saga" - in the order its author put it.
/// Not a date period of the universe's chronology (<see cref="ChronologyEra"/>, which every date is counted in), and not a
/// form or an outfit: an era is when, a form is what the entry can become, an outfit is how it looks.
///
/// <b>Overrides, not copies.</b> An era holds only what is different then (<see cref="FieldValues"/>); every other field reads
/// from the entry itself. Nothing is carried from one era into the next - an era's values are its own overrides or the
/// entry's, never an earlier era's (owner decision, 2026-10-24) - and nothing is inferred from the order.
///
/// <b>Context is optional and explicit.</b> A dated span on the universe's own chronology (<see cref="StartYear"/> ...
/// <see cref="EndDay"/>, each bound optional, partial to the precision written), and the stories and scenes it covers. None
/// is required, none is derived from another, and an era with none is still an era.
/// </summary>
public sealed class EntityEra
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    /// <summary>"Frieza Saga". Unique within the entry, ignoring case.</summary>
    public required string Name { get; set; }

    /// <summary>What the entry is like, and what happens to it, in this era. Plain text; optional.</summary>
    public string? Description { get; set; }

    /// <summary>The era's place among the entry's eras, 0 first. Contiguous; the author's order and nothing else.</summary>
    public int SortOrder { get; set; }

    /// <summary>The date period the start year is counted in, on a universe that names them; null on plain years.</summary>
    public Guid? StartEraId { get; set; }

    public ChronologyEra? StartEra { get; set; }

    public int? StartYear { get; set; }

    public int? StartMonth { get; set; }

    public Guid? StartMonthId { get; set; }

    public ChronologyCalendarMonth? StartCalendarMonth { get; set; }

    public int? StartDay { get; set; }

    public Guid? EndEraId { get; set; }

    public ChronologyEra? EndEra { get; set; }

    public int? EndYear { get; set; }

    public int? EndMonth { get; set; }

    public Guid? EndMonthId { get; set; }

    public ChronologyCalendarMonth? EndCalendarMonth { get; set; }

    public int? EndDay { get; set; }

    public ICollection<EntityEraStory> Stories { get; } = [];

    public ICollection<EntityEraScene> Scenes { get; } = [];

    public ICollection<EntityEraFieldValue> FieldValues { get; } = [];
}

/// <summary>One story an era covers. Putting the story in the Trash keeps the row; only a story gone for good takes it.</summary>
public sealed class EntityEraStory
{
    public Guid EntityEraId { get; set; }

    public EntityEra? Era { get; set; }

    public Guid StoryId { get; set; }

    public Story? Story { get; set; }
}

/// <summary>One scene an era covers, kept through the Trash like <see cref="EntityEraStory"/>.</summary>
public sealed class EntityEraScene
{
    public Guid EntityEraId { get; set; }

    public EntityEra? Era { get; set; }

    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }
}

/// <summary>
/// One field an era overrides: the value it holds in that era, in the same typed members an entry's own value uses
/// (<see cref="EntityFieldValue"/>) - one row per chosen option for a multi-select. Or, when <see cref="IsCleared"/>, that the
/// field has no value in that era at all, which is different from inheriting the entry's: one row with every value member
/// null. A required field is never cleared. No row for a field means the era inherits it.
/// </summary>
public sealed class EntityEraFieldValue
{
    public Guid Id { get; set; }

    public Guid EntityEraId { get; set; }

    public EntityEra? EntityEra { get; set; }

    public Guid FieldDefinitionId { get; set; }

    public EntityFieldDefinition? FieldDefinition { get; set; }

    public bool IsCleared { get; set; }

    public string? TextValue { get; set; }

    public double? NumberValue { get; set; }

    /// <summary>The date period <see cref="NumberValue"/> is a year in, as on an entry's own value. Not the entry's era.</summary>
    public Guid? EraId { get; set; }

    public ChronologyEra? Era { get; set; }

    public bool? BooleanValue { get; set; }

    public DateTime? DateValue { get; set; }

    public Guid? OptionId { get; set; }

    public EntityFieldOption? Option { get; set; }

    public Guid? ReferencedEntityId { get; set; }

    public LoreEntity? ReferencedEntity { get; set; }
}

/// <summary>
/// One saved version of an entry's progression: the whole of it, exactly as the save that made it stored it, as the JSON of
/// <see cref="ProgressionSnapshot"/> - the save's own request shape, so a restore is that save replayed and checked like any
/// other. The progression's own history, apart from the entry's (ADR 0013) and the article's (ADR 0028). Immutable once
/// written; dies with the entry.
/// </summary>
public sealed class EntityProgressionRevision
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    /// <summary>1 for the first version, incrementing per entry.</summary>
    public int Number { get; set; }

    public EntityRevisionKind Kind { get; set; }

    public Guid? RestoredFromRevisionId { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>The account that saved this version. Null when not recorded (a restored backup).</summary>
    public string? ActorUserId { get; set; }

    public required string Snapshot { get; set; }
}
