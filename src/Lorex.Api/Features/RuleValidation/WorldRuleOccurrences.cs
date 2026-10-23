using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.RuleValidation;

/// <summary>
/// Counts what the one supported check needs, for every live rule of a universe or for one (ADR 0034). The Canon finding and a
/// rule's check state are both read from this count, so they cannot disagree.
///
/// <b>Explicit ids only.</b> A moment matches a rule when its stored event kind id and method id are the rule's - never because its
/// title, description, linked entries or anyone's name says anything. A participant is the entry id stored on the moment's details.
///
/// <b>The count.</b> For each rule: take the moments whose details name the rule's event kind or method; leave out any that names a
/// different one explicitly; of the rest, count only Canon moments, as every Canon rule reads Canon; a moment missing its event kind,
/// its method or its participant, or whose participant is in the Trash, may match but cannot be counted, and says so; group what is
/// left by participant. A participant with more moments than the limit is over it. An uncounted moment can only add to some count,
/// so an over-limit participant stands regardless - but a rule with uncounted moments is never said to hold.
///
/// Two queries for a whole universe however many rules it has, reading ids, titles and statuses only - never an article, prose, a
/// story or an idea. Nothing is written.
/// </summary>
internal static class WorldRuleOccurrences
{
    public static async Task<IReadOnlyList<RuleCount>> CountAsync(
        LorexDbContext db,
        Guid universeId,
        Guid? ruleId,
        CancellationToken cancellationToken)
    {
        var checks = db.WorldRuleValidations.AsNoTracking()
            .Where(validation => validation.WorldRule!.UniverseId == universeId && validation.WorldRule.DeletedAt == null);

        if (ruleId is { } only)
        {
            checks = checks.Where(validation => validation.WorldRuleId == only);
        }

        var rules = await checks
            .Select(validation => new RuleRow(
                validation.WorldRuleId,
                validation.WorldRule!.Title,
                validation.Kind,
                validation.MaxOccurrences,
                validation.EventKindTermId,
                validation.EventKindTerm!.Name,
                validation.EventKindTerm.Kind,
                validation.EventKindTerm.UniverseId,
                validation.MethodTermId,
                validation.MethodTerm!.Name,
                validation.MethodTerm.Kind,
                validation.MethodTerm.UniverseId))
            .ToListAsync(cancellationToken);

        if (rules.Count == 0)
        {
            return [];
        }

        var eventKinds = rules.Select(rule => rule.EventKindId).Distinct().ToList();
        var methods = rules.Select(rule => rule.MethodId).Distinct().ToList();

        var moments = await db.TimelineEntryValidations.AsNoTracking()
            .Where(details => details.TimelineEntry!.UniverseId == universeId
                && details.TimelineEntry.DeletedAt == null
                && ((details.EventKindTermId != null && eventKinds.Contains(details.EventKindTermId.Value))
                    || (details.MethodTermId != null && methods.Contains(details.MethodTermId.Value))))
            .Select(details => new MomentRow(
                details.TimelineEntryId,
                details.TimelineEntry!.Title,
                details.TimelineEntry.CanonStatus,
                details.EventKindTermId,
                details.MethodTermId,
                details.ParticipantEntityId,
                details.ParticipantEntity!.Name,
                details.ParticipantEntity.DeletedAt,
                (Guid?)details.ParticipantEntity.UniverseId))
            .ToListAsync(cancellationToken);

        return [.. rules.OrderBy(rule => rule.RuleId).Select(rule => Count(rule, moments, universeId))];
    }

