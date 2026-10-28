namespace LorEvolve.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A Canon relationship whose two ends were born further apart, or closer together, than its type
/// allows.
///
/// The gap is the distance between the two declared birth years, in years, as
/// <see cref="Chronology.UniverseChronology.YearsBetween"/> measures it - the chronology's own answer,
/// never arithmetic on era labels done here. It is absolute: which end is older is the age order's
/// question, not this one's, so a type may bound the gap with or without an order, and a relationship
/// that breaks both is two separately fixable findings.
///
/// Birth years are whole years, and the gap is a gap between years, not between birthdays. Nothing
/// here claims an exact age. It stays provable anyway: two years 8 apart are less than 12 years apart
/// however the birthdays fall, and two years 31 apart are more than 30.
///
/// Stands down whenever the distance is not known - most often two years in eras whose lengths the
/// universe does not record. Their order may still be certain, and the age order rule still reads it.
///
/// Medium, for the same reason as <see cref="CanonRelationshipAgeOrderRule"/>: the bound is a
/// constraint an author configured, not a law LorEvolve can see.
/// </summary>
public sealed class CanonRelationshipAgeGapRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-REL-003";

    public CanonConflictSeverity Severity => CanonConflictSeverity.Medium;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var (relationships, chronology) = await CanonRelationshipAgeReader.LoadAsync(
            context, RelationshipAgeConstraint.Gap, cancellationToken);

        var findings = new List<CanonFinding>();

        foreach (var relationship in relationships)
        {
            if (chronology.YearsBetween(relationship.SourceBirth.Point, relationship.TargetBirth.Point) is not { } gap)
            {
                continue;
            }

            if (relationship.MinAgeDifferenceYears is { } min && gap < min)
            {
                findings.Add(Finding(
                    relationship,
                    gap,
                    $"{CanonRuleText.Quoted(relationship.TypeName)} requires an age difference of at least {CanonRuleText.Years(min)}",
                    $"needs at least {CanonRuleText.Years(min)}"));
            }
            else if (relationship.MaxAgeDifferenceYears is { } max && gap > max)
            {
                findings.Add(Finding(
                    relationship,
                    gap,
                    $"{CanonRuleText.Quoted(relationship.TypeName)} allows an age difference of at most {CanonRuleText.Years(max)}",
                    $"allows at most {CanonRuleText.Years(max)}"));
            }
        }

        return findings;
    }

    private CanonFinding Finding(ConstrainedRelationship relationship, double gap, string rule, string bound)
    {
        var source = CanonRuleText.Quoted(relationship.Source.EntityName);
        var target = CanonRuleText.Quoted(relationship.Target.EntityName);

        var title =
            $"{source} and {target} are born {CanonRuleText.Years(gap)} apart, but " +
            $"{CanonRuleText.Quoted(relationship.TypeName)} {bound}";

        var explanation =
            $"{rule}, but the Canon relationship {CanonRuleText.Quoted(relationship.Reading)} joins {source}, " +
            $"born in {relationship.SourceBirth.YearText}, and {target}, born in {relationship.TargetBirth.YearText}. " +
            $"Those birth years are {CanonRuleText.Years(gap)} apart. Correct a birth year, or change the rule on " +
            $"{CanonRuleText.Quoted(relationship.TypeName)}.";

        return new CanonFinding(
            RuleCode,
            Severity,

            // The link, its type and its two ends. The years and the bound are not in it, so a
            // corrected year or a retuned bound rewords this conflict or resolves it.
            [relationship.RelationshipId, relationship.TypeId, relationship.Source.EntityId, relationship.Target.EntityId],
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.Relationship, relationship.RelationshipId, "relationship"),
                new CanonFindingSubject(CanonSubjectKind.Entity, relationship.Source.EntityId, "source"),
                new CanonFindingSubject(CanonSubjectKind.Entity, relationship.Target.EntityId, "target"),
            ]);
    }
}
