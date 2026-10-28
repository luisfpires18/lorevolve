using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The timeline on a universe that names its eras: years counted inside an era, the order the
/// eras' configuration gives them, and the refusals that keep a moment from claiming a place on
/// a line it is not on.
///
/// The plain reckoning is <see cref="TimelineEndpointTests"/>, left exactly as it was, because
/// a universe with no eras must behave exactly as it always has. Credentials are obviously
/// synthetic.
/// </summary>
public sealed class TimelineChronologyTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private static readonly int[] SpreadYears = [1, 7, 40];

    private static readonly int?[] SpreadMonths = [null, 2, 11];

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Writing a year in an era ----------

    [Fact]
    public async Task A_moment_is_written_and_read_back_in_its_era()
    {
        var (client, universe, eras) = await WithTheFall("tleraread");

        var created = await Create(client, universe.Id, InEra("The fall", eras.Before, 10));
        var read = await Get(client, universe.Id, created.Id);

        Assert.Equal(10, read.Date.StartYear);
        Assert.Equal(eras.Before, read.Date.StartEraId);
        Assert.Null(read.Date.EndEraId);
        Assert.Null(read.Date.EraLabel);
    }

    [Fact]
    public async Task A_moment_can_be_moved_into_another_era()
    {
        var (client, universe, eras) = await WithTheFall("tleramove");
        var created = await Create(client, universe.Id, InEra("Rebuilding", eras.Before, 10));

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/timeline/{created.Id}",
            InEra("Rebuilding", eras.After, 3));
        response.EnsureSuccessStatusCode();

        var read = await Get(client, universe.Id, created.Id);
        Assert.Equal(3, read.Date.StartYear);
        Assert.Equal(eras.After, read.Date.StartEraId);
    }

    [Fact]
    public async Task A_range_may_start_in_one_era_and_end_in_the_next()
    {
        var (client, universe, eras) = await WithTheFall("tlerarange");

        var entry = await Create(client, universe.Id, Span("The long war", eras.Before, 3, eras.After, 2));

        Assert.Equal(eras.Before, entry.Date.StartEraId);
        Assert.Equal(eras.After, entry.Date.EndEraId);
    }

    [Fact]
    public async Task A_range_that_ends_in_an_earlier_era_is_refused()
    {
        var (client, universe, eras) = await WithTheFall("tlerarangeback");

        var response = await Post(client, universe.Id, Span("Backwards", eras.After, 2, eras.Before, 3));

        await AssertRefused(response, "endYear");
    }

    [Fact]
    public async Task A_range_that_ends_on_a_larger_year_of_a_counting_down_era_is_refused()
    {
        var (client, universe, eras) = await WithTheFall("tlerarangedown");

        // BF 10 is seven years before BF 3.
        var response = await Post(client, universe.Id, Span("Backwards", eras.Before, 3, eras.Before, 10));

        await AssertRefused(response, "endYear");
    }

    // ---------- Refused ----------

    [Fact]
    public async Task A_dated_moment_needs_an_era_once_the_universe_names_them()
    {
        var (client, universe, _) = await WithTheFall("tleranone");

        await AssertRefused(await Post(client, universe.Id, Plain("Somewhen", 10)), "startEraId");
    }

    [Fact]
    public async Task A_range_needs_an_era_for_its_end_as_well()
    {
        var (client, universe, eras) = await WithTheFall("tleranoend");

        await AssertRefused(
            await Post(client, universe.Id, Span("Half placed", eras.Before, 3, null, 2)),
            "endEraId");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task A_year_inside_an_era_counts_up_from_one(int year)
    {
        var (client, universe, eras) = await WithTheFall($"tlerazero{year + 10}");

        await AssertRefused(await Post(client, universe.Id, InEra("Year nought", eras.After, year)), "startYear");
    }

    [Fact]
    public async Task A_free_text_era_label_is_refused_once_eras_are_named()
    {
        var (client, universe, eras) = await WithTheFall("tleralabel");

        await AssertRefused(
            await Post(client, universe.Id, InEra("Labelled", eras.After, 3) with { EraLabel = "Third Age" }),
            "eraLabel");
    }

    [Fact]
    public async Task An_era_is_refused_on_a_universe_that_names_none()
    {
        var (client, universe) = await SignedInWithUniverse("tleraplain");

        await AssertRefused(
            await Post(client, universe.Id, InEra("Imagined era", Guid.NewGuid(), 3)),
            "startEraId");
    }

    [Fact]
    public async Task An_unknown_date_carries_no_era()
    {
        var (client, universe, eras) = await WithTheFall("tleraunknown");

        var request = new TimelineEntryRequest(
            "Some day", null, CanonStatus.Idea, TimelineDateKind.Unknown, null, null, null, null, null, null, null, null,
            StartEraId: eras.After);

        await AssertRefused(await Post(client, universe.Id, request), "dateKind");
    }

    [Fact]
    public async Task An_exact_date_carries_no_end_era()
    {
        var (client, universe, eras) = await WithTheFall("tleraexactend");

        await AssertRefused(
            await Post(client, universe.Id, InEra("One day", eras.After, 3) with { EndEraId = eras.After }),
            "endYear");
    }

    [Fact]
    public async Task An_era_from_another_universe_is_refused_without_naming_it()
    {
        var (client, universe, _) = await WithTheFall("tleraforeign");
        var elsewhere = await CreateUniverse(client, "World tleraforeign two");
        var foreign = await TheFall(client, elsewhere.Id);

        await AssertRefused(await Post(client, universe.Id, InEra("Borrowed", foreign.After, 3)), "startEraId");
    }

    [Fact]
    public async Task An_era_from_another_owners_universe_is_refused()
    {
        var (owner, ownersUniverse) = await SignedInWithUniverse("tleracrossowner");
        var secret = await TheFall(owner, ownersUniverse.Id);

        var stranger = await SignedInClient("user-tleracrossownerstranger");
        var theirs = await CreateUniverse(stranger, "World tleracrossowner stranger");
        await TheFall(stranger, theirs.Id);

        var response = await Post(stranger, theirs.Id, InEra("Trespass", secret.Before, 3));

        await AssertRefused(response, "startEraId");
        Assert.DoesNotContain("Before the Fall\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    // ---------- Order ----------

    [Fact]
    public async Task Inside_an_era_that_counts_down_the_larger_years_come_first()
    {
        var (client, universe, eras) = await WithTheFall("tleradown");
        await Create(client, universe.Id, InEra("BF 1", eras.Before, 1));
        await Create(client, universe.Id, InEra("BF 100", eras.Before, 100));
        await Create(client, universe.Id, InEra("BF 10", eras.Before, 10));

        Assert.Equal(["BF 100", "BF 10", "BF 1"], await Titles(client, universe.Id));
    }

    [Fact]
    public async Task The_listing_runs_across_eras_in_their_configured_order_with_unknown_dates_last()
    {
        var (client, universe, eras) = await WithTheFall("tleraacross");
        await Create(client, universe.Id, InEra("AF 10", eras.After, 10));
        await Create(client, universe.Id, Unknown("Unplaced"));
        await Create(client, universe.Id, InEra("BF 1", eras.Before, 1));
        await Create(client, universe.Id, InEra("AF 1", eras.After, 1));
        await Create(client, universe.Id, InEra("BF 10", eras.Before, 10));

        Assert.Equal(["BF 10", "BF 1", "AF 1", "AF 10", "Unplaced"], await Titles(client, universe.Id));
    }

    [Fact]
    public async Task Three_eras_order_by_their_configuration_never_by_their_names()
    {
        var (client, universe) = await SignedInWithUniverse("tlerathree");
        var eras = await SaveEras(
            client,
            universe.Id,
            Era("Zenith", "Z", ChronologyEraDirection.Ascending),
            Era("After Everything", "AE", ChronologyEraDirection.Descending),
            Era("Before Anything", "BA", ChronologyEraDirection.Ascending));

        await Create(client, universe.Id, InEra("BA 2", eras[2].Id, 2));
        await Create(client, universe.Id, InEra("AE 1", eras[1].Id, 1));
        await Create(client, universe.Id, InEra("Z 900", eras[0].Id, 900));
        await Create(client, universe.Id, InEra("AE 50", eras[1].Id, 50));
        await Create(client, universe.Id, InEra("BA 1", eras[2].Id, 1));

        Assert.Equal(["Z 900", "AE 50", "AE 1", "BA 1", "BA 2"], await Titles(client, universe.Id));
    }

    [Fact]
    public async Task Months_and_days_keep_their_precision_and_run_forwards_in_a_counting_down_year()
    {
        var (client, universe, eras) = await WithTheFall("tleramonths");
        await Create(client, universe.Id, InEra("BF 9", eras.Before, 9));
        await Create(client, universe.Id, InEra("Late in BF 10", eras.Before, 10, 11, 2));
        await Create(client, universe.Id, InEra("Early in BF 10", eras.Before, 10, 1));
        await Create(client, universe.Id, InEra("Sometime in BF 10", eras.Before, 10));

        var page = await List(client, universe.Id);

        Assert.Equal(
            ["Sometime in BF 10", "Early in BF 10", "Late in BF 10", "BF 9"],
            page.Items.Select(entry => entry.Title).ToArray());

        var late = page.Items.Single(entry => entry.Title == "Late in BF 10");
        Assert.Equal(TimelineDatePrecision.Day, late.Date.StartPrecision);
        Assert.Equal(TimelineDatePrecision.Month, page.Items.Single(entry => entry.Title == "Early in BF 10").Date.StartPrecision);
    }

    [Fact]
    public async Task Paging_walks_the_era_order_without_repeating_or_dropping_a_moment()
    {
        var (client, universe, eras) = await WithTheFall("tlerapaging");
        await Create(client, universe.Id, InEra("AF 2", eras.After, 2));
        await Create(client, universe.Id, InEra("BF 1", eras.Before, 1));
        await Create(client, universe.Id, InEra("AF 1", eras.After, 1));
        await Create(client, universe.Id, InEra("BF 9", eras.Before, 9));
        await Create(client, universe.Id, InEra("BF 5", eras.Before, 5));

        var first = await List(client, universe.Id, page: 1, pageSize: 2);
        var second = await List(client, universe.Id, page: 2, pageSize: 2);
        var third = await List(client, universe.Id, page: 3, pageSize: 2);

        Assert.Equal(5, first.TotalCount);
        Assert.Equal(["BF 9", "BF 5"], first.Items.Select(entry => entry.Title).ToArray());
        Assert.Equal(["BF 1", "AF 1"], second.Items.Select(entry => entry.Title).ToArray());
        Assert.Equal(["AF 2"], third.Items.Select(entry => entry.Title).ToArray());
    }

    [Fact]
    public async Task Moments_dated_before_the_eras_existed_wait_between_the_placed_ones_and_the_unknown()
    {
        var (client, universe) = await SignedInWithUniverse("tleralegacy");
        await Create(client, universe.Id, Plain("Plain 3018", 3018));
        await Create(client, universe.Id, Plain("Plain minus five", -5));
        await Create(client, universe.Id, Unknown("Unplaced"));

        var eras = await TheFall(client, universe.Id);
        await Create(client, universe.Id, InEra("AF 1", eras.After, 1));
        await Create(client, universe.Id, InEra("BF 1", eras.Before, 1));

        // Not ranked among the eras - nothing says which era a bare 3018 meant - but not lost
        // either, and in their old order among themselves.
        Assert.Equal(
            ["BF 1", "AF 1", "Plain minus five", "Plain 3018", "Unplaced"],
            await Titles(client, universe.Id));
    }

    [Fact]
    public async Task A_moment_written_before_the_eras_is_given_one_the_next_time_it_is_saved()
    {
        var (client, universe) = await SignedInWithUniverse("tleralegacyedit");
        var old = await Create(client, universe.Id, Plain("Old moment", 3018) with { EraLabel = "Third Age" });
        var eras = await TheFall(client, universe.Id);

        var untouched = await Get(client, universe.Id, old.Id);
        Assert.Equal("Third Age", untouched.Date.EraLabel);

        var refused = await client.PutAsJsonAsync($"/api/universes/{universe.Id}/timeline/{old.Id}", Plain("Old moment", 3018));
        await AssertRefused(refused, "startEraId");

        var placed = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/timeline/{old.Id}",
            InEra("Old moment", eras.After, 18));
        placed.EnsureSuccessStatusCode();

        var read = await Get(client, universe.Id, old.Id);
        Assert.Equal(eras.After, read.Date.StartEraId);
        Assert.Null(read.Date.EraLabel);
    }

    /// <summary>
    /// The listing sorts in SQL and every other consumer sorts with <see cref="ChronologyPoint"/>.
    /// This is what keeps them one ordering: a spread of moments across three eras of both
    /// directions, written out of order, must list exactly as the comparer sorts them.
    /// </summary>
    [Fact]
    public async Task The_listing_order_is_the_chronology_comparers_order()
    {
        var (client, universe) = await SignedInWithUniverse("tleracomparer");
        var eras = await SaveEras(
            client,
            universe.Id,
            Era("Rising", "R", ChronologyEraDirection.Ascending),
            Era("Long Night", "LN", ChronologyEraDirection.Descending),
            Era("Return", "RT", ChronologyEraDirection.Ascending));

        var specs =
            from eraIndex in Enumerable.Range(0, eras.Count)
            from year in SpreadYears
            from month in SpreadMonths
            select (EraIndex: eraIndex, Year: year, Month: month);

        var written = new List<TimelineEntryResponse>();
        var index = 0;

        foreach (var spec in specs.OrderBy(spec => ((spec.Year * 31) + ((spec.Month ?? 0) * 7) + (spec.EraIndex * 13)) % 17))
        {
            written.Add(await Create(
                client,
                universe.Id,
                InEra($"Moment {index++:D2}", eras[spec.EraIndex].Id, spec.Year, spec.Month)));
        }

        var chronology = UniverseChronology.Of(eras.Select(era => new ChronologyEra
        {
            Id = era.Id,
            Name = era.Name,
            Abbreviation = era.Abbreviation,
            SortOrder = era.SortOrder,
            Direction = era.Direction,
            LabelPosition = era.LabelPosition,
        }));

        var expected = written
            .OrderBy(entry => chronology.Point(entry.Date.StartEraId, entry.Date.StartYear, entry.Date.StartMonth, entry.Date.StartDay)!.Value)
            .ThenBy(entry => entry.Title, StringComparer.Ordinal)
            .Select(entry => entry.Title)
            .ToArray();

        Assert.Equal(expected, await Titles(client, universe.Id));
    }

    // ---------- Date periods have no set length (refinement 018) ----------
    //
    // Authors call an era a date period. Nothing bounds its years: the editor's old preview drew
    // "BF 120 ... AF 120" from a hard-coded sample and read as a limit, but there never was one.

    [Fact]
    public async Task A_date_period_has_no_upper_bound_on_its_years()
    {
        var (client, universe) = await SignedInWithUniverse("tlperiodages");
        var ages = await SaveEras(
            client,
            universe.Id,
            Era("First Age", "FA", ChronologyEraDirection.Ascending),
            Era("Second Age", "SA", ChronologyEraDirection.Ascending),
            Era("Third Age", "TA", ChronologyEraDirection.Ascending));

        var council = await Create(client, universe.Id, InEra("TA 3018", ages[2].Id, 3018, 10, 25));
        await Create(client, universe.Id, InEra("TA 121", ages[2].Id, 121));
        await Create(client, universe.Id, InEra("SA 3441", ages[1].Id, 3441));
        await Create(client, universe.Id, InEra("TA 1", ages[2].Id, 1));
        await Create(client, universe.Id, InEra("FA 590", ages[0].Id, 590));
        await Create(client, universe.Id, InEra("TA 120", ages[2].Id, 120));
        await Create(client, universe.Id, InEra("TA 100000", ages[2].Id, 100000));

        Assert.Equal(3018, council.Date.StartYear);
        Assert.Equal(ages[2].Id, council.Date.StartEraId);
        Assert.Equal(
            ["FA 590", "SA 3441", "TA 1", "TA 120", "TA 121", "TA 3018", "TA 100000"],
            await Titles(client, universe.Id));
    }

    [Fact]
    public async Task A_counting_down_period_has_no_bound_on_how_far_back_it_reaches()
    {
        var (client, universe, eras) = await WithTheFall("tlperioddown");
        await Create(client, universe.Id, InEra("BF 1", eras.Before, 1));
        await Create(client, universe.Id, InEra("BF 5000", eras.Before, 5000));
        await Create(client, universe.Id, InEra("BF 120", eras.Before, 120));
        await Create(client, universe.Id, InEra("AF 1", eras.After, 1));

        Assert.Equal(["BF 5000", "BF 120", "BF 1", "AF 1"], await Titles(client, universe.Id));
    }

    [Fact]
    public async Task Renaming_a_date_period_moves_no_date()
    {
        var (client, universe, eras) = await WithTheFall("tlperiodrename");
        await Create(client, universe.Id, InEra("BF 10", eras.Before, 10));
        await Create(client, universe.Id, InEra("AF 3", eras.After, 3));
        await Create(client, universe.Id, InEra("BF 2", eras.Before, 2));
        string[] order = ["BF 10", "BF 2", "AF 3"];
        Assert.Equal(order, await Titles(client, universe.Id));

        await SaveEras(
            client,
            universe.Id,
            new ChronologyEraRequest(eras.Before, "The Long Dark", "LD", ChronologyEraDirection.Descending, ChronologyLabelPosition.AfterYear),
            new ChronologyEraRequest(eras.After, "The Dawn", "D", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear));

        Assert.Equal(order, await Titles(client, universe.Id));
    }

    [Fact]
    public async Task Reordering_date_periods_repositions_their_dates()
    {
        var (client, universe, eras) = await WithTheFall("tlperiodreorder");
        await Create(client, universe.Id, InEra("AF 3", eras.After, 3));
        await Create(client, universe.Id, InEra("BF 10", eras.Before, 10));
        Assert.Equal(["BF 10", "AF 3"], await Titles(client, universe.Id));

        await SaveEras(
            client,
            universe.Id,
            new ChronologyEraRequest(eras.After, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            new ChronologyEraRequest(eras.Before, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear));

        Assert.Equal(["AF 3", "BF 10"], await Titles(client, universe.Id));
    }

    [Fact]
    public async Task Turning_a_date_period_around_repositions_its_dates()
    {
        var (client, universe, eras) = await WithTheFall("tlperiodturn");
        await Create(client, universe.Id, InEra("AF 1", eras.After, 1));
        await Create(client, universe.Id, InEra("AF 3018", eras.After, 3018));
        Assert.Equal(["AF 1", "AF 3018"], await Titles(client, universe.Id));

        await SaveEras(
            client,
            universe.Id,
            new ChronologyEraRequest(eras.Before, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
            new ChronologyEraRequest(eras.After, "After the Fall", "AF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear));

        Assert.Equal(["AF 3018", "AF 1"], await Titles(client, universe.Id));
    }

    [Fact]
    public async Task Year_zero_is_still_refused_inside_a_date_period_and_worded_as_one()
    {
        var (client, universe, eras) = await WithTheFall("tlperiodzero");

        var response = await Post(client, universe.Id, InEra("Year nought", eras.After, 0));

        await AssertRefused(response, "startYear");
        Assert.Contains("date period", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    // ---------- Helpers ----------

    private sealed record FallEras(Guid Before, Guid After);

    /// <summary>Before the Fall counts down to it; After the Fall counts up from it.</summary>
    private async Task<(HttpClient Client, UniverseDetail Universe, FallEras Eras)> WithTheFall(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(tag);
        return (client, universe, await TheFall(client, universe.Id));
    }

    private static async Task<FallEras> TheFall(HttpClient client, Guid universeId)
    {
        var eras = await SaveEras(
            client,
            universeId,
            Era("Before the Fall", "BF", ChronologyEraDirection.Descending),
            Era("After the Fall", "AF", ChronologyEraDirection.Ascending));

        return new FallEras(eras[0].Id, eras[1].Id);
    }

    private static ChronologyEraRequest Era(string name, string abbreviation, ChronologyEraDirection direction) =>
        new(null, name, abbreviation, direction, ChronologyLabelPosition.BeforeYear);

    private static async Task<IReadOnlyList<ChronologyEraResponse>> SaveEras(
        HttpClient client,
        Guid universeId,
        params ChronologyEraRequest[] eras)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/chronology", new ChronologyRequest(eras));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
    }

    private static TimelineEntryRequest InEra(string title, Guid eraId, int year, int? month = null, int? day = null) =>
        new(title, null, CanonStatus.Idea, TimelineDateKind.Exact, year, month, day, null, null, null, null, null,
            StartEraId: eraId);

    private static TimelineEntryRequest Span(string title, Guid startEra, int startYear, Guid? endEra, int endYear) =>
        new(title, null, CanonStatus.Idea, TimelineDateKind.Range, startYear, null, null, endYear, null, null, null, null,
            StartEraId: startEra, EndEraId: endEra);

    private static TimelineEntryRequest Plain(string title, int year) =>
        new(title, null, CanonStatus.Idea, TimelineDateKind.Exact, year, null, null, null, null, null, null, null);

    private static TimelineEntryRequest Unknown(string title) =>
        new(title, null, CanonStatus.Idea, TimelineDateKind.Unknown, null, null, null, null, null, null, null, null);

    private static async Task AssertRefused(HttpResponseMessage response, string key)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains($"\"{key}\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    private static Task<HttpResponseMessage> Post(HttpClient client, Guid universeId, TimelineEntryRequest request) =>
        client.PostAsJsonAsync($"/api/universes/{universeId}/timeline", request);

    private static async Task<TimelineEntryResponse> Create(HttpClient client, Guid universeId, TimelineEntryRequest request)
    {
        var response = await Post(client, universeId, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;
    }

    private static async Task<TimelineEntryResponse> Get(HttpClient client, Guid universeId, Guid entryId) =>
        (await client.GetFromJsonAsync<TimelineEntryResponse>($"/api/universes/{universeId}/timeline/{entryId}"))!;

    private static async Task<TimelineEntryPage> List(HttpClient client, Guid universeId, int page = 1, int pageSize = 100) =>
        (await client.GetFromJsonAsync<TimelineEntryPage>(
            $"/api/universes/{universeId}/timeline?page={page}&pageSize={pageSize}"))!;

    private static async Task<string[]> Titles(HttpClient client, Guid universeId) =>
        [.. (await List(client, universeId)).Items.Select(entry => entry.Title)];

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
