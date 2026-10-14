using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

using Lorex.Api.Features.Publishing;

namespace Lorex.Api.Features.Trash;

/// <summary>
/// Putting a story's content back from the Trash: a story, a chapter, a scene, an arc or a beat, each on a route of its own,
/// so what is restored is never a guess at what an id is (ADR 0029).
///
/// <b>A marker, not a rebuild.</b> Nothing a trashed row owns or is pointed at by was moved or deleted - a scene's prose,
/// saved versions and lore links, a beat's links, an arc's beats, a story's everything - so clearing the marker is what
/// brings them back, whole.
///
/// <b>Appended, never inserted.</b> A row in the Trash holds no place in its order, and the author may have rearranged
/// everything since. So a chapter, arc or beat comes back last among its live siblings, and a scene last in its own chapter
/// - or in Unchaptered, where deleting a chapter puts its scenes, when that chapter is not there. No other row moves, and a
/// restored chapter holds no scene: the scenes it had went to Unchaptered and stay wherever the author has put them.
///
/// <b>Never into something that is not there.</b> A chapter, scene or arc whose story is in the Trash, or a beat whose arc
/// or story is, is refused with a 409 naming what must come back first - never attached somewhere else, and never pulling
/// its container back on its own. A story holds nothing that can refuse it.
///
/// <b>No Canon.</b> Story content contributes no facts (ADR 0024), so no restore passes the promotion gate. Each is one
/// transaction, gated by <see cref="UniverseAccess"/>'s ManageTrash capability, and finds its row only through that universe: another world's id, or
/// one not in the Trash, answers as missing.
/// </summary>
internal static class StoryContentRestore
{
    /// <summary>The machine-readable marker on the 409 for content whose story or arc is in the Trash as well.</summary>
    public const string ParentInTrashCode = "trash_parent_in_trash";

