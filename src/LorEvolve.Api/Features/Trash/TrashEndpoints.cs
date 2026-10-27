using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;
using LorEvolve.Api.Features.WorldRules;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Trash;

/// <summary>
/// The Trash of one universe: what the author threw away, the action that brings each thing back, and the deliberate one
/// that erases it for good (<see cref="TrashPermanentDelete"/>).
///
/// Two kinds of authored work are trashable, each where its removal used to destroy a large amount of writing at once. A
/// lore entry, whose deletion took its article, values, aliases, history and every relationship and timeline appearance
/// that rested on it (ADR 0015). And a story's content - a story, a chapter, a scene, an arc or a beat - whose deletion took
/// prose, planning and every link inside it (ADR 0029). A world rule is the third: authored text about how the world works,
/// whose deletion would otherwise lose it outright (ADR 0033). A relationship and a timeline moment are the fourth and fifth:
/// small rows, but authored ones, and an AI change may remove them, so removing one must be reversible too (ADR 0048).
/// Everything else the API deletes is a derived record nothing authors (a Canon conflict), or a configuration object whose
/// deletion is already refused while anything depends on it.
///
/// Universe-scoped and gated on every route by <see cref="UniverseAccess"/> (ADR 0041): Editors and the owner list,
/// restore and trash; erasing for good is the owner's alone, because the Trash is the owner's recovery copy. A Viewer or
/// Reviewer is refused with 403, and another author's Trash answers 404, indistinguishable from a universe that does not
/// exist. Every
/// restore finds its row through its own universe, so an id from another world answers as missing.
/// </summary>
public static class TrashEndpoints
{
    private const int DefaultPageSize = 12;
    private const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapTrashEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/trash")
            .WithTags("Trash")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListTrash");
        group.MapPost("/{entityId:guid}/restore", RestoreAsync).WithName("RestoreTrashedEntity");
        group.MapPost("/stories/{storyId:guid}/restore", StoryContentRestore.RestoreStoryAsync)
            .WithName("RestoreTrashedStory");
        group.MapPost("/chapters/{chapterId:guid}/restore", StoryContentRestore.RestoreChapterAsync)
            .WithName("RestoreTrashedChapter");
        group.MapPost("/scenes/{sceneId:guid}/restore", StoryContentRestore.RestoreSceneAsync)
            .WithName("RestoreTrashedScene");
        group.MapPost("/plot-arcs/{plotArcId:guid}/restore", StoryContentRestore.RestorePlotArcAsync)
            .WithName("RestoreTrashedPlotArc");
        group.MapPost("/plot-beats/{plotBeatId:guid}/restore", StoryContentRestore.RestorePlotBeatAsync)
            .WithName("RestoreTrashedPlotBeat");
        group.MapPost("/world-rules/{worldRuleId:guid}/restore", WorldRuleEndpoints.RestoreAsync)
            .WithName("RestoreTrashedWorldRule");
        group.MapPost("/relationships/{relationshipId:guid}/restore", RelationshipEndpoints.RestoreAsync)
            .WithName("RestoreTrashedRelationship");
        group.MapPost("/timeline/{timelineEntryId:guid}/restore", TimelineEndpoints.RestoreAsync)
            .WithName("RestoreTrashedTimelineEntry");

