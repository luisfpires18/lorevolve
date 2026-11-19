using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Mcp;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.McpTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// <c>add_private_note</c>: a connection the owner let write adds text to the owner's private note on an entry. It adds
/// after what is there and never answers with the note's text; a read-only connection never sees it, and any role but
/// the owner is refused, as on the note's own route.
/// </summary>
public sealed class McpPrivateNoteToolTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string ReadAndPropose = "lorevolve.read lorevolve.propose offline_access";

    private readonly LorEvolveApiFactory _factory = factory;

    private static string Note(Guid universeId, Guid entityId) => $"/api/universes/{universeId}/entities/{entityId}/private-note";

    [Fact]
    public async Task The_owner_adds_to_a_note_without_reading_or_replacing_it()
    {
        var w = await NewSharedWorld(_factory, "mcp-pn-owner");
        var saved = await w.Owner.PutAsJsonAsync(Note(w.U, w.Entry), new EntityPrivateNoteRequest("Written in LorEvolve.", 0));
        Assert.True(saved.IsSuccessStatusCode, await saved.Content.ReadAsStringAsync());

        var connection = await ConnectAsync("user-mcp-pn-owner-owner", w.U, allowWrites: true);
        Assert.Contains(LorEvolveMcpPrivateNoteTools.AddTool, await ToolsAsync(connection));

        var added = await CallAsync(connection, w.Entry.ToString(), "The twin is a secret until act three.");
        Assert.False(added.TryGetProperty("isError", out var isError) && isError.GetBoolean(), added.ToString());
        var body = Body(added);
        Assert.Equal(2, body.GetProperty("version").GetInt32());
        Assert.DoesNotContain("Written in LorEvolve.", added.ToString(), StringComparison.Ordinal);

        var note = (await w.Owner.GetFromJsonAsync<EntityPrivateNoteResponse>(Note(w.U, w.Entry)))!;
        Assert.Equal("Written in LorEvolve.\n\nThe twin is a secret until act three.", note.Content);
        Assert.Equal(2, note.Version);
        Assert.Equal(note.Content.Length, body.GetProperty("length").GetInt32());

        // Refusals write nothing: a guessed entry, blank text, and a note pushed past its limit.
        Assert.Equal("not_found", Error(await CallAsync(connection, Guid.NewGuid().ToString(), "Lost.")));
        Assert.Equal("not_found", Error(await CallAsync(connection, "not-an-id", "Lost.")));
        Assert.Equal("invalid_note", Error(await CallAsync(connection, w.Entry.ToString(), "   ")));
        Assert.Equal("note_too_long", Error(await CallAsync(connection, w.Entry.ToString(), new string('x', PrivateNoteLimits.ContentMaxLength))));
        Assert.Equal(note, await w.Owner.GetFromJsonAsync<EntityPrivateNoteResponse>(Note(w.U, w.Entry)));
    }

    [Fact]
    public async Task A_read_only_connection_and_every_other_role_are_refused()
    {
        var w = await NewSharedWorld(_factory, "mcp-pn-refused");

        var readOnly = await ConnectAsync("user-mcp-pn-refused-owner", w.U, allowWrites: false);
        Assert.DoesNotContain(LorEvolveMcpPrivateNoteTools.AddTool, await ToolsAsync(readOnly));
        Assert.Equal("not_allowed", Error(await CallAsync(readOnly, w.Entry.ToString(), "Mine.")));

        var editor = await ConnectAsync("user-mcp-pn-refused-editor", w.U, allowWrites: true);
        Assert.Equal("not_allowed", Error(await CallAsync(editor, w.Entry.ToString(), "Mine.")));

        var note = (await w.Owner.GetFromJsonAsync<EntityPrivateNoteResponse>(Note(w.U, w.Entry)))!;
        Assert.Equal(0, note.Version);
        Assert.Equal(string.Empty, note.Content);
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

    private async Task<JsonElement> CallAsync(Connection connection, string loreId, string text)
    {
        var response = await Post(_factory.CreateClient(), connection.UniverseId, connection.AccessToken, new
        {
            jsonrpc = "2.0",
            id = 3,
            method = "tools/call",
            @params = new { name = LorEvolveMcpPrivateNoteTools.AddTool, arguments = new { loreId, text } },
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
