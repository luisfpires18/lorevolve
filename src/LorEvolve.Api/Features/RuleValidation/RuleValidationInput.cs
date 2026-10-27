using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.WorldRules;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.RuleValidation;

/// <summary>
/// The checks and the writes a world rule's structured check and a moment's structured details share (ADR 0034).
///
/// Every id is resolved inside the universe the caller already proved it owns, and by its explicit kind: an event kind must be a
/// term of kind event kind, a method a term of kind method, a participant an entry. An id from another universe, of the wrong
/// kind or made up is refused in the same words, so a refusal never confirms that something exists elsewhere.
/// </summary>
internal static class RuleValidationInput
{
    public const string RuleKindKey = "validation.kind";
    public const string EventKindKey = "validation.eventKindId";
    public const string MethodKey = "validation.methodId";
    public const string MaxOccurrencesKey = "validation.maxOccurrences";
    public const string ParticipantKey = "validation.participantEntityId";

    // ---------- A world rule's check ----------

    public static async Task<Dictionary<string, string[]>?> ValidateRuleAsync(
        LorEvolveDbContext db,
        Guid universeId,
        WorldRuleValidationRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        if (!Enum.IsDefined(request.Kind))
        {
            errors[RuleKindKey] = ["That is not a check LorEvolve knows."];
            return errors;
        }

        if (request.Kind == WorldRuleValidationKind.None)
        {
            return null;
        }

        if (request.EventKindId is not { } eventKind)
        {
            errors[EventKindKey] = ["Choose the event kind this rule limits."];
        }
        else if (!await IsTermAsync(db, universeId, eventKind, ValidationTermKind.EventKind, cancellationToken))
        {
            errors[EventKindKey] = ["Choose an event kind from this universe."];
        }

        if (request.MethodId is not { } method)
        {
            errors[MethodKey] = ["Choose the method this rule limits."];
        }
        else if (!await IsTermAsync(db, universeId, method, ValidationTermKind.Method, cancellationToken))
        {
            errors[MethodKey] = ["Choose a method from this universe."];
        }

        if (request.MaxOccurrences is not { } max)
        {
            errors[MaxOccurrencesKey] = ["Say how many times one participant may have it."];
        }
        else if (max is < 1 or > RuleValidationLimits.MaxOccurrencesCeiling)
        {
            errors[MaxOccurrencesKey] = [$"The limit is a whole number from 1 to {RuleValidationLimits.MaxOccurrencesCeiling:N0}."];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>Whether a validated request would leave the stored check exactly as it is.</summary>
    public static bool SameRule(WorldRuleValidation? stored, WorldRuleValidationRequest request) =>
        request.Kind == WorldRuleValidationKind.None
            ? stored is null
            : stored is not null
                && stored.Kind == request.Kind
                && stored.EventKindTermId == request.EventKindId
                && stored.MethodTermId == request.MethodId
                && stored.MaxOccurrences == request.MaxOccurrences;

    /// <summary>Puts a validated request on a rule whose check is loaded, adding, changing or removing the row.</summary>
    public static void ApplyRule(LorEvolveDbContext db, WorldRule rule, WorldRuleValidationRequest request)
    {
        if (request.Kind == WorldRuleValidationKind.None)
        {
            if (rule.Validation is not null)
            {
                db.WorldRuleValidations.Remove(rule.Validation);
                rule.Validation = null;
            }

            return;
        }

        rule.Validation ??= new WorldRuleValidation { WorldRuleId = rule.Id };
        rule.Validation.Kind = request.Kind;
        rule.Validation.EventKindTermId = request.EventKindId!.Value;
        rule.Validation.MethodTermId = request.MethodId!.Value;
        rule.Validation.MaxOccurrences = request.MaxOccurrences!.Value;
    }

    // ---------- A moment's details ----------

    /// <summary>
    /// Checks a moment's details. A participant in the Trash is refused when newly chosen, and kept when it is the one already
    /// stored - the form sends the details whole on every save, so refusing it would turn an unrelated edit into a failure.
    /// </summary>
    public static async Task<Dictionary<string, string[]>?> ValidateMomentAsync(
        LorEvolveDbContext db,
        Guid universeId,
        TimelineValidationRequest request,
        Guid? storedParticipantId,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.EventKindId is { } eventKind
            && !await IsTermAsync(db, universeId, eventKind, ValidationTermKind.EventKind, cancellationToken))
        {
            errors[EventKindKey] = ["Choose an event kind from this universe."];
        }

        if (request.MethodId is { } method
            && !await IsTermAsync(db, universeId, method, ValidationTermKind.Method, cancellationToken))
        {
            errors[MethodKey] = ["Choose a method from this universe."];
        }

        if (request.ParticipantEntityId is { } participant)
        {
            var found = await db.Entities.AsNoTracking()
                .Where(entity => entity.Id == participant && entity.UniverseId == universeId)
                .Select(entity => new { entity.DeletedAt })
                .FirstOrDefaultAsync(cancellationToken);

            if (found is null)
            {
                errors[ParticipantKey] = ["Choose an entry from this universe."];
            }
            else if (found.DeletedAt is not null && participant != storedParticipantId)
            {
                errors[ParticipantKey] = ["That entry is in the Trash. Choose one that is not."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>Puts validated details on a moment whose details are loaded; all three parts absent removes them.</summary>
    public static void ApplyMoment(LorEvolveDbContext db, TimelineEntry entry, TimelineValidationRequest request)
    {
        if (request is { EventKindId: null, MethodId: null, ParticipantEntityId: null })
        {
            if (entry.Validation is not null)
            {
                db.TimelineEntryValidations.Remove(entry.Validation);
                entry.Validation = null;
            }

            return;
        }

        entry.Validation ??= new TimelineEntryValidation { TimelineEntryId = entry.Id };
        entry.Validation.EventKindTermId = request.EventKindId;
        entry.Validation.MethodTermId = request.MethodId;
        entry.Validation.ParticipantEntityId = request.ParticipantEntityId;
    }

    private static Task<bool> IsTermAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid termId,
        ValidationTermKind kind,
        CancellationToken cancellationToken) =>
        db.ValidationTerms.AnyAsync(
            term => term.Id == termId && term.UniverseId == universeId && term.Kind == kind,
            cancellationToken);
}
