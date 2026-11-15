using System.Text.Json;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// The closed sets and the static budgets of a World Logic condition, and the structural check a save is held to
/// (ADR 0072, <c>docs/architecture/world-logic-condition-spec.md</c>).
///
/// <b>Nothing here evaluates anything.</b> This class decides whether a stored tree is one the specification
/// describes: every node kind, operator, source, field and value type is matched against a list in this file, and
/// the limits that are enforced on save are enforced here. The evaluator (LOREX-018) reads the same lists, so the
/// two cannot disagree about what version 1 is.
///
/// <b>Why validate on save at all.</b> A stored condition that could not be read would turn every evaluation of
/// it into an error an author cannot act on. Refusing it on save puts the message where the mistake was made, and
/// it is what lets the evaluator treat an unreadable tree as a defect rather than a normal case.
///
/// <b>An id here is a GUID.</b> Every subject, reference literal and <c>ruleHolds</c> id a save stores names a row
/// in this database, so this check requires one. The specification's fixtures use readable strings instead, because
/// they are never saved: they are read straight into the evaluator's own fact source.
/// </summary>
public static class ConditionSchema
{
    /// <summary>The only condition schema version this build implements.</summary>
    public const int CurrentVersion = 1;

    /// <summary>Static limits from section 8 of the specification: the ones a save enforces.</summary>
    public const int MaxDepth = 16;

    public const int MaxNodes = 256;

    public const int MaxWhereClauses = 8;

    public const int MaxExceptions = 16;

    public const int MaxConditionBytes = 32_768;

    /// <summary>How long an exception's id may be. It is an author's own label, not a sentence.</summary>
    public const int MaxExceptionIdLength = 80;

    public const int MaxDependencyDepth = 8;

    /// <summary>The nine node kinds of version 1.</summary>
    public static readonly string[] NodeKinds =
        ["all", "any", "not", "compare", "exists", "related", "within", "ruleHolds", "always"];

    /// <summary>The six comparison operators. The four orderings apply to numbers and time points only.</summary>
    public static readonly string[] CompareOperators = ["eq", "ne", "lt", "lte", "gt", "gte"];

    /// <summary>A where-clause operator: the six, plus membership for an event's subjects.</summary>
    public static readonly string[] ClauseOperators = ["eq", "ne", "lt", "lte", "gt", "gte", "contains"];

    public static readonly string[] ValueTypes = ["boolean", "number", "text", "timePoint", "reference"];

    public static readonly string[] AlwaysValues = ["true", "false", "unknown"];

