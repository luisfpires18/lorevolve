using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Search;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Timeline;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Reading;

/// <summary>
/// The live universe read for something other than a screen: search it, then read what was found - an entry, a story, a
/// scene, a timeline moment, an entry's direct relationships, the timeline in order, an overview (ADR 0045). The assistant
/// reads through it; nothing here knows the assistant exists, so a later reader can use it as it is.
///
/// <b>Built on what the screens already read.</b> Search is the bar's own (<see cref="UniverseSearchEndpoints.RunAsync"/>),
/// the timeline is the timeline's own feed, and an entry, a story, a scene, a moment and an entry's relationships are
/// loaded by their features' own loaders. This class only bounds and flattens what they return; it never decides afresh
/// what is live or how anything is ranked or ordered.
///
/// <b>One universe, already allowed.</b> The caller has proved the universe may be read before calling; every read here
/// names the universe again, so an id from anywhere else - another universe, the Trash, nowhere - is simply not found.
///
/// <b>Live content only, and only content.</b> Nothing in the Trash, no idea (they are an account's own notes), no world
/// rule, comment, suggestion, history, account, image or backup. Every list and every long text is bounded by the
/// constants below.
/// </summary>
public static class UniverseReader
{
    /// <summary>Summaries, notes, descriptions, premises and long field values.</summary>
    public const int TextLength = 600;

    /// <summary>
    /// The start of an entry's article, as plain text. Past it, a reader asks for the passage around the words it is after
    /// (<c>find</c>): the search index's own snippet at its widest, 64 words, wherever in the text they are.
    /// </summary>
    public const int ArticleLength = 1_500;

    /// <summary>The start of a scene's manuscript, read only when asked for.</summary>
    public const int ProseLength = 4_000;

    /// <summary>A scene's summary in a story's outline.</summary>
    public const int OutlineLength = 240;

    /// <summary>The most of any list of mentions: an entry's scenes or moments, a scene's lore, a moment's participants.</summary>
    public const int MentionLimit = 15;

    public const int FieldLimit = 40;

    public const int ChapterLimit = 60;

    public const int SceneLimit = 80;

    public const int ArcLimit = 20;

    public const int BeatLimit = 12;

    public const int RelationshipLimit = 40;

    public const int TimelinePageSize = 25;

    public const int OverviewStoryLimit = 20;

    public const int OverviewTypeLimit = 30;

    public const int OverviewExamplesPerType = 3;

    /// <summary>
    /// The bar's search over this universe, less what a reading never includes: ideas are never searched and world rules
    /// are dropped. Bounded by the search itself - at most <see cref="UniverseSearchEndpoints.ResultsPerKind"/> of each kind.
    /// </summary>
    public static async Task<IReadOnlyList<UniverseSearchResult>> SearchAsync(
        LorEvolveDbContext db,
        Guid universeId,
        string? query,
        CancellationToken cancellationToken)
    {
        var found = await UniverseSearchEndpoints.RunAsync(db, universeId, query, ideasOwnerId: null, cancellationToken);
        return [.. found.Results.Where(result => result.Kind is not (UniverseSearchKind.Idea or UniverseSearchKind.WorldRule))];
    }

