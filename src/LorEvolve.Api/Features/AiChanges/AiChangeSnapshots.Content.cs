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

    /// <summary>
    /// What a project's entry holds now (#148), or null when there is no live entry of that id in a project of this
    /// universe. IgnoreQueryFilters because a project's entries are hidden from every ordinary read of the table; the
    /// universe is still proved, through the project.
    /// </summary>
    public static async Task<ProjectEntryValues?> ProjectEntryAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid entryId,
        CancellationToken cancellationToken)
    {
        var row = await db.Entities.AsNoTracking().IgnoreQueryFilters()
            .Where(entry => entry.Id == entryId
                && entry.ProjectId != null
                && entry.UniverseId == universeId
                && entry.DeletedAt == null)
            .Select(entry => new
            {
                ProjectId = entry.ProjectId!.Value,
                entry.EntityTypeId,
                entry.Name,
                entry.Summary,
                entry.CanonEntityId,
                Values = entry.FieldValues
                    .Where(value => value.FieldDefinition!.ArchivedAt == null)
                    .Select(value => new
                    {
                        value.FieldDefinitionId,
                        value.TextValue,
                        value.NumberValue,
                        value.BooleanValue,
                        value.DateValue,
                        Choice = value.Option != null ? value.Option.Value : null,
                        value.ReferencedEntityId,
                    })
                    .ToList(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        // One row per chosen option is how a field of several choices is stored, so the snapshot groups them back into
        // the one value a proposal and the review screen both talk about.
        var fields = row.Values
            .GroupBy(value => value.FieldDefinitionId)
            .Select(group => new ProjectFieldValue(
                group.Key,
                group.Select(value => value.TextValue).FirstOrDefault(text => text is not null),
                group.Select(value => value.NumberValue).FirstOrDefault(number => number is not null),
                group.Select(value => value.BooleanValue).FirstOrDefault(boolean => boolean is not null),
                group.Select(value => value.DateValue).FirstOrDefault(date => date is not null),
                group.Select(value => value.Choice).OfType<string>().Order(StringComparer.Ordinal).ToList() is { Count: > 0 } chosen
                    ? chosen
                    : null,
                group.Select(value => value.ReferencedEntityId).FirstOrDefault(linked => linked is not null)))
            .ToList();

        return new ProjectEntryValues(
            row.ProjectId,
            row.EntityTypeId,
            row.Name,
            row.Summary ?? string.Empty,
            row.CanonEntityId,
            fields);
    }

    /// <summary>What a project's type holds now, or null when no type of that id belongs to a project of this universe.</summary>
    public static Task<ProjectTypeValues?> ProjectTypeAsync(LorEvolveDbContext db, Guid universeId, Guid typeId, CancellationToken cancellationToken) =>
        db.EntityTypes.AsNoTracking().IgnoreQueryFilters()
            .Where(type => type.Id == typeId && type.ProjectId != null && type.UniverseId == universeId)
            .Select(type => new ProjectTypeValues(
                type.ProjectId!.Value,
                type.Name,
                type.Description,
                type.Icon,
                type.AccentColor,
                type.ParentId == null ? null : new AiRef(type.ParentId, null)))
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>What a field on a project's type holds now, or null when it is archived or not a project's of this universe.</summary>
    public static async Task<ProjectSchemaFieldValues?> ProjectFieldAsync(LorEvolveDbContext db, Guid universeId, Guid fieldId, CancellationToken cancellationToken)
    {
        var row = await db.EntityFieldDefinitions.AsNoTracking().IgnoreQueryFilters()
            .Where(field => field.Id == fieldId
                && field.ArchivedAt == null
                && field.EntityType!.ProjectId != null
                && field.EntityType.UniverseId == universeId)
            .Select(field => new
            {
                ProjectId = field.EntityType!.ProjectId!.Value,
                field.EntityTypeId,
                field.Name,
                field.Kind,
                field.IsRequired,
                Options = field.Options.OrderBy(option => option.DisplayOrder).Select(option => option.Value).ToList(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? null
            : new ProjectSchemaFieldValues(row.ProjectId, AiRef.To(row.EntityTypeId), row.Name, row.Kind, row.IsRequired, row.Options);
    }

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
            .Select(candidate => new { candidate.Title, candidate.Body, candidate.ProjectId })
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
                .ThenBy(reference => reference.Target.Id)],
            idea.ProjectId);
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
