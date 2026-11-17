using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Systems;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A System's state machine, stored and served whole (#357, ADR 0073, state machine specification, sections 2 and 3).
///
/// <para>The things that would be silently wrong: a machine that comes back in a different order or at a different
/// place on the canvas, a save written over a newer one, a guard that names a rule of another universe or another
/// project, and a rule deleted out from under a transition that still names it. Every refusal the specification
/// names has a test here, and each one checks the code a client reads, not only the status.</para>
/// </summary>
public sealed class WorldLogicMachineTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_machine_round_trips_through_put_and_get_with_positions_and_order()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmround");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var rule = await CreateRule(client, universe.Id, "Masterwork");

        // Listed out of value order on purpose, and with positions that are not whole numbers.
        var states = new List<SystemMachineState>
        {
            new(Guid.NewGuid(), "Master", "master", false, 320.5, -12.25),
            new(Guid.NewGuid(), "Novice", "novice", true, 0, 0),
            new(Guid.NewGuid(), "Journeyman", "journeyman", false, 160, 80),
        };
        var transitions = new List<SystemMachineTransition>
        {
            new(Guid.NewGuid(), states[2].Id, states[0].Id, "Raised", rule.Id),
            new(Guid.NewGuid(), states[1].Id, states[2].Id, null, null),
        };

        var saved = await PutJson<SystemMachineDetail>(
            client,
            Machine(universe.Id, system.Id),
            new SystemMachineRequest(1, new SystemMachineBinding("member", "rank"), states, transitions, system.Version));

        var read = (await client.GetFromJsonAsync<SystemMachineDetail>(Machine(universe.Id, system.Id)))!;

        Assert.Equal(system.Id, read.SystemId);
        Assert.Equal(saved.Version, read.Version);
        Assert.Equal(1, read.SchemaVersion);
        Assert.Equal(new SystemMachineBinding("member", "rank"), read.Binding);
        Assert.Equal(states, read.States);
        Assert.Equal(transitions, read.Transitions);
    }

    [Fact]
    public async Task A_system_without_a_machine_reads_as_empty()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmempty");
        var system = await CreateSystem(client, universe.Id, "Plain");

        var read = (await client.GetFromJsonAsync<SystemMachineDetail>(Machine(universe.Id, system.Id)))!;

        Assert.Equal(system.Version, read.Version);
        Assert.Equal(1, read.SchemaVersion);
        Assert.Null(read.Binding);
        Assert.Empty(read.States);
        Assert.Empty(read.Transitions);
    }

    [Fact]
    public async Task A_save_bumps_the_version_and_an_unchanged_save_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmversion");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var request = TwoStates(system.Version);

        var first = await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), request);
        Assert.Equal(system.Version + 1, first.Version);

        // The same document again, with a name that differs only by the spaces a save trims.
        var same = request with
        {
            States = [request.States![0] with { Name = "  Novice  " }, request.States[1]],
            ExpectedVersion = first.Version,
        };
        var unchanged = await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), same);
        Assert.Equal(first.Version, unchanged.Version);

        // The System itself moved on with the machine, and wrote no revision for it.
        var detail = (await client.GetFromJsonAsync<SystemDetail>(System(universe.Id, system.Id)))!;
        Assert.Equal(first.Version, detail.Version);
        var revisions = (await client.GetFromJsonAsync<List<WorldLogicRevisionRow>>($"{System(universe.Id, system.Id)}/revisions"))!;
        Assert.Equal([1], revisions.Select(revision => revision.Version));
    }

    [Fact]
    public async Task A_stale_expected_version_is_refused_with_system_changed()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmstale");
        var system = await CreateSystem(client, universe.Id, "Rank");
        await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), TwoStates(system.Version));

        var stale = await client.PutAsJsonAsync(Machine(universe.Id, system.Id), Empty(system.Version));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains(SystemEndpoints.ChangedCode, await stale.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var missing = await client.PutAsJsonAsync(Machine(universe.Id, system.Id), Empty(null));
        Assert.Equal(HttpStatusCode.Conflict, missing.StatusCode);

        var read = (await client.GetFromJsonAsync<SystemMachineDetail>(Machine(universe.Id, system.Id)))!;
        Assert.Equal(2, read.States.Count);
    }

    [Fact]
    public async Task An_empty_machine_removes_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmremove");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var saved = await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), TwoStates(system.Version));

        var removed = await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), Empty(saved.Version));

        Assert.Equal(saved.Version + 1, removed.Version);
        Assert.Null(removed.Binding);
        Assert.Empty(removed.States);

        await WithDb(_factory, async db =>
        {
            Assert.Equal(0, await db.SystemMachines.CountAsync(machine => machine.SystemId == system.Id));
            Assert.Equal(0, await db.SystemStates.CountAsync(state => state.SystemId == system.Id));
            Assert.Equal(0, await db.SystemTransitions.CountAsync(transition => transition.SystemId == system.Id));
        });
    }

    [Fact]
    public async Task Binding_required()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmbinding");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var request = TwoStates(system.Version);

        await AssertRefused(client, universe.Id, system.Id, request with { Binding = null }, "binding", SystemMachineEndpoints.BindingRequiredCode);
        await AssertRefused(
            client, universe.Id, system.Id, request with { Binding = new("member", " ") }, "binding.attribute", SystemMachineEndpoints.BindingRequiredCode);
        await AssertRefused(
            client, universe.Id, system.Id, request with { Binding = new(null, "rank") }, "binding.subjectType", SystemMachineEndpoints.BindingRequiredCode);
    }

    [Fact]
    public async Task Machine_state_limit()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmstatelimit");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var states = Enumerable.Range(0, WorldLogicLimits.MaxStates + 1)
            .Select(index => new SystemMachineState(Guid.NewGuid(), $"State {index}", $"s{index}", index == 0, index, 0))
            .ToList();

        await AssertRefused(
            client,
            universe.Id,
            system.Id,
            new SystemMachineRequest(1, Binding, states, [], system.Version),
            "states",
            SystemMachineEndpoints.StateLimitCode);

        // Exactly at the limit saves.
        await PutJson<SystemMachineDetail>(
            client, Machine(universe.Id, system.Id), new SystemMachineRequest(1, Binding, [.. states.Take(WorldLogicLimits.MaxStates)], [], system.Version));
    }

    [Fact]
    public async Task Machine_transition_limit()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmtranslimit");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var request = TwoStates(system.Version);
        var from = request.States![0].Id;
        var to = request.States[1].Id;
        var transitions = Enumerable.Range(0, WorldLogicLimits.MaxTransitions + 1)
            .Select(_ => new SystemMachineTransition(Guid.NewGuid(), from, to, null, null))
            .ToList();

        await AssertRefused(
            client, universe.Id, system.Id, request with { Transitions = transitions }, "transitions", SystemMachineEndpoints.TransitionLimitCode);

        await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), request with { Transitions = [.. transitions.Take(WorldLogicLimits.MaxTransitions)] });
    }

    [Fact]
    public async Task Initial_state_required_for_zero_and_two()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlminitial");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var request = TwoStates(system.Version);
        var states = request.States!;

        await AssertRefused(
            client,
            universe.Id,
            system.Id,
            request with { States = [states[0] with { Initial = false }, states[1]] },
            "states",
            SystemMachineEndpoints.InitialStateRequiredCode);

        await AssertRefused(
            client,
            universe.Id,
            system.Id,
            request with { States = [states[0], states[1] with { Initial = true }] },
            "states",
            SystemMachineEndpoints.InitialStateRequiredCode);
    }

    [Fact]
    public async Task Duplicate_state_value()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmduplicate");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var request = TwoStates(system.Version);
        var states = request.States!;

        await AssertRefused(
            client,
            universe.Id,
            system.Id,
            request with { States = [states[0], states[1] with { Value = "novice" }] },
            "states[1].value",
            SystemMachineEndpoints.DuplicateStateValueCode);

        // Compared exactly: a value that differs only by case is another state.
        await PutJson<SystemMachineDetail>(
            client, Machine(universe.Id, system.Id), request with { States = [states[0], states[1] with { Value = "Novice" }] });
    }

    [Fact]
    public async Task Unknown_state()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmunknown");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var request = TwoStates(system.Version);
        var known = request.States![0].Id;

        await AssertRefused(
            client,
            universe.Id,
            system.Id,
            request with { Transitions = [new(Guid.NewGuid(), Guid.NewGuid(), known, null, null)] },
            "transitions[0].fromStateId",
            SystemMachineEndpoints.UnknownStateCode);

        await AssertRefused(
            client,
            universe.Id,
            system.Id,
            request with { Transitions = [new(Guid.NewGuid(), known, Guid.NewGuid(), null, null)] },
            "transitions[0].toStateId",
            SystemMachineEndpoints.UnknownStateCode);
    }

    [Fact]
    public async Task Self_transition()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmself");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var request = TwoStates(system.Version);
        var state = request.States![1].Id;

        await AssertRefused(
            client,
            universe.Id,
            system.Id,
            request with { Transitions = [new(Guid.NewGuid(), state, state, null, null)] },
            "transitions[0].toStateId",
            SystemMachineEndpoints.SelfTransitionCode);
    }

    [Fact]
    public async Task Guard_rule_not_found_for_missing_and_foreign_rule()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmguardmissing");
        var other = await CreateUniverse(client, "World wlmguardmissing second");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var foreign = await CreateRule(client, other.Id, "Theirs");

        await AssertRefused(
            client, universe.Id, system.Id, Guarded(system.Version, Guid.NewGuid()), "transitions[0].guardRuleId", SystemMachineEndpoints.GuardRuleNotFoundCode);
        await AssertRefused(
            client, universe.Id, system.Id, Guarded(system.Version, foreign.Id), "transitions[0].guardRuleId", SystemMachineEndpoints.GuardRuleNotFoundCode);
    }

    [Fact]
    public async Task Guard_scope_mismatch()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmguardscope");
        var first = await CreateProject(client, universe.Id, "First");
        var second = await CreateProject(client, universe.Id, "Second");

        var universeSystem = await CreateSystem(client, universe.Id, "Whole");
        var projectSystem = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Local", null, first));
        var firstRule = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Own", null, first));
        var secondRule = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Other", null, second));
        var universeRule = await CreateRule(client, universe.Id, "Shared");

        await AssertRefused(
            client,
            universe.Id,
            universeSystem.Id,
            Guarded(universeSystem.Version, firstRule.Id),
            "transitions[0].guardRuleId",
            SystemMachineEndpoints.GuardScopeMismatchCode);

        await AssertRefused(
            client,
            universe.Id,
            projectSystem.Id,
            Guarded(projectSystem.Version, secondRule.Id),
            "transitions[0].guardRuleId",
            SystemMachineEndpoints.GuardScopeMismatchCode);

        // The project's own rule and a universe rule are both in scope for the project's System.
        var saved = await PutJson<SystemMachineDetail>(
            client, Machine(universe.Id, projectSystem.Id), Guarded(projectSystem.Version, firstRule.Id));
        await PutJson<SystemMachineDetail>(client, Machine(universe.Id, projectSystem.Id), Guarded(saved.Version, universeRule.Id));
    }

    [Fact]
    public async Task Schema_version_unsupported()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmschema");
        var system = await CreateSystem(client, universe.Id, "Rank");

        await AssertRefused(
            client,
            universe.Id,
            system.Id,
            TwoStates(system.Version) with { SchemaVersion = 2 },
            "schemaVersion",
            SystemMachineEndpoints.SchemaVersionUnsupportedCode);
    }

    [Fact]
    public async Task Text_and_coordinate_bounds_are_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmbounds");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var request = TwoStates(system.Version);
        var states = request.States!;
        var tooLong = new string('a', WorldLogicLimits.NameMaxLength + 1);

        var cases = new (SystemMachineRequest Request, string Field)[]
        {
            (request with { States = [states[0] with { Name = tooLong }, states[1]] }, "states[0].name"),
            (request with { States = [states[0] with { Name = "  " }, states[1]] }, "states[0].name"),
            (request with { States = [states[0], states[1] with { Value = tooLong }] }, "states[1].value"),
            (request with { States = [states[0], states[1] with { Value = null }] }, "states[1].value"),
            (request with { States = [states[0] with { X = WorldLogicLimits.MaxCoordinate * 2 }, states[1]] }, "states[0].x"),
            (request with { States = [states[0], states[1] with { Y = -WorldLogicLimits.MaxCoordinate * 2 }] }, "states[1].y"),
            (request with { States = [states[0], states[1] with { Id = states[0].Id }] }, "states[1].id"),
            (request with { States = [states[0] with { Id = Guid.Empty }, states[1]] }, "states[0].id"),
            (request with { Transitions = [new(Guid.NewGuid(), states[0].Id, states[1].Id, tooLong, null)] }, "transitions[0].label"),
            (request with { Transitions = [new(states[0].Id, states[0].Id, states[1].Id, null, null)] }, "transitions[0].id"),
            (request with { Binding = new(tooLong, "rank") }, "binding.subjectType"),
        };

        foreach (var (refused, field) in cases)
        {
            await AssertRefused(client, universe.Id, system.Id, refused, field, code: null);
        }

        // Nothing was written by any of them.
        var read = (await client.GetFromJsonAsync<SystemMachineDetail>(Machine(universe.Id, system.Id)))!;
        Assert.Equal(system.Version, read.Version);
        Assert.Empty(read.States);
    }

    [Fact]
    public async Task The_shapes_the_spec_allows_save()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmallowed");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var a = new SystemMachineState(Guid.NewGuid(), "A", "a", true, 0, 0);
        var b = new SystemMachineState(Guid.NewGuid(), "B", "b", false, 100, 0);
        var unreached = new SystemMachineState(Guid.NewGuid(), "Unreached", "unreached", false, 200, 0);

        // A state nothing leads to, two transitions between one pair, and a transition back into the initial state.
        var saved = await PutJson<SystemMachineDetail>(
            client,
            Machine(universe.Id, system.Id),
            new SystemMachineRequest(
                1,
                Binding,
                [a, b, unreached],
                [
                    new(Guid.NewGuid(), a.Id, b.Id, "One way", null),
                    new(Guid.NewGuid(), a.Id, b.Id, "Another way", null),
                    new(Guid.NewGuid(), b.Id, a.Id, "Back", null),
                ],
                system.Version));
        Assert.Equal(3, saved.Transitions.Count);

        // A binding with no states yet is kept as it was sent.
        var bound = await PutJson<SystemMachineDetail>(
            client, Machine(universe.Id, system.Id), new SystemMachineRequest(1, Binding, [], [], saved.Version));
        Assert.Equal(Binding, bound.Binding);
        Assert.Empty(bound.States);

        // And the empty machine, which is how one is removed.
        var empty = await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), Empty(bound.Version));
        Assert.Null(empty.Binding);
    }

    [Fact]
    public async Task A_guard_in_use_cannot_be_deleted_until_the_machine_drops_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmguarddelete");
        var system = await CreateSystem(client, universe.Id, "Guarded holder");
        var rule = await CreateRule(client, universe.Id, "Guard");
        var saved = await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), Guarded(system.Version, rule.Id));

        var refused = await client.DeleteAsync(Rule(universe.Id, rule.Id));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var body = await refused.Content.ReadAsStringAsync();
        Assert.Contains(SystemRuleEndpoints.InUseCode, body, StringComparison.Ordinal);
        Assert.Contains("Guarded holder", body, StringComparison.Ordinal);

        // The transition stays, guard and all.
        var read = (await client.GetFromJsonAsync<SystemMachineDetail>(Machine(universe.Id, system.Id)))!;
        Assert.Equal(rule.Id, read.Transitions[0].GuardRuleId);

        var unguarded = Guarded(saved.Version, rule.Id);
        await PutJson<SystemMachineDetail>(
            client,
            Machine(universe.Id, system.Id),
            unguarded with { Transitions = [unguarded.Transitions![0] with { GuardRuleId = null }] });

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Rule(universe.Id, rule.Id))).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_system_deletes_its_machine()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmsystemdelete");
        var system = await CreateSystem(client, universe.Id, "Doomed");
        var rule = await CreateRule(client, universe.Id, "Survivor");
        await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), Guarded(system.Version, rule.Id));

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(System(universe.Id, system.Id))).StatusCode);

        await WithDb(_factory, async db =>
        {
            Assert.Equal(0, await db.SystemMachines.CountAsync(machine => machine.SystemId == system.Id));
            Assert.Equal(0, await db.SystemStates.CountAsync(state => state.SystemId == system.Id));
            Assert.Equal(0, await db.SystemTransitions.CountAsync(transition => transition.SystemId == system.Id));

            // The guard is a rule definition in its own right and outlives the machine that named it.
            Assert.True(await db.SystemRules.AnyAsync(candidate => candidate.Id == rule.Id));
        });
    }

    [Fact]
    public async Task Another_universes_system_machine_is_not_found()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmother");
        var other = await CreateUniverse(client, "World wlmother second");
        var theirs = await CreateSystem(client, other.Id, "Theirs");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Machine(universe.Id, theirs.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutAsJsonAsync(Machine(universe.Id, theirs.Id), TwoStates(theirs.Version))).StatusCode);

        var read = (await client.GetFromJsonAsync<SystemMachineDetail>(Machine(other.Id, theirs.Id)))!;
        Assert.Empty(read.States);
    }

    [Fact]
    public async Task The_readable_export_lists_the_machine()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlmreadable");
        var system = await CreateSystem(client, universe.Id, "Rank");
        var rule = await CreateRule(client, universe.Id, "Masterwork");
        await PutJson<SystemMachineDetail>(client, Machine(universe.Id, system.Id), Guarded(system.Version, rule.Id));

        var response = await client.GetAsync($"/api/universes/{universe.Id}/export/readable");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var files = RestoreTestClient.Entries(await response.Content.ReadAsByteArrayAsync());

        Assert.Contains("[Systems](systems.md) - 1", Encoding.UTF8.GetString(files["README.md"]), StringComparison.Ordinal);

        var page = Encoding.UTF8.GetString(files["systems.md"]);
        Assert.Contains("## Rank", page, StringComparison.Ordinal);
        Assert.Contains("**Machine:** member.rank", page, StringComparison.Ordinal);
        Assert.Contains("- Novice (novice), initial", page, StringComparison.Ordinal);
        Assert.Contains("- Master (master)", page, StringComparison.Ordinal);
        Assert.Contains("- Novice to Master: Raised, guard: Masterwork", page, StringComparison.Ordinal);
    }

    // ---------- Addresses and bodies ----------

    private static readonly SystemMachineBinding Binding = new("member", "rank");

    private static string Systems(Guid universeId) => $"/api/universes/{universeId}/systems";

    private static string System(Guid universeId, Guid systemId) => $"{Systems(universeId)}/{systemId}";

    private static string Machine(Guid universeId, Guid systemId) => $"{System(universeId, systemId)}/machine";

    private static string Rules(Guid universeId) => $"/api/universes/{universeId}/system-rules";

    private static string Rule(Guid universeId, Guid ruleId) => $"{Rules(universeId)}/{ruleId}";

    private static Task<SystemDetail> CreateSystem(HttpClient client, Guid universeId, string name) =>
        PostJson<SystemDetail>(client, Systems(universeId), new SystemRequest(name, null));

    private static Task<SystemRuleDetail> CreateRule(HttpClient client, Guid universeId, string title) =>
        PostJson<SystemRuleDetail>(client, Rules(universeId), new SystemRuleRequest(title, null));

    private static async Task<Guid> CreateProject(HttpClient client, Guid universeId, string name) =>
        (await PostJson<ProjectDetail>(
            client,
            "/api/projects",
            new ProjectRequest(name, ProjectKind.Game, ProjectLifecycle.Planning, null, null, universeId, null))).Id;

    private static SystemMachineRequest Empty(int? expectedVersion) => new(1, null, [], [], expectedVersion);

    /// <summary>Two valid states, the first initial, and no transition.</summary>
    private static SystemMachineRequest TwoStates(int? expectedVersion) => new(
        1,
        Binding,
        [
            new(Guid.NewGuid(), "Novice", "novice", true, 0, 0),
            new(Guid.NewGuid(), "Master", "master", false, 320, 0),
        ],
        [],
        expectedVersion);

    /// <summary>The two states, joined by one transition the rule guards.</summary>
    private static SystemMachineRequest Guarded(int expectedVersion, Guid ruleId)
    {
        var request = TwoStates(expectedVersion);
        return request with
        {
            Transitions = [new(Guid.NewGuid(), request.States![0].Id, request.States[1].Id, "Raised", ruleId)],
        };
    }

    /// <summary>A 400 keyed by <paramref name="field"/> whose <c>code</c> is <paramref name="code"/>, or carries none.</summary>
    private static async Task AssertRefused(
        HttpClient client,
        Guid universeId,
        Guid systemId,
        SystemMachineRequest request,
        string field,
        string? code)
    {
        var response = await client.PutAsJsonAsync(Machine(universeId, systemId), request);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, $"{field}: {(int)response.StatusCode} {text}");

        using var document = JsonDocument.Parse(text);
        var root = document.RootElement;
        Assert.True(root.GetProperty("errors").TryGetProperty(field, out _), $"{field}: {text}");

        if (code is null)
        {
            Assert.False(root.TryGetProperty("code", out _), $"{field}: {text}");
        }
        else
        {
            Assert.Equal(code, root.GetProperty("code").GetString());
        }
    }
}
