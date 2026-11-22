using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Mcp;
using LorEvolve.Api.Features.Universes;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.McpTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// <c>get_idea</c>: the owner, on a connection allowed to propose, opens one of their ideas in this universe and gets the
/// whole body. A read-only connection never sees it, any other role is refused, and an idea of another universe, a
/// deleted idea and a guessed id are not found.
/// </summary>
public sealed class McpIdeaToolTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string ReadAndPropose = "lorevolve.read lorevolve.propose offline_access";

    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task The_owner_reads_the_whole_body_of_an_idea_in_this_universe()
    {
        var w = await NewSharedWorld(_factory, "mcp-idea-owner");
        var body = new string('w', 19_900) + " end";
        var idea = await CreateIdeaAsync(w.Owner, "Floating city", body, w.U);
        var elsewhere = await CreateIdeaAsync(w.Owner, "Elsewhere", "Not here.", await OtherUniverseAsync(w.Owner));
        var deleted = await CreateIdeaAsync(w.Owner, "Gone", "Deleted.", w.U);
        (await w.Owner.DeleteAsync($"/api/ideas/{deleted}")).EnsureSuccessStatusCode();

        var connection = await ConnectAsync("user-mcp-idea-owner-owner", w.U, allowWrites: true);
        Assert.Contains(LorEvolveMcpIdeaTools.GetTool, await ToolsAsync(connection));

        var read = await CallAsync(connection, idea.ToString());
        Assert.False(read.TryGetProperty("isError", out var isError) && isError.GetBoolean(), read.ToString());
        var result = Body(read);
        Assert.Equal("Floating city", result.GetProperty("title").GetString());
        Assert.Equal(body, result.GetProperty("body").GetString());

        Assert.Equal("not_found", Error(await CallAsync(connection, elsewhere.ToString())));
        Assert.Equal("not_found", Error(await CallAsync(connection, deleted.ToString())));
        Assert.Equal("not_found", Error(await CallAsync(connection, Guid.NewGuid().ToString())));
        Assert.Equal("not_found", Error(await CallAsync(connection, "not-an-id")));
    }

    [Fact]
    public async Task A_read_only_connection_and_every_other_role_are_refused()
    {
        var w = await NewSharedWorld(_factory, "mcp-idea-refused");
        var idea = await CreateIdeaAsync(w.Owner, "Private", "Mine.", w.U);

        var readOnly = await ConnectAsync("user-mcp-idea-refused-owner", w.U, allowWrites: false);
        Assert.DoesNotContain(LorEvolveMcpIdeaTools.GetTool, await ToolsAsync(readOnly));
        Assert.Equal("not_allowed", Error(await CallAsync(readOnly, idea.ToString())));

        var editor = await ConnectAsync("user-mcp-idea-refused-editor", w.U, allowWrites: true);
        Assert.Equal("not_allowed", Error(await CallAsync(editor, idea.ToString())));
    }

    private static async Task<Guid> OtherUniverseAsync(HttpClient owner)
    {
        var response = await owner.PostAsJsonAsync("/api/universes", new CreateUniverseRequest("Other universe", null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!.Id;
    }

    private static async Task<Guid> CreateIdeaAsync(HttpClient owner, string title, string body, Guid universeId)
    {
        var response = await owner.PostAsJsonAsync("/api/ideas", new IdeaRequest(title, body, universeId, null, null));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<IdeaDetail>())!.Id;
    }

    /// <summary>The consent flow in a browser that follows no redirects, signed in as that account.</summary>
    private async Task<Connection> ConnectAsync(string username, Guid universeId, bool allowWrites)
    {
        var browser = await SignIn(_factory, username);
        var clientId = await RegisterPublicClient(_factory.CreateClient());
        var (verifier, challenge) = Pkce();
        var request = AuthorizeRequest(clientId, Resource(universeId), challenge, scope: ReadAndPropose);
        if (allowWrites)
        {
            request[OAuthEndpoints.ProposeField] = OAuthEndpoints.AllowProposals;
        }

        var approved = RedirectParameters(await Decide(browser, request, "approve"));
        var tokens = await Exchange(_factory.CreateClient(), clientId, approved["code"], verifier, Resource(universeId));
        Assert.Equal(HttpStatusCode.OK, tokens.Status);
        return new Connection(clientId, universeId, tokens.AccessToken!, tokens.RefreshToken!);
    }

    private async Task<JsonElement> CallAsync(Connection connection, string ideaId)
    {
        var response = await Post(_factory.CreateClient(), connection.UniverseId, connection.AccessToken, new
        {
            jsonrpc = "2.0",
            id = 3,
            method = "tools/call",
            @params = new { name = LorEvolveMcpIdeaTools.GetTool, arguments = new { ideaId } },
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await Message(response)).GetProperty("result");
    }

    private async Task<List<string>> ToolsAsync(Connection connection)
    {
        var response = await Post(_factory.CreateClient(), connection.UniverseId, connection.AccessToken, ListTools());
        return [.. (await Message(response)).GetProperty("result").GetProperty("tools").EnumerateArray().Select(tool => tool.GetProperty("name").GetString()!)];
    }

    private static JsonElement Body(JsonElement result) =>
        JsonDocument.Parse(result.GetProperty("content")[0].GetProperty("text").GetString()!).RootElement.Clone();

    private static string? Error(JsonElement result)
    {
        Assert.True(result.GetProperty("isError").GetBoolean(), result.ToString());
        return Body(result).GetProperty("error").GetString();
    }
}
