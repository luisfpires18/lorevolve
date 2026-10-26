using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Lorex.Api.Tests;

/// <summary>
/// The content publishing migration, walked down and back up over a real SQLite file (ADR 0036, Task 010).
///
/// What it has to prove is that it publishes nothing. A universe that is already public when it runs - with an entry
/// and a story in it - comes out of it still public, with every entry and story private, without an address or a
/// date, and its public listings empty. Rolling back drops only what it added, with SQLite's own <c>DROP COLUMN</c>,
/// so <c>Entities</c> is never rebuilt under its search triggers - every trigger and index is read back both ways.
/// </summary>
public sealed class ContentPublicationMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before content publishing.</summary>
    private const string BeforeContentPublication = "20260927181809_AddUniversePublication";

    private static readonly string[] PublicationColumns = ["Visibility", "PublicSlug", "PublishedAt"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-content-publication-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Every_existing_entry_and_story_comes_out_private_even_in_a_public_universe()
    {
        Directory.CreateDirectory(_directory);

        List<string> triggers;
        List<string> indexes;
        Guid universeId;

        // A public universe with a published entry and story, written through the real host - then the migration is
        // taken away under it, which is exactly the file a deployment before Task 010 holds.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-cpmigrate", "user-cpmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await PlotTestClient.PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest("Cp migrated", null, null))).Id;
            (await client.PutAsJsonAsync($"/api/universes/{universeId}/publication", new PublicationDetailsRequest("Already public.", UniverseCategory.Original, [UniverseGenres.Mystery])))
                .EnsureSuccessStatusCode();
            (await PublishingTestClient.UploadArtwork(client, universeId, PublishingTestClient.Png(800, 500))).EnsureSuccessStatusCode();
            (await client.PutAsJsonAsync("/api/profile/public-name", new PublicNameRequest("Migrated Author"))).EnsureSuccessStatusCode();
            (await client.PostAsync($"/api/universes/{universeId}/publish", null)).EnsureSuccessStatusCode();

            var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
            var entry = (await PlotTestClient.PostJson<EntityDetail>(
                client,
                $"/api/universes/{universeId}/entities",
                new EntityRequest(types[0].Id, "Migrated heir", "Summary kept.", CanonStatus.Canon, null, null, null))).Id;
            var story = await PlotTestClient.CreateStory(client, universeId, "Migrated tale");
            (await client.PostAsync($"/api/universes/{universeId}/entities/{entry}/publish", null)).EnsureSuccessStatusCode();
            (await client.PutAsJsonAsync($"{PlotTestClient.Story(universeId, story)}/publication", new StoryPublicationRequest("For readers."))).EnsureSuccessStatusCode();
            (await client.PostAsync($"{PlotTestClient.Story(universeId, story)}/publish", null)).EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            triggers = await Triggers(db);
            indexes = await Indexes(db);

            await db.GetService<IMigrator>().MigrateAsync(BeforeContentPublication);

            var entryColumns = await Columns(db, "Entities");
            var storyColumns = await Columns(db, "Stories");
            Assert.All(PublicationColumns, column => Assert.DoesNotContain(column, entryColumns));
            Assert.All(PublicationColumns, column => Assert.DoesNotContain(column, storyColumns));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(triggers.Where(LaterSchema.BeforeNestedTypes), await Triggers(db));
            Assert.Equal(
                LaterSchema.WithDropped(indexes).Where(LaterSchema.BeforeNestedTypes).Where(index => !index.StartsWith("IX_Entities_UniverseId_PublicSlug", StringComparison.Ordinal)
                    && !index.StartsWith("IX_Stories_UniverseId_PublicSlug", StringComparison.Ordinal)
                    && !index.StartsWith("IX_AspNetUsers_PublicAuthorSlug", StringComparison.Ordinal)),
                await Indexes(db));
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM Entities").SingleAsync());
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM Stories").SingleAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            var entryColumns = await Columns(db, "Entities");
            var storyColumns = await Columns(db, "Stories");
            Assert.All(PublicationColumns, column => Assert.Contains(column, entryColumns));
            Assert.All(PublicationColumns, column => Assert.Contains(column, storyColumns));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(triggers, await Triggers(db));
            Assert.Equal(indexes, await Indexes(db));

            // The content is intact, and private: no selection, no address, no date.
            var entry = await db.Entities.AsNoTracking().SingleAsync();
            Assert.Equal(("Migrated heir", "Summary kept."), (entry.Name, entry.Summary));
            Assert.Equal((ContentVisibility.Private, null, null), (entry.Visibility, entry.PublicSlug, entry.PublishedAt));
            var story = await db.Stories.AsNoTracking().SingleAsync();
            Assert.Equal("Migrated tale", story.Title);
            Assert.Equal((ContentVisibility.Private, null, null), (story.Visibility, story.PublicSlug, story.PublishedAt));

            // The universe itself is still public.
            Assert.Equal(UniverseVisibility.Public, (await db.Universes.AsNoTracking().SingleAsync()).Visibility);
        }

        SqliteConnection.ClearAllPools();

        // The upgraded file works: the public universe lists nothing until its owner selects something.
        await using (var host = new FileHost(DataSource))
        {
            var anonymous = host.CreateHttpsClient();
            Assert.NotNull(await anonymous.GetFromJsonAsync<PublicUniverse>("/api/public/universes/cp-migrated"));
            Assert.Equal(0, (await anonymous.GetFromJsonAsync<PublicContentPage<PublicLoreEntry>>("/api/public/universes/cp-migrated/lore"))!.TotalCount);
            Assert.Equal(0, (await anonymous.GetFromJsonAsync<PublicContentPage<PublicStory>>("/api/public/universes/cp-migrated/stories"))!.TotalCount);

            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-cpmigrate", Password))).EnsureSuccessStatusCode();
            var entries = (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universeId}/entities"))!.Items;
            (await client.PostAsync($"/api/universes/{universeId}/entities/{entries[0].Id}/publish", null)).EnsureSuccessStatusCode();

            var page = (await anonymous.GetFromJsonAsync<PublicContentPage<PublicLoreEntry>>("/api/public/universes/cp-migrated/lore"))!;
            Assert.Equal("migrated-heir", Assert.Single(page.Items).Slug);
        }
    }

    // ---------- Reading the file ----------

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Columns(LorexDbContext db, string table) =>
        await db.Database.SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table})").ToListAsync();

    private static async Task<List<string>> Triggers(LorexDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
            .ToListAsync();

    private static async Task<List<string>> Indexes(LorexDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>(
                "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorexDbContext db) =>
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
