using LorEvolve.Api.Features.FamilyTrees;
using LorEvolve.Api.Features.Relationships;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Aunts and uncles, cousins, and nieces and nephews, derived from parent links alone, in memory: a grandparent's other
/// child, that child's children, and a sibling's children. A parent is never its own child's aunt or uncle.
/// </summary>
public sealed class FamilyTreeExtendedKinTests
{
    private static readonly Guid Kind = Guid.NewGuid();

    [Fact]
    public void Aunts_uncles_cousins_and_nieces_nephews_are_derived_from_parent_links()
    {
        var (grand, parent, uncle, focal, sibling, cousin, niece) =
            (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());

        var family = FamilyTreeDerivation.Relatives(focal,
        [
            Link(grand, parent),
            Link(grand, uncle),
            Link(parent, focal),
            Link(parent, sibling),
            Link(uncle, cousin),
            Link(sibling, niece),
        ]);

        Assert.Equal([uncle], family.AuntsUncles.Select(relative => relative.EntityId));
        Assert.Equal(3, family.AuntsUncles.Single().Paths.Single().Count);
        Assert.Equal([cousin], family.Cousins.Select(relative => relative.EntityId));
        Assert.Equal(4, family.Cousins.Single().Paths.Single().Count);
        Assert.Equal([niece], family.NiecesNephews.Select(relative => relative.EntityId));
        Assert.Equal([sibling], family.Siblings.Select(relative => relative.EntityId));
        Assert.DoesNotContain(family.AuntsUncles, relative => relative.EntityId == parent);
    }

    [Fact]
    public void With_no_grandparent_or_sibling_there_is_no_extended_kin()
    {
        var (parent, focal) = (Guid.NewGuid(), Guid.NewGuid());

        var family = FamilyTreeDerivation.Relatives(focal, [Link(parent, focal)]);

        Assert.Empty(family.AuntsUncles);
        Assert.Empty(family.Cousins);
        Assert.Empty(family.NiecesNephews);
    }

    private static FamilyLink Link(Guid parent, Guid child) =>
        new(Guid.NewGuid(), Kind, parent, child, RelationshipFamilySemantic.BiologicalParent);
}
