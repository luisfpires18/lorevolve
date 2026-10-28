using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.RuleValidation;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// The checks of the definitions phase 2 of issue 59 added (ADR 0062): relationship kinds, the reckoning, event kinds and
/// methods - each held to its own screen's validators and uniqueness, and to one more rule an AI is held to and a person is
/// not: nothing already dated or linked may be reinterpreted. A kind in use keeps its direction; existing date periods and
/// months keep their order and stay; a period that dates anything keeps the way its years count; a calendar does not start
/// over simple dates already using months. A person still does all of that by hand, where the Chronology and Types screens
/// show what it moves.
/// </summary>
internal sealed partial class AiChangeChecker
{
    private async Task CheckRelationshipKindAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var kind = (RelationshipKindValues)work.Proposed;
        if (work.Action == AiChangeAction.Update)
        {
            var stored = await AiChangeSnapshots.RelationshipKindAsync(db, universeId, work.TargetId!.Value, cancellationToken);
            if (stored is null)
            {
                work.Problem(AiChangeCodes.NotFound, "This relationship kind isn't in this universe any more.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone changed this relationship kind after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }

            if (stored.Symmetric != kind.Symmetric
                && await db.Relationships.AnyAsync(relationship => relationship.RelationshipTypeId == work.TargetId, cancellationToken))
            {
                work.Problem(AiChangeCodes.Unsupported, "Relationships already use this kind, so it can't change between reading the same both ways and having a direction: every one of them would read differently. Change it by hand in LorEvolve if that is meant.", "symmetric");
            }
        }

        var constraints = kind.Constraints ?? RelationshipTypeCanonConstraints.None;
        work.Problems(RelationshipValidation.ValidateType(
            new RelationshipTypeRequest(kind.Name, kind.InverseName, kind.Symmetric, kind.Description, null, constraints, kind.FamilySemantic),
            constraints,
            kind.FamilySemantic));

        var taken = await db.RelationshipTypes.AsNoTracking()
            .AnyAsync(type => type.UniverseId == universeId && type.Name == kind.Name && type.Id != work.TargetId, cancellationToken);
        if (taken)
        {
            work.Problem(AiChangeCodes.Duplicate, $"This universe already has a relationship kind called {kind.Name}.", "name");
        }
        else if (Earlier(works, work, AiChangeResource.RelationshipType).Any(other => ((RelationshipKindValues)other.Proposed).Name == kind.Name))
        {
            work.Problem(AiChangeCodes.Duplicate, $"Another change in this proposal also names a relationship kind {kind.Name}.", "name");
        }
    }

    private async Task CheckChronologyAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var wanted = (ChronologyValues)work.Proposed;
        var stored = await AiChangeSnapshots.ChronologyAsync(db, universeId, cancellationToken);
        if (!AiChangeSnapshots.Same(stored, work.Before))
        {
            work.Conflict("Someone changed this universe's date periods or calendar after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
        }

        if (!AiChangeSnapshots.Same(stored.Eras, wanted.Eras))
        {
            work.Problems(ChronologyValidation.Validate(new ChronologyRequest(
                [.. wanted.Eras.Select(era => new ChronologyEraRequest(era.Id, era.Name, era.Abbreviation, era.Direction, era.Label))])));
            Keeps(work, "eras", stored.Eras.Select(era => era.Id!.Value).ToList(), wanted.Eras.Select(era => era.Id).ToList(), "date period");

            var described = (await ChronologyEndpoints.DescribeAsync(db, universeId, cancellationToken)).Eras.ToDictionary(era => era.Id);
            foreach (var era in wanted.Eras.Where(era => era.Id is not null))
            {
                if (stored.Eras.FirstOrDefault(was => was.Id == era.Id) is { } was && was.Direction != era.Direction
                    && described.TryGetValue(era.Id!.Value, out var use)
                    && use.MomentCount + use.YearCount + use.SceneCount + use.EntryEraCount + use.PeriodCount > 0)
                {
                    work.Problem(AiChangeCodes.Unsupported, $"Things are already dated in {was.Name}, so the way its years count can't be turned around here: each of them would move. Change it by hand in Chronology if that is meant.", "eras");
                }
            }
        }

        if (wanted.Months is { } months && !AiChangeSnapshots.Same(stored.Months, months))
        {
            work.Problems(ChronologyValidation.ValidateCalendar(new ChronologyCalendarRequest(
                [.. months.Select(month => new ChronologyCalendarMonthRequest(month.Id, month.Name, month.Abbreviation, month.Days))])));

            if (stored.Months is null)
            {
                if ((await ChronologyCalendarEndpoints.SimpleMonthsInUseAsync(db, universeId, cancellationToken)).Count > 0)
                {
                    work.Problem(AiChangeCodes.Unsupported, "Some dates already use simple month numbers, and a custom calendar would rewrite them into its months. Turn the calendar on by hand in Chronology, where it says what moves.", "months");
                }
            }
            else
            {
                Keeps(work, "months", stored.Months.Select(month => month.Id!.Value).ToList(), months.Select(month => month.Id).ToList(), "month");
                var usage = (await ChronologyCalendarEndpoints.MonthsAsync(db, universeId, cancellationToken)).ToDictionary(month => month.Id);
                foreach (var month in months.Where(month => month.Id is { } id && usage.TryGetValue(id, out var use) && use.MaxDayUsed > month.Days))
                {
                    work.Problem(AiChangeCodes.Invalid, $"A date uses day {usage[month.Id!.Value].MaxDayUsed} of {month.Name}, so it can't be shorter than that.", "months");
                }
            }
        }
    }

    /// <summary>
    /// The stored items, every one still there and in the order it had; new ones anywhere; ids that are not this universe's
    /// refused. What an AI change to the reckoning may do, so nothing dated is moved or left in a period that is gone.
    /// </summary>
    private static void Keeps(AiChangeWork work, string field, List<Guid> stored, List<Guid?> wanted, string noun)
    {
        var existing = wanted.OfType<Guid>().ToList();
        if (existing.Any(id => !stored.Contains(id)) || existing.Distinct().Count() != existing.Count)
        {
            work.Problem(AiChangeCodes.NotFound, $"Each existing {noun} is listed once, by an id from get_change_options.", field);
        }
        else if (stored.Any(id => !existing.Contains(id)))
        {
            work.Problem(AiChangeCodes.Unsupported, $"Every existing {noun} has to stay: list them all. One is removed by hand in Chronology, once nothing is dated in it.", field);
        }
        else if (!stored.SequenceEqual(existing))
        {
            work.Problem(AiChangeCodes.Unsupported, $"Existing {noun}s keep their order here: moving one moves everything dated in it. Reorder them by hand in Chronology.", field);
        }
    }

    private async Task CheckTermAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var term = (TermValues)work.Proposed;
        if (work.Action == AiChangeAction.Update)
        {
            var stored = await AiChangeSnapshots.TermAsync(db, universeId, work.TargetId!.Value, cancellationToken);
            if (stored is null)
            {
                work.Problem(AiChangeCodes.NotFound, "This event kind or method isn't in this universe any more.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone renamed this after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }
        }

        work.Problems(ValidationTermEndpoints.ValidateName(term.Name, term.Kind));
        var normalized = ValidationTerm.Normalize(term.Name);
        if (await db.ValidationTerms.AsNoTracking().AnyAsync(
                other => other.UniverseId == universeId && other.Kind == term.Kind && other.NormalizedName == normalized && other.Id != work.TargetId,
                cancellationToken))
        {
            work.Problem(AiChangeCodes.Duplicate, $"This universe already has {(term.Kind == ValidationTermKind.EventKind ? "an event kind" : "a method")} called {term.Name}.", "name");
        }
        else if (Earlier(works, work, AiChangeResource.ValidationTerm).Any(other => other.Proposed is TermValues earlier
                     && earlier.Kind == term.Kind
                     && ValidationTerm.Normalize(earlier.Name) == normalized))
        {
            work.Problem(AiChangeCodes.Duplicate, $"Another change in this proposal also names {term.Name}.", "name");
        }
    }
}
