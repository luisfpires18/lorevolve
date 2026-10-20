using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Lore;

/// <summary>How settled a piece of lore is. Ordered from least to most committed.</summary>
public enum CanonStatus
{
    Idea = 0,
    Draft = 1,
    Canon = 2,
}

/// <summary>The shape of a custom field. Storage column is chosen from this.</summary>
public enum EntityFieldKind
{
    ShortText = 0,
    LongText = 1,
    Number = 2,
    Boolean = 3,
    Date = 4,
    Select = 5,
    MultiSelect = 6,
    EntityReference = 7,
}

/// <summary>
/// What a field *means*, for the handful of meanings Lorex can reason about deterministically.
///
/// Fields are otherwise semantic-free: a type's fields are whatever the author invents, and
/// nothing infers meaning from a display name. "Birth Year", "Born", "Geburtsjahr" and
/// "b." are all the same thing to an author and nothing to a matcher, so a rule that keyed
/// off names would be wrong the moment someone renamed a field or wrote in another language.
/// Meaning is therefore declared, once, on the definition - never guessed, and never by AI.
///
/// Deliberately tiny and closed. This is not an ontology: it is the vocabulary the
/// chronology rules need, and it grows one entry at a time when a rule needs one.
///
/// Only *year* meanings exist, because the rest of Lorex counts fictional time in signed
/// integer years (see <c>docs/architecture/decisions/0009-fictional-chronology.md</c>).
/// <see cref="EntityFieldValue.DateValue"/> is a Gregorian <see cref="DateTime"/> and does
/// not compare with a universe's own calendar, so no BirthDate/DeathDate member is offered.
/// </summary>
public enum EntityFieldSemantic
{
    /// <summary>The year the subject was born, on the universe's own reckoning.</summary>
    BirthYear = 1,

    /// <summary>The year the subject died, on the universe's own reckoning.</summary>
    DeathYear = 2,

    /// <summary>
    /// How old the subject is. Recorded so the meaning can be declared, but no rule reads
    /// it yet: an age is only a claim about a moment, and nothing in the model says which
    /// moment. See <c>docs/architecture/decisions/0011-semantic-field-codes.md</c>.
    /// </summary>
    Age = 3,
}

/// <summary>
/// A kind of thing a universe contains: Character, Location, whatever the author invents.
/// Types carry presentation hints, their field definitions and one explicit capability,
/// <see cref="FamilyTreeEligible"/>.
/// </summary>
public sealed class EntityType
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Name { get; set; }

    public string? Description { get; set; }

    /// <summary>
    /// The type's icon key, or null for the neutral fallback. One of <see cref="EntityTypeIcons.Keys"/>,
    /// chosen by the author and never inferred from <see cref="Name"/>. A key, not markup and not a URL.
    /// </summary>
    public string? Icon { get; set; }

    public string? AccentColor { get; set; }

    /// <summary>
    /// Whether entries of this type normally take part in the Family Tree: offered by its picker and given its action.
    /// Set by the author, and by the starter Character type, and never inferred from <see cref="Name"/> or
    /// <see cref="Icon"/>. It gates where the tree is offered, never what an entry may hold: an entry of any type keeps the
    /// family links already recorded on it (ADR 0040). The type's own switch: a group enabled for the Family Tree offers it
    /// as well (<see cref="EntityTypeGroup.FamilyTreeEnabled"/>, read through <c>FamilyTreeEligibility</c>).
    /// </summary>
    public bool FamilyTreeEligible { get; set; }

    /// <summary>
    /// The type this one sits beneath, or null for a root type (ADR 0007 amendment, 2026-10-01). Always a type of the same
    /// universe (a trigger refuses anything else) and never the type itself or one of its descendants (the API and the
    /// restore refuse that), so the types form a forest. Organisation only: nothing - fields, icon, accent, Family Tree,
    /// Canon - is inherited.
    /// </summary>
    public Guid? ParentId { get; set; }

    /// <summary>The type's place among its direct siblings - the types with the same <see cref="ParentId"/> - from 1.</summary>
    public int DisplayOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public ICollection<EntityFieldDefinition> Fields { get; set; } = [];
}

/// <summary>
/// A semantic group of Lore types (Issue #36): a named, creator-defined classification such as "Runes" that several concrete
/// types can belong to. Classification metadata only - not an entity model, not a parent type. A type in a group inherits
/// nothing from it: no field, no icon. Identity is the id, so renaming the group or a member type changes no membership and
/// no field that targets the group. Membership is explicit and never inferred from names.
/// </summary>
public sealed class EntityTypeGroup
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Name { get; set; }

    /// <summary>
    /// Whether the author enabled this group for the Family Tree (Issue #37, ADR 0040 amendment): every type in it is then
    /// offered there, beside the types enabled one by one (<see cref="EntityType.FamilyTreeEligible"/>). Off unless the author
    /// turns it on - never for a new, seeded or restored-from-older-file group, and never because of what the group is called.
    /// Being in a group that is off gives a type nothing.
    /// </summary>
    public bool FamilyTreeEnabled { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public ICollection<EntityTypeGroupMember> Members { get; set; } = [];
}

