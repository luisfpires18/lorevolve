using System.Linq.Expressions;
using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Comments;

/// <summary>
/// Review comments on a Lore entry, a story or a scene (task 043). Every member reads them (<c>Read</c>); the owner,
/// Editors and Reviewers write them (<c>Comment</c>); the owner and Editors resolve and reopen (<c>ResolveComments</c>).
/// The subject must be live in the universe named: one in the Trash, in another universe or made up is 404, and so is a
/// thread reached through anything but a live subject of this universe. Nothing here edits, deletes or publishes content.
/// </summary>
public static class CommentEndpoints
{
    /// <summary>The 409 a reply to a resolved thread gets: it is closed until someone reopens it.</summary>
    public const string ThreadResolvedCode = "comment_thread_resolved";

    public static IEndpointRouteBuilder MapCommentEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}")
            .WithTags("Comments")
            .RequireAuthorization();

        group.MapGet("/entities/{entityId:guid}/comments", ListEntryAsync).WithName("ListEntryComments");
        group.MapPost("/entities/{entityId:guid}/comments", StartEntryAsync).WithName("StartEntryComment");
        group.MapGet("/stories/{storyId:guid}/comments", ListStoryAsync).WithName("ListStoryComments");
        group.MapPost("/stories/{storyId:guid}/comments", StartStoryAsync).WithName("StartStoryComment");
        group.MapGet("/stories/{storyId:guid}/scenes/{sceneId:guid}/comments", ListSceneAsync).WithName("ListSceneComments");
        group.MapPost("/stories/{storyId:guid}/scenes/{sceneId:guid}/comments", StartSceneAsync).WithName("StartSceneComment");

        group.MapPost("/comment-threads/{threadId:guid}/replies", ReplyAsync).WithName("ReplyToCommentThread");
        group.MapPost("/comment-threads/{threadId:guid}/resolve", ResolveAsync).WithName("ResolveCommentThread");
        group.MapPost("/comment-threads/{threadId:guid}/reopen", ReopenAsync).WithName("ReopenCommentThread");

        return endpoints;
    }

    // ---------- Subjects ----------

    private static Task<IResult> ListEntryAsync(
        Guid universeId, Guid entityId, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken) =>
        ListAsync(db, universeId, principal, () => EntryIsLiveAsync(db, universeId, entityId, cancellationToken), thread => thread.EntityId == entityId, cancellationToken);

    private static Task<IResult> StartEntryAsync(
        Guid universeId, Guid entityId, [FromBody] CommentRequest request, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken) =>
        StartAsync(db, universeId, principal, request, () => EntryIsLiveAsync(db, universeId, entityId, cancellationToken), thread => thread.EntityId = entityId, cancellationToken);

    private static Task<IResult> ListStoryAsync(
        Guid universeId, Guid storyId, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken) =>
        ListAsync(db, universeId, principal, () => StoryIsLiveAsync(db, universeId, storyId, cancellationToken), thread => thread.StoryId == storyId, cancellationToken);

    private static Task<IResult> StartStoryAsync(
        Guid universeId, Guid storyId, [FromBody] CommentRequest request, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken) =>
        StartAsync(db, universeId, principal, request, () => StoryIsLiveAsync(db, universeId, storyId, cancellationToken), thread => thread.StoryId = storyId, cancellationToken);

    private static Task<IResult> ListSceneAsync(
        Guid universeId, Guid storyId, Guid sceneId, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken) =>
        ListAsync(db, universeId, principal, () => SceneIsLiveAsync(db, universeId, storyId, sceneId, cancellationToken), thread => thread.SceneId == sceneId, cancellationToken);

    private static Task<IResult> StartSceneAsync(
        Guid universeId, Guid storyId, Guid sceneId, [FromBody] CommentRequest request, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken) =>
        StartAsync(db, universeId, principal, request, () => SceneIsLiveAsync(db, universeId, storyId, sceneId, cancellationToken), thread => thread.SceneId = sceneId, cancellationToken);

    internal static Task<bool> EntryIsLiveAsync(LorexDbContext db, Guid universeId, Guid entityId, CancellationToken cancellationToken) =>
        db.Entities.AnyAsync(entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null, cancellationToken);

    internal static Task<bool> StoryIsLiveAsync(LorexDbContext db, Guid universeId, Guid storyId, CancellationToken cancellationToken) =>
        db.Stories.AnyAsync(story => story.Id == storyId && story.UniverseId == universeId && story.DeletedAt == null, cancellationToken);

    /// <summary>A live scene of a live story of this universe, reached through the story the address names.</summary>
    internal static Task<bool> SceneIsLiveAsync(LorexDbContext db, Guid universeId, Guid storyId, Guid sceneId, CancellationToken cancellationToken) =>
        db.Scenes.AnyAsync(
            scene => scene.Id == sceneId
                && scene.StoryId == storyId
                && scene.DeletedAt == null
                && scene.Story!.UniverseId == universeId
                && scene.Story.DeletedAt == null,
            cancellationToken);

    // ---------- Threads ----------

    /// <summary>Every thread about the subject, open and resolved alike, newest first.</summary>
    private static async Task<IResult> ListAsync(
        LorexDbContext db,
        Guid universeId,
        ClaimsPrincipal principal,
        Func<Task<bool>> isLive,
        Expression<Func<CommentThread, bool>> about,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await isLive())
        {
            return Results.NotFound();
        }

        return Results.Ok(await ReadAsync(db, db.CommentThreads.Where(about), cancellationToken));
    }

    private static async Task<IResult> StartAsync(
        LorexDbContext db,
        Guid universeId,
        ClaimsPrincipal principal,
        CommentRequest request,
        Func<Task<bool>> isLive,
        Action<CommentThread> attach,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Comment, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await isLive())
        {
            return Results.NotFound();
        }

        if (Validate(request, out var body) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var now = DateTime.UtcNow;
        var thread = new CommentThread { Id = Guid.NewGuid(), CreatedAt = now };
        attach(thread);
        thread.Comments.Add(new Comment
        {
            Id = Guid.NewGuid(),
            ThreadId = thread.Id,
            AuthorUserId = principal.RequireUserId(),
            Body = body,
            CreatedAt = now,
        });

        db.CommentThreads.Add(thread);
        await db.SaveChangesAsync(cancellationToken);

        var created = await ReadAsync(db, db.CommentThreads.Where(row => row.Id == thread.Id), cancellationToken);
        return Results.Created((string?)null, created.Single());
    }

    /// <summary>Adds to an open thread. A resolved one is closed until it is reopened: 409, nothing written.</summary>
    private static async Task<IResult> ReplyAsync(
        Guid universeId,
        Guid threadId,
        [FromBody] CommentRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Comment, cancellationToken) is { } denied)
        {
            return denied;
        }

        var thread = await FindAsync(db, universeId, threadId, cancellationToken);
        if (thread is null)
        {
            return Results.NotFound();
        }

        if (Validate(request, out var body) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (thread.ResolvedAt is not null)
        {
            return Results.Problem(
                title: "Thread resolved",
                detail: "This thread is resolved. The owner or an Editor can reopen it.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = ThreadResolvedCode });
        }

        db.Comments.Add(new Comment
        {
            Id = Guid.NewGuid(),
            ThreadId = thread.Id,
            AuthorUserId = principal.RequireUserId(),
            Body = body,
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(await ReadOneAsync(db, thread.Id, cancellationToken));
    }

    /// <summary>Marks it resolved, by the caller, now. Already resolved stays as it was.</summary>
    private static Task<IResult> ResolveAsync(
        Guid universeId, Guid threadId, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken) =>
        SetResolvedAsync(db, universeId, threadId, principal, resolve: true, cancellationToken);

    /// <summary>Opens it again. Every comment stays; who resolved it is forgotten with the resolution.</summary>
    private static Task<IResult> ReopenAsync(
        Guid universeId, Guid threadId, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken) =>
        SetResolvedAsync(db, universeId, threadId, principal, resolve: false, cancellationToken);

    private static async Task<IResult> SetResolvedAsync(
        LorexDbContext db,
        Guid universeId,
        Guid threadId,
        ClaimsPrincipal principal,
        bool resolve,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ResolveComments, cancellationToken) is { } denied)
        {
            return denied;
        }

        var thread = await FindAsync(db, universeId, threadId, cancellationToken);
        if (thread is null)
        {
            return Results.NotFound();
        }

        if (resolve && thread.ResolvedAt is null)
        {
            thread.ResolvedAt = DateTime.UtcNow;
            thread.ResolvedByUserId = principal.RequireUserId();
        }
        else if (!resolve)
        {
            thread.ResolvedAt = null;
            thread.ResolvedByUserId = null;
        }

        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(await ReadOneAsync(db, thread.Id, cancellationToken));
    }

    /// <summary>
    /// The thread, tracked, only while what it is about is live in this universe - so a thread id from another universe,
    /// or about something in the Trash, is not there.
    /// </summary>
    private static Task<CommentThread?> FindAsync(LorexDbContext db, Guid universeId, Guid threadId, CancellationToken cancellationToken) =>
        db.CommentThreads.FirstOrDefaultAsync(
            thread => thread.Id == threadId
                && ((thread.EntityId != null && thread.Entity!.UniverseId == universeId && thread.Entity.DeletedAt == null)
                    || (thread.StoryId != null && thread.Story!.UniverseId == universeId && thread.Story.DeletedAt == null)
                    || (thread.SceneId != null
                        && thread.Scene!.DeletedAt == null
                        && thread.Scene.Story!.UniverseId == universeId
                        && thread.Scene.Story.DeletedAt == null)),
            cancellationToken);

    // ---------- Reading ----------

    private static async Task<CommentThreadResponse> ReadOneAsync(LorexDbContext db, Guid threadId, CancellationToken cancellationToken) =>
        (await ReadAsync(db, db.CommentThreads.Where(thread => thread.Id == threadId), cancellationToken)).Single();

    /// <summary>
    /// Every comment of these threads in one query, with each author's and resolver's username read beside it; grouped into
    /// threads here. Every thread has at least its first comment, so none is missed.
    /// </summary>
    private static async Task<List<CommentThreadResponse>> ReadAsync(
        LorexDbContext db,
        IQueryable<CommentThread> threads,
        CancellationToken cancellationToken)
    {
        var rows = await threads
            .SelectMany(thread => thread.Comments)
            .Select(comment => new
            {
                comment.ThreadId,
                ThreadCreatedAt = comment.Thread!.CreatedAt,
                comment.Thread.ResolvedAt,
                ResolvedByName = db.Users.Where(user => user.Id == comment.Thread.ResolvedByUserId).Select(user => user.UserName).FirstOrDefault(),
                comment.Id,
                AuthorName = db.Users.Where(user => user.Id == comment.AuthorUserId).Select(user => user.UserName).FirstOrDefault(),
                comment.Body,
                comment.CreatedAt,
            })
            .ToListAsync(cancellationToken);

        return [.. rows
            .GroupBy(row => row.ThreadId)
            .OrderByDescending(group => group.First().ThreadCreatedAt)
            .Select(group =>
            {
                var first = group.First();
                return new CommentThreadResponse(
                    group.Key,
                    first.ResolvedAt is not null,
                    first.ResolvedAt is null ? null : first.ResolvedByName,
                    first.ResolvedAt is { } at ? Utc(at) : null,
                    [.. group.OrderBy(row => row.CreatedAt).Select(row => new CommentResponse(row.Id, row.AuthorName, row.Body, Utc(row.CreatedAt)))]);
            })];
    }

    private static Dictionary<string, string[]>? Validate(CommentRequest request, out string body)
    {
        body = request.Body?.Trim() ?? string.Empty;

        if (body.Length == 0)
        {
            return new() { ["body"] = ["Write something before posting."] };
        }

        return body.Length > CommentLimits.BodyMaxLength
            ? new() { ["body"] = [$"Keep a comment under {CommentLimits.BodyMaxLength:N0} characters."] }
            : null;
    }

    /// <summary>SQLite hands a stored moment back with no kind; every moment here was written as UTC.</summary>
    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);
}
