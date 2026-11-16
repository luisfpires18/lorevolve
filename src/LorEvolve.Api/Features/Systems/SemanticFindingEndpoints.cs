using System.Security.Claims;
using LorEvolve.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// The author's side of a semantic finding (#154): read what connected AI clients have claimed about this universe,
/// and accept or dismiss each one.
///
/// <para><b>Nothing here submits one.</b> A claim only ever arrives over MCP, from a connection the author approved
/// for proposing (ADR 0046, ADR 0047). These routes read and decide, which is why reading needs
/// <c>Read</c> and a decision needs <c>EditContent</c>, exactly as a deterministic finding's decision does.</para>
///
/// <para><b>These are not the deterministic findings.</b> Those live under <c>world-logic/findings</c> and come only
/// from <see cref="RuleValidation.Conditions.WorldLogicEvaluator"/>. Accepting a claim here records that the author
/// agrees it is worth acting on; it never turns the claim into a proven violation, and it writes nothing into the
/// findings these routes' neighbours read (ADR 0072).</para>
/// </summary>
public static class SemanticFindingEndpoints
{
    public static IEndpointRouteBuilder MapSemanticFindingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/world-logic/semantic-findings")
            .WithTags("WorldLogic")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListSemanticFindings");
        group.MapGet("/{findingId:guid}", GetAsync).WithName("GetSemanticFinding");
        group.MapPost("/{findingId:guid}/accept", AcceptAsync).WithName("AcceptSemanticFinding");
        group.MapPost("/{findingId:guid}/dismiss", DismissAsync).WithName("DismissSemanticFinding");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] SemanticFindingStatus? status = null,
        [FromQuery] Guid? ruleId = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = SemanticFindingLimits.DefaultPageSize)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        return Results.Ok(await SemanticFindingReads.ListAsync(
            db, universeId, status, ruleId, page, pageSize, cancellationToken));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid findingId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await SemanticFindingReads.DetailAsync(db, universeId, findingId, cancellationToken) is { } detail
            ? Results.Ok(detail)
            : Results.NotFound();
    }

    private static Task<IResult> AcceptAsync(
        Guid universeId,
        Guid findingId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        SemanticFindingDecisionRequest? request = null) =>
        DecideAsync(universeId, findingId, principal, db, request, SemanticFindingStatus.Accepted, cancellationToken);

    private static Task<IResult> DismissAsync(
        Guid universeId,
        Guid findingId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        SemanticFindingDecisionRequest? request = null) =>
        DecideAsync(universeId, findingId, principal, db, request, SemanticFindingStatus.Dismissed, cancellationToken);

    /// <summary>
    /// Accepting or dismissing one claim. A decision can be changed: the author may dismiss something they accepted,
    /// because unlike a deterministic finding nothing recomputes this and their reading of a claim is allowed to
    /// change. The note and the time are rewritten with it.
    /// </summary>
    private static async Task<IResult> DecideAsync(
        Guid universeId,
        Guid findingId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        SemanticFindingDecisionRequest? request,
        SemanticFindingStatus target,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var note = request?.Note?.Trim();
        if (note is { Length: > SemanticFindingLimits.DecisionNoteMaxLength })
        {
            return Problems.Field(
                "note",
                $"Keep the note to {WorldLogicAccess.Number(SemanticFindingLimits.DecisionNoteMaxLength)} characters or fewer.");
        }

        var finding = await db.SemanticFindings.FirstOrDefaultAsync(
            candidate => candidate.Id == findingId && candidate.UniverseId == universeId,
            cancellationToken);

        if (finding is null)
        {
            return Results.NotFound();
        }

        var now = DateTime.UtcNow;
        finding.Status = target;
        finding.DecidedAt = now;
        finding.DecisionNote = string.IsNullOrEmpty(note) ? null : note;
        finding.UpdatedAt = now;
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(await SemanticFindingReads.DetailAsync(db, universeId, findingId, cancellationToken));
    }
}
