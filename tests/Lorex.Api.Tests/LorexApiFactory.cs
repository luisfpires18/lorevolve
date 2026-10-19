using System.Data.Common;
using Lorex.Api.Data;
using Lorex.Api.Features.Assistant;
using Lorex.Api.Features.Mcp;
using Lorex.Api.Features.Media;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Lorex.Api.Tests;

/// <summary>
/// Boots the real API host for integration tests against a throwaway in-memory SQLite
/// database, so tests never touch the developer database.
///
/// Only the connection is swapped. The schema is built by the host's own startup migration,
/// exactly as it is in a deployment, so every test also proves the migration set produces a
/// usable schema and that startup work never runs ahead of it.
/// </summary>
public sealed class LorexApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");

    /// <summary>
    /// The object store this host writes images to. In-process, so no test reaches Cloudflare,
    /// and inspectable, so a test can assert on the keys that were written rather than only on
    /// what the API said about them.
    /// </summary>
    public TestMediaObjectStore Media { get; } = new();

    /// <summary>A way to make one database command fail, for proving what a failure leaves behind.</summary>
    public TestCommandFaults Commands { get; } = new();

    /// <summary>The clock the host reads where it asks for one, which a test may move forward.</summary>
    public TestClock Clock { get; } = new();

    /// <summary>
    /// The assistant's model, when a test supplies one before the host is built. Unset, the host keeps what configuration
    /// gives it - no provider in tests - so no test ever reaches a real model, and none needs a key.
    /// </summary>
    public IAssistantProvider? Assistant { get; init; }

    /// <summary>
    /// What answers when the authorization server fetches a client metadata document, when a test supplies it. Unset, a
    /// fetch goes nowhere a test controls - so a test of a metadata-document client always supplies one.
    /// </summary>
    public HttpMessageHandler? ClientMetadata { get; init; }

    /// <summary>Open client registrations a minute. Tests register freely unless a test is about the limit.</summary>
    public int RegistrationsPerMinute { get; init; } = 100_000;

    /// <summary>Known clients' metadata documents checked again a minute, per host, when a test is about that ration.</summary>
    public int? MetadataRechecksPerHostPerMinute { get; init; }

    /// <summary>The MCP origin every test host runs on: the test server's own base address.</summary>
    public const string Origin = "http://localhost";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Mcp:Origin", Origin);
        builder.UseSetting("Mcp:RegistrationsPerMinute", RegistrationsPerMinute.ToString(System.Globalization.CultureInfo.InvariantCulture));
        if (MetadataRechecksPerHostPerMinute is { } rechecks)
        {
            builder.UseSetting("Mcp:MetadataRechecksPerHostPerMinute", rechecks.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<LorexDbContext>>();
            services.RemoveAll<LorexDbContext>();

            _connection.Open();
            services.AddDbContext<LorexDbContext>(options => options.UseSqlite(_connection).AddInterceptors(Commands));

            services.RemoveAll<IMediaObjectStore>();
            services.AddSingleton<IMediaObjectStore>(Media);

            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);

            if (Assistant is not null)
            {
                services.RemoveAll<IAssistantProvider>();
                services.AddSingleton(Assistant);
            }

            if (ClientMetadata is not null)
            {
                services.AddHttpClient(ClientMetadataDocuments.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => ClientMetadata);
            }
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _connection.Dispose();
        }
    }
}

/// <summary>
/// Fails any command <see cref="FailWhen"/> picks, just before it runs. Unset, it does nothing. Registered on every
/// context the host creates, so a failure can be placed deep inside a request that no HTTP input could break.
/// </summary>
public sealed class TestCommandFaults : DbCommandInterceptor
{
    public Func<DbCommand, bool>? FailWhen { get; set; }

    /// <summary>
    /// What a picked command fails with. The default stands for "something went wrong down there";
    /// a test proving how a particular database failure is classified supplies its own.
    /// </summary>
    public Func<Exception> FailWith { get; set; } =
        static () => new InvalidOperationException("A test failed this command on purpose.");

    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        Check(command);
        return result;
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
    {
        Check(command);
        return ValueTask.FromResult(result);
    }

    public override InterceptionResult<int> NonQueryExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result)
    {
        Check(command);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Check(command);
        return ValueTask.FromResult(result);
    }

    public override InterceptionResult<object> ScalarExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result)
    {
        Check(command);
        return result;
    }

    public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result, CancellationToken cancellationToken = default)
    {
        Check(command);
        return ValueTask.FromResult(result);
    }

    private void Check(DbCommand command)
    {
        if (FailWhen?.Invoke(command) == true)
        {
            throw FailWith();
        }
    }
}

/// <summary>The system clock, plus however far a test has moved it.</summary>
public sealed class TestClock : TimeProvider
{
    public TimeSpan Offset { get; set; }

    public override DateTimeOffset GetUtcNow() => System.GetUtcNow() + Offset;
}
