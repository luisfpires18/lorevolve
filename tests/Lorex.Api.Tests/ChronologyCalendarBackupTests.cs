using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A custom calendar in a backup (version 22): its months travel in order with their lengths, every date names its month by
/// id, and a restore gives the calendar and each month a new id and points each date at it. A version 21 file has no
/// calendar and restores every date as the simple date it was. Anything that names a month the file does not hold, or a day
/// past a month's end, is refused before anything is written.
/// </summary>
public sealed class ChronologyCalendarBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private sealed record World(HttpClient Client, Guid U, Guid Story, ChronologyResponse Chronology);

    /// <summary>
    /// Four months saved, then reordered, so a month's place is not the order it was made in: a moment across two months, a
    /// moment in one, a scene, and a scene in the Trash.
    /// </summary>
    private async Task<World> CalendarWorld(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var u = universe.Id;
        var story = await CreateStory(client, u, "Seasons");

        var made = await PutCalendar(client, u, [new(null, "Frostwane", "Frw", 42), new(null, "Emberrise", null, 18), new(null, "Highsun", null, 63), new(null, "Ashfall", null, 27)]);
        ChronologyCalendarMonthRequest Keep(string name) =>
            made.Calendar!.Months.Single(month => month.Name == name) is var month
                ? new(month.Id, month.Name, month.Abbreviation, month.DayCount)
                : null!;
        var chronology = await PutCalendar(client, u, [Keep("Emberrise"), Keep("Frostwane"), Keep("Highsun"), Keep("Ashfall")]);
        Guid Month(string name) => chronology.Calendar!.Months.Single(month => month.Name == name).Id;

        await PostJson<TimelineEntryResponse>(client, $"/api/universes/{u}/timeline", new TimelineEntryRequest(
            "The thaw", null, CanonStatus.Draft, TimelineDateKind.Range, 5, null, 2, 5, null, 40, null, null,
            StartMonthId: Month("Emberrise"), EndMonthId: Month("Frostwane")));
        await PostJson<TimelineEntryResponse>(client, $"/api/universes/{u}/timeline", new TimelineEntryRequest(
            "Midsummer", null, CanonStatus.Draft, TimelineDateKind.Exact, 5, null, 63, null, null, null, null, null, StartMonthId: Month("Highsun")));
        await PostJson<SceneResponse>(client, $"{Story(u, story)}/scenes", new SceneRequest(
            "First frost", null, null, null, new ChronologyValue(null, 5, null, 1, Month("Frostwane")), null));
        var binned = await PostJson<SceneResponse>(client, $"{Story(u, story)}/scenes", new SceneRequest(
            "Cut ash", null, null, null, new ChronologyValue(null, 6, null, 27, Month("Ashfall")), null));
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{binned.Id}")).EnsureSuccessStatusCode();

        return new World(client, u, story, chronology);
    }

    private static async Task<ChronologyResponse> PutCalendar(HttpClient client, Guid u, ChronologyCalendarMonthRequest[] months)
    {
        var response = await client.PutAsJsonAsync($"/api/universes/{u}/chronology/calendar", new ChronologyCalendarRequest(months));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!;
    }

    private static async Task<List<string>> Feed(HttpClient client, Guid u) =>
        [.. (await client.GetFromJsonAsync<TimelineItemPage>($"/api/universes/{u}/timeline/items?pageSize=100"))!.Items.Select(item => item.Title)];

    [Fact]
    public async Task A_calendar_travels_and_restores_under_new_ids_with_every_date_on_its_restored_month()
    {
        var w = await CalendarWorld("calbk-roundtrip");
        var client = w.Client;

        var archive = await RawArchive(client, w.U);
        var backup = BackupOf(archive);
        Assert.Equal(24, backup.FormatVersion);

        var calendar = backup.Payload.ChronologyCalendar!;
        Assert.Equal(w.Chronology.Calendar!.Id, calendar.Id);
        Assert.Equal(
            [("Emberrise", 0, 18), ("Frostwane", 1, 42), ("Highsun", 2, 63), ("Ashfall", 3, 27)],
            calendar.Months.Select(month => (month.Name, month.SortOrder, month.DayCount)));
        Assert.Equal("Frw", calendar.Months[1].Abbreviation);

        var thaw = backup.Payload.TimelineEntries.Single(entry => entry.Title == "The thaw");
        Assert.Equal((calendar.Months[0].Id, calendar.Months[1].Id, (int?)null), (thaw.StartMonthId!.Value, thaw.EndMonthId!.Value, thaw.StartMonth));
        var cut = backup.Payload.Stories!.Single().Scenes.Single(scene => scene.Title == "Cut ash");
        Assert.Equal(calendar.Months[3].Id, cut.Chronology!.MonthId);

        var restored = await RestoreArchive(client, archive, "calbk-roundtrip restored");
        var chronology = (await client.GetFromJsonAsync<ChronologyResponse>($"/api/universes/{restored.Id}/chronology"))!;
        Assert.NotEqual(calendar.Id, chronology.Calendar!.Id);
        Assert.Equal(
            calendar.Months.Select(month => (month.Name, month.Abbreviation, month.SortOrder, month.DayCount)),
            chronology.Calendar.Months.Select(month => (month.Name, month.Abbreviation, month.SortOrder, month.DayCount)));
        Assert.DoesNotContain(chronology.Calendar.Months, month => calendar.Months.Any(source => source.Id == month.Id));

        // Usage reads off the restored rows: each date found its new month, and the Trash came along.
        Assert.Equal([1, 2, 1, 1], chronology.Calendar.Months.Select(month => month.UseCount));
        Assert.Equal(await Feed(client, w.U), await Feed(client, restored.Id));

        var entries = (await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{restored.Id}/timeline"))!;
        var restoredThaw = entries.Items.Single(entry => entry.Title == "The thaw");
        Assert.Equal((chronology.Calendar.Months[0].Id, chronology.Calendar.Months[1].Id), (restoredThaw.Date.StartMonthId!.Value, restoredThaw.Date.EndMonthId!.Value));
    }

    [Fact]
    public async Task A_simple_universe_and_a_version_21_file_restore_simple_dates_exactly()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "calbk-simple");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Plain");
        await PostJson<TimelineEntryResponse>(client, $"/api/universes/{u}/timeline", new TimelineEntryRequest(
            "Ninth of the third", null, CanonStatus.Draft, TimelineDateKind.Exact, 3018, 3, 9, null, null, null, null, null));
        await PostJson<SceneResponse>(client, $"{Story(u, story)}/scenes", new SceneRequest(
            "Thirty-first", null, null, null, new ChronologyValue(null, 3018, 12, 31), null));

        var archive = await RawArchive(client, u);
        Assert.Null(BackupOf(archive).Payload.ChronologyCalendar);

        foreach (var (file, name) in new[] { (archive, "calbk-simple 22"), (Downgrade(archive, 21), "calbk-simple 21") })
        {
            var restored = await RestoreArchive(client, file, name);
            Assert.Null((await client.GetFromJsonAsync<ChronologyResponse>($"/api/universes/{restored.Id}/chronology"))!.Calendar);

            var moment = Assert.Single((await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{restored.Id}/timeline"))!.Items);
            Assert.Equal((3, 9, (Guid?)null), (moment.Date.StartMonth!.Value, moment.Date.StartDay!.Value, moment.Date.StartMonthId));

            var stories = (await client.GetFromJsonAsync<List<StorySummary>>(Stories(restored.Id)))!;
            var scene = (await ReadStory(client, restored.Id, stories.Single().Id)).Scenes.Single();
            Assert.Equal((12, 31, (Guid?)null), (scene.Chronology!.Month!.Value, scene.Chronology.Day!.Value, scene.Chronology.MonthId));
        }
    }

    [Fact]
    public async Task A_file_whose_months_do_not_hold_is_refused()
    {
        var w = await CalendarWorld("calbk-malformed");
        var archive = await RawArchive(w.Client, w.U);
        var other = await CalendarWorld("calbk-malformed-other");
        var someone = other.Chronology.Calendar!.Months[0].Id;

        JsonObject Calendar(JsonObject root) => Payload(root)["chronologyCalendar"]!.AsObject();
        JsonArray Months(JsonObject root) => Calendar(root)["months"]!.AsArray();
        JsonObject Thaw(JsonObject root) =>
            Payload(root)["timelineEntries"]!.AsArray().Single(entry => entry!["title"]!.GetValue<string>() == "The thaw")!.AsObject();

        var cases = new (byte[] File, string Word)[]
        {
            (Rewrite(archive, root => Thaw(root)["startMonthId"] = Guid.NewGuid().ToString()), "calendar does not have"),
            (Rewrite(archive, root => Thaw(root)["startMonthId"] = someone.ToString()), "calendar does not have"),
            (Rewrite(archive, root => Months(root)[1]!["id"] = Months(root)[0]!["id"]!.GetValue<string>()), "same id"),
            (Rewrite(archive, root => Thaw(root)["startDay"] = 19), "past the end of its month"),
            (Rewrite(archive, root => Payload(root)["chronologyCalendar"] = null), "calendar does not have"),
            (Rewrite(archive, root => Thaw(root)["startMonth"] = 1), "twice"),
            (Rewrite(archive, root => Months(root)[1]!["name"] = "EMBERRISE"), "same name"),
            (Rewrite(archive, root => Months(root)[1]!["dayCount"] = 0), "has 0 days"),
            (Rewrite(archive, root => root["formatVersion"] = 21), "calendar does not have"),
        };

        foreach (var (file, word) in cases)
        {
            var refusal = await Refused(await Validate(w.Client, file));
            Assert.True(refusal.Issues.Any(issue => issue.Message.Contains(word, StringComparison.Ordinal)), $"{word}: {refusal.Raw}");
        }
    }
}

