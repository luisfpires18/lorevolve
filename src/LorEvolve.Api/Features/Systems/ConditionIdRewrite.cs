using System.Text.Json;
using System.Text.Json.Nodes;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// Rewrites the ids inside a stored condition, which is what lets a condition survive a restore.
///
/// A restore gives every record a new id (ADR 0032). A condition names records by id - the rule a
/// <c>ruleHolds</c> depends on, the subject a <c>subject</c> operand points at, a <c>reference</c> literal - so a
/// condition carried through a restore unchanged would name rows that are not in the restored universe. This walks
/// the tree and replaces exactly those ids through the restore's own map.
///
/// <b>Only the id positions, and only ids the map knows.</b> Nothing else in the tree is touched: an attribute
/// name, a relation type, a number, a time point and a text literal all pass through byte for byte. An id the map
/// does not know is left as it was, so the restored rule says plainly that it names something the backup did not
/// hold, and evaluation reports <c>invalid_reference</c> rather than a quietly different rule.
///
/// <b>The structure is not re-validated here.</b> A tree that was refused on save was never stored, and
/// <c>ConditionSchema</c> is what a save is held to. This is a substitution, and a tree it cannot understand is
/// returned unchanged.
/// </summary>
public static class ConditionIdRewrite
{
    /// <summary>
    /// The condition with every known id replaced. <paramref name="map"/> answers null for an id it does not know,
    /// and that id is left alone. Returns the input unchanged when it does not parse.
    /// </summary>
    public static string Translate(string conditionJson, Func<Guid, Guid?> map)
    {
        JsonNode? root;
        try
        {
            root = JsonNode.Parse(conditionJson);
        }
        catch (JsonException)
        {
            return conditionJson;
        }

        if (root is null)
        {
            return conditionJson;
        }

        Walk(root, map);
        return root.ToJsonString();
    }

    private static void Walk(JsonNode node, Func<Guid, Guid?> map)
    {
        switch (node)
        {
            case JsonObject obj:
                RewriteObject(obj, map);

                foreach (var property in obj.ToList())
                {
                    if (property.Value is { } child)
                    {
                        Walk(child, map);
                    }
                }

                break;

            case JsonArray array:
                foreach (var item in array)
                {
                    if (item is { } child)
                    {
                        Walk(child, map);
                    }
                }

                break;
        }
    }

    /// <summary>
    /// The four places an id is written: a <c>ruleHolds</c>'s rule, a <c>subject</c> operand (never the literal
    /// <c>self</c>), a <c>reference</c> literal, and a where-clause value whose declared type is
    /// <c>reference</c>. Every one of them is a type the specification calls a reference or a rule id; nothing
    /// else in the tree holds one.
    /// </summary>
    private static void RewriteObject(JsonObject obj, Func<Guid, Guid?> map)
    {
        if (obj.TryGetPropertyValue("kind", out var kind)
            && kind?.GetValueKind() == JsonValueKind.String
            && kind.GetValue<string>() == "ruleHolds")
        {
            Replace(obj, "ruleId", map);
        }

        if (obj.TryGetPropertyValue("subject", out var subject)
            && subject?.GetValueKind() == JsonValueKind.String
            && subject.GetValue<string>() != "self")
        {
            Replace(obj, "subject", map);
        }

        if (obj.TryGetPropertyValue("type", out var type)
            && type?.GetValueKind() == JsonValueKind.String
            && type.GetValue<string>() == "reference")
        {
            // A literal operand writes the value under "literal", a where-clause under "value".
            Replace(obj, "literal", map);
            Replace(obj, "value", map);
        }
    }

    private static void Replace(JsonObject obj, string property, Func<Guid, Guid?> map)
    {
        if (!obj.TryGetPropertyValue(property, out var value)
            || value?.GetValueKind() != JsonValueKind.String
            || !Guid.TryParse(value.GetValue<string>(), out var id))
        {
            return;
        }

        if (map(id) is { } translated)
        {
            obj[property] = translated.ToString();
        }
    }
}
