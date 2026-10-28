using System.Globalization;
using LorEvolve.Api.Features.RuleValidation;

namespace LorEvolve.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A participant with more Canon moments of one event kind by one method than a world rule's structured check allows (ADR 0034).
///
/// Only rules the author gave that check are read, and only through explicit ids: the rule's event kind, method and limit, and
/// each moment's stored event kind, method and participant. A rule's words, a moment's words and the entries linked to a moment
/// mean nothing here. The count is <see cref="WorldRuleOccurrences"/>, the same one a rule's check state shows.
///
/// Medium, as a relationship constraint is (ADR 0023): the limit is the author's own configuration, so a moment that breaks it is
/// saved and reported, never refused - the author may be recording exactly the contradiction they mean to resolve.
/// </summary>
public sealed class CanonWorldRuleOccurrenceRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-WORLD-001";

    public CanonConflictSeverity Severity => CanonConflictSeverity.Medium;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var counts = await WorldRuleOccurrences.CountAsync(context.Db, context.UniverseId, null, cancellationToken);

        return [.. counts.SelectMany(count => count.OverLimit.Select(participant => Finding(count.Rule, participant)))];
    }

    private CanonFinding Finding(WorldRuleOccurrences.RuleRow rule, ParticipantCount participant)
    {
        var who = CanonRuleText.Quoted(participant.Name);
        var ruleName = CanonRuleText.Quoted(rule.RuleTitle);
        var eventKind = CanonRuleText.Quoted(rule.EventKindName);
        var method = CanonRuleText.Quoted(rule.MethodName);
        var count = participant.Moments.Count.ToString(CultureInfo.InvariantCulture);
        var limit = rule.MaxOccurrences.ToString(CultureInfo.InvariantCulture);
        var moments = string.Join(", ", participant.Moments.Select(moment => CanonRuleText.Quoted(moment.Title)));

        var title = $"{who} has {count} {eventKind} moments by {method}; {ruleName} allows at most {limit}";

        var explanation =
            $"The world rule {ruleName} allows each participant at most {limit} Canon {eventKind} " +
            $"{(rule.MaxOccurrences == 1 ? "moment" : "moments")} by {method}. {who} is the participant of {count}: {moments}. " +
            "Either one of these moments names the wrong event kind, method or participant, one should not be Canon yet, " +
            "or the limit is not what this world says. Only these recorded details are read - never the moments' words or the rule's.";

        return new CanonFinding(
            RuleCode,
            Severity,

            // The rule, the event kind and method it checked, the participant, and the moments counted - as a set. A different
            // rule, method, participant or set of moments is a different problem: a moment added to the set opens a new finding
            // rather than extending a dismissal made about fewer. The limit is not an id, so changing it rewords this one.
            [rule.RuleId, rule.EventKindId, rule.MethodId, participant.EntityId, .. participant.Moments.Select(moment => moment.EntryId)],
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.WorldRule, rule.RuleId, "rule"),
                new CanonFindingSubject(CanonSubjectKind.Entity, participant.EntityId, "participant"),
                .. participant.Moments.Select(moment => new CanonFindingSubject(CanonSubjectKind.TimelineEntry, moment.EntryId, "moment")),
            ],
            UnorderedFrom: 4);
    }
}
