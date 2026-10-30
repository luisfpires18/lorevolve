using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Universes;
using LorEvolve.Api.Hosting;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// N-1: a write to <c>/api</c> a browser says came from another origin - a sibling subdomain is same-site, so the Strict
/// cookie rides along - is refused before it reaches the route. Reads, same-origin writes and clients that send neither
/// header (scripts, these tests) are untouched.
/// </summary>
public sealed class SameOriginWritesTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Theory]
    [InlineData("Sec-Fetch-Site", "same-site")]
    [InlineData("Sec-Fetch-Site", "cross-site")]
    [InlineData("Origin", "https://demo.lorevolve.example")]
    [InlineData("Origin", "null")]
    public async Task A_body_less_write_from_another_origin_is_refused(string header, string value)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, $"foreign-{header}-{value}".Replace(':', '-').Replace('/', '-'));

        var refused = await Send(client, HttpMethod.Post, $"/api/universes/{universe.Id}/archive", header, value);

        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        using var body = JsonDocument.Parse(await refused.Content.ReadAsStringAsync());
        Assert.Equal(SameOriginWrites.RefusedCode, body.RootElement.GetProperty("code").GetString());
        Assert.False((await client.GetFromJsonAsync<UniverseDetail>($"/api/universes/{universe.Id}"))!.IsArchived);
    }

    [Theory]
    [InlineData("Sec-Fetch-Site", "same-origin")]
    [InlineData("Sec-Fetch-Site", "none")]
    [InlineData("Origin", "http://localhost")]
    [InlineData(null, null)]
    public async Task A_write_from_this_origin_or_without_browser_headers_passes(string? header, string? value)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, $"own-{header}-{value}".Replace(':', '-').Replace('/', '-'));

        var archived = await Send(client, HttpMethod.Post, $"/api/universes/{universe.Id}/archive", header, value);

        Assert.True(archived.IsSuccessStatusCode, $"{(int)archived.StatusCode}");
    }

    [Fact]
    public async Task A_read_from_another_origin_is_left_to_the_route()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "foreign-read");

        var read = await Send(client, HttpMethod.Get, $"/api/universes/{universe.Id}", "Sec-Fetch-Site", "cross-site");

        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string? header, string? value)
    {
        var request = new HttpRequestMessage(method, path);
        if (header is not null)
        {
            request.Headers.TryAddWithoutValidation(header, value);
        }

        return client.SendAsync(request);
    }
}