    private static RuleCount Count(RuleRow rule, List<MomentRow> moments, Guid universeId)
    {
        if (ProblemOf(rule, universeId) is { } problem)
        {
            return new RuleCount(rule, problem, [], 0, 0, []);
        }

        var participants = new Dictionary<Guid, (string Name, List<CountedMoment> Moments)>();
        var uncounted = new List<WorldRuleUncountedMoment>();
        int counted = 0, notCanon = 0;

        foreach (var moment in moments)
        {
            // A different event kind or method, stated explicitly, is a different event: not this rule's business.
            if ((moment.EventKindId is { } eventKind && eventKind != rule.EventKindId)
                || (moment.MethodId is { } method && method != rule.MethodId)
                || (moment.EventKindId is null && moment.MethodId is null))
            {
                continue;
            }

            if (moment.CanonStatus != CanonStatus.Canon)
            {
                notCanon++;
                continue;
            }

            UncountedReason? reason =
                moment.EventKindId is null ? UncountedReason.NoEventKind
                : moment.MethodId is null ? UncountedReason.NoMethod
                : moment.ParticipantId is null || moment.ParticipantUniverseId != universeId ? UncountedReason.NoParticipant
                : moment.ParticipantDeletedAt is not null ? UncountedReason.ParticipantInTrash
                : null;

            if (reason is { } why)
            {
                uncounted.Add(new WorldRuleUncountedMoment(moment.EntryId, moment.Title, why));
                continue;
            }

            counted++;
            var participantId = moment.ParticipantId!.Value;

            if (!participants.TryGetValue(participantId, out var group))
            {
                group = (moment.ParticipantName!, []);
                participants[participantId] = group;
            }

            group.Moments.Add(new CountedMoment(moment.EntryId, moment.Title));
        }

        return new RuleCount(
            rule,
            null,
            [
                .. participants
                    .Select(pair => new ParticipantCount(
                        pair.Key,
                        pair.Value.Name,
                        [.. pair.Value.Moments.OrderBy(item => item.Title, StringComparer.Ordinal).ThenBy(item => item.EntryId)]))
                    .OrderBy(participant => participant.Name, StringComparer.Ordinal)
                    .ThenBy(participant => participant.EntityId),
            ],
            counted,
            notCanon,
            [.. uncounted.OrderBy(item => item.Title, StringComparer.Ordinal).ThenBy(item => item.TimelineEntryId)]);
    }

    /// <summary>
    /// Why a stored check cannot be run, or null when it can. None of these can be written through the API or a restore; this is
    /// what stops a row that got here another way from ever reading as a rule that holds.
    /// </summary>
    private static string? ProblemOf(RuleRow rule, Guid universeId)
    {
        if (rule.Kind != WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod)
        {
            return "This rule's check is not one this version of Lorex knows, so it cannot be run.";
        }

        if (rule.MaxOccurrences is < 1 or > RuleValidationLimits.MaxOccurrencesCeiling)
        {
            return "This rule's limit is not a number of moments Lorex can count to, so the check cannot be run.";
        }

        if (rule.EventKindTermKind != ValidationTermKind.EventKind || rule.EventKindUniverseId != universeId)
        {
            return "The event kind this rule checks is not an event kind of this universe, so the check cannot be run.";
        }

        if (rule.MethodTermKind != ValidationTermKind.Method || rule.MethodUniverseId != universeId)
        {
            return "The method this rule checks is not a method of this universe, so the check cannot be run.";
        }

        return null;
    }

    internal sealed record RuleRow(
        Guid RuleId,
        string RuleTitle,
        WorldRuleValidationKind Kind,
        int MaxOccurrences,
        Guid EventKindId,
        string EventKindName,
        ValidationTermKind EventKindTermKind,
        Guid EventKindUniverseId,
        Guid MethodId,
        string MethodName,
        ValidationTermKind MethodTermKind,
        Guid MethodUniverseId);

    private sealed record MomentRow(
        Guid EntryId,
        string Title,
        CanonStatus CanonStatus,
        Guid? EventKindId,
        Guid? MethodId,
        Guid? ParticipantId,
        string? ParticipantName,
        DateTime? ParticipantDeletedAt,
        Guid? ParticipantUniverseId);
}

/// <summary>One Canon moment counted for a rule.</summary>
internal sealed record CountedMoment(Guid EntryId, string Title);

/// <summary>One participant's counted moments for a rule, by title.</summary>
internal sealed record ParticipantCount(Guid EntityId, string Name, IReadOnlyList<CountedMoment> Moments);

/// <summary>What counting one rule found. <see cref="Problem"/> set means nothing was counted and nothing holds.</summary>
internal sealed record RuleCount(
    WorldRuleOccurrences.RuleRow Rule,
    string? Problem,
    IReadOnlyList<ParticipantCount> Participants,
    int Counted,
    int NotCanon,
    IReadOnlyList<WorldRuleUncountedMoment> Uncounted)
{
    /// <summary>Every participant with more counted moments than the rule allows. Each is one Canon finding.</summary>
    public IEnumerable<ParticipantCount> OverLimit =>
        Problem is null ? Participants.Where(participant => participant.Moments.Count > Rule.MaxOccurrences) : [];

    /// <summary>The count as a rule's check state: never "checked" while something could not be counted or run.</summary>
    public WorldRuleCheck ToCheck() =>
        Problem is not null
            ? new WorldRuleCheck(WorldRuleCheckOutcome.CannotCheck, 0, 0, 0, 0, [], Problem)
            : new WorldRuleCheck(
                Uncounted.Count > 0 ? WorldRuleCheckOutcome.Incomplete : WorldRuleCheckOutcome.Checked,
                Counted,
                OverLimit.Count(),
                NotCanon,
                Uncounted.Count,
                [.. Uncounted.Take(RuleValidationLimits.UncountedListed)],
                null);
}
