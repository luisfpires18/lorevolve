using System.ClientModel.Primitives;
using OpenAI.Responses;

// The OpenAI .NET library marks its Responses client experimental (OPENAI001); see ResponsesConversation.
#pragma warning disable OPENAI001

namespace LorEvolve.Api.Features.Assistant;

/// <summary>
/// The assistant's model on OpenAI's Responses API (ADR 0045). The exchange itself is <see cref="ResponsesConversation"/>;
/// what is OpenAI's alone is how its requests treat storage and reasoning.
///
/// <b>Nothing is stored at OpenAI.</b> Every request sets <c>store: false</c> and the conversation is sent again each
/// step, so no response id is ever kept or reused. That is OpenAI's stateless mode: every request also asks for the
/// model's reasoning as encrypted content (<c>include: reasoning.encrypted_content</c>), which the shared conversation
/// carries to the next step unchanged. A model that does not reason returns no reasoning items, and the same requests
/// serve it.
/// </summary>
internal sealed class OpenAIAssistantProvider(ResponsesClient client, string model) : IAssistantProvider
{
    public bool IsConfigured => true;

    public IAssistantConversation Begin(AssistantBrief brief) =>
        new ResponsesConversation(client, model, brief, "OpenAI", options =>
        {
            options.StoredOutputEnabled = false;
            options.IncludedProperties.Add(IncludedResponseProperty.ReasoningEncryptedContent);
        });

    /// <summary>The client a deployment uses: OpenAI's own endpoint. A test hands it a <paramref name="transport"/>.</summary>
    public static ResponsesClient CreateClient(string apiKey, PipelineTransport? transport = null) =>
        ResponsesConversation.CreateClient(apiKey, null, transport);
}
