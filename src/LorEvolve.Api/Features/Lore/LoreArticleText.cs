using System.Text;
using System.Text.Json;

namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// Reduces the Tiptap document stored in <see cref="EntityArticle.Content"/> to the plain text an
/// author actually wrote, so the article can be indexed as prose rather than as editor JSON.
///
/// The document is a ProseMirror tree. Every character the author typed lives in the
/// <c>text</c> property of a text node; everything else - <c>type</c>, <c>attrs</c>,
/// <c>marks</c>, node names like <c>paragraph</c> or <c>heading</c> - is structure the author
/// never wrote and must never be searchable, or a query for "paragraph" would match every
/// entry in the universe.
///
/// Word boundaries follow the same rule from the other side. Marks split a single word across
/// sibling text nodes ("he" + "llo" for a half-bolded word), so nothing is inserted between
/// inline siblings; a block node ends with a newline instead, so the last word of one paragraph
/// and the first of the next stay two words.
///
/// Nothing here trusts the shape it is handed. The document is validated on the way in by
/// <see cref="LoreContent"/>, but rows written before that validation existed, or by a future
/// editor version, still have to index rather than throw: indexing runs inside the write that
/// produced the content, and a malformed article must not be able to refuse an author's save.
/// Unreadable content extracts to an empty string.
/// </summary>
public static class LoreArticleText
{
    /// <summary>Matches <see cref="LoreContent"/>, so a document it accepts is one this reads.</summary>
    private const int MaxDepth = 40;

    /// <summary>
    /// The author's prose, with runs of whitespace collapsed to single spaces. Empty when there
    /// is nothing to index, including when the document cannot be read at all.
    /// </summary>
    public static string Extract(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return string.Empty;
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(content);
        }
        catch (JsonException)
        {
            return string.Empty;
        }

        var builder = new StringBuilder();

        using (document)
        {
            Walk(document.RootElement, 0, builder);
        }

        return Collapse(builder);
    }

    private static void Walk(JsonElement node, int depth, StringBuilder builder)
    {
        if (depth > MaxDepth || node.ValueKind != JsonValueKind.Object)
        {
            return;
        }

        // A text node carries its characters and nothing else. Appended as-is: the space that
        // separates two words of a marked-up phrase is part of the text itself.
        if (node.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
        {
            builder.Append(text.GetString());
        }

        if (node.TryGetProperty("content", out var children)
            && children.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in children.EnumerateArray())
            {
                Walk(child, depth + 1, builder);
            }
        }

        // Every container and every leaf that is not text ends a run of words: a paragraph, a
        // list item, a table cell, a hard break. Collapsing turns the newline into one space.
        if (!IsTextNode(node))
        {
            builder.Append('\n');
        }
    }

    private static bool IsTextNode(JsonElement node) =>
        node.TryGetProperty("type", out var type)
        && type.ValueKind == JsonValueKind.String
        && type.GetString() == "text";

    /// <summary>
    /// One space between words, nothing at the ends. The tokenizer would ignore the difference,
    /// but a stored index row is easier to read back when it looks like a sentence.
    /// </summary>
    private static string Collapse(StringBuilder builder)
    {
        var result = new StringBuilder(builder.Length);
        var pendingSpace = false;

        for (var index = 0; index < builder.Length; index++)
        {
            var character = builder[index];

            if (char.IsWhiteSpace(character))
            {
                pendingSpace = result.Length > 0;
                continue;
            }

            if (pendingSpace)
            {
                result.Append(' ');
                pendingSpace = false;
            }

            result.Append(character);
        }

        return result.ToString();
    }
}
