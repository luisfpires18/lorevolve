using System.Net.Http.Headers;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The public reading migration, walked down and back up over a real SQLite file (Task 011; ADR 0036, 0037).
///
/// What it has to prove is that it publishes nothing and copies nothing. A public universe whose author, story and
/// photo existed before it comes out of it with no story summary (nothing taken from the premise), a story that is
/// still selected but no longer readable, a photo that is private, and no author address - which the startup backfill
/// then mints from the public name, so the universe keeps answering. Rolling back drops only what it added, with
/// SQLite's own <c>DROP COLUMN</c>; every trigger and index is read back both ways.
/// </summary>
public sealed class PublicReadingMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before public reading.</summary>
    private const string BeforePublicReading = "20260928113450_AddContentPublication";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-public-reading-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Nothing_is_copied_or_published_and_an_existing_author_gets_an_address_at_startup()
    {
        Directory.CreateDirectory(_directory);

        List<string> triggers;
        List<string> indexes;
        Guid universeId;
        Guid storyId;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-readmigrate", "user-readmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await PlotTestClient.PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest("Read migrated", null, null))).Id;
            (await client.PutAsJsonAsync($"/api/universes/{universeId}/publication", new PublicationDetailsRequest("Already public.", UniverseCategory.Original, [UniverseGenres.Mystery])))
                .EnsureSuccessStatusCode();
            (await PublishingTestClient.UploadArtwork(client, universeId, PublishingTestClient.Png(800, 500))).EnsureSuccessStatusCode();
            (await client.PutAsJsonAsync("/api/profile/public-name", new PublicNameRequest("Migrated Reader"))).EnsureSuccessStatusCode();
            (await client.PostAsync($"/api/universes/{universeId}/publish", null)).EnsureSuccessStatusCode();

            storyId = (await PlotTestClient.PostJson<StoryDetail>(
                client, PlotTestClient.Stories(universeId), new StoryRequest("Migrated tale", "Premise kept private.", StoryStatus.Drafting))).Id;
            (await client.PutAsJsonAsync($"{PlotTestClient.Story(universeId, storyId)}/publication", new StoryPublicationRequest("For readers."))).EnsureSuccessStatusCode();
            (await client.PostAsync($"{PlotTestClient.Story(universeId, storyId)}/publish", null)).EnsureSuccessStatusCode();

            using var form = new MultipartFormDataContent();
            var file = new ByteArrayContent(PublishingTestClient.Png(400, 400));
            file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            form.Add(file, "file", "me.png");
            (await client.PutAsync("/api/profile/image", form)).EnsureSuccessStatusCode();
            (await client.PutAsJsonAsync("/api/profile/public-author/photo", new PublicAuthorPhotoRequest(true))).EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            triggers = await Triggers(db);
            indexes = await Indexes(db);

            await db.GetService<IMigrator>().MigrateAsync(BeforePublicReading);

            Assert.DoesNotContain("PublicSummary", await Columns(db, "Stories"));
            Assert.DoesNotContain("IsPublic", await Columns(db, "ProfileImages"));
            Assert.DoesNotContain("PublicAuthorSlug", await Columns(db, "AspNetUsers"));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(triggers.Where(LaterSchema.BeforeNestedTypes), await Triggers(db));
            Assert.Equal(LaterSchema.WithDropped(indexes).Where(LaterSchema.BeforeNestedTypes).Where(index => !index.StartsWith("IX_AspNetUsers_PublicAuthorSlug", StringComparison.Ordinal)), await Indexes(db));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.Empty(await ForeignKeyViolations(db));
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(triggers, await Triggers(db));
            Assert.Equal(indexes, await Indexes(db));

            var story = await db.Stories.AsNoTracking().SingleAsync();
            Assert.Null(story.PublicSummary);
            Assert.Equal("Premise kept private.", story.Premise);
            Assert.Equal((ContentVisibility.Public, "migrated-tale"), (story.Visibility, story.PublicSlug));
            Assert.False((await db.ProfileImages.AsNoTracking().SingleAsync()).IsPublic);
            Assert.Null((await db.Users.AsNoTracking().SingleAsync()).PublicAuthorSlug);
        }

        SqliteConnection.ClearAllPools();

        // Started again: the backfill gives the public author an address from the public name, so the world answers; the
        // story stays hidden until its author writes a summary; the photo stays private.
        await using (var host = new FileHost(DataSource))
        {
            var anonymous = host.CreateHttpsClient();
            var world = (await anonymous.GetFromJsonAsync<PublicUniverse>("/api/public/universes/read-migrated"))!;
            Assert.Equal("migrated-reader", world.AuthorSlug);
            Assert.Null((await anonymous.GetFromJsonAsync<PublicAuthor>("/api/public/authors/migrated-reader"))!.AvatarUrl);
            Assert.Equal(0, (await anonymous.GetFromJsonAsync<PublicContentPage<PublicStory>>("/api/public/universes/read-migrated/stories"))!.TotalCount);
        }
    }

    // ---------- Reading the file ----------

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Columns(LorEvolveDbContext db, string table) =>
        await db.Database.SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table})").ToListAsync();

    private static async Task<List<string>> Triggers(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
            .ToListAsync();

    private static async Task<List<string>> Indexes(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorEvolveDbContext db) =>
        await db.Database.SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check").ToListAsync();

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
