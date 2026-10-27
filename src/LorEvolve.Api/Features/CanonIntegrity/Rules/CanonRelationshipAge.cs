using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.CanonIntegrity.Rules;

/// <summary>Which half of a relationship type's age constraints a rule checks.</summary>
internal enum RelationshipAgeConstraint
{
    /// <summary>Which end must be older.</summary>
    Order,

    /// <summary>How far apart the two birth years may be.</summary>
    Gap,
}

/// <summary>
/// One Canon relationship whose type carries an age constraint, with the birth year each end
/// declared already placed on the universe's line. Source and target are the stored direction -
/// never turned around for whichever entry the link happens to be shown on.
/// </summary>
internal sealed record ConstrainedRelationship(
    Guid RelationshipId,
    Guid TypeId,
    string TypeName,
    RelationshipAgeOrder AgeOrder,
    int? MinAgeDifferenceYears,
    int? MaxAgeDifferenceYears,
    CanonLifespan Source,
    LifespanFact SourceBirth,
    CanonLifespan Target,
    LifespanFact TargetBirth)
{
    /// <summary>The link as it reads from its source: "Arlen parent of Mira".</summary>
    public string Reading => $"{Source.EntityName} {TypeName} {Target.EntityName}";
}

/// <summary>
/// The reading half of the relationship age rules: which Canon relationships carry a constraint,
/// and whether both of their ends declared a birth year LorEvolve can place.
///
/// A relationship is only a candidate when there is something to prove a contradiction from.
/// Either end missing a birth year, an end that is not Canon or is in the Trash, or a year written
/// before the universe named its eras - each of those drops the relationship here, silently.
/// Missing lore is not a contradiction, and no finding is better than a false one.
///
/// Meaning comes from the type's configured constraints and the field's declared
/// <see cref="EntityFieldSemantic"/>. No name - of a type, a field or an era - is read.
/// </summary>
internal static class CanonRelationshipAgeReader
{
    public static async Task<(IReadOnlyList<ConstrainedRelationship> Relationships, UniverseChronology Chronology)> LoadAsync(
        CanonRuleContext context,
        RelationshipAgeConstraint constraint,
        CancellationToken cancellationToken)
    {
        var candidates = context.Db.Relationships.AsNoTracking()
            .Where(relationship =>
                relationship.UniverseId == context.UniverseId
                && relationship.DeletedAt == null
                && relationship.RelationshipType!.UniverseId == context.UniverseId
                && relationship.CanonStatus == CanonStatus.Canon
                && relationship.SourceEntity!.DeletedAt == null
                && relationship.TargetEntity!.DeletedAt == null);

        candidates = constraint == RelationshipAgeConstraint.Order
            ? candidates.Where(relationship =>
                relationship.RelationshipType!.AgeOrder != RelationshipAgeOrder.None)
            : candidates.Where(relationship =>
                relationship.RelationshipType!.MinAgeDifferenceYears != null
                || relationship.RelationshipType.MaxAgeDifferenceYears != null);

        var rows = await candidates
            .Select(relationship => new Row(
                relationship.Id,
                relationship.RelationshipTypeId,
                relationship.RelationshipType!.Name,
                relationship.RelationshipType.AgeOrder,
                relationship.RelationshipType.MinAgeDifferenceYears,
                relationship.RelationshipType.MaxAgeDifferenceYears,
                relationship.SourceEntityId,
                relationship.TargetEntityId))
            .ToListAsync(cancellationToken);

        // By far the common case: no type is constrained, and the years need not be read at all.
        if (rows.Count == 0)
        {
            return ([], UniverseChronology.Plain);
        }

        // One read of the eras and one of every declared year, however many relationships there are.
        var chronology = await UniverseChronology.LoadAsync(context.Db, context.UniverseId, cancellationToken);
        var lifespans = await CanonLifespanReader.LoadLifespansAsync(context, chronology, cancellationToken);

        return (
            [
                .. rows
                    .Select(row => Constrained(row, lifespans))
                    .OfType<ConstrainedRelationship>()
                    .OrderBy(relationship => relationship.RelationshipId),
            ],
            chronology);
    }

    private static ConstrainedRelationship? Constrained(Row row, Dictionary<Guid, CanonLifespan> lifespans) =>
        lifespans.GetValueOrDefault(row.SourceId) is { Birth: { } sourceBirth } source
        && lifespans.GetValueOrDefault(row.TargetId) is { Birth: { } targetBirth } target
            ? new ConstrainedRelationship(
                row.RelationshipId,
                row.TypeId,
                row.TypeName,
                row.AgeOrder,
                row.MinAgeDifferenceYears,
                row.MaxAgeDifferenceYears,
                source,
                sourceBirth,
                target,
                targetBirth)
            : null;

    private sealed record Row(
        Guid RelationshipId,
        Guid TypeId,
        string TypeName,
        RelationshipAgeOrder AgeOrder,
        int? MinAgeDifferenceYears,
        int? MaxAgeDifferenceYears,
        Guid SourceId,
        Guid TargetId);
}
