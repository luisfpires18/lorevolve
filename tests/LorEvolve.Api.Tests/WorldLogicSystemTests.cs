using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Systems;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Systems and reusable rule definitions (#150, ADR 0072).
///
/// <para>These are written against the things that would be silently wrong rather than loudly broken. <b>Reuse:</b>
/// two Systems referencing one rule must be one definition, not two copies, because a copy would drift and an author
/// would never see it. <b>Scope:</b> a project-scoped row must not escape its universe, and a project of another
/// universe must answer as a missing one. <b>Protection:</b> a rule something still points at must not be deletable,
/// or a condition would be left naming a row that is gone. <b>Compatibility:</b> every existing world rule must keep
/// its id and its routes, and the unified list must show both kinds.</para>
///
/// <para>Nothing here evaluates a condition: a condition is validated structurally on save and stored. The evaluator
/// is LOREX-018.</para>
/// </summary>
public sealed class WorldLogicSystemTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private const string Password = "Test-password-123!";

    [Fact]
    public async Task A_system_is_created_read_listed_and_saved_under_its_own_version()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlcreate");

        var created = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Runeforging", "How metal is worked."));
        Assert.Equal("Runeforging", created.Name);
        Assert.Equal(WorldLogicScope.Universe, created.Scope);
        Assert.Null(created.ProjectId);
        Assert.Equal(1, created.Version);
        Assert.Empty(created.Rules);

        var listed = (await client.GetFromJsonAsync<WorldLogicPage<SystemSummary>>(Systems(universe.Id)))!;
        Assert.Equal(1, listed.TotalCount);
        Assert.Equal(0, listed.Items[0].RuleCount);

        var saved = await PutJson<SystemDetail>(
            client,
            System(universe.Id, created.Id),
            new SystemRequest("Runeforging", "How metal is worked, and by whom.", null, created.Version));

        Assert.Equal(2, saved.Version);

        // A save that changes nothing writes nothing: the version stays, and no second revision is written.
        var unchanged = await PutJson<SystemDetail>(
            client,
            System(universe.Id, created.Id),
            new SystemRequest("Runeforging", "How metal is worked, and by whom.", null, saved.Version));

        Assert.Equal(2, unchanged.Version);

        var revisions = (await client.GetFromJsonAsync<List<WorldLogicRevisionRow>>(
            $"{System(universe.Id, created.Id)}/revisions"))!;

        Assert.Equal([2, 1], revisions.Select(revision => revision.Version));
        Assert.Equal("How metal is worked, and by whom.", revisions[0].Body);
        Assert.Equal("How metal is worked.", revisions[1].Body);
        Assert.All(revisions, revision => Assert.False(revision.HasCondition));
    }

    [Fact]
    public async Task A_save_over_a_system_that_moved_on_is_refused_and_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlstale");
        var created = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Succession", null));

        await PutJson<SystemDetail>(client, System(universe.Id, created.Id), new SystemRequest("Succession", "First pass", null, 1));

        var stale = await client.PutAsJsonAsync(
            System(universe.Id, created.Id),
            new SystemRequest("Succession", "Second pass", null, 1));

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains(SystemEndpoints.ChangedCode, await stale.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var read = (await client.GetFromJsonAsync<SystemDetail>(System(universe.Id, created.Id)))!;
        Assert.Equal("First pass", read.Summary);
        Assert.Equal(2, read.Version);
    }

    [Fact]
    public async Task Two_systems_in_one_scope_cannot_share_a_name_and_two_projects_can()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlnames");
        var first = await CreateProject(client, universe.Id, "First");
        var second = await CreateProject(client, universe.Id, "Second");

        await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Combat", null));

        var duplicate = await client.PostAsJsonAsync(Systems(universe.Id), new SystemRequest("combat", null));
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Contains(SystemEndpoints.NameTakenCode, await duplicate.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // Each project is its own scope, so the same name in two of them is two Systems, and neither collides with
        // the universe's.
        var inFirst = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Combat", null, first));
        var inSecond = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Combat", null, second));

        Assert.Equal(WorldLogicScope.Project, inFirst.Scope);
        Assert.Equal(first, inFirst.ProjectId);
        Assert.Equal(second, inSecond.ProjectId);

        var narrowed = (await client.GetFromJsonAsync<WorldLogicPage<SystemSummary>>($"{Systems(universe.Id)}?projectId={first}"))!;
        Assert.Equal(1, narrowed.TotalCount);
        Assert.Equal(inFirst.Id, narrowed.Items[0].Id);

        var universeOnly = (await client.GetFromJsonAsync<WorldLogicPage<SystemSummary>>($"{Systems(universe.Id)}?universeScopeOnly=true"))!;
        Assert.Equal(1, universeOnly.TotalCount);
        Assert.Null(universeOnly.Items[0].ProjectId);
    }

    [Fact]
    public async Task A_project_of_another_universe_cannot_be_named_as_a_scope()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlscope");
        var other = await CreateUniverse(client, "World wlscope other");
        var elsewhere = await CreateProject(client, other.Id, "Elsewhere");

        var refused = await client.PostAsJsonAsync(Systems(universe.Id), new SystemRequest("Logic", null, elsewhere));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("projectId", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var madeUp = await client.PostAsJsonAsync(Systems(universe.Id), new SystemRequest("Logic", null, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.BadRequest, madeUp.StatusCode);
    }

    [Fact]
    public async Task A_systems_scope_is_fixed_at_creation()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlfixed");
        var project = await CreateProject(client, universe.Id, "Fixed");
        var created = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Logic", null));

        var moved = await client.PutAsJsonAsync(
            System(universe.Id, created.Id),
            new SystemRequest("Logic", null, project, created.Version));

        Assert.Equal(HttpStatusCode.BadRequest, moved.StatusCode);
    }

    /// <summary>
    /// The reuse the whole design rests on: two Systems reference one definition. Saving the rule once changes what
    /// both Systems read, and there is exactly one row.
    /// </summary>
    [Fact]
    public async Task One_rule_referenced_by_two_systems_stays_one_versioned_definition()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlreuse");
        var left = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Left", null));
        var right = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Right", null));

        var rule = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Age of majority", "Sixteen."));

        await PutJson<SystemDetail>(client, $"{System(universe.Id, left.Id)}/rules/{rule.Id}", new { });
        await PutJson<SystemDetail>(client, $"{System(universe.Id, right.Id)}/rules/{rule.Id}", new { });

        var detail = (await client.GetFromJsonAsync<SystemRuleDetail>(Rule(universe.Id, rule.Id)))!;
        Assert.Equal(["Left", "Right"], detail.Systems.Select(system => system.Name));

        var saved = await PutJson<SystemRuleDetail>(
            client,
            Rule(universe.Id, rule.Id),
            new SystemRuleRequest("Age of majority", "Eighteen.", null, null, null, null, rule.Version));

        Assert.Equal(2, saved.Version);

        // Both Systems read the one saved definition, and the database holds one row for it.
        foreach (var system in new[] { left.Id, right.Id })
        {
            var read = (await client.GetFromJsonAsync<SystemDetail>(System(universe.Id, system)))!;
            Assert.Single(read.Rules);
            Assert.Equal(rule.Id, read.Rules[0].Id);
            Assert.Equal(2, read.Rules[0].Version);
            Assert.Equal(2, read.Rules[0].SystemCount);
        }

        await WithDb(_factory, async db =>
        {
            Assert.Equal(1, await db.SystemRules.CountAsync(candidate => candidate.UniverseId == universe.Id));
            Assert.Equal(2, await db.LoreSystemRules.CountAsync(link => link.RuleId == rule.Id));
        });

        // Deleting one System takes its link and leaves the rule and the other System's link.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(System(universe.Id, left.Id))).StatusCode);

        var survivor = (await client.GetFromJsonAsync<SystemRuleDetail>(Rule(universe.Id, rule.Id)))!;
        Assert.Equal(["Right"], survivor.Systems.Select(system => system.Name));
    }

    [Fact]
    public async Task A_rule_that_is_still_referenced_cannot_be_deleted()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlinuse");
        var system = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Holder", null));
        var rule = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Held", null));
        await PutJson<SystemDetail>(client, $"{System(universe.Id, system.Id)}/rules/{rule.Id}", new { });

        var refused = await client.DeleteAsync(Rule(universe.Id, rule.Id));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);

        var body = await refused.Content.ReadAsStringAsync();
        Assert.Contains(SystemRuleEndpoints.InUseCode, body, StringComparison.Ordinal);
        Assert.Contains("Holder", body, StringComparison.Ordinal);

        // Unlinked, it deletes.
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"{System(universe.Id, system.Id)}/rules/{rule.Id}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Rule(universe.Id, rule.Id))).StatusCode);
    }

    [Fact]
    public async Task A_rule_another_rule_depends_on_cannot_be_deleted()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wldepdel");
        var dependency = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Base", null));
        var dependent = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Derived", null, null, 1, Condition(Holds(dependency.Id)), [dependency.Id]));

        Assert.Equal([dependency.Id], dependent.DependsOn);

        var refused = await client.DeleteAsync(Rule(universe.Id, dependency.Id));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains(dependent.Id.ToString(), await refused.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task A_condition_is_stored_as_sent_and_read_back_as_json()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlcond");

        var rule = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Purity", "At least two.", null, 1, Condition(PurityAtLeast(2))));

        Assert.Equal(1, rule.SchemaVersion);
        Assert.NotNull(rule.Condition);
        Assert.Equal("compare", rule.Condition!.Value.GetProperty("kind").GetString());

        var listed = (await client.GetFromJsonAsync<WorldLogicPage<SystemRuleSummary>>(Rules(universe.Id)))!;
        Assert.True(listed.Items[0].HasCondition);

        // A rule saved without a condition is words only, and the schema version goes with it.
        var cleared = await PutJson<SystemRuleDetail>(
            client,
            Rule(universe.Id, rule.Id),
            new SystemRuleRequest("Purity", "At least two.", null, null, null, null, rule.Version));

        Assert.Null(cleared.Condition);
        Assert.Null(cleared.SchemaVersion);

        // Its saved states keep the condition the rule had at that version, which is what makes a finding under an
        // older version reproducible.
        var revisions = (await client.GetFromJsonAsync<List<WorldLogicRevisionRow>>($"{Rule(universe.Id, rule.Id)}/revisions"))!;
        Assert.Equal([2, 1], revisions.Select(revision => revision.Version));
        Assert.False(revisions[0].HasCondition);
        Assert.True(revisions[1].HasCondition);
    }

    [Theory]
    [InlineData("kind", "{\"kind\":\"someday\"}", "unknown_node_kind")]
    [InlineData("empty", "{\"kind\":\"all\",\"of\":[]}", "node_arity")]
    [InlineData("source", "{\"kind\":\"exists\",\"query\":{\"from\":\"nowhere\",\"where\":[]}}", "unknown_source")]
    [InlineData("field", "{\"kind\":\"exists\",\"query\":{\"from\":\"events\",\"where\":[{\"field\":\"nope\",\"op\":\"eq\",\"value\":1,\"type\":\"number\"}]}}", "unknown_field")]
    [InlineData("operator", "{\"kind\":\"compare\",\"left\":{\"subject\":\"self\"},\"op\":\"nope\",\"right\":{\"subject\":\"self\"}}", "unknown_operator")]
    [InlineData("literal", "{\"kind\":\"compare\",\"left\":{\"literal\":\"x\",\"type\":\"number\"},\"op\":\"eq\",\"right\":{\"subject\":\"self\"}}", "type_mismatch")]
    [InlineData("always", "{\"kind\":\"always\",\"value\":\"maybe\"}", "node_arity")]
    public async Task A_condition_the_specification_does_not_describe_is_refused_with_its_own_code(
        string tag,
        string condition,
        string code)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, $"wlbad{tag}");

        var refused = await client.PostAsJsonAsync(
            Rules(universe.Id),
            new SystemRuleRequest("Broken", null, null, 1, Parse(condition)));

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains(code, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_condition_deeper_than_the_limit_is_refused_on_save()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wldepth");

        var condition = "{\"kind\":\"always\",\"value\":\"true\"}";
        for (var i = 0; i < ConditionSchema.MaxDepth; i++)
        {
            condition = $"{{\"kind\":\"not\",\"of\":{condition}}}";
        }

        var refused = await client.PostAsJsonAsync(
            Rules(universe.Id),
            new SystemRuleRequest("Deep", null, null, 1, Parse(condition)));

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("depth_limit", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_condition_stored_at_a_newer_schema_version_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlschema");

        var refused = await client.PostAsJsonAsync(
            Rules(universe.Id),
            new SystemRuleRequest("Future", null, null, ConditionSchema.CurrentVersion + 1, Condition(PurityAtLeast(1))));

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("schema_version_unsupported", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_condition_may_only_name_a_rule_it_declares_and_never_closes_a_cycle()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlcycle");
        var first = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("First", null));

        // Naming a rule without declaring it.
        var undeclared = await client.PostAsJsonAsync(
            Rules(universe.Id),
            new SystemRuleRequest("Second", null, null, 1, Condition(Holds(first.Id))));

        Assert.Equal(HttpStatusCode.BadRequest, undeclared.StatusCode);
        Assert.Contains("undeclared_dependency", await undeclared.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // Declaring a rule of another universe, or one that does not exist.
        var unknown = await client.PostAsJsonAsync(
            Rules(universe.Id),
            new SystemRuleRequest("Second", null, null, null, null, [Guid.NewGuid()]));

        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);

        var second = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Second", null, null, 1, Condition(Holds(first.Id)), [first.Id]));

        // Closing the cycle the other way is refused, and the first rule keeps what it had.
        var cycle = await client.PutAsJsonAsync(
            Rule(universe.Id, first.Id),
            new SystemRuleRequest("First", null, null, 1, Condition(Holds(second.Id)), [second.Id], first.Version));

        Assert.Equal(HttpStatusCode.BadRequest, cycle.StatusCode);
        Assert.Contains("dependency_cycle", await cycle.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var read = (await client.GetFromJsonAsync<SystemRuleDetail>(Rule(universe.Id, first.Id)))!;
        Assert.Empty(read.DependsOn);
        Assert.Equal(1, read.Version);

        // And a rule cannot depend on itself.
        var itself = await client.PutAsJsonAsync(
            Rule(universe.Id, first.Id),
            new SystemRuleRequest("First", null, null, null, null, [first.Id], first.Version));

        Assert.Equal(HttpStatusCode.BadRequest, itself.StatusCode);
    }

    [Fact]
    public async Task A_projects_system_cannot_reference_another_projects_rule()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlcross");
        var first = await CreateProject(client, universe.Id, "First");
        var second = await CreateProject(client, universe.Id, "Second");

        var system = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Logic", null, first));
        var ownRule = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Own", null, first));
        var universeRule = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Shared", null));
        var otherRule = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Other", null, second));

        await PutJson<SystemDetail>(client, $"{System(universe.Id, system.Id)}/rules/{ownRule.Id}", new { });
        await PutJson<SystemDetail>(client, $"{System(universe.Id, system.Id)}/rules/{universeRule.Id}", new { });

        var refused = await client.PutAsJsonAsync($"{System(universe.Id, system.Id)}/rules/{otherRule.Id}", new { });
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
    }

    [Fact]
    public async Task Linking_is_idempotent_and_sets_the_order_inside_this_system_only()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlorder");
        var left = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Left", null));
        var right = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Right", null));

        var alpha = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Alpha", null));
        var beta = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Beta", null));

        await PutJson<SystemDetail>(client, $"{System(universe.Id, left.Id)}/rules/{alpha.Id}?sortOrder=0", new { });
        await PutJson<SystemDetail>(client, $"{System(universe.Id, left.Id)}/rules/{beta.Id}?sortOrder=1", new { });
        await PutJson<SystemDetail>(client, $"{System(universe.Id, right.Id)}/rules/{beta.Id}?sortOrder=0", new { });
        var reordered = await PutJson<SystemDetail>(client, $"{System(universe.Id, right.Id)}/rules/{alpha.Id}?sortOrder=1", new { });

        Assert.Equal(["Beta", "Alpha"], reordered.Rules.Select(rule => rule.Title));

        var unchanged = (await client.GetFromJsonAsync<SystemDetail>(System(universe.Id, left.Id)))!;
        Assert.Equal(["Alpha", "Beta"], unchanged.Rules.Select(rule => rule.Title));

        // Linking the same rule again moves it rather than adding a second link.
        var again = await PutJson<SystemDetail>(client, $"{System(universe.Id, left.Id)}/rules/{alpha.Id}?sortOrder=5", new { });
        Assert.Equal(["Beta", "Alpha"], again.Rules.Select(rule => rule.Title));
        Assert.Equal(2, again.Rules.Count);
    }

    /// <summary>
    /// The compatibility promise: every world rule keeps its id, its own routes answer exactly as before, and the
    /// unified list shows both kinds with the table each came from.
    /// </summary>
    [Fact]
    public async Task World_rules_keep_their_ids_and_routes_and_appear_beside_rule_definitions()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlunified");

        var worldRule = await PostJson<JsonElement>(
            client,
            $"/api/universes/{universe.Id}/world-rules",
            new { title = "Blink has a cost", description = "It always does." });

        var worldRuleId = worldRule.GetProperty("id").GetGuid();

        var definition = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Age of majority", "Sixteen.", null, 1, Condition(PurityAtLeast(2))));

        var merged = (await client.GetFromJsonAsync<WorldLogicPage<WorldLogicRuleRow>>(
            $"/api/universes/{universe.Id}/world-logic/rules"))!;

        Assert.Equal(2, merged.TotalCount);

        var fromWorldRules = merged.Items.Single(row => row.Source == SystemRuleEndpoints.WorldRuleSource);
        Assert.Equal(worldRuleId, fromWorldRules.Id);
        Assert.Equal("Blink has a cost", fromWorldRules.Title);
        Assert.False(fromWorldRules.HasCondition);

        var fromDefinitions = merged.Items.Single(row => row.Source == SystemRuleEndpoints.SystemRuleSource);
        Assert.Equal(definition.Id, fromDefinitions.Id);
        Assert.True(fromDefinitions.HasCondition);

        // The world rule's own routes are untouched, and its id still opens it.
        var read = await client.GetFromJsonAsync<JsonElement>($"/api/universes/{universe.Id}/world-rules/{worldRuleId}");
        Assert.Equal("Blink has a cost", read.GetProperty("title").GetString());

        // A rule definition is not a world rule: its id is not found on the world rule route, and the reverse.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/universes/{universe.Id}/world-rules/{definition.Id}")).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Rule(universe.Id, worldRuleId))).StatusCode);
    }

    [Fact]
    public async Task A_world_rule_in_the_trash_is_not_in_the_unified_list()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wltrash");
        var worldRule = await PostJson<JsonElement>(
            client,
            $"/api/universes/{universe.Id}/world-rules",
            new { title = "Gone", description = string.Empty });

        var id = worldRule.GetProperty("id").GetGuid();
        (await client.DeleteAsync($"/api/universes/{universe.Id}/world-rules/{id}")).EnsureSuccessStatusCode();

        var merged = (await client.GetFromJsonAsync<WorldLogicPage<WorldLogicRuleRow>>(
            $"/api/universes/{universe.Id}/world-logic/rules"))!;

        Assert.Equal(0, merged.TotalCount);
    }

    /// <summary>
    /// Authorization, which is the universe's and nothing else's (ADR 0041). A Viewer reads and cannot write; an
    /// outsider gets the same 404 a universe that does not exist gets.
    /// </summary>
    [Fact]
    public async Task Access_is_the_universes_and_an_outsider_sees_nothing()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "wlaccess");
        var system = await PostJson<SystemDetail>(owner, Systems(universe.Id), new SystemRequest("Guarded", null));
        var rule = await PostJson<SystemRuleDetail>(owner, Rules(universe.Id), new SystemRuleRequest("Guarded rule", null));

        var outsider = await SignedIn(_factory, "user-wlaccess-outsider");

        foreach (var address in new[]
                 {
                     Systems(universe.Id),
                     System(universe.Id, system.Id),
                     Rules(universe.Id),
                     Rule(universe.Id, rule.Id),
                     $"/api/universes/{universe.Id}/world-logic/rules",
                 })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(address)).StatusCode);
        }

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await outsider.PostAsJsonAsync(Systems(universe.Id), new SystemRequest("Theirs", null))).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await outsider.DeleteAsync(Rule(universe.Id, rule.Id))).StatusCode);

        // A signed-out caller is challenged before anything is read.
        var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Systems(universe.Id))).StatusCode);

        // A Viewer reads and cannot write.
        var (viewer, viewerId) = await PublishingTestClient.Account(_factory, "wlaccess-viewer");
        await CollaborationTestClient.Join(_factory, universe.Id, viewerId, UniverseRole.Viewer);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync(Systems(universe.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await viewer.PostAsJsonAsync(Systems(universe.Id), new SystemRequest("Theirs", null))).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.DeleteAsync(Rule(universe.Id, rule.Id))).StatusCode);
    }

    [Fact]
    public async Task A_row_of_another_universe_is_never_found_through_this_one()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlother");
        var other = await CreateUniverse(client, "World wlother second");

        var system = await PostJson<SystemDetail>(client, Systems(other.Id), new SystemRequest("Theirs", null));
        var rule = await PostJson<SystemRuleDetail>(client, Rules(other.Id), new SystemRuleRequest("Theirs", null));

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(System(universe.Id, system.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Rule(universe.Id, rule.Id))).StatusCode);

        var created = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Mine", null));
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutAsJsonAsync($"{System(universe.Id, created.Id)}/rules/{rule.Id}", new { })).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_universe_takes_its_world_logic_with_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlcascade");
        var system = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Doomed", "Gone with it."));
        var rule = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Doomed rule", null));
        await PutJson<SystemDetail>(client, $"{System(universe.Id, system.Id)}/rules/{rule.Id}", new { });

        // The cascade is the schema's, so the universe row is removed directly: the delete endpoint refuses a
        // universe that still holds content, and what is under test here is what the foreign keys do.
        await WithDb(_factory, async db =>
        {
            db.Universes.Remove(await db.Universes.FirstAsync(candidate => candidate.Id == universe.Id));
            await db.SaveChangesAsync();
        });

        await WithDb(_factory, async db =>
        {
            Assert.Empty(await db.LoreSystems.Where(candidate => candidate.UniverseId == universe.Id).ToListAsync());
            Assert.Empty(await db.SystemRules.Where(candidate => candidate.UniverseId == universe.Id).ToListAsync());
            Assert.Empty(await db.LoreSystemRules.Where(link => link.SystemId == system.Id).ToListAsync());
            Assert.Empty(await db.LoreSystemRevisions.Where(revision => revision.SystemId == system.Id).ToListAsync());
            Assert.Empty(await db.SystemRuleRevisions.Where(revision => revision.RuleId == rule.Id).ToListAsync());
        });
    }

    // ---------- Addresses and bodies ----------

    private static string Systems(Guid universeId) => $"/api/universes/{universeId}/systems";

    private static string System(Guid universeId, Guid systemId) => $"{Systems(universeId)}/{systemId}";

    private static string Rules(Guid universeId) => $"/api/universes/{universeId}/system-rules";

    private static string Rule(Guid universeId, Guid ruleId) => $"{Rules(universeId)}/{ruleId}";

    private static async Task<Guid> CreateProject(HttpClient client, Guid universeId, string name) =>
        (await PostJson<ProjectDetail>(
            client,
            "/api/projects",
            new ProjectRequest(name, ProjectKind.Game, ProjectLifecycle.Planning, null, null, universeId, null))).Id;

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static JsonElement Condition(string json) => Parse(json);

    private static string Holds(Guid ruleId) => $"{{\"kind\":\"ruleHolds\",\"ruleId\":\"{ruleId}\"}}";

    private static string PurityAtLeast(int floor) =>
        "{\"kind\":\"compare\",\"left\":{\"attribute\":\"purity\",\"of\":{\"subject\":\"self\"}},"
        + $"\"op\":\"gte\",\"right\":{{\"literal\":{floor},\"type\":\"number\"}}}}";
}
