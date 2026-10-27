using System.Globalization;
using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Chronology;

/// <summary>
/// One universe's reckoning, loaded once and read by everything that places a year: the
/// timeline's validation, the birth and death years on entries, and the chronology rules.
///
/// A universe with no eras is the plain reckoning LorEvolve has always had - signed years on one
/// line, formatted as the number. There is no stored "mode": the eras are the configuration, so
/// a universe cannot be "custom with nothing configured" or "plain with eras lying around".
/// </summary>
public sealed class UniverseChronology
{
    private readonly Dictionary<Guid, ChronologyEra> _byId;
    private readonly Dictionary<Guid, ChronologyCalendarMonth> _monthsById;

    private UniverseChronology(IReadOnlyList<ChronologyEra> eras, IReadOnlyList<ChronologyCalendarMonth>? months)
    {
        Eras = eras;
        Months = months;
        _byId = eras.ToDictionary(era => era.Id);
        _monthsById = months?.ToDictionary(month => month.Id) ?? [];
    }

    /// <summary>The plain reckoning: no eras, signed years, simple dates.</summary>
    public static UniverseChronology Plain { get; } = new([], null);

    /// <summary>In order, earliest era first.</summary>
    public IReadOnlyList<ChronologyEra> Eras { get; }

    /// <summary>
    /// The custom calendar's months in order, earliest first, or null on simple dates. A calendar always has at least one
    /// month, so null and empty never mean the same thing.
    /// </summary>
    public IReadOnlyList<ChronologyCalendarMonth>? Months { get; }

    /// <summary>True once the author has named at least one era.</summary>
    public bool NamesEras => Eras.Count > 0;

    /// <summary>True when the universe divides its years with a custom calendar rather than simple numeric months.</summary>
    public bool HasCalendar => Months is not null;

    public static UniverseChronology Of(
        IEnumerable<ChronologyEra> eras,
        IEnumerable<ChronologyCalendarMonth>? months = null) =>
        new(
            [.. eras.OrderBy(era => era.SortOrder).ThenBy(era => era.Id)],
            months is null ? null : [.. months.OrderBy(month => month.SortOrder).ThenBy(month => month.Id)]);

    /// <summary>The eras and, when there is one, the calendar's months: two queries.</summary>
    public static async Task<UniverseChronology> LoadAsync(
        LorEvolveDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var eras = await db.ChronologyEras.AsNoTracking()
            .Where(era => era.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        // A calendar is never saved without a month, so no months read means no calendar.
        var months = await db.ChronologyCalendarMonths.AsNoTracking()
            .Where(month => month.Calendar!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        return Of(eras, months.Count == 0 ? null : months);
    }

    /// <summary>The era with this id in this universe, or null - including for an id from anywhere else.</summary>
    public ChronologyEra? Era(Guid? eraId) =>
        eraId is { } id && _byId.TryGetValue(id, out var era) ? era : null;

    /// <summary>The calendar month with this id in this universe, or null - including for an id from anywhere else.</summary>
    public ChronologyCalendarMonth? Month(Guid? monthId) =>
        monthId is { } id && _monthsById.TryGetValue(id, out var month) ? month : null;

    /// <summary>
    /// Where a stored point sits on this universe's line, or null when it cannot be placed.
    ///
    /// A plain year places only on a universe with no eras. Once eras exist, a year without one
    /// - written before the author named them - is not on the line at all: reading it as a year
    /// in some era would be inventing which one.
    ///
    /// The month is the numeric one on simple dates, or the custom month's rank in the calendar's current order - resolved
    /// here, by id, never by name or position stored on the date. A month id this calendar does not hold cannot be placed.
    /// </summary>
    public ChronologyPoint? Point(Guid? eraId, double? year, int? month = null, int? day = null, Guid? monthId = null)
    {
        if (year is not { } value)
        {
            return null;
        }

        if (monthId is not null)
        {
            if (Month(monthId) is not { } custom)
            {
                return null;
            }

            month = ChronologyPoint.MonthRank(custom);
        }

        if (!NamesEras)
        {
            return eraId is null ? ChronologyPoint.Plain(value, month, day) : null;
        }

        return Era(eraId) is { } era ? ChronologyPoint.InEra(era, value, month, day) : null;
    }

    /// <summary>
    /// How many years lie between two years on this universe's line, or null when this reckoning
    /// cannot say. Order does not matter; the answer is never negative.
    ///
    /// Year level only. Month and day are ignored, because a distance between two bare years is all
    /// anything that asks for one has.
    ///
    /// <list type="bullet">
    /// <item>On one stretch of the line - the plain reckoning, or two years in the same era - it is the
    /// difference of the direction-signed years: AF 2 to AF 20 is 18, BF 20 to BF 10 is 10, -5 to 5
    /// is 10.</item>
    /// <item>Across the boundary from an era that counts down into the very next era, when that one
    /// counts up, it is known as well. The earlier era ends at its year 1 and the later begins at its
    /// year 1, with no year 0 between them (ADR 0022), so BF 1 to AF 1 is 1 and BF 5 to AF 5 is 9.</item>
    /// <item>Anything else is unknown. An era that counts up stores no last year, and one that counts
    /// down stores no first year, so any span that has to pass the end of an ascending era or the
    /// start of a descending one has a stretch of unrecorded length inside it. That includes every
    /// span across a third era. LorEvolve does not invent the length.</item>
    /// </list>
    ///
    /// Both points must have been placed by this chronology.
    /// </summary>
    public double? YearsBetween(ChronologyPoint first, ChronologyPoint second)
    {
        var (earlier, later) = first.YearOnly <= second.YearOnly ? (first, second) : (second, first);

        if (earlier.EraRank == later.EraRank)
        {
            return later.Year - earlier.Year;
        }

        if (later.EraRank != earlier.EraRank + 1
            || EraRanked(earlier.EraRank) is not { Direction: ChronologyEraDirection.Descending }
            || EraRanked(later.EraRank) is not { Direction: ChronologyEraDirection.Ascending })
        {
            return null;
        }

        // Year a of the earlier era is stored as -a and year b of the later as b. From a down to 1
        // is a - 1 years, the step from 1 into 1 is one more, and on up to b is b - 1: a + b - 1.
        return later.Year - earlier.Year - 1;
    }

    private ChronologyEra? EraRanked(int rank) => Eras.FirstOrDefault(era => era.SortOrder == rank);

    /// <summary>
    /// A year the way the author reads it: "3441", "-42", "BF 10", "10 Third Age". The same rule
    /// the web client's formatter follows. A whole year never comes back as "3441.0".
    /// </summary>
    public string FormatYear(Guid? eraId, double year)
    {
        var number = year.ToString("0.####", CultureInfo.InvariantCulture);

        if (Era(eraId) is not { } era)
        {
            return number;
        }

        var label = Label(era);
        return era.LabelPosition == ChronologyLabelPosition.AfterYear ? $"{number} {label}" : $"{label} {number}";
    }

    /// <summary>What is written beside a year: the short label, or the name when there is none.</summary>
    public static string Label(ChronologyEra era) => era.Abbreviation ?? era.Name;
}
