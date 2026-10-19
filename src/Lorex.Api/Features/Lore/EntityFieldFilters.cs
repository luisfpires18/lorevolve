using System.Globalization;
using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>The fixed set of comparisons a custom-field filter can make. Nothing else is ever executed.</summary>
public enum FieldFilterOperator
{
    Equals,
    Contains,
    GreaterThan,
    LessThan,
    Is,
    IsNot,
    NotContains,
}

/// <summary>One filter, resolved: the field it reads and a typed value already checked against that field.</summary>
public sealed record EntityFieldFilter(
    Guid FieldDefinitionId,
    EntityFieldKind Kind,
    FieldFilterOperator Operator,
    string? Text = null,
    double? Number = null,
    bool? Boolean = null,
    Guid? Id = null);

/// <summary>
/// Lore's custom-field filters (refinement 034). The listing takes them as repeated <c>field</c> query values, each
/// <c>&lt;fieldId&gt;:&lt;op&gt;:&lt;value&gt;</c>, split at the first two colons only - the id is a GUID and the operator
/// a fixed token, so neither holds a colon and the value may hold anything.
///
/// A field belongs to exactly the type that defines it (nothing is inherited), so a filter names a field of the type
/// asked for and of nothing else. Every filter is resolved before any is applied, and one that does not resolve is a 400
/// rather than ignored: dropping a filter would quietly widen the answer. Each becomes one correlated EXISTS over the
/// entry's values, all ANDed, so the database filters before the count, the order and the page - and an entry with no
/// value for the field never matches, whichever way the comparison points.
/// </summary>
public static class EntityFieldFilters
{
    public const int MaxFilters = 10;

    private static readonly Dictionary<string, FieldFilterOperator> Tokens = new(StringComparer.Ordinal)
    {
        ["eq"] = FieldFilterOperator.Equals,
        ["contains"] = FieldFilterOperator.Contains,
        ["gt"] = FieldFilterOperator.GreaterThan,
        ["lt"] = FieldFilterOperator.LessThan,
        ["is"] = FieldFilterOperator.Is,
        ["isNot"] = FieldFilterOperator.IsNot,
        ["notContains"] = FieldFilterOperator.NotContains,
    };

    /// <summary>Which comparisons each kind offers. Date has none yet: its meaning waits on the universe's own calendars.</summary>
    private static bool Allows(EntityFieldKind kind, FieldFilterOperator op) => kind switch
    {
        EntityFieldKind.ShortText or EntityFieldKind.LongText =>
            op is FieldFilterOperator.Equals or FieldFilterOperator.Contains,
        EntityFieldKind.Number =>
            op is FieldFilterOperator.Equals or FieldFilterOperator.GreaterThan or FieldFilterOperator.LessThan,
        EntityFieldKind.Boolean => op is FieldFilterOperator.Is,
        EntityFieldKind.Select or EntityFieldKind.EntityReference =>
            op is FieldFilterOperator.Is or FieldFilterOperator.IsNot,
        EntityFieldKind.MultiSelect => op is FieldFilterOperator.Contains or FieldFilterOperator.NotContains,
        _ => false,
    };

