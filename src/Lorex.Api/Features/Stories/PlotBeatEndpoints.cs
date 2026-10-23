using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// The beats of a story's plot arcs. A beat is created inside the arc its route names and is otherwise
/// addressed through its story, so moving it to another arc does not change where it lives. Every route proves
/// universe ownership, then the story inside it, then the arc or beat inside that story; an id reached through
/// another story answers as missing. A scene, arc or entry id a request names is resolved again inside the same
/// story or universe, never trusted.
///
/// <b>A beat's order is its place in its arc.</b> Appended on create, closed on delete, rewritten for one arc by
/// <c>PUT .../plot-arcs/{arcId}/beats/order</c>; an edit naming another arc moves the beat there, last. The
/// order, chapter and chronology of its scenes play no part.
///
/// <b>Links are references.</b> A beat's scenes and lore arrive whole on every save and replace what is stored.
/// No link deletes, moves or changes a scene or an entry, and no write here passes the Canon gate (ADR 0026).
///
/// <b>The Trash.</b> A beat in the Trash, or in an arc there, answers every route here as a missing one does. A
/// link to a scene in the Trash is hidden from every read, so no client can send it back - and so a save keeps it
/// whatever it sends, and it returns with its scene. A scene in the Trash cannot be newly linked (ADR 0029).
/// </summary>
public static class PlotBeatEndpoints
{
    public static IEndpointRouteBuilder MapPlotBeatEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var inArc = endpoints
            .MapGroup("/api/universes/{universeId:guid}/stories/{storyId:guid}/plot-arcs/{plotArcId:guid}/beats")
            .WithTags("Plot")
            .RequireAuthorization();

        inArc.MapPost("/", CreateAsync).WithName("CreatePlotBeat");
        inArc.MapPut("/order", ReorderAsync).WithName("ReorderPlotBeats");

        var beats = endpoints
            .MapGroup("/api/universes/{universeId:guid}/stories/{storyId:guid}/plot-beats")
            .WithTags("Plot")
            .RequireAuthorization();

        beats.MapGet("/{plotBeatId:guid}", GetAsync).WithName("GetPlotBeat");
        beats.MapPut("/{plotBeatId:guid}", UpdateAsync).WithName("UpdatePlotBeat");
        beats.MapDelete("/{plotBeatId:guid}", DeleteAsync).WithName("DeletePlotBeat");

        return endpoints;
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid storyId,
        Guid plotBeatId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await StoryEndpoints.DenyStoryAsync(db, universeId, storyId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var beat = await LoadBeatAsync(db, universeId, storyId, plotBeatId, cancellationToken);
        return beat is null ? Results.NotFound() : Results.Ok(beat);
    }

    /// <summary>Appended: a new beat comes after every beat already in its arc. It needs no scene and no lore.</summary>
    private static async Task<IResult> CreateAsync(
        Guid universeId,
        Guid storyId,
        Guid plotArcId,
        [FromBody] PlotBeatRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CreateCoreAsync(db, universeId, storyId, plotArcId, request, cancellationToken);
    }

