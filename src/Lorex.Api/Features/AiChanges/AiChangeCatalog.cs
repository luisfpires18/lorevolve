using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.AiChanges;

public sealed record AiChangeOptionField(Guid Id, string Name, string Kind, bool Required, IReadOnlyList<AiChangeOptionChoice> Choices, string? LinksTo, string? Meaning);

public sealed record AiChangeOptionChoice(Guid Id, string Value);

public sealed record AiChangeOptionType(Guid Id, string Name, IReadOnlyList<AiChangeOptionField> Fields);

public sealed record AiChangeOptionRelationshipType(Guid Id, string Name, string? InverseName, bool Symmetric);

public sealed record AiChangeOptionChapter(Guid Id, string Title);

public sealed record AiChangeOptionStory(Guid Id, string Title, IReadOnlyList<AiChangeOptionChapter> Chapters);

public sealed record AiChangeOptionNamed(Guid Id, string Name);

/// <summary>
/// What an AI may propose in this universe, for this person, and the ids it needs to: the role's allowed changes, the lore
/// types with their active fields and choices, the relationship kinds, the stories with their chapters, and the date
/// periods and months (ADR 0047). Read-only and bounded; the schema itself can never be changed through a proposal.
/// </summary>
public sealed record AiChangeOptions(
    string Role,
    IReadOnlyList<string> Allowed,
    IReadOnlyList<AiChangeOptionType> LoreTypes,
    IReadOnlyList<AiChangeOptionRelationshipType> RelationshipTypes,
    IReadOnlyList<AiChangeOptionStory> Stories,
    bool MoreStories,
    IReadOnlyList<AiChangeOptionNamed> DatePeriods,
    IReadOnlyList<AiChangeOptionNamed> Months,
    int MaxChanges,
    int MaxProseCharacters,
    string Notes);

internal static class AiChangeCatalog
{
    private const int StoryLimit = 30;

    private const int ChapterLimit = 60;

    public const string Notes =
        "Every change is staged for a person to review in LoreX; nothing changes until they approve it there. "
        + "Use ids exactly as given. To refer to something another change in the same proposal creates, use {\"ref\": \"<that change's id>\"} "
        + "instead of an id. Only the fields listed for a type exist; custom fields, types and relationship kinds can't be created or changed here. "
        + "remove moves lore entries, stories, chapters and scenes to the Trash; relationships and timeline moments can't be removed. "
        + "Only propose changes the person asked for.";

    public static async Task<AiChangeOptions> ReadAsync(LorexDbContext db, Guid universeId, UniverseRole role, CancellationToken cancellationToken)
    {
        var groups = await db.EntityTypeGroups.AsNoTracking()
            .Where(group => group.UniverseId == universeId)
            .ToDictionaryAsync(group => group.Id, group => group.Name, cancellationToken);
        var types = await db.EntityTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .OrderBy(type => type.Name)
            .Select(type => new
            {
                type.Id,
                type.Name,
                Fields = type.Fields.Where(field => field.ArchivedAt == null)
                    .OrderBy(field => field.DisplayOrder)
                    .ThenBy(field => field.Name)
                    .Select(field => new
                    {
                        field.Id,
                        field.Name,
                        field.Kind,
                        field.IsRequired,
                        field.Semantic,
                        field.TargetEntityTypeId,
                        TargetTypeName = field.TargetEntityType != null ? field.TargetEntityType.Name : null,
                        field.TargetGroupId,
                        Choices = field.Options.OrderBy(option => option.DisplayOrder).Select(option => new AiChangeOptionChoice(option.Id, option.Value)).ToList(),
                    })
                    .ToList(),
            })
            .ToListAsync(cancellationToken);

        var stories = await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == universeId && story.DeletedAt == null)
            .OrderBy(story => story.Title)
            .Take(StoryLimit + 1)
            .Select(story => new
            {
                story.Id,
                story.Title,
                Chapters = story.Chapters.Where(chapter => chapter.DeletedAt == null)
                    .OrderBy(chapter => chapter.SortOrder)
                    .Take(ChapterLimit)
                    .Select(chapter => new AiChangeOptionChapter(chapter.Id, chapter.Title))
                    .ToList(),
            })
            .ToListAsync(cancellationToken);

        var allowed = new List<string>();
        foreach (var resource in Enum.GetValues<AiChangeResource>())
        {
            foreach (var action in Enum.GetValues<AiChangeAction>())
            {
                var removable = resource is not (AiChangeResource.Relationship or AiChangeResource.TimelineEvent or AiChangeResource.Manuscript);
                var creatable = resource != AiChangeResource.Manuscript;
                if ((action != AiChangeAction.Remove || removable) && (action != AiChangeAction.Create || creatable)
                    && AiChangePermissions.MayStage(role, resource, action))
                {
                    allowed.Add($"{Wire(action)} {Wire(resource)}");
                }
            }
        }

        return new AiChangeOptions(
            role.ToString(),
            allowed,
            [.. types.Select(type => new AiChangeOptionType(type.Id, type.Name, [.. type.Fields.Select(field => new AiChangeOptionField(
                field.Id,
                field.Name,
                Kind(field.Kind),
                field.IsRequired,
                field.Choices,
                field.Kind != EntityFieldKind.EntityReference ? null
                    : field.TargetTypeName is { } typeName ? $"entries of type {typeName}"
                    : field.TargetGroupId is { } group && groups.TryGetValue(group, out var groupName) ? $"entries of a type in the group {groupName}"
                    : "any entry",
                field.Semantic?.ToString()))]))],
            await db.RelationshipTypes.AsNoTracking()
                .Where(type => type.UniverseId == universeId)
                .OrderBy(type => type.DisplayOrder)
                .Select(type => new AiChangeOptionRelationshipType(type.Id, type.Name, type.InverseName, type.IsSymmetric))
                .ToListAsync(cancellationToken),
            [.. stories.Take(StoryLimit).Select(story => new AiChangeOptionStory(story.Id, story.Title, story.Chapters))],
            stories.Count > StoryLimit,
            await db.ChronologyEras.AsNoTracking()
                .Where(era => era.UniverseId == universeId)
                .OrderBy(era => era.SortOrder)
                .Select(era => new AiChangeOptionNamed(era.Id, era.Name))
                .ToListAsync(cancellationToken),
            await db.ChronologyCalendarMonths.AsNoTracking()
                .Where(month => month.Calendar!.UniverseId == universeId)
                .OrderBy(month => month.SortOrder)
                .Select(month => new AiChangeOptionNamed(month.Id, month.Name))
                .ToListAsync(cancellationToken),
            AiChangeLimits.MaxOperations,
            AiChangeLimits.MaxManuscriptCharacters,
            Notes);
    }

    private static string Kind(EntityFieldKind kind) => kind switch
    {
        EntityFieldKind.ShortText => "short_text (text)",
        EntityFieldKind.LongText => "long_text (text)",
        EntityFieldKind.Number => "number (number)",
        EntityFieldKind.Boolean => "yes_no (boolean)",
        EntityFieldKind.Date => "date (date)",
        EntityFieldKind.Select => "one_choice (optionIds, one)",
        EntityFieldKind.MultiSelect => "choices (optionIds)",
        _ => "link (entry)",
    };

    private static string Wire(AiChangeAction action) => action.ToString().ToLowerInvariant();

    private static string Wire(AiChangeResource resource) => resource switch
    {
        AiChangeResource.LoreEntry => "lore_entry",
        AiChangeResource.TimelineEvent => "timeline_event",
        _ => resource.ToString().ToLowerInvariant(),
    };
}
