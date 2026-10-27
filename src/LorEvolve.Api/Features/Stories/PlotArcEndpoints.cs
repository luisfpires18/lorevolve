using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// The plot arcs of one story. Every route proves universe ownership, then finds the story inside that
/// universe, then the arc inside that story - so an arc id from another story, or a story id from another
/// universe, answers exactly as a missing one does. An arc id alone is never enough.
///
/// An arc's order is the author's and nothing else's: appended on create, closed on delete, moved only by
/// <c>PUT .../plot-arcs/order</c>. No arc number is stored, and nothing about a scene - its order, its
/// chapter or its chronology - decides where an arc sits.
///
/// Deleting an arc moves it to the Trash with its beats and their links, and never touches a scene, a chapter
/// or an entry. An arc in the Trash answers every route here, and its beats every beat route, as missing ones
/// do; restoring it is the Trash's work (ADR 0029).
///
/// <b>No Canon.</b> Plot is planning. Nothing here passes the promotion gate or reconciles findings, and a beat
/// called "The King dies" gives no entry a death year (ADR 0026).
/// </summary>
public static class PlotArcEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a plot order that moved underneath a write.</summary>
    public const string OrderChangedCode = "story_plot_order_changed";

    public static IEndpointRouteBuilder MapPlotArcEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/stories/{storyId:guid}/plot-arcs")
            .WithTags("Plot")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListPlotArcs");
        group.MapPost("/", CreateAsync).WithName("CreatePlotArc");
        group.MapPut("/order", ReorderAsync).WithName("ReorderPlotArcs");
        group.MapGet("/{plotArcId:guid}", GetAsync).WithName("GetPlotArc");
        group.MapPut("/{plotArcId:guid}", UpdateAsync).WithName("UpdatePlotArc");
        group.MapDelete("/{plotArcId:guid}", DeleteAsync).WithName("DeletePlotArc");

        return endpoints;
    }

    /// <summary>The story's whole plot: every arc, first first, each with its beats in order and every link resolved.</summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await StoryEndpoints.DenyStoryAsync(db, universeId, storyId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return Results.Ok(await LoadArcsAsync(db, universeId, storyId, null, cancellationToken));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid storyId,
        Guid plotArcId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await StoryEndpoints.DenyStoryAsync(db, universeId, storyId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var arc = (await LoadArcsAsync(db, universeId, storyId, plotArcId, cancellationToken)).FirstOrDefault();
        return arc is null ? Results.NotFound() : Results.Ok(arc);
    }

    /// <summary>Appended: a new arc comes after every arc already in the story, and holds no beat yet.</summary>
    private static async Task<IResult> CreateAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] PlotArcRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CreateCoreAsync(db, universeId, storyId, request, cancellationToken);
    }

    /// <summary>The create itself, shared with an approved AI change (ADR 0048). Access is the caller's.</summary>
    internal static async Task<IResult> CreateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        PlotArcRequest request,
        CancellationToken cancellationToken)
    {
        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        if (StoryValidation.ValidatePlotArc(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var last = await db.PlotArcs
            .Where(arc => arc.StoryId == storyId && arc.DeletedAt == null)
            .MaxAsync(arc => (int?)arc.SortOrder, cancellationToken);

        var now = DateTime.UtcNow;
        var arc = new PlotArc
        {
            Id = Guid.NewGuid(),
            StoryId = storyId,
            Title = StoryValidation.Normalize(request.Title)!,
            Description = StoryValidation.Normalize(request.Description),
            Notes = StoryValidation.Normalize(request.Notes),
            SortOrder = (last ?? -1) + 1,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.PlotArcs.Add(arc);
        story.UpdatedAt = now;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            // Two arcs appended to one story at once both reached for the same place, and the unique order
            // index held. Nothing was written.
            return OrderChanged();
        }

        return Results.Created(
            $"/api/universes/{universeId}/stories/{storyId}/plot-arcs/{arc.Id}",
            new PlotArcResponse(
                arc.Id, arc.StoryId, arc.SortOrder, arc.Title, arc.Description, arc.Notes, [], arc.CreatedAt, arc.UpdatedAt));
    }

    /// <summary>The title, description and notes. Never the order, and never the beats an arc holds.</summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid storyId,
        Guid plotArcId,
        [FromBody] PlotArcRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await UpdateCoreAsync(db, universeId, storyId, plotArcId, request, cancellationToken);
    }

    /// <summary>The update itself, shared with an approved AI change (ADR 0048). Access is the caller's.</summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        Guid plotArcId,
        PlotArcRequest request,
        CancellationToken cancellationToken)
    {
        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        var arc = await db.PlotArcs.FirstOrDefaultAsync(
            candidate => candidate.Id == plotArcId && candidate.StoryId == storyId && candidate.DeletedAt == null,
            cancellationToken);

        if (arc is null)
        {
            return Results.NotFound();
        }

        if (StoryValidation.ValidatePlotArc(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var now = DateTime.UtcNow;
        arc.Title = StoryValidation.Normalize(request.Title)!;
        arc.Description = StoryValidation.Normalize(request.Description);
        arc.Notes = StoryValidation.Normalize(request.Notes);
        arc.UpdatedAt = now;
        story.UpdatedAt = now;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok((await LoadArcsAsync(db, universeId, storyId, plotArcId, cancellationToken)).First());
    }

    /// <summary>
    /// Moves the arc to the Trash. Only the arc is marked: its beats keep their order and every link they hold, out of
    /// reach while it is there and back with it on restore; the scenes, chapters and entries those links point at are
    /// untouched. The arcs after it each move up one place. One transaction.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid storyId,
        Guid plotArcId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await TrashCoreAsync(db, universeId, storyId, plotArcId, cancellationToken);
    }

    /// <summary>
    /// The arc to the Trash and the story's arcs closed up, shared with an approved AI change (ADR 0048). In the caller's
    /// transaction when it has one, else its own. Access is the caller's.
    /// </summary>
    internal static async Task<IResult> TrashCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        Guid plotArcId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        var arc = await db.PlotArcs.FirstOrDefaultAsync(
            candidate => candidate.Id == plotArcId && candidate.StoryId == storyId && candidate.DeletedAt == null,
            cancellationToken);

        if (arc is null)
        {
            return Results.NotFound();
        }

        try
        {
            arc.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);

            var remaining = await db.PlotArcs
                .Where(candidate => candidate.StoryId == storyId && candidate.DeletedAt == null)
                .OrderBy(candidate => candidate.SortOrder)
                .ThenBy(candidate => candidate.Id)
                .ToListAsync(cancellationToken);

            await PlotOrder.PlaceArcsAsync(db, remaining, cancellationToken);

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
    /// Replaces the story's whole arc order in one transaction. The request must name every arc in this story
    /// exactly once; a partial list, a repeated id or an id from anywhere else is refused, and the refusal says the
    /// same thing for a foreign id as for a missing one. Beats stay in their arcs, in their order.
    /// </summary>
    private static async Task<IResult> ReorderAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] PlotArcOrderRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await ReorderCoreAsync(db, universeId, storyId, request, cancellationToken);
    }

    /// <summary>
    /// The reorder itself, shared with an approved AI change (ADR 0048). In the caller's transaction when it has one, else
    /// its own. Access is the caller's.
    /// </summary>
    internal static async Task<IResult> ReorderCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        PlotArcOrderRequest request,
        CancellationToken cancellationToken)
    {
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var story = await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        if (request.PlotArcIds is not { } ids)
        {
            return Refused("List the story's arcs in order.");
        }

        if (ids.Distinct().Count() != ids.Count)
        {
            return Refused("List each arc once.");
        }

        var arcs = await db.PlotArcs
            .Where(arc => arc.StoryId == storyId && arc.DeletedAt == null)
            .ToListAsync(cancellationToken);

        var byId = arcs.ToDictionary(arc => arc.Id);

        if (ids.Count != arcs.Count || ids.Any(id => !byId.ContainsKey(id)))
        {
            return Refused("List every arc in this story exactly once.");
        }

        try
        {
            await PlotOrder.PlaceArcsAsync(db, [.. ids.Select(id => byId[id])], cancellationToken);

            story.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            return OrderChanged();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadArcsAsync(db, universeId, storyId, null, cancellationToken));

        static IResult Refused(string message) =>
            Results.ValidationProblem(new Dictionary<string, string[]> { ["plotArcIds"] = [message] });
    }

    // ---------- Shared ----------

    /// <summary>
    /// Whether <paramref name="plotArcId"/> is a live arc of this story. The caller has already proved the story is the
    /// caller's; an arc id a client sends is never trusted on its own, and one in the Trash is refused like any other
    /// that is not there.
    /// </summary>
    internal static Task<bool> BelongsToStoryAsync(
        LorEvolveDbContext db,
        Guid storyId,
        Guid plotArcId,
        CancellationToken cancellationToken) =>
        db.PlotArcs.AnyAsync(
            arc => arc.Id == plotArcId && arc.StoryId == storyId && arc.DeletedAt == null,
            cancellationToken);

    /// <summary>The refusal for an arc id that is not one of this story's, worded the same whoever's it is.</summary>
    internal static Dictionary<string, string[]> ForeignArc() =>
        new() { ["plotArcId"] = ["Choose an arc from this story."] };

    internal static IResult OrderChanged() =>
        Results.Problem(
            title: "Story changed",
            detail: "This story's plot changed while this was being saved. Reload the story and try again.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = OrderChangedCode });

    /// <summary>
    /// One story's arcs - or the one <paramref name="plotArcId"/> names - first first, each with its beats. A fixed
    /// number of queries however many arcs, beats and links there are: the arcs, then the beats and their links
    /// and lore (<see cref="PlotBeatEndpoints.LoadBeatsAsync"/>). Nothing is read per arc or per beat.
    /// </summary>
    internal static async Task<List<PlotArcResponse>> LoadArcsAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        Guid? plotArcId,
        CancellationToken cancellationToken)
    {
        var arcs = db.PlotArcs.AsNoTracking().Where(arc => arc.StoryId == storyId && arc.DeletedAt == null);
        var beats = db.PlotBeats.Where(beat =>
            beat.PlotArc!.StoryId == storyId && beat.PlotArc.DeletedAt == null && beat.DeletedAt == null);

        if (plotArcId is { } id)
        {
            arcs = arcs.Where(arc => arc.Id == id);
            beats = beats.Where(beat => beat.PlotArcId == id);
        }

        var rows = await arcs
            .OrderBy(arc => arc.SortOrder)
            .ThenBy(arc => arc.Id)
            .Select(arc => new
            {
                arc.Id,
                arc.StoryId,
                arc.SortOrder,
                arc.Title,
                arc.Description,
                arc.Notes,
                arc.CreatedAt,
                arc.UpdatedAt,
                arc.Visibility,
            })
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
        {
            return [];
        }

        var beatsByArc = (await PlotBeatEndpoints.LoadBeatsAsync(db, universeId, beats, cancellationToken))
            .ToLookup(beat => beat.PlotArcId);

        return
        [
            .. rows.Select(arc => new PlotArcResponse(
                arc.Id,
                arc.StoryId,
                arc.SortOrder,
                arc.Title,
                arc.Description,
                arc.Notes,
                [.. beatsByArc[arc.Id]],
                arc.CreatedAt,
                arc.UpdatedAt,
                arc.Visibility)),
        ];
    }
}
