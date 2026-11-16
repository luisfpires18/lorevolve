using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.Systems;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A universe backup carries its World Logic, and a restore puts it back (#150, ADR 0072, ADR 0032).
///
/// <para>The part that would be silently wrong is the ids inside a condition. A restore gives every record a new id,
/// so a condition carried through unchanged would name rows that are not in the restored universe: the rule would
/// still be there, still look right, and quietly mean nothing. These tests write a condition that names a rule and a
/// subject by id, send the world through an export and a restore, and assert the stored text came back pointing at
/// the restored rows.</para>
///
/// <para>The other part is the promise that nothing of ADR 0033 or ADR 0034 changed: a world rule and its occurrence
/// check have to survive a round trip exactly as they did before World Logic existed.</para>
/// </summary>
public sealed class WorldLogicBackupTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task The_format_is_at_the_world_logic_version()
    {
        Assert.Equal(48, UniverseBackup.CurrentVersion);
        Assert.Equal(UniverseBackup.CurrentVersion, LorEvolve.Api.Features.Restore.BackupFormatSupport.MaxVersion);
    }

    [Fact]
    public async Task A_backup_carries_every_system_rule_link_dependency_and_saved_state()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlbackup");

        var baseRule = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Base", "The floor.", null, 1, Parse(PurityAtLeast(2))));

        var derived = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Derived", "Depends on the floor.", null, 1, Parse(Holds(baseRule.Id)), [baseRule.Id]));

        // A second version of the base rule, so it has a saved state with a different condition.
        await PutJson<SystemRuleDetail>(
            client,
            Rule(universe.Id, baseRule.Id),
            new SystemRuleRequest("Base", "The floor.", null, 1, Parse(PurityAtLeast(3)), null, baseRule.Version));

        var system = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Runeforging", "Metal."));
        await PutJson<SystemDetail>(client, $"{System(universe.Id, system.Id)}/rules/{derived.Id}?sortOrder=0", new { });
        await PutJson<SystemDetail>(client, $"{System(universe.Id, system.Id)}/rules/{baseRule.Id}?sortOrder=1", new { });

        // A rule no System references is still carried: it is a definition in its own right.
        var loose = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Loose", null));

        var backup = await Backup(client, universe.Id);
        var payload = backup.Payload;

        Assert.Equal(48, backup.FormatVersion);

        var carriedSystem = Assert.Single(payload.LoreSystems!);
        Assert.Equal("Runeforging", carriedSystem.Name);
        Assert.Equal(WorldLogicScope.Universe, carriedSystem.Scope);
        Assert.Null(carriedSystem.ProjectId);
        Assert.Equal([derived.Id, baseRule.Id], carriedSystem.RuleIds);
        Assert.Single(carriedSystem.Revisions);

        var rules = payload.SystemRules!;
        Assert.Equal(["Base", "Derived", "Loose"], rules.Select(rule => rule.Title));

        var carriedBase = rules.Single(rule => rule.Title == "Base");
        Assert.Equal(1, carriedBase.SchemaVersion);
        Assert.Contains("\"literal\":3", carriedBase.Condition!, StringComparison.Ordinal);
        Assert.Equal([1, 2], carriedBase.Revisions.Select(revision => revision.Version));
        Assert.Contains("\"literal\":2", carriedBase.Revisions[0].Condition!, StringComparison.Ordinal);

        var carriedDerived = rules.Single(rule => rule.Title == "Derived");
        Assert.Equal([baseRule.Id], carriedDerived.DependsOn);
        Assert.Contains(baseRule.Id.ToString(), carriedDerived.Condition!, StringComparison.OrdinalIgnoreCase);

        var carriedLoose = rules.Single(rule => rule.Id == loose.Id);
        Assert.Null(carriedLoose.Condition);
        Assert.Null(carriedLoose.SchemaVersion);
        Assert.Empty(carriedLoose.DependsOn);
    }

    /// <summary>
    /// The one that matters: a restored condition names the restored universe's rows, not the exported universe's.
    /// </summary>
    [Fact]
    public async Task A_restore_translates_every_id_inside_a_condition()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlrestore");
        var subject = await CreateEntity(client, universe.Id, "Ember Vale");

        var baseRule = await PostJson<SystemRuleDetail>(client, Rules(universe.Id), new SystemRuleRequest("Base", null));

        // A condition that names both a rule and an entry by id, which are the two kinds of reference a restore has
        // to translate.
        var condition = "{\"kind\":\"all\",\"of\":["
                        + Holds(baseRule.Id)
                        + ",{\"kind\":\"compare\",\"left\":{\"attribute\":\"purity\",\"of\":{\"subject\":\""
                        + subject
                        + "\"}},\"op\":\"gte\",\"right\":{\"literal\":1,\"type\":\"number\"}}]}";

        var derived = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Derived", null, null, 1, Parse(condition), [baseRule.Id]));

        var system = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Logic", null));
        await PutJson<SystemDetail>(client, $"{System(universe.Id, system.Id)}/rules/{derived.Id}", new { });

        var restored = await RestoreArchive(client, await RawArchive(client, universe.Id), "World wlrestore restored");

        Assert.NotEqual(universe.Id, restored.Id);

        var restoredRules = (await client.GetFromJsonAsync<WorldLogicPage<SystemRuleSummary>>(Rules(restored.Id)))!;
        Assert.Equal(2, restoredRules.TotalCount);

        var restoredBase = restoredRules.Items.Single(rule => rule.Title == "Base");
        var restoredDerived = (await client.GetFromJsonAsync<SystemRuleDetail>(
            Rule(restored.Id, restoredRules.Items.Single(rule => rule.Title == "Derived").Id)))!;

        // New ids throughout, and the declared dependency points at the restored base rule.
        Assert.NotEqual(baseRule.Id, restoredBase.Id);
        Assert.NotEqual(derived.Id, restoredDerived.Id);
        Assert.Equal([restoredBase.Id], restoredDerived.DependsOn);

        var text = restoredDerived.Condition!.Value.GetRawText();
        Assert.Contains(restoredBase.Id.ToString(), text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(baseRule.Id.ToString(), text, StringComparison.OrdinalIgnoreCase);

        // The entry the condition names is the restored entry, and the old entry's id is gone from the tree.
        var restoredSubject = await WithEntityNamed(restored.Id, "Ember Vale");
        Assert.NotEqual(subject, restoredSubject);
        Assert.Contains(restoredSubject.ToString(), text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(subject.ToString(), text, StringComparison.OrdinalIgnoreCase);

        // The System came back with its link, pointing at the restored rule.
        var restoredSystem = (await client.GetFromJsonAsync<WorldLogicPage<SystemSummary>>(Systems(restored.Id)))!;
        var detail = (await client.GetFromJsonAsync<SystemDetail>(System(restored.Id, restoredSystem.Items[0].Id)))!;
        Assert.Equal([restoredDerived.Id], detail.Rules.Select(rule => rule.Id));
    }

    /// <summary>
    /// The promise to ADR 0033 and ADR 0034: a world rule and its occurrence check travel exactly as they did, and a
    /// restored universe's World Logic is empty when the exported one had none.
    /// </summary>
    [Fact]
    public async Task A_world_rule_and_its_occurrence_check_still_survive_a_round_trip()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlcompat");

        var eventKind = await RuleValidationTestClient.EventKind(client, universe.Id, "Resurrection");
        var method = await RuleValidationTestClient.Method(client, universe.Id, "Rite of Ash");

        var checked_ = await RuleValidationTestClient.CreateCheckedRule(
            client,
            universe.Id,
            "One resurrection per person",
            RuleValidationTestClient.Limit(eventKind.Id, method.Id, 1),
            "By that rite, once.");

        var wordsOnly = await RuleValidationTestClient.CreateCheckedRule(client, universe.Id, "Blink has a cost", null);

        var backup = await Backup(client, universe.Id);
        Assert.Empty(backup.Payload.LoreSystems!);
        Assert.Empty(backup.Payload.SystemRules!);

        var carried = backup.Payload.WorldRules!.Single(rule => rule.Id == checked_.Id);
        Assert.Equal(WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod, carried.Validation!.Kind);
        Assert.Equal(1, carried.Validation.MaxOccurrences);
        Assert.Null(backup.Payload.WorldRules!.Single(rule => rule.Id == wordsOnly.Id).Validation);

        var restored = await RestoreArchive(client, await RawArchive(client, universe.Id), "World wlcompat restored");

        var restoredRules = (await client.GetFromJsonAsync<JsonElement>($"/api/universes/{restored.Id}/world-rules"))!;
        var titles = restoredRules.GetProperty("items").EnumerateArray()
            .Select(row => row.GetProperty("title").GetString())
            .ToList();

        Assert.Equal(["Blink has a cost", "One resurrection per person"], titles.Order(StringComparer.Ordinal));

        await WithDb(_factory, async db =>
        {
            // The check came back, with terms of the restored universe rather than the exported one.
            var restoredCheck = await db.WorldRuleValidations
                .IgnoreQueryFilters()
                .Include(validation => validation.WorldRule)
                .Include(validation => validation.EventKindTerm)
                .Include(validation => validation.MethodTerm)
                .SingleAsync(validation => validation.WorldRule!.UniverseId == restored.Id);

            Assert.Equal(1, restoredCheck.MaxOccurrences);
            Assert.Equal("Resurrection", restoredCheck.EventKindTerm!.Name);
            Assert.Equal("Rite of Ash", restoredCheck.MethodTerm!.Name);
            Assert.NotEqual(eventKind.Id, restoredCheck.EventKindTermId);

            // And the restored universe has no World Logic, because the exported one had none.
            Assert.Empty(await db.LoreSystems.Where(system => system.UniverseId == restored.Id).ToListAsync());
            Assert.Empty(await db.SystemRules.Where(rule => rule.UniverseId == restored.Id).ToListAsync());
        });
    }

    /// <summary>
    /// An export of a restore matches the export it was restored from, which is what proves nothing was dropped or
    /// invented on the way through. Ids differ by design, so they are the one thing normalised away.
    /// </summary>
    [Fact]
    public async Task An_export_of_a_restore_says_the_same_thing_as_the_export_it_came_from()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wlround");

        var first = await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Base", "Words.", null, 1, Parse(PurityAtLeast(2))));

        await PostJson<SystemRuleDetail>(
            client,
            Rules(universe.Id),
            new SystemRuleRequest("Derived", null, null, 1, Parse(Holds(first.Id)), [first.Id]));

        var system = await PostJson<SystemDetail>(client, Systems(universe.Id), new SystemRequest("Logic", "A set."));
        await PutJson<SystemDetail>(client, $"{System(universe.Id, system.Id)}/rules/{first.Id}", new { });

        var before = await Backup(client, universe.Id);
        var restored = await RestoreArchive(client, await RawArchive(client, universe.Id), "World wlround restored");
        var after = await Backup(client, restored.Id);

        Assert.Equal(
            Shape(before.Payload.LoreSystems!, before.Payload.SystemRules!),
            Shape(after.Payload.LoreSystems!, after.Payload.SystemRules!));
    }

    /// <summary>
    /// Everything the two sides must agree on, with every id left out: ids are new after a restore by design, and
    /// comparing the shape is what catches a dropped link, a lost revision or a condition that came back changed.
    /// </summary>
    private static string Shape(
        IReadOnlyList<BackupLoreSystem> systems,
        IReadOnlyList<BackupSystemRule> rules)
    {
        var titles = rules.ToDictionary(rule => rule.Id, rule => rule.Title);

        var systemShape = systems.Select(system => new
        {
            system.Name,
            system.Summary,
            system.Scope,
            system.Version,
            Rules = system.RuleIds.Select(id => titles[id]).ToList(),
            Revisions = system.Revisions.Select(revision => new { revision.Version, revision.Title, revision.Body }).ToList(),
        });

        var ruleShape = rules.Select(rule => new
        {
            rule.Title,
            rule.Description,
            rule.Scope,
            rule.SchemaVersion,
            rule.Version,
            DependsOn = rule.DependsOn.Select(id => titles[id]).Order(StringComparer.Ordinal).ToList(),

            // The condition's own ids are translated on restore, so what is compared is its shape with every GUID
            // blanked out: the tree, the operators and the literals have to be identical.
            Condition = Blank(rule.Condition),
            Revisions = rule.Revisions
                .Select(revision => new { revision.Version, revision.Title, revision.Body, Condition = Blank(revision.Condition) })
                .ToList(),
        });

        return JsonSerializer.Serialize(new { Systems = systemShape, Rules = ruleShape });
    }

    private static string? Blank(string? condition) =>
        condition is null
            ? null
            : global::System.Text.RegularExpressions.Regex.Replace(
                condition,
                "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
                "(id)");

    private async Task<Guid> WithEntityNamed(Guid universeId, string name)
    {
        var found = Guid.Empty;
        await WithDb(_factory, async db =>
        {
            found = await db.Entities
                .Where(entity => entity.UniverseId == universeId && entity.Name == name)
                .Select(entity => entity.Id)
                .SingleAsync();
        });

        return found;
    }

    private static string Systems(Guid universeId) => $"/api/universes/{universeId}/systems";

    private static string System(Guid universeId, Guid systemId) => $"{Systems(universeId)}/{systemId}";

    private static string Rules(Guid universeId) => $"/api/universes/{universeId}/system-rules";

    private static string Rule(Guid universeId, Guid ruleId) => $"{Rules(universeId)}/{ruleId}";

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static string Holds(Guid ruleId) => $"{{\"kind\":\"ruleHolds\",\"ruleId\":\"{ruleId}\"}}";

    private static string PurityAtLeast(int floor) =>
        "{\"kind\":\"compare\",\"left\":{\"attribute\":\"purity\",\"of\":{\"subject\":\"self\"}},"
        + $"\"op\":\"gte\",\"right\":{{\"literal\":{floor},\"type\":\"number\"}}}}";
}