    /// <summary>
    /// Every filter checked against the universe and the type asked for, or the problems. A field, option or entry that is
    /// not this universe's gets the same answer as one that does not exist, so nothing about another world is revealed.
    /// </summary>
    public static async Task<(List<EntityFieldFilter> Filters, Dictionary<string, string[]>? Errors)> ResolveAsync(
        LorexDbContext db,
        Guid universeId,
        Guid? entityTypeId,
        string[] raw,
        CancellationToken cancellationToken)
    {
        var filters = new List<EntityFieldFilter>();
        if (raw.Length == 0)
        {
            return (filters, null);
        }

        if (raw.Length > MaxFilters)
        {
            return (filters, new() { ["field"] = [$"At most {MaxFilters} field filters can be used at once."] });
        }

        if (entityTypeId is not { } typeId)
        {
            return (filters, new() { ["field"] = ["Field filters need a type: a field belongs to one type."] });
        }

        var fields = await db.EntityFieldDefinitions.AsNoTracking()
            .Where(field => field.EntityTypeId == typeId && field.EntityType!.UniverseId == universeId)
            .Select(field => new
            {
                field.Id,
                field.Kind,
                field.TargetEntityTypeId,
                field.TargetGroupId,
                Options = field.Options.Select(option => option.Id).ToList(),
            })
            .ToDictionaryAsync(field => field.Id, cancellationToken);

        var errors = new Dictionary<string, string[]>();
        var references = new Dictionary<int, (Guid EntityId, Guid? Target, Guid? Group)>();

        for (var index = 0; index < raw.Length; index++)
        {
            var key = $"field[{index}]";
            var parts = (raw[index] ?? string.Empty).Split(':', 3);

            if (parts.Length != 3
                || !Guid.TryParse(parts[0], out var fieldId)
                || !fields.TryGetValue(fieldId, out var field))
            {
                errors[key] = ["This is not a field of the chosen type."];
                continue;
            }

            if (!Tokens.TryGetValue(parts[1], out var op) || !Allows(field.Kind, op))
            {
                errors[key] = ["This field cannot be filtered that way."];
                continue;
            }

            var value = parts[2];
            switch (field.Kind)
            {
                case EntityFieldKind.ShortText:
                case EntityFieldKind.LongText:
                    if (LoreValidation.Normalize(value) is not { } text || text.Length > LoreLimits.TextValueMaxLength)
                    {
                        errors[key] = ["Give some text to look for."];
                        break;
                    }

                    filters.Add(new(fieldId, field.Kind, op, Text: text));
                    break;

                case EntityFieldKind.Number:
                    if (!double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number)
                        || !double.IsFinite(number))
                    {
                        errors[key] = ["Give a number."];
                        break;
                    }

                    filters.Add(new(fieldId, field.Kind, op, Number: number));
                    break;

                case EntityFieldKind.Boolean:
                    if (value is not ("true" or "false"))
                    {
                        errors[key] = ["Choose yes or no."];
                        break;
                    }

                    filters.Add(new(fieldId, field.Kind, op, Boolean: value == "true"));
                    break;

                case EntityFieldKind.Select:
                case EntityFieldKind.MultiSelect:
                    if (!Guid.TryParse(value, out var optionId) || !field.Options.Contains(optionId))
                    {
                        errors[key] = ["Choose one of this field's options."];
                        break;
                    }

                    filters.Add(new(fieldId, field.Kind, op, Id: optionId));
                    break;

                case EntityFieldKind.EntityReference:
                    if (!Guid.TryParse(value, out var entityId))
                    {
                        errors[key] = ["Choose an entry of this universe."];
                        break;
                    }

                    references[index] = (entityId, field.TargetEntityTypeId, field.TargetGroupId);
                    filters.Add(new(fieldId, field.Kind, op, Id: entityId));
                    break;
            }
        }

        // One read for every referenced entry, with its type, and only this universe's count. A field limited to one type
        // is compared only with an entry of that type: any other is a filter that cannot mean anything, so it is refused
        // rather than answered with nothing - and an entry of another universe gets the same answer.
        if (references.Count > 0)
        {
            var wanted = references.Values.Select(reference => reference.EntityId).Distinct().ToList();
            var known = await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && wanted.Contains(entity.Id))
                .ToDictionaryAsync(entity => entity.Id, entity => entity.EntityTypeId, cancellationToken);

            // A field limited to a group compares only with an entry whose type is in it now, by the same rule a save uses.
            var groups = references.Values
                .Where(reference => reference.Group is not null)
                .Select(reference => reference.Group!.Value)
                .Distinct()
                .ToList();
            var members = groups.Count == 0
                ? []
                : (await db.EntityTypeGroupMembers.AsNoTracking()
                    .Where(member => groups.Contains(member.EntityTypeGroupId))
                    .Select(member => new { member.EntityTypeGroupId, member.EntityTypeId })
                    .ToListAsync(cancellationToken))
                    .Select(member => (member.EntityTypeGroupId, member.EntityTypeId))
                    .ToHashSet();

