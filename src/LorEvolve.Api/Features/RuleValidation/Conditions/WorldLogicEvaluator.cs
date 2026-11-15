using System.Diagnostics;
using System.Globalization;
using System.Text.Json;

namespace LorEvolve.Api.Features.RuleValidation.Conditions;

/// <summary>
/// Evaluates stored World Logic conditions (ADR 0072, <c>docs/architecture/world-logic-condition-spec.md</c>).
///
/// <b>It is a pure function of the rules and the facts it was given.</b> Nothing here writes, and nothing here
/// reads anything the caller did not put in <see cref="IConditionFacts"/>. Two runs over unchanged inputs produce
/// an identical <see cref="ConditionResult"/>, which is what lets a finding be fingerprinted (ADR 0010).
///
/// <b>It interprets data, never code.</b> Every node kind, operator, source and field is matched against the closed
/// sets of <c>Features/Systems/ConditionSchema</c>; nothing is compiled, reflected over or looked up by name. A
/// stored tree this build cannot read is an error outcome, never a pass.
///
/// <b>Unknown is never false.</b> That is the rule the three-valued tables exist for, and the one an implementation
/// is most likely to lose by accident: a missing attribute that defaulted to zero, a query that treated a missing
/// operand as "match nothing" and then read the empty result as a satisfied condition. The single place missing is
/// allowed to read as empty is a query clause, which the specification calls out as its one asymmetry, and even
/// there <c>count</c> answers 0 and <c>exists</c> answers false rather than unknown, because a query over a present
/// source does answer definitely.
///
/// <b>Every loop is bounded.</b> Steps, query rows, rules, depth, dependency depth and wall clock each have a
/// number and a stable error code, and exhausting one fails that rule alone.
///
/// One instance evaluates one rule set against one fact source; it is not thread safe and is not reused across
/// universes.
/// </summary>
public sealed class WorldLogicEvaluator
{
    private readonly IConditionFacts _facts;
    private readonly ConditionBudget _budget;
    private readonly Dictionary<string, EvaluatedRule> _rules;
    private readonly HashSet<string> _onCycle;
    private readonly Dictionary<string, JsonDocument> _parsed = new(StringComparer.Ordinal);
    private readonly Dictionary<(string Rule, string? Target, string? Project), ConditionResult> _memo = [];

    /// <summary>
    /// How many rules this evaluator has evaluated, across every call and every dependency it walked into.
    ///
    /// The budget is per evaluator rather than per call because an evaluator is one universe's rule set and one
    /// snapshot of its facts: that is the unit of work a caller pays for. Counting per call would leave a single
    /// <see cref="Evaluate"/> free to walk a dependency chain of any length, which is the gap Codex round 4 on #151
    /// found. A memoised result is not counted again, so a diamond costs what it evaluated.
    /// </summary>
    private int _evaluated;

    /// <summary>The rule set this evaluator answers for, and the facts it reads. Both are one universe's.</summary>
    public WorldLogicEvaluator(IConditionFacts facts, IEnumerable<EvaluatedRule> rules, ConditionBudget? budget = null)
    {
        _facts = facts;
        _budget = budget ?? ConditionBudget.Default;

        _rules = [];
        foreach (var rule in rules)
        {
            _rules[rule.Id] = rule;
        }

        // The dependency graph is checked once, before anything is evaluated: a rule on a cycle fails with
        // dependency_cycle and evaluates nothing, while rules off the cycle still run.
        _onCycle = CyclicRules(_rules);
    }

    /// <summary>
    /// One rule against one target. <paramref name="targetId"/> is the subject or event <c>self</c> resolves to, or
    /// null for a rule that is a statement about the universe. <paramref name="projectId"/> is the project the
    /// evaluation is in, which decides whether a project-scoped exception applies.
    /// </summary>
    public ConditionResult Evaluate(string ruleId, string? targetId = null, string? projectId = null)
    {
        if (_memo.TryGetValue((ruleId, targetId, projectId), out var memoised))
        {
            return memoised;
        }

        var result = EvaluateCore(ruleId, targetId, projectId, dependencyDepth: 0, []);
        _memo[(ruleId, targetId, projectId)] = result;
        return result;
    }

    /// <summary>
    /// Every rule of the set against one target, in the set's own order. Bounded by the same rule budget one
    /// evaluation is, so the sweep and the single call cannot disagree about how much work is allowed.
    /// </summary>
    public IReadOnlyList<ConditionResult> EvaluateAll(string? targetId = null, string? projectId = null)
    {
        var results = new List<ConditionResult>();

        foreach (var rule in _rules.Values)
        {
            results.Add(Evaluate(rule.Id, targetId, projectId));
        }

        return results;
    }

