using System.Globalization;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Timeline;

namespace Lorex.Api.Features.Reading;

/// <summary>
/// How a reading writes text: long text cut to a limit, and dates written the way this universe writes them - the server's
/// copy of the web client's <c>formatChronologyPoint</c> and <c>formatTimelineDate</c>, which a reading cannot borrow.
/// Nothing here orders anything; <see cref="ChronologyPoint"/> does that.
/// </summary>
internal static class ReadingText
{
    /// <summary>
    /// The text trimmed, or null when there is none; past <paramref name="limit"/> characters, cut there and marked with an
    /// ellipsis so a reader knows there is more. Never splits a surrogate pair.
    /// </summary>
    public static string? Cut(string? text, int limit)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var trimmed = text.Trim();
        if (trimmed.Length <= limit)
        {
            return trimmed;
        }

        var end = char.IsHighSurrogate(trimmed[limit - 1]) ? limit - 1 : limit;
        return string.Concat(trimmed.AsSpan(0, end).TrimEnd(), "…");
    }

    /// <summary>
    /// One point, down to what it states. On simple dates the largest part first - <c>3018</c>, <c>3018.09.22</c>, with a
    /// date period's label on the side it asks for - and months stay numbers, because naming month 9 "September" would
    /// invent a Gregorian fact. On a custom calendar the author's month name: <c>17 Emberrise · TA 401</c>.
    /// </summary>
    public static string Point(UniverseChronology chronology, int year, int? month, int? day, Guid? eraId, Guid? monthId)
    {
        if (chronology.Month(monthId) is { } custom)
        {
            var named = Point(chronology, year, null, null, eraId, null);
            return day is { } dayOfMonth ? $"{dayOfMonth} {custom.Name} · {named}" : $"{custom.Name} · {named}";
        }

        var text = year.ToString(CultureInfo.InvariantCulture);
        if (month is { } numericMonth)
        {
            text += $".{numericMonth:00}";
            if (day is { } numericDay)
            {
                text += $".{numericDay:00}";
            }
        }

        if (chronology.Era(eraId) is not { } era)
        {
            return text;
        }

        var label = UniverseChronology.Label(era);
        return era.LabelPosition == ChronologyLabelPosition.AfterYear ? $"{text} {label}" : $"{label} {text}";
    }

    /// <summary>A timeline date as one stamp: exact, "c." approximate, a range, or "Date unknown".</summary>
    public static string Date(UniverseChronology chronology, TimelineDate date)
    {
        var start = End(chronology, date.StartYear, date.StartMonth, date.StartDay, date.StartPrecision, date.StartEraId, date.StartMonthId);

        return date.Kind switch
        {
            TimelineDateKind.Exact when start.Length > 0 => start,
            TimelineDateKind.Approximate when start.Length > 0 => $"c. {start}",
            TimelineDateKind.Range when start.Length > 0 =>
                End(chronology, date.EndYear, date.EndMonth, date.EndDay, date.EndPrecision, date.EndEraId, date.EndMonthId) is
                { Length: > 0 } end
                    ? $"{start} – {end}"
                    : start,
            _ => "Date unknown",
        };
    }

    private static string End(
        UniverseChronology chronology,
        int? year,
        int? month,
        int? day,
        TimelineDatePrecision precision,
        Guid? eraId,
        Guid? monthId)
    {
        if (year is not { } value || precision == TimelineDatePrecision.None)
        {
            return string.Empty;
        }

        var withMonth = precision != TimelineDatePrecision.Year && (month is not null || monthId is not null);
        var withDay = withMonth && precision == TimelineDatePrecision.Day;

        return Point(
            chronology,
            value,
            withMonth ? month : null,
            withDay ? day : null,
            eraId,
            withMonth ? monthId : null);
    }
}
