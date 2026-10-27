using System.Linq.Expressions;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Ideas;

/// <summary>
/// What an idea points at, as one place reads it: resolving references for display, checking a save's references against
/// a universe, offering targets to a picker, and replacing an idea's stored references.
///
/// Every read starts from the universe, so a target in another universe - including another account's - resolves to
/// nothing, and is refused in the same words as one that does not exist. Names are read from the targets on every request
/// and never copied onto the idea. At most one query per kind, and none for a kind nobody named.
/// </summary>
internal static class IdeaReferences
{
    /// <summary>How many targets a picker is offered at once. It narrows by typing, not by paging.</summary>
    public const int PickerLimit = 30;

    private static readonly Expression<Func<LoreEntity, IdeaReferenceView>> EntityView =
        entity => new IdeaReferenceView(
            IdeaReferenceKind.Entity,
            entity.Id,
            entity.Name,
            entity.DeletedAt != null,
            entity.EntityType!.Name,
            null,
            null,
            null);

    private static readonly Expression<Func<Story, IdeaReferenceView>> StoryView =
        story => new IdeaReferenceView(
            IdeaReferenceKind.Story,
            story.Id,
            story.Title,
            story.DeletedAt != null,
            null,
            story.Id,
            null,
            null);

    // A scene, arc or beat is out of reach while anything it sits in is in the Trash, exactly as the story routes answer.
    private static readonly Expression<Func<Scene, IdeaReferenceView>> SceneView =
        scene => new IdeaReferenceView(
            IdeaReferenceKind.Scene,
            scene.Id,
            scene.Title,
            scene.DeletedAt != null || scene.Story!.DeletedAt != null,
            null,
            scene.StoryId,
            scene.Story!.Title,
            null);

    private static readonly Expression<Func<PlotArc, IdeaReferenceView>> PlotArcView =
        arc => new IdeaReferenceView(
            IdeaReferenceKind.PlotArc,
            arc.Id,
            arc.Title,
            arc.DeletedAt != null || arc.Story!.DeletedAt != null,
            null,
            arc.StoryId,
            arc.Story!.Title,
            null);

    private static readonly Expression<Func<PlotBeat, IdeaReferenceView>> PlotBeatView =
        beat => new IdeaReferenceView(
            IdeaReferenceKind.PlotBeat,
            beat.Id,
            beat.Title,
            beat.DeletedAt != null || beat.PlotArc!.DeletedAt != null || beat.PlotArc.Story!.DeletedAt != null,
            null,
            beat.PlotArc!.StoryId,
            beat.PlotArc.Story!.Title,
            beat.PlotArc.Title);

    /// <summary>
    /// The references that exist in <paramref name="universeId"/>, resolved, in a fixed order: kind, then name and id with an
    /// ordinal comparer. One that does not - gone, or never in this universe - is simply not in the result.
    /// </summary>
    public static async Task<List<IdeaReferenceView>> ResolveAsync(
        LorEvolveDbContext db,
        Guid universeId,
        IEnumerable<IdeaReferenceInput> references,
        CancellationToken cancellationToken)
    {
        var byKind = references.ToLookup(reference => reference.Kind, reference => reference.Id);
        var resolved = new List<IdeaReferenceView>();

        if (Ids(byKind, IdeaReferenceKind.Entity) is { Count: > 0 } entities)
        {
            resolved.AddRange(await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && entities.Contains(entity.Id))
                .Select(EntityView)
                .ToListAsync(cancellationToken));
        }

        if (Ids(byKind, IdeaReferenceKind.Story) is { Count: > 0 } stories)
        {
            resolved.AddRange(await db.Stories.AsNoTracking()
                .Where(story => story.UniverseId == universeId && stories.Contains(story.Id))
                .Select(StoryView)
                .ToListAsync(cancellationToken));
        }

        if (Ids(byKind, IdeaReferenceKind.Scene) is { Count: > 0 } scenes)
        {
            resolved.AddRange(await db.Scenes.AsNoTracking()
                .Where(scene => scene.Story!.UniverseId == universeId && scenes.Contains(scene.Id))
                .Select(SceneView)
                .ToListAsync(cancellationToken));
        }

        if (Ids(byKind, IdeaReferenceKind.PlotArc) is { Count: > 0 } arcs)
        {
            resolved.AddRange(await db.PlotArcs.AsNoTracking()
                .Where(arc => arc.Story!.UniverseId == universeId && arcs.Contains(arc.Id))
                .Select(PlotArcView)
                .ToListAsync(cancellationToken));
        }

        if (Ids(byKind, IdeaReferenceKind.PlotBeat) is { Count: > 0 } beats)
        {
            resolved.AddRange(await db.PlotBeats.AsNoTracking()
                .Where(beat => beat.PlotArc!.Story!.UniverseId == universeId && beats.Contains(beat.Id))
                .Select(PlotBeatView)
                .ToListAsync(cancellationToken));
        }

