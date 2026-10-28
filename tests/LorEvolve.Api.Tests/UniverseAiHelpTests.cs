using System.Net.Http.Json;
using LorEvolve.Api.Features.Universes;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>AI help is on by default, can be turned off at creation, and is turned on and off from Settings.</summary>
public sealed class UniverseAiHelpTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    [Fact]
    public async Task Ai_help_defaults_on_is_set_at_creation_and_toggled_by_an_update()
    {
        var (owner, _) = await Account(factory, "ai-help");

        var plain = await Read(await owner.PostAsJsonAsync("/api/universes", new CreateUniverseRequest("Ai help on", null, null)));
        Assert.True(plain.AiHelp);

        var off = await Read(await owner.PostAsJsonAsync("/api/universes", new CreateUniverseRequest("Ai help off", null, null, AiHelp: false)));
        Assert.False(off.AiHelp);
        Assert.False((await owner.GetFromJsonAsync<UniverseDetail>($"/api/universes/{off.Id}"))!.AiHelp);

        // An update that does not say keeps it; one that does changes it.
        Assert.False((await Read(await owner.PutAsJsonAsync($"/api/universes/{off.Id}", new UpdateUniverseRequest("Ai help off", null, null)))).AiHelp);
        Assert.True((await Read(await owner.PutAsJsonAsync($"/api/universes/{off.Id}", new UpdateUniverseRequest("Ai help off", null, null, AiHelp: true)))).AiHelp);
        Assert.True((await owner.GetFromJsonAsync<UniverseDetail>($"/api/universes/{off.Id}"))!.AiHelp);
        Assert.False((await Read(await owner.PutAsJsonAsync($"/api/universes/{off.Id}", new UpdateUniverseRequest("Ai help off", null, null, AiHelp: false)))).AiHelp);
    }

    private static async Task<UniverseDetail> Read(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }
}
