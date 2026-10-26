using System.Net;
using Lorex.Api.Hosting;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Issue #33, M-4: every answer - a success, a refusal, a miss and an unhandled failure, whose handler clears the response
/// first - says nosniff, refuses framing, keeps its address out of other sites' Referer, and allows no plugins or base
/// re-pointing.
/// </summary>
public sealed class SecurityHeadersTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task Successes_refusals_and_misses_carry_the_security_headers()
    {
        using var anonymous = _factory.CreateClient();

        AssertHeaders(await anonymous.GetAsync("/api/health"), HttpStatusCode.OK);
        AssertHeaders(await anonymous.GetAsync("/api/universes"), HttpStatusCode.Unauthorized);
        AssertHeaders(await anonymous.GetAsync($"/api/invitations/claim/{Guid.NewGuid():N}"), HttpStatusCode.Unauthorized);

        var client = await SignedIn(_factory, "headers");
        AssertHeaders(await client.GetAsync($"/api/universes/{Guid.NewGuid()}"), HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task An_unhandled_failure_still_carries_the_security_headers()
    {
        var client = await SignedIn(_factory, "headers500");
        var u = (await CreateUniverse(client, "Headers")).Id.ToString();

        _factory.Commands.FailWhen = command => command.CommandText.Contains("FROM \"Stories\"", StringComparison.Ordinal)
            && command.Parameters.Cast<System.Data.Common.DbParameter>().Any(parameter =>
                string.Equals(parameter.Value?.ToString(), u, StringComparison.OrdinalIgnoreCase));
        try
        {
            AssertHeaders(await client.GetAsync($"/api/universes/{u}/stories"), HttpStatusCode.InternalServerError);
        }
        finally
        {
            _factory.Commands.FailWhen = null;
        }
    }

    private static void AssertHeaders(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal("nosniff", Single(response, "X-Content-Type-Options"));
        Assert.Equal("DENY", Single(response, "X-Frame-Options"));
        Assert.Equal(SecurityHeaders.ContentSecurityPolicy, Single(response, "Content-Security-Policy"));
        Assert.Equal("same-origin", Single(response, "Referrer-Policy"));
    }

    private static string Single(HttpResponseMessage response, string name) =>
        Assert.Single(response.Headers.TryGetValues(name, out var values) ? values : []);
}
