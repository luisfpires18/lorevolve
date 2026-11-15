using System.Text.Json;
using LorEvolve.Api.Features.RuleValidation.Conditions;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The specification's fixtures as a fact source, so the evaluator can be run against the contract it is held to
/// (ADR 0072, <c>docs/architecture/world-logic-condition-spec.md</c> section 12).
///
/// <para>This is a reader, not a second evaluator. It returns rows and typed values; every semantic decision -
/// three-valued logic, precedence, budgets, error codes - stays in <c>WorldLogicEvaluator</c>, which is what makes
/// a fixture's expectation evidence about production behaviour rather than about this file.</para>
///
/// <para><b>Types are inferred here, and only here.</b> A fixture writes an attribute as plain JSON, so a string
/// has to be read as a time point, a reference or text. A string beginning with a scope the specification orders is
/// a time point; a string that is the id of a row in this fixture is a reference; anything else is text. Production
/// never guesses: <c>UniverseConditionFacts</c> reads typed columns and declared field semantics.</para>
/// </summary>
internal sealed class WorldLogicFixtureFacts : IConditionFacts
{
    private readonly Dictionary<string, Subject> _subjects = new(StringComparer.Ordinal);
    private readonly List<Relation> _relations = [];
    private readonly Dictionary<string, Event> _events = new(StringComparer.Ordinal);

    public WorldLogicFixtureFacts(JsonElement facts)
    {
        foreach (var subject in facts.GetProperty("subjects").EnumerateArray())
        {
            var attributes = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            if (subject.TryGetProperty("attributes", out var written))
            {
                foreach (var attribute in written.EnumerateObject())
                {
                    attributes[attribute.Name] = attribute.Value.Clone();
                }
            }

            var id = subject.GetProperty("id").GetString()!;
            _subjects[id] = new Subject(id, subject.GetProperty("type").GetString()!, attributes);
        }

        foreach (var relation in facts.GetProperty("relations").EnumerateArray())
        {
            _relations.Add(new Relation(
                relation.GetProperty("type").GetString()!,
                relation.GetProperty("fromId").GetString()!,
                relation.GetProperty("toId").GetString()!));
        }

        foreach (var row in facts.GetProperty("events").EnumerateArray())
        {
            var id = row.GetProperty("id").GetString()!;
            var members = row.TryGetProperty("subjectIds", out var subjectIds)
                ? subjectIds.EnumerateArray().Select(member => member.GetString()!).ToList()
                : [];

            _events[id] = new Event(
                id,
                Text(row, "kind"),
                Text(row, "method"),
                members,
                Text(row, "at"),
                row.TryGetProperty("canon", out var canon) && canon.ValueKind == JsonValueKind.True);
        }
    }

    public IReadOnlyList<FactRow>? Query(string source, IReadOnlyList<FactClause> clauses, int limit)
    {
        var rows = source switch
        {
            "subjects" => _subjects.Values.Select(SubjectRow),
            "relations" => _relations.Select(RelationRow),
            "events" => _events.Values.Select(EventRow),
            _ => null,
        };

        if (rows is null)
        {
            return null;
        }

        // limit + 1 so the evaluator can tell a full answer from a truncated one, as the interface says.
        return rows.Where(row => clauses.All(clause => Matches(row, clause))).Take(limit + 1).ToList();
    }

    public ConditionValue Attribute(string subjectId, string attribute) =>
        _subjects.TryGetValue(subjectId, out var subject) && subject.Attributes.TryGetValue(attribute, out var value)
            ? Value(value)
            : ConditionValue.Missing;

    public ConditionValue? Field(string source, string rowId, string field)
    {
        switch (source)
        {
            case "subjects":
                if (field is not ("id" or "type"))
                {
                    return null;
                }

                return _subjects.TryGetValue(rowId, out var subject)
                    ? field == "id" ? ConditionValue.OfReference(subject.Id) : ConditionValue.OfText(subject.Type)
                    : ConditionValue.Missing;

            case "events":
                if (field is not ("id" or "kind" or "method" or "at" or "canon" or "subjectIds"))
                {
                    return null;
                }

                if (!_events.TryGetValue(rowId, out var row))
                {
                    return ConditionValue.Missing;
                }

                return field switch
                {
                    "id" => ConditionValue.OfReference(row.Id),
                    "kind" => ConditionValue.OfText(row.Kind),
                    "method" => ConditionValue.OfText(row.Method),
                    "at" => ConditionValue.OfTimePoint(row.At),
                    "canon" => ConditionValue.Of(row.Canon),

                    // A set has no single value to read, so naming it as a field is missing rather than a type
                    // error: membership is what a clause's contains is for.
                    _ => ConditionValue.Missing,
                };

            case "relations":
                // A relation row has no id, so there is nothing to read one of by id.
                return field is "type" or "fromId" or "toId" ? ConditionValue.Missing : null;

            default:
                return null;
        }
    }

