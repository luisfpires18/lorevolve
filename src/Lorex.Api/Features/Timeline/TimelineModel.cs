using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Timeline;

/// <summary>
/// How much a timeline entry actually claims about when something happened. The kind
/// decides which date components may be filled in, not how they are formatted.
/// </summary>
public enum TimelineDateKind
{
    /// <summary>A single point the author is sure of. Start only.</summary>
    Exact = 0,

    /// <summary>A single point the author is only roughly sure of. Start only.</summary>
    Approximate = 1,

    /// <summary>A span. Start and end are both required.</summary>
    Range = 2,

    /// <summary>The entry is placed in the story but not in time. No components at all.</summary>
    Unknown = 3,
}

/// <summary>How far down a date is specified. Derived, never stored.</summary>
public enum TimelineDatePrecision
{
    /// <summary>No year, so nothing to show.</summary>
    None = 0,

    Year = 1,
    Month = 2,
    Day = 3,
}

/// <summary>
/// One chronology record inside a universe: "Year 3018 - Frodo leaves the Shire".
///
/// A timeline entry is deliberately not a <see cref="LoreEntity"/>. It is a moment, not a
/// thing in the world, and it may reference any number of entities without any of them
/// having to exist. An Event entity may point at an entry, but participation never
/// requires one.
///
/// The date is held as plain signed integers rather than <see cref="DateTime"/>, because
/// fictional calendars are not Gregorian and years may run negative or past any real
/// range. See <c>docs/architecture/decisions/0009-fictional-chronology.md</c>.
/// </summary>
public sealed class TimelineEntry
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Title { get; set; }

    public string? Description { get; set; }

    public CanonStatus CanonStatus { get; set; }

    public TimelineDateKind DateKind { get; set; }

    /// <summary>Signed: a fictional calendar may count down to its own year zero.</summary>
    public int? StartYear { get; set; }

    /// <summary>1-12 when given, on simple dates only. Optional: a year on its own is a valid claim.</summary>
    public int? StartMonth { get; set; }

    /// <summary>
    /// The custom calendar's month, by id, on a universe that has one; null on simple dates, where <see cref="StartMonth"/>
    /// says the month. Never both. An id, so renaming or reordering the month moves the date with it and rewrites nothing.
    /// </summary>
    public Guid? StartMonthId { get; set; }

    public ChronologyCalendarMonth? StartCalendarMonth { get; set; }

    /// <summary>1-31 on simple dates, 1 to the month's length on a custom calendar. Requires a month.</summary>
    public int? StartDay { get; set; }

    public int? EndYear { get; set; }

    public int? EndMonth { get; set; }

    public Guid? EndMonthId { get; set; }

    public ChronologyCalendarMonth? EndCalendarMonth { get; set; }

    public int? EndDay { get; set; }

    /// <summary>
    /// The era the start year is counted in, on a universe that names its eras; null on one
    /// that keeps plain signed years. An id, never a name, so renaming the era moves nothing.
    /// See <c>docs/architecture/decisions/0022-universe-chronology.md</c>.
    /// </summary>
    public Guid? StartEraId { get; set; }

    public ChronologyEra? StartEra { get; set; }

    /// <summary>The era the end year is counted in. A range may start in one era and end in another.</summary>
    public Guid? EndEraId { get; set; }

    public ChronologyEra? EndEra { get; set; }

    /// <summary>
    /// A free-text label for the plain reckoning: "Third Age", "AC". Display metadata only - it
    /// takes no part in any order. A universe that names its eras uses <see cref="StartEraId"/>
    /// instead and refuses a label, so a moment never carries two competing ideas of its era.
    /// </summary>
    public string? EraLabel { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// When the moment was moved to the Trash, or null while it is live (ADR 0048). Only the marker moves: its participants,
    /// stories and details stay stored and come back with a restore. A moment in the Trash is on no timeline, in no Canon rule
    /// and in no world rule's count. Not a query filter, for the reason <see cref="LoreEntity.DeletedAt"/> gives: every read
    /// says which it wants.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    public ICollection<TimelineEntryLink> EntityLinks { get; } = [];

    /// <summary>
    /// The stories this moment matters to, chosen by the author. A relation, never a copy: the moment stays one moment however
    /// many stories it is linked to, and a story's timeline is the universe's timeline narrowed to it.
    /// </summary>
    public ICollection<TimelineEntryStory> StoryLinks { get; } = [];

    /// <summary>
    /// The optional structured details world rule checks read - event kind, method, participant - or null for an ordinary
    /// moment (ADR 0034). Separate from <see cref="EntityLinks"/>: an entry taking part is not the check's participant unless
    /// the author chose it there too.
    /// </summary>
    public TimelineEntryValidation? Validation { get; set; }
}

/// <summary>
/// One entity taking part in one timeline entry. A relational row per link, never a JSON
/// list of ids, so the join is queryable and the foreign keys are real.
/// </summary>
public sealed class TimelineEntryLink
{
    public Guid TimelineEntryId { get; set; }

    public TimelineEntry? TimelineEntry { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }
}

/// <summary>
/// One story one timeline moment matters to. A relational row per pair, as a participant is. Putting the story in the Trash
/// keeps the row, so a restore brings the relevance back; only a story gone for good takes the row with it.
/// </summary>
public sealed class TimelineEntryStory
{
    public Guid TimelineEntryId { get; set; }

    public TimelineEntry? TimelineEntry { get; set; }

    public Guid StoryId { get; set; }

    public Story? Story { get; set; }
}
