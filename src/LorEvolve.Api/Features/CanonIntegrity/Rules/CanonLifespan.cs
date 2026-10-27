using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Timeline;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// One year an author declared about an entity, the field that declared it, where it sits on the
/// universe's line, and how it reads.
/// </summary>
internal sealed record LifespanFact(Guid FieldDefinitionId, string FieldName, ChronologyPoint Point, string YearText);

/// <summary>
/// What one Canon entity says about when it existed. Either end may be missing: most lore
/// records a birth and nothing else, and a rule that needed both would fire on almost nothing.
/// </summary>
internal sealed record CanonLifespan(
    Guid EntityId,
    string EntityName,
    LifespanFact? Birth,
    LifespanFact? Death);

/// <summary>
/// A moment that makes a comparable claim about when it happened, already placed on the
/// universe's line at year precision.
///
/// Only <see cref="TimelineDateKind.Exact"/> and <see cref="TimelineDateKind.Range"/> reach
/// here. <c>Unknown</c> claims nothing, and <c>Approximate</c> claims a year with an
/// unstated margin - "around 400" cannot be shown to contradict anything, because nothing
/// in the model says how far around. Guessing a tolerance would be inventing a fact.
///
/// <see cref="End"/> is set for a range and null for an exact date.
/// </summary>
internal sealed record CanonMoment(
    Guid EntryId,
    string Title,
    TimelineDateKind Kind,
    ChronologyPoint Start,
    string StartText,
    ChronologyPoint? End,
    string? EndText,
    IReadOnlyList<Guid> Participants);

/// <summary>
/// The reading half of the chronology rules: which entities declared a lifespan, which
/// moments are comparable to one, and whether comparing them is sound at all.
///
/// Kept apart from the rules themselves because three rules ask the same questions of the
/// same tables, and because what counts as a *provable* contradiction is the delicate part
/// - it is easier to review in one place than spread across three.
///
/// Every comparison goes through <see cref="ChronologyPoint"/>, the one ordering the timeline
/// uses too. Nothing here compares a formatted date or an era's name.
/// </summary>
internal static class CanonLifespanReader
{
    /// <summary>
    /// Every Canon entity in this universe that declares a birth or death year LorEvolve can place,
    /// keyed by id.
    ///
    /// Meaning comes from <see cref="EntityFieldDefinition.Semantic"/> and nothing else. No
    /// field name is read, so renaming "Born" to "Year of birth" changes the wording of a
    /// conflict and never whether it is found.
    ///
    /// On a universe that names its eras a year counts only once it says which era it is in. A
    /// bare number there - usually one written before the eras existed - is left out rather than
    /// read as a year in some era LorEvolve would have to pick.
    /// </summary>
    public static async Task<Dictionary<Guid, CanonLifespan>> LoadLifespansAsync(
        CanonRuleContext context,
        UniverseChronology chronology,
        CancellationToken cancellationToken)
    {
        var rows = await context.Db.EntityFieldValues.AsNoTracking()
            .Where(value =>
                value.Entity!.UniverseId == context.UniverseId

                // A trashed entry declares nothing. Its values are still stored and come back
                // intact on restore, but while it is in the Trash it is not part of the world
                // and no rule may reason from it.
                && value.Entity.DeletedAt == null
                && value.Entity.CanonStatus == CanonStatus.Canon
                && value.NumberValue != null

                // An archived field declares nothing either (Issue #39): its years are kept, and read again once it is restored.
                && value.FieldDefinition!.ArchivedAt == null
                && (value.FieldDefinition.Semantic == EntityFieldSemantic.BirthYear
                    || value.FieldDefinition.Semantic == EntityFieldSemantic.DeathYear))
            .Select(value => new Row(
                value.EntityId,
                value.Entity!.Name,
                value.FieldDefinitionId,
                value.FieldDefinition!.Name,
                value.FieldDefinition.Semantic!.Value,
                value.NumberValue!.Value,
                value.EraId))
            .ToListAsync(cancellationToken);

        return rows
            .Where(row => chronology.Point(row.EraId, row.Year) is not null)
            .GroupBy(row => row.EntityId)
            .ToDictionary(group => group.Key, group => Lifespan(group, chronology));
    }

