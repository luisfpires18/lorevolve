using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Features.Chronology;

/// <summary>
/// Which way an era's years run. Configured by the author, never read out of the era's name:
/// an era called "Before the Fall" counts down only because someone said it does, and a
/// language with no word for "before" loses nothing.
/// </summary>
public enum ChronologyEraDirection
{
    /// <summary>Years count up from 1, so year 1 is the era's earliest: "AF 1, AF 2, AF 3".</summary>
    Ascending = 0,

    /// <summary>
    /// Years count down to 1, so year 1 is the era's latest - the one nearest whatever era comes
    /// next: "BF 3, BF 2, BF 1".
    /// </summary>
    Descending = 1,
}

/// <summary>Where an era's label is written beside a year. Display only; it never orders anything.</summary>
public enum ChronologyLabelPosition
{
    /// <summary>"BF 10".</summary>
    BeforeYear = 0,

    /// <summary>"10 BF".</summary>
    AfterYear = 1,
}

/// <summary>
/// One era of a universe's reckoning: a named stretch of time with a place in the order and a
/// direction its years run in.
///
/// Eras are the universe's configuration, not labels on the records that use them. A timeline
/// entry or a birth year points at an era by id, so renaming "After the Fall" rewords every
/// date written in it and moves none of them, and two eras can never be confused because they
/// happen to share a name.
///
/// A universe with no eras keeps plain signed years, exactly as LorEvolve always has. See
/// <c>docs/architecture/decisions/0022-universe-chronology.md</c>.
/// </summary>
public sealed class ChronologyEra
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>"Before the Fall". Unique within the universe, ignoring case.</summary>
    public required string Name { get; set; }

    /// <summary>"BF", or null to write the full name beside a year instead.</summary>
    public string? Abbreviation { get; set; }

    /// <summary>
    /// The era's place in the order, 0 first. Contiguous and unique per universe: the one route
    /// that writes it assigns it from the position the author put the era in.
    /// </summary>
    public int SortOrder { get; set; }

    public ChronologyEraDirection Direction { get; set; }

    public ChronologyLabelPosition LabelPosition { get; set; }
}

/// <summary>
/// How a universe's year is divided into months and days, when its author says so. A universe with no calendar row keeps
/// simple dates: a numeric month and day, as LorEvolve always has. One calendar per universe in V1 (a unique key), but a real
/// entity rather than columns on the universe, so a second calendar later is an added row, not a new model.
///
/// Orthogonal to the eras: an era says which named stretch of history a year is counted in, the calendar says how any year
/// is split. The one calendar applies across every era. No weekdays, leap rules or intercalary days in V1.
/// </summary>
public sealed class ChronologyCalendar
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public ICollection<ChronologyCalendarMonth> Months { get; } = [];
}

/// <summary>
/// One month of a custom calendar. A date names it by id, never by position or name, so renaming it rewords every date in
/// it and reordering it moves those dates with it; neither rewrites a date.
/// </summary>
public sealed class ChronologyCalendarMonth
{
    public Guid Id { get; set; }

    public Guid CalendarId { get; set; }

    public ChronologyCalendar? Calendar { get; set; }

    /// <summary>"Frostwane". Unique within the calendar, ignoring case.</summary>
    public required string Name { get; set; }

    /// <summary>"Frw", or null.</summary>
    public string? Abbreviation { get; set; }

    /// <summary>The month's place in the year, 0 first, contiguous. A date's month rank is this plus one.</summary>
    public int SortOrder { get; set; }

    /// <summary>How many days it has. Any positive number up to a protective bound; nothing Earth-like is assumed.</summary>
    public int DayCount { get; set; }
}
