namespace LorEvolve.Api.Features.Chronology;

/// <summary>
/// Shape checks for a reckoning, before anything is read from the database. What needs the
/// stored eras - an id from somewhere else, an era still in use - is the endpoint's to decide.
/// </summary>
public static class ChronologyValidation
{
    public static Dictionary<string, string[]>? Validate(ChronologyRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Eras is not { } eras)
        {
            errors["eras"] = ["Send the whole list of date periods, even when it is empty."];
            return errors;
        }

        if (eras.Count > ChronologyLimits.MaxEras)
        {
            errors["eras"] = [$"A universe can have at most {ChronologyLimits.MaxEras} date periods."];
            return errors;
        }

        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var labels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var ids = new HashSet<Guid>();

        for (var index = 0; index < eras.Count; index++)
        {
            var era = eras[index];
            var key = $"eras[{index}]";

            if (era.Id is { } id && !ids.Add(id))
            {
                errors[$"{key}.id"] = ["The same date period is listed twice."];
            }

            var name = Normalize(era.Name);
            var abbreviation = Normalize(era.Abbreviation);

            if (name is null)
            {
                errors[$"{key}.name"] = ["Give the date period a name, like \"Third Age\" or \"After the Fall\"."];
            }
            else if (name.Length > ChronologyLimits.NameMaxLength)
            {
                errors[$"{key}.name"] = [$"Keep a date period's name under {ChronologyLimits.NameMaxLength} characters."];
            }
            else if (!names.Add(name))
            {
                errors[$"{key}.name"] = ["Another date period already has this name."];
            }

            if (abbreviation is { Length: > ChronologyLimits.AbbreviationMaxLength })
            {
                errors[$"{key}.abbreviation"] =
                    [$"Keep a short label to {ChronologyLimits.AbbreviationMaxLength} characters or fewer."];
            }
            else if ((abbreviation ?? name) is { } label && !labels.Add(label))
            {
                // What is written beside a year has to say which era it is, so two eras may not
                // read the same even when their full names differ.
                errors[abbreviation is null ? $"{key}.name" : $"{key}.abbreviation"] =
                    [$"Another date period is already written as \"{label}\". Give each period a label of its own."];
            }

            if (!Enum.IsDefined(era.Direction))
            {
                errors[$"{key}.direction"] = ["That is not a direction LorEvolve knows."];
            }

            if (!Enum.IsDefined(era.LabelPosition))
            {
                errors[$"{key}.labelPosition"] = ["That is not a label position LorEvolve knows."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// A calendar's shape: at least one month, each named uniquely ignoring case, lengths positive. The bounds are protective
    /// only - nothing here expects twelve months or thirty-odd days.
    /// </summary>
    public static Dictionary<string, string[]>? ValidateCalendar(ChronologyCalendarRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Months is not { Count: > 0 } months)
        {
            errors["months"] = ["A calendar needs at least one month."];
            return errors;
        }

        if (months.Count > ChronologyLimits.MaxMonths)
        {
            errors["months"] = [$"A calendar can have at most {ChronologyLimits.MaxMonths} months."];
            return errors;
        }

        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var ids = new HashSet<Guid>();

        for (var index = 0; index < months.Count; index++)
        {
            var month = months[index];
            var key = $"months[{index}]";

            if (month is null)
            {
                errors[key] = ["Each month needs a name and a number of days."];
                continue;
            }

            if (month.Id is { } id && !ids.Add(id))
            {
                errors[$"{key}.id"] = ["The same month is listed twice."];
            }

            var name = Normalize(month.Name);
            if (name is null)
            {
                errors[$"{key}.name"] = ["Give the month a name."];
            }
            else if (name.Length > ChronologyLimits.NameMaxLength)
            {
                errors[$"{key}.name"] = [$"Keep a month's name under {ChronologyLimits.NameMaxLength} characters."];
            }
            else if (!names.Add(name))
            {
                errors[$"{key}.name"] = ["Another month already has this name."];
            }

            if (Normalize(month.Abbreviation) is { Length: > ChronologyLimits.AbbreviationMaxLength })
            {
                errors[$"{key}.abbreviation"] =
                    [$"Keep a short name to {ChronologyLimits.AbbreviationMaxLength} characters or fewer."];
            }

            if (month.DayCount < 1 || month.DayCount > ChronologyLimits.MaxDaysInMonth)
            {
                errors[$"{key}.dayCount"] = [$"A month has from 1 to {ChronologyLimits.MaxDaysInMonth} days."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
