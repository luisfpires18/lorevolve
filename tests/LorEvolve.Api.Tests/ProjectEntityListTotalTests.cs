using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.ProjectEntities;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.ProjectEntityTests;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A project's entry list answers one page and the total of every entry that matches the same filters (#557), so the
/// web pages on the server as the Lore list does. Kept apart from <see cref="ProjectEntityTests"/>, which is at its
/// size limit, and built with its helpers.
///
/// <para>Written against the total that would be silently wrong: counted after the page instead of before it, counted
/// with a trashed entry or another project's entry, or counted without the type, branch or search the page used.</para>
/// </summary>
public sealed class ProjectEntityListTotalTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task The_entry_list_answers_the_total_of_the_same_filtered_set_with_each_page()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "entrytotal");
        var project = await NewProject(client, universe.Id, "Totals");
        var unit = await NewType(client, project.Id, "Unit");
        var elite = await SubType(client, project.Id, "Elite", unit.Id);
        var map = await NewType(client, project.Id, "Map");

        foreach (var name in new[] { "Alpha", "Bravo", "Brute", "Charlie", "Delta", "Echo", "Foxtrot" })
        {
            await NewEntry(client, project.Id, unit.Id, name);
        }

        await NewEntry(client, project.Id, elite.Id, "Brawler");
        await NewEntry(client, project.Id, elite.Id, "Duke");
        await NewEntry(client, project.Id, map.Id, "Bramble");

        // A trashed entry of the type and an entry of another project, both matching the search: never counted.
        var trashed = await NewEntry(client, project.Id, unit.Id, "Brass");
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/projects/{project.Id}/entities/{trashed.Id}")).StatusCode);
        var other = await NewProject(client, universe.Id, "Elsewhere");
        await NewEntry(client, other.Id, (await NewType(client, other.Id, "Unit")).Id, "Brave");

        var expected = new (string Query, int Total)[]
        {
            ("", 10),
            ($"typeId={unit.Id}", 7),
            ($"typeId={unit.Id}&includeDescendants=true", 9),
            ("q=bra", 3),
            ($"typeId={unit.Id}&q=bra", 1),
            ($"typeId={unit.Id}&includeDescendants=true&q=BRA", 2),
        };

        // The total is the filtered set's, whatever the order and the page: each sort, `recent`, and a page of 2.
        foreach (var (query, total) in expected)
        {
            foreach (var shape in new[] { "", "&sort=updated", "&sort=name", "&sort=created", "&recent=true", "&take=2" })
            {
                var page = await Read(client, project.Id, query + shape);
                Assert.Equal(total, page.TotalCount);
                Assert.Equal(Math.Min(total, shape == "&take=2" ? 2 : total), page.Items.Count);
                Assert.DoesNotContain(page.Items, entry => entry.Name is "Brass" or "Brave");
            }
        }
    }

    [Fact]
    public async Task The_entry_list_pages_first_middle_last_and_past_the_end_with_one_total()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "entrytotalpages");
        var project = await NewProject(client, universe.Id, "Pages");
        var unit = await NewType(client, project.Id, "Unit");
        var elite = await SubType(client, project.Id, "Elite", unit.Id);

        for (var index = 1; index <= 9; index++)
        {
            await NewEntry(client, project.Id, index <= 6 ? unit.Id : elite.Id, $"Entry {index:00}");
        }

        var branch = $"typeId={unit.Id}&includeDescendants=true";
        var unpaged = await Read(client, project.Id, branch);
        Assert.Equal(9, unpaged.Items.Count);

        var first = await Read(client, project.Id, $"{branch}&skip=0&take=4");
        var middle = await Read(client, project.Id, $"{branch}&skip=4&take=4");
        var last = await Read(client, project.Id, $"{branch}&skip=8&take=4");
        var past = await Read(client, project.Id, $"{branch}&skip=12&take=4");

        Assert.Equal([4, 4, 1, 0], new[] { first, middle, last, past }.Select(page => page.Items.Count));
        Assert.All(new[] { unpaged, first, middle, last, past }, page => Assert.Equal(9, page.TotalCount));

        // Together the pages hold every entry once, in the unpaged order.
        Assert.Equal(
            unpaged.Items.Select(entry => entry.Id),
            first.Items.Concat(middle.Items).Concat(last.Items).Select(entry => entry.Id));
    }

    [Fact]
    public async Task An_empty_entry_list_answers_no_items_and_a_total_of_zero()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "entrytotalempty");
        var project = await NewProject(client, universe.Id, "Empty");

        var none = await Read(client, project.Id, "");
        Assert.Empty(none.Items);
        Assert.Equal(0, none.TotalCount);

        var unit = await NewType(client, project.Id, "Unit");
        await NewEntry(client, project.Id, unit.Id, "Alpha");

        var noMatch = await Read(client, project.Id, $"typeId={unit.Id}&q=zzz");
        Assert.Empty(noMatch.Items);
        Assert.Equal(0, noMatch.TotalCount);
    }

    private static async Task<ProjectEntityPage> Read(HttpClient client, Guid projectId, string query) =>
        (await client.GetFromJsonAsync<ProjectEntityPage>($"/api/projects/{projectId}/entities?{query.TrimStart('&')}"))!;

    private static async Task<ProjectEntityTypeResponse> SubType(
        HttpClient client,
        Guid projectId,
        string name,
        Guid parentId)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/projects/{projectId}/entity-types",
            new ProjectEntityTypeRequest(name, null, null, null, parentId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectEntityTypeResponse>())!;
    }
}
