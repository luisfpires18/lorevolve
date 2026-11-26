using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Mcp;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.McpTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A project's own types and fields, proposed over MCP beside the entries that use them: a game with no GameEntity type
/// gets one, its fields and its entries in one proposal, and every piece is written through the project Types screen's
/// own write path only once the person approves it.
/// </summary>
public sealed class McpProjectSchemaProposalTests(McpProjectSchemaFixture fixture) : IClassFixture<McpProjectSchemaFixture>
{
    private LorEvolveApiFactory Api => fixture.Api;

    private SharedWorld W => fixture.World;

    [Fact]
    public async Task One_proposal_creates_a_type_its_fields_and_entries_that_name_them_by_ref()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposer.AccessToken);

        var staged = await Call(client, Proposal(
            "A GameEntity type with its first entries",
            new { id = "ge", action = "create", resource = "project_type", projectType = new { projectId = fixture.Game, name = "GameEntity", description = "Anything on the board." } },
            new { id = "hp", action = "create", resource = "project_field", projectField = new { projectId = fixture.Game, typeRef = "ge", name = "Health", kind = "number" } },
            new { id = "side", action = "create", resource = "project_field", projectField = new { projectId = fixture.Game, typeRef = "ge", name = "Faction", kind = "one_choice", options = new[] { "Tide", "Salt" } } },
            new
            {
                id = "e1",
                action = "create",
                resource = "project_entry",
                projectEntry = new
                {
                    projectId = fixture.Game,
                    typeRef = "ge",
                    name = "Brine golem",
                    fields = new object[] { new { fieldRef = "hp", number = 30 }, new { fieldRef = "side", choices = new[] { "Salt" } } },
                },
            },
            new
            {
                id = "e2",
                action = "create",
                resource = "project_entry",
                projectEntry = new { projectId = fixture.Game, typeRef = "ge", name = "Tide runner", fields = new object[] { new { fieldRef = "hp", number = 12 } } },
            }));

        var proposalId = staged.GetProperty("proposalId").GetGuid();

        // Nothing exists until the person approves.
        await WithDb(Api, async db =>
            Assert.False(await db.EntityTypes.IgnoreQueryFilters().AnyAsync(type => type.Name == "GameEntity")));

        var proposal = await AiChangeTestClient.Read(W.Owner, W.U, proposalId);
        Assert.Equal(["ge"], proposal.Operations.Single(operation => operation.Key == "hp").DependsOn);
        Assert.Equal(["ge", "hp", "side"], proposal.Operations.Single(operation => operation.Key == "e1").DependsOn.Order());

        // A project entry reads as what it is: its type, name and field values, not a bare "Change".
        var golemChange = proposal.Operations.Single(operation => operation.Key == "e1");
        Assert.Equal("New GameEntity (new): Brine golem", golemChange.Title);
        Assert.Equal(
            ["Type: GameEntity (new)", "Name: Brine golem", "Health (new): 30", "Faction (new): Salt"],
            golemChange.Lines.Select(line => $"{line.Label}: {line.After}"));

        await AiChangeTestClient.ApproveAll(W.Owner, W.U, proposalId);

        // An edit of it names the entry and its type, and shows only what changes.
        var entryId = (await AiChangeTestClient.Read(W.Owner, W.U, proposalId)).Operations.Single(operation => operation.Key == "e1").ResultId;
        var edit = await Call(client, Proposal(
            "Rename the golem and give it less health",
            new { id = "u1", action = "update", resource = "project_entry", targetId = entryId, projectEntry = new { name = "Salt golem" } }));
        var renamed = (await AiChangeTestClient.Read(W.Owner, W.U, edit.GetProperty("proposalId").GetGuid())).Operations.Single();
        Assert.Equal("Edit Brine golem (GameEntity)", renamed.Title);
        var line = Assert.Single(renamed.Lines);
        Assert.Equal(("Name", "Brine golem", "Salt golem"), (line.Label, line.Before, line.After));

        await WithDb(Api, async db =>
        {
            var type = await db.EntityTypes.IgnoreQueryFilters().SingleAsync(each => each.Name == "GameEntity");
            Assert.Equal(fixture.Game, type.ProjectId);
            Assert.Equal(W.U, type.UniverseId);
            Assert.Equal("Anything on the board.", type.Description);
            Assert.Null(type.ParentId);

            var fields = await db.EntityFieldDefinitions.IgnoreQueryFilters()
                .Include(field => field.Options)
                .Where(field => field.EntityTypeId == type.Id)
                .OrderBy(field => field.DisplayOrder)
                .ToListAsync();
            Assert.Equal(["Health", "Faction"], fields.Select(field => field.Name));
            Assert.Equal(EntityFieldKind.Number, fields[0].Kind);
            Assert.Equal(EntityFieldKind.Select, fields[1].Kind);
            Assert.False(fields[0].IsRequired);
            Assert.Equal(["Tide", "Salt"], fields[1].Options.OrderBy(option => option.DisplayOrder).Select(option => option.Value));

            var entries = await db.Entities.IgnoreQueryFilters()
                .Include(entry => entry.FieldValues)
                .Where(entry => entry.EntityTypeId == type.Id)
                .OrderBy(entry => entry.Name)
                .ToListAsync();
            Assert.Equal(["Brine golem", "Tide runner"], entries.Select(entry => entry.Name));
            Assert.All(entries, entry => Assert.Equal(fixture.Game, entry.ProjectId));

            var golem = entries[0];
            Assert.Contains(golem.FieldValues, value => value.FieldDefinitionId == fields[0].Id && value.NumberValue == 30);
            var salt = fields[1].Options.Single(option => option.Value == "Salt").Id;
            Assert.Contains(golem.FieldValues, value => value.FieldDefinitionId == fields[1].Id && value.OptionId == salt);
            Assert.Single(entries[1].FieldValues, value => value.NumberValue == 12);

            // The project's, never the lore's.
            Assert.False(await db.EntityTypes.AnyAsync(each => each.Name == "GameEntity"));
        });
    }

    [Fact]
    public async Task An_entry_cannot_be_approved_before_the_type_it_names_by_ref()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposer.AccessToken);

        var staged = await Call(client, Proposal(
            "A relic type and one relic",
            new { id = "relic", action = "create", resource = "project_type", projectType = new { projectId = fixture.Game, name = "Relic" } },
            new { id = "r1", action = "create", resource = "project_entry", projectEntry = new { projectId = fixture.Game, typeRef = "relic", name = "Salt crown" } }));

        var proposal = await AiChangeTestClient.Read(W.Owner, W.U, staged.GetProperty("proposalId").GetGuid());
        var alone = await AiChangeTestClient.Approve(W.Owner, W.U, proposal, ["r1"]);

        Assert.Equal(HttpStatusCode.Conflict, alone.StatusCode);
        Assert.Equal(AiChangeCodes.MissingDependency, await AiChangeTestClient.Code(alone));

        await WithDb(Api, async db =>
            Assert.False(await db.EntityTypes.IgnoreQueryFilters().AnyAsync(type => type.Name == "Relic")));
    }

    [Fact]
    public async Task A_type_s_name_and_a_field_s_required_flag_are_updated()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposer.AccessToken);

        var staged = await Call(client, Proposal(
            "Rename vehicles, and make speed required",
            new { id = "t", action = "update", resource = "project_type", targetId = fixture.VehicleType, projectType = new { name = "Craft" } },
            new { id = "f", action = "update", resource = "project_entity_field", targetId = fixture.SpeedField, projectField = new { isRequired = true } }));

        await AiChangeTestClient.ApproveAll(W.Owner, W.U, staged.GetProperty("proposalId").GetGuid());

        await WithDb(Api, async db =>
        {
            var type = await db.EntityTypes.IgnoreQueryFilters().SingleAsync(each => each.Id == fixture.VehicleType);
            Assert.Equal("Craft", type.Name);
            Assert.Equal("Moves things.", type.Description);
            Assert.Equal(fixture.Game, type.ProjectId);

            var field = await db.EntityFieldDefinitions.IgnoreQueryFilters().SingleAsync(each => each.Id == fixture.SpeedField);
            Assert.True(field.IsRequired);
            Assert.Equal("Speed", field.Name);
            Assert.Equal(EntityFieldKind.Number, field.Kind);
        });
    }

    [Fact]
    public async Task What_the_types_screen_refuses_a_proposal_refuses_before_anything_is_staged()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposer.AccessToken);

        // Another universe's project is not found, as if it did not exist.
        var elsewhere = await Failing(client, Proposal(
            "A type in another world",
            new { id = "x", action = "create", resource = "project_type", projectType = new { projectId = fixture.Elsewhere, name = "Intruder" } }));
        Assert.Equal("not_found", Problem(elsewhere).GetProperty("code").GetString());

        // Neither a type nor a field is removed through a proposal.
        var removeType = await Failing(client, Proposal(
            "Remove a type",
            new { id = "x", action = "remove", resource = "project_type", targetId = fixture.VehicleType }));
        Assert.Equal("unsupported", Problem(removeType).GetProperty("code").GetString());

        var removeField = await Failing(client, Proposal(
            "Remove a field",
            new { id = "x", action = "remove", resource = "project_field", targetId = fixture.SpeedField }));
        Assert.Equal("unsupported", Problem(removeField).GetProperty("code").GetString());

        // A kind LorEvolve does not have.
        var badKind = await Failing(client, Proposal(
            "A colour field",
            new { id = "x", action = "create", resource = "project_field", projectField = new { projectId = fixture.Game, typeId = fixture.VehicleType, name = "Paint", kind = "colour" } }));
        Assert.Equal("invalid", Problem(badKind).GetProperty("code").GetString());

        // Choices only on a field of choices.
        var stray = await Failing(client, Proposal(
            "A number with choices",
            new { id = "x", action = "create", resource = "project_field", projectField = new { projectId = fixture.Game, typeId = fixture.VehicleType, name = "Wheels", kind = "number", options = new[] { "4" } } }));
        Assert.Contains("Only a field of choices has choices.", Problem(stray).GetProperty("message").GetString()!, StringComparison.Ordinal);

        // A type already at the route's limit of fields takes no more.
        var crowded = await Failing(client, Proposal(
            "One field too many",
            new { id = "x", action = "create", resource = "project_field", projectField = new { projectId = fixture.Game, typeId = fixture.CrowdedType, name = "Straw", kind = "short_text" } }));
        Assert.Contains($"at most {ProjectEntityTypeEndpoints.MaxFieldsPerType} fields", Problem(crowded).GetProperty("message").GetString()!, StringComparison.Ordinal);

        await WithDb(Api, async db =>
        {
            Assert.False(await db.EntityTypes.IgnoreQueryFilters().AnyAsync(type => type.Name == "Intruder"));
            Assert.False(await db.EntityFieldDefinitions.IgnoreQueryFilters().AnyAsync(field => field.Name == "Paint" || field.Name == "Wheels" || field.Name == "Straw"));
        });
    }

    // ---------- helpers ----------

    private static Dictionary<string, object?> Proposal(string summary, params object[] operations) =>
        new() { ["summary"] = summary, ["operations"] = operations };

    private static JsonElement Problem(JsonElement refused)
    {
        Assert.Equal("invalid_proposal", refused.GetProperty("error").GetString());
        return refused.GetProperty("problems")[0];
    }

    private static async Task<JsonElement> Call(McpClient client, Dictionary<string, object?> arguments)
    {
        var result = await client.CallToolAsync(LorEvolveMcpProposalTools.ProposeTool, arguments);
        Assert.False(result.IsError ?? false, Text(result));
        using var json = JsonDocument.Parse(Text(result));
        Assert.Equal("waiting_for_review", json.RootElement.GetProperty("status").GetString());
        return json.RootElement.Clone();
    }

    private static async Task<JsonElement> Failing(McpClient client, Dictionary<string, object?> arguments)
    {
        var result = await client.CallToolAsync(LorEvolveMcpProposalTools.ProposeTool, arguments);
        Assert.True(result.IsError ?? false, Text(result));
        using var json = JsonDocument.Parse(Text(result));
        return json.RootElement.Clone();
    }

    private static string Text(CallToolResult result) =>
        string.Concat(result.Content.OfType<TextContentBlock>().Select(block => block.Text));
}

