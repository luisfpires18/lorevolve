using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Lorex.Api.Features.Assistant;
using ModelContextProtocol;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.McpTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>A shared universe with a viewer's connection to it, made once for the class.</summary>
public sealed class McpToolFixture : IAsyncLifetime
{
    public LorexApiFactory Api { get; } = new();

    internal SharedWorld World { get; private set; } = null!;

    internal Connection Viewer { get; private set; } = null!;

    /// <summary>A second universe of the same owner, whose ids must read as nothing through the first one's connection.</summary>
    public Guid OtherEntry { get; private set; }

    public async Task InitializeAsync()
    {
        World = await NewSharedWorld(Api, "mcptools");
        Viewer = await Connect(Api, await SignIn(Api, "user-mcptools-viewer"), World.U);
        var other = (await CreateUniverse(World.Owner, "Elsewhere")).Id;
        OtherEntry = await CreateEntity(World.Owner, other, "Ember Vale");
    }

    public Task DisposeAsync()
    {
        Api.Dispose();
        return Task.CompletedTask;
    }
}

/// <summary>
/// The MCP tools (ADR 0046), called through the official MCP SDK's client over the real Streamable HTTP transport and
/// through raw JSON-RPC: what they read, that they only read, that every id is read through the connected universe, and
/// how a manuscript is read a bounded, exact piece at a time.
/// </summary>
public sealed class McpToolTests(McpToolFixture fixture) : IClassFixture<McpToolFixture>
{
    private static readonly string[] ToolNames =
    [
        "browse_timeline", "get_lore_entry", "get_lore_relationships", "get_scene", "get_story", "get_timeline_moment",
        "get_universe_overview", "read_scene_manuscript", "search_scene_manuscript", "search_universe",
    ];

    private LorexApiFactory Api => fixture.Api;

    private SharedWorld W => fixture.World;

    [Fact]
    public async Task An_initialize_era_client_is_answered_with_LoreX_s_tools_capability_and_instructions()
    {
        var response = await Post(Api.CreateClient(), W.U, fixture.Viewer.AccessToken, Initialize());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(response.Headers.Contains("Mcp-Session-Id"));

        var result = (await Message(response)).GetProperty("result");
        Assert.Equal("2025-11-25", result.GetProperty("protocolVersion").GetString());
        Assert.Equal("LoreX", result.GetProperty("serverInfo").GetProperty("name").GetString());
        Assert.True(result.GetProperty("capabilities").TryGetProperty("tools", out _));
        Assert.Contains("read-only", result.GetProperty("instructions").GetString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_SDK_client_finds_exactly_the_read_only_tools()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);
        var tools = await client.ListToolsAsync();

        Assert.Equal(ToolNames, tools.Select(tool => tool.Name).Order(StringComparer.Ordinal));
        Assert.All(tools, tool =>
        {
            var annotations = tool.ProtocolTool.Annotations!;
            Assert.True(annotations.ReadOnlyHint);
            Assert.False(annotations.DestructiveHint);
            Assert.True(annotations.IdempotentHint);
            Assert.False(annotations.OpenWorldHint);
            Assert.False(string.IsNullOrWhiteSpace(tool.Description));
        });
    }

    [Fact]
    public async Task Sessions_are_not_kept_so_GET_and_DELETE_are_not_allowed()
    {
        foreach (var method in new[] { HttpMethod.Get, HttpMethod.Delete })
        {
            using var request = new HttpRequestMessage(method, McpPath(W.U));
            request.Headers.Authorization = new("Bearer", fixture.Viewer.AccessToken);
            request.Headers.Accept.ParseAdd("text/event-stream");
            Assert.Equal(HttpStatusCode.MethodNotAllowed, (await Api.CreateClient().SendAsync(request)).StatusCode);
        }
    }

    [Fact]
    public async Task Every_member_role_reads_through_its_own_connection()
    {
        foreach (var who in Members)
        {
            var connection = await Connect(Api, await SignIn(Api, $"user-mcptools-{who.ToString().ToLowerInvariant()}"), W.U);
            await using var client = await SdkClient(Api, W.U, connection.AccessToken);
            var overview = await Call(client, "get_universe_overview");
            Assert.Equal("Shared mcptools", overview.GetProperty("name").GetString());
        }
    }

    [Fact]
    public async Task Lore_reads_its_fields_aliases_scenes_and_relationships()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var found = await Call(client, "search_universe", new() { ["query"] = "Ember" });
        var hit = found.GetProperty("results").EnumerateArray().First(result => result.GetProperty("kind").GetString() == "lore");
        Assert.Equal(W.Entry, hit.GetProperty("id").GetGuid());

