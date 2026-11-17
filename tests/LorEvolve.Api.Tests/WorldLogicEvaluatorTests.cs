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

    /// <summary>
    /// An excused dependency is inherited, not flattened. Codex round 1 on #151 asked for this: a rule built on a
    /// rule that only held by an exception must not report the clean pass the exception produced, or a finding
    /// would say a chain holds without saying what the whole chain rests on.
    /// </summary>
    [Fact]
    public void A_rule_depending_on_an_exempt_rule_is_exempt_and_names_the_exception()
    {
        var evaluator = Chain();

        var dependency = evaluator.Evaluate("rule.excused", "s.a", "p.1");
        Assert.Equal(ConditionOutcome.Exempt, dependency.Outcome);
        Assert.Equal("ex.allowed", dependency.ExemptionId);

        // One hop up, and two hops up: the outcome and the id both carry.
        var dependent = evaluator.Evaluate("rule.depends", "s.a", "p.1");
        Assert.Equal(ConditionOutcome.Exempt, dependent.Outcome);
        Assert.Equal("ex.allowed", dependent.ExemptionId);

        var further = evaluator.Evaluate("rule.depends-twice", "s.a", "p.1");
        Assert.Equal(ConditionOutcome.Exempt, further.Outcome);
        Assert.Equal("ex.allowed", further.ExemptionId);

        // Outside the exception's project the dependency is a plain violation, and so is everything on it.
        Assert.Equal(ConditionOutcome.False, evaluator.Evaluate("rule.excused", "s.a").Outcome);
        Assert.Equal(ConditionOutcome.False, evaluator.Evaluate("rule.depends", "s.a").Outcome);
    }

    [Fact]
    public void An_exempt_child_carries_out_of_a_group_and_a_definite_answer_still_wins()
    {
        var evaluator = Chain();

        // all(true, exempt) held, but by an exception: exempt, with the id.
        var all = evaluator.Evaluate("rule.all-with-exempt", "s.a", "p.1");
        Assert.Equal(ConditionOutcome.Exempt, all.Outcome);
        Assert.Equal("ex.allowed", all.ExemptionId);

        // any(exempt, ...) settles on the exempt child, and says so.
        var any = evaluator.Evaluate("rule.any-with-exempt", "s.a", "p.1");
        Assert.Equal(ConditionOutcome.Exempt, any.Outcome);
        Assert.Equal("ex.allowed", any.ExemptionId);

        // all(false, exempt) is false: a definite answer still settles the group.
        Assert.Equal(ConditionOutcome.False, evaluator.Evaluate("rule.all-false-with-exempt", "s.a", "p.1").Outcome);

        // not(exempt) is false, and no exception is named: "not excused" is not what an exception excuses.
        var negated = evaluator.Evaluate("rule.not-exempt", "s.a", "p.1");
        Assert.Equal(ConditionOutcome.False, negated.Outcome);
        Assert.Null(negated.ExemptionId);

        // An unknown sibling still outranks a held answer, exempt included.
        Assert.Equal(ConditionOutcome.Unknown, evaluator.Evaluate("rule.all-unknown-with-exempt", "s.a", "p.1").Outcome);
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
        // Ten rules that each answer on their own, so the only thing that stops the sweep is the budget. A fixture
        // would not do here: its rules fail for reasons of their own before the counter is reached.
        var rules = Enumerable.Range(0, 10)
            .Select(index => new EvaluatedRule(
                $"rule.{index}",
                1,
                1,
                "{\"kind\":\"always\",\"value\":\"true\"}",
                [],
                []))
            .ToList();

        var evaluator = new WorldLogicEvaluator(
            new WorldLogicFixtureFacts(Empty()),
            rules,
            new ConditionBudget(MaxRules: 4));

        var results = evaluator.EvaluateAll();

        Assert.Equal(4, results.Count(result => result.Outcome == ConditionOutcome.True));
        Assert.Equal(6, results.Count(result => result.ErrorCode == ConditionErrors.RuleBudget));
    }

    /// <summary>
    /// The budget bounds one evaluation too, dependencies included. Codex round 4 on #151 found that it was
    /// enforced only by the sweep, so a single call could walk a dependency chain of any length: the production
    /// route calls the single path, which made the budget decorative exactly where it mattered.
    /// </summary>
    [Fact]
    public void The_rule_budget_bounds_one_evaluation_and_the_dependencies_it_walks_into()
    {
        // Ten rules in a chain, each depending on the next, with the budget at four and the dependency depth left
        // alone so it is the rule budget that stops the walk.
        var rules = new List<EvaluatedRule>();
        for (var i = 0; i < 10; i++)
        {
            var dependsOn = i < 9 ? new[] { $"rule.{i + 1}" } : [];
            var condition = i < 9
                ? $"{{\"kind\":\"ruleHolds\",\"ruleId\":\"rule.{i + 1}\"}}"
                : "{\"kind\":\"always\",\"value\":\"true\"}";

            rules.Add(new EvaluatedRule($"rule.{i}", 1, 1, condition, dependsOn, []));
        }

        var evaluator = new WorldLogicEvaluator(
            new WorldLogicFixtureFacts(Empty()),
            rules,
            new ConditionBudget(MaxRules: 4, MaxDependencyDepth: 32));

        var result = evaluator.Evaluate("rule.0");

        Assert.Equal(ConditionOutcome.Error, result.Outcome);
        Assert.Equal(ConditionErrors.RuleBudget, result.ErrorCode);

        // The rules it did evaluate are the budget's worth, and the first one past it is the one that failed.
        var fifth = evaluator.Evaluate("rule.4");
        Assert.Equal(ConditionErrors.RuleBudget, fifth.ErrorCode);
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

    /// <summary>
    /// A rule excused by a project-scoped exception, two rules depending on it in a chain, and one group of each
    /// shape over it. Written here rather than in a fixture because the point is the propagation, and a fixture
    /// case states one rule's outcome at a time.
    /// </summary>
    private static WorldLogicEvaluator Chain()
    {
        const string ExemptRule = "{\"kind\":\"ruleHolds\",\"ruleId\":\"rule.excused\"}";

        return new WorldLogicEvaluator(
            new WorldLogicFixtureFacts(Facts()),
            [
                // Its condition is false, and the exception applies in p.1 only.
                new EvaluatedRule(
                    "rule.excused",
                    1,
                    1,
                    "{\"kind\":\"always\",\"value\":\"false\"}",
                    [],
                    [new EvaluatedException("ex.allowed", "p.1", "{\"kind\":\"always\",\"value\":\"true\"}")]),

                new EvaluatedRule("rule.depends", 1, 1, ExemptRule, ["rule.excused"], []),
                new EvaluatedRule(
                    "rule.depends-twice",
                    1,
                    1,
                    "{\"kind\":\"ruleHolds\",\"ruleId\":\"rule.depends\"}",
                    ["rule.depends"],
                    []),

                new EvaluatedRule(
                    "rule.all-with-exempt",
                    1,
                    1,
                    "{\"kind\":\"all\",\"of\":[{\"kind\":\"always\",\"value\":\"true\"}," + ExemptRule + "]}",
                    ["rule.excused"],
                    []),

                new EvaluatedRule(
                    "rule.any-with-exempt",
                    1,
                    1,
                    "{\"kind\":\"any\",\"of\":[" + ExemptRule + ",{\"kind\":\"always\",\"value\":\"false\"}]}",
                    ["rule.excused"],
                    []),

                new EvaluatedRule(
                    "rule.all-false-with-exempt",
                    1,
                    1,
                    "{\"kind\":\"all\",\"of\":[{\"kind\":\"always\",\"value\":\"false\"}," + ExemptRule + "]}",
                    ["rule.excused"],
                    []),

                new EvaluatedRule(
                    "rule.all-unknown-with-exempt",
                    1,
                    1,
                    "{\"kind\":\"all\",\"of\":[{\"kind\":\"always\",\"value\":\"unknown\"}," + ExemptRule + "]}",
                    ["rule.excused"],
                    []),

                new EvaluatedRule("rule.not-exempt", 1, 1, "{\"kind\":\"not\",\"of\":" + ExemptRule + "}", ["rule.excused"], []),
            ]);
    }

    /// <summary>One subject, which is all these rules need: their conditions are constants and dependencies.</summary>
    private static JsonElement Facts() => JsonDocument
        .Parse("{\"subjects\":[{\"id\":\"s.a\",\"type\":\"thing\",\"attributes\":{}}],\"relations\":[],\"events\":[]}")
        .RootElement.Clone();

    private static WorldLogicEvaluator Evaluator(JsonDocument document) =>
        new(new WorldLogicFixtureFacts(document.RootElement.GetProperty("facts")), Rules(document.RootElement));

    /// <summary>
    /// A fixture's rules as the evaluator reads them. The fixture's own <c>schemaVersion</c> is per rule when it
    /// states one, so the edge-case document can hold a rule written against a version this build does not
    /// implement.
    /// </summary>
    internal static List<EvaluatedRule> Rules(JsonElement root)
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
