using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Reordering a type to an absolute place among its siblings (Product refinement 027): the request a desktop drag makes, once,
/// however far it went. It changes one sibling group's order and nothing else - never a parent, never a nested type's own
/// place, never a field or an entry - and it refuses a place outside the group or a type no longer where the client saw it.
/// </summary>
public sealed partial class NestedTypeTests
{
    [Fact]
    public async Task Reorder_puts_a_root_at_any_place_among_the_roots_in_one_request()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntreorderroot");
        var u = universe.Id;
        var runes = await Create(client, u, "Runes");
        await Create(client, u, "Original", runes.Id);
        await Create(client, u, "Glyphs");

        var roots = (await Types(client, u)).Where(t => t.ParentId is null).Select(t => t.Name).ToList();
        Assert.Equal(["Character", "Location", "Organization", "Event", "Item", "Species", "Concept", "Runes", "Glyphs"], roots);

        // End to beginning.
        var glyphs = await Type(client, u, "Glyphs");
        var first = await Reorder(client, u, glyphs.Id, 0, null);
        Assert.Equal(["Glyphs", "Character", "Location", "Organization", "Event", "Item", "Species", "Concept", "Runes"], RootNames(first));

        // Beginning to end.
        var last = await Reorder(client, u, glyphs.Id, 8, null);
        Assert.Equal(["Character", "Location", "Organization", "Event", "Item", "Species", "Concept", "Runes", "Glyphs"], RootNames(last));

        // A middle place, from further down.
        var middle = await Reorder(client, u, glyphs.Id, 3, null);
        Assert.Equal(["Character", "Location", "Organization", "Glyphs", "Event", "Item", "Species", "Concept", "Runes"], RootNames(middle));

