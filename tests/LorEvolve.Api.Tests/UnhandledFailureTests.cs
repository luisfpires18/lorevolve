using System.Net;
using System.Text.Json;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// What a request that fails for no reason the author could act on answers outside Development (issue 55, W2): RFC 7807
/// with the request's trace id, so a tester's report can be matched to the server's log - and nothing about what failed.
/// </summary>
public sealed class UnhandledFailureTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task An_unhandled_failure_answers_a_problem_with_a_trace_id_and_no_detail()
    {
        var client = await SignedIn(_factory, "unhandled");
        var u = (await CreateUniverse(client, "Unhandled")).Id.ToString();

        // Every read of this universe's stories fails deep in the database layer, as a locked file would.
        _factory.Commands.FailWhen = command => command.CommandText.Contains("FROM \"Stories\"", StringComparison.Ordinal)
            && command.Parameters.Cast<System.Data.Common.DbParameter>().Any(parameter =>
                string.Equals(parameter.Value?.ToString(), u, StringComparison.OrdinalIgnoreCase));
        HttpResponseMessage response;
        try
        {
            response = await client.GetAsync($"/api/universes/{u}/stories");
        }
        finally
        {
            _factory.Commands.FailWhen = null;
        }

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var raw = await response.Content.ReadAsStringAsync();
        using var body = JsonDocument.Parse(raw);
        Assert.Equal(500, body.RootElement.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrWhiteSpace(body.RootElement.GetProperty("traceId").GetString()));

        // The failure itself stays on the server.
        Assert.DoesNotContain("on purpose", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("Stories", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("InvalidOperationException", raw, StringComparison.Ordinal);
    }
}
