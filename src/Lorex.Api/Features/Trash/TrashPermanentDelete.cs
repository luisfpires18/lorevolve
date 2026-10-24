using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Trash;

/// <summary>
/// Deleting something in the Trash for good: the one irreversible action Lorex offers on authored work (ADR 0015, 0029 and
/// 0033, amended 2026-09-30 and 2026-10-01).
///
/// <b>Only from the Trash.</b> Every row is found through its own universe <i>and</i> requires the marker, so a live id
/// answers like a missing one or another world's. Moving to the Trash stays the only delete anywhere else; nothing reaches
/// this without having gone there first. Typed, as for restore: an id is never guessed at.
///
/// <b>One plan, one row or many.</b> A typed route erases one row; <see cref="BulkDeleteAsync"/> erases a selection of any
/// mix of kinds. Both run <see cref="EraseAsync"/>: the whole selection is resolved first - every row its exact kind, in
/// this universe, in the Trash - and only then is anything written, in one transaction. A row that does not resolve writes
/// nothing at all: a single route answers 404, a selection 409 <see cref="SelectionChangedCode"/>.
///
/// <b>The schema is the ownership graph.</b> Every dependant is a foreign key that already says what it is (see the
/// ADRs): what a row owns cascades with it - an entry's aliases, tags, values, article, both histories, image row,
/// relationships, timeline participation, scene and beat links and idea references; a story's chapters, scenes, arcs and
/// beats with everything they own in turn; a scene's manuscript and its versions; an arc's beats; a rule's check - and a
/// scene's point of view is cleared. So a delete is one statement on the rows themselves, and the database removes the rest
/// in that statement, including owned rows that sit in the Trash on their own (a beat binned before its arc goes with the
/// arc). The search indexes follow through their own delete triggers. Nothing a chapter in the Trash could own remains:
/// its scenes went to Unchaptered when it was binned, so none goes with it.
///
/// <b>Overlap is not a conflict.</b> A selection may hold a story and its own scene, or an arc and its beat: both were
/// resolved before anything was written, so the parent's cascade satisfies the child and the child's own statement then
/// matches nothing. The order of the request never matters - kinds are erased parents first, by set.
///
/// Three things the schema cannot say, and are done here: another entry's reference value pointing at an erased entry is
/// removed rather than left empty (a write never stores an empty reference); a moment's validation details that named only
/// an erased entry as participant are removed, as clearing all three parts of them does on a save; and a recorded Canon
/// finding naming what was erased is forgotten, whatever its status - it can never be true or false again.
///
/// <b>No Canon gate.</b> Nothing erased here contributes facts while it is in the Trash, so erasing it cannot add a
/// finding. A selection holding an entry still reconciles once (<see cref="CanonPromotionGate.RecordAsync"/>) because it
/// rewrites live rows the rules read - other entries' references, moments' participants - and the conflict table must
/// describe the lore that is left, in the same transaction. Story content contributes nothing (ADR 0024); a rule in the
/// Trash is not checked, so erasing it leaves every live finding as it was.
///
/// <b>An image goes after the commit.</b> Its object keys are read first, the database is changed and committed, and only
/// then are the originals and thumbnails swept - so nothing ever names a deleted object. A sweep that fails is logged as
/// orphaned media and changes nothing (ADR 0019): the entry is gone either way.
/// </summary>
internal static class TrashPermanentDelete
{
    /// <summary>The most rows one bulk delete may name. A Trash page is at most 50; this leaves room without a second limit.</summary>
    public const int BulkDeleteMaxItems = 100;

    /// <summary>The 409's code when a selected row is no longer in the Trash as what it was selected as.</summary>
    public const string SelectionChangedCode = "trash_selection_changed";

