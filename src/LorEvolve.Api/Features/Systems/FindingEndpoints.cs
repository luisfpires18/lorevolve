using System.Security.Claims;
using LorEvolve.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// The review surface over one universe's World Logic findings (LOREX-020).
///
/// Every route proves universe access before it looks at anything, and a finding is then re-resolved inside that
/// universe, so a finding id belonging to someone else answers 404 without ever confirming that it exists
/// (ADR 0041). Reading needs <c>Read</c>, which every member has; sweeping and the three author decisions need
/// <c>EditContent</c>, because each of them writes.
///
/// <b>These are Canon's neighbours, not its replacement.</b> <c>Features/CanonIntegrity</c> keeps its own
/// conflicts, its own rules and its own promotion gate; nothing here reads or writes them, and a universe with no
/// System behaves exactly as it does today. The two surfaces are linked by being shown side by side, which is the
/// interface's job.
/// </summary>
public static class FindingEndpoints
{
    public static IEndpointRouteBuilder MapWorldLogicFindingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/world-logic/findings")
            .WithTags("WorldLogic")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListWorldLogicFindings");
        group.MapPost("/evaluate", EvaluateAsync).WithName("EvaluateWorldLogicFindings");
        group.MapGet("/{findingId:guid}", GetAsync).WithName("GetWorldLogicFinding");
        group.MapPost("/{findingId:guid}/review", ReviewAsync).WithName("ReviewWorldLogicFinding");
        group.MapPost("/{findingId:guid}/dismiss", DismissAsync).WithName("DismissWorldLogicFinding");
        group.MapPost("/{findingId:guid}/resolve", ResolveAsync).WithName("ResolveWorldLogicFinding");

