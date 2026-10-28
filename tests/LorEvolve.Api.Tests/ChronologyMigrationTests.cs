using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The chronology migration, walked down and back up over a real SQLite file holding real lore.
///
/// Three of its steps rebuild whole tables - SQLite cannot add a foreign key any other way - and a
/// rebuild is where rows go missing or references come loose. So the lore is written through the
/// ordinary API first, never as hand-made rows, and then the schema is taken back to the migration
/// before chronology and forward again. What has to survive both directions is the meaning of every
/// plain year that predates eras, and the order the timeline reads in.
/// </summary>
public sealed class ChronologyMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before chronology.</summary>
    private const string BeforeChronology = "20260912110435_AddProfileImages";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-chronology-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Plain_years_keep_their_meaning_and_order_down_and_back_up_through_the_migration()
    {
        Directory.CreateDirectory(_directory);

        Guid plainUniverse;
        Guid erasUniverse;
        TimelineEntryPage before;

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-chronmigrate", "user-chronmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            plainUniverse = (await CreateUniverse(client, "World chronmigrate plain")).Id;
            erasUniverse = (await CreateUniverse(client, "World chronmigrate eras")).Id;

            await WritePlainLore(client, plainUniverse);
            await WriteEraLore(client, erasUniverse);

            before = await Listing(client, plainUniverse);
        }

        SqliteConnection.ClearAllPools();

        // Down: the chronology schema goes, and with it every era. Nothing else may.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(BeforeChronology);

            Assert.DoesNotContain("ChronologyEras", await Tables(db));
            Assert.DoesNotContain("StartEraId", await Columns(db, "TimelineEntries"));
            Assert.DoesNotContain("EraId", await Columns(db, "EntityFieldValues"));
            Assert.Empty(await ForeignKeyViolations(db));

            // Counting selects no column, so it reads the rolled-back tables through today's model.
            Assert.Equal(7, await db.TimelineEntries.CountAsync());
            Assert.Equal(4, await db.TimelineEntryLinks.CountAsync());
            Assert.Equal(3, await db.EntityFieldValues.CountAsync());
        }

        SqliteConnection.ClearAllPools();

        // Up again, over lore that has never seen an era.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.Contains("ChronologyEras", await Tables(db));
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.False(db.Database.HasPendingModelChanges());

            Assert.Equal(0, await db.TimelineEntries.CountAsync(entry => entry.StartEraId != null || entry.EndEraId != null));
            Assert.Equal(0, await db.EntityFieldValues.CountAsync(value => value.EraId != null));
        }

        SqliteConnection.ClearAllPools();

        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/login",
                new LoginRequest("user-chronmigrate", Password)))
                .EnsureSuccessStatusCode();

            var after = await Listing(client, plainUniverse);

            // Same moments, same order, same dates, byte for byte in what the client reads.
            Assert.Equal(
                before.Items.Select(entry => (entry.Id, entry.Title, entry.Date)).ToArray(),
                after.Items.Select(entry => (entry.Id, entry.Title, entry.Date)).ToArray());

            var chronology = (await client.GetFromJsonAsync<ChronologyResponse>(
                $"/api/universes/{plainUniverse}/chronology"))!;
            Assert.Empty(chronology.Eras);

            // The world that had eras is plain again, its year a plain year: the only meaning the
            // earlier schema could give it, and still on the line rather than lost.
            var rolledBack = await Listing(client, erasUniverse);
            var moment = Assert.Single(rolledBack.Items);
            Assert.Equal(12, moment.Date.StartYear);
            Assert.Null(moment.Date.StartEraId);
        }
    }

    /// <summary>
    /// Everything the plain reckoning can say: negative, zero and positive years, month and day
    /// precision, an approximate year, a range, an unknown date, a free-text era label, participants
    /// and a declared birth year.
    /// </summary>
    private static async Task WritePlainLore(HttpClient client, Guid universeId)
    {
        var type = await CharacterType(client, universeId);
        var born = await AddField(client, universeId, type.Id, "Born", EntityFieldSemantic.BirthYear);

        var elendil = await CreateEntity(client, universeId, type.Id, "Elendil", [Number(born.Id, 3119)]);
        var isildur = await CreateEntity(client, universeId, type.Id, "Isildur", [Number(born.Id, -42)]);

        await Moment(client, universeId, new TimelineEntryRequest(
            "The founding", null, CanonStatus.Idea, TimelineDateKind.Exact, -4200, null, null, null, null, null,
            "Before the Drowning", [elendil.Id]));
        await Moment(client, universeId, new TimelineEntryRequest(
            "Year zero", null, CanonStatus.Idea, TimelineDateKind.Exact, 0, null, null, null, null, null, null, null));
        await Moment(client, universeId, new TimelineEntryRequest(
            "A September", null, CanonStatus.Idea, TimelineDateKind.Exact, 3018, 9, 23, null, null, null, null,
            [elendil.Id, isildur.Id]));
        await Moment(client, universeId, new TimelineEntryRequest(
            "Around then", null, CanonStatus.Idea, TimelineDateKind.Approximate, 3018, null, null, null, null, null,
            null, null));
        await Moment(client, universeId, new TimelineEntryRequest(
            "The long war", null, CanonStatus.Idea, TimelineDateKind.Range, -300, 3, null, 12, null, null,
            "Second Age", null));
        await Moment(client, universeId, new TimelineEntryRequest(
            "Some day", null, CanonStatus.Idea, TimelineDateKind.Unknown, null, null, null, null, null, null,
            null, null));
    }

    /// <summary>A moment and a birth year counted inside an era, so rolling back has references to clear.</summary>
    private static async Task WriteEraLore(HttpClient client, Guid universeId)
    {
        var saved = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        saved.EnsureSuccessStatusCode();
        var eras = (await saved.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;

        var type = await CharacterType(client, universeId);
        var born = await AddField(client, universeId, type.Id, "Born", EntityFieldSemantic.BirthYear);
        var entity = await CreateEntity(
            client, universeId, type.Id, "Aranel", [Number(born.Id, 5) with { EraId = eras[0].Id }]);

        await Moment(client, universeId, new TimelineEntryRequest(
            "After the fall", null, CanonStatus.Idea, TimelineDateKind.Exact, 12, null, null, null, null, null,
            null, [entity.Id], StartEraId: eras[1].Id));
    }

    // ---------- Reading the file ----------

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Tables(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'table'")
            .ToListAsync();

    private static async Task<List<string>> Columns(LorEvolveDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorEvolveDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check")
            .ToListAsync();

    // ---------- Writing through the API ----------

    private static async Task<TimelineEntryPage> Listing(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<TimelineEntryPage>(
            $"/api/universes/{universeId}/timeline?pageSize=100"))!;

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<EntityTypeResponse> CharacterType(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!.First(type => type.Name == "Character");

    private static async Task<FieldDefinitionResponse> AddField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        EntityFieldSemantic semantic)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, EntityFieldKind.Number, false, null, null, null, semantic));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.First(field => field.Name == name);
    }

    private static FieldValueInput Number(Guid fieldId, double value) => new(fieldId, null, value, null, null, null, null);

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        IReadOnlyList<FieldValueInput> fields)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, CanonStatus.Idea, null, null, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task Moment(HttpClient client, Guid universeId, TimelineEntryRequest request) =>
        (await client.PostAsJsonAsync($"/api/universes/{universeId}/timeline", request)).EnsureSuccessStatusCode();

    /// <summary>The real host on the file, outside Development, so startup migrates it the way a deployment does.</summary>
    private sealed class FileHost(string dataSource) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
        }

        /// <summary>Outside Development the session cookie is secure-only, so it only travels over https.</summary>
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
            // A handle Windows has not let go of yet. The directory is under the temp root and
            // named for this run, so leaving it costs nothing.
        }
    }
}
