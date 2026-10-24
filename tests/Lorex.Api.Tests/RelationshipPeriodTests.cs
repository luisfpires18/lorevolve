using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Progression;
using Lorex.Api.Features.Relationships;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// When a relationship holds (Issue #18): any Lore relationship may carry periods - a dated span on the universe's own
/// chronology, or one era of either end - and one with none is timeless, exactly as every link always was.
///
/// The invariants under test: a link with no period reads as before; leaving and returning is a second period on the same
/// link, never a second link; a save that leaves periods out keeps them; an era must be one of the two ends'; the real-world
/// dates are kept as they are; a link holds at a point or during an era by explicit dates or eras and nothing else; an era a
/// period names cannot be removed; the chronology counts and converts periods; a backup carries them.
/// </summary>
public sealed class RelationshipPeriodTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Kind, Guid Goku, Guid RedRibbon, Guid Bulma);

    [Fact]
    public async Task A_link_with_no_period_is_timeless_and_reads_as_before()
    {
        var w = await NewWorld("rp-timeless");
        var link = await Create(w, w.Goku, w.RedRibbon);

        Assert.Empty(link.Periods!);
        var view = (await Views(w, w.Goku)).Single();
        Assert.Empty(view.Periods!);
        Assert.Null(view.Validity);
    }

    [Fact]
    public async Task Leaving_and_returning_is_a_second_period_on_the_same_link()
    {
        var w = await NewWorld("rp-return");
        var link = await Create(w, w.Goku, w.RedRibbon, [Dated(749, 750), Dated(760, null)]);

        Assert.Equal([749, 760], link.Periods!.Select(period => period.Start!.Year));
        Assert.Null(link.Periods![1].End);

        // The same link again is still refused: the periods are what the one link says.
        var again = await Post(w, w.Goku, w.RedRibbon, [Dated(770, 771)]);
        Assert.Equal(RelationshipEndpoints.DuplicateCode, await CodeOf(again));
    }

    [Fact]
    public async Task A_save_that_leaves_periods_out_keeps_them_and_an_empty_list_makes_the_link_timeless()
    {
        var w = await NewWorld("rp-keep");
        var link = await Create(w, w.Goku, w.RedRibbon, [Dated(749, 750)]);

        var kept = await Update(w, link.Id, Request(w, w.Goku, w.RedRibbon, null) with { Notes = "Edited by an older client." });
        Assert.Equal(749, Assert.Single(kept.Periods!).Start!.Year);

        var cleared = await Update(w, link.Id, Request(w, w.Goku, w.RedRibbon, []));
        Assert.Empty(cleared.Periods!);
    }

    [Fact]
    public async Task The_real_world_dates_are_kept_as_they_are_beside_periods()
    {
        var w = await NewWorld("rp-legacy");
        var start = new DateTime(2019, 5, 1, 0, 0, 0, DateTimeKind.Utc);
        var link = await Create(w, w.Goku, w.RedRibbon, [Dated(749, 750)], start);

        var kept = await Update(w, link.Id, Request(w, w.Goku, w.RedRibbon, null, start));
        Assert.Equal(start, kept.StartDate);

        var cleared = await Update(w, link.Id, Request(w, w.Goku, w.RedRibbon, null));
        Assert.Null(cleared.StartDate);
        Assert.Single(cleared.Periods!);
    }

    [Fact]
    public async Task A_period_is_dates_or_an_era_of_either_end_and_nothing_else()
    {
        var w = await NewWorld("rp-checks");
        var gokuEra = await EraOf(w, w.Goku, "Red Ribbon Army Saga");
        var bulmaEra = await EraOf(w, w.Bulma, "Capsule Corp Years");

        await Refused(w, "periods[0]", new RelationshipPeriodInput(null, null));
        await Refused(w, "periods[0]", new RelationshipPeriodInput(Year(749), null, gokuEra));
        await Refused(w, "periods[0].entityEraId", new RelationshipPeriodInput(null, null, bulmaEra));
        await Refused(w, "periods[0].end.year", Dated(752, 750));

        var link = await Create(w, w.Goku, w.RedRibbon, [new RelationshipPeriodInput(null, null, gokuEra)]);
        var period = Assert.Single(link.Periods!);
        Assert.Equal("Red Ribbon Army Saga", period.EraName);
        Assert.Equal(w.Goku, period.EraEntityId);

        // Moving an end away from the era's entry is refused while a kept period still names that era - as a conflict that
        // says what to change, since the save sent no period to key an error under. Sending the periods is checked as sent.
        var moved = await w.Client.PutAsJsonAsync($"/api/universes/{w.U}/relationships/{link.Id}", Request(w, w.Bulma, w.RedRibbon, null));
        Assert.Equal(RelationshipEndpoints.PeriodEraMovedCode, await CodeOf(moved));

        var resent = await w.Client.PutAsJsonAsync(
            $"/api/universes/{w.U}/relationships/{link.Id}",
            Request(w, w.Bulma, w.RedRibbon, [new RelationshipPeriodInput(null, null, gokuEra)]));
        Assert.Contains("periods[0].entityEraId", await Errors(resent), StringComparison.Ordinal);

        var both = await Update(w, link.Id, Request(w, w.Bulma, w.RedRibbon, [new RelationshipPeriodInput(null, null, bulmaEra)]));
        Assert.Equal("Capsule Corp Years", Assert.Single(both.Periods!).EraName);
    }

    [Fact]
    public async Task At_a_point_a_link_holds_by_its_dates_or_its_eras_dates_and_says_when_it_cannot_tell()
    {
        var w = await NewWorld("rp-at");
        var undated = await EraOf(w, w.Goku, "Undated Saga");
        var dated = await EraOf(w, w.Goku, "Dated Saga", Year(800), Year(805));
        var kame = await Entry(w, "Kame House");
        var capsule = await Entry(w, "Capsule Corp");
        var tower = await Entry(w, "Korin Tower");

        await Create(w, w.Goku, w.RedRibbon, [Dated(750, 752)]);
        await Create(w, w.Goku, w.Bulma);
        await Create(w, w.Goku, kame, [new RelationshipPeriodInput(null, null, undated)]);
        await Create(w, w.Goku, capsule, [new RelationshipPeriodInput(null, null, dated)]);
        await Create(w, w.Goku, tower, [new RelationshipPeriodInput(new ChronologyValue(null, 751, 6, null), null)]);

        var at751 = (await At(w, w.Goku, "atYear=751")).ToDictionary(view => view.RelatedEntityName, view => view.Validity);
        Assert.Equal(RelationshipValidity.During, at751["Red Ribbon"]);
        Assert.Equal(RelationshipValidity.Timeless, at751["Bulma"]);
        Assert.Equal(RelationshipValidity.Unplaced, at751["Kame House"]);
        Assert.Equal(RelationshipValidity.During, at751["Korin Tower"]); // from month 6 of 751: the year asked about includes it
        Assert.False(at751.ContainsKey("Capsule Corp"));

        var at751Jan = (await At(w, w.Goku, "atYear=751&atMonth=1")).Select(view => view.RelatedEntityName).ToList();
        Assert.DoesNotContain("Korin Tower", at751Jan);

        var at802 = (await At(w, w.Goku, "atYear=802")).ToDictionary(view => view.RelatedEntityName, view => view.Validity);
        Assert.Equal(RelationshipValidity.During, at802["Capsule Corp"]);
        Assert.False(at802.ContainsKey("Red Ribbon"));

        var bad = await w.Client.GetAsync($"/api/universes/{w.U}/entities/{w.Goku}/relationships?atMonth=3");
        Assert.Contains("atYear", await Errors(bad), StringComparison.Ordinal);
    }

    [Fact]
    public async Task During_an_era_a_link_holds_when_named_for_it_or_dated_within_it()
    {
        var w = await NewWorld("rp-during");
        var saga = await EraOf(w, w.Goku, "Red Ribbon Army Saga", Year(749), Year(750));
        var later = await EraOf(w, w.Goku, "Later Saga");
        var kame = await Entry(w, "Kame House");
        var tower = await Entry(w, "Korin Tower");

        await Create(w, w.Goku, w.RedRibbon, [new RelationshipPeriodInput(null, null, saga)]);
        await Create(w, w.Goku, w.Bulma);
        await Create(w, w.Goku, kame, [Dated(750, 760)]);
        await Create(w, w.Goku, tower, [Dated(790, 791)]);

        var during = (await At(w, w.Goku, $"era={saga}")).ToDictionary(view => view.RelatedEntityName, view => view.Validity);
        Assert.Equal(RelationshipValidity.During, during["Red Ribbon"]);
        Assert.Equal(RelationshipValidity.Timeless, during["Bulma"]);
        Assert.Equal(RelationshipValidity.During, during["Kame House"]);
        Assert.False(during.ContainsKey("Korin Tower"));

        // An era with no dates holds what is named for it; a dated link cannot be placed in it, and says so.
        var undated = (await At(w, w.Goku, $"era={later}")).ToDictionary(view => view.RelatedEntityName, view => view.Validity);
        Assert.False(undated.ContainsKey("Red Ribbon"));
        Assert.Equal(RelationshipValidity.Unplaced, undated["Kame House"]);
        Assert.Equal(RelationshipValidity.Timeless, undated["Bulma"]);

        var other = await EraOf(w, w.Bulma, "Capsule Corp Years");
        var refused = await w.Client.GetAsync($"/api/universes/{w.U}/entities/{w.Goku}/relationships?era={other}");
        Assert.Contains("\"era\"", await Errors(refused), StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_era_a_period_names_cannot_be_removed_even_with_its_link_in_the_Trash()
    {
        var w = await NewWorld("rp-era-in-use");
        var saga = await EraOf(w, w.Goku, "Red Ribbon Army Saga");
        var link = await Create(w, w.Goku, w.RedRibbon, [new RelationshipPeriodInput(null, null, saga)]);
        (await w.Client.DeleteAsync($"/api/universes/{w.U}/relationships/{link.Id}")).EnsureSuccessStatusCode();

        var progression = (await w.Client.GetFromJsonAsync<ProgressionResponse>(ProgressionRoute(w, w.Goku)))!;
        var removal = await w.Client.PutAsJsonAsync(ProgressionRoute(w, w.Goku), new ProgressionRequest([], progression.Version));
        Assert.Equal(ProgressionEndpoints.EraInRelationshipCode, await CodeOf(removal));
    }

    [Fact]
    public async Task Periods_are_dated_on_the_universes_own_chronology()
    {
        var w = await NewWorld("rp-chronology");
        var chronology = await PutJson<ChronologyResponse>(w.Client, $"/api/universes/{w.U}/chronology", new ChronologyRequest(
            [new ChronologyEraRequest(null, "Age of Dragons", "AD", ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear)]));
        var age = chronology.Eras.Single().Id;

        await Refused(w, "periods[0].start.eraId", Dated(749, null));
        var link = await Create(w, w.Goku, w.RedRibbon, [new RelationshipPeriodInput(new ChronologyValue(age, 749, 5, 9), null)]);
        Assert.Equal(1, (await w.Client.GetFromJsonAsync<ChronologyResponse>($"/api/universes/{w.U}/chronology"))!.Eras.Single().PeriodCount);

        var removal = await w.Client.PutAsJsonAsync($"/api/universes/{w.U}/chronology", new ChronologyRequest([]));
        Assert.Contains("1 period of a relation", await removal.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var calendar = await w.Client.PutAsJsonAsync($"/api/universes/{w.U}/chronology/calendar", new ChronologyCalendarRequest(
            [.. Enumerable.Range(1, 6).Select(month => new ChronologyCalendarMonthRequest(null, $"Moon {month}", null, 30))]));
        Assert.True(calendar.IsSuccessStatusCode, await calendar.Content.ReadAsStringAsync());
        var converted = (await Views(w, w.Goku)).Single().Periods!.Single().Start!;
        Assert.NotNull(converted.MonthId);
        Assert.Null(converted.Month);

        (await w.Client.DeleteAsync($"/api/universes/{w.U}/chronology/calendar")).EnsureSuccessStatusCode();
        Assert.Equal(link.Periods!.Single().Start, (await Views(w, w.Goku)).Single().Periods!.Single().Start);
    }

    [Fact]
    public async Task A_backup_carries_the_periods_and_a_restore_points_them_at_the_restored_eras()
    {
        var w = await NewWorld("rp-backup");
        var saga = await EraOf(w, w.Goku, "Red Ribbon Army Saga");
        await Create(w, w.Goku, w.RedRibbon, [Dated(749, 750), new RelationshipPeriodInput(null, null, saga)]);

        var backup = await Backup(w.Client, w.U);
        Assert.Equal(29, backup.FormatVersion);
        var periods = backup.Payload.Relationships.Single().Periods!;
        Assert.Equal(2, periods.Count);
        Assert.Equal(saga, periods[1].EntityEraId);

        var restored = await RestoreTestClient.RestoreArchive(w.Client, await RawArchive(w.Client, w.U), "Restored periods");
        var goku = (await w.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{restored.Id}/entities?search=Goku"))!.Items.Single();
        var view = (await w.Client.GetFromJsonAsync<List<RelationshipView>>($"/api/universes/{restored.Id}/entities/{goku.Id}/relationships"))!.Single();
        Assert.Equal(749, view.Periods![0].Start!.Year);
        Assert.Equal("Red Ribbon Army Saga", view.Periods[1].EraName);
        Assert.NotEqual(saga, view.Periods[1].EntityEraId);

        // An era of neither end is refused by validation.
        var foreign = RestoreTestClient.Rewrite(await RawArchive(w.Client, w.U), root =>
            root["payload"]!["relationships"]![0]!["periods"]![1]!["entityEraId"] = Guid.NewGuid().ToString());
        Assert.Contains(
            (await RestoreTestClient.Refused(await RestoreTestClient.Validate(w.Client, foreign))).Issues,
            issue => issue.Message.Contains("not one of its two entries'", StringComparison.Ordinal));
    }

    // ---------- Helpers ----------

    private async Task<World> NewWorld(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var kind = await PostJson<RelationshipTypeResponse>(
            client, $"/api/universes/{universe.Id}/relationship-types", new RelationshipTypeRequest("member of", "has member", false, null, null));
        var w = new World(client, universe.Id, kind.Id, Guid.Empty, Guid.Empty, Guid.Empty);
        return w with { Goku = await Entry(w, "Goku"), RedRibbon = await Entry(w, "Red Ribbon"), Bulma = await Entry(w, "Bulma") };
    }

    private static Task<Guid> Entry(World w, string name) => CreateEntity(w.Client, w.U, name);

    private static string ProgressionRoute(World w, Guid entityId) => $"/api/universes/{w.U}/entities/{entityId}/progression";

    /// <summary>Adds one era to an entry's progression and answers its id.</summary>
    private static async Task<Guid> EraOf(World w, Guid entityId, string name, ChronologyValue? start = null, ChronologyValue? end = null)
    {
        var current = (await w.Client.GetFromJsonAsync<ProgressionResponse>(ProgressionRoute(w, entityId)))!;
        var eras = current.Eras
            .Select(era => new EraInput(era.Id, era.Name, era.Description, era.Start, era.End, [], [], []))
            .Append(new EraInput(null, name, null, start, end, [], [], []))
            .ToList();
        var saved = await PutJson<ProgressionResponse>(w.Client, ProgressionRoute(w, entityId), new ProgressionRequest(eras, current.Version));
        return saved.Eras.Single(era => era.Name == name).Id;
    }

    private static RelationshipRequest Request(
        World w,
        Guid source,
        Guid target,
        IReadOnlyList<RelationshipPeriodInput?>? periods,
        DateTime? startDate = null) =>
        new(w.Kind, source, target, CanonStatus.Canon, startDate, null, null, periods);

    private static Task<HttpResponseMessage> Post(World w, Guid source, Guid target, IReadOnlyList<RelationshipPeriodInput?>? periods = null, DateTime? startDate = null) =>
        w.Client.PostAsJsonAsync($"/api/universes/{w.U}/relationships", Request(w, source, target, periods, startDate));

    private static async Task<RelationshipDetail> Create(World w, Guid source, Guid target, IReadOnlyList<RelationshipPeriodInput?>? periods = null, DateTime? startDate = null)
    {
        var response = await Post(w, source, target, periods, startDate);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<RelationshipDetail>())!;
    }

    private static Task<RelationshipDetail> Update(World w, Guid id, RelationshipRequest request) =>
        PutJson<RelationshipDetail>(w.Client, $"/api/universes/{w.U}/relationships/{id}", request);

    private static async Task<List<RelationshipView>> Views(World w, Guid entityId) =>
        (await w.Client.GetFromJsonAsync<List<RelationshipView>>($"/api/universes/{w.U}/entities/{entityId}/relationships"))!;

    private static async Task<List<RelationshipView>> At(World w, Guid entityId, string query)
    {
        var response = await w.Client.GetAsync($"/api/universes/{w.U}/entities/{entityId}/relationships?{query}");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<List<RelationshipView>>())!;
    }

    private async Task Refused(World w, string key, params RelationshipPeriodInput[] periods)
    {
        var response = await Post(w, w.Goku, w.RedRibbon, periods);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains($"\"{key}\"", await Errors(response), StringComparison.Ordinal);
    }

    private static ChronologyValue Year(int year) => new(null, year, null, null);

    private static RelationshipPeriodInput Dated(int? start, int? end) =>
        new(start is { } from ? Year(from) : null, end is { } to ? Year(to) : null);

    private static async Task<string?> CodeOf(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }
}
