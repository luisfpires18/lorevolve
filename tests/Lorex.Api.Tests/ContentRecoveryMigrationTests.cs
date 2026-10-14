using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Stories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// The content recovery migration, walked down and back up over a real SQLite file holding a story with live work, work in
/// the Trash and a whole story in the Trash (ADR 0029).
///
/// Down, the schema before it had no Trash: what is in the Trash goes for good, with exactly what a permanent delete there
/// took, and every live row - scene, chapter, arc, beat, link and word of prose - stays as it was, under the order indexes it
/// had. Up, every row is live in the order it held, the order indexes guard live rows only, and each manuscript becomes
/// version 1 of its own history, byte for byte and dated by its last save. Each is read back from the file, not trusted from
/// the generated code, and the upgraded file then works.
/// </summary>
public sealed class ContentRecoveryMigrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before content recovery.</summary>
    private const string BeforeRecovery = "20260913210631_AddEntityArticles";

    private static readonly string[] MarkedTables = ["Stories", "Chapters", "Scenes", "PlotArcs", "PlotBeats"];

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorex-recovery-migration", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task Prose_becomes_its_first_version_the_trash_is_discarded_on_rollback_and_live_work_survives_both_ways()
    {
        Directory.CreateDirectory(_directory);

        Guid universeId;
        Guid storyId;
        Guid gate;
        Guid inside;
        Guid cut;
        Guid keptBeat;
        Guid goneStory;

        // Written by the current host: live work, a scene, a beat and a chapter in the Trash, and a whole story there too.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync(
                "/api/auth/register",
                new RegisterRequest("user-rcmigrate", "user-rcmigrate@example.test", Password)))
                .EnsureSuccessStatusCode();

            universeId = (await CreateUniverse(client, "World rcmigrate")).Id;
            var arlen = await CreateEntity(client, universeId, "Arlen");
            storyId = await CreateStory(client, universeId, "The Ashen Road");
            var story = Story(universeId, storyId);

            var arrival = await CreateChapter(client, universeId, storyId, "Arrival");
            var discarded = await CreateChapter(client, universeId, storyId, "Discarded");
            gate = (await PostJson<SceneResponse>(
                client, $"{story}/scenes", new SceneRequest("At the gate", "Snow.", null, arlen, null, [arlen], arrival))).Id;
            inside = await CreateScene(client, universeId, storyId, "Inside", discarded);
            cut = (await PostJson<SceneResponse>(
                client, $"{story}/scenes", new SceneRequest("Cut", null, null, null, null, [arlen], arrival))).Id;

            var arc = await CreateArc(client, universeId, storyId, "Fall of the King");
            keptBeat = (await CreateBeat(client, universeId, storyId, arc.Id, "Learns", [gate, cut], [arlen])).Id;
            var droppedBeat = (await CreateBeat(client, universeId, storyId, arc.Id, "Dropped", [inside], [arlen])).Id;

            await WriteManuscript(client, universeId, storyId, gate, "A first draft.");
            await WriteManuscript(client, universeId, storyId, gate, Prose);
            await WriteManuscript(client, universeId, storyId, inside, string.Empty);
            await WriteManuscript(client, universeId, storyId, inside, "Warm, at last.");
            await WriteManuscript(client, universeId, storyId, cut, "Cut prose.");

            (await client.DeleteAsync($"{story}/scenes/{cut}")).EnsureSuccessStatusCode();
            (await client.DeleteAsync(Beat(universeId, storyId, droppedBeat))).EnsureSuccessStatusCode();
            (await client.DeleteAsync($"{story}/chapters/{discarded}")).EnsureSuccessStatusCode();

            goneStory = await CreateStory(client, universeId, "Abandoned");
            var goneScene = await CreateScene(client, universeId, goneStory, "Elsewhere");
            await WriteManuscript(client, universeId, goneStory, goneScene, "Abandoned prose.");
            (await client.DeleteAsync(Story(universeId, goneStory))).EnsureSuccessStatusCode();
        }

        SqliteConnection.ClearAllPools();

        List<string> liveScenes;
        List<string> liveChapters;

        // Down: the Trash goes, and nothing live moves.
        await using (var db = Context())
        {
            liveScenes = await SceneRows(db, liveOnly: true);
            liveChapters = await ChapterRows(db, liveOnly: true);
            Assert.Equal(["The Ashen Road|At the gate", "The Ashen Road|Inside"], liveScenes.Select(TitleOf));
            // Two saves of the gate, one of Inside - its empty first save changed nothing - one of the abandoned scene.
            Assert.Equal(4, await db.SceneManuscriptRevisions.CountAsync(version => version.SceneId != cut));

            await db.GetService<IMigrator>().MigrateAsync(BeforeRecovery);

            Assert.DoesNotContain("SceneManuscriptRevisions", await Tables(db));
            foreach (var table in MarkedTables)
            {
                Assert.DoesNotContain("DeletedAt", await Columns(db, table));
            }

            Assert.Equal(liveScenes, await SceneRows(db, liveOnly: false));
            Assert.Equal(liveChapters, await ChapterRows(db, liveOnly: false));
            Assert.Equal(0, await Count(db, $"SELECT COUNT(*) AS Value FROM \"Stories\" WHERE \"Id\" = '{Key(goneStory)}'"));
            Assert.Equal(["Learns"], await Strings(db, "SELECT \"Title\" AS Value FROM \"PlotBeats\""));

            // The link to the discarded scene went with it; the live one stayed.
            Assert.Equal(
                [Key(gate)],
                await Strings(db, $"SELECT \"SceneId\" AS Value FROM \"PlotBeatScenes\" WHERE \"PlotBeatId\" = '{Key(keptBeat)}'"));
            Assert.Equal(
                ["Warm, at last.", Prose],
                await Strings(db, "SELECT \"Content\" AS Value FROM \"SceneManuscripts\" ORDER BY \"Content\" DESC"));
            Assert.Empty(await ForeignKeyViolations(db));

            // The order indexes are what they were: whole-table unique indexes, and no plain lookups beside them.
            Assert.Contains("IX_Chapters_StoryId_SortOrder:1:0", await Indexes(db, "Chapters"));
            Assert.Contains("IX_PlotArcs_StoryId_SortOrder:1:0", await Indexes(db, "PlotArcs"));
            Assert.Contains("IX_PlotBeats_PlotArcId_SortOrder:1:0", await Indexes(db, "PlotBeats"));
            Assert.Contains("IX_Scenes_StoryId_SortOrder:1:1", await Indexes(db, "Scenes"));
            Assert.Contains("IX_Scenes_ChapterId_SortOrder:1:1", await Indexes(db, "Scenes"));
            Assert.DoesNotContain("IX_Chapters_StoryId:0:0", await Indexes(db, "Chapters"));
            Assert.DoesNotContain("IX_Scenes_ChapterId:0:0", await Indexes(db, "Scenes"));
        }

        SqliteConnection.ClearAllPools();

        // Up: every row live where it was, and each manuscript version 1 of its history.
        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();

            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Empty(await ForeignKeyViolations(db));
            Assert.Equal(liveScenes, await SceneRows(db, liveOnly: false));
            Assert.Equal(liveChapters, await ChapterRows(db, liveOnly: false));

            foreach (var table in MarkedTables)
            {
                Assert.Contains("DeletedAt", await Columns(db, table));
                Assert.Equal(0, await Count(db, $"SELECT COUNT(*) AS Value FROM \"{table}\" WHERE \"DeletedAt\" IS NOT NULL"));
            }

            var manuscripts = await db.SceneManuscripts.AsNoTracking().ToListAsync();
            var versions = await db.SceneManuscriptRevisions.AsNoTracking().ToListAsync();
            Assert.Equal(2, manuscripts.Count);
            Assert.Equal(manuscripts.Count, versions.Count);
            Assert.Equal(versions.Count, versions.Select(version => version.Id).Distinct().Count());

            foreach (var manuscript in manuscripts)
            {
                var version = Assert.Single(versions, candidate => candidate.SceneId == manuscript.SceneId);
                Assert.Equal((1, SceneManuscriptRevisionKind.Created, (Guid?)null), (version.Number, version.Kind, version.RestoredFromRevisionId));
                Assert.Equal(manuscript.Content, version.Content, StringComparer.Ordinal);
                Assert.Equal(manuscript.UpdatedAt, version.CreatedAt);
            }

            Assert.Equal(Prose, versions.Single(version => version.SceneId == gate).Content, StringComparer.Ordinal);

            // name:unique:partial - the orders guard live rows, and a plain index serves each foreign key.
            Assert.Contains("IX_Chapters_StoryId_SortOrder:1:1", await Indexes(db, "Chapters"));
            Assert.Contains("IX_Chapters_StoryId:0:0", await Indexes(db, "Chapters"));
            Assert.Contains("IX_PlotArcs_StoryId_SortOrder:1:1", await Indexes(db, "PlotArcs"));
            Assert.Contains("IX_PlotBeats_PlotArcId_SortOrder:1:1", await Indexes(db, "PlotBeats"));
            Assert.Contains("IX_Scenes_ChapterId:0:0", await Indexes(db, "Scenes"));
            Assert.Contains("IX_SceneManuscriptRevisions_SceneId_Number:1:0", await Indexes(db, "SceneManuscriptRevisions"));
            Assert.Equal(["Scenes.SceneId:CASCADE"], await ForeignKeys(db, "SceneManuscriptRevisions"));
        }

        SqliteConnection.ClearAllPools();

        // The upgraded file is a working Lorex: what was written before the upgrade is restorable once it is edited, and
        // the Trash works again.
        await using (var host = new FileHost(DataSource))
        {
            var client = host.CreateHttpsClient();
            (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-rcmigrate", Password)))
                .EnsureSuccessStatusCode();

            var revisions = $"{Manuscript(universeId, storyId, gate)}/revisions";
            var first = Assert.Single((await client.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>(revisions))!);
            Assert.Equal(SceneManuscriptRevisionKind.Created, first.Kind);

            var rewritten = await WriteManuscript(client, universeId, storyId, gate, "Rewritten after the upgrade.");
            (await client.PostAsJsonAsync($"{revisions}/{first.Id}/restore", new SceneManuscriptRestoreRequest(rewritten.Version)))
                .EnsureSuccessStatusCode();
            Assert.Equal(Prose, (await ReadManuscript(client, universeId, storyId, gate)).Content, StringComparer.Ordinal);
            Assert.Equal(3, (await client.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>(revisions))!.Count);

            (await client.DeleteAsync($"{Story(universeId, storyId)}/scenes/{inside}")).EnsureSuccessStatusCode();
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Manuscript(universeId, storyId, inside))).StatusCode);
            (await client.PostAsync($"/api/universes/{universeId}/trash/scenes/{inside}/restore", content: null))
                .EnsureSuccessStatusCode();
            Assert.Equal("Warm, at last.", (await ReadManuscript(client, universeId, storyId, inside)).Content);
        }
    }

    // ---------- Reading the file ----------

    // Plain SQL, so both schemas read alike. Only the live forms name DeletedAt, which the schema before has no column for.
    private const string AllSceneRowsSql = """
        SELECT st."Title" || '|' || s."Title" || '|' || COALESCE(s."ChapterId", '-') || '|' || s."SortOrder" || '|' || s."Id" AS Value
        FROM "Scenes" AS s
        JOIN "Stories" AS st ON st."Id" = s."StoryId"
        ORDER BY st."Title", s."Title"
        """;

    private const string LiveSceneRowsSql = """
        SELECT st."Title" || '|' || s."Title" || '|' || COALESCE(s."ChapterId", '-') || '|' || s."SortOrder" || '|' || s."Id" AS Value
        FROM "Scenes" AS s
        JOIN "Stories" AS st ON st."Id" = s."StoryId"
        WHERE s."DeletedAt" IS NULL AND st."DeletedAt" IS NULL
        ORDER BY st."Title", s."Title"
        """;

    private const string AllChapterRowsSql = """
        SELECT c."StoryId" || '|' || c."Title" || '|' || c."SortOrder" || '|' || c."Id" AS Value
        FROM "Chapters" AS c
        JOIN "Stories" AS st ON st."Id" = c."StoryId"
        ORDER BY c."StoryId", c."SortOrder"
        """;

    private const string LiveChapterRowsSql = """
        SELECT c."StoryId" || '|' || c."Title" || '|' || c."SortOrder" || '|' || c."Id" AS Value
        FROM "Chapters" AS c
        JOIN "Stories" AS st ON st."Id" = c."StoryId"
        WHERE c."DeletedAt" IS NULL AND st."DeletedAt" IS NULL
        ORDER BY c."StoryId", c."SortOrder"
        """;

    /// <summary>Every scene as one line - story, title, chapter, place and id - in a stable order.</summary>
    private static async Task<List<string>> SceneRows(LorexDbContext db, bool liveOnly) =>
        await db.Database.SqlQueryRaw<string>(liveOnly ? LiveSceneRowsSql : AllSceneRowsSql).ToListAsync();

    private static async Task<List<string>> ChapterRows(LorexDbContext db, bool liveOnly) =>
        await db.Database.SqlQueryRaw<string>(liveOnly ? LiveChapterRowsSql : AllChapterRowsSql).ToListAsync();

    private static string TitleOf(string row) => string.Join('|', row.Split('|').Take(2));

    /// <summary>A Guid as the schema stores it.</summary>
    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

    private static async Task<int> Count(LorexDbContext db, string sql) =>
        (await db.Database.SqlQueryRaw<int>(sql).ToListAsync()).Single();

    private static async Task<List<string>> Strings(LorexDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    private LorexDbContext Context() =>
        new(new DbContextOptionsBuilder<LorexDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Tables(LorexDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT name AS Value FROM sqlite_master WHERE type = 'table'")
            .ToListAsync();

    private static async Task<List<string>> Columns(LorexDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name AS Value FROM pragma_table_info({table})")
            .ToListAsync();

    private static async Task<List<string>> Indexes(LorexDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT name || ':' || \"unique\" || ':' || partial AS Value FROM pragma_index_list({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeys(LorexDbContext db, string table) =>
        await db.Database
            .SqlQuery<string>($"SELECT \"table\" || '.' || \"from\" || ':' || on_delete AS Value FROM pragma_foreign_key_list({table})")
            .ToListAsync();

    private static async Task<List<string>> ForeignKeyViolations(LorexDbContext db) =>
        await db.Database
            .SqlQueryRaw<string>("SELECT \"table\" AS Value FROM pragma_foreign_key_check")
            .ToListAsync();

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
            // A handle Windows has not let go of yet. The directory is under the temp root and named for this run, so
            // leaving it costs nothing.
        }
    }
}
