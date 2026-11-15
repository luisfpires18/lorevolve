using System.Net;
using System.Net.Http.Json;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The web assistant's three routes are gone (M4, issue #158), and nothing answers in their place. A signed-in owner of
/// a real universe asks, so a 404 here is the route's absence and not a refusal of the person or the universe: the
/// routes beside them, the ones MCP and the review need, still answer for the same person in the same request.
/// </summary>
public sealed class RetiredAssistantRoutesTests
{
    [Fact]
    public async Task The_assistant_routes_are_not_there_and_their_neighbours_still_are()
    {
        using var factory = new LorEvolveApiFactory();
        var (browser, _) = await McpTestClient.NewBrowser(factory, "retiredassistant");
        var universe = await PlotTestClient.CreateUniverse(browser, "A world without an assistant");

        foreach (var (method, path) in new (HttpMethod Method, string Path)[]
        {
            (HttpMethod.Get, $"/api/universes/{universe.Id}/assistant"),
            (HttpMethod.Post, $"/api/universes/{universe.Id}/assistant"),
            (HttpMethod.Get, "/api/profile/assistant-usage"),
        })
        {
            var request = new HttpRequestMessage(method, path);
            if (method == HttpMethod.Post)
            {
                request.Content = JsonContent.Create(new { question = "Who is anyone?", history = Array.Empty<object>() });
            }

            var response = await browser.SendAsync(request);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        // The same person, the same universe: what AI still reaches is untouched.
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync($"/api/universes/{universe.Id}/mcp")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync($"/api/ai-changes?universeId={universe.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/profile/storage")).StatusCode);
    }
}
