using System.ClientModel.Primitives;
using System.Net;
using System.Text.Json;
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

            Assert.Equal(UniverseAssistant.MaxOutputTokens, request.GetProperty("max_output_tokens").GetInt32());
        }

        // Groq refuses tools and structured output in one request, so they never share one.
        AssertToolStep(groq.Requests[0]);
        AssertAnswerStep(groq.Requests[1]);

        // The second step carries the question, Groq's reasoning, the call and its result, as Groq's own examples do.
        var input = groq.Requests[1].GetProperty("input").EnumerateArray().ToList();
        Assert.Equal(["message", "reasoning", "function_call", "function_call_output"], input.Select(item => item.GetProperty("type").GetString()));
        Assert.Equal("Look the name up.", input[1].GetProperty("content")[0].GetProperty("text").GetString());
        Assert.Equal("call_1", input[3].GetProperty("call_id").GetString());
    }

    [Fact]
    public async Task A_groq_tool_step_that_answers_in_free_text_is_followed_at_once_by_the_answering_step()
    {
        var groq = new StubOpenAI(Response(Message("Arin is a smith.")), Response(Message(Answer)));
        var conversation = Provider(groq).Begin(Brief);

        var turn = await conversation.NextAsync([], toolsAllowed: true, CancellationToken.None);

        // The caller gets the schema's JSON, never the free text, and both requests' tokens.
        Assert.Empty(turn.ToolCalls);
        Assert.Equal(Answer, turn.Answer);
        Assert.Equal((22, 14), (turn.InputTokens, turn.OutputTokens));

        Assert.Equal(2, groq.Requests.Count);
        AssertToolStep(groq.Requests[0]);
        AssertAnswerStep(groq.Requests[1]);
    }

    // ---------- A tool call Groq could not parse (tool_use_failed) ----------

    private const string ToolUseFailed =
        """{"error":{"message":"Failed to parse tool call arguments as JSON","type":"invalid_request_error","code":"tool_use_failed","failed_generation":"{\"query\": \"PRIVATE-LORE Arin's hidden heir"}}""";

    /// <summary>What the model generated in <see cref="ToolUseFailed"/>: the universe's own text, never for a log.</summary>
    private const string Generated = "PRIVATE-LORE";

    private const string Search =
        """{"type":"function_call","id":"fc_1","call_id":"call_1","name":"search_universe","arguments":"{\"query\":\"Arin\"}","status":"completed"}""";

    [Fact]
    public async Task A_tool_call_groq_could_not_parse_is_asked_for_once_more_unchanged_and_the_loop_goes_on()
    {
        var groq = new StubOpenAI(
            (HttpStatusCode.BadRequest, ToolUseFailed),
            (HttpStatusCode.OK, Response(Search)),
            (HttpStatusCode.OK, Response(Message(Answer))));
        var conversation = Provider(groq).Begin(Brief);

        var first = await conversation.NextAsync([], toolsAllowed: true, CancellationToken.None);
        Assert.Equal(("call_1", AssistantTools.SearchUniverse), (first.ToolCalls.Single().CallId, first.ToolCalls.Single().Name));

        // The second request is the first sent again: same tools, same conversation, nothing invented in between.
        Assert.Equal(2, groq.Requests.Count);
        Assert.Equal(groq.Requests[0].GetRawText(), groq.Requests[1].GetRawText());
        AssertToolStep(groq.Requests[1]);

        // And the conversation continues from the call that did parse.
        var second = await conversation.NextAsync(
            [new AssistantToolResult("call_1", """{"results":[]}""")],
            toolsAllowed: false,
            CancellationToken.None);
        Assert.Equal(Answer, second.Answer);
        AssertAnswerStep(groq.Requests[2]);
        var input = groq.Requests[2].GetProperty("input").EnumerateArray().Select(item => item.GetProperty("type").GetString());
        Assert.Equal(["message", "function_call", "function_call_output"], input);
    }

    [Fact]
    public async Task A_second_unparseable_tool_call_fails_the_question_and_logs_its_code_and_attempts_but_never_what_was_written()
    {
        var groq = new StubOpenAI(HttpStatusCode.BadRequest, ToolUseFailed);
        var conversation = Provider(groq).Begin(Brief);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(() => conversation.NextAsync([], true, CancellationToken.None));

        // Two requests and no more, though the stub would refuse forever.
        Assert.Equal(2, groq.Requests.Count);
        Assert.Equal(AssistantFailure.Failed, thrown.Failure);
        Assert.Equal("Groq answered 400 (tool_use_failed: invalid_arguments) after 2 of 2 attempt(s), tools sent.", thrown.Message);

        // The endpoint logs the message with the inner exception: none, so neither the SDK's message nor the body is logged.
        Assert.Null(thrown.InnerException);
        Assert.DoesNotContain(Generated, thrown.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain("test-only-not-a-key", thrown.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Unparseable_arguments_on_the_answering_step_stay_a_failure_never_sent_again_and_not_logged()
    {
        var groq = new StubOpenAI(HttpStatusCode.BadRequest, ToolUseFailed);
        var conversation = Provider(groq).Begin(Brief);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(() => conversation.NextAsync([], false, CancellationToken.None));

        Assert.Single(groq.Requests);
        Assert.Equal("Groq answered 400 (tool_use_failed: invalid_arguments) after 1 of 1 attempt(s), tools not sent.", thrown.Message);
        Assert.Null(thrown.InnerException);
        Assert.DoesNotContain(Generated, thrown.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_cancelled_question_stays_cancelled_and_sends_nothing()
    {
        // The retry catches only a server's refusal: a cancellation is neither retried, nor a timeout, nor a failure.
        using var cancel = new CancellationTokenSource();
        await cancel.CancelAsync();
        var groq = new StubOpenAI(HttpStatusCode.BadRequest, ToolUseFailed);
        var conversation = Provider(groq).Begin(Brief);

        var thrown = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => conversation.NextAsync([], true, cancel.Token));

        Assert.Empty(groq.Requests);
        Assert.Equal(cancel.Token, thrown.CancellationToken);
    }

    // ---------- The model calling a tool on the answering step (live: "Tool choice is none, but model called a tool") ----------

    private const string ToolWithNoneAllowed =
        """{"error":{"message":"Tool choice is none, but model called a tool","type":"invalid_request_error","code":"tool_use_failed","failed_generation":"{\"name\":\"get_lore\",\"arguments\":{\"id\":\"PRIVATE-LORE\"}}"}}""";

    [Fact]
    public async Task On_the_answering_step_a_tool_the_model_calls_anyway_is_a_turn_still_looking_not_a_failure_or_a_call()
    {
        var groq = new StubOpenAI(HttpStatusCode.BadRequest, ToolWithNoneAllowed);
        var conversation = Provider(groq).Begin(Brief);

        var turn = await conversation.NextAsync([], toolsAllowed: false, CancellationToken.None);

        // Nothing invented: no call to run, no answer, only that it wanted to read more. One request, never sent again.
        Assert.True(turn.StillLooking);
        Assert.Empty(turn.ToolCalls);
        Assert.Null(turn.Answer);
        Assert.Single(groq.Requests);
        AssertAnswerStep(groq.Requests[0]);
        Assert.DoesNotContain(Generated, turn.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task After_free_text_with_lookups_left_a_tool_called_on_the_answering_step_fails_without_claiming_the_budget_ran_out()
    {
        var groq = new StubOpenAI(
            (HttpStatusCode.OK, Response(Message("Arin is a smith."))),
            (HttpStatusCode.BadRequest, ToolWithNoneAllowed));
        var conversation = Provider(groq).Begin(Brief);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(() => conversation.NextAsync([], toolsAllowed: true, CancellationToken.None));

        Assert.Equal(2, groq.Requests.Count);
        AssertToolStep(groq.Requests[0]);
        AssertAnswerStep(groq.Requests[1]);
        Assert.Equal(AssistantFailure.Failed, thrown.Failure);
        Assert.Equal(
            "Groq answered in free text with lookups left, then asked for a tool on the answering step (tool_use_failed: tool_requested_with_none_allowed).",
            thrown.Message);
        Assert.DoesNotContain("ran out", thrown.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Null(thrown.InnerException);
        Assert.DoesNotContain(Generated, thrown.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Failed to parse tool call arguments as JSON", "invalid_arguments")]
    [InlineData("tool call validation failed: parameters for tool get_lore did not match schema: errors: [PRIVATE-LORE]", "invalid_arguments")]
    [InlineData("tool call validation failed: attempted to call tool 'PRIVATE-LORE' which was not in request.tools", "unknown_tool")]
    [InlineData("Tool choice is none, but model called a tool", "tool_requested_with_none_allowed")]
    [InlineData("Something Groq has never said before about PRIVATE-LORE", "other")]
    public async Task A_tool_step_refusal_is_logged_by_a_fixed_category_never_by_what_groq_or_the_model_wrote(string message, string category)
    {
        var body = JsonSerializer.Serialize(new { error = new { message, type = "invalid_request_error", code = "tool_use_failed" } });
        var groq = new StubOpenAI(HttpStatusCode.BadRequest, body);
        var conversation = Provider(groq).Begin(Brief);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(() => conversation.NextAsync([], toolsAllowed: true, CancellationToken.None));

        // A tool step is still sent twice and no more, whatever the category - a refused call there is never "still looking".
        Assert.Equal(2, groq.Requests.Count);
        Assert.Equal(AssistantFailure.Failed, thrown.Failure);
        Assert.Equal($"Groq answered 400 (tool_use_failed: {category}) after 2 of 2 attempt(s), tools sent.", thrown.Message);

        // No failed_generation here, and still no inner exception: Groq's message itself can quote the model.
        Assert.Null(thrown.InnerException);
        Assert.DoesNotContain("PRIVATE-LORE", thrown.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(message, thrown.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(400, """{"error":{"message":"property 'store' is unsupported","type":"invalid_request_error","code":null}}""")]
    [InlineData(400, """{"error":{"message":"json mode cannot be combined with tool/function calling","type":"invalid_request_error","param":"response_format"}}""")]
    [InlineData(400, "not json")]
    [InlineData(500, """{"error":{"message":"Failed to parse tool call arguments as JSON","type":"internal_server_error","code":"tool_use_failed"}}""")]
    public async Task Any_other_refusal_is_not_sent_again(int status, string body)
    {
        var groq = new StubOpenAI((HttpStatusCode)status, body);
        var conversation = Provider(groq).Begin(Brief);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(() => conversation.NextAsync([], true, CancellationToken.None));

        Assert.Equal(AssistantFailure.Failed, thrown.Failure);
        Assert.Equal($"Groq answered {status}.", thrown.Message);
        Assert.NotNull(thrown.InnerException);
        // A 500 is the client pipeline's own single retry (ClientRetryPolicy), not this one.
        Assert.Equal(status == 500 ? 2 : 1, groq.Requests.Count);
    }

    /// <summary>A step that allows tools: the strict tools, <c>tool_choice: auto</c>, and no answer schema.</summary>
    private static void AssertToolStep(JsonElement request)
    {
        var tools = request.GetProperty("tools").EnumerateArray().ToList();
        Assert.Equal(AssistantTools.Definitions.Select(tool => tool.Name), tools.Select(tool => tool.GetProperty("name").GetString()));
        Assert.All(tools, tool => Assert.True(tool.GetProperty("strict").GetBoolean()));
        Assert.Equal("auto", request.GetProperty("tool_choice").GetString());
        // Groq lists the gpt-oss models without parallel tool use: one call per step, asked for explicitly.
        Assert.False(request.GetProperty("parallel_tool_calls").GetBoolean());
        Assert.False(request.TryGetProperty("text", out _));
        Assert.False(request.TryGetProperty("response_format", out _));
    }

    /// <summary>The answering step: the strict LoreX answer schema, and no tools, no tool choice, nothing about tools.</summary>
    private static void AssertAnswerStep(JsonElement request)
    {
        Assert.True(!request.TryGetProperty("tools", out var tools) || tools.GetArrayLength() == 0);
        Assert.False(request.TryGetProperty("tool_choice", out _));
        Assert.False(request.TryGetProperty("parallel_tool_calls", out _));

        var format = request.GetProperty("text").GetProperty("format");
        Assert.Equal("json_schema", format.GetProperty("type").GetString());
        Assert.Equal("lorex_answer", format.GetProperty("name").GetString());
        Assert.True(format.GetProperty("strict").GetBoolean());
        using var schema = JsonDocument.Parse(UniverseAssistant.AnswerSchema);
        Assert.True(JsonElement.DeepEquals(schema.RootElement, format.GetProperty("schema")));
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
