using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A relationship type's Canon constraints, and the two rules that check Canon relationships
/// against them: <c>CANON-REL-002</c> for which end must be older, <c>CANON-REL-003</c> for how far
/// apart their birth years may be.
///
/// Two things run through all of it. Nothing is inferred from a name - a type means only what its
/// author configured - and a rule speaks only when the declared years prove a contradiction, so a
/// good half of what follows checks that LorEvolve stays quiet: on equal years, on missing years, on
/// years written before the eras, and on gaps the chronology cannot measure.
///
/// Both rules are Medium, so nothing here is ever refused. The lore is written straight through the
/// API, and several tests check that the conflict table follows each write without an evaluation.
/// Credentials are obviously synthetic.
/// </summary>
public sealed class CanonRelationshipAgeRuleTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";
    private const string OrderRule = "CANON-REL-002";
    private const string GapRule = "CANON-REL-003";

    private static readonly RelationshipTypeCanonConstraints SourceOlder =
        new(RelationshipAgeOrder.SourceOlder, null, null);

    private static readonly RelationshipTypeCanonConstraints SourceYounger =
        new(RelationshipAgeOrder.SourceYounger, null, null);

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- CANON-REL-002: which end is older ----------

    [Fact]
    public async Task A_source_born_first_keeps_a_source_older_rule()
    {
        var world = await NewWorld("agerel-olderok");
        var arlen = await Person(world, "Arlen", 4);
        var mira = await Person(world, "Mira", 12);
        var parent = await Kind(world, "parent of", SourceOlder);

        await Link(world, parent, arlen, mira);

        Assert.Equal(0, (await Evaluate(world)).Detected);
    }

    [Fact]
    public async Task A_source_born_later_breaks_a_source_older_rule_and_the_finding_says_why()
    {
        var world = await NewWorld("agerel-olderbad");
        var arlen = await Person(world, "Arlen", 12);
        var mira = await Person(world, "Mira", 4);
        var parent = await Kind(world, "parent of", SourceOlder);
        var link = await Link(world, parent, arlen, mira);

        await Evaluate(world);
        var conflict = Assert.Single(await Open(world, OrderRule));

        Assert.Equal(CanonConflictSeverity.Medium, conflict.Severity);
        Assert.Equal("“Arlen” should be older than “Mira” under “parent of”, but was born later", conflict.Title);
        Assert.Contains("“Arlen” was born in 12 and “Mira” in 4", conflict.Explanation, StringComparison.Ordinal);
        Assert.Contains("so “Arlen” is the younger of the two", conflict.Explanation, StringComparison.Ordinal);

        // The author reads names and years. Never an id, and never an enum name.
        Assert.DoesNotContain("SourceOlder", conflict.Explanation, StringComparison.Ordinal);
        Assert.DoesNotContain(parent.Id.ToString(), conflict.Explanation, StringComparison.OrdinalIgnoreCase);

        Assert.Contains(conflict.Subjects, subject =>
            subject is { Kind: CanonSubjectKind.Relationship, Role: "relationship" } && subject.SubjectId == link.Id);
        Assert.Contains(conflict.Subjects, subject =>
            subject is { Kind: CanonSubjectKind.Entity, Role: "source" } && subject.SubjectId == arlen.Id);
        Assert.Contains(conflict.Subjects, subject =>
            subject is { Kind: CanonSubjectKind.Entity, Role: "target" } && subject.SubjectId == mira.Id);

        // No gap was configured, so the gap rule has nothing to say.
        Assert.Empty(await Open(world, GapRule));
    }

    [Fact]
    public async Task A_source_younger_rule_is_kept_by_a_later_birth_and_broken_by_an_earlier_one()
    {
        var world = await NewWorld("agerel-younger");
        var arlen = await Person(world, "Arlen", 4);
        var mira = await Person(world, "Mira", 12);
        var bria = await Person(world, "Bria", 20);
        var apprentice = await Kind(world, "apprentice of", SourceYounger);

        await Link(world, apprentice, mira, arlen);
        await Link(world, apprentice, arlen, bria);

        await Evaluate(world);
        var conflict = Assert.Single(await Open(world, OrderRule));

        Assert.Equal("“Bria” should be older than “Arlen” under “apprentice of”, but was born later", conflict.Title);
        Assert.Contains("its source is younger than its target", conflict.Explanation, StringComparison.Ordinal);
        Assert.Contains("so “Arlen” is the older of the two", conflict.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Two_ends_born_in_the_same_year_prove_no_order()
    {
        var world = await NewWorld("agerel-sameyear");
        var arlen = await Person(world, "Arlen", 7);
        var mira = await Person(world, "Mira", 7);

        // A birth year is a whole year. Either could have been born first.
        await Link(world, await Kind(world, "parent of", SourceOlder), arlen, mira);
        await Link(world, await Kind(world, "apprentice of", SourceYounger), arlen, mira);

        Assert.Equal(0, (await Evaluate(world)).Detected);
    }

    [Fact]
    public async Task A_type_means_what_it_is_configured_to_mean_and_nothing_its_name_suggests()
    {
        var world = await NewWorld("agerel-names");
        var arlen = await Person(world, "Arlen", 12);
        var mira = await Person(world, "Mira", 4);

        // Worded exactly as a name-matching implementation would look for, and configured with nothing.
        await Link(world, await Kind(world, "parent of", constraints: null), arlen, mira);

        // Worded as nothing at all, and configured.
        await Link(world, await Kind(world, "banana", SourceOlder), arlen, mira);

        await Evaluate(world);
        var conflict = Assert.Single(await Open(world, OrderRule));
        Assert.Contains("“banana”", conflict.Title, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_link_is_judged_once_on_its_stored_direction_and_reversing_it_resolves_the_conflict()
    {
        var world = await NewWorld("agerel-direction");
        var arlen = await Person(world, "Arlen", 12);
        var mira = await Person(world, "Mira", 4);
        var parent = await Kind(world, "parent of", SourceOlder);
        var link = await Link(world, parent, arlen, mira);

        await Evaluate(world);
        var first = Assert.Single(await Open(world, OrderRule));

        // The link is shown on both entries; it is still one fact and one conflict, run after run.
        await Evaluate(world);
        Assert.Equal(first.Id, Assert.Single(await Open(world, OrderRule)).Id);

        var reversed = await world.Client.PutAsJsonAsync(
            $"/api/universes/{world.UniverseId}/relationships/{link.Id}",
            new RelationshipRequest(parent.Id, mira.Id, arlen.Id, CanonStatus.Canon, null, null, null));
        reversed.EnsureSuccessStatusCode();

        Assert.Empty(await Open(world, OrderRule));
    }

    // ---------- CANON-REL-003: how far apart ----------

    [Fact]
    public async Task A_gap_exactly_at_the_minimum_is_enough()
    {
        var world = await NewWorld("agerel-minok");
        var arlen = await Person(world, "Arlen", 4);
        var mira = await Person(world, "Mira", 16);

        await Link(world, await Kind(world, "parent of", Gap(12, null)), arlen, mira);

        Assert.Equal(0, (await Evaluate(world)).Detected);
    }

    [Fact]
    public async Task A_gap_below_the_minimum_is_reported_as_birth_years_apart()
    {
        var world = await NewWorld("agerel-minbad");
        var arlen = await Person(world, "Arlen", 4);
        var mira = await Person(world, "Mira", 12);

        await Link(world, await Kind(world, "parent of", Gap(12, null)), arlen, mira);

        await Evaluate(world);
        var conflict = Assert.Single(await Open(world, GapRule));

        Assert.Equal(CanonConflictSeverity.Medium, conflict.Severity);
        Assert.Equal("“Arlen” and “Mira” are born 8 years apart, but “parent of” needs at least 12 years", conflict.Title);
        Assert.Contains("requires an age difference of at least 12 years", conflict.Explanation, StringComparison.Ordinal);
        Assert.Contains("“Arlen”, born in 4, and “Mira”, born in 12", conflict.Explanation, StringComparison.Ordinal);
        Assert.Contains("Those birth years are 8 years apart", conflict.Explanation, StringComparison.Ordinal);
        Assert.Empty(await Open(world, OrderRule));
    }

    [Fact]
    public async Task A_gap_at_the_maximum_is_allowed_and_one_year_past_it_is_not()
    {
        var world = await NewWorld("agerel-max");
        var arlen = await Person(world, "Arlen", 10);
        var mira = await Person(world, "Mira", 40);
        var bria = await Person(world, "Bria", 41);
        var mentor = await Kind(world, "mentor of", Gap(null, 30));

        await Link(world, mentor, arlen, mira);
        await Link(world, mentor, arlen, bria);

        await Evaluate(world);
        var conflict = Assert.Single(await Open(world, GapRule));

        Assert.Contains("“Bria”", conflict.Title, StringComparison.Ordinal);
        Assert.Contains("allows an age difference of at most 30 years", conflict.Explanation, StringComparison.Ordinal);
        Assert.Contains("31 years apart", conflict.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_gap_inside_both_bounds_is_quiet()
    {
        var world = await NewWorld("agerel-between");
        var arlen = await Person(world, "Arlen", 10);
        var mira = await Person(world, "Mira", 40);

        await Link(world, await Kind(world, "parent of", new(RelationshipAgeOrder.SourceOlder, 12, 60)), arlen, mira);

        Assert.Equal(0, (await Evaluate(world)).Detected);
    }

    [Fact]
    public async Task A_gap_is_absolute_so_it_holds_either_way_round_and_apart_from_the_age_order()
    {
        var world = await NewWorld("agerel-absolute");
        var arlen = await Person(world, "Arlen", 12);
        var mira = await Person(world, "Mira", 4);

        // Wrong way round and too close: two facts, each separately fixable.
        await Link(world, await Kind(world, "parent of", new(RelationshipAgeOrder.SourceOlder, 12, null)), arlen, mira);

        // A symmetric kind has no older end, but its gap is the same from either side.
        await Link(world, await Kind(world, "sibling of", Gap(null, 5), isSymmetric: true), mira, arlen);

        await Evaluate(world);

        Assert.Single(await Open(world, OrderRule));
        Assert.Equal(2, (await Open(world, GapRule)).Count);
    }

    // ---------- Across a universe's own chronology ----------

    [Fact]
    public async Task The_age_order_compares_across_eras_by_their_configuration()
    {
        var world = await NewWorld("agerel-eraorder");
        var eras = await TheFall(world);
        var arlen = await Person(world, "Arlen", 5, eras.After);
        var mira = await Person(world, "Mira", 5, eras.Before);
        var parent = await Kind(world, "parent of", SourceOlder);

        // BF 5 is ten years before AF 5 would be if eras were labels; here it is simply earlier.
        await Link(world, parent, mira, arlen);
        await Link(world, parent, arlen, mira);

        await Evaluate(world);
        var conflict = Assert.Single(await Open(world, OrderRule));

        Assert.Contains("“Arlen” was born in AF 5 and “Mira” in BF 5", conflict.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_gap_across_the_fall_counts_no_year_zero()
    {
        var world = await NewWorld("agerel-eragap");
        var eras = await TheFall(world);
        var mira = await Person(world, "Mira", 5, eras.Before);
        var arlen = await Person(world, "Arlen", 5, eras.After);

        await Link(world, await Kind(world, "at least ten", Gap(10, null)), mira, arlen);
        await Link(world, await Kind(world, "at least nine", Gap(9, null)), mira, arlen);

        await Evaluate(world);
        var conflict = Assert.Single(await Open(world, GapRule));

        Assert.Contains("“at least ten”", conflict.Title, StringComparison.Ordinal);
        Assert.Contains("born in BF 5", conflict.Explanation, StringComparison.Ordinal);
        Assert.Contains("born in AF 5", conflict.Explanation, StringComparison.Ordinal);
        Assert.Contains("9 years apart", conflict.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_gap_inside_an_era_that_counts_down_is_measured_on_its_own_years()
    {
        var world = await NewWorld("agerel-downgap");
        var eras = await TheFall(world);
        var mira = await Person(world, "Mira", 20, eras.Before);
        var arlen = await Person(world, "Arlen", 10, eras.Before);

        await Link(world, await Kind(world, "twin in spirit of", Gap(null, 9)), mira, arlen);

        await Evaluate(world);
        Assert.Contains("10 years apart", Assert.Single(await Open(world, GapRule)).Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Across_several_eras_an_unmeasurable_gap_stands_down_while_the_order_still_holds()
    {
        var world = await NewWorld("agerel-threeeras");
        var eras = await Eras(
            world,
            ("The Dawn", "D", ChronologyEraDirection.Ascending),
            ("The Long Night", "N", ChronologyEraDirection.Descending),
            ("The Return", "R", ChronologyEraDirection.Ascending));

        var arlen = await Person(world, "Arlen", 1, eras[2]);
        var mira = await Person(world, "Mira", 1, eras[0]);
        var bria = await Person(world, "Bria", 90, eras[1]);
        var cato = await Person(world, "Cato", 3, eras[2]);
        var elder = await Kind(world, "elder of", new(RelationshipAgeOrder.SourceOlder, 100, null));

        // The Dawn has no recorded end, so D 1 to R 1 has no length - but R 1 is certainly later.
        await Link(world, elder, arlen, mira);

        // The Long Night counts down straight into The Return, so N 90 to R 3 is 92 years.
        await Link(world, elder, bria, cato);

        await Evaluate(world);

        var order = Assert.Single(await Open(world, OrderRule));
        Assert.Contains(order.Subjects, subject => subject.Role == "source" && subject.SubjectId == arlen.Id);

        var gap = Assert.Single(await Open(world, GapRule));
        Assert.Contains(gap.Subjects, subject => subject.Role == "source" && subject.SubjectId == bria.Id);
        Assert.Contains("92 years apart", gap.Explanation, StringComparison.Ordinal);
    }

    // ---------- Standing down ----------

    [Fact]
    public async Task A_missing_birth_year_on_either_end_proves_nothing()
    {
        var world = await NewWorld("agerel-missing");
        var arlen = await Person(world, "Arlen", null);
        var mira = await Person(world, "Mira", 4);
        var bria = await Person(world, "Bria", null);
        var strict = await Kind(world, "parent of", new(RelationshipAgeOrder.SourceOlder, 100, 101));

        await Link(world, strict, arlen, mira);
        await Link(world, strict, mira, bria);

        // Missing lore is not a contradiction, and no "missing birth year" finding is invented.
        Assert.Equal(0, (await Evaluate(world)).Detected);
    }

    [Fact]
    public async Task A_birth_year_written_before_the_eras_were_named_proves_nothing()
    {
        var world = await NewWorld("agerel-legacy");
        var arlen = await Person(world, "Arlen", 12);
        var mira = await Person(world, "Mira", 4);
        await Link(world, await Kind(world, "parent of", new(RelationshipAgeOrder.SourceOlder, 20, null)), arlen, mira);

        await Evaluate(world);
        Assert.Single(await Open(world, OrderRule));
        Assert.Single(await Open(world, GapRule));

        // Naming eras rewrites no year. These two are now in no era, so they are off the line.
        await TheFall(world);
        await Evaluate(world);

        Assert.Empty(await Open(world, OrderRule));
        Assert.Empty(await Open(world, GapRule));
    }

    [Fact]
    public async Task Only_a_canon_link_between_canon_entries_is_checked()
    {
        var world = await NewWorld("agerel-canon");
        var arlen = await Person(world, "Arlen", 12);
        var mira = await Person(world, "Mira", 4);
        var bria = await Person(world, "Bria", 2, status: CanonStatus.Draft);
        var parent = await Kind(world, "parent of", new(RelationshipAgeOrder.SourceOlder, 50, null));

        await Link(world, parent, arlen, mira, CanonStatus.Draft);
        await Link(world, parent, arlen, bria);

        await Evaluate(world);

        Assert.Empty(await Open(world, OrderRule));
        Assert.Empty(await Open(world, GapRule));

        // The draft end is still a finding - the one the structural rule was already making.
        Assert.Single(await Open(world, "CANON-REL-001"));
    }

    [Fact]
    public async Task A_universe_whose_types_carry_no_constraints_gains_no_findings()
    {
        var world = await NewWorld("agerel-unconstrained");
        var arlen = await Person(world, "Arlen", 12);
        var mira = await Person(world, "Mira", 4);
        var bria = await Person(world, "Bria", 900);

        await Link(world, await Kind(world, "parent of", constraints: null), arlen, mira);
        await Link(world, await Kind(world, "child of", constraints: null), mira, bria);
        await Link(world, await Kind(world, "sibling of", constraints: null, isSymmetric: true), bria, arlen);

        Assert.Equal(0, (await Evaluate(world)).Detected);
    }

    // ---------- Stored and reported, never refused ----------

    [Fact]
    public async Task A_rule_that_existing_links_break_is_saved_and_reported_at_once_and_clearing_it_resolves_them()
    {
        var world = await NewWorld("agerel-configure");
        var arlen = await Person(world, "Arlen", 12);
        var mira = await Person(world, "Mira", 4);
        var parent = await Kind(world, "parent of", constraints: null);
        await Link(world, parent, arlen, mira);

        // A constraint changes the rule being checked, not a fact. Nothing to refuse.
        var configured = await Configure(world, parent, new(RelationshipAgeOrder.SourceOlder, 12, null));
        Assert.Equal(HttpStatusCode.OK, configured.StatusCode);

        // Reconciled by the write itself - no evaluation was asked for.
        Assert.Single(await Open(world, OrderRule));
        Assert.Single(await Open(world, GapRule));

        var cleared = await Configure(world, parent, RelationshipTypeCanonConstraints.None);
        Assert.Equal(HttpStatusCode.OK, cleared.StatusCode);

        Assert.Empty(await Open(world, OrderRule));
        Assert.Empty(await Open(world, GapRule));
    }

    [Fact]
    public async Task A_link_that_breaks_its_types_rule_is_still_written_and_reported_at_once()
    {
        var world = await NewWorld("agerel-create");
        var arlen = await Person(world, "Arlen", 12);
        var mira = await Person(world, "Mira", 4);
        var parent = await Kind(world, "parent of", SourceOlder);

        var response = await world.Client.PostAsJsonAsync(
            $"/api/universes/{world.UniverseId}/relationships",
            new RelationshipRequest(parent.Id, arlen.Id, mira.Id, CanonStatus.Canon, null, null, null));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Single(await Open(world, OrderRule));
    }

    [Fact]
    public async Task Breaking_a_rule_by_editing_a_birth_year_is_saved_and_correcting_the_year_resolves_it()
    {
        var world = await NewWorld("agerel-edit");
        var arlen = await Person(world, "Arlen", 4);
        var mira = await Person(world, "Mira", 12);
        await Link(world, await Kind(world, "parent of", SourceOlder), arlen, mira);

        var broken = await SetBorn(world, arlen, 20);
        Assert.Equal(HttpStatusCode.OK, broken.StatusCode);
        Assert.Single(await Open(world, OrderRule));

        var corrected = await SetBorn(world, arlen, 2);
        Assert.Equal(HttpStatusCode.OK, corrected.StatusCode);
        Assert.Empty(await Open(world, OrderRule));
    }

    // ---------- Universe boundary ----------

    [Fact]
    public async Task Nothing_from_another_universe_enters_the_comparison()
    {
        var first = await NewWorld("agerel-scope");
        var arlen = await Person(first, "Arlen", 12);
        var mira = await Person(first, "Mira", 4);
        var link = await Link(first, await Kind(first, "parent of", SourceOlder), arlen, mira);

        // The same owner's second world: same names, a birth year each, a type with the same rule,
        // and no link. Neither world's years or constraints may reach the other.
        var second = await NewWorld("agerel-scope-two", first.Client);
        await Person(second, "Arlen", 1);
        await Person(second, "Mira", 90);
        await Kind(second, "parent of", SourceOlder);

        Assert.Equal(0, (await Evaluate(second)).Detected);

        await Evaluate(first);
        var conflict = Assert.Single(await Open(first, OrderRule));
        Assert.Equal(
            new[] { link.Id, arlen.Id, mira.Id }.Order(),
            conflict.Subjects.Select(subject => subject.SubjectId).Order());

        var stranger = await SignedInClient("user-agerel-scope-stranger");
        var probe = await stranger.GetAsync($"/api/universes/{first.UniverseId}/canon-conflicts?pageSize=100");
        Assert.Equal(HttpStatusCode.NotFound, probe.StatusCode);
    }

    // ---------- Helpers ----------

    private sealed record World(HttpClient Client, Guid UniverseId, Guid BornFieldId);

    private sealed record FallEras(Guid Before, Guid After);

    private static RelationshipTypeCanonConstraints Gap(int? min, int? max) =>
        new(RelationshipAgeOrder.None, min, max);

    /// <summary>A universe whose Character type declares a birth year, and nothing else.</summary>
    private async Task<World> NewWorld(string tag, HttpClient? client = null)
    {
        client ??= await SignedInClient($"user-{tag}");
        var universe = await CreateUniverse(client, $"World {tag}");
        var type = await CharacterType(client, universe.Id);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}/fields",
            new FieldDefinitionRequest("Born", EntityFieldKind.Number, false, null, null, null, EntityFieldSemantic.BirthYear));
        response.EnsureSuccessStatusCode();

        var born = (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!
            .Fields.First(field => field.Name == "Born");

        return new World(client, universe.Id, born.Id);
    }

    private static async Task<EntityDetail> Person(
        World world,
        string name,
        double? born,
        Guid? era = null,
        CanonStatus status = CanonStatus.Canon)
    {
        var type = await CharacterType(world.Client, world.UniverseId);

        var response = await world.Client.PostAsJsonAsync(
            $"/api/universes/{world.UniverseId}/entities",
            new EntityRequest(type.Id, name, null, status, null, null, Born(world, born, era)));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static Task<HttpResponseMessage> SetBorn(World world, EntityDetail entity, double? born, Guid? era = null) =>
        world.Client.PutVersionedAsync(
            $"/api/universes/{world.UniverseId}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId,
                entity.Name,
                entity.Summary,
                entity.CanonStatus,
                entity.Aliases,
                entity.Tags,
                Born(world, born, era)));

    private static List<FieldValueInput> Born(World world, double? year, Guid? era) =>
        year is { } value
            ? [new FieldValueInput(world.BornFieldId, null, value, null, null, null, null) with { EraId = era }]
            : [];

    private static async Task<RelationshipTypeResponse> Kind(
        World world,
        string name,
        RelationshipTypeCanonConstraints? constraints,
        bool isSymmetric = false)
    {
        var response = await world.Client.PostAsJsonAsync(
            $"/api/universes/{world.UniverseId}/relationship-types",
            new RelationshipTypeRequest(
                name, isSymmetric ? null : $"{name}, reversed", isSymmetric, null, null, constraints));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;
    }

    private static Task<HttpResponseMessage> Configure(
        World world,
        RelationshipTypeResponse type,
        RelationshipTypeCanonConstraints constraints) =>
        world.Client.PutAsJsonAsync(
            $"/api/universes/{world.UniverseId}/relationship-types/{type.Id}",
            new RelationshipTypeRequest(type.Name, type.InverseName, type.IsSymmetric, type.Description, null, constraints));

    private static async Task<RelationshipDetail> Link(
        World world,
        RelationshipTypeResponse type,
        EntityDetail source,
        EntityDetail target,
        CanonStatus status = CanonStatus.Canon)
    {
        var response = await world.Client.PostAsJsonAsync(
            $"/api/universes/{world.UniverseId}/relationships",
            new RelationshipRequest(type.Id, source.Id, target.Id, status, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipDetail>())!;
    }

    /// <summary>Before the Fall counts down to it, After the Fall counts up from it.</summary>
    private static async Task<FallEras> TheFall(World world)
    {
        var eras = await Eras(
            world,
            ("Before the Fall", "BF", ChronologyEraDirection.Descending),
            ("After the Fall", "AF", ChronologyEraDirection.Ascending));

        return new FallEras(eras[0], eras[1]);
    }

    private static async Task<IReadOnlyList<Guid>> Eras(
        World world,
        params (string Name, string Label, ChronologyEraDirection Direction)[] eras)
    {
        var response = await world.Client.PutAsJsonAsync(
            $"/api/universes/{world.UniverseId}/chronology",
            new ChronologyRequest(
            [
                .. eras.Select(era => new ChronologyEraRequest(
                    null, era.Name, era.Label, era.Direction, ChronologyLabelPosition.BeforeYear)),
            ]));
        response.EnsureSuccessStatusCode();

        return [.. (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras.Select(era => era.Id)];
    }

    private static async Task<CanonEvaluationResponse> Evaluate(World world)
    {
        var response = await world.Client.PostAsync(
            $"/api/universes/{world.UniverseId}/canon-conflicts/evaluate", content: null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CanonEvaluationResponse>())!;
    }

    /// <summary>One rule's conflicts that are still live, whatever the listing's default filter is.</summary>
    private static async Task<IReadOnlyList<CanonConflictResponse>> Open(World world, string ruleCode) =>
    [
        .. (await world.Client.GetFromJsonAsync<CanonConflictPage>(
                $"/api/universes/{world.UniverseId}/canon-conflicts?pageSize=100"))!
            .Items.Where(conflict => conflict.RuleCode == ruleCode && conflict.Status == CanonConflictStatus.Pending),
    ];

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<EntityTypeResponse> CharacterType(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!.First(type => type.Name == "Character");
}
