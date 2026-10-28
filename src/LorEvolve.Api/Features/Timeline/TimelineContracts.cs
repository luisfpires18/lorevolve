using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.RuleValidation;

namespace LorEvolve.Api.Features.Timeline;

/// <summary>
/// Everything a client may set on a timeline entry. Explicit, so nothing else on the
/// stored row - ownership, timestamps, the universe - can be reached by posting extra
/// fields.
///
/// <paramref name="StartEraId"/> and <paramref name="EndEraId"/> say which of the universe's
/// eras each year is counted in. A universe that names eras requires them on every dated
/// moment and refuses <paramref name="EraLabel"/>; one that does not refuses them and keeps
/// plain signed years with an optional label, exactly as before eras existed.
///
/// <paramref name="Validation"/> is the moment's optional structured details for world rule checks (ADR 0034). Left out, a save
/// keeps what is stored; all three parts absent removes them. An ordinary moment never needs them.
///
/// <paramref name="StoryIds"/> are the stories this moment matters to, each a story of this universe. The same rule as the
/// details: left out (null), a create links none and an update keeps what is stored, so a client that knows nothing of
/// stories cannot erase them; a list, empty included, is the whole set. A story already linked and since put in the Trash
/// may be sent back and stays linked; a story in the Trash cannot be newly linked.
///
/// <paramref name="StartMonthId"/> and <paramref name="EndMonthId"/> are the custom calendar's months, on a universe that has
/// one, in place of <paramref name="StartMonth"/> and <paramref name="EndMonth"/>.
/// </summary>
public sealed record TimelineEntryRequest(
    string? Title,
    string? Description,
    CanonStatus CanonStatus,
    TimelineDateKind DateKind,
    int? StartYear,
    int? StartMonth,
    int? StartDay,
    int? EndYear,
    int? EndMonth,
    int? EndDay,
    string? EraLabel,
    IReadOnlyList<Guid>? EntityIds,
    Guid? StartEraId = null,
    Guid? EndEraId = null,
    TimelineValidationRequest? Validation = null,
    IReadOnlyList<Guid>? StoryIds = null,
    Guid? StartMonthId = null,
    Guid? EndMonthId = null);

/// <summary>
/// The chronology of one entry, already normalized. The components come back as numbers
/// and the precision as an enum, so a client formats the date it wants without ever
/// parsing a string back into parts. The eras come back as ids, formatted by the client
/// from the universe's own chronology. A custom calendar's months come back as ids too, named by the client from the
/// same chronology read.
/// </summary>
public sealed record TimelineDate(
    TimelineDateKind Kind,
    int? StartYear,
    int? StartMonth,
    int? StartDay,
    int? EndYear,
    int? EndMonth,
    int? EndDay,
    string? EraLabel,
    TimelineDatePrecision StartPrecision,
    TimelineDatePrecision EndPrecision,
    Guid? StartEraId,
    Guid? EndEraId,
    Guid? StartMonthId = null,
    Guid? EndMonthId = null);

/// <summary>
/// One entity taking part, resolved enough to render without a second request.
///
/// <paramref name="IsTrashed"/> says the participant is currently in the Trash. It is still
/// reported, deliberately: the client sends a moment's whole participant set back on every
/// save, so dropping it from the response would delete the participation the next time the
/// author edited the moment's date. The client shows it as unavailable and does not link it.
/// </summary>
public sealed record TimelineEntityLink(
    Guid EntityId,
    string Name,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    CanonStatus CanonStatus,
    bool IsTrashed);

/// <summary>
/// One story a moment is linked to. <paramref name="IsTrashed"/> says the story is in the Trash: the link is kept and sent
/// back on every save, as a trashed participant is, and shown as unavailable rather than dropped.
/// </summary>
public sealed record TimelineStoryLink(Guid StoryId, string Title, bool IsTrashed);

/// <summary>
/// One moment. <paramref name="Validation"/> is its structured details for world rule checks, or null for the ordinary moment that
/// has none (ADR 0034). <paramref name="Stories"/> are the stories it is linked to, by title.
/// </summary>
public sealed record TimelineEntryResponse(
    Guid Id,
    string Title,
    string? Description,
    CanonStatus CanonStatus,
    TimelineDate Date,
    IReadOnlyList<TimelineEntityLink> Entities,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    TimelineValidationResponse? Validation = null,
    IReadOnlyList<TimelineStoryLink>? Stories = null);

public sealed record TimelineEntryPage(
    IReadOnlyList<TimelineEntryResponse> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>
/// Where an item on the unified timeline comes from. Only <see cref="Event"/> is stored as a timeline row; the other two are
/// read from their source on every request and are never copied.
/// </summary>
public enum TimelineSourceKind
{
    /// <summary>A moment written on the timeline itself, edited there.</summary>
    Event = 0,

    /// <summary>A live scene with a world date. The scene is the source; its date is edited on the scene.</summary>
    Scene = 1,

    /// <summary>A live entry's birth or death year. The entry's field is the source; it is edited on the entry.</summary>
    LoreFact = 2,
}

/// <summary>
/// A scene's place in its story, read live: its story, its chapter by position (null when Unchaptered), and the first live
/// beat that names it with how many do, so the Plot can be opened at it. Never its prose, and never its narrative order as a
/// date.
/// </summary>
public sealed record TimelineSceneSource(
    Guid StoryId,
    string StoryTitle,
    Guid? ChapterId,
    int? ChapterNumber,
    string? ChapterTitle,
    Guid? PlotBeatId,
    int PlotBeatCount);

/// <summary>
/// An entry's birth or death year, read live from the entry. <paramref name="CanonStatus"/> is the entry's own; a fact has no
/// status of its own.
/// </summary>
public sealed record TimelineLoreFactSource(
    Guid EntityId,
    EntityFieldSemantic Fact,
    CanonStatus CanonStatus,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor);

/// <summary>
/// One item of the unified timeline. <paramref name="SourceKind"/> and <paramref name="SourceId"/> together identify it:
/// ids of different sources are never compared. Exactly one of <paramref name="Event"/>, <paramref name="Scene"/> and
/// <paramref name="LoreFact"/> is set, matching the kind. <paramref name="Title"/> is the moment's or scene's title, or the
/// entry's name for a fact.
/// </summary>
public sealed record TimelineItem(
    TimelineSourceKind SourceKind,
    Guid SourceId,
    string Title,
    TimelineDate Date,
    TimelineEntryResponse? Event,
    TimelineSceneSource? Scene,
    TimelineLoreFactSource? LoreFact);

public sealed record TimelineItemPage(
    IReadOnlyList<TimelineItem> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
