using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Mcp;
using LorEvolve.Api.Features.Projects;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.McpTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The MCP project tools (#142): what the connected universe is used to make, read through the official SDK client over
/// the real transport.
///
/// The two things worth pinning down are the boundary and the handover. The boundary: a connection is to one universe,
/// so another universe's project is not listed and its id reads as nothing. The handover: a story is listed as the
/// Writing Project it is, carrying `storyId`, and `get_project` on that id says to use `get_story` rather than
/// pretending the id is unknown.
/// </summary>
public sealed class McpProjectToolTests(McpProjectToolFixture fixture) : IClassFixture<McpProjectToolFixture>
{
    private LorEvolveApiFactory Api => fixture.Api;

    private SharedWorld W => fixture.World;

    [Fact]
    public async Task The_universe_s_own_projects_and_its_stories_are_listed_together()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var listed = await Call(client, LorEvolveMcpProjectTools.ListTool, []);
        var projects = listed.GetProperty("projects").EnumerateArray().ToList();

        var own = Assert.Single(projects, project => project.GetProperty("id").GetGuid() == fixture.Project);
        Assert.Equal("The Tide Engine", own.GetProperty("name").GetString());
        Assert.Equal("Game", own.GetProperty("kind").GetString());
        Assert.Equal("Planning", own.GetProperty("stage").GetString());
        Assert.False(own.TryGetProperty("storyId", out _), "a project of its own carries no storyId");

        // The universe's story is there too, as the Writing Project it already is (#140).
        var story = Assert.Single(projects, project => project.GetProperty("id").GetGuid() == W.Story);
        Assert.Equal("Writing", story.GetProperty("kind").GetString());
        Assert.Equal(W.Story, story.GetProperty("storyId").GetGuid());

        Assert.Equal(fixture.UniverseName, listed.GetProperty("universe").GetString());
    }

    [Fact]
    public async Task One_project_is_read_by_its_id_with_the_universe_it_belongs_to()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var project = await Call(
            client,
            LorEvolveMcpProjectTools.GetTool,
            new() { ["projectId"] = fixture.Project.ToString() });

        Assert.Equal(fixture.Project, project.GetProperty("id").GetGuid());
        Assert.Equal("The Tide Engine", project.GetProperty("name").GetString());
        Assert.Equal("Game", project.GetProperty("kind").GetString());
        Assert.Equal(W.U, project.GetProperty("universe").GetProperty("id").GetGuid());
        Assert.Equal(fixture.UniverseName, project.GetProperty("universe").GetProperty("name").GetString());
    }

    /// <summary>
    /// A story's id is a Writing Project's id in the list, so the tool says where to read it. A bare "not found" would
    /// send a client round in circles with an id it was just given.
    /// </summary>
    [Fact]
    public async Task A_story_id_is_answered_with_where_to_read_it()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var refused = await client.CallToolAsync(
            LorEvolveMcpProjectTools.GetTool,
            new Dictionary<string, object?> { ["projectId"] = W.Story.ToString() });

        Assert.True(refused.IsError ?? false);
        using var json = JsonDocument.Parse(Text(refused));
        Assert.Equal("is_a_story", json.RootElement.GetProperty("error").GetString());
        Assert.Equal(W.Story, json.RootElement.GetProperty("details").GetProperty("storyId").GetGuid());

        // And get_story still reads it, unchanged by any of this.
        var story = await Call(client, "get_story", new() { ["storyId"] = W.Story.ToString() });
        Assert.Equal("The drowned heir", story.GetProperty("title").GetString());
    }

    /// <summary>
    /// The boundary: a connection is to one universe, so another universe's projects are not listed and their ids read
    /// as nothing. Every project is in some universe (#171), so that is the whole of the boundary.
    /// </summary>
    [Fact]
    public async Task Another_universe_s_projects_are_not_visible()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var listed = await Call(client, LorEvolveMcpProjectTools.ListTool, []);
        var ids = listed.GetProperty("projects").EnumerateArray().Select(project => project.GetProperty("id").GetGuid()).ToList();

        Assert.DoesNotContain(fixture.Elsewhere, ids);
        Assert.DoesNotContain(fixture.AlsoElsewhere, ids);

        foreach (var hidden in new[] { fixture.Elsewhere, fixture.AlsoElsewhere })
        {
            var refused = await client.CallToolAsync(
                LorEvolveMcpProjectTools.GetTool,
                new Dictionary<string, object?> { ["projectId"] = hidden.ToString() });

            Assert.True(refused.IsError ?? false);
            using var json = JsonDocument.Parse(Text(refused));
            Assert.Equal("not_found", json.RootElement.GetProperty("error").GetString());
        }
    }

    [Fact]
    public async Task Something_that_is_not_an_id_is_not_found_rather_than_an_exception()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var refused = await client.CallToolAsync(
            LorEvolveMcpProjectTools.GetTool,
            new Dictionary<string, object?> { ["projectId"] = "not-an-id" });

        Assert.True(refused.IsError ?? false);
        using var json = JsonDocument.Parse(Text(refused));
        Assert.Equal("not_found", json.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Both_tools_are_read_only_and_announced()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var tools = await client.ListToolsAsync();
        foreach (var name in new[] { LorEvolveMcpProjectTools.ListTool, LorEvolveMcpProjectTools.GetTool })
        {
            var tool = Assert.Single(tools, candidate => candidate.Name == name);
            Assert.True(tool.ProtocolTool.Annotations?.ReadOnlyHint);
            Assert.False(tool.ProtocolTool.Annotations?.DestructiveHint);
            Assert.False(string.IsNullOrWhiteSpace(tool.ProtocolTool.Description));
        }
    }

    // ---------- Helpers ----------

    private static async Task<JsonElement> Call(McpClient client, string tool, Dictionary<string, object?> arguments)
    {
        var result = await client.CallToolAsync(tool, arguments);
        Assert.False(result.IsError ?? false, Text(result));
        using var json = JsonDocument.Parse(Text(result));
        return json.RootElement.Clone();
    }

    private static string Text(CallToolResult result) =>
        string.Concat(result.Content.OfType<TextContentBlock>().Select(block => block.Text));
}

