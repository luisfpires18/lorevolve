using System.Text.Json;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The executable statement of <c>docs/architecture/world-logic-condition-spec.md</c> (ADR 0072), run against the
/// fixtures under <c>Fixtures/WorldLogic/</c>.
///
/// There is no evaluator yet: LOREX-018 writes it and runs these same <c>cases</c> for their stated outcomes. What
/// these tests prove today is that the fixtures are valid instances of the specification - every node kind,
/// operator, source, field, type, outcome and error code is one the specification names, every static limit holds,
/// every dependency resolves, and the cycle the edge-case document claims really is a cycle. A fixture that drifts
/// from the specification therefore fails here rather than quietly changing what the evaluator is held to.
/// </summary>
public sealed class WorldLogicFixtureTests
{
    private const int MaxDepth = 16;
    private const int MaxNodes = 256;
    private const int MaxWhereClauses = 8;
    private const int MaxExceptions = 16;
    private const int MaxConditionBytes = 32768;
    private const int MaxDependencyDepth = 8;

    private static readonly string[] NodeKinds =
        ["all", "any", "not", "compare", "exists", "related", "within", "ruleHolds", "always"];

    private static readonly string[] CompareOperators = ["eq", "ne", "lt", "lte", "gt", "gte"];

    private static readonly string[] ClauseOperators = ["eq", "ne", "lt", "lte", "gt", "gte", "contains"];

    private static readonly string[] ValueTypes = ["boolean", "number", "text", "timePoint", "reference"];

    private static readonly string[] Outcomes = ["true", "false", "unknown", "error", "exempt"];

    private static readonly string[] OperandKeys = ["literal", "attribute", "field", "subject", "count"];

    private static readonly Dictionary<string, string[]> SourceFields = new()
    {
        ["subjects"] = ["id", "type"],
        ["relations"] = ["type", "fromId", "toId"],
        ["events"] = ["id", "kind", "method", "subjectIds", "at", "canon"],
    };

    private static readonly string[] ErrorCodes =
    [
        "type_mismatch", "operator_not_applicable", "unknown_node_kind", "unknown_operator", "unknown_field",
        "unknown_source", "node_arity", "depth_limit", "node_limit", "step_budget", "query_limit", "time_budget",
        "rule_budget", "scope_mismatch", "dependency_cycle", "dependency_depth_limit", "undeclared_dependency",
        "missing_rule", "invalid_reference", "schema_version_unsupported",
    ];

    /// <summary>The five unrelated domains the specification requires, plus the one document of failures.</summary>
    private static readonly string[] RequiredScenarios =
        ["runeforging", "ley-lines", "succession", "quest-unlocks", "clinical-trial", "edge-cases"];

    public static TheoryData<string> Scenarios
    {
        get
        {
            var data = new TheoryData<string>();
            foreach (var scenario in RequiredScenarios)
            {
                data.Add(scenario);
            }

            return data;
        }
    }

