using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;

namespace LorEvolve.Api.Features.FamilyTrees;

/// <summary>
/// One entry's family, <see cref="GenerationsEachWay"/> generations up and down, derived from explicit parent links and nothing
/// else (ADR 0035).
///
/// Every relative lists the paths that make it one. A path is the ids of the parent links it walks, starting from the link that
/// touches the focal entry: a parent's path is its one link; a grandparent's is the parent's link, then the grandparent's; a
/// sibling's is the shared parent's link to the focal entry, then that parent's link to the sibling; a grandchild's is the
/// child's link, then the grandchild's. An aunt or uncle's is the parent's link, the grandparent's link to that parent, then
/// the grandparent's link to the aunt or uncle; a cousin's adds the aunt or uncle's link to the cousin; a niece or nephew's is
/// the sibling's path, then the sibling's link to them. Several paths are several recorded ways of being that relative - two shared parents, or
/// one parent through a biological and an adoptive link - and nothing more is claimed from them: a sibling is never called
/// full or half.
///
/// An entry may be several relatives at once. The focal entry is never its own relative: a circle of links is named in
/// <see cref="Loops"/> instead.
///
/// <see cref="Connections"/> are the authored non-structural family links - "uncle of", "married to" - of the focal entry and of
/// every relative drawn, each read from that member's side (Issue #37). They are listed, never walked: nothing in the positions
/// above comes from one (ADR 0040), and a related entry they name is in <see cref="Nodes"/> without being drawn.
/// </summary>
public sealed record FamilyTreeResponse(
    Guid FocalEntityId,
    int GenerationsEachWay,
    IReadOnlyList<FamilyTreeNode> Nodes,
    IReadOnlyList<FamilyTreeLink> Links,
    IReadOnlyList<FamilyTreeRelative> Parents,
    IReadOnlyList<FamilyTreeRelative> Grandparents,
    IReadOnlyList<FamilyTreeRelative> Siblings,
    IReadOnlyList<FamilyTreeRelative> Children,
    IReadOnlyList<FamilyTreeRelative> Grandchildren,
    IReadOnlyList<FamilyTreeLoop> Loops,
    IReadOnlyList<FamilyTreeConnection> Connections,
    IReadOnlyList<FamilyTreeRelative> AuntsUncles,
    IReadOnlyList<FamilyTreeRelative> Cousins,
    IReadOnlyList<FamilyTreeRelative> NiecesNephews);

/// <summary>
/// An entry in the tree: enough to recognise it, and its thumbnail's identity. Never a URL, an article or a field.
/// <paramref name="EntityTypeFamilyTreeEligible"/> is its type's capability - its own switch or an enabled group
/// (<see cref="FamilyTreeEligibility"/>) - so the page can say when an entry recorded in a family is of a type not enabled for it.
/// </summary>
public sealed record FamilyTreeNode(
    Guid EntityId,
    string Name,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    CanonStatus CanonStatus,
    EntityImageRef? Image,
    bool EntityTypeFamilyTreeEligible);

/// <summary>
/// One stored relationship read as a parent link: its type's family meaning says the source is the parent and the target the
/// child. The relationship's own Canon status travels with it, so a Draft link is never shown as settled family history.
/// </summary>
public sealed record FamilyTreeLink(
    Guid RelationshipId,
    Guid ParentEntityId,
    Guid ChildEntityId,
    RelationshipFamilySemantic Semantic,
    CanonStatus CanonStatus,
    Guid RelationshipTypeId,
    string RelationshipTypeName);

/// <summary>A relative, and every path of parent links that makes it one.</summary>
public sealed record FamilyTreeRelative(Guid EntityId, IReadOnlyList<IReadOnlyList<Guid>> Paths);

/// <summary>Parent links among those this tree read that go round in a circle, and the entries on it.</summary>
public sealed record FamilyTreeLoop(IReadOnlyList<Guid> EntityIds, IReadOnlyList<Guid> RelationshipIds);

/// <summary>
/// One page of the families a universe already holds (<see cref="FamilyDiscovery"/>): summaries to choose from, never trees.
/// </summary>
public sealed record FamilyDiscoveryPage(
    IReadOnlyList<FamilyDiscoveryItem> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>
/// A family as a summary. It has no id or name of its own - it is a group of linked entries, not a record - so it is opened by
/// <paramref name="FocusEntityId"/>, an eligible member, at that member's tree. <paramref name="MemberCount"/> is the whole
/// group; <paramref name="PreviewMembers"/> a few of them, the focal member first.
/// </summary>
public sealed record FamilyDiscoveryItem(
    Guid FocusEntityId,
    int MemberCount,
    IReadOnlyList<FamilyDiscoveryMember> PreviewMembers);

/// <summary>A member named on a family's summary: enough to recognise and nothing more.</summary>
public sealed record FamilyDiscoveryMember(Guid EntityId, string Name);

/// <summary>
/// One authored non-structural family link touching a drawn member, <paramref name="EntityId"/>, read from that member's side the
/// way a relation is everywhere else: <paramref name="Label"/> is the kind's name when the member is the source, its inverse
/// when it is the target, and the one name either way for a symmetric kind. A link between two drawn members comes once from
/// each side.
/// </summary>
public sealed record FamilyTreeConnection(
    Guid RelationshipId,
    Guid RelatedEntityId,
    RelationshipPerspective Perspective,
    string Label,
    CanonStatus CanonStatus,
    Guid RelationshipTypeId,
    Guid EntityId);
