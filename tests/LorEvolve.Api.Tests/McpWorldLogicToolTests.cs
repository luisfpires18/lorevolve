using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Mcp;
using LorEvolve.Api.Features.Systems;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.McpTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The MCP World Logic tools (#154, ADR 0072), driven through the official SDK client over the real Streamable HTTP
/// transport, as a connected client would.
///
/// <para>Three things are worth holding down here, and they are the issue's boundaries rather than its features.
/// First, the two kinds of answer never mix: what <c>evaluate_world_logic_rule</c> and
/// <c>list_world_logic_findings</c> return is computed, and what <c>submit_semantic_finding</c> records is the
/// model's own claim, marked unverified, in a place the findings list cannot reach. Second, the universe is the
/// connection's: another universe's rule, finding or entry is not readable and not citable, however the id was
/// guessed. Third, submitting is a write, so a read-only connection cannot even see the tool, and the existing
/// <c>get_change_options</c> and <c>propose_changes</c> are left exactly as they were.</para>
/// </summary>
public sealed class McpWorldLogicToolTests(McpWorldLogicFixture fixture) : IClassFixture<McpWorldLogicFixture>
{
    private LorEvolveApiFactory Api => fixture.Api;

    private SharedWorld W => fixture.World;

    // ---------- Discovery ----------

    /// <summary>
    /// A read-only connection is offered every read tool and not the one that writes. The acceptance criterion is
    /// discovery, so the list itself is the assertion rather than a call succeeding.
    /// </summary>
    [Fact]
    public async Task Every_read_tool_is_discoverable_and_the_one_that_writes_is_not()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var tools = (await client.ListToolsAsync()).Select(tool => tool.Name).ToList();

        Assert.Contains(LorEvolveMcpWorldLogicTools.ListRulesTool, tools);
        Assert.Contains(LorEvolveMcpWorldLogicTools.ListSystemsTool, tools);
        Assert.Contains(LorEvolveMcpWorldLogicTools.GetRuleTool, tools);
        Assert.Contains(LorEvolveMcpWorldLogicTools.EvaluateTool, tools);
        Assert.Contains(LorEvolveMcpWorldLogicTools.ListFindingsTool, tools);
        Assert.Contains(LorEvolveMcpWorldLogicTools.GetFindingTool, tools);
        Assert.Contains(LorEvolveMcpWorldLogicTools.ImpactTool, tools);

        Assert.DoesNotContain(LorEvolveMcpWorldLogicTools.SubmitTool, tools);

        // The same gate that hides it hides the proposal tools, so a read-only connection sees none of the four.
        Assert.DoesNotContain(LorEvolveMcpProposalTools.ProposeTool, tools);
    }

    [Fact]
    public async Task A_proposing_connection_is_offered_the_submit_tool_and_the_proposal_tools_it_always_had()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposing.AccessToken);

        var tools = (await client.ListToolsAsync()).Select(tool => tool.Name).ToList();

        Assert.Contains(LorEvolveMcpWorldLogicTools.SubmitTool, tools);

        // Preserved unchanged by this issue: both are still there, still named the same.
        Assert.Contains(LorEvolveMcpProposalTools.OptionsTool, tools);
        Assert.Contains(LorEvolveMcpProposalTools.ProposeTool, tools);
    }

    // ---------- Navigating ----------

    /// <summary>
    /// Both kinds of rule are in one list, each saying which it is, and only the one with a typed condition says it
    /// can be evaluated. A client that cannot tell them apart would try to evaluate words.
    /// </summary>
    [Fact]
    public async Task Both_kinds_of_rule_are_listed_and_only_a_typed_one_says_it_has_a_condition()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var listed = await Call(client, LorEvolveMcpWorldLogicTools.ListRulesTool, []);
        var rules = listed.GetProperty("rules").EnumerateArray().ToList();

        var typed = Assert.Single(rules, rule => rule.GetProperty("id").GetGuid() == fixture.ConditionRule);
        Assert.Equal("system_rule", typed.GetProperty("source").GetString());
        Assert.True(typed.GetProperty("hasCondition").GetBoolean());
        Assert.Equal("universe", typed.GetProperty("scope").GetString());

        var worded = Assert.Single(rules, rule => rule.GetProperty("id").GetGuid() == W.Rule);
        Assert.Equal("world_rule", worded.GetProperty("source").GetString());
        Assert.False(worded.GetProperty("hasCondition").GetBoolean());

        // A rule definition with no condition is a third case: a definition, so a system_rule, but nothing to run.
        var words = Assert.Single(rules, rule => rule.GetProperty("id").GetGuid() == W.RuleDefinition);
        Assert.Equal("system_rule", words.GetProperty("source").GetString());
        Assert.False(words.GetProperty("hasCondition").GetBoolean());

        Assert.True(listed.GetProperty("totalCount").GetInt32() >= 3);
    }

    [Fact]
    public async Task The_rule_list_pages_and_reports_what_a_page_is_part_of()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var first = await Call(client, LorEvolveMcpWorldLogicTools.ListRulesTool, new() { ["pageSize"] = 1 });

        Assert.Single(first.GetProperty("rules").EnumerateArray());
        Assert.Equal(1, first.GetProperty("page").GetInt32());
        Assert.True(first.GetProperty("totalPages").GetInt32() >= 3);

        var second = await Call(
            client, LorEvolveMcpWorldLogicTools.ListRulesTool, new() { ["page"] = 2, ["pageSize"] = 1 });

        Assert.Equal(2, second.GetProperty("page").GetInt32());
        Assert.NotEqual(
            first.GetProperty("rules")[0].GetProperty("id").GetGuid(),
            second.GetProperty("rules")[0].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task A_system_names_the_rules_it_groups_and_a_rule_names_the_systems_that_group_it()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var systems = await Call(client, LorEvolveMcpWorldLogicTools.ListSystemsTool, []);
        var system = Assert.Single(
            systems.GetProperty("systems").EnumerateArray(),
            row => row.GetProperty("id").GetGuid() == W.LoreSystem);

        Assert.Equal(1, system.GetProperty("ruleCount").GetInt32());
        Assert.Equal("universe", system.GetProperty("scope").GetString());

        var rule = await Call(
            client,
            LorEvolveMcpWorldLogicTools.GetRuleTool,
            new() { ["ruleId"] = W.RuleDefinition.ToString() });

        var named = Assert.Single(rule.GetProperty("systems").EnumerateArray());
        Assert.Equal(W.LoreSystem, named.GetProperty("id").GetGuid());
    }

    /// <summary>
    /// The condition comes back as JSON, not as a string holding JSON. A client that had to unescape it twice would
    /// read the rule wrong, and the condition is data a client is meant to understand.
    /// </summary>
    [Fact]
    public async Task A_typed_rule_is_read_with_its_condition_as_json_and_the_rules_it_depends_on()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var rule = await Call(
            client,
            LorEvolveMcpWorldLogicTools.GetRuleTool,
            new() { ["ruleId"] = fixture.DependentRule.ToString() });

        Assert.Equal("system_rule", rule.GetProperty("source").GetString());
        Assert.Equal(JsonValueKind.Object, rule.GetProperty("condition").ValueKind);
        Assert.Equal(1, rule.GetProperty("schemaVersion").GetInt32());

        var dependsOn = Assert.Single(rule.GetProperty("dependsOn").EnumerateArray());
        Assert.Equal(fixture.ConditionRule, dependsOn.GetGuid());
    }

    // ---------- Evaluating ----------

    /// <summary>
    /// The outcome, the evidence and the rationale are the evaluator's, and the answer says plainly that nothing was
    /// recorded, so a client never reports an evaluation as a finding the author will see.
    /// </summary>
    [Fact]
    public async Task Evaluating_returns_the_computed_outcome_with_its_evidence_and_records_nothing()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var evaluated = await Call(
            client,
            LorEvolveMcpWorldLogicTools.EvaluateTool,
            new() { ["ruleId"] = fixture.ConditionRule.ToString() });

        // The fixture's rule asks whether an entry of a type no one wrote exists, so the honest answer is false.
        Assert.Equal("false", evaluated.GetProperty("outcome").GetString());
        Assert.Equal(fixture.ConditionRule, evaluated.GetProperty("ruleId").GetGuid());
        Assert.Equal(1, evaluated.GetProperty("ruleVersion").GetInt32());
        Assert.False(evaluated.GetProperty("recorded").GetBoolean());
        Assert.NotEmpty(evaluated.GetProperty("rationale").EnumerateArray());

        // Nothing was written: the author's own findings list is still what their sweep left.
        var findings = await fixture.World.Owner.GetFromJsonAsync<WorldLogicPage<WorldLogicFindingRow>>(
            $"/api/universes/{W.U}/world-logic/findings");
        Assert.Equal(fixture.SweptFindings, findings!.TotalCount);
    }

    /// <summary>
    /// A rule written about one entry and asked without a target answers unknown. ADR 0072 is explicit that unknown
    /// is never coerced to false, and a client reading false here would report a violation that does not exist.
    /// </summary>
    [Fact]
    public async Task A_rule_about_one_entry_asked_without_a_target_answers_unknown_rather_than_false()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var evaluated = await Call(
            client,
            LorEvolveMcpWorldLogicTools.EvaluateTool,
            new() { ["ruleId"] = fixture.SelfRule.ToString() });

        Assert.Equal("unknown", evaluated.GetProperty("outcome").GetString());
    }

    [Fact]
    public async Task Evaluating_a_rule_written_in_words_says_there_is_no_condition_rather_than_not_found()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var refused = await CallRaw(
            client, LorEvolveMcpWorldLogicTools.EvaluateTool, new() { ["ruleId"] = W.Rule.ToString() });

        Assert.True(refused.IsError);
        Assert.Equal("no_condition", refused.Error);
    }

    // ---------- The author's recorded findings ----------

    [Fact]
    public async Task A_recorded_finding_is_read_with_the_ids_its_outcome_depended_on()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var listed = await Call(client, LorEvolveMcpWorldLogicTools.ListFindingsTool, []);
        var finding = Assert.Single(
            listed.GetProperty("findings").EnumerateArray(),
            row => row.GetProperty("ruleId").GetGuid() == fixture.EvidenceRule);

        Assert.Equal("violation", finding.GetProperty("outcome").GetString());
        Assert.Equal("high", finding.GetProperty("severity").GetString());
        Assert.Equal("open", finding.GetProperty("status").GetString());
        Assert.True(finding.GetProperty("evidenceCount").GetInt32() > 0);

        var detail = await Call(
            client,
            LorEvolveMcpWorldLogicTools.GetFindingTool,
            new() { ["findingId"] = finding.GetProperty("id").GetGuid().ToString() });

        var evidence = Assert.Single(detail.GetProperty("evidence").EnumerateArray());
        Assert.Equal(W.Entry.ToString(), evidence.GetProperty("id").GetString());
        Assert.NotEmpty(detail.GetProperty("rationale").EnumerateArray());
    }

    [Fact]
    public async Task The_findings_list_filters_by_outcome_and_refuses_an_outcome_it_does_not_know()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var violations = await Call(
            client, LorEvolveMcpWorldLogicTools.ListFindingsTool, new() { ["outcome"] = "violation" });

        Assert.All(
            violations.GetProperty("findings").EnumerateArray(),
            row => Assert.Equal("violation", row.GetProperty("outcome").GetString()));

        var refused = await CallRaw(
            client, LorEvolveMcpWorldLogicTools.ListFindingsTool, new() { ["outcome"] = "definitely_broken" });

        Assert.True(refused.IsError);
        Assert.Equal("unknown_outcome", refused.Error);
    }

    // ---------- Impact ----------

    [Fact]
    public async Task Impact_names_the_rules_a_change_would_break_and_the_systems_that_reference_it()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var impact = await Call(
            client, LorEvolveMcpWorldLogicTools.ImpactTool, new() { ["ruleId"] = fixture.ConditionRule.ToString() });

        var dependent = Assert.Single(impact.GetProperty("dependents").EnumerateArray());
        Assert.Equal(fixture.DependentRule, dependent.GetProperty("id").GetGuid());
        Assert.True(impact.GetProperty("hasCondition").GetBoolean());
        Assert.Empty(impact.GetProperty("dependsOn").EnumerateArray());
    }

    // ---------- Submitting a claim ----------

    /// <summary>
    /// The heart of the issue. A submitted claim is stored as unverified with the ids, versions and ranges it cited,
    /// it reaches the author's own review list, and it never appears among the findings the evaluator produced.
    /// </summary>
    [Fact]
    public async Task A_submitted_claim_is_unverified_cited_and_never_one_of_the_computed_findings()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposing.AccessToken);

        var submitted = await Call(client, LorEvolveMcpWorldLogicTools.SubmitTool, new()
        {
            ["title"] = "Two entries disagree about the heir",
            ["claim"] = "Ember Vale is called the heir, and Ash Vale's article says the same of itself. One of them is wrong.",
            ["ruleId"] = fixture.ConditionRule.ToString(),
            ["citations"] = new object[]
            {
                new { kind = "lore_entry", sourceId = W.Entry.ToString(), note = "calls itself the heir", sourceVersion = 2 },

                // A range cites prose, so it goes on the manuscript: the only kind here that has any.
                new { kind = "manuscript", sourceId = W.Scene.ToString(), note = "the line that says otherwise", rangeStart = 0, rangeLength = 3 },
            },
        });

        Assert.Equal("unverified", submitted.GetProperty("status").GetString());
        Assert.Equal(2, submitted.GetProperty("citationCount").GetInt32());
        var id = submitted.GetProperty("findingId").GetGuid();

        // The author sees it on their own route, with the versions and the range it cited.
        var detail = await W.Owner.GetFromJsonAsync<SemanticFindingDetail>(
            $"/api/universes/{W.U}/world-logic/semantic-findings/{id}");

        Assert.Equal("unverified", detail!.Finding.Status);
        Assert.Equal(fixture.ConditionRule, detail.Finding.RuleId);
        Assert.Equal(2, detail.Citations.Count);
        Assert.Equal(2, detail.Citations[0].SourceVersion);
        Assert.Equal("manuscript", detail.Citations[1].Kind);
        Assert.Equal(0, detail.Citations[1].RangeStart);
        Assert.Equal(3, detail.Citations[1].RangeLength);

        // And it is nowhere near the computed findings: a model's claim is not a proven violation (ADR 0072).
        var findings = await W.Owner.GetFromJsonAsync<WorldLogicPage<WorldLogicFindingRow>>(
            $"/api/universes/{W.U}/world-logic/findings");
        Assert.DoesNotContain(findings!.Items, row => row.Id == id);
        Assert.Equal(fixture.SweptFindings, findings.TotalCount);

        // Nor does the MCP findings tool show it, which is the list a client would read back.
        await using var reader = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);
        var listed = await Call(reader, LorEvolveMcpWorldLogicTools.ListFindingsTool, []);
        Assert.DoesNotContain(
            listed.GetProperty("findings").EnumerateArray(),
            row => row.GetProperty("id").GetGuid() == id);
    }

    [Fact]
    public async Task An_uncited_claim_is_refused_and_nothing_is_stored()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposing.AccessToken);

        var before = await WaitingAsync();

        var refused = await CallRaw(client, LorEvolveMcpWorldLogicTools.SubmitTool, new()
        {
            ["title"] = "Something feels off",
            ["claim"] = "I cannot say which record, but the succession does not add up.",
            ["citations"] = Array.Empty<object>(),
        });

        Assert.True(refused.IsError);
        Assert.Equal("invalid_finding", refused.Error);
        Assert.Contains("citations", refused.Body);
        Assert.Equal(before, await WaitingAsync());
    }

    /// <summary>
    /// The scope boundary, in the one place a client controls an id. A claim may only cite what this universe holds,
    /// so an id from another universe is refused rather than stored as if the author could check it.
    /// </summary>
    [Fact]
    public async Task A_claim_citing_another_universe_s_entry_is_refused()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposing.AccessToken);

        var before = await WaitingAsync();

        var refused = await CallRaw(client, LorEvolveMcpWorldLogicTools.SubmitTool, new()
        {
            ["title"] = "A claim about somewhere else",
            ["claim"] = "This entry contradicts the connected universe.",
            ["citations"] = new object[]
            {
                new { kind = "lore_entry", sourceId = fixture.ElsewhereEntry.ToString(), note = "the other world's entry" },
            },
        });

        Assert.True(refused.IsError);
        Assert.Equal("invalid_finding", refused.Error);
        Assert.Contains("not_found", refused.Body);
        Assert.Equal(before, await WaitingAsync());
    }

    [Fact]
    public async Task A_read_only_connection_cannot_submit_a_claim_even_by_calling_the_tool_directly()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var before = await WaitingAsync();

        var refused = await CallRaw(client, LorEvolveMcpWorldLogicTools.SubmitTool, new()
        {
            ["title"] = "Submitted without permission",
            ["claim"] = "This connection was never allowed to write anything.",
            ["citations"] = new object[]
            {
                new { kind = "lore_entry", sourceId = W.Entry.ToString(), note = "the entry" },
            },
        });

        Assert.True(refused.IsError);
        Assert.Equal("not_allowed", refused.Error);
        Assert.Equal(before, await WaitingAsync());
    }

    // ---------- The universe boundary on reading ----------

    /// <summary>
    /// Another universe's rule is not this connection's to read, evaluate or ask about, and the answer is the same
    /// "not found" whatever the reason, so a client learns nothing about what exists elsewhere.
    /// </summary>
    [Fact]
    public async Task Another_universe_s_rule_is_not_readable_evaluable_or_analysable()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        foreach (var tool in new[]
                 {
                     LorEvolveMcpWorldLogicTools.GetRuleTool,
                     LorEvolveMcpWorldLogicTools.EvaluateTool,
                     LorEvolveMcpWorldLogicTools.ImpactTool,
                 })
        {
            var refused = await CallRaw(client, tool, new() { ["ruleId"] = fixture.ElsewhereRule.ToString() });
            Assert.True(refused.IsError, tool);
            Assert.Equal("not_found", refused.Error);
        }
    }

    [Fact]
    public async Task Another_universe_s_rules_findings_and_systems_are_not_listed()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var rules = await Call(client, LorEvolveMcpWorldLogicTools.ListRulesTool, new() { ["pageSize"] = 100 });
        Assert.DoesNotContain(
            rules.GetProperty("rules").EnumerateArray(),
            rule => rule.GetProperty("id").GetGuid() == fixture.ElsewhereRule);

        var systems = await Call(client, LorEvolveMcpWorldLogicTools.ListSystemsTool, new() { ["pageSize"] = 100 });
        Assert.DoesNotContain(
            systems.GetProperty("systems").EnumerateArray(),
            system => system.GetProperty("id").GetGuid() == fixture.ElsewhereSystem);

        var findings = await Call(client, LorEvolveMcpWorldLogicTools.ListFindingsTool, new() { ["pageSize"] = 100 });
        Assert.All(
            findings.GetProperty("findings").EnumerateArray(),
            row => Assert.NotEqual(fixture.ElsewhereRule, row.GetProperty("ruleId").GetGuid()));
    }

    [Fact]
    public async Task A_project_of_another_universe_cannot_be_used_to_scope_a_read()
    {
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var refused = await CallRaw(
            client,
            LorEvolveMcpWorldLogicTools.ListRulesTool,
            new() { ["projectId"] = fixture.ElsewhereProject.ToString() });

        Assert.True(refused.IsError);
        Assert.Equal("not_found", refused.Error);
    }

    // ---------- What this issue must not have changed ----------

    /// <summary>
    /// The acceptance criterion that this issue preserves the approval path. The two tools a client has always used
    /// to change a universe still answer, still stage nothing until a person approves, and a rule is still proposed
    /// through them rather than through anything added here.
    /// </summary>
    [Fact]
    public async Task Get_change_options_and_propose_changes_still_work_and_a_rule_is_still_proposed_through_them()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposing.AccessToken);

        var options = await Call(client, LorEvolveMcpProposalTools.OptionsTool, []);
        Assert.True(options.GetProperty("worldRules").EnumerateArray().Any());

        var staged = await Call(client, LorEvolveMcpProposalTools.ProposeTool, new()
        {
            ["summary"] = "Add a rule about the succession",
            ["operations"] = new object[]
            {
                new
                {
                    id = "rule-1",
                    action = "create",
                    resource = "world_rule",
                    worldRule = new { title = "The eldest inherits", description = "Unless the house says otherwise." },
                },
            },
        });

        Assert.Equal("waiting_for_review", staged.GetProperty("status").GetString());

        // Still waiting for a person: the rule is not in the universe until they approve it.
        var rules = await W.Owner.GetFromJsonAsync<WorldLogicPage<WorldLogicRuleRow>>(
            $"/api/universes/{W.U}/world-logic/rules?pageSize=100");
        Assert.DoesNotContain(rules!.Items, rule => rule.Title == "The eldest inherits");
    }

    // ---------- Helpers ----------

    private async Task<int> WaitingAsync()
    {
        var page = await W.Owner.GetFromJsonAsync<WorldLogicPage<SemanticFindingRow>>(
            $"/api/universes/{W.U}/world-logic/semantic-findings?status=0&pageSize=100");
        return page!.TotalCount;
    }

    private static async Task<JsonElement> Call(McpClient client, string tool, Dictionary<string, object?> arguments)
    {
        var result = await client.CallToolAsync(tool, arguments);
        Assert.False(result.IsError ?? false, Text(result));
        using var json = JsonDocument.Parse(Text(result));
        return json.RootElement.Clone();
    }

    /// <summary>A call that is expected to be refused, with the error code the tool answered.</summary>
    private static async Task<(bool IsError, string? Error, string Body)> CallRaw(
        McpClient client, string tool, Dictionary<string, object?> arguments)
    {
        var result = await client.CallToolAsync(tool, arguments);
        var body = Text(result);
        using var json = JsonDocument.Parse(body);
        return (
            result.IsError ?? false,
            json.RootElement.TryGetProperty("error", out var error) ? error.GetString() : null,
            body);
    }

    private static string Text(CallToolResult result) =>
        string.Concat(result.Content.OfType<TextContentBlock>().Select(block => block.Text));
}

