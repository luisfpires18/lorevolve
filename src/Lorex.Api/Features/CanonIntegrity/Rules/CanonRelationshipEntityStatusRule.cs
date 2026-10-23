using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A relationship marked Canon whose source or target entity is not Canon.
///
/// Structural, not semantic: it reads only the canon status the author already set on
/// records the model already links, so it holds for any universe without knowing what any
/// of it means. Canon lore resting on lore that is still an Idea is a likely inconsistency
/// rather than an impossibility, so Medium: either the endpoint should be promoted or the
/// relationship should not be Canon yet.
/// </summary>
public sealed class CanonRelationshipEntityStatusRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-REL-001";

    public CanonConflictSeverity Severity => CanonConflictSeverity.Medium;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var rows = await context.Db.Relationships.AsNoTracking()
            .Where(relationship =>
                relationship.UniverseId == context.UniverseId
                && relationship.DeletedAt == null
                && relationship.CanonStatus == CanonStatus.Canon

                // Both ends live. The row survives its endpoint being trashed - that is the
                // whole point of the Trash - but a link with one end out of the world is not
                // a claim about canon, and it becomes one again when the entry is restored.
                && relationship.SourceEntity!.DeletedAt == null
                && relationship.TargetEntity!.DeletedAt == null
                && (relationship.SourceEntity.CanonStatus != CanonStatus.Canon
                    || relationship.TargetEntity.CanonStatus != CanonStatus.Canon))
            .Select(relationship => new Row(
                relationship.Id,
                relationship.RelationshipType!.Name,
                relationship.SourceEntityId,
                relationship.SourceEntity!.Name,
                relationship.SourceEntity.CanonStatus,
                relationship.TargetEntityId,
                relationship.TargetEntity!.Name,
                relationship.TargetEntity.CanonStatus))
            .ToListAsync(cancellationToken);

        return [.. rows.SelectMany(Findings)];
    }

    /// <summary>
    /// One finding per offending endpoint, not one per relationship.
    ///
    /// Both ends can be at fault, and each is separately fixable. Bundling them would put
    /// both ids in one fingerprint, so promoting one endpoint would change the key and
    /// throw away whatever the author had decided about the other.
    /// </summary>
    private IEnumerable<CanonFinding> Findings(Row row)
    {
        if (row.SourceStatus != CanonStatus.Canon)
        {
            yield return Finding(row, row.SourceId, row.SourceName, row.SourceStatus, "source");
        }

        if (row.TargetStatus != CanonStatus.Canon)
        {
            yield return Finding(row, row.TargetId, row.TargetName, row.TargetStatus, "target");
        }
    }

    private CanonFinding Finding(Row row, Guid entityId, string name, CanonStatus status, string role)
    {
        var reading = $"{row.SourceName} {row.TypeName} {row.TargetName}";

        var title =
            $"Canon relationship {CanonRuleText.Quoted(reading)} rests on " +
            $"{CanonRuleText.Quoted(name)}, which is not Canon";

        var explanation =
            $"The relationship {CanonRuleText.Quoted(reading)} is marked Canon, but its {role}, " +
            $"{CanonRuleText.Quoted(name)}, is {CanonRuleText.StatusWord(status)}. Canon should not " +
            "depend on lore that is not settled yet. Either promote the entry this relationship " +
            "links, or lower the relationship's own status until it is ready.";

        return new CanonFinding(
            RuleCode,
            Severity,

            // The relationship and the one endpoint at fault. Retargeting the relationship
            // at a different entry is a different problem and gets its own conflict.
            [row.RelationshipId, entityId],
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.Relationship, row.RelationshipId, "relationship"),
                new CanonFindingSubject(CanonSubjectKind.Entity, entityId, role),
            ]);
    }

    private sealed record Row(
        Guid RelationshipId,
        string TypeName,
        Guid SourceId,
        string SourceName,
        CanonStatus SourceStatus,
        Guid TargetId,
        string TargetName,
        CanonStatus TargetStatus);
}
