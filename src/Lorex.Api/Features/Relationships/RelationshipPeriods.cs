using Lorex.Api.Data;
using Lorex.Api.Features.Chronology;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Relationships;

/// <summary>
/// When a relationship holds (Issue #18): checking its periods with the link's own save, reading them back by today's names,
/// and deciding whether a link holds at a point in time or during one entry's era. One rule for every relationship of every
/// Lore type - never a character-only model.
///
/// <b>Explicit only.</b> A link holds when a period says so: its dates, or an era it names - and that era's own dates, read
/// live, never copied. Nothing is worked out from era order, from a moment on the timeline or from another link, and periods
/// that overlap simply hold together. A link with no period holds always. A period that cannot be compared with the time asked
/// about - an era with no dates, a date this reckoning cannot place - says so (<see cref="RelationshipValidity.Unplaced"/>)
/// rather than being guessed in or out.
/// </summary>
internal static class RelationshipPeriods
{
    public const int MaxPeriods = 20;

    /// <summary>
    /// The periods a save sends, checked against the link's two ends and the universe's chronology: each one a dated span (at
    /// least one bound; either may be open) or one era of either end, never both. Errors keyed under <c>periods[i]</c>.
    /// </summary>
    public static async Task<Dictionary<string, string[]>?> CheckAsync(
        LorexDbContext db,
        Guid universeId,
        Guid sourceEntityId,
        Guid targetEntityId,
        IReadOnlyList<RelationshipPeriodInput?> periods,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        if (periods.Count > MaxPeriods)
        {
            errors["periods"] = [$"A relation can have at most {MaxPeriods} periods."];
            return errors;
        }

        var eraIds = periods.Select(period => period?.EntityEraId).OfType<Guid>().Distinct().ToList();
        var eras = eraIds.Count == 0 ? [] : await db.EntityEras.AsNoTracking()
            .Where(era => eraIds.Contains(era.Id)
                && (era.EntityId == sourceEntityId || era.EntityId == targetEntityId)
                && era.Entity!.UniverseId == universeId)
            .Select(era => era.Id)
            .ToListAsync(cancellationToken);

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        for (var index = 0; index < periods.Count; index++)
        {
            var key = $"periods[{index}]";

            if (periods[index] is not { } period)
            {
                errors[key] = ["Send each period as an object."];
                continue;
            }

            if (period.EntityEraId is { } eraId)
            {
                if (period.Start is not null || period.End is not null)
                {
                    errors[key] = ["A period is either dates or an era, not both."];
                }
                else if (!eras.Contains(eraId))
                {
                    errors[$"{key}.entityEraId"] = ["Choose an era of one of the two entries this connects."];
                }

                continue;
            }

            if (period.Start is null && period.End is null)
            {
                errors[key] = ["Give the period a start, an end or both, or choose an era."];
                continue;
            }

            ChronologySpans.Check(period.Start, period.End, key, chronology, errors);
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>The stored periods of one link as a save would send them - what an edit that leaves them out keeps.</summary>
    public static async Task<List<RelationshipPeriodInput?>> StoredAsync(LorexDbContext db, Guid relationshipId, CancellationToken cancellationToken) =>
    [
        .. (await db.RelationshipPeriods.AsNoTracking()
                .Where(period => period.RelationshipId == relationshipId)
                .OrderBy(period => period.SortOrder)
                .ToListAsync(cancellationToken))
            .Select(period => (RelationshipPeriodInput?)new RelationshipPeriodInput(Start(period), End(period), period.EntityEraId)),
    ];

    /// <summary>
    /// Replaces a link's periods with the ones sent, in their order: the old rows removed and the new ones added on the context,
    /// so the caller's <c>SaveChanges</c> writes both or neither. A new link has none to remove.
    /// </summary>
    public static async Task ReplaceAsync(
        LorexDbContext db,
        Guid relationshipId,
        IReadOnlyList<RelationshipPeriodInput?> periods,
        CancellationToken cancellationToken,
        bool isNew = false)
    {
        if (!isNew)
        {
            db.RelationshipPeriods.RemoveRange(
                await db.RelationshipPeriods.Where(period => period.RelationshipId == relationshipId).ToListAsync(cancellationToken));
        }

        var order = 0;
        foreach (var period in periods.OfType<RelationshipPeriodInput>())
        {
            db.RelationshipPeriods.Add(new RelationshipPeriod
            {
                Id = Guid.NewGuid(),
                RelationshipId = relationshipId,
                SortOrder = order++,
                EntityEraId = period.EntityEraId,
                StartEraId = period.Start?.EraId,
                StartYear = period.Start?.Year,
                StartMonth = period.Start?.Month,
                StartMonthId = period.Start?.MonthId,
                StartDay = period.Start?.Day,
                EndEraId = period.End?.EraId,
                EndYear = period.End?.Year,
                EndMonth = period.End?.Month,
                EndMonthId = period.End?.MonthId,
                EndDay = period.End?.Day,
            });
        }
    }

    /// <summary>Every period of these links, by link and in order, with the eras they name read as they are now. One query.</summary>
    public static async Task<Dictionary<Guid, List<RelationshipPeriodResponse>>> ReadAsync(
        LorexDbContext db,
        IReadOnlyCollection<Guid> relationshipIds,
        CancellationToken cancellationToken)
    {
        if (relationshipIds.Count == 0)
        {
            return [];
        }

        var rows = await db.RelationshipPeriods.AsNoTracking()
            .Where(period => relationshipIds.Contains(period.RelationshipId))
            .OrderBy(period => period.SortOrder)
            .Select(period => new
            {
                Period = period,
                EraName = period.EntityEra != null ? period.EntityEra.Name : null,
                EraEntityId = period.EntityEra != null ? (Guid?)period.EntityEra.EntityId : null,
                EraEntityName = period.EntityEra != null ? period.EntityEra.Entity!.Name : null,
                Era = period.EntityEra,
            })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(row => row.Period.RelationshipId)
            .ToDictionary(
                group => group.Key,
                group => group.Select(row => new RelationshipPeriodResponse(
                    row.Period.Id,
                    Start(row.Period),
                    End(row.Period),
                    row.Period.EntityEraId,
                    row.EraName,
                    row.EraEntityId,
                    row.EraEntityName,
                    row.Era?.StartYear is { } startYear
                        ? new ChronologyValue(row.Era.StartEraId, startYear, row.Era.StartMonth, row.Era.StartDay, row.Era.StartMonthId)
                        : null,
                    row.Era?.EndYear is { } endYear
                        ? new ChronologyValue(row.Era.EndEraId, endYear, row.Era.EndMonth, row.Era.EndDay, row.Era.EndMonthId)
                        : null)).ToList());
    }

    private static ChronologyValue? Start(RelationshipPeriod period) =>
        period.StartYear is { } year ? new ChronologyValue(period.StartEraId, year, period.StartMonth, period.StartDay, period.StartMonthId) : null;

    private static ChronologyValue? End(RelationshipPeriod period) =>
        period.EndYear is { } year ? new ChronologyValue(period.EndEraId, year, period.EndMonth, period.EndDay, period.EndMonthId) : null;

    // ---------- When a link holds ----------

    /// <summary>
    /// Whether a link holds during one entry's era: always with no period; during it when a period names that era, or when a
    /// period's dates - its own, or those of the other end's era it names - share a moment with the era's dates; unplaced when
    /// one of those cannot be compared, the era having no dates or the reckoning no answer; otherwise not at all (null). A
    /// period naming another era of the same entry says the link holds then, and so never during this one, whatever the
    /// eras' dates: the author placed it, and nothing is worked out from overlapping eras.
    /// </summary>
    public static RelationshipValidity? During(
        IReadOnlyList<RelationshipPeriodResponse> periods,
        Guid eraId,
        Guid entityId,
        ChronologyValue? eraStart,
        ChronologyValue? eraEnd,
        UniverseChronology chronology)
    {
        if (periods.Count == 0)
        {
            return RelationshipValidity.Timeless;
        }

        if (periods.Any(period => period.EntityEraId == eraId))
        {
            return RelationshipValidity.During;
        }

        var others = periods.Where(period => period.EntityEraId is null || period.EraEntityId != entityId).ToList();
        var dated = eraStart is not null || eraEnd is not null;
        return Overlapping(others, eraStart, eraEnd, dated, chronology);
    }

    /// <summary>
    /// Whether a link holds at a point - itself as precise as written, a year being the whole year: always with no period;
    /// during it when a period's dates, or the dates of the era it names, share a moment with it; unplaced when that cannot be
    /// said; otherwise not at all (null).
    /// </summary>
    public static RelationshipValidity? At(
        IReadOnlyList<RelationshipPeriodResponse> periods,
        ChronologyValue point,
        UniverseChronology chronology) =>
        periods.Count == 0 ? RelationshipValidity.Timeless : Overlapping(periods, point, point, dated: true, chronology);

    private static RelationshipValidity? Overlapping(
        IReadOnlyList<RelationshipPeriodResponse> periods,
        ChronologyValue? from,
        ChronologyValue? to,
        bool dated,
        UniverseChronology chronology)
    {
        var unplaced = false;

        foreach (var period in periods)
        {
            var (start, end) = period.EntityEraId is null ? (period.Start, period.End) : (period.EraStart, period.EraEnd);

            if (start is null && end is null)
            {
                // An era with no dates: it cannot be placed against anything but itself.
                unplaced = true;
                continue;
            }

            if (!dated)
            {
                unplaced = true;
                continue;
            }

            switch (ChronologySpans.Overlap(start, end, from, to, chronology))
            {
                case true:
                    return RelationshipValidity.During;
                case null:
                    unplaced = true;
                    break;
            }
        }

        return unplaced ? RelationshipValidity.Unplaced : null;
    }
}
