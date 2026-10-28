using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Relationships;
using static LorEvolve.Api.Tests.FamilyTreeTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The family meaning on a relation kind (ADR 0035): the one place a family tree's meaning is configured, and the one thing it
/// reads.
///
/// The invariant running through all of it is that a name means nothing. A kind called "mother of" with no family meaning is
/// invisible to a family tree, and a kind called anything at all with one is read exactly as a parent link. The meaning is also
/// independent of the Canon constraints beside it (ADR 0023): configuring one leaves the other where it was.
/// </summary>
public sealed class FamilySemanticTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_new_kind_has_no_family_meaning_unless_its_author_gives_one()
    {
        var family = await NewFamily(_factory, "famdefault");

        var plain = await Kind(family, "rules", inverseName: "ruled by");
        var parent = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var adoptive = await Kind(family, "raised", RelationshipFamilySemantic.AdoptiveParent, "raised by");

        Assert.Equal(RelationshipFamilySemantic.None, plain.FamilySemantic);
        Assert.Equal(RelationshipFamilySemantic.BiologicalParent, parent.FamilySemantic);
        Assert.Equal(RelationshipFamilySemantic.AdoptiveParent, adoptive.FamilySemantic);

        Assert.Equal(
            [
                ("bore", RelationshipFamilySemantic.BiologicalParent),
                ("raised", RelationshipFamilySemantic.AdoptiveParent),
                ("rules", RelationshipFamilySemantic.None),
            ],
            (await ListKinds(family)).OrderBy(kind => kind.Name, StringComparer.Ordinal)
                .Select(kind => (kind.Name, kind.FamilySemantic)));
    }

    [Fact]
    public async Task A_kind_called_parent_mother_father_child_sibling_or_family_still_means_nothing()
    {
        var family = await NewFamily(_factory, "famnames");
        var parent = await Person(family, "One");
        var child = await Person(family, "Two");

        foreach (var name in new[] { "parent", "parent of", "mother", "mother of", "father", "child", "child of", "sibling", "family", "família", "родитель" })
        {
            var kind = await Kind(family, name);
            Assert.Equal(RelationshipFamilySemantic.None, kind.FamilySemantic);
            await Link(family, kind, parent, child);
        }

        // Eleven links an author would read as family, and a family tree reads none of them.
        foreach (var entity in new[] { parent, child })
        {
            var tree = await Tree(family, entity);
            Assert.Empty(tree.Links);
            Assert.Empty(tree.Parents);
            Assert.Empty(tree.Children);
            Assert.Equal([entity], tree.Nodes.Select(node => node.EntityId));
        }

        // Nor does Canon: the two links called "parent" that point both ways are no circle.
        await Evaluate(family);
        Assert.Empty(await LoopFindings(family, status: null));
    }

    [Fact]
    public async Task A_kind_can_be_given_a_meaning_changed_and_cleared_without_a_link_being_rewritten()
    {
        var family = await NewFamily(_factory, "famchange");
        var kind = await Kind(family, "guardian of", inverseName: "under");
        var elder = await Person(family, "Elder");
        var young = await Person(family, "Young");
        var link = await Link(family, kind, elder, young);

        var before = await Detail(family, link);
        Assert.Empty((await Tree(family, young)).Parents);

        kind = await Configure(family, kind, RelationshipFamilySemantic.BiologicalParent);
        Assert.Equal(RelationshipFamilySemantic.BiologicalParent, kind.FamilySemantic);

        var derived = await Tree(family, young);
        Assert.Equal(["Elder"], Names(derived, derived.Parents));

        kind = await Configure(family, kind, RelationshipFamilySemantic.AdoptiveParent);
        Assert.Equal(RelationshipFamilySemantic.AdoptiveParent, Assert.Single((await Tree(family, young)).Links).Semantic);

        kind = await Configure(family, kind, RelationshipFamilySemantic.None);
        Assert.Equal(RelationshipFamilySemantic.None, kind.FamilySemantic);
        Assert.Empty((await Tree(family, young)).Parents);

        // The meaning lives on the kind, so the link itself was never touched.
        var after = await Detail(family, link);
        Assert.Equal(
            (before.SourceEntityId, before.TargetEntityId, before.RelationshipTypeId, before.CanonStatus, before.UpdatedAt),
            (after.SourceEntityId, after.TargetEntityId, after.RelationshipTypeId, after.CanonStatus, after.UpdatedAt));
    }

    [Fact]
    public async Task A_save_that_leaves_the_family_meaning_out_keeps_it_and_so_does_one_that_only_changes_a_rule()
    {
        var family = await NewFamily(_factory, "famkeep");
        var kind = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        // A client that predates family meanings renames the kind: the meaning stays, as the constraints do.
        var renamed = await PutJson<RelationshipTypeResponse>(
            family.Client,
            $"{Kinds(family.Universe)}/{kind.Id}",
            new RelationshipTypeRequest("brought forth", "brought forth by", false, "Blood.", null));

        Assert.Equal(RelationshipFamilySemantic.BiologicalParent, renamed.FamilySemantic);

        // A Canon constraint saved beside it changes nothing about it, and the meaning changes no constraint.
        var constrained = await PutJson<RelationshipTypeResponse>(
            family.Client,
            $"{Kinds(family.Universe)}/{kind.Id}",
            new RelationshipTypeRequest(
                renamed.Name, renamed.InverseName, false, renamed.Description, null,
                new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, 12, null)));

        Assert.Equal(RelationshipFamilySemantic.BiologicalParent, constrained.FamilySemantic);
        Assert.Equal(RelationshipAgeOrder.SourceOlder, constrained.CanonConstraints.AgeOrder);

        var cleared = await Configure(family, constrained, RelationshipFamilySemantic.None);
        Assert.Equal(RelationshipFamilySemantic.None, cleared.FamilySemantic);
        Assert.Equal((RelationshipAgeOrder.SourceOlder, 12, (int?)null), (cleared.CanonConstraints.AgeOrder, cleared.CanonConstraints.MinAgeDifferenceYears, cleared.CanonConstraints.MaxAgeDifferenceYears));
    }

    [Fact]
    public async Task A_kind_that_reads_the_same_from_both_sides_cannot_name_a_parent()
    {
        var family = await NewFamily(_factory, "famsymmetric");

        var refused = await PostKind(
            family.Client,
            family.Universe,
            new RelationshipTypeRequest("kin of", null, true, null, null, null, RelationshipFamilySemantic.BiologicalParent));

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("familySemantic", await Errors(refused), StringComparison.OrdinalIgnoreCase);
        Assert.Empty(await ListKinds(family));

        // Nor may a kind be turned symmetric underneath a meaning it already has.
        var kind = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var turned = await PutKind(family, kind, familySemantic: null, isSymmetric: true);

        Assert.Equal(HttpStatusCode.BadRequest, turned.StatusCode);
        Assert.Contains("familySemantic", await Errors(turned), StringComparison.OrdinalIgnoreCase);

        var stored = Assert.Single(await ListKinds(family));
        Assert.Equal((false, RelationshipFamilySemantic.BiologicalParent), (stored.IsSymmetric, stored.FamilySemantic));

        // Clearing the meaning in the same save is how it is done.
        (await PutKind(family, kind, RelationshipFamilySemantic.None, isSymmetric: true)).EnsureSuccessStatusCode();

        var symmetric = Assert.Single(await ListKinds(family));
        Assert.Equal((true, RelationshipFamilySemantic.None), (symmetric.IsSymmetric, symmetric.FamilySemantic));
    }

    [Fact]
    public async Task A_family_meaning_LorEvolve_does_not_know_is_refused()
    {
        var family = await NewFamily(_factory, "famunknown");

        var refused = await PostKind(
            family.Client,
            family.Universe,
            new RelationshipTypeRequest("bore", "born to", false, null, null, null, (RelationshipFamilySemantic)7));

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("not a family meaning", await Errors(refused), StringComparison.OrdinalIgnoreCase);
        Assert.Empty(await ListKinds(family));
    }

    [Fact]
    public async Task Another_account_can_neither_configure_a_kind_nor_use_one()
    {
        var owner = await NewFamily(_factory, "famowner");
        var kind = await Kind(owner, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        var stranger = await NewFamily(_factory, "famstranger");

        // The owner's kind, through the owner's universe and through the stranger's, reads as absent either way.
        foreach (var universeId in new[] { owner.Universe, stranger.Universe })
        {
            var response = await stranger.Client.PutAsJsonAsync(
                $"{Kinds(universeId)}/{kind.Id}",
                new RelationshipTypeRequest("mine now", "mine", false, null, null, null, RelationshipFamilySemantic.AdoptiveParent));

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        // And it cannot describe a link in the stranger's own universe.
        var parent = await Person(stranger, "One");
        var child = await Person(stranger, "Two");
        var link = await PostLink(stranger, kind.Id, parent, child);

        Assert.Equal(HttpStatusCode.BadRequest, link.StatusCode);
        Assert.Contains("relationshipTypeId", await Errors(link), StringComparison.OrdinalIgnoreCase);

        Assert.Equal(RelationshipFamilySemantic.BiologicalParent, Assert.Single(await ListKinds(owner)).FamilySemantic);
    }

    private static async Task<RelationshipDetail> Detail(Family family, Guid relationshipId) =>
        (await family.Client.GetFromJsonAsync<RelationshipDetail>(
            $"/api/universes/{family.Universe}/relationships/{relationshipId}"))!;
}
