using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// Pending AI Changes (ADR 0047): where a person reviews what an AI proposed - from an outside app over MCP or from the
/// assistant - and decides. Browser routes on the session cookie only, like the rest of <c>/api</c> (ADR 0005: SameSite
/// Strict and JSON bodies); an MCP bearer token is never a session here, so no AI can reach a decision.
///
/// The owner and Editors read every proposal of their universe and decide them; anyone else reads only their own, and only
/// while they can still read the universe. A proposal of another universe, or another person's, answers as missing.
/// </summary>
public static class AiChangeEndpoints
{
    public static IEndpointRouteBuilder MapAiChangeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var account = endpoints.MapGroup("/api/ai-changes").WithTags("AI changes").RequireAuthorization();
        account.MapGet("/", ListAsync).WithName("ListAiChanges");
        account.MapGet("/count", CountAsync).WithName("CountAiChanges");

        var universe = endpoints.MapGroup("/api/universes/{universeId:guid}/ai-changes").WithTags("AI changes").RequireAuthorization();
        universe.MapGet("/{proposalId:guid}", GetAsync).WithName("GetAiChange");
        universe.MapPut("/{proposalId:guid}/operations/{operationId:guid}", EditAsync).WithName("EditAiChange");
        universe.MapPost("/{proposalId:guid}/approve", ApproveAsync).WithName("ApproveAiChange");
        universe.MapPost("/{proposalId:guid}/reject", RejectAsync).WithName("RejectAiChange");
        universe.MapGet("/{proposalId:guid}/approve/{approvalId:guid}/progress", ReadProgressAsync).WithName("AiChangeApprovalProgress");

        return endpoints;
    }

    /// <summary>
    /// One page of the proposals the reader may see, newest first: those waiting (<c>state=open</c>, the default) or those
    /// decided. <c>universeId</c> narrows it to one universe; <c>before</c> carries on after the last one a page answered.
    /// </summary>
    private static async Task<IResult> ListAsync(
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken,
        [FromQuery] string? state = null,
        [FromQuery] Guid? universeId = null,
        [FromQuery] Guid? before = null)
    {
        bool? open = state switch
        {
            null or "open" => true,
            "decided" => false,
            _ => null,
        };

        if (open is not { } wantOpen)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["state"] = ["Ask for open or decided proposals."] });
        }

        await AiChangeRetention.SweepAsync(db, clock.GetUtcNow().UtcDateTime, cancellationToken);

        var userId = principal.RequireUserId();
        var visible = AiChangeViews.Visible(db, userId).AsNoTracking();
        if (universeId is { } only)
        {
            visible = visible.Where(proposal => proposal.UniverseId == only);
        }

        var rows = visible.Where(proposal => (proposal.Status == AiChangeProposalStatus.Open) == wantOpen);
        if (before is { } cursorId)
        {
            var cursor = await visible.Where(proposal => proposal.Id == cursorId).Select(proposal => new { proposal.CreatedAt, proposal.Id }).FirstOrDefaultAsync(cancellationToken);
            if (cursor is null)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["before"] = ["Continue from a proposal on this page."] });
            }

            rows = rows.Where(proposal => proposal.CreatedAt < cursor.CreatedAt || (proposal.CreatedAt == cursor.CreatedAt && proposal.Id > cursor.Id));
        }

        var page = await AiChangeViews.Summaries(db, rows.OrderByDescending(proposal => proposal.CreatedAt).ThenBy(proposal => proposal.Id).Take(AiChangeLimits.PageSize + 1), userId)
            .ToListAsync(cancellationToken);

        return Results.Ok(new AiChangePage(
            [.. page.Take(AiChangeLimits.PageSize).Select(Utc)],
            page.Count > AiChangeLimits.PageSize));
    }

    /// <summary>How many proposals wait for the reader: every open one they could decide, and their own. For the navigation's count.</summary>
    private static async Task<IResult> CountAsync(ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken)
    {
        var count = await AiChangeViews.Visible(db, principal.RequireUserId())
            .CountAsync(proposal => proposal.Status == AiChangeProposalStatus.Open, cancellationToken);
        return Results.Ok(new AiChangeCount(count));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid proposalId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var (denied, role) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        await AiChangeRetention.SweepAsync(db, clock.GetUtcNow().UtcDateTime, cancellationToken);
        var proposal = await AiChangeViews.ReadAsync(db, universeId, proposalId, principal.RequireUserId(), role, cancellationToken);
        return proposal is null ? Results.NotFound() : Results.Ok(proposal);
    }

    private static async Task<IResult> EditAsync(
        Guid universeId,
        Guid proposalId,
        Guid operationId,
        [FromBody] AiChangeEditRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (denied, role) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);
        return denied ?? await AiChangeCommit.EditAsync(db, universeId, proposalId, operationId, principal.RequireUserId(), role, request, cancellationToken);
    }

    private static async Task<IResult> ApproveAsync(
        Guid universeId,
        Guid proposalId,
        [FromBody] AiChangeApproveRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CanonPromotionGate gate,
        AiChangeProgress progress,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await AiChangeCommit.ApproveAsync(db, gate, progress, clock, universeId, proposalId, principal.RequireUserId(), request, cancellationToken);
    }

    /// <summary>
    /// How far the caller's own running approval has got, read while its request is still open. Behind the same gate as
    /// approving. Missing once it has finished, or when it is someone else's; the approval's answer is what says what was
    /// applied.
    /// </summary>
    private static async Task<IResult> ReadProgressAsync(
        Guid universeId,
        Guid approvalId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        AiChangeProgress progress,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return progress.Read(approvalId, principal.RequireUserId()) is { } entry
            ? Results.Ok(new { done = entry.Done, total = entry.Total })
            : Results.NotFound();
    }

    /// <summary>Reject: a reviewer any proposal of the universe, anyone else only their own (a withdrawal). Nothing else changes.</summary>
    private static async Task<IResult> RejectAsync(
        Guid universeId,
        Guid proposalId,
        [FromBody] AiChangeRejectRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var (denied, role) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken);
        return denied ?? await AiChangeCommit.RejectAsync(db, clock, universeId, proposalId, principal.RequireUserId(), role, request, cancellationToken);
    }

    private static AiChangeProposalSummary Utc(AiChangeProposalSummary summary) => summary with
    {
        CreatedAt = DateTime.SpecifyKind(summary.CreatedAt, DateTimeKind.Utc),
        ExpiresAt = DateTime.SpecifyKind(summary.ExpiresAt, DateTimeKind.Utc),
    };
}
