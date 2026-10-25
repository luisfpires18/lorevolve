using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lorex.Api.Data;
using Lorex.Api.Features.AiChanges;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Lorex.Api.Features.Mcp;

/// <summary>
/// MCP V2's proposal tools (ADR 0047): find what can be proposed, stage a proposal, read one back. None of them changes
/// the universe - a proposal waits in LoreX's Pending AI Changes until a signed-in person approves it there, and there is
/// no tool that approves or applies anything.
///
/// <para><b>Only for connections allowed to propose.</b> The token must carry <see cref="McpLimits.ProposeScope"/> and the
/// connection must still allow it (Connected Apps can turn it off); otherwise the tools are not even listed, and a call is
/// refused. The person's role is read again on every call: a Viewer, or someone who lost access, proposes nothing.</para>
/// </summary>
[McpServerToolType]
public sealed class LorexMcpProposalTools(LorexDbContext db, McpCaller caller, McpSite site, TimeProvider clock)
{
    public const string OptionsTool = "get_change_options";
    public const string ProposeTool = "propose_changes";
    public const string ReadTool = "get_change_proposal";

    private static readonly HashSet<string> Names = [OptionsTool, ProposeTool, ReadTool];

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>Hides the proposal tools from a connection that may not propose, and refuses them if called anyway.</summary>
    public static void Filters(Microsoft.Extensions.DependencyInjection.IMcpRequestFilterBuilder filters)
    {
        filters.AddListToolsFilter(next => async (context, cancellationToken) =>
        {
            var result = await next(context, cancellationToken);
            if (context.Services?.GetService<McpCaller>() is not { CanPropose: true })
            {
                result.Tools = [.. result.Tools.Where(tool => !Names.Contains(tool.Name))];
            }

            return result;
        });

        filters.AddCallToolFilter(next => async (context, cancellationToken) =>
            Names.Contains(context.Params?.Name ?? string.Empty) && context.Services?.GetService<McpCaller>() is not { CanPropose: true }
                ? Error("not_allowed", "This connection can only read. To propose changes, connect the app again in LoreX and allow proposals.")
                : await next(context, cancellationToken));
    }

    [McpServerTool(Name = OptionsTool, Title = "What changes can be proposed", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Before proposing changes, read what can be proposed in this universe for this person: the changes their role allows, "
        + "the lore types with the ids of their fields and choices, the relationship kinds, the stories with their chapters and plot arcs, the "
        + "date periods and months, the world rules, the event kinds and methods, and - for the universe owner only - their ideas here - "
        + "and the universe's real schema: every type with its fields (archived ones apart), parent and groups, every group, the field "
        + "kinds and icons, and whether this connection may propose schema. Use only these ids; never assume the starter types are all "
        + "there is. Give loreId to also get that entry's progression - its eras, forms, abilities and appearances by id - for a "
        + "progression change.")]
    public async Task<CallToolResult> GetChangeOptionsAsync(
        [Description("Optional: a lore entry's id, to include its progression's ids and version.")] string? loreId = null,
        CancellationToken cancellationToken = default)
    {
        if (await RoleAsync(cancellationToken) is not { } role)
        {
            return NotAllowed();
        }

        return Result(await AiChangeCatalog.ReadAsync(
            db, caller.UniverseId, role, cancellationToken, caller.CanProposeSchema, Guid.TryParse(loreId, out var entityId) ? entityId : null));
    }

