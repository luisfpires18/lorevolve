using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// An entry's article and its history, read and written on their own address. The entry routes, the listing, the Trash and
/// every other lore read carry no article, so a universe of long articles still browses without downloading one.
///
/// Every route proves universe ownership, then a live entry in that universe. A trashed entry's article is kept exactly as
/// it was and is simply not reachable here, like the entry itself; an entry reached through another universe answers as a
/// missing one does. Validation runs after ownership, so a stranger's malformed body is a 404 too.
///
/// <b>Not structured lore.</b> An article save passes no Canon gate and reconciles nothing, because no rule reads prose: it
/// changes no field, status, relationship or timeline entry, and records no entry revision. It is as settled as the entry
/// it belongs to and has no status of its own (ADR 0028).
///
/// <b>No silent overwrite.</b> A save names the article's <c>version</c> it was written over; when the stored article has
/// moved on since - saved by a collaborator, or from another tab or device - the save is refused and nothing is written. The
/// same comparison as a scene's manuscript and every other protected save (ADR 0043), inside the write's own transaction.
/// </summary>
public static class EntityArticleEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a save written over an article that has since changed.</summary>
    public const string ChangedCode = "entity_article_changed";

    public static IEndpointRouteBuilder MapEntityArticleEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/universes/{universeId:guid}/entities/{entityId:guid}/article")
            .WithTags("Entities")
            .RequireAuthorization();

        group.MapGet("/", GetAsync).WithName("GetEntityArticle");
        group.MapPut("/", SaveAsync).WithName("SaveEntityArticle");
        group.MapGet("/revisions", ListRevisionsAsync).WithName("ListEntityArticleRevisions");
        group.MapGet("/revisions/{revisionId:guid}", GetRevisionAsync).WithName("GetEntityArticleRevision");
        group.MapPost("/revisions/{revisionId:guid}/restore", RestoreRevisionAsync)
            .WithName("RestoreEntityArticleRevision");

        return endpoints;
    }

    /// <summary>The entry's article, or an empty one when nothing has been written for it.</summary>
    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await IsLiveAsync(db, universeId, entityId, cancellationToken))
        {
            return Results.NotFound();
        }

        var stored = await db.EntityArticles.AsNoTracking()
            .Where(article => article.EntityId == entityId)
            .Select(article => new { article.Content, article.UpdatedAt, article.Version })
            .FirstOrDefaultAsync(cancellationToken);

        return Results.Ok(stored is null
            ? new EntityArticleResponse(entityId, string.Empty, null, 0)
            : new EntityArticleResponse(entityId, stored.Content, Utc(stored.UpdatedAt), stored.Version));
    }

    /// <summary>Replaces the article with the document sent, and records it as the article's next version.</summary>
    private static async Task<IResult> SaveAsync(
        Guid universeId,
        Guid entityId,
        [FromBody] EntityArticleRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await SaveCoreAsync(db, universeId, entityId, request, principal.RequireUserId(), cancellationToken);
    }

    /// <summary>
    /// The save itself, shared with an approved AI change (ADR 0048): a live entry of this universe, the document's own
    /// validation, then the one write, all in one transaction - the caller's when it has one. Access is the caller's.
    /// </summary>
    internal static async Task<IResult> SaveCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid entityId,
        EntityArticleRequest request,
        string actorUserId,
        CancellationToken cancellationToken)
    {
        // One transaction for the comparison and the write, so nothing can land between them: SQLite has one writer.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (!await IsLiveAsync(db, universeId, entityId, cancellationToken))
        {
            return Results.NotFound();
        }

        if (LoreValidation.ValidateArticle(request.Content) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var result = await WriteAsync(
            db,
            entityId,
            request.Content!,
            request.ExpectedVersion,
            EntityRevisionKind.Edited,
            null,
            actorUserId,
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    /// <summary>Newest first, and no text: a history row says when, and whether the save cleared the article.</summary>
    private static async Task<IResult> ListRevisionsAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await IsLiveAsync(db, universeId, entityId, cancellationToken))
        {
            return Results.NotFound();
        }

        var revisions = await db.EntityArticleRevisions.AsNoTracking()
            .Where(revision => revision.EntityId == entityId)
            .OrderByDescending(revision => revision.Number)
            .Select(revision => new
            {
                revision.Id,
                revision.Number,
                revision.Kind,
                revision.RestoredFromRevisionId,
                revision.CreatedAt,
                IsEmpty = revision.Content == string.Empty,
                ActorName = db.Users.Where(user => user.Id == revision.ActorUserId).Select(user => user.UserName).FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);

        return Results.Ok(revisions.Select(revision => new EntityArticleRevisionSummary(
            revision.Id,
            revision.Number,
            revision.Kind,
            revision.RestoredFromRevisionId,
            Utc(revision.CreatedAt),
            revision.IsEmpty,
            revision.ActorName)));
    }

    private static async Task<IResult> GetRevisionAsync(
        Guid universeId,
        Guid entityId,
        Guid revisionId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        var revision = await FindRevisionAsync(db, universeId, entityId, revisionId, cancellationToken);

        return revision is null
            ? Results.NotFound()
            : Results.Ok(new EntityArticleRevisionDetail(
                revision.Id,
                revision.Number,
                revision.Kind,
                revision.RestoredFromRevisionId,
                Utc(revision.CreatedAt),
                revision.Content));
    }

    /// <summary>
    /// Puts a saved version back as the article, through the same write a save uses - so the same stale-save refusal
    /// applies, and the restore is recorded as the next version naming what it came from. Nothing on record is moved,
    /// rewritten or removed. Restoring a version identical to the article as it stands writes nothing.
    /// </summary>
    private static async Task<IResult> RestoreRevisionAsync(
        Guid universeId,
        Guid entityId,
        Guid revisionId,
        [FromBody] EntityArticleRestoreRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var revision = await FindRevisionAsync(db, universeId, entityId, revisionId, cancellationToken);
        if (revision is null)
        {
            return Results.NotFound();
        }

        // What is put back is held to what a save may store today, so a restore cannot write what a save would refuse.
        if (LoreValidation.ValidateArticle(revision.Content) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var result = await WriteAsync(
            db,
            entityId,
            revision.Content,
            request.ExpectedVersion,
            EntityRevisionKind.Restored,
            revision.Id,
            principal.RequireUserId(),
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    /// <summary>
    /// The one write: compare, store, record a version, touch the entry's <c>UpdatedAt</c> and keep search in step. Runs
    /// inside the caller's transaction. A write that changes nothing stores and records nothing and answers with the
    /// article as it stands.
    /// </summary>
    private static async Task<IResult> WriteAsync(
        LorEvolveDbContext db,
        Guid entityId,
        string content,
        int? expectedVersion,
        EntityRevisionKind kind,
        Guid? restoredFromRevisionId,
        string actorUserId,
        CancellationToken cancellationToken)
    {
        // A blank document is no article: stored as "", never as whitespace that would read as text.
        var document = string.IsNullOrWhiteSpace(content) ? string.Empty : content;

        var article = await db.EntityArticles.FirstOrDefaultAsync(
            candidate => candidate.EntityId == entityId,
            cancellationToken);

        // No article yet is version 0, so the first save names 0 and creates version 1.
        var version = article?.Version ?? 0;

        if (!EditVersion.Matches(version, expectedVersion))
        {
            return EditVersion.Changed(
                ChangedCode,
                "Article changed",
                "This entry's article was saved somewhere else after it was opened here. Nothing was overwritten.",
                version,
                new Dictionary<string, object?> { ["updatedAt"] = article is null ? null : Utc(article.UpdatedAt) });
        }

        if (string.Equals(article?.Content ?? string.Empty, document, StringComparison.Ordinal))
        {
            return Results.Ok(new EntityArticleResponse(
                entityId,
                document,
                article is null ? null : Utc(article.UpdatedAt),
                version));
        }

        var now = DateTime.UtcNow;

        if (article is null)
        {
            db.EntityArticles.Add(new EntityArticle { EntityId = entityId, Content = document, UpdatedAt = now, Version = 1 });
        }
        else
        {
            article.Content = document;
            article.UpdatedAt = now;
            article.Version = version + 1;
        }

        var lastNumber = await db.EntityArticleRevisions
            .Where(revision => revision.EntityId == entityId)
            .MaxAsync(revision => (int?)revision.Number, cancellationToken) ?? 0;

        db.EntityArticleRevisions.Add(new EntityArticleRevision
        {
            Id = Guid.NewGuid(),
            EntityId = entityId,
            Number = lastNumber + 1,
            Kind = lastNumber == 0 ? EntityRevisionKind.Created : kind,
            RestoredFromRevisionId = restoredFromRevisionId,
            CreatedAt = now,
            ActorUserId = actorUserId,
            Content = document,
        });

        await db.SaveChangesAsync(cancellationToken);

        // The entry was worked on, so it sorts as recently authored. Only this column: nothing structured is read or
        // written back, so a save can never overwrite a field edited in another window.
        await db.Entities
            .Where(entity => entity.Id == entityId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(entity => entity.UpdatedAt, now), cancellationToken);

        await EntitySearchIndex.ReindexAsync(db, entityId, cancellationToken);

        return Results.Ok(new EntityArticleResponse(entityId, document, now, version + 1));
    }

    private static Task<bool> IsLiveAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid entityId,
        CancellationToken cancellationToken) =>
        db.Entities.AnyAsync(
            entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null,
            cancellationToken);

    /// <summary>A version reached only through a live entry of this universe, so a trashed entry's history is not reachable.</summary>
    private static Task<EntityArticleRevision?> FindRevisionAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid entityId,
        Guid revisionId,
        CancellationToken cancellationToken) =>
        db.EntityArticleRevisions.AsNoTracking()
            .FirstOrDefaultAsync(
                revision => revision.Id == revisionId
                    && revision.EntityId == entityId
                    && revision.Entity!.UniverseId == universeId
                    && revision.Entity.DeletedAt == null,
                cancellationToken);

    /// <summary>Stored as UTC; written out with its zone.</summary>
    private static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
