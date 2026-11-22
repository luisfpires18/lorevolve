using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Trash;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The Lore list's tools on a project's entries: exact name search, field filters on the project's own fields, and
/// moving a selection to the universe's Trash together, all or nothing, where it restores and erases like a lore entry.
/// </summary>
public sealed class ProjectEntityListToolsTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Exact_search_and_field_filters_narrow_a_projects_list()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "projlisttools");
        var project = await ProjectEntityTests.NewProject(client, universe.Id, "Hollow Season");
        var type = await ProjectEntityTests.NewType(client, project.Id, "Rune");
        var withPower = await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entity-types/{type.Id}/fields", new ProjectEntityFieldRequest("Power", EntityFieldKind.Number));
        var power = (await withPower.Content.ReadFromJsonAsync<ProjectEntityTypeResponse>())!.Fields.Single().Id;

        await ProjectEntityTests.NewEntry(client, project.Id, type.Id, "Ember", fields: [new(power, null, 3, null, null, null, null)]);
        await ProjectEntityTests.NewEntry(client, project.Id, type.Id, "Ember Shard", fields: [new(power, null, 8, null, null, null, null)]);

        var loose = await Read(client, project.Id, $"typeId={type.Id}&q=ember");
        Assert.Equal(2, loose.TotalCount);

        var exact = await Read(client, project.Id, $"typeId={type.Id}&q=EMBER&exact=true");
        Assert.Equal(["Ember"], exact.Items.Select(item => item.Name));

        var strong = await Read(client, project.Id, $"typeId={type.Id}&field={power}:gt:5");
        Assert.Equal(["Ember Shard"], strong.Items.Select(item => item.Name));

        // A field of another scope (or none) is refused rather than dropped.
        var refused = await client.GetAsync($"/api/projects/{project.Id}/entities?typeId={type.Id}&field={Guid.NewGuid()}:gt:5");
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
    }

    [Fact]
    public async Task A_selection_goes_to_the_universe_Trash_together_and_comes_back_from_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "projbulkdelete");
        var project = await ProjectEntityTests.NewProject(client, universe.Id, "Hollow Season");
        var other = await ProjectEntityTests.NewProject(client, universe.Id, "Other Game");
        var type = await ProjectEntityTests.NewType(client, project.Id, "Unit");
        var otherType = await ProjectEntityTests.NewType(client, other.Id, "Unit");
        var a = await ProjectEntityTests.NewEntry(client, project.Id, type.Id, "A");
        var b = await ProjectEntityTests.NewEntry(client, project.Id, type.Id, "B");
        var c = await ProjectEntityTests.NewEntry(client, project.Id, type.Id, "C");
        var elsewhere = await ProjectEntityTests.NewEntry(client, other.Id, otherType.Id, "Elsewhere");

        // One id from another project refuses the whole request.
        var mixed = await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entities/bulk-trash", new BulkTrashRequest([a.Id, elsewhere.Id]));
        Assert.Equal(HttpStatusCode.BadRequest, mixed.StatusCode);
        Assert.Equal(3, (await Read(client, project.Id, "")).TotalCount);
        Assert.Equal(1, (await Read(client, other.Id, "")).TotalCount);

        var deleted = await client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/entities/bulk-trash", new BulkTrashRequest([a.Id, b.Id]));
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
        Assert.Equal(["C"], (await Read(client, project.Id, "")).Items.Select(item => item.Name));
        Assert.Equal(c.Id, (await Read(client, project.Id, "")).Items.Single().Id);

        // In the universe's Trash, with the project they came from.
        var trash = (await client.GetFromJsonAsync<TrashPage>($"/api/universes/{universe.Id}/trash"))!;
        var gone = trash.Items.Where(item => item.ProjectId == project.Id).ToList();
        Assert.Equal(["A", "B"], gone.Select(item => item.Name).Order());
        Assert.All(gone, item => Assert.Equal("Hollow Season", item.ProjectName));

        // Restored as a lore entry is: back in the project's list.
        var restored = await client.PostAsync($"/api/universes/{universe.Id}/trash/{a.Id}/restore", null);
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        Assert.Equal(["A", "C"], (await Read(client, project.Id, "")).Items.Select(item => item.Name));

        // Erased for good from the Trash, as a lore entry is.
        var erased = await client.DeleteAsync($"/api/universes/{universe.Id}/trash/{b.Id}");
        Assert.True(erased.IsSuccessStatusCode);
        var after = (await client.GetFromJsonAsync<TrashPage>($"/api/universes/{universe.Id}/trash"))!;
        Assert.DoesNotContain(after.Items, item => item.Id == b.Id);
    }

    private static async Task<ProjectEntityPage> Read(HttpClient client, Guid projectId, string query) =>
        (await client.GetFromJsonAsync<ProjectEntityPage>($"/api/projects/{projectId}/entities?{query}"))!;
}
