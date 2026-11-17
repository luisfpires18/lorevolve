using System.Net.Http.Json;
using System.Text.Json;
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
/// The MCP project entity tools (#148): a project's own types, its entries and its structure, read through the official
/// SDK client over the real transport, and its entries changed only through a proposal the person approves.
///
/// <para>Three things are worth pinning down. <b>Parity:</b> what the web app refuses, a proposal refuses. <b>The
/// boundary:</b> a connection is to one universe, so another universe's project is not found, and a project's entries
/// are never the lore's. <b>Approval:</b> nothing an MCP client sends changes anything until the person approves it,
/// through the same gate a lore change goes through rather than a parallel one.</para>
/// </summary>
public sealed class McpProjectEntityToolTests(McpProjectEntityFixture fixture) : IClassFixture<McpProjectEntityFixture>
{
    private LorEvolveApiFactory Api => fixture.Api;

    private SharedWorld W => fixture.World;

    [Fact]
    public async Task A_project_s_schema_is_read_with_its_fields_and_what_a_nested_type_inherits()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var read = await Call(
            client,
            LorEvolveMcpProjectEntityTools.TypesTool,
            new() { ["projectId"] = fixture.Project.ToString() });

        Assert.Equal("Game", read.GetProperty("kind").GetString());

        var types = read.GetProperty("types").EnumerateArray().ToList();
        var unit = Assert.Single(types, type => type.GetProperty("name").GetString() == "Unit");

        var cost = Assert.Single(
            unit.GetProperty("fields").EnumerateArray(),
            field => field.GetProperty("name").GetString() == "Cost");
        Assert.Equal("Number", cost.GetProperty("kind").GetString());

        var role = Assert.Single(
            unit.GetProperty("fields").EnumerateArray(),
            field => field.GetProperty("name").GetString() == "Role");
        Assert.Equal(["Scout", "Siege"], role.GetProperty("choices").EnumerateArray().Select(choice => choice.GetString()));

        // A nested type's own fields and the ones it inherits are apart, because the inherited ones are defined once on
        // the type above and never copied down.
        var scout = Assert.Single(types, type => type.GetProperty("name").GetString() == "Scout");
        Assert.Empty(scout.GetProperty("fields").EnumerateArray());
        Assert.Contains(
            scout.GetProperty("inheritedFields").EnumerateArray(),
            field => field.GetProperty("name").GetString() == "Cost");

