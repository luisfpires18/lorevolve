using LorEvolve.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A timeline entry marked Canon with a participant that is not Canon.
///
/// The same structural check as <see cref="CanonRelationshipEntityStatusRule"/>, over the
/// participation join instead: a moment the author has settled cannot rest on a character
/// still being sketched. No date arithmetic happens here and none is needed - this reads
/// canon status only, so it stays valid whatever calendar the universe uses.
/// </summary>
public sealed class CanonTimelineEntityStatusRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-TIME-001";

    public CanonConflictSeverity Severity => CanonConflictSeverity.Medium;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var rows = await context.Db.TimelineEntries.AsNoTracking()
            .Where(entry =>
                entry.UniverseId == context.UniverseId
                && entry.DeletedAt == null
                && entry.CanonStatus == CanonStatus.Canon
                && entry.EntityLinks.Any(link =>
                    link.Entity!.DeletedAt == null
                    && link.Entity.CanonStatus != CanonStatus.Canon))
            .Select(entry => new Row(
                entry.Id,
                entry.Title,
                entry.EntityLinks
                    .Where(link => link.Entity!.DeletedAt == null
                        && link.Entity.CanonStatus != CanonStatus.Canon)
                    .Select(link => new Offender(link.EntityId, link.Entity!.Name, link.Entity.CanonStatus))
                    .ToList()))
            .ToListAsync(cancellationToken);

        return [.. rows.SelectMany(Findings)];
    }

    /// <summary>
    /// One finding per offending participant. A moment can name any number of entities,
    /// and each is separately fixable, so promoting one participant must not disturb what
    /// the author already decided about another.
    /// </summary>
    private IEnumerable<CanonFinding> Findings(Row row) =>
        row.Offenders
            .OrderBy(offender => offender.Name, StringComparer.Ordinal)
            .ThenBy(offender => offender.Id)
            .Select(offender => Finding(row, offender));

    private CanonFinding Finding(Row row, Offender offender)
    {
        var title =
            $"Canon moment {CanonRuleText.Quoted(row.Title)} involves " +
            $"{CanonRuleText.Quoted(offender.Name)}, which is not Canon";

        var explanation =
            $"The timeline entry {CanonRuleText.Quoted(row.Title)} is marked Canon, but its " +
            $"participant {CanonRuleText.Quoted(offender.Name)} is " +
            $"{CanonRuleText.StatusWord(offender.Status)}. A settled moment should not depend on " +
            "lore that is not settled. Either promote the participant, drop it from the moment, " +
            "or lower the moment's own status.";

        return new CanonFinding(
            RuleCode,
            Severity,

            // The moment and the one participant at fault. Swapping in a different
            // participant is a different problem and gets its own conflict.
            [row.EntryId, offender.Id],
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.TimelineEntry, row.EntryId, "entry"),
                new CanonFindingSubject(CanonSubjectKind.Entity, offender.Id, "participant"),
            ]);
    }

    private sealed record Row(Guid EntryId, string Title, List<Offender> Offenders);

    private sealed record Offender(Guid Id, string Name, CanonStatus Status);
}
