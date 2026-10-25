using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.AiChanges;
using Lorex.Api.Features.Assistant;
using Lorex.Api.Features.Mcp;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Lorex.Api.Tests.McpTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// MCP V2 (ADR 0047): proposing is a separate permission a person ticks at consent, never part of read; the proposal
/// tools exist only for connections that have it; they stage, and nothing over MCP approves. Read-only connections work
/// exactly as before. The assistant's propose mode stages through the same service, and both land in one review list.
/// </summary>
public sealed class McpProposalTests : IClassFixture<McpProposalTests.Host>
{
    public sealed class Host : IDisposable
    {
        public ScriptedAssistantProvider Model { get; } = new();

        public LorexApiFactory Factory { get; }

        public Host() => Factory = new LorexApiFactory { Assistant = Model };

        public void Dispose() => Factory.Dispose();
    }

    private const string ReadAndPropose = "lorex.read lorex.propose offline_access";

    private static readonly string[] Races = ["Orc", "Human", "Elf"];

    private readonly LorexApiFactory _factory;

    private readonly ScriptedAssistantProvider _model;

    public McpProposalTests(Host host)
    {
        _factory = host.Factory;
        _model = host.Model;
    }

    /// <summary>The whole flow with the app asking to propose too, and the person ticking it - or not.</summary>
    private async Task<(Connection Connection, TokenAnswer Tokens)> ConnectAsync(HttpClient browser, Guid universeId, bool allowProposals, bool allowSchema = false)
    {
        var clientId = await RegisterPublicClient(_factory.CreateClient());
        var (verifier, challenge) = Pkce();
        var request = AuthorizeRequest(clientId, Resource(universeId), challenge, scope: ReadAndPropose);
        if (allowProposals)
        {
            request[OAuthEndpoints.ProposeField] = OAuthEndpoints.AllowProposals;
        }

        if (allowSchema)
        {
            request[OAuthEndpoints.SchemaField] = OAuthEndpoints.AllowProposals;
        }

        var approved = RedirectParameters(await Decide(browser, request, "approve"));
        var tokens = await Exchange(_factory.CreateClient(), clientId, approved["code"], verifier, Resource(universeId));
        Assert.Equal(HttpStatusCode.OK, tokens.Status);
        return (new Connection(clientId, universeId, tokens.AccessToken!, tokens.RefreshToken!), tokens);
    }

