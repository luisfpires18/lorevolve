using System.Net.Http.Headers;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Localization;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Http;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// What the API writes, it writes in the reader's language (ADR 0071, #109): the language comes from
/// `Accept-Language`, which the web app sets from the switch, and English is what anything else gets.
///
/// A universe is seeded once, from the creating request, and never translated afterwards: that is the part worth
/// pinning, because an author who later reads LorEvolve in another language must still find the types they named.
/// </summary>
public sealed class RequestLanguageTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    [Theory]
    [InlineData(null, RequestLanguage.English)]
    [InlineData("", RequestLanguage.English)]
    [InlineData("en", RequestLanguage.English)]
    [InlineData("en-GB", RequestLanguage.English)]
    [InlineData("pt-PT", RequestLanguage.Portuguese)]
    [InlineData("pt", RequestLanguage.Portuguese)]
    [InlineData("pt-BR", RequestLanguage.Portuguese)]
    [InlineData("de-DE", RequestLanguage.English)]
    [InlineData("*", RequestLanguage.English)]
    [InlineData("de-DE, pt-PT;q=0.8", RequestLanguage.Portuguese)]
    [InlineData("pt-PT, en;q=0.9", RequestLanguage.Portuguese)]
    // A tag that merely starts with the same letters is a different language, not a dialect of this one.
    [InlineData("ptx", RequestLanguage.English)]
    [InlineData("pt_PT", RequestLanguage.English)]
    [InlineData("entish", RequestLanguage.English)]
    [InlineData("ptx, pt-PT", RequestLanguage.Portuguese)]
    [InlineData("PT-pt", RequestLanguage.Portuguese)]
    [InlineData("EN-GB", RequestLanguage.English)]
    public void The_language_is_the_first_tag_LorEvolve_has_words_for(string? header, string expected)
    {
        var request = new DefaultHttpContext().Request;
        if (header is not null)
        {
            request.Headers.AcceptLanguage = header;
        }

        Assert.Equal(expected, RequestLanguage.Of(request));
    }

    [Fact]
    public async Task A_universe_created_in_Portuguese_is_seeded_in_Portuguese()
    {
        var (owner, _) = await Account(factory, "language-starter");
        owner.DefaultRequestHeaders.AcceptLanguage.Add(new StringWithQualityHeaderValue("pt-PT"));

        var id = await Create(owner, new CreateUniverseRequest("Mundo em português", null, null));
        var types = await Types(owner, id);

        Assert.Equal(EntityTypeDefaults.Defaults.Count, types.Count);
        Assert.Contains(types, type => type.Name == "Personagem");
        Assert.DoesNotContain(types, type => type.Name == "Character");

        var groups = (await owner.GetFromJsonAsync<List<GroupName>>($"/api/universes/{id}/entity-type-groups"))!;
        Assert.Contains(groups, group => group.Name == "Personagens");

        // Reading the same universe in English later shows what was written, not a translation of it.
        owner.DefaultRequestHeaders.AcceptLanguage.Clear();
        owner.DefaultRequestHeaders.AcceptLanguage.Add(new StringWithQualityHeaderValue("en"));
        Assert.Contains(await Types(owner, id), type => type.Name == "Personagem");
    }

    [Fact]
    public async Task A_universe_created_without_a_language_is_seeded_in_English()
    {
        var (owner, _) = await Account(factory, "language-default");

        var id = await Create(owner, new CreateUniverseRequest("A world", null, null));

        Assert.Contains(await Types(owner, id), type => type.Name == "Character");
    }

    private static async Task<Guid> Create(HttpClient client, CreateUniverseRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/universes", request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!.Id;
    }

    private static async Task<List<EntityTypeResponse>> Types(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;

    private sealed record GroupName(string Name);
}
