using System.ClientModel;
using System.ClientModel.Primitives;
using OpenAI.Responses;

// The OpenAI .NET library marks its Responses client experimental (OPENAI001) while the Responses API is the one OpenAI
// recommends. This file is the only place that touches it, so the suppression stays here.
#pragma warning disable OPENAI001

namespace Lorex.Api.Features.Assistant;

/// <summary>
/// The assistant's model, on OpenAI's Responses API (ADR 0045). The only file that knows OpenAI exists: every OpenAI type
/// stays here, and only <see cref="AssistantModelTurn"/> and <see cref="AssistantProviderException"/> come out.
///
/// <b>Nothing is stored at OpenAI.</b> Every request sets <c>store: false</c> and sends the conversation again, so no
/// response id is ever kept or reused. That is OpenAI's stateless mode: every request also asks for the model's reasoning as
/// encrypted content (<c>include: reasoning.encrypted_content</c>), and every item a step returns - reasoning, tool calls,
/// messages - is sent back unchanged with the next step, so a reasoning model keeps its own reasoning across the tool loop
/// without anything being stored. The reasoning is opaque here and goes nowhere else: never into a turn, a log or an answer.
/// A model that does not reason returns no reasoning items, and the same requests serve it.
///
/// <b>Bounded.</b> Output tokens are capped per step, the network timeout is short and the client retries once. Failures
/// become <see cref="AssistantProviderException"/>; the provider's own words stay in the inner exception, for the log.
/// </summary>
internal sealed class OpenAIAssistantProvider(ResponsesClient client, string model) : IAssistantProvider
{
    public bool IsConfigured => true;

    public IAssistantConversation Begin(AssistantBrief brief) => new Conversation(client, model, brief);

    /// <summary>
    /// The client a deployment uses: the key from configuration, a short network timeout, one retry. A test hands it a
    /// <paramref name="transport"/> that answers in place of OpenAI; a deployment never does.
    /// </summary>
    public static ResponsesClient CreateClient(string apiKey, PipelineTransport? transport = null)
    {
        var options = new ResponsesClientOptions
        {
            NetworkTimeout = TimeSpan.FromSeconds(45),
            RetryPolicy = new ClientRetryPolicy(maxRetries: 1),
        };

        if (transport is not null)
        {
            options.Transport = transport;
        }

        return new ResponsesClient(new ApiKeyCredential(apiKey), options);
    }

    private sealed class Conversation : IAssistantConversation
    {
        private readonly ResponsesClient _client;
        private readonly string _model;
        private readonly AssistantBrief _brief;
        private readonly List<ResponseItem> _items = [];

        public Conversation(ResponsesClient client, string model, AssistantBrief brief)
        {
            _client = client;
            _model = model;
            _brief = brief;

            foreach (var message in brief.Messages)
            {
                _items.Add(message.Role == AssistantRole.User
                    ? ResponseItem.CreateUserMessageItem(message.Text)
                    : ResponseItem.CreateAssistantMessageItem(message.Text, []));
            }
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

            var options = new CreateResponseOptions(_model, _items)
            {
                Instructions = _brief.Instructions,
                StoredOutputEnabled = false,
                MaxOutputTokenCount = _brief.MaxOutputTokens,
                ParallelToolCallsEnabled = true,
                ToolChoice = toolsAllowed ? ResponseToolChoice.CreateAutoChoice() : ResponseToolChoice.CreateNoneChoice(),
                TextOptions = new ResponseTextOptions
                {
                    TextFormat = ResponseTextFormat.CreateJsonSchemaFormat(
                        "lorex_answer",
                        BinaryData.FromString(_brief.AnswerSchema),
                        jsonSchemaIsStrict: true),
                },
            };

            options.IncludedProperties.Add(IncludedResponseProperty.ReasoningEncryptedContent);

            foreach (var tool in _brief.Tools)
            {
                options.Tools.Add(ResponseTool.CreateFunctionTool(
                    tool.Name,
                    BinaryData.FromString(tool.ParametersSchema),
                    strictModeEnabled: true,
                    functionDescription: tool.Description));
            }

            ResponseResult response;
            try
            {
                response = (await _client.CreateResponseAsync(options, cancellationToken)).Value;
            }
            // A 429 is also how OpenAI says the account has no credit left. That is not "busy": waiting never fixes it.
            catch (ClientResultException exception) when (exception.Status == StatusCodes.Status429TooManyRequests
                && exception.GetRawResponse()?.Content.ToString().Contains("insufficient_quota", StringComparison.Ordinal) == true)
            {
                throw new AssistantProviderException(AssistantFailure.Failed, "The OpenAI account has no quota left.", exception);
            }
            catch (ClientResultException exception) when (exception.Status == StatusCodes.Status429TooManyRequests)
            {
                throw new AssistantProviderException(AssistantFailure.Busy, "OpenAI is rate limiting this host.", exception);
            }
            catch (ClientResultException exception)
            {
                throw new AssistantProviderException(AssistantFailure.Failed, $"OpenAI answered {exception.Status}.", exception);
            }
            catch (HttpRequestException exception)
            {
                throw new AssistantProviderException(AssistantFailure.Failed, "OpenAI could not be reached.", exception);
            }
            catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
            {
                throw new AssistantProviderException(AssistantFailure.TimedOut, "OpenAI did not answer in time.", exception);
            }

            if (response.Status is not ResponseStatus.Completed)
            {
                throw new AssistantProviderException(
                    AssistantFailure.Failed,
                    $"OpenAI's response ended {response.Status} ({response.IncompleteStatusDetails?.Reason}).");
            }

            // Every item goes back with the next step exactly as it came: the reasoning (encrypted), the calls it led to and
            // any message. Dropping the reasoning would leave a reasoning model's calls without the reasoning they need.
            _items.AddRange(response.OutputItems);

            List<AssistantToolCall> calls =
            [
                .. response.OutputItems
                    .OfType<FunctionCallResponseItem>()
                    .Select(call => new AssistantToolCall(call.CallId, call.FunctionName, call.FunctionArguments.ToString())),
            ];

            return new AssistantModelTurn(
                calls,
                calls.Count == 0 ? response.GetOutputText() : null,
                response.Usage?.InputTokenCount ?? 0,
                response.Usage?.OutputTokenCount ?? 0);
        }
    }
}