    public static async Task<IResult> RestoreStoryAsync(
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        LorexDbContext db,
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

        var story = await db.Stories.FirstOrDefaultAsync(
            candidate => candidate.Id == storyId && candidate.UniverseId == universeId && candidate.DeletedAt != null,
            cancellationToken);

        if (story is null)
        {
            return Results.NotFound();
        }

        // Only the marker: everything inside was left exactly where it was. Titles are not unique, so nothing is renamed.
        story.DeletedAt = null;
        if (!keepPublication)
        {
            // A private story hides every scene, manuscript and arc in it, so nothing it holds is read publicly either.
            story.Visibility = ContentVisibility.Private;
        }

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new TrashRestored(TrashItemKind.Story, story.Id, story.Id));
    }

    public static async Task<IResult> RestoreChapterAsync(
        Guid universeId,
        Guid chapterId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var chapter = await db.Chapters
            .Include(candidate => candidate.Story)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == chapterId
                    && candidate.Story!.UniverseId == universeId
                    && candidate.DeletedAt != null,
                cancellationToken);

        if (chapter is null)
        {
            return Results.NotFound();
        }

        var story = chapter.Story!;
        if (story.DeletedAt is not null)
        {
            return StoryInTrash(story, "chapter");
        }

        var last = await db.Chapters
            .Where(candidate => candidate.StoryId == story.Id && candidate.DeletedAt == null)
            .MaxAsync(candidate => (int?)candidate.SortOrder, cancellationToken);

        chapter.SortOrder = (last ?? -1) + 1;
        chapter.DeletedAt = null;
        story.UpdatedAt = DateTime.UtcNow;

        if (!await SavedAsync(db, cancellationToken))
        {
            return OrderChanged(ChapterEndpoints.OrderChangedCode);
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(new TrashRestored(TrashItemKind.Chapter, chapter.Id, story.Id));
    }

    public static async Task<IResult> RestoreSceneAsync(
        Guid universeId,
        Guid sceneId,
        ClaimsPrincipal principal,
        LorexDbContext db,
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

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var scene = await db.Scenes
            .Include(candidate => candidate.Story)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == sceneId
                    && candidate.Story!.UniverseId == universeId
                    && candidate.DeletedAt != null,
                cancellationToken);

        if (scene is null)
        {
            return Results.NotFound();
        }

        var story = scene.Story!;
        if (story.DeletedAt is not null)
        {
            return StoryInTrash(story, "scene");
        }

        // Its own chapter when that chapter is live. A chapter sent to the Trash takes no scene with it - it moves every one
        // to Unchaptered, the Trash included - so otherwise the scene joins the others that chapter held.
        Guid? container = scene.ChapterId is { } chapterId
            && await db.Chapters.AnyAsync(
                chapter => chapter.Id == chapterId && chapter.StoryId == story.Id && chapter.DeletedAt == null,
                cancellationToken)
            ? chapterId
            : null;

        var last = await db.Scenes
            .InContainer(story.Id, container)
            .MaxAsync(candidate => (int?)candidate.SortOrder, cancellationToken);

        // Back without its chapter, if that went to the Trash: the chapter on any form opened before is out of date (ADR 0043).
        if (scene.ChapterId != container)
        {
            scene.Version++;
        }

        scene.ChapterId = container;
        scene.SortOrder = (last ?? -1) + 1;
        scene.DeletedAt = null;
        if (!keepPublication)
        {
            scene.Visibility = ContentVisibility.Private;
            scene.ManuscriptVisibility = ContentVisibility.Private;
        }

        story.UpdatedAt = DateTime.UtcNow;

        if (!await SavedAsync(db, cancellationToken))
        {
            return OrderChanged(SceneEndpoints.OrderChangedCode);
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(new TrashRestored(TrashItemKind.Scene, scene.Id, story.Id));
    }

    public static async Task<IResult> RestorePlotArcAsync(
        Guid universeId,
        Guid plotArcId,
        ClaimsPrincipal principal,
        LorexDbContext db,
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

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var arc = await db.PlotArcs
            .Include(candidate => candidate.Story)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == plotArcId
                    && candidate.Story!.UniverseId == universeId
                    && candidate.DeletedAt != null,
                cancellationToken);

        if (arc is null)
        {
            return Results.NotFound();
        }

        var story = arc.Story!;
        if (story.DeletedAt is not null)
        {
            return StoryInTrash(story, "arc");
        }

        var last = await db.PlotArcs
            .Where(candidate => candidate.StoryId == story.Id && candidate.DeletedAt == null)
            .MaxAsync(candidate => (int?)candidate.SortOrder, cancellationToken);

        arc.SortOrder = (last ?? -1) + 1;
        arc.DeletedAt = null;
        if (!keepPublication)
        {
            arc.Visibility = ContentVisibility.Private;
        }

        story.UpdatedAt = DateTime.UtcNow;

        if (!await SavedAsync(db, cancellationToken))
        {
            return OrderChanged(PlotArcEndpoints.OrderChangedCode);
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(new TrashRestored(TrashItemKind.PlotArc, arc.Id, story.Id));
    }

    public static async Task<IResult> RestorePlotBeatAsync(
        Guid universeId,
        Guid plotBeatId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var beat = await db.PlotBeats
            .Include(candidate => candidate.PlotArc)
            .ThenInclude(arc => arc!.Story)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == plotBeatId
                    && candidate.PlotArc!.Story!.UniverseId == universeId
                    && candidate.DeletedAt != null,
                cancellationToken);

        if (beat is null)
        {
            return Results.NotFound();
        }

        var arc = beat.PlotArc!;
        var story = arc.Story!;

        if (story.DeletedAt is not null)
        {
            return StoryInTrash(story, "beat");
        }

        if (arc.DeletedAt is not null)
        {
            return Refused(
                $"The arc “{arc.Title}” is in the Trash too. Restore the arc first, then this beat.",
                "arc",
                arc.Id);
        }

        var last = await db.PlotBeats
            .Where(candidate => candidate.PlotArcId == arc.Id && candidate.DeletedAt == null)
            .MaxAsync(candidate => (int?)candidate.SortOrder, cancellationToken);

        beat.SortOrder = (last ?? -1) + 1;
        beat.DeletedAt = null;
        story.UpdatedAt = DateTime.UtcNow;

        if (!await SavedAsync(db, cancellationToken))
        {
            return OrderChanged(PlotArcEndpoints.OrderChangedCode);
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(new TrashRestored(TrashItemKind.PlotBeat, beat.Id, story.Id));
    }

    /// <summary>
    /// Saves the restore, or reports that the order it appended to moved underneath it: two restores or appends reaching for
    /// the same last place at once, which the unique index refuses. Nothing is written then.
    /// </summary>
    private static async Task<bool> SavedAsync(LorexDbContext db, CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            return false;
        }
    }

    private static IResult StoryInTrash(Story story, string what) =>
        Refused($"“{story.Title}” is in the Trash too. Restore the story first, then this {what}.", "story", story.Id);

    /// <summary>
    /// The refusal for content whose container is in the Trash. It names the container - the author owns both, and has
    /// already proved it - so the one thing to do next is clear, and nothing is attached anywhere else in the meantime.
    /// </summary>
    private static IResult Refused(string detail, string blockedBy, Guid blockedById) =>
        Results.Problem(
            title: "Restore what it belongs to first",
            detail: detail,
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = ParentInTrashCode,
                ["blockedBy"] = blockedBy,
                ["blockedById"] = blockedById,
            });

    private static IResult OrderChanged(string code) =>
        Results.Problem(
            title: "Story changed",
            detail: "This story changed while that was being restored. Nothing was restored; try again.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = code });
}