        return endpoints;
    }

    // ---------- Evaluating ----------

    /// <summary>
    /// Evaluates every rule definition of the universe and records what it found.
    ///
    /// <paramref name="projectId"/> runs the sweep inside one project, which is what makes a project-scoped
    /// exception apply (ADR 0072, section 5.1). Each scope keeps its own findings, and a sweep never closes
    /// another scope's.
    /// </summary>
    private static async Task<IResult> EvaluateAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        WorldLogicFindingSweep sweep,
        CancellationToken cancellationToken,
        [FromQuery] Guid? projectId = null)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (projectId is { } project
            && !await WorldLogicAccess.IsProjectOfUniverseAsync(db, universeId, project, cancellationToken))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["projectId"] = ["Insert a project of this universe."],
            });
        }

        var summary = await sweep.RunAsync(universeId, projectId, cancellationToken);

        return Results.Ok(new WorldLogicSweepResponse(
            summary.Detected,
            summary.Created,
            summary.Reopened,
            summary.Persisted,
            summary.Closed,
            summary.IsTruncated,
            WorldLogicAccess.Utc(summary.EvaluatedAt)));
    }

    // ---------- The author's decisions ----------

    private static Task<IResult> ReviewAsync(
        Guid universeId,
        Guid findingId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        WorldLogicFindingDecisionRequest? request = null) =>
        DecideAsync(
            universeId,
            findingId,
            principal,
            db,
            request,
            WorldLogicFindingStatus.Reviewing,
            WorldLogicFindingAction.Reviewed,

            // Acknowledging a problem that is already gone would say the author is dealing with nothing.
            "This finding is already closed, so there is nothing to review.",
            cancellationToken);

    private static Task<IResult> DismissAsync(
        Guid universeId,
        Guid findingId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        WorldLogicFindingDecisionRequest? request = null) =>
        DecideAsync(
            universeId,
            findingId,
            principal,
            db,
            request,
            WorldLogicFindingStatus.Dismissed,
            WorldLogicFindingAction.Dismissed,

            // A dismissal suppresses a live problem. This one is gone, so there would be nothing to suppress, and
            // the next sweep would close it straight back.
            "This finding is already closed, so there is nothing to dismiss.",
            cancellationToken);

    /// <summary>
    /// The author saying the lore is fixed.
    ///
    /// It is not a suppression: if the next sweep still produces the finding it reopens, because the problem is
    /// still there. Suppressing a problem that is still there is what a dismissal is for.
    /// </summary>
    private static Task<IResult> ResolveAsync(
        Guid universeId,
        Guid findingId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        WorldLogicFindingDecisionRequest? request = null) =>
        DecideAsync(
            universeId,
            findingId,
            principal,
            db,
            request,
            WorldLogicFindingStatus.Resolved,
            WorldLogicFindingAction.Resolved,
            "This finding is already closed.",
            cancellationToken);

    /// <summary>
    /// One status transition the author may make, with the history entry that records who made it.
    ///
    /// A transition to the status a finding already has writes nothing and answers the finding, so a double click
    /// does not fill the history with identical rows.
    /// </summary>
    private static async Task<IResult> DecideAsync(
        Guid universeId,
        Guid findingId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        WorldLogicFindingDecisionRequest? request,
        WorldLogicFindingStatus target,
        WorldLogicFindingAction action,
        string refusal,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var note = (request?.Note ?? string.Empty).Trim();

        if (note.Length > WorldLogicFindingLimits.NoteMaxLength)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["note"] = [$"Keep the note to {WorldLogicAccess.Number(WorldLogicFindingLimits.NoteMaxLength)} characters or fewer."],
            });
        }

        var finding = await db.WorldLogicFindings.FirstOrDefaultAsync(
            candidate => candidate.Id == findingId && candidate.UniverseId == universeId,
            cancellationToken);

        if (finding is null)
        {
            return Results.NotFound();
        }

        // A finding evaluation has closed is settled, and the author's three decisions are all about a live one.
        // The exception is resolving: a resolved finding is already where resolve would put it.
        if (finding.Status == WorldLogicFindingStatus.Resolved && target != WorldLogicFindingStatus.Resolved)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["status"] = [refusal],
            });
        }

        if (finding.Status != target)
        {
            var now = DateTime.UtcNow;

            finding.Status = target;
            finding.ResolvedAt = target == WorldLogicFindingStatus.Resolved ? now : null;
            finding.UpdatedAt = now;

            db.WorldLogicFindingEvents.Add(new WorldLogicFindingEvent
            {
                Id = Guid.NewGuid(),
                FindingId = finding.Id,
                Action = action,
                ActorId = principal.FindFirstValue(ClaimTypes.NameIdentifier),
                Note = note,
                At = now,
            });

            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(await DetailAsync(db, universeId, findingId, cancellationToken));
    }

    // ---------- Reading ----------

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] WorldLogicFindingOutcome? outcome = null,
        [FromQuery] WorldLogicFindingStatus? status = null,
        [FromQuery] Guid? ruleId = null,
        [FromQuery] string? sort = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorldLogicFindingLimits.DefaultPageSize)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        // The order is a word on the wire, as the outcome and the status are in the answer, and an order nobody
        // offers is refused rather than quietly answered in another one.
        if (Sort(sort) is not { } wantedSort)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["sort"] = ["Insert either attention or newest."],
            });
        }

        var (wantedPage, wantedSize) = WorldLogicAccess.Paging(page, pageSize);

        var query = db.WorldLogicFindings.AsNoTracking()
            .Where(finding => finding.UniverseId == universeId);

        if (outcome is { } wantedOutcome)
        {
            query = query.Where(finding => finding.Outcome == wantedOutcome);
        }

        if (status is { } wantedStatus)
        {
            query = query.Where(finding => finding.Status == wantedStatus);
        }

        if (ruleId is { } wantedRule)
        {
            query = query.Where(finding => finding.RuleId == wantedRule);
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var rows = await Ordered(query, wantedSort)
            .Skip((wantedPage - 1) * wantedSize)
            .Take(wantedSize)
            .Select(Projection())
            .ToListAsync(cancellationToken);

        return Results.Ok(new WorldLogicPage<WorldLogicFindingRow>(
            [.. rows.Select(Mapped)],
            wantedPage,
            wantedSize,
            totalCount,
            WorldLogicAccess.TotalPages(totalCount, wantedSize)));
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

        return await DetailAsync(db, universeId, findingId, cancellationToken) is { } detail
            ? Results.Ok(detail)
            : Results.NotFound();
    }

    /// <summary>
    /// The order a caller asked for by name, or null for a word nobody offers. Unasked, it is attention order,
    /// which is what this route answered before #209, so nothing that does not ask saw its answer change.
    /// </summary>
    private static WorldLogicFindingSort? Sort(string? asked) => asked switch
    {
        null or "" or "attention" => WorldLogicFindingSort.Attention,
        "newest" => WorldLogicFindingSort.Newest,
        _ => null,
    };

    /// <summary>
    /// The order the caller asked for, which is what needs attention first unless it asked for the newest first.
    ///
    /// Attention order: open findings lead, then the worst severity, then the oldest. Severity is the outcome, so
    /// that ordering is on the outcome itself rather than on a stored column: a violation outranks an error, and an
    /// error outranks an unknown.
    ///
    /// Either way the last key is the id, so two findings made in the same tick keep one order and a finding never
    /// swaps pages between two requests.
    /// </summary>
    private static IOrderedQueryable<WorldLogicFinding> Ordered(
        IQueryable<WorldLogicFinding> query,
        WorldLogicFindingSort sort) =>
        sort == WorldLogicFindingSort.Newest
            ? query
                .OrderByDescending(finding => finding.CreatedAt)
                .ThenBy(finding => finding.Id)
            : query
                .OrderBy(finding => finding.Status == WorldLogicFindingStatus.Open ? 0 : 1)
                .ThenBy(finding => finding.Outcome == WorldLogicFindingOutcome.Violation
                    ? 0
                    : finding.Outcome == WorldLogicFindingOutcome.Error ? 1 : 2)
                .ThenBy(finding => finding.CreatedAt)
                .ThenBy(finding => finding.Id);

    private static async Task<WorldLogicFindingDetail?> DetailAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid findingId,
        CancellationToken cancellationToken)
    {
        var row = await db.WorldLogicFindings.AsNoTracking()
            .Where(finding => finding.Id == findingId && finding.UniverseId == universeId)
            .Select(Projection())
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        var evidence = await db.WorldLogicFindingEvidence.AsNoTracking()
            .Where(item => item.FindingId == findingId)
            .OrderBy(item => item.SortOrder)
            .Select(item => new ConditionEvidenceRow(item.Source, item.SourceRowId, item.Role))
            .ToListAsync(cancellationToken);

        var history = await db.WorldLogicFindingEvents.AsNoTracking()
            .Where(entry => entry.FindingId == findingId)
            .OrderBy(entry => entry.At)
            .ThenBy(entry => entry.Id)
            .Select(entry => new { entry.Action, entry.ActorId, entry.Note, entry.At })
            .ToListAsync(cancellationToken);

        return new WorldLogicFindingDetail(
            Mapped(row),
            evidence,
            WorldLogicRationale.Read(row.Rationale),
            [
                .. history.Select(entry => new WorldLogicFindingEventRow(
                    Action(entry.Action),
                    entry.ActorId,
                    entry.Note,
                    WorldLogicAccess.Utc(entry.At))),
            ]);
    }

    private sealed record Row(
        Guid Id,
        Guid RuleId,
        string RuleTitle,
        Guid? ProjectId,
        WorldLogicFindingOutcome Outcome,
        WorldLogicFindingStatus Status,
        string? ErrorCode,
        int RuleVersion,
        int SchemaVersion,
        string Fingerprint,
        string Rationale,
        int EvidenceCount,
        DateTime CreatedAt,
        DateTime UpdatedAt,
        DateTime? ResolvedAt);

    /// <summary>
    /// The rule's title comes through the navigation rather than from a second query: the finding's foreign key is
    /// required, so the rule is always there, and the global query filters on it follow the same universe the
    /// finding was already restricted to.
    /// </summary>
    private static System.Linq.Expressions.Expression<Func<WorldLogicFinding, Row>> Projection() =>
        finding => new Row(
            finding.Id,
            finding.RuleId,
            finding.Rule!.Title,
            finding.ProjectId,
            finding.Outcome,
            finding.Status,
            finding.ErrorCode,
            finding.RuleVersion,
            finding.SchemaVersion,
            finding.Fingerprint,
            finding.Rationale,
            finding.Evidence.Count,
            finding.CreatedAt,
            finding.UpdatedAt,
            finding.ResolvedAt);

    private static WorldLogicFindingRow Mapped(Row row) =>
        new(row.Id,
            row.RuleId,
            row.RuleTitle,
            row.ProjectId,
            Outcome(row.Outcome),
            Severity(WorldLogicFindingSeverity.Of(row.Outcome)),
            Status(row.Status),
            row.ErrorCode,
            row.RuleVersion,
            row.SchemaVersion,
            row.Fingerprint,
            row.EvidenceCount,
            WorldLogicAccess.Utc(row.CreatedAt),
            WorldLogicAccess.Utc(row.UpdatedAt),
            row.ResolvedAt is { } resolved ? WorldLogicAccess.Utc(resolved) : null);

    /// <summary>
    /// Each enum as text, so adding a value never shifts an existing one's meaning on the wire. A violation is the
    /// specification's <c>false</c>, named here for what a finding asserts rather than for the logic that produced
    /// it, because a reader of a findings list is not reading a truth table.
    /// </summary>
    private static string Outcome(WorldLogicFindingOutcome outcome) => outcome switch
    {
        WorldLogicFindingOutcome.Violation => "violation",
        WorldLogicFindingOutcome.Unknown => "unknown",
        _ => "error",
    };

    private static string Severity(WorldLogicSeverity severity) => severity switch
    {
        WorldLogicSeverity.High => "high",
        WorldLogicSeverity.Medium => "medium",
        _ => "low",
    };

    private static string Status(WorldLogicFindingStatus status) => status switch
    {
        WorldLogicFindingStatus.Open => "open",
        WorldLogicFindingStatus.Reviewing => "reviewing",
        WorldLogicFindingStatus.Resolved => "resolved",
        _ => "dismissed",
    };

    private static string Action(WorldLogicFindingAction action) => action switch
    {
        WorldLogicFindingAction.Detected => "detected",
        WorldLogicFindingAction.Reopened => "reopened",
        WorldLogicFindingAction.Reviewed => "reviewed",
        WorldLogicFindingAction.Dismissed => "dismissed",
        WorldLogicFindingAction.Resolved => "resolved",
        _ => "closed",
    };
}
