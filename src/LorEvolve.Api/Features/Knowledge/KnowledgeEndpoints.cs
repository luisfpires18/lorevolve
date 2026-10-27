using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Knowledge;

/// <summary>
/// Knowledge records (issue 15, ADR 0057): what an actor knows and from which scene. Every member lists them
/// (<c>Read</c>); the owner and Editors add, change and remove them (<c>EditContent</c>). Nothing here reads prose, writes
/// lore or touches Canon, and nothing is public: the routes live under the universe, and no entry or scene read carries
/// a record.
///
/// A list is in reading order: what was known from the start first, then story by story (by title), Unchaptered before
/// the chapters, each container's scenes in their order - the order a continuity check wants. Each row carries the
/// readings the list can give without inferring anything: a knower who is not in the scene's lore or its point of view,
/// and anything the record names that is in the Trash.
/// </summary>
public static class KnowledgeEndpoints
{
    public static IEndpointRouteBuilder MapKnowledgeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/knowledge")
            .WithTags("Knowledge")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListKnowledge");
        group.MapPost("/", CreateAsync).WithName("CreateKnowledgeRecord");
        group.MapPut("/{recordId:guid}", UpdateAsync).WithName("UpdateKnowledgeRecord");
        group.MapDelete("/{recordId:guid}", DeleteAsync).WithName("DeleteKnowledgeRecord");