        return
        [
            .. resolved
                .OrderBy(reference => reference.Kind)
                .ThenBy(reference => reference.Name, StringComparer.Ordinal)
                .ThenBy(reference => reference.Id.ToString(), StringComparer.Ordinal),
        ];
    }

    /// <summary>
    /// Live targets of one kind in a universe whose name contains <paramref name="search"/>, by name - what a picker offers.
    /// Nothing in the Trash, and no archived entry, as the lore pickers offer none.
    /// </summary>
    public static async Task<List<IdeaReferenceView>> TargetsAsync(
        LorEvolveDbContext db,
        Guid universeId,
        IdeaReferenceKind kind,
        string? search,
        CancellationToken cancellationToken)
    {
        var pattern = string.IsNullOrWhiteSpace(search) ? null : $"%{IdeaEndpoints.EscapeLike(search.Trim())}%";

        return kind switch
        {
            IdeaReferenceKind.Entity => await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && entity.DeletedAt == null && !entity.IsArchived)
                .Where(entity => pattern == null || EF.Functions.Like(entity.Name, pattern, "\\"))
                .OrderBy(entity => entity.Name).ThenBy(entity => entity.Id)
                .Take(PickerLimit)
                .Select(EntityView)
                .ToListAsync(cancellationToken),

            IdeaReferenceKind.Story => await db.Stories.AsNoTracking()
                .Where(story => story.UniverseId == universeId && story.DeletedAt == null)
                .Where(story => pattern == null || EF.Functions.Like(story.Title, pattern, "\\"))
                .OrderBy(story => story.Title).ThenBy(story => story.Id)
                .Take(PickerLimit)
                .Select(StoryView)
                .ToListAsync(cancellationToken),

            IdeaReferenceKind.Scene => await db.Scenes.AsNoTracking()
                .Where(scene => scene.Story!.UniverseId == universeId
                    && scene.DeletedAt == null
                    && scene.Story.DeletedAt == null)
                .Where(scene => pattern == null || EF.Functions.Like(scene.Title, pattern, "\\"))
                .OrderBy(scene => scene.Title).ThenBy(scene => scene.Id)
                .Take(PickerLimit)
                .Select(SceneView)
                .ToListAsync(cancellationToken),

            IdeaReferenceKind.PlotArc => await db.PlotArcs.AsNoTracking()
                .Where(arc => arc.Story!.UniverseId == universeId && arc.DeletedAt == null && arc.Story.DeletedAt == null)
                .Where(arc => pattern == null || EF.Functions.Like(arc.Title, pattern, "\\"))
                .OrderBy(arc => arc.Title).ThenBy(arc => arc.Id)
                .Take(PickerLimit)
                .Select(PlotArcView)
                .ToListAsync(cancellationToken),

            IdeaReferenceKind.PlotBeat => await db.PlotBeats.AsNoTracking()
                .Where(beat => beat.PlotArc!.Story!.UniverseId == universeId
                    && beat.DeletedAt == null
                    && beat.PlotArc.DeletedAt == null
                    && beat.PlotArc.Story.DeletedAt == null)
                .Where(beat => pattern == null || EF.Functions.Like(beat.Title, pattern, "\\"))
                .OrderBy(beat => beat.Title).ThenBy(beat => beat.Id)
                .Take(PickerLimit)
                .Select(PlotBeatView)
                .ToListAsync(cancellationToken),

            _ => [],
        };
    }

    /// <summary>The references stored on one idea, as a request would name them.</summary>
    public static async Task<List<IdeaReferenceInput>> StoredAsync(
        LorEvolveDbContext db,
        Guid ideaId,
        CancellationToken cancellationToken)
    {
        var stored = new List<IdeaReferenceInput>();

        stored.AddRange(await db.Set<IdeaEntityReference>().AsNoTracking()
            .Where(reference => reference.IdeaId == ideaId)
            .Select(reference => new IdeaReferenceInput(IdeaReferenceKind.Entity, reference.EntityId))
            .ToListAsync(cancellationToken));
        stored.AddRange(await db.Set<IdeaStoryReference>().AsNoTracking()
            .Where(reference => reference.IdeaId == ideaId)
            .Select(reference => new IdeaReferenceInput(IdeaReferenceKind.Story, reference.StoryId))
            .ToListAsync(cancellationToken));
        stored.AddRange(await db.Set<IdeaSceneReference>().AsNoTracking()
            .Where(reference => reference.IdeaId == ideaId)
            .Select(reference => new IdeaReferenceInput(IdeaReferenceKind.Scene, reference.SceneId))
            .ToListAsync(cancellationToken));
        stored.AddRange(await db.Set<IdeaPlotArcReference>().AsNoTracking()
            .Where(reference => reference.IdeaId == ideaId)
            .Select(reference => new IdeaReferenceInput(IdeaReferenceKind.PlotArc, reference.PlotArcId))
            .ToListAsync(cancellationToken));
        stored.AddRange(await db.Set<IdeaPlotBeatReference>().AsNoTracking()
            .Where(reference => reference.IdeaId == ideaId)
            .Select(reference => new IdeaReferenceInput(IdeaReferenceKind.PlotBeat, reference.PlotBeatId))
            .ToListAsync(cancellationToken));

        return stored;
    }

    /// <summary>
    /// Makes the idea's stored references exactly <paramref name="wanted"/>: removes what is no longer named and adds what is
    /// newly named, leaving the rest untouched. Staged on the context; the caller saves.
    /// </summary>
    public static void Replace(
        LorEvolveDbContext db,
        Guid ideaId,
        IReadOnlyCollection<IdeaReferenceInput> stored,
        IReadOnlyCollection<IdeaReferenceInput> wanted)
    {
        foreach (var gone in stored.Except(wanted))
        {
            switch (gone.Kind)
            {
                case IdeaReferenceKind.Entity:
                    db.Remove(new IdeaEntityReference { IdeaId = ideaId, EntityId = gone.Id });
                    break;
                case IdeaReferenceKind.Story:
                    db.Remove(new IdeaStoryReference { IdeaId = ideaId, StoryId = gone.Id });
                    break;
                case IdeaReferenceKind.Scene:
                    db.Remove(new IdeaSceneReference { IdeaId = ideaId, SceneId = gone.Id });
                    break;
                case IdeaReferenceKind.PlotArc:
                    db.Remove(new IdeaPlotArcReference { IdeaId = ideaId, PlotArcId = gone.Id });
                    break;
                case IdeaReferenceKind.PlotBeat:
                    db.Remove(new IdeaPlotBeatReference { IdeaId = ideaId, PlotBeatId = gone.Id });
                    break;
            }
        }

        foreach (var added in wanted.Except(stored))
        {
            switch (added.Kind)
            {
                case IdeaReferenceKind.Entity:
                    db.Add(new IdeaEntityReference { IdeaId = ideaId, EntityId = added.Id });
                    break;
                case IdeaReferenceKind.Story:
                    db.Add(new IdeaStoryReference { IdeaId = ideaId, StoryId = added.Id });
                    break;
                case IdeaReferenceKind.Scene:
                    db.Add(new IdeaSceneReference { IdeaId = ideaId, SceneId = added.Id });
                    break;
                case IdeaReferenceKind.PlotArc:
                    db.Add(new IdeaPlotArcReference { IdeaId = ideaId, PlotArcId = added.Id });
                    break;
                case IdeaReferenceKind.PlotBeat:
                    db.Add(new IdeaPlotBeatReference { IdeaId = ideaId, PlotBeatId = added.Id });
                    break;
            }
        }
    }

    /// <summary>
    /// Lets go of every idea's association with a universe that is about to be deleted, inside the caller's transaction.
    ///
    /// Each idea stays, whole - title, body, when it was written - and becomes unassigned; its references go, because what
    /// they point at is being deleted with the universe and an unassigned idea holds none. The ideas' <c>UpdatedAt</c> moves,
    /// so a window still holding the old association is refused as stale rather than saving a universe that is gone.
    /// Ideas in the Trash are released the same way. Nothing is attached to another universe.
    /// </summary>
    public static async Task ReleaseUniverseAsync(
        LorEvolveDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        await db.Set<IdeaEntityReference>()
            .Where(reference => reference.Idea!.UniverseId == universeId)
            .ExecuteDeleteAsync(cancellationToken);
        await db.Set<IdeaStoryReference>()
            .Where(reference => reference.Idea!.UniverseId == universeId)
            .ExecuteDeleteAsync(cancellationToken);
        await db.Set<IdeaSceneReference>()
            .Where(reference => reference.Idea!.UniverseId == universeId)
            .ExecuteDeleteAsync(cancellationToken);
        await db.Set<IdeaPlotArcReference>()
            .Where(reference => reference.Idea!.UniverseId == universeId)
            .ExecuteDeleteAsync(cancellationToken);
        await db.Set<IdeaPlotBeatReference>()
            .Where(reference => reference.Idea!.UniverseId == universeId)
            .ExecuteDeleteAsync(cancellationToken);

        var now = DateTime.UtcNow;
        await db.Ideas
            .Where(idea => idea.UniverseId == universeId)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(idea => idea.UniverseId, (Guid?)null)
                    .SetProperty(idea => idea.UpdatedAt, now),
                cancellationToken);
    }

    private static List<Guid> Ids(ILookup<IdeaReferenceKind, Guid> byKind, IdeaReferenceKind kind) => [.. byKind[kind]];
}