    /// <summary>Each fact source and the non-attribute fields a query or operand may name on it.</summary>
    public static readonly IReadOnlyDictionary<string, string[]> SourceFields = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["subjects"] = ["id", "type"],
        ["relations"] = ["type", "fromId", "toId"],
        ["events"] = ["id", "kind", "method", "subjectIds", "at", "canon"],
    };

    /// <summary>
    /// The value type each selectable field carries. A where-clause compares one field against one value, so the
    /// field decides what that value may be: declaring anything else can only ever be a type mismatch when the
    /// condition is evaluated, and is refused on save instead. <c>subjectIds</c> is a set of references, and
    /// membership in it compares one reference.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> FieldTypes = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["subjects.id"] = "reference",
        ["subjects.type"] = "text",
        ["relations.type"] = "text",
        ["relations.fromId"] = "reference",
        ["relations.toId"] = "reference",
        ["events.id"] = "reference",
        ["events.kind"] = "text",
        ["events.method"] = "text",
        ["events.subjectIds"] = "reference",
        ["events.at"] = "timePoint",
        ["events.canon"] = "boolean",
    };

    /// <summary>
    /// The scopes a time point may be written in. A point is ordered only inside one scope, and two eras are two
    /// scopes: version 1 does not store the relation between them (ADR 0022).
    ///
    /// <c>year</c> is the plain signed reckoning a universe that has not named its eras keeps. It is a scope of its
    /// own rather than a calendar date, because a signed year and a date on a calendar are not ordered against each
    /// other any more than two eras are.
    /// </summary>
    public static readonly string[] TimeScopes = ["calendar", "era", "year"];

    /// <summary>
    /// Null when the condition is one version 1 describes; otherwise the first problem, as a stable code and the
    /// path it was found at. The code is from the specification's error list, so a client can say what is wrong in
    /// its own words.
    /// </summary>
    public static ConditionProblem? Validate(string conditionJson, int schemaVersion)
    {
        if (schemaVersion != CurrentVersion)
        {
            return new ConditionProblem("schema_version_unsupported", "condition");
        }

        if (conditionJson.Length > MaxConditionBytes)
        {
            return new ConditionProblem("node_limit", "condition");
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(conditionJson);
        }
        catch (JsonException)
        {
            return new ConditionProblem("invalid_reference", "condition");
        }

        using (document)
        {
            var nodes = 0;
            return ValidateNode(document.RootElement, "condition", depth: 1, ref nodes);
        }
    }

    /// <summary>
    /// Null when the exception list is one version 1 describes; otherwise the first problem.
    ///
    /// The shape is an array of <c>{ id, scope: { kind, projectId? }, when }</c>. Each <c>when</c> is an ordinary
    /// condition tree and is held to exactly the same closed sets and budgets as a rule's own condition, because it
    /// is evaluated by the same evaluator; an exception that could not be read would make a violation permanently
    /// unknown, which is the quietest possible way to lose a finding.
    /// </summary>
    public static ConditionProblem? ValidateExceptions(string exceptionsJson, int schemaVersion)
    {
        if (schemaVersion != CurrentVersion)
        {
            return new ConditionProblem("schema_version_unsupported", "exceptions");
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(exceptionsJson);
        }
        catch (JsonException)
        {
            return new ConditionProblem("invalid_reference", "exceptions");
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Array)
            {
                return new ConditionProblem("node_arity", "exceptions");
            }

            if (root.GetArrayLength() > MaxExceptions)
            {
                return new ConditionProblem("node_arity", "exceptions");
            }

            var ids = new HashSet<string>(StringComparer.Ordinal);
            var index = 0;

            foreach (var exception in root.EnumerateArray())
            {
                var path = $"exceptions[{index++}]";

                if (exception.ValueKind != JsonValueKind.Object)
                {
                    return new ConditionProblem("node_arity", path);
                }

                if (!exception.TryGetProperty("id", out var id)
                    || id.ValueKind != JsonValueKind.String
                    || string.IsNullOrWhiteSpace(id.GetString())
                    || id.GetString()!.Length > MaxExceptionIdLength)
                {
                    return new ConditionProblem("invalid_reference", path);
                }

                // An id is what a finding records as the reason a violation was excused, so two exceptions of one
                // rule cannot share one.
                if (!ids.Add(id.GetString()!))
                {
                    return new ConditionProblem("invalid_reference", path);
                }

                if (!exception.TryGetProperty("scope", out var scope)
                    || scope.ValueKind != JsonValueKind.Object
                    || !scope.TryGetProperty("kind", out var kind)
                    || kind.ValueKind != JsonValueKind.String)
                {
                    return new ConditionProblem("node_arity", $"{path}.scope");
                }

                var hasProject = scope.TryGetProperty("projectId", out var projectId)
                                 && projectId.ValueKind == JsonValueKind.String;

                switch (kind.GetString())
                {
                    case "universe" when !hasProject:
                        break;

                    case "project" when hasProject && Guid.TryParse(projectId.GetString(), out _):
                        break;

                    default:
                        return new ConditionProblem("invalid_reference", $"{path}.scope");
                }

                if (!exception.TryGetProperty("when", out var when))
                {
                    return new ConditionProblem("node_arity", $"{path}.when");
                }

                var nodes = 0;
                if (ValidateNode(when, $"{path}.when", depth: 1, ref nodes) is { } problem)
                {
                    return problem;
                }
            }

            return null;
        }
    }

    /// <summary>
    /// Every rule id the exceptions name, so a save checks them against the declared dependencies the way a
    /// condition's are checked.
    /// </summary>
    public static IReadOnlyList<string> ReferencedRuleIdsInExceptions(string exceptionsJson) =>
        ReferencedRuleIds(exceptionsJson);

    /// <summary>
    /// Every rule id a <c>ruleHolds</c> node in this condition names, so a save can check them against the
    /// declared dependencies. Returns nothing for a condition that does not parse: validation reports that.
    /// </summary>
    public static IReadOnlyList<string> ReferencedRuleIds(string conditionJson)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(conditionJson);
        }
        catch (JsonException)
        {
            return [];
        }

        using (document)
        {
            var ids = new List<string>();
            CollectRuleIds(document.RootElement, ids);
            return ids;
        }
    }

    private static void CollectRuleIds(JsonElement element, List<string> into)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                if (element.TryGetProperty("kind", out var kind)
                    && kind.ValueKind == JsonValueKind.String
                    && kind.GetString() == "ruleHolds"
                    && element.TryGetProperty("ruleId", out var ruleId)
                    && ruleId.ValueKind == JsonValueKind.String)
                {
                    into.Add(ruleId.GetString()!);
                }

                foreach (var property in element.EnumerateObject())
                {
                    CollectRuleIds(property.Value, into);
                }

                break;

            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    CollectRuleIds(item, into);
                }

                break;
        }
    }

    private static ConditionProblem? ValidateNode(JsonElement node, string path, int depth, ref int nodes)
    {
        if (depth > MaxDepth)
        {
            return new ConditionProblem("depth_limit", path);
        }

        if (++nodes > MaxNodes)
        {
            return new ConditionProblem("node_limit", path);
        }

        if (node.ValueKind != JsonValueKind.Object)
        {
            return new ConditionProblem("unknown_node_kind", path);
        }

        if (!node.TryGetProperty("kind", out var kindElement) || kindElement.ValueKind != JsonValueKind.String)
        {
            return new ConditionProblem("unknown_node_kind", path);
        }

        var kind = kindElement.GetString()!;
        if (!NodeKinds.Contains(kind, StringComparer.Ordinal))
        {
            return new ConditionProblem("unknown_node_kind", path);
        }

        switch (kind)
        {
            case "all":
            case "any":
            {
                if (!node.TryGetProperty("of", out var of) || of.ValueKind != JsonValueKind.Array)
                {
                    return new ConditionProblem("node_arity", path);
                }

                if (of.GetArrayLength() == 0)
                {
                    return new ConditionProblem("node_arity", path);
                }

                var index = 0;
                foreach (var child in of.EnumerateArray())
                {
                    if (ValidateNode(child, $"{path}.of[{index++}]", depth + 1, ref nodes) is { } problem)
                    {
                        return problem;
                    }
                }

                return null;
            }

            case "not":
                return node.TryGetProperty("of", out var inner) && inner.ValueKind == JsonValueKind.Object
                    ? ValidateNode(inner, $"{path}.of", depth + 1, ref nodes)
                    : new ConditionProblem("node_arity", path);

            case "compare":
            {
                if (!node.TryGetProperty("op", out var op)
                    || op.ValueKind != JsonValueKind.String
                    || !CompareOperators.Contains(op.GetString()!, StringComparer.Ordinal))
                {
                    return new ConditionProblem("unknown_operator", path);
                }

                return ValidateOperand(node, "left", path, depth, ref nodes)
                       ?? ValidateOperand(node, "right", path, depth, ref nodes);
            }

            case "exists":
                return node.TryGetProperty("query", out var query)
                    ? ValidateQuery(query, $"{path}.query", depth, ref nodes)
                    : new ConditionProblem("node_arity", path);

            case "related":
            {
                if (!node.TryGetProperty("relation", out var relation)
                    || relation.ValueKind != JsonValueKind.String
                    || string.IsNullOrWhiteSpace(relation.GetString()))
                {
                    return new ConditionProblem("node_arity", path);
                }

                return ValidateOperand(node, "from", path, depth, ref nodes)
                       ?? ValidateOperand(node, "to", path, depth, ref nodes);
            }

            case "within":
                return ValidateOperand(node, "point", path, depth, ref nodes)
                       ?? ValidateOperand(node, "from", path, depth, ref nodes)
                       ?? ValidateOperand(node, "to", path, depth, ref nodes);

            case "ruleHolds":
                return node.TryGetProperty("ruleId", out var ruleId)
                       && ruleId.ValueKind == JsonValueKind.String
                       && Guid.TryParse(ruleId.GetString(), out _)
                    ? null
                    : new ConditionProblem("invalid_reference", path);

            case "always":
                return node.TryGetProperty("value", out var value)
                       && value.ValueKind == JsonValueKind.String
                       && AlwaysValues.Contains(value.GetString()!, StringComparer.Ordinal)
                    ? null
                    : new ConditionProblem("node_arity", path);

            default:
                return new ConditionProblem("unknown_node_kind", path);
        }
    }

    private static ConditionProblem? ValidateOperand(JsonElement node, string name, string path, int depth, ref int nodes)
        => node.TryGetProperty(name, out var operand)
            ? ValidateOperandCore(operand, $"{path}.{name}", depth + 1, ref nodes)
            : new ConditionProblem("node_arity", path);

    private static ConditionProblem? ValidateOperandCore(JsonElement operand, string path, int depth, ref int nodes)
    {
        if (depth > MaxDepth)
        {
            return new ConditionProblem("depth_limit", path);
        }

        if (++nodes > MaxNodes)
        {
            return new ConditionProblem("node_limit", path);
        }

        if (operand.ValueKind != JsonValueKind.Object)
        {
            return new ConditionProblem("type_mismatch", path);
        }

        if (operand.TryGetProperty("literal", out _))
        {
            return operand.TryGetProperty("type", out var literalType)
                   && literalType.ValueKind == JsonValueKind.String
                   && ValueTypes.Contains(literalType.GetString()!, StringComparer.Ordinal)
                ? ValidateLiteral(operand, path)
                : new ConditionProblem("type_mismatch", path);
        }

        if (operand.TryGetProperty("attribute", out var attribute))
        {
            if (attribute.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(attribute.GetString()))
            {
                return new ConditionProblem("unknown_field", path);
            }

            return operand.TryGetProperty("of", out var attributeOf)
                ? ValidateOperandCore(attributeOf, $"{path}.of", depth + 1, ref nodes)
                : new ConditionProblem("node_arity", path);
        }

        if (operand.TryGetProperty("field", out var field))
        {
            if (!operand.TryGetProperty("from", out var from)
                || from.ValueKind != JsonValueKind.String
                || !SourceFields.TryGetValue(from.GetString()!, out var fields))
            {
                return new ConditionProblem("unknown_source", path);
            }

            if (field.ValueKind != JsonValueKind.String || !fields.Contains(field.GetString()!, StringComparer.Ordinal))
            {
                return new ConditionProblem("unknown_field", path);
            }

            return operand.TryGetProperty("of", out var fieldOf)
                ? ValidateOperandCore(fieldOf, $"{path}.of", depth + 1, ref nodes)
                : new ConditionProblem("node_arity", path);
        }

        if (operand.TryGetProperty("subject", out var subject))
        {
            if (subject.ValueKind != JsonValueKind.String)
            {
                return new ConditionProblem("invalid_reference", path);
            }

            var text = subject.GetString()!;
            return text == "self" || Guid.TryParse(text, out _)
                ? null
                : new ConditionProblem("invalid_reference", path);
        }

        if (operand.TryGetProperty("count", out var count))
        {
            return ValidateQuery(count, $"{path}.count", depth, ref nodes);
        }

        return new ConditionProblem("type_mismatch", path);
    }

    /// <summary>
    /// A literal's JSON has to match the type it declares, so a save cannot store a condition that can only ever
    /// be a type mismatch. A time point also has to name a scope the specification orders.
    /// </summary>
    private static ConditionProblem? ValidateLiteral(JsonElement operand, string path) =>
        Typed(operand.GetProperty("literal"), operand.GetProperty("type").GetString()!, path);

    /// <summary>
    /// One value against one declared type, shared by a literal operand and a where-clause's <c>value</c>. The two
    /// are the same thing written in two places, and checking only the operand was the gap Codex found on #150:
    /// a clause could declare <c>reference</c> and carry a number, and the save would take it.
    /// </summary>
    private static ConditionProblem? Typed(JsonElement value, string declared, string path)
    {
        var matches = declared switch
        {
            "boolean" => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
            "number" => value.ValueKind == JsonValueKind.Number,
            "text" => value.ValueKind == JsonValueKind.String,
            "reference" => value.ValueKind == JsonValueKind.String && Guid.TryParse(value.GetString(), out _),
            "timePoint" => value.ValueKind == JsonValueKind.String && IsTimePoint(value.GetString()!),
            _ => false,
        };

        return matches ? null : new ConditionProblem("type_mismatch", path);
    }

    /// <summary>
    /// The type an operand has before anything is evaluated, or null when only the stored facts decide it. A
    /// literal declares its own, a count is always a number, and a subject is always a reference; an attribute or a
    /// field depends on what is stored, so it has none here.
    /// </summary>
    private static string? StaticType(JsonElement operand)
    {
        if (operand.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (operand.TryGetProperty("literal", out _)
            && operand.TryGetProperty("type", out var declared)
            && declared.ValueKind == JsonValueKind.String)
        {
            return declared.GetString();
        }

        if (operand.TryGetProperty("count", out _))
        {
            return "number";
        }

        return operand.TryGetProperty("subject", out _) ? "reference" : null;
    }

    /// <summary>A time point is <c>scope:value</c>, with a scope section 6 of the specification names.</summary>
    public static bool IsTimePoint(string value)
    {
        var separator = value.IndexOf(':', StringComparison.Ordinal);
        if (separator <= 0 || separator == value.Length - 1)
        {
            return false;
        }

        return TimeScopes.Contains(value[..separator], StringComparer.Ordinal);
    }

    private static ConditionProblem? ValidateQuery(JsonElement query, string path, int depth, ref int nodes)
    {
        if (++nodes > MaxNodes)
        {
            return new ConditionProblem("node_limit", path);
        }

        if (query.ValueKind != JsonValueKind.Object
            || !query.TryGetProperty("from", out var from)
            || from.ValueKind != JsonValueKind.String
            || !SourceFields.TryGetValue(from.GetString()!, out var fields))
        {
            return new ConditionProblem("unknown_source", path);
        }

        if (!query.TryGetProperty("where", out var where) || where.ValueKind != JsonValueKind.Array)
        {
            return new ConditionProblem("node_arity", path);
        }

        if (where.GetArrayLength() > MaxWhereClauses)
        {
            return new ConditionProblem("node_arity", path);
        }

        var index = 0;
        foreach (var clause in where.EnumerateArray())
        {
            var clausePath = $"{path}.where[{index++}]";

            if (clause.ValueKind != JsonValueKind.Object
                || !clause.TryGetProperty("field", out var field)
                || field.ValueKind != JsonValueKind.String
                || !fields.Contains(field.GetString()!, StringComparer.Ordinal))
            {
                return new ConditionProblem("unknown_field", clausePath);
            }

            if (!clause.TryGetProperty("op", out var op)
                || op.ValueKind != JsonValueKind.String
                || !ClauseOperators.Contains(op.GetString()!, StringComparer.Ordinal))
            {
                return new ConditionProblem("unknown_operator", clausePath);
            }

            // "contains" is membership in an event's subjects and exists nowhere else; anything else over that
            // field, or "contains" over any other field, is a mistake rather than a different reading.
            var isSubjectIds = field.GetString() == "subjectIds";
            if (isSubjectIds != (op.GetString() == "contains"))
            {
                return new ConditionProblem("operator_not_applicable", clausePath);
            }

            // What this field carries, and so what the clause's value has to be, in either of its two forms.
            var required = FieldTypes[$"{from.GetString()}.{field.GetString()}"];

            if (clause.TryGetProperty("operandValue", out var operandValue))
            {
                if (ValidateOperandCore(operandValue, $"{clausePath}.operandValue", depth + 1, ref nodes) is { } problem)
                {
                    return problem;
                }

                // An operand whose type is known before anything is evaluated is checked too: a literal declares
                // its type, a count is a number, and a subject is a reference. An attribute or a field is only
                // known from the stored facts, so there is nothing to check here and evaluation reports it.
                var operandType = StaticType(operandValue);

                if (operandType is not null && operandType != required)
                {
                    return new ConditionProblem("type_mismatch", $"{clausePath}.operandValue");
                }

                continue;
            }

            if (!clause.TryGetProperty("value", out var clauseValue)
                || !clause.TryGetProperty("type", out var clauseType)
                || clauseType.ValueKind != JsonValueKind.String
                || !ValueTypes.Contains(clauseType.GetString()!, StringComparer.Ordinal))
            {
                return new ConditionProblem("type_mismatch", clausePath);
            }

            // The declared type has to be the field's, and the value has to match what it declares, exactly as a
            // literal operand's does. A clause that says reference and carries a number, or compares an event's
            // date against plain text, can only ever be a type mismatch at evaluation time.
            if (clauseType.GetString() != required)
            {
                return new ConditionProblem("type_mismatch", clausePath);
            }

            if (Typed(clauseValue, required, clausePath) is { } mismatch)
            {
                return mismatch;
            }
        }

        return null;
    }
}

/// <summary>
/// What is wrong with a stored condition: a stable code from the specification's list, and the path in the tree
/// it was found at. The path is diagnostic and never localised.
/// </summary>
public sealed record ConditionProblem(string Code, string Path);
