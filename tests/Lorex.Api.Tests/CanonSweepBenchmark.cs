using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit.Abstractions;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A measurement, not a check (issue 55, W3): how long a Canon rule sweep and one gated save take as a universe grows. It
/// does nothing unless <c>LOREX_BENCH=1</c>, so the suite never pays for it. Entries are half Canon and half Draft and every
/// relationship is Canon, so the status rules have real work; nothing is dated, so the lifespan and timeline rules load their
/// rows and find nothing - a floor, not a ceiling.
/// </summary>
public sealed class CanonSweepBenchmark(LorexApiFactory factory, ITestOutputHelper output) : IClassFixture<LorexApiFactory>
{
    [Theory]
    [InlineData(200, 500)]
    [InlineData(2_000, 5_000)]
    [InlineData(5_000, 12_500)]
    public async Task A_universe_of_this_size_sweeps_in(int entries, int relationships)
    {
        if (Environment.GetEnvironmentVariable("LOREX_BENCH") != "1")
        {
            return;
        }

        var logs = new SweepLogs();
        using var host = factory.WithWebHostBuilder(builder => builder.ConfigureLogging(logging => logging
            .AddProvider(logs)
            .AddFilter<SweepLogs>(typeof(CanonIntegrityEvaluator).FullName, LogLevel.Debug)));
        var client = host.CreateClient();
        var name = $"bench-{entries}";
        (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(name, $"{name}@example.test", $"b-{Guid.NewGuid():n}")))
            .EnsureSuccessStatusCode();
        var u = (await PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest($"Bench {entries}", null, null))).Id;

        using (var scope = host.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
            var type = await db.EntityTypes.Where(row => row.UniverseId == u && row.Name == "Character").Select(row => row.Id).SingleAsync();
            var now = DateTime.UtcNow;
            var ids = Enumerable.Range(0, entries).Select(_ => Guid.NewGuid()).ToList();
            db.Entities.AddRange(ids.Select((id, index) => new LoreEntity
            {
                Id = id,
                UniverseId = u,
                EntityTypeId = type,
                Name = $"Entry {index}",
                CanonStatus = index % 2 == 0 ? CanonStatus.Canon : CanonStatus.Draft,
                CreatedAt = now,
                UpdatedAt = now,
            }));
            var kind = new RelationshipType { Id = Guid.NewGuid(), UniverseId = u, Name = "Knows", CreatedAt = now, UpdatedAt = now };
            db.RelationshipTypes.Add(kind);
            var random = new Random(entries);
            db.Relationships.AddRange(Enumerable.Range(0, relationships).Select(index => new LoreRelationship
            {
                Id = Guid.NewGuid(),
                UniverseId = u,
                RelationshipTypeId = kind.Id,
                SourceEntityId = ids[index % entries],
                TargetEntityId = ids[(index % entries + 1 + random.Next(entries - 1)) % entries],
                CanonStatus = CanonStatus.Canon,
                CreatedAt = now,
                UpdatedAt = now,
            }));
            await db.SaveChangesAsync();
        }

        var evaluate = Stopwatch.StartNew();
        (await client.PostAsync($"/api/universes/{u}/canon-conflicts/evaluate", null)).EnsureSuccessStatusCode();
        evaluate.Stop();

        logs.Messages.Clear();
        var save = Stopwatch.StartNew();
        await CreateEntity(client, u, "One more");
        save.Stop();

        var line = $"{entries} entries, {relationships} relationships: evaluate {evaluate.ElapsedMilliseconds} ms; "
            + $"one gated save {save.ElapsedMilliseconds} ms, its sweeps: {string.Join(" | ", logs.Messages)}";
        output.WriteLine(line);
        File.AppendAllLines(Path.Combine(Path.GetTempPath(), "lorex-canon-bench.txt"), [line]);
    }

    private sealed class SweepLogs : ILoggerProvider
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
