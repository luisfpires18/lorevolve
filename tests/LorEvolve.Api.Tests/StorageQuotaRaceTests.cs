using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Account storage over a real SQLite file (ADR 0042): each request its own connection, every transaction IMMEDIATE,
/// which is the only setting in which two uploads can genuinely race. Uploads that would together pass the allowance
/// land one at a time and the rest are refused; an upload still on its way to the bucket already counts. And the
/// migration gives every account that existed before it the default allowance.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class StorageQuotaRaceTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>The migration immediately before account storage.</summary>
    private const string Before = "20261005200148_AddChronologyCalendars";

    private static readonly byte[] Picture = RestoreTestClient.Png(240, 180, seed: 7);

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-storage-race", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    [Fact]
    public async Task Racing_uploads_never_take_more_than_the_allowance()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new FileHost(DataSource);
        var (client, userId) = await Register(host, "user-sqrace", "sqrace@example.test");
        var u = (await PlotTestClient.CreateUniverse(client, "Race world")).Id;
        var entries = new List<Guid>();
        for (var index = 0; index < 4; index++)
        {
            entries.Add(await PlotTestClient.CreateEntity(client, u, $"Racer {index}"));
        }

        // Room for one picture and most of a second: "quota 100, two uploads of 60".
        await SetQuota(userId, Picture.Length + (Picture.Length / 2));

        // Every upload that gets as far as the bucket is held there until each of the others has either got there too
        // or been answered. So all of them are in flight at once - each has passed, or failed, its storage check while
        // none has committed - and whatever lands, lands only after every check has run. Without holds, all four
        // would reach the bucket.
        var inFlight = 0;
        var settled = 0;
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        void Check()
        {
            if (Volatile.Read(ref inFlight) + Volatile.Read(ref settled) == entries.Count)
            {
                release.TrySetResult();
            }
        }

        host.Media.BeforePut = async key =>
        {
            if (key.Contains("original", StringComparison.Ordinal))
            {
                Interlocked.Increment(ref inFlight);
                Check();
                await release.Task.WaitAsync(TimeSpan.FromSeconds(60));
            }
        };

        var responses = await Task.WhenAll(entries.Select(async entry =>
        {
            var response = await Upload(client, u, entry);
            if (response.StatusCode != HttpStatusCode.OK)
            {
                Interlocked.Increment(ref settled);
                Check();
            }

            return response;
        }));

        Assert.Equal(1, inFlight);

        Assert.Equal(1, responses.Count(response => response.StatusCode == HttpStatusCode.OK));
        Assert.All(responses, response => Assert.Contains(response.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }));
        foreach (var refused in responses.Where(response => response.StatusCode == HttpStatusCode.Conflict))
        {
            Assert.Contains(StorageQuota.ExceededCode, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }

        SqliteConnection.ClearAllPools();
        await using var db = Context();
        Assert.Equal(Picture.Length, await db.EntityImages.SumAsync(image => image.ByteSize));
        Assert.Equal(0, await db.StorageReservations.CountAsync());
        Assert.Equal(2, host.Media.Keys.Count);
    }

    [Fact]
    public async Task An_upload_still_on_its_way_to_the_bucket_already_counts()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new FileHost(DataSource);
        var (client, userId) = await Register(host, "user-sqflight", "sqflight@example.test");
        var u = (await PlotTestClient.CreateUniverse(client, "Flight world")).Id;
        var slow = await PlotTestClient.CreateEntity(client, u, "Slow");
        var fast = await PlotTestClient.CreateEntity(client, u, "Fast");
        await SetQuota(userId, Picture.Length + (Picture.Length / 2));

        var reached = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        host.Media.BeforePut = async key =>
        {
            if (key.Contains(slow.ToString("D"), StringComparison.Ordinal) && key.Contains("original", StringComparison.Ordinal))
            {
                reached.TrySetResult();
                await release.Task;
            }
        };

        // The slow upload has its room and is writing to the bucket; nothing of it is in the database yet.
        var pending = Upload(client, u, slow);
        await reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        var second = await Upload(client, u, fast);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        release.SetResult();
        Assert.Equal(HttpStatusCode.OK, (await pending).StatusCode);

        SqliteConnection.ClearAllPools();
        await using var db = Context();
        Assert.Equal(Picture.Length, await db.EntityImages.SumAsync(image => image.ByteSize));
        Assert.Equal(0, await db.StorageReservations.CountAsync());
    }

    [Fact]
    public async Task An_upload_that_lost_to_a_universe_delete_sweeps_only_after_letting_go_of_the_database()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new FileHost(DataSource);
        var (client, userId) = await Register(host, "user-sqgone", "sqgone@example.test");
        var u = (await PlotTestClient.CreateUniverse(client, "Gone world")).Id;
        var entry = await PlotTestClient.CreateEntity(client, u, "Racing");
        (await client.PostAsync($"/api/universes/{u}/archive", null)).EnsureSuccessStatusCode();

        // The universe goes while the upload's bytes are in the bucket and nothing names them yet.
        host.Media.BeforePut = async key =>
        {
            if (key.Contains(entry.ToString("D"), StringComparison.Ordinal) && key.Contains("original", StringComparison.Ordinal))
            {
                Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{u}")).StatusCode);
            }
        };

        var writes = WriterProbe(host, userId, key => key.Contains(entry.ToString("D"), StringComparison.Ordinal));

        var response = await Upload(client, u, entry);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        AssertSweptWithTheDatabaseFree(writes, expected: 2);
        Assert.DoesNotContain(host.Media.Keys, key => key.Contains(entry.ToString("D"), StringComparison.Ordinal));

        SqliteConnection.ClearAllPools();
        await using var db = Context();
        Assert.Equal(0, await db.EntityImages.CountAsync());
        Assert.Equal(0, await db.StorageReservations.CountAsync());
    }

    [Fact]
    public async Task An_upload_that_lost_to_a_changed_picture_sweeps_only_after_letting_go_of_the_database()
    {
        Directory.CreateDirectory(_directory);
        await using var host = new FileHost(DataSource);
        var (client, userId) = await Register(host, "user-sqchanged", "sqchanged@example.test");
        var u = (await PlotTestClient.CreateUniverse(client, "Changed world")).Id;
        var entry = await PlotTestClient.CreateEntity(client, u, "Contested");
        Assert.Equal(HttpStatusCode.OK, (await Upload(client, u, entry, RestoreTestClient.Png(120, 90, seed: 8))).StatusCode);

        string firstAsset;
        await using (var db = Context())
        {
            firstAsset = (await db.EntityImages.SingleAsync()).AssetId.ToString("D");
        }

        // A larger replacement is on its way when the picture it was measured against is removed.
        host.Media.BeforePut = async key =>
        {
            if (key.Contains(entry.ToString("D"), StringComparison.Ordinal)
                && key.Contains("original", StringComparison.Ordinal)
                && !key.Contains(firstAsset, StringComparison.Ordinal))
            {
                Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{u}/entities/{entry}/image")).StatusCode);
            }
        };

        var writes = WriterProbe(host, userId, key => key.Contains(entry.ToString("D"), StringComparison.Ordinal)
            && !key.Contains(firstAsset, StringComparison.Ordinal));

        var response = await Upload(client, u, entry);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains(EntityImageEndpoints.ImageChangedCode, await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        AssertSweptWithTheDatabaseFree(writes, expected: 2);
        Assert.DoesNotContain(host.Media.Keys, key => key.Contains(entry.ToString("D"), StringComparison.Ordinal));

        SqliteConnection.ClearAllPools();
        await using var check = Context();
        Assert.Equal(0, await check.EntityImages.CountAsync());
        Assert.Equal(0, await check.StorageReservations.CountAsync());
    }

    [Fact]
    public async Task Every_account_from_before_the_migration_gets_the_default_allowance()
    {
        Directory.CreateDirectory(_directory);
        string userId;

        await using (var host = new FileHost(DataSource))
        {
            (_, userId) = await Register(host, "user-sqmig", "sqmig@example.test");
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync(Before);
            Assert.DoesNotContain("StorageQuotaBytes", await Strings(db, "SELECT name AS Value FROM pragma_table_info('AspNetUsers')"));
            Assert.Empty(await Strings(db, "SELECT name AS Value FROM sqlite_master WHERE name = 'StorageReservations'"));
        }

        SqliteConnection.ClearAllPools();

        await using (var db = Context())
        {
            await db.GetService<IMigrator>().MigrateAsync();
            Assert.False(db.Database.HasPendingModelChanges());

            Assert.Equal(StorageQuota.DefaultBytes, await db.Users.Where(user => user.Id == userId).Select(user => user.StorageQuotaBytes).SingleAsync());
            Assert.Equal(
                ["Id", "UserId", "Bytes", "CreatedAt", "ExpiresAt"],
                await Strings(db, "SELECT name AS Value FROM pragma_table_info('StorageReservations') ORDER BY cid"));
            Assert.Equal(["AspNetUsers CASCADE"], await Strings(db, "SELECT \"table\" || ' ' || on_delete AS Value FROM pragma_foreign_key_list('StorageReservations')"));
            Assert.Contains("IX_StorageReservations_UserId_ExpiresAt", await Strings(db, "SELECT name AS Value FROM pragma_index_list('StorageReservations')"));

            // A hold of nothing, or less, is refused by the table itself.
            await Assert.ThrowsAsync<SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                "INSERT INTO StorageReservations (Id, UserId, Bytes, CreatedAt, ExpiresAt) VALUES ({0}, {1}, 0, '2026-10-06 00:00:00', '2026-10-06 00:15:00')",
                Guid.NewGuid().ToString().ToUpperInvariant(), userId));

            // A hold goes with its account.
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO StorageReservations (Id, UserId, Bytes, CreatedAt, ExpiresAt) VALUES ({0}, {1}, 5, '2026-10-06 00:00:00', '2026-10-06 00:15:00')",
                Guid.NewGuid().ToString().ToUpperInvariant(), userId);
            await db.Database.ExecuteSqlRawAsync("DELETE FROM AspNetUsers WHERE Id = {0}", userId);
            Assert.Equal(0, await db.StorageReservations.CountAsync());
        }
    }

    // ---------- Helpers ----------

    /// <summary>
    /// Holds each sweep of a key <paramref name="watched"/> picks just long enough to write to the database from a
    /// connection of its own, one that gives up after a second rather than waiting out a held writer lock. Every write
    /// that lands proves the sweep began with no write transaction open anywhere; one that times out is recorded as
    /// the failure it is.
    /// </summary>
    private ConcurrentQueue<Exception?> WriterProbe(FileHost host, string userId, Func<string, bool> watched)
    {
        var writes = new ConcurrentQueue<Exception?>();
        host.Media.BeforeDelete = async key =>
        {
            if (!watched(key))
            {
                return;
            }

            try
            {
                await using var other = new LorEvolveDbContext(new DbContextOptionsBuilder<LorEvolveDbContext>()
                    .UseSqlite($"Data Source={DataSource};Default Timeout=1;Pooling=False").Options);
                await other.Users.Where(user => user.Id == userId)
                    .ExecuteUpdateAsync(setters => setters.SetProperty(user => user.StorageQuotaBytes, StorageQuota.DefaultBytes));
                writes.Enqueue(null);
            }
            catch (Exception exception)
            {
                writes.Enqueue(exception);
            }
        };
        return writes;
    }

    private static void AssertSweptWithTheDatabaseFree(ConcurrentQueue<Exception?> writes, int expected)
    {
        Assert.Equal(expected, writes.Count);
        Assert.All(writes, failure => Assert.Null(failure));
    }

    private static async Task<(HttpClient Client, string UserId)> Register(FileHost host, string username, string email)
    {
        var client = host.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(username, email, Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    private static async Task<HttpResponseMessage> Upload(HttpClient client, Guid universeId, Guid entityId, byte[]? bytes = null)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes ?? Picture);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "picture.png");
        return await client.PutAsync($"/api/universes/{universeId}/entities/{entityId}/image", form);
    }

    private async Task SetQuota(string userId, long bytes)
    {
        await using var db = Context();
        await db.Users.Where(user => user.Id == userId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(user => user.StorageQuotaBytes, bytes));
    }

    private LorEvolveDbContext Context() =>
        new(new DbContextOptionsBuilder<LorEvolveDbContext>().UseSqlite($"Data Source={DataSource}").Options);

    private static async Task<List<string>> Strings(LorEvolveDbContext db, string sql) =>
        await db.Database.SqlQueryRaw<string>(sql).ToListAsync();

    /// <summary>The real host on the file, outside Development, so startup migrates it the way a deployment does.</summary>
    private sealed class FileHost(string dataSource) : WebApplicationFactory<Program>
    {
        public TestMediaObjectStore Media { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
            builder.UseSetting("Media:Provider", "InMemory");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IMediaObjectStore>();
                services.AddSingleton<IMediaObjectStore>(Media);
            });
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
