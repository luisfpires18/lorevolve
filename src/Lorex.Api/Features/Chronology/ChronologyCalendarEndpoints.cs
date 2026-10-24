using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Chronology;

/// <summary>
/// A universe's custom calendar: turned on, edited and turned off, each in one transaction, beside the eras rather than
/// inside their save - so saving the eras can never clear a calendar, and the other way round.
///
/// <b>Nothing is truncated, moved or guessed.</b> Every change that would leave a stored date meaning something else - a
/// month that no longer exists, a day past a month's end, a range that ends before it starts - is refused with what to fix,
/// and nothing is written. The dates themselves are only ever rewritten by turning the calendar on or off, and then
/// deterministically: simple month N is the calendar's month at position N, and back.
///
/// Month order is not a Canon question - every chronology rule compares years - so, unlike the eras, these routes are not
/// gated. Same capability as the eras: an Editor or the owner.
/// </summary>
public static class ChronologyCalendarEndpoints
{
    public const string MonthInUseCode = "chronology_month_in_use";
    public const string MonthTooShortCode = "chronology_month_too_short";
    public const string RangeReversedCode = "chronology_range_reversed";
    public const string DatesIncompatibleCode = "chronology_dates_incompatible";
    public const string ChangedCode = "chronology_calendar_changed";

    public static RouteGroupBuilder MapChronologyCalendarEndpoints(this RouteGroupBuilder group)
    {
        group.MapPut("/calendar", SaveAsync).WithName("SaveChronologyCalendar");
        group.MapDelete("/calendar", RemoveAsync).WithName("RemoveChronologyCalendar");

        return group;
    }

    /// <summary>Turns custom dates on with this calendar, or replaces the calendar's months whole.</summary>
    private static async Task<IResult> SaveAsync(
        Guid universeId,
        [FromBody] ChronologyCalendarRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (ChronologyValidation.ValidateCalendar(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var calendarId = await db.ChronologyCalendars
            .Where(calendar => calendar.UniverseId == universeId)
            .Select(calendar => (Guid?)calendar.Id)
            .FirstOrDefaultAsync(cancellationToken);

        try
        {
            var refused = calendarId is { } id
                ? await EditAsync(universeId, id, request.Months!, db, cancellationToken)
                : await EnableAsync(universeId, request.Months!, db, cancellationToken);

            if (refused is not null)
            {
                return refused;
            }
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            return Changed();
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(await ChronologyEndpoints.DescribeAsync(db, universeId, cancellationToken));
    }

    /// <summary>
    /// Back to simple dates: each custom month becomes the number of its position, days unchanged, and the calendar goes.
    /// Refused while any date could not be written that way - a month past 12 in use, or a day past 31.
    /// </summary>
    private static async Task<IResult> RemoveAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var months = await MonthsAsync(db, universeId, cancellationToken);

        if (months.Count > 0)
        {
            var calendarId = months[0].CalendarId;

            var pastTwelve = months.Where(month => month.UseCount > 0 && month.SortOrder + 1 > ChronologyLimits.SimpleMonths).ToList();
            var tooLong = months.Where(month => month.MaxDayUsed > ChronologyLimits.SimpleDays).ToList();

            if (pastTwelve.Count > 0 || tooLong.Count > 0)
            {
                var problems = pastTwelve
                    .Select(month => $"{Quote(month.Name)} is month {month.SortOrder + 1} and dates use it")
                    .Concat(tooLong.Select(month => $"a date in {Quote(month.Name)} uses day {month.MaxDayUsed}"));

                return Incompatible(
                    $"Simple dates have at most 12 months of up to 31 days, and {string.Join("; ", problems)}. "
                    + "Change those dates first, or keep the custom calendar.");
            }

            await db.TimelineEntries
                .Where(entry => entry.UniverseId == universeId && entry.StartMonthId != null)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(
                            entry => entry.StartMonth,
                            entry => db.ChronologyCalendarMonths
                                .Where(month => month.Id == entry.StartMonthId)
                                .Select(month => (int?)(month.SortOrder + 1))
                                .FirstOrDefault())
                        .SetProperty(entry => entry.StartMonthId, (Guid?)null),
                    cancellationToken);

            await db.TimelineEntries
                .Where(entry => entry.UniverseId == universeId && entry.EndMonthId != null)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(
                            entry => entry.EndMonth,
                            entry => db.ChronologyCalendarMonths
                                .Where(month => month.Id == entry.EndMonthId)
                                .Select(month => (int?)(month.SortOrder + 1))
                                .FirstOrDefault())
                        .SetProperty(entry => entry.EndMonthId, (Guid?)null),
                    cancellationToken);

            // Scenes in the Trash too: they keep their date, and it has to stay meaningful when they come back.
            await db.Scenes
                .Where(scene => scene.Story!.UniverseId == universeId && scene.MonthId != null)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(
                            scene => scene.Month,
                            scene => db.ChronologyCalendarMonths
                                .Where(month => month.Id == scene.MonthId)
                                .Select(month => (int?)(month.SortOrder + 1))
                                .FirstOrDefault())
                        .SetProperty(scene => scene.MonthId, (Guid?)null),
                    cancellationToken);

            // An entry's era is dated the same way (Issue #41), the Trash included.
            await db.EntityEras
                .Where(era => era.Entity!.UniverseId == universeId && era.StartMonthId != null)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(
                            era => era.StartMonth,
                            era => db.ChronologyCalendarMonths
                                .Where(month => month.Id == era.StartMonthId)
                                .Select(month => (int?)(month.SortOrder + 1))
                                .FirstOrDefault())
                        .SetProperty(era => era.StartMonthId, (Guid?)null),
                    cancellationToken);

