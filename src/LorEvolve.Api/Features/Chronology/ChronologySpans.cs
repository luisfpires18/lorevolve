namespace LorEvolve.Api.Features.Chronology;

/// <summary>
/// A stretch of a universe's time with optional bounds, each as precise as its author wrote it - an entry's era (Issue #41),
/// and a relationship's period (Issue #18). A bound covers its whole precision: a start of "year 10" begins with the first
/// day of year 10, an end of "year 12" runs to the last day of year 12, and a month alone covers the month. A missing bound
/// is open: the span's start or end is not known, and nothing is assumed for it. Comparison is <see cref="ChronologyPoint"/>'s,
/// the one LorEvolve has.
/// </summary>
public static class ChronologySpans
{
    /// <summary>
    /// Checks each bound as a point on this universe's line, and that the end does not come before the start at the precision
    /// both were written to. Errors are keyed under <c>{key}.start</c> and <c>{key}.end</c>.
    /// </summary>
    public static void Check(
        ChronologyValue? start,
        ChronologyValue? end,
        string key,
        UniverseChronology chronology,
        Dictionary<string, string[]> errors)
    {
        var before = errors.Count;

        if (start is not null)
        {
            ChronologyPointValidation.ValidatePoint(start, ChronologyPointKeys.Nested($"{key}.start"), chronology, errors);
        }

        if (end is not null)
        {
            ChronologyPointValidation.ValidatePoint(end, ChronologyPointKeys.Nested($"{key}.end"), chronology, errors);
        }

        if (errors.Count == before
            && start is not null && end is not null
            && Lower(start, chronology) is { } from && Upper(end, chronology) is { } to
            && to < from)
        {
            errors[$"{key}.end.year"] = ["The end can't come before the start."];
        }
    }

    /// <summary>The first moment a bound covers, or null when this reckoning cannot place it.</summary>
    public static ChronologyPoint? Lower(ChronologyValue bound, UniverseChronology chronology) =>
        chronology.Point(bound.EraId, bound.Year, bound.Month, bound.Day, bound.MonthId);

    /// <summary>The last moment a bound covers: a missing month or day reaches to the end of what was written.</summary>
    public static ChronologyPoint? Upper(ChronologyValue bound, UniverseChronology chronology) =>
        Lower(bound, chronology) is { } point
            ? point with
            {
                Month = bound.Month is null && bound.MonthId is null ? int.MaxValue : point.Month,
                Day = bound.Day is null ? int.MaxValue : point.Day,
            }
            : null;

    /// <summary>
    /// Whether two spans share any moment, or null when it cannot be said - a bound this reckoning cannot place. An open bound
    /// reaches as far as the other span needs; two spans with no bounds at all overlap.
    /// </summary>
    public static bool? Overlap(
        ChronologyValue? firstStart,
        ChronologyValue? firstEnd,
        ChronologyValue? secondStart,
        ChronologyValue? secondEnd,
        UniverseChronology chronology)
    {
        // The first ends before the second starts, or the second ends before the first starts.
        var separate = Before(firstEnd, secondStart, chronology);
        var reverse = Before(secondEnd, firstStart, chronology);

        return separate is null || reverse is null ? null : !(separate.Value || reverse.Value);
    }

    /// <summary>Whether a span that ends at <paramref name="end"/> is over before one starting at <paramref name="start"/> begins.</summary>
    private static bool? Before(ChronologyValue? end, ChronologyValue? start, UniverseChronology chronology)
    {
        if (end is null || start is null)
        {
            return false;
        }

        return Upper(end, chronology) is { } to && Lower(start, chronology) is { } from ? to < from : null;
    }
}