/// <summary>
/// A universe with a game that has a Vehicle type with a Speed field and a type already holding as many fields as a type
/// may, a project of another universe, and a connection allowed to propose.
/// </summary>
public sealed class McpProjectSchemaFixture : IAsyncLifetime
{
    public LorEvolveApiFactory Api { get; } = new();

    internal SharedWorld World { get; private set; } = null!;

    internal Connection Proposer { get; private set; } = null!;

    public Guid Game { get; private set; }

    public Guid Elsewhere { get; private set; }

    public Guid VehicleType { get; private set; }

    public Guid SpeedField { get; private set; }

    public Guid CrowdedType { get; private set; }

    public async Task InitializeAsync()
    {
        World = await NewSharedWorld(Api, "mcpprojschema");
        Proposer = await ProposingAsync(await SignIn(Api, "user-mcpprojschema-owner"), World.U);

        Game = await NewProjectAsync(World.Owner, "Salt and Tide", kind: 1, universeId: World.U);

        var other = (await CreateUniverse(World.Owner, "Elsewhere for project schema")).Id;
        Elsewhere = await NewProjectAsync(World.Owner, "Another world's game", kind: 1, universeId: other);

        VehicleType = (await PostJson<ProjectEntityTypeResponse>(
            World.Owner,
            $"/api/projects/{Game}/entity-types",
            new ProjectEntityTypeRequest("Vehicle", "Moves things.", null, null))).Id;

        SpeedField = (await PostJson<ProjectEntityTypeResponse>(
            World.Owner,
            $"/api/projects/{Game}/entity-types/{VehicleType}/fields",
            new ProjectEntityFieldRequest("Speed", EntityFieldKind.Number))).Fields.Single(field => field.Name == "Speed").Id;

        CrowdedType = (await PostJson<ProjectEntityTypeResponse>(
            World.Owner,
            $"/api/projects/{Game}/entity-types",
            new ProjectEntityTypeRequest("Crowded", null, null, null))).Id;

        for (var index = 0; index < ProjectEntityTypeEndpoints.MaxFieldsPerType; index++)
        {
            await PostJson<ProjectEntityTypeResponse>(
                World.Owner,
                $"/api/projects/{Game}/entity-types/{CrowdedType}/fields",
                new ProjectEntityFieldRequest($"Field {index}", EntityFieldKind.ShortText));
        }
    }

