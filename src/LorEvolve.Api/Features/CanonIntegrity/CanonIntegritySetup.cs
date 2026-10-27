using LorEvolve.Api.Features.CanonIntegrity.Rules;

namespace LorEvolve.Api.Features.CanonIntegrity;

/// <summary>
/// The registered rule set. A rule is live once it is listed here and nowhere else, so the
/// production checks are one readable list rather than an assembly scan that quietly picks
/// up whatever happens to implement the interface.
/// </summary>
public static class CanonIntegritySetup
{
    public static IServiceCollection AddCanonIntegrity(this IServiceCollection services)
    {
        services.AddScoped<ICanonIntegrityRule, CanonRelationshipEntityStatusRule>();
        services.AddScoped<ICanonIntegrityRule, CanonTimelineEntityStatusRule>();
        services.AddScoped<ICanonIntegrityRule, CanonEntityReferenceStatusRule>();

        // Relationship constraints. These check only what an author configured on a relationship
        // type, against declared birth years; a type with no constraint is invisible to them.
        services.AddScoped<ICanonIntegrityRule, CanonRelationshipAgeOrderRule>();
        services.AddScoped<ICanonIntegrityRule, CanonRelationshipAgeGapRule>();

        // Family meaning. Only a type its author gave a family meaning is read, as parent links; a type without one is invisible
        // to it, whatever it is called (ADR 0035).
        services.AddScoped<ICanonIntegrityRule, CanonFamilyLoopRule>();

        // Chronology. These read what a field means rather than how records link, so they
        // only see entities whose author declared a birth or death year.
        services.AddScoped<ICanonIntegrityRule, CanonLifespanOrderRule>();
        services.AddScoped<ICanonIntegrityRule, CanonTimelineBeforeBirthRule>();
        services.AddScoped<ICanonIntegrityRule, CanonTimelineAfterDeathRule>();

        // World rule checks. Only a rule the author gave a structured check is read, through explicit ids on the rule and on
        // each moment; a rule that is words only is invisible to it (ADR 0034).
        services.AddScoped<ICanonIntegrityRule, CanonWorldRuleOccurrenceRule>();

        services.AddScoped<CanonIntegrityEvaluator>();

        // The one place a High finding is allowed to stop something happening. Scoped, because
        // it runs a transaction on the request's own context.
        services.AddScoped<CanonPromotionGate>();

        return services;
    }
}
