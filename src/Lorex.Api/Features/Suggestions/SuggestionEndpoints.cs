using System.Linq.Expressions;
using System.Security.Claims;
using System.Text.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Comments;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Suggestions;

/// <summary>
/// Suggested changes to a Lore entry, a story or a scene (task 045, ADR 0044). Every member reads them (<c>Read</c>); the
/// owner, Editors and Reviewers propose them (<c>SuggestChanges</c>); the owner and Editors accept or reject them
/// (<c>ResolveSuggestedChanges</c>). Like comments, a suggestion is only ever reached through a live target in the
/// universe named: a target in the Trash, in another universe or made up is 404.
///
/// <b>Nothing here writes content but an accept, and an accept is an ordinary save.</b> A proposal is the target's own
/// save request, sent here instead of to the save route; it runs through that same write path inside a savepoint that is
/// always rolled back, so it is validated, version-checked and refused exactly as the save would be, and what it would
/// store is read back from the write path itself. An accept replays the stored proposal through the same path again, as
/// the resolver, over the version the proposal was made against - so validation, the Canon gate, history and the version
/// all behave as for an edit, and a target saved in between refuses it.
/// </summary>
public static class SuggestionEndpoints
{
    /// <summary>The 409 an accept gets once the target was saved after the suggestion was made. Nothing is written.</summary>
    public const string TargetChangedCode = "suggestion_target_changed";

    /// <summary>The 409 an accept or reject gets once someone else accepted or rejected it first.</summary>
    public const string ResolvedCode = "suggestion_resolved";

    /// <summary>The 400 a proposal gets when it would change nothing the form edits.</summary>
    public const string UnchangedCode = "suggestion_unchanged";