    public Task DisposeAsync()
    {
        Api.Dispose();
        return Task.CompletedTask;
    }

    /// <summary>A project of one kind in one universe. Kind and lifecycle travel as numbers: 1 is Game.</summary>
    private static async Task<Guid> NewProjectAsync(HttpClient client, string name, int kind, Guid universeId) =>
        (await PostJson<ProjectDetail>(
            client,
            "/api/projects",
            new { name, kind, lifecycle = 1, subtype = (string?)null, summary = string.Empty, universeId, expectedVersion = (int?)null })).Id;

    private static async Task<T> PostJson<T>(HttpClient client, string path, object body)
    {
        var response = await client.PostAsJsonAsync(path, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    /// <summary>A connection the person ticked "may propose" for, through the real authorize flow.</summary>
    private async Task<Connection> ProposingAsync(HttpClient browser, Guid universeId)
    {
        var clientId = await RegisterPublicClient(Api.CreateClient());
        var (verifier, challenge) = Pkce();
        var request = AuthorizeRequest(clientId, Resource(universeId), challenge, scope: "lorevolve.read lorevolve.propose offline_access");
        request[OAuthEndpoints.ProposeField] = OAuthEndpoints.AllowProposals;

        var approved = RedirectParameters(await Decide(browser, request, "approve"));
        var tokens = await Exchange(Api.CreateClient(), clientId, approved["code"], verifier, Resource(universeId));

        return new Connection(clientId, universeId, tokens.AccessToken!, tokens.RefreshToken!);
    }
}
