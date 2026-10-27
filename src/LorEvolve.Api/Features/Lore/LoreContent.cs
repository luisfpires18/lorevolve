using System.Text.Json;

namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// Structural validation for the Tiptap document stored in <see cref="EntityArticle.Content"/>.
///
/// The editor renders from this document through ProseMirror's schema, which builds DOM
/// nodes rather than parsing HTML, so text can never become markup. The one thing that
/// does cross that boundary is a link's href, which lands on an anchor element: a
/// <c>javascript:</c> href would execute on click. Those are rejected here, at the edge,
/// rather than relied on being filtered by the client.
/// </summary>
public static class LoreContent
{
    private const int MaxDepth = 40;

    private static readonly string[] AllowedLinkSchemes = ["http", "https", "mailto"];

    public static bool TryValidate(string? content, out string? error)
    {
        error = null;

        if (string.IsNullOrWhiteSpace(content))
        {
            return true;
        }

        if (content.Length > LoreLimits.ContentMaxLength)
        {
            error = "That article is too long to save.";
            return false;
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(content);
        }
        catch (JsonException)
        {
            error = "The article content could not be read.";
            return false;
        }

        using (document)
        {
            var root = document.RootElement;

            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("type", out var type)
                || type.ValueKind != JsonValueKind.String
                || type.GetString() != "doc")
            {
                error = "The article content is not a document.";
                return false;
            }

            return Walk(root, 0, ref error);
        }
    }

    private static bool Walk(JsonElement node, int depth, ref string? error)
    {
        if (depth > MaxDepth)
        {
            error = "The article content is nested too deeply.";
            return false;
        }

        if (node.TryGetProperty("marks", out var marks) && marks.ValueKind == JsonValueKind.Array)
        {
            foreach (var mark in marks.EnumerateArray())
            {
                if (!IsMarkAllowed(mark))
                {
                    error = "Links in the article must be http, https or mailto addresses.";
                    return false;
                }
            }
        }

        if (node.TryGetProperty("content", out var children) && children.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in children.EnumerateArray())
            {
                if (!Walk(child, depth + 1, ref error))
                {
                    return false;
                }
            }
        }

        return true;
    }

    private static bool IsMarkAllowed(JsonElement mark)
    {
        // Every shape below is attacker-controlled, so each access checks its kind first:
        // a non-string "type" or a non-object "attrs" must be inert, not an exception.
        if (mark.ValueKind != JsonValueKind.Object
            || !mark.TryGetProperty("type", out var type)
            || type.ValueKind != JsonValueKind.String
            || type.GetString() != "link")
        {
            return true;
        }

        if (!mark.TryGetProperty("attrs", out var attrs)
            || attrs.ValueKind != JsonValueKind.Object
            || !attrs.TryGetProperty("href", out var hrefElement)
            || hrefElement.ValueKind != JsonValueKind.String)
        {
            return true;
        }

        var href = hrefElement.GetString();
        if (string.IsNullOrWhiteSpace(href))
        {
            return true;
        }

        href = href.Trim();

        // Relative links carry no scheme and cannot execute.
        if (href.StartsWith('/') || href.StartsWith('#'))
        {
            return true;
        }

        var separator = href.IndexOf(':', StringComparison.Ordinal);
        if (separator <= 0)
        {
            return true;
        }

        var scheme = href[..separator];
        return AllowedLinkSchemes.Contains(scheme, StringComparer.OrdinalIgnoreCase);
    }
}
