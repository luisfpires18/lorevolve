using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.WorldRules;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RuleValidationTestClient;
using static LorEvolve.Api.Tests.WorldRuleTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A world rule's structured check (ADR 0034): optional, one supported pattern, every part explicit and of this universe, saved
/// with the rule's words under the same stale-save protection - and a rule without one exactly the words it was.
/// </summary>
public sealed class WorldRuleValidationTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_rule_that_is_words_only_carries_no_check_and_is_listed_without_one()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrvwords");

        var rule = await CreateRule(client, universe.Id, "One resurrection per person", "Only once. Ever.");

        Assert.Null(rule.Validation);
        Assert.Null(rule.Check);
        Assert.Null((await ReadRule(client, universe.Id, rule.Id)).Check);
        Assert.False(Assert.Single((await ListRules(client, universe.Id)).Items).HasCheck);
    }

    [Fact]
    public async Task A_rule_is_given_the_limit_and_reads_it_back_by_id_with_the_terms_names()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrvcreate");
        var u = universe.Id;
        var kind = await EventKind(client, u, "Coronation");
        var method = await Method(client, u, "By the Salt Crown");

        var rule = await CreateCheckedRule(client, u, "Crowned twice at most", Limit(kind.Id, method.Id, 2));

        var read = await ReadRule(client, u, rule.Id);
        Assert.Equal(WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod, read.Validation!.Kind);
        Assert.Equal((kind.Id, "Coronation"), (read.Validation.EventKind.Id, read.Validation.EventKind.Name));
        Assert.Equal((method.Id, "By the Salt Crown"), (read.Validation.Method.Id, read.Validation.Method.Name));
        Assert.Equal(2, read.Validation.MaxOccurrences);
        Assert.Equal(WorldRuleCheckOutcome.Checked, read.Check!.Outcome);
        Assert.Equal((0, 0), (read.Check.CountedMoments, read.Check.ParticipantsOverLimit));
        Assert.True(Assert.Single((await ListRules(client, u)).Items).HasCheck);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(10_001)]
    [InlineData(null)]
    public async Task A_limit_must_be_a_whole_number_from_one_and_nothing_is_saved_otherwise(int? max)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, $"wrvmax{max?.ToString() ?? "none"}".Replace("-", "m", StringComparison.Ordinal));
        var u = universe.Id;
        var kind = await EventKind(client, u, "Coronation");
        var method = await Method(client, u, "By the Salt Crown");

        var errors = await Errors(await TryCreateRule(client, u, "Crowned", Limit(kind.Id, method.Id, max)));

        Assert.Contains(RuleValidationInput.MaxOccurrencesKey, errors, StringComparison.Ordinal);
        Assert.Empty((await ListRules(client, u)).Items);
    }

    [Fact]
    public async Task The_check_needs_an_event_kind_and_a_method_each_of_its_own_kind_and_of_this_universe()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrvparts");
        var u = universe.Id;
        var kind = await EventKind(client, u, "Coronation");
        var method = await Method(client, u, "By the Salt Crown");
        var elsewhere = await CreateUniverse(client, "World wrvparts elsewhere");
        var foreignMethod = await Method(client, elsewhere.Id, "By the Salt Crown");

        var missing = await Errors(await TryCreateRule(client, u, "Crowned", new WorldRuleValidationRequest(WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod, null, null, 1)));
        Assert.Contains(RuleValidationInput.EventKindKey, missing, StringComparison.Ordinal);
        Assert.Contains(RuleValidationInput.MethodKey, missing, StringComparison.Ordinal);

        // A method where an event kind belongs, and an event kind where a method belongs, are refused: kinds are never swapped.
        var swapped = await Errors(await TryCreateRule(client, u, "Crowned", Limit(method.Id, kind.Id, 1)));
        Assert.Contains("Choose an event kind from this universe.", swapped, StringComparison.Ordinal);
        Assert.Contains("Choose a method from this universe.", swapped, StringComparison.Ordinal);

        // Another universe's term and a made-up id read exactly the same.
        var foreign = await Errors(await TryCreateRule(client, u, "Crowned", Limit(kind.Id, foreignMethod.Id, 1)));
        var guessed = await Errors(await TryCreateRule(client, u, "Crowned", Limit(kind.Id, Guid.NewGuid(), 1)));
        Assert.Equal(foreign, guessed);

        var unknown = await client.PostAsJsonAsync(Rules(u), new { title = "Crowned", description = "", validation = new { kind = 9, eventKindId = kind.Id, methodId = method.Id, maxOccurrences = 1 } });
        Assert.Contains(RuleValidationInput.RuleKindKey, await Errors(unknown), StringComparison.Ordinal);

        Assert.Empty((await ListRules(client, u)).Items);
    }

    [Fact]
    public async Task A_check_is_changed_kept_when_a_save_leaves_it_out_and_removed_leaving_the_words()
    {
        var world = await NewCheckedWorld(_factory, "wrvchange");
        var client = world.Client;
        var u = world.Universe;

        var changed = await SaveCheck(client, u, world.Rule, Limit(world.Resurrection, world.SevenStones, 3));
        Assert.Equal((world.SevenStones, 3), (changed.Validation!.Method.Id, changed.Validation.MaxOccurrences));
        Assert.True(changed.UpdatedAt > world.Rule.UpdatedAt);

        // A client that knows nothing of checks saves the words and keeps the check.
        var wordsOnly = await SaveCheck(client, u, changed, null, title: "Renamed by an older screen");
        Assert.Equal("Renamed by an older screen", wordsOnly.Title);
        Assert.Equal((world.SevenStones, 3), (wordsOnly.Validation!.Method.Id, wordsOnly.Validation.MaxOccurrences));

        var removed = await SaveCheck(client, u, wordsOnly, NoCheck);
        Assert.Null(removed.Validation);
        Assert.Null(removed.Check);
        Assert.Equal(("Renamed by an older screen", "Words nothing reads."), (removed.Title, removed.Description));
        Assert.False(Assert.Single((await ListRules(client, u)).Items).HasCheck);
        await WithDb(_factory, async db => Assert.False(await db.WorldRuleValidations.AnyAsync(validation => validation.WorldRuleId == world.Rule.Id)));
    }

    [Fact]
    public async Task A_save_changing_nothing_writes_nothing_and_a_stale_save_carrying_a_check_is_refused()
    {
        var world = await NewCheckedWorld(_factory, "wrvstale");
        var client = world.Client;
        var u = world.Universe;

        var same = await SaveCheck(client, u, world.Rule, Limit(world.Resurrection, world.RiteOfAsh, 1));
        Assert.Equal(world.Rule.UpdatedAt, same.UpdatedAt);

        var elsewhere = await SaveCheck(client, u, world.Rule, Limit(world.Resurrection, world.RiteOfAsh, 2));

        // Written over the version this tab opened, which has moved on.
        var stale = await TrySaveCheck(client, u, world.Rule, NoCheck);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains(WorldRuleEndpoints.ChangedCode, await stale.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var stored = await ReadRule(client, u, world.Rule.Id);
        Assert.Equal((2, elsewhere.UpdatedAt), (stored.Validation!.MaxOccurrences, stored.UpdatedAt));
    }

    [Fact]
    public async Task Another_account_can_neither_read_nor_set_a_rules_check_nor_point_its_own_at_these_terms()
    {
        var world = await NewCheckedWorld(_factory, "wrvowner");
        var (other, otherUniverse) = await SignedInWithUniverse(_factory, "wrvowner-other");
        var u = world.Universe;

        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Rule(u, world.Rule.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await TrySaveCheck(other, u, world.Rule, NoCheck)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await TryCreateRule(other, u, "Mine now", Limit(world.Resurrection, world.RiteOfAsh, 1))).StatusCode);

        var borrowed = await Errors(await TryCreateRule(other, otherUniverse.Id, "Borrowed", Limit(world.Resurrection, world.RiteOfAsh, 1)));
        Assert.Contains("Choose an event kind from this universe.", borrowed, StringComparison.Ordinal);

        Assert.Equal(1, (await world.ReadRule()).Validation!.MaxOccurrences);
    }

    [Fact]
    public async Task A_rule_comes_back_from_the_Trash_with_its_check()
    {
        var world = await NewCheckedWorld(_factory, "wrvtrash");

        await DeleteRule(world.Client, world.Universe, world.Rule.Id);
        var restored = await RestoreRule(world.Client, world.Universe, world.Rule.Id);

        Assert.Equal((world.RiteOfAsh, 1), (restored.Validation!.Method.Id, restored.Validation.MaxOccurrences));
        Assert.Equal(WorldRuleCheckOutcome.Checked, restored.Check!.Outcome);
    }
}