/// <summary>
/// <c>AddChronologyCalendars</c> walked down and back up over a real SQLite file holding custom dates: down, each custom
/// month becomes the number of its place and the scene search triggers survive the rebuild; up, every date is a simple date
/// and nothing is guessed back into a calendar.
/// </summary>
public sealed class ChronologyCalendarMigrationTests : IDisposable
{
    /// <summary>The migration immediately before calendars.</summary>
    private const string Before = "20261005185347_AddTimelineEntryStories";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-calendar-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Rolled_back_custom_months_become_their_place_and_scene_search_keeps_working()
    {
        Directory.CreateDirectory(_directory);
        Guid u;
        Guid story;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            var password = $"m-{Guid.NewGuid():n}";
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-calmigrate", "user-calmigrate@example.test", password)))
                .EnsureSuccessStatusCode();

            u = (await CreateUniverse(client, "Calendar migration")).Id;
            story = await CreateStory(client, u, "Seasons");
            var saved = await client.PutAsJsonAsync($"/api/universes/{u}/chronology/calendar", new ChronologyCalendarRequest(
                [new(null, "Frostwane", null, 42), new(null, "Emberrise", null, 18), new(null, "Highsun", null, 63)]));
            var months = (await saved.Content.ReadFromJsonAsync<ChronologyResponse>())!.Calendar!.Months;

            await PostJson<TimelineEntryResponse>(client, $"/api/universes/{u}/timeline", new TimelineEntryRequest(
                "Midsummer", null, CanonStatus.Draft, TimelineDateKind.Range, 5, null, 2, 5, null, 60, null, null,
                StartMonthId: months[1].Id, EndMonthId: months[2].Id));
            await PostJson<SceneResponse>(client, $"{Story(u, story)}/scenes", new SceneRequest(
                "Salt harbour", null, null, null, new ChronologyValue(null, 5, null, 40, months[0].Id), null));
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name IN ('ChronologyCalendars', 'ChronologyCalendarMonths')"));
            Assert.DoesNotContain("MonthId", await Strings(db, "SELECT name AS Value FROM pragma_table_info('Scenes')"));
            Assert.DoesNotContain("StartMonthId", await Strings(db, "SELECT name AS Value FROM pragma_table_info('TimelineEntries')"));
            Assert.Equal(indexes.Where(LaterSchema.BeforeCalendars), await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers.Where(LaterSchema.BeforeTypeGroups), await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));

