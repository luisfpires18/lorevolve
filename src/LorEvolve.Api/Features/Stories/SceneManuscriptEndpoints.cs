using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// A scene's prose and its saved versions, read and written on their own address and nowhere else. The story read, the
/// scene routes and the plot read never carry either, so a story of a hundred long scenes still draws its outline without
/// downloading a word.
///
/// Every route proves universe ownership, then a live story in that universe, then a live scene in that story; a scene
/// reached through another story or universe, or one in the Trash, answers exactly as a missing one does. Its prose and
/// history are kept while it is there, and are reachable again once it is restored.
///
/// <b>Plain text, stored as sent.</b> No trimming, no normalising and no reading for meaning. Like the rest of a story, a
/// manuscript write passes no Canon gate and reconciles nothing: "The king died before sunrise" gives nobody a death year
/// (ADR 0027).
///
/// <b>No silent overwrite.</b> A save names the manuscript's <c>version</c> it was written over. When the stored manuscript
/// has moved on since - saved by a collaborator, or from another tab or device - the save is refused and nothing is written.
/// This is a comparison inside the write's own transaction, not an editing session: no lock, no presence, no merge (ADR
/// 0043). Putting a saved version back is the same write, refused the same way.
///
/// <b>Saved versions.</b> Every save that changes the prose records the whole text as the manuscript's next version; a save
/// that changes nothing records nothing. Putting one back records it again as the newest, naming where it came from, and
/// nothing on record is rewritten or removed (ADR 0029).
/// </summary>
public static class SceneManuscriptEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a save written over a manuscript that has since changed.</summary>
    public const string ChangedCode = "scene_manuscript_changed";

    public static IEndpointRouteBuilder MapSceneManuscriptEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/universes/{universeId:guid}/stories/{storyId:guid}/scenes/{sceneId:guid}/manuscript")
            .WithTags("Scenes")
            .RequireAuthorization();

        group.MapGet("/", GetAsync).WithName("GetSceneManuscript");
        group.MapPut("/", SaveAsync).WithName("SaveSceneManuscript");
        group.MapGet("/revisions", ListRevisionsAsync).WithName("ListSceneManuscriptRevisions");
        group.MapGet("/revisions/{revisionId:guid}", GetRevisionAsync).WithName("GetSceneManuscriptRevision");
        group.MapPost("/revisions/{revisionId:guid}/restore", RestoreRevisionAsync)
            .WithName("RestoreSceneManuscriptRevision");

        return endpoints;
    }

    /// <summary>The scene's prose, or an empty manuscript when nothing has been written for it yet.</summary>
    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await StoryEndpoints.DenyStoryAsync(db, universeId, storyId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await SceneInStoryAsync(db, storyId, sceneId, cancellationToken))
        {
            return Results.NotFound();
        }

        var stored = await db.SceneManuscripts.AsNoTracking()
            .Where(manuscript => manuscript.SceneId == sceneId)
            .Select(manuscript => new { manuscript.Content, manuscript.UpdatedAt, manuscript.Version })
            .FirstOrDefaultAsync(cancellationToken);

        return Results.Ok(stored is null
            ? new SceneManuscriptResponse(sceneId, string.Empty, null, 0)
            : new SceneManuscriptResponse(sceneId, stored.Content, Utc(stored.UpdatedAt), stored.Version));
    }

    /// <summary>
    /// Replaces the scene's prose with exactly the text sent, creating the row on the first save that writes something, and
    /// records it as the manuscript's next version. Updates the story's <c>UpdatedAt</c> - the author worked on it - and
    /// never the scene's, whose planning did not change.
    /// </summary>
    private static async Task<IResult> SaveAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        [FromBody] SceneManuscriptRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await SaveCoreAsync(db, universeId, storyId, sceneId, request, principal.RequireUserId(), cancellationToken);
    }

    /// <summary>
    /// The one save of a scene's prose, shared with an approved AI change (ADR 0047): the version compared and the text
    /// stored inside one transaction - the caller's when it has one. Access is the caller's to prove first.
    /// </summary>
    internal static async Task<IResult> SaveCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        SceneManuscriptRequest request,
        string actorUserId,
        CancellationToken cancellationToken)
    {
        // One transaction for the comparison and the write, so nothing can land between them: SQLite has one writer.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null || !await SceneInStoryAsync(db, storyId, sceneId, cancellationToken))
        {
            return Results.NotFound();
        }

        if (StoryValidation.ValidateManuscript(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var result = await WriteAsync(
            db,
            story,
            sceneId,
            request.Content!,
            request.ExpectedVersion,
            SceneManuscriptRevisionKind.Edited,
            null,
            actorUserId,
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    /// <summary>Newest first, and no text: a history row says when, and whether the save emptied the prose.</summary>
    private static async Task<IResult> ListRevisionsAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await StoryEndpoints.DenyStoryAsync(db, universeId, storyId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await SceneInStoryAsync(db, storyId, sceneId, cancellationToken))
        {
            return Results.NotFound();
        }

        var revisions = await db.SceneManuscriptRevisions.AsNoTracking()
            .Where(revision => revision.SceneId == sceneId)
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

        return Results.Ok(revisions.Select(revision => new SceneManuscriptRevisionSummary(
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
        Guid storyId,
        Guid sceneId,
        Guid revisionId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await StoryEndpoints.DenyStoryAsync(db, universeId, storyId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        var revision = await FindRevisionAsync(db, storyId, sceneId, revisionId, cancellationToken);

        return revision is null
            ? Results.NotFound()
            : Results.Ok(new SceneManuscriptRevisionDetail(
                revision.Id,
                revision.Number,
                revision.Kind,
                revision.RestoredFromRevisionId,
                Utc(revision.CreatedAt),
                revision.Content));
    }

    /// <summary>
    /// Puts a saved version back as the prose, through the same write a save uses - so the same stale-save refusal applies,
    /// and the restore is recorded as the next version naming what it came from. Restoring a version identical to the prose
    /// as it stands writes nothing.
    /// </summary>
    private static async Task<IResult> RestoreRevisionAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        Guid revisionId,
        [FromBody] SceneManuscriptRestoreRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        var revision = story is null ? null : await FindRevisionAsync(db, storyId, sceneId, revisionId, cancellationToken);
        if (story is null || revision is null)
        {
            return Results.NotFound();
        }

        // What is put back is held to what a save may store today, so a restore cannot write what a save would refuse.
        if (StoryValidation.ValidateManuscript(new SceneManuscriptRequest(revision.Content, request.ExpectedVersion))
            is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var result = await WriteAsync(
            db,
            story,
            sceneId,
            revision.Content,
            request.ExpectedVersion,
            SceneManuscriptRevisionKind.Restored,
            revision.Id,
            principal.RequireUserId(),
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    /// <summary>
    /// The one write: compare, store, record a version and touch the story's <c>UpdatedAt</c>. Runs inside the caller's
    /// transaction. A write that would change nothing stores and records nothing - no row, no version, no timestamp - and
    /// answers with the manuscript as it stands.
    /// </summary>
    private static async Task<IResult> WriteAsync(
        LorEvolveDbContext db,
        Story story,
        Guid sceneId,
        string content,
        int? expectedVersion,
        SceneManuscriptRevisionKind kind,
        Guid? restoredFromRevisionId,
        string actorUserId,
        CancellationToken cancellationToken)
    {
        var manuscript = await db.SceneManuscripts.FirstOrDefaultAsync(
            candidate => candidate.SceneId == sceneId,
            cancellationToken);

        // No prose yet is version 0, so the first save names 0 and creates version 1.
        var version = manuscript?.Version ?? 0;

        if (!EditVersion.Matches(version, expectedVersion))
        {
            return EditVersion.Changed(
                ChangedCode,
                "Manuscript changed",
                "This scene's manuscript was saved somewhere else after it was opened here. Nothing was overwritten.",
                version,
                new Dictionary<string, object?> { ["updatedAt"] = manuscript is null ? null : Utc(manuscript.UpdatedAt) });
        }

        if (string.Equals(manuscript?.Content ?? string.Empty, content, StringComparison.Ordinal))
        {
            return Results.Ok(new SceneManuscriptResponse(
                sceneId,
                content,
                manuscript is null ? null : Utc(manuscript.UpdatedAt),
                version));
        }

        var now = DateTime.UtcNow;

        if (manuscript is null)
        {
            db.SceneManuscripts.Add(new SceneManuscript { SceneId = sceneId, Content = content, UpdatedAt = now, Version = 1 });
        }
        else
        {
            manuscript.Content = content;
            manuscript.UpdatedAt = now;
            manuscript.Version = version + 1;
        }

        var lastNumber = await db.SceneManuscriptRevisions
            .Where(revision => revision.SceneId == sceneId)
            .MaxAsync(revision => (int?)revision.Number, cancellationToken) ?? 0;

        db.SceneManuscriptRevisions.Add(new SceneManuscriptRevision
        {
            Id = Guid.NewGuid(),
            SceneId = sceneId,
            Number = lastNumber + 1,
            Kind = lastNumber == 0 ? SceneManuscriptRevisionKind.Created : kind,
            RestoredFromRevisionId = restoredFromRevisionId,
            CreatedAt = now,
            ActorUserId = actorUserId,
            Content = content,
        });

        story.UpdatedAt = now;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new SceneManuscriptResponse(sceneId, content, now, version + 1));
    }

    /// <summary>A live scene of this story. The caller has already proved the story is the caller's and live.</summary>
    private static Task<bool> SceneInStoryAsync(
        LorEvolveDbContext db,
        Guid storyId,
        Guid sceneId,
        CancellationToken cancellationToken) =>
        db.Scenes.AnyAsync(
            scene => scene.Id == sceneId && scene.StoryId == storyId && scene.DeletedAt == null,
            cancellationToken);

    /// <summary>A version reached only through a live scene of this story, so a history in the Trash is not reachable.</summary>
    private static Task<SceneManuscriptRevision?> FindRevisionAsync(
        LorEvolveDbContext db,
        Guid storyId,
        Guid sceneId,
        Guid revisionId,
        CancellationToken cancellationToken) =>
        db.SceneManuscriptRevisions.AsNoTracking()
            .FirstOrDefaultAsync(
                revision => revision.Id == revisionId
                    && revision.SceneId == sceneId
                    && revision.Scene!.StoryId == storyId
                    && revision.Scene.DeletedAt == null,
                cancellationToken);

    /// <summary>Stored as UTC; written out with its zone.</summary>
    private static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