    private const string Trial = "suggestion_trial";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static IEndpointRouteBuilder MapSuggestionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}")
            .WithTags("Suggestions")
            .RequireAuthorization();

        group.MapGet("/entities/{entityId:guid}/suggestions", ListEntryAsync).WithName("ListEntrySuggestions");
        group.MapPost("/entities/{entityId:guid}/suggestions", ProposeEntryAsync).WithName("SuggestEntryChanges");
        group.MapGet("/stories/{storyId:guid}/suggestions", ListStoryAsync).WithName("ListStorySuggestions");
        group.MapPost("/stories/{storyId:guid}/suggestions", ProposeStoryAsync).WithName("SuggestStoryChanges");
        group.MapGet("/stories/{storyId:guid}/scenes/{sceneId:guid}/suggestions", ListSceneAsync).WithName("ListSceneSuggestions");
        group.MapPost("/stories/{storyId:guid}/scenes/{sceneId:guid}/suggestions", ProposeSceneAsync).WithName("SuggestSceneChanges");

        group.MapPost("/suggestions/{suggestionId:guid}/accept", AcceptAsync).WithName("AcceptSuggestion");
        group.MapPost("/suggestions/{suggestionId:guid}/reject", RejectAsync).WithName("RejectSuggestion");

        return endpoints;
    }

    // ---------- Listing ----------

    private static async Task<IResult> ListEntryAsync(
        Guid universeId, Guid entityId, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CommentEndpoints.EntryIsLiveAsync(db, universeId, entityId, cancellationToken)
            ? Results.Ok(await ReadAsync<EntrySuggestion>(db, db.SuggestedChanges.Where(row => row.EntityId == entityId), cancellationToken))
            : Results.NotFound();
    }

    private static async Task<IResult> ListStoryAsync(
        Guid universeId, Guid storyId, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CommentEndpoints.StoryIsLiveAsync(db, universeId, storyId, cancellationToken)
            ? Results.Ok(await ReadAsync<StorySuggestion>(db, db.SuggestedChanges.Where(row => row.StoryId == storyId), cancellationToken))
            : Results.NotFound();
    }

    private static async Task<IResult> ListSceneAsync(
        Guid universeId, Guid storyId, Guid sceneId, ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CommentEndpoints.SceneIsLiveAsync(db, universeId, storyId, sceneId, cancellationToken)
            ? Results.Ok(await ReadAsync<SceneSuggestion>(db, db.SuggestedChanges.Where(row => row.SceneId == sceneId), cancellationToken))
            : Results.NotFound();
    }

    // ---------- Proposing ----------

    /// <summary>The entry form's own save request, here a proposal. A request still carrying the article is refused whole.</summary>
    private static async Task<IResult> ProposeEntryAsync(
        Guid universeId,
        Guid entityId,
        [FromBody] EntityRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.SuggestChanges, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (EntityEndpoints.RefusedLegacyArticle(request) is { } refused)
        {
            return refused;
        }

        var userId = principal.RequireUserId();
        return await ProposeAsync<EntityDetail, EntrySuggestion>(
            db,
            userId,
            token => EntityEndpoints.LoadDetailAsync(db, universeId, entityId, token, liveOnly: true),
            token => EntityEndpoints.UpdateCoreAsync(universeId, entityId, request, userId, db, token),
            entry => (EntrySuggestion.From(entry), entry.Version),
            suggestion => suggestion.EntityId = entityId,
            cancellationToken);
    }

    private static async Task<IResult> ProposeStoryAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] StoryRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.SuggestChanges, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await ProposeAsync<StoryDetail, StorySuggestion>(
            db,
            principal.RequireUserId(),
            token => StoryEndpoints.LoadDetailAsync(db, universeId, storyId, token),
            token => StoryEndpoints.UpdateCoreAsync(db, universeId, storyId, request, token),
            story => (StorySuggestion.From(story), story.Version),
            suggestion => suggestion.StoryId = storyId,
            cancellationToken);
    }

    private static async Task<IResult> ProposeSceneAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        [FromBody] SceneRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.SuggestChanges, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await ProposeAsync<SceneResponse, SceneSuggestion>(
            db,
            principal.RequireUserId(),
            async token => await CommentEndpoints.SceneIsLiveAsync(db, universeId, storyId, sceneId, token)
                ? await SceneEndpoints.LoadSceneAsync(db, universeId, storyId, sceneId, token)
                : null,
            token => SceneEndpoints.UpdateCoreAsync(db, universeId, storyId, sceneId, request, token),
            scene => (SceneSuggestion.From(scene), scene.Version),
            suggestion => suggestion.SceneId = sceneId,
            cancellationToken);
    }

    /// <summary>
    /// One transaction: the target as stored, then its ordinary save inside a savepoint - every refusal it makes (404, the
    /// stale-version 409, validation) answered as it is - then what that save would have stored, read from its own answer,
    /// and the savepoint rolled back. Only the suggestion is written. A proposal the save path would not count as a change
    /// (its version would not move) is refused.
    /// </summary>
    private static async Task<IResult> ProposeAsync<TDetail, TSnapshot>(
        LorexDbContext db,
        string userId,
        Func<CancellationToken, Task<TDetail?>> read,
        Func<CancellationToken, Task<IResult>> save,
        Func<TDetail, (TSnapshot Snapshot, int Version)> describe,
        Action<SuggestedChange> attach,
        CancellationToken cancellationToken)
        where TDetail : class
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        if (await read(cancellationToken) is not { } stored)
        {
            return Results.NotFound();
        }

        var (before, baseVersion) = describe(stored);

        await transaction.CreateSavepointAsync(Trial, cancellationToken);
        var saved = await save(cancellationToken);
        if (saved is not IValueHttpResult<TDetail> { Value: { } written })
        {
            return saved;
        }

        var (proposed, writtenVersion) = describe(written);
        await transaction.RollbackToSavepointAsync(Trial, cancellationToken);
        db.ChangeTracker.Clear();

        if (writtenVersion == baseVersion)
        {
            return Results.Problem(
                title: "Nothing to suggest",
                detail: "This suggestion doesn't change anything yet. Change something first.",
                statusCode: StatusCodes.Status400BadRequest,
                extensions: new Dictionary<string, object?> { ["code"] = UnchangedCode });
        }

        var suggestion = new SuggestedChange
        {
            Id = Guid.NewGuid(),
            BaseVersion = baseVersion,
            Before = JsonSerializer.Serialize(before, Json),
            Proposed = JsonSerializer.Serialize(proposed, Json),
            Status = SuggestionStatus.Open,
            ProposedByUserId = userId,
            CreatedAt = DateTime.UtcNow,
        };
        attach(suggestion);

        db.SuggestedChanges.Add(suggestion);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var created = await ReadAsync<TSnapshot>(db, db.SuggestedChanges.Where(row => row.Id == suggestion.Id), cancellationToken);
        return Results.Created((string?)null, created.Single());
    }

    // ---------- Resolving ----------

    /// <summary>
    /// Saves the proposal as the resolver, through the target's ordinary write path, and marks it accepted - one
    /// transaction, the entry's under the Canon gate as its edit is. Open only, and only while the target still holds the
    /// version it was proposed over; anything the save refuses (validation, the gate) leaves it open and the target as it was.
    /// </summary>
    private static async Task<IResult> AcceptAsync(
        Guid universeId,
        Guid suggestionId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ResolveSuggestedChanges, cancellationToken) is { } denied)
        {
            return denied;
        }

        var target = await db.SuggestedChanges.AsNoTracking()
            .Where(row => row.Id == suggestionId)
            .Where(LiveIn(universeId))
            .Select(row => new { row.EntityId, row.StoryId, row.SceneId, SceneStoryId = (Guid?)row.Scene!.StoryId })
            .FirstOrDefaultAsync(cancellationToken);

        if (target is null)
        {
            return Results.NotFound();
        }

        var userId = principal.RequireUserId();

        if (target.EntityId is { } entityId)
        {
            return await gate.RunAsync(
                universeId,
                token => ApplyAsync<EntrySuggestion>(
                    db,
                    universeId,
                    suggestionId,
                    userId,
                    () => db.Entities.Where(row => row.Id == entityId).Select(row => row.Version).SingleAsync(token),
                    (proposal, version) => EntityEndpoints.UpdateCoreAsync(universeId, entityId, proposal.Request(version), userId, db, token),
                    token),
                cancellationToken);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var result = target.StoryId is { } storyId
            ? await ApplyAsync<StorySuggestion>(
                db,
                universeId,
                suggestionId,
                userId,
                () => db.Stories.Where(row => row.Id == storyId).Select(row => row.Version).SingleAsync(cancellationToken),
                (proposal, version) => StoryEndpoints.UpdateCoreAsync(db, universeId, storyId, proposal.Request(version), cancellationToken),
                cancellationToken)
            : await ApplyAsync<SceneSuggestion>(
                db,
                universeId,
                suggestionId,
                userId,
                () => db.Scenes.Where(row => row.Id == target.SceneId).Select(row => row.Version).SingleAsync(cancellationToken),
                (proposal, version) => SceneEndpoints.UpdateCoreAsync(
                    db, universeId, target.SceneStoryId!.Value, target.SceneId!.Value, proposal.Request(version), cancellationToken),
                cancellationToken);

        if (Succeeded(result))
        {
            await transaction.CommitAsync(cancellationToken);
        }

        return result;
    }

    /// <summary>Inside the caller's transaction: checks, saves, and marks it accepted. Nothing is committed here.</summary>
    private static async Task<IResult> ApplyAsync<TSnapshot>(
        LorexDbContext db,
        Guid universeId,
        Guid suggestionId,
        string userId,
        Func<Task<int>> currentVersion,
        Func<TSnapshot, int, Task<IResult>> save,
        CancellationToken cancellationToken)
    {
        var suggestion = await FindAsync(db, universeId, suggestionId, cancellationToken);
        if (suggestion is null)
        {
            return Results.NotFound();
        }

        if (suggestion.Status != SuggestionStatus.Open)
        {
            return AlreadyResolved();
        }

        if (await currentVersion() != suggestion.BaseVersion)
        {
            return Results.Problem(
                title: "Changed since the suggestion",
                detail: "Someone saved this after the suggestion was made, so it can't be accepted. Nothing was changed.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = TargetChangedCode });
        }

        var saved = await save(JsonSerializer.Deserialize<TSnapshot>(suggestion.Proposed, Json)!, suggestion.BaseVersion);
        if (!Succeeded(saved))
        {
            return saved;
        }

        suggestion.Status = SuggestionStatus.Accepted;
        suggestion.ResolvedByUserId = userId;
        suggestion.ResolvedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok((await ReadAsync<TSnapshot>(db, db.SuggestedChanges.Where(row => row.Id == suggestionId), cancellationToken)).Single());
    }

    /// <summary>Marks an open suggestion rejected, by the caller, now. The target is not touched.</summary>
    private static async Task<IResult> RejectAsync(
        Guid universeId,
        Guid suggestionId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ResolveSuggestedChanges, cancellationToken) is { } denied)
        {
            return denied;
        }

        // Read and written in one IMMEDIATE transaction, so an accept racing it cannot be overwritten.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var suggestion = await FindAsync(db, universeId, suggestionId, cancellationToken);
        if (suggestion is null)
        {
            return Results.NotFound();
        }

        if (suggestion.Status != SuggestionStatus.Open)
        {
            return AlreadyResolved();
        }

        suggestion.Status = SuggestionStatus.Rejected;
        suggestion.ResolvedByUserId = principal.RequireUserId();
        suggestion.ResolvedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var one = db.SuggestedChanges.Where(row => row.Id == suggestionId);
        return suggestion.EntityId is not null
            ? Results.Ok((await ReadAsync<EntrySuggestion>(db, one, cancellationToken)).Single())
            : suggestion.StoryId is not null
                ? Results.Ok((await ReadAsync<StorySuggestion>(db, one, cancellationToken)).Single())
                : Results.Ok((await ReadAsync<SceneSuggestion>(db, one, cancellationToken)).Single());
    }

    private static IResult AlreadyResolved() =>
        Results.Problem(
            title: "Already decided",
            detail: "Someone already accepted or rejected this suggestion.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ResolvedCode });

    /// <summary>Whether a write path's answer is a success worth committing, as the Canon gate judges one.</summary>
    private static bool Succeeded(IResult result) =>
        result is not IStatusCodeHttpResult { StatusCode: { } status } || status is >= 200 and < 300;

    /// <summary>A suggestion only while its target is live in this universe - so one from another universe, or about something in the Trash, is not there.</summary>
    private static Expression<Func<SuggestedChange, bool>> LiveIn(Guid universeId) =>
        row => (row.EntityId != null && row.Entity!.UniverseId == universeId && row.Entity.DeletedAt == null)
            || (row.StoryId != null && row.Story!.UniverseId == universeId && row.Story.DeletedAt == null)
            || (row.SceneId != null
                && row.Scene!.DeletedAt == null
                && row.Scene.Story!.UniverseId == universeId
                && row.Scene.Story.DeletedAt == null);

    private static Task<SuggestedChange?> FindAsync(LorexDbContext db, Guid universeId, Guid suggestionId, CancellationToken cancellationToken) =>
        db.SuggestedChanges.Where(row => row.Id == suggestionId).Where(LiveIn(universeId)).FirstOrDefaultAsync(cancellationToken);

    // ---------- Reading ----------

    /// <summary>
    /// The suggestions <paramref name="query"/> selects, open first and then newest first, at most
    /// <see cref="SuggestionLimits.ListMax"/>, in one query: the proposer's and resolver's usernames and the target's
    /// version read beside each row.
    /// </summary>
    private static async Task<List<SuggestionResponse<TSnapshot>>> ReadAsync<TSnapshot>(
        LorexDbContext db,
        IQueryable<SuggestedChange> query,
        CancellationToken cancellationToken)
    {
        var rows = await query.AsNoTracking()
            .OrderBy(row => row.Status == SuggestionStatus.Open ? 0 : 1)
            .ThenByDescending(row => row.CreatedAt)
            .ThenBy(row => row.Id)
            .Take(SuggestionLimits.ListMax)
            .Select(row => new
            {
                row.Id,
                row.Status,
                row.CreatedAt,
                row.ResolvedAt,
                row.BaseVersion,
                row.Before,
                row.Proposed,
                ProposedByName = db.Users.Where(user => user.Id == row.ProposedByUserId).Select(user => user.UserName).FirstOrDefault(),
                ResolvedByName = db.Users.Where(user => user.Id == row.ResolvedByUserId).Select(user => user.UserName).FirstOrDefault(),
                TargetVersion = row.EntityId != null ? row.Entity!.Version : row.StoryId != null ? row.Story!.Version : row.Scene!.Version,
            })
            .ToListAsync(cancellationToken);

        return
        [
            .. rows.Select(row => new SuggestionResponse<TSnapshot>(
                row.Id,
                row.Status,
                row.ProposedByName,
                Utc(row.CreatedAt),
                row.ResolvedAt is null ? null : row.ResolvedByName,
                row.ResolvedAt is { } at ? Utc(at) : null,
                row.Status == SuggestionStatus.Open && row.TargetVersion != row.BaseVersion,
                JsonSerializer.Deserialize<TSnapshot>(row.Before, Json)!,
                JsonSerializer.Deserialize<TSnapshot>(row.Proposed, Json)!)),
        ];
    }

    /// <summary>SQLite hands a stored moment back with no kind; every moment here was written as UTC.</summary>
    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);
}