    private ConditionResult EvaluateCore(
        string ruleId,
        string? targetId,
        string? projectId,
        int dependencyDepth,
        HashSet<string> walking)
    {
        if (!_rules.TryGetValue(ruleId, out var rule))
        {
            return new ConditionResult(ruleId, 0, 0, ConditionOutcome.Error, ConditionErrors.MissingRule, null, [], []);
        }

        if (_onCycle.Contains(ruleId))
        {
            return Failed(rule, ConditionErrors.DependencyCycle);
        }

        if (dependencyDepth > _budget.MaxDependencyDepth)
        {
            return Failed(rule, ConditionErrors.DependencyDepthLimit);
        }

        if (rule.SchemaVersion != Systems.ConditionSchema.CurrentVersion)
        {
            return Failed(rule, ConditionErrors.SchemaVersionUnsupported);
        }

        // Counted here, where every path arrives: a direct call, a dependency walked into, and each rule of a
        // sweep. A rule past the budget fails with its own code rather than the run failing as a whole.
        if (++_evaluated > _budget.MaxRules)
        {
            return Failed(rule, ConditionErrors.RuleBudget);
        }

        if (rule.ConditionJson is null)
        {
            // A rule that is words only is never evaluated and never a violation, exactly as a world rule without a
            // check is never evaluated (ADR 0034).
            return new ConditionResult(
                rule.Id,
                rule.Version,
                rule.SchemaVersion,
                ConditionOutcome.Unknown,
                null,
                null,
                [],
                ["no condition: words only"]);
        }

        var run = new Run(this, targetId, projectId, dependencyDepth, walking);

        var condition = Parse(rule.Id, rule.ConditionJson);
        if (condition is null)
        {
            return Failed(rule, ConditionErrors.InvalidReference);
        }

        var outcome = run.Node(condition.Value, rule, depth: 1);

        // A condition that came out exempt did so because a dependency was excused; the rule inherits that outcome
        // and the exception's id, rather than reporting the pass the exception produced.

        // Exceptions run only when the condition came out false, so one can never change a pass and none costs
        // budget on the common path (specification section 5.1).
        if (outcome.Outcome == ConditionOutcome.False)
        {
            var excused = run.Exceptions(rule);
            if (excused is not null)
            {
                outcome = excused.Value;
            }
        }

        return new ConditionResult(
            rule.Id,
            rule.Version,
            rule.SchemaVersion,
            outcome.Outcome,
            outcome.ErrorCode,
            outcome.ExemptionId,
            run.Evidence,
            run.Rationale);
    }

    private static ConditionResult Failed(EvaluatedRule rule, string code) =>
        new(rule.Id, rule.Version, rule.SchemaVersion, ConditionOutcome.Error, code, null, [], [$"error {code}"]);

