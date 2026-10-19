using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Nested types (ADR 0007 amendment, 2026-10-01; Product refinement 022).
///
/// A type may sit beneath another type of the same universe, to any depth, never inside itself. The hierarchy is
/// organisation only - entries keep their exact type, fields stay on the type that declares them, nothing is inherited.
/// A type's place is among its direct siblings, and moves one step at a time. A type holding nested types cannot be deleted.
/// Lore asks for a branch explicitly; every other reader of the list still gets an exact type. A backup carries the tree
/// (version 19), an older one restores flat, and a file whose types are not a forest is refused before anything is written.
/// </summary>
public sealed partial class NestedTypeTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    // ---------- The hierarchy ----------

    [Fact]
    public async Task Starter_types_are_roots_and_a_new_type_is_appended_where_it_belongs()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntroots");
        var u = universe.Id;

        var starters = await Types(client, u);
        Assert.All(starters, type => Assert.Null(type.ParentId));
        Assert.Equal(["Character", "Location", "Organization", "Event", "Item", "Species", "Concept"], starters.Select(type => type.Name));

        var runes = await Create(client, u, "Runes");
        var material = await Create(client, u, "Material Runes", runes.Id);
        var animal = await Create(client, u, "Animal Runes", runes.Id);
        var metal = await Create(client, u, "Metal Runes", material.Id);

        Assert.Null(runes.ParentId);
        Assert.Equal(starters.Max(type => type.DisplayOrder) + 1, runes.DisplayOrder);
        Assert.Equal((runes.Id, 1), (material.ParentId, material.DisplayOrder));
        Assert.Equal((runes.Id, 2), (animal.ParentId, animal.DisplayOrder));
        Assert.Equal((material.Id, 1), (metal.ParentId, metal.DisplayOrder));

        // A parent before everything beneath it, siblings in their places.
        Assert.Equal(
            ["Character", "Location", "Organization", "Event", "Item", "Species", "Concept", "Runes", "Material Runes", "Metal Runes", "Animal Runes"],
            (await Types(client, u)).Select(type => type.Name));
    }

    [Fact]
    public async Task A_hierarchy_has_no_depth_limit()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntdeep");
        var u = universe.Id;
        Guid? parent = null;
        var chain = new List<Guid>();

        for (var depth = 0; depth < 30; depth++)
        {
            var type = await Create(client, u, $"Level {depth:00}", parent);
            chain.Add(type.Id);
            parent = type.Id;
        }

        var listed = (await Types(client, u)).Where(type => type.Name.StartsWith("Level ", StringComparison.Ordinal)).ToList();
        Assert.Equal(chain, listed.Select(type => type.Id));
        Assert.Equal([null, .. chain[..^1].Select(id => (Guid?)id)], listed.Select(type => type.ParentId));

        // A deep cycle is still found: the root cannot go beneath the deepest level.
        var refused = await Reparent(client, u, listed[0], chain[^1]);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
    }

    [Fact]
    public async Task A_parent_from_another_universe_or_account_is_refused_alike()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntforeign");
        var other = await CreateUniverse(client, "Other ntforeign");
        var elsewhere = await Create(client, other.Id, "Elsewhere");
        var (stranger, theirs) = await SignedInWithUniverse(_factory, "ntstranger");
        var hidden = await Create(stranger, theirs.Id, "Hidden");

        var fromOtherWorld = await TryCreate(client, universe.Id, "Child", elsewhere.Id);
        var fromOtherAccount = await TryCreate(client, universe.Id, "Child", hidden.Id);
        var made_up = await TryCreate(client, universe.Id, "Child", Guid.NewGuid());

        foreach (var response in new[] { fromOtherWorld, fromOtherAccount, made_up })
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        Assert.Equal(await Errors(fromOtherWorld), await Errors(fromOtherAccount));
        Assert.Equal(await Errors(fromOtherWorld), await Errors(made_up));
        Assert.DoesNotContain("Hidden", await fromOtherAccount.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.DoesNotContain(await Types(client, universe.Id), type => type.Name == "Child");

        // Reparenting there is refused the same way, and moves nothing.
        var local = await Create(client, universe.Id, "Local");
        Assert.Equal(HttpStatusCode.BadRequest, (await Reparent(client, universe.Id, local, hidden.Id)).StatusCode);
        Assert.Null((await Type(client, universe.Id, "Local")).ParentId);
    }

    [Fact]
    public async Task A_type_cannot_go_inside_itself_directly_or_through_its_descendants()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntcycle");
        var u = universe.Id;
        var a = await Create(client, u, "A");
        var b = await Create(client, u, "B", a.Id);
        var c = await Create(client, u, "C", b.Id);

        foreach (var (type, parent) in new[] { (a, a.Id), (a, b.Id), (a, c.Id), (b, c.Id) })
        {
            var refused = await Reparent(client, u, await Type(client, u, type.Name), parent);
            Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
            Assert.Equal(EntityTypeEndpoints.ParentCycleCode, await Code(refused));
        }

        var after = await Types(client, u);
        Assert.Equal((null, a.Id, b.Id), (after.Single(t => t.Name == "A").ParentId, after.Single(t => t.Name == "B").ParentId, after.Single(t => t.Name == "C").ParentId));
    }

    // ---------- Reparenting ----------

    [Fact]
    public async Task Reparenting_moves_the_whole_subtree_and_changes_no_entry_field_or_capability()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntreparent");
        var u = universe.Id;
        var location = await Type(client, u, "Location");
        var kingdom = await Create(client, u, "Kingdom", familyTree: true);
        var village = await Create(client, u, "Village", kingdom.Id);
        var outpost = await Create(client, u, "Outpost", village.Id);
        var other = await Create(client, u, "Second village", kingdom.Id);
        var climate = await AddField(client, u, kingdom.Id, "Climate");
        var castle = await Entry(client, u, kingdom.Id, "Castle Ward");
        var hamlet = await Entry(client, u, village.Id, "Hamlet");
        var before = await Type(client, u, "Kingdom");
        var stamped = await Stamp(kingdom.Id);

        // Root -> child: last among its new siblings, children and grandchildren still beneath it.
        var moved = await PutJson<EntityTypeResponse>(client, TypePath(u, kingdom.Id), Request(before, location.Id));
        Assert.Equal((location.Id, 1), (moved.ParentId, moved.DisplayOrder));
        Assert.True(await Stamp(kingdom.Id) > stamped);
        var types = await Types(client, u);
        Assert.Equal(kingdom.Id, types.Single(t => t.Name == "Village").ParentId);
        Assert.Equal(village.Id, types.Single(t => t.Name == "Outpost").ParentId);
        Assert.Equal(["Location", "Kingdom", "Village", "Outpost", "Second village"], types.SkipWhile(t => t.Name != "Location").Take(5).Select(t => t.Name));

        // The roots it left are numbered 1..n again.
        Assert.Equal(Enumerable.Range(1, types.Count(t => t.ParentId is null)), types.Where(t => t.ParentId is null).Select(t => t.DisplayOrder));

        // Child -> another parent: last there; the old siblings close the gap.
        var item = await Type(client, u, "Item");
        var village2 = await PutJson<EntityTypeResponse>(client, TypePath(u, village.Id), Request(await Type(client, u, "Village"), item.Id));
        Assert.Equal((item.Id, 1), (village2.ParentId, village2.DisplayOrder));
        Assert.Equal(1, (await Type(client, u, "Second village")).DisplayOrder);
        Assert.Equal(village.Id, (await Type(client, u, "Outpost")).ParentId);

        // Child -> root: last among the roots, its child with it.
        var rooted = await PutJson<EntityTypeResponse>(client, TypePath(u, village.Id), Request(await Type(client, u, "Village"), null));
        Assert.Null(rooted.ParentId);
        Assert.Equal((await Types(client, u)).Where(t => t.ParentId is null).Max(t => t.DisplayOrder), rooted.DisplayOrder);
        Assert.Equal(village.Id, (await Type(client, u, "Outpost")).ParentId);

        // Entries keep their exact type; fields stay where they were declared; capability untouched.
        await WithDb(_factory, async db =>
        {
            Assert.Equal(kingdom.Id, await db.Entities.Where(e => e.Id == castle).Select(e => e.EntityTypeId).SingleAsync());
            Assert.Equal(village.Id, await db.Entities.Where(e => e.Id == hamlet).Select(e => e.EntityTypeId).SingleAsync());
            Assert.Equal(kingdom.Id, await db.EntityFieldDefinitions.Where(f => f.Id == climate).Select(f => f.EntityTypeId).SingleAsync());
        });
        var kingdomNow = await Type(client, u, "Kingdom");
        Assert.True(kingdomNow.FamilyTreeEligible);
        Assert.Single(kingdomNow.Fields);
        Assert.Empty((await Type(client, u, "Location")).Fields);
        Assert.False((await Type(client, u, "Location")).FamilyTreeEligible);
        Assert.Equal(other.Id, (await Type(client, u, "Second village")).Id);
    }

    [Fact]
    public async Task An_update_that_leaves_parent_out_keeps_it_and_an_explicit_null_makes_a_root()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntomit");
        var u = universe.Id;
        var parent = await Create(client, u, "Parent");
        var child = await Create(client, u, "Child", parent.Id);

        // An older client: no parent member at all.
        var renamed = await PutJson<EntityTypeResponse>(client, TypePath(u, child.Id), new EntityTypeRequest("Renamed child", null, "star", null, child.DisplayOrder));
        Assert.Equal(parent.Id, renamed.ParentId);

        // The raw wire: "parent": { "id": null } is the root.
        var response = await client.PutAsync(
            TypePath(u, child.Id),
            JsonContent.Create(JsonNode.Parse("""{"name":"Renamed child","icon":"star","parent":{"id":null}}""")));
        response.EnsureSuccessStatusCode();
        Assert.Null((await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.ParentId);
    }

    // ---------- Order ----------

    [Fact]
    public async Task Up_and_down_move_one_place_among_direct_siblings_only()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntmove");
        var u = universe.Id;
        var runes = await Create(client, u, "Runes");
        var material = await Create(client, u, "Material", runes.Id);
        await Create(client, u, "Animal", runes.Id);
        await Create(client, u, "Primal", runes.Id);
        await Create(client, u, "Metal", material.Id);
        await Create(client, u, "Stone", material.Id);
        var place = await Create(client, u, "Place");
        await Create(client, u, "Town", place.Id);
        await Create(client, u, "Port", place.Id);

        string Order(List<EntityTypeResponse> list) => string.Join(" ", list.Select(t => t.Name));

        var animal = await Type(client, u, "Animal");
        var afterUp = await Move(client, u, animal.Id, "up");
        Assert.EndsWith("Runes Animal Material Metal Stone Primal Place Town Port", Order(afterUp));

        // Moving a root moves its branch, and touches no child order.
        var afterRoot = await Move(client, u, place.Id, "up");
        Assert.EndsWith("Place Town Port Runes Animal Material Metal Stone Primal", Order(afterRoot));

        // A child move stays in its branch.
        var stone = await Type(client, u, "Stone");
        var afterChild = await Move(client, u, stone.Id, "up");
        Assert.EndsWith("Place Town Port Runes Animal Material Stone Metal Primal", Order(afterChild));

        // Every sibling group is 1..n.
        foreach (var group in afterChild.GroupBy(t => t.ParentId))
        {
            Assert.Equal(Enumerable.Range(1, group.Count()), group.Select(t => t.DisplayOrder));
        }

        // The first going up and the last going down change nothing, and say so with the list as it is.
        var first = afterChild.First(t => t.ParentId is null);
        var last = afterChild.Last(t => t.ParentId == runes.Id);
        Assert.Equal(Order(afterChild), Order(await Move(client, u, first.Id, "up")));
        Assert.Equal(Order(afterChild), Order(await Move(client, u, last.Id, "down")));

        var down = await Move(client, u, (await Type(client, u, "Town")).Id, "down");
        Assert.EndsWith("Place Port Town Runes", string.Join(" ", down.Select(t => t.Name).Take(down.FindIndex(t => t.Name == "Runes") + 1)));

        // Anything but up or down is refused; another universe's type is not found.
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"{TypePath(u, runes.Id)}/move", new EntityTypeMoveRequest("sideways"))).StatusCode);
        var (stranger, theirs) = await SignedInWithUniverse(_factory, "ntmovestranger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"{TypePath(theirs.Id, runes.Id)}/move", new EntityTypeMoveRequest("up"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"{TypePath(u, runes.Id)}/move", new EntityTypeMoveRequest("up"))).StatusCode);
    }

    [Fact]
    public async Task Places_left_tied_or_gapped_by_older_data_are_numbered_again_by_the_first_move()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntlegacy");
        var u = universe.Id;
        var parent = await Create(client, u, "Legacy");
        var ids = new List<Guid>();
        foreach (var name in new[] { "Alpha", "Beta", "Gamma", "Delta" })
        {
            ids.Add((await Create(client, u, name, parent.Id)).Id);
        }

        // Ties and gaps, as a flat order written before nesting could leave them.
        await WithDb(_factory, async db =>
        {
            await db.EntityTypes.Where(t => t.Id == ids[0] || t.Id == ids[1]).ExecuteUpdateAsync(set => set.SetProperty(t => t.DisplayOrder, 7));
            await db.EntityTypes.Where(t => t.Id == ids[2]).ExecuteUpdateAsync(set => set.SetProperty(t => t.DisplayOrder, 40));
            await db.EntityTypes.Where(t => t.Id == ids[3]).ExecuteUpdateAsync(set => set.SetProperty(t => t.DisplayOrder, 40));
        });

        // Shown by place, then name: Alpha, Beta, Delta, Gamma.
        Assert.Equal(["Alpha", "Beta", "Delta", "Gamma"], (await Types(client, u)).Where(t => t.ParentId == parent.Id).Select(t => t.Name));

        var moved = (await Move(client, u, ids[3], "up")).Where(t => t.ParentId == parent.Id).ToList();
        Assert.Equal(["Alpha", "Delta", "Beta", "Gamma"], moved.Select(t => t.Name));
        Assert.Equal([1, 2, 3, 4], moved.Select(t => t.DisplayOrder));
    }

    // ---------- Deleting ----------

    [Fact]
    public async Task A_type_holding_nested_types_cannot_be_deleted_until_they_are_gone()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntdelete");
        var u = universe.Id;
        var runes = await Create(client, u, "Runes");
        var children = new List<EntityTypeResponse>();
        foreach (var name in new[] { "Material", "Animal", "Elemental", "Primal" })
        {
            children.Add(await Create(client, u, name, runes.Id));
        }

        var blocked = await client.DeleteAsync(TypePath(u, runes.Id));
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        var problem = JsonDocument.Parse(await blocked.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(
            "Runes can't be deleted because it still contains 4 nested types. Move or delete those types first.",
            problem.GetProperty("detail").GetString());
        Assert.Equal(4, problem.GetProperty("childCount").GetInt32());
        Assert.Equal(EntityTypeEndpoints.TypeInUseCode, problem.GetProperty("code").GetString());

        // A child goes on its own and takes nothing of its parent.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(TypePath(u, children[0].Id))).StatusCode);
        Assert.Equal(3, (await Types(client, u)).Count(t => t.ParentId == runes.Id));

        // Entries and children both: both reasons, in words.
        var entry = await Entry(client, u, runes.Id, "Rune stone");
        var both = await client.DeleteAsync(TypePath(u, runes.Id));
        var detail = JsonDocument.Parse(await both.Content.ReadAsStringAsync()).RootElement.GetProperty("detail").GetString()!;
        Assert.StartsWith("Runes can't be deleted because 1 entry still uses it, and it still contains 3 nested types.", detail, StringComparison.Ordinal);

        // Once the children and the entry are gone - the Trash still counting - it goes.
        foreach (var child in children.Skip(1))
        {
            (await client.DeleteAsync(TypePath(u, child.Id))).EnsureSuccessStatusCode();
        }

        (await client.DeleteAsync($"/api/universes/{u}/entities/{entry}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync(TypePath(u, runes.Id))).StatusCode);
        (await client.DeleteAsync($"/api/universes/{u}/trash/{entry}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(TypePath(u, runes.Id))).StatusCode);
    }

    [Fact]
    public async Task The_database_itself_keeps_parents_in_their_universe_and_children_from_being_orphaned()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntdb");
        var other = await CreateUniverse(client, "Other ntdb");
        var parent = await Create(client, universe.Id, "Held parent");
        var child = await Create(client, universe.Id, "Held child", parent.Id);
        var foreign = await Create(client, other.Id, "Foreign");

        await WithDb(_factory, async db =>
        {
            await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                "UPDATE EntityTypes SET ParentId = {0} WHERE Id = {1}", Key(foreign.Id), Key(child.Id)));
            await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                "UPDATE EntityTypes SET ParentId = Id WHERE Id = {0}", Key(child.Id)));
            await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                "DELETE FROM EntityTypes WHERE Id = {0}", Key(parent.Id)));
            Assert.Equal(parent.Id, await db.EntityTypes.Where(t => t.Id == child.Id).Select(t => t.ParentId).SingleAsync());
        });

        // A universe's own delete takes a nested tree with it.
        (await client.PostAsync($"/api/universes/{universe.Id}/archive", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{universe.Id}")).StatusCode);
        await WithDb(_factory, async db => Assert.False(await db.EntityTypes.AnyAsync(t => t.UniverseId == universe.Id)));
    }

    // ---------- Lore's branch ----------

    [Fact]
    public async Task Lore_asks_for_a_branch_explicitly_and_everyone_else_still_gets_an_exact_type()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntbranch");
        var u = universe.Id;
        var runes = await Create(client, u, "Runes");
        var material = await Create(client, u, "Material", runes.Id);
        var metal = await Create(client, u, "Metal", material.Id);
        var animal = await Create(client, u, "Animal", runes.Id);
        var place = await Create(client, u, "Place");

        var onRunes = await Entry(client, u, runes.Id, "Rune of beginnings");
        var onMaterial = await Entry(client, u, material.Id, "Iron rune", CanonStatus.Canon);
        var onMetal = await Entry(client, u, metal.Id, "Silver rune");
        var onAnimal = await Entry(client, u, animal.Id, "Wolf rune", CanonStatus.Canon);
        var onPlace = await Entry(client, u, place.Id, "Rune hill");
        var archived = await Entry(client, u, metal.Id, "Archived rune");
        var trashed = await Entry(client, u, metal.Id, "Trashed rune");
        (await client.DeleteAsync($"/api/universes/{u}/entities/{trashed}")).EnsureSuccessStatusCode();
        await WithDb(_factory, async db =>
            await db.Entities.Where(e => e.Id == archived).ExecuteUpdateAsync(set => set.SetProperty(e => e.IsArchived, true)));

        // Exact, as it always was.
        Assert.Equal([onRunes], await Ids(client, u, $"entityTypeId={runes.Id}"));

        // The branch: the type, its children and grandchildren; never a sibling branch, the archive or the Trash.
        Assert.Equal(
            new[] { onRunes, onMaterial, onMetal, onAnimal }.Order(),
            (await Ids(client, u, $"entityTypeId={runes.Id}&includeDescendants=true")).Order());
        Assert.Equal(
            new[] { onMaterial, onMetal }.Order(),
            (await Ids(client, u, $"entityTypeId={material.Id}&includeDescendants=true")).Order());
        Assert.Equal([onMetal], await Ids(client, u, $"entityTypeId={metal.Id}&includeDescendants=true"));
        Assert.Contains(archived, await Ids(client, u, $"entityTypeId={metal.Id}&includeDescendants=true&includeArchived=true"));

        // Search, status and the page total stay inside the branch.
        Assert.Equal([onMetal], await Ids(client, u, $"entityTypeId={material.Id}&includeDescendants=true&search=silver"));
        Assert.Empty(await Ids(client, u, $"entityTypeId={material.Id}&includeDescendants=true&search=wolf"));
        Assert.Equal(
            new[] { onMaterial, onAnimal }.Order(),
            (await Ids(client, u, $"entityTypeId={runes.Id}&includeDescendants=true&canonStatus={(int)CanonStatus.Canon}")).Order());
        var page = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{u}/entities?entityTypeId={runes.Id}&includeDescendants=true&pageSize=1"))!;
        Assert.Equal((4, 4), (page.TotalCount, page.TotalPages));
        Assert.DoesNotContain(onPlace, await Ids(client, u, $"entityTypeId={runes.Id}&includeDescendants=true"));
    }

    // ---------- Backup ----------

    [Fact]
    public async Task A_backup_carries_the_tree_and_a_restore_rebuilds_it_under_new_ids_twice_independently()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntbackup");
        var u = universe.Id;
        var runes = await Create(client, u, "Runes");
        var material = await Create(client, u, "Material", runes.Id);
        await Create(client, u, "Animal", runes.Id);
        await Create(client, u, "Metal", material.Id);
        await Create(client, u, "Stone", material.Id);
        await Move(client, u, (await Type(client, u, "Animal")).Id, "up");

        var archive = await RawArchive(client, u);
        var backup = BackupOf(archive);
        Assert.Equal(23, backup.FormatVersion);
        var types = backup.Payload.EntityTypes;
        Assert.Equal(runes.Id, types.Single(t => t.Name == "Material").ParentId);
        Assert.Equal(material.Id, types.Single(t => t.Name == "Metal").ParentId);
        Assert.Equal(["Runes", "Animal", "Material", "Metal", "Stone"], types.SkipWhile(t => t.Name != "Runes").Select(t => t.Name));

        // Two exports of the same lore are the same document.
        Assert.Equal(PayloadText(DocumentOf(archive)), PayloadText(DocumentOf(await RawArchive(client, u))));

        var first = await RestoreArchive(client, archive, "Restored ntbackup one");
        var second = await RestoreArchive(client, archive, "Restored ntbackup two");

        foreach (var restored in new[] { first, second })
        {
            var list = await Types(client, restored.Id);
            var byName = list.ToDictionary(t => t.Name);
            Assert.Equal(byName["Runes"].Id, byName["Material"].ParentId);
            Assert.Equal(byName["Material"].Id, byName["Metal"].ParentId);
            Assert.Equal(["Runes", "Animal", "Material", "Metal", "Stone"], list.SkipWhile(t => t.Name != "Runes").Select(t => t.Name));
            Assert.DoesNotContain(list, t => t.Id == runes.Id || t.Id == material.Id);
        }

        Assert.Empty((await Types(client, first.Id)).Select(t => t.Id).Intersect((await Types(client, second.Id)).Select(t => t.Id)));
    }

    [Fact]
    public async Task An_older_backup_restores_every_type_as_a_root_in_its_stored_order()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntold");
        var u = universe.Id;
        await Create(client, u, "Kingdom");
        var village = await Create(client, u, "Village");
        await Move(client, u, village.Id, "up");
        var source = (await Types(client, u)).Select(t => t.Name).ToList();

        // A version 18 file: flat, as every file before 19 is; one written by Lorex never names a parent.
        var restored = await RestoreArchive(client, Downgrade(await RawArchive(client, u), 18), "Restored ntold");
        var list = await Types(client, restored.Id);

        Assert.All(list, type => Assert.Null(type.ParentId));
        Assert.Equal(source, list.Select(t => t.Name));
        Assert.Equal(["Village", "Kingdom"], list.Select(t => t.Name).TakeLast(2));
    }

    [Fact]
    public async Task A_file_whose_types_are_not_a_forest_is_refused_before_anything_is_written()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ntbad");
        var u = universe.Id;
        var a = await Create(client, u, "A");
        var b = await Create(client, u, "B", a.Id);
        var archive = await RawArchive(client, u);
        var before = (await Universes(client)).Count;

        JsonObject TypeNamed(JsonObject root, string name) =>
            Payload(root)["entityTypes"]!.AsArray().Single(type => type!["name"]!.GetValue<string>() == name)!.AsObject();

        var missing = Rewrite(archive, root => TypeNamed(root, "B")["parentId"] = Guid.NewGuid().ToString());
        var self = Rewrite(archive, root => TypeNamed(root, "A")["parentId"] = a.Id.ToString());
        var loop = Rewrite(archive, root => TypeNamed(root, "A")["parentId"] = b.Id.ToString());

        var refusals = new[]
        {
            await Refused(await Validate(client, missing)),
            await Refused(await Validate(client, self)),
            await Refused(await Validate(client, loop)),
        };

        Assert.Contains("missing_reference", refusals[0].IssueCodes);
        Assert.Contains(refusals[1].Issues, issue => issue.Message.Contains("nested inside itself", StringComparison.Ordinal));
        Assert.Contains(refusals[2].Issues, issue => issue.Message.Contains("loop", StringComparison.Ordinal));
        Assert.Equal(before, (await Universes(client)).Count);
    }

    // ---------- Helpers ----------

    private static string TypePath(Guid universeId, Guid typeId) => $"/api/universes/{universeId}/entity-types/{typeId}";

    private static async Task<List<EntityTypeResponse>> Types(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;

    private static async Task<EntityTypeResponse> Type(HttpClient client, Guid universeId, string name) =>
        (await Types(client, universeId)).Single(type => type.Name == name);

    private static Task<HttpResponseMessage> TryCreate(HttpClient client, Guid universeId, string name, Guid? parentId) =>
        client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types",
            new EntityTypeRequest(name, null, null, null, null, Parent: new EntityTypeParentChoice(parentId)));

    private static async Task<EntityTypeResponse> Create(HttpClient client, Guid universeId, string name, Guid? parentId = null, bool familyTree = false)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types",
            new EntityTypeRequest(name, null, null, null, null, familyTree, new EntityTypeParentChoice(parentId)));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
    }

    /// <summary>The whole type sent back as the edit drawer does, with a new parent.</summary>
    private static EntityTypeRequest Request(EntityTypeResponse type, Guid? parentId) =>
        new(type.Name, type.Description, type.Icon, type.AccentColor, type.DisplayOrder, type.FamilyTreeEligible, new EntityTypeParentChoice(parentId));

    private static Task<HttpResponseMessage> Reparent(HttpClient client, Guid universeId, EntityTypeResponse type, Guid? parentId) =>
        client.PutAsJsonAsync(TypePath(universeId, type.Id), Request(type, parentId));

    private static async Task<List<EntityTypeResponse>> Move(HttpClient client, Guid universeId, Guid typeId, string direction)
    {
        var response = await client.PostAsJsonAsync($"{TypePath(universeId, typeId)}/move", new EntityTypeMoveRequest(direction));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<List<EntityTypeResponse>>())!;
    }

    private static async Task<Guid> AddField(HttpClient client, Guid universeId, Guid typeId, string name)
    {
        var type = await PostJson<EntityTypeResponse>(
            client,
            $"{TypePath(universeId, typeId)}/fields",
            new FieldDefinitionRequest(name, EntityFieldKind.ShortText, false, null, null, null));
        return type.Fields.Single(field => field.Name == name).Id;
    }

    private static async Task<Guid> Entry(HttpClient client, Guid universeId, Guid typeId, string name, CanonStatus status = CanonStatus.Idea) =>
        (await PostJson<EntityDetail>(
            client,
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, status, null, null, null))).Id;

    private static async Task<List<Guid>> Ids(HttpClient client, Guid universeId, string query) =>
        [.. (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universeId}/entities?{query}&pageSize=50"))!.Items.Select(item => item.Id)];

    private static async Task<string?> Code(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;

    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

    private async Task<DateTime> Stamp(Guid typeId)
    {
        var stamp = DateTime.MinValue;
        await WithDb(_factory, async db => stamp = await db.EntityTypes.Where(t => t.Id == typeId).Select(t => t.UpdatedAt).SingleAsync());
        return stamp;
    }
}