/// <summary>
/// One shared universe with the rules, Systems and recorded findings these tools read, a read-only connection and a
/// connection the person allowed to propose, plus a second universe nothing in the first may reach. Made once for
/// the class, because the host and the OAuth dance are the expensive part.
/// </summary>
public sealed class McpWorldLogicFixture : IAsyncLifetime
{
    public LorEvolveApiFactory Api { get; } = new();

    internal SharedWorld World { get; private set; } = null!;

    /// <summary>A connection the person approved for reading only.</summary>
    internal Connection ReadOnly { get; private set; } = null!;

    /// <summary>A connection the person also ticked for proposing, which is what submitting a claim needs.</summary>
    internal Connection Proposing { get; private set; } = null!;

    /// <summary>A rule whose condition the stored lore answers false: an entry of a type no one wrote.</summary>
    public Guid ConditionRule { get; private set; }

    /// <summary>A rule that declared a dependency on <see cref="ConditionRule"/>, so impact has something to report.</summary>
    public Guid DependentRule { get; private set; }

    /// <summary>A rule written about one entry, which a sweep with no target answers unknown.</summary>
    public Guid SelfRule { get; private set; }

    /// <summary>A rule whose violation cites the universe's own entry, so a finding has real evidence.</summary>
    public Guid EvidenceRule { get; private set; }