    [Fact]
    public void Every_required_scenario_has_a_fixture_and_nothing_else_is_in_the_folder()
    {
        var files = Directory.GetFiles(FixtureDirectory(), "*.json").Select(Path.GetFileNameWithoutExtension).ToArray();

        Assert.Equal(RequiredScenarios.OrderBy(s => s, StringComparer.Ordinal), files.OrderBy(s => s, StringComparer.Ordinal));
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void Fixture_declares_the_schema_version_and_its_own_scenario_name(string scenario)
    {
        using var document = Load(scenario);
        var root = document.RootElement;

        Assert.Equal(1, root.GetProperty("schemaVersion").GetInt32());
        Assert.Equal(scenario, root.GetProperty("scenario").GetString());
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("description").GetString()));
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void Fact_rows_use_only_the_fields_the_specification_names(string scenario)
    {
        using var document = Load(scenario);
        var facts = document.RootElement.GetProperty("facts");

        foreach (var subject in facts.GetProperty("subjects").EnumerateArray())
        {
            Assert.False(string.IsNullOrWhiteSpace(subject.GetProperty("id").GetString()));
            Assert.False(string.IsNullOrWhiteSpace(subject.GetProperty("type").GetString()));
            AssertOnlyProperties(subject, "id", "type", "attributes");
        }

        foreach (var relation in facts.GetProperty("relations").EnumerateArray())
        {
            AssertOnlyProperties(relation, "type", "fromId", "toId");
        }

        foreach (var evt in facts.GetProperty("events").EnumerateArray())
        {
            Assert.False(string.IsNullOrWhiteSpace(evt.GetProperty("id").GetString()));
            AssertOnlyProperties(evt, "id", "kind", "method", "subjectIds", "at", "canon");
        }
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void Ids_are_unique_within_a_fixture(string scenario)
    {
        using var document = Load(scenario);
        var facts = document.RootElement.GetProperty("facts");

        var ids = facts.GetProperty("subjects").EnumerateArray().Select(s => s.GetProperty("id").GetString()!)
            .Concat(facts.GetProperty("events").EnumerateArray().Select(e => e.GetProperty("id").GetString()!))
            .ToArray();

        Assert.Equal(ids.Length, ids.Distinct(StringComparer.Ordinal).Count());

        var ruleIds = document.RootElement.GetProperty("rules").EnumerateArray()
            .Select(r => r.GetProperty("id").GetString()!).ToArray();

        Assert.Equal(ruleIds.Length, ruleIds.Distinct(StringComparer.Ordinal).Count());
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void Every_node_operator_source_and_type_is_one_the_specification_closes_over(string scenario)
    {
        using var document = Load(scenario);

        foreach (var rule in document.RootElement.GetProperty("rules").EnumerateArray())
        {
            var ruleId = rule.GetProperty("id").GetString()!;
            var expectsUnknownKind = ExpectedErrorCodes(document, ruleId).Contains("unknown_node_kind");
            var expectsUnknownSource = ExpectedErrorCodes(document, ruleId).Contains("unknown_source");

            Walk(rule.GetProperty("condition"), ruleId, expectsUnknownKind, expectsUnknownSource);

            foreach (var exception in Exceptions(rule))
            {
                Walk(exception.GetProperty("when"), ruleId, expectsUnknownKind: false, expectsUnknownSource: false);
            }
        }
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void Static_limits_hold_unless_a_case_expects_the_matching_error(string scenario)
    {
        using var document = Load(scenario);

        foreach (var rule in document.RootElement.GetProperty("rules").EnumerateArray())
        {
            var ruleId = rule.GetProperty("id").GetString()!;
            var expected = ExpectedErrorCodes(document, ruleId);
            var condition = rule.GetProperty("condition");

            var depth = Depth(condition);
            if (expected.Contains("depth_limit"))
            {
                Assert.True(depth > MaxDepth, $"{ruleId} expects depth_limit but is only {depth} deep");
            }
            else
            {
                Assert.True(depth <= MaxDepth, $"{ruleId} is {depth} deep, over the limit of {MaxDepth}");
            }

            var nodes = Nodes(condition);
            if (expected.Contains("node_limit"))
            {
                Assert.True(nodes > MaxNodes, $"{ruleId} expects node_limit but has only {nodes} nodes");
            }
            else
            {
                Assert.True(nodes <= MaxNodes, $"{ruleId} has {nodes} nodes, over the limit of {MaxNodes}");
            }

            Assert.True(
                condition.GetRawText().Length <= MaxConditionBytes,
                $"{ruleId} is over {MaxConditionBytes} bytes");

            var exceptions = Exceptions(rule).Count;
            Assert.True(exceptions <= MaxExceptions, $"{ruleId} declares {exceptions} exceptions");

            foreach (var clauseCount in WhereClauseCounts(condition))
            {
                var expectsArity = expected.Contains("node_arity");
                Assert.True(
                    clauseCount <= MaxWhereClauses || expectsArity,
                    $"{ruleId} has a query with {clauseCount} clauses");
            }
        }
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void A_ruleHolds_names_a_declared_dependency_unless_the_case_expects_otherwise(string scenario)
    {
        using var document = Load(scenario);

        foreach (var rule in document.RootElement.GetProperty("rules").EnumerateArray())
        {
            var ruleId = rule.GetProperty("id").GetString()!;
            var expected = ExpectedErrorCodes(document, ruleId);
            var declared = Dependencies(rule);

            foreach (var referenced in RuleReferences(rule.GetProperty("condition")))
            {
                Assert.True(
                    declared.Contains(referenced) || expected.Contains("undeclared_dependency"),
                    $"{ruleId} references {referenced} without declaring it");
            }

            foreach (var dependency in declared)
            {
                var exists = document.RootElement.GetProperty("rules").EnumerateArray()
                    .Any(r => r.GetProperty("id").GetString() == dependency);

                Assert.True(
                    exists || expected.Contains("missing_rule"),
                    $"{ruleId} depends on {dependency}, which no rule in the fixture defines");
            }
        }
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void A_rule_is_on_a_dependency_cycle_exactly_when_a_case_expects_dependency_cycle(string scenario)
    {
        using var document = Load(scenario);
        var rules = document.RootElement.GetProperty("rules").EnumerateArray()
            .ToDictionary(r => r.GetProperty("id").GetString()!, Dependencies, StringComparer.Ordinal);

        foreach (var (ruleId, _) in rules)
        {
            var onCycle = ReachesItself(ruleId, rules);
            var expected = ExpectedErrorCodes(document, ruleId).Contains("dependency_cycle");

            Assert.True(
                onCycle == expected,
                $"{ruleId}: on a cycle = {onCycle}, but a case expecting dependency_cycle = {expected}");
        }
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void Dependency_depth_stays_inside_the_limit(string scenario)
    {
        using var document = Load(scenario);
        var rules = document.RootElement.GetProperty("rules").EnumerateArray()
            .ToDictionary(r => r.GetProperty("id").GetString()!, Dependencies, StringComparer.Ordinal);

        foreach (var ruleId in rules.Keys.Where(id => !ReachesItself(id, rules)))
        {
            Assert.True(
                DependencyDepth(ruleId, rules) <= MaxDependencyDepth,
                $"{ruleId} has a dependency chain deeper than {MaxDependencyDepth}");
        }
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void Every_case_names_a_rule_a_known_outcome_and_a_known_error_code(string scenario)
    {
        using var document = Load(scenario);
        var ruleIds = document.RootElement.GetProperty("rules").EnumerateArray()
            .Select(r => r.GetProperty("id").GetString()!).ToHashSet(StringComparer.Ordinal);

        var cases = document.RootElement.GetProperty("cases").EnumerateArray().ToArray();
        Assert.NotEmpty(cases);

        foreach (var testCase in cases)
        {
            var name = testCase.GetProperty("name").GetString();
            Assert.False(string.IsNullOrWhiteSpace(name));
            AssertOnlyProperties(testCase, "name", "ruleId", "target", "projectId", "expect");

            var ruleId = testCase.GetProperty("ruleId").GetString()!;
            Assert.Contains(ruleId, ruleIds);

            var expect = testCase.GetProperty("expect");
            AssertOnlyProperties(expect, "outcome", "errorCode", "exemptionId", "evidence");

            var outcome = expect.GetProperty("outcome").GetString()!;
            Assert.Contains(outcome, Outcomes);

            var errorCode = expect.GetProperty("errorCode");
            if (outcome == "error")
            {
                Assert.Contains(errorCode.GetString()!, ErrorCodes);
            }
            else
            {
                Assert.Equal(JsonValueKind.Null, errorCode.ValueKind);
            }

            var exemptionId = expect.GetProperty("exemptionId");
            if (outcome == "exempt")
            {
                var rule = Rule(document, ruleId);
                Assert.Contains(
                    exemptionId.GetString(),
                    Exceptions(rule).Select(e => e.GetProperty("id").GetString()));
            }
            else
            {
                Assert.Equal(JsonValueKind.Null, exemptionId.ValueKind);
            }

            foreach (var evidence in expect.GetProperty("evidence").EnumerateArray())
            {
                Assert.False(string.IsNullOrWhiteSpace(evidence.GetString()));
            }
        }
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void A_case_target_is_a_subject_or_an_event_that_the_fixture_defines(string scenario)
    {
        using var document = Load(scenario);
        var facts = document.RootElement.GetProperty("facts");
        var known = facts.GetProperty("subjects").EnumerateArray().Select(s => s.GetProperty("id").GetString()!)
            .Concat(facts.GetProperty("events").EnumerateArray().Select(e => e.GetProperty("id").GetString()!))
            .ToHashSet(StringComparer.Ordinal);

        foreach (var testCase in document.RootElement.GetProperty("cases").EnumerateArray())
        {
            var target = testCase.GetProperty("target");
            if (target.ValueKind == JsonValueKind.Null)
            {
                continue;
            }

            var id = target.GetString()!;
            var absentOnPurpose = testCase.GetProperty("name").GetString()!.Contains("does not exist", StringComparison.Ordinal);

            Assert.True(known.Contains(id) || absentOnPurpose, $"case target {id} is not in the fixture");
        }
    }

    [Fact]
    public void The_five_domain_fixtures_between_them_cover_every_semantic_the_specification_calls_out()
    {
        var outcomes = new List<string>();
        var errorCodes = new List<string>();
        var nodeKinds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var scenario in RequiredScenarios)
        {
            using var document = Load(scenario);

            foreach (var testCase in document.RootElement.GetProperty("cases").EnumerateArray())
            {
                outcomes.Add(testCase.GetProperty("expect").GetProperty("outcome").GetString()!);
                var code = testCase.GetProperty("expect").GetProperty("errorCode");
                if (code.ValueKind == JsonValueKind.String)
                {
                    errorCodes.Add(code.GetString()!);
                }
            }

            foreach (var rule in document.RootElement.GetProperty("rules").EnumerateArray())
            {
                CollectKinds(rule.GetProperty("condition"), nodeKinds);
            }
        }

        // Every outcome the specification defines is exercised somewhere.
        foreach (var outcome in Outcomes)
        {
            Assert.Contains(outcome, outcomes);
        }

        // The failures the issue's acceptance criteria name by hand.
        foreach (var required in new[]
                 {
                     "dependency_cycle", "scope_mismatch", "type_mismatch", "operator_not_applicable",
                     "undeclared_dependency", "missing_rule", "schema_version_unsupported", "unknown_node_kind",
                     "node_arity", "depth_limit", "unknown_source",
                 })
        {
            Assert.Contains(required, errorCodes);
        }

        // Every node kind in version 1 appears in at least one fixture, so none is specified without an example.
        foreach (var kind in NodeKinds)
        {
            Assert.Contains(kind, nodeKinds);
        }
    }

    [Fact]
    public void Precedence_between_a_project_and_a_universe_exception_is_covered_in_both_directions()
    {
        using var document = Load("succession");
        var cases = document.RootElement.GetProperty("cases").EnumerateArray()
            .Where(c => c.GetProperty("expect").GetProperty("outcome").GetString() == "exempt")
            .Select(c => c.GetProperty("expect").GetProperty("exemptionId").GetString()!)
            .ToArray();

        Assert.Contains("ex.regency", cases);
        Assert.Contains("ex.acclaimed-over-ten", cases);
    }

    [Fact]
    public void The_same_rule_and_subject_is_exempt_inside_a_project_and_a_violation_outside_it()
    {
        using var document = Load("runeforging");
        var byTarget = document.RootElement.GetProperty("cases").EnumerateArray()
            .Where(c => c.GetProperty("ruleId").GetString() == "rule.purity-floor"
                        && c.GetProperty("target").GetString() == "s.rite-ingot")
            .ToArray();

        Assert.Equal(2, byTarget.Length);
        Assert.Contains(byTarget, c => c.GetProperty("expect").GetProperty("outcome").GetString() == "exempt");
        Assert.Contains(byTarget, c => c.GetProperty("expect").GetProperty("outcome").GetString() == "false");
    }

    [Fact]
    public void The_nonfantasy_fixture_contains_no_fantasy_or_game_term()
    {
        var text = File.ReadAllText(Path.Combine(FixtureDirectory(), "clinical-trial.json"));

        // "universe", "canon" and "scope" are this specification's own vocabulary, not domain content, so they are
        // not on this list. Everything here is a word a fantasy or game fixture would use and a records domain
        // would not.
        foreach (var term in new[]
                 {
                     "rune", "forg", "magic", "spell", "ley", "anchor", "quest", "dragon", "sword", "king",
                     "throne", "wizard", "realm", "claimant", "unlock", "practitioner",
                 })
        {
            Assert.DoesNotContain(term, text, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void The_edge_case_fixture_states_the_limits_the_specification_sets()
    {
        using var document = Load("edge-cases");
        var limits = document.RootElement.GetProperty("limits");

        Assert.Equal(MaxDepth, limits.GetProperty("maxDepth").GetInt32());
        Assert.Equal(MaxNodes, limits.GetProperty("maxNodes").GetInt32());
        Assert.Equal(MaxWhereClauses, limits.GetProperty("maxWhereClauses").GetInt32());
        Assert.Equal(MaxExceptions, limits.GetProperty("maxExceptions").GetInt32());
        Assert.Equal(MaxConditionBytes, limits.GetProperty("maxConditionBytes").GetInt32());
        Assert.Equal(20000, limits.GetProperty("maxSteps").GetInt32());
        Assert.Equal(2000, limits.GetProperty("maxQueryRows").GetInt32());
        Assert.Equal(MaxDependencyDepth, limits.GetProperty("maxDependencyDepth").GetInt32());
        Assert.Equal(500, limits.GetProperty("maxRulesPerEvaluation").GetInt32());
        Assert.Equal(2, limits.GetProperty("wallClockSecondsPerRule").GetInt32());
    }

    private static string FixtureDirectory()
    {
        var directory = Path.Combine(AppContext.BaseDirectory, "Fixtures", "WorldLogic");
        Assert.True(Directory.Exists(directory), $"fixtures were not copied to {directory}");
        return directory;
    }

    private static JsonDocument Load(string scenario)
        => JsonDocument.Parse(File.ReadAllText(Path.Combine(FixtureDirectory(), $"{scenario}.json")));

    private static JsonElement Rule(JsonDocument document, string ruleId)
        => document.RootElement.GetProperty("rules").EnumerateArray()
            .First(r => r.GetProperty("id").GetString() == ruleId);

    private static List<JsonElement> Exceptions(JsonElement rule)
        => rule.TryGetProperty("exceptions", out var exceptions)
            ? exceptions.EnumerateArray().ToList()
            : [];

    private static HashSet<string> Dependencies(JsonElement rule)
        => rule.TryGetProperty("dependsOn", out var dependsOn)
            ? dependsOn.EnumerateArray().Select(d => d.GetString()!).ToHashSet(StringComparer.Ordinal)
            : new HashSet<string>(StringComparer.Ordinal);

    private static HashSet<string> ExpectedErrorCodes(JsonDocument document, string ruleId)
        => document.RootElement.GetProperty("cases").EnumerateArray()
            .Where(c => c.GetProperty("ruleId").GetString() == ruleId)
            .Select(c => c.GetProperty("expect").GetProperty("errorCode"))
            .Where(c => c.ValueKind == JsonValueKind.String)
            .Select(c => c.GetString()!)
            .ToHashSet(StringComparer.Ordinal);

    private static void AssertOnlyProperties(JsonElement element, params string[] allowed)
    {
        foreach (var property in element.EnumerateObject())
        {
            Assert.Contains(property.Name, allowed);
        }
    }

    private static void Walk(JsonElement node, string ruleId, bool expectsUnknownKind, bool expectsUnknownSource)
    {
        var kind = node.GetProperty("kind").GetString()!;
        if (!NodeKinds.Contains(kind))
        {
            Assert.True(expectsUnknownKind, $"{ruleId} uses node kind {kind}, which version 1 does not define");
            return;
        }

        switch (kind)
        {
            case "all":
            case "any":
                foreach (var child in node.GetProperty("of").EnumerateArray())
                {
                    Walk(child, ruleId, expectsUnknownKind, expectsUnknownSource);
                }

                break;

            case "not":
                Walk(node.GetProperty("of"), ruleId, expectsUnknownKind, expectsUnknownSource);
                break;

            case "compare":
                Assert.Contains(node.GetProperty("op").GetString()!, CompareOperators);
                WalkOperand(node.GetProperty("left"), ruleId, expectsUnknownSource);
                WalkOperand(node.GetProperty("right"), ruleId, expectsUnknownSource);
                break;

            case "exists":
                WalkQuery(node.GetProperty("query"), ruleId, expectsUnknownSource);
                break;

            case "related":
                Assert.False(string.IsNullOrWhiteSpace(node.GetProperty("relation").GetString()));
                WalkOperand(node.GetProperty("from"), ruleId, expectsUnknownSource);
                WalkOperand(node.GetProperty("to"), ruleId, expectsUnknownSource);
                break;

            case "within":
                WalkOperand(node.GetProperty("point"), ruleId, expectsUnknownSource);
                WalkOperand(node.GetProperty("from"), ruleId, expectsUnknownSource);
                WalkOperand(node.GetProperty("to"), ruleId, expectsUnknownSource);
                break;

            case "ruleHolds":
                Assert.False(string.IsNullOrWhiteSpace(node.GetProperty("ruleId").GetString()));
                break;

            case "always":
                Assert.Contains(node.GetProperty("value").GetString()!, new[] { "true", "false", "unknown" });
                break;
        }
    }

    private static void WalkOperand(JsonElement operand, string ruleId, bool expectsUnknownSource)
    {
        var keys = operand.EnumerateObject().Select(p => p.Name).ToArray();
        var kindKey = keys.FirstOrDefault(OperandKeys.Contains);
        Assert.NotNull(kindKey);

        switch (kindKey)
        {
            case "literal":
                Assert.Contains(operand.GetProperty("type").GetString()!, ValueTypes);
                AssertOnlyProperties(operand, "literal", "type");
                break;

            case "attribute":
                Assert.False(string.IsNullOrWhiteSpace(operand.GetProperty("attribute").GetString()));
                AssertOnlyProperties(operand, "attribute", "of");
                WalkOperand(operand.GetProperty("of"), ruleId, expectsUnknownSource);
                break;

            case "field":
                var source = operand.GetProperty("from").GetString()!;
                Assert.True(
                    SourceFields.ContainsKey(source) || expectsUnknownSource,
                    $"{ruleId} reads from unknown source {source}");
                if (SourceFields.TryGetValue(source, out var fields))
                {
                    Assert.Contains(operand.GetProperty("field").GetString()!, fields);
                }

                AssertOnlyProperties(operand, "field", "of", "from");
                WalkOperand(operand.GetProperty("of"), ruleId, expectsUnknownSource);
                break;

            case "subject":
                Assert.False(string.IsNullOrWhiteSpace(operand.GetProperty("subject").GetString()));
                AssertOnlyProperties(operand, "subject");
                break;

            case "count":
                AssertOnlyProperties(operand, "count");
                WalkQuery(operand.GetProperty("count"), ruleId, expectsUnknownSource);
                break;
        }
    }

    private static void WalkQuery(JsonElement query, string ruleId, bool expectsUnknownSource)
    {
        AssertOnlyProperties(query, "from", "where");
        var source = query.GetProperty("from").GetString()!;

        if (!SourceFields.TryGetValue(source, out var fields))
        {
            Assert.True(expectsUnknownSource, $"{ruleId} queries unknown source {source}");
            return;
        }

        foreach (var clause in query.GetProperty("where").EnumerateArray())
        {
            Assert.Contains(clause.GetProperty("field").GetString()!, fields);
            Assert.Contains(clause.GetProperty("op").GetString()!, ClauseOperators);

            if (clause.TryGetProperty("operandValue", out var operandValue))
            {
                AssertOnlyProperties(clause, "field", "op", "operandValue");
                WalkOperand(operandValue, ruleId, expectsUnknownSource);
            }
            else
            {
                AssertOnlyProperties(clause, "field", "op", "value", "type");
                Assert.Contains(clause.GetProperty("type").GetString()!, ValueTypes);
            }
        }
    }

    private static void CollectKinds(JsonElement node, HashSet<string> into)
    {
        var kind = node.GetProperty("kind").GetString()!;
        into.Add(kind);

        if (node.TryGetProperty("of", out var of))
        {
            if (of.ValueKind == JsonValueKind.Array)
            {
                foreach (var child in of.EnumerateArray())
                {
                    CollectKinds(child, into);
                }
            }
            else if (of.ValueKind == JsonValueKind.Object && of.TryGetProperty("kind", out _))
            {
                CollectKinds(of, into);
            }
        }
    }

    private static int Depth(JsonElement node)
    {
        var deepest = 0;

        if (node.TryGetProperty("of", out var of))
        {
            if (of.ValueKind == JsonValueKind.Array)
            {
                foreach (var child in of.EnumerateArray())
                {
                    deepest = Math.Max(deepest, Depth(child));
                }
            }
            else if (of.ValueKind == JsonValueKind.Object && of.TryGetProperty("kind", out _))
            {
                deepest = Depth(of);
            }
        }

        foreach (var name in new[] { "left", "right", "point", "from", "to" })
        {
            if (node.TryGetProperty(name, out var operand) && operand.ValueKind == JsonValueKind.Object)
            {
                deepest = Math.Max(deepest, OperandDepth(operand));
            }
        }

        return deepest + 1;
    }

    private static int OperandDepth(JsonElement operand)
        => operand.TryGetProperty("of", out var inner) && inner.ValueKind == JsonValueKind.Object
            ? OperandDepth(inner) + 1
            : 1;

    private static int Nodes(JsonElement node)
    {
        var total = 1;

        if (node.TryGetProperty("of", out var of))
        {
            if (of.ValueKind == JsonValueKind.Array)
            {
                total += of.EnumerateArray().Sum(Nodes);
            }
            else if (of.ValueKind == JsonValueKind.Object && of.TryGetProperty("kind", out _))
            {
                total += Nodes(of);
            }
        }

        return total;
    }

    private static IEnumerable<int> WhereClauseCounts(JsonElement node)
    {
        if (node.ValueKind == JsonValueKind.Object)
        {
            if (node.TryGetProperty("where", out var where) && where.ValueKind == JsonValueKind.Array)
            {
                yield return where.GetArrayLength();
            }

            foreach (var property in node.EnumerateObject())
            {
                foreach (var count in WhereClauseCounts(property.Value))
                {
                    yield return count;
                }
            }
        }
        else if (node.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in node.EnumerateArray())
            {
                foreach (var count in WhereClauseCounts(item))
                {
                    yield return count;
                }
            }
        }
    }

    private static IEnumerable<string> RuleReferences(JsonElement node)
    {
        if (node.ValueKind == JsonValueKind.Object)
        {
            if (node.TryGetProperty("kind", out var kind)
                && kind.GetString() == "ruleHolds"
                && node.TryGetProperty("ruleId", out var ruleId))
            {
                yield return ruleId.GetString()!;
            }

            foreach (var property in node.EnumerateObject())
            {
                foreach (var reference in RuleReferences(property.Value))
                {
                    yield return reference;
                }
            }
        }
        else if (node.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in node.EnumerateArray())
            {
                foreach (var reference in RuleReferences(item))
                {
                    yield return reference;
                }
            }
        }
    }

    private static bool ReachesItself(string ruleId, Dictionary<string, HashSet<string>> rules)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var queue = new Queue<string>(rules.TryGetValue(ruleId, out var start) ? start : []);

        while (queue.Count > 0)
        {
            var next = queue.Dequeue();
            if (next == ruleId)
            {
                return true;
            }

            if (!seen.Add(next) || !rules.TryGetValue(next, out var dependencies))
            {
                continue;
            }

            foreach (var dependency in dependencies)
            {
                queue.Enqueue(dependency);
            }
        }

        return false;
    }

    private static int DependencyDepth(string ruleId, Dictionary<string, HashSet<string>> rules)
        => DependencyDepth(ruleId, rules, new HashSet<string>(StringComparer.Ordinal));

    private static int DependencyDepth(string ruleId, Dictionary<string, HashSet<string>> rules, HashSet<string> walking)
    {
        if (!walking.Add(ruleId) || !rules.TryGetValue(ruleId, out var dependencies) || dependencies.Count == 0)
        {
            return 0;
        }

        return 1 + dependencies.Max(dependency => DependencyDepth(dependency, rules, walking));
    }
}
