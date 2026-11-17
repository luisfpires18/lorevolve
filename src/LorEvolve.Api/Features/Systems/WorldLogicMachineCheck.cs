using System.Text;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.RuleValidation.Conditions;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// One machine as a check reads it (state machine specification, section 2). Ids are text, so a production machine
/// and a fixture's labels run through the same code.
/// </summary>
public sealed record CheckedMachine(
    string SystemId,
    int SystemVersion,
    int SchemaVersion,
    string SubjectType,
    string Attribute,
    IReadOnlyList<CheckedState> States,
    IReadOnlyList<CheckedTransition> Transitions);

public sealed record CheckedState(string Id, string Value, bool Initial);

/// <summary>One transition, in declared order. <paramref name="GuardRuleId"/> is null for no requirement.</summary>
public sealed record CheckedTransition(string Id, string ToStateId, string? GuardRuleId);

/// <summary>
/// One record a check produced (specification section 5). <paramref name="StateId"/> is null for
/// <c>undeclared_state</c>; <paramref name="Value"/> is the text found for <c>undeclared_state</c>, null otherwise.
/// </summary>
public sealed record MachineRecord(
    string SystemId,
    int SystemVersion,
    int SchemaVersion,
    MachineCheck Check,
    string? StateId,
    string SubjectId,
    WorldLogicFindingOutcome Outcome,
    string? ErrorCode,
    string? Value,
    IReadOnlyList<ConditionEvidence> Evidence,
    IReadOnlyList<string> Rationale);

/// <summary>
/// Every record of one run. <paramref name="IsTruncated"/> is true when a machine's type has more subjects than one
/// run reads (<see cref="ConditionBudget.MaxQueryRows"/>), and a truncated sweep closes nothing.
/// </summary>
public sealed record MachineRun(IReadOnlyList<MachineRecord> Records, bool IsTruncated);

/// <summary>
/// One guard as a check counted it. <paramref name="Role"/> is <c>true</c>, <c>false</c>, <c>unknown</c>,
/// <c>error</c> or <c>none</c>: an <c>exempt</c> rule counts as met, so it reads <c>true</c>.
/// </summary>
public sealed record MachineGuard(
    string TransitionId,
    string Role,
    ConditionOutcome Counted,
    string? ErrorCode,
    IReadOnlyList<ConditionEvidence> Evidence);

/// <summary>
/// The two checks of the state machine specification, section 4 (#360, ADR 0073).
///
/// <b>A pure function of the machine, the facts and the rules.</b> Guards are answered by
/// <see cref="WorldLogicEvaluator"/> exactly as a rule is, with the subject as <c>self</c>; nothing here reads a
/// condition, and nothing here writes. Two runs over unchanged inputs produce identical records.
/// </summary>
public static class WorldLogicMachineCheck
{
    public const string TransitionsSource = "transitions";

    /// <summary>
    /// Every machine against every subject of its bound type, in ascending id order. Each subject gets one evaluator,
    /// shared across machines, so a guard is memoised per subject and rule and the rule budget is per subject.
    /// </summary>
    public static MachineRun Run(
        IReadOnlyList<CheckedMachine> machines,
        IConditionFacts facts,
        IReadOnlyList<EvaluatedRule> rules,
        string? projectId,
        ConditionBudget? budget = null)
    {
        var limit = (budget ?? ConditionBudget.Default).MaxQueryRows;
        var evaluators = new Dictionary<string, WorldLogicEvaluator>(StringComparer.Ordinal);
        var records = new List<MachineRecord>();
        var truncated = false;

        foreach (var machine in machines)
        {
            // shortcut: the facts return the first limit + 1 rows in their own order, so a truncated run checks a
            // stable subset rather than the lowest ids; a truncated sweep closes nothing, so that is enough for now.
            var subjects = facts.Query(
                "subjects",
                [new FactClause("type", "eq", ConditionValue.OfText(machine.SubjectType))],
                limit) ?? [];

            truncated |= subjects.Count > limit;

            foreach (var subjectId in subjects.Select(row => row.Id!).Order(StringComparer.Ordinal).Take(limit))
            {
                if (!evaluators.TryGetValue(subjectId, out var evaluator))
                {
                    evaluator = new WorldLogicEvaluator(facts, rules, budget);
                    evaluators[subjectId] = evaluator;
                }

                if (Check(machine, facts, evaluator, subjectId, projectId) is { } record)
                {
                    records.Add(record);
                }
            }
        }

        return new MachineRun(records, truncated);
    }

