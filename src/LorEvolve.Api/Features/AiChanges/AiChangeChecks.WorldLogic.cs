using System.Text.Json;
using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.Systems;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// The checks of World Logic rule definitions and Systems (ADR 0072), run at staging, on every read and inside every
/// approval. Each is the route's own validation, lifted rather than copied (<see cref="SystemRuleEndpoints.Validate"/>,
/// <see cref="SystemRuleEndpoints.ConditionProblemOf"/>, <see cref="SystemRuleEndpoints.DependencyProblemAsync"/>,
/// <see cref="SystemEndpoints.Validate"/>), with ids resolved in this universe, plus the stale-change check the stored
/// version allows. A condition may name only records that already exist: one naming something this proposal creates
/// is refused here as an undeclared dependency, a known limit of this change.
/// </summary>
internal sealed partial class AiChangeChecker
{
    private async Task CheckSystemRuleAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var rule = (SystemRuleValues)work.Proposed;

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.SystemRuleAsync(db, universeId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "This rule definition isn't in this universe any more.");
                return;
            }

            if (stored.Version != work.BaseVersion)
            {
                work.Conflict("Someone saved this rule after the AI suggested this change, so it can't be applied. Nothing newer will be overwritten. Reject it, or ask for the change again.");
            }
        }
        else if (rule.ProjectId is { } projectId && !await WorldLogicAccess.IsProjectOfUniverseAsync(db, universeId, projectId, cancellationToken))
        {
            work.Problem(AiChangeCodes.NotFound, "No project of this universe has that id.", "projectId");
        }

        // A dependency this proposal creates has no id yet; it stands in as an empty one, which only the count reads.
        var resolved = rule.DependsOn.Select(dependency => Resolve(dependency)).ToList();
        work.Problems(SystemRuleEndpoints.Validate(RuleRequest(rule, [.. resolved.Select(each => each.Id ?? Guid.Empty)], null)));

        if (SystemRuleEndpoints.ConditionProblemOf(rule.Condition, rule.Exceptions, rule.SchemaVersion) is { } problem)
        {
            work.Problem(AiChangeCodes.Invalid, SystemRuleEndpoints.ConditionMessage(problem), SystemRuleEndpoints.ConditionField);
            return;
        }

        // The route's own dependency check over what exists: in this universe, named by the condition, no cycle, not too
        // deep. A dependency this proposal creates is checked as a reference instead, and its cycles by the batch's own check.
        List<Guid> existing = [.. resolved.Where(each => each.Pending is null && each.Id is not null).Select(each => each.Id!.Value)];
        work.Problems(await SystemRuleEndpoints.DependencyProblemAsync(
            db,
            universeId,
            work.Action == AiChangeAction.Update ? work.TargetId : null,
            existing,
            rule.Condition,
            rule.Exceptions,
            cancellationToken));
    }

    private async Task CheckLoreSystemAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var system = (LoreSystemValues)work.Proposed;

        if (work.Action == AiChangeAction.Update)
        {
            if (await AiChangeSnapshots.LoreSystemAsync(db, universeId, work.TargetId!.Value, cancellationToken) is not { } stored)
            {
                work.Problem(AiChangeCodes.NotFound, "This System isn't in this universe any more.");
                return;
            }

            // The version covers the name and summary; the rule list is compared too, because the commit applies the
            // difference from it and would otherwise undo a link an author made since.
            if (stored.Version != work.BaseVersion || !AiChangeSnapshots.Same(stored.Form.RuleIds, ((LoreSystemValues?)work.Before)?.RuleIds))
            {
                work.Conflict("Someone saved this System after the AI suggested this change, so it can't be applied. Nothing newer will be overwritten. Reject it, or ask for the change again.");
            }
        }
        else if (system.ProjectId is { } projectId && !await WorldLogicAccess.IsProjectOfUniverseAsync(db, universeId, projectId, cancellationToken))
        {
            work.Problem(AiChangeCodes.NotFound, "No project of this universe has that id.", "projectId");
            return;
        }

        if (SystemEndpoints.Validate(new SystemRequest(system.Name, system.Summary, system.ProjectId)) is { } errors)
        {
            work.Problems(errors);
        }
        else
        {
            var normalized = ValidationTerm.Normalize(system.Name);
            if (await db.LoreSystems.AsNoTracking().AnyAsync(
                    candidate => candidate.UniverseId == universeId
                                 && candidate.ProjectId == system.ProjectId
                                 && candidate.NormalizedName == normalized
                                 && candidate.Id != work.TargetId,
                    cancellationToken))
            {
                work.Problem(AiChangeCodes.Duplicate, "Another System in this scope already has that name.", "name");
            }
        }

        if (system.RuleIds.Count > WorldLogicLimits.MaxRulesPerSystem)
        {
            work.Problem(AiChangeCodes.Invalid, $"A System references at most {WorldLogicAccess.Number(WorldLogicLimits.MaxRulesPerSystem)} rules.", "ruleIds");
        }

        if (system.RuleIds.Distinct().Count() != system.RuleIds.Count)
        {
            work.Problem(AiChangeCodes.Invalid, "Each rule appears once in a System's list.", "ruleIds");
        }

        var resolved = system.RuleIds.Select(rule => Resolve(rule)).ToList();
        var ids = resolved.Where(each => each.Pending is null && each.Id is not null).Select(each => each.Id!.Value).ToList();
        var found = await db.SystemRules.AsNoTracking()
            .Where(rule => rule.UniverseId == universeId && ids.Contains(rule.Id))
            .ToDictionaryAsync(rule => rule.Id, rule => rule.ProjectId, cancellationToken);

        foreach (var (id, pending) in resolved)
        {
            Guid? ruleProject;
            if (pending is not null)
            {
                ruleProject = (pending.Proposed as SystemRuleValues)?.ProjectId;
            }
            else if (id is not { } existing)
            {
                continue; // An unknown ref, already reported as one.
            }
            else if (!found.TryGetValue(existing, out ruleProject))
            {
                // Another universe's rule answers as a missing one does, as the link route answers it.
                work.Problem(AiChangeCodes.NotFound, "This universe has no such rule definition. Read them with list_world_logic_rules.", "ruleIds");
                continue;
            }

            if (system.ProjectId is { } systemProject && ruleProject is { } project && project != systemProject)
            {
                work.Problem(AiChangeCodes.Invalid, "A project's System cannot reference another project's rule.", "ruleIds");
            }
        }
    }

    /// <summary>How far to the right of the rightmost state a proposed state is placed on the canvas.</summary>
    private const double StateSpacing = 240;

    /// <summary>Stand-in ids for what this proposal creates, by the change's key, so a check can place it in a machine.</summary>
    private readonly Dictionary<string, Guid> _standIns = new(StringComparer.Ordinal);

    /// <summary>
    /// A proposed state or transition (#361), checked as the machine's own save checks it: the System's stored machine,
    /// with this proposal's earlier pending states and transitions of that System put in it in order and then this one,
    /// through <see cref="SystemMachineEndpoints.Problem"/> and <see cref="SystemMachineEndpoints.GuardProblemAsync"/>. What
    /// this proposal creates stands in with an id of its own. A refusal keeps the specification's code.
    /// </summary>
    private async Task CheckSystemMachineAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        // A reference already refused says what is wrong; the machine is not read through it.
        if (work.Issues.Count > 0)
        {
            return;
        }

        var (systemId, pendingSystem) = Resolve(SystemOf(work.Proposed));
        SystemMachineRequest document;
        Guid? project;
        if (pendingSystem is not null)
        {
            document = new SystemMachineRequest(SystemMachineEndpoints.SchemaVersion, null, [], [], null);
            project = (pendingSystem.Proposed as LoreSystemValues)?.ProjectId;
        }
        else
        {
            var system = await db.LoreSystems.AsNoTracking()
                .FirstOrDefaultAsync(candidate => candidate.Id == systemId && candidate.UniverseId == universeId, cancellationToken);
            if (system is null)
            {
                work.Problem(AiChangeCodes.NotFound, "This System isn't in this universe any more.", "system");
                return;
            }

            // A machine save bumps the System's version, so a version moved since staging is a machine saved since.
            if (work.BaseVersion is { } staged && staged != system.Version)
            {
                work.Conflict("Someone saved this System after the AI suggested this change, so it can't be applied. Nothing newer will be overwritten. Reject it, or ask for the change again.");
                return;
            }

            document = MachineDocument(await SystemMachineEndpoints.DetailAsync(db, system, cancellationToken));
            project = system.ProjectId;
        }

        var pendingGuards = new Dictionary<Guid, Guid?>();
        Guid Id(AiRef reference)
        {
            var (id, pending) = Resolve(reference);
            if (pending is null)
            {
                return id ?? Guid.Empty;
            }

            var standIn = StandIn(pending);
            if (pending.Proposed is SystemRuleValues rule)
            {
                pendingGuards[standIn] = rule.ProjectId;
            }

            return standIn;
        }

        foreach (var earlier in works.Where(other => other.IsPending
                     && other.Sequence < work.Sequence
                     && other.Resource is AiChangeResource.SystemState or AiChangeResource.SystemTransition
                     && Resolve(SystemOf(other.Proposed)) == (systemId, pendingSystem)))
        {
            // One that cannot go in reports that on itself; the machine goes on without it.
            if (Machine(document, earlier.Action, Item(earlier), earlier.Proposed, Id).Document is { } next)
            {
                document = next;
            }
        }

        var (proposed, refused) = Machine(document, work.Action, Item(work), work.Proposed, Id);
        var problem = refused
            ?? SystemMachineEndpoints.Problem(proposed!)
            ?? await SystemMachineEndpoints.GuardProblemAsync(db, universeId, project, proposed!.Transitions!, pendingGuards, cancellationToken);
        if (problem is { } failed)
        {
            work.Problem(failed.Code ?? AiChangeCodes.Invalid, failed.Message, failed.Field);
        }
    }

    private Guid Item(AiChangeWork work) => work.Action == AiChangeAction.Create ? StandIn(work) : work.TargetId!.Value;

    private Guid StandIn(AiChangeWork work)
    {
        if (!_standIns.TryGetValue(work.Key, out var id))
        {
            _standIns[work.Key] = id = Guid.NewGuid();
        }

        return id;
    }

    private static AiRef SystemOf(object proposed) => proposed is SystemStateValues state ? state.System : ((SystemTransitionValues)proposed).System;

    /// <summary>A System's machine as it is stored, as the whole document a save takes.</summary>
    internal static SystemMachineRequest MachineDocument(SystemMachineDetail detail) =>
        new(detail.SchemaVersion, detail.Binding, detail.States, detail.Transitions, detail.Version);

    /// <summary>
    /// The machine document with one proposed state or transition in it, as the check reads it and the commit saves it:
    /// a create added under <paramref name="itemId"/>, an update replacing the item with that id and keeping its place
    /// on the canvas. A new state goes to the right of the others; the first is initial on its own, and a state made
    /// initial takes the flag from the one that had it. Null and the reason when the change cannot go in at all.
    /// </summary>
    internal static (SystemMachineRequest? Document, (string Field, string Message, string? Code)? Problem) Machine(
        SystemMachineRequest document,
        AiChangeAction action,
        Guid itemId,
        object proposed,
        Func<AiRef, Guid> id)
    {
        List<SystemMachineState> states = [.. document.States ?? []];
        List<SystemMachineTransition> transitions = [.. document.Transitions ?? []];
        var binding = document.Binding;

        if (proposed is SystemStateValues state)
        {
            // The type and attribute are the machine's, named once, with its first state.
            if (state.Binding is not null && states.Count > 0)
            {
                return (null, ("systemState.subjectType", "Only a machine's first state names the type and attribute it covers. Leave subjectType and attribute out.", AiChangeCodes.Invalid));
            }

            if (action == AiChangeAction.Create)
            {
                binding = state.Binding ?? binding;
                var x = states.Count == 0 ? 0 : states.Max(other => other.X) + StateSpacing;
                states.Add(new SystemMachineState(itemId, state.Name, state.Value, state.Initial || states.Count == 0, x, 0));
            }
            else
            {
                var at = states.FindIndex(other => other.Id == itemId);
                if (at < 0)
                {
                    return (null, ("targetId", "That state isn't in this System's machine any more.", AiChangeCodes.NotFound));
                }

                states[at] = states[at] with { Name = state.Name, Value = state.Value };
            }

            if (state.Initial)
            {
                states = [.. states.Select(other => other with { Initial = other.Id == itemId })];
            }
        }
        else if (proposed is SystemTransitionValues transition)
        {
            var made = new SystemMachineTransition(
                itemId,
                id(transition.From),
                id(transition.To),
                transition.Label,
                transition.Guard is { } guard ? id(guard) : null);
            if (action == AiChangeAction.Create)
            {
                transitions.Add(made);
            }
            else
            {
                var at = transitions.FindIndex(other => other.Id == itemId);
                if (at < 0)
                {
                    return (null, ("targetId", "That transition isn't in this System's machine any more.", AiChangeCodes.NotFound));
                }

                transitions[at] = made;
            }
        }

        return (document with { Binding = binding, States = states, Transitions = transitions }, null);
    }

    /// <summary>The route's request for a proposed rule definition: what the check validates and the commit sends.</summary>
    internal static SystemRuleRequest RuleRequest(SystemRuleValues rule, IReadOnlyList<Guid> dependsOn, int? expectedVersion) => new(
        rule.Title,
        rule.Description,
        rule.ProjectId,
        rule.SchemaVersion,
        Element(rule.Condition),
        dependsOn,
        expectedVersion,
        Element(rule.Exceptions));

    private static JsonElement? Element(string? json) => json is null ? null : JsonSerializer.Deserialize<JsonElement>(json);
}
