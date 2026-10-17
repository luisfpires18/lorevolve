using System.ClientModel.Primitives;
using OpenAI.Responses;

// The OpenAI .NET library marks its Responses client experimental (OPENAI001); see ResponsesConversation.
#pragma warning disable OPENAI001

namespace Lorex.Api.Features.Assistant;

/// <summary>
/// The assistant's model on Groq, through Groq's OpenAI-compatible Responses API (ADR 0045 amendment). The same exchange as
/// OpenAI's (<see cref="ResponsesConversation"/>) - the same tools, loop, strict schemas and failures - sent to Groq's
/// endpoint with Groq's key.
///
/// What Groq's Responses API does not accept is left out, not sent empty: no <c>store</c> (Groq keeps no responses to
/// opt out of) and no <c>include</c>. Groq's reasoning models return their reasoning as ordinary output items, which the
/// shared conversation carries to the next step as Groq's own examples do.
///
/// Groq refuses structured output and tool calling in one request (HTTP 400 on <c>response_format</c>: "json mode cannot
/// be combined with tool/function calling"). So a step that allows tools sends the tools and no answer schema, and the
/// answering step sends the strict answer schema and no tools at all.
/// </summary>
internal sealed class GroqAssistantProvider(ResponsesClient client, string model) : IAssistantProvider
{
    /// <summary>Groq's OpenAI-compatible API; the client adds <c>/responses</c>.</summary>
    public static readonly Uri Endpoint = new("https://api.groq.com/openai/v1");

    public bool IsConfigured => true;

    public IAssistantConversation Begin(AssistantBrief brief) =>
        new ResponsesConversation(client, model, brief, "Groq", _ => { }, toolsWithAnswerSchema: false);

    /// <summary>The client a deployment uses: Groq's endpoint. A test hands it a <paramref name="transport"/>.</summary>
    public static ResponsesClient CreateClient(string apiKey, PipelineTransport? transport = null) =>
        ResponsesConversation.CreateClient(apiKey, Endpoint, transport);
}
