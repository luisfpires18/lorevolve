using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Universes;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The home page's four numbers (031): accounts, universes, published worlds, private worlds - exact, anonymous, the
/// same signed in or out, and nothing in the response but the four counts. Each test boots its own host, so its
/// database holds exactly what the test put there.
/// </summary>
public sealed class PublicStatsTests
{
    private const string Route = "/api/public/stats";

    private static async Task<PublicStats> Stats(HttpClient client)
    {
        var response = await client.GetAsync(Route);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PublicStats>())!;
    }

    [Fact]
    public async Task An_empty_LorEvolve_counts_nothing()
    {
        using var site = new LorEvolveApiFactory();
        Assert.Equal(new PublicStats(0, 0, 0, 0), await Stats(Anonymous(site)));
    }

    [Fact]
    public async Task Accounts_universes_and_worlds_are_counted_exactly_archived_included_members_once()
    {
        using var site = new LorEvolveApiFactory();
        var (ada, _) = await Account(site, "stats-ada");
        var (bram, _) = await Account(site, "stats-bram");
        var (cleo, cleoId) = await Account(site, "stats-cleo");

        var shore = await Ready(ada, "Stats Shore", author: "Ada Quill");
        await Published(ada, shore.Id);
        await CreateUniverse(ada, "Stats Notes");
        var archived = await CreateUniverse(bram, "Stats Attic");
        (await bram.PostAsync($"/api/universes/{archived.Id}/archive", null)).EnsureSuccessStatusCode();
        var marsh = await Ready(bram, "Stats Marsh", author: "Bram Hollis");
        await Published(bram, marsh.Id);

        // Cleo belongs to two universes and owns none: still one creator, and no universe counted twice.
        await CollaborationTestClient.Join(site, shore.Id, cleoId, UniverseRole.Editor);
        await CollaborationTestClient.Join(site, archived.Id, cleoId, UniverseRole.Viewer);

        Assert.Equal(new PublicStats(3, 4, 2, 2), await Stats(Anonymous(site)));
        Assert.Equal(new PublicStats(3, 4, 2, 2), await Stats(cleo));
    }

    [Fact]
    public async Task Publishing_a_universe_moves_one_world_from_private_to_published_and_unpublishing_moves_it_back()
    {
        using var site = new LorEvolveApiFactory();
        var (owner, _) = await Account(site, "stats-owner");
        var universe = await Ready(owner, "Stats Tide");

        // An entry published inside a still-private universe changes nothing (ADR 0036).
        var entry = await owner.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new { entityTypeId = await FirstTypeId(owner, universe.Id), name = "Lighthouse", summary = (string?)null, canonStatus = 2, aliases = Array.Empty<string>(), tags = Array.Empty<string>(), fields = Array.Empty<object>() });
        entry.EnsureSuccessStatusCode();
        var entryId = (await entry.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        (await owner.PostAsync($"/api/universes/{universe.Id}/entities/{entryId}/publish", null)).EnsureSuccessStatusCode();
        Assert.Equal(new PublicStats(1, 1, 0, 1), await Stats(Anonymous(site)));

        await Published(owner, universe.Id);
        Assert.Equal(new PublicStats(1, 1, 1, 0), await Stats(Anonymous(site)));

        (await Unpublish(owner, universe.Id)).EnsureSuccessStatusCode();
        Assert.Equal(new PublicStats(1, 1, 0, 1), await Stats(Anonymous(site)));
    }

    [Fact]
    public async Task The_response_is_four_counts_the_same_for_everyone_and_never_cached_stale()
    {
        using var site = new LorEvolveApiFactory();
        var (owner, _) = await Account(site, "stats-private");
        await CreateUniverse(owner, "Secret Stats Harbour", "Only mine.");

        var anonymous = await Anonymous(site).GetAsync(Route);
        var signedIn = await owner.GetAsync(Route);
        var body = await anonymous.Content.ReadAsStringAsync();
        Assert.Equal(body, await signedIn.Content.ReadAsStringAsync());
        Assert.Equal("no-cache", anonymous.Headers.CacheControl?.ToString());

        using var json = JsonDocument.Parse(body);
        Assert.Equal(
            ["creators", "privateWorlds", "publishedWorlds", "universes"],
            json.RootElement.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal));
        foreach (var leak in new[] { "Secret", "Harbour", "stats-private", "example.test", "@" })
        {
            Assert.DoesNotContain(leak, body, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static async Task<Guid> FirstTypeId(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))![0].Id;
}
