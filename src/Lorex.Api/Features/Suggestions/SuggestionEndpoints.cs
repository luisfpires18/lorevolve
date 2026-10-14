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
using Microsoft.EntityFrameworkCore.Storage;

namespace Lorex.Api.Features.Suggestions;

/// <summary>
/// Suggested changes to a Lore entry, a story or a scene (task 045, ADR 0044). Every member reads them (<c>Read</c>); the
/// owner, Editors and Reviewers propose them (<c>SuggestChanges</c>); the owner and Editors accept or reject them
/// (<c>ResolveSuggestedChanges</c>). Like comments, a suggestion is only ever reached through a live target in the
/// universe named: a target in the Trash, in another universe or made up is 404.
///
/// <b>Proposing writes nothing but the suggestion.</b> A proposal is the target's own save request, sent here instead of
/// to the save route. It is checked by the save's own checks - the version it names, the form's shape, references in this
/// universe - and normalised by the save's own helpers, all reads; the save path itself, with its history, search index
/// and anything a save may later grow, is never run for a proposal. <b>An accept is an ordinary save:</b> the stored
/// proposal replayed through the target's write path, as the resolver, over the version it was proposed against, so
/// everything is checked again there and a target saved in between refuses it.
/// </summary>
public static class SuggestionEndpoints
{
    /// <summary>The 409 an accept gets once the target was saved after the suggestion was made. Nothing is written.</summary>
    public const string TargetChangedCode = "suggestion_target_changed";

    /// <summary>The 409 an accept or reject gets once someone else accepted or rejected it first.</summary>
    public const string ResolvedCode = "suggestion_resolved";