            await db.EntityEras
                .Where(era => era.Entity!.UniverseId == universeId && era.EndMonthId != null)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(
                            era => era.EndMonth,
                            era => db.ChronologyCalendarMonths
                                .Where(month => month.Id == era.EndMonthId)
                                .Select(month => (int?)(month.SortOrder + 1))
                                .FirstOrDefault())
                        .SetProperty(era => era.EndMonthId, (Guid?)null),
                    cancellationToken);

            // And a relationship's period (Issue #18), the Trash included.
            await db.RelationshipPeriods
                .Where(period => period.Relationship!.UniverseId == universeId && period.StartMonthId != null)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(
                            period => period.StartMonth,
                            period => db.ChronologyCalendarMonths
                                .Where(month => month.Id == period.StartMonthId)
                                .Select(month => (int?)(month.SortOrder + 1))
                                .FirstOrDefault())
                        .SetProperty(period => period.StartMonthId, (Guid?)null),
                    cancellationToken);

            await db.RelationshipPeriods
                .Where(period => period.Relationship!.UniverseId == universeId && period.EndMonthId != null)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(
                            period => period.EndMonth,
                            period => db.ChronologyCalendarMonths
                                .Where(month => month.Id == period.EndMonthId)
                                .Select(month => (int?)(month.SortOrder + 1))
                                .FirstOrDefault())
                        .SetProperty(period => period.EndMonthId, (Guid?)null),
                    cancellationToken);

            await db.ChronologyCalendarMonths.Where(month => month.CalendarId == calendarId).ExecuteDeleteAsync(cancellationToken);
            await db.ChronologyCalendars.Where(calendar => calendar.Id == calendarId).ExecuteDeleteAsync(cancellationToken);
        }
        else
        {
            // A calendar is never saved without a month; this only tidies a row a failed write could have left.
            await db.ChronologyCalendars.Where(calendar => calendar.UniverseId == universeId).ExecuteDeleteAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(await ChronologyEndpoints.DescribeAsync(db, universeId, cancellationToken));
    }

    /// <summary>
    /// Custom dates on. Every simple month and day already written is checked against the new months first - month N needs
    /// an Nth month, and its days must fit it - and then each is moved to the month at its position, in three statements.
    /// </summary>
    private static async Task<IResult?> EnableAsync(
        Guid universeId,
        IReadOnlyList<ChronologyCalendarMonthRequest> wanted,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (Foreign(wanted, []) is { } foreign)
        {
            return Results.ValidationProblem(foreign);
        }

        var used = await SimpleMonthsInUseAsync(db, universeId, cancellationToken);

        if (used.Count > 0 && used.Keys.Max() is var latest && latest > wanted.Count)
        {
            return Incompatible(
                $"Some dates use month {latest}, but this calendar has {Count(wanted.Count, "month", "months")}. "
                + "Add months, or change those dates first.");
        }

        foreach (var (number, day) in used.OrderBy(pair => pair.Key))
        {
            var month = wanted[number - 1];
            if (day > month.DayCount)
            {
                return Incompatible(
                    $"Some dates use day {day} of month {number}, but {Quote(ChronologyValidation.Normalize(month.Name))} "
                    + $"has {Count(month.DayCount, "day", "days")}. Make it longer, or change those dates first.");
            }
        }

        var calendar = new ChronologyCalendar { Id = Guid.NewGuid(), UniverseId = universeId };

        for (var index = 0; index < wanted.Count; index++)
        {
            calendar.Months.Add(new ChronologyCalendarMonth
            {
                Id = Guid.NewGuid(),
                Name = ChronologyValidation.Normalize(wanted[index].Name)!,
                Abbreviation = ChronologyValidation.Normalize(wanted[index].Abbreviation),
                SortOrder = index,
                DayCount = wanted[index].DayCount,
            });
        }

        db.ChronologyCalendars.Add(calendar);
        await db.SaveChangesAsync(cancellationToken);

        var calendarId = calendar.Id;

        await db.TimelineEntries
            .Where(entry => entry.UniverseId == universeId && entry.StartMonth != null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(
                        entry => entry.StartMonthId,
                        entry => db.ChronologyCalendarMonths
                            .Where(month => month.CalendarId == calendarId && month.SortOrder + 1 == entry.StartMonth)
                            .Select(month => (Guid?)month.Id)
                            .FirstOrDefault())
                    .SetProperty(entry => entry.StartMonth, (int?)null),
                cancellationToken);

        await db.TimelineEntries
            .Where(entry => entry.UniverseId == universeId && entry.EndMonth != null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(
                        entry => entry.EndMonthId,
                        entry => db.ChronologyCalendarMonths
                            .Where(month => month.CalendarId == calendarId && month.SortOrder + 1 == entry.EndMonth)
                            .Select(month => (Guid?)month.Id)
                            .FirstOrDefault())
                    .SetProperty(entry => entry.EndMonth, (int?)null),
                cancellationToken);

        await db.Scenes
            .Where(scene => scene.Story!.UniverseId == universeId && scene.Month != null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(
                        scene => scene.MonthId,
                        scene => db.ChronologyCalendarMonths
                            .Where(month => month.CalendarId == calendarId && month.SortOrder + 1 == scene.Month)
                            .Select(month => (Guid?)month.Id)
                            .FirstOrDefault())
                    .SetProperty(scene => scene.Month, (int?)null),
                cancellationToken);

        await db.EntityEras
            .Where(era => era.Entity!.UniverseId == universeId && era.StartMonth != null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(
                        era => era.StartMonthId,
                        era => db.ChronologyCalendarMonths
                            .Where(month => month.CalendarId == calendarId && month.SortOrder + 1 == era.StartMonth)
                            .Select(month => (Guid?)month.Id)
                            .FirstOrDefault())
                    .SetProperty(era => era.StartMonth, (int?)null),
                cancellationToken);

        await db.EntityEras
            .Where(era => era.Entity!.UniverseId == universeId && era.EndMonth != null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(
                        era => era.EndMonthId,
                        era => db.ChronologyCalendarMonths
                            .Where(month => month.CalendarId == calendarId && month.SortOrder + 1 == era.EndMonth)
                            .Select(month => (Guid?)month.Id)
                            .FirstOrDefault())
                    .SetProperty(era => era.EndMonth, (int?)null),
                cancellationToken);

        await db.RelationshipPeriods
            .Where(period => period.Relationship!.UniverseId == universeId && period.StartMonth != null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(
                        period => period.StartMonthId,
                        period => db.ChronologyCalendarMonths
                            .Where(month => month.CalendarId == calendarId && month.SortOrder + 1 == period.StartMonth)
                            .Select(month => (Guid?)month.Id)
                            .FirstOrDefault())
                    .SetProperty(period => period.StartMonth, (int?)null),
                cancellationToken);

        await db.RelationshipPeriods
            .Where(period => period.Relationship!.UniverseId == universeId && period.EndMonth != null)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(
                        period => period.EndMonthId,
                        period => db.ChronologyCalendarMonths
                            .Where(month => month.CalendarId == calendarId && month.SortOrder + 1 == period.EndMonth)
                            .Select(month => (Guid?)month.Id)
                            .FirstOrDefault())
                    .SetProperty(period => period.EndMonth, (int?)null),
                cancellationToken);

        return null;
    }

    /// <summary>
    /// The calendar's months replaced whole: renamed, resized, reordered, added and removed at once. Refused, before anything
    /// is written, for a month still used that would go, a month shortened below a day in use, and an order that would turn
    /// an existing range around. Dates are never rewritten here; they follow their month by id.
    /// </summary>
    private static async Task<IResult?> EditAsync(
        Guid universeId,
        Guid calendarId,
        IReadOnlyList<ChronologyCalendarMonthRequest> wanted,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var stored = await db.ChronologyCalendarMonths
            .Where(month => month.CalendarId == calendarId)
            .ToListAsync(cancellationToken);

        var byId = stored.ToDictionary(month => month.Id);

        if (Foreign(wanted, byId.Keys.ToHashSet()) is { } foreign)
        {
            return Results.ValidationProblem(foreign);
        }

        var usage = (await MonthsAsync(db, universeId, cancellationToken)).ToDictionary(month => month.Id);
        var kept = wanted.Where(month => month.Id is not null).Select(month => month.Id!.Value).ToHashSet();

        var removedInUse = stored
            .Where(month => !kept.Contains(month.Id) && usage.TryGetValue(month.Id, out var use) && use.UseCount > 0)
            .OrderBy(month => month.SortOrder)
            .Select(month => usage[month.Id])
            .ToList();

        if (removedInUse.Count > 0)
        {
            return MonthInUse(removedInUse);
        }

        foreach (var input in wanted)
        {
            if (input.Id is { } id && usage.TryGetValue(id, out var use) && use.MaxDayUsed > input.DayCount)
            {
                return Results.Problem(
                    title: "Month is too short",
                    detail: $"{Quote(ChronologyValidation.Normalize(input.Name))} can't be shorter than "
                        + $"{Count(use.MaxDayUsed!.Value, "day", "days")}: a date in it uses day {use.MaxDayUsed}. "
                        + "Change that date first, or keep the month longer.",
                    statusCode: StatusCodes.Status409Conflict,
                    extensions: new Dictionary<string, object?> { ["code"] = MonthTooShortCode, ["monthId"] = id });
            }
        }

        // Every range with a custom month at both ends, read once and placed on the calendar as it is about to be. Only a
        // change of order can turn one around, but checking every save costs one small query and needs no "did it move".
        var next = wanted
            .Select((input, index) => new ChronologyCalendarMonth
            {
                Id = input.Id ?? Guid.NewGuid(),
                Name = ChronologyValidation.Normalize(input.Name)!,
                SortOrder = index,
                DayCount = input.DayCount,
            })
            .ToList();

        var eras = await db.ChronologyEras.AsNoTracking()
            .Where(era => era.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var reckoning = UniverseChronology.Of(eras, next);

        var ranges = await db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.UniverseId == universeId
                && entry.DateKind == TimelineDateKind.Range
                && entry.StartMonthId != null
                && entry.EndMonthId != null)
            .Select(entry => new
            {
                entry.Title,
                entry.StartEraId,
                entry.StartYear,
                entry.StartMonthId,
                entry.StartDay,
                entry.EndEraId,
                entry.EndYear,
                entry.EndMonthId,
                entry.EndDay,
            })
            .ToListAsync(cancellationToken);

        // An entry's era with a custom month at both ends is a span on the same line (Issue #41), read at the precision written.
        var spans = await db.EntityEras.AsNoTracking()
            .Where(era => era.Entity!.UniverseId == universeId && era.StartMonthId != null && era.EndMonthId != null)
            .Select(era => new
            {
                Title = era.Name,
                era.StartEraId,
                era.StartYear,
                era.StartMonthId,
                era.StartDay,
                era.EndEraId,
                era.EndYear,
                era.EndMonthId,
                era.EndDay,
            })
            .Concat(db.RelationshipPeriods.AsNoTracking()
                .Where(period => period.Relationship!.UniverseId == universeId && period.StartMonthId != null && period.EndMonthId != null)
                .Select(period => new
                {
                    Title = period.Relationship!.SourceEntity!.Name + " – " + period.Relationship.TargetEntity!.Name,
                    period.StartEraId,
                    period.StartYear,
                    period.StartMonthId,
                    period.StartDay,
                    period.EndEraId,
                    period.EndYear,
                    period.EndMonthId,
                    period.EndDay,
                }))
            .ToListAsync(cancellationToken);

        var reversed = ranges
            .Where(range => reckoning.Point(range.StartEraId, range.StartYear, null, range.StartDay, range.StartMonthId) is { } start
                && reckoning.Point(range.EndEraId, range.EndYear, null, range.EndDay, range.EndMonthId) is { } end
                && end < start)
            .Select(range => range.Title)
            .ToList();

        var reversedSpans = spans
            .Where(span => ChronologySpans.Lower(new ChronologyValue(span.StartEraId, span.StartYear, null, span.StartDay, span.StartMonthId), reckoning) is { } start
                && ChronologySpans.Upper(new ChronologyValue(span.EndEraId, span.EndYear, null, span.EndDay, span.EndMonthId), reckoning) is { } end
                && end < start)
            .Select(span => span.Title)
            .ToList();

        var spansReversed = reversedSpans.Count > 0;
        reversed = [.. reversed.Concat(reversedSpans).Order(StringComparer.Ordinal)];

        if (reversed.Count > 0)
        {
            var named = string.Join(", ", reversed.Take(5).Select(Quote)) + (reversed.Count > 5 ? $" and {reversed.Count - 5} more" : "");
            return Results.Problem(
                title: "Ranges would end before they start",
                detail: $"In this order, {(spansReversed ? Count(reversed.Count, "dated range", "dated ranges") : Count(reversed.Count, "timeline range", "timeline ranges"))} would end before "
                    + $"{(reversed.Count == 1 ? "it starts" : "they start")}: {named}. Change those dates first, or keep the months "
                    + "in their current order.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = RangeReversedCode });
        }

        foreach (var month in stored.Where(month => !kept.Contains(month.Id)))
        {
            db.ChronologyCalendarMonths.Remove(month);
        }

        // Positions are unique per calendar and checked row by row, so every kept month steps aside first, as eras do.
        var parked = -1;
        foreach (var month in stored.Where(month => kept.Contains(month.Id)))
        {
            month.SortOrder = parked--;
        }

        await db.SaveChangesAsync(cancellationToken);

        for (var index = 0; index < wanted.Count; index++)
        {
            var input = wanted[index];
            var month = input.Id is { } id ? byId[id] : null;

            if (month is null)
            {
                month = new ChronologyCalendarMonth { Id = next[index].Id, CalendarId = calendarId, Name = string.Empty };
                db.ChronologyCalendarMonths.Add(month);
            }

            month.Name = next[index].Name;
            month.Abbreviation = ChronologyValidation.Normalize(input.Abbreviation);
            month.SortOrder = index;
            month.DayCount = input.DayCount;
        }

        await db.SaveChangesAsync(cancellationToken);
        return null;
    }

    // ---------- Usage ----------

    /// <summary>One month with how much is dated in it, the Trash included.</summary>
    internal sealed record MonthUse(
        Guid Id,
        Guid CalendarId,
        string Name,
        string? Abbreviation,
        int SortOrder,
        int DayCount,
        int UseCount,
        int? MaxDayUsed,
        int EntryEraCount = 0,
        int PeriodCount = 0);

    /// <summary>
    /// The calendar's months in order, each with its use: one query however many months, the counts and latest days as
    /// correlated subqueries on the indexed month references. Empty on simple dates.
    /// </summary>
    internal static async Task<List<MonthUse>> MonthsAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var rows = await db.ChronologyCalendarMonths.AsNoTracking()
            .Where(month => month.Calendar!.UniverseId == universeId)
            .OrderBy(month => month.SortOrder)
            .Select(month => new
            {
                month.Id,
                month.CalendarId,
                month.Name,
                month.Abbreviation,
                month.SortOrder,
                month.DayCount,
                Moments = db.TimelineEntries.Count(entry => entry.StartMonthId == month.Id || entry.EndMonthId == month.Id),
                Scenes = db.Scenes.Count(scene => scene.MonthId == month.Id),
                StartDay = db.TimelineEntries.Where(entry => entry.StartMonthId == month.Id).Max(entry => entry.StartDay),
                EndDay = db.TimelineEntries.Where(entry => entry.EndMonthId == month.Id).Max(entry => entry.EndDay),
                SceneDay = db.Scenes.Where(scene => scene.MonthId == month.Id).Max(scene => scene.Day),
                EntryEras = db.EntityEras.Count(era => era.StartMonthId == month.Id || era.EndMonthId == month.Id),
                EraStartDay = db.EntityEras.Where(era => era.StartMonthId == month.Id).Max(era => era.StartDay),
                EraEndDay = db.EntityEras.Where(era => era.EndMonthId == month.Id).Max(era => era.EndDay),
                Periods = db.RelationshipPeriods.Count(period => period.StartMonthId == month.Id || period.EndMonthId == month.Id),
                PeriodStartDay = db.RelationshipPeriods.Where(period => period.StartMonthId == month.Id).Max(period => period.StartDay),
                PeriodEndDay = db.RelationshipPeriods.Where(period => period.EndMonthId == month.Id).Max(period => period.EndDay),
            })
            .ToListAsync(cancellationToken);

        return
        [
            .. rows.Select(row => new MonthUse(
                row.Id,
                row.CalendarId,
                row.Name,
                row.Abbreviation,
                row.SortOrder,
                row.DayCount,
                row.Moments + row.Scenes + row.EntryEras + row.Periods,
                new[] { row.StartDay, row.EndDay, row.SceneDay, row.EraStartDay, row.EraEndDay, row.PeriodStartDay, row.PeriodEndDay }.Max(),
                row.EntryEras,
                row.Periods)),
        ];
    }

    /// <summary>Every simple month in use, with the latest day used in it (0 when only the month is given): three grouped reads.</summary>
    private static async Task<Dictionary<int, int>> SimpleMonthsInUseAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var starts = await db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.UniverseId == universeId && entry.StartMonth != null)
            .GroupBy(entry => entry.StartMonth!.Value)
            .Select(group => new { Month = group.Key, Day = group.Max(entry => entry.StartDay) ?? 0 })
            .ToListAsync(cancellationToken);

        var ends = await db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.UniverseId == universeId && entry.EndMonth != null)
            .GroupBy(entry => entry.EndMonth!.Value)
            .Select(group => new { Month = group.Key, Day = group.Max(entry => entry.EndDay) ?? 0 })
            .ToListAsync(cancellationToken);

        var scenes = await db.Scenes.AsNoTracking()
            .Where(scene => scene.Story!.UniverseId == universeId && scene.Month != null)
            .GroupBy(scene => scene.Month!.Value)
            .Select(group => new { Month = group.Key, Day = group.Max(scene => scene.Day) ?? 0 })
            .ToListAsync(cancellationToken);

        var eraStarts = await db.EntityEras.AsNoTracking()
            .Where(era => era.Entity!.UniverseId == universeId && era.StartMonth != null)
            .GroupBy(era => era.StartMonth!.Value)
            .Select(group => new { Month = group.Key, Day = group.Max(era => era.StartDay) ?? 0 })
            .ToListAsync(cancellationToken);

        var eraEnds = await db.EntityEras.AsNoTracking()
            .Where(era => era.Entity!.UniverseId == universeId && era.EndMonth != null)
            .GroupBy(era => era.EndMonth!.Value)
            .Select(group => new { Month = group.Key, Day = group.Max(era => era.EndDay) ?? 0 })
            .ToListAsync(cancellationToken);

        var periodStarts = await db.RelationshipPeriods.AsNoTracking()
            .Where(period => period.Relationship!.UniverseId == universeId && period.StartMonth != null)
            .GroupBy(period => period.StartMonth!.Value)
            .Select(group => new { Month = group.Key, Day = group.Max(period => period.StartDay) ?? 0 })
            .ToListAsync(cancellationToken);

        var periodEnds = await db.RelationshipPeriods.AsNoTracking()
            .Where(period => period.Relationship!.UniverseId == universeId && period.EndMonth != null)
            .GroupBy(period => period.EndMonth!.Value)
            .Select(group => new { Month = group.Key, Day = group.Max(period => period.EndDay) ?? 0 })
            .ToListAsync(cancellationToken);

        var used = new Dictionary<int, int>();
        foreach (var row in starts.Concat(ends).Concat(scenes).Concat(eraStarts).Concat(eraEnds).Concat(periodStarts).Concat(periodEnds))
        {
            used[row.Month] = Math.Max(used.GetValueOrDefault(row.Month), row.Day);
        }

        return used;
    }

    // ---------- Refusals ----------

    /// <summary>An id that is not one of this calendar's months, said the same way whether it exists anywhere else or not.</summary>
    private static Dictionary<string, string[]>? Foreign(IReadOnlyList<ChronologyCalendarMonthRequest> wanted, HashSet<Guid> own)
    {
        var errors = new Dictionary<string, string[]>();
        for (var index = 0; index < wanted.Count; index++)
        {
            if (wanted[index].Id is { } id && !own.Contains(id))
            {
                errors[$"months[{index}].id"] = ["Choose months from this calendar."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    private static IResult MonthInUse(List<MonthUse> inUse) =>
        Results.Problem(
            title: inUse.Count == 1 ? "Month is in use" : "Months are in use",
            detail: string.Join("; ", inUse.Select(month => $"{Quote(month.Name)} is still used by {Uses(month)}"))
                + ", counting anything in the Trash. Change those dates before removing it.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = MonthInUseCode,
                ["monthIds"] = inUse.Select(month => month.Id).ToList(),
            });

    /// <summary>What dates a month: scenes and moments as it always said, and entries' eras when any are (Issue #41).</summary>
    private static string Uses(MonthUse month)
    {
        var others = month.UseCount - month.EntryEraCount - month.PeriodCount;
        var parts = new List<string>();

        if (others > 0)
        {
            parts.Add(Count(others, "dated scene or timeline moment", "dated scenes or timeline moments"));
        }

        if (month.EntryEraCount > 0)
        {
            parts.Add(Count(month.EntryEraCount, "era of an entry", "eras of entries"));
        }

        if (month.PeriodCount > 0)
        {
            parts.Add(Count(month.PeriodCount, "period of a relation", "periods of relations"));
        }

        return string.Join(" and ", parts);
    }

    private static IResult Incompatible(string detail) =>
        Results.Problem(
            title: "Some dates don't fit",
            detail: detail,
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = DatesIncompatibleCode });

    private static IResult Changed() =>
        Results.Problem(
            title: "Chronology changed",
            detail: "Something changed in this calendar or its dates while this was being saved. Reload the chronology and try again.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ChangedCode });

    private static string Quote(string? name) => $"\"{name}\"";

    private static string Count(int count, string one, string many) => count == 1 ? $"1 {one}" : $"{count} {many}";
}
