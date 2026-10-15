using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;

namespace Lorex.Api.Features.Reading;

// What UniverseReader hands back: bounded, plain shapes of the live universe. Every text that can grow is already cut to
// its limit (UniverseReader's constants), every date is already written the way this universe writes it, and nothing
// carries an image, a route, an account or anything from the Trash. Ids are the content's own, for following one reading
// to the next.

/// <summary>An entry named from somewhere else - a scene's lore, a moment's participant, a relationship's other end.</summary>
public sealed record LoreMention(Guid Id, string Name, string TypeName);

/// <summary>A story named from somewhere else.</summary>
public sealed record StoryMention(Guid Id, string Title);

/// <summary>A scene named from somewhere else, with where it sits: its story and, when it has one, its chapter.</summary>
public sealed record SceneMention(
    Guid Id,
    string Title,
    Guid StoryId,
    string StoryTitle,
    int? ChapterNumber,
    string? ChapterTitle);

/// <summary>A timeline moment named from somewhere else, with its date as this universe writes it.</summary>
public sealed record MomentMention(Guid Id, string Title, string Date);

/// <summary>
/// One recorded field value, written out as text: a year in its date period, a date as numbers, options joined. An entry
/// reference also carries the entry's id; a reference to an entry in the Trash is left out.
/// </summary>
public sealed record FieldReading(string Name, string Value, Guid? LoreId);

/// <summary>
/// One live entry. <paramref name="Article"/> is the start of its article as plain text, cut to
/// <see cref="UniverseReader.ArticleLength"/>. <paramref name="Scenes"/> are live scenes that link it or are told from its
/// point of view, and <paramref name="Moments"/> the timeline moments it takes part in, each list bounded; the
/// <c>More</c> flags say a list was cut. Relationships are read on their own (<see cref="RelationshipsReading"/>).
/// <paramref name="ArticlePassage"/> is the passage of the article around words asked for - wherever in the article they
/// are - or null when none were asked for or the article does not hold them.
/// </summary>
public sealed record LoreReading(
    Guid Id,
    string Name,
    string TypeName,
    CanonStatus CanonStatus,
    bool IsArchived,
    string? Summary,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    IReadOnlyList<FieldReading> Fields,
    string? Article,
    IReadOnlyList<SceneMention> Scenes,
    bool MoreScenes,
    IReadOnlyList<MomentMention> Moments,
    bool MoreMoments,
    int RelationshipCount,
    string? ArticlePassage = null);

/// <summary>A chapter of a story, numbered from 1 in the story's order.</summary>
public sealed record ChapterReading(Guid Id, int Number, string Title, string? Summary);

/// <summary>A scene in a story's outline: its chapter by number (null when unchaptered) and its summary, cut short.</summary>
public sealed record SceneOutline(Guid Id, string Title, int? ChapterNumber, string? Summary);

/// <summary>A plot beat, by title and a short description.</summary>
public sealed record BeatReading(Guid Id, string Title, string? Description);

/// <summary>A plot arc with its first beats.</summary>
public sealed record ArcReading(Guid Id, string Title, string? Description, IReadOnlyList<BeatReading> Beats);

/// <summary>
/// One live story: its premise, its chapters, its scenes in reading order and its plot, each bounded. Never a word of
/// manuscript prose: that is a scene's, and only when asked for.
/// </summary>
public sealed record StoryReading(
    Guid Id,
    string Title,
    StoryStatus Status,
    string? Premise,
    IReadOnlyList<ChapterReading> Chapters,
    IReadOnlyList<SceneOutline> Scenes,
    bool MoreScenes,
    IReadOnlyList<ArcReading> Arcs);

/// <summary>
/// One live scene. <paramref name="Date"/> is its world date as this universe writes it, or null. <paramref name="Prose"/>
/// is the start of its manuscript, only when it was asked for, cut to <see cref="UniverseReader.ProseLength"/>.
/// <paramref name="ProsePassage"/> is the passage of the manuscript around words asked for, wherever they are in it.
/// </summary>
public sealed record SceneReading(
    Guid Id,
    string Title,
    Guid StoryId,
    string StoryTitle,
    int? ChapterNumber,
    string? ChapterTitle,
    string? Summary,
    string? Notes,
    LoreMention? PointOfView,
    string? Date,
    IReadOnlyList<LoreMention> Lore,
    string? Prose,
    string? ProsePassage = null);

/// <summary>One timeline moment: what happened, when, who took part and which stories it matters to. Only live ones are named.</summary>
public sealed record TimelineItemReading(
    Guid Id,
    string Title,
    string Date,
    CanonStatus CanonStatus,
    string? Description,
    IReadOnlyList<LoreMention> Participants,
    IReadOnlyList<StoryMention> Stories);

/// <summary>
/// One line of the unified timeline, in world order. <paramref name="Id"/> is the source's own: a moment's, a scene's
/// (with <paramref name="StoryId"/>), or for a birth or death year the entry's - with <paramref name="Title"/> the entry's
/// name and <paramref name="Fact"/> which year it is.
/// </summary>
public sealed record TimelineLine(
    TimelineSourceKind Kind,
    Guid Id,
    string Title,
    string Date,
    Guid? StoryId,
    EntityFieldSemantic? Fact);

/// <summary>One page of the timeline, as the timeline's own feed orders and filters it.</summary>
public sealed record TimelineReading(IReadOnlyList<TimelineLine> Items, int Page, int TotalPages);

/// <summary>
/// One direct relationship, read from the entry's side: "<c>Arin</c> <paramref name="Label"/> <c>Ren</c>". Only links whose
/// two ends are both live.
/// </summary>
public sealed record RelationshipReading(Guid Id, string Label, LoreMention Related, CanonStatus CanonStatus, string? Notes);

/// <summary>An entry's direct relationships, bounded; <paramref name="More"/> says the list was cut. Never a second step out.</summary>
public sealed record RelationshipsReading(LoreMention Lore, IReadOnlyList<RelationshipReading> Relationships, bool More);

/// <summary>How many live entries of one type there are, with a few of the most recently worked on.</summary>
public sealed record LoreTypeCount(string TypeName, int Count, IReadOnlyList<LoreMention> Examples);

/// <summary>A story in the overview, by title, status and a short premise.</summary>
public sealed record StoryOutline(Guid Id, string Title, StoryStatus Status, string? Premise);

/// <summary>A bounded overview of the whole universe: what it is called, its stories, its kinds of lore, its timeline's size.</summary>
public sealed record UniverseOverview(
    string Name,
    string? Description,
    IReadOnlyList<StoryOutline> Stories,
    IReadOnlyList<LoreTypeCount> LoreTypes,
    int TimelineMomentCount);