    [McpServerTool(Name = ProposeTool, Title = "Propose changes for review", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Stage changes to this universe for the person to review in LoreX. Only do this when the person asked for these changes. "
        + "Nothing changes until they approve it in LoreX's Pending AI Changes; this tool cannot approve or apply anything. "
        + "Send up to 100 changes: create, update or remove (to the Trash) lore entries, relationships, stories, chapters, scenes, plot arcs, "
        + "add to or change an entry's progression - its eras, forms, abilities and appearances, for the same entry - "
        + "plot beats, timeline moments, world rules and - for the universe owner - their ideas; write scene manuscripts and entry articles; "
        + "reorder a story's chapters or arcs, a chapter's scenes or an arc's beats. Where get_change_options says schema may be proposed, "
        + "a proposal of its own can instead create and update lore types, field definitions with their choices, semantic groups, "
        + "relationship kinds, event kinds and methods, add date periods and calendar months, and archive a field; propose what uses "
        + "them after it is approved. A change can refer to what an earlier change creates "
        + "with {\"ref\": \"<its id>\"}. Nothing is ever deleted for good. "
        + "Every change is checked first: if any has a problem, nothing is staged and every problem is listed so you can fix them and send again. "
        + "Returns the proposal's id and the address where the person reviews it.")]
    public async Task<CallToolResult> ProposeChangesAsync(
        [Description("One short line for the reviewer saying what these changes do.")] string? summary,
        [Description("The changes, in order.")] IReadOnlyList<AiChangeOperationInput>? operations,
        CancellationToken cancellationToken)
    {
        if (await RoleAsync(cancellationToken) is null)
        {
            return NotAllowed();
        }

        var staged = await AiChangeStaging.StageAsync(
            db,
            clock,
            caller.UniverseId,
            caller.UserId,
            new AiChangeOrigin(AiChangeSource.Mcp, caller.ConnectionId, caller.ClientName, caller.CanProposeSchema),
            new AiChangeSubmission(summary, operations),
            cancellationToken);

        if (staged.Proposal is not { } proposal)
        {
            return new CallToolResult
            {
                IsError = true,
                Content = [new TextContentBlock { Text = JsonSerializer.Serialize(new
                {
                    error = "invalid_proposal",
                    message = "Nothing was staged. Fix these problems and send the whole proposal again.",
                    problems = staged.Issues.Select(issue => new { change = issue.Index, id = issue.Id, code = issue.Code, issue.Field, issue.Message }),
                }, Json) }],
            };
        }

        return Result(new
        {
            proposalId = proposal.Id,
            status = "waiting_for_review",
            reviewUrl = ReviewUrl(proposal.Id),
            message = "Staged for review. Nothing in the universe has changed: tell the person their changes are waiting in LoreX's Pending AI Changes, where they can approve or reject each one.",
            changes = proposal.Operations.OrderBy(operation => operation.Sequence).Select(operation => new { id = operation.Key, action = operation.Action, resource = operation.Resource }),
        });
    }

    [McpServerTool(Name = ReadTool, Title = "Read a proposal's status", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Read back a proposal this connection's person staged: whether each change is still waiting, was applied (with the id it made) "
        + "or was rejected, and any problem that now stops it being applied.")]
    public async Task<CallToolResult> GetChangeProposalAsync(
        [Description("The proposal's id, as propose_changes returned it.")] string proposalId,
        CancellationToken cancellationToken)
    {
        if (await RoleAsync(cancellationToken) is not { } role)
        {
            return NotAllowed();
        }

        var mine = Guid.TryParse(proposalId, out var id)
            && await db.AiChangeProposals.AnyAsync(row => row.Id == id && row.UniverseId == caller.UniverseId && row.ProposedByUserId == caller.UserId, cancellationToken);
        if (!mine || await AiChangeViews.ReadAsync(db, caller.UniverseId, id, caller.UserId, role, cancellationToken) is not { } reading)
        {
            return Error("not_found", "No proposal of yours with that id is in this universe.");
        }

        return Result(new
        {
            proposalId = id,
            status = reading.Proposal.Status,
            reviewUrl = ReviewUrl(id),
            blocked = reading.Blocked,
            changes = reading.Operations.Select(operation => new
            {
                id = operation.Key,
                operation.Title,
                status = operation.Status,
                resultId = operation.ResultId,
                problems = operation.Issues.Select(issue => issue.Message),
            }),
        });
    }

    /// <summary>The person's role now, when it lets them propose anything; null otherwise.</summary>
    private async Task<UniverseRole?> RoleAsync(CancellationToken cancellationToken)
    {
        if (!caller.IsAllowed || !caller.CanPropose)
        {
            return null;
        }

        var role = await UniverseAccess.RoleAsync(db, caller.UniverseId, caller.UserId, cancellationToken);
        return role is { } effective && AiChangePermissions.MayStageAnything(effective) ? effective : null;
    }

    private string ReviewUrl(Guid proposalId) => $"{site.Base}/app/universes/{caller.UniverseId:D}/ai-changes/{proposalId:D}";

    private static CallToolResult NotAllowed() =>
        Error("not_allowed", "Your role in this universe can only read, or this connection can't propose changes. Nothing was staged.");

    private static CallToolResult Result<T>(T value) => new()
    {
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(value, Json) }],
    };

    private static CallToolResult Error(string code, string message) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(new { error = code, message }, Json) }],
    };
}
