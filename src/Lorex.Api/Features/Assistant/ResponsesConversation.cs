using System.ClientModel;
using System.ClientModel.Primitives;
using System.Text.Json;
using OpenAI.Responses;

// The OpenAI .NET library marks its Responses client experimental (OPENAI001). Only the Responses providers use it:
// this file, OpenAIAssistantProvider and GroqAssistantProvider.
#pragma warning disable OPENAI001

namespace Lorex.Api.Features.Assistant;

/// <summary>
/// One question's exchange with a server that speaks OpenAI's Responses API - OpenAI itself, or Groq's compatible endpoint
/// (ADR 0045). Everything the two share lives here: the conversation sent again each step, the strict tools and answer
/// schema, the tool loop, and how a failure is classified. What differs between them - what a request may carry about
/// storage and reasoning, and whether tools and the answer schema may share a request - is the provider's, applied through
/// <c>serverOptions</c> and <c>toolsWithAnswerSchema</c>, so neither server's rules leak into the other's requests.
///
/// Every item a step returns - reasoning, function calls, messages - goes back unchanged with the next step, so a reasoning
/// model keeps its reasoning across the tool loop. It stays inside the provider: never in a turn, a log or an answer.
/// </summary>
internal sealed class ResponsesConversation : IAssistantConversation
{
    private readonly ResponsesClient _client;
    private readonly string _model;
    private readonly AssistantBrief _brief;
    private readonly string _server;
    private readonly Action<CreateResponseOptions> _serverOptions;
    private readonly bool _toolsWithAnswerSchema;
    private readonly bool _retryUnparseableToolCall;
    private readonly List<ResponseItem> _items = [];

    /// <param name="server">The server's name, for LoreX's own failure messages and the log. Never shown to a person.</param>
    /// <param name="serverOptions">What this server's requests carry beyond the shared ones.</param>
    /// <param name="toolsWithAnswerSchema">
    /// True when one request may carry both the tools and the strict answer schema (OpenAI). False when the server refuses
    /// that pairing (Groq: "json mode cannot be combined with tool/function calling"): a step that allows tools then sends
    /// the tools and no schema, and the step that answers sends the schema and no tools at all.
    /// </param>
    /// <param name="retryUnparseableToolCall">
    /// True when the server reports a tool call the model generated but it could not parse (Groq: a 400 with code
    /// <c>tool_use_failed</c>) and says to send the request again. Only a step that allows tools is sent again, and once.
    /// </param>
    public ResponsesConversation(
        ResponsesClient client,
        string model,
        AssistantBrief brief,
        string server,
        Action<CreateResponseOptions> serverOptions,
        bool toolsWithAnswerSchema = true,
        bool retryUnparseableToolCall = false)
    {
        _client = client;
        _model = model;
        _brief = brief;
        _server = server;
        _serverOptions = serverOptions;
        _toolsWithAnswerSchema = toolsWithAnswerSchema;
        _retryUnparseableToolCall = retryUnparseableToolCall;

        foreach (var message in brief.Messages)
        {
            _items.Add(message.Role == AssistantRole.User
                ? ResponseItem.CreateUserMessageItem(message.Text)
                : ResponseItem.CreateAssistantMessageItem(message.Text, []));
        }
    }

    /// <summary>
    /// A client for one server: its key, its endpoint (null for OpenAI's own), a short network timeout and one retry. A test
    /// hands it a <paramref name="transport"/> that answers in place of the server; a deployment never does.
    /// </summary>
    public static ResponsesClient CreateClient(string apiKey, Uri? endpoint, PipelineTransport? transport)
    {
        var options = new ResponsesClientOptions
        {
            NetworkTimeout = TimeSpan.FromSeconds(45),
            RetryPolicy = new ClientRetryPolicy(maxRetries: 1),
        };

        if (endpoint is not null)
        {
            options.Endpoint = endpoint;
        }

        if (transport is not null)
        {
            options.Transport = transport;
        }

        return new ResponsesClient(new ApiKeyCredential(apiKey), options);
    }