    private JsonElement? Parse(string ruleId, string json)
    {
        if (_parsed.TryGetValue(ruleId, out var cached))
        {
            return cached.RootElement;
        }

        try
        {
            var document = JsonDocument.Parse(json);
            _parsed[ruleId] = document;
            return document.RootElement;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Every rule that can reach itself through <c>dependsOn</c>, including one that names itself. Computed once
    /// per evaluator, because the answer is a property of the rule set rather than of any one evaluation.
    /// </summary>
    private static HashSet<string> CyclicRules(Dictionary<string, EvaluatedRule> rules)
    {
        var cyclic = new HashSet<string>(StringComparer.Ordinal);

        foreach (var start in rules.Keys)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var queue = new Queue<string>(rules[start].DependsOn);

            while (queue.Count > 0)
            {
                var next = queue.Dequeue();
                if (next == start)
                {
                    cyclic.Add(start);
                    break;
                }

                if (!seen.Add(next) || !rules.TryGetValue(next, out var dependency))
                {
                    continue;
                }

                foreach (var id in dependency.DependsOn)
                {
                    queue.Enqueue(id);
                }
            }
        }

        return cyclic;
    }

    /// <summary>What one node answered, and the exception or error that goes with it.</summary>
    private readonly record struct NodeResult(ConditionOutcome Outcome, string? ErrorCode = null, string? ExemptionId = null)
    {
        public static readonly NodeResult True = new(ConditionOutcome.True);

        public static readonly NodeResult False = new(ConditionOutcome.False);

        public static readonly NodeResult Unknown = new(ConditionOutcome.Unknown);

        public static NodeResult Error(string code) => new(ConditionOutcome.Error, code);

        /// <summary>Held, by an exception. Carries the id so a finding can name what excused it.</summary>
        public static NodeResult Exempt(string? exemptionId) => new(ConditionOutcome.Exempt, null, exemptionId);

        public static NodeResult Of(bool value) => value ? True : False;
    }

    /// <summary>
    /// One rule's evaluation: the budget it is spending, the evidence it gathered and the trace it wrote.
    ///
    /// A class of its own because every one of those is per-rule state. Sharing a step counter between two rules
    /// would make a rule's outcome depend on what ran before it, and the specification's determinism is the one
    /// property the whole design rests on.
    /// </summary>
    private sealed class Run(
        WorldLogicEvaluator evaluator,
        string? targetId,
        string? projectId,
        int dependencyDepth,
        HashSet<string> walking)
    {
        private readonly List<ConditionEvidence> _evidence = [];
        private readonly HashSet<string> _seenEvidence = new(StringComparer.Ordinal);
        private readonly List<string> _rationale = [];
        private readonly Stopwatch _clock = Stopwatch.StartNew();
        private int _steps;
        private int _queryRows;

        public IReadOnlyList<ConditionEvidence> Evidence => _evidence;

        public IReadOnlyList<string> Rationale => _rationale;

        public NodeResult Node(JsonElement node, EvaluatedRule rule, int depth)
        {
            if (depth > evaluator._budget.MaxDepth)
            {
                return NodeResult.Error(ConditionErrors.DepthLimit);
            }

            if (++_steps > evaluator._budget.MaxSteps)
            {
                return NodeResult.Error(ConditionErrors.StepBudget);
            }

            if (_clock.ElapsedMilliseconds > evaluator._budget.WallClockMilliseconds)
            {
                return NodeResult.Error(ConditionErrors.TimeBudget);
            }

            if (node.ValueKind != JsonValueKind.Object
                || !node.TryGetProperty("kind", out var kindElement)
                || kindElement.ValueKind != JsonValueKind.String)
            {
                return NodeResult.Error(ConditionErrors.UnknownNodeKind);
            }

            return kindElement.GetString() switch
            {
                "all" => Group(node, rule, depth, all: true),
                "any" => Group(node, rule, depth, all: false),
                "not" => Not(node, rule, depth),
                "compare" => Compare(node, rule, depth),
                "exists" => Exists(node, rule, depth),
                "related" => Related(node, rule, depth),
                "within" => Within(node, rule, depth),
                "ruleHolds" => Holds(node, rule),
                "always" => Always(node),
                _ => NodeResult.Error(ConditionErrors.UnknownNodeKind),
            };
        }

        /// <summary>
        /// Section 4's table. The answer that settles the group on its own wins over a sibling's error, which is
        /// <c>false</c> for <c>all</c> and <c>true</c> for <c>any</c>; everywhere else an error dominates an
        /// unknown. Short-circuiting is observable only in the evidence, never in the outcome.
        ///
        /// <c>exempt</c> is a held answer that held by an exception, so it counts as <c>true</c> for deciding the
        /// group and is then carried out of it: a group that came out true with an exempt child is exempt, naming
        /// the first exception that excused one. That is what keeps a rule built on an excused dependency from
        /// reporting a clean pass.
        /// </summary>
        private NodeResult Group(JsonElement node, EvaluatedRule rule, int depth, bool all)
        {
            if (!node.TryGetProperty("of", out var of) || of.ValueKind != JsonValueKind.Array || of.GetArrayLength() == 0)
            {
                return NodeResult.Error(ConditionErrors.NodeArity);
            }

            string? error = null;
            string? exemption = null;
            var exempt = false;
            var unknown = false;

            foreach (var child in of.EnumerateArray())
            {
                var result = Node(child, rule, depth + 1);

                // Exempt is a true for the purposes of the table, and remembered so it can be carried out.
                var held = result.Outcome is ConditionOutcome.True or ConditionOutcome.Exempt;
                if (result.Outcome == ConditionOutcome.Exempt)
                {
                    exempt = true;
                    exemption ??= result.ExemptionId;
                }

                if (all ? result.Outcome == ConditionOutcome.False : held)
                {
                    var settling = all ? ConditionOutcome.False : exempt ? ConditionOutcome.Exempt : ConditionOutcome.True;
                    Trace($"{(all ? "all" : "any")} settled by a child -> {Name(settling)}");

                    return settling == ConditionOutcome.Exempt
                        ? NodeResult.Exempt(exemption)
                        : new NodeResult(settling);
                }

                switch (result.Outcome)
                {
                    case ConditionOutcome.Error:
                        error ??= result.ErrorCode;
                        break;

                    case ConditionOutcome.Unknown:
                        unknown = true;
                        break;
                }
            }

            if (error is not null)
            {
                Trace($"{(all ? "all" : "any")} -> error {error}");
                return NodeResult.Error(error);
            }

            if (unknown)
            {
                Trace($"{(all ? "all" : "any")} -> unknown");
                return NodeResult.Unknown;
            }

            if (all && exempt)
            {
                Trace("all -> exempt");
                return NodeResult.Exempt(exemption);
            }

            var settled = all ? ConditionOutcome.True : ConditionOutcome.False;
            Trace($"{(all ? "all" : "any")} -> {Name(settled)}");
            return new NodeResult(settled);
        }

        private NodeResult Not(JsonElement node, EvaluatedRule rule, int depth)
        {
            if (!node.TryGetProperty("of", out var inner) || inner.ValueKind != JsonValueKind.Object)
            {
                return NodeResult.Error(ConditionErrors.NodeArity);
            }

            var result = Node(inner, rule, depth + 1);
            return result.Outcome switch
            {
                // Exempt is a held answer, so its negation is false. The exception's id is not carried past a
                // negation: "not excused" is not something an exception excuses, and a finding that named one here
                // would be naming the reason its opposite held.
                ConditionOutcome.True or ConditionOutcome.Exempt => NodeResult.False,
                ConditionOutcome.False => NodeResult.True,
                _ => result,
            };
        }

        private NodeResult Compare(JsonElement node, EvaluatedRule rule, int depth)
        {
            if (!node.TryGetProperty("op", out var opElement) || opElement.ValueKind != JsonValueKind.String)
            {
                return NodeResult.Error(ConditionErrors.UnknownOperator);
            }

            var op = opElement.GetString()!;
            if (!Systems.ConditionSchema.CompareOperators.Contains(op, StringComparer.Ordinal))
            {
                return NodeResult.Error(ConditionErrors.UnknownOperator);
            }

            if (!node.TryGetProperty("left", out var leftNode) || !node.TryGetProperty("right", out var rightNode))
            {
                return NodeResult.Error(ConditionErrors.NodeArity);
            }

            var left = Operand(leftNode, rule, depth + 1, out var leftError);
            if (leftError is not null)
            {
                return NodeResult.Error(leftError);
            }

            var right = Operand(rightNode, rule, depth + 1, out var rightError);
            if (rightError is not null)
            {
                return NodeResult.Error(rightError);
            }

            if (left.IsMissing || right.IsMissing)
            {
                Trace($"compare {op}: {left} {right} -> unknown");
                return NodeResult.Unknown;
            }

            if (left.Kind != right.Kind)
            {
                Trace($"compare {op}: {left.TypeName()} against {right.TypeName()} -> error {ConditionErrors.TypeMismatch}");
                return NodeResult.Error(ConditionErrors.TypeMismatch);
            }

            if (op is "eq" or "ne")
            {
                var equal = left.Kind switch
                {
                    ConditionValueKind.Boolean => left.Boolean == right.Boolean,
                    ConditionValueKind.Number => left.Number == right.Number,
                    _ => string.Equals(left.Text, right.Text, StringComparison.Ordinal),
                };

                var answer = op == "eq" ? equal : !equal;
                Trace($"compare {op}: {left} against {right} -> {(answer ? "true" : "false")}");
                return NodeResult.Of(answer);
            }

            // The four orderings apply to numbers and time points only: "greater than" over text is a collation
            // decision no author asked for, and over a reference or a boolean it means nothing at all.
            if (left.Kind is not (ConditionValueKind.Number or ConditionValueKind.TimePoint))
            {
                Trace($"compare {op}: {left.TypeName()} -> error {ConditionErrors.OperatorNotApplicable}");
                return NodeResult.Error(ConditionErrors.OperatorNotApplicable);
            }

            decimal leftOrder;
            decimal rightOrder;

            if (left.Kind == ConditionValueKind.Number)
            {
                leftOrder = left.Number;
                rightOrder = right.Number;
            }
            else
            {
                if (left.TimeScope() is not { } leftScope
                    || right.TimeScope() is not { } rightScope
                    || leftScope != rightScope)
                {
                    Trace($"compare {op}: {left} against {right} -> error {ConditionErrors.ScopeMismatch}");
                    return NodeResult.Error(ConditionErrors.ScopeMismatch);
                }

                if (left.TimeOrder() is not { } leftPoint || right.TimeOrder() is not { } rightPoint)
                {
                    Trace($"compare {op}: {left} against {right} -> unknown");
                    return NodeResult.Unknown;
                }

                leftOrder = leftPoint;
                rightOrder = rightPoint;
            }

            var ordered = op switch
            {
                "lt" => leftOrder < rightOrder,
                "lte" => leftOrder <= rightOrder,
                "gt" => leftOrder > rightOrder,
                _ => leftOrder >= rightOrder,
            };

            Trace($"compare {op}: {left} against {right} -> {(ordered ? "true" : "false")}");
            return NodeResult.Of(ordered);
        }

        /// <summary>
        /// A query over a present source answers definitely: there is nothing unknown about a table that holds no
        /// matching row. Only the budget can make it an error.
        /// </summary>
        private NodeResult Exists(JsonElement node, EvaluatedRule rule, int depth)
        {
            if (!node.TryGetProperty("query", out var query))
            {
                return NodeResult.Error(ConditionErrors.NodeArity);
            }

            var rows = Query(query, rule, depth, out var error);
            if (error is not null)
            {
                return NodeResult.Error(error);
            }

            Trace($"exists -> {(rows!.Count > 0 ? "true" : "false")} over {Number(rows.Count)} rows");
            return NodeResult.Of(rows.Count > 0);
        }

        private NodeResult Related(JsonElement node, EvaluatedRule rule, int depth)
        {
            if (!node.TryGetProperty("relation", out var relation)
                || relation.ValueKind != JsonValueKind.String
                || !node.TryGetProperty("from", out var fromNode)
                || !node.TryGetProperty("to", out var toNode))
            {
                return NodeResult.Error(ConditionErrors.NodeArity);
            }

            var from = Operand(fromNode, rule, depth + 1, out var fromError);
            if (fromError is not null)
            {
                return NodeResult.Error(fromError);
            }

            var to = Operand(toNode, rule, depth + 1, out var toError);
            if (toError is not null)
            {
                return NodeResult.Error(toError);
            }

            if (from.IsMissing || to.IsMissing)
            {
                Trace("related -> unknown");
                return NodeResult.Unknown;
            }

            if (from.Kind != ConditionValueKind.Reference || to.Kind != ConditionValueKind.Reference)
            {
                return NodeResult.Error(ConditionErrors.TypeMismatch);
            }

            var related = evaluator._facts.Related(relation.GetString()!, from.Text!, to.Text!);
            if (related)
            {
                Note("relations", to.Text!, $"related:{relation.GetString()}");
            }

            Trace($"related {relation.GetString()} -> {(related ? "true" : "false")}");
            return NodeResult.Of(related);
        }

        private NodeResult Within(JsonElement node, EvaluatedRule rule, int depth)
        {
            if (!node.TryGetProperty("point", out var pointNode)
                || !node.TryGetProperty("from", out var fromNode)
                || !node.TryGetProperty("to", out var toNode))
            {
                return NodeResult.Error(ConditionErrors.NodeArity);
            }

            var point = Operand(pointNode, rule, depth + 1, out var pointError);
            if (pointError is not null)
            {
                return NodeResult.Error(pointError);
            }

            var from = Operand(fromNode, rule, depth + 1, out var fromError);
            if (fromError is not null)
            {
                return NodeResult.Error(fromError);
            }

            var to = Operand(toNode, rule, depth + 1, out var toError);
            if (toError is not null)
            {
                return NodeResult.Error(toError);
            }

            if (point.IsMissing || from.IsMissing || to.IsMissing)
            {
                Trace("within -> unknown");
                return NodeResult.Unknown;
            }

            if (point.Kind != ConditionValueKind.TimePoint
                || from.Kind != ConditionValueKind.TimePoint
                || to.Kind != ConditionValueKind.TimePoint)
            {
                return NodeResult.Error(ConditionErrors.TypeMismatch);
            }

            var scope = point.TimeScope();
            if (scope is null || scope != from.TimeScope() || scope != to.TimeScope())
            {
                Trace($"within: {point} in {from}..{to} -> error {ConditionErrors.ScopeMismatch}");
                return NodeResult.Error(ConditionErrors.ScopeMismatch);
            }

            if (point.TimeOrder() is not { } at || from.TimeOrder() is not { } start || to.TimeOrder() is not { } end)
            {
                Trace("within -> unknown");
                return NodeResult.Unknown;
            }

            var inside = at >= start && at <= end;
            Trace($"within: {point} in {from}..{to} -> {(inside ? "true" : "false")}");
            return NodeResult.Of(inside);
        }

        /// <summary>
        /// A dependency's own outcome. It may only name a rule the author declared, so the dependency graph is
        /// readable without walking every condition, and it is evaluated once per target and memoised.
        /// </summary>
        private NodeResult Holds(JsonElement node, EvaluatedRule rule)
        {
            if (!node.TryGetProperty("ruleId", out var ruleId) || ruleId.ValueKind != JsonValueKind.String)
            {
                return NodeResult.Error(ConditionErrors.InvalidReference);
            }

            var referenced = ruleId.GetString()!;
            if (!rule.DependsOn.Contains(referenced, StringComparer.Ordinal))
            {
                Trace($"ruleHolds {referenced} -> error {ConditionErrors.UndeclaredDependency}");
                return NodeResult.Error(ConditionErrors.UndeclaredDependency);
            }

            if (!walking.Add(referenced))
            {
                // Reached only if the graph check missed something; a cycle is already refused above.
                return NodeResult.Error(ConditionErrors.DependencyCycle);
            }

            var key = (referenced, targetId, projectId);
            if (!evaluator._memo.TryGetValue(key, out var result))
            {
                result = evaluator.EvaluateCore(referenced, targetId, projectId, dependencyDepth + 1, walking);
                evaluator._memo[key] = result;
            }

            walking.Remove(referenced);

            // A dependency's evidence is this rule's evidence too: the outcome depended on it.
            foreach (var evidence in result.Evidence)
            {
                Note(evidence.Source, evidence.Id, evidence.Role);
            }

            Trace($"ruleHolds {referenced} -> {Name(result.Outcome)}");

            return result.Outcome switch
            {
                ConditionOutcome.True => NodeResult.True,

                // An exempt dependency held, but it held by an exception the author wrote, and a rule built on it
                // inherits that: the outcome stays exempt and carries the exception's id, so a finding says which
                // exception the whole chain rests on rather than reporting a clean pass.
                ConditionOutcome.Exempt => NodeResult.Exempt(result.ExemptionId),
                ConditionOutcome.False => NodeResult.False,
                ConditionOutcome.Unknown => NodeResult.Unknown,
                _ => NodeResult.Error(result.ErrorCode ?? ConditionErrors.MissingRule),
            };
        }

        private NodeResult Always(JsonElement node)
        {
            if (!node.TryGetProperty("value", out var value) || value.ValueKind != JsonValueKind.String)
            {
                return NodeResult.Error(ConditionErrors.NodeArity);
            }

            return value.GetString() switch
            {
                "true" => NodeResult.True,
                "false" => NodeResult.False,
                "unknown" => NodeResult.Unknown,
                _ => NodeResult.Error(ConditionErrors.NodeArity),
            };
        }

        /// <summary>
        /// Section 5.1's precedence, and nothing else: a project-scoped exception outranks a universe-scoped one,
        /// declared order decides inside one scope, the first true one wins, an unknown one blocks the violation and
        /// an erroring one makes the outcome an error.
        /// </summary>
        public NodeResult? Exceptions(EvaluatedRule rule)
        {
            if (rule.Exceptions.Count == 0)
            {
                return null;
            }

            var applicable = rule.Exceptions
                .Where(exception => exception.ProjectId is null || exception.ProjectId == projectId)
                .OrderByDescending(exception => exception.ProjectId is not null)
                .ToList();

            string? error = null;
            var unknown = false;

            foreach (var exception in applicable)
            {
                var document = Json(exception.WhenJson);
                if (document is null)
                {
                    error ??= ConditionErrors.InvalidReference;
                    continue;
                }

                using (document)
                {
                    var result = Node(document.RootElement, rule, depth: 1);

                    switch (result.Outcome)
                    {
                        case ConditionOutcome.True:
                            Trace($"exception {exception.Id} -> exempt");
                            return new NodeResult(ConditionOutcome.Exempt, null, exception.Id);

                        case ConditionOutcome.Unknown:
                            unknown = true;
                            break;

                        case ConditionOutcome.Error:
                            error ??= result.ErrorCode;
                            break;
                    }
                }
            }

            // An exception that might apply is not proof that it does not, so the violation does not stand. An
            // error outranks that, because it is a defect to fix first.
            if (error is not null)
            {
                Trace($"exception -> error {error}");
                return NodeResult.Error(error);
            }

            if (unknown)
            {
                Trace("exception -> unknown");
                return NodeResult.Unknown;
            }

            return null;
        }

        private ConditionValue Operand(JsonElement operand, EvaluatedRule rule, int depth, out string? error)
        {
            error = null;

            if (depth > evaluator._budget.MaxDepth)
            {
                error = ConditionErrors.DepthLimit;
                return ConditionValue.Missing;
            }

            if (++_steps > evaluator._budget.MaxSteps)
            {
                error = ConditionErrors.StepBudget;
                return ConditionValue.Missing;
            }

            if (operand.ValueKind != JsonValueKind.Object)
            {
                error = ConditionErrors.TypeMismatch;
                return ConditionValue.Missing;
            }

            if (operand.TryGetProperty("literal", out var literal))
            {
                return Literal(literal, operand, out error);
            }

            if (operand.TryGetProperty("attribute", out var attribute))
            {
                if (attribute.ValueKind != JsonValueKind.String)
                {
                    error = ConditionErrors.UnknownField;
                    return ConditionValue.Missing;
                }

                if (!operand.TryGetProperty("of", out var attributeOf))
                {
                    error = ConditionErrors.NodeArity;
                    return ConditionValue.Missing;
                }

                var subject = Operand(attributeOf, rule, depth + 1, out error);
                if (error is not null || subject.IsMissing)
                {
                    return ConditionValue.Missing;
                }

                if (subject.Kind != ConditionValueKind.Reference)
                {
                    error = ConditionErrors.TypeMismatch;
                    return ConditionValue.Missing;
                }

                // The subject is evidence whether or not the attribute is set on it. A finding about missing data
                // has to name the row that is missing it, or there is nothing for an author to go and fill in.
                Note("subjects", subject.Text!, $"attribute:{attribute.GetString()}");

                return evaluator._facts.Attribute(subject.Text!, attribute.GetString()!);
            }

            if (operand.TryGetProperty("field", out var field))
            {
                if (field.ValueKind != JsonValueKind.String
                    || !operand.TryGetProperty("from", out var from)
                    || from.ValueKind != JsonValueKind.String)
                {
                    error = ConditionErrors.UnknownSource;
                    return ConditionValue.Missing;
                }

                if (!operand.TryGetProperty("of", out var fieldOf))
                {
                    error = ConditionErrors.NodeArity;
                    return ConditionValue.Missing;
                }

                var row = Operand(fieldOf, rule, depth + 1, out error);
                if (error is not null || row.IsMissing)
                {
                    return ConditionValue.Missing;
                }

                if (row.Kind != ConditionValueKind.Reference)
                {
                    error = ConditionErrors.TypeMismatch;
                    return ConditionValue.Missing;
                }

                var value = evaluator._facts.Field(from.GetString()!, row.Text!, field.GetString()!);
                if (value is null)
                {
                    error = Systems.ConditionSchema.SourceFields.ContainsKey(from.GetString()!)
                        ? ConditionErrors.UnknownField
                        : ConditionErrors.UnknownSource;

                    return ConditionValue.Missing;
                }

                // As for an attribute: the row is evidence even when the field it was read for is not set.
                Note(from.GetString()!, row.Text!, $"field:{field.GetString()}");

                return value.Value;
            }

            if (operand.TryGetProperty("subject", out var subjectElement))
            {
                if (subjectElement.ValueKind != JsonValueKind.String)
                {
                    error = ConditionErrors.InvalidReference;
                    return ConditionValue.Missing;
                }

                var text = subjectElement.GetString()!;
                if (text != "self")
                {
                    return ConditionValue.OfReference(text);
                }

                if (targetId is null)
                {
                    // A rule written with self and evaluated without a target is unknown, not an error: the rule is
                    // fine, the evaluation simply did not say what it is about.
                    return ConditionValue.Missing;
                }

                Note("subjects", targetId, "self");
                return ConditionValue.OfReference(targetId);
            }

            if (operand.TryGetProperty("count", out var count))
            {
                var rows = Query(count, rule, depth, out error);
                return error is not null ? ConditionValue.Missing : ConditionValue.Of(rows!.Count);
            }

            error = ConditionErrors.TypeMismatch;
            return ConditionValue.Missing;
        }

        private static ConditionValue Literal(JsonElement literal, JsonElement operand, out string? error)
        {
            error = null;

            if (!operand.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String)
            {
                error = ConditionErrors.TypeMismatch;
                return ConditionValue.Missing;
            }

            switch (type.GetString())
            {
                case "boolean" when literal.ValueKind is JsonValueKind.True or JsonValueKind.False:
                    return ConditionValue.Of(literal.GetBoolean());

                case "number" when literal.ValueKind == JsonValueKind.Number:
                    return ConditionValue.Of(literal.GetDecimal());

                case "text" when literal.ValueKind == JsonValueKind.String:
                    return ConditionValue.OfText(literal.GetString());

                case "timePoint" when literal.ValueKind == JsonValueKind.String:
                    return ConditionValue.OfTimePoint(literal.GetString());

                case "reference" when literal.ValueKind == JsonValueKind.String:
                    return ConditionValue.OfReference(literal.GetString());

                default:
                    error = ConditionErrors.TypeMismatch;
                    return ConditionValue.Missing;
            }
        }

        /// <summary>
        /// A query's rows, bounded by what is left of the query budget. The one place a missing value reads as
        /// empty is a clause's operand, which the specification calls out as its single asymmetry: the query then
        /// returns no rows, so <c>count</c> is 0 and <c>exists</c> is false.
        /// </summary>
        private IReadOnlyList<FactRow>? Query(JsonElement query, EvaluatedRule rule, int depth, out string? error)
        {
            error = null;

            if (query.ValueKind != JsonValueKind.Object
                || !query.TryGetProperty("from", out var from)
                || from.ValueKind != JsonValueKind.String)
            {
                error = ConditionErrors.UnknownSource;
                return null;
            }

            var source = from.GetString()!;
            if (!Systems.ConditionSchema.SourceFields.TryGetValue(source, out var fields))
            {
                error = ConditionErrors.UnknownSource;
                return null;
            }

            if (!query.TryGetProperty("where", out var where) || where.ValueKind != JsonValueKind.Array)
            {
                error = ConditionErrors.NodeArity;
                return null;
            }

            var clauses = new List<FactClause>();

            foreach (var clause in where.EnumerateArray())
            {
                if (clause.ValueKind != JsonValueKind.Object
                    || !clause.TryGetProperty("field", out var field)
                    || field.ValueKind != JsonValueKind.String
                    || !fields.Contains(field.GetString()!, StringComparer.Ordinal))
                {
                    error = ConditionErrors.UnknownField;
                    return null;
                }

                if (!clause.TryGetProperty("op", out var op) || op.ValueKind != JsonValueKind.String)
                {
                    error = ConditionErrors.UnknownOperator;
                    return null;
                }

                ConditionValue value;

                if (clause.TryGetProperty("operandValue", out var operandValue))
                {
                    value = Operand(operandValue, rule, depth + 1, out error);
                    if (error is not null)
                    {
                        return null;
                    }

                    if (value.IsMissing)
                    {
                        // The one asymmetry: a clause whose operand is missing matches nothing, rather than making
                        // the whole query unknown. Specification section 3.3 says so and says why.
                        Trace($"query over {source}: a clause operand is missing -> no rows");
                        return [];
                    }
                }
                else if (clause.TryGetProperty("value", out var literal))
                {
                    value = Literal(literal, clause, out error);
                    if (error is not null)
                    {
                        return null;
                    }
                }
                else
                {
                    error = ConditionErrors.TypeMismatch;
                    return null;
                }

                clauses.Add(new FactClause(field.GetString()!, op.GetString()!, value));
            }

            var remaining = evaluator._budget.MaxQueryRows - _queryRows;
            if (remaining <= 0)
            {
                error = ConditionErrors.QueryLimit;
                return null;
            }

            var rows = evaluator._facts.Query(source, clauses, remaining);
            if (rows is null)
            {
                error = ConditionErrors.UnknownSource;
                return null;
            }

            if (rows.Count > remaining)
            {
                // Over the budget is an error, never a truncated answer: a count that silently stopped early is a
                // wrong count, and a wrong count is a wrong finding.
                error = ConditionErrors.QueryLimit;
                return null;
            }

            _queryRows += rows.Count;

            foreach (var row in rows)
            {
                if (row.Id is { } id)
                {
                    Note(source, id, "matched");
                }
            }

            return rows;
        }

        private static JsonDocument? Json(string text)
        {
            try
            {
                return JsonDocument.Parse(text);
            }
            catch (JsonException)
            {
                return null;
            }
        }

        /// <summary>One id the outcome depended on, in evaluation order and never twice.</summary>
        private void Note(string source, string id, string role)
        {
            if (_seenEvidence.Add($"{source}|{id}|{role}"))
            {
                _evidence.Add(new ConditionEvidence(source, id, role));
            }
        }

        private void Trace(string line) => _rationale.Add(line);

        private static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);

        private static string Name(ConditionOutcome outcome) => outcome switch
        {
            ConditionOutcome.True => "true",
            ConditionOutcome.False => "false",
            ConditionOutcome.Unknown => "unknown",
            ConditionOutcome.Exempt => "exempt",
            _ => "error",
        };
    }
}
