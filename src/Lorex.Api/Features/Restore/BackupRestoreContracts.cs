using Lorex.Api.Features.Export;

namespace Lorex.Api.Features.Restore;

/// <summary>
/// What a validated backup would create, counted from the normalized payload - never from anything the
/// client sent. Counts only: the preview is for recognising a world, not for reading it.
/// </summary>
public sealed record BackupPreviewCounts(
    int EntityTypes,
    int Entries,
    int EntriesInTrash,
    int EntryVersions,
    int Articles,
    int ArticleVersions,
    int Images,
    int RelationshipTypes,
    int Relationships,
    int Eras,
    int TimelineEntries,
    int Stories,
    int Chapters,
    int Scenes,
    int PlotArcs,
    int PlotBeats,
    int Manuscripts,
    int ManuscriptVersions,
    int StoryItemsInTrash,
    int Ideas,
    int IdeasDeleted,
    int DismissedConflicts,
    int WorldRules,
    int WorldRulesInTrash,
    int Maps = 0,
    int MapPins = 0,
    int IdeaBoards = 0)
{
    internal static BackupPreviewCounts Of(UniverseBackupPayload payload, int images)
    {
        var stories = payload.Stories!;
        var scenes = stories.SelectMany(story => story.Scenes).ToList();
        var chapters = stories.SelectMany(story => story.Chapters!).ToList();
        var arcs = stories.SelectMany(story => story.PlotArcs!).ToList();
        var beats = arcs.SelectMany(arc => arc.Beats).ToList();

        return new BackupPreviewCounts(
            payload.EntityTypes.Count,
            payload.Entities.Count(entity => entity.DeletedAt is null),
            payload.Entities.Count(entity => entity.DeletedAt is not null),
            payload.Entities.Sum(entity => entity.Revisions.Count),
            payload.Entities.Count(entity => entity.Content is not null),
            payload.Entities.Sum(entity => entity.ArticleRevisions!.Count),
            images,
            payload.RelationshipTypes.Count,
            payload.Relationships.Count,
            payload.ChronologyEras!.Count,
            payload.TimelineEntries.Count,
            stories.Count(story => story.DeletedAt is null),
            chapters.Count(chapter => chapter.DeletedAt is null),
            scenes.Count(scene => scene.DeletedAt is null),
            arcs.Count(arc => arc.DeletedAt is null),
            beats.Count(beat => beat.DeletedAt is null),
            scenes.Count(scene => scene.Manuscript is not null),
            scenes.Sum(scene => scene.Manuscript?.Revisions!.Count ?? 0),
            stories.Count(story => story.DeletedAt is not null)
                + chapters.Count(chapter => chapter.DeletedAt is not null)
                + scenes.Count(scene => scene.DeletedAt is not null)
                + arcs.Count(arc => arc.DeletedAt is not null)
                + beats.Count(beat => beat.DeletedAt is not null),
            payload.Ideas!.Count(idea => idea.DeletedAt is null),
            payload.Ideas!.Count(idea => idea.DeletedAt is not null),
            payload.DismissedConflicts.Count,
            payload.WorldRules!.Count(rule => rule.DeletedAt is null),
            payload.WorldRules!.Count(rule => rule.DeletedAt is not null),
            payload.Maps?.Count ?? 0,
            payload.Maps?.Sum(map => map.Pins.Count) ?? 0,
            payload.IdeaBoards?.Count ?? 0);
    }
}

/// <summary>
/// The backup as the author will recognise it. <paramref name="NameAvailable"/> says whether the
/// account could take the backup's own name for the new universe as it stands; the name is chosen
/// again at restore and checked again there.
/// </summary>
public sealed record BackupPreview(
    string UniverseName,
    string? Description,
    string? AccentColor,
    bool IsArchived,
    int FormatVersion,
    DateTime GeneratedAt,
    bool NameAvailable,
    BackupPreviewCounts Counts);

/// <summary>
/// A validated upload, waiting. <paramref name="Token"/> is the only handle on it: unguessable, good
/// for the account that uploaded it and for nobody else, until <paramref name="ExpiresAt"/>.
/// </summary>
public sealed record BackupValidationResponse(string Token, DateTime ExpiresAt, BackupPreview Preview);

/// <summary>The restore itself: which validated upload, and what to call the universe it becomes.</summary>
public sealed record RestoreBackupRequest(string? Token, string? Name);
