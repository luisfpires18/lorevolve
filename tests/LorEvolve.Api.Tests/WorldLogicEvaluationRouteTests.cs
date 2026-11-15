using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.Systems;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The evaluator over a universe's own rows, through the real host (#151, ADR 0072).
///
/// <para>The fixtures prove the semantics; these prove the mapping, which is the part fixtures cannot reach: that
/// an entry is a subject and its field values are its attributes, that a relationship is a relation on its stored
/// direction, that a timeline moment is an event with the explicit terms the author attached, and that a stored
/// exception is read back and applied with its scope.</para>
///
/// <para>Nothing here writes a finding. The route evaluates and answers; persisting is LOREX-020.</para>
/// </summary>
public sealed class WorldLogicEvaluationRouteTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_rule_over_an_entrys_own_field_value_is_evaluated_against_the_lore()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wleval");
        var (type, field) = await NumberField(client, universe.Id, "Purity");

        var pure = await EntityWithNumber(client, universe.Id, type, field, "Bright ingot", 4);
        var flawed = await EntityWithNumber(client, universe.Id, type, field, "Dull ingot", 1);
        var undescribed = await CreateEntity(client, universe.Id, "Unmeasured ingot");

        var rule = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Purity floor", "At least two.", null, 1, Parse(PurityAtLeast(2))));

        var pass = await Evaluate(client, universe.Id, rule.Id, pure);
        Assert.Equal("true", pass.Outcome);
        Assert.Null(pass.ErrorCode);
        Assert.Contains(pass.Evidence, item => item.Id == pure.ToString() && item.Role == "self");
        Assert.NotEmpty(pass.Rationale);

        var violation = await Evaluate(client, universe.Id, rule.Id, flawed);
        Assert.Equal("false", violation.Outcome);

        // An entry with no value for that field is unknown, and never a quiet pass or a quiet violation.
        var unknown = await Evaluate(client, universe.Id, rule.Id, undescribed);
        Assert.Equal("unknown", unknown.Outcome);
        Assert.Null(unknown.ErrorCode);

        // Asked without a target, a rule written with self is unknown: the rule is fine, the question was not.
        var untargeted = await Evaluate(client, universe.Id, rule.Id, target: null);
        Assert.Equal("unknown", untargeted.Outcome);
    }

    [Fact]
    public async Task A_rule_over_a_relationship_reads_the_stored_direction()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlevalrel");
        var smith = await CreateEntity(client, universe.Id, "The smith");
        var ingot = await CreateEntity(client, universe.Id, "Ingot");
        var kind = await RelationKind(client, universe.Id, "made");
        await Relate(client, universe.Id, kind, smith, ingot);

        var rule = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest(
                "The smith made it",
                null,
                null,
                1,
                Parse($"{{\"kind\":\"related\",\"relation\":\"made\",\"from\":{{\"subject\":\"{smith}\"}},\"to\":{{\"subject\":\"self\"}}}}")));

        Assert.Equal("true", (await Evaluate(client, universe.Id, rule.Id, ingot)).Outcome);

        // The other direction is a different fact, and ADR 0008 stores one row: the reverse is false, not unknown.
        Assert.Equal("false", (await Evaluate(client, universe.Id, rule.Id, smith)).Outcome);
    }

    [Fact]
    public async Task A_rule_counting_canon_moments_reads_the_terms_the_author_attached()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlevalevents");
        var person = await CreateEntity(client, universe.Id, "Ember Vale");

        var eventKind = await RuleValidationTestClient.EventKind(client, universe.Id, "Resurrection");
        var method = await RuleValidationTestClient.Method(client, universe.Id, "Rite of Ash");

        await Moment(client, universe.Id, "First return", eventKind.Id, method.Id, person, 120);
        await Moment(client, universe.Id, "Second return", eventKind.Id, method.Id, person, 140);

        var condition = "{\"kind\":\"compare\",\"left\":{\"count\":{\"from\":\"events\",\"where\":["
                        + "{\"field\":\"kind\",\"op\":\"eq\",\"value\":\"Resurrection\",\"type\":\"text\"},"
                        + "{\"field\":\"canon\",\"op\":\"eq\",\"value\":true,\"type\":\"boolean\"},"
                        + "{\"field\":\"subjectIds\",\"op\":\"contains\",\"operandValue\":{\"subject\":\"self\"}}"
                        + "]}},\"op\":\"lte\",\"right\":{\"literal\":1,\"type\":\"number\"}}";

        var rule = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("One resurrection", null, null, 1, Parse(condition)));

        var result = await Evaluate(client, universe.Id, rule.Id, person);

        Assert.Equal("false", result.Outcome);
        Assert.Equal(2, result.Evidence.Count(item => item.Source == "events"));
    }

    /// <summary>
    /// A stored exception, read back and applied by its scope. This is the whole reason the exception list is
    /// stored rather than left to the condition tree: the scope and the precedence are the author's, and a finding
    /// records which exception excused it.
    /// </summary>
    [Fact]
    public async Task A_stored_exception_excuses_a_violation_in_its_own_project_only()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlevalexc");
        var project = (await PostJson<ProjectDetail>(
            client,
            "/api/projects",
            new ProjectRequest("Rites", ProjectKind.Game, ProjectLifecycle.Planning, null, null, universe.Id, null))).Id;

        var (type, purity) = await NumberField(client, universe.Id, "Purity");
        var (_, ceremonial) = await NumberField(client, universe.Id, "Ceremonial", type);

        var piece = (await PostJson<EntityDetail>(
            client,
            $"/api/universes/{universe.Id}/entities",
            new EntityRequest(
                type,
                "Rite ingot",
                null,
                CanonStatus.Canon,
                null,
                null,
                [
                    new FieldValueInput(purity, null, 1, null, null, null, null),
                    new FieldValueInput(ceremonial, null, 1, null, null, null, null),
                ]))).Id;

        var exceptions = $"[{{\"id\":\"ex.ceremonial\",\"scope\":{{\"kind\":\"project\",\"projectId\":\"{project}\"}},"
                         + "\"when\":{\"kind\":\"compare\",\"left\":{\"attribute\":\"Ceremonial\",\"of\":{\"subject\":\"self\"}},"
                         + "\"op\":\"eq\",\"right\":{\"literal\":1,\"type\":\"number\"}}}]";

        var rule = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Purity floor", null, null, 1, Parse(PurityAtLeast(2)), null, null, Parse(exceptions)));

        Assert.NotNull(rule.Exceptions);
        Assert.Equal("ex.ceremonial", rule.Exceptions!.Value[0].GetProperty("id").GetString());

        var inProject = await Evaluate(client, universe.Id, rule.Id, piece, project);
        Assert.Equal("exempt", inProject.Outcome);
        Assert.Equal("ex.ceremonial", inProject.ExemptionId);

        // Outside that project the exception is skipped, so the violation stands.
        var outside = await Evaluate(client, universe.Id, rule.Id, piece);
        Assert.Equal("false", outside.Outcome);
        Assert.Null(outside.ExemptionId);
    }

    [Fact]
    public async Task An_exception_the_specification_does_not_describe_is_refused_on_save()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlexcbad");

        foreach (var (exceptions, code) in new[]
                 {
                     ("[{\"id\":\"\",\"scope\":{\"kind\":\"universe\"},\"when\":{\"kind\":\"always\",\"value\":\"true\"}}]", "invalid_reference"),
                     ("[{\"id\":\"ex\",\"scope\":{\"kind\":\"project\"},\"when\":{\"kind\":\"always\",\"value\":\"true\"}}]", "invalid_reference"),
                     ("[{\"id\":\"ex\",\"scope\":{\"kind\":\"nowhere\"},\"when\":{\"kind\":\"always\",\"value\":\"true\"}}]", "invalid_reference"),
                     ("[{\"id\":\"ex\",\"scope\":{\"kind\":\"universe\"},\"when\":{\"kind\":\"someday\"}}]", "unknown_node_kind"),
                     ("[{\"id\":\"ex\",\"scope\":{\"kind\":\"universe\"}}]", "node_arity"),
                     ("{\"id\":\"ex\"}", "node_arity"),
                     ("[{\"id\":\"ex\",\"scope\":{\"kind\":\"universe\"},\"when\":{\"kind\":\"always\",\"value\":\"true\"}},"
                      + "{\"id\":\"ex\",\"scope\":{\"kind\":\"universe\"},\"when\":{\"kind\":\"always\",\"value\":\"true\"}}]", "invalid_reference"),
                 })
        {
            var refused = await client.PostAsJsonAsync(
                Rules(universe.Id),
                new SystemRuleRequest("Broken exception", null, null, 1, Parse(PurityAtLeast(2)), null, null, Parse(exceptions)));

            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Contains(code, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task An_exception_without_a_condition_to_except_from_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlexcnocond");

        var refused = await client.PostAsJsonAsync(
            Rules(universe.Id),
            new SystemRuleRequest(
                "Words only with an exception",
                null,
                null,
                null,
                null,
                null,
                null,
                Parse("[{\"id\":\"ex\",\"scope\":{\"kind\":\"universe\"},\"when\":{\"kind\":\"always\",\"value\":\"true\"}}]")));

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
    }

    [Fact]
    public async Task An_exception_naming_a_rule_it_does_not_declare_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlexcdep");
        var other = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Other", null));

        var exceptions = $"[{{\"id\":\"ex\",\"scope\":{{\"kind\":\"universe\"}},"
                         + $"\"when\":{{\"kind\":\"ruleHolds\",\"ruleId\":\"{other.Id}\"}}}}]";

        var refused = await client.PostAsJsonAsync(
            Rules(universe.Id),
            new SystemRuleRequest("Dependent exception", null, null, 1, Parse(PurityAtLeast(2)), null, null, Parse(exceptions)));

        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("undeclared_dependency", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // Declared, it is accepted and the rule carries both.
        var accepted = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest(
                "Dependent exception",
                null,
                null,
                1,
                Parse(PurityAtLeast(2)),
                [other.Id],
                null,
                Parse(exceptions)));

        Assert.Equal([other.Id], accepted.DependsOn);
        Assert.NotNull(accepted.Exceptions);
    }

    [Fact]
    public async Task A_rule_on_a_dependency_cycle_cannot_be_stored_so_the_route_never_sees_one()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlevalcycle");
        var first = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("First", null));

        var second = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest(
                "Second",
                null,
                null,
                1,
                Parse($"{{\"kind\":\"ruleHolds\",\"ruleId\":\"{first.Id}\"}}"),
                [first.Id]));

        var closing = await client.PutAsJsonAsync(
            Rule(universe.Id, first.Id),
            new SystemRuleRequest(
                "First",
                null,
                null,
                1,
                Parse($"{{\"kind\":\"ruleHolds\",\"ruleId\":\"{second.Id}\"}}"),
                [second.Id],
                first.Version));

        Assert.Equal(HttpStatusCode.BadRequest, closing.StatusCode);

        // The rule set the evaluator loads is therefore acyclic, and the dependent rule evaluates.
        var result = await Evaluate(client, universe.Id, second.Id, null);
        Assert.Equal("unknown", result.Outcome);
        Assert.Null(result.ErrorCode);
    }

    [Fact]
    public async Task Evaluating_is_a_read_and_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlevalread");
        var (type, field) = await NumberField(client, universe.Id, "Purity");
        var piece = await EntityWithNumber(client, universe.Id, type, field, "Ingot", 1);

        var rule = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Purity floor", null, null, 1, Parse(PurityAtLeast(2))));

        await Evaluate(client, universe.Id, rule.Id, piece);
        await Evaluate(client, universe.Id, rule.Id, piece);

        await WithDb(_factory, async db =>
        {
            // No finding, no revision beyond the save's own, and the rule is still at version 1.
            Assert.Equal(1, await db.SystemRuleRevisions.CountAsync(revision => revision.RuleId == rule.Id));
            Assert.Equal(1, (await db.SystemRules.AsNoTracking().SingleAsync(candidate => candidate.Id == rule.Id)).Version);
            Assert.Equal(0, await db.CanonConflicts.CountAsync(conflict => conflict.UniverseId == universe.Id));
        });
    }

    [Fact]
    public async Task Access_to_evaluating_is_the_universes_and_an_outsider_sees_nothing()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "wlevalaccess");
        var rule = await PostJson<SystemRuleDetail>(owner, Rules(universe.Id), new SystemRuleRequest("Guarded", null));

        var outsider = await SignedIn(_factory, "user-wlevalaccess-outsider");
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await outsider.PostAsync($"{Rule(universe.Id, rule.Id)}/evaluate", null)).StatusCode);

        // A Viewer may evaluate, because evaluating is a read.
        var (viewer, viewerId) = await PublishingTestClient.Account(_factory, "wlevalaccess-viewer");
        await CollaborationTestClient.Join(_factory, universe.Id, viewerId, UniverseRole.Viewer);

        Assert.Equal(
            HttpStatusCode.OK,
            (await viewer.PostAsync($"{Rule(universe.Id, rule.Id)}/evaluate", null)).StatusCode);

        // A rule of another universe is not found through this one.
        var other = await CreateUniverse(owner, "World wlevalaccess other");
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await owner.PostAsync($"{Rule(other.Id, rule.Id)}/evaluate", null)).StatusCode);
    }

    // ---------- The world these tests evaluate over ----------

    private static async Task<ConditionEvaluationResponse> Evaluate(
        HttpClient client,
        Guid universeId,
        Guid ruleId,
        Guid? target,
        Guid? projectId = null)
    {
        var query = target is { } id ? $"?targetId={id}" : "?";
        if (projectId is { } project)
        {
            query += $"{(target is null ? string.Empty : "&")}projectId={project}";
        }

        var response = await client.PostAsync($"{Rule(universeId, ruleId)}/evaluate{query}", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ConditionEvaluationResponse>())!;
    }

    /// <summary>A number field on the Character type, which every universe starts with.</summary>
    private static async Task<(Guid Type, Guid Field)> NumberField(
        HttpClient client,
        Guid universeId,
        string name,
        Guid? onType = null)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        var type = onType ?? types.First(candidate => candidate.Name == "Character").Id;

        var field = await AiChangeTestClient.Field(
            client,
            universeId,
            type,
            new FieldDefinitionRequest(name, EntityFieldKind.Number, false, null, null, null));

        return (type, field.Id);
    }

    /// <summary>
    /// An entry of that type with that one field set. The values are written on the create, so nothing has to read
    /// the entry back and re-send every other field.
    /// </summary>
    private static async Task<Guid> EntityWithNumber(
        HttpClient client,
        Guid universeId,
        Guid type,
        Guid field,
        string name,
        double value) =>
        (await PostJson<EntityDetail>(
            client,
            $"/api/universes/{universeId}/entities",
            new EntityRequest(
                type,
                name,
                null,
                CanonStatus.Canon,
                null,
                null,
                [new FieldValueInput(field, null, value, null, null, null, null)]))).Id;

    private static async Task<Guid> RelationKind(HttpClient client, Guid universeId, string name) =>
        (await PostJson<RelationshipTypeResponse>(
            client,
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest(name, $"{name} by", false, null, null))).Id;

    private static async Task Relate(HttpClient client, Guid universeId, Guid kind, Guid from, Guid to) =>
        (await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationships",
            new { relationshipTypeId = kind, sourceEntityId = from, targetEntityId = to, canonStatus = CanonStatus.Canon }))
            .EnsureSuccessStatusCode();

    private static async Task Moment(
        HttpClient client,
        Guid universeId,
        string title,
        Guid eventKind,
        Guid method,
        Guid participant,
        int year)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/timeline",
            new
            {
                title,
                canonStatus = CanonStatus.Canon,
                startYear = year,
                validation = new { eventKindId = eventKind, methodId = method, participantEntityId = participant },
            });

        response.EnsureSuccessStatusCode();
    }

    private static string Rules(Guid universeId) => $"/api/universes/{universeId}/system-rules";

    private static string Rule(Guid universeId, Guid ruleId) => $"{Rules(universeId)}/{ruleId}";

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static string PurityAtLeast(int floor) =>
        "{\"kind\":\"compare\",\"left\":{\"attribute\":\"Purity\",\"of\":{\"subject\":\"self\"}},"
        + $"\"op\":\"gte\",\"right\":{{\"literal\":{floor},\"type\":\"number\"}}}}";
}
