using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;

using static Lorex.Api.Tests.VersionTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A universe's reckoning: writing it, changing it without losing any era's identity, what it
/// refuses, and who may touch it.
///
/// The refusal that matters most is removal. An era something is dated in is never cleared out
/// from under it - the date would either vanish or float in no era - so the write is refused and
/// says what is still dated there. Credentials are obviously synthetic.
/// </summary>
public sealed class ChronologyEndpointTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Reading and writing ----------

    [Fact]
    public async Task A_new_universe_keeps_plain_signed_years()
    {
        var (client, universe) = await SignedInWithUniverse("chrplain");

        var chronology = await Get(client, universe.Id);

        Assert.Empty(chronology.Eras);
        Assert.Equal(0, chronology.UnplacedMomentCount);
        Assert.Equal(0, chronology.UnplacedYearCount);
    }

    [Fact]
    public async Task Eras_are_kept_in_the_order_given_with_their_direction_and_label()
    {
        var (client, universe) = await SignedInWithUniverse("chrorder");

        var saved = await Save(
            client,
            universe.Id,
            Era("  Before the Fall ", " BF ", ChronologyEraDirection.Descending),
            Era("After the Fall", "AF"),
            Era("Third Age", "   ", position: ChronologyLabelPosition.AfterYear));

        Assert.Equal(["Before the Fall", "After the Fall", "Third Age"], saved.Eras.Select(era => era.Name).ToArray());
        Assert.Equal([0, 1, 2], saved.Eras.Select(era => era.SortOrder).ToArray());
        Assert.Equal("BF", saved.Eras[0].Abbreviation);
        Assert.Null(saved.Eras[2].Abbreviation);
        Assert.Equal(ChronologyEraDirection.Descending, saved.Eras[0].Direction);
        Assert.Equal(ChronologyEraDirection.Ascending, saved.Eras[1].Direction);
        Assert.Equal(ChronologyLabelPosition.AfterYear, saved.Eras[2].LabelPosition);

        var read = await Get(client, universe.Id);
        Assert.Equal(saved.Eras.Select(era => era.Id), read.Eras.Select(era => era.Id));
    }

    [Fact]
    public async Task Renaming_reordering_and_turning_an_era_around_keep_every_eras_identity()
    {
        var (client, universe) = await SignedInWithUniverse("chrreorder");
        var first = await Save(client, universe.Id, Era("Dawn", "D"), Era("Noon", "N"), Era("Dusk", "K"));
        var (dawn, noon, dusk) = (first.Eras[0], first.Eras[1], first.Eras[2]);

        // First and last swap places, which a unique position index would trip over row by row.
        var second = await Save(
            client,
            universe.Id,
            Era("Dusk, renamed", "DR", id: dusk.Id),
            Era("Noon", "N", ChronologyEraDirection.Descending, id: noon.Id),
            Era("Dawn", "D", id: dawn.Id));

        Assert.Equal([dusk.Id, noon.Id, dawn.Id], second.Eras.Select(era => era.Id).ToArray());
        Assert.Equal("Dusk, renamed", second.Eras[0].Name);
        Assert.Equal(ChronologyEraDirection.Descending, second.Eras[1].Direction);
    }

    [Fact]
    public async Task A_new_era_can_join_the_ones_already_there()
    {
        var (client, universe) = await SignedInWithUniverse("chradd");
        var first = await Save(client, universe.Id, Era("After the Fall", "AF"));

        var second = await Save(
            client,
            universe.Id,
            Era("Before the Fall", "BF", ChronologyEraDirection.Descending),
            Era("After the Fall", "AF", id: first.Eras[0].Id));

        Assert.Equal(2, second.Eras.Count);
        Assert.Equal(first.Eras[0].Id, second.Eras[1].Id);
        Assert.NotEqual(first.Eras[0].Id, second.Eras[0].Id);
    }

    [Fact]
    public async Task An_era_nothing_is_dated_in_can_be_removed()
    {
        var (client, universe) = await SignedInWithUniverse("chrremove");
        var first = await Save(client, universe.Id, Era("Dawn", "D"), Era("Dusk", "K"));

        var second = await Save(client, universe.Id, Era("Dusk", "K", id: first.Eras[1].Id));

        var only = Assert.Single(second.Eras);
        Assert.Equal(first.Eras[1].Id, only.Id);
        Assert.Equal(0, only.SortOrder);
    }

    // ---------- What an era in use refuses ----------

    [Fact]
    public async Task An_era_a_moment_is_dated_in_cannot_be_removed()
    {
        var (client, universe) = await SignedInWithUniverse("chrinusemoment");
        var eras = (await Save(client, universe.Id, Before(), After())).Eras;
        await Moment(client, universe.Id, "The fall", 1, eras[0].Id);

        var response = await Put(client, universe.Id, Era("After the Fall", "AF", id: eras[1].Id));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains(ChronologyEndpoints.EraInUseCode, body, StringComparison.Ordinal);
        Assert.Contains("1 timeline entry", body, StringComparison.Ordinal);
        Assert.Contains("Before the Fall", body, StringComparison.Ordinal);

        // Authors call it a date period (018); the machine code stays what clients already match on.
        Assert.Equal("chronology_era_in_use", ChronologyEndpoints.EraInUseCode);
        Assert.Contains("Date period is in use", body, StringComparison.Ordinal);

        Assert.Equal(2, (await Get(client, universe.Id)).Eras.Count);
    }

    [Fact]
    public async Task An_era_a_birth_year_is_counted_in_cannot_be_removed()
    {
        var (client, universe) = await SignedInWithUniverse("chrinuseyear");
        var eras = (await Save(client, universe.Id, Before(), After())).Eras;
        var type = await CharacterType(client, universe.Id);
        var born = await AddField(client, universe.Id, type.Id, "Born", EntityFieldSemantic.BirthYear);
        await CreateEntity(client, universe.Id, type.Id, "Aranel", CanonStatus.Idea, [Year(born.Id, 5, eras[0].Id)]);

        var response = await Put(client, universe.Id, Era("After the Fall", "AF", id: eras[1].Id));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("1 year on an entry", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Going_back_to_plain_years_waits_until_nothing_is_dated_in_an_era()
    {
        var (client, universe) = await SignedInWithUniverse("chrbacktoplain");
        var eras = (await Save(client, universe.Id, Before(), After())).Eras;
        var moment = await Moment(client, universe.Id, "Afterwards", 3, eras[1].Id);

        Assert.Equal(HttpStatusCode.Conflict, (await Put(client, universe.Id)).StatusCode);

        // In the Trash, a moment keeps its date to come back with (ADR 0048), so it still holds the era until erased.
        (await client.DeleteAsync($"/api/universes/{universe.Id}/timeline/{moment.Id}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await Put(client, universe.Id)).StatusCode);
        (await client.DeleteAsync($"/api/universes/{universe.Id}/trash/timeline/{moment.Id}")).EnsureSuccessStatusCode();

        Assert.Empty((await Save(client, universe.Id)).Eras);
    }

    // ---------- Refused shapes ----------

    [Fact]
    public async Task An_era_needs_a_name()
    {
        var (client, universe) = await SignedInWithUniverse("chrnoname");

        await AssertRefused(await Put(client, universe.Id, Era("   ", "X")), "eras[0].name");
    }

    [Fact]
    public async Task A_short_label_stays_short()
    {
        var (client, universe) = await SignedInWithUniverse("chrlonglabel");

        await AssertRefused(
            await Put(client, universe.Id, Era("Before the Fall", new string('B', ChronologyLimits.AbbreviationMaxLength + 1))),
            "eras[0].abbreviation");
    }

    [Fact]
    public async Task Two_eras_cannot_share_a_name_in_any_case()
    {
        var (client, universe) = await SignedInWithUniverse("chrdupname");

        await AssertRefused(await Put(client, universe.Id, Era("The Age", "A"), Era("the age", "B")), "eras[1].name");
    }

    [Fact]
    public async Task Two_eras_cannot_be_written_the_same_way_beside_a_year()
    {
        var (client, universe) = await SignedInWithUniverse("chrduplabel");

        await AssertRefused(await Put(client, universe.Id, Era("Before", "X"), Era("After", "x")), "eras[1].abbreviation");
    }

    [Fact]
    public async Task An_era_written_by_its_name_cannot_read_like_another_eras_label()
    {
        var (client, universe) = await SignedInWithUniverse("chrnamelabel");

        await AssertRefused(await Put(client, universe.Id, Era("Before", "AF"), Era("AF", null)), "eras[1].name");
    }

    [Fact]
    public async Task A_direction_lorex_does_not_know_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("chrbaddirection");

        await AssertRefused(
            await Put(client, universe.Id, Era("Before", "B", (ChronologyEraDirection)9)),
            "eras[0].direction");
    }

    [Fact]
    public async Task A_label_position_lorex_does_not_know_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("chrbadposition");

        await AssertRefused(
            await Put(client, universe.Id, Era("Before", "B", position: (ChronologyLabelPosition)9)),
            "eras[0].labelPosition");
    }

    [Fact]
    public async Task The_whole_list_is_required()
    {
        var (client, universe) = await SignedInWithUniverse("chrnolist");

        var response = await client.PutAsJsonAsync(Route(universe.Id), new ChronologyRequest(null));

        await AssertRefused(response, "eras");
    }

    [Fact]
    public async Task A_universe_names_a_bounded_number_of_eras()
    {
        var (client, universe) = await SignedInWithUniverse("chrtoomany");

        var eras = Enumerable.Range(1, ChronologyLimits.MaxEras + 1)
            .Select(index => Era($"Age {index}", $"A{index}"))
            .ToArray();

        await AssertRefused(await Put(client, universe.Id, eras), "eras");
    }

    [Fact]
    public async Task The_same_era_cannot_be_listed_twice()
    {
        var (client, universe) = await SignedInWithUniverse("chrtwice");
        var saved = await Save(client, universe.Id, Era("Dawn", "D"));

        await AssertRefused(
            await Put(client, universe.Id, Era("Dawn", "D", id: saved.Eras[0].Id), Era("Dusk", "K", id: saved.Eras[0].Id)),
            "eras[1].id");
    }

    [Fact]
    public async Task An_era_from_another_of_the_owners_universes_is_refused()
    {
        var client = await SignedInClient("user-chrforeign");
        var first = await CreateUniverse(client, "World chrforeign one");
        var second = await CreateUniverse(client, "World chrforeign two");
        var theirs = (await Save(client, second.Id, Era("Elsewhere", "E"))).Eras[0];

        await AssertRefused(await Put(client, first.Id, Era("Borrowed", "B", id: theirs.Id)), "eras[0].id");

        Assert.Empty((await Get(client, first.Id)).Eras);
        Assert.Equal("Elsewhere", (await Get(client, second.Id)).Eras[0].Name);
    }

    // ---------- Ownership ----------

    [Fact]
    public async Task Someone_else_cannot_read_a_universes_chronology()
    {
        var (owner, universe) = await SignedInWithUniverse("chrownerread");
        await Save(owner, universe.Id, Era("Private Age", "PA"));
        var stranger = await SignedInClient("user-chrstrangerread");

        var response = await stranger.GetAsync(Route(universe.Id));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain("Private Age", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Someone_else_cannot_rewrite_a_universes_chronology()
    {
        var (owner, universe) = await SignedInWithUniverse("chrownerwrite");
        await Save(owner, universe.Id, Era("Private Age", "PA"));
        var stranger = await SignedInClient("user-chrstrangerwrite");

        var response = await stranger.PutAsJsonAsync(Route(universe.Id), new ChronologyRequest([]));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Single((await Get(owner, universe.Id)).Eras);
    }

    [Fact]
    public async Task An_era_from_another_owners_universe_cannot_be_claimed()
    {
        var (owner, ownersUniverse) = await SignedInWithUniverse("chrcrossowner");
        var secret = (await Save(owner, ownersUniverse.Id, Era("Secret Age", "SA"))).Eras[0];

        var stranger = await SignedInClient("user-chrcrossownerstranger");
        var theirs = await CreateUniverse(stranger, "World chrcrossowner stranger");

        var response = await Put(stranger, theirs.Id, Era("Stolen", "S", id: secret.Id));

        await AssertRefused(response, "eras[0].id");
        Assert.DoesNotContain("Secret Age", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal("Secret Age", (await Get(owner, ownersUniverse.Id)).Eras[0].Name);
    }

    [Fact]
    public async Task The_chronology_needs_a_signed_in_caller()
    {
        var (_, universe) = await SignedInWithUniverse("chranon");

        var response = await _factory.CreateClient().GetAsync(Route(universe.Id));

        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
    }

    // ---------- What the reckoning reports ----------

    [Fact]
    public async Task Each_era_says_how_much_is_dated_in_it()
    {
        var (client, universe) = await SignedInWithUniverse("chrcounts");
        var eras = (await Save(client, universe.Id, Before(), After())).Eras;
        var type = await CharacterType(client, universe.Id);
        var born = await AddField(client, universe.Id, type.Id, "Born", EntityFieldSemantic.BirthYear);

        await CreateEntity(client, universe.Id, type.Id, "Aranel", CanonStatus.Idea, [Year(born.Id, 10, eras[0].Id)]);
        await Post(client, universe.Id, new TimelineEntryRequest(
            "Across the fall", null, CanonStatus.Idea, TimelineDateKind.Range, 3, null, null, 2, null, null, null, null,
            StartEraId: eras[0].Id, EndEraId: eras[1].Id));
        await Moment(client, universe.Id, "Later", 5, eras[1].Id);

        var chronology = await Get(client, universe.Id);

        Assert.Equal(1, chronology.Eras[0].MomentCount);
        Assert.Equal(1, chronology.Eras[0].YearCount);
        Assert.Equal(2, chronology.Eras[1].MomentCount);
        Assert.Equal(0, chronology.Eras[1].YearCount);
    }

    [Fact]
    public async Task Years_written_before_the_eras_are_reported_as_unplaced()
    {
        var (client, universe) = await SignedInWithUniverse("chrunplaced");
        var type = await CharacterType(client, universe.Id);
        var born = await AddField(client, universe.Id, type.Id, "Born", EntityFieldSemantic.BirthYear);
        var height = await AddField(client, universe.Id, type.Id, "Height", semantic: null);

        await CreateEntity(client, universe.Id, type.Id, "Elendil", CanonStatus.Idea,
            [Year(born.Id, 3119, null), Year(height.Id, 180, null)]);
        await Post(client, universe.Id, new TimelineEntryRequest(
            "Dated", null, CanonStatus.Idea, TimelineDateKind.Exact, 3018, null, null, null, null, null, null, null));
        await Post(client, universe.Id, new TimelineEntryRequest(
            "Undated", null, CanonStatus.Idea, TimelineDateKind.Unknown, null, null, null, null, null, null, null, null));

        var chronology = await Save(client, universe.Id, Before(), After());

        // A dated moment and a declared birth year wait for an era. An undated moment has no year
        // to place, and a plain number that means nothing to the rules is nobody's business.
        Assert.Equal(1, chronology.UnplacedMomentCount);
        Assert.Equal(1, chronology.UnplacedYearCount);
    }

    // ---------- History ----------

    [Fact]
    public async Task A_version_remembers_the_era_of_its_year_and_a_restore_puts_it_back()
    {
        var (client, universe) = await SignedInWithUniverse("chrrevision");
        var eras = (await Save(client, universe.Id, Before(), After())).Eras;
        var type = await CharacterType(client, universe.Id);
        var born = await AddField(client, universe.Id, type.Id, "Born", EntityFieldSemantic.BirthYear);
        var aranel = await CreateEntity(
            client, universe.Id, type.Id, "Aranel", CanonStatus.Idea, [Year(born.Id, 5, eras[0].Id)]);

        // The same number in another era is a different year, so it is an edit and a version.
        await Rewrite(client, universe.Id, aranel, [Year(born.Id, 5, eras[1].Id)]);

        var versions = await Versions(client, universe.Id, aranel.Id);
        Assert.Equal(2, versions.Count);

        var first = versions.Single(version => version.Number == 1);
        var snapshot = (await client.GetFromJsonAsync<EntityRevisionDetail>(
            $"/api/universes/{universe.Id}/entities/{aranel.Id}/revisions/{first.Id}"))!;
        var remembered = snapshot.Fields.Single(field => field.FieldDefinitionId == born.Id);
        Assert.Equal(eras[0].Id, remembered.EraId);
        Assert.Equal("BF", remembered.EraLabel);

        (await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{aranel.Id}", first.Id))
            .EnsureSuccessStatusCode();

        var value = (await Entity(client, universe.Id, aranel.Id)).Fields
            .Single(field => field.FieldDefinitionId == born.Id);
        Assert.Equal(5, value.Number);
        Assert.Equal(eras[0].Id, value.EraId);
    }

    [Fact]
    public async Task A_version_whose_era_has_been_removed_is_not_restored_into_another()
    {
        var (client, universe) = await SignedInWithUniverse("chrrevisiongone");
        var eras = (await Save(client, universe.Id, Before(), After())).Eras;
        var type = await CharacterType(client, universe.Id);
        var born = await AddField(client, universe.Id, type.Id, "Born", EntityFieldSemantic.BirthYear);
        var aranel = await CreateEntity(
            client, universe.Id, type.Id, "Aranel", CanonStatus.Idea, [Year(born.Id, 5, eras[0].Id)]);
        await Rewrite(client, universe.Id, aranel, [Year(born.Id, 5, eras[1].Id)]);

        // Nothing live is dated in Before the Fall any more, so it may go - but the first version
        // still remembers a year in it.
        await Save(client, universe.Id, After() with { Id = eras[1].Id });

        var first = (await Versions(client, universe.Id, aranel.Id)).Single(version => version.Number == 1);
        var response = await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{aranel.Id}", first.Id);

        // Refused, rather than put back as a plain 5 or a year in whichever era is left.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains(RevisionEndpoints.NotRestorableCode, body, StringComparison.Ordinal);
        Assert.Contains("BF", body, StringComparison.Ordinal);

        var value = (await Entity(client, universe.Id, aranel.Id)).Fields
            .Single(field => field.FieldDefinitionId == born.Id);
        Assert.Equal(eras[1].Id, value.EraId);
        Assert.Equal(2, (await Versions(client, universe.Id, aranel.Id)).Count);
    }

    // ---------- Canon ----------

    [Fact]
    public async Task Turning_an_era_around_is_refused_when_it_would_contradict_settled_canon()
    {
        var (client, universe) = await SignedInWithUniverse("chrgate");
        var eras = (await Save(client, universe.Id, Before(), After())).Eras;
        var type = await CharacterType(client, universe.Id);
        var born = await AddField(client, universe.Id, type.Id, "Born", EntityFieldSemantic.BirthYear);

        // Born BF 10, present at BF 5: five years later while BF counts down, so nothing is wrong.
        var aranel = await CreateEntity(
            client, universe.Id, type.Id, "Aranel", CanonStatus.Canon, [Year(born.Id, 10, eras[0].Id)]);
        await Post(client, universe.Id, new TimelineEntryRequest(
            "A settled moment", null, CanonStatus.Canon, TimelineDateKind.Exact, 5, null, null, null, null, null,
            null, [aranel.Id], StartEraId: eras[0].Id));

        // Counting BF up instead puts BF 5 five years before BF 10 - before Aranel is born.
        var response = await Put(
            client,
            universe.Id,
            Era("Before the Fall", "BF", ChronologyEraDirection.Ascending, id: eras[0].Id),
            Era("After the Fall", "AF", id: eras[1].Id));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains(CanonPromotionGate.BlockedCode, await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal(ChronologyEraDirection.Descending, (await Get(client, universe.Id)).Eras[0].Direction);
    }

    [Fact]
    public async Task Deleting_a_universe_takes_its_eras_and_everything_dated_in_them()
    {
        var (client, universe) = await SignedInWithUniverse("chrdeleteuniverse");
        var eras = (await Save(client, universe.Id, Before(), After())).Eras;
        var type = await CharacterType(client, universe.Id);
        var born = await AddField(client, universe.Id, type.Id, "Born", EntityFieldSemantic.BirthYear);
        await CreateEntity(client, universe.Id, type.Id, "Aranel", CanonStatus.Idea, [Year(born.Id, 5, eras[0].Id)]);
        await Moment(client, universe.Id, "Later", 5, eras[1].Id);

        (await client.PostAsync($"/api/universes/{universe.Id}/archive", null)).EnsureSuccessStatusCode();
        var deleted = await client.DeleteAsync($"/api/universes/{universe.Id}");

        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Route(universe.Id))).StatusCode);
    }

    // ---------- Helpers ----------

    private static string Route(Guid universeId) => $"/api/universes/{universeId}/chronology";

    private static ChronologyEraRequest Era(
        string name,
        string? abbreviation,
        ChronologyEraDirection direction = ChronologyEraDirection.Ascending,
        ChronologyLabelPosition position = ChronologyLabelPosition.BeforeYear,
        Guid? id = null) =>
        new(id, name, abbreviation, direction, position);

    private static ChronologyEraRequest Before() => Era("Before the Fall", "BF", ChronologyEraDirection.Descending);

    private static ChronologyEraRequest After() => Era("After the Fall", "AF");

    private static Task<HttpResponseMessage> Put(HttpClient client, Guid universeId, params ChronologyEraRequest[] eras) =>
        client.PutAsJsonAsync(Route(universeId), new ChronologyRequest(eras));

    private static async Task<ChronologyResponse> Save(HttpClient client, Guid universeId, params ChronologyEraRequest[] eras)
    {
        var response = await Put(client, universeId, eras);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!;
    }

    private static async Task<ChronologyResponse> Get(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<ChronologyResponse>(Route(universeId)))!;

    private static async Task AssertRefused(HttpResponseMessage response, string key)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains($"\"{key}\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    private static FieldValueInput Year(Guid fieldId, double value, Guid? eraId) =>
        new(fieldId, null, value, null, null, null, null, eraId);

    private static async Task<TimelineEntryResponse> Post(HttpClient client, Guid universeId, TimelineEntryRequest request)
    {
        var response = await client.PostAsJsonAsync($"/api/universes/{universeId}/timeline", request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;
    }

    private static Task<TimelineEntryResponse> Moment(HttpClient client, Guid universeId, string title, int year, Guid eraId) =>
        Post(client, universeId, new TimelineEntryRequest(
            title, null, CanonStatus.Idea, TimelineDateKind.Exact, year, null, null, null, null, null, null, null,
            StartEraId: eraId));

    private static async Task<EntityTypeResponse> CharacterType(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!.First(type => type.Name == "Character");

    private static async Task<FieldDefinitionResponse> AddField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        EntityFieldSemantic? semantic)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, EntityFieldKind.Number, false, null, null, null, semantic));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.First(field => field.Name == name);
    }

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        CanonStatus status,
        IReadOnlyList<FieldValueInput> fields)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, status, null, null, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    /// <summary>Re-saves an entry with a new set of values, keeping everything else as it is.</summary>
    private static async Task Rewrite(
        HttpClient client,
        Guid universeId,
        EntityDetail entity,
        IReadOnlyList<FieldValueInput> fields) =>
        (await client.PutVersionedAsync(
            $"/api/universes/{universeId}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId, entity.Name, entity.Summary, entity.CanonStatus,
                entity.Aliases, entity.Tags, fields)))
            .EnsureSuccessStatusCode();

    private static async Task<List<EntityRevisionSummary>> Versions(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/universes/{universeId}/entities/{entityId}/revisions"))!;

    private static async Task<EntityDetail> Entity(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{universeId}/entities/{entityId}"))!;

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
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }
}
