using System.Text.Json;
using LorEvolve.Api.Features.RuleValidation.Conditions;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The evaluator against the specification's own fixtures (#151, ADR 0072).
///
/// <para>Every case in every fixture states the outcome, the error code and the evidence it expects, and those
/// expectations were written in #149 before this evaluator existed. That is the point: the evaluator is held to a
/// contract it did not author, in five unrelated domains plus one document of failures, so a semantic that drifted
/// would have to drift in the specification first.</para>
///
/// <para>The budget tests lower a limit rather than building a condition large enough to exhaust the real number,
/// because what is under test is that a budget fails safely with its own code, not what the number happens to
/// be.</para>
/// </summary>
public sealed class WorldLogicEvaluatorTests
{
    private static readonly string[] Scenarios =
        ["runeforging", "ley-lines", "succession", "quest-unlocks", "clinical-trial", "edge-cases"];

    public static TheoryData<string> AllScenarios
    {
        get
        {
            var data = new TheoryData<string>();
            foreach (var scenario in Scenarios)
            {
                data.Add(scenario);
            }

            return data;
        }
    }

    /// <summary>
    /// Every case of one fixture, run through the real evaluator. All cases of a fixture run in one test so a
    /// failure reports every case that disagreed rather than only the first.
    /// </summary>
    [Theory]
    [MemberData(nameof(AllScenarios))]
    public void Every_case_of_a_fixture_evaluates_as_the_specification_says(string scenario)
    {
        using var document = Load(scenario);
        var root = document.RootElement;
        var facts = new WorldLogicFixtureFacts(root.GetProperty("facts"));
        var evaluator = new WorldLogicEvaluator(facts, Rules(root));

        var wrong = new List<string>();

        foreach (var testCase in root.GetProperty("cases").EnumerateArray())
        {
            var name = testCase.GetProperty("name").GetString()!;
            var ruleId = testCase.GetProperty("ruleId").GetString()!;
            var target = testCase.GetProperty("target").ValueKind == JsonValueKind.Null
                ? null
                : testCase.GetProperty("target").GetString();

            var project = testCase.GetProperty("projectId").ValueKind == JsonValueKind.Null
                ? null
                : testCase.GetProperty("projectId").GetString();

            var expected = testCase.GetProperty("expect");
            var result = evaluator.Evaluate(ruleId, target, project);

            var expectedOutcome = expected.GetProperty("outcome").GetString()!;
            if (Name(result.Outcome) != expectedOutcome)
            {
                wrong.Add($"{name}: expected {expectedOutcome}, got {Name(result.Outcome)} ({result.ErrorCode})");
                continue;
            }

            var expectedCode = expected.GetProperty("errorCode").ValueKind == JsonValueKind.Null
                ? null
                : expected.GetProperty("errorCode").GetString();

            if (result.ErrorCode != expectedCode)
            {
                wrong.Add($"{name}: expected code {expectedCode ?? "none"}, got {result.ErrorCode ?? "none"}");
                continue;
            }

            var expectedExemption = expected.GetProperty("exemptionId").ValueKind == JsonValueKind.Null
                ? null
                : expected.GetProperty("exemptionId").GetString();

            if (result.ExemptionId != expectedExemption)
            {
                wrong.Add($"{name}: expected exemption {expectedExemption ?? "none"}, got {result.ExemptionId ?? "none"}");
                continue;
            }

            // The fixture lists the ids the outcome must have depended on. The result's order is the evaluation's
            // own and is compared as a set here, because a fixture states which ids matter rather than the order a
            // particular tree visits them in; the record itself keeps the order, as section 9 requires.
            var evidence = result.Evidence.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
            foreach (var required in expected.GetProperty("evidence").EnumerateArray())
            {
                var id = required.GetString()!;
                if (!evidence.Contains(id))
                {
                    wrong.Add($"{name}: evidence is missing {id} (got {string.Join(", ", evidence.Order(StringComparer.Ordinal))})");
                }
            }
        }

        Assert.Empty(wrong);
    }

    [Theory]
    [MemberData(nameof(AllScenarios))]
    public void Two_runs_over_unchanged_facts_answer_identically(string scenario)
    {
        using var document = Load(scenario);
        var root = document.RootElement;
        var rules = Rules(root).ToList();

        var first = new WorldLogicEvaluator(new WorldLogicFixtureFacts(root.GetProperty("facts")), rules);
        var second = new WorldLogicEvaluator(new WorldLogicFixtureFacts(root.GetProperty("facts")), rules);

        foreach (var rule in rules)
        {
            foreach (var target in Targets(root))
            {
                var left = first.Evaluate(rule.Id, target);
                var right = second.Evaluate(rule.Id, target);

                Assert.Equal(left.Outcome, right.Outcome);
                Assert.Equal(left.ErrorCode, right.ErrorCode);
                Assert.Equal(left.ExemptionId, right.ExemptionId);
                Assert.Equal(left.Evidence, right.Evidence);
                Assert.Equal(left.Rationale, right.Rationale);
            }
        }
    }