        return endpoints;
    }

    /// <summary>
    /// Every record of the universe, or those about one knower, one subject, one scene or one story. Ids that match nothing
    /// narrow the list to nothing; they reveal nothing, because the gate has already passed.
    /// </summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? knowerId = null,
        [FromQuery] Guid? subjectId = null,
        [FromQuery] Guid? sceneId = null,
        [FromQuery] Guid? storyId = null)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var query = db.KnowledgeRecords.AsNoTracking().Where(record => record.UniverseId == universeId);

        if (knowerId is { } knower)
        {
            query = query.Where(record => record.KnowerEntityId == knower);
        }

        if (subjectId is { } subject)
        {
            query = query.Where(record => record.SubjectEntityId == subject);
        }

        if (sceneId is { } scene)
        {
            query = query.Where(record => record.SceneId == scene);
        }

        if (storyId is { } story)
        {
            query = query.Where(record => record.Scene!.StoryId == story);
        }

        return Results.Ok(await ReadAsync(db, query, cancellationToken));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] KnowledgeRecordRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (await CheckAsync(db, universeId, request, stored: null, cancellationToken) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var now = DateTime.UtcNow;
        var record = new KnowledgeRecord
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            KnowerEntityId = request.KnowerEntityId!.Value,
            SubjectEntityId = request.SubjectEntityId,
            Statement = request.Statement!.Trim(),
            SceneId = request.KnownFromStart ? null : request.SceneId,
            KnownFromStart = request.KnownFromStart,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.KnowledgeRecords.Add(record);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var created = await ReadOneAsync(db, universeId, record.Id, cancellationToken);
        return Results.Created($"/api/universes/{universeId}/knowledge/{record.Id}", created);
    }

    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid recordId,
        [FromBody] KnowledgeRecordRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var record = await db.KnowledgeRecords.FirstOrDefaultAsync(row => row.Id == recordId && row.UniverseId == universeId, cancellationToken);
        if (record is null)
        {
            return Results.NotFound();
        }

        if (await CheckAsync(db, universeId, request, record, cancellationToken) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var knower = request.KnowerEntityId!.Value;
        var sceneId = request.KnownFromStart ? null : request.SceneId;
        var statement = request.Statement!.Trim();

        var changed = record.KnowerEntityId != knower
            || record.SubjectEntityId != request.SubjectEntityId
            || !string.Equals(record.Statement, statement, StringComparison.Ordinal)
            || record.SceneId != sceneId
            || record.KnownFromStart != request.KnownFromStart;

        if (changed)
        {
            record.KnowerEntityId = knower;
            record.SubjectEntityId = request.SubjectEntityId;
            record.Statement = statement;
            record.SceneId = sceneId;
            record.KnownFromStart = request.KnownFromStart;
            record.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(await ReadOneAsync(db, universeId, recordId, cancellationToken));
    }

    /// <summary>Removes a record for good. Records are an author's annotations, small and re-sayable; they have no Trash (ADR 0057).</summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid recordId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var removed = await db.KnowledgeRecords
            .Where(row => row.Id == recordId && row.UniverseId == universeId)
            .ExecuteDeleteAsync(cancellationToken);

        return removed == 0 ? Results.NotFound() : Results.NoContent();
    }

    // ---------- Checks ----------

    /// <summary>
    /// Shape first, then what the ids name: each must be a live entry or scene of this universe, except one the stored
    /// record already holds, which may be kept while it is in the Trash. Every problem at once, keyed by field.
    /// </summary>
    private static async Task<Dictionary<string, string[]>?> CheckAsync(
        LorEvolveDbContext db,
        Guid universeId,
        KnowledgeRecordRequest request,
        KnowledgeRecord? stored,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.KnowerEntityId is null)
        {
            errors["knowerEntityId"] = ["Say who knows this."];
        }

        if (string.IsNullOrWhiteSpace(request.Statement))
        {
            errors["statement"] = ["Say what they know."];
        }
        else if (request.Statement.Trim().Length > KnowledgeLimits.StatementMaxLength)
        {
            errors["statement"] = [$"A statement is at most {KnowledgeLimits.StatementMaxLength:N0} characters."];
        }

        if (request.KnownFromStart && request.SceneId is not null)
        {
            errors["sceneId"] = ["Known from the start has no scene. Choose one or the other."];
        }
        else if (!request.KnownFromStart && request.SceneId is null)
        {
            errors["sceneId"] = ["Choose the scene in which they come to know this, or mark it known from the start."];
        }

        if (request.SubjectEntityId is { } subject && request.KnowerEntityId == subject)
        {
            errors["subjectEntityId"] = ["The subject cannot be the knower."];
        }

        if (errors.Count > 0)
        {
            return errors;
        }

        var entryIds = new List<Guid> { request.KnowerEntityId!.Value };
        if (request.SubjectEntityId is { } subjectId)
        {
            entryIds.Add(subjectId);
        }

        var entries = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && entryIds.Contains(entity.Id))
            .Select(entity => new { entity.Id, Trashed = entity.DeletedAt != null })
            .ToDictionaryAsync(entity => entity.Id, cancellationToken);

        if (!Usable(entries.TryGetValue(request.KnowerEntityId.Value, out var knower) ? knower.Trashed : null, stored?.KnowerEntityId == request.KnowerEntityId))
        {
            errors["knowerEntityId"] = ["Choose a Lore entry of this universe that is not in the Trash."];
        }

        if (request.SubjectEntityId is { } chosenSubject
            && !Usable(entries.TryGetValue(chosenSubject, out var subjectRow) ? subjectRow.Trashed : null, stored?.SubjectEntityId == chosenSubject))
        {
            errors["subjectEntityId"] = ["Choose a Lore entry of this universe that is not in the Trash."];
        }

        if (!request.KnownFromStart && request.SceneId is { } sceneId)
        {
            var scene = await db.Scenes.AsNoTracking()
                .Where(row => row.Id == sceneId && row.Story!.UniverseId == universeId)
                .Select(row => new { Trashed = row.DeletedAt != null || row.Story!.DeletedAt != null })
                .FirstOrDefaultAsync(cancellationToken);

            if (!Usable(scene?.Trashed, stored?.SceneId == sceneId))
            {
                errors["sceneId"] = ["Choose a scene of this universe that is not in the Trash."];
            }
        }

        return errors.Count > 0 ? errors : null;
    }

    /// <summary>Live is always usable; in the Trash only when the record already named it; missing or foreign never.</summary>
    private static bool Usable(bool? trashed, bool alreadyHeld) => trashed is { } t && (!t || alreadyHeld);

    // ---------- Reading ----------

    private static async Task<KnowledgeRecordResponse?> ReadOneAsync(LorEvolveDbContext db, Guid universeId, Guid recordId, CancellationToken cancellationToken) =>
        (await ReadAsync(db, db.KnowledgeRecords.AsNoTracking().Where(record => record.UniverseId == universeId && record.Id == recordId), cancellationToken))
            .SingleOrDefault();

    /// <summary>One query: the records with what they name, placed in reading order, and the facts the issues are read from.</summary>
    private static async Task<List<KnowledgeRecordResponse>> ReadAsync(LorEvolveDbContext db, IQueryable<KnowledgeRecord> query, CancellationToken cancellationToken)
    {
        var rows = await query
            .Select(record => new
            {
                record.Id,
                record.Statement,
                record.KnownFromStart,
                record.CreatedAt,
                record.UpdatedAt,
                KnowerId = record.KnowerEntityId,
                KnowerName = record.Knower!.Name,
                KnowerType = record.Knower.EntityType!.Name,
                KnowerTrashed = record.Knower.DeletedAt != null,
                SubjectId = record.SubjectEntityId,
                SubjectName = record.Subject != null ? record.Subject.Name : null,
                SubjectType = record.Subject != null ? record.Subject.EntityType!.Name : null,
                SubjectTrashed = record.Subject != null && record.Subject.DeletedAt != null,
                SceneId = record.SceneId,
                SceneTitle = record.Scene != null ? record.Scene.Title : null,
                SceneTrashed = record.Scene != null && (record.Scene.DeletedAt != null || record.Scene.Story!.DeletedAt != null),
                StoryId = record.Scene != null ? (Guid?)record.Scene.StoryId : null,
                StoryTitle = record.Scene != null ? record.Scene.Story!.Title : null,
                ChapterId = record.Scene != null ? record.Scene.ChapterId : null,
                ChapterSortOrder = record.Scene != null && record.Scene.Chapter != null ? (int?)record.Scene.Chapter.SortOrder : null,
                SceneSortOrder = record.Scene != null ? (int?)record.Scene.SortOrder : null,
                ChapterTitle = record.Scene != null && record.Scene.Chapter != null ? record.Scene.Chapter.Title : null,
                ChapterNumber = record.Scene != null && record.Scene.Chapter != null
                    ? db.Chapters.Count(chapter => chapter.StoryId == record.Scene.StoryId && chapter.DeletedAt == null && chapter.SortOrder < record.Scene.Chapter.SortOrder) + 1
                    : (int?)null,
                Position = record.Scene != null
                    ? db.Scenes.Count(scene => scene.StoryId == record.Scene.StoryId && scene.ChapterId == record.Scene.ChapterId && scene.DeletedAt == null && scene.SortOrder < record.Scene.SortOrder) + 1
                    : 0,
                KnowerInScene = record.Scene != null
                    && (record.Scene.PovEntityId == record.KnowerEntityId || record.Scene.EntityLinks.Any(link => link.EntityId == record.KnowerEntityId)),
            })
            .ToListAsync(cancellationToken);

        // Reading order, placed here rather than in SQL so the rule reads as one sentence: known from the start first, then
        // story by story, Unchaptered before the chapters, each container's scenes in their order, then by creation.
        var ordered = rows
            .OrderByDescending(row => row.KnownFromStart)
            .ThenBy(row => row.StoryTitle, StringComparer.Ordinal)
            .ThenBy(row => row.ChapterId == null ? 0 : 1)
            .ThenBy(row => row.ChapterSortOrder)
            .ThenBy(row => row.SceneSortOrder)
            .ThenBy(row => row.CreatedAt)
            .ThenBy(row => row.Id);

        return
        [
            .. ordered.Select(row =>
            {
                var issues = new List<string>();
                if (row.KnowerTrashed)
                {
                    issues.Add(KnowledgeIssues.KnowerTrashed);
                }

                if (row.SubjectTrashed)
                {
                    issues.Add(KnowledgeIssues.SubjectTrashed);
                }

                if (row.SceneTrashed)
                {
                    issues.Add(KnowledgeIssues.SceneTrashed);
                }

                if (row.SceneId is not null && !row.KnowerInScene)
                {
                    issues.Add(KnowledgeIssues.KnowerNotInScene);
                }

                return new KnowledgeRecordResponse(
                    row.Id,
                    new KnowledgeLoreRef(row.KnowerId, row.KnowerName, row.KnowerType, row.KnowerTrashed),
                    row.SubjectId is { } subjectId ? new KnowledgeLoreRef(subjectId, row.SubjectName!, row.SubjectType!, row.SubjectTrashed) : null,
                    row.Statement,
                    row.KnownFromStart,
                    row.SceneId is { } sceneId
                        ? new KnowledgeSceneRef(sceneId, row.SceneTitle!, row.StoryId!.Value, row.StoryTitle!, row.ChapterId, row.ChapterNumber, row.ChapterTitle, row.Position, row.SceneTrashed)
                        : null,
                    issues,
                    Utc(row.CreatedAt),
                    Utc(row.UpdatedAt));
            }),
        ];
    }

    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);
}
