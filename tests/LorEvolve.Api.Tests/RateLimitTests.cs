using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Hosting;
using Xunit;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The per-address ceilings (issue #33, M-2). The test server has no connection address, so the host is told to believe
/// X-Forwarded-For, exactly as it is behind App Service; a request without the header is never limited.
/// </summary>
public sealed class RateLimitTests : IAsyncLifetime, IDisposable
{
    private readonly LorEvolveApiFactory _factory = new()
    {
        Settings = new Dictionary<string, string?>
        {
            [ProxyHeaders.EnabledKey] = "true",
            ["RateLimits:AuthPerMinute"] = "3",
            ["RateLimits:PublicPerMinute"] = "2",
        },
    };

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync() => await _factory.DisposeAsync();

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task Sign_in_attempts_from_one_address_stop_at_the_ceiling_and_another_address_is_untouched()
    {
        using var client = _factory.CreateClient();

        for (var attempt = 0; attempt < 3; attempt++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client, "203.0.113.5")).StatusCode);
        }

        var refused = await Login(client, "203.0.113.5");
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.True(refused.Headers.RetryAfter is { Delta: { } wait } && wait > TimeSpan.Zero);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client, "198.51.100.9")).StatusCode);
    }

    [Fact]
    public async Task Only_the_rightmost_forwarded_address_counts()
    {
        using var client = _factory.CreateClient();

        // A caller may write anything before the hop the front end appends; the ceiling follows the hop.
        for (var attempt = 0; attempt < 3; attempt++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client, $"10.0.0.{attempt}, 203.0.113.7")).StatusCode);
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login(client, "10.9.9.9, 203.0.113.7")).StatusCode);
    }

    [Fact]
    public async Task The_public_portal_has_its_own_ceiling()
    {
        using var client = _factory.CreateClient();

        for (var attempt = 0; attempt < 2; attempt++)
        {
            Assert.Equal(HttpStatusCode.OK, (await Get(client, "/api/public/universes", "203.0.113.8")).StatusCode);
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, (await Get(client, "/api/public/universes", "203.0.113.8")).StatusCode);

        // Sign-in is a different bucket for the same address.
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client, "203.0.113.8")).StatusCode);
    }

    [Fact]
    public async Task A_request_without_an_address_is_not_limited()
    {
        using var client = _factory.CreateClient();

        for (var attempt = 0; attempt < 5; attempt++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client, forwardedFor: null)).StatusCode);
        }
    }

    private static Task<HttpResponseMessage> Login(HttpClient client, string? forwardedFor)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new LoginRequest("nobody-here", "Not-the-password-9!")),
        };
        if (forwardedFor is not null)
        {
            request.Headers.Add("X-Forwarded-For", forwardedFor);
        }

        return client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> Get(HttpClient client, string path, string forwardedFor)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add("X-Forwarded-For", forwardedFor);
        return client.SendAsync(request);
    }
}
