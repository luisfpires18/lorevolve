using System.Text.Json;
using LorEvolve.Api.Features.RuleValidation.Conditions;
using LorEvolve.Api.Features.Systems;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The two machine checks against the specification's own machine fixtures (#360, state machine specification,
/// section 13).
///
/// <para>The fixtures were written before the checks existed, so every case is evidence about the implementation
/// rather than a description of it. Each case runs through <see cref="WorldLogicMachineCheck.Run"/>, the same entry
/// the sweep takes, over <see cref="WorldLogicFixtureFacts"/> and the real evaluator.</para>
/// </summary>
public sealed class WorldLogicMachineFixtureTests
{
    public static TheoryData<string> AllScenarios => new("apprenticeship", "case-review");

    /// <summary>
    /// Every case of one fixture: the check, the state, the outcome, the error code and the transitions tried, each
    /// as <c>id:result</c>. All cases run in one test so a failure names every case that disagreed.
    /// </summary>
    [Theory]
    [MemberData(nameof(AllScenarios))]
    public void Every_case_of_a_machine_fixture_checks_as_the_specification_says(string scenario)
    {
        using var document = Load(scenario);
        var root = document.RootElement;
        var machine = Machine(root);
        var facts = new WorldLogicFixtureFacts(root.GetProperty("facts"));
        var rules = WorldLogicEvaluatorTests.Rules(root);

        var runs = new Dictionary<string, MachineRun>(StringComparer.Ordinal);
        var wrong = new List<string>();
        var cases = 0;

        foreach (var testCase in root.GetProperty("cases").EnumerateArray())
        {
            cases++;
            var name = testCase.GetProperty("name").GetString()!;
            var subjectId = testCase.GetProperty("subjectId").GetString()!;
            var project = testCase.GetProperty("projectId").ValueKind == JsonValueKind.Null
                ? null
                : testCase.GetProperty("projectId").GetString();

            if (!runs.TryGetValue(project ?? string.Empty, out var run))
            {
                run = WorldLogicMachineCheck.Run([machine], facts, rules, project);
                runs[project ?? string.Empty] = run;
            }

            var expected = testCase.GetProperty("expect").EnumerateArray().Select(Expected).ToList();
            var actual = run.Records.Where(record => record.SubjectId == subjectId).Select(Actual).ToList();

            if (!expected.SequenceEqual(actual))
            {
                wrong.Add($"{name}: expected [{string.Join(" | ", expected)}], got [{string.Join(" | ", actual)}]");
            }

            foreach (var record in run.Records.Where(record => record.SubjectId == subjectId))
            {
                // Section 5: the evidence starts with the subject and the bound attribute.
                if (record.Evidence.Count < 2
                    || record.Evidence[0] != new ConditionEvidence("subjects", subjectId, "self")
                    || record.Evidence[1] != new ConditionEvidence("subjects", subjectId, $"attribute:{machine.Attribute}"))
                {
                    wrong.Add($"{name}: the evidence does not start with self and the attribute");
                }
            }
        }

        Assert.True(cases > 0);
        Assert.False(runs.Values.Any(run => run.IsTruncated));
        Assert.True(wrong.Count == 0, string.Join(Environment.NewLine, wrong));
    }

    /// <summary>Two runs over unchanged facts, rules and machine produce byte-identical records (section 5).</summary>
    [Theory]
    [MemberData(nameof(AllScenarios))]
    public void A_second_run_is_byte_identical(string scenario)
    {
        using var document = Load(scenario);
        var root = document.RootElement;
        var machine = Machine(root);
        var rules = WorldLogicEvaluatorTests.Rules(root);

        var first = WorldLogicMachineCheck.Run([machine], new WorldLogicFixtureFacts(root.GetProperty("facts")), rules, null);
        var second = WorldLogicMachineCheck.Run([machine], new WorldLogicFixtureFacts(root.GetProperty("facts")), rules, null);

        Assert.NotEmpty(first.Records);
        Assert.Equal(JsonSerializer.Serialize(first), JsonSerializer.Serialize(second));
    }

    /// <summary>One expected record in the comparison form: check, state, outcome, code, then the transitions tried.</summary>
    private static string Expected(JsonElement record) =>
        Line(
            record.GetProperty("check").GetString()!,
            record.GetProperty("stateId").GetString(),
            record.GetProperty("outcome").GetString()!,
            record.GetProperty("errorCode").GetString(),
            record.GetProperty("transitions").EnumerateArray().Select(item => item.GetString()!));

    private static string Actual(MachineRecord record) =>
        Line(
            WorldLogicMachineCheck.Name(record.Check),
            record.StateId,
            record.Outcome switch
            {
                WorldLogicFindingOutcome.Violation => "violation",
                WorldLogicFindingOutcome.Unknown => "unknown",
                _ => "error",
            },
            record.ErrorCode,
            record.Evidence
                .Where(item => item.Source == WorldLogicMachineCheck.TransitionsSource)
                .Select(item => $"{item.Id}:{item.Role["guard:".Length..]}"));

    private static string Line(string check, string? state, string outcome, string? code, IEnumerable<string> transitions) =>
        $"{check} {state ?? "-"} {outcome} {code ?? "-"} [{string.Join(", ", transitions)}]";

    /// <summary>The fixture's machine as the check reads it, under a System id of the fixture's own.</summary>
    private static CheckedMachine Machine(JsonElement root)
    {
        var machine = root.GetProperty("machine");
        var binding = machine.GetProperty("binding");

        return new CheckedMachine(
            $"sys.{root.GetProperty("scenario").GetString()}",
            1,
            machine.GetProperty("schemaVersion").GetInt32(),
            binding.GetProperty("subjectType").GetString()!,
            binding.GetProperty("attribute").GetString()!,
            [
                .. machine.GetProperty("states").EnumerateArray().Select(state => new CheckedState(
                    state.GetProperty("id").GetString()!,
                    state.GetProperty("value").GetString()!,
                    state.GetProperty("initial").GetBoolean())),
            ],
            [
                .. machine.GetProperty("transitions").EnumerateArray().Select(transition => new CheckedTransition(
                    transition.GetProperty("id").GetString()!,
                    transition.GetProperty("toStateId").GetString()!,
                    transition.GetProperty("guardRuleId").GetString())),
            ]);
    }

    private static JsonDocument Load(string scenario) => JsonDocument.Parse(
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "WorldLogic", "Machines", $"{scenario}.json")));
}
