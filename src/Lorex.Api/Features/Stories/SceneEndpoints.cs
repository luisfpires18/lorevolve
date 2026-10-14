using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// The scenes of one story. Every route proves universe ownership, then finds the story inside that
/// universe, then the scene inside that story - so a scene id from another story, or a story id from
/// another universe, answers exactly as a missing one does. A chapter id a request names is resolved
/// inside the same story, never trusted.
///
/// <b>Narrative order is the author's, per container.</b> A scene is told in a chapter or in
/// Unchaptered, and its order is its place there. It is appended to its container when created, the gap
/// closes when it is deleted or moved out, <c>PUT .../scenes/order</c> reorders one container, and
/// <c>PUT .../scenes/{id}/position</c> moves one scene - within its container or into another. Nothing
/// reads a scene's chronology to decide where it sits, and nothing refuses a scene because it happens in
/// the world before the scene told ahead of it: nonlinear stories are valid.
///
/// <b>No Canon.</b> Like the stories around them, scene writes never pass the promotion gate and
/// never reconcile findings. A scene references lore; it asserts nothing about it (ADR 0024).
///
/// <b>The Trash.</b> Deleting a scene moves it there with its prose, saved versions and links, and
/// closes the gap it leaves. A scene in the Trash answers every route here as a missing one does;
/// restoring it is the Trash's work (ADR 0029).
/// </summary>
public static class SceneEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a narrative order that moved underneath a write.</summary>
    public const string OrderChangedCode = "story_scene_order_changed";

    /// <summary>The machine-readable marker on the 409 for a scene save written over a version that is no longer current.</summary>
    public const string ChangedCode = "scene_changed";

    public static IEndpointRouteBuilder MapSceneEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/stories/{storyId:guid}/scenes")
            .WithTags("Scenes")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListScenes");
        group.MapPost("/", CreateAsync).WithName("CreateScene");
        group.MapPut("/order", ReorderAsync).WithName("ReorderScenes");
        group.MapGet("/{sceneId:guid}", GetAsync).WithName("GetScene");
        group.MapPut("/{sceneId:guid}", UpdateAsync).WithName("UpdateScene");
        group.MapPut("/{sceneId:guid}/position", MoveAsync).WithName("MoveScene");
        group.MapDelete("/{sceneId:guid}", DeleteAsync).WithName("DeleteScene");

        return endpoints;
    }

    /// <summary>Every scene in the story: Unchaptered first, then chapter by chapter, each in the order it is told.</summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await StoryEndpoints.DenyStoryAsync(db, universeId, storyId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return Results.Ok(await LoadScenesAsync(
            db,
            universeId,
            db.Scenes.Where(scene => scene.StoryId == storyId && scene.DeletedAt == null),
            cancellationToken));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await StoryEndpoints.DenyStoryAsync(db, universeId, storyId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var scene = await LoadSceneAsync(db, universeId, storyId, sceneId, cancellationToken);
        return scene is null ? Results.NotFound() : Results.Ok(scene);
    }

    /// <summary>Appended: a new scene is told after every scene already in its chapter, or in Unchaptered.</summary>
    private static async Task<IResult> CreateAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] SceneRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        if (StoryValidation.ValidateScene(request, chronology) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (request.ChapterId is { } chapterId
            && !await ChapterEndpoints.BelongsToStoryAsync(db, storyId, chapterId, cancellationToken))
        {
            return Results.ValidationProblem(ChapterEndpoints.ForeignChapter());
        }

        var entityIds = Requested(request);

        if (await CheckReferencesAsync(db, universeId, request.PovEntityId, entityIds, null, [], cancellationToken)
            is { } refused)
        {
            return Results.ValidationProblem(refused);
        }

        var last = await db.Scenes
            .InContainer(storyId, request.ChapterId)
            .MaxAsync(scene => (int?)scene.SortOrder, cancellationToken);

        var now = DateTime.UtcNow;
        var scene = new Scene
        {
            Id = Guid.NewGuid(),
            StoryId = storyId,
            ChapterId = request.ChapterId,
            Title = StoryValidation.Normalize(request.Title)!,
            SortOrder = (last ?? -1) + 1,
            CreatedAt = now,
            UpdatedAt = now,
        };

        Apply(scene, request);

        foreach (var id in entityIds)
        {
            scene.EntityLinks.Add(new SceneEntityLink { EntityId = id });
        }

        db.Scenes.Add(scene);
        story.UpdatedAt = now;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            // Two scenes appended to one container at once both reached for the same place, and the
            // unique order index held - or the chapter was deleted in between. Nothing was written.
            return OrderChanged();
        }

        var created = await LoadSceneAsync(db, universeId, storyId, scene.Id, cancellationToken);
        return Results.Created($"/api/universes/{universeId}/stories/{storyId}/scenes/{scene.Id}", created);
    }

    /// <summary>
    /// The whole scene. The point of view and the linked lore arrive whole and replace what is stored, and
    /// so does the chapter: naming a different one is a move, not a new value in a column - the scene
    /// leaves its old container, which closes up behind it, and is told last in the new one, in the same
    /// transaction. Naming the chapter it is already in leaves its place alone.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        [FromBody] SceneRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await UpdateCoreAsync(db, universeId, storyId, sceneId, request, cancellationToken);
    }

    /// <summary>
    /// The one write path for an existing scene's form, shared with an accepted suggestion (ADR 0044) so it is validated,
    /// versioned, moved and saved exactly like an ordinary edit. Access is the caller's to prove first. Runs in the
    /// caller's transaction when it has one.
    /// </summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        SceneRequest request,
        CancellationToken cancellationToken)
    {
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        var scene = await db.Scenes
            .Include(candidate => candidate.EntityLinks)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == sceneId && candidate.StoryId == storyId && candidate.DeletedAt == null,
                cancellationToken);

        if (scene is null)
        {
            return Results.NotFound();
        }

        // Inside the transaction the write commits in, so nothing can land between this comparison and the write (ADR 0043).
        if (!EditVersion.Matches(scene.Version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                ChangedCode,
                "Scene changed",
                "This scene was changed after it was opened here. Nothing was overwritten.",
                scene.Version);
        }

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        if (StoryValidation.ValidateScene(request, chronology) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (request.ChapterId is { } chapterId
            && chapterId != scene.ChapterId
            && !await ChapterEndpoints.BelongsToStoryAsync(db, storyId, chapterId, cancellationToken))
        {
            return Results.ValidationProblem(ChapterEndpoints.ForeignChapter());
        }

        var entityIds = Requested(request);
        var stored = scene.EntityLinks.Select(link => link.EntityId).ToHashSet();

        if (await CheckReferencesAsync(
                db, universeId, request.PovEntityId, entityIds, scene.PovEntityId, stored, cancellationToken)
            is { } refused)
        {
            return Results.ValidationProblem(refused);
        }

        var now = DateTime.UtcNow;
        var version = scene.Version;
        var before = Edited(scene);
        scene.Title = StoryValidation.Normalize(request.Title)!;
        Apply(scene, request);
        scene.UpdatedAt = now;
        story.UpdatedAt = now;

        // The request carries the whole set, so the stored links are made to match it: anything
        // absent is dropped, anything new is added, and a link already there keeps its row.
        var wanted = entityIds.ToHashSet();

        // Only a save that changes what the form edits moves the version on, and only once - a move between chapters
        // included, which the placement below would otherwise count again.
        var changed = before != Edited(scene) || !wanted.SetEquals(stored) || request.ChapterId != scene.ChapterId;

        foreach (var link in scene.EntityLinks.Where(link => !wanted.Contains(link.EntityId)).ToList())
        {
            scene.EntityLinks.Remove(link);
        }

        foreach (var id in entityIds.Where(id => !stored.Contains(id)))
        {
            scene.EntityLinks.Add(new SceneEntityLink { SceneId = scene.Id, EntityId = id });
        }

        try
        {
            if (request.ChapterId != scene.ChapterId)
            {
                var source = await StoryOrder.LoadContainerAsync(db, storyId, scene.ChapterId, cancellationToken);
                var target = await StoryOrder.LoadContainerAsync(db, storyId, request.ChapterId, cancellationToken);

                source.Remove(scene);
                target.Add(scene);

                await StoryOrder.PlaceScenesAsync(
                    db,
                    [new SceneContainer(scene.ChapterId, source), new SceneContainer(request.ChapterId, target)],
                    cancellationToken);
            }

            scene.Version = changed ? version + 1 : version;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            return OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadSceneAsync(db, universeId, storyId, sceneId, cancellationToken));
    }

    /// <summary>
    /// Moves one scene to <see cref="ScenePositionRequest.Position"/> in the container
    /// <see cref="ScenePositionRequest.ChapterId"/> names - its own, another chapter, or Unchaptered - and
    /// renumbers both containers, in one transaction. The scene is not recreated: its id, text, point of
    /// view, chronology and links are exactly as they were. Answers with the story's whole structure,
    /// because two containers changed.
    /// </summary>
    private static async Task<IResult> MoveAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        [FromBody] ScenePositionRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        var scene = await db.Scenes.FirstOrDefaultAsync(
            candidate => candidate.Id == sceneId && candidate.StoryId == storyId && candidate.DeletedAt == null,
            cancellationToken);

        if (scene is null)
        {
            return Results.NotFound();
        }

        if (request.ChapterId is { } chapterId
            && !await ChapterEndpoints.BelongsToStoryAsync(db, storyId, chapterId, cancellationToken))
        {
            return Results.ValidationProblem(ChapterEndpoints.ForeignChapter());
        }

        var sameContainer = request.ChapterId == scene.ChapterId;

        var source = await StoryOrder.LoadContainerAsync(db, storyId, scene.ChapterId, cancellationToken);
        source.Remove(scene);

        var target = sameContainer
            ? source
            : await StoryOrder.LoadContainerAsync(db, storyId, request.ChapterId, cancellationToken);

        var position = request.Position ?? target.Count;

        if (position < 0 || position > target.Count)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["position"] = [$"Choose a position from 0 to {target.Count}."],
            });
        }

        target.Insert(position, scene);

        try
        {
            await StoryOrder.PlaceScenesAsync(
                db,
                sameContainer
                    ? [new SceneContainer(request.ChapterId, target)]
                    : [new SceneContainer(scene.ChapterId, source), new SceneContainer(request.ChapterId, target)],
                cancellationToken);

            story.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            return OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await StoryEndpoints.LoadDetailAsync(db, universeId, storyId, cancellationToken));
    }

    /// <summary>
    /// Moves the scene to the Trash, and the scenes told after it in its container each move up one place,
    /// so the order stays contiguous and the next scene appended there still lands last. Its prose, saved
    /// versions, lore links and the beats pointing at it are all kept, unreachable, and come back with it; the
    /// lore they point at is untouched.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        var scene = await db.Scenes.FirstOrDefaultAsync(
            candidate => candidate.Id == sceneId && candidate.StoryId == storyId && candidate.DeletedAt == null,
            cancellationToken);

        if (scene is null)
        {
            return Results.NotFound();
        }

        try
        {
            var chapterId = scene.ChapterId;

            scene.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);

            var remaining = await StoryOrder.LoadContainerAsync(db, storyId, chapterId, cancellationToken);
            await StoryOrder.PlaceScenesAsync(db, [new SceneContainer(chapterId, remaining)], cancellationToken);

            story.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            return OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.NoContent();
    }

    /// <summary>
    /// Replaces one container's whole narrative order in one transaction: the chapter the request names,
    /// or Unchaptered. The request must name every scene in that container exactly once - a partial list,
    /// a repeated id, a scene from another chapter of the same story or an id from anywhere else is
    /// refused rather than guessed at, and the refusal says the same thing for a foreign id as for a
    /// missing one. No other container is touched, and chronology plays no part.
    /// </summary>
    private static async Task<IResult> ReorderAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] SceneOrderRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        if (request.ChapterId is { } chapterId
            && !await ChapterEndpoints.BelongsToStoryAsync(db, storyId, chapterId, cancellationToken))
        {
            return Results.ValidationProblem(ChapterEndpoints.ForeignChapter());
        }

        if (request.SceneIds is not { } ids)
        {
            return Refused("List the scenes in the order they are told.");
        }

        if (ids.Distinct().Count() != ids.Count)
        {
            return Refused("List each scene once.");
        }

        var scenes = await StoryOrder.LoadContainerAsync(db, storyId, request.ChapterId, cancellationToken);
        var byId = scenes.ToDictionary(scene => scene.Id);

        if (ids.Count != scenes.Count || ids.Any(id => !byId.ContainsKey(id)))
        {
            return Refused(request.ChapterId is null
                ? "List every Unchaptered scene in this story exactly once."
                : "List every scene in this chapter exactly once.");
        }

        try
        {
            await StoryOrder.PlaceScenesAsync(
                db, [new SceneContainer(request.ChapterId, [.. ids.Select(id => byId[id])])], cancellationToken);

            story.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            return OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadScenesAsync(
            db,
            universeId,
            db.Scenes.InContainer(storyId, request.ChapterId),
            cancellationToken));

        static IResult Refused(string message) =>
            Results.ValidationProblem(new Dictionary<string, string[]> { ["sceneIds"] = [message] });
    }

    // ---------- Writing ----------

    /// <summary>Copies everything but the title, the chapter and the order across. The title is set by the caller.</summary>
    /// <summary>What the scene form edits on the scene's own row, compared before and after a save.</summary>
    private static (string, string?, string?, Guid?, Guid?, int?, int?, Guid?, int?) Edited(Scene scene) =>
        (scene.Title, scene.Summary, scene.Notes, scene.PovEntityId, scene.EraId, scene.Year, scene.Month, scene.MonthId, scene.Day);

    private static void Apply(Scene scene, SceneRequest request)
    {
        scene.Summary = StoryValidation.Normalize(request.Summary);
        scene.Notes = StoryValidation.Normalize(request.Notes);
        scene.PovEntityId = request.PovEntityId;

        var point = request.Chronology;
        scene.EraId = point?.EraId;
        scene.Year = point?.Year;
        scene.Month = point?.Month;
        scene.MonthId = point?.MonthId;
        scene.Day = point?.Day;
    }

    /// <summary>The linked lore asked for, each entry once. Repeating an id links it once, as it does on a moment.</summary>
    private static List<Guid> Requested(SceneRequest request) =>
        request.EntityIds?.Distinct().ToList() ?? [];

    /// <summary>
    /// Re-resolves the point of view and every linked entry inside this universe. Returns the
    /// refusal, or null when every reference is usable.
    ///
    /// An id that is not an entry of this universe is refused without saying whether it exists
    /// anywhere else. An entry in the Trash is kept when the scene already holds it - the form sends
    /// the whole scene back on every save, so refusing it would turn an unrelated edit into a failure
    /// - but it cannot be newly chosen, as the point of view or as a link. Trashing an entry never
    /// removes it from a scene (ADR 0015).
    /// </summary>
    private static async Task<Dictionary<string, string[]>?> CheckReferencesAsync(
        LorexDbContext db,
        Guid universeId,
        Guid? povEntityId,
        List<Guid> entityIds,
        Guid? storedPov,
        HashSet<Guid> storedLinks,
        CancellationToken cancellationToken)
    {
        var wanted = povEntityId is { } pov ? [.. entityIds, pov] : entityIds;

        if (wanted.Count == 0)
        {
            return null;
        }

        var found = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && wanted.Contains(entity.Id))
            .Select(entity => new { entity.Id, IsTrashed = entity.DeletedAt != null })
            .ToDictionaryAsync(entity => entity.Id, entity => entity.IsTrashed, cancellationToken);

        var errors = new Dictionary<string, string[]>();

        if (povEntityId is { } chosen)
        {
            if (!found.TryGetValue(chosen, out var trashed))
            {
                errors["povEntityId"] = ["Choose a point of view from this universe."];
            }
            else if (trashed && chosen != storedPov)
            {
                errors["povEntityId"] = ["That entry is in the Trash. Restore it before choosing it."];
            }
        }

        if (entityIds.Any(id => !found.ContainsKey(id)))
        {
            errors["entityIds"] = ["Link entries from this universe."];
        }
        else if (entityIds.Any(id => found[id] && !storedLinks.Contains(id)))
        {
            errors["entityIds"] = ["An entry in the Trash cannot be newly linked. Restore it first."];
        }

        return errors.Count == 0 ? null : errors;
    }

    private static IResult OrderChanged() =>
        Results.Problem(
            title: "Story changed",
            detail: "This story's scenes changed while this was being saved. Reload the story and try again.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = OrderChangedCode });

    // ---------- Reading ----------

    /// <summary>A scene as it is stored, flat, with its links as ids.</summary>
    private sealed record SceneRow(
        Guid Id,
        Guid StoryId,
        Guid? ChapterId,
        int SortOrder,
        string Title,
        string? Summary,
        string? Notes,
        Guid? PovEntityId,
        Guid? EraId,
        int? Year,
        int? Month,
        Guid? MonthId,
        int? Day,
        List<Guid> EntityIds,
        DateTime CreatedAt,
        DateTime UpdatedAt,
        Publishing.ContentVisibility Visibility,
        Publishing.ContentVisibility ManuscriptVisibility,
        int Version);

    internal static async Task<SceneResponse?> LoadSceneAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        CancellationToken cancellationToken) =>
        (await LoadScenesAsync(
            db,
            universeId,
            db.Scenes.Where(scene => scene.Id == sceneId && scene.StoryId == storyId && scene.DeletedAt == null),
            cancellationToken))
        .FirstOrDefault();

    /// <summary>
    /// The scenes <paramref name="query"/> selects, in reading order, with every reference resolved.
    ///
    /// Reading order is Unchaptered first, then each chapter in the story's chapter order, and inside
    /// each of those the scenes' own narrative order. The chapter's position comes from a join in the
    /// same query, so no chapter is read per scene.
    ///
    /// Two queries however many scenes there are: the scenes with their link ids, then every entry
    /// any of them names, read once. The entries are read from the lore each time - a scene holds
    /// only their ids - so a renamed character is renamed in every scene at once. Links are listed by
    /// name, then id, with an ordinal comparer, so the same scene always reads the same way.
    /// </summary>
    internal static async Task<List<SceneResponse>> LoadScenesAsync(
        LorexDbContext db,
        Guid universeId,
        IQueryable<Scene> query,
        CancellationToken cancellationToken)
    {
        var rows = await query.AsNoTracking()
            .OrderBy(scene => scene.ChapterId == null ? -1 : scene.Chapter!.SortOrder)
            .ThenBy(scene => scene.SortOrder)
            .ThenBy(scene => scene.Id)
            .Select(scene => new SceneRow(
                scene.Id,
                scene.StoryId,
                scene.ChapterId,
                scene.SortOrder,
                scene.Title,
                scene.Summary,
                scene.Notes,
                scene.PovEntityId,
                scene.EraId,
                scene.Year,
                scene.Month,
                scene.MonthId,
                scene.Day,
                scene.EntityLinks.Select(link => link.EntityId).ToList(),
                scene.CreatedAt,
                scene.UpdatedAt,
                scene.Visibility,
                scene.ManuscriptVisibility,
                scene.Version))
            .ToListAsync(cancellationToken);

        var referenced = rows
            .SelectMany(row => row.PovEntityId is { } pov ? row.EntityIds.Append(pov) : row.EntityIds)
            .Distinct()
            .ToList();

        var references = await StoryLoreReferences.LoadAsync(db, universeId, referenced, cancellationToken);

        return
        [
            .. rows.Select(row => new SceneResponse(
                row.Id,
                row.StoryId,
                row.ChapterId,
                row.SortOrder,
                row.Title,
                row.Summary,
                row.Notes,
                row.PovEntityId is { } pov ? references.GetValueOrDefault(pov) : null,
                row.Year is null ? null : new ChronologyValue(row.EraId, row.Year, row.Month, row.Day, row.MonthId),
                StoryLoreReferences.Listed(row.EntityIds, references),
                row.CreatedAt,
                row.UpdatedAt,
                row.Visibility,
                row.ManuscriptVisibility,
                row.Version)),
        ];
    }
}
