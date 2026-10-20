using Lorex.Api.Data;

namespace Lorex.Api.Features.FamilyTrees;

/// <summary>
/// Which types the Family Tree is offered for (ADR 0040, amended by Issue #37): a type the author enabled itself
/// (<c>EntityType.FamilyTreeEligible</c>), or a type in a group the author enabled for it (<c>EntityTypeGroup.FamilyTreeEnabled</c>).
/// Either is enough, and a type in several enabled groups is still one type. The one rule every reader uses - the picker, the
/// families listing, the tree's nodes and the type list - so they cannot disagree.
///
/// Nothing here reads a name, and nothing here changes what an entry holds: eligibility decides where the tree is offered,
/// never which links exist or what they derive.
/// </summary>
internal static class FamilyTreeEligibility
{
    /// <summary>
    /// The ids of this universe's eligible types, as a query to compose into another rather than a list read first: used inside a
    /// <c>Where</c> or a <c>Select</c>, it becomes a subquery of that statement, with no read of its own.
    /// </summary>
    public static IQueryable<Guid> TypeIds(LorexDbContext db, Guid universeId) =>
        db.EntityTypes
            .Where(type => type.UniverseId == universeId
                && (type.FamilyTreeEligible
                    || db.EntityTypeGroupMembers.Any(member => member.EntityTypeId == type.Id
                        && member.Group!.UniverseId == universeId
                        && member.Group.FamilyTreeEnabled)))
            .Select(type => type.Id);
}
