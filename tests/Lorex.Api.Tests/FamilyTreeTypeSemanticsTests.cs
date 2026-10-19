using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.FamilyTrees;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using static Lorex.Api.Tests.FamilyTreeTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Family Tree eligibility on entity types and family that defines no ancestry (ADR 0040).
///
/// Two invariants run through it. A type takes part in the Family Tree because its author said so - the starter Character is
/// seeded that way, nothing reads a name or an icon - and an entry already recorded in a family stays readable whatever its
/// type. And a non-structural family link ("uncle of", "married to") is listed as the authored link it is: it places nobody in
/// the ancestry, derives no relative, and closes no Canon circle.
/// </summary>
public sealed class FamilyTreeTypeSemanticsTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    // ---------- The type's capability ----------

    [Fact]
    public async Task A_new_universe_seeds_only_the_starter_character_as_family_tree_eligible()
    {
        var family = await NewFamily(_factory, "ftteligdefault");

        var types = await Types(family);

        Assert.Equal(
            [("Character", true), ("Concept", false), ("Event", false), ("Item", false), ("Location", false), ("Organization", false), ("Species", false)],
            types.OrderBy(type => type.Name, StringComparer.Ordinal).Select(type => (type.Name, type.FamilyTreeEligible)));
        Assert.Equal(
            ["Character"],
            EntityTypeDefaults.Defaults.Where(each => each.FamilyTree).Select(each => each.Name));
    }

    [Fact]
    public async Task A_custom_type_is_eligible_only_when_its_author_says_and_a_save_without_it_keeps_it()
    {
        var family = await NewFamily(_factory, "ftteligcustom");
        var route = $"/api/universes/{family.Universe}/entity-types";

        // The character icon and a person's name confer nothing.
        var person = await PostJson<EntityTypeResponse>(family.Client, route, new EntityTypeRequest("Person", null, "character", null, null));
        Assert.False(person.FamilyTreeEligible);

        var god = await PostJson<EntityTypeResponse>(family.Client, route, new EntityTypeRequest("God", null, null, null, null, true));
        Assert.True(god.FamilyTreeEligible);

        var enabled = await PutType(family, person.Id, new EntityTypeRequest("Person", null, "character", null, null, true));
        Assert.True(enabled.FamilyTreeEligible);

        // A client that predates the capability renames the type and leaves it exactly where it was.
        var renamed = await PutType(family, person.Id, new EntityTypeRequest("Mortal", null, "character", null, null));
        Assert.True(renamed.FamilyTreeEligible);

        var disabled = await PutType(family, person.Id, new EntityTypeRequest("Mortal", null, "character", null, null, false));
        Assert.False(disabled.FamilyTreeEligible);

        // And the starter Character can be turned off like any other.
        var character = await PutType(family, family.Character, new EntityTypeRequest("Character", null, "character", null, null, false));
        Assert.False(character.FamilyTreeEligible);
        Assert.Equal(["God"], (await Types(family)).Where(type => type.FamilyTreeEligible).Select(type => type.Name));
    }

    [Fact]
    public async Task The_family_tree_picker_offers_only_entries_of_eligible_types()
    {
        var family = await NewFamily(_factory, "ftteligpicker");
        var species = (await Types(family)).Single(type => type.Name == "Species").Id;

        var frodo = await Person(family, "Frodo Baggins");
        var bilbo = await Person(family, "Bilbo Baggins");
        var men = await Person(family, "Men", entityTypeId: species);
        var rivendell = await Person(family, "Rivendell", entityTypeId: family.Location);

        Assert.Equal([bilbo, frodo], await Listed(family, "familyTreeEligible=true"));
        Assert.Equal([bilbo, frodo], await Listed(family, "familyTreeEligible=true&search=baggins"));
        Assert.Empty(await Listed(family, "familyTreeEligible=true&search=men"));

        // The ordinary listing is untouched.
        Assert.Equal(
            new[] { bilbo, frodo, men, rivendell }.Order(),
            (await Listed(family, "familyTreeEligible=false")).Order());
    }

    [Fact]
    public async Task An_entry_already_in_a_family_stays_readable_whatever_its_type_and_is_not_offered_for_new_ones()
    {
        var family = await NewFamily(_factory, "ftteliglegacy");
        var species = (await Types(family)).Single(type => type.Name == "Species").Id;
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        var men = await Person(family, "Men", entityTypeId: species);
        var aragorn = await Person(family, "Aragorn");
        var elves = await Person(family, "Elves", entityTypeId: species);

        // Recorded before types carried eligibility: a species as a parent.
        await Link(family, bore, men, aragorn);

        var tree = await Tree(family, men);
        Assert.False(tree.Nodes.Single(node => node.EntityId == men).EntityTypeFamilyTreeEligible);
        Assert.True(tree.Nodes.Single(node => node.EntityId == aragorn).EntityTypeFamilyTreeEligible);
        Assert.Equal([aragorn], tree.Children.Select(child => child.EntityId));
        Assert.Equal([men], (await Tree(family, aragorn)).Parents.Select(parent => parent.EntityId));

        Assert.True((await Detail(family, men)).HasFamilyConnections);
        Assert.True((await Detail(family, aragorn)).HasFamilyConnections);
        Assert.False((await Detail(family, elves)).HasFamilyConnections);

        // Nothing about it makes its type, or its kin, eligible.
        Assert.Equal([aragorn], await Listed(family, "familyTreeEligible=true"));
        Assert.False((await Types(family)).Single(type => type.Id == species).FamilyTreeEligible);
    }

    // ---------- Family that defines no ancestry ----------

    [Fact]
    public async Task A_non_structural_family_meaning_persists_and_may_sit_on_a_symmetric_kind_where_a_parent_may_not()
    {
        var family = await NewFamily(_factory, "fttnsmeaning");

        var uncle = await Kind(family, "uncle of", RelationshipFamilySemantic.NonStructuralFamily, "nephew or niece of");
        Assert.Equal(RelationshipFamilySemantic.NonStructuralFamily, uncle.FamilySemantic);

        var married = await PostJson<RelationshipTypeResponse>(
            family.Client,
            Kinds(family.Universe),
            new RelationshipTypeRequest("married to", null, true, null, null, null, RelationshipFamilySemantic.NonStructuralFamily));
        Assert.Equal((true, RelationshipFamilySemantic.NonStructuralFamily), (married.IsSymmetric, married.FamilySemantic));

        var refused = await PostKind(
            family.Client,
            family.Universe,
            new RelationshipTypeRequest("co-parent", null, true, null, null, null, RelationshipFamilySemantic.BiologicalParent));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);

        // Kept by a save that leaves it out, and read back by name in the list.
        var renamed = await PutKind(family, uncle, familySemantic: null, name: "uncle to");
        renamed.EnsureSuccessStatusCode();
        Assert.Equal(
            RelationshipFamilySemantic.NonStructuralFamily,
            (await ListKinds(family)).Single(kind => kind.Id == uncle.Id).FamilySemantic);
    }

    [Fact]
    public async Task An_uncle_link_is_listed_in_both_readings_and_derives_no_relative()
    {
        var family = await NewFamily(_factory, "fttnsuncle");
        var uncle = await Kind(family, "uncle of", RelationshipFamilySemantic.NonStructuralFamily, "nephew or niece of");

        var bilbo = await Person(family, "Bilbo");
        var frodo = await Person(family, "Frodo");
        var link = await Link(family, uncle, bilbo, frodo);

        var fromBilbo = await Tree(family, bilbo);
        var connection = Assert.Single(fromBilbo.Connections);
        Assert.Equal((link, frodo, RelationshipPerspective.Forward, "uncle of"), (connection.RelationshipId, connection.RelatedEntityId, connection.Perspective, connection.Label));
        Assert.Contains(fromBilbo.Nodes, node => node.EntityId == frodo);

        var fromFrodo = await Tree(family, frodo);
        connection = Assert.Single(fromFrodo.Connections);
        Assert.Equal((bilbo, RelationshipPerspective.Inverse, "nephew or niece of"), (connection.RelatedEntityId, connection.Perspective, connection.Label));

        // No ancestry at all: no parent, sibling, grandparent, grandchild, drawn link or circle - for either of them.
        foreach (var tree in new[] { fromBilbo, fromFrodo })
        {
            Assert.Empty(tree.Parents);
            Assert.Empty(tree.Grandparents);
            Assert.Empty(tree.Siblings);
            Assert.Empty(tree.Children);
            Assert.Empty(tree.Grandchildren);
            Assert.Empty(tree.Links);
            Assert.Empty(tree.Loops);
        }
    }

    [Fact]
    public async Task Parent_links_still_derive_the_ancestry_beside_authored_family_and_the_two_never_mix()
    {
        var family = await NewFamily(_factory, "fttnsmixed");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var uncle = await Kind(family, "uncle of", RelationshipFamilySemantic.NonStructuralFamily, "nephew or niece of");

        var drogo = await Person(family, "Drogo");
        var primula = await Person(family, "Primula");
        var frodo = await Person(family, "Frodo");
        var bilbo = await Person(family, "Bilbo");
        var cousin = await Person(family, "Cousin");

        await Link(family, bore, drogo, frodo);
        await Link(family, bore, primula, frodo);
        await Link(family, uncle, bilbo, frodo);
        await Link(family, uncle, bilbo, cousin);

        var tree = await Tree(family, frodo);
        Assert.Equal(["Drogo", "Primula"], Names(tree, tree.Parents));
        Assert.Empty(tree.Siblings);
        Assert.All(tree.Links, one => Assert.True(one.Semantic.IsParent()));
        Assert.Equal(["Bilbo"], tree.Connections.Select(one => tree.Nodes.Single(node => node.EntityId == one.RelatedEntityId).Name));

        // Two nephews of one uncle are not siblings, and the uncle is not a parent of either.
        var fromBilbo = await Tree(family, bilbo);
        Assert.Empty(fromBilbo.Children);
        Assert.Equal(2, fromBilbo.Connections.Count);
        Assert.Empty((await Tree(family, cousin)).Siblings);
    }

    [Fact]
    public async Task A_symmetric_family_link_reads_the_same_from_both_sides()
    {
        var family = await NewFamily(_factory, "fttnsmarried");
        var married = await PostJson<RelationshipTypeResponse>(
            family.Client,
            Kinds(family.Universe),
            new RelationshipTypeRequest("married to", null, true, null, null, null, RelationshipFamilySemantic.NonStructuralFamily));

        var sam = await Person(family, "Samwise");
        var rosie = await Person(family, "Rosie");
        await Link(family, married, sam, rosie);

        Assert.Equal("married to", Assert.Single((await Tree(family, sam)).Connections).Label);
        Assert.Equal("married to", Assert.Single((await Tree(family, rosie)).Connections).Label);
    }

    [Fact]
    public async Task A_circle_of_non_structural_links_is_no_canon_finding_while_a_parent_circle_still_is()
    {
        var family = await NewFamily(_factory, "fttnscanon");
        var uncle = await Kind(family, "uncle of", RelationshipFamilySemantic.NonStructuralFamily, "nephew or niece of");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");

        var one = await Person(family, "One");
        var two = await Person(family, "Two");
        await Link(family, uncle, one, two);
        await Link(family, uncle, two, one);

        await Evaluate(family);
        Assert.Empty(await LoopFindings(family));
        Assert.Empty((await Tree(family, one)).Loops);

        await Link(family, bore, one, two);
        await Link(family, bore, two, one);

        var finding = Assert.Single(await LoopFindings(family));
        Assert.DoesNotContain("uncle", finding.Explanation, StringComparison.OrdinalIgnoreCase);
    }

    // ---------- Backup ----------

    [Fact]
    public async Task A_backup_carries_eligibility_and_the_new_meaning_by_name_and_a_restore_keeps_both()
    {
        var family = await NewFamily(_factory, "fttbackup");
        var route = $"/api/universes/{family.Universe}/entity-types";
        await PostJson<EntityTypeResponse>(family.Client, route, new EntityTypeRequest("God", null, null, null, null, true));
        await PutType(family, (await Types(family)).Single(type => type.Name == "Species").Id, new EntityTypeRequest("Species", "Kinds of living thing.", "species", "#2f8fa8", null, true));
        var uncle = await Kind(family, "uncle of", RelationshipFamilySemantic.NonStructuralFamily, "nephew or niece of");
        var bilbo = await Person(family, "Bilbo");
        var frodo = await Person(family, "Frodo");
        await Link(family, uncle, bilbo, frodo);

        var archive = await RawArchive(family.Client, family.Universe);
        var raw = DocumentText(archive);
        var backup = BackupOf(archive);

        Assert.Equal(23, backup.FormatVersion);
        Assert.Equal(
            ["Character", "God", "Species"],
            backup.Payload.EntityTypes.Where(type => type.FamilyTreeEligible).Select(type => type.Name).Order(StringComparer.Ordinal));
        using (var document = JsonDocument.Parse(raw))
        {
            Assert.Equal(
                "NonStructuralFamily",
                document.RootElement.GetProperty("payload").GetProperty("relationshipTypes")
                    .EnumerateArray().Single(kind => kind.GetProperty("name").GetString() == "uncle of")
                    .GetProperty("familySemantic").GetString());
        }

        var restored = await InUniverse(family.Client, (await RestoreArchive(family.Client, archive, "Restored ftt")).Id);
        Assert.Equal(
            ["Character", "God", "Species"],
            (await Types(restored)).Where(type => type.FamilyTreeEligible).Select(type => type.Name).Order(StringComparer.Ordinal));
        Assert.Equal(
            RelationshipFamilySemantic.NonStructuralFamily,
            (await ListKinds(restored)).Single(kind => kind.Name == "uncle of").FamilySemantic);

        var ids = EntityIds(BackupOf(await RawArchive(family.Client, restored.Universe)));
        Assert.Equal("nephew or niece of", Assert.Single((await Tree(restored, ids["Frodo"])).Connections).Label);
        Assert.Empty((await Tree(restored, ids["Frodo"])).Parents);
    }

    [Fact]
    public async Task A_version_17_backup_reads_eligibility_from_the_untouched_starter_only_and_may_not_carry_the_new_meaning()
    {
        var family = await NewFamily(_factory, "fttv17");
        var route = $"/api/universes/{family.Universe}/entity-types";
        await PostJson<EntityTypeResponse>(family.Client, route, new EntityTypeRequest("God", null, null, null, null, true));
        await PutType(family, family.Location, new EntityTypeRequest("Location", "Places, from a room to a continent.", "location", "#1f8f74", null, true));

        var current = await RawArchive(family.Client, family.Universe);
        var seventeen = Downgrade(current, 17);
        Assert.DoesNotContain("familyTreeEligible", DocumentOf(seventeen), StringComparison.Ordinal);

        // Even a version 17 file claiming eligibility is read as the migration would have read the row.
        var claiming = Rewrite(seventeen, root =>
        {
            foreach (var type in Payload(root)["entityTypes"]!.AsArray())
            {
                type!["familyTreeEligible"] = true;
            }
        });

        foreach (var file in new[] { seventeen, claiming })
        {
            var restored = await InUniverse(family.Client, (await RestoreArchive(family.Client, file, $"Restored v17 {Guid.NewGuid():n}")).Id);
            Assert.Equal(["Character"], (await Types(restored)).Where(type => type.FamilyTreeEligible).Select(type => type.Name));
        }

        // A version 17 Character the author had changed is theirs, and stays off.
        var edited = Rewrite(seventeen, root =>
        {
            var character = Payload(root)["entityTypes"]!.AsArray().Single(type => (string?)type!["name"] == "Character")!;
            character["description"] = "Hobbits, mostly.";
        });
        var editedWorld = await InUniverse(family.Client, (await RestoreArchive(family.Client, edited, "Restored v17 edited")).Id);
        Assert.DoesNotContain(await Types(editedWorld), type => type.FamilyTreeEligible);

        // A meaning version 17 could not hold was not written by Lorex, and is refused rather than read as anything.
        await Kind(family, "uncle of", RelationshipFamilySemantic.NonStructuralFamily, "nephew or niece of");
        var smuggled = Downgrade(await RawArchive(family.Client, family.Universe), 17);
        Assert.Contains("NonStructuralFamily", DocumentOf(smuggled), StringComparison.Ordinal);
        var refusal = await Refused(await Validate(family.Client, smuggled));
        Assert.Contains(refusal.Issues, issue => issue.Message.Contains("did not exist in format version 17", StringComparison.Ordinal));
    }

    // ---------- Ownership ----------

    [Fact]
    public async Task Another_account_can_neither_read_nor_change_eligibility_nor_filter_another_universe()
    {
        var owner = await NewFamily(_factory, "fttowner");
        var stranger = await NewFamily(_factory, "fttstranger");
        await Person(owner, "Frodo");

        var put = await stranger.Client.PutAsJsonAsync(
            $"/api/universes/{owner.Universe}/entity-types/{owner.Character}",
            new EntityTypeRequest("Character", null, "character", null, null, false));
        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);

        // Nor through its own universe's route with the other universe's type id.
        var crossed = await stranger.Client.PutAsJsonAsync(
            $"/api/universes/{stranger.Universe}/entity-types/{owner.Character}",
            new EntityTypeRequest("Character", null, "character", null, null, false));
        Assert.Equal(HttpStatusCode.NotFound, crossed.StatusCode);

        var listed = await stranger.Client.GetAsync($"/api/universes/{owner.Universe}/entities?familyTreeEligible=true");
        Assert.Equal(HttpStatusCode.NotFound, listed.StatusCode);
        Assert.DoesNotContain("Frodo", await listed.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var kind = await stranger.Client.PostAsJsonAsync(
            Kinds(owner.Universe),
            new RelationshipTypeRequest("uncle of", "nephew of", false, null, null, null, RelationshipFamilySemantic.NonStructuralFamily));
        Assert.Equal(HttpStatusCode.NotFound, kind.StatusCode);

        Assert.True((await Types(owner)).Single(type => type.Id == owner.Character).FamilyTreeEligible);
        Assert.Empty(await ListKinds(owner));
    }

    // ---------- Helpers ----------

    private static async Task<List<EntityTypeResponse>> Types(Family family) =>
        (await family.Client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{family.Universe}/entity-types"))!;

    private static async Task<EntityTypeResponse> PutType(Family family, Guid typeId, EntityTypeRequest request)
    {
        var response = await family.Client.PutAsJsonAsync($"/api/universes/{family.Universe}/entity-types/{typeId}", request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
    }

    private static async Task<EntityDetail> Detail(Family family, Guid entityId) =>
        (await family.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{family.Universe}/entities/{entityId}"))!;

    private static Dictionary<string, Guid> EntityIds(UniverseBackup backup) =>
        backup.Payload.Entities.ToDictionary(entity => entity.Name, entity => entity.Id);

    /// <summary>The ids a listing returns, by name.</summary>
    private static async Task<List<Guid>> Listed(Family family, string query)
    {
        var page = (await family.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{family.Universe}/entities?pageSize=50&{query}"))!;
        return [.. page.Items.OrderBy(item => item.Name, StringComparer.Ordinal).Select(item => item.Id)];
    }
}
