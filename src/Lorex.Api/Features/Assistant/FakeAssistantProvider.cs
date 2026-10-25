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
///
/// In propose mode (ADR 0047) it reads the change options, then stages one new lore entry for every name the question puts
/// in double quotes - of the first type with no required fields - and, for two or more, a relationship of the first kind
/// from the first to the second, referring to them by their change ids. Then it says the changes wait for review.
///
/// Words in the question add issue 45's resources (ADR 0048), each only when the options allow it: "article" writes each new
/// entry a one-paragraph article; "rule" proposes a world rule named after the first name; "arc" a plot arc of that name in
/// the first story, with one beat about the first entry; "idea" an idea of that name about the first entry.
///
/// Issue 59 (ADR 0062): "type" instead stages a schema proposal - a lore type named by the first name, with a short text
/// field for each further name, the last one a link to the first existing type when the question says "link"; "picture"
/// searches for the first name and asks for a picture for that entry, which the person then uploads on the review page.
/// </summary>
public sealed partial class FakeAssistantProvider : IAssistantProvider
{
    public bool IsConfigured => true;

    public IAssistantConversation Begin(AssistantBrief brief)
    {
        var question = brief.Messages.LastOrDefault(message => message.Role == AssistantRole.User)?.Text ?? string.Empty;
        return brief.Tools.Any(tool => tool.Name == AssistantProposing.ProposeTool)
            ? new Proposing(question)
            : new Conversation(question);
    }

    [GeneratedRegex("\"([^\"]{1,80})\"")]
    private static partial Regex QuotedName();

    private sealed class Proposing(string question) : IAssistantConversation
    {
        private int _step;