        group.MapDelete("/{entityId:guid}", TrashPermanentDelete.DeleteEntryAsync).WithName("DeleteTrashedEntity");
        group.MapDelete("/stories/{storyId:guid}", TrashPermanentDelete.DeleteStoryAsync).WithName("DeleteTrashedStory");
        group.MapDelete("/chapters/{chapterId:guid}", TrashPermanentDelete.DeleteChapterAsync)
            .WithName("DeleteTrashedChapter");
        group.MapDelete("/scenes/{sceneId:guid}", TrashPermanentDelete.DeleteSceneAsync).WithName("DeleteTrashedScene");
        group.MapDelete("/plot-arcs/{plotArcId:guid}", TrashPermanentDelete.DeletePlotArcAsync)
            .WithName("DeleteTrashedPlotArc");
        group.MapDelete("/plot-beats/{plotBeatId:guid}", TrashPermanentDelete.DeletePlotBeatAsync)
            .WithName("DeleteTrashedPlotBeat");
        group.MapDelete("/world-rules/{worldRuleId:guid}", TrashPermanentDelete.DeleteWorldRuleAsync)
            .WithName("DeleteTrashedWorldRule");
        group.MapDelete("/relationships/{relationshipId:guid}", TrashPermanentDelete.DeleteRelationshipAsync)
            .WithName("DeleteTrashedRelationship");
        group.MapDelete("/timeline/{timelineEntryId:guid}", TrashPermanentDelete.DeleteTimelineEntryAsync)
            .WithName("DeleteTrashedTimelineEntry");
        group.MapPost("/bulk-delete", TrashPermanentDelete.BulkDeleteAsync).WithName("BulkDeleteTrash");