    /// <summary>
    /// The result carries what a finding needs to be reproduced: which rule, at which version, under which schema
    /// version, and the ids it depended on.
    /// </summary>
    [Fact]
    public void A_result_names_the_rule_its_version_and_the_data_it_read()
    {
        using var document = Load("runeforging");
        var root = document.RootElement;
        var evaluator = new WorldLogicEvaluator(new WorldLogicFixtureFacts(root.GetProperty("facts")), Rules(root));

        var result = evaluator.Evaluate("rule.strike-limit", "s.overworked-ingot");

        Assert.Equal("rule.strike-limit", result.RuleId);
        Assert.Equal(2, result.RuleVersion);
        Assert.Equal(1, result.SchemaVersion);
        Assert.Equal(ConditionOutcome.False, result.Outcome);
        Assert.Contains(result.Evidence, item => item is { Source: "subjects", Id: "s.overworked-ingot", Role: "self" });
        Assert.Contains(result.Evidence, item => item is { Source: "events", Id: "e.2", Role: "matched" });
        Assert.NotEmpty(result.Rationale);
    }

    /// <summary>
    /// Entity queries, nested groups and a scoped exception, in three unrelated domains, which is the acceptance
    /// this issue names. Each assertion is one semantic in one domain, so a failure says which.
    /// </summary>
    [Fact]
    public void Queries_nested_groups_and_scoped_exceptions_work_across_unrelated_domains()
    {
        // A craft: a count over events, and a project-scoped exception that applies in one project only.
        using var runeforging = Load("runeforging");
        var craft = Evaluator(runeforging);
        Assert.Equal(ConditionOutcome.False, craft.Evaluate("rule.strike-limit", "s.overworked-ingot").Outcome);
        Assert.Equal(ConditionOutcome.Exempt, craft.Evaluate("rule.purity-floor", "s.rite-ingot", "p.rites").Outcome);
        Assert.Equal(ConditionOutcome.False, craft.Evaluate("rule.purity-floor", "s.rite-ingot", "p.other").Outcome);

        // An unrelated magic system: a nested AND inside an OR, and relation traversal.
        using var leyLines = Load("ley-lines");
        var magic = Evaluator(leyLines);
        Assert.Equal(ConditionOutcome.True, magic.Evaluate("rule.draw-requires-attunement-or-depth", "s.adept").Outcome);
        Assert.Equal(ConditionOutcome.False, magic.Evaluate("rule.draw-requires-attunement-or-depth", "s.novice").Outcome);
        Assert.Equal(ConditionOutcome.True, magic.Evaluate("rule.draw-requires-attunement-or-depth", "s.stranger").Outcome);

        // A records domain with no fiction in it: numbers, dates and a window.
        using var trial = Load("clinical-trial");
        var protocol = Evaluator(trial);
        Assert.Equal(ConditionOutcome.True, protocol.Evaluate("rule.enrolment-criteria", "s.p-001").Outcome);
        Assert.Equal(ConditionOutcome.False, protocol.Evaluate("rule.dose-inside-window", "e.dose-002").Outcome);

        // A progression: a dependency diamond, with the shared dependency deciding both branches.
        using var quests = Load("quest-unlocks");
        var progression = Evaluator(quests);
        Assert.Equal(ConditionOutcome.True, progression.Evaluate("rule.final-unlock", "s.finisher").Outcome);
        Assert.Equal(ConditionOutcome.Unknown, progression.Evaluate("rule.final-unlock", "s.unrated").Outcome);
    }

    [Fact]
    public void An_unknown_is_never_quietly_a_false()
    {
        using var document = Load("edge-cases");
        var evaluator = Evaluator(document);

        // A missing attribute, an exception that cannot be settled, and an unknown inside a group each stay unknown.
        Assert.Equal(ConditionOutcome.Unknown, evaluator.Evaluate("rule.missing-attribute", "s.b").Outcome);
        Assert.Equal(ConditionOutcome.Unknown, evaluator.Evaluate("rule.unknown-exception-blocks-a-violation", "s.a").Outcome);
        Assert.Equal(ConditionOutcome.Unknown, evaluator.Evaluate("rule.any-false-and-unknown-is-unknown", "s.a").Outcome);
    }