    public bool Related(string type, string fromId, string toId) =>
        _relations.Any(relation =>
            string.Equals(relation.Type, type, StringComparison.Ordinal)
            && string.Equals(relation.FromId, fromId, StringComparison.Ordinal)
            && string.Equals(relation.ToId, toId, StringComparison.Ordinal));

    private FactRow SubjectRow(Subject subject) => new(
        subject.Id,
        new Dictionary<string, ConditionValue>(StringComparer.Ordinal)
        {
            ["id"] = ConditionValue.OfReference(subject.Id),
            ["type"] = ConditionValue.OfText(subject.Type),
        },
        []);

    private static FactRow RelationRow(Relation relation) => new(
        null,
        new Dictionary<string, ConditionValue>(StringComparer.Ordinal)
        {
            ["type"] = ConditionValue.OfText(relation.Type),
            ["fromId"] = ConditionValue.OfReference(relation.FromId),
            ["toId"] = ConditionValue.OfReference(relation.ToId),
        },
        []);

    private static FactRow EventRow(Event row) => new(
        row.Id,
        new Dictionary<string, ConditionValue>(StringComparer.Ordinal)
        {
            ["id"] = ConditionValue.OfReference(row.Id),
            ["kind"] = ConditionValue.OfText(row.Kind),
            ["method"] = ConditionValue.OfText(row.Method),
            ["at"] = ConditionValue.OfTimePoint(row.At),
            ["canon"] = ConditionValue.Of(row.Canon),
        },
        row.SubjectIds);

    private static bool Matches(FactRow row, FactClause clause)
    {
        if (clause.Operator == "contains")
        {
            return clause.Value.Kind == ConditionValueKind.Reference
                   && row.Members.Contains(clause.Value.Text!, StringComparer.Ordinal);
        }

        if (!row.Fields.TryGetValue(clause.Field, out var value) || value.IsMissing || clause.Value.IsMissing)
        {
            return false;
        }

        if (value.Kind != clause.Value.Kind)
        {
            return false;
        }

        if (clause.Operator is "eq" or "ne")
        {
            var equal = value.Kind switch
            {
                ConditionValueKind.Boolean => value.Boolean == clause.Value.Boolean,
                ConditionValueKind.Number => value.Number == clause.Value.Number,
                _ => string.Equals(value.Text, clause.Value.Text, StringComparison.Ordinal),
            };

            return clause.Operator == "eq" ? equal : !equal;
        }

        var left = value.Kind == ConditionValueKind.Number ? value.Number : value.TimeOrder();
        var right = clause.Value.Kind == ConditionValueKind.Number ? clause.Value.Number : clause.Value.TimeOrder();

        if (left is null || right is null)
        {
            return false;
        }

        if (value.Kind == ConditionValueKind.TimePoint && value.TimeScope() != clause.Value.TimeScope())
        {
            return false;
        }

        return clause.Operator switch
        {
            "lt" => left < right,
            "lte" => left <= right,
            "gt" => left > right,
            "gte" => left >= right,
            _ => false,
        };
    }

    /// <summary>One written attribute as a typed value, with the inference this file's summary describes.</summary>
    private ConditionValue Value(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.True or JsonValueKind.False => ConditionValue.Of(value.GetBoolean()),
        JsonValueKind.Number => ConditionValue.Of(value.GetDecimal()),
        JsonValueKind.String => OfString(value.GetString()!),
        _ => ConditionValue.Missing,
    };

    private ConditionValue OfString(string value)
    {
        if (value.StartsWith("calendar:", StringComparison.Ordinal) || value.StartsWith("era:", StringComparison.Ordinal))
        {
            return ConditionValue.OfTimePoint(value);
        }

        return _subjects.ContainsKey(value) || _events.ContainsKey(value)
            ? ConditionValue.OfReference(value)
            : ConditionValue.OfText(value);
    }

    private static string? Text(JsonElement row, string name) =>
        row.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private sealed record Subject(string Id, string Type, Dictionary<string, JsonElement> Attributes);

    private sealed record Relation(string Type, string FromId, string ToId);

    private sealed record Event(
        string Id,
        string? Kind,
        string? Method,
        IReadOnlyList<string> SubjectIds,
        string? At,
        bool Canon);
}
