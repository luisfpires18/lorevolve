using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.RuleValidation.Conditions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// A System's state machine, read and saved as one document (ADR 0073, state machine specification, section 3).
///
/// <b>The access rule of the other <c>/systems</c> routes.</b> Every route passes <see cref="WorldLogicAccess"/> first,
/// and finds the System only by its id and that universe together. A guard is resolved inside the universe, and inside
/// the System's project when it has one.
///
/// <b>Saved whole, under the System's version.</b> There are no per-state routes. A save names the System's
/// <c>version</c>; a stale one is refused with 409 <c>system_changed</c>, and a save that changes nothing writes nothing
/// and leaves the version alone. A save writes no revision row: a machine is not part of a System's history, as its
/// rule links are not.
///
/// <b>Refusals carry the specification's codes.</b> Each is a field-keyed problem with a <c>code</c> extension, and the
/// first failure wins. Structural problems a client prevents on its own carry no code.
///
/// <b>Nothing here evaluates anything.</b> No route reads a subject, a fact or a finding.
///
/// Two exceptions since #360, both read-only: the machine's detail counts its open findings per state, and "Try an
/// entry" runs both checks for one entry and writes nothing, with the read access the rule evaluate route takes.
/// </summary>
public static class SystemMachineEndpoints
{
    /// <summary>The one machine document version this build knows.</summary>
    public const int SchemaVersion = 1;

    public const string SchemaVersionUnsupportedCode = "schema_version_unsupported";

    public const string StateLimitCode = "machine_state_limit";

    public const string TransitionLimitCode = "machine_transition_limit";

    public const string BindingRequiredCode = "binding_required";

    public const string InitialStateRequiredCode = "initial_state_required";

    public const string DuplicateStateValueCode = "duplicate_state_value";

    public const string UnknownStateCode = "unknown_state";

    public const string SelfTransitionCode = "self_transition";

    public const string GuardRuleNotFoundCode = "guard_rule_not_found";

    public const string GuardScopeMismatchCode = "guard_scope_mismatch";

    public static IEndpointRouteBuilder MapSystemMachineEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/systems")
            .WithTags("World Logic systems")
            .RequireAuthorization();

        group.MapGet("/{id:guid}/machine", GetAsync).WithName("GetSystemMachine");
        group.MapPut("/{id:guid}/machine", SaveAsync).WithName("SaveSystemMachine");
        group.MapPost("/{id:guid}/machine/evaluate/{subjectId:guid}", EvaluateAsync).WithName("EvaluateSystemMachine");