    public static Task<IResult> DeleteEntryAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken) =>
        EraseOneAsync(
            new(TrashItemKind.Entry, entityId), universeId, principal, db, canon, store, loggerFactory, _ => Results.NoContent(), cancellationToken);

    /// <summary>
    /// Erases a story and everything in it, and answers 200 with <see cref="TrashErasedStory"/>: the ids of every scene that
    /// went with it, live or in the Trash on its own, read in the same transaction as the delete. A client holds recovery
    /// copies of unsaved manuscripts by scene id (ADR 0029), and a story's scenes are the one thing erased here it could not
    /// otherwise name, so it lets exactly those go - and nothing else - once this has answered.
    /// </summary>
    public static Task<IResult> DeleteStoryAsync(
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken) =>
        EraseOneAsync(
            new(TrashItemKind.Story, storyId), universeId, principal, db, canon, store, loggerFactory,
            erased => Results.Ok(new TrashErasedStory(storyId, erased.SceneIds)), cancellationToken);

    public static Task<IResult> DeleteChapterAsync(
        Guid universeId,
        Guid chapterId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken) =>
        EraseOneAsync(
            new(TrashItemKind.Chapter, chapterId), universeId, principal, db, canon, store, loggerFactory, _ => Results.NoContent(), cancellationToken);

    public static Task<IResult> DeleteSceneAsync(
        Guid universeId,
        Guid sceneId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken) =>
        EraseOneAsync(
            new(TrashItemKind.Scene, sceneId), universeId, principal, db, canon, store, loggerFactory, _ => Results.NoContent(), cancellationToken);

    public static Task<IResult> DeletePlotArcAsync(
        Guid universeId,
        Guid plotArcId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken) =>
        EraseOneAsync(
            new(TrashItemKind.PlotArc, plotArcId), universeId, principal, db, canon, store, loggerFactory, _ => Results.NoContent(), cancellationToken);

    public static Task<IResult> DeletePlotBeatAsync(
        Guid universeId,
        Guid plotBeatId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken) =>
        EraseOneAsync(
            new(TrashItemKind.PlotBeat, plotBeatId), universeId, principal, db, canon, store, loggerFactory, _ => Results.NoContent(), cancellationToken);

    public static Task<IResult> DeleteWorldRuleAsync(
        Guid universeId,
        Guid worldRuleId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken) =>
        EraseOneAsync(
            new(TrashItemKind.WorldRule, worldRuleId), universeId, principal, db, canon, store, loggerFactory, _ => Results.NoContent(), cancellationToken);

    public static Task<IResult> DeleteRelationshipAsync(
        Guid universeId,
        Guid relationshipId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken) =>
        EraseOneAsync(
            new(TrashItemKind.Relationship, relationshipId), universeId, principal, db, canon, store, loggerFactory, _ => Results.NoContent(), cancellationToken);

    public static Task<IResult> DeleteTimelineEntryAsync(
        Guid universeId,
        Guid timelineEntryId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken) =>
        EraseOneAsync(
            new(TrashItemKind.TimelineEvent, timelineEntryId), universeId, principal, db, canon, store, loggerFactory, _ => Results.NoContent(), cancellationToken);

    /// <summary>
    /// Erases a selection of Trash rows of any kinds together, all or none, and answers 200 with
    /// <see cref="TrashBulkErased"/>: how many selected rows went, and the ids of every entry and scene that went - a story's
    /// scenes included, selected or not - so a client lets go of exactly the recovery copies it keeps for them.
    ///
    /// Owner first: another account's universe is a 404 like a missing one. Then the request's shape - 1 to
    /// <see cref="BulkDeleteMaxItems"/> rows, each a known kind and an id, none twice - refused as a validation problem,
    /// never truncated. Then the selection itself, whole, before anything is written: one row that is live, missing,
    /// another universe's or another kind's - restored or erased in another tab, say - refuses all of it with 409
    /// <see cref="SelectionChangedCode"/>, in words that confirm nothing about any one id.
    /// </summary>
    public static async Task<IResult> BulkDeleteAsync(
        Guid universeId,
        [FromBody] BulkTrashDeleteRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.PermanentlyDelete, cancellationToken) is { } denied)
        {
            return denied;
        }

        var items = request.Items;

        if (items is not { Count: > 0 })
        {
            return ItemsProblem("Choose at least one item.");
        }

        if (items.Count > BulkDeleteMaxItems)
        {
            return ItemsProblem($"Delete up to {BulkDeleteMaxItems} items at a time. This has {items.Count}.");
        }

        var errors = new Dictionary<string, string[]>();
        var seen = new HashSet<TrashSelection>();
        for (var index = 0; index < items.Count; index++)
        {
            var item = items[index];
            if (item is null)
            {
                errors[$"items[{index}]"] = ["Each item needs a kind and an id."];
            }
            else if (!Enum.IsDefined(item.Kind))
            {
                errors[$"items[{index}].kind"] = ["This is not a kind of thing the Trash holds."];
            }
            else if (item.Id == Guid.Empty)
            {
                errors[$"items[{index}].id"] = ["Each item needs an id."];
            }
            else if (!seen.Add(item))
            {
                errors[$"items[{index}]"] = ["The same item is listed more than once."];
            }
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        return await EraseAsync(
            db,
            canon,
            store,
            loggerFactory,
            universeId,
            seen,
            Results.Problem(
                title: "Trash changed",
                detail: "The Trash changed before these items could be deleted. Refresh and select them again.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = SelectionChangedCode }),
            erased => Results.Ok(new TrashBulkErased(seen.Count, erased.EntryIds, erased.SceneIds)),
            cancellationToken);
    }

    private static IResult ItemsProblem(string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { ["items"] = [message] });

    private static async Task<IResult> EraseOneAsync(
        TrashSelection item,
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        Func<Erased, IResult> answer,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.PermanentlyDelete, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await EraseAsync(
            db, canon, store, loggerFactory, universeId, [item], Results.NotFound(), answer, cancellationToken);
    }

    /// <summary>What a plan erased that someone outside the database may hold something of.</summary>
    private sealed record Erased(IReadOnlyList<Guid> EntryIds, IReadOnlyList<Guid> SceneIds, string[] ObjectKeys);

    /// <summary>
    /// One transaction: the plan, then - for a selection holding an entry - one Canon reconciliation, then the commit; and only
    /// after the commit, the sweep of every picture that went. Ownership is the caller's, proved first.
    /// </summary>
    private static async Task<IResult> EraseAsync(
        LorexDbContext db,
        CanonPromotionGate canon,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        Guid universeId,
        IReadOnlyCollection<TrashSelection> selection,
        IResult stale,
        Func<Erased, IResult> answer,
        CancellationToken cancellationToken)
    {
        Erased? erased = null;

        async Task<IResult> Plan(CancellationToken token)
        {
            erased = await PlanAsync(db, universeId, selection, token);
            return erased is null ? stale : answer(erased);
        }

        IResult result;
        if (selection.Any(item => item.Kind == TrashItemKind.Entry))
        {
            // Rolled back by the gate on a stale answer or a throw; committed with the reconciliation otherwise.
            result = await canon.RecordAsync(universeId, Plan, cancellationToken);
        }
        else
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            result = await Plan(cancellationToken);
            if (erased is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }
        }

        if (erased is { ObjectKeys.Length: > 0 })
        {
            await EntityImageEndpoints.SweepAsync(store, loggerFactory.CreateLogger("Lorex.EntityImages"), erased.ObjectKeys);
        }

        return result;
    }

    /// <summary>
    /// Inside the caller's transaction: resolves the whole selection, and only if every row resolves, erases it. Answers null,
    /// having written nothing, when any row does not.
    /// </summary>
    private static async Task<Erased?> PlanAsync(
        LorexDbContext db,
        Guid universeId,
        IReadOnlyCollection<TrashSelection> selection,
        CancellationToken cancellationToken)
    {
        List<Guid> Of(TrashItemKind kind) => [.. selection.Where(item => item.Kind == kind).Select(item => item.Id)];

        var entries = Of(TrashItemKind.Entry);
        var stories = Of(TrashItemKind.Story);
        var chapters = Of(TrashItemKind.Chapter);
        var scenes = Of(TrashItemKind.Scene);
        var arcs = Of(TrashItemKind.PlotArc);
        var beats = Of(TrashItemKind.PlotBeat);
        var rules = Of(TrashItemKind.WorldRule);
        var links = Of(TrashItemKind.Relationship);
        var moments = Of(TrashItemKind.TimelineEvent);

        // 1. Every row, as exactly the kind it was selected as, in this universe, in the Trash. Ids are distinct per kind, so a
        //    count says whether all of them are. Nothing is written until every kind has answered.
        var resolves =
            await Resolve(db.Entities.Where(row => row.UniverseId == universeId && row.DeletedAt != null && entries.Contains(row.Id)), entries)
            && await Resolve(db.Stories.Where(row => row.UniverseId == universeId && row.DeletedAt != null && stories.Contains(row.Id)), stories)
            && await Resolve(db.Chapters.Where(row => row.Story!.UniverseId == universeId && row.DeletedAt != null && chapters.Contains(row.Id)), chapters)
            && await Resolve(db.Scenes.Where(row => row.Story!.UniverseId == universeId && row.DeletedAt != null && scenes.Contains(row.Id)), scenes)
            && await Resolve(db.PlotArcs.Where(row => row.Story!.UniverseId == universeId && row.DeletedAt != null && arcs.Contains(row.Id)), arcs)
            && await Resolve(db.PlotBeats.Where(row => row.PlotArc!.Story!.UniverseId == universeId && row.DeletedAt != null && beats.Contains(row.Id)), beats)
            && await Resolve(db.WorldRules.Where(row => row.UniverseId == universeId && row.DeletedAt != null && rules.Contains(row.Id)), rules)
            && await Resolve(db.Relationships.Where(row => row.UniverseId == universeId && row.DeletedAt != null && links.Contains(row.Id)), links)
            && await Resolve(db.TimelineEntries.Where(row => row.UniverseId == universeId && row.DeletedAt != null && moments.Contains(row.Id)), moments);

        if (!resolves)
        {
            return null;
        }

        // 2. What goes that something outside these rows still names: every scene whose writing goes (a selected scene, and
        //    every scene of a selected story - never a chapter's, which stay in Unchaptered), every picture's objects, and
        //    every relationship an erased entry ends.
        var sceneIds = await db.Scenes
            .Where(scene => scenes.Contains(scene.Id) || stories.Contains(scene.StoryId))
            .OrderBy(scene => scene.Id)
            .Select(scene => scene.Id)
            .ToListAsync(cancellationToken);

        string[] objectKeys = [];
        if (entries.Count > 0)
        {
            objectKeys = [.. (await db.EntityImages
                    .Where(image => entries.Contains(image.EntityId))
                    .Select(image => new { image.OriginalKey, image.ThumbnailKey })
                    .ToListAsync(cancellationToken))
                .SelectMany(image => new[] { image.OriginalKey, image.ThumbnailKey })];

            // An appearance's pictures (Issue #43) go with their entry the same way, swept after the commit.
            objectKeys = [.. objectKeys, .. (await db.EntityAppearanceImages
                    .Where(image => entries.Contains(image.Appearance!.EntityId))
                    .Select(image => new { image.OriginalKey, image.ThumbnailKey })
                    .ToListAsync(cancellationToken))
                .SelectMany(image => new[] { image.OriginalKey, image.ThumbnailKey })];

            var relationshipIds = await db.Relationships
                .Where(relationship => entries.Contains(relationship.SourceEntityId) || entries.Contains(relationship.TargetEntityId))
                .Select(relationship => relationship.Id)
                .ToListAsync(cancellationToken);

            // 3. Entries: what pointed at any of them stops pointing, then the rows themselves.
            await db.EntityFieldValues
                .Where(value => value.ReferencedEntityId != null && entries.Contains(value.ReferencedEntityId.Value))
                .ExecuteDeleteAsync(cancellationToken);

            // An era's override that links to one goes the same way, and that era then inherits the field (Issue #41).
            await db.EntityEraFieldValues
                .Where(value => value.ReferencedEntityId != null && entries.Contains(value.ReferencedEntityId.Value))
                .ExecuteDeleteAsync(cancellationToken);

            await db.TimelineEntryValidations
                .Where(details => details.ParticipantEntityId != null
                    && entries.Contains(details.ParticipantEntityId.Value)
                    && details.EventKindTermId == null
                    && details.MethodTermId == null)
                .ExecuteDeleteAsync(cancellationToken);

            await ForgetFindingsAsync(db, universeId, CanonSubjectKind.Entity, entries, cancellationToken);
            await ForgetFindingsAsync(db, universeId, CanonSubjectKind.Relationship, relationshipIds, cancellationToken);

            await db.Entities.Where(entity => entries.Contains(entity.Id)).ExecuteDeleteAsync(cancellationToken);
        }

        // 4. Story content, parents first: a child a parent's cascade already took matches nothing on its own statement.
        await Erase(db.Stories.Where(row => stories.Contains(row.Id)), stories);
        await Erase(db.PlotArcs.Where(row => arcs.Contains(row.Id)), arcs);
        await Erase(db.Chapters.Where(row => chapters.Contains(row.Id)), chapters);
        await Erase(db.Scenes.Where(row => scenes.Contains(row.Id)), scenes);
        await Erase(db.PlotBeats.Where(row => beats.Contains(row.Id)), beats);

        // 5. Rules, and what was found about them.
        if (rules.Count > 0)
        {
            await db.WorldRules.Where(row => rules.Contains(row.Id)).ExecuteDeleteAsync(cancellationToken);
            await ForgetFindingsAsync(db, universeId, CanonSubjectKind.WorldRule, rules, cancellationToken);
        }

        // 6. Relationships and moments in the Trash (ADR 0048): a link selected with one of its entries already went with it.
        //    Neither contributes a finding while it is there, so what was recorded about them is simply forgotten.
        if (links.Count > 0)
        {
            await db.Relationships.Where(row => links.Contains(row.Id)).ExecuteDeleteAsync(cancellationToken);
            await ForgetFindingsAsync(db, universeId, CanonSubjectKind.Relationship, links, cancellationToken);
        }

        if (moments.Count > 0)
        {
            await db.TimelineEntries.Where(row => moments.Contains(row.Id)).ExecuteDeleteAsync(cancellationToken);
            await ForgetFindingsAsync(db, universeId, CanonSubjectKind.TimelineEntry, moments, cancellationToken);
        }

        return new Erased(entries, sceneIds, objectKeys);

        async Task<bool> Resolve<T>(IQueryable<T> rows, List<Guid> ids) =>
            ids.Count == 0 || await rows.CountAsync(cancellationToken) == ids.Count;

        async Task Erase<T>(IQueryable<T> rows, List<Guid> ids)
        {
            if (ids.Count > 0)
            {
                await rows.ExecuteDeleteAsync(cancellationToken);
            }
        }
    }

    /// <summary>
    /// Forgets every recorded finding naming one of <paramref name="ids"/>, whatever its status. Its subjects go with it.
    /// </summary>
    private static Task ForgetFindingsAsync(
        LorexDbContext db,
        Guid universeId,
        CanonSubjectKind kind,
        List<Guid> ids,
        CancellationToken cancellationToken) =>
        ids.Count == 0
            ? Task.CompletedTask
            : db.CanonConflicts
                .Where(conflict => conflict.UniverseId == universeId
                    && conflict.Subjects.Any(subject => subject.SubjectKind == kind && ids.Contains(subject.SubjectId)))
                .ExecuteDeleteAsync(cancellationToken);
}
