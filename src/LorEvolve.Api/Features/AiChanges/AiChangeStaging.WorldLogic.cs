using LorEvolve.Api.Features.Systems;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// The values of World Logic rule definitions and Systems (ADR 0072), built from an AI's input as every other resource's
/// are: a create from the input alone, an update as the stored form with only what the input sets changed, bound to the
/// version it was staged over. Neither is ever removed by an AI; staging refuses that before it gets here.
/// </summary>
internal static partial class AiChangeStaging
{
    private sealed partial class Builder
    {
        private async Task<AiChangeWork?> SystemRuleAsync(CancellationToken cancellationToken)
        {
            if (action == AiChangeAction.Create)
            {
                return Work(null, null, SystemRule(input.SystemRule, null));
            }

            return await StoredAsync(
                () => AiChangeSnapshots.SystemRuleAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                stored => Work(stored.Form, stored.Version, SystemRule(input.SystemRule, stored.Form)));
        }

        private async Task<AiChangeWork?> LoreSystemAsync(CancellationToken cancellationToken)
        {
            if (action == AiChangeAction.Create)
            {
                return Work(null, null, LoreSystem(input.System, null));
            }

            return await StoredAsync(
                () => AiChangeSnapshots.LoreSystemAsync(db, universeId, input.TargetId!.Value, cancellationToken),
                stored => Work(stored.Form, stored.Version, LoreSystem(input.System, stored.Form)));
        }

        private SystemRuleValues? SystemRule(AiSystemRuleInput? rule, SystemRuleValues? before)
        {
            if (rule is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the rule's values in systemRule.", "systemRule");
                return null;
            }

            // The scope is fixed at creation, as the route holds it: a different project is refused, not moved.
            if (before is not null && rule.ProjectId is { } named && named != before.ProjectId)
            {
                Fail(AiChangeCodes.Invalid, "A rule stays in the scope it was created in. Leave projectId out.", "systemRule.projectId");
                return null;
            }

            var condition = before?.Condition;
            var exceptions = before?.Exceptions;
            if (rule.RemoveCondition == true)
            {
                condition = null;
                exceptions = null;
            }
            else
            {
                condition = rule.Condition is { } asked ? asked.GetRawText() : condition;
                exceptions = rule.Exceptions is { } excepted ? excepted.GetRawText() : exceptions;
            }

            if (condition is null && exceptions is null && rule.SchemaVersion is not null)
            {
                Fail(AiChangeCodes.Invalid, "A schema version belongs to a condition; this rule has none.", "systemRule.schemaVersion");
                return null;
            }

            // The version the route would store: none without a condition, otherwise the one named or the current one.
            int? schemaVersion = condition is null && exceptions is null
                ? null
                : rule.SchemaVersion ?? before?.SchemaVersion ?? ConditionSchema.CurrentVersion;

            var dependsOn = before?.DependsOn ?? [];
            if (rule.DependsOn is { } listed)
            {
                dependsOn = [];
                foreach (var dependency in listed)
                {
                    if (dependency is null || Ref(dependency, "systemRule.dependsOn") is not { } reference)
                    {
                        Fail(AiChangeCodes.Invalid, "Each dependency is {\"id\"} of an existing rule or {\"ref\"} of a system_rule in this proposal.", "systemRule.dependsOn");
                        return null;
                    }

                    dependsOn.Add(reference);
                }
            }

            // The description is plain text stored exactly as written, so only a cleared one changes; nothing is trimmed in it.
            var description = rule.Description is null ? before?.Description ?? string.Empty : rule.Description.Trim().Length == 0 ? string.Empty : rule.Description;

            return new SystemRuleValues(
                before?.ProjectId ?? rule.ProjectId,
                (rule.Title ?? before?.Title ?? string.Empty).Trim(),
                description,
                schemaVersion,
                condition,
                exceptions,
                AiChangeSnapshots.Dependencies(dependsOn));
        }

        private LoreSystemValues? LoreSystem(AiSystemInput? system, LoreSystemValues? before)
        {
            if (system is null)
            {
                Fail(AiChangeCodes.Invalid, "Put the System's values in system.", "system");
                return null;
            }

            if (before is not null && system.ProjectId is { } named && named != before.ProjectId)
            {
                Fail(AiChangeCodes.Invalid, "A System stays in the scope it was created in. Leave projectId out.", "system.projectId");
                return null;
            }

            var rules = before?.RuleIds ?? [];
            if (system.RuleIds is { } asked)
            {
                rules = [];
                foreach (var rule in asked)
                {
                    if (rule is null || Ref(rule, "system.ruleIds") is not { } reference)
                    {
                        Fail(AiChangeCodes.Invalid, "Each rule is {\"id\"} or {\"ref\"}.", "system.ruleIds");
                        return null;
                    }

                    rules.Add(reference);
                }
            }

            var summary = system.Summary is null ? before?.Summary ?? string.Empty : system.Summary.Trim().Length == 0 ? string.Empty : system.Summary;

            return new LoreSystemValues(
                before?.ProjectId ?? system.ProjectId,
                (system.Name ?? before?.Name ?? string.Empty).Trim(),
                summary,
                rules);
        }
    }
}
