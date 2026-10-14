namespace Lorex.Api.Features.Assistant;

// The boundary between Lorex and whichever language model answers (ADR 0045). Everything that crosses it is Lorex's own
// type: no provider SDK type leaves its implementation, and no Lorex data reaches a provider except through these. A
// provider only carries messages; it never reads the database, never runs a tool and never sees a universe id.

/// <summary>Who wrote a message in the conversation.</summary>
public enum AssistantRole
{
    User = 0,
    Assistant = 1,
}

/// <summary>One plain-text message of the conversation so far.</summary>
public sealed record AssistantMessage(AssistantRole Role, string Text);

/// <summary>One read-only tool the model may ask for: its name, what it does, and its parameters as a JSON schema.</summary>
public sealed record AssistantToolDefinition(string Name, string Description, string ParametersSchema);

/// <summary>
/// What one conversation with the model starts from: the standing instructions, the messages so far ending with the
/// question, the tools it may ask for, and the JSON schema its final answer must follow.
/// </summary>
public sealed record AssistantBrief(
    string Instructions,
    IReadOnlyList<AssistantMessage> Messages,
    IReadOnlyList<AssistantToolDefinition> Tools,
    string AnswerSchema,
    int MaxOutputTokens);

/// <summary>A tool the model asked for. <paramref name="Arguments"/> is the model's JSON, untrusted until a tool parses it.</summary>
public sealed record AssistantToolCall(string CallId, string Name, string Arguments);

/// <summary>What a tool returned, as the text handed back to the model.</summary>
public sealed record AssistantToolResult(string CallId, string Output);

/// <summary>
/// The model's reply to one step: the tools it asks for, or - when it asks for none - its answer as JSON text, still
/// unchecked. Token counts are what the provider reported, for the log; zero when it reports none.
/// </summary>
public sealed record AssistantModelTurn(
    IReadOnlyList<AssistantToolCall> ToolCalls,
    string? Answer,
    int InputTokens = 0,
    int OutputTokens = 0);

/// <summary>
/// A language model, as narrowly as the assistant needs one. The assistant's orchestration owns everything else: the
/// tools, the loop and its limits, and what an answer may claim.
/// </summary>
public interface IAssistantProvider
{
    /// <summary>False when no provider is configured: the assistant is off, and nothing else in Lorex notices.</summary>
    bool IsConfigured { get; }

    IAssistantConversation Begin(AssistantBrief brief);
}

/// <summary>
/// One question's exchange with the model. The provider keeps whatever it must send again on the next step; the caller
/// only hands over what the tools returned, and says whether the model may still ask for tools.
/// </summary>
public interface IAssistantConversation
{
    Task<AssistantModelTurn> NextAsync(
        IReadOnlyList<AssistantToolResult> results,
        bool toolsAllowed,
        CancellationToken cancellationToken);
}

/// <summary>How a provider failed, as much as a person needs to know.</summary>
public enum AssistantFailure
{
    /// <summary>The provider refused or broke: an error answer, a network failure, a reply that could not be read.</summary>
    Failed = 0,

    /// <summary>The provider is rate limiting this host.</summary>
    Busy = 1,

    /// <summary>The provider did not answer in time.</summary>
    TimedOut = 2,
}

/// <summary>
/// A provider could not answer. The message is Lorex's own and never shown; whatever the provider said is only ever the
/// inner exception, and only ever logged, so no key, prompt or provider wording reaches a person.
/// </summary>
public sealed class AssistantProviderException(AssistantFailure failure, string message, Exception? innerException = null)
    : Exception(message, innerException)
{
    public AssistantFailure Failure { get; } = failure;
}

/// <summary>What is registered when no provider is configured. Never begins anything: the endpoint answers 503 first.</summary>
public sealed class UnavailableAssistantProvider : IAssistantProvider
{
    public bool IsConfigured => false;

    public IAssistantConversation Begin(AssistantBrief brief) =>
        throw new InvalidOperationException("No assistant provider is configured.");
}
