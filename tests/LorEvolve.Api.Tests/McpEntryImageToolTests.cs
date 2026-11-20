using System.Net;
using System.Text.Json;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Mcp;
using LorEvolve.Api.Features.ProjectEntities;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.McpTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// <c>propose_entry_image</c> (#441): the AI hands over the picture itself for a project's entry, such as a game's unit. The
/// file is held on the media store under the entry's name until the person approves, and approval attaches it. A file that
/// is not a picture, too large or behind a link LorEvolve may not fetch stages nothing.
/// </summary>
public sealed class McpEntryImageToolTests(McpProjectEntityFixture fixture) : IClassFixture<McpProjectEntityFixture>
{
    private readonly McpProjectEntityFixture _f = fixture;

    [Fact]
    public async Task A_picture_sent_as_base64_is_held_named_after_the_unit_and_attached_on_approval()
    {
        var wolf = (await McpProjectEntityFixture.PostJson<EntityDetail>(
            _f.World.Owner, $"/api/projects/{_f.Project}/entities", new ProjectEntityRequest(_f.UnitType, "Grey Wolf", null))).Id;
        Assert.Contains(LorEvolveMcpEntryImageTools.ProposeImageTool, await ToolsAsync(_f.Proposer));
        Assert.DoesNotContain(LorEvolveMcpEntryImageTools.ProposeImageTool, await ToolsAsync(_f.Viewer));

        var result = await CallAsync(_f.Proposer, new { entry = wolf.ToString(), image_base64 = Convert.ToBase64String(PublishingTestClient.Png(640, 480)) });
        var body = Body(result);
        Assert.False(result.TryGetProperty("isError", out var isError) && isError.GetBoolean(), result.ToString());
        Assert.True(body.GetProperty("uploaded").GetBoolean(), body.ToString());
        var proposalId = body.GetProperty("proposalId").GetGuid();

        var change = (await Read(_f.World.Owner, _f.World.U, proposalId)).Operations.Single();
        Assert.True(change.Media!.Uploaded);
        Assert.Equal("grey-wolf.png", change.Media.FileName);
        Assert.DoesNotContain(change.Issues, issue => issue.Code == AiChangeCodes.AwaitingUpload);
        await WithDb(_f.Api, async db => Assert.False(await db.EntityImages.AnyAsync(image => image.EntityId == wolf)));

        await ApproveAll(_f.World.Owner, _f.World.U, proposalId);
        await WithDb(_f.Api, async db =>
        {
            var image = await db.EntityImages.AsNoTracking().SingleAsync(candidate => candidate.EntityId == wolf);
            Assert.Equal("grey-wolf.png", image.FileName);
            Assert.True(_f.Api.Media.Contains(image.OriginalKey));
            Assert.False(await db.AiChangeMedia.AnyAsync(row => row.OperationId == change.Id));
        });
    }

    [Fact]
    public async Task A_new_unit_and_its_picture_are_staged_together_and_one_approval_creates_both()
    {
        // #466: the unit and its picture in one proposal, the file sent for the picture's change, one approval.
        var staged = Body(await CallAsync(_f.Proposer, new
        {
            summary = "A dune strider with its picture",
            operations = new object[]
            {
                new { id = "strider", action = "create", resource = "project_entry", projectEntry = new { projectId = _f.Project, typeId = _f.UnitType, name = "Dune Strider" } },
                new { id = "strider-face", action = "create", resource = "image", image = new { entryRef = "strider", note = "Strider, side view" } },
            },
        }, LorEvolveMcpProposalTools.ProposeTool));
        var proposalId = staged.GetProperty("proposalId").GetGuid();
        var picture = Convert.ToBase64String(PublishingTestClient.Png(640, 480));

        // Only a pending image change of that proposal takes a file.
        Assert.Equal("not_found", Error(await CallAsync(_f.Proposer, new { proposal = proposalId.ToString(), change = "strider", image_base64 = picture })));
        Assert.Equal("not_found", Error(await CallAsync(_f.Proposer, new { proposal = Guid.NewGuid().ToString(), change = "strider-face", image_base64 = picture })));
        Assert.Equal("invalid_input", Error(await CallAsync(_f.Proposer, new { proposal = proposalId.ToString(), image_base64 = picture })));

        var held = Body(await CallAsync(_f.Proposer, new { proposal = proposalId.ToString(), change = "strider-face", image_base64 = picture }));
        Assert.True(held.GetProperty("uploaded").GetBoolean(), held.ToString());
        Assert.Equal(proposalId, held.GetProperty("proposalId").GetGuid());

        var review = await Read(_f.World.Owner, _f.World.U, proposalId);
        var change = review.Operations.Single(operation => operation.Key == "strider-face");
        Assert.True(change.Media!.Uploaded);
        Assert.Equal("dune-strider.png", change.Media.FileName);
        Assert.Empty(change.Issues);

        // The picture alone can't be approved without the unit it is for.
        Assert.Equal(AiChangeCodes.MissingDependency, await Code(await Approve(_f.World.Owner, _f.World.U, review, ["strider-face"])));

        await ApproveAll(_f.World.Owner, _f.World.U, proposalId);
        var strider = Op(review, "strider");
        await WithDb(_f.Api, async db =>
        {
            var unit = await db.Entities.IgnoreQueryFilters().AsNoTracking().SingleAsync(entity => entity.Id == strider);
            Assert.Equal("Dune Strider", unit.Name);
            Assert.Equal(_f.Project, unit.ProjectId);
            var image = await db.EntityImages.AsNoTracking().SingleAsync(candidate => candidate.EntityId == strider);
            Assert.Equal("dune-strider.png", image.FileName);
            Assert.Contains($"/entities/{strider:D}/", image.OriginalKey, StringComparison.Ordinal);
            Assert.True(_f.Api.Media.Contains(image.OriginalKey));
            Assert.False(await db.AiChangeMedia.AnyAsync(row => row.OperationId == change.Id));
        });
    }

