using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.FamilyTrees;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Universes;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.FamilyTreeTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Family discovery (ADR 0035 amendment, 035): the families a universe already holds, worked out from its family links on every
/// request. A family is a connected group of live entries joined by links whose kind has a family meaning, read without
/// direction; it is offered when one of its members can open the tree, it counts every member, and nothing about it is stored.
/// </summary>
public sealed class FamilyDiscoveryTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- What makes a family ----------

    [Fact]
    public async Task Parent_links_of_either_kind_and_non_structural_links_each_make_a_family_and_mixed_they_make_one()
    {
        var family = await NewFamily(_factory, "fdkinds");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var raised = await Kind(family, "raised", RelationshipFamilySemantic.AdoptiveParent);
        var wed = await Kind(family, "wed", RelationshipFamilySemantic.NonStructuralFamily);

        // Three separate pairs, one per meaning.
        await Link(family, bore, await Person(family, "Abel"), await Person(family, "Bryn"));
        await Link(family, raised, await Person(family, "Cora"), await Person(family, "Dace"));
        await Link(family, wed, await Person(family, "Elin"), await Person(family, "Fane"));

        var page = await Families(family);
        Assert.Equal(3, page.TotalCount);
        Assert.Equal(["Abel Bryn", "Cora Dace", "Elin Fane"], Previews(page));
        Assert.All(page.Items, item => Assert.Equal(2, item.MemberCount));

        // One link of each meaning, joined through shared members, is one family.
        var mixed = await NewFamily(_factory, "fdmixed");
        bore = await Kind(mixed, "bore", RelationshipFamilySemantic.BiologicalParent);
        raised = await Kind(mixed, "raised", RelationshipFamilySemantic.AdoptiveParent);
        wed = await Kind(mixed, "wed", RelationshipFamilySemantic.NonStructuralFamily);
        var mara = await Person(mixed, "Mara");
        var oren = await Person(mixed, "Oren");
        var lia = await Person(mixed, "Lia");
        var tam = await Person(mixed, "Tam");
        await Link(mixed, wed, mara, oren);
        await Link(mixed, bore, mara, lia);
        await Link(mixed, raised, tam, lia);

        var one = Assert.Single((await Families(mixed)).Items);
        Assert.Equal(4, one.MemberCount);
    }

    [Fact]
    public async Task Only_the_family_meaning_counts_never_the_kind_s_name()
    {
        var family = await NewFamily(_factory, "fdnames");

        // Called a parent, given no family meaning: nothing.
        var mother = await Kind(family, "mother of", RelationshipFamilySemantic.None);
        await Link(family, mother, await Person(family, "Gale"), await Person(family, "Hale"));

        // Called anything at all, given one: a family.
        var odd = await Kind(family, "keeps the lamp for", RelationshipFamilySemantic.NonStructuralFamily);
        await Link(family, odd, await Person(family, "Iver"), await Person(family, "Jory"));

        Assert.Equal(["Iver Jory"], Previews(await Families(family)));
    }

    [Fact]
    public async Task Separate_groups_are_separate_families_and_a_link_that_joins_them_makes_one()
    {
        var family = await NewFamily(_factory, "fdjoin");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var wed = await Kind(family, "wed", RelationshipFamilySemantic.NonStructuralFamily);
        var a = await Person(family, "Ada");
        var b = await Person(family, "Bea");
        var c = await Person(family, "Cid");
        var d = await Person(family, "Dov");
        await Link(family, bore, a, b);
        await Link(family, wed, c, d);

        Assert.Equal(2, (await Families(family)).TotalCount);

        // Cid marries into Ada's line through Bea: all four are one family now.
        await Link(family, wed, b, c);
        var one = Assert.Single((await Families(family)).Items);
        Assert.Equal(4, one.MemberCount);
    }

    [Fact]
    public async Task A_circle_ends_and_is_one_family()
    {
        var family = await NewFamily(_factory, "fdcircle");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var a = await Person(family, "Ash");
        var b = await Person(family, "Birch");
        var c = await Person(family, "Cedar");
        await Link(family, bore, a, b);
        await Link(family, bore, b, c);
        await Link(family, bore, c, a);

        var one = Assert.Single((await Families(family)).Items);
        Assert.Equal(3, one.MemberCount);
    }

    [Fact]
    public void Grouping_ignores_a_link_to_oneself_counts_a_link_written_twice_once_and_ends_on_a_circle()
    {
        Guid[] p = [Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()];
        var members = new[]
        {
            new FamilyDiscovery.Member(p[0], "Solo", true),
            new FamilyDiscovery.Member(p[1], "Twin", true),
            new FamilyDiscovery.Member(p[2], "Pair", true),
            new FamilyDiscovery.Member(p[3], "Loop", true),
        };

        // A link to oneself alone is no family.
        Assert.Empty(FamilyDiscovery.Families([new(p[0], p[0])], members, null));

        // The same pair linked three times, both ways, and round in a circle: one family of three, each counted once.
        var family = Assert.Single(FamilyDiscovery.Families(
            [new(p[1], p[2]), new(p[1], p[2]), new(p[2], p[1]), new(p[2], p[3]), new(p[3], p[1]), new(p[0], p[0])],
            members,
            null));
        Assert.Equal(3, family.MemberCount);
        Assert.Equal(3, family.PreviewMembers.Select(member => member.EntityId).Distinct().Count());
    }

    // ---------- Live data ----------

    [Fact]
    public async Task The_Trash_takes_a_member_out_and_breaks_the_bridge_it_was_and_another_universe_never_joins()
    {
        var family = await NewFamily(_factory, "fdtrash");
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent);
        var a = await Person(family, "Ava");
        var bridge = await Person(family, "Bridge");
        var c = await Person(family, "Cleo");
        var d = await Person(family, "Dara");
        await Link(family, bore, a, bridge);
        await Link(family, bore, bridge, c);
        await Link(family, bore, c, d);
        Assert.Equal(4, Assert.Single((await Families(family)).Items).MemberCount);

        // In the Trash, the bridge is nobody's family: Ava is left alone, Cleo and Dara are their own family.
        await Trash(family, bridge);
        var split = await Families(family);
        Assert.Equal(["Cleo Dara"], Previews(split));
        Assert.DoesNotContain(split.Items.SelectMany(item => item.PreviewMembers), member => member.EntityId == bridge);

        // Back from the Trash, back in the family.
        await Restore(family, bridge);
        Assert.Equal(4, Assert.Single((await Families(family)).Items).MemberCount);

        // Gone for good, it is gone from discovery as well.
        await Trash(family, bridge);
        (await family.Client.DeleteAsync($"/api/universes/{family.Universe}/trash/{bridge}")).EnsureSuccessStatusCode();
        Assert.Equal(["Cleo Dara"], Previews(await Families(family)));

        // The same account's other universe, with families of its own, adds nothing here and takes nothing from it.
        var other = await InUniverse(family.Client, (await PublishingTestClient.CreateUniverse(family.Client, "fdtrash elsewhere")).Id);
        var otherBore = await Kind(other, "bore", RelationshipFamilySemantic.BiologicalParent);
        await Link(other, otherBore, await Person(other, "Elsewhere One"), await Person(other, "Elsewhere Two"));
        Assert.Equal(["Cleo Dara"], Previews(await Families(family)));
        Assert.Equal(["Elsewhere One Elsewhere Two"], Previews(await Families(other)));
    }

    // ---------- Who opens it ----------

    [Fact]
    public async Task A_family_needs_one_member_who_can_open_the_tree_and_every_member_counts()
    {
        var family = await NewFamily(_factory, "fdeligible");
        var wed = await Kind(family, "wed", RelationshipFamilySemantic.NonStructuralFamily);

        // A person and a place joined as family: the place's type is not enabled, but it is still a member.
        var keeper = await Person(family, "Keeper");
        var tower = await Person(family, "Tower", entityTypeId: family.Location);
        await Link(family, wed, keeper, tower);

        // Two places only: nobody can open a tree on it, so it is not offered.
        await Link(family, wed, await Person(family, "Harbour", entityTypeId: family.Location), await Person(family, "Quay", entityTypeId: family.Location));

        var only = Assert.Single((await Families(family)).Items);
        Assert.Equal(keeper, only.FocusEntityId);
        Assert.Equal(2, only.MemberCount);
        Assert.Equal(["Keeper", "Tower"], only.PreviewMembers.Select(member => member.Name));
    }

    [Fact]
    public async Task The_tree_opens_on_the_member_with_the_most_family_links_and_a_tie_goes_by_name()
    {
        var family = await NewFamily(_factory, "fdfocus");
        var household = await Build(family);

        // Lia and Mara each have three family links (Mara, Oren, Cai / Nana, Lia, Tam); Lia is first by name. The preview
        // starts with her, then the others by name.
        var item = Assert.Single((await Families(family)).Items);
        Assert.Equal(household.Lia, item.FocusEntityId);
        Assert.Equal(7, item.MemberCount);
        Assert.Equal(["Lia", "Cai", "Mara"], item.PreviewMembers.Select(member => member.Name));

        // One more link for Mara, and she is the member the tree opens on.
        await Link(family, household.Bore, household.Mara, await Person(family, "Wren"));
        var refocused = Assert.Single((await Families(family)).Items);
        Assert.Equal(household.Mara, refocused.FocusEntityId);
        Assert.Equal(8, refocused.MemberCount);

        // The same links answer the same way every time.
        var again = Assert.Single((await Families(family)).Items);
        Assert.Equal(refocused.FocusEntityId, again.FocusEntityId);
        Assert.Equal(refocused.PreviewMembers, again.PreviewMembers);
    }

    // ---------- Search ----------

    [Fact]
    public async Task Any_member_s_name_finds_its_family_once_and_shows_who_matched()
    {
        var family = await NewFamily(_factory, "fdsearch");
        await Build(family);
        var bore = await Kind(family, "bore again", RelationshipFamilySemantic.BiologicalParent);
        await Link(family, bore, await Person(family, "Liam"), await Person(family, "Quill"));

        // Pip is a grandchild nowhere near the preview of Mara's family; finding the family by him names him.
        var byPip = Assert.Single((await Families(family, "pip")).Items);
        Assert.Equal(7, byPip.MemberCount);
        Assert.Contains("Pip", byPip.PreviewMembers.Select(member => member.Name));

        // Another of its members finds the same family, and it is still one item.
        Assert.Equal(byPip.FocusEntityId, Assert.Single((await Families(family, "Nana")).Items).FocusEntityId);

        // "li" is in Lia, and in Liam: two families, the exact-or-prefix ones before a mere contains, each once.
        var byLi = await Families(family, "  LI ");
        Assert.Equal(2, byLi.TotalCount);
        Assert.Equal(2, byLi.Items.Select(item => item.FocusEntityId).Distinct().Count());

        // "Liam" is exactly Liam: his family first.
        Assert.Equal(["Liam Quill"], Previews(await Families(family, "Liam")));

        Assert.Equal(0, (await Families(family, "nobody called this")).TotalCount);
        Assert.Empty((await Families(family, "nobody called this")).Items);
    }

    // ---------- Pages ----------

    [Fact]
    public async Task Families_come_in_pages_counted_before_paging_and_a_search_narrows_before_the_page()
    {
        var family = await NewFamily(_factory, "fdpages");
        var wed = await Kind(family, "wed", RelationshipFamilySemantic.NonStructuralFamily);
        for (var index = 1; index <= 14; index++)
        {
            await Link(family, wed, await Person(family, $"Pair {index:D2} A"), await Person(family, $"Pair {index:D2} B"));
        }

        var first = await Families(family);
        Assert.Equal((1, 12, 14, 2), (first.Page, first.PageSize, first.TotalCount, first.TotalPages));
        Assert.Equal(12, first.Items.Count);
        Assert.Equal("Pair 01 A", first.Items[0].PreviewMembers[0].Name);

        var second = await Families(family, page: 2);
        Assert.Equal(["Pair 13 A Pair 13 B", "Pair 14 A Pair 14 B"], Previews(second));

        // The search is over every family, not the page already read.
        var found = await Families(family, "Pair 14 B");
        Assert.Equal(["Pair 14 A Pair 14 B"], Previews(found));
        Assert.Equal(1, found.TotalPages);

        // Out of range: clamped as every page in LorEvolve is, never refused.
        var clamped = await Families(family, page: 0, pageSize: 500);
        Assert.Equal((1, FamilyDiscovery.MaxPageSize, 14), (clamped.Page, clamped.PageSize, clamped.Items.Count));
        Assert.Equal(1, (await Families(family, pageSize: -3)).PageSize);
        Assert.Empty((await Families(family, page: 9)).Items);
    }

    // ---------- Access ----------

    [Fact]
    public async Task Every_role_reads_the_families_and_an_outsider_finds_no_universe()
    {
        var (owner, _) = await PublishingTestClient.Account(_factory, "fdaccess-owner");
        var universe = await PublishingTestClient.CreateUniverse(owner, "fdaccess");
        var family = await InUniverse(owner, universe.Id);
        await Build(family);

        var expected = await Families(family);

        foreach (var role in new[] { UniverseRole.Editor, UniverseRole.Reviewer, UniverseRole.Viewer })
        {
            var (member, memberId) = await PublishingTestClient.Account(_factory, $"fdaccess-{role}");
            await Join(_factory, universe.Id, memberId, role);
            var read = (await member.GetFromJsonAsync<FamilyDiscoveryPage>(Route(universe.Id)))!;
            Assert.Equal(Previews(expected), Previews(read));
        }

        var (outsider, _) = await PublishingTestClient.Account(_factory, "fdaccess-outsider");
        var refused = await outsider.GetAsync(Route(universe.Id) + "?q=Mara");
        Assert.Equal(HttpStatusCode.NotFound, refused.StatusCode);
        Assert.DoesNotContain("Mara", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        Assert.Equal(HttpStatusCode.Unauthorized, (await PublishingTestClient.Anonymous(_factory).GetAsync(Route(universe.Id))).StatusCode);
    }

    // ---------- Cost ----------

    [Fact]
    public async Task Three_queries_answer_one_family_or_fifty_and_a_large_one_and_the_answer_stays_one_page()
    {
        var few = await NewFamily(_factory, "fdcost-one");
        var fewKind = await Kind(few, "wed", RelationshipFamilySemantic.NonStructuralFamily);
        await Link(few, fewKind, await Person(few, "Only A"), await Person(few, "Only B"));

        var many = await NewFamily(_factory, "fdcost-many");
        var manyKind = await Kind(many, "wed", RelationshipFamilySemantic.NonStructuralFamily);
        var bore = await Kind(many, "bore", RelationshipFamilySemantic.BiologicalParent);
        for (var index = 1; index <= 49; index++)
        {
            await Link(many, manyKind, await Person(many, $"Pair {index:D2} A"), await Person(many, $"Pair {index:D2} B"));
        }

        // And one large family: a line of twenty generations with a spouse at every step.
        var line = await Person(many, "Line 00");
        for (var generation = 1; generation <= 20; generation++)
        {
            var child = await Person(many, $"Line {generation:D2}");
            await Link(many, bore, line, child);
            await Link(many, manyKind, child, await Person(many, $"Spouse {generation:D2}"));
            line = child;
        }

        var (oneQueries, onePage) = await CommandCounter.CountAsync([few.Universe], () => Families(few));
        var (manyQueries, manyPage) = await CommandCounter.CountAsync([many.Universe], () => Families(many));
        var (searchQueries, _) = await CommandCounter.CountAsync([many.Universe], () => Families(many, "Spouse 20"));

        Assert.Equal(1, onePage.TotalCount);
        Assert.Equal(50, manyPage.TotalCount);
        Assert.Equal(12, manyPage.Items.Count);
        Assert.Equal(41, Assert.Single((await Families(many, "Line 07")).Items).MemberCount);

        Assert.Equal(3, oneQueries);
        Assert.Equal(3, manyQueries);
        Assert.Equal(3, searchQueries);

        // A summary is ids, names and a count: no tree, no relationship, no picture.
        var text = await many.Client.GetStringAsync(Route(many.Universe));
        foreach (var absent in new[] { "parents", "links", "relationshipId", "image", "summary", "article" })
        {
            Assert.DoesNotContain($"\"{absent}\"", text, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static string Route(Guid universeId) => $"/api/universes/{universeId}/family-tree/families";

    private static async Task<FamilyDiscoveryPage> Families(Family family, string? q = null, int? page = null, int? pageSize = null)
    {
        var query = new[]
        {
            q is null ? null : $"q={Uri.EscapeDataString(q)}",
            page is null ? null : $"page={page}",
            pageSize is null ? null : $"pageSize={pageSize}",
        }.OfType<string>().ToList();
        var route = Route(family.Universe) + (query.Count == 0 ? "" : "?" + string.Join('&', query));

        var response = await family.Client.GetAsync(route);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<FamilyDiscoveryPage>())!;
    }

    /// <summary>Each family as its preview names, in the order the API gave them.</summary>
    private static List<string> Previews(FamilyDiscoveryPage page) =>
        [.. page.Items.Select(item => string.Join(' ', item.PreviewMembers.Select(member => member.Name)))];
}
