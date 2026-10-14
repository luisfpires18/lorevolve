using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// The semantic field codes and the three chronology rules that read them: a lifespan that
/// runs backwards, and a Canon moment a participant could not have been at.
///
/// The theme running through these is restraint. A rule here fires only on a contradiction
/// that can be proved from what the author actually wrote, so most of what follows checks
/// that Lorex stays quiet - about approximate dates, about ranges that merely overlap a
/// boundary, about universes keeping time in two reckonings, and about the boundary years
/// themselves. Credentials are obviously synthetic.
/// </summary>
public sealed class CanonChronologyRuleTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Semantic field assignment ----------

    [Fact]
    public async Task An_ordinary_field_carries_no_meaning()
    {
        var (client, universe) = await SignedInWithUniverse("semnone");
        var type = await CharacterType(client, universe.Id);

        var field = await AddField(client, universe.Id, type.Id, "Height", EntityFieldKind.Number);

        Assert.Null(field.Semantic);
    }

    [Fact]
    public async Task A_number_field_may_be_declared_a_birth_year()
    {
        var (client, universe) = await SignedInWithUniverse("semnumber");
        var type = await CharacterType(client, universe.Id);

        var field = await AddField(
            client, universe.Id, type.Id, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);

        Assert.Equal(EntityFieldSemantic.BirthYear, field.Semantic);
    }

    [Fact]
    public async Task An_age_may_be_declared_even_though_no_rule_reads_it_yet()
    {
        var (client, universe) = await SignedInWithUniverse("semage");
        var type = await CharacterType(client, universe.Id);

        var field = await AddField(
            client, universe.Id, type.Id, "Age", EntityFieldKind.Number, EntityFieldSemantic.Age);

        Assert.Equal(EntityFieldSemantic.Age, field.Semantic);
    }

    [Fact]
    public async Task A_year_meaning_is_refused_on_a_field_that_cannot_hold_a_year()
    {
        var (client, universe) = await SignedInWithUniverse("semkind");
        var type = await CharacterType(client, universe.Id);

        var response = await PostField(
            client,
            universe.Id,
            type.Id,
            new FieldDefinitionRequest(
                "Born", EntityFieldKind.ShortText, false, null, null, null, EntityFieldSemantic.BirthYear));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("semantic", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_meaning_lorex_does_not_know_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("semunknown");
        var type = await CharacterType(client, universe.Id);

        var response = await PostField(
            client,
            universe.Id,
            type.Id,
            new FieldDefinitionRequest(
                "Born", EntityFieldKind.Number, false, null, null, null, (EntityFieldSemantic)99));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task One_type_cannot_have_two_fields_meaning_the_same_thing()
    {
        var (client, universe) = await SignedInWithUniverse("semdup");
        var type = await CharacterType(client, universe.Id);
        await AddField(client, universe.Id, type.Id, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);

        var response = await PostField(
            client,
            universe.Id,
            type.Id,
            new FieldDefinitionRequest(
                "Year of birth", EntityFieldKind.Number, false, null, null, null, EntityFieldSemantic.BirthYear));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_field_cannot_be_edited_into_a_meaning_another_field_already_has()
    {
        var (client, universe) = await SignedInWithUniverse("semdupedit");
        var type = await CharacterType(client, universe.Id);
        await AddField(client, universe.Id, type.Id, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);
        var other = await AddField(client, universe.Id, type.Id, "Height", EntityFieldKind.Number);

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}/fields/{other.Id}",
            new FieldDefinitionRequest(
                "Height", EntityFieldKind.Number, false, null, null, null, EntityFieldSemantic.BirthYear));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Two_universes_may_each_declare_their_own_birth_year_field()
    {
        var (client, first) = await SignedInWithUniverse("semscope");
        var second = await CreateUniverse(client, "World semscope two");

        var firstField = await AddField(
            client, first.Id, (await CharacterType(client, first.Id)).Id,
            "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);

        var secondField = await AddField(
            client, second.Id, (await CharacterType(client, second.Id)).Id,
            "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);

        // The meaning is unique per type, not per installation.
        Assert.NotEqual(firstField.Id, secondField.Id);
    }

    [Fact]
    public async Task A_field_cannot_be_declared_on_a_type_from_another_universe()
    {
        var (client, mine) = await SignedInWithUniverse("semforeign");
        var stranger = await SignedInClient("user-semforeign-other");
        var theirs = await CreateUniverse(stranger, "Their world");
        var theirType = await CharacterType(stranger, theirs.Id);

        var response = await PostField(
            client,
            mine.Id,
            theirType.Id,
            new FieldDefinitionRequest(
                "Born", EntityFieldKind.Number, false, null, null, null, EntityFieldSemantic.BirthYear));

        // The type id is re-resolved inside the caller's own universe, so a foreign id is
        // simply not found there. No body, and nothing said about whether it exists.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }

    // ---------- CANON-LIFE-001: a lifespan that runs backwards ----------

    [Fact]
    public async Task A_life_that_runs_forwards_is_no_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("lifeok");
        var fields = await LifespanFields(client, universe.Id);
        await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task Dying_before_being_born_is_a_high_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("lifeback");
        var fields = await LifespanFields(client, universe.Id);
        await Character(client, universe.Id, "Elendil", fields, birth: 3441, death: 3119);

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        Assert.Equal(CanonConflictSeverity.High, conflict.Severity);
        Assert.Equal(CanonConflictStatus.Pending, conflict.Status);

        // Both years are in the text, so the author is not sent hunting for them.
        Assert.Contains("3441", conflict.Explanation, StringComparison.Ordinal);
        Assert.Contains("3119", conflict.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Being_born_and_dying_in_the_same_year_is_ordinary_lore()
    {
        var (client, universe) = await SignedInWithUniverse("lifesame");
        var fields = await LifespanFields(client, universe.Id);
        await Character(client, universe.Id, "Elendil", fields, birth: 3441, death: 3441);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task A_conflicting_life_names_the_entity_and_both_fields()
    {
        var (client, universe) = await SignedInWithUniverse("lifesubjects");
        var fields = await LifespanFields(client, universe.Id);
        var entity = await Character(client, universe.Id, "Elendil", fields, birth: 3441, death: 3119);

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        var subject = Assert.Single(conflict.Subjects, s => s.Kind == CanonSubjectKind.Entity);
        Assert.Equal(entity.Id, subject.SubjectId);
        Assert.Equal("entity", subject.Role);

        Assert.Contains(conflict.Subjects, s =>
            s.Kind == CanonSubjectKind.EntityField && s.SubjectId == fields.Birth.Id && s.Role == "birth");
        Assert.Contains(conflict.Subjects, s =>
            s.Kind == CanonSubjectKind.EntityField && s.SubjectId == fields.Death.Id && s.Role == "death");
    }

    [Fact]
    public async Task A_lifespan_rule_ignores_an_entity_that_is_not_canon()
    {
        var (client, universe) = await SignedInWithUniverse("lifedraft");
        var fields = await LifespanFields(client, universe.Id);
        await Character(client, universe.Id, "Elendil", fields, birth: 3441, death: 3119, status: CanonStatus.Draft);

        // A draft is allowed to be wrong. Canon integrity is about what the author settled.
        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task A_half_declared_lifespan_proves_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("lifehalf");
        var fields = await LifespanFields(client, universe.Id);
        await Character(client, universe.Id, "Elendil", fields, birth: 3441, death: null);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task Years_in_an_undeclared_field_mean_nothing_to_the_rule()
    {
        var (client, universe) = await SignedInWithUniverse("lifeplain");
        var type = await CharacterType(client, universe.Id);

        // Named exactly as a name-matching implementation would look for, and deliberately
        // left semantic-free. Nothing may be inferred from that.
        var born = await AddField(client, universe.Id, type.Id, "Birth Year", EntityFieldKind.Number);
        var died = await AddField(client, universe.Id, type.Id, "Death Year", EntityFieldKind.Number);

        await CreateEntity(client, universe.Id, "Elendil", CanonStatus.Canon,
            [Number(born.Id, 3441), Number(died.Id, 3119)]);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    // ---------- CANON-LIFE-002 and 003: moments outside a lifespan ----------

    [Fact]
    public async Task A_canon_moment_before_a_participant_is_born_is_a_high_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("beforebirth");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);
        await Moment(client, universe.Id, "The Fall of Númenor", 3000, participants: [elendil.Id]);

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-002"));

        Assert.Equal(CanonConflictSeverity.High, conflict.Severity);
        Assert.Contains("Elendil", conflict.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_canon_moment_after_a_participant_dies_is_a_high_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("afterdeath");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);
        await Moment(client, universe.Id, "The Council of Elrond", 3500, participants: [elendil.Id]);

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-003"));

        Assert.Equal(CanonConflictSeverity.High, conflict.Severity);
    }

    [Fact]
    public async Task A_moment_inside_a_lifespan_is_no_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("inside");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);
        await Moment(client, universe.Id, "The Last Alliance", 3430, participants: [elendil.Id]);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task The_year_of_birth_and_the_year_of_death_are_both_inside_the_life()
    {
        var (client, universe) = await SignedInWithUniverse("boundary");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        await Moment(client, universe.Id, "A birth", 3119, participants: [elendil.Id]);
        await Moment(client, universe.Id, "A death", 3441, participants: [elendil.Id]);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task A_moment_that_is_not_canon_is_free_to_sit_outside_a_lifespan()
    {
        var (client, universe) = await SignedInWithUniverse("draftmoment");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        await Moment(
            client, universe.Id, "A what-if", 1000, participants: [elendil.Id], status: CanonStatus.Draft);

        // Nothing at all: not this rule, and not CANON-TIME-001 either, whose participant is Canon.
        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task An_approximate_date_is_never_used_to_prove_a_contradiction()
    {
        var (client, universe) = await SignedInWithUniverse("approx");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        await Moment(
            client, universe.Id, "Somewhere in the First Age", 1000,
            participants: [elendil.Id], kind: TimelineDateKind.Approximate);

        // "Around 1000" states no margin, so nothing about it can be proved wrong.
        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task An_undated_moment_proves_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("undated");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        await Moment(
            client, universe.Id, "At some point", null,
            participants: [elendil.Id], kind: TimelineDateKind.Unknown);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task A_range_that_ends_before_a_birth_is_a_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("rangebefore");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        await Moment(
            client, universe.Id, "The long war", 3000,
            participants: [elendil.Id], kind: TimelineDateKind.Range, endYear: 3100);

        await Evaluate(client, universe.Id);
        Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-002"));
    }

    [Fact]
    public async Task A_range_that_reaches_into_a_life_proves_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("rangestraddle");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        await Moment(
            client, universe.Id, "The long war", 3000,
            participants: [elendil.Id], kind: TimelineDateKind.Range, endYear: 3200);

        // Some year in 3000-3200 is inside the life, and the author never said which year
        // of the span the participant was there for.
        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task A_range_that_starts_after_a_death_is_a_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("rangeafter");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        await Moment(
            client, universe.Id, "The Third Age", 3450,
            participants: [elendil.Id], kind: TimelineDateKind.Range, endYear: 3500);

        await Evaluate(client, universe.Id);
        Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-003"));
    }

    [Fact]
    public async Task A_range_that_reaches_back_into_a_life_proves_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("rangeback");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        await Moment(
            client, universe.Id, "The war's end", 3400,
            participants: [elendil.Id], kind: TimelineDateKind.Range, endYear: 3500);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task A_universe_keeping_time_in_two_reckonings_gets_no_chronology_findings()
    {
        var (client, universe) = await SignedInWithUniverse("eras");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        await Moment(
            client, universe.Id, "The Last Alliance", 3430, participants: [elendil.Id], era: "Second Age");
        await Moment(
            client, universe.Id, "The Council of Elrond", 3018, participants: [elendil.Id], era: "Third Age");

        // Third Age 3018 is a millennium after Second Age 3441, and a bare birth year says
        // nothing about which reckoning it is on. Rather than guess, the rules stand down.
        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task One_named_era_still_reads_as_a_single_reckoning()
    {
        var (client, universe) = await SignedInWithUniverse("oneera");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);

        await Moment(client, universe.Id, "A dated moment", 3430, participants: [elendil.Id], era: "Second Age");
        await Moment(client, universe.Id, "An unlabelled moment", 3000, participants: [elendil.Id]);

        await Evaluate(client, universe.Id);

        // The unlabelled entry is the same reckoning, not a second one, so 3000 is still
        // provably before the birth in 3119.
        Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-002"));
    }

    [Fact]
    public async Task Each_participant_at_fault_gets_its_own_finding()
    {
        var (client, universe) = await SignedInWithUniverse("manyparts");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);
        var gil = await Character(client, universe.Id, "Gil-galad", fields, birth: 3200, death: 3441);

        await Moment(client, universe.Id, "A very early moment", 3000, participants: [elendil.Id, gil.Id]);

        await Evaluate(client, universe.Id);
        Assert.Equal(2, (await Conflicts(client, universe.Id, "CANON-LIFE-002")).Count);
    }

    // ---------- Named eras ----------

    [Fact]
    public async Task Born_in_BF_5_a_moment_in_BF_10_happens_before_the_birth()
    {
        var (client, universe) = await SignedInWithUniverse("erabefore");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(client, universe.Id, "Aranel", fields, birth: 5, death: null, birthEra: eras.Before);
        await Moment(client, universe.Id, "The old siege", 10, participants: [aranel.Id], startEra: eras.Before);

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-002"));

        // The years read the way the universe writes them, never as a bare signed number.
        Assert.Contains("BF 10", conflict.Explanation, StringComparison.Ordinal);
        Assert.Contains("BF 5", conflict.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Born_in_BF_5_a_moment_in_BF_1_happens_after_the_birth()
    {
        var (client, universe) = await SignedInWithUniverse("eraafterbirth");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(client, universe.Id, "Aranel", fields, birth: 5, death: null, birthEra: eras.Before);
        await Moment(client, universe.Id, "The eve of the fall", 1, participants: [aranel.Id], startEra: eras.Before);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task Born_in_AF_5_a_moment_in_AF_2_happens_before_the_birth()
    {
        var (client, universe) = await SignedInWithUniverse("eraascending");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(client, universe.Id, "Aranel", fields, birth: 5, death: null, birthEra: eras.After);
        await Moment(client, universe.Id, "The first harvest", 2, participants: [aranel.Id], startEra: eras.After);

        await Evaluate(client, universe.Id);
        Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-002"));
    }

    [Fact]
    public async Task Dead_in_AF_20_a_moment_in_AF_30_happens_after_the_death()
    {
        var (client, universe) = await SignedInWithUniverse("eradeath");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(
            client, universe.Id, "Aranel", fields, birth: 1, death: 20, birthEra: eras.After, deathEra: eras.After);
        await Moment(client, universe.Id, "A late council", 30, participants: [aranel.Id], startEra: eras.After);

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-003"));
        Assert.Contains("AF 30", conflict.Explanation, StringComparison.Ordinal);
        Assert.Contains("AF 20", conflict.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Born_before_the_fall_a_moment_after_it_is_inside_the_life()
    {
        var (client, universe) = await SignedInWithUniverse("eracrossinside");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(
            client, universe.Id, "Aranel", fields, birth: 5, death: 3, birthEra: eras.Before, deathEra: eras.After);
        await Moment(client, universe.Id, "Crossing over", 1, participants: [aranel.Id], startEra: eras.After);

        // BF 5 to AF 3 is a forward life, and AF 1 sits inside it.
        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task Dead_before_the_fall_a_moment_after_it_happens_after_the_death()
    {
        var (client, universe) = await SignedInWithUniverse("eracrossdeath");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(
            client, universe.Id, "Aranel", fields, birth: 90, death: 5, birthEra: eras.Before, deathEra: eras.Before);
        await Moment(client, universe.Id, "The rebuilding", 1, participants: [aranel.Id], startEra: eras.After);

        await Evaluate(client, universe.Id);
        Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-003"));
    }

    [Fact]
    public async Task Born_after_the_fall_a_moment_before_it_happens_before_the_birth()
    {
        var (client, universe) = await SignedInWithUniverse("eracrossbirth");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(client, universe.Id, "Aranel", fields, birth: 1, death: null, birthEra: eras.After);
        await Moment(client, universe.Id, "The last days", 1, participants: [aranel.Id], startEra: eras.Before);

        await Evaluate(client, universe.Id);
        Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-002"));
    }

    [Fact]
    public async Task Born_after_the_fall_and_dead_before_it_is_a_life_that_runs_backwards()
    {
        var (client, universe) = await SignedInWithUniverse("eralifeback");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        await Character(
            client, universe.Id, "Aranel", fields, birth: 5, death: 3, birthEra: eras.After, deathEra: eras.Before);

        await Evaluate(client, universe.Id);
        var conflict = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));
        Assert.Contains("AF 5", conflict.Title, StringComparison.Ordinal);
        Assert.Contains("BF 3", conflict.Title, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Inside_a_counting_down_era_a_larger_death_year_is_an_earlier_death()
    {
        var (client, universe) = await SignedInWithUniverse("eradownlife");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);

        // Born BF 10, died BF 40: thirty years before being born.
        await Character(
            client, universe.Id, "Aranel", fields, birth: 10, death: 40, birthEra: eras.Before, deathEra: eras.Before);

        await Evaluate(client, universe.Id);
        Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));
    }

    [Fact]
    public async Task A_range_across_the_fall_that_reaches_into_a_life_proves_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("erarangeinside");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(client, universe.Id, "Aranel", fields, birth: 1, death: null, birthEra: eras.Before);

        await Moment(
            client, universe.Id, "The long war", 10, participants: [aranel.Id], kind: TimelineDateKind.Range,
            endYear: 2, startEra: eras.Before, endEra: eras.After);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task Named_eras_are_compared_rather_than_standing_the_rules_down()
    {
        var (client, universe) = await SignedInWithUniverse("eranostanddown");
        var eras = await TheFall(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(client, universe.Id, "Aranel", fields, birth: 5, death: null, birthEra: eras.Before);

        await Moment(client, universe.Id, "Too early", 10, participants: [aranel.Id], startEra: eras.Before);
        await Moment(client, universe.Id, "Fine", 3, participants: [aranel.Id], startEra: eras.After);

        // Two eras on one timeline no longer silence the rules: the eras are ordered, so the
        // comparison is sound, and exactly the one moment before the birth is reported.
        await Evaluate(client, universe.Id);
        Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-002"));
    }

    [Fact]
    public async Task A_birth_year_written_before_the_eras_proves_nothing_until_it_names_one()
    {
        var (client, universe) = await SignedInWithUniverse("eralegacybirth");
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(client, universe.Id, "Aranel", fields, birth: 3119, death: null);

        var eras = await TheFall(client, universe.Id);
        await Moment(client, universe.Id, "Dated in an era", 10, participants: [aranel.Id], startEra: eras.Before);

        // 3119 is a year in no era. Reading it as one would be picking the era for the author.
        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    [Fact]
    public async Task A_moment_written_before_the_eras_proves_nothing_until_it_names_one()
    {
        var (client, universe) = await SignedInWithUniverse("eralegacymoment");
        var fields = await LifespanFields(client, universe.Id);
        var aranel = await Character(client, universe.Id, "Aranel", fields, birth: null, death: null);
        await Moment(client, universe.Id, "An old moment", 1, participants: [aranel.Id]);

        var eras = await TheFall(client, universe.Id);
        await SetYears(client, universe.Id, aranel, fields, birth: 5, death: null, birthEra: eras.After);

        Assert.Equal(0, (await Evaluate(client, universe.Id)).Detected);
    }

    // ---------- Fingerprint and lifecycle ----------

    [Fact]
    public async Task Evaluating_twice_over_an_unchanged_chronology_duplicates_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("chronidem");
        var fields = await LifespanFields(client, universe.Id);
        await Character(client, universe.Id, "Elendil", fields, birth: 3441, death: 3119);

        await Evaluate(client, universe.Id);
        var first = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        var second = await Evaluate(client, universe.Id);
        var again = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        Assert.Equal(0, second.Created);
        Assert.Equal(1, second.Persisted);
        Assert.Equal(first.Id, again.Id);
        Assert.Equal(first.UpdatedAt, again.UpdatedAt);
    }

    [Fact]
    public async Task Renaming_a_declared_field_rewords_the_conflict_without_replacing_it()
    {
        var (client, universe) = await SignedInWithUniverse("chronrename");
        var type = await CharacterType(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        await Character(client, universe.Id, "Elendil", fields, birth: 3441, death: 3119);

        await Evaluate(client, universe.Id);
        var before = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}/fields/{fields.Birth.Id}",
            new FieldDefinitionRequest(
                "Year of birth", EntityFieldKind.Number, false, null, null, null, EntityFieldSemantic.BirthYear));

        await Evaluate(client, universe.Id);
        var after = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        // Meaning is declared, not matched, so the name is free to change under the rule.
        Assert.Equal(before.Id, after.Id);
        Assert.Contains("Year of birth", after.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Correcting_a_year_that_is_still_wrong_refreshes_the_same_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("chronedit");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3441, death: 3119);

        await Evaluate(client, universe.Id);
        var before = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        await SetYears(client, universe.Id, elendil, fields, birth: 3500, death: 3119);
        await Evaluate(client, universe.Id);
        var after = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        // Same two facts still disagreeing: one conflict, reworded, and any dismissal the
        // author made about it survives.
        Assert.Equal(before.Id, after.Id);
        Assert.Contains("3500", after.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Moving_the_meaning_to_another_field_opens_a_new_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("chronmove");
        var type = await CharacterType(client, universe.Id);
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3441, death: 3119);

        await Evaluate(client, universe.Id);
        var before = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        // The old field keeps its number and loses its meaning; a new field takes both.
        await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}/fields/{fields.Birth.Id}",
            new FieldDefinitionRequest("Born", EntityFieldKind.Number, false, null, null, null));

        var replacement = await AddField(
            client, universe.Id, type.Id, "Year of birth", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);

        await Save(client, universe.Id, elendil, fields:
        [
            Number(fields.Birth.Id, 3441),
            Number(fields.Death.Id, 3119),
            Number(replacement.Id, 3441),
        ]);

        await Evaluate(client, universe.Id);
        var conflicts = await Conflicts(client, universe.Id, "CANON-LIFE-001");

        // A different fact, so a different conflict - and the old one is closed rather than
        // inheriting whatever the author decided about it.
        var reopenedOld = Assert.Single(conflicts, conflict => conflict.Id == before.Id);
        Assert.Equal(CanonConflictStatus.Resolved, reopenedOld.Status);
        Assert.Single(conflicts, conflict =>
            conflict.Id != before.Id && conflict.Status == CanonConflictStatus.Pending);
    }

    [Fact]
    public async Task Fixing_the_year_resolves_the_conflict_and_breaking_it_again_reopens_it()
    {
        var (client, universe) = await SignedInWithUniverse("chroncycle");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3441, death: 3119);

        await Evaluate(client, universe.Id);
        var opened = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        elendil = await SetYears(client, universe.Id, elendil, fields, birth: 3119, death: 3441);
        await Evaluate(client, universe.Id);
        var fixedConflict = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        Assert.Equal(opened.Id, fixedConflict.Id);
        Assert.Equal(CanonConflictStatus.Resolved, fixedConflict.Status);
        Assert.NotNull(fixedConflict.ResolvedAt);

        await SetYears(client, universe.Id, elendil, fields, birth: 3441, death: 3119);
        await Evaluate(client, universe.Id);
        var back = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-001"));

        Assert.Equal(opened.Id, back.Id);
        Assert.Equal(CanonConflictStatus.Pending, back.Status);
        Assert.Null(back.ResolvedAt);
    }

    [Fact]
    public async Task Dropping_a_participant_resolves_the_moment_conflict()
    {
        var (client, universe) = await SignedInWithUniverse("chrondrop");
        var fields = await LifespanFields(client, universe.Id);
        var elendil = await Character(client, universe.Id, "Elendil", fields, birth: 3119, death: 3441);
        var moment = await Moment(client, universe.Id, "Too early", 3000, participants: [elendil.Id]);

        await Evaluate(client, universe.Id);
        Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-002"));

        await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/timeline/{moment.Id}",
            new TimelineEntryRequest(
                moment.Title, null, CanonStatus.Canon, TimelineDateKind.Exact,
                3000, null, null, null, null, null, null, []));

        await Evaluate(client, universe.Id);
        var resolved = Assert.Single(await Conflicts(client, universe.Id, "CANON-LIFE-002"));
        Assert.Equal(CanonConflictStatus.Resolved, resolved.Status);
    }

    [Fact]
    public async Task A_chronology_conflict_stays_inside_its_own_universe()
    {
        var (client, mine) = await SignedInWithUniverse("chronscope");
        var other = await CreateUniverse(client, "World chronscope two");

        var fields = await LifespanFields(client, mine.Id);
        await Character(client, mine.Id, "Elendil", fields, birth: 3441, death: 3119);

        await Evaluate(client, mine.Id);

        Assert.Single(await Conflicts(client, mine.Id, "CANON-LIFE-001"));
        Assert.Equal(0, (await Evaluate(client, other.Id)).Detected);
        Assert.Empty((await List(client, other.Id)).Items);
    }

    // ---------- Helpers ----------

    /// <summary>
    /// Settles lore that the Canon promotion gate would now refuse to let anyone author.
    ///
    /// These tests are about detection, not about the gate: nearly all of them need a universe
    /// that already contradicts itself, and Phase 014 made every route capable of authoring one
    /// answer 409 instead. So the lore is written through the API as a draft - always legal,
    /// because a draft is allowed to be wrong - and promoted straight in the database, standing
    /// in for lore that was settled before the gate existed. That is the one case the gate
    /// cannot prevent and must tolerate, which is exactly what these fixtures then exercise the
    /// rules against. The gate's own behaviour is <see cref="CanonPromotionGateTests"/>.
    /// </summary>
    private async Task Settle(Guid entityId, Guid? entryId = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();

        if (entityId != Guid.Empty)
        {
            (await db.Entities.FirstAsync(entity => entity.Id == entityId)).CanonStatus = CanonStatus.Canon;
        }

        if (entryId is { } id)
        {
            (await db.TimelineEntries.FirstAsync(entry => entry.Id == id)).CanonStatus = CanonStatus.Canon;
        }

        await db.SaveChangesAsync();
    }

    /// <summary>What the database currently says, which a gated write is not allowed to change.</summary>
    private async Task<CanonStatus> StoredStatus(Guid entityId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        return (await db.Entities.AsNoTracking().FirstAsync(entity => entity.Id == entityId)).CanonStatus;
    }

    private sealed record LifespanFieldPair(FieldDefinitionResponse Birth, FieldDefinitionResponse Death);

    /// <summary>The Character type gains a declared birth year and death year, once per universe.</summary>
    private static async Task<LifespanFieldPair> LifespanFields(HttpClient client, Guid universeId)
    {
        var type = await CharacterType(client, universeId);

        return new LifespanFieldPair(
            await AddField(client, universeId, type.Id, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear),
            await AddField(client, universeId, type.Id, "Died", EntityFieldKind.Number, EntityFieldSemantic.DeathYear));
    }

    private sealed record FallEras(Guid Before, Guid After);

    /// <summary>Before the Fall counts down to it, After the Fall counts up from it.</summary>
    private static async Task<FallEras> TheFall(HttpClient client, Guid universeId)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(
                    null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(
                    null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        response.EnsureSuccessStatusCode();

        var eras = (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
        return new FallEras(eras[0].Id, eras[1].Id);
    }

    private async Task<EntityDetail> Character(
        HttpClient client,
        Guid universeId,
        string name,
        LifespanFieldPair fields,
        double? birth,
        double? death,
        CanonStatus status = CanonStatus.Canon,
        Guid? birthEra = null,
        Guid? deathEra = null)
    {
        var entity = await CreateEntity(
            client, universeId, name, CanonStatus.Draft, Years(fields, birth, death, birthEra, deathEra));

        if (status != CanonStatus.Canon)
        {
            return entity;
        }

        await Settle(entity.Id);
        return await Reload(client, universeId, entity.Id);
    }

    private static async Task<EntityDetail> Reload(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>(
            $"/api/universes/{universeId}/entities/{entityId}"))!;

    private static List<FieldValueInput> Years(
        LifespanFieldPair fields,
        double? birth,
        double? death,
        Guid? birthEra = null,
        Guid? deathEra = null)
    {
        var values = new List<FieldValueInput>();

        if (birth is { } bornIn)
        {
            values.Add(Number(fields.Birth.Id, bornIn) with { EraId = birthEra });
        }

        if (death is { } diedIn)
        {
            values.Add(Number(fields.Death.Id, diedIn) with { EraId = deathEra });
        }

        return values;
    }

    private static FieldValueInput Number(Guid fieldId, double value) =>
        new(fieldId, null, value, null, null, null, null);

    private Task<EntityDetail> SetYears(
        HttpClient client,
        Guid universeId,
        EntityDetail entity,
        LifespanFieldPair fields,
        double? birth,
        double? death,
        Guid? birthEra = null,
        Guid? deathEra = null) =>
        Save(client, universeId, entity, fields: Years(fields, birth, death, birthEra, deathEra));

    private async Task<TimelineEntryResponse> Moment(
        HttpClient client,
        Guid universeId,
        string title,
        int? startYear,
        IReadOnlyList<Guid> participants,
        CanonStatus status = CanonStatus.Canon,
        TimelineDateKind kind = TimelineDateKind.Exact,
        int? endYear = null,
        string? era = null,
        Guid? startEra = null,
        Guid? endEra = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/timeline",
            new TimelineEntryRequest(
                title, null, CanonStatus.Draft, kind, startYear, null, null, endYear, null, null,
                era, participants, startEra, endEra));
        response.EnsureSuccessStatusCode();

        var entry = (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;

        if (status != CanonStatus.Canon)
        {
            return entry;
        }

        await Settle(Guid.Empty, entry.Id);
        return (await client.GetFromJsonAsync<TimelineEntryResponse>(
            $"/api/universes/{universeId}/timeline/{entry.Id}"))!;
    }

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        return (client, await CreateUniverse(client, $"World {tag}"));
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<EntityTypeResponse> CharacterType(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        return types.First(type => type.Name == "Character");
    }

    private static Task<HttpResponseMessage> PostField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        FieldDefinitionRequest request) =>
        client.PostAsJsonAsync($"/api/universes/{universeId}/entity-types/{typeId}/fields", request);

    private static async Task<FieldDefinitionResponse> AddField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        EntityFieldKind kind,
        EntityFieldSemantic? semantic = null)
    {
        var response = await PostField(
            client, universeId, typeId,
            new FieldDefinitionRequest(name, kind, false, null, null, null, semantic));
        response.EnsureSuccessStatusCode();

        var type = (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
        return type.Fields.First(field => field.Name == name);
    }

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        string name,
        CanonStatus canonStatus,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var type = await CharacterType(client, universeId);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(type.Id, name, null, canonStatus, null, null, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    /// <summary>
    /// Rewrites an entity's field values without tripping the promotion gate, by dropping it to
    /// a draft for the duration of the write and settling it again afterwards. Same reasoning as
    /// <see cref="Settle"/>: what is under test here is what the rules make of the result, not
    /// whether the API would have let an author get there.
    /// </summary>
    private async Task<EntityDetail> Save(
        HttpClient client,
        Guid universeId,
        EntityDetail entity,
        IReadOnlyList<FieldValueInput> fields)
    {
        var settled = await StoredStatus(entity.Id);

        var response = await client.PutVersionedAsync(
            $"/api/universes/{universeId}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId,
                entity.Name,
                entity.Summary,
                CanonStatus.Draft,
                entity.Aliases,
                entity.Tags,
                fields));
        response.EnsureSuccessStatusCode();

        if (settled != CanonStatus.Canon)
        {
            return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
        }

        await Settle(entity.Id);
        return await Reload(client, universeId, entity.Id);
    }

    private static async Task<CanonEvaluationResponse> Evaluate(HttpClient client, Guid universeId)
    {
        var response = await client.PostAsync(
            $"/api/universes/{universeId}/canon-conflicts/evaluate", content: null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CanonEvaluationResponse>())!;
    }

    private static async Task<CanonConflictPage> List(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universeId}/canon-conflicts?pageSize=100"))!;

    /// <summary>Everything one rule has on record here, in listing order.</summary>
    private static async Task<IReadOnlyList<CanonConflictResponse>> Conflicts(
        HttpClient client,
        Guid universeId,
        string ruleCode) =>
        [.. (await List(client, universeId)).Items.Where(conflict => conflict.RuleCode == ruleCode)];
}
