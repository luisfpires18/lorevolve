using System.Net.Http.Headers;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Performance audit 2026-10-29, P01: text answers are compressed when the client asks, never when it does not, and never
/// on the token-bearing <c>/oauth</c> paths (the BREACH reasoning is in <c>Hosting/ResponseCompression.cs</c>).
/// </summary>
public sealed class ResponseCompressionTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_client_that_accepts_brotli_gets_it_and_a_vary_header()
    {
        using var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/public/stats");
        request.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue("br"));

        var response = await client.SendAsync(request);

        response.EnsureSuccessStatusCode();
        Assert.Equal(["br"], response.Content.Headers.ContentEncoding);
        Assert.Contains("Accept-Encoding", response.Headers.Vary);
    }

    [Fact]
    public async Task A_client_that_does_not_ask_gets_the_body_as_it_is()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/public/stats");

        response.EnsureSuccessStatusCode();
        Assert.Empty(response.Content.Headers.ContentEncoding);
    }

    [Fact]
    public async Task The_token_endpoint_is_never_compressed()
    {
        using var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/oauth/token")
        {
            Content = new FormUrlEncodedContent([new("grant_type", "authorization_code")]),
        };
        request.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue("br"));

        var response = await client.SendAsync(request);

        Assert.Empty(response.Content.Headers.ContentEncoding);
    }
}