    /// <summary>How many findings the author's sweep recorded, so a test can prove nothing else was added.</summary>
    public int SweptFindings { get; private set; }

    public Guid ElsewhereRule { get; private set; }

    public Guid ElsewhereSystem { get; private set; }

    public Guid ElsewhereEntry { get; private set; }

    public Guid ElsewhereProject { get; private set; }

    public async Task InitializeAsync()
    {
        World = await NewSharedWorld(Api, "mcpworldlogic");

        ConditionRule = await Rule("A wyvern is on record", TypeExists("Wyvern"));
        DependentRule = await Rule("And the wyvern rule holds", RuleHolds(ConditionRule), dependsOn: [ConditionRule]);
        SelfRule = await Rule("Purity floor", PurityAtLeast(2));
        EvidenceRule = await Rule("The heir is a Wyvern", EntryIsOfType(World.Entry, "Wyvern"));

        // The author's own sweep is what records a finding. Everything the MCP tools read was recorded here, by a
        // person, through the route that needs EditContent.
        var sweep = await World.Owner.PostAsync($"/api/universes/{World.U}/world-logic/findings/evaluate", null);
        sweep.EnsureSuccessStatusCode();
        SweptFindings = (await World.Owner.GetFromJsonAsync<WorldLogicPage<WorldLogicFindingRow>>(
            $"/api/universes/{World.U}/world-logic/findings"))!.TotalCount;

        // The shared world's own accounts: its Viewer for a connection that may only read, and its Editor for one
        // the person also allowed to propose, because a Viewer's role could not stage anything anyway.
        ReadOnly = await Connect(Api, await SignIn(Api, "user-mcpworldlogic-viewer"), World.U);
        Proposing = await ProposingAsync(await SignIn(Api, "user-mcpworldlogic-editor"));

        var elsewhere = (await CreateUniverse(World.Owner, "Elsewhere for world logic")).Id;
        ElsewhereRule = (await PostJson<SystemRuleDetail>(
            World.Owner,
            $"/api/universes/{elsewhere}/system-rules",
            new SystemRuleRequest("Another world's rule", "Not this connection's.", null, 1, Parse(TypeExists("Wyvern"))))).Id;
        ElsewhereSystem = (await PostJson<SystemDetail>(
            World.Owner,
            $"/api/universes/{elsewhere}/systems",
            new SystemRequest("Another world's system", "Not this connection's."))).Id;
        ElsewhereEntry = await CreateEntity(World.Owner, elsewhere, "Another world's heir");

        var project = await World.Owner.PostAsJsonAsync(
            "/api/projects",
            new
            {
                name = "Another world's project",
                kind = 0,
                lifecycle = 0,
                subtype = (string?)null,
                summary = string.Empty,
                universeId = elsewhere,
                expectedVersion = (int?)null,
            });
        project.EnsureSuccessStatusCode();
        using var created = JsonDocument.Parse(await project.Content.ReadAsStringAsync());
        ElsewhereProject = created.RootElement.GetProperty("id").GetGuid();
    }