        public Task<AssistantModelTurn> NextAsync(
            IReadOnlyList<AssistantToolResult> results,
            bool toolsAllowed,
            CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            _step++;
            var names = QuotedName().Matches(question).Select(match => match.Groups[1].Value.Trim()).Where(name => name.Length > 0).Distinct().ToList();

            if (_step == 1)
            {
                return Task.FromResult(names.Count == 0
                    ? Answer(Segment("note", "Tell me what to create, with each name in double quotes, and I'll prepare it for you to review."))
                    : Call(AssistantProposing.OptionsTool, new { }));
            }

            using var document = JsonDocument.Parse(results.Count > 0 ? results[0].Output : "{}");
            var root = document.RootElement;
            bool Asked(string word) => question.Contains(word, StringComparison.OrdinalIgnoreCase);

            // A search made for a picture: ask for one for the entry it found.
            if (root.TryGetProperty("results", out var found))
            {
                var entry = found.EnumerateArray().FirstOrDefault(result => result.GetProperty("kind").GetString() == "lore");
                return Task.FromResult(entry.ValueKind != JsonValueKind.Object
                    ? Answer(Segment("note", $"I couldn't find {names[0]} to ask for a picture of."))
                    : Call(AssistantProposing.ProposeTool, new
                    {
                        summary = $"A picture of {names[0]}",
                        operations = new object[]
                        {
                            new { id = "picture-1", action = "create", resource = "image", image = new { entry = entry.GetProperty("id").GetString(), note = names[0] } },
                        },
                    }));
            }

            if (_step == 2 && Asked("type") && root.GetProperty("allowed").EnumerateArray().Any(item => item.GetString() == "create lore_type"))
            {
                var linkTo = root.GetProperty("loreTypes").EnumerateArray().First().GetProperty("id").GetString();
                var schema = new List<object> { new { id = "type-1", action = "create", resource = "lore_type", loreType = new { name = names[0] } } };
                schema.AddRange(names.Skip(1).Select((name, index) => (object)(Asked("link") && index == names.Count - 2
                    ? new { id = $"field-{index + 1}", action = "create", resource = "lore_field", field = new { type = new { @ref = "type-1" }, name, kind = "link", linksToType = new { id = linkTo } } }
                    : new { id = $"field-{index + 1}", action = "create", resource = "lore_field", field = new { type = new { @ref = "type-1" }, name, kind = "short_text", linksToType = (object?)null } })));
                return Task.FromResult(Call(AssistantProposing.ProposeTool, new { summary = $"New type: {names[0]}", operations = schema }));
            }

            if (_step == 2 && Asked("picture"))
            {
                return Task.FromResult(Call(AssistantTools.SearchUniverse, new { query = names[0] }));
            }

            if (_step == 2)
            {
                var type = root.GetProperty("loreTypes").EnumerateArray()
                    .FirstOrDefault(candidate => candidate.GetProperty("fields").EnumerateArray().All(field => !field.GetProperty("required").GetBoolean()));
                if (type.ValueKind != JsonValueKind.Object)
                {
                    return Task.FromResult(Answer(Segment("note", "Every lore type here has required fields, so I can't prepare these on my own.")));
                }

                var typeId = type.GetProperty("id").GetString();
                var operations = names.Select((name, index) => (object)new
                {
                    id = $"entry-{index + 1}",
                    action = "create",
                    resource = "lore_entry",
                    lore = new { typeId, name },
                }).ToList();

                var kinds = root.GetProperty("relationshipTypes").EnumerateArray().ToList();
                if (names.Count >= 2 && kinds.Count > 0)
                {
                    operations.Add(new
                    {
                        id = "link-1",
                        action = "create",
                        resource = "relationship",
                        relationship = new
                        {
                            typeId = kinds[0].GetProperty("id").GetString(),
                            source = new { @ref = "entry-1" },
                            target = new { @ref = "entry-2" },
                        },
                    });
                }

                var allowed = root.GetProperty("allowed").EnumerateArray().Select(item => item.GetString()).ToHashSet();

                if (Asked("article") && allowed.Contains("update article"))
                {
                    operations.AddRange(names.Select((name, index) => (object)new
                    {
                        id = $"article-{index + 1}",
                        action = "update",
                        resource = "article",
                        article = new
                        {
                            entry = new { @ref = $"entry-{index + 1}" },
                            mode = "append",
                            blocks = new object[] { new { kind = "paragraph", text = $"{name}, as the assistant wrote it." } },
                        },
                    }));
                }

                if (Asked("rule") && allowed.Contains("create world_rule"))
                {
                    operations.Add(new { id = "rule-1", action = "create", resource = "world_rule", worldRule = new { title = $"The rule of {names[0]}", description = "Kept as written." } });
                }

                var story = root.GetProperty("stories").EnumerateArray().FirstOrDefault();
                if (Asked("arc") && allowed.Contains("create plot_arc") && story.ValueKind == JsonValueKind.Object)
                {
                    operations.Add(new { id = "arc-1", action = "create", resource = "plot_arc", plotArc = new { story = new { id = story.GetProperty("id").GetString() }, title = names[0] } });
                    operations.Add(new
                    {
                        id = "beat-1",
                        action = "create",
                        resource = "plot_beat",
                        plotBeat = new { arc = new { @ref = "arc-1" }, title = $"{names[0]} begins", lore = new object[] { new { @ref = "entry-1" } } },
                    });
                }

                if (Asked("idea") && allowed.Contains("create idea"))
                {
                    operations.Add(new
                    {
                        id = "idea-1",
                        action = "create",
                        resource = "idea",
                        idea = new { title = $"What if {names[0]}?", body = "", references = new object[] { new { kind = "lore_entry", @ref = "entry-1" } } },
                    });
                }

                return Task.FromResult(Call(AssistantProposing.ProposeTool, new { summary = $"New lore: {string.Join(", ", names)}", operations }));
            }

            return Task.FromResult(root.TryGetProperty("proposalId", out _)
                ? Answer(Segment("note", $"I've prepared {root.GetProperty("changes").GetInt32()} changes for you to review in Pending AI Changes. Nothing changes until you approve them."))
                : Answer(Segment("note", "I couldn't prepare those changes. LoreX found a problem with them.")));
        }

        private int _calls;

        private AssistantModelTurn Call(string tool, object arguments) =>
            new([new AssistantToolCall($"fake-propose-{++_calls}", tool, JsonSerializer.Serialize(arguments))], null);
    }

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

    }

    private static AssistantModelTurn Answer(object segment) =>
        new([], JsonSerializer.Serialize(new { segments = new[] { segment } }));

    private static object Segment(string kind, string text, params string[] sources) => new { kind, text, sources };
}
