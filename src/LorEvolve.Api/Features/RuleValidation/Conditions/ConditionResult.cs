namespace LorEvolve.Api.Features.RuleValidation.Conditions;

/// <summary>
/// What one evaluation answered (ADR 0072, specification section 4).
///
/// <c>Unknown</c> is never coerced to <c>False</c>: a rule that cannot be checked is not satisfied. <c>Exempt</c> is
/// reported apart from <c>True</c>, because a rule that was broken and excused is not a rule that held.
/// </summary>
public enum ConditionOutcome
{
    /// <summary>The condition held.</summary>
    True = 0,

    /// <summary>The condition did not hold, and no exception applied: a proven violation.</summary>
    False = 1,

    /// <summary>The stored facts do not settle the question.</summary>
    Unknown = 2,

    /// <summary>The rule, its dependencies or a budget failed. Never a pass.</summary>
    Error = 3,

    /// <summary>The condition did not hold, and an exception the author wrote applies.</summary>
    Exempt = 4,
}

/// <summary>The outcome as the specification writes it. Text, so a new outcome never shifts an existing one.</summary>
public static class ConditionOutcomeText
{
    public static string Of(ConditionOutcome outcome) => outcome switch
    {
        ConditionOutcome.True => "true",
        ConditionOutcome.False => "false",
        ConditionOutcome.Unknown => "unknown",
        ConditionOutcome.Exempt => "exempt",
        _ => "error",
    };
}

/// <summary>Every error code the specification defines, in one place, so a caller never invents one.</summary>
public static class ConditionErrors
{
    public const string TypeMismatch = "type_mismatch";

    public const string OperatorNotApplicable = "operator_not_applicable";

    public const string UnknownNodeKind = "unknown_node_kind";

    public const string UnknownOperator = "unknown_operator";

    public const string UnknownField = "unknown_field";

    public const string UnknownSource = "unknown_source";

    public const string NodeArity = "node_arity";

    public const string DepthLimit = "depth_limit";

    public const string NodeLimit = "node_limit";

    public const string StepBudget = "step_budget";

    public const string QueryLimit = "query_limit";

    public const string TimeBudget = "time_budget";

    public const string RuleBudget = "rule_budget";

    public const string ScopeMismatch = "scope_mismatch";

    public const string DependencyCycle = "dependency_cycle";

    public const string DependencyDepthLimit = "dependency_depth_limit";

    public const string UndeclaredDependency = "undeclared_dependency";

    public const string MissingRule = "missing_rule";

    public const string InvalidReference = "invalid_reference";

    public const string SchemaVersionUnsupported = "schema_version_unsupported";
}

/// <summary>One id the outcome depended on, and where it came from.</summary>
public sealed record ConditionEvidence(string Source, string Id, string Role);

/// <summary>
/// One rule's evaluation, whole (specification section 9).
///
/// Two evaluations over unchanged facts and an unchanged rule produce an identical record, which is what lets a
/// finding be fingerprinted the way ADR 0010 fingerprints a Canon conflict.
///
/// <paramref name="Rationale"/> is a deterministic, unlocalised trace of the decided nodes. It is diagnostic text,
/// never a sentence for a reader and never translated.
/// </summary>
public sealed record ConditionResult(
    string RuleId,
    int RuleVersion,
    int SchemaVersion,
    ConditionOutcome Outcome,
    string? ErrorCode,
    string? ExemptionId,
    IReadOnlyList<ConditionEvidence> Evidence,
    IReadOnlyList<string> Rationale);

/// <summary>
/// One rule as the evaluator reads it: the stored condition and what the author declared around it.
///
/// This is a value, not a row. The database shape is <c>Features/Systems</c>'s, a fixture's is JSON, and the
/// evaluator reads neither directly: both are projected into this, so the evaluator has exactly one shape to
/// understand and the fixtures test the same code production runs.
/// </summary>
public sealed record EvaluatedRule(
    string Id,
    int Version,
    int SchemaVersion,
    string? ConditionJson,
    IReadOnlyList<string> DependsOn,
    IReadOnlyList<EvaluatedException> Exceptions);

/// <summary>
/// One exception a rule carries. <paramref name="ProjectId"/> is null for a universe-scoped one; a project-scoped
/// one is skipped unless the evaluation names that project, and outranks a universe-scoped one when both apply.
/// </summary>
public sealed record EvaluatedException(string Id, string? ProjectId, string WhenJson);

/// <summary>
/// The budgets of section 8 that are enforced while a rule runs. Static limits belong to the save
/// (<c>Features/Systems/ConditionSchema</c>); these are the ones only an evaluation can reach.
///
/// They are a record so a test can lower one and watch the evaluator fail safely, rather than having to build a
/// condition large enough to exhaust the real number.
/// </summary>
public sealed record ConditionBudget(
    int MaxSteps = 20_000,
    int MaxQueryRows = 2_000,
    int MaxRules = 500,
    int MaxDepth = 16,
    int MaxDependencyDepth = 8,
    int WallClockMilliseconds = 2_000)
{
    public static readonly ConditionBudget Default = new();
}
