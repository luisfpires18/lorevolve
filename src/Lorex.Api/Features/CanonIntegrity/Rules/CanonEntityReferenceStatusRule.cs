using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A Canon entity whose entity-reference field points at an entry that is not Canon.
///
/// Neither end may be in the Trash. A reference to a trashed entry is a reference the author
/// cannot follow and the UI does not offer, so calling it a canon problem would be reporting
/// a contradiction about lore that is not currently in the world.
///
/// The field's meaning is never consulted - only its kind. Nothing here knows what
/// "Homeland" or "Mentor" is supposed to mean, and no field name is hardcoded, so the rule
/// works on types the author invents. One finding per pointing field, because each is
/// separately fixable.
/// </summary>
public sealed class CanonEntityReferenceStatusRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-FIELD-001";

    public CanonConflictSeverity Severity => CanonConflictSeverity.Medium;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var rows = await context.Db.EntityFieldValues.AsNoTracking()
            .Where(value =>
                value.Entity!.UniverseId == context.UniverseId
                && value.Entity.DeletedAt == null
                && value.Entity.CanonStatus == CanonStatus.Canon
                && value.FieldDefinition!.Kind == EntityFieldKind.EntityReference
                && value.FieldDefinition.ArchivedAt == null
                && value.ReferencedEntityId != null
                && value.ReferencedEntity!.DeletedAt == null
                && value.ReferencedEntity.CanonStatus != CanonStatus.Canon)
            .Select(value => new Row(
                value.EntityId,
                value.Entity!.Name,
                value.FieldDefinitionId,
                value.FieldDefinition!.Name,
                value.ReferencedEntityId!.Value,
                value.ReferencedEntity!.Name,
                value.ReferencedEntity.CanonStatus))
            .ToListAsync(cancellationToken);

        return [.. rows.Select(Finding)];
    }

    private CanonFinding Finding(Row row)
    {
        var title =
            $"{CanonRuleText.Quoted(row.OwnerName)} is Canon but its {row.FieldName} points at " +
            $"{CanonRuleText.Quoted(row.ReferenceName)}, which is not Canon";

        var explanation =
            $"{CanonRuleText.Quoted(row.OwnerName)} is marked Canon, and its {row.FieldName} field " +
            $"points at {CanonRuleText.Quoted(row.ReferenceName)}, which is still " +
            $"{CanonRuleText.StatusWord(row.ReferenceStatus)}. Canon lore should not point at lore " +
            "that is not settled. Either promote the entry it points at, clear the field, or " +
            "lower the status of the entry holding it.";

        return new CanonFinding(
            RuleCode,
            Severity,

            // The field definition rather than the stored value row: saving an entity
            // rewrites its value rows, so their ids churn while the definition's does not.
            [row.OwnerId, row.FieldDefinitionId, row.ReferenceId],
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.Entity, row.OwnerId, "owner"),
                new CanonFindingSubject(CanonSubjectKind.EntityField, row.FieldDefinitionId, "field"),
                new CanonFindingSubject(CanonSubjectKind.Entity, row.ReferenceId, "reference"),
            ]);
    }

    private sealed record Row(
        Guid OwnerId,
        string OwnerName,
        Guid FieldDefinitionId,
        string FieldName,
        Guid ReferenceId,
        string ReferenceName,
        CanonStatus ReferenceStatus);
}