    /// <summary>
    /// Both checks for one subject: the record it produces, or null when there is nothing to report. A subject of
    /// another type is not covered, one without the bound attribute is outside the machine, and one in the initial
    /// state is never checked.
    /// </summary>
    public static MachineRecord? Check(
        CheckedMachine machine,
        IConditionFacts facts,
        WorldLogicEvaluator evaluator,
        string subjectId,
        string? projectId)
    {
        var value = facts.Attribute(subjectId, machine.Attribute);
        if (!Covers(machine, facts, subjectId) || value.IsMissing)
        {
            return null;
        }

        List<ConditionEvidence> evidence =
        [
            new("subjects", subjectId, "self"),
            new("subjects", subjectId, $"attribute:{machine.Attribute}"),
        ];

        if (value.Kind != ConditionValueKind.Text)
        {
            return Record(machine, MachineCheck.UndeclaredState, null, subjectId, WorldLogicFindingOutcome.Error,
                ConditionErrors.TypeMismatch, null, evidence, [$"undeclared_state of self: attribute:{machine.Attribute} is not text"]);
        }

        if (StateOf(machine, value) is not { } state)
        {
            return Record(machine, MachineCheck.UndeclaredState, null, subjectId, WorldLogicFindingOutcome.Violation,
                null, value.Text, evidence, [$"undeclared_state of self: {value.Text} is no state"]);
        }

        if (state.Initial)
        {
            return null;
        }

        // The incoming transitions combine as any does (condition specification, section 4): true wins and stops
        // the walk; otherwise error, then unknown, then false. A state nothing leads to combines to false.
        var combined = ConditionOutcome.False;
        string? errorCode = null;
        var rationale = new List<string>();

        foreach (var transition in machine.Transitions.Where(transition => transition.ToStateId == state.Id))
        {
            var guard = Guard(transition, evaluator, subjectId, projectId);

            evidence.Add(new(TransitionsSource, transition.Id, $"guard:{guard.Role}"));
            evidence.AddRange(guard.Evidence);
            rationale.Add($"state {state.Value} of self: {transition.Id} guard {transition.GuardRuleId ?? "none"} -> {guard.Role}");

            if (guard.Counted == ConditionOutcome.True)
            {
                return null;
            }

            if (guard.Counted == ConditionOutcome.Error && combined != ConditionOutcome.Error)
            {
                // The code of the first transition that failed with an error, in declared order.
                combined = ConditionOutcome.Error;
                errorCode = guard.ErrorCode;
            }
            else if (guard.Counted == ConditionOutcome.Unknown && combined == ConditionOutcome.False)
            {
                combined = ConditionOutcome.Unknown;
            }
        }

        var outcome = combined switch
        {
            ConditionOutcome.Error => WorldLogicFindingOutcome.Error,
            ConditionOutcome.Unknown => WorldLogicFindingOutcome.Unknown,
            _ => WorldLogicFindingOutcome.Violation,
        };

        return Record(machine, MachineCheck.NoTransitionHolds, state.Id, subjectId, outcome, errorCode, null, evidence, rationale);
    }

    /// <summary>
    /// Every transition's guard for one subject, without the short-circuit a check takes, for "Try an entry". Writes
    /// nothing and decides nothing: a check is what turns guards into a record.
    /// </summary>
    public static IReadOnlyList<MachineGuard> Guards(
        CheckedMachine machine,
        WorldLogicEvaluator evaluator,
        string subjectId,
        string? projectId) =>
        [.. machine.Transitions.Select(transition => Guard(transition, evaluator, subjectId, projectId))];

    /// <summary>
    /// The value the subject holds, as text, or null when it is of another type, holds none, or holds a value that is
    /// not text.
    /// </summary>
    public static string? ValueOf(CheckedMachine machine, IConditionFacts facts, string subjectId) =>
        Covers(machine, facts, subjectId)
        && facts.Attribute(subjectId, machine.Attribute) is { Kind: ConditionValueKind.Text } value
            ? value.Text
            : null;

    /// <summary>Whether the subject is of the bound type, compared as the facts give it.</summary>
    private static bool Covers(CheckedMachine machine, IConditionFacts facts, string subjectId) =>
        facts.Field("subjects", subjectId, "type") is { Kind: ConditionValueKind.Text } type
        && string.Equals(type.Text, ConditionValue.OfText(machine.SubjectType).Text, StringComparison.Ordinal);

