using LorEvolve.Api.Features.Systems;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// The values of World Logic rule definitions and Systems (ADR 0072), built from an AI's input as every other resource's
/// are: a create from the input alone, an update as the stored form with only what the input sets changed, bound to the
/// version it was staged over. Neither is ever removed by an AI; staging refuses that before it gets here.
/// A System machine's states and transitions (#361) are built the same way, bound to their System's version.
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

        private async Task<AiChangeWork?> SystemStateAsync(CancellationToken cancellationToken)
        {
            if (input.SystemState is not { } state)
            {
                Fail(AiChangeCodes.Invalid, "Put the state's values in systemState.", "systemState");
                return null;
            }

            if (await MachineSystemAsync(state.System, "systemState.system", cancellationToken) is not { } system)
            {
                return null;
            }

            // Kept as the AI named it: only the machine's first state may, which the check sees and staging here does not.
            var binding = state.SubjectType is null && state.Attribute is null ? null : new SystemMachineBinding(state.SubjectType, state.Attribute);
            if (action == AiChangeAction.Create)
            {
                return Work(null, system.Version, new SystemStateValues(system.Ref, state.Name?.Trim() ?? string.Empty, state.Value ?? string.Empty, state.Initial == true, binding));
            }

            // A machine always has exactly one initial state, so the flag moves to another state and never just goes off.
            if (state.Initial == false)
            {
                Fail(AiChangeCodes.Invalid, "A machine always has one initial state. To move it, set initial to true on the state that should be initial.", "systemState.initial");
                return null;
            }

            return await StoredAsync(
                () => AiChangeSnapshots.SystemStateAsync(db, universeId, system.Ref.Id!.Value, input.TargetId!.Value, cancellationToken),
                stored => Work(stored.Form, stored.Version, stored.Form with
                {
                    Name = state.Name?.Trim() ?? stored.Form.Name,
                    Value = state.Value ?? stored.Form.Value,
                    Initial = state.Initial ?? stored.Form.Initial,
                    Binding = binding,
                }));
        }

        private async Task<AiChangeWork?> SystemTransitionAsync(CancellationToken cancellationToken)
        {
            if (input.SystemTransition is not { } transition)
            {
                Fail(AiChangeCodes.Invalid, "Put the transition's values in systemTransition.", "systemTransition");
                return null;
            }

            if (await MachineSystemAsync(transition.System, "systemTransition.system", cancellationToken) is not { } system)
            {
                return null;
            }

            var from = Ref(transition.From, "systemTransition.from");
            var to = Ref(transition.To, "systemTransition.to");
            var guard = Ref(transition.Guard, "systemTransition.guard");
            if (guard is not null && transition.RemoveGuard == true)
            {
                Fail(AiChangeCodes.Invalid, "Name a guard or remove it, not both.", "systemTransition.removeGuard");
            }

            if (action == AiChangeAction.Create)
            {
                if ((from is null || to is null) && !_failed)
                {
                    Fail(AiChangeCodes.Invalid, "Say which two states the transition joins, in from and to.", from is null ? "systemTransition.from" : "systemTransition.to");
                }

                return from is null || to is null ? null : Work(null, system.Version, new SystemTransitionValues(system.Ref, from, to, Cleared(transition.Label, null), guard));
            }

            return await StoredAsync(
                () => AiChangeSnapshots.SystemTransitionAsync(db, universeId, system.Ref.Id!.Value, input.TargetId!.Value, cancellationToken),
                stored => Work(stored.Form, stored.Version, stored.Form with
                {
                    From = from ?? stored.Form.From,
                    To = to ?? stored.Form.To,
                    Label = Cleared(transition.Label, stored.Form.Label),
                    Guard = transition.RemoveGuard == true ? null : guard ?? stored.Form.Guard,
                }));
        }

        /// <summary>
        /// The System a state or transition is in, which every machine change names: an existing one of this universe, with
        /// the version the change is staged over, or a system this proposal creates, which has none yet. A change to an
        /// item that exists names its System by id, since the item's id is only unique inside its System.
        /// </summary>
        private async Task<(AiRef Ref, int? Version)?> MachineSystemAsync(AiRefInput? reference, string field, CancellationToken cancellationToken)
        {
            if (Ref(reference, field) is not { } system)
            {
                if (!_failed)
                {
                    Fail(AiChangeCodes.Invalid, "Say which System this is in: {\"id\"} of an existing one, or {\"ref\"} of a system this proposal creates.", field);
                }

                return null;
            }

            if (system.Id is not { } id)
            {
                if (action == AiChangeAction.Update)
                {
                    Fail(AiChangeCodes.Invalid, "A state or transition that exists is in a System that exists: name it by {\"id\"}.", field);
                    return null;
                }

                return (system, null);
            }

            // Another universe's System answers as a missing one does.
            if (await AiChangeSnapshots.SystemVersionAsync(db, universeId, id, cancellationToken) is not { } version)
            {
                Fail(AiChangeCodes.NotFound, "This universe has no such System. Read them with list_systems.", field);
                return null;
            }

            return (system, version);
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
