using LorEvolve.Api.Features.Chronology;

namespace LorEvolve.Api.Features.Timeline;

/// <summary>
/// Input checks for the timeline feature. Month and day are checked by the shared point rules: the ordinary ranges on
/// simple dates, the calendar's own months and their lengths on a universe with a custom calendar.
///
/// Where a year sits is the universe's reckoning to say. A universe with no eras takes plain
/// signed years, as it always has; one that names its eras takes a year counted from 1 inside
/// one of them. Comparing two points goes through <see cref="ChronologyPoint"/> and nothing else.
/// </summary>
public static class TimelineValidation
{
    private static readonly ChronologyPointKeys StartKeys = ChronologyPointKeys.Prefixed("start");

    private static readonly ChronologyPointKeys EndKeys = ChronologyPointKeys.Prefixed("end");

    public static Dictionary<string, string[]>? Validate(
        TimelineEntryRequest request,
        UniverseChronology chronology)
    {
        var errors = new Dictionary<string, string[]>();

        var title = request.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            errors["title"] = ["Give the moment a title, like \"Frodo leaves the Shire\"."];
        }
        else if (title.Length > TimelineLimits.TitleMaxLength)
        {
            errors["title"] = [$"Keep the title under {TimelineLimits.TitleMaxLength} characters."];
        }

        if (request.Description?.Trim() is { Length: > TimelineLimits.DescriptionMaxLength })
        {
            errors["description"] = ["That description is too long."];
        }

        if (request.EraLabel?.Trim() is { Length: > TimelineLimits.EraLabelMaxLength })
        {
            errors["eraLabel"] = [$"Keep the year label under {TimelineLimits.EraLabelMaxLength} characters."];
        }

        if (!Enum.IsDefined(request.CanonStatus))
        {
            errors["canonStatus"] = ["That is not a canon status LorEvolve knows."];
        }

        if (!Enum.IsDefined(request.DateKind))
        {
            errors["dateKind"] = ["That is not a date kind LorEvolve knows."];

            // Every rule below is written per kind, so an unknown one has nothing to say.
            return errors;
        }

        ValidateComponents(request, chronology, errors);
        ValidateKind(request, errors);
        ValidateReckoning(request, chronology, errors);

        if (request.EntityIds is { Count: > TimelineLimits.MaxLinkedEntities })
        {
            errors["entityIds"] =
                [$"Link at most {TimelineLimits.MaxLinkedEntities} entries to one moment."];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// Shape of the components on their own, whatever the kind claims - the same checks every
    /// stored point gets, once for each end.
    /// </summary>
    private static void ValidateComponents(
        TimelineEntryRequest request,
        UniverseChronology chronology,
        Dictionary<string, string[]> errors)
    {
        ChronologyPointValidation.ValidateParts(
            request.StartYear, request.StartMonth, request.StartMonthId, request.StartDay, StartKeys, chronology, errors);
        ChronologyPointValidation.ValidateParts(
            request.EndYear, request.EndMonth, request.EndMonthId, request.EndDay, EndKeys, chronology, errors);
    }

    /// <summary>Which components each kind is allowed, and required, to carry.</summary>
    private static void ValidateKind(
        TimelineEntryRequest request,
        Dictionary<string, string[]> errors)
    {
        var hasEnd = request.EndYear is not null
            || request.EndMonth is not null
            || request.EndMonthId is not null
            || request.EndDay is not null
            || request.EndEraId is not null;

        switch (request.DateKind)
        {
            case TimelineDateKind.Exact:
            case TimelineDateKind.Approximate:
                if (request.StartYear is null)
                {
                    errors["startYear"] = ["Give the year this happened in."];
                }

                if (hasEnd)
                {
                    errors["endYear"] = ["Only a range has an end. Switch the kind to Range."];
                }

                break;

            case TimelineDateKind.Range:
                if (request.StartYear is null)
                {
                    errors["startYear"] = ["Give the year the span starts in."];
                }

                if (request.EndYear is null)
                {
                    errors["endYear"] = ["Give the year the span ends in."];
                }

                break;

            case TimelineDateKind.Unknown:
                if (request.StartYear is not null
                    || request.StartMonth is not null
                    || request.StartMonthId is not null
                    || request.StartDay is not null
                    || request.StartEraId is not null
                    || hasEnd)
                {
                    // Worded as it always was unless an era is actually among what was sent, so
                    // the plain reckoning's refusal reads exactly as it did before eras existed.
                    errors["dateKind"] = request.StartEraId is null && request.EndEraId is null
                        ? ["An unknown date carries no year, month or day. Clear them or pick a kind."]
                        : ["An unknown date carries no year, month, day or date period. Clear them or pick a kind."];
                }

                break;
        }
    }

    /// <summary>
    /// Whether the years are written the way this universe keeps time, and - for a range -
    /// whether the end comes after the start on that reckoning. Runs after the kind check, and
    /// says nothing about a component the kind has already refused.
    /// </summary>
    private static void ValidateReckoning(
        TimelineEntryRequest request,
        UniverseChronology chronology,
        Dictionary<string, string[]> errors)
    {
        if (request.DateKind == TimelineDateKind.Unknown)
        {
            return;
        }

        var isRange = request.DateKind == TimelineDateKind.Range;

        if (!chronology.NamesEras)
        {
            if (request.StartEraId is not null)
            {
                errors.TryAdd(StartKeys.Era, [ChronologyPointValidation.NoErasMessage]);
            }

            if (isRange && request.EndEraId is not null)
            {
                errors.TryAdd(EndKeys.Era, [ChronologyPointValidation.NoErasMessage]);
            }
        }
        else
        {
            if (Normalize(request.EraLabel) is not null)
            {
                errors["eraLabel"] =
                    ["This universe has date periods. Choose one of those rather than writing a label."];
            }

            ChronologyPointValidation.ValidateEraYear(
                request.StartYear, request.StartEraId, StartKeys, chronology, errors);

            if (isRange)
            {
                ChronologyPointValidation.ValidateEraYear(
                    request.EndYear, request.EndEraId, EndKeys, chronology, errors);
            }
        }

        if (isRange
            && !errors.ContainsKey("startYear") && !errors.ContainsKey("startEraId")
            && !errors.ContainsKey("endYear") && !errors.ContainsKey("endEraId")
            && chronology.Point(request.StartEraId, request.StartYear, request.StartMonth, request.StartDay, request.StartMonthId) is { } start
            && chronology.Point(request.EndEraId, request.EndYear, request.EndMonth, request.EndDay, request.EndMonthId) is { } end
            && end < start)
        {
            errors["endYear"] = ["The span cannot end before it starts."];
        }
    }

    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>How far down a set of components actually goes. A custom month counts as a month.</summary>
    public static TimelineDatePrecision PrecisionOf(int? year, int? month, int? day, Guid? monthId = null) =>
        year is null ? TimelineDatePrecision.None
        : month is null && monthId is null ? TimelineDatePrecision.Year
        : day is null ? TimelineDatePrecision.Month
        : TimelineDatePrecision.Day;
}