            foreach (var (index, (entityId, target, group)) in references)
            {
                if (!known.TryGetValue(entityId, out var typeOf))
                {
                    errors[$"field[{index}]"] = [target is null && group is null
                        ? "Choose an entry of this universe."
                        : "Choose an entry of the type this field allows."];
                }
                else if ((target is { } allowed && typeOf != allowed)
                    || (group is { } inGroup && !members.Contains((inGroup, typeOf))))
                {
                    errors[$"field[{index}]"] = ["Choose an entry of the type this field allows."];
                }
            }
        }

        return errors.Count > 0 ? (filters, errors) : (filters, null);
    }

    /// <summary>Each filter as one more condition on the same query. Nothing is read here; the database does the work.</summary>
    [System.Diagnostics.CodeAnalysis.SuppressMessage(
        "Performance",
        "CA1862",
        Justification = "Translated to SQL: the StringComparison overloads have no SQLite translation, ToLower() becomes lower().")]
    public static IQueryable<LoreEntity> Apply(IQueryable<LoreEntity> query, IEnumerable<EntityFieldFilter> filters)
    {
        foreach (var filter in filters)
        {
            // Copied into locals so each condition captures its own values, never the loop's last.
            var fieldId = filter.FieldDefinitionId;
            var text = filter.Text is null ? null : AsciiLower(filter.Text);
            var number = filter.Number;
            var flag = filter.Boolean;
            var id = filter.Id;

            query = (filter.Kind, filter.Operator) switch
            {
                // Case-insensitive the way SQLite's lower() is: the column is lowered there and the text here by the same rule. Contains becomes instr(), so % and _
                // are letters like any other, never wildcards.
                (EntityFieldKind.ShortText or EntityFieldKind.LongText, FieldFilterOperator.Equals) =>
                    query.Where(entity => entity.FieldValues.Any(value =>
                        value.FieldDefinitionId == fieldId
                        && value.TextValue != null
                        && value.TextValue.ToLower() == text)),
                (EntityFieldKind.ShortText or EntityFieldKind.LongText, FieldFilterOperator.Contains) =>
                    query.Where(entity => entity.FieldValues.Any(value =>
                        value.FieldDefinitionId == fieldId
                        && value.TextValue != null
                        && value.TextValue.ToLower().Contains(text!))),

                (EntityFieldKind.Number, FieldFilterOperator.Equals) =>
                    query.Where(entity => entity.FieldValues.Any(value =>
                        value.FieldDefinitionId == fieldId && value.NumberValue != null && value.NumberValue == number)),
                (EntityFieldKind.Number, FieldFilterOperator.GreaterThan) =>
                    query.Where(entity => entity.FieldValues.Any(value =>
                        value.FieldDefinitionId == fieldId && value.NumberValue != null && value.NumberValue > number)),
                (EntityFieldKind.Number, FieldFilterOperator.LessThan) =>
                    query.Where(entity => entity.FieldValues.Any(value =>
                        value.FieldDefinitionId == fieldId && value.NumberValue != null && value.NumberValue < number)),

                (EntityFieldKind.Boolean, _) =>
                    query.Where(entity => entity.FieldValues.Any(value =>
                        value.FieldDefinitionId == fieldId && value.BooleanValue == flag)),

                (EntityFieldKind.Select, FieldFilterOperator.Is) or (EntityFieldKind.MultiSelect, FieldFilterOperator.Contains) =>
                    query.Where(entity => entity.FieldValues.Any(value =>
                        value.FieldDefinitionId == fieldId && value.OptionId == id)),
                (EntityFieldKind.Select, FieldFilterOperator.IsNot) =>
                    query.Where(entity => entity.FieldValues.Any(value =>
                        value.FieldDefinitionId == fieldId && value.OptionId != null && value.OptionId != id)),

                // A multi-select keeps one row per chosen option: it has a value at all, and none of its rows is this one.
                (EntityFieldKind.MultiSelect, FieldFilterOperator.NotContains) =>
                    query.Where(entity =>
                        entity.FieldValues.Any(value => value.FieldDefinitionId == fieldId)
                        && !entity.FieldValues.Any(value => value.FieldDefinitionId == fieldId && value.OptionId == id)),

                (EntityFieldKind.EntityReference, FieldFilterOperator.Is) =>
                    query.Where(entity => entity.FieldValues.Any(value =>
                        value.FieldDefinitionId == fieldId && value.ReferencedEntityId == id)),
                (EntityFieldKind.EntityReference, FieldFilterOperator.IsNot) =>
                    query.Where(entity => entity.FieldValues.Any(value =>
                        value.FieldDefinitionId == fieldId
                        && value.ReferencedEntityId != null
                        && value.ReferencedEntityId != id)),

                _ => throw new InvalidOperationException($"No condition for {filter.Kind} {filter.Operator}; ResolveAsync lets none through."),
            };
        }

        return query;
    }

    /// <summary>
    /// A-Z to a-z and nothing else - exactly what SQLite's lower() does to the column - so both sides of a comparison fold
    /// alike. A culture-aware lowering here would fold "Ä" where the database does not, and the exact text would stop matching.
    /// </summary>
    private static string AsciiLower(string text) =>
        string.Create(text.Length, text, (span, source) =>
        {
            for (var i = 0; i < source.Length; i++)
            {
                var c = source[i];
                span[i] = c is >= 'A' and <= 'Z' ? (char)(c + 32) : c;
            }
        });
}
