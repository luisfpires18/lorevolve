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
/// A moment's stories in a backup (version 21) and in the schema (<c>AddTimelineEntryStories</c>, 038). The links travel by
/// story id and come back to the restored stories; the moment stays one moment; scenes and lifespans are never written as
/// timeline items, because they already travel as scenes and entries.
/// </summary>
public sealed class TimelineStoryBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private static TimelineEntryRequest Moment(string title, int year, IReadOnlyList<Guid>? stories) =>
        new(title, null, CanonStatus.Draft, TimelineDateKind.Exact, year, null, null, null, null, null, null, null, StoryIds: stories);

    private async Task<(HttpClient Client, Guid U, Guid A, Guid B)> World(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var u = universe.Id;
        var a = await CreateStory(client, u, "Alpha");
        var b = await CreateStory(client, u, "Beta");
        await PostJson<SceneResponse>(client, $"{Story(u, a)}/scenes", new SceneRequest("Dated", null, null, null, new ChronologyValue(null, 4, null, null), null));
        await PostJson<TimelineEntryResponse>(client, $"/api/universes/{u}/timeline", Moment("Both", 5, [a, b]));
        await PostJson<TimelineEntryResponse>(client, $"/api/universes/{u}/timeline", Moment("Neither", 6, null));
        return (client, u, a, b);
    }

    [Fact]
    public async Task A_backup_carries_a_moments_stories_and_a_restore_links_the_restored_stories()
    {
        var (client, u, a, b) = await World("tsb-roundtrip");

        var archive = await RawArchive(client, u);
        var backup = BackupOf(archive);
        Assert.Equal(24, backup.FormatVersion);
        var both = backup.Payload.TimelineEntries.Single(entry => entry.Title == "Both");
        Assert.Equal(new[] { a, b }.Order(), both.StoryIds!.Order());
        Assert.Empty(backup.Payload.TimelineEntries.Single(entry => entry.Title == "Neither").StoryIds!);

        // Only the two moments are timeline items in the file; the dated scene travels as a scene.
        Assert.Equal(2, backup.Payload.TimelineEntries.Count);

        var restored = await RestoreArchive(client, archive, "tsb-roundtrip restored");
        var stories = (await client.GetFromJsonAsync<List<StorySummary>>(Stories(restored.Id)))!;
        var alpha = stories.Single(story => story.Title == "Alpha").Id;
        Assert.NotEqual(a, alpha);

        var page = (await client.GetFromJsonAsync<TimelineItemPage>($"/api/universes/{restored.Id}/timeline/items?storyId={alpha}"))!;
        Assert.Equal(["Dated", "Both"], page.Items.Select(item => item.Title));
        var moment = page.Items.Single(item => item.SourceKind == TimelineSourceKind.Event).Event!;
        Assert.Equal(["Alpha", "Beta"], moment.Stories!.Select(story => story.Title));
        Assert.Equal(2, (await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{restored.Id}/timeline"))!.TotalCount);
    }

    [Fact]
    public async Task A_version_20_backup_restores_its_moments_linked_to_no_story()
    {
        var (client, u, _, _) = await World("tsb-v20");

        var restored = await RestoreArchive(client, Downgrade(await RawArchive(client, u), 20), "tsb-v20 restored");
        var entries = (await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{restored.Id}/timeline"))!;
        Assert.Equal(2, entries.TotalCount);

        var both = entries.Items.Single(entry => entry.Title == "Both");
        Assert.Empty((await client.GetFromJsonAsync<TimelineEntryResponse>($"/api/universes/{restored.Id}/timeline/{both.Id}"))!.Stories!);
    }

    [Fact]
    public async Task A_backup_whose_story_links_do_not_hold_is_refused()
    {
        var (client, u, a, _) = await World("tsb-malformed");
        var archive = await RawArchive(client, u);

        JsonArray Links(JsonObject root) =>
            Payload(root)["timelineEntries"]!.AsArray()
                .Single(entry => entry!["title"]!.GetValue<string>() == "Both")!["storyIds"]!.AsArray();

        var unknown = Rewrite(archive, root => Links(root).Add(Guid.NewGuid().ToString()));
        var twice = Rewrite(archive, root => Links(root).Add(a.ToString()));
        var tooOld = Rewrite(archive, root => root["formatVersion"] = 20);

        foreach (var (file, word) in new[] { (unknown, "does not hold"), (twice, "twice"), (tooOld, "cannot say") })
        {
            var refusal = await Refused(await Validate(client, file));
            Assert.Contains(refusal.Issues, issue => issue.Message.Contains(word, StringComparison.Ordinal));
        }
    }
}

/// <summary>
/// <c>AddTimelineEntryStories</c> walked down and back up over a real SQLite file: one table, its key and one index, both
/// keys cascading. Nothing else changes either way, and no link is ever invented.
/// </summary>
public sealed class TimelineStoryMigrationTests : IDisposable
{
    /// <summary>The migration immediately before a moment's stories.</summary>
    private const string Before = "20261005100559_AddEntityReferenceTargetType";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-timeline-story-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Rolled_back_and_forward_every_moment_and_story_survives_and_no_link_is_guessed()
    {
        Directory.CreateDirectory(_directory);

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            var password = $"m-{Guid.NewGuid():n}";
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-tsmigrate", "user-tsmigrate@example.test", password)))
                .EnsureSuccessStatusCode();

            var u = (await CreateUniverse(client, "Timeline stories")).Id;
            var story = await CreateStory(client, u, "Linked");
            await PostJson<TimelineEntryResponse>(
                client,
                $"/api/universes/{u}/timeline",
                new TimelineEntryRequest("Linked moment", null, CanonStatus.Draft, TimelineDateKind.Exact, 1, null, null, null, null, null, null, null, StoryIds: [story]));
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            Assert.Equal(1, await db.TimelineEntryStories.CountAsync());

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name = 'TimelineEntryStories'"));
            Assert.Equal(indexes.Where(LaterSchema.BeforeTimelineStories), await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers.Where(LaterSchema.BeforeTypeGroups), await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM \"TimelineEntries\"").SingleAsync());
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM \"Stories\"").SingleAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await Strings(db, "SELECT \"table\" AS Value FROM pragma_foreign_key_check"));
            Assert.Equal(indexes, await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(1, await db.TimelineEntries.CountAsync());
            Assert.Equal(0, await db.TimelineEntryStories.CountAsync());
            Assert.Equal(
                ["Stories CASCADE", "TimelineEntries CASCADE"],
                await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('TimelineEntryStories') ORDER BY \"table\""));
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