        var entry = await Call(client, "get_lore_entry", new() { ["loreId"] = W.Entry.ToString() });
        Assert.Equal("Ember Vale", entry.GetProperty("name").GetString());
        Assert.Equal("The heir.", entry.GetProperty("summary").GetString());
        Assert.Equal("Canon", entry.GetProperty("canonStatus").GetString());
        Assert.Equal(1, entry.GetProperty("relationshipCount").GetInt32());

        var relationships = await Call(client, "get_lore_relationships", new() { ["loreId"] = W.Entry.ToString() });
        var link = Assert.Single(relationships.GetProperty("relationships").EnumerateArray());
        Assert.Equal("Ash Vale", link.GetProperty("related").GetProperty("name").GetString());
    }

    [Fact]
    public async Task Stories_scenes_and_the_timeline_read_without_prose()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var story = await Call(client, "get_story", new() { ["storyId"] = W.Story.ToString() });
        Assert.Equal("The drowned heir", story.GetProperty("title").GetString());
        Assert.Equal("Low water", Assert.Single(story.GetProperty("chapters").EnumerateArray()).GetProperty("title").GetString());
        Assert.Contains(story.GetProperty("scenes").EnumerateArray(), scene => scene.GetProperty("id").GetGuid() == W.Scene);
        Assert.Equal("Inheritance", Assert.Single(story.GetProperty("arcs").EnumerateArray()).GetProperty("title").GetString());

        var scene = await Call(client, "get_scene", new() { ["sceneId"] = W.Scene.ToString() });
        Assert.Equal("The causeway", scene.GetProperty("scene").GetProperty("title").GetString());
        Assert.False(scene.GetProperty("scene").TryGetProperty("prose", out _));
        Assert.Equal("She ran.".Length, scene.GetProperty("manuscript").GetProperty("characters").GetInt32());
        Assert.Equal(2, scene.GetProperty("manuscript").GetProperty("version").GetInt32());

        var moment = await Call(client, "get_timeline_moment", new() { ["momentId"] = W.Moment.ToString() });
        Assert.Equal("The flood", moment.GetProperty("title").GetString());

        var timeline = await Call(client, "browse_timeline");
        Assert.Contains(timeline.GetProperty("items").EnumerateArray(), item => item.GetProperty("id").GetGuid() == W.Moment);
    }

    [Fact]
    public async Task Ids_from_another_universe_the_Trash_or_nowhere_read_as_not_found()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        foreach (var (tool, argument, id) in new (string, string, string)[]
                 {
                     ("get_lore_entry", "loreId", fixture.OtherEntry.ToString()),
                     ("get_lore_entry", "loreId", W.Trash.Entry.ToString()),
                     ("get_lore_entry", "loreId", "not-an-id"),
                     ("get_lore_relationships", "loreId", fixture.OtherEntry.ToString()),
                     ("get_story", "storyId", W.Trash.Story.ToString()),
                     ("get_scene", "sceneId", W.Trash.Scene.ToString()),
                     ("read_scene_manuscript", "sceneId", W.Trash.Scene.ToString()),
                     ("search_scene_manuscript", "sceneId", Guid.NewGuid().ToString()),
                     ("get_timeline_moment", "momentId", W.Entry.ToString()),
                 })
        {
            var arguments = new Dictionary<string, object?> { [argument] = id };
            if (tool == "search_scene_manuscript")
            {
                arguments["text"] = "ran";
            }

            var result = await client.CallToolAsync(tool, arguments);
            Assert.True(result.IsError, $"{tool}({id}) was not an error.");
            using var json = JsonDocument.Parse(Text(result));
            Assert.Equal("not_found", json.RootElement.GetProperty("error").GetString());
        }

        // A search in this universe never reaches the other one's entry of the same name.
        var found = await Call(client, "search_universe", new() { ["query"] = "Ember" });
        Assert.DoesNotContain(found.GetProperty("results").EnumerateArray(), result => result.GetProperty("id").GetGuid() == fixture.OtherEntry);
    }

    [Fact]
    public async Task Unknown_tools_and_bad_arguments_are_refused()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        // Refused either as a protocol error or as a failed call, depending on the protocol version: never run.
        foreach (var (tool, arguments) in new (string, Dictionary<string, object?>)[] { ("create_lore_entry", new() { ["name"] = "x" }), ("get_lore_entry", []) })
        {
            try
            {
                Assert.True((await client.CallToolAsync(tool, arguments)).IsError);
            }
            catch (McpException)
            {
            }
        }

        var blank = await client.CallToolAsync("search_universe", new Dictionary<string, object?> { ["query"] = " " });
        Assert.True(blank.IsError);

        var protocol = await Message(await Post(Api.CreateClient(), W.U, fixture.Viewer.AccessToken, new { jsonrpc = "2.0", id = 9, method = "tools/call", @params = new { name = "delete_universe", arguments = new { } } }));
        Assert.True(protocol.TryGetProperty("error", out _) || protocol.GetProperty("result").GetProperty("isError").GetBoolean());
    }

    [Fact]
    public async Task A_long_manuscript_is_read_in_bounded_chunks_that_join_back_exactly()
    {
        var story = await CreateStory(W.Owner, W.U, "Long telling");
        var scene = await CreateScene(W.Owner, W.U, story, "The long night");
        var prose = LongProse();
        await WriteManuscript(W.Owner, W.U, story, scene, prose);

        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);
        var overview = await Call(client, "get_scene", new() { ["sceneId"] = scene.ToString() });
        Assert.Equal(prose.Length, overview.GetProperty("manuscript").GetProperty("characters").GetInt32());
        Assert.True(overview.GetProperty("manuscript").GetProperty("chunks").GetInt32() > 1);
        var version = overview.GetProperty("manuscript").GetProperty("version").GetInt32();

        var joined = new StringBuilder();
        int? offset = 0;
        var chunks = 0;
        while (offset is { } next)
        {
            var chunk = await Call(client, "read_scene_manuscript", new() { ["sceneId"] = scene.ToString(), ["offset"] = next, ["manuscriptVersion"] = version });
            var text = chunk.GetProperty("text").GetString()!;
            Assert.Equal(next, chunk.GetProperty("offset").GetInt32());
            Assert.Equal(next + text.Length, chunk.GetProperty("endOffset").GetInt32());
            Assert.InRange(text.Length, 1, 8_000);
            joined.Append(text);
            chunks++;
            offset = chunk.TryGetProperty("nextOffset", out var nextOffset) ? nextOffset.GetInt32() : null;
            Assert.Equal(offset is null, chunk.GetProperty("isComplete").GetBoolean());
        }

        Assert.Equal(prose, joined.ToString());
        Assert.True(chunks >= prose.Length / 8_000);

        // Asking for more than the most a read returns gets the most.
        var big = await Call(client, "read_scene_manuscript", new() { ["sceneId"] = scene.ToString(), ["maxCharacters"] = 1_000_000 });
        Assert.InRange(big.GetProperty("text").GetString()!.Length, 9_000, 12_000);

        // A passage found by its words says where it is, exactly.
        var found = await Call(client, "search_scene_manuscript", new() { ["sceneId"] = scene.ToString(), ["text"] = "LIGHTHOUSE" });
        var match = found.GetProperty("matches").EnumerateArray().First();
        var at = match.GetProperty("offset").GetInt32();
        Assert.Equal("lighthouse", prose.Substring(at, "lighthouse".Length));
        Assert.Equal(prose[match.GetProperty("excerptStart").GetInt32()..match.GetProperty("excerptEnd").GetInt32()], match.GetProperty("excerpt").GetString());

        // A manuscript changed between chunks is noticed rather than stitched.
        await WriteManuscript(W.Owner, W.U, story, scene, prose + " One more line.");
        var stale = await client.CallToolAsync("read_scene_manuscript", new Dictionary<string, object?> { ["sceneId"] = scene.ToString(), ["offset"] = 8_000, ["manuscriptVersion"] = version });
        Assert.True(stale.IsError);
        Assert.Contains("manuscript_changed", Text(stale), StringComparison.Ordinal);

        var outside = await client.CallToolAsync("read_scene_manuscript", new Dictionary<string, object?> { ["sceneId"] = scene.ToString(), ["offset"] = prose.Length + 100 });
        Assert.True(outside.IsError);
    }

    [Fact]
    public async Task Reading_through_MCP_does_not_spend_the_built_in_assistant_s_questions()
    {
        var viewer = await SignIn(Api, "user-mcptools-viewer");
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);
        for (var i = 0; i < 5; i++)
        {
            await Call(client, "get_universe_overview");
        }

        var usage = await viewer.GetFromJsonAsync<JsonElement>("/api/profile/assistant-usage");
        Assert.Equal(0, usage.GetProperty("used").GetInt32());
    }

    // ---------- Helpers ----------

    private static async Task<JsonElement> Call(McpClient client, string tool, Dictionary<string, object?>? arguments = null)
    {
        var result = await client.CallToolAsync(tool, arguments ?? []);
        Assert.False(result.IsError ?? false, Text(result));
        using var json = JsonDocument.Parse(Text(result));
        return json.RootElement.Clone();
    }

    private static string Text(CallToolResult result) => Assert.IsType<TextContentBlock>(Assert.Single(result.Content)).Text;

    /// <summary>About 30,000 characters in paragraphs, with surrogate pairs and one findable word.</summary>
    private static string LongProse()
    {
        var builder = new StringBuilder();
        for (var paragraph = 0; builder.Length < 30_000; paragraph++)
        {
            builder.Append("The tide counted the stones again, 🌊 and the heir walked on");
            if (paragraph == 17)
            {
                builder.Append(" toward the lighthouse");
            }

            builder.Append(paragraph % 3 == 0 ? ".\n\n" : ". ");
        }

        return builder.ToString();
    }
}
