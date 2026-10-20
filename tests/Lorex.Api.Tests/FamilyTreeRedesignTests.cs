using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.FamilyTrees;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using static Lorex.Api.Tests.FamilyTreeTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Issue #37: every drawn member's authored family, and Family Tree eligibility through an enabled semantic group.
///
/// Two invariants run through it. Authored family ("brother of", "married to", "guardian of") is listed with the member it
/// touches, read from that member's side, and places nobody: it derives no parent, sibling or generation, and an ordinary
/// relationship is never family at all. And a group offers the tree only when its author enabled it for that - being in a
/// group, or a group's name, enables nothing - beside the types enabled one by one, which keep their meaning.
/// </summary>
public sealed class FamilyTreeRedesignTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    // ---------- Authored family in each member's details ----------

    [Fact]
    public async Task Every_drawn_member_carries_its_own_authored_family_and_nobody_is_placed_by_it()
    {
        var family = await NewFamily(_factory, "ftrdetails");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var married = await PostJson<RelationshipTypeResponse>(
            family.Client,
            Kinds(family.Universe),
            new RelationshipTypeRequest("married to", null, true, null, null, null, RelationshipFamilySemantic.NonStructuralFamily));
        var brother = await Kind(family, "brother of", RelationshipFamilySemantic.NonStructuralFamily, "brother or sister of");
        var guardian = await Kind(family, "guardian of", RelationshipFamilySemantic.NonStructuralFamily, "ward of");
        var rival = await Kind(family, "rival of", null, "rival of, the other way");

        var mara = await Person(family, "Mara");
        var lia = await Person(family, "Lia");
        var oren = await Person(family, "Oren");
        var tam = await Person(family, "Tam");
        var wen = await Person(family, "Wen");
        var rook = await Person(family, "Rook");

        await Link(family, bore, mara, lia);
        await Link(family, married, mara, oren);
        await Link(family, brother, tam, lia);
        await Link(family, guardian, wen, lia);
        await Link(family, rival, rook, mara);

        var tree = await Tree(family, lia);

        // The ancestry is the one parent link, exactly as before: a spouse is no parent, a brother no sibling, a guardian nothing.
        Assert.Equal(["Mara"], Names(tree, tree.Parents));
        Assert.Empty(tree.Siblings);
        Assert.Empty(tree.Grandparents);
        Assert.Empty(tree.Children);
        Assert.Empty(tree.Grandchildren);
        Assert.All(tree.Links, link => Assert.True(link.Semantic.IsParent()));
        Assert.Single(tree.Links);

        // Each member's own, from its own side: the focal entry's first, then by member.
        Assert.Equal(
            ["Lia brother or sister of Tam", "Lia ward of Wen", "Mara married to Oren"],
            Connections(tree));

        // The relatives they name are known by name, without being drawn; the rival is in no part of the tree.
        Assert.Contains(tree.Nodes, node => node.EntityId == oren);
        Assert.Contains(tree.Nodes, node => node.EntityId == tam);
        Assert.Contains(tree.Nodes, node => node.EntityId == wen);
        Assert.DoesNotContain(tree.Nodes, node => node.EntityId == rook);
        Assert.DoesNotContain("rival", await TreeText(family, lia), StringComparison.Ordinal);

        // From the brother's own tree: still no parent and no sibling, only the link he was given.
        var fromTam = await Tree(family, tam);
        Assert.Empty(fromTam.Parents);
        Assert.Empty(fromTam.Siblings);
        Assert.Equal(["Tam brother of Lia"], Connections(fromTam));
    }

    [Fact]
    public async Task A_link_between_two_drawn_members_is_listed_from_each_side()
    {
        var family = await NewFamily(_factory, "ftrbothsides");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var brother = await Kind(family, "brother of", RelationshipFamilySemantic.NonStructuralFamily, "brother or sister of");

        var mara = await Person(family, "Mara");
        var lia = await Person(family, "Lia");
        var tam = await Person(family, "Tam");
        await Link(family, bore, mara, lia);
        await Link(family, bore, mara, tam);
        await Link(family, brother, tam, lia);

        var tree = await Tree(family, lia);

        // The sibling comes from the shared parent; the authored link adds no second path and no other relative.
        var sibling = Assert.Single(tree.Siblings);
        Assert.Equal(tam, sibling.EntityId);
        Assert.Single(sibling.Paths);
        Assert.Equal(["Lia brother or sister of Tam", "Tam brother of Lia"], Connections(tree));
    }

    // ---------- Eligibility through a group ----------

    [Fact]
    public async Task Being_in_a_group_enables_nothing_and_starter_groups_start_off()
    {
        var family = await NewFamily(_factory, "ftrgroupoff");

        Assert.NotEmpty(await Groups(family));
        Assert.All(await Groups(family), group => Assert.False(group.FamilyTreeEnabled));
        Assert.Equal(["Character"], (await Types(family)).Where(type => type.FamilyTreeOffered).Select(type => type.Name));

        // A type in groups called Family and Characters is offered nothing by those names.
        var elf = await NewType(family, "Elf", [new(null, "Family"), new(null, "People")]);
        var characters = (await Groups(family)).Single(group => group.Name == "Characters");
        await PutType(family, elf.Id, new EntityTypeRequest("Elf", null, null, null, null, Groups: [new(characters.Id), .. (await GroupIdsOf(family, elf.Id)).Select(id => new EntityTypeGroupChoice(id))]));
        var legolas = await Person(family, "Legolas", entityTypeId: elf.Id);

        var listed = await TypeOf(family, elf.Id);
        Assert.False(listed.FamilyTreeEligible);
        Assert.False(listed.FamilyTreeOffered);
        Assert.DoesNotContain(legolas, await Picker(family));
        Assert.False((await Tree(family, legolas)).Nodes.Single(node => node.EntityId == legolas).EntityTypeFamilyTreeEligible);
    }

    [Fact]
    public async Task An_enabled_group_offers_the_tree_for_its_types_and_turning_it_off_takes_only_that_back()
    {
        var family = await NewFamily(_factory, "ftrgroupon");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var elf = await NewType(family, "Elf", [new(null, "People")]);
        var people = (await Groups(family)).Single(group => group.Name == "People");
        var thranduil = await Person(family, "Thranduil", entityTypeId: elf.Id);
        var legolas = await Person(family, "Legolas", entityTypeId: elf.Id);
        var link = await Link(family, bore, thranduil, legolas);

        Assert.Empty(await FamiliesFocused(family));

        var enabled = await SetFamilyTree(family, people.Id, true);
        Assert.True(enabled.FamilyTreeEnabled);
        Assert.Equal(people.Name, enabled.Name);

        // Offered everywhere the tree is offered, and the type's own switch is left as it was.
        var listed = await TypeOf(family, elf.Id);
        Assert.False(listed.FamilyTreeEligible);
        Assert.True(listed.FamilyTreeOffered);
        Assert.Equal(new[] { legolas, thranduil }.Order(), (await Picker(family)).Where(id => id == legolas || id == thranduil).Order());
        Assert.True((await Tree(family, legolas)).Nodes.All(node => node.EntityTypeFamilyTreeEligible));
        Assert.Single(await FamiliesFocused(family));

        // Off again: offered nowhere, and the recorded family is exactly what it was.
        Assert.False((await SetFamilyTree(family, people.Id, false)).FamilyTreeEnabled);
        Assert.False((await TypeOf(family, elf.Id)).FamilyTreeOffered);
        Assert.DoesNotContain(legolas, await Picker(family));
        Assert.Empty(await FamiliesFocused(family));
        var tree = await Tree(family, legolas);
        Assert.Equal(["Thranduil"], Names(tree, tree.Parents));
        Assert.Equal(link, Assert.Single(tree.Links).RelationshipId);
        Assert.False(tree.Nodes.Single(node => node.EntityId == legolas).EntityTypeFamilyTreeEligible);
    }

    [Fact]
    public async Task A_type_enabled_itself_and_through_several_groups_is_offered_once()
    {
        var family = await NewFamily(_factory, "ftrgroupdupes");
        var elf = await NewType(family, "Elf", [new(null, "Kin"), new(null, "Folk")]);
        await PutType(family, family.Character, new EntityTypeRequest("Character", null, "character", null, null, Groups: [.. (await Groups(family)).Where(group => group.Name is "Kin" or "Folk" or "Characters").Select(group => new EntityTypeGroupChoice(group.Id))]));
        foreach (var group in (await Groups(family)).Where(group => group.Name is "Kin" or "Folk" or "Characters"))
        {
            await SetFamilyTree(family, group.Id, true);
        }

        var frodo = await Person(family, "Frodo");
        var legolas = await Person(family, "Legolas", entityTypeId: elf.Id);

        var page = (await family.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{family.Universe}/entities?familyTreeEligible=true&pageSize=50"))!;
        Assert.Equal(2, page.TotalCount);
        Assert.Equal(new[] { frodo, legolas }.Order(), page.Items.Select(item => item.Id).Order());
        Assert.Equal(["Character", "Elf"], (await Types(family)).Where(type => type.FamilyTreeOffered).Select(type => type.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Renaming_an_enabled_group_keeps_it_and_deleting_it_is_refused_until_it_is_turned_off()
    {
        var family = await NewFamily(_factory, "ftrgrouprename");
        var elf = await NewType(family, "Elf", [new(null, "People")]);
        var people = (await Groups(family)).Single(group => group.Name == "People");
        await SetFamilyTree(family, people.Id, true);

        var renamed = await family.Client.PutAsJsonAsync($"{GroupsRoute(family)}/{people.Id}", new EntityTypeGroupRenameRequest("Folk"));
        renamed.EnsureSuccessStatusCode();
        var folk = (await renamed.Content.ReadFromJsonAsync<EntityTypeGroupResponse>())!;
        Assert.Equal((people.Id, "Folk", true), (folk.Id, folk.Name, folk.FamilyTreeEnabled));
        Assert.True((await TypeOf(family, elf.Id)).FamilyTreeOffered);

        var refused = await family.Client.DeleteAsync($"{GroupsRoute(family)}/{people.Id}");
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        using (var problem = JsonDocument.Parse(await refused.Content.ReadAsStringAsync()))
        {
            Assert.Equal(EntityTypeGroupEndpoints.GroupFamilyTreeCode, problem.RootElement.GetProperty("code").GetString());
            Assert.Contains("Folk", problem.RootElement.GetProperty("detail").GetString(), StringComparison.Ordinal);
        }

        Assert.Contains(await Groups(family), group => group.Id == people.Id && group.FamilyTreeEnabled);
        Assert.True((await TypeOf(family, elf.Id)).FamilyTreeOffered);

        await SetFamilyTree(family, people.Id, false);
        Assert.Equal(HttpStatusCode.NoContent, (await family.Client.DeleteAsync($"{GroupsRoute(family)}/{people.Id}")).StatusCode);
        Assert.DoesNotContain(await Groups(family), group => group.Id == people.Id);
    }

    [Fact]
    public async Task A_type_leaving_an_enabled_group_is_no_longer_offered_and_keeps_its_recorded_family()
    {
        var family = await NewFamily(_factory, "ftrgroupleave");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var elf = await NewType(family, "Elf", [new(null, "People")]);
        var people = (await Groups(family)).Single(group => group.Name == "People");
        await SetFamilyTree(family, people.Id, true);
        var thranduil = await Person(family, "Thranduil", entityTypeId: elf.Id);
        var legolas = await Person(family, "Legolas", entityTypeId: elf.Id);
        await Link(family, bore, thranduil, legolas);
        Assert.Contains(legolas, await Picker(family));

        await PutType(family, elf.Id, new EntityTypeRequest("Elf", null, null, null, null, Groups: []));

        // An enabled group with nobody in it offers nothing, and is no error.
        Assert.Empty((await Groups(family)).Single(group => group.Id == people.Id).TypeIds);
        Assert.True((await Groups(family)).Single(group => group.Id == people.Id).FamilyTreeEnabled);
        Assert.False((await TypeOf(family, elf.Id)).FamilyTreeOffered);
        Assert.DoesNotContain(legolas, await Picker(family));

        var tree = await Tree(family, legolas);
        Assert.Equal(["Thranduil"], Names(tree, tree.Parents));
        Assert.False(tree.Nodes.Single(node => node.EntityId == legolas).EntityTypeFamilyTreeEligible);
    }

    // ---------- Who may change it ----------

    [Fact]
    public async Task Only_editors_enable_a_group_and_only_in_their_own_universe()
    {
        var w = await CollaborationTestClient.NewSharedWorld(_factory, "ftr-roles");
        var groups = $"/api/universes/{w.U}/entity-type-groups";
        var characters = (await w.Owner.GetFromJsonAsync<List<EntityTypeGroupResponse>>(groups))!.Single(group => group.Name == "Characters");
        var route = $"{groups}/{characters.Id}/family-tree";

        foreach (var who in new[] { Who.Reviewer, Who.Viewer })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await w.Client(who).PutAsJsonAsync(route, new EntityTypeGroupFamilyTreeRequest(true))).StatusCode);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await w.Outsider.PutAsJsonAsync(route, new EntityTypeGroupFamilyTreeRequest(true))).StatusCode);
        Assert.False((await w.Owner.GetFromJsonAsync<List<EntityTypeGroupResponse>>(groups))!.Single(group => group.Id == characters.Id).FamilyTreeEnabled);

        Assert.Equal(HttpStatusCode.BadRequest, (await w.Editor.PutAsJsonAsync(route, new { })).StatusCode);
        Assert.True((await w.Editor.PutAsJsonAsync(route, new EntityTypeGroupFamilyTreeRequest(true))).IsSuccessStatusCode);
        Assert.True((await w.Owner.GetFromJsonAsync<List<EntityTypeGroupResponse>>(groups))!.Single(group => group.Id == characters.Id).FamilyTreeEnabled);

        // Another universe's group, through a universe the caller owns, is not found and stays as it was.
        var stranger = await NewFamily(_factory, "ftr-stranger");
        var crossed = await stranger.Client.PutAsJsonAsync(
            $"/api/universes/{stranger.Universe}/entity-type-groups/{characters.Id}/family-tree",
            new EntityTypeGroupFamilyTreeRequest(false));
        Assert.Equal(HttpStatusCode.NotFound, crossed.StatusCode);
        Assert.True((await w.Owner.GetFromJsonAsync<List<EntityTypeGroupResponse>>(groups))!.Single(group => group.Id == characters.Id).FamilyTreeEnabled);
    }

    // ---------- Backup ----------

    [Fact]
    public async Task A_backup_carries_an_enabled_group_and_a_restore_keeps_it_under_the_new_id()
    {
        var family = await NewFamily(_factory, "ftrbackup");
        await NewType(family, "Elf", [new(null, "People")]);
        var people = (await Groups(family)).Single(group => group.Name == "People");
        await SetFamilyTree(family, people.Id, true);

        var archive = await RawArchive(family.Client, family.Universe);
        var backup = BackupOf(archive);
        Assert.Equal(24, backup.FormatVersion);
        Assert.Equal(
            ["People"],
            backup.Payload.EntityTypeGroups!.Where(group => group.FamilyTreeEnabled).Select(group => group.Name));

        foreach (var name in new[] { "ftrbackup one", "ftrbackup two" })
        {
            var restored = await InUniverse(family.Client, (await RestoreArchive(family.Client, archive, name)).Id);
            var groups = await Groups(restored);
            var restoredPeople = groups.Single(group => group.Name == "People");
            Assert.NotEqual(people.Id, restoredPeople.Id);
            Assert.Equal(["People"], groups.Where(group => group.FamilyTreeEnabled).Select(group => group.Name));
            Assert.Equal(
                ["Character", "Elf"],
                (await Types(restored)).Where(type => type.FamilyTreeOffered).Select(type => type.Name).Order(StringComparer.Ordinal));
            Assert.False((await Types(restored)).Single(type => type.Name == "Elf").FamilyTreeEligible);
        }
    }

    [Fact]
    public async Task A_version_23_backup_enables_no_group_even_when_it_says_one_is()
    {
        var family = await NewFamily(_factory, "ftrv23");
        await NewType(family, "Elf", [new(null, "People")]);
        await SetFamilyTree(family, (await Groups(family)).Single(group => group.Name == "People").Id, true);

        var twentyThree = Downgrade(await RawArchive(family.Client, family.Universe), 23);
        Assert.DoesNotContain("familyTreeEnabled", DocumentOf(twentyThree), StringComparison.Ordinal);
        var claiming = Rewrite(twentyThree, root =>
        {
            foreach (var group in Payload(root)["entityTypeGroups"]!.AsArray())
            {
                group!["familyTreeEnabled"] = true;
            }
        });

        foreach (var file in new[] { twentyThree, claiming })
        {
            var restored = await InUniverse(family.Client, (await RestoreArchive(family.Client, file, $"Restored v23 {Guid.NewGuid():n}")).Id);
            Assert.Contains(await Groups(restored), group => group.Name == "People");
            Assert.All(await Groups(restored), group => Assert.False(group.FamilyTreeEnabled));
            Assert.Equal(["Character"], (await Types(restored)).Where(type => type.FamilyTreeOffered).Select(type => type.Name));
        }
    }

    // ---------- Helpers ----------

    /// <summary>Each authored family link as "member label related", in the order the API put them.</summary>
    private static List<string> Connections(FamilyTreeResponse tree)
    {
        var names = tree.Nodes.ToDictionary(node => node.EntityId, node => node.Name);
        return [.. tree.Connections.Select(connection => $"{names[connection.EntityId]} {connection.Label} {names[connection.RelatedEntityId]}")];
    }

    private static string GroupsRoute(Family family) => $"/api/universes/{family.Universe}/entity-type-groups";

    private static async Task<List<EntityTypeGroupResponse>> Groups(Family family) =>
        (await family.Client.GetFromJsonAsync<List<EntityTypeGroupResponse>>(GroupsRoute(family)))!;

    private static async Task<List<Guid>> GroupIdsOf(Family family, Guid typeId) =>
        [.. (await Groups(family)).Where(group => group.TypeIds.Contains(typeId)).Select(group => group.Id)];

    private static async Task<EntityTypeGroupResponse> SetFamilyTree(Family family, Guid groupId, bool enabled)
    {
        var response = await family.Client.PutAsJsonAsync($"{GroupsRoute(family)}/{groupId}/family-tree", new EntityTypeGroupFamilyTreeRequest(enabled));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeGroupResponse>())!;
    }

    private static async Task<List<EntityTypeResponse>> Types(Family family) =>
        (await family.Client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{family.Universe}/entity-types"))!;

    private static async Task<EntityTypeResponse> TypeOf(Family family, Guid typeId) =>
        (await Types(family)).Single(type => type.Id == typeId);

    private static Task<EntityTypeResponse> NewType(Family family, string name, IReadOnlyList<EntityTypeGroupChoice> groups) =>
        PostJson<EntityTypeResponse>(
            family.Client,
            $"/api/universes/{family.Universe}/entity-types",
            new EntityTypeRequest(name, null, null, null, null, Groups: groups));

    private static async Task PutType(Family family, Guid typeId, EntityTypeRequest request) =>
        (await family.Client.PutAsJsonAsync($"/api/universes/{family.Universe}/entity-types/{typeId}", request)).EnsureSuccessStatusCode();

    /// <summary>The ids the Family Tree's picker offers.</summary>
    private static async Task<List<Guid>> Picker(Family family) =>
        [.. (await family.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{family.Universe}/entities?familyTreeEligible=true&pageSize=50"))!.Items.Select(item => item.Id)];

    /// <summary>The members the families listing opens its families at.</summary>
    private static async Task<List<Guid>> FamiliesFocused(Family family) =>
        [.. (await family.Client.GetFromJsonAsync<FamilyDiscoveryPage>($"/api/universes/{family.Universe}/family-tree/families"))!.Items.Select(item => item.FocusEntityId)];
}