    [Fact]
    public void A_rule_that_is_words_only_is_never_evaluated_and_never_a_violation()
    {
        var evaluator = new WorldLogicEvaluator(
            new WorldLogicFixtureFacts(Empty()),
            [new EvaluatedRule("rule.words", 1, 1, null, [], [])]);

        var result = evaluator.Evaluate("rule.words");

        Assert.Equal(ConditionOutcome.Unknown, result.Outcome);
        Assert.Null(result.ErrorCode);
    }

    [Fact]
    public void A_rule_that_does_not_exist_is_a_missing_rule()
    {
        var evaluator = new WorldLogicEvaluator(new WorldLogicFixtureFacts(Empty()), []);
        var result = evaluator.Evaluate("rule.nowhere");

        Assert.Equal(ConditionOutcome.Error, result.Outcome);
        Assert.Equal(ConditionErrors.MissingRule, result.ErrorCode);
    }

    [Fact]
    public void A_condition_that_is_not_json_is_an_error_rather_than_a_pass()
    {
        var evaluator = new WorldLogicEvaluator(
            new WorldLogicFixtureFacts(Empty()),
            [new EvaluatedRule("rule.broken", 1, 1, "{not json", [], [])]);

        var result = evaluator.Evaluate("rule.broken");

        Assert.Equal(ConditionOutcome.Error, result.Outcome);
        Assert.Equal(ConditionErrors.InvalidReference, result.ErrorCode);
    }

    [Fact]
    public void The_step_budget_fails_the_rule_alone_and_says_so()
    {
        using var document = Load("quest-unlocks");
        var root = document.RootElement;

        var evaluator = new WorldLogicEvaluator(
            new WorldLogicFixtureFacts(root.GetProperty("facts")),
            Rules(root),
            new ConditionBudget(MaxSteps: 2));

        var result = evaluator.Evaluate("rule.final-unlock", "s.finisher");

        Assert.Equal(ConditionOutcome.Error, result.Outcome);
        Assert.Equal(ConditionErrors.StepBudget, result.ErrorCode);
    }

    [Fact]
    public void The_query_budget_is_an_error_rather_than_a_truncated_count()
    {
        using var document = Load("runeforging");
        var root = document.RootElement;

        var evaluator = new WorldLogicEvaluator(
            new WorldLogicFixtureFacts(root.GetProperty("facts")),
            Rules(root),
            new ConditionBudget(MaxQueryRows: 1));

        // Three Canon strikes match, which is over the budget of one, so the count is refused rather than wrong.
        var result = evaluator.Evaluate("rule.strike-limit", "s.overworked-ingot");

        Assert.Equal(ConditionOutcome.Error, result.Outcome);
        Assert.Equal(ConditionErrors.QueryLimit, result.ErrorCode);
    }

    [Fact]
    public void The_wall_clock_budget_fails_with_its_own_code()
    {
        using var document = Load("quest-unlocks");
        var root = document.RootElement;

        var evaluator = new WorldLogicEvaluator(
            new WorldLogicFixtureFacts(root.GetProperty("facts")),
            Rules(root),
            new ConditionBudget(WallClockMilliseconds: -1));

        var result = evaluator.Evaluate("rule.final-unlock", "s.finisher");

        Assert.Equal(ConditionOutcome.Error, result.Outcome);
        Assert.Equal(ConditionErrors.TimeBudget, result.ErrorCode);
    }

    [Fact]
    public void The_rule_budget_bounds_a_whole_run()
    {
        using var document = Load("edge-cases");
        var root = document.RootElement;

        var evaluator = new WorldLogicEvaluator(
            new WorldLogicFixtureFacts(root.GetProperty("facts")),
            Rules(root),
            new ConditionBudget(MaxRules: 3));

        var results = evaluator.EvaluateAll("s.a");

        Assert.Equal(3, results.Count(result => result.ErrorCode != ConditionErrors.RuleBudget));
        Assert.Contains(results, result => result.ErrorCode == ConditionErrors.RuleBudget);
    }

    [Fact]
    public void A_dependency_depth_past_the_limit_fails_with_its_own_code()
    {
        // A chain of five rules, each depending on the next, with the limit lowered to two.
        var rules = new List<EvaluatedRule>();
        for (var i = 0; i < 5; i++)
        {
            var dependsOn = i < 4 ? new[] { $"rule.{i + 1}" } : [];
            var condition = i < 4
                ? $"{{\"kind\":\"ruleHolds\",\"ruleId\":\"rule.{i + 1}\"}}"
                : "{\"kind\":\"always\",\"value\":\"true\"}";

            rules.Add(new EvaluatedRule($"rule.{i}", 1, 1, condition, dependsOn, []));
        }

        var evaluator = new WorldLogicEvaluator(
            new WorldLogicFixtureFacts(Empty()),
            rules,
            new ConditionBudget(MaxDependencyDepth: 2));

        var result = evaluator.Evaluate("rule.0");

        Assert.Equal(ConditionOutcome.Error, result.Outcome);
        Assert.Equal(ConditionErrors.DependencyDepthLimit, result.ErrorCode);
    }