    public Task DisposeAsync()
    {
        Api.Dispose();
        return Task.CompletedTask;
    }

    /// <summary>The whole consent flow with the app asking to propose, and the person ticking it (ADR 0047).</summary>
    private async Task<Connection> ProposingAsync(HttpClient browser)
    {
        var clientId = await RegisterPublicClient(Api.CreateClient());
        var (verifier, challenge) = Pkce();
        var request = AuthorizeRequest(
            clientId, Resource(World.U), challenge, scope: "lorevolve.read lorevolve.propose offline_access");
        request[OAuthEndpoints.ProposeField] = OAuthEndpoints.AllowProposals;

        var approved = RedirectParameters(await Decide(browser, request, "approve"));
        var tokens = await Exchange(Api.CreateClient(), clientId, approved["code"], verifier, Resource(World.U));
        Assert.Equal(HttpStatusCode.OK, tokens.Status);
        return new Connection(clientId, World.U, tokens.AccessToken!, tokens.RefreshToken!);
    }

    private async Task<Guid> Rule(string title, string condition, IReadOnlyList<Guid>? dependsOn = null) =>
        (await PostJson<SystemRuleDetail>(
            World.Owner,
            $"/api/universes/{World.U}/system-rules",
            new SystemRuleRequest(title, null, null, 1, Parse(condition), dependsOn))).Id;

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static string TypeExists(string type) =>
        "{\"kind\":\"exists\",\"query\":{\"from\":\"subjects\",\"where\":[{\"field\":\"type\",\"op\":\"eq\",\"value\":\""
        + type + "\",\"type\":\"text\"}]}}";

    private static string EntryIsOfType(Guid entry, string type) =>
        "{\"kind\":\"compare\",\"left\":{\"field\":\"type\",\"from\":\"subjects\",\"of\":{\"subject\":\""
        + entry + "\"}},\"op\":\"eq\",\"right\":{\"literal\":\"" + type + "\",\"type\":\"text\"}}";

    private static string RuleHolds(Guid ruleId) =>
        "{\"kind\":\"ruleHolds\",\"ruleId\":\"" + ruleId + "\"}";

    private static string PurityAtLeast(int floor) =>
        "{\"kind\":\"compare\",\"left\":{\"attribute\":\"Purity\",\"of\":{\"subject\":\"self\"}},"
        + $"\"op\":\"gte\",\"right\":{{\"literal\":{floor},\"type\":\"number\"}}}}";
}