    /// <summary>The create itself, shared with an approved AI change (ADR 0048). Access is the caller's.</summary>
    internal static async Task<IResult> CreateCoreAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        Guid plotArcId,
        PlotBeatRequest request,
        CancellationToken cancellationToken)
    {
        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null || !await PlotArcEndpoints.BelongsToStoryAsync(db, storyId, plotArcId, cancellationToken))
        {
            return Results.NotFound();
        }

        if (StoryValidation.ValidatePlotBeat(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var sceneIds = Requested(request.SceneIds);
        var entityIds = Requested(request.EntityIds);

        if (await CheckReferencesAsync(db, universeId, storyId, sceneIds, entityIds, [], cancellationToken)
            is { } refused)
        {
            return Results.ValidationProblem(refused);
        }

        var last = await db.PlotBeats
            .Where(beat => beat.PlotArcId == plotArcId && beat.DeletedAt == null)
            .MaxAsync(beat => (int?)beat.SortOrder, cancellationToken);

        var now = DateTime.UtcNow;
        var beat = new PlotBeat
        {
            Id = Guid.NewGuid(),
            PlotArcId = plotArcId,
            Title = StoryValidation.Normalize(request.Title)!,
            Description = StoryValidation.Normalize(request.Description),
            Notes = StoryValidation.Normalize(request.Notes),
            SortOrder = (last ?? -1) + 1,
            CreatedAt = now,
            UpdatedAt = now,
        };

        foreach (var id in sceneIds)
        {
            beat.SceneLinks.Add(new PlotBeatScene { SceneId = id });
        }

        foreach (var id in entityIds)
        {
            beat.EntityLinks.Add(new PlotBeatEntity { EntityId = id });
        }

        db.PlotBeats.Add(beat);
        story.UpdatedAt = now;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            // Two beats appended to one arc at once both reached for the same place - or the arc, or a scene the
            // beat links, was deleted in between. Nothing was written.
            return PlotArcEndpoints.OrderChanged();
        }

        var created = await LoadBeatAsync(db, universeId, storyId, beat.Id, cancellationToken);
        return Results.Created($"/api/universes/{universeId}/stories/{storyId}/plot-beats/{beat.Id}", created);
    }

    /// <summary>
    /// The whole beat. Its scenes and lore arrive whole and replace what is stored - apart from its links to scenes in
    /// the Trash, which no read shows and so no request can carry, and which are kept. Naming another arc of the same
    /// story moves the beat there, last, and closes the gap it leaves - the same beat, with its id and every link, in
    /// one transaction. Leaving the arc out, or naming the one it is in, leaves its place alone.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid storyId,
        Guid plotBeatId,
        [FromBody] PlotBeatRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await UpdateCoreAsync(db, universeId, storyId, plotBeatId, request, cancellationToken);
    }

    /// <summary>
    /// The update itself, shared with an approved AI change (ADR 0048). In the caller's transaction when it has one, else its
    /// own. Access is the caller's.
    /// </summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        Guid plotBeatId,
        PlotBeatRequest request,
        CancellationToken cancellationToken)
    {
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        var beat = await db.PlotBeats
            .Include(candidate => candidate.SceneLinks)
            .Include(candidate => candidate.EntityLinks)
            .AsSplitQuery()
            .FirstOrDefaultAsync(
                candidate => candidate.Id == plotBeatId
                    && candidate.PlotArc!.StoryId == storyId
                    && candidate.PlotArc.DeletedAt == null
                    && candidate.DeletedAt == null,
                cancellationToken);

        if (beat is null)
        {
            return Results.NotFound();
        }

        if (StoryValidation.ValidatePlotBeat(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var sourceArcId = beat.PlotArcId;
        var targetArcId = request.PlotArcId ?? sourceArcId;

        if (targetArcId != sourceArcId
            && !await PlotArcEndpoints.BelongsToStoryAsync(db, storyId, targetArcId, cancellationToken))
        {
            return Results.ValidationProblem(PlotArcEndpoints.ForeignArc());
        }

        // The scenes this beat points at that are in the Trash. Every read hides them, so no request can name them: they
        // stay linked whatever it sends, and come back with their scene.
        var storedScenes = beat.SceneLinks.Select(link => link.SceneId).ToList();
        var trashedScenes = storedScenes.Count == 0
            ? []
            : (await db.Scenes.AsNoTracking()
                .Where(scene => storedScenes.Contains(scene.Id) && scene.DeletedAt != null)
                .Select(scene => scene.Id)
                .ToListAsync(cancellationToken))
            .ToHashSet();

        var sceneIds = Requested(request.SceneIds).Where(id => !trashedScenes.Contains(id)).ToList();
        var entityIds = Requested(request.EntityIds);
        var storedEntities = beat.EntityLinks.Select(link => link.EntityId).ToHashSet();

        if (await CheckReferencesAsync(db, universeId, storyId, sceneIds, entityIds, storedEntities, cancellationToken)
            is { } refused)
        {
            return Results.ValidationProblem(refused);
        }

        sceneIds.AddRange(trashedScenes);

        var now = DateTime.UtcNow;
        beat.Title = StoryValidation.Normalize(request.Title)!;
        beat.Description = StoryValidation.Normalize(request.Description);
        beat.Notes = StoryValidation.Normalize(request.Notes);
        beat.UpdatedAt = now;
        story.UpdatedAt = now;

        Replace(
            beat.SceneLinks,
            link => link.SceneId,
            sceneIds,
            id => new PlotBeatScene { PlotBeatId = beat.Id, SceneId = id });
        Replace(
            beat.EntityLinks,
            link => link.EntityId,
            entityIds,
            id => new PlotBeatEntity { PlotBeatId = beat.Id, EntityId = id });

        try
        {
            if (targetArcId != sourceArcId)
            {
                var source = await PlotOrder.LoadBeatsAsync(db, sourceArcId, cancellationToken);
                var target = await PlotOrder.LoadBeatsAsync(db, targetArcId, cancellationToken);

                source.Remove(beat);
                target.Add(beat);

                await PlotOrder.PlaceBeatsAsync(
                    db,
                    [new BeatContainer(sourceArcId, source), new BeatContainer(targetArcId, target)],
                    cancellationToken);
            }

            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            return PlotArcEndpoints.OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadBeatAsync(db, universeId, storyId, plotBeatId, cancellationToken));
    }

    /// <summary>
    /// Moves the beat to the Trash, and the beats after it in its arc each move up one place. Its links are kept, out of
    /// reach, and come back with it; the scenes and entries they point at are untouched.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid storyId,
        Guid plotBeatId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await TrashCoreAsync(db, universeId, storyId, plotBeatId, cancellationToken);
    }

    /// <summary>
    /// The beat to the Trash and its arc closed up, shared with an approved AI change (ADR 0048). In the caller's transaction
    /// when it has one, else its own. Access is the caller's.
    /// </summary>
    internal static async Task<IResult> TrashCoreAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        Guid plotBeatId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        var beat = await db.PlotBeats.FirstOrDefaultAsync(
            candidate => candidate.Id == plotBeatId
                && candidate.PlotArc!.StoryId == storyId
                && candidate.PlotArc.DeletedAt == null
                && candidate.DeletedAt == null,
            cancellationToken);

        if (beat is null)
        {
            return Results.NotFound();
        }

        try
        {
            var plotArcId = beat.PlotArcId;

            beat.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);

            var remaining = await PlotOrder.LoadBeatsAsync(db, plotArcId, cancellationToken);
            await PlotOrder.PlaceBeatsAsync(db, [new BeatContainer(plotArcId, remaining)], cancellationToken);

            story.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            return PlotArcEndpoints.OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.NoContent();
    }

    /// <summary>
    /// Replaces one arc's whole beat order in one transaction. The request must name every beat in that arc exactly
    /// once; a partial list, a repeated id, a beat of another arc or an id from anywhere else is refused, in the same
    /// words for a foreign id as for a missing one. No other arc is touched.
    /// </summary>
    private static async Task<IResult> ReorderAsync(
        Guid universeId,
        Guid storyId,
        Guid plotArcId,
        [FromBody] PlotBeatOrderRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await ReorderCoreAsync(db, universeId, storyId, plotArcId, request, cancellationToken);
    }

    /// <summary>
    /// The reorder itself, shared with an approved AI change (ADR 0048). In the caller's transaction when it has one, else
    /// its own. Access is the caller's.
    /// </summary>
    internal static async Task<IResult> ReorderCoreAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        Guid plotArcId,
        PlotBeatOrderRequest request,
        CancellationToken cancellationToken)
    {
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null || !await PlotArcEndpoints.BelongsToStoryAsync(db, storyId, plotArcId, cancellationToken))
        {
            return Results.NotFound();
        }

        if (request.PlotBeatIds is not { } ids)
        {
            return Refused("List the arc's beats in order.");
        }

        if (ids.Distinct().Count() != ids.Count)
        {
            return Refused("List each beat once.");
        }

        var beats = await PlotOrder.LoadBeatsAsync(db, plotArcId, cancellationToken);
        var byId = beats.ToDictionary(beat => beat.Id);

        if (ids.Count != beats.Count || ids.Any(id => !byId.ContainsKey(id)))
        {
            return Refused("List every beat in this arc exactly once.");
        }

        try
        {
            await PlotOrder.PlaceBeatsAsync(
                db, [new BeatContainer(plotArcId, [.. ids.Select(id => byId[id])])], cancellationToken);

            story.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            return PlotArcEndpoints.OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadBeatsAsync(
            db,
            universeId,
            db.PlotBeats.Where(beat => beat.PlotArcId == plotArcId && beat.DeletedAt == null),
            cancellationToken));

        static IResult Refused(string message) =>
            Results.ValidationProblem(new Dictionary<string, string[]> { ["plotBeatIds"] = [message] });
    }

    // ---------- Writing ----------

    /// <summary>The links asked for, each once. Repeating an id links it once, as it does on a scene.</summary>
    private static List<Guid> Requested(IReadOnlyList<Guid>? ids) => ids?.Distinct().ToList() ?? [];

    /// <summary>
    /// Makes a beat's stored links exactly <paramref name="wanted"/>: an absent one is dropped, a new one is added,
    /// and one already there keeps its row.
    /// </summary>
    private static void Replace<TLink>(
        ICollection<TLink> links,
        Func<TLink, Guid> idOf,
        List<Guid> wanted,
        Func<Guid, TLink> create)
    {
        var keep = wanted.ToHashSet();
        var stored = links.Select(idOf).ToHashSet();

        foreach (var link in links.Where(link => !keep.Contains(idOf(link))).ToList())
        {
            links.Remove(link);
        }

        foreach (var id in wanted.Where(id => !stored.Contains(id)))
        {
            links.Add(create(id));
        }
    }

    /// <summary>
    /// Re-resolves every linked scene inside this story and every linked entry inside this universe. Returns the
    /// refusal, or null when every link is usable.
    ///
    /// A scene of another story - in this universe or any other - is refused in the same words as an id that is
    /// nothing at all, and so is an entry from another universe, so a refusal says nothing about where a foreign
    /// id lives. An entry in the Trash already linked stays, because the form sends the whole beat back on every
    /// save; one newly chosen is refused (ADR 0015). A scene in the Trash is refused like one that is not there;
    /// the caller has already set aside the ones this beat already links, which are kept (ADR 0029).
    /// </summary>
    private static async Task<Dictionary<string, string[]>?> CheckReferencesAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        List<Guid> sceneIds,
        List<Guid> entityIds,
        HashSet<Guid> storedEntities,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        if (sceneIds.Count > 0)
        {
            var found = await db.Scenes.AsNoTracking()
                .CountAsync(
                    scene => scene.StoryId == storyId && scene.DeletedAt == null && sceneIds.Contains(scene.Id),
                    cancellationToken);

            if (found != sceneIds.Count)
            {
                errors["sceneIds"] = ["Link scenes from this story."];
            }
        }

        if (entityIds.Count > 0)
        {
            var found = await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && entityIds.Contains(entity.Id))
                .Select(entity => new { entity.Id, IsTrashed = entity.DeletedAt != null })
                .ToDictionaryAsync(entity => entity.Id, entity => entity.IsTrashed, cancellationToken);

            if (entityIds.Any(id => !found.ContainsKey(id)))
            {
                errors["entityIds"] = ["Link entries from this universe."];
            }
            else if (entityIds.Any(id => found[id] && !storedEntities.Contains(id)))
            {
                errors["entityIds"] = ["An entry in the Trash cannot be newly linked. Restore it first."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    // ---------- Reading ----------

    /// <summary>A beat as it is stored, flat, without its links.</summary>
    private sealed record BeatRow(
        Guid Id,
        Guid PlotArcId,
        int SortOrder,
        string Title,
        string? Description,
        string? Notes,
        DateTime CreatedAt,
        DateTime UpdatedAt);

    private static async Task<PlotBeatResponse?> LoadBeatAsync(
        LorexDbContext db,
        Guid universeId,
        Guid storyId,
        Guid plotBeatId,
        CancellationToken cancellationToken) =>
        (await LoadBeatsAsync(
            db,
            universeId,
            db.PlotBeats.Where(beat => beat.Id == plotBeatId
                && beat.PlotArc!.StoryId == storyId
                && beat.PlotArc.DeletedAt == null
                && beat.DeletedAt == null),
            cancellationToken))
        .FirstOrDefault();

    /// <summary>
    /// The beats <paramref name="query"/> selects - arc by arc, each in its own order - with every link resolved.
    ///
    /// Four queries however many beats and links there are, and none when there is no beat: the beats, their scene
    /// links, their lore links, and one read of every entry any of them names. The links are read through the same
    /// query, so they carry the same story or beat filter and nothing is fetched per beat.
    ///
    /// A beat's scenes are listed in the story's reading order - Unchaptered first, then chapter by chapter - which is
    /// a presentation of where they are now, never a stored order: moving a scene changes how a beat lists it and
    /// nothing else. Its lore is listed by name, then id, as a scene's is.
    /// </summary>
    internal static async Task<List<PlotBeatResponse>> LoadBeatsAsync(
        LorexDbContext db,
        Guid universeId,
        IQueryable<PlotBeat> query,
        CancellationToken cancellationToken)
    {
        var rows = await query.AsNoTracking()
            .OrderBy(beat => beat.PlotArc!.SortOrder)
            .ThenBy(beat => beat.SortOrder)
            .ThenBy(beat => beat.Id)
            .Select(beat => new BeatRow(
                beat.Id,
                beat.PlotArcId,
                beat.SortOrder,
                beat.Title,
                beat.Description,
                beat.Notes,
                beat.CreatedAt,
                beat.UpdatedAt))
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
        {
            return [];
        }

        // A link to a scene in the Trash is kept and not shown: the scene is nowhere a client could open it.
        var scenes = (await query
                .SelectMany(beat => beat.SceneLinks)
                .Where(link => link.Scene!.DeletedAt == null)
                .OrderBy(link => link.Scene!.ChapterId == null ? -1 : link.Scene.Chapter!.SortOrder)
                .ThenBy(link => link.Scene!.SortOrder)
                .ThenBy(link => link.SceneId)
                .Select(link => new { link.PlotBeatId, link.SceneId })
                .ToListAsync(cancellationToken))
            .ToLookup(link => link.PlotBeatId, link => link.SceneId);

        var entityLinks = await query
            .SelectMany(beat => beat.EntityLinks)
            .Select(link => new { link.PlotBeatId, link.EntityId })
            .ToListAsync(cancellationToken);

        var references = await StoryLoreReferences.LoadAsync(
            db, universeId, [.. entityLinks.Select(link => link.EntityId).Distinct()], cancellationToken);

        var entities = entityLinks.ToLookup(link => link.PlotBeatId, link => link.EntityId);

        return
        [
            .. rows.Select(row => new PlotBeatResponse(
                row.Id,
                row.PlotArcId,
                row.SortOrder,
                row.Title,
                row.Description,
                row.Notes,
                [.. scenes[row.Id]],
                StoryLoreReferences.Listed(entities[row.Id], references),
                row.CreatedAt,
                row.UpdatedAt)),
        ];
    }
}
