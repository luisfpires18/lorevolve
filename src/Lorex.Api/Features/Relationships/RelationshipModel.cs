using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Relationships;

/// <summary>
/// A kind of link an author invents inside one universe: "rules", "parent of",
/// "married to". The type carries both readings of the link, so a relationship is stored
/// once and read from either end.
/// </summary>
public sealed class RelationshipType
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>The forward reading, source to target: "rules".</summary>
    public required string Name { get; set; }

    /// <summary>
    /// The reverse reading, target to source: "ruled by". Null for a symmetric type,
    /// where both ends read the same and a second wording would be meaningless.
    /// </summary>
    public string? InverseName { get; set; }

    /// <summary>True when the link reads identically from both ends: "married to".</summary>
    public bool IsSymmetric { get; set; }

    public string? Description { get; set; }

    public int DisplayOrder { get; set; }

    /// <summary>
    /// Which end of every Canon relationship of this type must be older, as the author configured
    /// it. Stated on the stored direction, source then target, and never read out of
    /// <see cref="Name"/>: "parent of" orders nothing until someone says it does. See
    /// <c>docs/architecture/decisions/0023-relationship-canon-constraints.md</c>.
    /// </summary>
    public RelationshipAgeOrder AgeOrder { get; set; }

    /// <summary>The smallest gap allowed between the two ends' birth years, in whole years. Null for none.</summary>
    public int? MinAgeDifferenceYears { get; set; }

    /// <summary>The largest gap allowed between the two ends' birth years, in whole years. Null for none.</summary>
    public int? MaxAgeDifferenceYears { get; set; }

    /// <summary>
    /// What every relationship of this type means to a family tree, as the author configured it. A parent meaning reads the
    /// stored direction - the source is the parent and the target the child - and places both ends in the ancestry; a
    /// non-structural family meaning places neither. Never read out of <see cref="Name"/> - "mother of" means nothing to a
    /// family tree until someone says it does. Independent of the Canon constraints above. See
    /// <c>docs/architecture/decisions/0035-family-trees.md</c> and <c>0040-family-tree-type-semantics.md</c>.
    /// </summary>
    public RelationshipFamilySemantic FamilySemantic { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Which end of a relationship must have been born first. A Canon constraint the author sets on a
/// <see cref="RelationshipType"/>; Canon Integrity checks it and nothing else reads it.
/// </summary>
public enum RelationshipAgeOrder
{
    /// <summary>No age order. Every type written before constraints existed, and the default.</summary>
    None = 0,

    /// <summary>The source was born before the target.</summary>
    SourceOlder = 1,

    /// <summary>The source was born after the target.</summary>
    SourceYounger = 2,
}

/// <summary>
/// What a <see cref="RelationshipType"/> means to a family tree. A closed set, configured by the author and never inferred;
/// only a family tree reads it (ADR 0035, ADR 0040). Both parent meanings point the same way: source parent, target child, and
/// only they place anyone in an ancestry. <see cref="NonStructuralFamily"/> is family the tree lists and never derives from.
/// </summary>
public enum RelationshipFamilySemantic
{
    /// <summary>No family meaning. Every type written before family trees existed, and the default.</summary>
    None = 0,

    /// <summary>The source is a biological parent of the target.</summary>
    BiologicalParent = 1,

    /// <summary>The source is an adoptive parent of the target.</summary>
    AdoptiveParent = 2,

    /// <summary>
    /// Family, but not ancestry: "uncle of", "married to", "guardian of". Shown on the Family Tree as the authored link it is,
    /// in the kind's own readings, and never walked: it makes nobody a parent, sibling, grandparent or grandchild, and closes no
    /// circle (ADR 0040). The one family meaning a symmetric kind may carry.
    /// </summary>
    NonStructuralFamily = 3,
}

/// <summary>The family meanings that place entries in an ancestry. Everything that derives relatives reads only these.</summary>
public static class RelationshipFamilySemantics
{
    /// <summary>For queries: <c>Parent.Contains(type.FamilySemantic)</c> translates to SQL.</summary>
    public static readonly RelationshipFamilySemantic[] Parent =
        [RelationshipFamilySemantic.BiologicalParent, RelationshipFamilySemantic.AdoptiveParent];

    public static bool IsParent(this RelationshipFamilySemantic semantic) =>
        semantic is RelationshipFamilySemantic.BiologicalParent or RelationshipFamilySemantic.AdoptiveParent;
}

/// <summary>
/// One link between two entities of the same universe. Exactly one row is stored per
/// link; the reverse reading is derived from <see cref="RelationshipType.InverseName"/>
/// at read time, never persisted as a second row.
/// </summary>
public sealed class LoreRelationship
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public Guid RelationshipTypeId { get; set; }

    public RelationshipType? RelationshipType { get; set; }

    public Guid SourceEntityId { get; set; }

    public LoreEntity? SourceEntity { get; set; }

    public Guid TargetEntityId { get; set; }

    public LoreEntity? TargetEntity { get; set; }

    public CanonStatus CanonStatus { get; set; }

    /// <summary>
    /// UTC. Optional; a real-world date, from before a link could be placed in the universe's own time (<see cref="Periods"/>,
    /// Issue #18). Kept exactly as it is, shown, and clearable; no longer offered for new links.
    /// </summary>
    public DateTime? StartDate { get; set; }

    /// <summary>UTC. Optional. Never earlier than <see cref="StartDate"/> when both are set.</summary>
    public DateTime? EndDate { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// When the link was moved to the Trash, or null while it is live (ADR 0048). Only the marker moves: the row keeps its
    /// kind, ends, dates and notes, and a restore puts it back as it was. A link in the Trash is read nowhere - no entry, family
    /// tree or Canon rule sees it - exactly like one whose end is in the Trash. Not a query filter (see
    /// <see cref="LoreEntity.DeletedAt"/>): every read says which it wants.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// When the link holds (Issue #18), on the universe's own chronology or as an era of either end; none means always, as
    /// every link was before. <see cref="StartDate"/> and <see cref="EndDate"/> are the older real-world dates, kept as they
    /// are and no longer offered.
    /// </summary>
    public ICollection<RelationshipPeriod> Periods { get; } = [];
}
