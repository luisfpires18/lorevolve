using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Lorex.Api.Features.Lore;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Semantic groups of Lore types (Issue #36, ADR 0007 amendment). A group is a creator's own classification - Runes - that
/// several concrete types belong to. Its identity is its id: renames change nothing else, and nothing is ever worked out from a
/// name. Membership is saved with the type, links limited to a group are checked against its membership wherever they are
/// written or compared, and neither a membership change nor a delete may leave an authored link outside what its field allows.
/// </summary>
public sealed class EntityTypeGroupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Character, Guid Elemental, Guid Corrupted, Guid Kingdoms);

    // ---------- Starter groups ----------

    [Fact]
    public async Task A_new_universe_gets_its_templates_groups_and_nothing_is_inferred_from_names_afterwards()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "etg-starter");
        var types = await TypesOf(client, universe.Id);
        var groups = await GroupsOf(client, universe.Id);
        string NameOf(Guid id) => types.Single(type => type.Id == id).Name;

        Assert.Equal(
            ["Characters: Character", "Factions: Organization", "Objects: Item", "Places: Location"],
            groups.Select(group => $"{group.Name}: {string.Join(",", group.TypeIds.Select(NameOf).Order())}").Order(StringComparer.Ordinal));

        // Family Tree eligibility is exactly what it was: on the starter Character, by data, and nowhere else.
        Assert.Equal(["Character"], types.Where(type => type.FamilyTreeEligible).Select(type => type.Name));

        // A type made later joins nothing, whatever it is called - even a group's own name.
        var person = await NewType(client, universe.Id, "Characters");
        var alien = await NewType(client, universe.Id, "Person");
        var after = await GroupsOf(client, universe.Id);
        Assert.DoesNotContain(after, group => group.TypeIds.Contains(person) || group.TypeIds.Contains(alien));
        Assert.Equal(groups.Select(group => group.Id).Order(), after.Select(group => group.Id).Order());
    }

    // ---------- Groups and membership ----------

    [Fact]
    public async Task A_group_is_created_with_the_type_that_chose_it_and_keeps_its_identity_through_every_rename()
    {
        var w = await NewWorld("etg-identity");
        var runes = await GroupNamed(w, "Runes");
        Assert.Equal(new[] { w.Corrupted, w.Elemental }.Order(), runes.TypeIds.Order());

        // Renaming the group changes its name and nothing else.
        var renamed = await PutJson<EntityTypeGroupResponse>(w.Client, $"{GroupsRoute(w)}/{runes.Id}", new EntityTypeGroupRenameRequest("  Runestones "));
        Assert.Equal((runes.Id, "Runestones"), (renamed.Id, renamed.Name));
        Assert.Equal(runes.TypeIds.Order(), renamed.TypeIds.Order());

        // Renaming a member type changes no membership.
        await PutType(w, w.Elemental, new EntityTypeRequest("Fire Runes", null, null, null, null));
        Assert.Contains(w.Elemental, (await GroupNamed(w, "Runestones")).TypeIds);

        // A second group's name is its own.
        await SaveGroups(w, w.Kingdoms, [new(null, "Realms")]);
        var taken = await w.Client.PutAsJsonAsync($"{GroupsRoute(w)}/{runes.Id}", new EntityTypeGroupRenameRequest("Realms"));
        Assert.Equal(HttpStatusCode.BadRequest, taken.StatusCode);
        Assert.Equal("Runestones", (await GroupNamed(w, "Runestones")).Name);
    }

    [Fact]
    public async Task A_type_can_be_in_several_groups_and_leaves_one_without_touching_the_others()
    {
        var w = await NewWorld("etg-several");
        var runes = await GroupNamed(w, "Runes");
        await SaveGroups(w, w.Elemental, [new(runes.Id), new(null, "Magic"), new(null, "Craft")]);
        var magic = await GroupNamed(w, "Magic");
        var craft = await GroupNamed(w, "Craft");
        Assert.All([runes.Id, magic.Id, craft.Id], id => Assert.Contains(w.Elemental, GroupsOf(w).Result.Single(group => group.Id == id).TypeIds));

        await SaveGroups(w, w.Elemental, [new(runes.Id), new(craft.Id)]);
        var groups = await GroupsOf(w);
        Assert.DoesNotContain(w.Elemental, groups.Single(group => group.Id == magic.Id).TypeIds);
        Assert.Contains(w.Elemental, groups.Single(group => group.Id == craft.Id).TypeIds);

        // Leaving the groups out of a save keeps them; an empty list leaves every one.
        await PutType(w, w.Elemental, new EntityTypeRequest("Elemental Runes", null, "star", null, null));
        Assert.Equal(2, (await GroupsOf(w)).Count(group => group.TypeIds.Contains(w.Elemental)));
        await SaveGroups(w, w.Elemental, []);
        Assert.DoesNotContain(await GroupsOf(w), group => group.TypeIds.Contains(w.Elemental));
    }

    [Fact]
    public async Task A_refused_type_save_leaves_no_new_group_behind()
    {
        var w = await NewWorld("etg-orphans");

        // A new type whose name is taken: nothing is created, the group neither.
        var duplicate = await w.Client.PostAsJsonAsync(TypesRoute(w), new EntityTypeRequest("Kingdoms", null, null, null, null, Groups: [new(null, "Orphan one")]));
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        // A save that also takes the type out of a group links rely on: refused whole, the new group with it.
        var field = await AddField(w, w.Character, "Rune", groupId: (await GroupNamed(w, "Runes")).Id);
        await Entry(w, w.Character, "Mage", Link(field, await Entry(w, w.Elemental, "Lava Rune")));
        var leaving = await w.Client.PutAsJsonAsync(TypeRoute(w, w.Elemental), new EntityTypeRequest("Elemental Runes", null, null, null, null, Groups: [new(null, "Orphan two")]));
        Assert.Equal(HttpStatusCode.Conflict, leaving.StatusCode);

        // A choice that names neither an id nor a name, or both, is refused before anything is read.
        var neither = await w.Client.PutAsJsonAsync(TypeRoute(w, w.Kingdoms), new EntityTypeRequest("Kingdoms", null, null, null, null, Groups: [new(null, " ")]));
        var both = await w.Client.PutAsJsonAsync(TypeRoute(w, w.Kingdoms), new EntityTypeRequest("Kingdoms", null, null, null, null, Groups: [new((await GroupNamed(w, "Runes")).Id, "Runes")]));
        Assert.Equal(HttpStatusCode.BadRequest, neither.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, both.StatusCode);

        Assert.DoesNotContain(await GroupsOf(w), group => group.Name.StartsWith("Orphan", StringComparison.Ordinal));
        Assert.Contains(w.Elemental, (await GroupNamed(w, "Runes")).TypeIds);
    }

    [Fact]
    public async Task A_new_group_named_like_an_existing_one_is_refused()
    {
        var w = await NewWorld("etg-same-name");
        var again = await w.Client.PutAsJsonAsync(TypeRoute(w, w.Kingdoms), new EntityTypeRequest("Kingdoms", null, null, null, null, Groups: [new(null, "Runes")]));
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        Assert.Contains("already has a group called Runes", await ErrorOf(again, "groups"), StringComparison.Ordinal);
        Assert.Single(await GroupsOf(w), group => group.Name == "Runes");
    }

    [Fact]
    public async Task Groups_never_cross_universes()
    {
        var w = await NewWorld("etg-isolation");
        var elsewhere = await NewWorld("etg-isolation-b");
        var foreign = await GroupNamed(elsewhere, "Runes");

        // Not chosen by a type, not a link field's target, not renamed or deleted from here.
        var chosen = await w.Client.PutAsJsonAsync(TypeRoute(w, w.Kingdoms), new EntityTypeRequest("Kingdoms", null, null, null, null, Groups: [new(foreign.Id)]));
        var missing = await w.Client.PutAsJsonAsync(TypeRoute(w, w.Kingdoms), new EntityTypeRequest("Kingdoms", null, null, null, null, Groups: [new(Guid.NewGuid())]));
        Assert.Equal(await ErrorOf(missing, "groups"), await ErrorOf(chosen, "groups"));

        var targeted = await PostField(w, w.Character, Definition("Rune", groupId: foreign.Id));
        Assert.Equal(HttpStatusCode.BadRequest, targeted.StatusCode);
        Assert.Contains("group from this universe", await ErrorOf(targeted, "targetGroupId"), StringComparison.Ordinal);

        Assert.Equal(HttpStatusCode.NotFound, (await w.Client.PutAsJsonAsync($"{GroupsRoute(w)}/{foreign.Id}", new EntityTypeGroupRenameRequest("Mine"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Client.DeleteAsync($"{GroupsRoute(w)}/{foreign.Id}")).StatusCode);

        // Filtering by another universe's group reads nothing of it.
        await Entry(elsewhere, elsewhere.Elemental, "Foreign Rune");
        Assert.Empty(await Listed(w, $"entityTypeGroupId={foreign.Id}"));
        Assert.Equal("Runes", (await GroupNamed(elsewhere, "Runes")).Name);

        // And the schema holds the line too, beneath the API.
        await WithDb(_factory, async db =>
        {
            var crossing = await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                "INSERT INTO EntityTypeGroupMembers (EntityTypeGroupId, EntityTypeId) VALUES ({0}, {1})",
                foreign.Id.ToString().ToUpperInvariant(), w.Kingdoms.ToString().ToUpperInvariant()));
            Assert.Contains("same universe", crossing.Message, StringComparison.Ordinal);
        });
    }

    // ---------- Link fields limited to a group ----------

    [Fact]
    public async Task A_link_limited_to_a_group_takes_an_entry_of_any_member_type_and_nothing_else()
    {
        var w = await NewWorld("etg-links");
        var runes = await GroupNamed(w, "Runes");
        var field = await AddField(w, w.Character, "Required Rune", groupId: runes.Id);
        var (definition, _) = (await FieldOf(w, w.Character, field), 0);
        Assert.Equal((runes.Id, (Guid?)null), (definition.TargetGroupId!.Value, definition.TargetEntityTypeId));

        var lava = await Entry(w, w.Elemental, "Lava Rune");
        var blight = await Entry(w, w.Corrupted, "Blight Rune");
        var arkazia = await Entry(w, w.Kingdoms, "Arkazia");

        Assert.Equal(HttpStatusCode.Created, (await PostEntry(w, w.Character, "Mage", Link(field, lava))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await PostEntry(w, w.Character, "Witch", Link(field, blight))).StatusCode);

        var refused = await PostEntry(w, w.Character, "Knight", Link(field, arkazia));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("type is in its group", await ErrorOf(refused, field.ToString()), StringComparison.Ordinal);

        // An update is held to the same rule.
        var mage = (await Listed(w, $"entityTypeId={w.Character}", "search=Mage")).Single();
        var update = await w.Client.PutAsJsonAsync(
            $"/api/universes/{w.U}/entities/{mage.Id}",
            new EntityRequest(w.Character, "Mage", null, CanonStatus.Canon, null, null, [Link(field, arkazia)], ExpectedVersion: 1));
        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);

        // The picker's listing offers exactly the members' entries.
        Assert.Equal(["Blight Rune", "Lava Rune"], (await Listed(w, $"entityTypeGroupId={runes.Id}")).Select(item => item.Name).Order(StringComparer.Ordinal));

        // Adding a type to the group widens the field at once; nothing else needed.
        await SaveGroups(w, w.Kingdoms, [new(runes.Id)]);
        Assert.Equal(HttpStatusCode.Created, (await PostEntry(w, w.Character, "Knight", Link(field, arkazia))).StatusCode);

        // And now the Knight's link relies on Kingdoms being in the group, so it cannot leave.
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PutAsJsonAsync(TypeRoute(w, w.Kingdoms), new EntityTypeRequest("Kingdoms", null, null, null, null, Groups: []))).StatusCode);

        // A Lore field filter on the field compares only with an entry the field allows.
        var filter = await w.Client.GetAsync($"/api/universes/{w.U}/entities?entityTypeId={w.Character}&field={Uri.EscapeDataString($"{field}:is:{blight}")}");
        Assert.Equal(HttpStatusCode.OK, filter.StatusCode);
        var wrongFilter = await w.Client.GetAsync($"/api/universes/{w.U}/entities?entityTypeId={w.Character}&field={Uri.EscapeDataString($"{field}:is:{mage.Id}")}");
        Assert.Equal(HttpStatusCode.BadRequest, wrongFilter.StatusCode);
    }

    [Fact]
    public async Task A_link_field_cannot_be_limited_to_a_group_and_a_type_at_once_or_on_another_kind()
    {
        var w = await NewWorld("etg-field-shape");
        var runes = await GroupNamed(w, "Runes");

        var both = await PostField(w, w.Character, Definition("Rune", w.Elemental, runes.Id));
        var onNumber = await PostField(w, w.Character, Definition("Power", null, runes.Id, EntityFieldKind.Number));
        Assert.Contains("not both", await ErrorOf(both, "targetGroupId"), StringComparison.Ordinal);
        Assert.Contains("link", await ErrorOf(onNumber, "targetGroupId"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Changing_a_fields_target_never_leaves_an_existing_link_outside_it()
    {
        var w = await NewWorld("etg-retarget");
        var runes = await GroupNamed(w, "Runes");
        var field = await AddField(w, w.Character, "Focus", groupId: null);
        var lava = await Entry(w, w.Elemental, "Lava Rune");
        await Entry(w, w.Character, "Mage", Link(field, lava));

        // Any -> group: allowed while every link is to a member.
        Assert.True((await PutField(w, w.Character, field, Definition("Focus", null, runes.Id))).IsSuccessStatusCode);

        // A link outside the group can no longer be written...
        var arkazia = await Entry(w, w.Kingdoms, "Arkazia");
        Assert.Equal(HttpStatusCode.BadRequest, (await PostEntry(w, w.Character, "Knight", Link(field, arkazia))).StatusCode);

        // ...so open it, link outside, and the group target is refused with the existing code - nothing cleared.
        Assert.True((await PutField(w, w.Character, field, Definition("Focus", null, null))).IsSuccessStatusCode);
        await Entry(w, w.Character, "Knight", Link(field, arkazia));
        var narrowed = await PutField(w, w.Character, field, Definition("Focus", null, runes.Id));
        Assert.Equal(HttpStatusCode.Conflict, narrowed.StatusCode);
        Assert.Equal(EntityTypeEndpoints.TargetConflictCode, await CodeOf(narrowed));
        Assert.Null((await FieldOf(w, w.Character, field)).TargetGroupId);

        // Group -> exact type is the existing narrowing rule: refused while a link is of another type.
        Assert.True((await PutField(w, w.Character, field, Definition("Focus", null, null))).IsSuccessStatusCode);
        var toType = await PutField(w, w.Character, field, Definition("Focus", w.Elemental, null));
        Assert.Equal(HttpStatusCode.Conflict, toType.StatusCode);

        // Both links survive every refusal.
        Assert.Equal(2, await LinkCount(field));
    }

    [Fact]
    public async Task Taking_a_type_out_of_a_group_is_refused_while_links_rely_on_it_and_allowed_once_they_do_not()
    {
        var w = await NewWorld("etg-leave");
        var runes = await GroupNamed(w, "Runes");
        var field = await AddField(w, w.Character, "Required Rune", groupId: runes.Id);
        var lava = await Entry(w, w.Elemental, "Lava Rune");
        var blight = await Entry(w, w.Corrupted, "Blight Rune");
        var mage = await Entry(w, w.Character, "Mage", Link(field, lava));

        // Corrupted Runes has no linked entry: it may leave freely, and come back.
        await SaveGroups(w, w.Corrupted, []);
        await SaveGroups(w, w.Corrupted, [new(runes.Id)]);

        // Elemental Runes may not: the Mage's link relies on it. Nothing changes, and the refusal names the field.
        var refused = await w.Client.PutAsJsonAsync(TypeRoute(w, w.Elemental), new EntityTypeRequest("Elemental Runes", null, null, null, null, Groups: []));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(EntityTypeGroupEndpoints.GroupInUseCode, await CodeOf(refused));
        var detail = await DetailOf(refused);
        Assert.Contains("\"Required Rune\" on Character", detail, StringComparison.Ordinal);
        Assert.Contains("1 link", detail, StringComparison.Ordinal);
        Assert.Contains(w.Elemental, (await GroupNamed(w, "Runes")).TypeIds);
        Assert.Equal(1, await LinkCount(field));

        // A link from an entry in the Trash still counts: it comes back with the entry.
        await w.Client.DeleteAsync($"/api/universes/{w.U}/entities/{mage.Id}");
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PutAsJsonAsync(TypeRoute(w, w.Elemental), new EntityTypeRequest("Elemental Runes", null, null, null, null, Groups: []))).StatusCode);

        // Once the link points elsewhere, the type leaves.
        Assert.True((await w.Client.PostAsync($"/api/universes/{w.U}/trash/{mage.Id}/restore", null)).IsSuccessStatusCode);
        var restored = (await w.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{w.U}/entities/{mage.Id}"))!;
        Assert.True((await w.Client.PutAsJsonAsync(
            $"/api/universes/{w.U}/entities/{mage.Id}",
            new EntityRequest(w.Character, "Mage", null, CanonStatus.Canon, null, null, [Link(field, blight)], ExpectedVersion: restored.Version))).IsSuccessStatusCode);
        await SaveGroups(w, w.Elemental, []);
        Assert.DoesNotContain(w.Elemental, (await GroupNamed(w, "Runes")).TypeIds);
    }

    // ---------- Changing a linked entry's own type ----------

    [Fact]
    public async Task An_entry_linked_through_a_group_cannot_change_to_a_type_outside_it_and_nothing_moves()
    {
        var w = await NewWorld("etg-retype-group");
        var runes = await GroupNamed(w, "Runes");
        var field = await AddField(w, w.Character, "Required Rune", groupId: runes.Id);
        var lava = await Entry(w, w.Elemental, "Lava Rune");
        await Entry(w, w.Character, "Mage", Link(field, lava));
        var before = await Snapshot(lava);

        var refused = await Retype(w, lava, w.Kingdoms);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(EntityEndpoints.TypeChangeLinkedCode, await CodeOf(refused));
        var detail = await DetailOf(refused);
        Assert.Contains("\"Required Rune\" on Character", detail, StringComparison.Ordinal);
        using (var problem = JsonDocument.Parse(await refused.Content.ReadAsStringAsync()))
        {
            Assert.Equal(field, problem.RootElement.GetProperty("fields")[0].GetProperty("fieldId").GetGuid());
        }

        // The entry keeps its type, version and history; the link stays.
        Assert.Equal(before, await Snapshot(lava));
        Assert.Equal(1, await LinkCount(field));

        // Within the group the move is an ordinary edit.
        Assert.Equal(HttpStatusCode.OK, (await Retype(w, lava, w.Corrupted)).StatusCode);
        Assert.Equal(w.Corrupted, (await w.Client.GetFromJsonAsync<EntityDetail>(EntryRoute(w, lava)))!.EntityTypeId);
    }

    [Fact]
    public async Task An_entry_linked_through_an_exact_type_field_keeps_that_type_and_an_open_field_never_blocks()
    {
        var w = await NewWorld("etg-retype-exact");
        var kingdom = await PostField(w, w.Character, Definition("Kingdom", typeId: w.Kingdoms));
        Assert.True(kingdom.IsSuccessStatusCode);
        var kingdomField = (await kingdom.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.Single(one => one.Name == "Kingdom").Id;
        var anything = await AddField(w, w.Character, "Anything", groupId: null);

        var arkazia = await Entry(w, w.Kingdoms, "Arkazia");
        var zandres = await Entry(w, w.Kingdoms, "Zandres");
        await Entry(w, w.Character, "Knight", Link(kingdomField, arkazia));
        await Entry(w, w.Character, "Wanderer", Link(anything, zandres));

        var refused = await Retype(w, arkazia, w.Elemental);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains("\"Kingdom\" on Character", await DetailOf(refused), StringComparison.Ordinal);
        Assert.Equal(w.Kingdoms, (await w.Client.GetFromJsonAsync<EntityDetail>(EntryRoute(w, arkazia)))!.EntityTypeId);

        // Linked only through a field open to any type: free to move.
        Assert.Equal(HttpStatusCode.OK, (await Retype(w, zandres, w.Elemental)).StatusCode);
    }

    [Fact]
    public async Task A_link_from_an_entry_in_the_Trash_still_holds_the_type_it_needs()
    {
        var w = await NewWorld("etg-retype-trash");
        var field = await AddField(w, w.Character, "Required Rune", groupId: (await GroupNamed(w, "Runes")).Id);
        var lava = await Entry(w, w.Elemental, "Lava Rune");
        var mage = await Entry(w, w.Character, "Mage", Link(field, lava));
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.DeleteAsync(EntryRoute(w, mage.Id))).StatusCode);

        Assert.Equal(HttpStatusCode.Conflict, (await Retype(w, lava, w.Kingdoms)).StatusCode);
        Assert.Equal(1, await LinkCount(field));
    }

    [Fact]
    public async Task A_backup_taken_after_an_allowed_retype_restores()
    {
        var w = await NewWorld("etg-retype-backup");
        var field = await AddField(w, w.Character, "Required Rune", groupId: (await GroupNamed(w, "Runes")).Id);
        var lava = await Entry(w, w.Elemental, "Lava Rune");
        await Entry(w, w.Character, "Mage", Link(field, lava));
        Assert.Equal(HttpStatusCode.OK, (await Retype(w, lava, w.Corrupted)).StatusCode);

        var restored = await RestoreArchive(w.Client, await RawArchive(w.Client, w.U), "etg-retype-backup restored");
        var mage = (await w.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{restored.Id}/entities?search=Mage&pageSize=50"))!.Items.Single();
        var restoredMage = (await w.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{restored.Id}/entities/{mage.Id}"))!;
        Assert.NotNull(restoredMage.Fields.Single(value => value.Name == "Required Rune").ReferencedEntityId);
    }

    // ---------- Deleting a group ----------

    [Fact]
    public async Task A_group_a_field_targets_cannot_be_deleted_and_an_unused_one_goes_with_its_memberships_only()
    {
        var w = await NewWorld("etg-delete");
        var runes = await GroupNamed(w, "Runes");
        var field = await AddField(w, w.Character, "Required Rune", groupId: runes.Id);
        await AddField(w, w.Kingdoms, "Treasure", groupId: runes.Id);
        await Entry(w, w.Character, "Mage", Link(field, await Entry(w, w.Elemental, "Lava Rune")));

        var refused = await w.Client.DeleteAsync($"{GroupsRoute(w)}/{runes.Id}");
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(EntityTypeGroupEndpoints.GroupTargetedCode, await CodeOf(refused));
        using (var problem = JsonDocument.Parse(await refused.Content.ReadAsStringAsync()))
        {
            Assert.Equal(
                ["Character: Required Rune", "Kingdoms: Treasure"],
                problem.RootElement.GetProperty("fields").EnumerateArray()
                    .Select(one => $"{one.GetProperty("typeName").GetString()}: {one.GetProperty("fieldName").GetString()}"));
        }

        // Still there, the field still limited and the link untouched: nothing was opened to any type.
        Assert.Equal(runes.Id, (await FieldOf(w, w.Character, field)).TargetGroupId);
        Assert.Equal(1, await LinkCount(field));

        // Changing the fields first is the way through: the group goes, the types stay, their entries too.
        await PutField(w, w.Character, field, Definition("Required Rune", w.Elemental, null));
        var treasure = (await TypesOf(w.Client, w.U)).Single(type => type.Id == w.Kingdoms).Fields.Single();
        await PutField(w, w.Kingdoms, treasure.Id, Definition("Treasure", null, null));
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.DeleteAsync($"{GroupsRoute(w)}/{runes.Id}")).StatusCode);

        Assert.DoesNotContain(await GroupsOf(w), group => group.Id == runes.Id);
        Assert.Contains(await TypesOf(w.Client, w.U), type => type.Id == w.Elemental);
        Assert.Single(await Listed(w, $"entityTypeId={w.Elemental}"));
    }

    // ---------- Lore filtering ----------

    [Fact]
    public async Task Lore_filters_by_a_group_across_its_types_and_by_one_type_exactly_with_search_and_pages_intact()
    {
        var w = await NewWorld("etg-filter");
        var runes = await GroupNamed(w, "Runes");
        for (var i = 0; i < 3; i++)
        {
            await Entry(w, w.Elemental, $"Ember {i}");
            await Entry(w, w.Corrupted, $"Blight {i}");
        }

        await Entry(w, w.Kingdoms, "Ember Kingdom");

        Assert.Equal(6, (await Page(w, $"entityTypeGroupId={runes.Id}")).TotalCount);
        Assert.Equal(3, (await Page(w, $"entityTypeId={w.Elemental}")).TotalCount);

        // Search and pages work inside a group as they do inside a type.
        Assert.Equal(["Ember 0", "Ember 1", "Ember 2"], (await Listed(w, $"entityTypeGroupId={runes.Id}", "search=Ember")).Select(item => item.Name).Order(StringComparer.Ordinal));
        var first = await Page(w, $"entityTypeGroupId={runes.Id}", "pageSize=4", "page=1");
        var second = await Page(w, $"entityTypeGroupId={runes.Id}", "pageSize=4", "page=2");
        Assert.Equal((6, 2, 4, 2), (first.TotalCount, first.TotalPages, first.Items.Count, second.Items.Count));
        Assert.Empty(first.Items.Select(item => item.Id).Intersect(second.Items.Select(item => item.Id)));

        // An empty group lists nothing; a membership change shows at once.
        await SaveGroups(w, w.Kingdoms, [new(null, "Realms")]);
        var realms = await GroupNamed(w, "Realms");
        Assert.Single(await Listed(w, $"entityTypeGroupId={realms.Id}"));
        await SaveGroups(w, w.Kingdoms, []);
        Assert.Empty(await Listed(w, $"entityTypeGroupId={realms.Id}"));
        await SaveGroups(w, w.Corrupted, []);
        Assert.Equal(3, (await Page(w, $"entityTypeGroupId={runes.Id}")).TotalCount);
    }

    // ---------- Family Tree stays per type ----------

    [Fact]
    public async Task Joining_a_group_never_changes_family_tree_eligibility()
    {
        var w = await NewWorld("etg-family");
        var characters = await GroupNamed(w, "Characters");
        await SaveGroups(w, w.Kingdoms, [new(characters.Id)]);

        var types = await TypesOf(w.Client, w.U);
        Assert.False(types.Single(type => type.Id == w.Kingdoms).FamilyTreeEligible);
        Assert.True(types.Single(type => type.Id == w.Character).FamilyTreeEligible);

        await Entry(w, w.Kingdoms, "Arkazia");
        Assert.DoesNotContain(await Listed(w, "familyTreeEligible=true"), item => item.Name == "Arkazia");
    }

    // ---------- Permissions ----------

    [Fact]
    public async Task Only_members_who_edit_change_groups_and_every_member_reads_them()
    {
        var w = await CollaborationTestClient.NewSharedWorld(_factory, "etg-roles");
        var groups = $"/api/universes/{w.U}/entity-type-groups";
        var runes = (await w.Owner.GetFromJsonAsync<List<EntityTypeGroupResponse>>(groups))!.Single(group => group.Name == "Characters");

        foreach (var who in new[] { Who.Reviewer, Who.Viewer })
        {
            Assert.Equal(HttpStatusCode.OK, (await w.Client(who).GetAsync(groups)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await w.Client(who).PutAsJsonAsync($"{groups}/{runes.Id}", new EntityTypeGroupRenameRequest("Mine"))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await w.Client(who).DeleteAsync($"{groups}/{runes.Id}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await w.Client(who).PutAsJsonAsync(
                $"/api/universes/{w.U}/entity-types/{w.CharacterType}",
                new EntityTypeRequest("Character", null, "character", null, null, Groups: [new(null, "Sneaky")]))).StatusCode);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await w.Outsider.GetAsync(groups)).StatusCode);
        Assert.True((await w.Editor.PutAsJsonAsync($"{groups}/{runes.Id}", new EntityTypeGroupRenameRequest("People"))).IsSuccessStatusCode);
        Assert.DoesNotContain((await w.Owner.GetFromJsonAsync<List<EntityTypeGroupResponse>>(groups))!, group => group.Name == "Sneaky");
    }

    // ---------- Backup ----------

    [Fact]
    public async Task A_backup_carries_groups_memberships_and_group_targets_and_a_restore_maps_them_to_new_ids()
    {
        var w = await NewWorld("etg-backup");
        var runes = await GroupNamed(w, "Runes");
        var field = await AddField(w, w.Character, "Required Rune", groupId: runes.Id);
        await Entry(w, w.Character, "Mage", Link(field, await Entry(w, w.Elemental, "Lava Rune")));

        var archive = await RawArchive(w.Client, w.U);
        var backup = BackupOf(archive);
        Assert.Equal(25, backup.FormatVersion);
        var carried = backup.Payload.EntityTypeGroups!.Single(group => group.Id == runes.Id);
        Assert.Equal(new[] { w.Corrupted, w.Elemental }.Order(), carried.TypeIds.Order());
        Assert.Equal(runes.Id, backup.Payload.EntityTypes.Single(type => type.Id == w.Character).Fields.Single(one => one.Id == field).TargetGroupId);

        foreach (var name in new[] { "etg-backup one", "etg-backup two" })
        {
            var restored = await RestoreArchive(w.Client, archive, name);
            var types = await TypesOf(w.Client, restored.Id);
            var groups = await GroupsOf(w.Client, restored.Id);
            var restoredRunes = groups.Single(group => group.Name == "Runes");
            Assert.NotEqual(runes.Id, restoredRunes.Id);
            Assert.Equal(
                types.Where(type => type.Name is "Elemental Runes" or "Corrupted Runes").Select(type => type.Id).Order(),
                restoredRunes.TypeIds.Order());
            var restoredField = types.Single(type => type.Name == "Character").Fields.Single(one => one.Name == "Required Rune");
            Assert.Equal(restoredRunes.Id, restoredField.TargetGroupId);

            // Nothing points back at the source universe.
            var document = DocumentOf(await RawArchive(w.Client, restored.Id));
            Assert.DoesNotContain(runes.Id.ToString(), document, StringComparison.OrdinalIgnoreCase);

            // The restored field holds its limit.
            var restoredWorld = w with { U = restored.Id };
            var kingdom = await Entry(restoredWorld, types.Single(type => type.Name == "Kingdoms").Id, "Arkazia");
            Assert.Equal(HttpStatusCode.BadRequest, (await PostEntry(restoredWorld, types.Single(type => type.Name == "Character").Id, "Knight", Link(restoredField.Id, kingdom))).StatusCode);
        }
    }

    [Fact]
    public async Task A_version_22_backup_restores_without_groups_and_nothing_is_inferred()
    {
        var w = await NewWorld("etg-v22");
        await AddField(w, w.Character, "Required Rune", groupId: (await GroupNamed(w, "Runes")).Id);

        var restored = await RestoreArchive(w.Client, Downgrade(await RawArchive(w.Client, w.U), 22), "etg-v22 restored");
        Assert.Empty(await GroupsOf(w.Client, restored.Id));
        var field = (await TypesOf(w.Client, restored.Id)).Single(type => type.Name == "Character").Fields.Single(one => one.Name == "Required Rune");
        Assert.Null(field.TargetGroupId);
    }

    [Fact]
    public async Task A_backup_whose_groups_do_not_hold_is_refused()
    {
        var w = await NewWorld("etg-malformed");
        var runes = await GroupNamed(w, "Runes");
        var field = await AddField(w, w.Character, "Required Rune", groupId: runes.Id);
        var arkazia = await Entry(w, w.Kingdoms, "Arkazia");
        await Entry(w, w.Character, "Mage", Link(field, await Entry(w, w.Elemental, "Lava Rune")));
        var archive = await RawArchive(w.Client, w.U);

        JsonObject FieldNode(JsonObject root) =>
            Payload(root)["entityTypes"]!.AsArray()
                .SelectMany(type => type!["fields"]!.AsArray())
                .Single(one => Guid.Parse(one!["id"]!.GetValue<string>()) == field)!.AsObject();

        JsonObject GroupNode(JsonObject root) =>
            Payload(root)["entityTypeGroups"]!.AsArray().Single(group => Guid.Parse(group!["id"]!.GetValue<string>()) == runes.Id)!.AsObject();

        var unknownGroup = Rewrite(archive, root => FieldNode(root)["targetGroupId"] = Guid.NewGuid().ToString());
        var bothTargets = Rewrite(archive, root => FieldNode(root)["targetEntityTypeId"] = w.Elemental.ToString());
        var unknownMember = Rewrite(archive, root => GroupNode(root)["typeIds"]!.AsArray().Add(Guid.NewGuid().ToString()));
        var outside = Rewrite(archive, root =>
        {
            foreach (var value in Payload(root)["entities"]!.AsArray().SelectMany(entity => entity!["fieldValues"]!.AsArray()))
            {
                if (Guid.Parse(value!["fieldDefinitionId"]!.GetValue<string>()) == field)
                {
                    value["referencedEntityId"] = arkazia.ToString();
                }
            }
        });
        var duplicateName = Rewrite(archive, root =>
        {
            var groups = Payload(root)["entityTypeGroups"]!.AsArray();
            groups.Add(new JsonObject
            {
                ["id"] = Guid.NewGuid().ToString(),
                ["name"] = "Runes",
                ["createdAt"] = "2026-10-19T00:00:00Z",
                ["updatedAt"] = "2026-10-19T00:00:00Z",
                ["typeIds"] = new JsonArray(),
            });
        });
        var tooOld = Rewrite(archive, root => root["formatVersion"] = 22);

        foreach (var (file, word) in new[]
        {
            (unknownGroup, "type group the backup does not hold"),
            (bothTargets, "both one type and a type group"),
            (unknownMember, "holds an entry type the backup does not hold"),
            (outside, "does not allow"),
            (duplicateName, "both called"),
            (tooOld, "cannot say"),
        })
        {
            var refusal = await Refused(await Validate(w.Client, file));
            Assert.Contains(refusal.Issues, issue => issue.Message.Contains(word, StringComparison.Ordinal));
        }
    }

    // ---------- Steps ----------

    private static string EntryRoute(World w, Guid entityId) => $"/api/universes/{w.U}/entities/{entityId}";

    /// <summary>Saves the entry exactly as it is, under another type.</summary>
    private static async Task<HttpResponseMessage> Retype(World w, Guid entityId, Guid typeId)
    {
        var entry = (await w.Client.GetFromJsonAsync<EntityDetail>(EntryRoute(w, entityId)))!;
        return await w.Client.PutAsJsonAsync(
            EntryRoute(w, entityId),
            new EntityRequest(typeId, entry.Name, entry.Summary, entry.CanonStatus, null, null, [], ExpectedVersion: entry.Version));
    }

    /// <summary>An entry's type, version and number of saved versions, read from the database.</summary>
    private async Task<string> Snapshot(Guid entityId)
    {
        var snapshot = string.Empty;
        await WithDb(_factory, async db =>
        {
            var entry = await db.Entities.AsNoTracking().SingleAsync(one => one.Id == entityId);
            snapshot = $"{entry.EntityTypeId}:{entry.Version}:{await db.EntityRevisions.CountAsync(one => one.EntityId == entityId)}";
        });
        return snapshot;
    }

    /// <summary>
    /// A world with Character (the starter), two rune types in a group called Runes - made by the first type's own save, and
    /// joined by the second by id - and Kingdoms, in no group.
    /// </summary>
    private async Task<World> NewWorld(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var character = (await TypesOf(client, universe.Id)).Single(type => type.Name == "Character").Id;
        var elemental = (await PostJson<EntityTypeResponse>(client, $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Elemental Runes", null, null, null, null, Groups: [new(null, "Runes")]))).Id;
        var runes = (await GroupsOf(client, universe.Id)).Single(group => group.Name == "Runes").Id;
        var corrupted = (await PostJson<EntityTypeResponse>(client, $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Corrupted Runes", null, null, null, null, Groups: [new(runes)]))).Id;
        var kingdoms = await NewType(client, universe.Id, "Kingdoms");
        return new World(client, universe.Id, character, elemental, corrupted, kingdoms);
    }

    private static async Task<Guid> NewType(HttpClient client, Guid universeId, string name) =>
        (await PostJson<EntityTypeResponse>(client, $"/api/universes/{universeId}/entity-types", new EntityTypeRequest(name, null, null, null, null))).Id;

    private static string TypesRoute(World w) => $"/api/universes/{w.U}/entity-types";

    private static string TypeRoute(World w, Guid typeId) => $"{TypesRoute(w)}/{typeId}";

    private static string GroupsRoute(World w) => $"/api/universes/{w.U}/entity-type-groups";

    private static async Task<List<EntityTypeResponse>> TypesOf(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;

    private static async Task<List<EntityTypeGroupResponse>> GroupsOf(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeGroupResponse>>($"/api/universes/{universeId}/entity-type-groups"))!;

    private static Task<List<EntityTypeGroupResponse>> GroupsOf(World w) => GroupsOf(w.Client, w.U);

    private static async Task<EntityTypeGroupResponse> GroupNamed(World w, string name) =>
        (await GroupsOf(w)).Single(group => group.Name == name);

    private static async Task PutType(World w, Guid typeId, EntityTypeRequest request)
    {
        var response = await w.Client.PutAsJsonAsync(TypeRoute(w, typeId), request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    /// <summary>Saves the type exactly as it is, with this whole set of groups.</summary>
    private static async Task SaveGroups(World w, Guid typeId, EntityTypeGroupChoice[] groups)
    {
        var type = (await TypesOf(w.Client, w.U)).Single(one => one.Id == typeId);
        await PutType(w, typeId, new EntityTypeRequest(type.Name, type.Description, type.Icon, type.AccentColor, null, Groups: groups));
    }

    private static FieldDefinitionRequest Definition(string name, Guid? typeId = null, Guid? groupId = null, EntityFieldKind kind = EntityFieldKind.EntityReference) =>
        new(name, kind, false, null, null, null, TargetEntityTypeId: typeId, TargetGroupId: groupId);

    private static Task<HttpResponseMessage> PostField(World w, Guid typeId, FieldDefinitionRequest request) =>
        w.Client.PostAsJsonAsync($"{TypeRoute(w, typeId)}/fields", request);

    private static Task<HttpResponseMessage> PutField(World w, Guid typeId, Guid fieldId, FieldDefinitionRequest request) =>
        w.Client.PutFieldAsync(w.U, typeId, fieldId, request);

    private static async Task<Guid> AddField(World w, Guid typeId, string name, Guid? groupId)
    {
        var response = await PostField(w, typeId, Definition(name, null, groupId));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.Single(field => field.Name == name).Id;
    }

    private static async Task<FieldDefinitionResponse> FieldOf(World w, Guid typeId, Guid fieldId) =>
        (await TypesOf(w.Client, w.U)).Single(type => type.Id == typeId).Fields.Single(field => field.Id == fieldId);

    private async Task<int> LinkCount(Guid fieldId)
    {
        var count = 0;
        await WithDb(_factory, async db => count = await db.EntityFieldValues.CountAsync(value => value.FieldDefinitionId == fieldId && value.ReferencedEntityId != null));
        return count;
    }

    private static FieldValueInput Link(Guid fieldId, Guid entityId) => new(fieldId, null, null, null, null, null, entityId);

    private static Task<HttpResponseMessage> PostEntry(World w, Guid typeId, string name, params FieldValueInput[] fields) =>
        w.Client.PostAsJsonAsync($"/api/universes/{w.U}/entities", new EntityRequest(typeId, name, null, CanonStatus.Canon, null, null, fields));

    private static async Task<Guid> Entry(World w, Guid typeId, string name) => (await Entry(w, typeId, name, [])).Id;

    private static async Task<EntityDetail> Entry(World w, Guid typeId, string name, params FieldValueInput[] fields)
    {
        var response = await PostEntry(w, typeId, name, fields);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<EntityPage> Page(World w, params string[] query)
    {
        var response = await w.Client.GetAsync($"/api/universes/{w.U}/entities?{string.Join("&", query)}");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityPage>())!;
    }

    private static async Task<IReadOnlyList<EntitySummary>> Listed(World w, params string[] query) =>
        (await Page(w, [.. query, "pageSize=50"])).Items;

    private static async Task<string> ErrorOf(HttpResponseMessage response, string key)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.GetProperty("errors").GetProperty(key)[0].GetString()!;
    }

    private static async Task<string?> CodeOf(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    private static async Task<string> DetailOf(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.GetProperty("detail").GetString()!;
    }
}