        // Every sibling group stays 1..n, so the order is the numbers' order and nothing else.
        foreach (var group in middle.GroupBy(t => t.ParentId))
        {
            Assert.Equal(Enumerable.Range(1, group.Count()), group.Select(t => t.DisplayOrder));
        }
    }

    [Fact]
    public async Task Reorder_moves_a_child_among_its_own_siblings_and_a_parent_with_its_whole_branch()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntreorderbranch");
        var u = universe.Id;
        var runes = await Create(client, u, "Runes", familyTree: true);
        await Create(client, u, "Original", runes.Id);
        var primal = await Create(client, u, "Primal", runes.Id);
        var ancient = await Create(client, u, "Ancient", primal.Id);
        await Create(client, u, "Elder", primal.Id);
        await Create(client, u, "Corrupted", runes.Id);
        var material = await Create(client, u, "Material", runes.Id);
        var field = await AddField(client, u, runes.Id, "Glyph");
        var entry = await Entry(client, u, material.Id, "Iron rune");
        var countBefore = (await Type(client, u, "Material")).EntityCount;

        // A child among its siblings: Material between Original and Primal - before Primal's whole branch.
        var afterChild = await Reorder(client, u, material.Id, 1, runes.Id);
        Assert.Equal(
            "Runes Original Material Primal Ancient Elder Corrupted",
            string.Join(" ", afterChild.SkipWhile(t => t.Name != "Runes").Take(7).Select(t => t.Name)));

        // A type with nested types moves as a branch; what is inside it keeps its parent and its own order.
        var afterBranch = await Reorder(client, u, primal.Id, 3, runes.Id);
        Assert.Equal(
            "Runes Original Material Corrupted Primal Ancient Elder",
            string.Join(" ", afterBranch.SkipWhile(t => t.Name != "Runes").Take(7).Select(t => t.Name)));
        Assert.Equal(primal.Id, afterBranch.Single(t => t.Name == "Ancient").ParentId);
        Assert.Equal((primal.Id, 2), (afterBranch.Single(t => t.Name == "Elder").ParentId, afterBranch.Single(t => t.Name == "Elder").DisplayOrder));
        Assert.Equal(1, afterBranch.Single(t => t.Name == "Ancient").DisplayOrder);

        // A parent among the roots carries its whole subtree, and no child row is rewritten.
        var ancientStamp = await Stamp(ancient.Id);
        var afterParent = await Reorder(client, u, runes.Id, 0, null);
        Assert.Equal(
            "Runes Original Material Corrupted Primal Ancient Elder Character",
            string.Join(" ", afterParent.Take(8).Select(t => t.Name)));
        Assert.Equal(ancientStamp, await Stamp(ancient.Id));

        // Only order changed: parents, fields, Family Tree, entries and counts are as they were.
        var runesNow = afterParent.Single(t => t.Name == "Runes");
        Assert.Null(runesNow.ParentId);
        Assert.True(runesNow.FamilyTreeEligible);
        Assert.Equal(field, runesNow.Fields.Single().Id);
        Assert.All(afterParent.Where(t => t.Name is "Original" or "Material" or "Corrupted" or "Primal"), t => Assert.Equal(runes.Id, t.ParentId));
        Assert.Equal(countBefore, afterParent.Single(t => t.Name == "Material").EntityCount);
        await WithDb(_factory, async db =>
            Assert.Equal(material.Id, await db.Entities.Where(e => e.Id == entry).Select(e => e.EntityTypeId).SingleAsync()));
    }

    [Fact]
    public async Task Reorder_to_its_own_place_is_an_unchanged_200_and_a_bad_place_or_stale_parent_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntreorderrefuse");
        var u = universe.Id;
        var runes = await Create(client, u, "Runes");
        var original = await Create(client, u, "Original", runes.Id);
        await Create(client, u, "Primal", runes.Id);
        var before = await Types(client, u);

        // Its own place: the list as it is.
        var same = await Reorder(client, u, original.Id, 0, runes.Id);
        Assert.Equal(before.Select(t => (t.Id, t.DisplayOrder)), same.Select(t => (t.Id, t.DisplayOrder)));

        // Outside the group, negative, or missing: a 400 on index, nothing changed.
        foreach (var index in new int?[] { -1, 2, 99, null })
        {
            var refused = await client.PostAsJsonAsync($"{TypePath(u, original.Id)}/reorder", new EntityTypeReorderRequest(index, runes.Id));
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Contains("index", await refused.Content.ReadAsStringAsync());
        }

        // A parent other than its own - a stale screen, or an attempt to reparent by reordering - is a 409, and moves nothing.
        foreach (Guid? claimed in new Guid?[] { null, original.Id, (await Type(client, u, "Location")).Id })
        {
            var stale = await client.PostAsJsonAsync($"{TypePath(u, original.Id)}/reorder", new EntityTypeReorderRequest(1, claimed));
            Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
            Assert.Equal(EntityTypeEndpoints.ParentChangedCode, await Code(stale));
        }

        Assert.Equal(before.Select(t => (t.Id, t.ParentId, t.DisplayOrder)), (await Types(client, u)).Select(t => (t.Id, t.ParentId, t.DisplayOrder)));

        // Another account's universe, or its type through this one: not found, alike.
        var (stranger, theirs) = await SignedInWithUniverse(_factory, "ntreorderstranger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"{TypePath(u, original.Id)}/reorder", new EntityTypeReorderRequest(1, runes.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"{TypePath(theirs.Id, original.Id)}/reorder", new EntityTypeReorderRequest(1, runes.Id))).StatusCode);
        Assert.Equal(before.Select(t => (t.Id, t.DisplayOrder)), (await Types(client, u)).Select(t => (t.Id, t.DisplayOrder)));
    }

    [Fact]
    public async Task Up_and_down_still_step_once_and_stop_at_the_ends_beside_reorder()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntreordermove");
        var u = universe.Id;
        var runes = await Create(client, u, "Runes");
        var a = await Create(client, u, "A", runes.Id);
        await Create(client, u, "B", runes.Id);
        var c = await Create(client, u, "C", runes.Id);

        string Kids(List<EntityTypeResponse> list) => string.Join(" ", list.Where(t => t.ParentId == runes.Id).Select(t => t.Name));

        Assert.Equal("A C B", Kids(await Move(client, u, c.Id, "up")));
        Assert.Equal("C A B", Kids(await Move(client, u, c.Id, "up")));
        Assert.Equal("C A B", Kids(await Move(client, u, c.Id, "up")));
        Assert.Equal("C B A", Kids(await Move(client, u, a.Id, "down")));
        Assert.Equal("C B A", Kids(await Move(client, u, a.Id, "down")));
        Assert.Equal("A C B", Kids(await Reorder(client, u, a.Id, 0, runes.Id)));
    }

    private static async Task<List<EntityTypeResponse>> Reorder(HttpClient client, Guid universeId, Guid typeId, int index, Guid? parentId)
    {
        var response = await client.PostAsJsonAsync($"{TypePath(universeId, typeId)}/reorder", new EntityTypeReorderRequest(index, parentId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<List<EntityTypeResponse>>())!;
    }

    private static List<string> RootNames(List<EntityTypeResponse> types) =>
        [.. types.Where(t => t.ParentId is null).Select(t => t.Name)];
}
