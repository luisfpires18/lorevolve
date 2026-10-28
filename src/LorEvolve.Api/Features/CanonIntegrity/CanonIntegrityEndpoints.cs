using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.CanonIntegrity;

/// <summary>
/// The review surface over one universe's conflicts.
///
/// Every route proves universe ownership before it looks at anything, and a conflict is
/// then re-resolved inside that universe, so a conflict id belonging to someone else
/// answers 404 without ever confirming that it exists. Nothing here takes a request body:
/// the only writes are the two status transitions the author can make, and both are
/// determined entirely by the route.
/// </summary>
public static class CanonIntegrityEndpoints
{
    private const int DefaultPageSize = 25;
    private const int MaxPageSize = 100;

    public static IEndpointRouteBuilder MapCanonIntegrityEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/canon-conflicts")
            .WithTags("CanonIntegrity")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListCanonConflicts");
        group.MapPost("/evaluate", EvaluateAsync).WithName("EvaluateCanonIntegrity");
        group.MapGet("/{conflictId:guid}", GetAsync).WithName("GetCanonConflict");
        group.MapPost("/{conflictId:guid}/dismiss", DismissAsync).WithName("DismissCanonConflict");
        group.MapPost("/{conflictId:guid}/reopen", ReopenAsync).WithName("ReopenCanonConflict");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] CanonConflictSeverity? severity = null,
        [FromQuery] CanonConflictStatus? status = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.CanonConflicts.AsNoTracking()
            .Where(conflict => conflict.UniverseId == universeId);

        if (severity is { } wantedSeverity)
        {
            query = query.Where(conflict => conflict.Severity == wantedSeverity);
        }

        if (status is { } wantedStatus)
        {
            query = query.Where(conflict => conflict.Status == wantedStatus);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var rows = await Ordered(query)
            .Skip(skip)
            .Take(pageSize)
            .Select(Projection())
            .ToListAsync(cancellationToken);

        var items = await MapAsync(db, universeId, rows, cancellationToken);
        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new CanonConflictPage(items, page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid conflictId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var conflict = await LoadAsync(db, universeId, conflictId, cancellationToken);
        return conflict is null ? Results.NotFound() : Results.Ok(conflict);
    }

    private static async Task<IResult> EvaluateAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CanonIntegrityEvaluator evaluator,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var summary = await evaluator.EvaluateAsync(universeId, cancellationToken);

        return Results.Ok(new CanonEvaluationResponse(
            summary.Detected,
            summary.Created,
            summary.Reopened,
            summary.Persisted,
            summary.Resolved,
            summary.EvaluatedAt));
    }

    private static Task<IResult> DismissAsync(
        Guid universeId,
        Guid conflictId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken) =>
        TransitionAsync(
            universeId,
            conflictId,
            principal,
            db,
            CanonConflictStatus.Dismissed,

            // A dismissal suppresses a live issue. This one is gone, so there would be
            // nothing to suppress, and the next evaluation would resolve it straight back.
            "This conflict is already resolved, so there is nothing to dismiss.",
            cancellationToken);

    private static Task<IResult> ReopenAsync(
        Guid universeId,
        Guid conflictId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken) =>
        TransitionAsync(
            universeId,
            conflictId,
            principal,
            db,
            CanonConflictStatus.Pending,

            // Reopening a resolved conflict would claim the issue is live when the last
            // evaluation found it gone. Re-evaluate instead: if it is back, it reopens.
            "This conflict is resolved. Evaluate the universe again to see if it comes back.",
            cancellationToken);

    /// <summary>
    /// The two transitions the author may make. Both are idempotent - asking for the status
    /// a conflict already holds returns it unchanged - and both refuse to act on a Resolved
    /// conflict, because evaluation owns that state and neither transition would be honest.
    /// </summary>
    private static async Task<IResult> TransitionAsync(
        Guid universeId,
        Guid conflictId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CanonConflictStatus target,
        string refusal,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var conflict = await db.CanonConflicts.FirstOrDefaultAsync(
            candidate => candidate.Id == conflictId && candidate.UniverseId == universeId,
            cancellationToken);

        if (conflict is null)
        {
            return Results.NotFound();
        }

        if (conflict.Status == CanonConflictStatus.Resolved)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["status"] = [refusal],
            });
        }

        if (conflict.Status != target)
        {
            conflict.Status = target;
            conflict.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(await LoadAsync(db, universeId, conflictId, cancellationToken));
    }

    // ---------- Reading ----------

    /// <summary>
    /// What needs attention, first. Pending conflicts lead, then the worst severity, then
    /// the oldest, then the id, so a conflict never swaps pages between two requests.
    /// </summary>
    private static IOrderedQueryable<CanonConflict> Ordered(IQueryable<CanonConflict> query) =>
        query
            .OrderBy(conflict => conflict.Status == CanonConflictStatus.Pending ? 0 : 1)
            .ThenByDescending(conflict => conflict.Severity)
            .ThenBy(conflict => conflict.CreatedAt)
            .ThenBy(conflict => conflict.Id);

    private static async Task<CanonConflictResponse?> LoadAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid conflictId,
        CancellationToken cancellationToken)
    {
        var row = await db.CanonConflicts.AsNoTracking()
            .Where(conflict => conflict.Id == conflictId && conflict.UniverseId == universeId)
            .Select(Projection())
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        var mapped = await MapAsync(db, universeId, [row], cancellationToken);
        return mapped[0];
    }

    private sealed record SubjectRow(CanonSubjectKind Kind, Guid SubjectId, string Role);

    private sealed record Row(
        Guid Id,
        string RuleCode,
        CanonConflictSeverity Severity,
        CanonConflictStatus Status,
        string Title,
        string Explanation,
        List<SubjectRow> Subjects,
        DateTime CreatedAt,
        DateTime UpdatedAt,
        DateTime? ResolvedAt);

    private static System.Linq.Expressions.Expression<Func<CanonConflict, Row>> Projection() =>
        conflict => new Row(
            conflict.Id,
            conflict.RuleCode,
            conflict.Severity,
            conflict.Status,
            conflict.Title,
            conflict.Explanation,
            conflict.Subjects
                .OrderBy(subject => subject.SubjectKind)
                .ThenBy(subject => subject.Role)
                .ThenBy(subject => subject.SubjectId)
                .Select(subject => new SubjectRow(subject.SubjectKind, subject.SubjectId, subject.Role))
                .ToList(),
            conflict.CreatedAt,
            conflict.UpdatedAt,
            conflict.ResolvedAt);

    /// <summary>
    /// Puts a name on every subject.
    ///
    /// Subject rows carry a kind and a raw id rather than a foreign key, so the names come
    /// from one small query per kind actually present, rather than a projection that would
    /// have to left-join four tables for every row. Each lookup is scoped to this universe,
    /// so a subject that somehow pointed elsewhere would come back nameless rather than
    /// disclose a record from another universe.
    /// </summary>
    private static async Task<List<CanonConflictResponse>> MapAsync(
        LorEvolveDbContext db,
        Guid universeId,
        List<Row> rows,
        CancellationToken cancellationToken)
    {
        var names = await ResolveNamesAsync(db, universeId, rows, cancellationToken);

        return [.. rows.Select(row => new CanonConflictResponse(
            row.Id,
            row.RuleCode,
            row.Severity,
            row.Status,
            row.Title,
            row.Explanation,
            [.. row.Subjects.Select(subject => new CanonConflictSubjectResponse(
                subject.Kind,
                subject.SubjectId,
                subject.Role,
                names.GetValueOrDefault((subject.Kind, subject.SubjectId))))],
            row.CreatedAt,
            row.UpdatedAt,
            row.ResolvedAt))];
    }

    private static async Task<Dictionary<(CanonSubjectKind, Guid), string>> ResolveNamesAsync(
        LorEvolveDbContext db,
        Guid universeId,
        List<Row> rows,
        CancellationToken cancellationToken)
    {
        var names = new Dictionary<(CanonSubjectKind, Guid), string>();

        var wanted = rows
            .SelectMany(row => row.Subjects)
            .GroupBy(subject => subject.Kind)
            .ToDictionary(
                group => group.Key,
                group => group.Select(subject => subject.SubjectId).Distinct().ToList());

        if (wanted.TryGetValue(CanonSubjectKind.Entity, out var entityIds))
        {
            // Live entries only. A subject in the Trash has no page to open, so naming it
            // here would offer the reader a link into a 404; leaving it unresolved is what
            // makes the screen say the lore is no longer here, which is exactly true.
            var found = await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId
                    && entity.DeletedAt == null
                    && entityIds.Contains(entity.Id))
                .Select(entity => new { entity.Id, entity.Name })
                .ToListAsync(cancellationToken);

            foreach (var entity in found)
            {
                names[(CanonSubjectKind.Entity, entity.Id)] = entity.Name;
            }
        }

        if (wanted.TryGetValue(CanonSubjectKind.Relationship, out var relationshipIds))
        {
            var found = await db.Relationships.AsNoTracking()
                .Where(relationship =>
                    relationship.UniverseId == universeId && relationshipIds.Contains(relationship.Id))
                .Select(relationship => new
                {
                    relationship.Id,
                    Name = relationship.SourceEntity!.Name
                        + " " + relationship.RelationshipType!.Name
                        + " " + relationship.TargetEntity!.Name,
                })
                .ToListAsync(cancellationToken);

            foreach (var relationship in found)
            {
                names[(CanonSubjectKind.Relationship, relationship.Id)] = relationship.Name;
            }
        }

        if (wanted.TryGetValue(CanonSubjectKind.TimelineEntry, out var entryIds))
        {
            var found = await db.TimelineEntries.AsNoTracking()
                .Where(entry => entry.UniverseId == universeId && entryIds.Contains(entry.Id))
                .Select(entry => new { entry.Id, entry.Title })
                .ToListAsync(cancellationToken);

            foreach (var entry in found)
            {
                names[(CanonSubjectKind.TimelineEntry, entry.Id)] = entry.Title;
            }
        }

        if (wanted.TryGetValue(CanonSubjectKind.EntityField, out var fieldIds))
        {
            var found = await db.EntityFieldDefinitions.AsNoTracking()
                .Where(field =>
                    field.EntityType!.UniverseId == universeId && fieldIds.Contains(field.Id))
                .Select(field => new { field.Id, field.Name })
                .ToListAsync(cancellationToken);

            foreach (var field in found)
            {
                names[(CanonSubjectKind.EntityField, field.Id)] = field.Name;
            }
        }

        if (wanted.TryGetValue(CanonSubjectKind.WorldRule, out var ruleIds))
        {
            // Live rules only, as for entries: a rule in the Trash has no page to open, and naming it would link into a 404.
            var found = await db.WorldRules.AsNoTracking()
                .Where(rule => rule.UniverseId == universeId && rule.DeletedAt == null && ruleIds.Contains(rule.Id))
                .Select(rule => new { rule.Id, rule.Title })
                .ToListAsync(cancellationToken);

            foreach (var rule in found)
            {
                names[(CanonSubjectKind.WorldRule, rule.Id)] = rule.Title;
            }
        }

        return names;
    }
}