        // The universe's lore types are not a project's, and never appear here.
        Assert.DoesNotContain(types, type => type.GetProperty("name").GetString() == "Character");
    }

    [Fact]
    public async Task A_project_s_entries_are_listed_a_page_at_a_time_and_read_one_by_one()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var all = await Call(
            client,
            LorEvolveMcpProjectEntityTools.ListTool,
            new() { ["projectId"] = fixture.Project.ToString() });

        Assert.Equal(LorEvolveMcpProjectEntityTools.PageSize, all.GetProperty("pageSize").GetInt32());
        Assert.Equal(3, all.GetProperty("total").GetInt32());
        Assert.False(all.GetProperty("hasMore").GetBoolean());
        Assert.Equal(3, all.GetProperty("entries").GetArrayLength());

        var ofType = await Call(
            client,
            LorEvolveMcpProjectEntityTools.ListTool,
            new() { ["projectId"] = fixture.Project.ToString(), ["typeId"] = fixture.UnitType.ToString() });
        Assert.Equal(2, ofType.GetProperty("total").GetInt32());

        var found = await Call(
            client,
            LorEvolveMcpProjectEntityTools.ListTool,
            new() { ["projectId"] = fixture.Project.ToString(), ["search"] = "Saltbearer" });
        Assert.Equal(1, found.GetProperty("total").GetInt32());

        var entry = await Call(
            client,
            LorEvolveMcpProjectEntityTools.GetTool,
            new() { ["projectId"] = fixture.Project.ToString(), ["entryId"] = fixture.Saltbearer.ToString() });

        Assert.Equal("Saltbearer", entry.GetProperty("name").GetString());
        Assert.Equal("Unit", entry.GetProperty("type").GetString());
        Assert.Equal(fixture.Alenna, entry.GetProperty("canonEntryId").GetGuid());
        Assert.Equal("Alenna Vance", entry.GetProperty("canonEntry").GetString());

        Assert.Contains(
            entry.GetProperty("values").EnumerateArray(),
            value => value.GetProperty("field").GetString() == "Cost" && value.GetProperty("number").GetDouble() == 35);
    }

    [Fact]
    public async Task An_entry_with_an_image_field_reads_with_the_field_named_and_sized_and_no_bytes()
    {
        // A project and a Lore type of their own, so the fixture's counts stay as the other tests read them.
        var project = await McpProjectEntityFixture.NewProjectAsync(W.Owner, "Pictured units", kind: 1, universeId: W.U);
        var hero = await McpProjectEntityFixture.PostJson<ProjectEntityTypeResponse>(W.Owner, $"/api/projects/{project}/entity-types", new ProjectEntityTypeRequest("Hero", null, null, null));
        var art = (await McpProjectEntityFixture.PostJson<ProjectEntityTypeResponse>(
                W.Owner,
                $"/api/projects/{project}/entity-types/{hero.Id}/fields",
                new ProjectEntityFieldRequest("Art", EntityFieldKind.Image, ImageShape: FieldImageShape.Square)))
            .Fields.Single(field => field.Name == "Art").Id;
        var entry = await McpProjectEntityFixture.PostJson<EntityDetail>(W.Owner, $"/api/projects/{project}/entities", new ProjectEntityRequest(hero.Id, "Tidecaller", null));
        await PutPicture(W.Owner, W.U, entry.Id, art, PublishingTestClient.Png(300, 300));

        var relic = await McpProjectEntityFixture.PostJson<EntityTypeResponse>(W.Owner, $"/api/universes/{W.U}/entity-types", new EntityTypeRequest("Relic", null, null, null, null));
        var sketch = (await McpProjectEntityFixture.PostJson<EntityTypeResponse>(
                W.Owner,
                $"/api/universes/{W.U}/entity-types/{relic.Id}/fields",
                new FieldDefinitionRequest("Sketch", EntityFieldKind.Image, false, null, null, null, ImageShape: FieldImageShape.Free)))
            .Fields.Single(field => field.Name == "Sketch").Id;
        var lore = await McpProjectEntityFixture.PostJson<EntityDetail>(
            W.Owner, $"/api/universes/{W.U}/entities", new EntityRequest(relic.Id, "The Salt Crown", null, CanonStatus.Idea, null, null, null));
        await PutPicture(W.Owner, W.U, lore.Id, sketch, PublishingTestClient.Png(400, 200));

        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var read = await Call(
            client,
            LorEvolveMcpProjectEntityTools.GetTool,
            new() { ["projectId"] = project.ToString(), ["entryId"] = entry.Id.ToString() });
        var image = Assert.Single(read.GetProperty("images").EnumerateArray());
        Assert.Equal("Art", image.GetProperty("field").GetString());
        Assert.Equal("image", image.GetProperty("kind").GetString());
        Assert.Equal(300, image.GetProperty("width").GetInt32());
        Assert.DoesNotContain("field-images", read.GetRawText(), StringComparison.Ordinal);

        var loreRead = await Call(client, "get_lore_entry", new() { ["loreId"] = lore.Id.ToString() });
        var field = Assert.Single(loreRead.GetProperty("fields").EnumerateArray(), each => each.GetProperty("name").GetString() == "Sketch");
        Assert.Equal("image, 400 x 200 pixels", field.GetProperty("value").GetString());
    }

    private static async Task PutPicture(HttpClient client, Guid u, Guid entry, Guid field, byte[] png)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(png);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "picture.png");
        var response = await client.PutAsync($"/api/universes/{u}/entities/{entry}/field-images/{field}", form);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_project_of_another_universe_is_not_found_and_a_page_past_the_end_is_empty()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var elsewhere = await Failing(
            client,
            LorEvolveMcpProjectEntityTools.TypesTool,
            new() { ["projectId"] = fixture.Elsewhere.ToString() });
        Assert.Equal("not_found", elsewhere.GetProperty("error").GetString());

        // A page past the end is an empty page rather than an error: a client walking pages stops when it runs out.
        var beyond = await Call(
            client,
            LorEvolveMcpProjectEntityTools.ListTool,
            new() { ["projectId"] = fixture.Project.ToString(), ["page"] = "9" });

        Assert.Equal(9, beyond.GetProperty("page").GetInt32());
        Assert.Equal(3, beyond.GetProperty("total").GetInt32());
        Assert.False(beyond.GetProperty("hasMore").GetBoolean());
        Assert.Equal(0, beyond.GetProperty("entries").GetArrayLength());

        // An id that is not a guid is refused the same way an unknown one is, so the shape of an id leaks nothing.
        var nonsense = await Failing(
            client,
            LorEvolveMcpProjectEntityTools.GetTool,
            new() { ["projectId"] = fixture.Project.ToString(), ["entryId"] = "not-a-guid" });
        Assert.Equal("not_found", nonsense.GetProperty("error").GetString());
    }

    [Fact]
    public async Task A_project_s_structure_is_read_in_the_words_its_kind_uses()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        // A kind without the structure says so rather than failing.
        var game = await Call(
            client,
            LorEvolveMcpProjectEntityTools.StructureTool,
            new() { ["projectId"] = fixture.Project.ToString() });

        Assert.False(game.GetProperty("hasStructure").GetBoolean());
        Assert.Empty(game.GetProperty("bands").EnumerateArray());

        var comic = await Call(
            client,
            LorEvolveMcpProjectEntityTools.StructureTool,
            new() { ["projectId"] = fixture.Comic.ToString() });

        Assert.Equal("volume", comic.GetProperty("bandName").GetString());
        Assert.Equal("chapter", comic.GetProperty("unitName").GetString());

        var volume = Assert.Single(comic.GetProperty("bands").EnumerateArray());
        var chapter = Assert.Single(volume.GetProperty("units").EnumerateArray());
        var page = Assert.Single(chapter.GetProperty("pages").EnumerateArray());
        var panel = Assert.Single(page.GetProperty("panels").EnumerateArray());

        Assert.Equal("Wide on the saltflats", panel.GetProperty("description").GetString());

        // The script is reported as present with its length rather than sent whole.
        Assert.True(chapter.GetProperty("hasScript").GetBoolean());
        Assert.True(chapter.GetProperty("scriptLength").GetInt32() > 0);
    }

    [Fact]
    public async Task A_proposed_entry_is_checked_the_way_the_web_app_checks_it_and_waits_for_approval()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposer.AccessToken);

        // What the web app refuses, a proposal refuses: a type that is not this project's.
        var wrongType = await Failing(
            client,
            LorEvolveMcpProposalTools.ProposeTool,
            Proposal("A unit of the wrong type", new
            {
                id = "u1",
                action = "create",
                resource = "project_entry",
                projectEntry = new { projectId = fixture.Project, typeId = fixture.LoreType, name = "Smuggled" },
            }));

        Assert.Equal("invalid_proposal", wrongType.GetProperty("error").GetString());

        // And a lore entry this universe does not hold cannot be what a project's entry stands for.
        var wrongCanon = await Failing(
            client,
            LorEvolveMcpProposalTools.ProposeTool,
            Proposal("A unit standing for nothing", new
            {
                id = "u1",
                action = "create",
                resource = "project_entry",
                projectEntry = new
                {
                    projectId = fixture.Project,
                    typeId = fixture.UnitType,
                    name = "Smuggled",
                    canonEntryId = Guid.NewGuid(),
                },
            }));

        Assert.Equal("invalid_proposal", wrongCanon.GetProperty("error").GetString());

        // A sound one is staged, and nothing has changed yet.
        var staged = await Call(
            client,
            LorEvolveMcpProposalTools.ProposeTool,
            Proposal("A dune strider for the game", new
            {
                id = "u1",
                action = "create",
                resource = "project_entry",
                projectEntry = new
                {
                    projectId = fixture.Project,
                    typeId = fixture.UnitType,
                    name = "Dune strider",
                    summary = "Fast over salt.",
                    canonEntryId = fixture.Alenna,
                    fields = new object[]
                    {
                        new { fieldId = fixture.CostField, number = 40 },
                        new { fieldId = fixture.RoleField, choices = new[] { "Scout" } },
                    },
                },
            }));

        var proposalId = staged.GetProperty("proposalId").GetGuid();
        Assert.Equal("waiting_for_review", staged.GetProperty("status").GetString());

        await WithDb(Api, async db =>
            Assert.False(await db.Entities.IgnoreQueryFilters().AnyAsync(entry => entry.Name == "Dune strider")));

        // The person approves it in LorEvolve, and only then does it exist.
        // Approved the way the review screen approves: the proposal's revision, the changes chosen, and an approval id,
        // through the same helper every other AI change test uses.
        await AiChangeTestClient.ApproveAll(W.Owner, W.U, proposalId);

        await WithDb(Api, async db =>
        {
            var made = await db.Entities.IgnoreQueryFilters()
                .Include(entry => entry.FieldValues)
                .SingleAsync(entry => entry.Name == "Dune strider");

            Assert.Equal(fixture.Project, made.ProjectId);
            Assert.Equal(fixture.UnitType, made.EntityTypeId);
            Assert.Equal(fixture.Alenna, made.CanonEntityId);

            // The choice came through as the word a client read, resolved to the option the engine stores.
            Assert.Equal(2, made.FieldValues.Count);
            Assert.Contains(made.FieldValues, value => value.NumberValue == 40);
            Assert.Contains(made.FieldValues, value => value.OptionId != null);

            // It is the project's and not the lore's: the universe's own listing does not hold it.
            Assert.False(await db.Entities.AnyAsync(entry => entry.Name == "Dune strider"));
        });
    }

    [Fact]
    public async Task A_read_only_connection_cannot_propose_a_project_entry()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var refused = await Failing(
            client,
            LorEvolveMcpProposalTools.ProposeTool,
            Proposal("Not allowed", new
            {
                id = "u1",
                action = "create",
                resource = "project_entry",
                projectEntry = new { projectId = fixture.Project, typeId = fixture.UnitType, name = "Not allowed" },
            }));

        Assert.Equal("not_allowed", refused.GetProperty("error").GetString());

        await WithDb(Api, async db =>
            Assert.False(await db.Entities.IgnoreQueryFilters().AnyAsync(entry => entry.Name == "Not allowed")));
    }

    [Fact]
    public async Task A_script_is_read_whole_by_its_own_tool()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var structure = await Call(
            client,
            LorEvolveMcpProjectEntityTools.StructureTool,
            new() { ["projectId"] = fixture.Comic.ToString() });

        var chapter = structure.GetProperty("bands")[0].GetProperty("units")[0];
        var chapterId = chapter.GetProperty("id").GetGuid();

        // The structure says a script is there and how long it is; this tool is the one that reads it.
        Assert.True(chapter.GetProperty("hasScript").GetBoolean());

        var script = await Call(
            client,
            LorEvolveMcpProjectEntityTools.ScriptTool,
            new() { ["projectId"] = fixture.Comic.ToString(), ["unitId"] = chapterId.ToString() });

        Assert.Equal("PAGE ONE", script.GetProperty("script").GetString());
        Assert.Equal("The tide goes out", script.GetProperty("title").GetString());
        Assert.Equal("Volume 1", script.GetProperty("band").GetString());

        // A unit of another project is not found through this project's id.
        var crossed = await Failing(
            client,
            LorEvolveMcpProjectEntityTools.ScriptTool,
            new() { ["projectId"] = fixture.Project.ToString(), ["unitId"] = chapterId.ToString() });
        Assert.Equal("not_found", crossed.GetProperty("error").GetString());
    }

    /// <summary>A film with a format lists its structure nodes (#290), and a node's text reads through the script tool.</summary>
    [Fact]
    public async Task A_film_s_structure_nodes_are_listed_and_a_node_s_text_is_read_whole()
    {
        var film = await McpProjectEntityFixture.PostJson<ProjectDetail>(
            W.Owner,
            "/api/projects",
            new ProjectRequest("Salt Acts", ProjectKind.Film, ProjectLifecycle.Active, null, null, W.U, null, "feature-film"));
        var act = await McpProjectEntityFixture.PostJson<ProjectNodeDetail>(
            W.Owner,
            $"/api/projects/{film.Id}/structure",
            new ProjectNodeRequest("act", Title: "Act One"));
        var scene = await McpProjectEntityFixture.PostJson<ProjectNodeDetail>(
            W.Owner,
            $"/api/projects/{film.Id}/structure",
            new ProjectNodeRequest("scene", act.Id, "Arrival", Body: "EXT. SHORE - DAY"));

        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var structure = await Call(
            client,
            LorEvolveMcpProjectEntityTools.StructureTool,
            new() { ["projectId"] = film.Id.ToString() });

        Assert.True(structure.GetProperty("hasStructure").GetBoolean());
        var nodes = structure.GetProperty("nodes").EnumerateArray().ToList();
        Assert.Equal(2, nodes.Count);
        var listed = nodes.Single(node => node.GetProperty("id").GetGuid() == scene.Id);
        Assert.Equal(act.Id, listed.GetProperty("parentId").GetGuid());
        Assert.Equal("scene", listed.GetProperty("level").GetString());
        Assert.Equal("EXT. SHORE - DAY".Length, listed.GetProperty("bodyLength").GetInt32());

        var script = await Call(
            client,
            LorEvolveMcpProjectEntityTools.ScriptTool,
            new() { ["projectId"] = film.Id.ToString(), ["unitId"] = scene.Id.ToString() });

        Assert.Equal("EXT. SHORE - DAY", script.GetProperty("script").GetString());
        Assert.Equal("scene", script.GetProperty("level").GetString());
    }

    /// <summary>
    /// An entry stays in the project it was made in. The first review round of #148 found that a proposal could name
    /// another project on an update: the check let it through and the commit then refused it as a missing entry, so the
    /// person would have approved a change that failed. It is refused before approval now.
    /// </summary>
    [Fact]
    public async Task A_proposal_that_moves_an_entry_to_another_project_is_refused_before_approval()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposer.AccessToken);

        var refused = await Failing(
            client,
            LorEvolveMcpProposalTools.ProposeTool,
            Proposal("Move a unit into the comic", new
            {
                id = "u1",
                action = "update",
                resource = "project_entry",
                targetId = fixture.Shoreward,
                projectEntry = new { projectId = fixture.Comic, typeId = fixture.UnitType, name = "Shoreward" },
            }));

        Assert.Equal("invalid_proposal", refused.GetProperty("error").GetString());
        Assert.Contains(
            "stays in the project",
            refused.GetProperty("problems")[0].GetProperty("message").GetString()!,
            StringComparison.Ordinal);

        // Nothing was staged, so there is nothing for the person to approve by mistake.
        await WithDb(Api, async db =>
            Assert.False(await db.AiChangeOperations.AnyAsync(operation => operation.TargetId == fixture.Shoreward)));

        // And an update that leaves the project alone is accepted, which is the ordinary case.
        var staged = await Call(
            client,
            LorEvolveMcpProposalTools.ProposeTool,
            Proposal("Rename the Shoreward", new
            {
                id = "u1",
                action = "update",
                resource = "project_entry",
                targetId = fixture.Shoreward,
                projectEntry = new { name = "Shoreward, veteran" },
            }));

        Assert.Equal("waiting_for_review", staged.GetProperty("status").GetString());

        await AiChangeTestClient.ApproveAll(W.Owner, W.U, staged.GetProperty("proposalId").GetGuid());

        await WithDb(Api, async db =>
        {
            var entry = await db.Entities.IgnoreQueryFilters().SingleAsync(each => each.Id == fixture.Shoreward);
            Assert.Equal("Shoreward, veteran", entry.Name);

            // The project it belongs to is exactly as it was, which is what the refusal above protects.
            Assert.Equal(fixture.Project, entry.ProjectId);
            Assert.Equal(fixture.UnitType, entry.EntityTypeId);
        });
    }

    // ---------- helpers ----------

    private static Dictionary<string, object?> Proposal(string summary, object operation) =>
        new() { ["summary"] = summary, ["operations"] = new[] { operation } };

    private static async Task<JsonElement> Call(McpClient client, string tool, Dictionary<string, object?> arguments)
    {
        var result = await client.CallToolAsync(tool, arguments);
        Assert.False(result.IsError ?? false, Text(result));
        using var json = JsonDocument.Parse(Text(result));
        return json.RootElement.Clone();
    }

    /// <summary>The body of a call that was meant to fail, so a test can read the code and the message it gave.</summary>
    private static async Task<JsonElement> Failing(McpClient client, string tool, Dictionary<string, object?> arguments)
    {
        var result = await client.CallToolAsync(tool, arguments);
        Assert.True(result.IsError ?? false, Text(result));
        using var json = JsonDocument.Parse(Text(result));
        return json.RootElement.Clone();
    }

    private static string Text(CallToolResult result) =>
        string.Concat(result.Content.OfType<TextContentBlock>().Select(block => block.Text));
}

