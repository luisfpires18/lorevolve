using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.RuleValidation;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RuleValidationTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A universe's event kinds and methods (ADR 0034): listed, created with a name unique per kind in any case, renamed without
/// changing a single match, deleted only while nothing names them, and never reachable from another account or universe.
/// </summary>
public sealed class ValidationTermEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Terms_are_listed_event_kinds_first_and_then_by_name_with_nothing_using_them()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "vtlist");

        await Method(client, universe.Id, "Seven Stones");
        await EventKind(client, universe.Id, "Resurrection");
        await Method(client, universe.Id, "rite of Ash");

        var terms = await ListTerms(client, universe.Id);

        Assert.Equal(
            [(ValidationTermKind.EventKind, "Resurrection"), (ValidationTermKind.Method, "rite of Ash"), (ValidationTermKind.Method, "Seven Stones")],
            terms.Select(term => (term.Kind, term.Name)));
        Assert.All(terms, term => Assert.Equal((0, 0), (term.RuleCount, term.MomentCount)));
    }

    [Fact]
    public async Task A_name_is_required_trimmed_bounded_and_unique_per_kind_whatever_its_case()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "vtnames");
        var u = universe.Id;

        Assert.Contains("\"name\"", await Errors(await client.PostAsJsonAsync(Terms(u), new ValidationTermRequest(ValidationTermKind.Method, "   "))));
        Assert.Contains("\"name\"", await Errors(await client.PostAsJsonAsync(Terms(u), new ValidationTermRequest(ValidationTermKind.Method, new string('m', 81)))));

        var ash = await Method(client, u, "  Rite of Ash  ");
        Assert.Equal("Rite of Ash", ash.Name);

        var taken = await Errors(await client.PostAsJsonAsync(Terms(u), new ValidationTermRequest(ValidationTermKind.Method, "RITE OF ASH")));
        Assert.Contains("already has a method", taken, StringComparison.Ordinal);

        // The same name as the other kind is another term, and a name at the bound is kept.
        var eventKind = await EventKind(client, u, "Rite of Ash");
        Assert.NotEqual(ash.Id, eventKind.Id);
        Assert.Equal(80, (await Method(client, u, new string('m', 80))).Name.Length);
    }

    [Fact]
    public async Task Names_in_any_script_are_kept_exactly_and_an_unknown_kind_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "vtscripts");

        var arabic = await EventKind(client, universe.Id, "إحياء الموتى");
        var japanese = await Method(client, universe.Id, "復活の儀 — 灰");

        Assert.Equal("إحياء الموتى", arabic.Name);
        Assert.Equal("復活の儀 — 灰", japanese.Name);

        var unknown = await client.PostAsJsonAsync(Terms(universe.Id), new { kind = 7, name = "Omen" });
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
    }

    [Fact]
    public async Task A_rename_keeps_every_match_and_rewords_the_finding_in_place()
    {
        var world = await NewCheckedWorld(_factory, "vtrename");
        await world.Occurrence("The first return", world.Arlen);
        await world.Occurrence("The second return", world.Arlen);
        var before = Assert.Single(await world.Findings());
        Assert.Contains("Rite of Ash", before.Explanation, StringComparison.Ordinal);

        var renamed = await RenameTerm(world.Client, world.Universe, world.RiteOfAsh, "Ashen Rite");
        renamed.EnsureSuccessStatusCode();

        var after = Assert.Single(await world.Findings());
        Assert.Equal(before.Id, after.Id);
        Assert.Contains("Ashen Rite", after.Explanation, StringComparison.Ordinal);
        Assert.DoesNotContain("Rite of Ash", after.Explanation, StringComparison.Ordinal);
        Assert.Equal("Ashen Rite", (await world.ReadRule()).Validation!.Method.Name);

        // Renaming onto another method's name, in any case, is refused and changes nothing.
        Assert.Contains("already has a method", await Errors(await RenameTerm(world.Client, world.Universe, world.RiteOfAsh, "seven STONES")), StringComparison.Ordinal);
        Assert.Equal("Ashen Rite", (await world.ReadRule()).Validation!.Method.Name);
    }

    [Fact]
    public async Task A_term_a_rule_or_a_moment_names_cannot_be_deleted_even_from_the_Trash_and_an_unused_one_can()
    {
        var world = await NewCheckedWorld(_factory, "vtdelete");
        var client = world.Client;
        var u = world.Universe;

        var refused = await client.DeleteAsync(Term(u, world.RiteOfAsh));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains(ValidationTermEndpoints.InUseCode, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // A rule in the Trash still holds its check, so the term is still in use.
        await WorldRuleTestClient.DeleteRule(client, u, world.Rule.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync(Term(u, world.RiteOfAsh))).StatusCode);
        Assert.Equal(1, (await ListTerms(client, u)).Single(term => term.Id == world.RiteOfAsh).RuleCount);

        await CreateMoment(client, u, Moment("A stone is spent", Details(null, world.SevenStones, null)));
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync(Term(u, world.SevenStones))).StatusCode);
        Assert.Equal(1, (await ListTerms(client, u)).Single(term => term.Id == world.SevenStones).MomentCount);

        var unused = await Method(client, u, "A typo");
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Term(u, unused.Id))).StatusCode);
        Assert.DoesNotContain(await ListTerms(client, u), term => term.Id == unused.Id);
    }

    [Fact]
    public async Task Another_account_another_universe_and_a_guessed_id_all_answer_the_same_404()
    {
        var world = await NewCheckedWorld(_factory, "vtowner");
        var other = await SignedIn(_factory, "user-vtowner-other");
        var u = world.Universe;

        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(Terms(u))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync(Terms(u), new ValidationTermRequest(ValidationTermKind.Method, "Intruder"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await RenameTerm(other, u, world.RiteOfAsh, "Taken over")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.DeleteAsync(Term(u, world.RiteOfAsh))).StatusCode);

        // The owner's own second universe cannot reach the first one's term, and a made-up id is nothing.
        var second = await CreateUniverse(world.Client, "World vtowner second");
        Assert.Equal(HttpStatusCode.NotFound, (await RenameTerm(world.Client, second.Id, world.RiteOfAsh, "Moved")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await world.Client.DeleteAsync(Term(second.Id, world.RiteOfAsh))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await RenameTerm(world.Client, u, Guid.NewGuid(), "Nothing")).StatusCode);

        Assert.Equal("Rite of Ash", (await ListTerms(world.Client, u)).Single(term => term.Id == world.RiteOfAsh).Name);
        Assert.Empty(await ListTerms(world.Client, second.Id));
    }
}
