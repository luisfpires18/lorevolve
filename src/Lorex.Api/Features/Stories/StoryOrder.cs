using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Stories;

/// <summary>
/// The two narrative orders a story keeps, and the one way either is rewritten.
///
/// Chapters are ordered per story. Scenes are ordered per <i>container</i>: one chapter, or the story's
/// Unchaptered scenes, which is a null <see cref="Scene.ChapterId"/> rather than a chapter row. Both
/// orders are contiguous from 0 and unique, and the database holds the uniqueness with an index - for
/// scenes, one filtered index per kind of container (ADR 0025).
///
/// <b>Park, then place.</b> SQLite checks a unique index row by row, so writing the final positions
/// straight away collides halfway through: the first scene to move up lands on the place the next one
/// has not left yet. Every row being placed first steps aside to its own negative position - distinct
/// across every container in the call, so a scene changing container cannot collide on either side -
/// and then lands on its final one. Both writes belong to the caller's transaction.
/// </summary>
internal static class StoryOrder
{
    /// <summary>
    /// The live scenes of one container: a chapter, or the story's Unchaptered scenes when <paramref name="chapterId"/> is
    /// null. A scene in the Trash holds no place in any container's order (ADR 0029).
    /// </summary>
    public static IQueryable<Scene> InContainer(this IQueryable<Scene> scenes, Guid storyId, Guid? chapterId) =>
        chapterId is { } id
            ? scenes.Where(scene => scene.StoryId == storyId && scene.ChapterId == id && scene.DeletedAt == null)
            : scenes.Where(scene => scene.StoryId == storyId && scene.ChapterId == null && scene.DeletedAt == null);

    /// <summary>One container's live scenes, tracked, in the order they are told.</summary>
    public static Task<List<Scene>> LoadContainerAsync(
        LorexDbContext db,
        Guid storyId,
        Guid? chapterId,
        CancellationToken cancellationToken) =>
        db.Scenes
            .InContainer(storyId, chapterId)
            .OrderBy(scene => scene.SortOrder)
            .ThenBy(scene => scene.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Makes each list exactly its container: every scene in it takes that container's chapter id and the
    /// positions 0, 1, 2... in list order. A scene appearing in a list for a different container than the
    /// one it is in is moved there. Writes nothing when everything is already where it belongs.
    /// </summary>
    public static async Task PlaceScenesAsync(
        LorexDbContext db,
        IReadOnlyList<SceneContainer> containers,
        CancellationToken cancellationToken)
    {
        var settled = containers.All(container => container.Scenes
            .Select((scene, index) => scene.ChapterId == container.ChapterId && scene.SortOrder == index)
            .All(inPlace => inPlace));

        if (settled)
        {
            return;
        }

        var parked = -1;
        foreach (var container in containers)
        {
            foreach (var scene in container.Scenes)
            {
                // A scene's chapter is on its form, so a move to another one makes an open form's copy out of date (ADR 0043).
                if (scene.ChapterId != container.ChapterId)
                {
                    scene.Version++;
                }

                scene.ChapterId = container.ChapterId;
                scene.SortOrder = parked--;
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        foreach (var container in containers)
        {
            for (var index = 0; index < container.Scenes.Count; index++)
            {
                container.Scenes[index].SortOrder = index;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Gives <paramref name="ordered"/> - every chapter of one story - the positions 0, 1, 2... in that order.</summary>
    public static async Task PlaceChaptersAsync(
        LorexDbContext db,
        List<Chapter> ordered,
        CancellationToken cancellationToken)
    {
        if (ordered.Select((chapter, index) => chapter.SortOrder == index).All(inPlace => inPlace))
        {
            return;
        }

        var parked = -1;
        foreach (var chapter in ordered)
        {
            chapter.SortOrder = parked--;
        }

        await db.SaveChangesAsync(cancellationToken);

        for (var index = 0; index < ordered.Count; index++)
        {
            ordered[index].SortOrder = index;
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>A container's chapter id - null for Unchaptered - and the scenes it should hold, first told first.</summary>
internal sealed record SceneContainer(Guid? ChapterId, List<Scene> Scenes);
