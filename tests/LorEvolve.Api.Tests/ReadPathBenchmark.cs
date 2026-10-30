using System.Diagnostics;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit.Abstractions;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A measurement, not a check (performance audit 2026-10-29): how long the common reads take, and how many queries each
/// runs, in a universe of 2,000 entries. It does nothing unless <c>LOREVOLVE_BENCH=1</c>, so the suite never pays for it.
/// Rows go in through the DbContext like <see cref="CanonSweepBenchmark"/>, which bypasses the C# search reindex, so the
/// search index backfill is timed right after the seed: the cost a start pays for 2,000 unindexed rows.
/// </summary>
public sealed class ReadPathBenchmark(LorEvolveApiFactory factory, ITestOutputHelper output) : IClassFixture<LorEvolveApiFactory>
{
    private const int Entries = 2_000;
    private const int Relationships = 5_000;
    private const int Moments = 1_000;
    private const int Scenes = 200;
    private const int Runs = 20;
    private const int FieldsPerType = 6;

    [Fact]
    public async Task The_common_reads_take()
    {
        if (Environment.GetEnvironmentVariable("LOREVOLVE_BENCH") != "1")
        {
            return;
        }

        var client = factory.CreateClient();
        const string name = "bench-reads";
        var email = $"{name}-{Guid.NewGuid():n}@example.test";
        (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(name, email, $"b-{Guid.NewGuid():n}")))
            .EnsureSuccessStatusCode();
        var u = (await PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest("Bench reads", null, null))).Id;

        Guid type;
        string userId;
        var ids = Enumerable.Range(0, Entries).Select(_ => Guid.NewGuid()).ToList();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
            userId = await db.Users.Where(row => row.Email == email).Select(row => row.Id).SingleAsync();
            type = await db.EntityTypes.Where(row => row.UniverseId == u && row.Name == "Character").Select(row => row.Id).SingleAsync();
            var now = DateTime.UtcNow;
            db.Entities.AddRange(ids.Select((id, index) => new LoreEntity
            {
                Id = id,
                UniverseId = u,
                EntityTypeId = type,
                Name = $"Entry {index}",
                Summary = $"Summary of entry {index}, a person of the northern reach.",
                CanonStatus = index % 2 == 0 ? CanonStatus.Canon : CanonStatus.Draft,
                CreatedAt = now,
                UpdatedAt = now,
            }));
            // Fields on every type, and a value in each Character field for every entry, so the types read carries the
            // per-field counts a real universe asks of it (workspace load chain, 2026-10-30).
            var typeIds = await db.EntityTypes.Where(row => row.UniverseId == u).Select(row => row.Id).ToListAsync();
            var fields = typeIds.SelectMany(typeId => Enumerable.Range(0, FieldsPerType).Select(index => new EntityFieldDefinition
            {
                Id = Guid.NewGuid(),
                EntityTypeId = typeId,
                Name = $"Bench field {index}",
                Kind = EntityFieldKind.ShortText,
                DisplayOrder = 100 + index,
            })).ToList();
            db.EntityFieldDefinitions.AddRange(fields);
            db.EntityFieldValues.AddRange(fields.Where(field => field.EntityTypeId == type).SelectMany(field => ids.Select(id => new EntityFieldValue
            {
                Id = Guid.NewGuid(),
                EntityId = id,
                FieldDefinitionId = field.Id,
                TextValue = "A value",
            })));
            var kind = new RelationshipType { Id = Guid.NewGuid(), UniverseId = u, Name = "Knows", CreatedAt = now, UpdatedAt = now };
            db.RelationshipTypes.Add(kind);
            var random = new Random(Entries);
            db.Relationships.AddRange(Enumerable.Range(0, Relationships).Select(index => new LoreRelationship
            {
                Id = Guid.NewGuid(),
                UniverseId = u,
                RelationshipTypeId = kind.Id,
                SourceEntityId = ids[index % Entries],
                TargetEntityId = ids[(index % Entries + 1 + random.Next(Entries - 1)) % Entries],
                CanonStatus = CanonStatus.Canon,
                CreatedAt = now,
                UpdatedAt = now,
            }));
            db.TimelineEntries.AddRange(Enumerable.Range(0, Moments).Select(index => new TimelineEntry
            {
                Id = Guid.NewGuid(),
                UniverseId = u,
                Title = $"Moment {index}",
                CanonStatus = CanonStatus.Canon,
                DateKind = TimelineDateKind.Exact,
                StartYear = 100 + index,
                CreatedAt = now,
                UpdatedAt = now,
            }));
            var story = new Story { Id = Guid.NewGuid(), UniverseId = u, Title = "Bench story", CreatedAt = now, UpdatedAt = now };
            db.Stories.Add(story);
            db.Scenes.AddRange(Enumerable.Range(0, Scenes).Select(index => new Scene
            {
                Id = Guid.NewGuid(),
                StoryId = story.Id,
                Title = $"Scene {index}",
                SortOrder = index,
                Year = 150 + index,
                CreatedAt = now,
                UpdatedAt = now,
            }));
            await db.SaveChangesAsync();
        }

        var backfill = Stopwatch.StartNew();
        int indexed;
        using (var scope = factory.Services.CreateScope())
        {
            indexed = await EntitySearchIndex.BackfillAsync(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>(), CancellationToken.None);
        }

        backfill.Stop();
        var lines = new List<string>
        {
            $"{Entries} entries, {Relationships} relationships, {Moments} moments, {Scenes} scenes: "
                + $"search backfill {backfill.ElapsedMilliseconds} ms for {indexed} rows",
        };

        var entity = ids[Entries / 2];
        var universe = $"/api/universes/{u}";
        (string Name, string Url, string[] Keys)[] reads =
        [
            ("auth me", "/api/auth/me", [userId]),
            ("universe detail", universe, [u.ToString()]),
            ("chronology", $"{universe}/chronology", [u.ToString()]),
            ("entity types", $"{universe}/entity-types", [u.ToString()]),
            ("entities browse", $"{universe}/entities?entityTypeId={type}&pageSize=24", [u.ToString()]),
            ("entities text search", $"{universe}/entities?search=northern&pageSize=24", [u.ToString()]),
            ("entities exact search", $"{universe}/entities?search=Entry%201000&exact=true&pageSize=24", [u.ToString()]),
            ("entity detail", $"{universe}/entities/{entity}", [u.ToString(), entity.ToString()]),
            ("timeline items", $"{universe}/timeline/items", [u.ToString()]),
            ("universe search", $"{universe}/search?q=Entry%2010", [u.ToString()]),
        ];

        foreach (var (label, url, keys) in reads)
        {
            (await client.GetAsync(url)).EnsureSuccessStatusCode();
            var times = new List<double>(Runs);
            int queries;
            using (var counter = new CommandCounter(keys))
            {
                for (var run = 0; run < Runs; run++)
                {
                    var watch = Stopwatch.StartNew();
                    (await client.GetAsync(url)).EnsureSuccessStatusCode();
                    watch.Stop();
                    times.Add(watch.Elapsed.TotalMilliseconds);
                }

                queries = counter.Count / Runs;
            }

            times.Sort();
            lines.Add($"{label}: median {times[Runs / 2]:F1} ms, p95 {times[(int)Math.Ceiling(Runs * 0.95) - 1]:F1} ms, {queries} queries");
        }

        foreach (var line in lines)
        {
            output.WriteLine(line);
        }

        File.AppendAllLines(Path.Combine(Path.GetTempPath(), "lorevolve-perf-bench.txt"), lines);
    }
}