    /// <summary>
    /// A diamond is evaluated once per dependency, not once per path. The shared rule is a counter of its own, so
    /// the test can see how many times it ran rather than inferring it from timing.
    /// </summary>
    [Fact]
    public void A_dependency_is_evaluated_once_per_target_and_memoised()
    {
        using var document = Load("quest-unlocks");
        var root = document.RootElement;
        var counting = new CountingFacts(new WorldLogicFixtureFacts(root.GetProperty("facts")));
        var evaluator = new WorldLogicEvaluator(counting, Rules(root));

        evaluator.Evaluate("rule.final-unlock", "s.finisher");

        // Both branches read the shared standing rule, and the attribute behind it is read once.
        Assert.Equal(1, counting.Attributes["standing"]);
    }

    private static WorldLogicEvaluator Evaluator(JsonDocument document) =>
        new(new WorldLogicFixtureFacts(document.RootElement.GetProperty("facts")), Rules(document.RootElement));

    /// <summary>
    /// A fixture's rules as the evaluator reads them. The fixture's own <c>schemaVersion</c> is per rule when it
    /// states one, so the edge-case document can hold a rule written against a version this build does not
    /// implement.
    /// </summary>
    private static List<EvaluatedRule> Rules(JsonElement root)
    {
        var documentVersion = root.GetProperty("schemaVersion").GetInt32();
        var rules = new List<EvaluatedRule>();

        foreach (var rule in root.GetProperty("rules").EnumerateArray())
        {
            var exceptions = new List<EvaluatedException>();
            if (rule.TryGetProperty("exceptions", out var written))
            {
                foreach (var exception in written.EnumerateArray())
                {
                    var scope = exception.GetProperty("scope");
                    var projectId = scope.TryGetProperty("projectId", out var project) ? project.GetString() : null;

                    exceptions.Add(new EvaluatedException(
                        exception.GetProperty("id").GetString()!,
                        projectId,
                        exception.GetProperty("when").GetRawText()));
                }
            }

            rules.Add(new EvaluatedRule(
                rule.GetProperty("id").GetString()!,
                rule.GetProperty("version").GetInt32(),
                rule.TryGetProperty("schemaVersion", out var version) ? version.GetInt32() : documentVersion,
                rule.GetProperty("condition").GetRawText(),
                rule.TryGetProperty("dependsOn", out var dependsOn)
                    ? dependsOn.EnumerateArray().Select(id => id.GetString()!).ToList()
                    : [],
                exceptions));
        }

        return rules;
    }

    /// <summary>Every subject and event of a fixture, plus no target at all: what a determinism sweep runs over.</summary>
    private static IEnumerable<string?> Targets(JsonElement root)
    {
        yield return null;

        var facts = root.GetProperty("facts");
        foreach (var subject in facts.GetProperty("subjects").EnumerateArray())
        {
            yield return subject.GetProperty("id").GetString();
        }

        foreach (var row in facts.GetProperty("events").EnumerateArray())
        {
            yield return row.GetProperty("id").GetString();
        }
    }

    private static JsonDocument Load(string scenario) => JsonDocument.Parse(
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "WorldLogic", $"{scenario}.json")));

    private static JsonElement Empty() =>
        JsonDocument.Parse("{\"subjects\":[],\"relations\":[],\"events\":[]}").RootElement.Clone();

    private static string Name(ConditionOutcome outcome) => outcome switch
    {
        ConditionOutcome.True => "true",
        ConditionOutcome.False => "false",
        ConditionOutcome.Unknown => "unknown",
        ConditionOutcome.Exempt => "exempt",
        _ => "error",
    };

    /// <summary>A fact source that counts what was read, so memoisation can be asserted rather than assumed.</summary>
    private sealed class CountingFacts(IConditionFacts inner) : IConditionFacts
    {
        public Dictionary<string, int> Attributes { get; } = new(StringComparer.Ordinal);

        public IReadOnlyList<FactRow>? Query(string source, IReadOnlyList<FactClause> clauses, int limit) =>
            inner.Query(source, clauses, limit);

        public ConditionValue Attribute(string subjectId, string attribute)
        {
            Attributes[attribute] = Attributes.GetValueOrDefault(attribute) + 1;
            return inner.Attribute(subjectId, attribute);
        }

        public ConditionValue? Field(string source, string rowId, string field) => inner.Field(source, rowId, field);

        public bool Related(string type, string fromId, string toId) => inner.Related(type, fromId, toId);
    }
}
