using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Mcp;
using LorEvolve.Api.Features.Systems;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.McpTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// World Logic rule definitions and Systems staged through AI Changes review (ADR 0072 addendum,
/// <c>docs/architecture/audits/2026-11-15-systems-and-rules-through-review-plan.md</c>): proposed over MCP, approved by a
/// person, and written through the routes' own create, update, link and unlink, so what lands is what the API would
/// have left. Nothing is written at staging, an author's later edit is never overwritten, and neither resource is removed.
/// </summary>
public sealed class McpWorldLogicProposalTests(McpWorldLogicFixture fixture) : IClassFixture<McpWorldLogicFixture>
{
    private LorEvolveApiFactory Api => fixture.Api;

    private SharedWorld W => fixture.World;

    [Fact]
    public async Task One_proposal_creates_two_rules_and_a_system_linking_both_by_ref_and_approval_writes_them_as_the_api_would()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposing.AccessToken);

        var staged = await Call(client, LorEvolveMcpProposalTools.ProposeTool, new()
        {
            ["summary"] = "Rune fusion",
            ["operations"] = new object[]
            {
                new
                {
                    id = "fusion-base",
                    action = "create",
                    resource = "system_rule",
                    systemRule = new { title = "A rune is on record", description = "Fusion needs one.", condition = Parse(TypeExists("Rune")) },
                },
                new
                {
                    id = "fusion-pair",
                    action = "create",
                    resource = "world_logic_rule",
                    systemRule = new { title = "Two runes fuse", dependsOn = new object[] { new { @ref = "fusion-base" } } },
                },
                new
                {
                    id = "fusion",
                    action = "create",
                    resource = "system",
                    system = new
                    {
                        name = "Rune fusion",
                        summary = "How runes combine.",
                        ruleIds = new object[] { new { @ref = "fusion-base" }, new { @ref = "fusion-pair" } },
                    },
                },
            },
        });

        Assert.Equal("waiting_for_review", staged.GetProperty("status").GetString());
        var proposalId = staged.GetProperty("proposalId").GetGuid();

        // Staging wrote nothing: the System is not in the universe until a person approves it.
        Assert.False(await InDbAsync(db => db.LoreSystems.AnyAsync(system => system.UniverseId == W.U && system.Name == "Rune fusion")));

        var receipt = await ApproveAll(W.Owner, W.U, proposalId);
        Guid Made(string key) => receipt.Applied.Single(line => line.Key == key).ResultId!.Value;
        var systemId = Made("fusion");
        var baseId = Made("fusion-base");
        var pairId = Made("fusion-pair");

        var system = await W.Owner.GetFromJsonAsync<SystemDetail>($"/api/universes/{W.U}/systems/{systemId}");
        Assert.Equal("Rune fusion", system!.Name);
        Assert.Equal("How runes combine.", system.Summary);
        Assert.Equal(WorldLogicScope.Universe, system.Scope);
        Assert.Equal(1, system.Version);
        Assert.Equal([baseId, pairId], system.Rules.Select(rule => rule.Id));

        var pair = await W.Owner.GetFromJsonAsync<SystemRuleDetail>($"/api/universes/{W.U}/system-rules/{pairId}");
        Assert.Equal([baseId], pair!.DependsOn);
        Assert.Equal(1, pair.Version);
        Assert.Null(pair.Condition);

        var basis = await W.Owner.GetFromJsonAsync<SystemRuleDetail>($"/api/universes/{W.U}/system-rules/{baseId}");
        Assert.Equal(ConditionSchema.CurrentVersion, basis!.SchemaVersion);
        Assert.NotNull(basis.Condition);

        // One revision each, as a create through the API writes, and the links in the list's order.
        Assert.Equal(1, await InDbAsync(db => db.LoreSystemRevisions.CountAsync(revision => revision.SystemId == systemId)));
        Assert.Equal(1, await InDbAsync(db => db.SystemRuleRevisions.CountAsync(revision => revision.RuleId == baseId)));
        Assert.Equal(1, await InDbAsync(db => db.SystemRuleRevisions.CountAsync(revision => revision.RuleId == pairId)));
        Assert.Equal(
            [0, 1],
            await InDbAsync(db => db.LoreSystemRules.Where(link => link.SystemId == systemId).OrderBy(link => link.SortOrder).Select(link => link.SortOrder).ToListAsync()));
    }

    [Fact]
    public async Task Approving_the_system_before_its_rules_is_refused_and_rejecting_a_rule_leaves_the_system_unlinked()
    {
        var proposalId = await Staged(
            Api,
            W.U,
            W.EditorId,
            NewRule("forge-heat", "Forging needs heat"),
            new AiChangeOperationInput("forge", "create", "system", System: new AiSystemInput("Runeforging", RuleIds: [Ref("forge-heat")])));

        var proposal = await Read(W.Owner, W.U, proposalId);
        var early = await Approve(W.Owner, W.U, proposal, ["forge"]);
        Assert.Equal(HttpStatusCode.Conflict, early.StatusCode);
        Assert.Equal(AiChangeCodes.MissingDependency, await Code(early));
        Assert.False(await InDbAsync(db => db.LoreSystems.AnyAsync(system => system.UniverseId == W.U && system.Name == "Runeforging")));

        // An existing System asked to reference a rule this proposal creates: rejecting the rule rejects the link with it.
        var existing = await NewSystemAsync("Aura and transformations");
        var second = await Staged(
            Api,
            W.U,
            W.EditorId,
            NewRule("aura-calm", "An aura stays calm"),
            new AiChangeOperationInput("aura", "update", "system", existing, System: new AiSystemInput(RuleIds: [Ref("aura-calm")])));

        var read = await Read(W.Owner, W.U, second);
        (await Reject(W.Owner, W.U, second, [Op(read, "aura-calm")])).EnsureSuccessStatusCode();

        read = await Read(W.Owner, W.U, second);
        Assert.All(read.Operations, operation => Assert.Equal(AiChangeOperationStatus.Rejected, operation.Status));
        Assert.False(await InDbAsync(db => db.LoreSystemRules.AnyAsync(link => link.SystemId == existing)));
        Assert.False(await InDbAsync(db => db.SystemRules.AnyAsync(rule => rule.UniverseId == W.U && rule.Title == "An aura stays calm")));
    }

    [Fact]
    public async Task An_update_changes_a_system_s_rule_list_by_difference_one_link_and_one_unlink()
    {
        var kept = await NewRuleAsync("Weapons gain levels");
        var dropped = await NewRuleAsync("Weapons rust");
        var added = await NewRuleAsync("Weapons bond to one wielder");
        var system = await NewSystemAsync("Weapon progression");
        await LinkAsync(system, dropped, 0);
        await LinkAsync(system, kept, 1);

        var proposalId = await Staged(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("weapons", "update", "system", system, System: new AiSystemInput(RuleIds: [Id(kept), Id(added)])));
        await ApproveAll(W.Owner, W.U, proposalId);

        var links = await InDbAsync(db => db.LoreSystemRules.Where(link => link.SystemId == system).OrderBy(link => link.SortOrder).Select(link => link.RuleId).ToListAsync());
        Assert.Equal([kept, added], links);

        // The unlinked rule stands, and the System's own words did not change, so neither did its version.
        Assert.True(await InDbAsync(db => db.SystemRules.AnyAsync(rule => rule.Id == dropped)));
        var detail = await W.Owner.GetFromJsonAsync<SystemDetail>($"/api/universes/{W.U}/systems/{system}");
        Assert.Equal(1, detail!.Version);
        Assert.Equal(1, await InDbAsync(db => db.LoreSystemRevisions.CountAsync(revision => revision.SystemId == system)));
    }

    [Fact]
    public async Task An_author_edit_after_staging_fails_the_change_as_changed_and_writes_nothing()
    {
        var rule = await NewRuleAsync("Runes are classified by colour");
        var proposalId = await Staged(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("classify", "update", "system_rule", rule, SystemRule: new AiSystemRuleInput(Title: "Runes are classified by shape")));

        var proposal = await Read(W.Owner, W.U, proposalId);

        // The author saves the rule by hand after the AI read it.
        (await W.Owner.PutAsJsonAsync(
            $"/api/universes/{W.U}/system-rules/{rule}",
            new SystemRuleRequest("Runes are classified by weight", null, ExpectedVersion: 1))).EnsureSuccessStatusCode();

        var refused = await Approve(W.Owner, W.U, proposal, ["classify"]);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains(AiChangeCodes.ChangedSince, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var detail = await W.Owner.GetFromJsonAsync<SystemRuleDetail>($"/api/universes/{W.U}/system-rules/{rule}");
        Assert.Equal("Runes are classified by weight", detail!.Title);
        Assert.Equal(2, detail.Version);
    }

    [Fact]
    public async Task A_malformed_condition_a_cycle_another_universe_s_rule_or_project_is_refused_at_staging()
    {
        var malformed = await Stage(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("bad", "create", "system_rule", SystemRule: new AiSystemRuleInput("Bad", Condition: Parse("{\"kind\":\"nonsense\"}"))));
        Assert.Contains(malformed.Issues, issue => issue.Code == AiChangeCodes.Invalid && issue.Field == SystemRuleEndpoints.ConditionField);

        // A cycle among the proposal's own rules, and one closed through a rule that already depends on another.
        var refs = await Stage(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("a", "create", "system_rule", SystemRule: new AiSystemRuleInput("A", DependsOn: [Ref("b")])),
            new AiChangeOperationInput("b", "create", "system_rule", SystemRule: new AiSystemRuleInput("B", DependsOn: [Ref("a")])));
        Assert.Contains(refs.Issues, issue => issue.Code == AiChangeCodes.Cycle);

        var stored = await Stage(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("loop", "update", "system_rule", fixture.ConditionRule, SystemRule: new AiSystemRuleInput(DependsOn: [Id(fixture.DependentRule)])));
        Assert.Contains(stored.Issues, issue => issue.Field == "dependsOn" && issue.Message.Contains("dependency_cycle", StringComparison.Ordinal));

        var elsewhereRule = await Stage(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("borrow", "create", "system", System: new AiSystemInput("Borrowed", RuleIds: [Id(fixture.ElsewhereRule)])));
        Assert.Contains(elsewhereRule.Issues, issue => issue.Code == AiChangeCodes.NotFound && issue.Field == "ruleIds");

        var elsewhereProject = await Stage(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("stray", "create", "system_rule", SystemRule: new AiSystemRuleInput("Stray", ProjectId: fixture.ElsewhereProject)));
        Assert.Contains(elsewhereProject.Issues, issue => issue.Code == AiChangeCodes.NotFound && issue.Field == "projectId");

        foreach (var staged in new[] { malformed, refs, stored, elsewhereRule, elsewhereProject })
        {
            Assert.Null(staged.Proposal);
        }
    }

    [Fact]
    public async Task Remove_is_refused_at_staging_for_a_system_and_a_rule_definition()
    {
        var rule = await NewRuleAsync("Nothing removes me");
        var system = await NewSystemAsync("Nothing removes this either");

        foreach (var (resource, target) in new[] { ("system_rule", rule), ("system", system) })
        {
            var staged = await Stage(Api, W.U, W.EditorId, Remove("gone", resource, target));
            Assert.Null(staged.Proposal);
            Assert.Contains(staged.Issues, issue => issue.Code == AiChangeCodes.Unsupported);
        }

        Assert.True(await InDbAsync(db => db.SystemRules.AnyAsync(row => row.Id == rule)));
        Assert.True(await InDbAsync(db => db.LoreSystems.AnyAsync(row => row.Id == system)));
    }

    [Fact]
    public async Task An_approver_without_world_logic_change_rights_gets_the_endpoint_s_refusal()
    {
        var proposalId = await Staged(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("seal", "create", "system", System: new AiSystemInput("Sealing")));
        var proposal = await Read(W.Owner, W.U, proposalId);

        // What the System route answers this person, and what an approval answers them, are one refusal.
        var direct = await W.Reviewer.PostAsJsonAsync($"/api/universes/{W.U}/systems", new SystemRequest("Sealing by hand", null));
        var approval = await Approve(W.Reviewer, W.U, proposal, ["seal"]);

        Assert.Equal(HttpStatusCode.Forbidden, direct.StatusCode);
        Assert.Equal(direct.StatusCode, approval.StatusCode);
        Assert.False(await InDbAsync(db => db.LoreSystems.AnyAsync(system => system.UniverseId == W.U && system.Name.StartsWith("Sealing"))));
    }

    // ---------- A System's state machine (#361) ----------

    [Fact]
    public async Task A_machine_proposed_by_ref_changes_nothing_until_approved_and_then_matches_a_put()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposing.AccessToken);

        var staged = await Call(client, LorEvolveMcpProposalTools.ProposeTool, new()
        {
            ["summary"] = "The tide",
            ["operations"] = new object[]
            {
                new { id = "tides", action = "create", resource = "system", system = new { name = "Tides" } },
                new
                {
                    id = "low",
                    action = "create",
                    resource = "system_state",
                    systemState = new { system = new { @ref = "tides" }, name = "Low tide", value = "low", subjectType = "Coast", attribute = "Tide" },
                },
                new
                {
                    id = "high",
                    action = "create",
                    resource = "system_state",
                    systemState = new { system = new { @ref = "tides" }, name = "High tide", value = "high" },
                },
                new { id = "moon", action = "create", resource = "system_rule", systemRule = new { title = "The moon is full" } },
                new
                {
                    id = "rise",
                    action = "create",
                    resource = "system_transition",
                    systemTransition = new
                    {
                        system = new { @ref = "tides" },
                        from = new { @ref = "low" },
                        to = new { @ref = "high" },
                        label = "Rising",
                        guard = new { @ref = "moon" },
                    },
                },
            },
        });

        Assert.Equal("waiting_for_review", staged.GetProperty("status").GetString());
        var proposalId = staged.GetProperty("proposalId").GetGuid();

        // Staging wrote nothing: no System, so no machine, until a person approves it.
        Assert.False(await InDbAsync(db => db.LoreSystems.AnyAsync(system => system.UniverseId == W.U && system.Name == "Tides")));

        var receipt = await ApproveAll(W.Owner, W.U, proposalId);
        Guid Made(string key) => receipt.Applied.Single(line => line.Key == key).ResultId!.Value;
        var systemId = Made("tides");

        var machine = (await W.Owner.GetFromJsonAsync<SystemMachineDetail>($"/api/universes/{W.U}/systems/{systemId}/machine"))!;
        Assert.Equal(new SystemMachineBinding("Coast", "Tide"), machine.Binding);
        Assert.Equal([Made("low"), Made("high")], machine.States.Select(state => state.Id));
        Assert.Equal(["low", "high"], machine.States.Select(state => state.Value));
        Assert.Equal([true, false], machine.States.Select(state => state.Initial));
        var transition = Assert.Single(machine.Transitions);
        Assert.Equal(new SystemMachineTransition(Made("rise"), Made("low"), Made("high"), "Rising", Made("moon")), transition);

        // What landed is exactly what the route keeps: saving it back through PUT changes nothing, not even the version.
        var put = await W.Owner.PutAsJsonAsync(
            $"/api/universes/{W.U}/systems/{systemId}/machine",
            new SystemMachineRequest(machine.SchemaVersion, machine.Binding, machine.States, machine.Transitions, machine.Version));
        put.EnsureSuccessStatusCode();
        var saved = (await put.Content.ReadFromJsonAsync<SystemMachineDetail>())!;
        Assert.Equal(machine.Version, saved.Version);
        Assert.Equal(machine.States, saved.States);
        Assert.Equal(machine.Transitions, saved.Transitions);
    }

    [Fact]
    public async Task A_state_update_replaces_it_by_id_and_initial_moves_the_flag()
    {
        var (system, calm, stormy, rising) = await NewMachineAsync("Weather at the cape");

        var proposalId = await Staged(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("storm", "update", "system_state", stormy, SystemState: new AiSystemStateInput(Id(system), Name: "Storm", Initial: true)));
        await ApproveAll(W.Owner, W.U, proposalId);

        var machine = await MachineAsync(system);
        Assert.Equal(new SystemMachineState(calm, "Calm", "calm", false, 0, 0), machine.States[0]);
        Assert.Equal(new SystemMachineState(stormy, "Storm", "stormy", true, 240, 0), machine.States[1]);
        Assert.Equal(rising, Assert.Single(machine.Transitions).Id);
    }

    [Fact]
    public async Task A_transition_update_changes_label_and_guard_and_removeGuard_clears_it()
    {
        var (system, calm, stormy, rising) = await NewMachineAsync("Weather in the strait");
        var gale = await NewRuleAsync("A gale is blowing");

        var guarded = await Staged(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("gale", "update", "system_transition", rising, SystemTransition: new AiSystemTransitionInput(Id(system), Label: "Gale", Guard: Id(gale))));
        await ApproveAll(W.Owner, W.U, guarded);
        Assert.Equal(new SystemMachineTransition(rising, calm, stormy, "Gale", gale), Assert.Single((await MachineAsync(system)).Transitions));

        var cleared = await Staged(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("calm-down", "update", "system_transition", rising, SystemTransition: new AiSystemTransitionInput(Id(system), RemoveGuard: true)));
        await ApproveAll(W.Owner, W.U, cleared);
        Assert.Equal(new SystemMachineTransition(rising, calm, stormy, "Gale", null), Assert.Single((await MachineAsync(system)).Transitions));
    }

    [Fact]
    public async Task Machine_refusals_at_staging_carry_the_specification_s_codes()
    {
        var empty = await NewSystemAsync("A System with no machine");
        var (system, calm, stormy, _) = await NewMachineAsync("Weather on the reef");
        var (other, otherCalm, _, _) = await NewMachineAsync("Weather in the harbour");
        var project = await NewProjectAsync("A comic of the reef");

        async Task Refused(string code, params AiChangeOperationInput[] operations)
        {
            var staged = await Stage(Api, W.U, W.EditorId, operations);
            Assert.Null(staged.Proposal);
            Assert.Contains(staged.Issues, issue => issue.Code == code);
        }

        AiChangeOperationInput State(Guid onto, AiSystemStateInput state) => new("state", "create", "system_state", SystemState: state with { System = Id(onto) });
        AiChangeOperationInput Transition(AiSystemTransitionInput transition) =>
            new("transition", "create", "system_transition", SystemTransition: transition with { System = Id(system) });

        await Refused(SystemMachineEndpoints.BindingRequiredCode, State(empty, new AiSystemStateInput(Name: "First", Value: "first")));
        await Refused(SystemMachineEndpoints.DuplicateStateValueCode, State(system, new AiSystemStateInput(Name: "Calm again", Value: "calm")));
        await Refused(SystemMachineEndpoints.UnknownStateCode, Transition(new AiSystemTransitionInput(From: Id(calm), To: Id(otherCalm))));
        await Refused(SystemMachineEndpoints.SelfTransitionCode, Transition(new AiSystemTransitionInput(From: Id(calm), To: Id(calm))));
        await Refused(SystemMachineEndpoints.GuardRuleNotFoundCode, Transition(new AiSystemTransitionInput(From: Id(calm), To: Id(stormy), Guard: Id(fixture.ElsewhereRule))));

        // A guard this proposal creates is held to the System's scope as a stored one is.
        await Refused(
            SystemMachineEndpoints.GuardScopeMismatchCode,
            new AiChangeOperationInput("reef-rule", "create", "system_rule", SystemRule: new AiSystemRuleInput("Only in the comic", ProjectId: project)),
            Transition(new AiSystemTransitionInput(From: Id(calm), To: Id(stormy), Guard: Ref("reef-rule"))));

        // A second binding, and an initial state switched off rather than moved.
        await Refused(AiChangeCodes.Invalid, State(system, new AiSystemStateInput(Name: "Fog", Value: "fog", SubjectType: "Sea", Attribute: "Weather")));
        await Refused(
            AiChangeCodes.Invalid,
            new AiChangeOperationInput("off", "update", "system_state", calm, SystemState: new AiSystemStateInput(Id(system), Initial: false)));

        Assert.Equal(2, (await MachineAsync(system)).States.Count);
        Assert.Equal(2, (await MachineAsync(other)).States.Count);
        Assert.Null((await MachineAsync(empty)).Binding);
    }

    [Fact]
    public async Task An_author_machine_save_after_staging_fails_the_change_as_changed_since()
    {
        var (system, calm, stormy, rising) = await NewMachineAsync("Weather over the dunes");
        var proposalId = await Staged(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("squall", "create", "system_state", SystemState: new AiSystemStateInput(Id(system), "Squall", "squall")));
        var proposal = await Read(W.Owner, W.U, proposalId);

        // The author saves the machine by hand after the AI read it.
        (await W.Owner.PutAsJsonAsync(
            $"/api/universes/{W.U}/systems/{system}/machine",
            new SystemMachineRequest(
                SystemMachineEndpoints.SchemaVersion,
                new SystemMachineBinding("Sea", "Weather"),
                [new SystemMachineState(calm, "Still", "calm", true, 0, 0), new SystemMachineState(stormy, "Stormy", "stormy", false, 240, 0)],
                [new SystemMachineTransition(rising, calm, stormy, "Rising wind", null)],
                2))).EnsureSuccessStatusCode();

        var refused = await Approve(W.Owner, W.U, proposal, ["squall"]);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains(AiChangeCodes.ChangedSince, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var machine = await MachineAsync(system);
        Assert.Equal(["Still", "Stormy"], machine.States.Select(state => state.Name));
        Assert.Equal(3, machine.Version);
    }

    [Fact]
    public async Task A_guard_deleted_after_staging_is_refused_at_approval_and_nothing_is_written()
    {
        var (system, calm, stormy, rising) = await NewMachineAsync("Weather past the lighthouse");
        var guard = await NewRuleAsync("The lamp is lit");
        var proposalId = await Staged(
            Api,
            W.U,
            W.EditorId,
            new AiChangeOperationInput("back", "create", "system_transition", SystemTransition: new AiSystemTransitionInput(Id(system), Id(stormy), Id(calm), Guard: Id(guard))));
        var proposal = await Read(W.Owner, W.U, proposalId);

        // Nothing names the rule yet but the proposal, so the author may delete it.
        Assert.Equal(HttpStatusCode.NoContent, (await W.Owner.DeleteAsync($"/api/universes/{W.U}/system-rules/{guard}")).StatusCode);

        var refused = await Approve(W.Owner, W.U, proposal, ["back"]);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains(SystemMachineEndpoints.GuardRuleNotFoundCode, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var machine = await MachineAsync(system);
        Assert.Equal(rising, Assert.Single(machine.Transitions).Id);
        Assert.Equal(2, machine.Version);
    }

    [Fact]
    public async Task Remove_is_refused_at_staging_for_a_state_and_a_transition()
    {
        var (system, calm, _, rising) = await NewMachineAsync("Weather nobody removes");

        foreach (var (resource, target) in new[] { ("system_state", calm), ("system_transition", rising) })
        {
            var staged = await Stage(Api, W.U, W.EditorId, Remove("gone", resource, target));
            Assert.Null(staged.Proposal);
            Assert.Contains(staged.Issues, issue => issue.Code == AiChangeCodes.Unsupported);
        }

        var machine = await MachineAsync(system);
        Assert.Equal(2, machine.States.Count);
        Assert.Single(machine.Transitions);
    }

    [Fact]
    public async Task A_read_only_connection_cannot_propose_a_state_or_a_transition()
    {
        var (system, calm, stormy, _) = await NewMachineAsync("Weather read only");
        await using var client = await SdkClient(Api, W.U, fixture.ReadOnly.AccessToken);

        var result = await client.CallToolAsync(LorEvolveMcpProposalTools.ProposeTool, new Dictionary<string, object?>
        {
            ["summary"] = "Not allowed",
            ["operations"] = new object[]
            {
                new { id = "fog", action = "create", resource = "system_state", systemState = new { system = new { id = system }, name = "Fog", value = "fog" } },
                new { id = "lift", action = "create", resource = "system_transition", systemTransition = new { system = new { id = system }, from = new { id = stormy }, to = new { id = calm } } },
            },
        });

        Assert.True(result.IsError);
        Assert.Contains("not_allowed", string.Concat(result.Content.OfType<TextContentBlock>().Select(block => block.Text)), StringComparison.Ordinal);
        var machine = await MachineAsync(system);
        Assert.Equal(2, machine.States.Count);
        Assert.Single(machine.Transitions);
    }

    [Fact]
    public async Task Get_change_options_offers_create_and_update_for_states_and_transitions()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Proposing.AccessToken);

        var allowed = (await Call(client, LorEvolveMcpProposalTools.OptionsTool, []))
            .GetProperty("allowed").EnumerateArray().Select(item => item.GetString()).ToList();

        Assert.Contains("create system_state", allowed);
        Assert.Contains("update system_state", allowed);
        Assert.Contains("create system_transition", allowed);
        Assert.Contains("update system_transition", allowed);
        Assert.DoesNotContain("remove system_state", allowed);
        Assert.DoesNotContain("remove system_transition", allowed);
    }

    // ---------- Helpers ----------

    /// <summary>A new System with a machine saved through its route: calm (initial) and stormy, joined by one transition.</summary>
    private async Task<(Guid System, Guid Calm, Guid Stormy, Guid Rising)> NewMachineAsync(string name)
    {
        var system = await NewSystemAsync(name);
        var (calm, stormy, rising) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        (await W.Owner.PutAsJsonAsync(
            $"/api/universes/{W.U}/systems/{system}/machine",
            new SystemMachineRequest(
                SystemMachineEndpoints.SchemaVersion,
                new SystemMachineBinding("Sea", "Weather"),
                [new SystemMachineState(calm, "Calm", "calm", true, 0, 0), new SystemMachineState(stormy, "Stormy", "stormy", false, 240, 0)],
                [new SystemMachineTransition(rising, calm, stormy, "Rising wind", null)],
                1))).EnsureSuccessStatusCode();
        return (system, calm, stormy, rising);
    }

    private async Task<SystemMachineDetail> MachineAsync(Guid system) =>
        (await W.Owner.GetFromJsonAsync<SystemMachineDetail>($"/api/universes/{W.U}/systems/{system}/machine"))!;

    private async Task<Guid> NewProjectAsync(string name)
    {
        var created = await W.Owner.PostAsJsonAsync(
            "/api/projects",
            new { name, kind = 0, lifecycle = 0, subtype = (string?)null, summary = string.Empty, universeId = W.U, expectedVersion = (int?)null });
        created.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("id").GetGuid();
    }

    private static AiChangeOperationInput NewRule(string key, string title) =>
        new(key, "create", "system_rule", SystemRule: new AiSystemRuleInput(title));

    private async Task<Guid> NewRuleAsync(string title) =>
        (await PostJson<SystemRuleDetail>(W.Owner, $"/api/universes/{W.U}/system-rules", new SystemRuleRequest(title, null))).Id;

    private async Task<Guid> NewSystemAsync(string name) =>
        (await PostJson<SystemDetail>(W.Owner, $"/api/universes/{W.U}/systems", new SystemRequest(name, null))).Id;

    private async Task LinkAsync(Guid system, Guid rule, int sortOrder) =>
        (await W.Owner.PutAsync($"/api/universes/{W.U}/systems/{system}/rules/{rule}?sortOrder={sortOrder}", null)).EnsureSuccessStatusCode();

    private async Task<T> InDbAsync<T>(Func<LorEvolveDbContext, Task<T>> read)
    {
        using var scope = Api.Services.CreateScope();
        return await read(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>());
    }

    private static async Task<JsonElement> Call(McpClient client, string tool, Dictionary<string, object?> arguments)
    {
        var result = await client.CallToolAsync(tool, arguments);
        var text = string.Concat(result.Content.OfType<TextContentBlock>().Select(block => block.Text));
        Assert.False(result.IsError ?? false, text);
        using var json = JsonDocument.Parse(text);
        return json.RootElement.Clone();
    }

    private static string TypeExists(string type) =>
        "{\"kind\":\"exists\",\"query\":{\"from\":\"subjects\",\"where\":[{\"field\":\"type\",\"op\":\"eq\",\"value\":\""
        + type + "\",\"type\":\"text\"}]}}";

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}
