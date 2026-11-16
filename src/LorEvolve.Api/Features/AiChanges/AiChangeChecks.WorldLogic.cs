using System.Text.Json;
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
            var normalized = WorldLogicAccess.Normalize(system.Name);
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
