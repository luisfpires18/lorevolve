using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>The Comic hierarchies (#294): five rule entries on #290's engine, and the format-change guard.</summary>
public sealed class ComicStructureTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Theory]
    [InlineData("western-comic", "issue")]
    [InlineData("manga", "chapter")]
    [InlineData("webcomic", "episode")]
    public async Task Roots_keep_order_and_pages_hold_ordered_panels(string format, string root)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, $"cmc{format}");
        var comic = await NewProject(client, universe.Id, format);

        await Add(client, comic.Id, root, null, "One");
        await Add(client, comic.Id, root, null, "Two");
        var last = await Add(client, comic.Id, root, null, "Three");
        await Move(client, comic.Id, last.Id, new ProjectNodeMove(0));

        var tree = await Tree(client, comic.Id);
        Assert.Equal([root], tree.Roots);
        Assert.Equal(["Three", "One", "Two"], Ordered(tree, null).Select(node => node.Title));

        var page = await Add(client, comic.Id, "page", last.Id);
        await Add(client, comic.Id, "panel", page.Id, "A");
        await Add(client, comic.Id, "panel", page.Id, "B");
        var c = await Add(client, comic.Id, "panel", page.Id, "C");
        await Move(client, comic.Id, c.Id, new ProjectNodeMove(0, page.Id));

        tree = await Tree(client, comic.Id);
        Assert.Equal(["C", "A", "B"], Ordered(tree, page.Id).Select(node => node.Title));
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, comic.Id, new ProjectNodeRequest("panel", last.Id, null, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, comic.Id, new ProjectNodeRequest("panel", c.Id, null, null, null))).StatusCode);
    }

    [Fact]
    public async Task A_graphic_novel_takes_chapters_and_loose_pages()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cmcgn");
        var comic = await NewProject(client, universe.Id, "graphic-novel");

        var chapter = await Add(client, comic.Id, "chapter");
        await Add(client, comic.Id, "page", chapter.Id);
        await Add(client, comic.Id, "page");

        Assert.Equal(["chapter", "page"], (await Tree(client, comic.Id)).Roots);
    }

    [Fact]
    public async Task A_one_shot_takes_pages_only_at_the_root()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cmcos");
        var comic = await NewProject(client, universe.Id, "one-shot");

        await Add(client, comic.Id, "page");
        foreach (var level in new[] { "chapter", "issue" })
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, comic.Id, new ProjectNodeRequest(level, null, null, null, null))).StatusCode);
        }
    }

    [Fact]
    public async Task A_page_moves_between_issues_and_keeps_its_panels()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cmcmv");
        var comic = await NewProject(client, universe.Id, "western-comic");
        var other = await NewProject(client, universe.Id, "western-comic");
        var first = await Add(client, comic.Id, "issue");
        var second = await Add(client, comic.Id, "issue");
        var foreign = await Add(client, other.Id, "issue");
        var page = await Add(client, comic.Id, "page", first.Id);
        var panel = await Add(client, comic.Id, "panel", page.Id);

        await Move(client, comic.Id, page.Id, new ProjectNodeMove(0, second.Id));
        var tree = await Tree(client, comic.Id);
        Assert.Equal(second.Id, tree.Nodes.Single(node => node.Id == page.Id).ParentId);
        Assert.Equal(page.Id, tree.Nodes.Single(node => node.Id == panel.Id).ParentId);
        Assert.Single((await Tree(client, other.Id)).Nodes);

        Assert.False((await MoveResponse(client, comic.Id, page.Id, new ProjectNodeMove(0, foreign.Id))).IsSuccessStatusCode);
        Assert.False((await MoveResponse(client, comic.Id, page.Id, new ProjectNodeMove(0, panel.Id))).IsSuccessStatusCode);
        Assert.False((await MoveResponse(client, comic.Id, page.Id, new ProjectNodeMove(0, page.Id))).IsSuccessStatusCode);
    }

    [Fact]
    public void Cinema_rules_are_unchanged()
    {
        Assert.Equal(["act"], ProjectStructures.For("feature-film")!.Roots);
        Assert.Equal(["scene"], ProjectStructures.For("short-film")!.Roots);
        Assert.Equal(["scene"], ProjectStructures.For("special")!.Roots);
    }

    [Fact]
    public async Task A_format_change_that_would_hide_nodes_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cmcfc");
        var comic = await NewProject(client, universe.Id, "manga");

        // No nodes: free to change.
        comic = await Save(client, comic, "western-comic");
        comic = await Save(client, comic, "manga");
        var chapter = await Add(client, comic.Id, "chapter");
        await Add(client, comic.Id, "page", chapter.Id);

        // Chapters fit a graphic novel, so this one is allowed.
        comic = await Save(client, comic, "graphic-novel");
        await Add(client, comic.Id, "page");

        await Refused(await Put(client, comic, "manga"));
        await Refused(await Put(client, comic, "one-shot"));
        await Refused(await Put(client, comic, null));
        Assert.Equal("graphic-novel", (await client.GetFromJsonAsync<ProjectDetail>($"/api/projects/{comic.Id}"))!.Format);
    }

    [Fact]
    public async Task A_film_format_change_keeps_the_engine_behaviour()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cmcfilm");
        var film = await NewProject(client, universe.Id, "short-film", ProjectKind.Film);
        await Add(client, film.Id, "scene");

        var saved = await Save(client, film, "feature-film");
        Assert.Equal("feature-film", saved.Format);
    }

    private static async Task Refused(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Conflict, $"{(int)response.StatusCode}: {text}");
        Assert.Contains("project_structure_conflict", text);
    }

    private static Task<HttpResponseMessage> Put(HttpClient client, ProjectDetail current, string? format) =>
        client.PutAsJsonAsync(
            $"/api/projects/{current.Id}",
            new ProjectRequest(current.Name, current.Kind, current.Lifecycle, current.Subtype, current.Summary, current.Universe!.Id, current.Version, format));

    private static async Task<ProjectDetail> Save(HttpClient client, ProjectDetail current, string? format)
    {
        var response = await Put(client, current, format);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static async Task<ProjectDetail> NewProject(HttpClient client, Guid universeId, string format, ProjectKind kind = ProjectKind.Comic)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest("Salt Comic", kind, ProjectLifecycle.Active, null, null, universeId, null, format));
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
