using System.Text.Json.Nodes;
using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.AiChanges;

/// <summary>
/// An article change's blocks, and the Tiptap document they make (ADR 0048). An AI never sends the document: it sends plain
/// text in a closed set of block kinds, and LoreX writes the nodes - paragraphs, headings, lists and quotes of the editor's
/// own schema, text nodes and hard breaks, never a mark, an attribute an AI chose, or a link. The document then passes the
/// article's own validation exactly as a save from the editor does. Nothing here reads the prose for meaning.
/// </summary>
internal static class AiChangeArticles
{
    /// <summary>The most blocks one change carries: a long article, well inside the article's own size bound.</summary>
    public const int MaxBlocks = 400;

    /// <summary>The most items one list carries.</summary>
    public const int MaxItems = 100;

    public static readonly string[] Kinds = ["paragraph", "heading", "bullet_list", "numbered_list", "quote"];

    /// <summary>What is wrong with the blocks, or null: kinds of the closed set, a heading's level, a list's items.</summary>
    public static string? Problem(List<ArticleBlock> blocks)
    {
        if (blocks.Count > MaxBlocks)
        {
            return $"One change can carry up to {MaxBlocks} blocks. Split it into more changes.";
        }

        foreach (var block in blocks)
        {
            switch (block.Kind)
            {
                case "paragraph" or "quote" when block.Items is { Count: > 0 }:
                    return "A paragraph or a quote takes its words in text, not items.";
                case "heading" when block.Level is not (2 or 3 or 4):
                    return "A heading's level is 2, 3 or 4.";
                case "heading" when string.IsNullOrWhiteSpace(block.Text):
                    return "A heading needs its text.";
                case "bullet_list" or "numbered_list" when block.Items is not { Count: > 0 } || block.Items.Any(string.IsNullOrWhiteSpace):
                    return "A list needs at least one item, and every item its text.";
                case "bullet_list" or "numbered_list" when block.Items!.Count > MaxItems:
                    return $"A list can hold up to {MaxItems} items.";
                case "bullet_list" or "numbered_list" when block.Text is not null:
                    return "A list takes its words in items, not text.";
                case var kind when !Kinds.Contains(kind):
                    return "A block is a paragraph, heading, bullet_list, numbered_list or quote.";
            }
        }

        return null;
    }

    /// <summary>
    /// The article as it would be stored: <paramref name="blocks"/> after <paramref name="current"/> when appending, in place of
    /// it otherwise. No blocks replacing is the empty article, which clears it. <paramref name="current"/> is the stored document
    /// - only ever one the article's validation already accepted - or empty.
    /// </summary>
    public static string Document(string current, bool append, List<ArticleBlock> blocks)
    {
        if (!append && blocks.Count == 0)
        {
            return string.Empty;
        }

        var root = append && !string.IsNullOrWhiteSpace(current) && JsonNode.Parse(current) is JsonObject stored
            ? stored
            : new JsonObject { ["type"] = "doc" };
        if (root["content"] is not JsonArray content)
        {
            content = [];
            root["content"] = content;
        }

        foreach (var block in blocks)
        {
            content.Add(Node(block));
        }

        return root.ToJsonString();
    }

    /// <summary>The plain text of an article change, as the review shows it: the article's own extraction of the blocks' document.</summary>
    public static string Text(List<ArticleBlock> blocks) => LoreArticleText.Extract(Document(string.Empty, false, blocks));

    private static JsonObject Node(ArticleBlock block) => block.Kind switch
    {
        "heading" => new JsonObject
        {
            ["type"] = "heading",
            ["attrs"] = new JsonObject { ["level"] = block.Level },
            ["content"] = Inline(block.Text),
        },
        "bullet_list" => List("bulletList", block.Items!),
        "numbered_list" => List("orderedList", block.Items!),
        "quote" => new JsonObject { ["type"] = "blockquote", ["content"] = new JsonArray(Paragraph(block.Text)) },
        _ => Paragraph(block.Text),
    };

    private static JsonObject List(string type, List<string> items) => new()
    {
        ["type"] = type,
        ["content"] = new JsonArray([.. items.Select(item => (JsonNode)new JsonObject
        {
            ["type"] = "listItem",
            ["content"] = new JsonArray(Paragraph(item)),
        })]),
    };

    private static JsonObject Paragraph(string? text)
    {
        var paragraph = new JsonObject { ["type"] = "paragraph" };
        if (Inline(text) is { Count: > 0 } inline)
        {
            paragraph["content"] = inline;
        }

        return paragraph;
    }

    /// <summary>A block's text as text nodes, each line break a hard break - the one inline node an AI's text becomes.</summary>
    private static JsonArray Inline(string? text)
    {
        var nodes = new JsonArray();
        var lines = (text ?? string.Empty).Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n').Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            if (index > 0)
            {
                nodes.Add(new JsonObject { ["type"] = "hardBreak" });
            }

            if (lines[index].Length > 0)
            {
                nodes.Add(new JsonObject { ["type"] = "text", ["text"] = lines[index] });
            }
        }

        return nodes;
    }
}
