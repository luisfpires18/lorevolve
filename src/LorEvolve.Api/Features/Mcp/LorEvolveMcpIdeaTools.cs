using System.ComponentModel;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using static LorEvolve.Api.Features.Mcp.McpResults;
namespace LorEvolve.Api.Features.Mcp;
/// <summary>
/// One of the universe owner's ideas, read in full over MCP, at the owner's request.
///
/// <para>Ideas are the owner's own and never part of the universe's lore, so the read tools never list them
/// (<c>search_universe</c> skips them). The ids come from <c>get_change_options</c>, which lists the owner's ideas by
/// title; this tool opens one by that id and returns its whole body. It is listed with the proposal tools
/// (<see cref="ProposeGated"/>), as <c>get_change_options</c> is, and only the universe's owner may call it: any other
/// role, an idea of another account, an idea of another universe or a deleted idea is not found.</para>
/// </summary>
[McpServerToolType]
public sealed class LorEvolveMcpIdeaTools(LorEvolveDbContext db, McpCaller caller)
{
    public const string GetTool = "get_idea";
    /// <summary>Listed beside the proposal tools in <see cref="LorEvolveMcpProposalTools"/>'s gate, so a read-only connection never sees it.</summary>
    public static readonly string[] ProposeGated = [GetTool];
    /// <summary>What a client is told about this tool, added to the server's instructions.</summary>
    public const string Instructions =
        " Ideas: get_idea opens one of the universe owner's ideas, by the id get_change_options gave, and returns its full "
        + "body. An idea is a possibility the owner keeps, not lore: nothing in it is true in the world.";
    [McpServerTool(Name = GetTool, Title = "Read an idea", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Read one of the universe owner's ideas in full: its title, its whole body text, the project it is a note for and "
        + "what it refers to. Only the universe's owner has ideas. An idea is a possibility the owner keeps, not lore: nothing in it "
        + "is true in the world. Get the id from get_change_options.")]
    public async Task<CallToolResult> GetIdeaAsync(
        [Description("The idea's id, as get_change_options gave it.")] string? ideaId,
        CancellationToken cancellationToken = default)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }
        // The gate filter refuses a connection that may not propose before this runs; checked again so the tool holds alone.
        var role = caller.CanPropose ? await UniverseAccess.RoleAsync(db, caller.UniverseId, caller.UserId, cancellationToken) : null;
        if (role != UniverseRole.Owner)
        {
            return Error("not_allowed", "Only the universe's owner has ideas, through a connection allowed to propose.");
        }
        if (!Guid.TryParse(ideaId, out var id))
        {
            return NotFound("No idea with that id is in this universe.");
        }
        // The same ideas get_change_options lists: live, in this universe, and the universe owner's own.
        var idea = await db.Ideas.AsNoTracking()
            .Where(row => row.Id == id && row.UniverseId == caller.UniverseId && row.DeletedAt == null && row.OwnerId == row.Universe!.OwnerId)
            .Select(row => new
            {
                id = row.Id,
                title = row.Title,
                body = row.Body,
                projectId = row.ProjectId,
                createdAt = row.CreatedAt,
                updatedAt = row.UpdatedAt,
                lore = row.EntityReferences.Select(reference => reference.EntityId),
                stories = row.StoryReferences.Select(reference => reference.StoryId),
                scenes = row.SceneReferences.Select(reference => reference.SceneId),
                plotArcs = row.PlotArcReferences.Select(reference => reference.PlotArcId),
            })
            .FirstOrDefaultAsync(cancellationToken);
        return idea is null ? NotFound("No idea with that id is in this universe.") : Result(idea);
    }
}
