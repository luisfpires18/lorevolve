using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>The Trailer and Teaser structure (#292): one rule entry on #290's engine, segments of shots.</summary>
public sealed class TrailerStructureTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task SegmentsCanBeCreatedAtTheRoot()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trlroot");
        var trailer = await NewProject(client, universe.Id);

        await Add(client, trailer.Id, "segment", null, "Cold open");

        var tree = await Tree(client, trailer.Id);
        Assert.Equal(["segment"], tree.Roots);
        await Refused(await Post(client, trailer.Id, new ProjectNodeRequest("shot", null, null, null, null)));
    }

    [Fact]
    public async Task Segments_hold_ordered_shots_and_nothing_else()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trlord");
        var trailer = await NewProject(client, universe.Id);
        var first = await Add(client, trailer.Id, "segment", null, "One");
        var second = await Add(client, trailer.Id, "segment", null, "Two");
        await Add(client, trailer.Id, "shot", first.Id, "A");
        await Add(client, trailer.Id, "shot", first.Id, "B");
        var c = await Add(client, trailer.Id, "shot", first.Id, "C");

        await Move(client, trailer.Id, c.Id, new ProjectNodeMove(0, first.Id));
        await Move(client, trailer.Id, second.Id, new ProjectNodeMove(0));

        var tree = await Tree(client, trailer.Id);
        Assert.Equal(["C", "A", "B"], Ordered(tree, first.Id).Select(node => node.Title));
        Assert.Equal(["Two", "One"], Ordered(tree, null).Select(node => node.Title));
        await Refused(await Post(client, trailer.Id, new ProjectNodeRequest("shot", c.Id, null, null, null)));
        await Refused(await Post(client, trailer.Id, new ProjectNodeRequest("segment", first.Id, null, null, null)));
    }

    [Fact]
    public async Task Shot_text_survives_a_fresh_read_and_a_stale_save_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trltxt");
        var trailer = await NewProject(client, universe.Id);
        var segment = await Add(client, trailer.Id, "segment");
        var shot = await Add(client, trailer.Id, "shot", segment.Id);

        var response = await client.PutAsJsonAsync(
            $"/api/projects/{trailer.Id}/structure/{shot.Id}",
            new ProjectNodeUpdate("Door", "She opens it.", "Line one\nLine two\n\nLine four", 1));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());

        var read = (await client.GetFromJsonAsync<ProjectNodeDetail>($"/api/projects/{trailer.Id}/structure/{shot.Id}"))!;
        Assert.Equal("Door", read.Title);
        Assert.Equal("She opens it.", read.Summary);
        Assert.Equal("Line one\nLine two\n\nLine four", read.Body);
        Assert.Equal(2, read.Version);

        var stale = await client.PutAsJsonAsync(
            $"/api/projects/{trailer.Id}/structure/{shot.Id}",
            new ProjectNodeUpdate("Other", null, null, 1));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task A_shot_moves_to_another_segment_with_its_body_and_never_into_itself()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trlmv");
        var trailer = await NewProject(client, universe.Id);
        var first = await Add(client, trailer.Id, "segment");
        var second = await Add(client, trailer.Id, "segment");
        var shot = await Add(client, trailer.Id, "shot", first.Id);
        var put = await client.PutAsJsonAsync(
            $"/api/projects/{trailer.Id}/structure/{shot.Id}",
            new ProjectNodeUpdate("Kept", null, "Body stays", 1));
        Assert.True(put.IsSuccessStatusCode);

        await Move(client, trailer.Id, shot.Id, new ProjectNodeMove(0, second.Id));

        var read = (await client.GetFromJsonAsync<ProjectNodeDetail>($"/api/projects/{trailer.Id}/structure/{shot.Id}"))!;
        Assert.Equal(second.Id, read.ParentId);
        Assert.Equal("Body stays", read.Body);
        Assert.False((await MoveResponse(client, trailer.Id, shot.Id, new ProjectNodeMove(0, shot.Id))).IsSuccessStatusCode);
    }

    [Fact]
    public async Task A_standalone_trailer_with_no_film_or_series_builds_a_structure()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "trlalone");
        var trailer = await NewProject(client, universe.Id);

        Assert.Equal("trailer", trailer.Format);
        var segment = await Add(client, trailer.Id, "segment");
        await Add(client, trailer.Id, "shot", segment.Id);
        Assert.Equal(2, (await Tree(client, trailer.Id)).Nodes.Count);
    }

    [Fact]
    public void Other_formats_keep_their_rules()
    {
        Assert.Equal(["act"], ProjectStructures.For("feature-film")!.Roots);
        Assert.Equal(["scene"], ProjectStructures.For("short-film")!.Roots);
        Assert.Equal(["scene"], ProjectStructures.For("special")!.Roots);
        Assert.Equal(["issue"], ProjectStructures.For("western-comic")!.Roots);
        Assert.Equal(["season"], ProjectStructures.For("tv-show")!.Roots);
        Assert.Equal(["episode"], ProjectStructures.For("limited-series")!.Roots);
        Assert.Equal(["segment"], ProjectStructures.For("trailer")!.Roots);
        Assert.Null(ProjectStructures.For("unknown-format"));
        Assert.Null(ProjectStructures.For(null));
    }

    private static async Task Refused(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, $"{(int)response.StatusCode}: {text}");
        Assert.Contains("\"level\"", text);
    }

    private static async Task<ProjectDetail> NewProject(HttpClient client, Guid universeId)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest("Salt Trailer", ProjectKind.Film, ProjectLifecycle.Active, null, null, universeId, null, "trailer"));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static Task<HttpResponseMessage> Post(HttpClient client, Guid projectId, ProjectNodeRequest request) =>
        client.PostAsJsonAsync($"/api/projects/{projectId}/structure", request);

    private static async Task<ProjectNodeDetail> Add(HttpClient client, Guid projectId, string level, Guid? parentId = null, string? title = null)
    {
        var response = await Post(client, projectId, new ProjectNodeRequest(level, parentId, title, null, null));
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProjectNodeDetail>())!;
    }

    private static async Task<ProjectStructureTree> Tree(HttpClient client, Guid projectId) =>
        (await client.GetFromJsonAsync<ProjectStructureTree>($"/api/projects/{projectId}/structure"))!;

    private static List<ProjectNodeSummary> Ordered(ProjectStructureTree tree, Guid? parentId) =>
        [.. tree.Nodes.Where(node => node.ParentId == parentId).OrderBy(node => node.SortOrder)];

    private static Task<HttpResponseMessage> MoveResponse(HttpClient client, Guid projectId, Guid nodeId, ProjectNodeMove move) =>
        client.PostAsJsonAsync($"/api/projects/{projectId}/structure/{nodeId}/move", move);

    private static async Task Move(HttpClient client, Guid projectId, Guid nodeId, ProjectNodeMove move)
    {
        var response = await MoveResponse(client, projectId, nodeId, move);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }
}