/// <summary>
/// One shared universe with a viewer's connection, a project of its own, a project in another universe and a project in
/// none, made once for the class.
/// </summary>
public sealed class McpProjectToolFixture : IAsyncLifetime
{
    public LorEvolveApiFactory Api { get; } = new();

    internal SharedWorld World { get; private set; } = null!;

    internal Connection Viewer { get; private set; } = null!;

    /// <summary>A project of its own, in the connected universe.</summary>
    public Guid Project { get; private set; }

    /// <summary>A project in another universe of the same owner: not this connection's to read.</summary>
    public Guid Elsewhere { get; private set; }

    /// <summary>A second project in that other universe, so the boundary is tested on more than one row.</summary>
    public Guid AlsoElsewhere { get; private set; }

    /// <summary>The connected universe's name, as the API reports it, for what the tools say about it.</summary>
    public string UniverseName { get; private set; } = string.Empty;

    public async Task InitializeAsync()
    {
        World = await NewSharedWorld(Api, "mcpprojects");
        Viewer = await Connect(Api, await SignIn(Api, "user-mcpprojects-viewer"), World.U);

        Project = await Create(World.Owner, "The Tide Engine", kind: 1, universeId: World.U);

        using var universe = JsonDocument.Parse(
            await (await World.Owner.GetAsync($"/api/universes/{World.U}")).Content.ReadAsStringAsync());
        UniverseName = universe.RootElement.GetProperty("name").GetString()!;

        var other = (await CreateUniverse(World.Owner, "Elsewhere for projects")).Id;
        Elsewhere = await Create(World.Owner, "Another world's project", kind: 0, universeId: other);
        AlsoElsewhere = await Create(World.Owner, "Another world's second project", kind: 0, universeId: other);
    }

    public Task DisposeAsync()
    {
        Api.Dispose();
        return Task.CompletedTask;
    }

    /// <summary>Kind and stage travel as numbers: 1 is Game, 0 is Writing, and 0 is Planning.</summary>
    private static async Task<Guid> Create(HttpClient client, string name, int kind, Guid universeId)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new
            {
                name,
                kind,
                lifecycle = 0,
                subtype = (string?)null,
                summary = string.Empty,
                universeId,
                expectedVersion = (int?)null,
            });

        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("id").GetGuid();
    }
}
