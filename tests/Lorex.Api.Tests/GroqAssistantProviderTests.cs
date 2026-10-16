using System.ClientModel.Primitives;
using System.Net;
using Lorex.Api.Features.Assistant;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using static Lorex.Api.Tests.OpenAIAssistantProviderTests;

namespace Lorex.Api.Tests;

/// <summary>
/// The Groq provider against the same stub transport as OpenAI's: Groq's endpoint and model, the same tool loop, and none
/// of the request members Groq's Responses API refuses. Then which provider configuration chooses. No key, no network.
/// </summary>
public sealed class GroqAssistantProviderTests
{
    private const string Model = "openai/gpt-oss-120b";
    private const string Answer = """{"segments":[{"kind":"note","text":"Done.","sources":[]}]}""";

    private static readonly AssistantBrief Brief = new(
        "Standing instructions.",
        [new AssistantMessage(AssistantRole.User, "Who is Arin?")],
        AssistantTools.Definitions,
        UniverseAssistant.AnswerSchema,
        UniverseAssistant.MaxOutputTokens);

    [Fact]
    public async Task Groq_runs_the_same_tool_loop_at_its_own_endpoint_with_its_model_and_without_store_or_include()
    {
        var groq = new StubOpenAI(
            Response(
                """{"type":"reasoning","id":"rs_1","summary":[],"content":[{"type":"reasoning_text","text":"Look the name up."}],"status":"completed"}""",
                """{"type":"function_call","id":"fc_1","call_id":"call_1","name":"search_universe","arguments":"{\"query\":\"Arin\"}","status":"completed"}"""),
            Response(Message(Answer)));
        var conversation = Provider(groq).Begin(Brief);

        var first = await conversation.NextAsync([], toolsAllowed: true, CancellationToken.None);
        Assert.Equal(("call_1", AssistantTools.SearchUniverse), (first.ToolCalls.Single().CallId, first.ToolCalls.Single().Name));

        var second = await conversation.NextAsync(
            [new AssistantToolResult("call_1", """{"results":[]}""")],
            toolsAllowed: false,
            CancellationToken.None);
        Assert.Equal(Answer, second.Answer);

        Assert.Equal(2, groq.Requests.Count);
        Assert.All(groq.Addresses, address => Assert.Equal("https://api.groq.com/openai/v1/responses", address.ToString()));
        Assert.All(groq.Authorizations, authorization => Assert.Equal("Bearer test-only-not-a-key", authorization));

        foreach (var request in groq.Requests)
        {
            Assert.Equal(Model, request.GetProperty("model").GetString());

            // What Groq's Responses API does not accept is left out entirely, not sent empty or false.
            Assert.False(request.TryGetProperty("store", out _));
            Assert.False(request.TryGetProperty("include", out _));
            Assert.False(request.TryGetProperty("previous_response_id", out _));

            // Everything else is the shared exchange: the same strict tools, the same strict answer, bounded output.
            Assert.Equal(AssistantTools.Definitions.Select(tool => tool.Name), request.GetProperty("tools").EnumerateArray().Select(tool => tool.GetProperty("name").GetString()));
            Assert.All(request.GetProperty("tools").EnumerateArray(), tool => Assert.True(tool.GetProperty("strict").GetBoolean()));
            Assert.Equal("json_schema", request.GetProperty("text").GetProperty("format").GetProperty("type").GetString());
            Assert.Equal(UniverseAssistant.MaxOutputTokens, request.GetProperty("max_output_tokens").GetInt32());
        }

        Assert.Equal("auto", groq.Requests[0].GetProperty("tool_choice").GetString());
        Assert.Equal("none", groq.Requests[1].GetProperty("tool_choice").GetString());

        // The second step carries the question, Groq's reasoning, the call and its result, as Groq's own examples do.
        var input = groq.Requests[1].GetProperty("input").EnumerateArray().ToList();
        Assert.Equal(["message", "reasoning", "function_call", "function_call_output"], input.Select(item => item.GetProperty("type").GetString()));
        Assert.Equal("Look the name up.", input[1].GetProperty("content")[0].GetProperty("text").GetString());
        Assert.Equal("call_1", input[3].GetProperty("call_id").GetString());
    }