    /// <summary>
    /// One live entry of this universe, or null. <paramref name="find"/>, when given, also reads the passage of its article
    /// around those words, read the way the search reads them.
    /// </summary>
    public static async Task<LoreReading?> GetLoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid loreId,
        CancellationToken cancellationToken,
        string? find = null)
    {
        var detail = await EntityEndpoints.LoadDetailAsync(db, universeId, loreId, cancellationToken, liveOnly: true);
        if (detail is null)
        {
            return null;
        }

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        var stored = await db.EntityArticles.AsNoTracking()
            .Where(candidate => candidate.EntityId == loreId)
            .Select(candidate => new { candidate.Content, candidate.Version })
            .FirstOrDefaultAsync(cancellationToken);
        var article = stored?.Content;

        var scenes = await db.Scenes.AsNoTracking()
            .Where(scene => scene.DeletedAt == null
                && scene.Story!.UniverseId == universeId
                && scene.Story.DeletedAt == null
                && (scene.PovEntityId == loreId || scene.EntityLinks.Any(link => link.EntityId == loreId)))
            .OrderBy(scene => scene.Story!.Title)
            .ThenBy(scene => scene.ChapterId == null ? -1 : scene.Chapter!.SortOrder)
            .ThenBy(scene => scene.SortOrder)
            .ThenBy(scene => scene.Id)
            .Select(SceneMentionOf)
            .Take(MentionLimit + 1)
            .ToListAsync(cancellationToken);

        var moments = await TimelineFeed.ReadAsync(
            db, universeId, TimelineSourceKind.Event, null, null, loreId, null, 1, MentionLimit, cancellationToken);

        var relationshipCount = await db.Relationships.CountAsync(
            relationship => relationship.UniverseId == universeId
                && relationship.DeletedAt == null
                && relationship.SourceEntity!.DeletedAt == null
                && relationship.TargetEntity!.DeletedAt == null
                && (relationship.SourceEntityId == loreId || relationship.TargetEntityId == loreId),
            cancellationToken);

        return new LoreReading(
            detail.Id,
            detail.Name,
            detail.EntityTypeName,
            detail.CanonStatus,
            detail.IsArchived,
            ReadingText.Cut(detail.Summary, TextLength),
            detail.Aliases,
            detail.Tags,
            [
                .. detail.Fields
                    .Select(field => FieldText(field, chronology) is { } value
                        ? new FieldReading(field.Name, value, field.Kind == EntityFieldKind.EntityReference ? field.ReferencedEntityId : null)
                        : null)
                    .OfType<FieldReading>()
                    .Take(FieldLimit),
            ],
            ReadingText.Cut(LoreArticleText.Extract(article), ArticleLength),
            [.. scenes.Take(MentionLimit)],
            scenes.Count > MentionLimit,
            [.. moments.Items.Select(item => new MomentMention(item.SourceId, item.Title, ReadingText.Date(chronology, item.Date)))],
            moments.TotalPages > 1,
            relationshipCount,
            await EntitySearchIndex.ArticlePassageAsync(db, loreId, find, cancellationToken),
            detail.Version,
            stored?.Version ?? 0);
    }

    /// <summary>One live story of this universe, or null: its chapters, its scenes in reading order and its plot.</summary>
    public static async Task<StoryReading?> GetStoryAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        CancellationToken cancellationToken)
    {
        var story = await StoryEndpoints.LoadDetailAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return null;
        }

        var chapterNumbers = story.Chapters.ToDictionary(chapter => chapter.Id, chapter => chapter.SortOrder + 1);
        var arcs = await PlotArcEndpoints.LoadArcsAsync(db, universeId, storyId, null, cancellationToken);

        return new StoryReading(
            story.Id,
            story.Title,
            story.Status,
            ReadingText.Cut(story.Premise, TextLength),
            [
                .. story.Chapters.Take(ChapterLimit).Select(chapter => new ChapterReading(
                    chapter.Id,
                    chapter.SortOrder + 1,
                    chapter.Title,
                    ReadingText.Cut(chapter.Summary, OutlineLength))),
            ],
            [
                .. story.Scenes.Take(SceneLimit).Select(scene => new SceneOutline(
                    scene.Id,
                    scene.Title,
                    scene.ChapterId is { } chapter ? chapterNumbers.GetValueOrDefault(chapter) : null,
                    ReadingText.Cut(scene.Summary, OutlineLength))),
            ],
            story.Scenes.Count > SceneLimit,
            [
                .. arcs.Take(ArcLimit).Select(arc => new ArcReading(
                    arc.Id,
                    arc.Title,
                    ReadingText.Cut(arc.Description, OutlineLength),
                    [.. arc.Beats.Take(BeatLimit).Select(beat => new BeatReading(beat.Id, beat.Title, ReadingText.Cut(beat.Description, OutlineLength)))])),
            ]);
    }

    /// <summary>
    /// One live scene of this universe, or null. Its manuscript is read only when <paramref name="includeProse"/> asks, and
    /// then only its start; <paramref name="find"/>, when given, reads the passage of the manuscript around those words.
    /// </summary>
    public static async Task<SceneReading?> GetSceneAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid sceneId,
        bool includeProse,
        CancellationToken cancellationToken,
        string? find = null)
    {
        var place = await db.Scenes.AsNoTracking()
            .Where(scene => scene.Id == sceneId
                && scene.DeletedAt == null
                && scene.Story!.UniverseId == universeId
                && scene.Story.DeletedAt == null)
            .Select(SceneMentionOf)
            .FirstOrDefaultAsync(cancellationToken);

        if (place is null
            || await SceneEndpoints.LoadSceneAsync(db, universeId, place.StoryId, sceneId, cancellationToken) is not { } scene)
        {
            return null;
        }

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        var prose = includeProse
            ? await db.SceneManuscripts.AsNoTracking()
                .Where(manuscript => manuscript.SceneId == sceneId)
                .Select(manuscript => manuscript.Content)
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        return new SceneReading(
            scene.Id,
            scene.Title,
            place.StoryId,
            place.StoryTitle,
            place.ChapterNumber,
            place.ChapterTitle,
            ReadingText.Cut(scene.Summary, TextLength),
            ReadingText.Cut(scene.Notes, TextLength),
            scene.Pov is { IsTrashed: false } pov ? new LoreMention(pov.EntityId, pov.Name, pov.EntityTypeName) : null,
            scene.Chronology is { Year: { } year } date
                ? ReadingText.Point(chronology, year, date.Month, date.Day, date.EraId, date.MonthId)
                : null,
            [
                .. scene.Entities
                    .Where(link => !link.IsTrashed)
                    .Take(MentionLimit)
                    .Select(link => new LoreMention(link.EntityId, link.Name, link.EntityTypeName)),
            ],
            // Mentions read as the names the author wrote (ADR 0058): an assistant reads prose, not markup.
            ReadingText.Cut(prose is null ? null : ManuscriptMentions.Plain(prose), ProseLength),
            await UniverseSearchIndex.ManuscriptPassageAsync(db, sceneId, find, cancellationToken) is { } passage
                ? ManuscriptMentions.PlainExcerpt(passage)
                : null);
    }

    /// <summary>One timeline moment of this universe, or null.</summary>
    public static async Task<TimelineItemReading?> GetTimelineItemAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid momentId,
        CancellationToken cancellationToken)
    {
        var moment = await TimelineEndpoints.LoadAsync(db, universeId, momentId, cancellationToken);
        if (moment is null)
        {
            return null;
        }

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        return new TimelineItemReading(
            moment.Id,
            moment.Title,
            ReadingText.Date(chronology, moment.Date),
            moment.CanonStatus,
            ReadingText.Cut(moment.Description, TextLength),
            [
                .. moment.Entities
                    .Where(link => !link.IsTrashed)
                    .Take(MentionLimit)
                    .Select(link => new LoreMention(link.EntityId, link.Name, link.EntityTypeName)),
            ],
            [.. (moment.Stories ?? []).Where(link => !link.IsTrashed).Select(link => new StoryMention(link.StoryId, link.Title))]);
    }

    /// <summary>
    /// One page of the unified timeline in world order, with the timeline's own filters: words in a moment or scene, an
    /// entry taking part, a story. An id that is not this universe's matches nothing.
    /// </summary>
    public static async Task<TimelineReading> BrowseTimelineAsync(
        LorEvolveDbContext db,
        Guid universeId,
        string? search,
        Guid? loreId,
        Guid? storyId,
        int page,
        CancellationToken cancellationToken)
    {
        var feed = await TimelineFeed.ReadAsync(
            db,
            universeId,
            null,
            storyId,
            null,
            loreId,
            ReadingText.Cut(search, 200),
            page,
            TimelinePageSize,
            cancellationToken);

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        return new TimelineReading(
            [
                .. feed.Items.Select(item => new TimelineLine(
                    item.SourceKind,
                    item.SourceId,
                    item.Title,
                    ReadingText.Date(chronology, item.Date),
                    item.Scene?.StoryId,
                    item.LoreFact?.Fact)),
            ],
            feed.Page,
            feed.TotalPages);
    }

    /// <summary>A live entry's direct relationships, both ends live, read from its side - or null for no such entry.</summary>
    public static async Task<RelationshipsReading?> GetRelationshipsAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid loreId,
        CancellationToken cancellationToken)
    {
        var lore = await db.Entities.AsNoTracking()
            .Where(entity => entity.Id == loreId && entity.UniverseId == universeId && entity.DeletedAt == null)
            .Select(entity => new LoreMention(entity.Id, entity.Name, entity.EntityType!.Name))
            .FirstOrDefaultAsync(cancellationToken);

        if (lore is null)
        {
            return null;
        }

        var links = await RelationshipEndpoints.LoadForEntityAsync(db, universeId, loreId, cancellationToken);

        return new RelationshipsReading(
            lore,
            [
                .. links.Take(RelationshipLimit).Select(link => new RelationshipReading(
                    link.Id,
                    link.Label,
                    new LoreMention(link.RelatedEntityId, link.RelatedEntityName, link.RelatedEntityTypeName),
                    link.CanonStatus,
                    ReadingText.Cut(link.Notes, TextLength))),
            ],
            links.Count > RelationshipLimit);
    }

    /// <summary>
    /// What the universe holds, bounded: its name and description, its stories, how many entries of each type there are
    /// with a few recently worked on, and how many timeline moments. Archived entries are left out, as the Lore listing
    /// leaves them out.
    /// </summary>
    public static async Task<UniverseOverview?> GetOverviewAsync(
        LorEvolveDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var universe = await db.Universes.AsNoTracking()
            .Where(candidate => candidate.Id == universeId)
            .Select(candidate => new { candidate.Name, candidate.Description })
            .FirstOrDefaultAsync(cancellationToken);

        if (universe is null)
        {
            return null;
        }

        var stories = await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == universeId && story.DeletedAt == null)
            .OrderBy(story => story.Title)
            .ThenBy(story => story.Id)
            .Take(OverviewStoryLimit)
            .Select(story => new { story.Id, story.Title, story.Status, story.Premise })
            .ToListAsync(cancellationToken);

        var live = db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && entity.DeletedAt == null && !entity.IsArchived);

        var counts = await live
            .GroupBy(entity => entity.EntityType!.Name)
            .Select(group => new { TypeName = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        // ponytail: "recently worked on" stands in for importance, which nothing records; one bounded read, grouped here.
        var recent = await live
            .OrderByDescending(entity => entity.UpdatedAt)
            .ThenBy(entity => entity.Id)
            .Take(OverviewTypeLimit * OverviewExamplesPerType)
            .Select(entity => new LoreMention(entity.Id, entity.Name, entity.EntityType!.Name))
            .ToListAsync(cancellationToken);

        var examples = recent.ToLookup(entity => entity.TypeName);
        var moments = await db.TimelineEntries.CountAsync(entry => entry.UniverseId == universeId && entry.DeletedAt == null, cancellationToken);

        return new UniverseOverview(
            universe.Name,
            ReadingText.Cut(universe.Description, TextLength),
            [.. stories.Select(story => new StoryOutline(story.Id, story.Title, story.Status, ReadingText.Cut(story.Premise, OutlineLength)))],
            [
                .. counts
                    .OrderByDescending(type => type.Count)
                    .ThenBy(type => type.TypeName, StringComparer.Ordinal)
                    .Take(OverviewTypeLimit)
                    .Select(type => new LoreTypeCount(type.TypeName, type.Count, [.. examples[type.TypeName].Take(OverviewExamplesPerType)])),
            ],
            moments);
    }

    /// <summary>A scene and where it sits. A chapter in the Trash holds no live scene (ADR 0029), but only a live one is named.</summary>
    private static readonly System.Linq.Expressions.Expression<Func<Scene, SceneMention>> SceneMentionOf =
        scene => new SceneMention(
            scene.Id,
            scene.Title,
            scene.StoryId,
            scene.Story!.Title,
            scene.Chapter != null && scene.Chapter.DeletedAt == null ? scene.Chapter.SortOrder + 1 : null,
            scene.Chapter != null && scene.Chapter.DeletedAt == null ? scene.Chapter.Title : null);

    /// <summary>A recorded value as text, or null when there is nothing to say - including a reference to an entry in the Trash.</summary>
    private static string? FieldText(FieldValueResponse field, UniverseChronology chronology) => field.Kind switch
    {
        EntityFieldKind.ShortText or EntityFieldKind.LongText => ReadingText.Cut(field.Text, TextLength),
        EntityFieldKind.Number => field.Number is { } number ? chronology.FormatYear(field.EraId, number) : null,
        EntityFieldKind.Boolean => field.Boolean is { } flag ? (flag ? "Yes" : "No") : null,
        EntityFieldKind.Date => field.Date?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
        EntityFieldKind.Select or EntityFieldKind.MultiSelect => field.OptionValues.Count > 0 ? string.Join(", ", field.OptionValues) : null,
        EntityFieldKind.EntityReference => field.ReferencedEntityIsTrashed ? null : field.ReferencedEntityName,
        _ => null,
    };
}
