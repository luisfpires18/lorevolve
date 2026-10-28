using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>A universe asked to start empty has no lore types or groups; one that does not say gets the starter set.</summary>
public sealed class UniverseStarterTypesTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    [Fact]
    public async Task A_universe_starts_empty_when_asked_and_with_the_starter_set_otherwise()
    {
        var (owner, _) = await Account(factory, "starter-types");

        var empty = await Create(owner, new CreateUniverseRequest("Empty world", null, null, StarterTypes: false));
        Assert.Empty(await Types(owner, empty));
        Assert.Empty((await owner.GetFromJsonAsync<List<object>>($"/api/universes/{empty}/entity-type-groups"))!);

        var seeded = await Create(owner, new CreateUniverseRequest("Seeded world", null, null));
        Assert.Equal(EntityTypeDefaults.Defaults.Count, (await Types(owner, seeded)).Count);
    }

    private static async Task<Guid> Create(HttpClient client, CreateUniverseRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/universes", request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!.Id;
    }

    private static async Task<List<EntityTypeResponse>> Types(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
}
