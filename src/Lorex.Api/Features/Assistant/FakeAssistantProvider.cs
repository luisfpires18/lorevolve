using System.Text.Json;
using System.Text.RegularExpressions;

namespace Lorex.Api.Features.Assistant;

/// <summary>
/// A model stand-in with no network and no key, for the local server and the Playwright suite (<c>Assistant:Provider</c>
/// <c>Fake</c>), as the in-memory object store stands in for R2. It drives the real tools through the real loop, so what
/// it answers is read from the universe; only the wording is canned.
///
/// Deterministic, by plain rules:
/// <list type="number">
/// <item>It searches the question's capitalised words - not its first word, and not "I" - or answers that it found no
/// name to look for.</item>
/// <item>It reads the first entry, story or scene the search found - or answers that LoreX records nothing about them.</item>
/// <item>A question asking for ideas or possibilities is answered as a suggestion; one starting "Does", "Did", "Could",
/// "Is" or "Was" as an inference; anything else as recorded, from the object's own summary.</item>
/// </list>
/// Every answer cites the one object it read. Nothing it reads is ever followed as an instruction.
/// </summary>
public sealed partial class FakeAssistantProvider : IAssistantProvider
{
    public bool IsConfigured => true;

    public IAssistantConversation Begin(AssistantBrief brief) =>
        new Conversation(brief.Messages.LastOrDefault(message => message.Role == AssistantRole.User)?.Text ?? string.Empty);

    [GeneratedRegex(@"\p{Lu}[\p{L}\p{N}]*")]
    private static partial Regex CapitalisedWord();

    private sealed class Conversation(string question) : IAssistantConversation
    {
        private int _step;
        private int _calls;
        private string _keywords = string.Empty;

        public Task<AssistantModelTurn> NextAsync(
            IReadOnlyList<AssistantToolResult> results,
            bool toolsAllowed,
            CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            _step++;

            if (_step == 1)
            {
                var asked = question.Trim();
                _keywords = string.Join(
                    ' ',
                    CapitalisedWord().Matches(asked).Where(match => match.Index > 0 && match.Length > 1).Select(match => match.Value));
                return Task.FromResult(_keywords.Length == 0
                    ? Answer(Segment("note", "Ask about someone or something by name, and I'll look it up in this universe."))
                    : Call(AssistantTools.SearchUniverse, new { query = _keywords }));
            }

            using var document = JsonDocument.Parse(results.Count > 0 ? results[0].Output : "{}");
            var root = document.RootElement;

            if (_step == 2)
            {
                var found = root.TryGetProperty("results", out var list)
                    ? list.EnumerateArray().FirstOrDefault(result => result.GetProperty("kind").GetString() is "lore" or "story" or "scene")
                    : default;

                if (found.ValueKind != JsonValueKind.Object)
                {
                    return Task.FromResult(Answer(Segment("note", $"LoreX doesn't currently record anything about {_keywords}.")));
                }

                var tool = found.GetProperty("kind").GetString() switch
                {
                    "story" => AssistantTools.GetStory,
                    "scene" => AssistantTools.GetScene,
                    _ => AssistantTools.GetLore,
                };

                return Task.FromResult(tool == AssistantTools.GetScene
                    ? Call(tool, new { id = found.GetProperty("id").GetString(), include_prose = false })
                    : Call(tool, new { id = found.GetProperty("id").GetString() }));
            }

            var id = root.GetProperty("id").GetString() ?? string.Empty;
            var name = (root.TryGetProperty("name", out var named) ? named : root.GetProperty("title")).GetString();
            var summary = root.TryGetProperty("summary", out var said) ? said.GetString()
                : root.TryGetProperty("premise", out var premise) ? premise.GetString()
                : null;

            var first = question.TrimStart().Split(' ', 2)[0];
            if (question.Contains("ideas", StringComparison.OrdinalIgnoreCase)
                || question.Contains("possib", StringComparison.OrdinalIgnoreCase))
            {
                return Task.FromResult(Answer(Segment(
                    "suggestion",
                    $"One idea for {name}: a promise made long ago comes due. Another: someone close to {name} has kept a secret. A third: {name} is chasing something only they can see.",
                    id)));
            }

            if (first is "Does" or "Did" or "Could" or "Is" or "Was")
            {
                return Task.FromResult(Answer(Segment(
                    "inference",
                    $"LoreX doesn't say so directly, but what it records about {name} suggests it's likely.",
                    id)));
            }

            return Task.FromResult(Answer(Segment(
                "recorded",
                summary is null ? $"LoreX records {name}, without a summary yet." : $"{name}: {summary}",
                id)));
        }

        private AssistantModelTurn Call(string tool, object arguments) =>
            new([new AssistantToolCall($"fake-{++_calls}", tool, JsonSerializer.Serialize(arguments))], null);

        private static AssistantModelTurn Answer(object segment) =>
            new([], JsonSerializer.Serialize(new { segments = new[] { segment } }));

        private static object Segment(string kind, string text, params string[] sources) => new { kind, text, sources };
    }
}