    private async Task<JsonElement> CallAsync(Connection connection, string tool, object arguments)
    {
        var response = await Post(_factory.CreateClient(), connection.UniverseId, connection.AccessToken, new
        {
            jsonrpc = "2.0",
            id = 3,
            method = "tools/call",
            @params = new { name = tool, arguments },
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await Message(response)).GetProperty("result");
    }

    private static JsonElement Body(JsonElement result) =>
        JsonDocument.Parse(result.GetProperty("content")[0].GetProperty("text").GetString()!).RootElement.Clone();

    private async Task<List<string>> ToolsAsync(Connection connection)
    {
        var response = await Post(_factory.CreateClient(), connection.UniverseId, connection.AccessToken, ListTools());
        return [.. (await Message(response)).GetProperty("result").GetProperty("tools").EnumerateArray().Select(tool => tool.GetProperty("name").GetString()!)];
    }

    private async Task<(HttpClient Browser, string UserId, Guid UniverseId, Guid Character)> OwnerAsync(string tag)
    {
        var (browser, userId) = await NewBrowser(_factory, tag);
        var universe = await PlotTestClient.CreateUniverse(browser, $"World {tag}");
        return (browser, userId, universe.Id, await AiChangeTestClient.TypeId(browser, universe.Id, "Character"));
    }

    [Fact]
    public async Task Proposing_is_granted_only_when_ticked_and_read_only_connections_stay_as_they_were()
    {
        var (browser, _, u, _) = await OwnerAsync("mcpgrant");

        var (readOnly, readOnlyTokens) = await ConnectAsync(browser, u, allowProposals: false);
        Assert.Equal(["lorex.read", "offline_access"], readOnlyTokens.Scope!.Split(' ').Order());
        var tools = await ToolsAsync(readOnly);
        Assert.Equal(12, tools.Count);
        Assert.DoesNotContain(LorexMcpProposalTools.ProposeTool, tools);
        var refused = await CallAsync(readOnly, LorexMcpProposalTools.ProposeTool, new { summary = "x", operations = Array.Empty<object>() });
        Assert.True(refused.GetProperty("isError").GetBoolean());
        Assert.Equal("not_allowed", Body(refused).GetProperty("error").GetString());

        // A refresh of the read-only grant cannot pick up the new permission.
        var widened = await Refresh(_factory.CreateClient(), readOnly.ClientId, readOnly.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, widened.Status);
        Assert.DoesNotContain("lorex.propose", widened.Scope!.Split(' '));
        var asked = new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["client_id"] = readOnly.ClientId,
            ["refresh_token"] = widened.RefreshToken!,
            ["scope"] = ReadAndPropose,
        };
        var escalated = await TokenAnswer.From(await _factory.CreateClient().PostAsync("/oauth/token", new FormUrlEncodedContent(asked)));
        Assert.True(escalated.Status != HttpStatusCode.OK || !escalated.Scope!.Contains("lorex.propose", StringComparison.Ordinal), $"Refresh widened the grant: {escalated.Scope}");

        var (proposing, proposingTokens) = await ConnectAsync(browser, u, allowProposals: true);
        Assert.Contains("lorex.propose", proposingTokens.Scope!.Split(' '));
        Assert.Contains(LorexMcpProposalTools.ProposeTool, await ToolsAsync(proposing));
    }

    [Fact]
    public async Task A_viewer_who_ticks_proposals_is_given_read_only()
    {
        var (owner, _, u, _) = await OwnerAsync("mcpviewer");
        var (viewer, viewerId) = await NewBrowser(_factory, "mcpviewer-viewer");
        await CollaborationTestClient.Join(_factory, u, viewerId, UniverseRole.Viewer);

        var (connection, tokens) = await ConnectAsync(viewer, u, allowProposals: true);
        Assert.DoesNotContain("lorex.propose", tokens.Scope!.Split(' '));
        Assert.DoesNotContain(LorexMcpProposalTools.ProposeTool, await ToolsAsync(connection));
    }

