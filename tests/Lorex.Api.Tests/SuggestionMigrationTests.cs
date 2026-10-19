using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Suggestions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Lorex.Api.Tests;

/// <summary>
/// Suggested changes (<c>AddSuggestedChanges</c>, task 045) over a real SQLite file: walked down and back up, only the one
/// table moves and the database holds a suggestion to exactly one target and a known status. And, with each request on its
/// own connection and every transaction IMMEDIATE - the only setting where two requests genuinely race - two accepts of one
/// suggestion at once apply it once.
/// </summary>
public sealed class SuggestionMigrationTests : IDisposable
{
    /// <summary>The migration immediately before suggestions.</summary>
    private const string Before = "20261014093227_AddContentEditVersions";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-suggestion-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Rolled_back_and_forward_only_the_suggestion_table_moves_and_it_guards_itself()
    {
        Directory.CreateDirectory(_directory);

        Guid entry;
        Guid story;

        await using (var host = new FileHost(DataSource))
        {
            var client = await Register(host, "user-sgmigrate");
            var universe = (await PlotTestClient.CreateUniverse(client, "Suggestion migrate")).Id;
            entry = await PlotTestClient.CreateEntity(client, universe, "Kept");
            story = await PlotTestClient.CreateStory(client, universe, "Kept story");
            (await client.PostAsJsonAsync($"/api/universes/{universe}/stories/{story}/suggestions", new StoryRequest("Renamed", null, StoryStatus.Planning, 1)))
                .EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        List<string> indexes;
        List<string> triggers;

        await using (var db = Context())
        {
            indexes = await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name");
            triggers = await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
            Assert.Contains("IX_SuggestedChanges_StoryId on SuggestedChanges", indexes);

            await db.GetService<IMigrator>().MigrateAsync(Before);

            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name = 'SuggestedChanges'"));
            Assert.Equal(indexes.Where(LaterSchema.BeforeSuggestions), await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers.Where(LaterSchema.BeforeTypeGroups), await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM \"Stories\"").SingleAsync());
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(indexes, await Strings(db, "SELECT name || ' on ' || tbl_name AS Value FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL ORDER BY name"));
            Assert.Equal(triggers, await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' ORDER BY name"));
            Assert.Equal(0, await db.SuggestedChanges.CountAsync());

            // One target, never none or two; a status it knows.
            await Assert.ThrowsAsync<DbUpdateException>(() => Suggestion(db, entityId: null, storyId: null));
            await Assert.ThrowsAsync<DbUpdateException>(() => Suggestion(db, entry, story));
            await Assert.ThrowsAsync<DbUpdateException>(() => Suggestion(db, entry, storyId: null, (SuggestionStatus)7));
            await Suggestion(db, entry, storyId: null);
        }
    }

    [Fact]
    public async Task Two_accepts_of_one_suggestion_at_once_apply_it_once()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new FileHost(DataSource);
        var client = await Register(host, "user-sgrace");
        var universe = (await PlotTestClient.CreateUniverse(client, "Race world")).Id;
        var entityId = await PlotTestClient.CreateEntity(client, universe, "Raced");
        var entry = $"/api/universes/{universe}/entities/{entityId}";
        var detail = (await client.GetFromJsonAsync<EntityDetail>(entry))!;
        var history = (await client.GetFromJsonAsync<List<EntityRevisionSummary>>($"{entry}/revisions"))!.Count;

        var created = await client.PostAsJsonAsync($"{entry}/suggestions", new EntityRequest(
            detail.EntityTypeId, "Raced again", null, CanonStatus.Idea, null, null, null, detail.Version));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var suggestion = (await created.Content.ReadFromJsonAsync<SuggestionResponse<EntrySuggestion>>())!;

        var accept = $"/api/universes/{universe}/suggestions/{suggestion.Id}/accept";
        var answers = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostAsync(accept, null)));

        Assert.Single(answers, answer => answer.StatusCode == HttpStatusCode.OK);
        foreach (var refused in answers.Where(answer => answer.StatusCode != HttpStatusCode.OK))
        {
            Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
            Assert.Equal(SuggestionEndpoints.ResolvedCode, await PublishingTestClient.ProblemCode(refused));
        }

        var after = (await client.GetFromJsonAsync<EntityDetail>(entry))!;
        Assert.Equal(("Raced again", detail.Version + 1), (after.Name, after.Version));
        Assert.Equal(history + 1, (await client.GetFromJsonAsync<List<EntityRevisionSummary>>($"{entry}/revisions"))!.Count);
    }

    private static async Task Suggestion(LorexDbContext db, Guid? entityId, Guid? storyId, SuggestionStatus status = SuggestionStatus.Open)
    {
        db.ChangeTracker.Clear();
        db.SuggestedChanges.Add(new SuggestedChange
        {
            Id = Guid.NewGuid(),
            EntityId = entityId,
            StoryId = storyId,
            BaseVersion = 1,
            Before = "{}",
            Proposed = "{}",
            Status = status,
            ProposedByUserId = "anyone",
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private static async Task<HttpClient> Register(FileHost host, string name)
    {
        var client = host.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(name, $"{name}@example.test", $"m-{Guid.NewGuid():n}")))
            .EnsureSuccessStatusCode();
        return client;
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
