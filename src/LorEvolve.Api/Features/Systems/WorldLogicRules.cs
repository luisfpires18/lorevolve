using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.RuleValidation.Conditions;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// Reads a universe's stored rules into the shape the evaluator understands (ADR 0072).
///
/// <b>One place, because there will be three callers.</b> The evaluate route reads it, the finding sweep
/// (LOREX-020) will, and MCP (LOREX-021) will. A second projection would be a second chance to disagree about what
/// a rule's declared dependencies or exceptions are.
///
/// <b>The whole universe's rules, every time.</b> A rule's condition may name any rule it declared, and a
/// dependency's own dependencies reach further still, so a run that loaded only the rule it was asked about could
/// not answer <c>ruleHolds</c> at all. A universe's rules are counted in tens.
/// </summary>
public static class WorldLogicRuleSet
{
    /// <summary>
    /// Every rule definition of the universe, with its declared dependencies and its exceptions, as values.
    ///
    /// An exception whose stored JSON cannot be read is dropped rather than failing the whole rule set: the save
    /// validates it, so an unreadable one means the row was changed outside the API, and the rule then reports its
    /// violation without the exception rather than reporting nothing at all.
    /// </summary>
    public static async Task<List<EvaluatedRule>> LoadAsync(
        LorEvolveDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var rules = await db.SystemRules.AsNoTracking()
            .Where(rule => rule.UniverseId == universeId)
            .Select(rule => new
            {
                rule.Id,
                rule.Version,
                rule.SchemaVersion,
                rule.ConditionJson,
                rule.ExceptionsJson,
            })
            .ToListAsync(cancellationToken);

        var dependencies = await db.SystemRuleDependencies.AsNoTracking()
            .Where(dependency => dependency.Rule!.UniverseId == universeId)
            .Select(dependency => new { dependency.RuleId, dependency.DependsOnRuleId })
            .ToListAsync(cancellationToken);

        return
        [
            .. rules.Select(rule => new EvaluatedRule(
                rule.Id.ToString(),
                rule.Version,

                // A rule that is words only has no schema version; the evaluator is told the current one so the
                // rule reads as "nothing to evaluate" rather than as a version it cannot read.
                rule.SchemaVersion ?? ConditionSchema.CurrentVersion,
                rule.ConditionJson,
                [
                    .. dependencies
                        .Where(dependency => dependency.RuleId == rule.Id)
                        .Select(dependency => dependency.DependsOnRuleId.ToString()),
                ],
                Exceptions(rule.ExceptionsJson))),
        ];
    }

    /// <summary>
    /// The stored exceptions as values, in the author's order, which is part of their meaning: inside one scope the
    /// first one that holds wins.
    /// </summary>
    private static List<EvaluatedException> Exceptions(string? exceptionsJson)
    {
        if (exceptionsJson is null)
        {
            return [];
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(exceptionsJson);
        }
        catch (JsonException)
        {
            return [];
        }

        using (document)
        {
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var exceptions = new List<EvaluatedException>();

            foreach (var exception in document.RootElement.EnumerateArray())
            {
                if (exception.ValueKind != JsonValueKind.Object
                    || !exception.TryGetProperty("id", out var id)
                    || id.ValueKind != JsonValueKind.String
                    || !exception.TryGetProperty("when", out var when))
                {
                    continue;
                }

                var projectId = exception.TryGetProperty("scope", out var scope)
                                && scope.TryGetProperty("projectId", out var project)
                                && project.ValueKind == JsonValueKind.String
                    ? project.GetString()
                    : null;

                exceptions.Add(new EvaluatedException(id.GetString()!, projectId, when.GetRawText()));
            }

            return exceptions;
        }
    }
}