    /// <summary>The 400 a proposal gets when it would change nothing the form edits.</summary>
    public const string UnchangedCode = "suggestion_unchanged";

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
        Guid universeId,
        Guid entityId,
        [FromQuery] string? state,
        [FromQuery] Guid? before,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CommentEndpoints.EntryIsLiveAsync(db, universeId, entityId, cancellationToken)
            ? await PageAsync<EntrySuggestion>(db, db.SuggestedChanges.Where(row => row.EntityId == entityId), state, before, cancellationToken)
            : Results.NotFound();
    }

    private static async Task<IResult> ListStoryAsync(
        Guid universeId,
        Guid storyId,
        [FromQuery] string? state,
        [FromQuery] Guid? before,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CommentEndpoints.StoryIsLiveAsync(db, universeId, storyId, cancellationToken)
            ? await PageAsync<StorySuggestion>(db, db.SuggestedChanges.Where(row => row.StoryId == storyId), state, before, cancellationToken)
            : Results.NotFound();
    }

    private static async Task<IResult> ListSceneAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        [FromQuery] string? state,
        [FromQuery] Guid? before,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CommentEndpoints.SceneIsLiveAsync(db, universeId, storyId, sceneId, cancellationToken)
            ? await PageAsync<SceneSuggestion>(db, db.SuggestedChanges.Where(row => row.SceneId == sceneId), state, before, cancellationToken)
            : Results.NotFound();
    }

    /// <summary>
    /// One page of the target's open (<c>state=open</c>, the default) or decided (<c>state=decided</c>) suggestions, newest
    /// first - by when each was made, then by id, so the order never changes. <c>before</c> is the last one already read;
    /// the page carries on from it by those two values, so nothing is skipped or repeated when something is decided
    /// meanwhile - a suggestion that moves from open to decided is simply found in the other list.
    /// </summary>
    private static async Task<IResult> PageAsync<TSnapshot>(
        LorexDbContext db,
        IQueryable<SuggestedChange> target,
        string? state,
        Guid? before,
        CancellationToken cancellationToken)
    {
        bool? open = state switch
        {
            null or "open" => true,
            "decided" => false,
            _ => null,
        };

        if (open is not { } wantOpen)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["state"] = ["Ask for open or decided suggestions."] });
        }

        var rows = target.Where(row => (row.Status == SuggestionStatus.Open) == wantOpen);

        if (before is { } cursorId)
        {
            var cursor = await target.AsNoTracking()
                .Where(row => row.Id == cursorId)
                .Select(row => new { row.CreatedAt, row.Id })
                .FirstOrDefaultAsync(cancellationToken);

            if (cursor is null)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["before"] = ["Continue from a suggestion on this page."] });
            }

            rows = rows.Where(row => row.CreatedAt < cursor.CreatedAt || (row.CreatedAt == cursor.CreatedAt && row.Id > cursor.Id));
        }

        var page = await ReadAsync<TSnapshot>(
            db,
            rows.OrderByDescending(row => row.CreatedAt).ThenBy(row => row.Id).Take(SuggestionLimits.PageSize + 1),
            cancellationToken);

        return Results.Ok(new SuggestionPage<TSnapshot>([.. page.Take(SuggestionLimits.PageSize)], page.Count > SuggestionLimits.PageSize));
    }

    // ---------- Proposing ----------

    /// <summary>
    /// The entry form's own save request, here a proposal: the version it names, the entry's checks, its aliases, tags and
    /// field values prepared as the save would prepare them - and nothing written but the suggestion. A request still
    /// carrying the article is refused whole.
    /// </summary>
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

        if (EntityEndpoints.RefusedLegacyArticle(request) is { } legacy)
        {
            return legacy;
        }

        // One IMMEDIATE transaction: the version compared is the version the suggestion is stored against.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var stored = await EntityEndpoints.LoadDetailAsync(db, universeId, entityId, cancellationToken, liveOnly: true);
        if (stored is null)
        {
            return Results.NotFound();
        }

        if (!EditVersion.Matches(stored.Version, request.ExpectedVersion))
        {
            return EntityEndpoints.Changed(stored.Version);
        }

        if (await EntityEndpoints.CheckEntryAsync(db, universeId, request, cancellationToken) is { } refused)
        {
            return refused;
        }

        var (definitions, rows, errors) = await EntityEndpoints.PrepareFieldValuesAsync(db, universeId, entityId, request, cancellationToken);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var before = EntrySuggestion.From(stored);
        var proposed = await DescribeEntryAsync(db, universeId, request, definitions, rows, cancellationToken);

        return await StoreAsync(
            db,
            transaction,
            principal.RequireUserId(),
            stored.Version,
            before,
            proposed,
            proposed.SameFormAs(before),
            suggestion => suggestion.EntityId = entityId,
            cancellationToken);
    }

    /// <summary>
    /// The entry as the proposal would leave it, in the suggestion's own words: names and summary normalised as the save
    /// does, aliases and tags as it would keep them (an existing tag by its stored name), field values from the prepared
    /// rows with the names they show. Reads only.
    /// </summary>
    private static async Task<EntrySuggestion> DescribeEntryAsync(
        LorexDbContext db,
        Guid universeId,
        EntityRequest request,
        List<EntityFieldDefinition> definitions,
        List<EntityFieldValue> rows,
        CancellationToken cancellationToken)
    {
        var typeName = await db.EntityTypes.AsNoTracking()
            .Where(type => type.Id == request.EntityTypeId && type.UniverseId == universeId)
            .Select(type => type.Name)
            .SingleAsync(cancellationToken);

        var wanted = EntityEndpoints.NormalizedTags(request.Tags);
        var slugs = wanted.Keys.ToList();
        var existing = slugs.Count == 0
            ? []
            : await db.Tags.AsNoTracking()
                .Where(tag => tag.UniverseId == universeId && slugs.Contains(tag.Slug))
                .ToDictionaryAsync(tag => tag.Slug, tag => tag.Name, StringComparer.Ordinal, cancellationToken);

        var referencedIds = rows.Select(row => row.ReferencedEntityId).OfType<Guid>().Distinct().ToList();
        var referenced = referencedIds.Count == 0
            ? []
            : await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && referencedIds.Contains(entity.Id))
                .ToDictionaryAsync(entity => entity.Id, entity => (entity.Name, Trashed: entity.DeletedAt != null), cancellationToken);

        var byField = rows.ToLookup(row => row.FieldDefinitionId);
        var fields = definitions
            .Where(definition => byField.Contains(definition.Id))
            .OrderBy(definition => definition.DisplayOrder)
            .ThenBy(definition => definition.Name, StringComparer.Ordinal)
            .Select(definition =>
            {
                var values = byField[definition.Id].ToList();
                var optionIds = values.Select(row => row.OptionId).OfType<Guid>().ToList();
                var referenceId = values.Select(row => row.ReferencedEntityId).FirstOrDefault(id => id != null);
                var reference = referenceId is { } id ? referenced.GetValueOrDefault(id) : default;

                return new SuggestedFieldValue(
                    definition.Id,
                    definition.Name,
                    definition.Kind,
                    values.Select(row => row.TextValue).FirstOrDefault(text => text != null),
                    values.Select(row => row.NumberValue).FirstOrDefault(number => number != null),
                    values.Select(row => row.BooleanValue).FirstOrDefault(flag => flag != null),
                    values.Select(row => row.DateValue).FirstOrDefault(date => date != null),
                    optionIds,
                    [.. optionIds.Select(option => definition.Options.Single(candidate => candidate.Id == option).Value)],
                    referenceId,
                    reference.Name,
                    reference.Trashed,
                    values.Select(row => row.EraId).FirstOrDefault(era => era != null));
            })
            .ToList();

        return new EntrySuggestion(
            request.EntityTypeId,
            typeName,
            request.Name!.Trim(),
            LoreValidation.Normalize(request.Summary),
            request.CanonStatus,
            EntityEndpoints.NormalizedAliases(request.Aliases),
            [.. wanted.Select(tag => existing.GetValueOrDefault(tag.Key) ?? tag.Value).Order(StringComparer.Ordinal)],
            fields);
    }

    /// <summary>The story form's own save request, here a proposal: its version and its checks, and nothing written but the suggestion.</summary>
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

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var stored = await db.Stories.AsNoTracking()
            .Where(story => story.Id == storyId && story.UniverseId == universeId && story.DeletedAt == null)
            .Select(story => new { Form = new StorySuggestion(story.Title, story.Premise, story.Status), story.Version })
            .FirstOrDefaultAsync(cancellationToken);

        if (stored is null)
        {
            return Results.NotFound();
        }

        if (!EditVersion.Matches(stored.Version, request.ExpectedVersion))
        {
            return StoryEndpoints.Changed(stored.Version);
        }

        if (StoryValidation.ValidateStory(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var proposed = new StorySuggestion(
            StoryValidation.Normalize(request.Title)!,
            StoryValidation.Normalize(request.Premise),
            request.Status);

        return await StoreAsync(
            db,
            transaction,
            principal.RequireUserId(),
            stored.Version,
            stored.Form,
            proposed,
            proposed == stored.Form,
            suggestion => suggestion.StoryId = storyId,
            cancellationToken);
    }

    /// <summary>
    /// The scene form's own save request, here a proposal: its version, the scene's checks against the scene as stored, the
    /// lore it names read by name - and nothing written but the suggestion.
    /// </summary>
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

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var stored = await CommentEndpoints.SceneIsLiveAsync(db, universeId, storyId, sceneId, cancellationToken)
            ? await SceneEndpoints.LoadSceneAsync(db, universeId, storyId, sceneId, cancellationToken)
            : null;

        if (stored is null)
        {
            return Results.NotFound();
        }

        if (!EditVersion.Matches(stored.Version, request.ExpectedVersion))
        {
            return SceneEndpoints.Changed(stored.Version);
        }

        var storedLinks = stored.Entities.Select(link => link.EntityId).ToHashSet();
        if (await SceneEndpoints.CheckAsync(
                db, universeId, storyId, stored.ChapterId, stored.Pov?.EntityId, storedLinks, request, cancellationToken)
            is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var entityIds = SceneEndpoints.Requested(request);
        var references = await StoryLoreReferences.LoadAsync(
            db,
            universeId,
            request.PovEntityId is { } povId ? [.. entityIds, povId] : entityIds,
            cancellationToken);

        // As the save stores the point and the scene then reads it: no year, no date.
        var point = request.Chronology;
        var before = SceneSuggestion.From(stored);
        var proposed = new SceneSuggestion(
            StoryValidation.Normalize(request.Title)!,
            request.ChapterId,
            StoryValidation.Normalize(request.Summary),
            StoryValidation.Normalize(request.Notes),
            request.PovEntityId is { } pov ? SuggestedLore.From(references[pov]) : null,
            point?.Year is null ? null : SuggestedDate.From(point),
            [.. StoryLoreReferences.Listed(entityIds, references).Select(SuggestedLore.From)]);

        return await StoreAsync(
            db,
            transaction,
            principal.RequireUserId(),
            stored.Version,
            before,
            proposed,
            proposed.SameFormAs(before),
            suggestion => suggestion.SceneId = sceneId,
            cancellationToken);
    }

    /// <summary>
    /// Stores the suggestion - the only write a proposal makes - inside the transaction its checks ran in, or refuses one
    /// that would change nothing the form stores.
    /// </summary>
    private static async Task<IResult> StoreAsync<TSnapshot>(
        LorexDbContext db,
        IDbContextTransaction transaction,
        string userId,
        int baseVersion,
        TSnapshot before,
        TSnapshot proposed,
        bool unchanged,
        Action<SuggestedChange> attach,
        CancellationToken cancellationToken)
    {
        if (unchanged)
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
    /// The suggestions <paramref name="query"/> selects, in its order, in one query: the proposer's and resolver's usernames
    /// and the target's version read beside each row.
    /// </summary>
    private static async Task<List<SuggestionResponse<TSnapshot>>> ReadAsync<TSnapshot>(
        LorexDbContext db,
        IQueryable<SuggestedChange> query,
        CancellationToken cancellationToken)
    {
        var rows = await query.AsNoTracking()
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