    [Fact]
    public async Task A_file_that_is_not_a_picture_or_a_link_LorEvolve_may_not_fetch_stages_nothing()
    {
        var entry = _f.Shoreward.ToString();
        var before = await ProposalsAsync();

        Assert.Equal("invalid_image", Error(await CallAsync(_f.Proposer, new { entry, image_base64 = Convert.ToBase64String("not a picture"u8.ToArray()) })));
        Assert.Equal("invalid_image", Error(await CallAsync(_f.Proposer, new { entry, image_base64 = "%%%" })));
        Assert.Equal("invalid_image", Error(await CallAsync(_f.Proposer, new { entry })));
        Assert.Equal("invalid_image", Error(await CallAsync(_f.Proposer, new { entry, image_base64 = new string('A', 12 * 1024 * 1024) })));
        Assert.Equal("invalid_image", Error(await CallAsync(_f.Proposer, new { entry, image_file = new { download_url = "https://attacker.example/wolf.png", file_id = "f" } })));
        Assert.Equal("invalid_image", Error(await CallAsync(_f.Proposer, new { entry, image_file = new { download_url = "http://files.oaiusercontent.com/wolf.png", file_id = "f" } })));
        Assert.Equal("not_found", Error(await CallAsync(_f.Proposer, new { entry = Guid.NewGuid().ToString(), image_base64 = "AAAA" })));
        Assert.Equal("not_allowed", Error(await CallAsync(_f.Viewer, new { entry, image_base64 = "AAAA" })));

        Assert.Equal(before, await ProposalsAsync());
    }

    [Theory]
    [InlineData("Wolf", ".png", "wolf.png")]
    [InlineData("  Grey  Wolf, Alpha!  ", "webp", "grey-wolf-alpha.webp")]
    [InlineData("狼", ".png", "picture.png")]
    public void The_file_is_named_after_the_entry(string name, string extension, string expected) =>
        Assert.Equal(expected, LorEvolveMcpEntryImageTools.FileName(name, extension));

    private async Task<int> ProposalsAsync()
    {
        var count = 0;
        await WithDb(_f.Api, async db => count = await db.AiChangeProposals.CountAsync(proposal => proposal.UniverseId == _f.World.U));
        return count;
    }

    private async Task<JsonElement> CallAsync(Connection connection, object arguments, string tool = LorEvolveMcpEntryImageTools.ProposeImageTool)
    {
        var response = await Post(_f.Api.CreateClient(), connection.UniverseId, connection.AccessToken, new
        {
            jsonrpc = "2.0",
            id = 3,
            method = "tools/call",
            @params = new { name = tool, arguments },
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await Message(response)).GetProperty("result");
    }

    private async Task<List<string>> ToolsAsync(Connection connection)
    {
        var response = await Post(_f.Api.CreateClient(), connection.UniverseId, connection.AccessToken, ListTools());
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
