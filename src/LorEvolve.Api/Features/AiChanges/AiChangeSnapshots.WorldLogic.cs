using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// The stored forms of World Logic rule definitions and Systems (ADR 0072), read as an AI change reads them, with the
/// edit version each carries. Lists are in a fixed order, so a form read twice is equal exactly when nothing it shows changed.
/// A machine's state or transition (#361) carries its System's version, which every machine save bumps.
/// </summary>
internal static partial class AiChangeSnapshots
{
    /// <summary>A rule definition of this universe as it is now, and its version; null when there is none.</summary>
    public static async Task<(SystemRuleValues Form, int Version)?> SystemRuleAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid ruleId,
        CancellationToken cancellationToken)
    {
        var row = await db.SystemRules.AsNoTracking()
            .Where(rule => rule.Id == ruleId && rule.UniverseId == universeId)
            .Select(rule => new
            {
                rule.ProjectId,
                rule.Title,
                rule.Description,
                rule.SchemaVersion,
                rule.ConditionJson,
                rule.ExceptionsJson,
                rule.Version,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        var dependsOn = await db.SystemRuleDependencies.AsNoTracking()
            .Where(dependency => dependency.RuleId == ruleId)
            .Select(dependency => dependency.DependsOnRuleId)
            .ToListAsync(cancellationToken);

        return (new SystemRuleValues(
            row.ProjectId,
            row.Title,
            row.Description,
            row.SchemaVersion,
            row.ConditionJson,
            row.ExceptionsJson,
            Dependencies(dependsOn.Select(AiRef.To))), row.Version);
    }

    /// <summary>A System of this universe as it is now, with its rule list in its order, and its version; null when there is none.</summary>
    public static async Task<(LoreSystemValues Form, int Version)?> LoreSystemAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid systemId,
        CancellationToken cancellationToken)
    {
        var row = await db.LoreSystems.AsNoTracking()
            .Where(system => system.Id == systemId && system.UniverseId == universeId)
            .Select(system => new { system.ProjectId, system.Name, system.Summary, system.Version })
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            return null;
        }

        // The order a System's rules read in everywhere else (SystemRuleEndpoints.SummariesOfSystemAsync).
        var rules = await db.LoreSystemRules.AsNoTracking()
            .Where(link => link.SystemId == systemId)
            .OrderBy(link => link.SortOrder)
            .ThenBy(link => link.Rule!.Title)
            .ThenBy(link => link.RuleId)
            .Select(link => link.RuleId)
            .ToListAsync(cancellationToken);

        return (new LoreSystemValues(row.ProjectId, row.Name, row.Summary, [.. rules.Select(AiRef.To)]), row.Version);
    }

    /// <summary>A System's version when the System is in this universe, which a machine change is staged over; null otherwise.</summary>
    public static Task<int?> SystemVersionAsync(LorEvolveDbContext db, Guid universeId, Guid systemId, CancellationToken cancellationToken) =>
        db.LoreSystems.AsNoTracking()
            .Where(system => system.Id == systemId && system.UniverseId == universeId)
            .Select(system => (int?)system.Version)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>One state of a System's machine as it is now, with the System's version; null when either is not here.</summary>
    public static async Task<(SystemStateValues Form, int Version)?> SystemStateAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid systemId,
        Guid stateId,
        CancellationToken cancellationToken)
    {
        if (await SystemVersionAsync(db, universeId, systemId, cancellationToken) is not { } version)
        {
            return null;
        }

        var state = await db.SystemStates.AsNoTracking()
            .Where(candidate => candidate.SystemId == systemId && candidate.Id == stateId)
            .Select(candidate => new { candidate.Name, candidate.Value, candidate.IsInitial })
            .FirstOrDefaultAsync(cancellationToken);

        return state is null ? null : (new SystemStateValues(AiRef.To(systemId), state.Name, state.Value, state.IsInitial, null), version);
    }

    /// <summary>One transition of a System's machine as it is now, with the System's version; null when either is not here.</summary>
    public static async Task<(SystemTransitionValues Form, int Version)?> SystemTransitionAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid systemId,
        Guid transitionId,
        CancellationToken cancellationToken)
    {
        if (await SystemVersionAsync(db, universeId, systemId, cancellationToken) is not { } version)
        {
            return null;
        }

        var transition = await db.SystemTransitions.AsNoTracking()
            .Where(candidate => candidate.SystemId == systemId && candidate.Id == transitionId)
            .Select(candidate => new { candidate.FromStateId, candidate.ToStateId, candidate.Label, candidate.GuardRuleId })
            .FirstOrDefaultAsync(cancellationToken);

        return transition is null
            ? null
            : (new SystemTransitionValues(
                AiRef.To(systemId),
                AiRef.To(transition.FromStateId),
                AiRef.To(transition.ToStateId),
                transition.Label,
                transition.GuardRuleId is { } guard ? AiRef.To(guard) : null), version);
    }

    /// <summary>A rule's dependencies are a set: ids first, by id, then this proposal's refs, by key, so equal sets compare equal.</summary>
    public static List<AiRef> Dependencies(IEnumerable<AiRef> references) =>
    [
        .. references
            .DistinctBy(reference => (reference.Id, reference.Key))
            .OrderBy(reference => reference.Id is null)
            .ThenBy(reference => reference.Id)
            .ThenBy(reference => reference.Key, StringComparer.Ordinal),
    ];
}