        return endpoints;
    }

    /// <summary>
    /// Everything in the universe's Trash, most recently thrown away first, which is the order a Trash is read in - the
    /// thing you regret is almost always the last thing you did. Kind, then id, break a tie, so two rows binned in the same
    /// tick never swap places between one page and the next.
    ///
    /// Only what was itself thrown away is listed. What sits inside a story in the Trash is not a row of its own, because
    /// it comes back with the story; a scene thrown away before its story was is, and says it must wait for the story.
    ///
    /// Nine compact reads - one per kind, names and places only, never an article, prose, notes or a rule's description -
    /// merged and paged here. A Trash is thrown away by hand, so it stays small next to what a page of it costs; a union
    /// across nine tables in SQL is the first change if one ever does not.
    /// </summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var rows = new List<TrashItem>();

        // Whether the universe itself is readable publicly, by the one predicate the portal uses: a selected item comes
        // back into public view only then.
        var universeIsPublic = await PublicationRules.Public(db).AnyAsync(universe => universe.Id == universeId, cancellationToken);

        rows.AddRange(await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && entity.DeletedAt != null)
            .Select(entity => new TrashItem(
                TrashItemKind.Entry,
                entity.Id,
                entity.Name,
                entity.DeletedAt!.Value,
                entity.EntityTypeId,
                entity.EntityType!.Name,
                entity.EntityType.Icon,
                entity.EntityType.AccentColor,
                entity.CanonStatus,
                null,
                null,
                null,
                null,
                TrashRestoreBlock.None,
                entity.Visibility != ContentVisibility.Public
                    ? TrashRestorePublication.None
                    : universeIsPublic ? TrashRestorePublication.Visible : TrashRestorePublication.Hidden))
            .ToListAsync(cancellationToken));

        rows.AddRange(await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == universeId && story.DeletedAt != null)
            .Select(story => new TrashItem(
                TrashItemKind.Story,
                story.Id,
                story.Title,
                story.DeletedAt!.Value,
                null,
                null,
                null,
                null,
                null,
                story.Id,
                null,
                null,
                null,
                TrashRestoreBlock.None,
                story.Visibility != ContentVisibility.Public
                    ? TrashRestorePublication.None
                    : universeIsPublic && story.PublicSummary != null ? TrashRestorePublication.Visible : TrashRestorePublication.Hidden))
            .ToListAsync(cancellationToken));

        rows.AddRange(await db.Chapters.AsNoTracking()
            .Where(chapter => chapter.Story!.UniverseId == universeId && chapter.DeletedAt != null)
            .Select(chapter => new TrashItem(
                TrashItemKind.Chapter,
                chapter.Id,
                chapter.Title,
                chapter.DeletedAt!.Value,
                null,
                null,
                null,
                null,
                null,
                chapter.StoryId,
                chapter.Story!.Title,
                null,
                null,
                chapter.Story.DeletedAt != null ? TrashRestoreBlock.StoryInTrash : TrashRestoreBlock.None,
                TrashRestorePublication.None))
            .ToListAsync(cancellationToken));

        rows.AddRange(await db.Scenes.AsNoTracking()
            .Where(scene => scene.Story!.UniverseId == universeId && scene.DeletedAt != null)
            .Select(scene => new TrashItem(
                TrashItemKind.Scene,
                scene.Id,
                scene.Title,
                scene.DeletedAt!.Value,
                null,
                null,
                null,
                null,
                null,
                scene.StoryId,
                scene.Story!.Title,
                null,
                null,
                scene.Story.DeletedAt != null ? TrashRestoreBlock.StoryInTrash : TrashRestoreBlock.None,
                TrashRestorePublication.None))
            .ToListAsync(cancellationToken));

        rows.AddRange(await db.PlotArcs.AsNoTracking()
            .Where(arc => arc.Story!.UniverseId == universeId && arc.DeletedAt != null)
            .Select(arc => new TrashItem(
                TrashItemKind.PlotArc,
                arc.Id,
                arc.Title,
                arc.DeletedAt!.Value,
                null,
                null,
                null,
                null,
                null,
                arc.StoryId,
                arc.Story!.Title,
                null,
                null,
                arc.Story.DeletedAt != null ? TrashRestoreBlock.StoryInTrash : TrashRestoreBlock.None,
                TrashRestorePublication.None))
            .ToListAsync(cancellationToken));

        rows.AddRange(await db.PlotBeats.AsNoTracking()
            .Where(beat => beat.PlotArc!.Story!.UniverseId == universeId && beat.DeletedAt != null)
            .Select(beat => new TrashItem(
                TrashItemKind.PlotBeat,
                beat.Id,
                beat.Title,
                beat.DeletedAt!.Value,
                null,
                null,
                null,
                null,
                null,
                beat.PlotArc!.StoryId,
                beat.PlotArc.Story!.Title,
                beat.PlotArcId,
                beat.PlotArc.Title,
                beat.PlotArc.Story.DeletedAt != null
                    ? TrashRestoreBlock.StoryInTrash
                    : beat.PlotArc.DeletedAt != null
                        ? TrashRestoreBlock.ArcInTrash
                        : TrashRestoreBlock.None,
                TrashRestorePublication.None))
            .ToListAsync(cancellationToken));

        // A world rule belongs to its universe directly, so it has no story, arc or anything else to wait for.
        rows.AddRange(await db.WorldRules.AsNoTracking()
            .Where(rule => rule.UniverseId == universeId && rule.DeletedAt != null)
            .Select(rule => new TrashItem(
                TrashItemKind.WorldRule,
                rule.Id,
                rule.Title,
                rule.DeletedAt!.Value,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                TrashRestoreBlock.None,
                TrashRestorePublication.None))
            .ToListAsync(cancellationToken));

        // A relationship reads whole, as its entries' Relations views read it. One whose end is in the Trash waits for that end.
        rows.AddRange(await db.Relationships.AsNoTracking()
            .Where(relationship => relationship.UniverseId == universeId && relationship.DeletedAt != null)
            .Select(relationship => new TrashItem(
                TrashItemKind.Relationship,
                relationship.Id,
                relationship.SourceEntity!.Name + " " + relationship.RelationshipType!.Name + " " + relationship.TargetEntity!.Name,
                relationship.DeletedAt!.Value,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                relationship.SourceEntity.DeletedAt != null || relationship.TargetEntity.DeletedAt != null
                    ? TrashRestoreBlock.EntryInTrash
                    : TrashRestoreBlock.None,
                TrashRestorePublication.None,
                relationship.SourceEntityId))
            .ToListAsync(cancellationToken));

        // A moment belongs to its universe directly: its participants and stories are links, kept, and wait for nothing.
        rows.AddRange(await db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.UniverseId == universeId && entry.DeletedAt != null)
            .Select(entry => new TrashItem(
                TrashItemKind.TimelineEvent,
                entry.Id,
                entry.Title,
                entry.DeletedAt!.Value,
                null,
                null,
                null,
                null,
                entry.CanonStatus,
                null,
                null,
                null,
                null,
                TrashRestoreBlock.None,
                TrashRestorePublication.None))
            .ToListAsync(cancellationToken));

        var totalCount = rows.Count;
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var items = rows
            .OrderByDescending(row => row.TrashedAt.Ticks)
            .ThenBy(row => row.Kind)
            .ThenBy(row => row.Id.ToString(), StringComparer.Ordinal)
            .Skip(skip)
            .Take(pageSize)
            .Select(row => row with { TrashedAt = DateTime.SpecifyKind(row.TrashedAt, DateTimeKind.Utc) })
            .ToList();

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new TrashPage(items, page, pageSize, totalCount, totalPages));
    }

    /// <summary>
    /// Puts one entry back, exactly as it was.
    ///
    /// Restore is a real mutation and is gated like any other. Bringing lore back adds facts to
    /// the universe - declared years, Canon participation, relationships and references that
    /// were dormant while their subject was in the Trash - and any of those can newly
    /// contradict what has been written since. So it runs under
    /// <see cref="CanonPromotionGate.RunAsync"/>: if the restored entry would introduce a High
    /// finding the universe does not already carry, the whole thing is rolled back with the
    /// same 409 an ordinary write gets, and the entry is still in the Trash afterwards. There
    /// is no partial restore, because there is nothing to restore in parts - one column moves.
    /// Medium and Low findings are recorded and block nothing, exactly as ADR 0012 says.
    ///
    /// Nothing here revalidates the entry, and that is deliberate rather than an omission.
    /// Every id the entry depends on is still resolvable by construction: its type cannot have
    /// been deleted (the foreign key is <c>Restrict</c> and a trashed entry still counts as
    /// using it), nor can a field definition holding one of its values or an option one of them
    /// chose - all three deletions are refused while a value exists, and a trashed entry's
    /// values are still values. So a restore puts back exactly the rows that were stored, and
    /// the only thing that can refuse it is canon.
    /// </summary>
    private static async Task<IResult> RestoreAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        var (denied, role) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        // Whoever may restore but not publish (an Editor) never brings anything back public: what the owner had selected
        // is restored private, here on the server, whatever the request asked (ADR 0041 amendment).
        var keepPublication = UniverseAccess.Allows(role, UniverseCapability.Publish);

        return await gate.RunAsync(
            universeId,
            token => RestoreCoreAsync(universeId, entityId, db, keepPublication, token),
            cancellationToken);
    }

    private static async Task<IResult> RestoreCoreAsync(
        Guid universeId,
        Guid entityId,
        LorEvolveDbContext db,
        bool keepPublication,
        CancellationToken cancellationToken)
    {
        var entity = await db.Entities.FirstOrDefaultAsync(
            candidate => candidate.Id == entityId
                && candidate.UniverseId == universeId
                && candidate.DeletedAt != null,
            cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        // The whole restore. Everything the entry owns and everything that points at it never
        // moved, so clearing the marker is what reconnects them - there is no graph to rebuild
        // and therefore no half-rebuilt state to be left in.
        //
        // The name is not checked against anything. Entry names are not unique inside a
        // universe and never have been (the index on UniverseId, Name is not unique), so an
        // entry written while this one sat in the Trash cannot collide with it, and a restore
        // never renames what the author wrote.
        entity.DeletedAt = null;
        if (!keepPublication)
        {
            // Its address and first publication date stay, as an unpublish keeps them; only the selection goes.
            entity.Visibility = ContentVisibility.Private;
        }

        await db.SaveChangesAsync(cancellationToken);

        var detail = await EntityEndpoints.LoadDetailAsync(db, universeId, entityId, cancellationToken);

        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }
}