/// <summary>One type's membership of one group. Both are of the same universe, which a trigger enforces.</summary>
public sealed class EntityTypeGroupMember
{
    public Guid EntityTypeGroupId { get; set; }

    public EntityTypeGroup? Group { get; set; }

    public Guid EntityTypeId { get; set; }

    public EntityType? EntityType { get; set; }
}

/// <summary>One custom field on a type. No formulas, no nesting, no JSON.</summary>
public sealed class EntityFieldDefinition
{
    public Guid Id { get; set; }

    public Guid EntityTypeId { get; set; }

    public EntityType? EntityType { get; set; }

    public required string Name { get; set; }

    public EntityFieldKind Kind { get; set; }

    /// <summary>
    /// What this field means to the integrity rules, or null - which is the normal case.
    /// A scalar column rather than JSON, so it is queryable and a rule can join on it.
    /// At most one field per type may carry any given meaning, or a rule reading "the
    /// birth year" would have to choose between two answers.
    /// </summary>
    public EntityFieldSemantic? Semantic { get; set; }

    public bool IsRequired { get; set; }

    public int DisplayOrder { get; set; }

    /// <summary>Default rendered into a new entity's form. Interpreted per <see cref="Kind"/>.</summary>
    public string? DefaultValue { get; set; }

    /// <summary>
    /// For an <see cref="EntityFieldKind.EntityReference"/> field, the one type its entries must be of - that exact type,
    /// never its descendants - or null for any type, which is a choice and not a gap. Always null on any other kind.
    /// Held by id alone and never worked out from a name, so renaming or moving the type changes nothing here. A type of
    /// the same universe, which the key cannot say and the endpoints check.
    /// </summary>
    public Guid? TargetEntityTypeId { get; set; }

    public EntityType? TargetEntityType { get; set; }

    /// <summary>
    /// For an <see cref="EntityFieldKind.EntityReference"/> field, the semantic group its entries' types must belong to, or
    /// null. Never set together with <see cref="TargetEntityTypeId"/>: a field allows any type, one exact type, or one group
    /// (Issue #36). Membership is read as it is when a link is written, so adding a type to the group widens the field and
    /// taking one out is refused while a link relies on it. A group of the same universe, which a trigger enforces.
    /// </summary>
    public Guid? TargetGroupId { get; set; }

    public EntityTypeGroup? TargetGroup { get; set; }

    /// <summary>
    /// When the author archived this field, or null while it is active (Issue #39). Archiving hides a field and keeps it whole:
    /// the definition, its id, options, meaning, target, <see cref="IsRequired"/> and every stored value - Trash included -
    /// stay exactly as they were, and restoring clears this marker. While it is set the field is out of entry forms, entry
    /// reads, filters, required checks and every Canon and timeline reading, and an entry save neither writes nor removes its
    /// values. Every protection that counts links - deleting a type or group, leaving a group, retyping an entry - still
    /// counts its values, so nothing an archived field holds can be invalidated behind it.
    /// </summary>
    public DateTime? ArchivedAt { get; set; }

    /// <summary>
    /// The definition's edit version (ADR 0043 amendment, Issue #39): 1 when created, advanced once by every edit that changes
    /// it and by archiving and restoring it. An edit names the version it was made over and is refused when that is no longer
    /// current, so two people editing one field never quietly undo each other - a stale drawer cannot widen a target someone
    /// has since narrowed, or overwrite settings after the field was archived and restored.
    /// </summary>
    public int Version { get; set; } = 1;

    public ICollection<EntityFieldOption> Options { get; set; } = [];

    public ICollection<EntityFieldValue> Values { get; set; } = [];
}

/// <summary>A choice for a select or multi-select field. Relational, not a JSON array.</summary>
public sealed class EntityFieldOption
{
    public Guid Id { get; set; }

    public Guid FieldDefinitionId { get; set; }

    public EntityFieldDefinition? FieldDefinition { get; set; }

    public required string Value { get; set; }

    public int DisplayOrder { get; set; }
}

