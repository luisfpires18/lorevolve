using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using LorEvolve.Api.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace LorEvolve.Api.Tests;

/// <summary>
/// What has to be true before the first request, on a real SQLite file rather than the shared
/// in-memory one every other test uses.
///
/// These exist because of one deployment-blocking bug: migrations only ran in Development, so
/// any other environment started against an empty file and the search-index backfill died with
/// <c>SQLite Error 1: 'no such table: Entities'</c>. The tests below pin the three things that
/// keep it fixed - a fresh non-Development start works, an existing database starts again
/// without duplicating index rows, and the backfill cannot outrun the schema even if it is the
/// first thing to run.
/// </summary>
public sealed class HostStartupTests : IDisposable
{
    private const string Password = "Test-password-123!";

    /// <summary>Not Development, and not the name the ordinary test host uses either.</summary>
    private const string DeployedEnvironment = "Staging";

    private readonly string _directory = Path.Combine(
        Path.GetTempPath(), "lorevolve-startup-tests", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorevolve.db");

    // ---------- Starting ----------

    [Fact]
    public async Task A_fresh_database_outside_development_starts_and_serves()
    {
        await using var host = NewHost();

        var response = await host.CreateClient().GetAsync("/api/health");

        var tables = await TableNames();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("Entities", tables);
        Assert.Contains("EntitySearchIndex", tables);
    }

    [Fact]
    public async Task An_existing_database_starts_again()
    {
        await using (var first = NewHost())
        {
            await SignedInWithUniverse(first, "restart");
        }

        ReleaseFile();

        await using var second = NewHost();
        var response = await second.CreateClient().GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // ---------- The backfill ----------

    [Fact]
    public async Task The_backfill_indexes_what_predates_it_and_never_indexes_it_twice()
    {
        Guid entityId;

        await using (var first = NewHost())
        {
            var (client, universe) = await SignedInWithUniverse(first, "backfill");
            var type = await FirstDefaultType(client, universe.Id);
            entityId = (await CreateEntity(client, universe.Id, type.Id, "Aldric Vane")).Id;

            // Lore written before the index existed has no row in it. This is the arrangement
            // the backfill exists for, produced the only honest way: by taking the rows away.
            await WithDatabase(first, db =>
                db.Database.ExecuteSqlAsync($"DELETE FROM EntitySearchIndex"));

            Assert.Equal(0, await IndexedRows(first, entityId));
        }

        ReleaseFile();

        await using (var second = NewHost())
        {
            Assert.Equal(1, await IndexedRows(second, entityId));
        }

        ReleaseFile();

        // A second start has nothing left to do, and must not add a duplicate row for saying so.
        await using var third = NewHost();
        Assert.Equal(1, await IndexedRows(third, entityId));
    }

    [Fact]
    public async Task The_backfill_waits_for_the_schema_even_when_it_starts_first()
    {
        await using var provider = StartupServices();

        // Deliberately only the backfill: the initializer is never started by hand. If the
        // schema were left to hosted-service registration order this would throw
        // "no such table: Entities", which is exactly the bug that started this phase.
        var backfill = provider.GetServices<IHostedService>().OfType<EntitySearchBackfill>().Single();
        await backfill.StartAsync(CancellationToken.None);

        Assert.Contains("Entities", await TableNames());
    }

    // ---------- Who applies migrations ----------

    [Fact]
    public async Task Migrations_can_be_left_to_whatever_deploys_the_app()
    {
        await using var provider = StartupServices(migrateOnStartup: false);

        await provider.GetRequiredService<LorEvolveDatabaseInitializer>()
            .StartAsync(CancellationToken.None);

        Assert.DoesNotContain("Entities", await TableNames());
    }

    // ---------- Behind a TLS-terminating proxy ----------

    [Fact]
    public async Task A_forwarded_proto_header_is_honoured_when_configured()
    {
        Assert.Equal("https", await SchemeSeenBehindProxy(useForwardedHeaders: true));
    }

    [Fact]
    public async Task A_forwarded_proto_header_is_ignored_when_it_is_not()
    {
        Assert.Equal("http", await SchemeSeenBehindProxy(useForwardedHeaders: false));
    }

    // ---------- Helpers ----------

    /// <summary>
    /// The real host, on a real file, in an environment that is not Development. The client
    /// talks https so the session cookie - Secure everywhere but development and the test host -
    /// survives the round trip, which is also how the deployed app is reached.
    /// </summary>
    private DeployedHostFactory NewHost() => new(DataSource);

    private sealed class DeployedHostFactory(string dataSource) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(DeployedEnvironment);

            // UseSetting, not ConfigureAppConfiguration: the connection string is read while the
            // services are being registered, which is before an app-configuration callback runs.
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
        }

        public HttpClient CreateHttpsClient() => CreateClient(
            new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
    }

    /// <summary>
    /// The startup services alone, with no host around them, so one of them can be started
    /// without the other.
    /// </summary>
    private ServiceProvider StartupServices(bool migrateOnStartup = true)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:LorEvolveDb"] = $"Data Source={DataSource}",
                [LorEvolveDatabaseInitializer.MigrateOnStartupKey] = migrateOnStartup ? "true" : "false",
            })
            .Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLorEvolveDatabase(configuration, new StubEnvironment(_directory));
        services.AddLoreSearch();
        return services.BuildServiceProvider();
    }

    private sealed class StubEnvironment(string contentRootPath) : IHostEnvironment
    {
        public string ApplicationName { get; set; } = "LorEvolve.Api";
        public string EnvironmentName { get; set; } = DeployedEnvironment;
        public string ContentRootPath { get; set; } = contentRootPath;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    /// <summary>
    /// A throwaway host carrying nothing but the forwarded-headers middleware and one endpoint
    /// that reports the scheme the app ended up seeing.
    /// </summary>
    private static async Task<string> SchemeSeenBehindProxy(bool useForwardedHeaders)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            [ProxyHeaders.EnabledKey] = useForwardedHeaders ? "true" : "false",
        });
        builder.Services.AddLorEvolveForwardedHeaders(builder.Configuration);

        await using var app = builder.Build();
        app.UseLorEvolveForwardedHeaders();
        app.MapGet("/scheme", (HttpContext context) => context.Request.Scheme);
        await app.StartAsync(CancellationToken.None);

        using var client = app.GetTestClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/scheme");
        request.Headers.Add("X-Forwarded-Proto", "https");

        var response = await client.SendAsync(request);
        return await response.Content.ReadAsStringAsync(CancellationToken.None);
    }

    /// <summary>
    /// The tables the file actually holds. Opened outside the host on purpose: it is the file on
    /// disk that has to carry the schema, not some connection the host happens to be holding.
    /// </summary>
    private async Task<List<string>> TableNames()
    {
        if (!File.Exists(DataSource))
        {
            return [];
        }

        await using var connection = new SqliteConnection($"Data Source={DataSource}");
        await connection.OpenAsync(CancellationToken.None);

        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')";

        var names = new List<string>();
        await using var reader = await command.ExecuteReaderAsync(CancellationToken.None);
        while (await reader.ReadAsync(CancellationToken.None))
        {
            names.Add(reader.GetString(0));
        }

        return names;
    }

    /// <summary>
    /// Hands the file back before the next host opens it. Microsoft.Data.Sqlite pools
    /// connections, and a pooled one keeps a Windows file handle alive after the host is gone.
    /// </summary>
    private static void ReleaseFile() => SqliteConnection.ClearAllPools();

    private static async Task WithDatabase(WebApplicationFactory<Program> host, Func<LorEvolveDbContext, Task> work)
    {
        using var scope = host.Services.CreateScope();
        await work(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>());
    }

    private static async Task<int> IndexedRows(WebApplicationFactory<Program> host, Guid entityId)
    {
        var count = 0;

        await WithDatabase(host, async db =>
        {
            count = await db.Database
                .SqlQuery<int>(
                    $"SELECT COUNT(*) AS Value FROM EntitySearchIndex WHERE EntityId = {entityId}")
                .SingleAsync(CancellationToken.None);
        });

        return count;
    }

    private static async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(
        DeployedHostFactory host,
        string tag)
    {
        var client = host.CreateHttpsClient();

        var registration = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest($"startup-{tag}", $"startup-{tag}@example.test", Password),
            CancellationToken.None);
        registration.EnsureSuccessStatusCode();

        var created = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest($"World {tag}", null, null),
            CancellationToken.None);
        created.EnsureSuccessStatusCode();

        return (client, (await created.Content.ReadFromJsonAsync<UniverseDetail>(
            CancellationToken.None))!);
    }

    private static async Task<EntityTypeResponse> FirstDefaultType(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!
        .First(type => type.Name == "Character");

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, CanonStatus.Idea, null, null, null),
            CancellationToken.None);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>(
            CancellationToken.None))!;
    }

    public void Dispose()
    {
        ReleaseFile();
        try
        {
            Directory.Delete(_directory, recursive: true);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // A leftover temp directory is not worth failing a green test over.
        }
    }
}
