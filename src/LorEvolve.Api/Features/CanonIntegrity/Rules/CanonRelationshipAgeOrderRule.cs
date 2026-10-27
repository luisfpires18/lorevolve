using LorEvolve.Api.Features.Relationships;

namespace LorEvolve.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A Canon relationship whose two ends were born in the wrong order for its type.
///
/// Nothing here knows what any relationship means. The order is the one an author configured on
/// the relationship type - source older, or source younger - so a type named "parent of" with no
/// rule is as invisible to this as one named "banana", and "banana" configured with a rule is
/// checked exactly like "parent of" would be. The stored direction is read once per relationship,
/// so a link shown from both of its entries is still one finding.
///
/// Only a strictly wrong order is reported. A birth year is a whole year, so two entries born in the
/// same year may have been born either way round, and that proves nothing.
///
/// Medium, not High. The lifespan rules are High because dying before being born is impossible in
/// any world. This rule enforces a constraint someone wrote on a type, and LorEvolve cannot tell a law
/// of that world from a convention of the author's without reading the type's name - which is the
/// one thing it must not do. So a breach is reported, and never refused.
/// </summary>
public sealed class CanonRelationshipAgeOrderRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-REL-002";

    public CanonConflictSeverity Severity => CanonConflictSeverity.Medium;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var (relationships, _) = await CanonRelationshipAgeReader.LoadAsync(
            context, RelationshipAgeConstraint.Order, cancellationToken);

        return [.. relationships.Where(Contradicts).Select(Finding)];
    }

    private static bool Contradicts(ConstrainedRelationship relationship) => relationship.AgeOrder switch
    {
        RelationshipAgeOrder.SourceOlder => relationship.SourceBirth.Point > relationship.TargetBirth.Point,
        RelationshipAgeOrder.SourceYounger => relationship.SourceBirth.Point < relationship.TargetBirth.Point,
        _ => false,
    };

    private CanonFinding Finding(ConstrainedRelationship relationship)
    {
        var sourceOlder = relationship.AgeOrder == RelationshipAgeOrder.SourceOlder;
        var (elder, younger) = sourceOlder
            ? (relationship.Source, relationship.Target)
            : (relationship.Target, relationship.Source);

        var source = CanonRuleText.Quoted(relationship.Source.EntityName);
        var target = CanonRuleText.Quoted(relationship.Target.EntityName);
        var type = CanonRuleText.Quoted(relationship.TypeName);

        var title =
            $"{CanonRuleText.Quoted(elder.EntityName)} should be older than " +
            $"{CanonRuleText.Quoted(younger.EntityName)} under {type}, but was born later";

        var explanation =
            $"The Canon relationship {CanonRuleText.Quoted(relationship.Reading)} uses {type}, which is " +
            $"configured so its source is {(sourceOlder ? "older" : "younger")} than its target. But " +
            $"{source} was born in {relationship.SourceBirth.YearText} and {target} in " +
            $"{relationship.TargetBirth.YearText}, so {source} is the {(sourceOlder ? "younger" : "older")} " +
            "of the two. A birth year is wrong, the relationship points the wrong way, or the rule does not " +
            $"fit {type}. Correct the year, reverse the relationship, or change the rule.";

        return new CanonFinding(
            RuleCode,
            Severity,

            // Who must be the elder, who the younger, under which type and on which link - never the
            // years. Correcting a year rewords this conflict or resolves it; reversing the link or
            // flipping the rule makes a different entry the one at fault, and a different conflict.
            [relationship.RelationshipId, relationship.TypeId, elder.EntityId, younger.EntityId],
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.Relationship, relationship.RelationshipId, "relationship"),
                new CanonFindingSubject(CanonSubjectKind.Entity, relationship.Source.EntityId, "source"),
                new CanonFindingSubject(CanonSubjectKind.Entity, relationship.Target.EntityId, "target"),
            ]);
    }
}