/// <summary>
/// A record in a universe. Named LoreEntity so it does not collide with EF Core's own
/// use of "entity" throughout the codebase.
/// </summary>
public sealed class LoreEntity : Publishing.IPublishable
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public Guid EntityTypeId { get; set; }

    public EntityType? EntityType { get; set; }

    public required string Name { get; set; }

    public string? Summary { get; set; }

    // The entry's article is not a column here. It lives in a row of its own, EntityArticle,
    // read and written on its own route, so no structured read or write ever carries it -
    // see docs/architecture/decisions/0028-entity-article.md.

    public CanonStatus CanonStatus { get; set; }

    public bool IsArchived { get; set; }

    /// <summary>
    /// When this entry was moved to Trash, or null while it is live. The marker *is* the
    /// Trash: the row and every row that points at it stay exactly where they are, so a
    /// restore has nothing to rebuild and nothing dependent is destroyed on the way in.
    ///
    /// Deliberately a timestamp rather than a flag - the Trash listing has to show when an
    /// entry was thrown away, and two columns that must agree is one too many.
    ///
    /// Not an EF global query filter. A filter follows navigations, and the reads that must
    /// see a trashed entry (the backup, the Trash itself) and the reads that must not (browse,
    /// search, pickers, every Canon rule) are both reached through those same navigations;
    /// <c>IgnoreQueryFilters</c> is all-or-nothing per query and could not separate them. Every
    /// read therefore says which it wants. See
    /// <c>docs/architecture/decisions/0015-entity-trash-and-restore.md</c>.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// Whether the author selected this entry for the public portal. Read only together with its universe's
    /// visibility and <see cref="DeletedAt"/> - <see cref="Publishing.PublicationRules.PublicLore"/> - and changed
    /// only by the entry's publish and unpublish routes (ADR 0036).
    /// </summary>
    public Publishing.ContentVisibility Visibility { get; set; }

    /// <summary>The entry's public address inside its universe, minted at first publication and never changed after.</summary>
    public string? PublicSlug { get; set; }

    /// <summary>When the entry was first published. Republishing keeps it.</summary>
    public DateTime? PublishedAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// The edit version of the entry's structured lore - name, summary, type, status, aliases, tags and field values,: server-owned, 1 when created, advanced once by every write that changes the entry's structured lore - name, summary, type, status, aliases, tags and field values,.
    /// A save names the version it was written over and is refused when it is no longer current (ADR 0043).
    /// </summary>
    public int Version { get; set; } = 1;

    public ICollection<EntityAlias> Aliases { get; set; } = [];

    public ICollection<EntityFieldValue> FieldValues { get; set; } = [];

    public ICollection<EntityTag> EntityTags { get; set; } = [];

    /// <summary>
    /// The entry's one primary image, or null. A reference rather than a set: an entry has one
    /// picture and the schema says so - see <see cref="EntityImage"/>. Trashing an entry does
    /// not touch it, because trashing deletes nothing.
    /// </summary>
    public EntityImage? Image { get; set; }
}

/// <summary>Another name the same thing goes by. Searched alongside the name.</summary>
public sealed class EntityAlias
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public required string Value { get; set; }
}

/// <summary>
/// One stored value. Typed columns rather than a JSON blob, so values stay queryable and
/// a field's type change cannot silently reinterpret what is already there. Multi-select
/// stores one row per chosen option.
/// </summary>
public sealed class EntityFieldValue
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public Guid FieldDefinitionId { get; set; }

    public EntityFieldDefinition? FieldDefinition { get; set; }

    public string? TextValue { get; set; }

    public double? NumberValue { get; set; }

    /// <summary>
    /// The era <see cref="NumberValue"/> is a year in, on a universe that names its eras. Required
    /// for a birth or death year there, allowed on any other number, and always null on a universe
    /// that keeps plain signed years. Metadata on the number rather than a field kind of its own:
    /// see <c>docs/architecture/decisions/0022-universe-chronology.md</c>.
    /// </summary>
    public Guid? EraId { get; set; }

    public ChronologyEra? Era { get; set; }

    public bool? BooleanValue { get; set; }

    public DateTime? DateValue { get; set; }

    /// <summary>Set for Select and MultiSelect.</summary>
    public Guid? OptionId { get; set; }

    public EntityFieldOption? Option { get; set; }

    /// <summary>Set for EntityReference. Always another entity in the same universe.</summary>
    public Guid? ReferencedEntityId { get; set; }

    public LoreEntity? ReferencedEntity { get; set; }
}

/// <summary>A label scoped to one universe.</summary>
public sealed class Tag
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Name { get; set; }

    /// <summary>Lowercased name, so tags are matched case-insensitively without collation tricks.</summary>
    public required string Slug { get; set; }

    public ICollection<EntityTag> EntityTags { get; set; } = [];
}

public sealed class EntityTag
{
    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public Guid TagId { get; set; }

    public Tag? Tag { get; set; }
}
