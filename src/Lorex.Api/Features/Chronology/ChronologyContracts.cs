namespace Lorex.Api.Features.Chronology;

/// <summary>
/// A universe's whole reckoning, written in one request. The eras' order is the order of the
/// list - earliest first - so reordering, renaming, adding and removing are one atomic change
/// rather than a sequence of half-configured states.
///
/// An empty list is the plain reckoning of signed years.
/// </summary>
public sealed record ChronologyRequest(IReadOnlyList<ChronologyEraRequest>? Eras);

/// <summary>
/// One era as the author wants it. <paramref name="Id"/> is null for a new era and otherwise
/// must name an era this universe already has; an era left out of the list is removed.
/// </summary>
public sealed record ChronologyEraRequest(
    Guid? Id,
    string? Name,
    string? Abbreviation,
    ChronologyEraDirection Direction,
    ChronologyLabelPosition LabelPosition);

/// <summary>
/// One era, with how much is dated in it. <paramref name="MomentCount"/> counts timeline
/// entries that start or end in it, <paramref name="YearCount"/> counts years on entries, the
/// Trash included, and <paramref name="SceneCount"/> counts story scenes placed in it - any of
/// them keeps the era from being removed. <paramref name="EntryEraCount"/> counts entries' eras that start or end in it (Issue
/// #41); <paramref name="YearCount"/> includes the years those eras' overrides hold.
/// </summary>
public sealed record ChronologyEraResponse(
    Guid Id,
    string Name,
    string? Abbreviation,
    int SortOrder,
    ChronologyEraDirection Direction,
    ChronologyLabelPosition LabelPosition,
    int MomentCount,
    int YearCount,
    int SceneCount,
    int EntryEraCount = 0);

/// <summary>
/// One point on a universe's line that is not a timeline moment: the era its year is counted in -
/// null on the plain reckoning - the year, and optionally a month and a day.
///
/// A scene carries one (ADR 0024). It is a position and nothing more: no date kind, no range and
/// no free-text era label, which are what a timeline moment claims about itself. Null as a whole
/// means the record is not placed in time, which is ordinary. It is validated by
/// <see cref="ChronologyPointValidation.ValidatePoint"/> and compared, where anything compares it,
/// as a <see cref="ChronologyPoint"/>.
///
/// <paramref name="Month"/> is the numeric month on simple dates; <paramref name="MonthId"/> is the custom calendar's
/// month on a universe that has one. Never both.
/// </summary>
public sealed record ChronologyValue(Guid? EraId, int? Year, int? Month, int? Day, Guid? MonthId = null);

/// <summary>
/// The reckoning, earliest era first.
///
/// <paramref name="UnplacedMomentCount"/> and <paramref name="UnplacedYearCount"/> count dated
/// timeline entries, and declared birth and death years, that carry no era. On a universe that
/// names eras those are written in no era at all - usually because they predate the eras - and
/// they stay off the line until the author says which era they belong to. Lorex never guesses.
/// </summary>
public sealed record ChronologyResponse(
    IReadOnlyList<ChronologyEraResponse> Eras,
    int UnplacedMomentCount,
    int UnplacedYearCount,
    ChronologyCalendarResponse? Calendar = null);

/// <summary>
/// A custom calendar, written whole: every month in the order of the year, earliest first. Saving it with no calendar yet
/// turns custom dates on and converts every simple date (month N becomes the month at position N); saving it again renames,
/// reorders, adds, removes and resizes months in one atomic change. A month with an id must be one of this calendar's; a
/// month left out is removed.
/// </summary>
public sealed record ChronologyCalendarRequest(IReadOnlyList<ChronologyCalendarMonthRequest>? Months);

public sealed record ChronologyCalendarMonthRequest(Guid? Id, string? Name, string? Abbreviation, int DayCount);

/// <summary>The universe's custom calendar, or null on the chronology response for simple dates.</summary>
public sealed record ChronologyCalendarResponse(Guid Id, IReadOnlyList<ChronologyCalendarMonthResponse> Months);

/// <summary>
/// One month, in order. <paramref name="UseCount"/> counts timeline moments that start or end in it and scenes dated in
/// it, the Trash included - any keeps it from being removed. <paramref name="MaxDayUsed"/> is the latest day any of them
/// uses, or null, so the month cannot be shortened below it.
/// </summary>
public sealed record ChronologyCalendarMonthResponse(
    Guid Id,
    string Name,
    string? Abbreviation,
    int SortOrder,
    int DayCount,
    int UseCount,
    int? MaxDayUsed);