    /// <summary>The check as the specification writes it.</summary>
    public static string Name(MachineCheck check) => check switch
    {
        MachineCheck.UndeclaredState => "undeclared_state",
        _ => "no_transition_holds",
    };

    /// <summary>
    /// Every machine of the universe, or of one System, as a check reads it, ordered by System id so two runs walk
    /// them in the same order. A System with no machine row is not here.
    /// </summary>
    public static async Task<List<CheckedMachine>> LoadAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid? systemId,
        CancellationToken cancellationToken)
    {
        var machines = await db.SystemMachines.AsNoTracking()
            .Where(machine => machine.LoreSystem!.UniverseId == universeId
                && (systemId == null || machine.SystemId == systemId))
            .Select(machine => new
            {
                machine.SystemId,
                machine.LoreSystem!.Version,
                machine.SchemaVersion,
                machine.SubjectType,
                machine.Attribute,
            })
            .ToListAsync(cancellationToken);

        var ids = machines.Select(machine => machine.SystemId).ToList();

        var states = await db.SystemStates.AsNoTracking()
            .Where(state => ids.Contains(state.SystemId))
            .OrderBy(state => state.SortOrder)
            .Select(state => new { state.SystemId, state.Id, state.Value, state.IsInitial })
            .ToListAsync(cancellationToken);

        var transitions = await db.SystemTransitions.AsNoTracking()
            .Where(transition => ids.Contains(transition.SystemId))
            .OrderBy(transition => transition.SortOrder)
            .Select(transition => new { transition.SystemId, transition.Id, transition.ToStateId, transition.GuardRuleId })
            .ToListAsync(cancellationToken);

        return
        [
            .. machines
                .OrderBy(machine => machine.SystemId.ToString(), StringComparer.Ordinal)
                .Select(machine => new CheckedMachine(
                    machine.SystemId.ToString(),
                    machine.Version,
                    machine.SchemaVersion,
                    machine.SubjectType,
                    machine.Attribute,
                    [
                        .. states.Where(state => state.SystemId == machine.SystemId)
                            .Select(state => new CheckedState(state.Id.ToString(), state.Value, state.IsInitial)),
                    ],
                    [
                        .. transitions.Where(transition => transition.SystemId == machine.SystemId)
                            .Select(transition => new CheckedTransition(
                                transition.Id.ToString(),
                                transition.ToStateId.ToString(),
                                transition.GuardRuleId?.ToString())),
                    ])),
        ];
    }

    /// <summary>
    /// One guard, counted as section 4's table says: none and <c>exempt</c> count as <c>true</c>, every other outcome
    /// as itself. The guard's own evidence is kept as the evaluation returned it.
    /// </summary>
    private static MachineGuard Guard(
        CheckedTransition transition,
        WorldLogicEvaluator evaluator,
        string subjectId,
        string? projectId)
    {
        if (transition.GuardRuleId is not { } ruleId)
        {
            return new MachineGuard(transition.Id, "none", ConditionOutcome.True, null, []);
        }

        var result = evaluator.Evaluate(ruleId, subjectId, projectId);
        var counted = result.Outcome == ConditionOutcome.Exempt ? ConditionOutcome.True : result.Outcome;

        return new MachineGuard(transition.Id, ConditionOutcomeText.Of(counted), counted, result.ErrorCode, result.Evidence);
    }

    /// <summary>
    /// The state whose value the subject holds. A condition compares text after Unicode composition, and the facts
    /// already hold it composed, so the stored state value is composed the same way.
    /// </summary>
    private static CheckedState? StateOf(CheckedMachine machine, ConditionValue value) =>
        machine.States.FirstOrDefault(state =>
            string.Equals(state.Value.Normalize(NormalizationForm.FormC), value.Text, StringComparison.Ordinal));

    private static MachineRecord Record(
        CheckedMachine machine,
        MachineCheck check,
        string? stateId,
        string subjectId,
        WorldLogicFindingOutcome outcome,
        string? errorCode,
        string? value,
        IReadOnlyList<ConditionEvidence> evidence,
        IReadOnlyList<string> rationale) =>
        new(machine.SystemId, machine.SystemVersion, machine.SchemaVersion, check, stateId, subjectId, outcome,
            errorCode, value, evidence, rationale);
}
