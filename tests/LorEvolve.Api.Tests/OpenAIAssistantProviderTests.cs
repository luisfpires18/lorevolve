using System.ClientModel;
using System.ClientModel.Primitives;
using System.Net;
using System.Text;
using System.Text.Json;
using LorEvolve.Api.Features.Assistant;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The OpenAI provider against a stub transport: the official library's own request and response serialization, with no
/// network and no key (ADR 0045). What it must send - <c>store: false</c>, encrypted reasoning asked for, strict tool and
/// answer schemas - what it must carry from one step to the next, and how each failure is classified.
/// </summary>
public sealed class OpenAIAssistantProviderTests
{
    private const string Answer = """{"segments":[{"kind":"note","text":"Done.","sources":[]}]}""";

    private static readonly AssistantBrief Brief = new(
        "Standing instructions.",
        [new AssistantMessage(AssistantRole.User, "Who is Arin?")],
        AssistantTools.Definitions,
        UniverseAssistant.AnswerSchema,
        UniverseAssistant.MaxOutputTokens);

    [Fact]
    public async Task Reasoning_is_asked_for_encrypted_and_carried_to_the_next_step_with_nothing_stored()
    {
        var openAi = new StubOpenAI(
            Response(
                """{"type":"reasoning","id":"rs_1","summary":[],"encrypted_content":"ENCRYPTED-ONE"}""",
                """{"type":"function_call","id":"fc_1","call_id":"call_1","name":"search_universe","arguments":"{\"query\":\"Arin\"}","status":"completed"}"""),
            Response(
                """{"type":"reasoning","id":"rs_2","summary":[],"encrypted_content":"ENCRYPTED-TWO"}""",
                Message(Answer)));
        var conversation = Provider(openAi).Begin(Brief);

        var first = await conversation.NextAsync([], toolsAllowed: true, CancellationToken.None);
        var call = Assert.Single(first.ToolCalls);
        Assert.Equal(("call_1", AssistantTools.SearchUniverse, """{"query":"Arin"}"""), (call.CallId, call.Name, call.Arguments));
        Assert.Null(first.Answer);
        Assert.Equal((11, 7), (first.InputTokens, first.OutputTokens));

        var second = await conversation.NextAsync(
            [new AssistantToolResult("call_1", """{"results":[]}""")],
            toolsAllowed: false,
            CancellationToken.None);
        Assert.Empty(second.ToolCalls);
        Assert.Equal(Answer, second.Answer);

        // Every request: OpenAI's own endpoint, nothing stored, the reasoning asked for encrypted, strict tools and a strict
        // answer, bounded output.
        Assert.Equal(2, openAi.Requests.Count);
        Assert.All(openAi.Addresses, address => Assert.Equal("https://api.openai.com/v1/responses", address.ToString()));
        foreach (var request in openAi.Requests)
        {
            Assert.False(request.GetProperty("store").GetBoolean());
            Assert.Contains("reasoning.encrypted_content", request.GetProperty("include").EnumerateArray().Select(item => item.GetString()));
            Assert.Equal(UniverseAssistant.MaxOutputTokens, request.GetProperty("max_output_tokens").GetInt32());
            Assert.Equal("Standing instructions.", request.GetProperty("instructions").GetString());
            Assert.False(request.TryGetProperty("previous_response_id", out _));

            var tools = request.GetProperty("tools").EnumerateArray().ToList();
            Assert.Equal(AssistantTools.Definitions.Select(tool => tool.Name), tools.Select(tool => tool.GetProperty("name").GetString()));
            Assert.All(tools, tool => Assert.True(tool.GetProperty("strict").GetBoolean()));
            Assert.All(tools, tool => Assert.Equal("function", tool.GetProperty("type").GetString()));
            Assert.True(request.GetProperty("parallel_tool_calls").GetBoolean());

            var format = request.GetProperty("text").GetProperty("format");
            Assert.Equal("json_schema", format.GetProperty("type").GetString());
            Assert.True(format.GetProperty("strict").GetBoolean());
        }

        Assert.Equal("auto", openAi.Requests[0].GetProperty("tool_choice").GetString());
        Assert.Equal("none", openAi.Requests[1].GetProperty("tool_choice").GetString());

        // The second step carries the question, the encrypted reasoning, the call it led to and its result - in that order.
        var input = openAi.Requests[1].GetProperty("input").EnumerateArray().ToList();
        Assert.Equal(["message", "reasoning", "function_call", "function_call_output"], input.Select(item => item.GetProperty("type").GetString()));
        Assert.Equal("ENCRYPTED-ONE", input[1].GetProperty("encrypted_content").GetString());
        Assert.Equal("call_1", input[2].GetProperty("call_id").GetString());
        Assert.Equal("call_1", input[3].GetProperty("call_id").GetString());
        Assert.Equal("""{"results":[]}""", input[3].GetProperty("output").GetString());

        // The reasoning never leaves the provider.
        Assert.DoesNotContain("ENCRYPTED", JsonSerializer.Serialize(new[] { first, second }), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_model_that_does_not_reason_is_served_by_the_same_requests()
    {
        var openAi = new StubOpenAI(
            Response("""{"type":"function_call","id":"fc_1","call_id":"call_1","name":"get_lore","arguments":"{\"id\":\"x\",\"find\":null}","status":"completed"}"""),
            Response(Message(Answer)));
        var conversation = Provider(openAi).Begin(Brief);

        Assert.Single((await conversation.NextAsync([], true, CancellationToken.None)).ToolCalls);
        Assert.Equal(Answer, (await conversation.NextAsync([new AssistantToolResult("call_1", "{}")], true, CancellationToken.None)).Answer);

        var input = openAi.Requests[1].GetProperty("input").EnumerateArray().Select(item => item.GetProperty("type").GetString());
        Assert.Equal(["message", "function_call", "function_call_output"], input);
    }

    [Theory]
    [InlineData(429, """{"error":{"message":"Rate limit reached.","type":"requests","code":"rate_limit_exceeded"}}""", AssistantFailure.Busy)]
    [InlineData(429, """{"error":{"message":"You exceeded your current quota.","type":"insufficient_quota","code":"insufficient_quota"}}""", AssistantFailure.Failed)]
    [InlineData(401, """{"error":{"message":"Incorrect API key provided.","type":"invalid_request_error","code":"invalid_api_key"}}""", AssistantFailure.Failed)]
    [InlineData(400, """{"error":{"message":"Invalid schema.","type":"invalid_request_error","code":null}}""", AssistantFailure.Failed)]
    [InlineData(500, """{"error":{"message":"Server error.","type":"server_error","code":null}}""", AssistantFailure.Failed)]
    public async Task Each_failure_is_classified_and_carries_the_providers_words_only_inside(int status, string body, AssistantFailure failure)
    {
        var conversation = Provider(new StubOpenAI((HttpStatusCode)status, body)).Begin(Brief);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(() => conversation.NextAsync([], true, CancellationToken.None));

        Assert.Equal(failure, thrown.Failure);
        Assert.NotNull(thrown.InnerException);
        Assert.DoesNotContain("error", thrown.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task OpenAI_sends_nothing_again_whatever_the_refusal_says()
    {
        // Groq's tool_use_failed is retried for Groq only. Here it is any other 400: one request, classified as before.
        var openAi = new StubOpenAI(
            HttpStatusCode.BadRequest,
            """{"error":{"message":"Failed to parse tool call arguments as JSON","type":"invalid_request_error","code":"tool_use_failed","failed_generation":"{"}}""");
        var conversation = Provider(openAi).Begin(Brief);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(() => conversation.NextAsync([], true, CancellationToken.None));

        Assert.Single(openAi.Requests);
        Assert.Equal(AssistantFailure.Failed, thrown.Failure);
        Assert.Equal("OpenAI answered 400.", thrown.Message);
        Assert.IsType<ClientResultException>(thrown.InnerException);
    }

    [Fact]
    public async Task OpenAI_sends_the_full_instructions_on_every_step_because_every_step_carries_the_schema()
    {
        var openAi = new StubOpenAI(
            Response("""{"type":"function_call","id":"fc_1","call_id":"call_1","name":"get_universe_overview","arguments":"{}","status":"completed"}"""),
            Response(Message(Answer)));
        var conversation = Provider(openAi).Begin(GroqAssistantProviderTests.LorEvolveBrief);

        await conversation.NextAsync([], true, CancellationToken.None);
        await conversation.NextAsync([new AssistantToolResult("call_1", "{}")], false, CancellationToken.None);

        Assert.All(openAi.Requests, request =>
            Assert.Equal(UniverseAssistant.Instructions("Emberfall"), request.GetProperty("instructions").GetString()));
    }

    [Fact]
    public async Task OpenAI_never_reports_a_turn_still_looking_and_classifies_nothing_new()
    {
        // Groq's answering-step refusal, as if OpenAI sent it: OpenAI keeps its own handling - one request, a plain failure.
        var openAi = new StubOpenAI(
            HttpStatusCode.BadRequest,
            """{"error":{"message":"Tool choice is none, but model called a tool","type":"invalid_request_error","code":"tool_use_failed"}}""");
        var conversation = Provider(openAi).Begin(Brief);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(() => conversation.NextAsync([], false, CancellationToken.None));

        Assert.Single(openAi.Requests);
        Assert.Equal("OpenAI answered 400.", thrown.Message);
        Assert.IsType<ClientResultException>(thrown.InnerException);
    }

    [Fact]
    public async Task A_response_that_did_not_complete_is_a_failure()
    {
        var incomplete = Response(Message(Answer)).Replace("\"status\":\"completed\",\"model\"", "\"status\":\"incomplete\",\"incomplete_details\":{\"reason\":\"max_output_tokens\"},\"model\"", StringComparison.Ordinal);
        var conversation = Provider(new StubOpenAI(incomplete)).Begin(Brief);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(() => conversation.NextAsync([], true, CancellationToken.None));
        Assert.Equal(AssistantFailure.Failed, thrown.Failure);
    }

    // ---------- Stub ----------

    private static OpenAIAssistantProvider Provider(StubOpenAI openAi) =>
        new(OpenAIAssistantProvider.CreateClient("test-only-not-a-key", new HttpClientPipelineTransport(new HttpClient(openAi))), "test-model");

    internal static string Message(string text) =>
        JsonSerializer.Serialize(new
        {
            type = "message",
            id = "msg_1",
            role = "assistant",
            status = "completed",
            content = new[] { new { type = "output_text", text, annotations = Array.Empty<object>() } },
        });

    internal static string Response(params string[] output) =>
        "{\"id\":\"resp_1\",\"object\":\"response\",\"created_at\":1760000000,\"status\":\"completed\",\"model\":\"test-model\","
        + "\"output\":[" + string.Join(',', output) + "],"
        + "\"parallel_tool_calls\":true,\"tool_choice\":\"auto\",\"tools\":[],\"store\":false,"
        + "\"usage\":{\"input_tokens\":11,\"input_tokens_details\":{\"cached_tokens\":0},\"output_tokens\":7,"
        + "\"output_tokens_details\":{\"reasoning_tokens\":3},\"total_tokens\":18}}";

    /// <summary>Answers the Responses endpoint from a script, in order - the last answer repeats, for the client's one retry.</summary>
    internal sealed class StubOpenAI : HttpMessageHandler
    {
        private readonly Queue<(HttpStatusCode Status, string Body)> _answers;

        public StubOpenAI(params string[] bodies) => _answers = new([.. bodies.Select(body => (HttpStatusCode.OK, body))]);

        public StubOpenAI(HttpStatusCode status, string body) => _answers = new([(status, body)]);

        /// <summary>Answers in this order; the last is repeated for any request after it.</summary>
        public StubOpenAI(params (HttpStatusCode Status, string Body)[] answers) => _answers = new(answers);

        public List<JsonElement> Requests { get; } = [];

        public List<Uri> Addresses { get; } = [];

        public List<string?> Authorizations { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.EndsWith("/responses", request.RequestUri!.AbsolutePath, StringComparison.Ordinal);
            Addresses.Add(request.RequestUri);
            Authorizations.Add(request.Headers.Authorization?.ToString());
            Requests.Add(JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken)).RootElement.Clone());

            var (status, body) = _answers.Count > 1 ? _answers.Dequeue() : _answers.Peek();
            return new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }
}
