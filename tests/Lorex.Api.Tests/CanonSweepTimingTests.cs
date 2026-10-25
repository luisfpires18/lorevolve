using System.Collections.Concurrent;
using System.Net.Http.Json;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Every Canon rule sweep and reconciliation says how long it took (issue 55, W3): a gated write runs two of them while it holds SQLite's one
/// writer, and until now nothing measured them.
/// </summary>
public sealed class CanonSweepTimingTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    [Fact]
    public async Task A_sweep_and_its_reconciliation_are_logged_with_the_universe_and_how_long_each_took()
    {
        var logs = new CapturedLogs();
        using var host = factory.WithWebHostBuilder(builder => builder.ConfigureLogging(logging => logging
            .AddProvider(logs)
            .AddFilter<CapturedLogs>(typeof(CanonIntegrityEvaluator).FullName, LogLevel.Debug)));
        var client = host.CreateClient();
        (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("sweep-timing", "sweep-timing@example.test", $"t-{Guid.NewGuid():n}")))
            .EnsureSuccessStatusCode();
        var universe = await PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest("Timed", null, null));

        (await client.PostAsync($"/api/universes/{universe.Id}/canon-conflicts/evaluate", null)).EnsureSuccessStatusCode();

        var mine = logs.Messages.Where(message => message.Contains(universe.Id.ToString(), StringComparison.Ordinal)).ToList();
        Assert.Matches(@"swept universe \S+ in \d+ ms \(\d+ findings\)", Assert.Single(mine, message => message.Contains("swept", StringComparison.Ordinal)));
        Assert.Matches(@"reconciled in \d+ ms \(\d+ opened, \d+ reopened, \d+ resolved\)", Assert.Single(mine, message => message.Contains("reconciled", StringComparison.Ordinal)));
    }

    private sealed class CapturedLogs : ILoggerProvider
    {
        public ConcurrentQueue<string> Messages { get; } = new();

        public ILogger CreateLogger(string categoryName) =>
            categoryName == typeof(CanonIntegrityEvaluator).FullName ? new Logger(Messages) : Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;

        public void Dispose()
        {
        }

        private sealed class Logger(ConcurrentQueue<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state)
                where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
                messages.Enqueue(formatter(state, exception));
        }
    }
}