    public async Task<AssistantModelTurn> NextAsync(
        IReadOnlyList<AssistantToolResult> results,
        bool toolsAllowed,
        CancellationToken cancellationToken)
    {
        foreach (var result in results)
        {
            _items.Add(ResponseItem.CreateFunctionCallOutputItem(result.CallId, result.Output));
        }

        var sendTools = toolsAllowed || _toolsWithAnswerSchema;
        var sendAnswerSchema = !toolsAllowed || _toolsWithAnswerSchema;

        var options = new CreateResponseOptions(_model, _items)
        {
            Instructions = _brief.Instructions,
            MaxOutputTokenCount = _brief.MaxOutputTokens,
        };

        if (sendTools)
        {
            options.ParallelToolCallsEnabled = true;
            options.ToolChoice = toolsAllowed ? ResponseToolChoice.CreateAutoChoice() : ResponseToolChoice.CreateNoneChoice();
            foreach (var tool in _brief.Tools)
            {
                options.Tools.Add(ResponseTool.CreateFunctionTool(
                    tool.Name,
                    BinaryData.FromString(tool.ParametersSchema),
                    strictModeEnabled: true,
                    functionDescription: tool.Description));
            }
        }

        if (sendAnswerSchema)
        {
            options.TextOptions = new ResponseTextOptions
            {
                TextFormat = ResponseTextFormat.CreateJsonSchemaFormat(
                    "lorex_answer",
                    BinaryData.FromString(_brief.AnswerSchema),
                    jsonSchemaIsStrict: true),
            };
        }

        _serverOptions(options);

        // Two attempts at most: only a server that asks for it, on a step with tools, sends a second (see SendAsync).
        var attempts = _retryUnparseableToolCall && toolsAllowed ? 2 : 1;
        ResponseResult? response = null;
        for (var attempt = 1; response is null; attempt++)
        {
            response = await SendAsync(options, attempt, attempts, cancellationToken);
        }

        if (response.Status is not ResponseStatus.Completed)
        {
            throw new AssistantProviderException(
                AssistantFailure.Failed,
                $"{_server}'s response ended {response.Status} ({response.IncompleteStatusDetails?.Reason}).");
        }

        // Every item goes back with the next step exactly as it came: the reasoning, the calls it led to and any message.
        _items.AddRange(response.OutputItems);

        List<AssistantToolCall> calls =
        [
            .. response.OutputItems
                .OfType<FunctionCallResponseItem>()
                .Select(call => new AssistantToolCall(call.CallId, call.FunctionName, call.FunctionArguments.ToString())),
        ];

        var inputTokens = response.Usage?.InputTokenCount ?? 0;
        var outputTokens = response.Usage?.OutputTokenCount ?? 0;

        // A step without the schema that called nothing has answered in free text, which is not an answer. The answering
        // step runs now - schema, no tools - so the caller still gets the schema's JSON and its loop stays as it is.
        if (calls.Count == 0 && !sendAnswerSchema)
        {
            var answer = await NextAsync([], toolsAllowed: false, cancellationToken);
            return answer with
            {
                InputTokens = inputTokens + answer.InputTokens,
                OutputTokens = outputTokens + answer.OutputTokens,
            };
        }

        return new AssistantModelTurn(
            calls,
            calls.Count == 0 ? response.GetOutputText() : null,
            inputTokens,
            outputTokens);
    }

    /// <summary>
    /// One request, its failures classified - or null to send it again, which only an unparseable tool call earns, and only
    /// while <paramref name="attempts"/> allows.
    ///
    /// What the model generated never reaches a message or the log: a refused generation may carry the universe's own text.
    /// So a refusal that carries one - Groq's <c>failed_generation</c> - is reported by its status and code alone, and
    /// without the client's exception, whose message and body hold it.
    /// </summary>
    private async Task<ResponseResult?> SendAsync(
        CreateResponseOptions options,
        int attempt,
        int attempts,
        CancellationToken cancellationToken)
    {
        try
        {
            return (await _client.CreateResponseAsync(options, cancellationToken)).Value;
        }
        // The generation is sampled, so the same request can succeed: Groq's own guidance is to send it again.
        catch (ClientResultException exception) when (attempt < attempts
            && exception.Status == StatusCodes.Status400BadRequest
            && ErrorCode(exception) == ToolUseFailed)
        {
            return null;
        }
        // A 429 is also how OpenAI says the account has no credit left. That is not "busy": waiting never fixes it.
        catch (ClientResultException exception) when (exception.Status == StatusCodes.Status429TooManyRequests
            && exception.GetRawResponse()?.Content.ToString().Contains("insufficient_quota", StringComparison.Ordinal) == true)
        {
            throw new AssistantProviderException(AssistantFailure.Failed, $"The {_server} account has no quota left.", exception);
        }
        catch (ClientResultException exception) when (exception.Status == StatusCodes.Status429TooManyRequests)
        {
            throw new AssistantProviderException(AssistantFailure.Busy, $"{_server} is rate limiting this host.", exception);
        }
        catch (ClientResultException exception) when (_retryUnparseableToolCall && CarriesGeneration(exception))
        {
            throw new AssistantProviderException(
                AssistantFailure.Failed,
                $"{_server} answered {exception.Status} ({ErrorCode(exception) ?? "no code"}) after {attempt} of {attempts} attempt(s).");
        }
        catch (ClientResultException exception)
        {
            throw new AssistantProviderException(AssistantFailure.Failed, $"{_server} answered {exception.Status}.", exception);
        }
        catch (HttpRequestException exception)
        {
            throw new AssistantProviderException(AssistantFailure.Failed, $"{_server} could not be reached.", exception);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new AssistantProviderException(AssistantFailure.TimedOut, $"{_server} did not answer in time.", exception);
        }
    }

    private const string ToolUseFailed = "tool_use_failed";

    /// <summary>The error code of a refusal's JSON body (<c>error.code</c>), or null when it has none.</summary>
    private static string? ErrorCode(ClientResultException exception) =>
        Error(exception) is { } error && error.TryGetProperty("code", out var code) && code.ValueKind == JsonValueKind.String
            ? code.GetString()
            : null;

    /// <summary>Whether a refusal's body holds what the model generated (Groq's <c>error.failed_generation</c>).</summary>
    private static bool CarriesGeneration(ClientResultException exception) =>
        Error(exception)?.TryGetProperty("failed_generation", out _) == true;

    private static JsonElement? Error(ClientResultException exception)
    {
        try
        {
            using var body = JsonDocument.Parse(exception.GetRawResponse()?.Content.ToString() ?? string.Empty);
            return body.RootElement.ValueKind == JsonValueKind.Object
                && body.RootElement.TryGetProperty("error", out var error)
                && error.ValueKind == JsonValueKind.Object
                ? error.Clone()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
