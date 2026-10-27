using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The publishing migration, walked down and back up over a real SQLite file (ADR 0036).
///
/// What it has to prove is that it publishes nothing. Universes written before it - one with a long
/// description, one archived - come out of it private, with no summary, category, genre, address,
/// publication date or artwork, and no account gains a public name; nothing is copied from a description.
/// Rolling back drops only what it added, with SQLite's own <c>DROP COLUMN</c>, so the tables everything
/// points at are never rebuilt - the indexes and triggers the file already had are read back both ways.
/// And the upgraded file works: a universe on it can be prepared and published.
/// </summary>
public sealed class UniversePublicationMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before publishing.</summary>
    private const string BeforePublication = "20260915224602_AddRelationshipFamilySemantics";

    private static readonly string[] PublicationColumns =
        ["Visibility", "PublicSummary", "Category", "Genres", "PublicSlug", "PublishedAt"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-publication-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Every_existing_universe_comes_out_private_and_bare_and_the_rollback_rebuilds_nothing()
    {
        Directory.CreateDirectory(_directory);

        List<string> triggers;
        List<string> indexes;
        Guid described;

        // A file at the migration before publishing, with worlds on it, written through the real host.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("user-pubmigrate", "user-pubmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            described = (await CreateUniverse(client, "Migrated described", "A long private description the portal must never see.")).Id;
            var archived = (await CreateUniverse(client, "Migrated archived", null)).Id;
            (await client.PostAsync($"/api/universes/{archived}/archive", null)).EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            triggers = await Triggers(db);
            indexes = await Indexes(db);

            await db.GetService<IMigrator>().MigrateAsync(BeforePublication);

            var columns = await Columns(db, "Universes");
            Assert.All(PublicationColumns, column => Assert.DoesNotContain(column, columns));
            Assert.DoesNotContain("PublicDisplayName", await Columns(db, "AspNetUsers"));
            Assert.DoesNotContain("UniverseArtworks", await Tables(db));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(triggers.Where(LaterSchema.BeforeNestedTypes), await Triggers(db));
            Assert.Equal(
                LaterSchema.WithDropped(indexes).Where(LaterSchema.BeforeNestedTypes).Where(index => !index.StartsWith("IX_Universes_PublicSlug", StringComparison.Ordinal)
                    && !index.StartsWith("IX_Universes_Visibility", StringComparison.Ordinal)
                    && !index.Contains("UniverseArtworks", StringComparison.Ordinal)
                    && !index.Contains("_UniverseId_PublicSlug", StringComparison.Ordinal)
                    && !index.StartsWith("IX_AspNetUsers_PublicAuthorSlug", StringComparison.Ordinal)),
                await Indexes(db));
            Assert.Equal(2, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM Universes").SingleAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            var upgraded = await Columns(db, "Universes");
            Assert.All(PublicationColumns, column => Assert.Contains(column, upgraded));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(triggers, await Triggers(db));
            Assert.Equal(indexes, await Indexes(db));

            // Private and bare, every one of them; nothing copied from the description.
            var universes = await db.Universes.AsNoTracking().ToListAsync();
            Assert.Equal(2, universes.Count);
            Assert.All(universes, universe =>
            {
                Assert.Equal(UniverseVisibility.Private, universe.Visibility);
                Assert.Null(universe.PublicSummary);
                Assert.Null(universe.Category);
                Assert.Equal(UniverseGenres.None, universe.Genres);
                Assert.Null(universe.PublicSlug);
                Assert.Null(universe.PublishedAt);
            });
            Assert.Equal("A long private description the portal must never see.", universes.Single(universe => universe.Id == described).Description);
            Assert.False(await db.UniverseArtworks.AnyAsync());
            Assert.All(await db.Users.AsNoTracking().ToListAsync(), user => Assert.Null(user.PublicDisplayName));
        }

        SqliteConnection.ClearAllPools();

        // The upgraded file works: nothing public until an owner publishes, and then exactly that.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-pubmigrate", Password))).EnsureSuccessStatusCode();

            var anonymous = host.CreateHttpsClient();
            Assert.Equal(0, (await anonymous.GetFromJsonAsync<PublicUniversePage>("/api/public/universes"))!.TotalCount);

            (await client.PutAsJsonAsync($"/api/universes/{described}/publication", new PublicationDetailsRequest("Now public.", UniverseCategory.Original, [UniverseGenres.Mystery])))
                .EnsureSuccessStatusCode();
            (await PublishingTestClient.UploadArtwork(client, described, PublishingTestClient.Png(800, 500))).EnsureSuccessStatusCode();
            (await client.PutAsJsonAsync("/api/profile/public-name", new PublicNameRequest("Migrated Author"))).EnsureSuccessStatusCode();
            (await client.PostAsync($"/api/universes/{described}/publish", null)).EnsureSuccessStatusCode();

            var page = (await anonymous.GetFromJsonAsync<PublicUniversePage>("/api/public/universes"))!;
            Assert.Equal("migrated-described", Assert.Single(page.Items).Slug);
        }
    }

    // ---------- Reading the file ----------

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Columns(LorEvolveDbContext db, string table) =>
        await db.Database.SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table})").ToListAsync();

    private static async Task<List<string>> Tables(LorEvolveDbContext db) =>
        await db.Database.SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'table'").ToListAsync();

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

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name, string? description)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, description, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

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