        return endpoints;
    }

    /// <summary>
    /// "Try an entry" (#360): every transition's guard for one entry, and the records both checks produce for it, in
    /// the System's own scope. 404 for a System or an entry outside the universe; empty lists for a System with no
    /// machine. Nothing is written, so it takes read access, as evaluating one rule does.
    /// </summary>
    private static async Task<IResult> EvaluateAsync(
        Guid universeId,
        Guid id,
        Guid subjectId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var system = await db.LoreSystems.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        if (system is null
            || !await db.Entities.AsNoTracking().AnyAsync(
                entity => entity.Id == subjectId && entity.UniverseId == universeId && entity.DeletedAt == null,
                cancellationToken))
        {
            return Results.NotFound();
        }

        if ((await WorldLogicMachineCheck.LoadAsync(db, universeId, id, cancellationToken)).FirstOrDefault() is not { } machine)
        {
            return Results.Ok(new SystemMachineTryResponse(null, [], []));
        }

        var facts = await UniverseConditionFacts.LoadAsync(db, universeId, cancellationToken);
        var evaluator = new WorldLogicEvaluator(facts, await WorldLogicRuleSet.LoadAsync(db, universeId, cancellationToken));
        var subject = subjectId.ToString();
        var project = system.ProjectId?.ToString();

        var guards = WorldLogicMachineCheck.Guards(machine, evaluator, subject, project);
        var record = WorldLogicMachineCheck.Check(machine, facts, evaluator, subject, project);

        return Results.Ok(new SystemMachineTryResponse(
            WorldLogicMachineCheck.ValueOf(machine, facts, subject),
            [.. guards.Select(guard => new SystemMachineGuardRow(Guid.Parse(guard.TransitionId), guard.Role, guard.ErrorCode))],
            record is null
                ? []
                :
                [
                    new SystemMachineRecordRow(
                        system.Id,
                        record.SystemVersion,
                        record.SchemaVersion,
                        WorldLogicMachineCheck.Name(record.Check),
                        record.StateId is null ? null : Guid.Parse(record.StateId),
                        subjectId,
                        FindingEndpoints.Outcome(record.Outcome),
                        record.ErrorCode,
                        [.. record.Evidence.Select(item => new ConditionEvidenceRow(item.Source, item.Id, item.Role))],
                        record.Rationale),
                ]));
    }

    /// <summary>The machine, or a null binding and empty lists when the System has none.</summary>
    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var system = await db.LoreSystems.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        if (system is null)
        {
            return Results.NotFound();
        }

        return Results.Ok(await DetailAsync(db, system, cancellationToken));
    }

    /// <summary>Replaces the whole machine: checked as one document, then the stored rows deleted and the new ones written.</summary>
    private static async Task<IResult> SaveAsync(
        Guid universeId,
        Guid id,
        [FromBody] SystemMachineRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await SaveCoreAsync(db, universeId, id, request, cancellationToken);
    }

    /// <summary>
    /// The save behind the route's access check. An approved AI change to a state or a transition (#361) is saved
    /// through here, so it is held to exactly what a <c>PUT</c> is.
    /// </summary>
    internal static async Task<IResult> SaveCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid id,
        SystemMachineRequest request,
        CancellationToken cancellationToken)
    {
        if (Problem(request) is { } problem)
        {
            return Refused(problem);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var system = await db.LoreSystems
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        if (system is null)
        {
            return Results.NotFound();
        }

        if (request.ExpectedVersion != system.Version)
        {
            return SystemEndpoints.Changed();
        }

        var states = request.States ?? [];
        var transitions = request.Transitions ?? [];

        if (await GuardProblemAsync(db, universeId, system.ProjectId, transitions, null, cancellationToken) is { } guardProblem)
        {
            return Refused(guardProblem);
        }

        var binding = request.Binding is null && states.Count == 0 ? null : request.Binding;
        var normalizedStates = states.Select(state => state with { Name = state.Name!.Trim() }).ToList();
        var stored = await DetailAsync(db, system, cancellationToken);

        if (binding == stored.Binding
            && normalizedStates.SequenceEqual(stored.States)
            && transitions.SequenceEqual(stored.Transitions))
        {
            // A save that changes nothing writes nothing and leaves the version alone.
            return Results.Ok(stored);
        }

        // The cascade takes the states and the transitions with the machine row.
        await db.SystemMachines.Where(machine => machine.SystemId == system.Id).ExecuteDeleteAsync(cancellationToken);

        if (binding is not null)
        {
            db.SystemMachines.Add(new SystemMachine
            {
                SystemId = system.Id,
                SubjectType = binding.SubjectType!,
                Attribute = binding.Attribute!,
                SchemaVersion = SchemaVersion,
            });

            db.SystemStates.AddRange(normalizedStates.Select((state, order) => new SystemState
            {
                SystemId = system.Id,
                Id = state.Id,
                Name = state.Name!,
                Value = state.Value!,
                IsInitial = state.Initial,
                X = state.X,
                Y = state.Y,
                SortOrder = order,
            }));

            db.SystemTransitions.AddRange(transitions.Select((transition, order) => new SystemTransition
            {
                SystemId = system.Id,
                Id = transition.Id,
                FromStateId = transition.FromStateId,
                ToStateId = transition.ToStateId,
                Label = transition.Label,
                GuardRuleId = transition.GuardRuleId,
                SortOrder = order,
            }));
        }

        system.Version++;
        system.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await DetailAsync(db, system, cancellationToken));
    }

    /// <summary>
    /// The first thing wrong with a machine document that needs no database to see, as the field it is at, a message
    /// and the specification's code (null for a structural problem), or null when there is none. Pure, so a backup is
    /// held to exactly what a save is.
    /// </summary>
    internal static (string Field, string Message, string? Code)? Problem(SystemMachineRequest request)
    {
        if (request.SchemaVersion != SchemaVersion)
        {
            return ("schemaVersion", "This machine is written for a version LorEvolve does not know.", SchemaVersionUnsupportedCode);
        }

        var states = request.States ?? [];
        var transitions = request.Transitions ?? [];

        if (states.Count > WorldLogicLimits.MaxStates)
        {
            return ("states", $"A machine has at most {WorldLogicAccess.Number(WorldLogicLimits.MaxStates)} states.", StateLimitCode);
        }

        if (transitions.Count > WorldLogicLimits.MaxTransitions)
        {
            return (
                "transitions",
                $"A machine has at most {WorldLogicAccess.Number(WorldLogicLimits.MaxTransitions)} transitions.",
                TransitionLimitCode);
        }

        var limit = WorldLogicAccess.Number(WorldLogicLimits.NameMaxLength);
        var ids = new HashSet<Guid>();

        for (var index = 0; index < states.Count; index++)
        {
            var state = states[index];
            var at = $"states[{index}]";

            if (state is null)
            {
                return (at, "Insert a state.", null);
            }

            if (state.Id == Guid.Empty || !ids.Add(state.Id))
            {
                return ($"{at}.id", "Each state and transition needs an id of its own.", null);
            }

            if (string.IsNullOrWhiteSpace(state.Name))
            {
                return ($"{at}.name", "Insert a name.", null);
            }

            if (state.Name.Trim().Length > WorldLogicLimits.NameMaxLength)
            {
                return ($"{at}.name", $"A name is at most {limit} characters.", null);
            }

            if (string.IsNullOrWhiteSpace(state.Value))
            {
                return ($"{at}.value", "Insert a value.", null);
            }

            if (state.Value.Length > WorldLogicLimits.NameMaxLength)
            {
                return ($"{at}.value", $"A value is at most {limit} characters.", null);
            }

            if (!Coordinate(state.X) || !Coordinate(state.Y))
            {
                return ($"{at}.{(Coordinate(state.X) ? "y" : "x")}", "A state sits at a finite place on the canvas.", null);
            }
        }

        for (var index = 0; index < transitions.Count; index++)
        {
            var transition = transitions[index];
            var at = $"transitions[{index}]";

            if (transition is null)
            {
                return (at, "Insert a transition.", null);
            }

            if (transition.Id == Guid.Empty || !ids.Add(transition.Id))
            {
                return ($"{at}.id", "Each state and transition needs an id of its own.", null);
            }

            if (transition.Label is { Length: > WorldLogicLimits.NameMaxLength })
            {
                return ($"{at}.label", $"A label is at most {limit} characters.", null);
            }
        }

        if (request.Binding is { } binding)
        {
            if (string.IsNullOrWhiteSpace(binding.SubjectType))
            {
                return ("binding.subjectType", "Insert the type the machine covers.", BindingRequiredCode);
            }

            if (string.IsNullOrWhiteSpace(binding.Attribute))
            {
                return ("binding.attribute", "Insert the attribute that holds the state.", BindingRequiredCode);
            }

            if (binding.SubjectType.Length > WorldLogicLimits.NameMaxLength)
            {
                return ("binding.subjectType", $"A type is at most {limit} characters.", null);
            }

            if (binding.Attribute.Length > WorldLogicLimits.NameMaxLength)
            {
                return ("binding.attribute", $"An attribute is at most {limit} characters.", null);
            }
        }
        else if (states.Count > 0)
        {
            return ("binding", "A machine with states names the type and attribute it covers.", BindingRequiredCode);
        }

        if (states.Count > 0 && states.Count(state => state.Initial) != 1)
        {
            return ("states", "Exactly one state is the initial one.", InitialStateRequiredCode);
        }

        var values = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < states.Count; index++)
        {
            if (!values.Add(states[index].Value!))
            {
                return ($"states[{index}].value", "Two states share this value.", DuplicateStateValueCode);
            }
        }

        var stateIds = states.Select(state => state.Id).ToHashSet();
        for (var index = 0; index < transitions.Count; index++)
        {
            var transition = transitions[index];

            if (!stateIds.Contains(transition.FromStateId))
            {
                return ($"transitions[{index}].fromStateId", "The transition starts at a state this machine does not hold.", UnknownStateCode);
            }

            if (!stateIds.Contains(transition.ToStateId))
            {
                return ($"transitions[{index}].toStateId", "The transition ends at a state this machine does not hold.", UnknownStateCode);
            }

            if (transition.FromStateId == transition.ToStateId)
            {
                return ($"transitions[{index}].toStateId", "A transition joins two different states.", SelfTransitionCode);
            }
        }

        return null;
    }

    /// <summary>
    /// The first guard that names no rule of this universe, or a rule of a project the System is not in, as
    /// <see cref="Problem"/> answers; null when every guard is good. <paramref name="pending"/> holds rules an AI change
    /// creates (#361), by the stand-in id its check gave each, with the project each would be in.
    /// </summary>
    internal static async Task<(string Field, string Message, string? Code)?> GuardProblemAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid? systemProjectId,
        IReadOnlyList<SystemMachineTransition> transitions,
        IReadOnlyDictionary<Guid, Guid?>? pending,
        CancellationToken cancellationToken)
    {
        // A guard is a rule of this universe, and inside the System's project when the rule is project-scoped.
        var guardIds = transitions.Where(transition => transition.GuardRuleId is not null)
            .Select(transition => transition.GuardRuleId!.Value)
            .Distinct()
            .ToList();
        var guards = await db.SystemRules.AsNoTracking()
            .Where(rule => guardIds.Contains(rule.Id) && rule.UniverseId == universeId)
            .Select(rule => new { rule.Id, rule.ProjectId })
            .ToDictionaryAsync(rule => rule.Id, rule => rule.ProjectId, cancellationToken);

        for (var index = 0; index < transitions.Count; index++)
        {
            if (transitions[index].GuardRuleId is not { } guardId)
            {
                continue;
            }

            var field = $"transitions[{index}].guardRuleId";
            if (!guards.TryGetValue(guardId, out var guardProject) && pending?.TryGetValue(guardId, out guardProject) != true)
            {
                return (field, "The guard names no rule definition of this universe.", GuardRuleNotFoundCode);
            }

            if (guardProject is not null && guardProject != systemProjectId)
            {
                return (field, "The guard belongs to a project this System is not in.", GuardScopeMismatchCode);
            }
        }

        return null;
    }

    internal static async Task<SystemMachineDetail> DetailAsync(
        LorEvolveDbContext db,
        LoreSystem system,
        CancellationToken cancellationToken)
    {
        var machine = await db.SystemMachines.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.SystemId == system.Id, cancellationToken);

        if (machine is null)
        {
            return new SystemMachineDetail(system.Id, system.Version, SchemaVersion, null, [], [], []);
        }

        var states = await db.SystemStates.AsNoTracking()
            .Where(state => state.SystemId == system.Id)
            .OrderBy(state => state.SortOrder)
            .Select(state => new SystemMachineState(state.Id, state.Name, state.Value, state.IsInitial, state.X, state.Y))
            .ToListAsync(cancellationToken);

        var transitions = await db.SystemTransitions.AsNoTracking()
            .Where(transition => transition.SystemId == system.Id)
            .OrderBy(transition => transition.SortOrder)
            .Select(transition => new SystemMachineTransition(
                transition.Id, transition.FromStateId, transition.ToStateId, transition.Label, transition.GuardRuleId))
            .ToListAsync(cancellationToken);

        // The open and reviewing machine findings per state, in the System's own scope (#360). A state the machine no
        // longer holds is left out: its findings close on the next sweep.
        var open = await db.WorldLogicFindingMachines.AsNoTracking()
            .Where(link => link.SystemId == system.Id
                && link.StateId != null
                && link.Finding!.ProjectId == system.ProjectId
                && (link.Finding.Status == WorldLogicFindingStatus.Open
                    || link.Finding.Status == WorldLogicFindingStatus.Reviewing))
            .GroupBy(link => link.StateId!.Value)
            .Select(group => new SystemMachineOpenFindings(group.Key, group.Count()))
            .ToListAsync(cancellationToken);

        return new SystemMachineDetail(
            system.Id,
            system.Version,
            machine.SchemaVersion,
            new SystemMachineBinding(machine.SubjectType, machine.Attribute),
            states,
            transitions,
            [.. states.Select(state => open.FirstOrDefault(count => count.StateId == state.Id)).OfType<SystemMachineOpenFindings>()]);
    }

    private static bool Coordinate(double value) =>
        double.IsFinite(value) && Math.Abs(value) <= WorldLogicLimits.MaxCoordinate;

    private static IResult Refused((string Field, string Message, string? Code) problem) =>
        Problems.Field(
            problem.Field,
            problem.Message,
            extensions: problem.Code is null ? null : new Dictionary<string, object?> { ["code"] = problem.Code });
}
