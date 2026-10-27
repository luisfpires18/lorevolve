namespace LorEvolve.Api.Features.Chronology;

/// <summary>
/// The names errors about one point are reported under. A timeline entry has two points, keyed
/// flat ("startYear", "endEraId"); a scene has one, nested under its request member
/// ("chronology.year").
/// </summary>
public sealed record ChronologyPointKeys(string Year, string Month, string Day, string Era)
{
    public static ChronologyPointKeys Prefixed(string prefix) =>
        new($"{prefix}Year", $"{prefix}Month", $"{prefix}Day", $"{prefix}EraId");

    public static ChronologyPointKeys Nested(string member) =>
        new($"{member}.year", $"{member}.month", $"{member}.day", $"{member}.eraId");
}

/// <summary>
/// Structural checks for one point on a universe's line, shared by everything that stores one - a
/// timeline entry's start and end, and a scene's position - so a year is refused in the same words
/// wherever it is written.
///
/// Simple dates keep the ordinary ranges they always had: month 1 to 12, day 1 to 31. A universe with a custom calendar
/// takes a month by id from that calendar and a day up to that month's own length, and nothing Earth-like is assumed.
/// Where a year sits is the universe's reckoning to say (ADR 0022), and comparing two points is
/// <see cref="ChronologyPoint"/>'s job and nothing here.
/// </summary>
public static class ChronologyPointValidation
{
    public const string NoErasMessage =
        "This universe has no date periods. Add them in Chronology, or leave the date period out.";

    /// <summary>
    /// Shape of the components on their own. Years are signed on purpose; only months and days are
    /// bounded, and a day without a month is meaningless. Errors about a custom month are keyed under the month, which is
    /// one control whichever kind of month it is.
    /// </summary>
    public static void ValidateParts(
        int? year,
        int? month,
        Guid? monthId,
        int? day,
        ChronologyPointKeys keys,
        UniverseChronology chronology,
        Dictionary<string, string[]> errors)
    {
        if (chronology.HasCalendar)
        {
            if (month is not null)
            {
                errors[keys.Month] = ["This universe uses a custom calendar. Choose one of its months."];
            }
            else if (monthId is not null && chronology.Month(monthId) is null)
            {
                errors[keys.Month] = ["Choose one of this calendar's months."];
            }

            if (chronology.Month(monthId) is { } custom && day is { } chosen && (chosen < 1 || chosen > custom.DayCount))
            {
                errors[keys.Day] = [custom.DayCount == 1
                    ? $"{custom.Name} has 1 day. The day can only be 1."
                    : $"{custom.Name} has {custom.DayCount} days. Choose a day from 1 to {custom.DayCount}."];
            }
            else if (day is < 1)
            {
                errors[keys.Day] = ["A day starts at 1."];
            }
        }
        else
        {
            if (monthId is not null)
            {
                errors[keys.Month] = ["This universe uses simple dates. Give the month as a number."];
            }
            else if (month is < 1 or > ChronologyLimits.SimpleMonths)
            {
                errors[keys.Month] = ["A month runs from 1 to 12."];
            }

            if (day is < 1 or > ChronologyLimits.SimpleDays)
            {
                errors[keys.Day] = ["A day runs from 1 to 31."];
            }
        }

        var hasMonth = month is not null || monthId is not null;

        if (day is not null && !hasMonth)
        {
            errors[keys.Month] = ["Give the month as well when you give a day."];
        }

        if (hasMonth && year is null)
        {
            errors[keys.Year] = ["Give the year as well when you give a month."];
        }
    }

    /// <summary>
    /// A year on a universe that names its eras: it needs one of them, and counts up from 1 inside it.
    /// Says nothing when there is no year to place.
    /// </summary>
    public static void ValidateEraYear(
        int? year,
        Guid? eraId,
        ChronologyPointKeys keys,
        UniverseChronology chronology,
        Dictionary<string, string[]> errors)
    {
        if (year is not { } value)
        {
            return;
        }

        if (eraId is null)
        {
            errors.TryAdd(keys.Era, ["Choose the date period this year is counted in."]);
        }
        else if (chronology.Era(eraId) is null)
        {
            // Said the same way for an id that is not an era at all and for one from another
            // universe, so the answer discloses nothing about the second.
            errors.TryAdd(keys.Era, ["Choose one of this universe's date periods."]);
        }

        if (!ChronologyPoint.IsEraYear(value))
        {
            errors.TryAdd(keys.Year, ["Years inside a date period start at 1. There is no year 0."]);
        }
    }

    /// <summary>
    /// One whole point that stands on its own: a year is required, its parts must be shaped, and it
    /// must be written the way this universe keeps time - plain signed years with no era, or a year
    /// from 1 inside one of the universe's eras.
    /// </summary>
    public static void ValidatePoint(
        ChronologyValue value,
        ChronologyPointKeys keys,
        UniverseChronology chronology,
        Dictionary<string, string[]> errors)
    {
        ValidateParts(value.Year, value.Month, value.MonthId, value.Day, keys, chronology, errors);

        if (value.Year is null)
        {
            errors.TryAdd(keys.Year, ["Give the year, or leave the chronology out."]);
        }

        if (!chronology.NamesEras)
        {
            if (value.EraId is not null)
            {
                errors.TryAdd(keys.Era, [NoErasMessage]);
            }
        }
        else
        {
            ValidateEraYear(value.Year, value.EraId, keys, chronology, errors);
        }
    }
}