/// <summary>
/// A universe with a game that has its own types, entries and a nested type, a comic with a volume, chapter, page and
/// panel, a lore entry for a project's entry to stand for, a read-only connection and one allowed to propose.
/// </summary>
public sealed class McpProjectEntityFixture : IAsyncLifetime
{
    public LorEvolveApiFactory Api { get; } = new();

    internal SharedWorld World { get; private set; } = null!;

    internal Connection Viewer { get; private set; } = null!;

    internal Connection Proposer { get; private set; } = null!;

    public Guid Project { get; private set; }

    public Guid Comic { get; private set; }

    public Guid Elsewhere { get; private set; }

    public Guid UnitType { get; private set; }

    public Guid LoreType { get; private set; }

    public Guid CostField { get; private set; }

    public Guid RoleField { get; private set; }

    public Guid Saltbearer { get; private set; }

    /// <summary>A second unit, for the one test that renames an entry: the others assert the Saltbearer by name.</summary>
    public Guid Shoreward { get; private set; }

    public Guid Alenna { get; private set; }

    public async Task InitializeAsync()
    {
        World = await NewSharedWorld(Api, "mcpprojentities");
        Viewer = await Connect(Api, await SignIn(Api, "user-mcpprojentities-viewer"), World.U);
        // A non-redirecting browser, because the authorize step is a redirect a test has to read rather than follow.
        Proposer = await ProposingAsync(await SignIn(Api, "user-mcpprojentities-owner"), World.U);

        Project = await NewProjectAsync(World.Owner, "The Tide Engine", kind: 1, universeId: World.U);
        Comic = await NewProjectAsync(World.Owner, "Low Tide", kind: 4, universeId: World.U);

        var other = (await CreateUniverse(World.Owner, "Elsewhere for project entities")).Id;
        Elsewhere = await NewProjectAsync(World.Owner, "Another world's project", kind: 1, universeId: other);

        var unit = await PostJson<ProjectEntityTypeResponse>(
            World.Owner,
            $"/api/projects/{Project}/entity-types",
            new ProjectEntityTypeRequest("Unit", null, null, null));
        UnitType = unit.Id;

        var withCost = await PostJson<ProjectEntityTypeResponse>(
            World.Owner,
            $"/api/projects/{Project}/entity-types/{UnitType}/fields",
            new ProjectEntityFieldRequest("Cost", EntityFieldKind.Number));
        CostField = withCost.Fields.First(field => field.Name == "Cost").Id;

        var withRole = await PostJson<ProjectEntityTypeResponse>(
            World.Owner,
            $"/api/projects/{Project}/entity-types/{UnitType}/fields",
            new ProjectEntityFieldRequest("Role", EntityFieldKind.Select, Options: ["Scout", "Siege"]));
        RoleField = withRole.Fields.First(field => field.Name == "Role").Id;

        await PostJson<ProjectEntityTypeResponse>(
            World.Owner,
            $"/api/projects/{Project}/entity-types",
            new ProjectEntityTypeRequest("Scout", null, null, null, UnitType));

        var terrain = await PostJson<ProjectEntityTypeResponse>(
            World.Owner,
            $"/api/projects/{Project}/entity-types",
            new ProjectEntityTypeRequest("Terrain", null, null, null));

        Alenna = await CreateEntity(World.Owner, World.U, "Alenna Vance");

        await WithDb(Api, async db =>
            LoreType = await db.EntityTypes
                .Where(type => type.UniverseId == World.U)
                .Select(type => type.Id)
                .FirstAsync());

        var saltbearer = await PostJson<EntityDetail>(
            World.Owner,
            $"/api/projects/{Project}/entities",
            new ProjectEntityRequest(
                UnitType,
                "Saltbearer",
                null,
                Alenna,
                [new FieldValueInput(CostField, null, 35, null, null, null, null)]));
        Saltbearer = saltbearer.Id;

        var shoreward = await PostJson<EntityDetail>(
            World.Owner,
            $"/api/projects/{Project}/entities",
            new ProjectEntityRequest(UnitType, "Shoreward", null));
        Shoreward = shoreward.Id;

        await PostJson<EntityDetail>(
            World.Owner,
            $"/api/projects/{Project}/entities",
            new ProjectEntityRequest(terrain.Id, "Saltflats", null));

        var volume = await PostJson<ProjectSeasonResponse>(
            World.Owner,
            $"/api/projects/{Comic}/seasons",
            new ProjectSeasonRequest("Volume 1", null));

        var chapter = await PostJson<ProjectEpisodeDetail>(
            World.Owner,
            $"/api/projects/{Comic}/seasons/{volume.Id}/episodes",
            new ProjectEpisodeRequest("The tide goes out", null));

        await PutJson<ProjectEpisodeDetail>(
            World.Owner,
            $"/api/projects/{Comic}/seasons/{volume.Id}/episodes/{chapter.Id}",
            new ProjectEpisodeRequest("The tide goes out", null, "PAGE ONE", chapter.Version));

        var page = await PostJson<ProjectPageResponse>(
            World.Owner,
            $"/api/projects/{Comic}/seasons/{volume.Id}/episodes/{chapter.Id}/pages",
            new ProjectPageRequest("1", null));

        await PostJson<ProjectPanelResponse>(
            World.Owner,
            $"/api/projects/{Comic}/seasons/{volume.Id}/episodes/{chapter.Id}/pages/{page.Id}/panels",
            new ProjectPanelRequest("Wide on the saltflats", null));
    }

    public Task DisposeAsync()
    {
        Api.Dispose();
        return Task.CompletedTask;
    }

    /// <summary>
    /// A connection the person ticked "may propose" for, through the real authorize flow: the only way one exists, so
    /// the test cannot grant itself something a person has not.
    /// </summary>
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

    /// <summary>A project of one kind in one universe. Kind and lifecycle travel as numbers: 1 is Game, 4 is Comic.</summary>
    internal static async Task<Guid> NewProjectAsync(HttpClient client, string name, int kind, Guid universeId)
    {
        var created = await PostJson<ProjectDetail>(
            client,
            "/api/projects",
            new
            {
                name,
                kind,
                lifecycle = 1,
                subtype = (string?)null,
                summary = string.Empty,
                universeId,
                expectedVersion = (int?)null,
            });

        return created.Id;
    }

    internal static async Task<T> PostJson<T>(HttpClient client, string path, object body)
    {
        var response = await client.PostAsJsonAsync(path, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task<T> PutJson<T>(HttpClient client, string path, object body)
    {
        var response = await client.PutAsJsonAsync(path, body);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }
}