            // Each custom month is the number of its place, the day unchanged.
            Assert.Equal(["2|2|3|60"], await Strings(db, "SELECT StartMonth || '|' || StartDay || '|' || EndMonth || '|' || EndDay AS Value FROM TimelineEntries"));
            Assert.Equal(["1|40"], await Strings(db, "SELECT Month || '|' || Day AS Value FROM Scenes"));

            // The rebuilt scene table still feeds its search index.
            await db.Database.ExecuteSqlRawAsync("UPDATE Scenes SET Title = 'Salt quay'");
            Assert.Equal(["Salt quay"], await Strings(db, "SELECT Title AS Value FROM StorySearchIndex WHERE Kind = 'scene'"));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));
            Assert.Equal(indexes, await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(0, await db.ChronologyCalendars.CountAsync());
            var entry = await db.TimelineEntries.AsNoTracking().SingleAsync();
            Assert.Equal((2, (Guid?)null), (entry.StartMonth!.Value, entry.StartMonthId));
            Assert.Equal(
                ["ChronologyCalendarMonths NO ACTION", "ChronologyCalendarMonths NO ACTION"],
                await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('TimelineEntries') WHERE \"table\" = 'ChronologyCalendarMonths'"));
            Assert.Equal(
                ["ChronologyCalendarMonths NO ACTION"],
                await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('Scenes') WHERE \"table\" = 'ChronologyCalendarMonths'"));
        }
    }

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    /// <summary>The real host on the file, outside Development, so startup migrates it the way a deployment does.</summary>
    private sealed class FileHost(string dataSource) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
            builder.UseSetting("Media:Provider", "InMemory");
        }

        public HttpClient CreateHttpsClient() => CreateClient(
            new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();

        try
        {
            if (Directory.Exists(_directory))
            {
                Directory.Delete(_directory, recursive: true);
            }
        }
        catch (IOException)
        {
            // A handle Windows has not let go of yet; the directory is under the temp root and named for this run.
        }
    }
}
