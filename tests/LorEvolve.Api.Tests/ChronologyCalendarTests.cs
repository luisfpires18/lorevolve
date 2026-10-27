using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Timeline;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Custom calendars (039, ADR 0022 amendment): a universe's months by id, each with its own length; turned on and off by
/// converting every date deterministically or refusing; edited whole without rewriting a date; and every date ordered by the
/// month's place in the calendar - in the comparer, the moment listing, the unified feed and range validation alike.
/// </summary>
public sealed class ChronologyCalendarTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Helpers ----------

    private static string Calendar(Guid u) => $"/api/universes/{u}/chronology/calendar";

    private static ChronologyCalendarMonthRequest M(string name, int days, Guid? id = null, string? abbreviation = null) =>
        new(id, name, abbreviation, days);

    private static async Task<ChronologyResponse> Save(HttpClient client, Guid u, params ChronologyCalendarMonthRequest[] months)
    {
        var response = await client.PutAsJsonAsync(Calendar(u), new ChronologyCalendarRequest(months));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!;
    }

    private static async Task<string> Conflict(HttpResponseMessage response, string code)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(code, problem.RootElement.GetProperty("code").GetString());
        return problem.RootElement.GetProperty("detail").GetString()!;
    }

    private static async Task<Dictionary<string, string[]>> Invalid(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.GetProperty("errors").Deserialize<Dictionary<string, string[]>>()!;
    }

    private static async Task<ChronologyResponse> Read(HttpClient client, Guid u) =>
        (await client.GetFromJsonAsync<ChronologyResponse>($"/api/universes/{u}/chronology"))!;

    private static Guid Id(ChronologyResponse chronology, string name) =>
        chronology.Calendar!.Months.Single(month => month.Name == name).Id;

    private static ChronologyCalendarMonthRequest Keep(ChronologyResponse chronology, string name, string? rename = null, int? days = null)
    {
        var month = chronology.Calendar!.Months.Single(candidate => candidate.Name == name);
        return new ChronologyCalendarMonthRequest(month.Id, rename ?? month.Name, month.Abbreviation, days ?? month.DayCount);
    }

    private static TimelineEntryRequest Exact(string title, int year, int? month = null, int? day = null, Guid? monthId = null, Guid? era = null) =>
        new(title, null, CanonStatus.Draft, TimelineDateKind.Exact, year, month, day, null, null, null, null, null, era, StartMonthId: monthId);

    private static TimelineEntryRequest Span(
        string title,
        int startYear,
        Guid? startMonth,
        int? startDay,
        int endYear,
        Guid? endMonth,
        int? endDay,
        Guid? startEra = null,
        Guid? endEra = null) =>
        new(title, null, CanonStatus.Draft, TimelineDateKind.Range, startYear, null, startDay, endYear, null, endDay, null, null, startEra, endEra,
            StartMonthId: startMonth, EndMonthId: endMonth);

    private static Task<HttpResponseMessage> PostMoment(HttpClient client, Guid u, TimelineEntryRequest request) =>
        client.PostAsJsonAsync($"/api/universes/{u}/timeline", request);

    private static async Task<TimelineEntryResponse> Moment(HttpClient client, Guid u, TimelineEntryRequest request) =>
        await PostJson<TimelineEntryResponse>(client, $"/api/universes/{u}/timeline", request);

    private static async Task<TimelineEntryResponse> ReadMoment(HttpClient client, Guid u, Guid id) =>
        (await client.GetFromJsonAsync<TimelineEntryResponse>($"/api/universes/{u}/timeline/{id}"))!;

    private static SceneRequest SceneAt(string title, int? year, int? month = null, int? day = null, Guid? monthId = null) =>
        new(title, null, null, null, year is null ? null : new ChronologyValue(null, year, month, day, monthId), null);

    private static async Task<SceneResponse> Scene(HttpClient client, Guid u, Guid story, SceneRequest request) =>
        await PostJson<SceneResponse>(client, $"{Story(u, story)}/scenes", request);

    private static async Task<SceneResponse> ReadScene(HttpClient client, Guid u, Guid story, Guid scene) =>
        (await client.GetFromJsonAsync<SceneResponse>($"{Story(u, story)}/scenes/{scene}"))!;

    private static async Task<List<string>> Feed(HttpClient client, Guid u, string query = "") =>
        [.. (await client.GetFromJsonAsync<TimelineItemPage>($"/api/universes/{u}/timeline/items?pageSize=100{query}"))!.Items.Select(item => item.Title)];

    private static async Task<List<string>> Moments(HttpClient client, Guid u) =>
        [.. (await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{u}/timeline?pageSize=100"))!.Items.Select(item => item.Title)];

    // ---------- Creating ----------

    [Fact]
    public async Task A_calendar_takes_any_number_of_months_of_any_length_and_reads_back_in_order()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-create");
        var u = universe.Id;

        Assert.Null((await Read(client, u)).Calendar);

        var one = await Save(client, u, M("Longwinter", 400));
        Assert.Equal(("Longwinter", 400, 0), (one.Calendar!.Months[0].Name, one.Calendar.Months[0].DayCount, one.Calendar.Months[0].SortOrder));

        var twelve = await Save(client, u, [.. Enumerable.Range(1, 12).Select(index => M($"Month {index}", 30))]);
        Assert.Equal(12, twelve.Calendar!.Months.Count);

        ChronologyCalendarMonthRequest[] odd =
        [
            M("Frostwane", 42, abbreviation: "Frw"), M("Emberrise", 18), M("Highsun", 63), M("Ashfall", 27), M("Thaw", 1),
            .. Enumerable.Range(1, 9).Select(index => M($"Tide {index}", index * 7)),
        ];
        var fourteen = await Save(client, u, odd);
        Assert.Equal(odd.Select(month => (month.Name!, month.DayCount)), fourteen.Calendar!.Months.Select(month => (month.Name, month.DayCount)));
        Assert.Equal(Enumerable.Range(0, 14), fourteen.Calendar.Months.Select(month => month.SortOrder));
        Assert.Equal("Frw", fourteen.Calendar.Months[0].Abbreviation);
        Assert.Equal(fourteen.Calendar.Months.Select(month => month.Name), (await Read(client, u)).Calendar!.Months.Select(month => month.Name));

        // Saving the date periods is a separate write and never touches the calendar.
        var eras = await client.PutAsJsonAsync($"/api/universes/{u}/chronology", new ChronologyRequest(
            [new ChronologyEraRequest(null, "Third Age", "TA", ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear)]));
        Assert.Equal(14, (await eras.Content.ReadFromJsonAsync<ChronologyResponse>())!.Calendar!.Months.Count);
    }

    [Fact]
    public async Task A_calendar_of_the_wrong_shape_is_refused_and_nothing_is_saved()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-shape");
        var u = universe.Id;

        async Task<Dictionary<string, string[]>> Refused(params ChronologyCalendarMonthRequest[] months) =>
            await Invalid(await client.PutAsJsonAsync(Calendar(u), new ChronologyCalendarRequest(months)));

        Assert.Contains("months", (await Refused()).Keys);
        Assert.Contains("months[1].name", (await Refused(M("Frostwane", 42), M("FROSTWANE", 10))).Keys);
        Assert.Contains("months[0].name", (await Refused(M("  ", 42))).Keys);
        Assert.Contains("months[0].dayCount", (await Refused(M("Frostwane", 0))).Keys);
        Assert.Contains("months[0].dayCount", (await Refused(M("Frostwane", -3))).Keys);
        Assert.Contains("months[0].dayCount", (await Refused(M("Frostwane", ChronologyLimits.MaxDaysInMonth + 1))).Keys);
        Assert.Contains("months", (await Refused([.. Enumerable.Range(0, ChronologyLimits.MaxMonths + 1).Select(index => M($"M{index}", 5))])).Keys);
        Assert.Contains("months[0].id", (await Refused(M("Frostwane", 42, Guid.NewGuid()))).Keys);

        Assert.Null((await Read(client, u)).Calendar);
    }

    // ---------- Turning it on ----------

    [Fact]
    public async Task Turning_a_calendar_on_moves_every_simple_month_to_the_month_at_its_place_and_keeps_the_day()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-enable");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Before");

        var exact = await Moment(client, u, Exact("The fifteenth", 401, 3, 15));
        var yearOnly = await Moment(client, u, Exact("Some year", 401));
        var span = await PostJson<TimelineEntryResponse>(client, $"/api/universes/{u}/timeline",
            new TimelineEntryRequest("A season", null, CanonStatus.Draft, TimelineDateKind.Range, 401, 1, null, 401, 4, 2, null, null));
        var scene = await Scene(client, u, story, SceneAt("A scene", 401, 3, 15));
        var binned = await Scene(client, u, story, SceneAt("A binned scene", 401, 2, 20));
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{binned.Id}")).EnsureSuccessStatusCode();
        var before = await Feed(client, u);

        var on = await Save(client, u, M("Frostwane", 42), M("Emberrise", 20), M("Highsun", 63), M("Ashfall", 27));

        // Month N ranks as month N did, so nothing moved on the timeline.
        Assert.Equal(before, await Feed(client, u));
        Assert.Equal((2, 15), (on.Calendar!.Months[2].UseCount, on.Calendar.Months[2].MaxDayUsed));

        var moved = await ReadMoment(client, u, exact.Id);
        Assert.Equal((null, Id(on, "Highsun"), 15), (moved.Date.StartMonth, moved.Date.StartMonthId, moved.Date.StartDay));
        Assert.Equal(TimelineDatePrecision.Day, moved.Date.StartPrecision);
        var bare = (await ReadMoment(client, u, yearOnly.Id)).Date;
        Assert.Equal((null, null), (bare.StartMonth, bare.StartMonthId));

        var season = await ReadMoment(client, u, span.Id);
        Assert.Equal((Id(on, "Frostwane"), Id(on, "Ashfall"), 2), (season.Date.StartMonthId, season.Date.EndMonthId, season.Date.EndDay));

        var dated = (await ReadScene(client, u, story, scene.Id)).Chronology!;
        Assert.Equal((null, Id(on, "Highsun"), 15), (dated.Month, dated.MonthId, dated.Day));

        // The scene in the Trash came along too, so it still means something when it comes back.
        (await client.PostAsync($"/api/universes/{u}/trash/scenes/{binned.Id}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(Id(on, "Emberrise"), (await ReadScene(client, u, story, binned.Id)).Chronology!.MonthId);
    }

    [Fact]
    public async Task Turning_a_calendar_on_is_refused_while_a_date_has_no_month_or_day_to_go_to_and_nothing_changes()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-enable-refused");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Late");
        var december = await Moment(client, u, Exact("A December", 10, 12, 1));
        await Scene(client, u, story, SceneAt("Last day of February", 10, 2, 31));

        ChronologyCalendarMonthRequest[] ten = [.. Enumerable.Range(1, 10).Select(index => M($"Month {index}", 40))];
        var tooFew = await Conflict(await client.PutAsJsonAsync(Calendar(u), new ChronologyCalendarRequest(ten)), ChronologyCalendarEndpoints.DatesIncompatibleCode);
        Assert.Contains("month 12", tooFew, StringComparison.Ordinal);
        Assert.Contains("10 months", tooFew, StringComparison.Ordinal);

        ChronologyCalendarMonthRequest[] shortSecond = [.. Enumerable.Range(1, 12).Select(index => M($"Month {index}", index == 2 ? 20 : 31))];
        var tooShort = await Conflict(await client.PutAsJsonAsync(Calendar(u), new ChronologyCalendarRequest(shortSecond)), ChronologyCalendarEndpoints.DatesIncompatibleCode);
        Assert.Contains("day 31 of month 2", tooShort, StringComparison.Ordinal);
        Assert.Contains("\"Month 2\" has 20 days", tooShort, StringComparison.Ordinal);

        // Atomic: no calendar, and every date exactly as written.
        Assert.Null((await Read(client, u)).Calendar);
        var unchanged = await ReadMoment(client, u, december.Id);
        Assert.Equal((12, null, 1), (unchanged.Date.StartMonth, unchanged.Date.StartMonthId, unchanged.Date.StartDay));
    }

    // ---------- Editing ----------

    [Fact]
    public async Task Renaming_reordering_adding_and_lengthening_months_rewrites_no_date()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-edit");
        var u = universe.Id;
        var on = await Save(client, u, M("Frostwane", 40), M("Emberrise", 18), M("Highsun", 63));
        var frost = Id(on, "Frostwane");
        var moment = await Moment(client, u, Exact("Thirty-eighth", 5, monthId: frost, day: 38));
        var stamp = moment.UpdatedAt;

        // Rename, move to the end, add two, lengthen: one save.
        var edited = await Save(
            client,
            u,
            Keep(on, "Emberrise"),
            M("Thaw", 12),
            Keep(on, "Highsun"),
            Keep(on, "Frostwane", rename: "Snowrest", days: 50),
            M("Ashfall", 27));

        Assert.Equal(["Emberrise", "Thaw", "Highsun", "Snowrest", "Ashfall"], edited.Calendar!.Months.Select(month => month.Name));
        Assert.Equal(frost, Id(edited, "Snowrest"));
        Assert.Equal((50, 1, 38), (edited.Calendar.Months[3].DayCount, edited.Calendar.Months[3].UseCount, edited.Calendar.Months[3].MaxDayUsed));

        var after = await ReadMoment(client, u, moment.Id);
        Assert.Equal((frost, 38, stamp), (after.Date.StartMonthId, after.Date.StartDay, after.UpdatedAt));
    }

    [Fact]
    public async Task A_month_in_use_cannot_go_and_cannot_shrink_below_a_day_in_use_and_nothing_is_saved()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-edit-refused");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Uses");
        var on = await Save(client, u, M("Frostwane", 40), M("Emberrise", 18), M("Spare", 10));
        var binned = await Scene(client, u, story, SceneAt("In the Trash", 5, day: 38, monthId: Id(on, "Frostwane")));
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{binned.Id}")).EnsureSuccessStatusCode();

        // Removing the unused month is fine.
        var spareGone = await Save(client, u, Keep(on, "Frostwane"), Keep(on, "Emberrise"));
        Assert.Equal(2, spareGone.Calendar!.Months.Count);

        // Removing the used one - used only from the Trash - is not.
        var removed = await Conflict(
            await client.PutAsJsonAsync(Calendar(u), new ChronologyCalendarRequest([Keep(on, "Emberrise")])),
            ChronologyCalendarEndpoints.MonthInUseCode);
        Assert.Contains("\"Frostwane\" is still used by 1 dated scene or timeline moment", removed, StringComparison.Ordinal);
        Assert.Contains("Trash", removed, StringComparison.Ordinal);

        var shrunk = await Conflict(
            await client.PutAsJsonAsync(Calendar(u), new ChronologyCalendarRequest([Keep(on, "Frostwane", days: 30), Keep(on, "Emberrise")])),
            ChronologyCalendarEndpoints.MonthTooShortCode);
        Assert.Contains("uses day 38", shrunk, StringComparison.Ordinal);

        // Down to exactly the day in use is fine; nothing about the date changed meanwhile.
        var exact = await Save(client, u, Keep(on, "Frostwane", days: 38), Keep(on, "Emberrise"));
        Assert.Equal(38, exact.Calendar!.Months[0].DayCount);
        Assert.Equal((Id(on, "Frostwane"), 38), (exact.Calendar.Months[0].Id, exact.Calendar.Months[0].MaxDayUsed));
    }

    // ---------- Turning it off ----------

    [Fact]
    public async Task Turning_a_calendar_off_writes_each_month_as_its_place_or_refuses_and_touches_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-disable");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Off");
        ChronologyCalendarMonthRequest[] thirteen = [.. Enumerable.Range(1, 13).Select(index => M($"Month {index}", index == 2 ? 45 : 30))];
        var on = await Save(client, u, thirteen);

        var late = await Moment(client, u, Exact("In the thirteenth", 7, monthId: Id(on, "Month 13"), day: 2));
        var longDay = await Scene(client, u, story, SceneAt("Day forty", 7, day: 40, monthId: Id(on, "Month 2")));
        var fine = await Moment(client, u, Exact("Third of the third", 7, monthId: Id(on, "Month 3"), day: 3));

        var refused = await Conflict(await client.DeleteAsync(Calendar(u)), ChronologyCalendarEndpoints.DatesIncompatibleCode);
        Assert.Contains("\"Month 13\" is month 13", refused, StringComparison.Ordinal);
        Assert.Contains("uses day 40", refused, StringComparison.Ordinal);
        Assert.NotNull((await Read(client, u)).Calendar);
        Assert.Equal(Id(on, "Month 13"), (await ReadMoment(client, u, late.Id)).Date.StartMonthId);

        // Fix the two dates, and it goes.
        (await client.DeleteAsync($"/api/universes/{u}/timeline/{late.Id}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"/api/universes/{u}/trash/timeline/{late.Id}")).EnsureSuccessStatusCode();
        (await client.PutVersionedAsync($"{Story(u, story)}/scenes/{longDay.Id}", SceneAt("Day forty", 7, day: 30, monthId: Id(on, "Month 2"))))
            .EnsureSuccessStatusCode();

        var off = await client.DeleteAsync(Calendar(u));
        Assert.Equal(HttpStatusCode.OK, off.StatusCode);
        Assert.Null((await off.Content.ReadFromJsonAsync<ChronologyResponse>())!.Calendar);

        var simple = await ReadMoment(client, u, fine.Id);
        Assert.Equal((3, null, 3), (simple.Date.StartMonth, simple.Date.StartMonthId, simple.Date.StartDay));
        var scene = (await ReadScene(client, u, story, longDay.Id)).Chronology!;
        Assert.Equal((2, null, 30), (scene.Month, scene.MonthId, scene.Day));

        // Off twice is still off.
        Assert.Equal(HttpStatusCode.OK, (await client.DeleteAsync(Calendar(u))).StatusCode);
    }

    // ---------- Dates on a calendar ----------

    [Fact]
    public async Task A_day_is_bounded_by_its_own_month_and_partial_dates_hold_as_before()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-days");
        var u = universe.Id;
        var (simpleClient, simpleUniverse) = await SignedInWithUniverse(_factory, "cal-days-simple");
        var simple = simpleUniverse.Id;
        var on = await Save(client, u, M("Emberrise", 20), M("Highsun", 63));
        var ember = Id(on, "Emberrise");

        Assert.Equal(HttpStatusCode.Created, (await PostMoment(client, u, Exact("Twentieth", 1, monthId: ember, day: 20))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await PostMoment(client, u, Exact("Sixty-third", 1, monthId: Id(on, "Highsun"), day: 63))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await PostMoment(client, u, Exact("Month only", 1, monthId: ember))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await PostMoment(client, u, Exact("Year only", 1))).StatusCode);

        Assert.Contains("Emberrise has 20 days", (await Invalid(await PostMoment(client, u, Exact("Twenty-first", 1, monthId: ember, day: 21))))["startDay"][0], StringComparison.Ordinal);
        Assert.Contains("startDay", (await Invalid(await PostMoment(client, u, Exact("Zeroth", 1, monthId: ember, day: 0)))).Keys);
        Assert.Contains("startMonth", (await Invalid(await PostMoment(client, u, Exact("A number", 1, 1)))).Keys);
        Assert.Contains("startMonth", (await Invalid(await PostMoment(client, u, Exact("Someone else's", 1, monthId: Guid.NewGuid())))).Keys);
        Assert.Contains("startMonth", (await Invalid(await PostMoment(client, u, Exact("Day alone", 1, day: 4)))).Keys);
        var monthAlone = new TimelineEntryRequest("Month alone", null, CanonStatus.Draft, TimelineDateKind.Range, 1, null, null, null, null, null, null, null, EndMonthId: ember);
        Assert.Contains("endYear", (await Invalid(await PostMoment(client, u, monthAlone))).Keys);

        // A scene follows the same rules, keyed under its chronology.
        var story = await CreateStory(client, u, "Days");
        var refusedScene = await client.PostAsJsonAsync($"{Story(u, story)}/scenes", SceneAt("Too late", 1, day: 21, monthId: ember));
        Assert.Contains("chronology.day", (await Invalid(refusedScene)).Keys);

        // Simple dates keep their own month and day ranges, and take no calendar month.
        Assert.Contains("startMonth", (await Invalid(await PostMoment(simpleClient, simple, Exact("Custom", 1, monthId: ember)))).Keys);
        Assert.Contains("startDay", (await Invalid(await PostMoment(simpleClient, simple, Exact("Thirty-second", 1, 1, 32)))).Keys);
        Assert.Equal(HttpStatusCode.Created, (await PostMoment(simpleClient, simple, Exact("Thirty-first", 1, 1, 31))).StatusCode);
    }

    // ---------- Order ----------

    [Fact]
    public async Task Months_order_every_source_by_their_place_and_reordering_them_reorders_the_timeline_without_a_rewrite()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-order");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Seasons");
        var on = await Save(client, u, M("Frostwane", 42), M("Emberrise", 18), M("Highsun", 63));
        var frost = Id(on, "Frostwane");
        var ember = Id(on, "Emberrise");

        await Moment(client, u, Exact("Moment in Emberrise", 5, monthId: ember, day: 1));
        await Moment(client, u, Exact("Moment in Frostwane", 5, monthId: frost, day: 20));
        await Scene(client, u, story, SceneAt("Scene in Emberrise", 5, day: 2, monthId: ember));
        await Scene(client, u, story, SceneAt("Scene in Frostwane", 5, day: 2, monthId: frost));
        await Moment(client, u, Exact("Year five", 5));

        Assert.Equal(["Year five", "Scene in Frostwane", "Moment in Frostwane", "Moment in Emberrise", "Scene in Emberrise"], await Feed(client, u));
        Assert.Equal(["Year five", "Moment in Frostwane", "Moment in Emberrise"], await Moments(client, u));

        await Save(client, u, Keep(on, "Emberrise"), Keep(on, "Frostwane"), Keep(on, "Highsun"));

        Assert.Equal(["Year five", "Moment in Emberrise", "Scene in Emberrise", "Scene in Frostwane", "Moment in Frostwane"], await Feed(client, u));
        Assert.Equal(["Year five", "Moment in Emberrise", "Moment in Frostwane"], await Moments(client, u));
    }

    [Fact]
    public void The_comparer_ranks_a_custom_month_by_its_place_and_follows_a_reorder()
    {
        ChronologyCalendarMonth Month(string name, int place) => new() { Id = Guid.NewGuid(), Name = name, SortOrder = place, DayCount = 30 };

        var frost = Month("Frostwane", 0);
        var ember = Month("Emberrise", 1);
        var high = Month("Highsun", 2);
        var chronology = UniverseChronology.Of([], [frost, ember, high]);

        Assert.True(chronology.Point(null, 5, null, 20, frost.Id) < chronology.Point(null, 5, null, 1, ember.Id));
        Assert.True(chronology.Point(null, 5) < chronology.Point(null, 5, null, null, frost.Id));
        Assert.Equal(chronology.Point(null, 5, 2, 7), chronology.Point(null, 5, null, 7, ember.Id));
        Assert.Null(chronology.Point(null, 5, null, 1, Guid.NewGuid()));

        ember.SortOrder = 0;
        frost.SortOrder = 1;
        var reordered = UniverseChronology.Of([], [ember, frost, high]);
        Assert.True(reordered.Point(null, 5, null, 1, ember.Id) < reordered.Point(null, 5, null, 20, frost.Id));
    }

    [Fact]
    public async Task The_feed_query_and_the_comparer_agree_on_every_page_of_a_custom_calendar()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-agree");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Agreement");
        var eras = await client.PutAsJsonAsync($"/api/universes/{u}/chronology", new ChronologyRequest(
        [
            new ChronologyEraRequest(null, "Before", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
            new ChronologyEraRequest(null, "After", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
        ]));
        var era = (await eras.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
        var on = await Save(client, u, M("Frostwane", 42), M("Emberrise", 18), M("Highsun", 63), M("Ashfall", 27));
        var months = on.Calendar!.Months;

        var random = new Random(39);
        var expected = new List<(string Title, ChronologyPoint Point)>();
        var chronology = UniverseChronology.Of(
            era.Select(one => new ChronologyEra { Id = one.Id, Name = one.Name, SortOrder = one.SortOrder, Direction = one.Direction }),
            months.Select(one => new ChronologyCalendarMonth { Id = one.Id, Name = one.Name, SortOrder = (one.SortOrder + 2) % 4, DayCount = one.DayCount }));

        for (var index = 0; index < 30; index++)
        {
            var eraId = era[random.Next(2)].Id;
            var year = random.Next(1, 4);
            var month = random.Next(3) == 0 ? (ChronologyCalendarMonthResponse?)null : months[random.Next(4)];
            int? day = month is null || random.Next(2) == 0 ? null : random.Next(1, Math.Min(month.DayCount, 9) + 1);
            var title = $"Item {index:00}";

            if (index % 2 == 0)
            {
                await Moment(client, u, Exact(title, year, day: day, monthId: month?.Id, era: eraId));
            }
            else
            {
                await Scene(client, u, story, new SceneRequest(title, null, null, null, new ChronologyValue(eraId, year, null, day, month?.Id), null));
            }

            expected.Add((title, chronology.Point(eraId, year, null, day, month?.Id)!.Value));
        }

        // Reordered once more, so the order checked is one no date was written in.
        await Save(client, u, [.. months.OrderBy(one => (one.SortOrder + 2) % 4).Select(one => new ChronologyCalendarMonthRequest(one.Id, one.Name, null, one.DayCount))]);

        var sorted = expected.OrderBy(item => item.Point).ThenBy(item => item.Title, StringComparer.Ordinal).Select(item => item.Title).ToList();
        var paged = new List<string>();
        for (var page = 1; page <= 4; page++)
        {
            paged.AddRange((await client.GetFromJsonAsync<TimelineItemPage>($"/api/universes/{u}/timeline/items?pageSize=8&page={page}"))!.Items.Select(item => item.Title));
        }

        Assert.Equal(sorted, paged);
    }

    // ---------- Ranges ----------

    [Fact]
    public async Task A_reorder_that_would_turn_a_range_around_is_refused_before_anything_is_saved()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-range");
        var u = universe.Id;
        var on = await Save(client, u, M("Frostwane", 42), M("Emberrise", 18), M("Highsun", 63));
        var frost = Id(on, "Frostwane");
        var ember = Id(on, "Emberrise");

        Assert.Equal(HttpStatusCode.Created, (await PostMoment(client, u, Span("The thaw", 5, frost, 20, 5, ember, 3))).StatusCode);
        Assert.Contains("endYear", (await Invalid(await PostMoment(client, u, Span("Backwards", 5, ember, 3, 5, frost, 20)))).Keys);

        // Ranges the reorder cannot turn around: across years, and from a bare year.
        await Moment(client, u, Span("Across years", 5, ember, 1, 6, frost, 1));
        await Moment(client, u, Span("From the year", 5, null, null, 5, frost, 1));

        var refused = await Conflict(
            await client.PutAsJsonAsync(Calendar(u), new ChronologyCalendarRequest([Keep(on, "Emberrise"), Keep(on, "Frostwane"), Keep(on, "Highsun")])),
            ChronologyCalendarEndpoints.RangeReversedCode);
        Assert.Contains("1 timeline range would end before it starts: \"The thaw\"", refused, StringComparison.Ordinal);
        Assert.Equal(["Frostwane", "Emberrise", "Highsun"], (await Read(client, u)).Calendar!.Months.Select(month => month.Name));

        // A reorder that keeps the range the right way round is fine.
        await Save(client, u, Keep(on, "Highsun"), Keep(on, "Frostwane"), Keep(on, "Emberrise"));
    }

    [Fact]
    public async Task A_range_across_date_periods_is_ordered_by_period_first()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-range-era");
        var u = universe.Id;
        var eras = await client.PutAsJsonAsync($"/api/universes/{u}/chronology", new ChronologyRequest(
        [
            new ChronologyEraRequest(null, "Second Age", "SA", ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear),
            new ChronologyEraRequest(null, "Third Age", "TA", ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear),
        ]));
        var era = (await eras.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
        var on = await Save(client, u, M("Frostwane", 42), M("Emberrise", 18));

        Assert.Equal(
            HttpStatusCode.Created,
            (await PostMoment(client, u, Span("Long war", 9, Id(on, "Emberrise"), 3, 1, Id(on, "Frostwane"), 1, era[0].Id, era[1].Id))).StatusCode);

        // Swapping the months cannot turn a range that ends in a later period around.
        await Save(client, u, Keep(on, "Emberrise"), Keep(on, "Frostwane"));
    }

    // ---------- Scenes ----------

    [Fact]
    public async Task A_scene_keeps_its_month_by_id_through_edits_renames_and_the_Trash()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-scene");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Calendar scenes");
        var on = await Save(client, u, M("Frostwane", 42), M("Emberrise", 18));
        var frost = Id(on, "Frostwane");

        var scene = await Scene(client, u, story, SceneAt("Arrival", 40, day: 10, monthId: frost));
        Assert.Equal((frost, 10, (int?)null), (scene.Chronology!.MonthId, scene.Chronology.Day, scene.Chronology.Month));
        Assert.Equal(["Arrival"], await Feed(client, u));

        // Edited to another month, then the month taken off - the year stands.
        (await client.PutVersionedAsync($"{Story(u, story)}/scenes/{scene.Id}", SceneAt("Arrival", 40, day: 18, monthId: Id(on, "Emberrise")))).EnsureSuccessStatusCode();
        Assert.Equal(Id(on, "Emberrise"), (await ReadScene(client, u, story, scene.Id)).Chronology!.MonthId);
        (await client.PutVersionedAsync($"{Story(u, story)}/scenes/{scene.Id}", SceneAt("Arrival", 40))).EnsureSuccessStatusCode();
        Assert.Null((await ReadScene(client, u, story, scene.Id)).Chronology!.MonthId);
        (await client.PutVersionedAsync($"{Story(u, story)}/scenes/{scene.Id}", SceneAt("Arrival", 40, day: 10, monthId: frost))).EnsureSuccessStatusCode();

        // A rename reaches the scene at once: it holds the id, and the calendar says the name.
        var renamed = await Save(client, u, Keep(on, "Frostwane", rename: "Snowrest"), Keep(on, "Emberrise"));
        Assert.Equal(frost, Id(renamed, "Snowrest"));
        Assert.Equal(frost, (await ReadScene(client, u, story, scene.Id)).Chronology!.MonthId);

        // The scene and then its story go to the Trash and come back holding the same month.
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{scene.Id}")).EnsureSuccessStatusCode();
        Assert.Empty(await Feed(client, u));
        (await client.PostAsync($"/api/universes/{u}/trash/scenes/{scene.Id}/restore", null)).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Story(u, story))).EnsureSuccessStatusCode();
        Assert.Empty(await Feed(client, u));
        (await client.PostAsync($"/api/universes/{u}/trash/stories/{story}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal((frost, 10), ((await ReadScene(client, u, story, scene.Id)).Chronology!.MonthId, (await ReadScene(client, u, story, scene.Id)).Chronology!.Day));
        Assert.Equal(["Arrival"], await Feed(client, u));
    }

    // ---------- Cost ----------

    [Fact]
    public async Task Reading_the_chronology_costs_the_same_with_no_calendar_twelve_months_or_fifty()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-cost");
        var u = universe.Id;
        var counts = new List<int>();

        async Task Count()
        {
            using var counter = new CommandCounter([u]);
            await Read(client, u);
            counts.Add(counter.Count);
        }

        await Count();
        await Save(client, u, [.. Enumerable.Range(1, 12).Select(index => M($"Month {index}", 30))]);
        await Count();
        await Save(client, u, [.. Enumerable.Range(1, 50).Select(index => M($"Month {index}", 30))]);
        await Count();

        // Access, the eras, two unplaced counts, and the months with their use in one query.
        Assert.Equal([5, 5, 5], counts);
    }

    [Fact]
    public async Task A_feed_page_of_custom_dates_costs_what_a_page_of_simple_dates_does()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "cal-feed-cost");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Counted");
        var on = await Save(client, u, [.. Enumerable.Range(1, 12).Select(index => M($"Month {index}", 30))]);
        var months = on.Calendar!.Months;

        var counts = new List<int>();
        var made = 0;
        foreach (var target in new[] { 1, 12, 60 })
        {
            for (; made < target; made++)
            {
                var month = months[made % 12].Id;
                if (made % 2 == 0)
                {
                    await Moment(client, u, Exact($"Moment {made}", made, monthId: month, day: 1 + (made % 30)));
                }
                else
                {
                    await Scene(client, u, story, SceneAt($"Scene {made}", made, day: 1 + (made % 30), monthId: month));
                }
            }

            var first = (await client.GetFromJsonAsync<TimelineItemPage>($"/api/universes/{u}/timeline/items?pageSize=100"))!;
            Assert.Equal(target, first.Items.Count);
            using var counter = new CommandCounter([u.ToString(), .. first.Items.Select(item => item.SourceId.ToString())]);
            await client.GetFromJsonAsync<TimelineItemPage>($"/api/universes/{u}/timeline/items?pageSize=100");
            counts.Add(counter.Count);
        }

        // Access, the era check, the count, the page with every month joined in, and one read per kind on it.
        Assert.Equal([5, 6, 6], counts);
    }
}
