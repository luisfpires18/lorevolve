using System.Text.Json;
using LorEvolve.Api.Features.Assistant;

namespace LorEvolve.Api.Tests;

/// <summary>One step of a scripted model: which step it is, what it was briefed with, what the tools returned, and whether it may still ask for tools.</summary>
public sealed record ScriptedStep(int Number, AssistantBrief Brief, IReadOnlyList<AssistantToolResult> Results, bool ToolsAllowed);

/// <summary>
/// A model whose every step a test writes. No network, no key: it answers with whatever <see cref="Script"/> returns, and
/// records everything it was handed so a test can see exactly what crossed the provider boundary.
/// </summary>
public sealed class ScriptedAssistantProvider : IAssistantProvider
{
    public bool IsConfigured => true;

    /// <summary>The next turn for each step. Unset, the model answers with a note and reads nothing.</summary>
    public Func<ScriptedStep, CancellationToken, Task<AssistantModelTurn>> Script { get; set; } =
        (_, _) => Task.FromResult(Answer(("note", "Nothing to say.", [])));

    /// <summary>Every step the model took, across every question, in order.</summary>
    public List<ScriptedStep> Steps { get; } = [];

    public IAssistantConversation Begin(AssistantBrief brief) => new Conversation(this, brief);

    /// <summary>Clears what earlier questions left, and scripts the next.</summary>
    public void Use(Func<ScriptedStep, AssistantModelTurn> script)
    {
        Steps.Clear();
        Script = (step, _) => Task.FromResult(script(step));
    }

    public static AssistantModelTurn Calls(params (string Tool, object Arguments)[] calls) =>
        new([.. calls.Select((call, index) => new AssistantToolCall($"call-{index}", call.Tool, JsonSerializer.Serialize(call.Arguments)))], null);

    public static AssistantModelTurn Answer(params (string Kind, string Text, string[] Sources)[] segments) =>
        new([], JsonSerializer.Serialize(new { segments = segments.Select(segment => new { kind = segment.Kind, text = segment.Text, sources = segment.Sources }) }));

    /// <summary>Every tool result the model was handed, across every step, as parsed JSON.</summary>
    public List<JsonElement> ResultsSeen() =>
        [.. Steps.SelectMany(step => step.Results).Select(result => JsonDocument.Parse(result.Output).RootElement.Clone())];

    private sealed class Conversation(ScriptedAssistantProvider provider, AssistantBrief brief) : IAssistantConversation
    {
        private int _number;

        public Task<AssistantModelTurn> NextAsync(
            IReadOnlyList<AssistantToolResult> results,
            bool toolsAllowed,
            CancellationToken cancellationToken)
        {
            var step = new ScriptedStep(++_number, brief, results, toolsAllowed);
            provider.Steps.Add(step);
            return provider.Script(step, cancellationToken);
        }
    }
}
