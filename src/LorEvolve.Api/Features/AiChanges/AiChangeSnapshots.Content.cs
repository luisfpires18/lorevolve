using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// The stored forms of the resources issue 45 added (ADR 0048), read as an AI change reads them: every list in a fixed order,
/// so a form read twice is equal exactly when nothing it shows changed. Arcs, rules, ideas and orders carry no edit
/// version, so that equality is their stale-change check; an article has its own version.
/// </summary>
internal static partial class AiChangeSnapshots
{
    /// <summary>A live entry's article and its version - empty and 0 before the first save - or null for no live entry here.</summary>
    public static async Task<(string Content, int Version)?> ArticleAsync(LorEvolveDbContext db, Guid universeId, Guid entityId, CancellationToken cancellationToken)
    {
        var live = await db.Entities.AsNoTracking()
            .AnyAsync(entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null, cancellationToken);
        if (!live)
        {
            return null;
        }

        var stored = await db.EntityArticles.AsNoTracking()
            .Where(article => article.EntityId == entityId)
            .Select(article => new { article.Content, article.Version })
            .FirstOrDefaultAsync(cancellationToken);
        return stored is null ? (string.Empty, 0) : (stored.Content, stored.Version);
    }

    public static Task<PlotArcValues?> PlotArcAsync(LorEvolveDbContext db, Guid universeId, Guid arcId, CancellationToken cancellationToken) =>
        db.PlotArcs.AsNoTracking()
            .Where(arc => arc.Id == arcId && arc.DeletedAt == null && arc.Story!.UniverseId == universeId && arc.Story.DeletedAt == null)
            .Select(arc => new PlotArcValues(new AiRef(arc.StoryId, null), arc.Title, arc.Description, arc.Notes))
            .FirstOrDefaultAsync(cancellationToken);

    public static async Task<WorldRuleValues?> WorldRuleAsync(LorEvolveDbContext db, Guid universeId, Guid ruleId, CancellationToken cancellationToken)
    {
        var row = await db.WorldRules.AsNoTracking()
            .Where(rule => rule.Id == ruleId && rule.UniverseId == universeId && rule.DeletedAt == null)
            .Select(rule => new
            {
                rule.Title,
                rule.Description,
                HasCheck = rule.Validation != null,
                EventKindId = rule.Validation != null ? rule.Validation.EventKindTermId : Guid.Empty,
                MethodId = rule.Validation != null ? rule.Validation.MethodTermId : Guid.Empty,
                Most = rule.Validation != null ? rule.Validation.MaxOccurrences : 0,
            })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? null
            : new WorldRuleValues(row.Title, row.Description, row.HasCheck ? new RuleCheckValues(row.EventKindId, row.MethodId, row.Most) : null);
    }

    /// <summary>
    /// One of <paramref name="ownerId"/>'s own live ideas that belongs to this universe, or null. Ownership is the first
    /// condition, as on every idea route: another account's idea, an unassigned one and one of another universe are all null.
    /// </summary>
    public static async Task<IdeaValues?> IdeaAsync(LorEvolveDbContext db, Guid universeId, string ownerId, Guid ideaId, CancellationToken cancellationToken)
    {
        var idea = await db.Ideas.AsNoTracking()
            .Where(candidate => candidate.Id == ideaId && candidate.OwnerId == ownerId && candidate.UniverseId == universeId && candidate.DeletedAt == null)
            .Select(candidate => new { candidate.Title, candidate.Body })
            .FirstOrDefaultAsync(cancellationToken);
        if (idea is null)
        {
            return null;
        }

        var references = await IdeaReferences.StoredAsync(db, ideaId, cancellationToken);
        return new IdeaValues(
            idea.Title,
            idea.Body,
            [.. references
                .Select(reference => new IdeaReferenceValue(reference.Kind, AiRef.To(reference.Id)))
                .OrderBy(reference => reference.Kind)
                .ThenBy(reference => reference.Target.Id)]);
    }

    /// <summary>
    /// A live container's whole order as it is now: a story's chapters or arcs, one container of its scenes (a chapter, or
    /// Unchaptered) - or null when the container is not live in this universe.
    /// </summary>
    public static async Task<OrderValues?> OrderAsync(
        LorEvolveDbContext db,
        Guid universeId,
        AiChangeResource resource,
        Guid? storyId,
        Guid? chapterId,
        CancellationToken cancellationToken)
    {
        if (!await db.Stories.AsNoTracking().AnyAsync(story => story.Id == storyId && story.UniverseId == universeId && story.DeletedAt == null, cancellationToken))
        {
            return null;
        }

        List<Guid> items;
        switch (resource)
        {
            case AiChangeResource.Chapter:
                items = await db.Chapters.AsNoTracking()
                    .Where(chapter => chapter.StoryId == storyId && chapter.DeletedAt == null)
                    .OrderBy(chapter => chapter.SortOrder).ThenBy(chapter => chapter.Id)
                    .Select(chapter => chapter.Id)
                    .ToListAsync(cancellationToken);
                break;

            case AiChangeResource.PlotArc:
                items = await db.PlotArcs.AsNoTracking()
                    .Where(arc => arc.StoryId == storyId && arc.DeletedAt == null)
                    .OrderBy(arc => arc.SortOrder).ThenBy(arc => arc.Id)
                    .Select(arc => arc.Id)
                    .ToListAsync(cancellationToken);
                break;

            default:
                if (chapterId is { } chapter
                    && !await db.Chapters.AsNoTracking().AnyAsync(row => row.Id == chapter && row.StoryId == storyId && row.DeletedAt == null, cancellationToken))
                {
                    return null;
                }

                items = await db.Scenes.AsNoTracking()
                    .InContainer(storyId!.Value, chapterId)
                    .OrderBy(scene => scene.SortOrder).ThenBy(scene => scene.Id)
                    .Select(scene => scene.Id)
                    .ToListAsync(cancellationToken);
                break;
        }

        return new OrderValues(AiRef.To(storyId!.Value), chapterId is { } inChapter ? AiRef.To(inChapter) : null, [.. items.Select(AiRef.To)]);
    }
}