    [Fact]
    public async Task An_app_stages_a_proposal_that_waits_for_a_person_and_never_applies_itself()
    {
        var (browser, userId, u, character) = await OwnerAsync("mcppropose");
        var (connection, _) = await ConnectAsync(browser, u, allowProposals: true);

        var options = Body(await CallAsync(connection, LorexMcpProposalTools.OptionsTool, new { }));
        Assert.Contains(options.GetProperty("loreTypes").EnumerateArray(), type => type.GetProperty("id").GetGuid() == character);

        var staged = await CallAsync(connection, LorexMcpProposalTools.ProposeTool, new
        {
            summary = "Two founders",
            operations = new object[]
            {
                new { id = "a", action = "create", resource = "lore_entry", lore = new { typeId = character, name = "Nara" } },
                new { id = "b", action = "create", resource = "lore_entry", lore = new { typeId = character, name = "Osk" } },
            },
        });
        Assert.False(staged.TryGetProperty("isError", out var error) && error.GetBoolean(), staged.ToString());
        var body = Body(staged);
        var proposalId = body.GetProperty("proposalId").GetGuid();
        Assert.Equal($"{LorexApiFactory.Origin}/app/universes/{u:D}/ai-changes/{proposalId:D}", body.GetProperty("reviewUrl").GetString());

        // Nothing was applied, and the token cannot reach the browser's decision route.
        await PlotTestClient.WithDb(_factory, async db =>
        {
            Assert.False(await db.Entities.AnyAsync(entity => entity.UniverseId == u && entity.Name == "Nara"));
            var proposal = await db.AiChangeProposals.SingleAsync(row => row.Id == proposalId);
            Assert.Equal((AiChangeSource.Mcp, userId), (proposal.Source, proposal.ProposedByUserId));
            Assert.NotNull(proposal.McpConnectionId);
        });
        var bearer = _factory.CreateClient();
        bearer.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", connection.AccessToken);
        var reading = await AiChangeTestClient.Read(browser, u, proposalId);
        var byToken = await bearer.PostAsJsonAsync($"{AiChangeTestClient.Path(u, proposalId)}/approve", new AiChangeApproveRequest(reading.Revision, [.. reading.Operations.Select(operation => operation.Id)], Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Unauthorized, byToken.StatusCode);

        // Invalid changes stage nothing and say why.
        var invalid = await CallAsync(connection, LorexMcpProposalTools.ProposeTool, new
        {
            summary = "Broken",
            operations = new object[] { new { id = "x", action = "create", resource = "lore_entry", lore = new { typeId = Guid.NewGuid(), name = "Nobody" } } },
        });
        Assert.True(invalid.GetProperty("isError").GetBoolean());
        Assert.Equal("invalid_proposal", Body(invalid).GetProperty("error").GetString());

        // The app reads back its own proposal; the person approves it in LoreX.
        var status = Body(await CallAsync(connection, LorexMcpProposalTools.ReadTool, new { proposalId }));
        Assert.Equal("open", status.GetProperty("status").GetString());
        await AiChangeTestClient.ApproveAll(browser, u, proposalId);
        status = Body(await CallAsync(connection, LorexMcpProposalTools.ReadTool, new { proposalId }));
        Assert.Equal("approved", status.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Turning_proposals_off_or_disconnecting_stops_the_tools_and_blocks_what_was_staged()
    {
        var (browser, _, u, character) = await OwnerAsync("mcpstop");
        var (connection, _) = await ConnectAsync(browser, u, allowProposals: true);
        var staged = Body(await CallAsync(connection, LorexMcpProposalTools.ProposeTool, new
        {
            summary = "One",
            operations = new object[] { new { id = "a", action = "create", resource = "lore_entry", lore = new { typeId = character, name = "Pell" } } },
        }));
        var proposalId = staged.GetProperty("proposalId").GetGuid();

        var app = (await browser.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!.Single(row => row.UniverseId == u);
        Assert.True(app.CanPropose);
        Assert.Equal(HttpStatusCode.NoContent, (await browser.DeleteAsync($"/api/profile/connected-apps/{app.Id}/proposals")).StatusCode);

        // Reading goes on; proposing stops at the next call, and what it staged can only be rejected.
        Assert.Equal(12, (await ToolsAsync(connection)).Count);
        var refused = await CallAsync(connection, LorexMcpProposalTools.ProposeTool, new { summary = "x", operations = Array.Empty<object>() });
        Assert.True(refused.GetProperty("isError").GetBoolean());
        var proposal = await AiChangeTestClient.Read(browser, u, proposalId);
        Assert.NotNull(proposal.Blocked);
        Assert.Equal(AiChangeCodes.Blocked, await AiChangeTestClient.Code(await AiChangeTestClient.Approve(browser, u, proposal, ["a"])));
        Assert.False((await browser.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!.Single(row => row.UniverseId == u).CanPropose);
    }

    [Fact]
    public async Task The_assistant_proposes_only_in_propose_mode_through_the_same_review()
    {
        var (browser, userId, u, character) = await OwnerAsync("assistpropose");

        // An ordinary question is handed no proposal tool.
        _model.Use(_ => ScriptedAssistantProvider.Answer(("note", "Only reading.", [])));
        (await browser.PostAsJsonAsync($"/api/universes/{u}/assistant", new AssistantRequest("Who is Nara?", null))).EnsureSuccessStatusCode();
        Assert.DoesNotContain(_model.Steps[0].Brief.Tools, tool => tool.Name == AssistantProposing.ProposeTool);
        Assert.Contains(UniverseAssistant.ReadOnlyRule, _model.Steps[0].Brief.Instructions, StringComparison.Ordinal);

        _model.Use(step => step.Number == 1
            ? ScriptedAssistantProvider.Calls((AssistantProposing.ProposeTool, new
            {
                summary = "A new character",
                operations = new object[] { new { id = "q", action = "create", resource = "lore_entry", lore = new { typeId = character, name = "Quill" } } },
            }))
            : ScriptedAssistantProvider.Answer(("note", "Your change is waiting for review.", [])));

        var asked = await browser.PostAsJsonAsync($"/api/universes/{u}/assistant", new AssistantRequest("Create a character called Quill.", null, AssistantEndpoints.ProposeMode));
        Assert.Equal(HttpStatusCode.OK, asked.StatusCode);
        var answer = (await asked.Content.ReadFromJsonAsync<AssistantAnswer>())!;
        Assert.NotNull(answer.Proposal);
        Assert.Contains(_model.Steps[0].Brief.Tools, tool => tool.Name == AssistantProposing.ProposeTool);

        await PlotTestClient.WithDb(_factory, async db =>
        {
            Assert.False(await db.Entities.AnyAsync(entity => entity.UniverseId == u && entity.Name == "Quill"));
            Assert.Equal((AiChangeSource.Assistant, userId), await db.AiChangeProposals.Where(row => row.Id == answer.Proposal!.Id).Select(row => ValueTuple.Create(row.Source, row.ProposedByUserId)).SingleAsync());
        });

        // An app's proposal and the assistant's sit side by side in Pending AI Changes.
        var (connection, _) = await ConnectAsync(browser, u, allowProposals: true);
        await CallAsync(connection, LorexMcpProposalTools.ProposeTool, new
        {
            summary = "From the app",
            operations = new object[] { new { id = "r", action = "create", resource = "lore_entry", lore = new { typeId = character, name = "Rook" } } },
        });
        var listed = (await browser.GetFromJsonAsync<AiChangePage>($"/api/ai-changes?universeId={u}"))!;
        Assert.Equal([AiChangeSource.Mcp, AiChangeSource.Assistant], listed.Items.Select(item => item.Source).Order());
    }

    [Fact]
    public async Task A_provider_busy_after_staging_still_answers_with_the_one_proposal_so_asking_again_is_not_needed()
    {
        var (browser, _, u, character) = await OwnerAsync("assistbusy");

        // Issue #46: the proposal is staged, then the answering step is rate limited.
        _model.Use(step => step.Number == 1
            ? ScriptedAssistantProvider.Calls((AssistantProposing.ProposeTool, new
            {
                summary = "A new character",
                operations = new object[] { new { id = "w", action = "create", resource = "lore_entry", lore = new { typeId = character, name = "Wren" } } },
            }))
            : throw new AssistantProviderException(AssistantFailure.Busy, "Groq is rate limiting this host."));

        var asked = await browser.PostAsJsonAsync($"/api/universes/{u}/assistant", new AssistantRequest("Create a character called Wren.", null, AssistantEndpoints.ProposeMode));

        Assert.Equal(HttpStatusCode.OK, asked.StatusCode);
        var answer = (await asked.Content.ReadFromJsonAsync<AssistantAnswer>())!;
        Assert.Equal(1, answer.Proposal!.ChangeCount);
        Assert.Equal(
            "I've prepared 1 change for you to review. Nothing changes until you approve them in Pending AI Changes.",
            Assert.Single(answer.Segments).Text);
        Assert.Equal(2, _model.Steps.Count);

        await PlotTestClient.WithDb(_factory, async db =>
        {
            Assert.Equal([answer.Proposal.Id], await db.AiChangeProposals.Where(row => row.UniverseId == u).Select(row => row.Id).ToListAsync());
            Assert.False(await db.Entities.AnyAsync(entity => entity.UniverseId == u && entity.Name == "Wren"));
        });

        // Busy before anything was staged is still the busy answer.
        _model.Use(_ => throw new AssistantProviderException(AssistantFailure.Busy, "Groq is rate limiting this host."));
        var busy = await browser.PostAsJsonAsync($"/api/universes/{u}/assistant", new AssistantRequest("Create another.", null, AssistantEndpoints.ProposeMode));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, busy.StatusCode);
        await PlotTestClient.WithDb(_factory, async db => Assert.Equal(1, await db.AiChangeProposals.CountAsync(row => row.UniverseId == u)));
    }

    [Fact]
    public async Task Both_entry_points_stage_the_issue_45_resources_through_the_one_contract()
    {
        var (browser, _, u, character) = await OwnerAsync("mcpcontent");
        var story = await PlotTestClient.CreateStory(browser, u, "The Forging");

        // Over MCP: an article, an arc with a beat, and a world rule, with refs between them.
        var (connection, _) = await ConnectAsync(browser, u, allowProposals: true);
        var options = Body(await CallAsync(connection, LorexMcpProposalTools.OptionsTool, new { }));
        Assert.Contains(options.GetProperty("allowed").EnumerateArray(), allowed => allowed.GetString() == "reorder plot_beat");
        var staged = await CallAsync(connection, LorexMcpProposalTools.ProposeTool, new
        {
            summary = "Plot and prose",
            operations = new object[]
            {
                new { id = "smith", action = "create", resource = "lore_entry", lore = new { typeId = character, name = "Smith" } },
                new { id = "life", action = "update", resource = "article", article = new { entry = new { @ref = "smith" }, mode = "replace", blocks = new object[] { new { kind = "paragraph", text = "Forges blades." } } } },
                new { id = "arc", action = "create", resource = "plot_arc", plotArc = new { story = new { id = story }, title = "Rise" } },
                new { id = "beat", action = "create", resource = "plot_beat", plotBeat = new { arc = new { @ref = "arc" }, title = "First spark", lore = new object[] { new { @ref = "smith" } } } },
                new { id = "rule", action = "create", resource = "world_rule", worldRule = new { title = "Steel remembers", description = "Every blade keeps a name." } },
            },
        });
        Assert.False(staged.TryGetProperty("isError", out var error) && error.GetBoolean(), staged.ToString());
        var receipt = await AiChangeTestClient.ApproveAll(browser, u, Body(staged).GetProperty("proposalId").GetGuid());
        Assert.Equal(5, receipt.Applied.Count);
        Assert.Equal(["First spark"], (await PlotTestClient.Plot(browser, u, story)).Single().Beats.Select(beat => beat.Title));

        // From the assistant: the owner's own idea, through the same staging, as the strict schema shapes it.
        _model.Use(step => step.Number == 1
            ? ScriptedAssistantProvider.Calls((AssistantProposing.ProposeTool, new
            {
                summary = "An idea",
                operations = new object[] { new { id = "i", action = "create", resource = "idea", idea = new { title = "What if steel lies?", body = "", references = new object[] { new { kind = "lore_entry", id = receipt.Applied.Single(line => line.Key == "smith").ResultId } } } } },
            }))
            : ScriptedAssistantProvider.Answer(("note", "Your idea is waiting for review.", [])));
        var asked = await browser.PostAsJsonAsync($"/api/universes/{u}/assistant", new AssistantRequest("Keep an idea about steel.", null, AssistantEndpoints.ProposeMode));
        var answer = (await asked.Content.ReadFromJsonAsync<AssistantAnswer>())!;
        Assert.NotNull(answer.Proposal);
        await AiChangeTestClient.ApproveAll(browser, u, answer.Proposal!.Id);
        await PlotTestClient.WithDb(_factory, async db => Assert.True(await db.Ideas.AnyAsync(idea => idea.UniverseId == u && idea.Title == "What if steel lies?")));

        // The assistant's propose schema carries every resource the contract does.
        var schema = _model.Steps[0].Brief.Tools.Single(tool => tool.Name == AssistantProposing.ProposeTool).ParametersSchema;
        foreach (var member in new[] { "\"article\"", "\"plotArc\"", "\"plotBeat\"", "\"worldRule\"", "\"idea\"", "\"order\"", "\"stories\"", "\"details\"", "\"startDate\"" })
        {
            Assert.Contains(member, schema, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Schema_is_a_second_tick_that_an_app_never_gets_by_default_and_loses_on_its_own()
    {
        var (browser, _, u, character) = await OwnerAsync("mcpschema");
        object SchemaChange(string name) => new
        {
            summary = "A new type",
            operations = new object[] { new { id = "t", action = "create", resource = "lore_type", loreType = new { name } } },
        };

        // Proposing without the schema tick: content yes, schema no - and the catalog says why.
        var (content, _) = await ConnectAsync(browser, u, allowProposals: true);
        var options = Body(await CallAsync(content, LorexMcpProposalTools.OptionsTool, new { }));
        Assert.False(options.GetProperty("schema").GetProperty("canPropose").GetBoolean());
        Assert.DoesNotContain(options.GetProperty("allowed").EnumerateArray(), allowed => allowed.GetString() == "create lore_type");
        var refused = await CallAsync(content, LorexMcpProposalTools.ProposeTool, SchemaChange("Kingdom"));
        Assert.True(refused.GetProperty("isError").GetBoolean());
        Assert.Equal(AiChangeCodes.NotAllowed, Body(refused).GetProperty("problems")[0].GetProperty("code").GetString());

        // The schema tick alone, without proposals, grants nothing.
        var (schemaOnly, _) = await ConnectAsync(browser, u, allowProposals: false, allowSchema: true);
        Assert.DoesNotContain(LorexMcpProposalTools.ProposeTool, await ToolsAsync(schemaOnly));

        // Both ticks: the catalog is the universe's real schema, and a type is staged.
        var (schema, _) = await ConnectAsync(browser, u, allowProposals: true, allowSchema: true);
        options = Body(await CallAsync(schema, LorexMcpProposalTools.OptionsTool, new { }));
        Assert.True(options.GetProperty("schema").GetProperty("canPropose").GetBoolean());
        Assert.Contains(options.GetProperty("allowed").EnumerateArray(), allowed => allowed.GetString() == "remove lore_field");
        Assert.Contains(options.GetProperty("schema").GetProperty("fieldKinds").EnumerateArray(), kind => kind.GetString() == "link");
        Assert.Contains(options.GetProperty("schema").GetProperty("groups").EnumerateArray(), group => group.GetProperty("name").GetString() == "Places");
        Assert.Contains(options.GetProperty("loreTypes").EnumerateArray(), type => type.GetProperty("id").GetGuid() == character);
        var staged = Body(await CallAsync(schema, LorexMcpProposalTools.ProposeTool, SchemaChange("Kingdom")));
        var proposalId = staged.GetProperty("proposalId").GetGuid();
        var apps = (await browser.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!;
        var app = Assert.Single(apps, row => row.CanProposeSchema);

        // Taking schema back blocks what it staged at once, and keeps content proposals and reading.
        Assert.Equal(HttpStatusCode.NoContent, (await browser.DeleteAsync($"/api/profile/connected-apps/{app.Id}/schema")).StatusCode);
        var proposal = await AiChangeTestClient.Read(browser, u, proposalId);
        Assert.NotNull(proposal.Blocked);
        Assert.Equal(AiChangeCodes.Blocked, await AiChangeTestClient.Code(await AiChangeTestClient.Approve(browser, u, proposal, ["t"])));
        Assert.True(Body(await CallAsync(schema, LorexMcpProposalTools.ProposeTool, SchemaChange("City"))).TryGetProperty("problems", out _));
        var still = Body(await CallAsync(schema, LorexMcpProposalTools.ProposeTool, new
        {
            summary = "Content",
            operations = new object[] { new { id = "a", action = "create", resource = "lore_entry", lore = new { typeId = character, name = "Ulf" } } },
        }));
        Assert.True(still.TryGetProperty("proposalId", out _), still.ToString());
        await PlotTestClient.WithDb(_factory, async db => Assert.False(await db.EntityTypes.AnyAsync(type => type.UniverseId == u && type.Name == "Kingdom")));
    }

    [Fact]
    public async Task A_reviewer_is_not_offered_the_schema_tick_and_ticking_it_anyway_grants_nothing()
    {
        var (_, _, u, _) = await OwnerAsync("mcpschemarole");
        var (reviewer, reviewerId) = await NewBrowser(_factory, "mcpschemarole-reviewer");
        await CollaborationTestClient.Join(_factory, u, reviewerId, UniverseRole.Reviewer);

        var (connection, _) = await ConnectAsync(reviewer, u, allowProposals: true, allowSchema: true);
        await PlotTestClient.WithDb(_factory, async db => Assert.False(await db.McpConnections.Where(row => row.UserId == reviewerId).Select(row => row.CanProposeSchema).SingleAsync()));
        Assert.False(Body(await CallAsync(connection, LorexMcpProposalTools.OptionsTool, new { })).GetProperty("schema").GetProperty("canPropose").GetBoolean());
    }

    [Fact]
    public async Task The_assistant_stages_schema_through_the_same_contract_and_review()
    {
        var (browser, _, u, character) = await OwnerAsync("assistschema");
        _model.Use(step => step.Number == 1
            ? ScriptedAssistantProvider.Calls((AssistantProposing.ProposeTool, new
            {
                summary = "Races as a field",
                operations = new object[]
                {
                    new { id = "race", action = "create", resource = "lore_field", field = new { type = new { id = character }, name = "Race", kind = "one_choice", options = Races } },
                },
            }))
            : ScriptedAssistantProvider.Answer(("note", "A Race field is waiting for review.", [])));

        var asked = await browser.PostAsJsonAsync($"/api/universes/{u}/assistant", new AssistantRequest("Add a Race choice to Character: Orc, Human, Elf.", null, AssistantEndpoints.ProposeMode));
        var answer = (await asked.Content.ReadFromJsonAsync<AssistantAnswer>())!;
        Assert.NotNull(answer.Proposal);
        var schema = _model.Steps[0].Brief.Tools.Single(tool => tool.Name == AssistantProposing.ProposeTool).ParametersSchema;
        foreach (var member in new[] { "\"loreType\"", "\"field\"", "\"group\"", "\"linksToGroup\"", "\"relationshipKind\"", "\"chronology\"", "\"months\"", "\"term\"" })
        {
            Assert.Contains(member, schema, StringComparison.Ordinal);
        }

        await AiChangeTestClient.ApproveAll(browser, u, answer.Proposal!.Id);
        var race = (await browser.GetFromJsonAsync<List<Lorex.Api.Features.Lore.EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!
            .Single(type => type.Id == character).Fields.Single(field => field.Name == "Race");
        Assert.Equal(["Orc", "Human", "Elf"], race.Options.Select(option => option.Value));
    }

    [Fact]
    public async Task A_viewer_cannot_ask_the_assistant_to_propose()
    {
        var (_, _, u, _) = await OwnerAsync("assistviewer");
        var (viewer, viewerId) = await NewBrowser(_factory, "assistviewer-viewer");
        await CollaborationTestClient.Join(_factory, u, viewerId, UniverseRole.Viewer);

        var asked = await viewer.PostAsJsonAsync($"/api/universes/{u}/assistant", new AssistantRequest("Create a character called Sky.", null, AssistantEndpoints.ProposeMode));
        Assert.Equal(HttpStatusCode.Forbidden, asked.StatusCode);
    }
}
