using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Lore's front page (Issue #60, ADR 0065) counts a type's card from <see cref="EntityTypeResponse.ListedEntityCount"/>
/// summed over its branch. That has to be exactly what the type's list then shows: no entry in the Trash and none marked
/// archived - which only an older backup can bring in - while <see cref="EntityTypeResponse.EntityCount"/> keeps counting
/// everything the type's deletion is refused for.
/// </summary>
public sealed class LoreCatalogCountTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_branch_count_is_what_the_list_shows_with_trashed_and_archived_entries_from_an_older_backup()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "catalog-count");
        var u = universe.Id;
        var runes = await NewType(client, u, "Runes", null);
        var nature = await NewType(client, u, "Nature Runes", runes);
        var verdant = await NewType(client, u, "Verdant Runes", nature);

        // Each type: one live entry, one entry later archived by the older backup, and - for two of them - one in the Trash.
        foreach (var (type, name) in new[]
        {
            (runes, "Old Rune"), (runes, "Ash Rune"), (runes, "Lost Rune"),
            (nature, "Life Rune"), (nature, "Ember Rune"),
            (verdant, "Moss Rune"), (verdant, "Fern Rune"), (verdant, "Rot Rune"),
        })
        {
            await Entry(client, u, type, name);
        }

        foreach (var name in new[] { "Lost Rune", "Rot Rune" })
        {
            (await client.DeleteAsync($"/api/universes/{u}/entities/{await IdOf(client, u, name)}")).EnsureSuccessStatusCode();
        }

        // An older backup (format 22, before semantic groups) whose entries were archived when it was made.
        var older = Downgrade(
            Rewrite(await RawArchive(client, u), root =>
            {
                foreach (var name in new[] { "Ash Rune", "Ember Rune", "Fern Rune" })
                {
                    EntityNamed(root, name)["isArchived"] = true;
                }
            }),
            22);
        var restored = (await RestoreArchive(client, older, "catalog-count restored")).Id;

        await WithDb(_factory, async db => Assert.Equal(
            ["Ash Rune", "Ember Rune", "Fern Rune"],
            await db.Entities.Where(entity => entity.UniverseId == restored && entity.IsArchived).Select(entity => entity.Name).OrderBy(name => name).ToListAsync()));

        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{restored}/entity-types"))!
            .Where(type => type.Name.EndsWith("Runes", StringComparison.Ordinal))
            .ToDictionary(type => type.Name);

        // Each type's own entries: everything for deletion, only the listed ones for the card.
        Assert.Equal((3, 1, 1), (types["Runes"].EntityCount, types["Runes"].TrashedEntityCount, types["Runes"].ListedEntityCount));
        Assert.Equal((2, 0, 1), (types["Nature Runes"].EntityCount, types["Nature Runes"].TrashedEntityCount, types["Nature Runes"].ListedEntityCount));
        Assert.Equal((3, 1, 1), (types["Verdant Runes"].EntityCount, types["Verdant Runes"].TrashedEntityCount, types["Verdant Runes"].ListedEntityCount));

        // The card's sum over the branch is the list's own total, at every level.
        var parentOf = types.Values.ToDictionary(type => type.Id, type => type.ParentId);
        foreach (var type in types.Values)
        {
            var branch = EntityTypeHierarchy.Branch(parentOf, type.Id);
            var card = types.Values.Where(each => branch.Contains(each.Id)).Sum(each => each.ListedEntityCount);
            var list = (await client.GetFromJsonAsync<EntityPage>(
                $"/api/universes/{restored}/entities?entityTypeId={type.Id}&includeDescendants=true&pageSize=50"))!;
            Assert.Equal(list.TotalCount, card);
            Assert.DoesNotContain(list.Items, item => item.Name is "Ash Rune" or "Ember Rune" or "Fern Rune" or "Lost Rune" or "Rot Rune");
        }

        Assert.Equal(3, types.Values.Sum(type => type.ListedEntityCount));

        // Counts are read only by the universe's members.
        var (outsider, _) = await SignedInWithUniverse(_factory, "catalog-count-outsider");
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/universes/{restored}/entity-types")).StatusCode);
    }

    private static async Task<Guid> NewType(HttpClient client, Guid u, string name, Guid? parent) =>
        (await PostJson<EntityTypeResponse>(
            client,
            $"/api/universes/{u}/entity-types",
            new EntityTypeRequest(name, null, null, null, null, Parent: parent is null ? null : new EntityTypeParentChoice(parent)))).Id;

    private static Task<EntityDetail> Entry(HttpClient client, Guid u, Guid type, string name) =>
        PostJson<EntityDetail>(client, $"/api/universes/{u}/entities", new EntityRequest(type, name, null, CanonStatus.Canon, null, null, null));

    private static async Task<Guid> IdOf(HttpClient client, Guid u, string name) =>
        (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{u}/entities?search={Uri.EscapeDataString(name)}&pageSize=50"))!
            .Items.Single(item => item.Name == name).Id;
}
