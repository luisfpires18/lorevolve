using LorEvolve.Api.Features.Chronology;

namespace LorEvolve.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A Canon moment that a Canon participant could not have been at, because the whole
/// moment falls before that participant's declared birth year.
///
/// Only a provable contradiction is reported. An exact date is one year and compares
/// directly. A range is only reported when it ends before the birth - a range that
/// straddles the birth year contains years the participant was alive for, and claiming a
/// contradiction there would be claiming something the author never said. Approximate and
/// undated moments never reach here at all.
///
/// The boundary is not an error: a moment in the very year of a birth is a birth scene.
/// </summary>
public sealed class CanonTimelineBeforeBirthRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-LIFE-002";

    public CanonConflictSeverity Severity => CanonConflictSeverity.High;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var chronology = await UniverseChronology.LoadAsync(context.Db, context.UniverseId, cancellationToken);
        var lifespans = await CanonLifespanReader.LoadLifespansAsync(context, chronology, cancellationToken);
        var moments = await CanonLifespanReader.LoadComparableMomentsAsync(
            context, chronology, lifespans, cancellationToken);

        return [.. moments.OrderBy(moment => moment.EntryId).SelectMany(moment => Findings(moment, lifespans))];
    }

    /// <summary>
    /// One finding per participant at fault. A moment may name a whole army, and each
    /// participant is separately fixable, so one of them being wrong must not bury another.
    /// </summary>
    private IEnumerable<CanonFinding> Findings(
        CanonMoment moment,
        Dictionary<Guid, CanonLifespan> lifespans)
    {
        var latest = CanonLifespanReader.LatestPoint(moment);

        foreach (var participant in moment.Participants.OrderBy(id => id))
        {
            if (lifespans.TryGetValue(participant, out var lifespan)
                && lifespan.Birth is { } birth
                && latest < birth.Point)
            {
                yield return Finding(moment, lifespan, birth);
            }
        }
    }

    private CanonFinding Finding(CanonMoment moment, CanonLifespan lifespan, LifespanFact birth)
    {
        var who = CanonRuleText.Quoted(lifespan.EntityName);
        var what = CanonRuleText.Quoted(moment.Title);
        var when = CanonLifespanReader.DatePhrase(moment, byLatest: true);
        var born = birth.YearText;

        var title = $"Canon moment {what} {when}, before {who} is born in {born}";

        var explanation =
            $"The timeline entry {what} is marked Canon and {when}. {who} takes part in it and is " +
            $"marked Canon, and its {birth.FieldName} field gives the year {born}, so the whole " +
            "moment happens before it exists. Either the moment's date or the birth year is wrong, " +
            "or this participant does not belong to this moment.";

        return new CanonFinding(
            RuleCode,
            Severity,

            // The moment, the participant, and the field the birth year came from. Editing
            // either year refreshes this conflict; moving the meaning to a different field
            // is a different fact and opens a new one.
            [moment.EntryId, lifespan.EntityId, birth.FieldDefinitionId],
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.TimelineEntry, moment.EntryId, "entry"),
                new CanonFindingSubject(CanonSubjectKind.Entity, lifespan.EntityId, "participant"),
                new CanonFindingSubject(CanonSubjectKind.EntityField, birth.FieldDefinitionId, "birth"),
            ]);
    }
}