    [Theory]
    [InlineData(429, """{"error":{"message":"Rate limit reached for model.","type":"tokens","code":"rate_limit_exceeded"}}""", AssistantFailure.Busy)]
    [InlineData(401, """{"error":{"message":"Invalid API Key","type":"invalid_request_error","code":"invalid_api_key"}}""", AssistantFailure.Failed)]
    [InlineData(400, """{"error":{"message":"property 'store' is unsupported","type":"invalid_request_error","code":null}}""", AssistantFailure.Failed)]
    [InlineData(503, """{"error":{"message":"Service unavailable.","type":"internal_server_error","code":null}}""", AssistantFailure.Failed)]
    public async Task A_groq_failure_is_classified_like_any_provider_and_named_as_groqs_in_the_log(int status, string body, AssistantFailure failure)
    {
        var conversation = Provider(new StubOpenAI((HttpStatusCode)status, body)).Begin(Brief);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(() => conversation.NextAsync([], true, CancellationToken.None));

        Assert.Equal(failure, thrown.Failure);
        Assert.Contains("Groq", thrown.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("OpenAI", thrown.Message, StringComparison.Ordinal);
        Assert.NotNull(thrown.InnerException);
    }

    // ---------- Which provider configuration chooses ----------

    [Theory]
    [InlineData("Groq", "test-only-not-a-key", Model, null, null, typeof(GroqAssistantProvider))]
    [InlineData("groq", "test-only-not-a-key", Model, null, null, typeof(GroqAssistantProvider))]
    [InlineData("Groq", null, Model, null, null, typeof(UnavailableAssistantProvider))]
    [InlineData("Groq", "test-only-not-a-key", null, null, null, typeof(UnavailableAssistantProvider))]
    [InlineData("Groq", "  ", Model, null, null, typeof(UnavailableAssistantProvider))]
    [InlineData("Groq", null, null, "test-only-not-a-key", "test-model", typeof(UnavailableAssistantProvider))]
    [InlineData("OpenAI", "test-only-not-a-key", Model, "test-only-not-a-key", "test-model", typeof(OpenAIAssistantProvider))]
    [InlineData("OpenAI", "test-only-not-a-key", Model, null, null, typeof(UnavailableAssistantProvider))]
    [InlineData("Fake", null, null, null, null, typeof(FakeAssistantProvider))]
    [InlineData(null, "test-only-not-a-key", Model, "test-only-not-a-key", "test-model", typeof(UnavailableAssistantProvider))]
    [InlineData("Grok", "test-only-not-a-key", Model, null, null, typeof(UnavailableAssistantProvider))]
    public void Configuration_chooses_the_provider_and_never_falls_back_to_fake(
        string? provider,
        string? groqKey,
        string? groqModel,
        string? openAiKey,
        string? openAiModel,
        Type expected)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Assistant:Provider"] = provider,
                ["Assistant:Groq:ApiKey"] = groqKey,
                ["Assistant:Groq:Model"] = groqModel,
                ["Assistant:OpenAI:ApiKey"] = openAiKey,
                ["Assistant:OpenAI:Model"] = openAiModel,
            })
            .Build();

        using var services = new ServiceCollection().AddLorexAssistant(configuration).BuildServiceProvider();
        var chosen = services.GetRequiredService<IAssistantProvider>();

        Assert.IsType(expected, chosen);
        Assert.Equal(expected != typeof(UnavailableAssistantProvider), chosen.IsConfigured);
    }

    private static GroqAssistantProvider Provider(StubOpenAI groq) =>
        new(GroqAssistantProvider.CreateClient("test-only-not-a-key", new HttpClientPipelineTransport(new HttpClient(groq))), Model);
}