    /// <summary>
    /// Every Canon moment in this universe that dates itself precisely enough to compare,
    /// with the Canon participants that declared a lifespan.
    ///
    /// On a universe that names its eras, every moment carries its era and places exactly; one
    /// written before the eras existed carries none and is left out, for the same reason a bare
    /// birth year is.
    ///
    /// On the plain reckoning, returns nothing at all when the timeline's free-text labels name
    /// more than one era. Those labels are display metadata with no order behind them, and a
    /// birth year carries no label of its own, so "Second Age 3441" and a birth year of 3441 are
    /// not two points on one line. Rather than guess, the rules stand down - until the author
    /// names the eras, which is what makes the comparison sound.
    /// </summary>
    public static async Task<IReadOnlyList<CanonMoment>> LoadComparableMomentsAsync(
        CanonRuleContext context,
        UniverseChronology chronology,
        IReadOnlyDictionary<Guid, CanonLifespan> lifespans,
        CancellationToken cancellationToken)
    {
        if (lifespans.Count == 0
            || (!chronology.NamesEras && !await HasSingleLabelAsync(context, cancellationToken)))
        {
            return [];
        }

        var subjects = lifespans.Keys.ToHashSet();

        var rows = await context.Db.TimelineEntries.AsNoTracking()
            .Where(entry =>
                entry.UniverseId == context.UniverseId
                && entry.DeletedAt == null
                && entry.CanonStatus == CanonStatus.Canon
                && (entry.DateKind == TimelineDateKind.Exact || entry.DateKind == TimelineDateKind.Range)
                && entry.EntityLinks.Any(link =>
                    link.Entity!.DeletedAt == null
                    && link.Entity.CanonStatus == CanonStatus.Canon
                    && subjects.Contains(link.EntityId)))
            .Select(entry => new MomentRow(
                entry.Id,
                entry.Title,
                entry.DateKind,
                entry.StartYear,
                entry.StartEraId,
                entry.EndYear,
                entry.EndEraId,
                entry.EntityLinks
                    .Where(link => link.Entity!.DeletedAt == null
                        && link.Entity.CanonStatus == CanonStatus.Canon
                        && subjects.Contains(link.EntityId))
                    .Select(link => link.EntityId)
                    .ToList()))
            .ToListAsync(cancellationToken);

        return [.. rows.Select(row => Moment(row, chronology)).OfType<CanonMoment>()];
    }

    /// <summary>
    /// True when this plain-reckoning timeline uses at most one free-text era label, which is
    /// the only case where a bare year on an entity and a year on a moment mean the same thing.
    /// Entries with no label count as the default reckoning, not as a second one.
    /// </summary>
    private static async Task<bool> HasSingleLabelAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken) =>
        await context.Db.TimelineEntries.AsNoTracking()
            .Where(entry => context.UniverseId == entry.UniverseId && entry.DeletedAt == null && entry.EraLabel != null && entry.EraLabel != "")
            .Select(entry => entry.EraLabel)
            .Distinct()
            .CountAsync(cancellationToken) <= 1;

    /// <summary>
    /// The last year a moment could possibly fall in. A range ends where it ends; an exact date
    /// is its own last year.
    /// </summary>
    public static ChronologyPoint LatestPoint(CanonMoment moment) => moment.End ?? moment.Start;

    /// <summary>The first year a moment could possibly fall in.</summary>
    public static ChronologyPoint EarliestPoint(CanonMoment moment) => moment.Start;

    /// <summary>
    /// How the moment's date reads in a sentence. A range is described by the end that
    /// proves the contradiction, so the author sees the same year the rule compared.
    /// </summary>
    public static string DatePhrase(CanonMoment moment, bool byLatest) =>
        (moment.Kind, byLatest) switch
        {
            (TimelineDateKind.Range, true) => $"ends in {moment.EndText}",
            (TimelineDateKind.Range, false) => $"starts in {moment.StartText}",
            _ => $"is dated {moment.StartText}",
        };

    /// <summary>A stored moment placed on the line, or null when either end cannot be placed.</summary>
    private static CanonMoment? Moment(MomentRow row, UniverseChronology chronology)
    {
        if (row.StartYear is not { } startYear || chronology.Point(row.StartEraId, startYear) is not { } start)
        {
            return null;
        }

        if (row.Kind != TimelineDateKind.Range)
        {
            return new CanonMoment(
                row.EntryId, row.Title, row.Kind, start, chronology.FormatYear(row.StartEraId, startYear),
                null, null, row.Participants);
        }

        if (row.EndYear is not { } endYear || chronology.Point(row.EndEraId, endYear) is not { } end)
        {
            return null;
        }

        return new CanonMoment(
            row.EntryId, row.Title, row.Kind,
            start, chronology.FormatYear(row.StartEraId, startYear),
            end, chronology.FormatYear(row.EndEraId, endYear),
            row.Participants);
    }

    /// <summary>
    /// Collapses one entity's declared years. Ordering before taking the first keeps the
    /// choice deterministic if a legacy row predates the one-meaning-per-type index.
    /// </summary>
    private static CanonLifespan Lifespan(IGrouping<Guid, Row> group, UniverseChronology chronology)
    {
        var ordered = group.OrderBy(row => row.FieldDefinitionId).ToList();

        return new CanonLifespan(
            group.Key,
            ordered[0].EntityName,
            Fact(ordered, EntityFieldSemantic.BirthYear, chronology),
            Fact(ordered, EntityFieldSemantic.DeathYear, chronology));
    }

    private static LifespanFact? Fact(List<Row> rows, EntityFieldSemantic semantic, UniverseChronology chronology) =>
        rows.Where(row => row.Semantic == semantic)
            .Select(row => new LifespanFact(
                row.FieldDefinitionId,
                row.FieldName,
                chronology.Point(row.EraId, row.Year)!.Value,
                chronology.FormatYear(row.EraId, row.Year)))
            .FirstOrDefault();

    private sealed record Row(
        Guid EntityId,
        string EntityName,
        Guid FieldDefinitionId,
        string FieldName,
        EntityFieldSemantic Semantic,
        double Year,
        Guid? EraId);

    private sealed record MomentRow(
        Guid EntryId,
        string Title,
        TimelineDateKind Kind,
        int? StartYear,
        Guid? StartEraId,
        int? EndYear,
        Guid? EndEraId,
        List<Guid> Participants);
}
