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
/// response id is ever kept or reused. Reasoning items a model returns are not sent back - without storage they cannot
/// be referenced - so each step carries the messages, the tool calls and their results, rebuilt from their parts.
///
/// <b>Bounded.</b> Output tokens are capped per step, the network timeout is short and the client retries once. Failures
/// become <see cref="AssistantProviderException"/>; the provider's own words stay in the inner exception, for the log.
/// </summary>
internal sealed class OpenAIAssistantProvider(ResponsesClient client, string model) : IAssistantProvider
{
    public bool IsConfigured => true;

    public IAssistantConversation Begin(AssistantBrief brief) => new Conversation(client, model, brief);

    /// <summary>The client a deployment uses: the key from configuration, a short network timeout, one retry.</summary>
    public static ResponsesClient CreateClient(string apiKey) =>
        new(
            new ApiKeyCredential(apiKey),
            new ResponsesClientOptions
            {
                NetworkTimeout = TimeSpan.FromSeconds(45),
                RetryPolicy = new ClientRetryPolicy(maxRetries: 1),
            });

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

            List<AssistantToolCall> calls = [];
            foreach (var item in response.OutputItems)
            {
                switch (item)
                {
                    case FunctionCallResponseItem call:
                        calls.Add(new AssistantToolCall(call.CallId, call.FunctionName, call.FunctionArguments.ToString()));
                        _items.Add(ResponseItem.CreateFunctionCallItem(call.CallId, call.FunctionName, call.FunctionArguments));
                        break;
                    case MessageResponseItem message when message.Role == MessageRole.Assistant:
                        var text = string.Concat(message.Content.Select(part => part.Text));
                        if (text.Length > 0)
                        {
                            _items.Add(ResponseItem.CreateAssistantMessageItem(text, []));
                        }

                        break;
                }
            }

            return new AssistantModelTurn(
                calls,
                calls.Count == 0 ? response.GetOutputText() : null,
                response.Usage?.InputTokenCount ?? 0,
                response.Usage?.OutputTokenCount ?? 0);
        }
    }
}
