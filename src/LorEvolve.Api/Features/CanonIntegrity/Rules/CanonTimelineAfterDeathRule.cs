using LorEvolve.Api.Features.Chronology;

namespace LorEvolve.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A Canon moment that a Canon participant could not have been at, because the whole
/// moment falls after that participant's declared death year.
///
/// The mirror of <see cref="CanonTimelineBeforeBirthRule"/>, and provable on the same
/// terms: a range only counts when it *starts* after the death, since one that straddles
/// the death year contains years the participant was alive for.
///
/// A separate rule rather than a second branch of the same one, because the two carry
/// different codes and an author dismisses them separately - a ghost at a funeral is a
/// choice someone may well want to keep.
/// </summary>
public sealed class CanonTimelineAfterDeathRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-LIFE-003";

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

    private IEnumerable<CanonFinding> Findings(
        CanonMoment moment,
        Dictionary<Guid, CanonLifespan> lifespans)
    {
        var earliest = CanonLifespanReader.EarliestPoint(moment);

        foreach (var participant in moment.Participants.OrderBy(id => id))
        {
            if (lifespans.TryGetValue(participant, out var lifespan)
                && lifespan.Death is { } death
                && earliest > death.Point)
            {
                yield return Finding(moment, lifespan, death);
            }
        }
    }

    private CanonFinding Finding(CanonMoment moment, CanonLifespan lifespan, LifespanFact death)
    {
        var who = CanonRuleText.Quoted(lifespan.EntityName);
        var what = CanonRuleText.Quoted(moment.Title);
        var when = CanonLifespanReader.DatePhrase(moment, byLatest: false);
        var died = death.YearText;

        var title = $"Canon moment {what} {when}, after {who} dies in {died}";

        var explanation =
            $"The timeline entry {what} is marked Canon and {when}. {who} takes part in it and is " +
            $"marked Canon, and its {death.FieldName} field gives the year {died}, so the whole " +
            "moment happens after it dies. Either the moment's date or the death year is wrong, or " +
            "this participant does not belong to this moment.";

        return new CanonFinding(
            RuleCode,
            Severity,
            [moment.EntryId, lifespan.EntityId, death.FieldDefinitionId],
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.TimelineEntry, moment.EntryId, "entry"),
                new CanonFindingSubject(CanonSubjectKind.Entity, lifespan.EntityId, "participant"),
                new CanonFindingSubject(CanonSubjectKind.EntityField, death.FieldDefinitionId, "death"),
            ]);
    }
}
