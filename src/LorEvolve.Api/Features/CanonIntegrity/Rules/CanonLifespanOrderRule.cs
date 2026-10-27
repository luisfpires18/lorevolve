using LorEvolve.Api.Features.Chronology;

namespace LorEvolve.Api.Features.CanonIntegrity.Rules;

/// <summary>
/// A Canon entity that dies before it is born.
///
/// The first rule that reads what a field *means* rather than how the model links records.
/// Both years have to be declared through <see cref="Lore.EntityFieldSemantic"/>; an entity
/// whose author never said which field is the birth year is invisible to this rule, which
/// is the point - meaning is declared, never guessed from a name.
///
/// High, because it is not a matter of taste or of lore that is not settled yet: the two
/// facts cannot both be true, whatever the calendar.
///
/// The boundary is deliberately not an error. Birth year equal to death year is an infant
/// death, which is ordinary lore, so only a strictly later birth is reported.
/// </summary>
public sealed class CanonLifespanOrderRule : ICanonIntegrityRule
{
    public string RuleCode => "CANON-LIFE-001";

    public CanonConflictSeverity Severity => CanonConflictSeverity.High;

    public async Task<IReadOnlyList<CanonFinding>> EvaluateAsync(
        CanonRuleContext context,
        CancellationToken cancellationToken)
    {
        var chronology = await UniverseChronology.LoadAsync(context.Db, context.UniverseId, cancellationToken);
        var lifespans = await CanonLifespanReader.LoadLifespansAsync(context, chronology, cancellationToken);

        return
        [
            .. lifespans.Values
                .Where(lifespan => lifespan is { Birth: not null, Death: not null }
                    && lifespan.Birth.Point > lifespan.Death.Point)
                .OrderBy(lifespan => lifespan.EntityId)
                .Select(Finding),
        ];
    }

    private CanonFinding Finding(CanonLifespan lifespan)
    {
        var birth = lifespan.Birth!;
        var death = lifespan.Death!;
        var name = CanonRuleText.Quoted(lifespan.EntityName);

        var title = $"{name} is born in {birth.YearText} but dies in {death.YearText}";

        var explanation =
            $"{name} is marked Canon. Its {birth.FieldName} field gives the year " +
            $"{birth.YearText} and its {death.FieldName} field gives " +
            $"{death.YearText}, so it dies before it is born. One of the two " +
            "years is wrong. Correct whichever it is, or clear it.";

        return new CanonFinding(
            RuleCode,
            Severity,

            // The entity and the two fields that disagree - never the years themselves.
            // Correcting 3441 to 2441 leaves the same conflict to reword or resolve, while
            // moving the meaning to a different field is a different fact and a new one.
            [lifespan.EntityId, birth.FieldDefinitionId, death.FieldDefinitionId],
            CanonRuleText.Title(title),
            CanonRuleText.Explanation(explanation),
            [
                new CanonFindingSubject(CanonSubjectKind.Entity, lifespan.EntityId, "entity"),
                new CanonFindingSubject(CanonSubjectKind.EntityField, birth.FieldDefinitionId, "birth"),
                new CanonFindingSubject(CanonSubjectKind.EntityField, death.FieldDefinitionId, "death"),
            ]);
    }
}
