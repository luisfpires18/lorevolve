using System.Globalization;
using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Lore;

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
/// A filter names a field the type asked for has: its own, or one inherited from a type above it (ADR 0007 amendment,
/// 2026-11-12) - and since a nested type's entries hold their inherited fields, a filter on a parent's field matches them too. Every filter is resolved before any is applied, and one that does not resolve is a 400
/// rather than ignored: dropping a filter would quietly widen the answer. Each becomes one correlated EXISTS over the
/// entry's values, all ANDed, so the database filters before the count, the order and the page - and an entry with no
/// value for the field never matches, whichever way the comparison points.
/// </summary>
public static partial class EntityFieldFilters
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
    internal static string AsciiLower(string text) =>
        string.Create(text.Length, text, (span, source) =>
        {
            for (var i = 0; i < source.Length; i++)
            {
                var c = source[i];
                span[i] = c is >= 'A' and <= 'Z' ? (char)(c + 32) : c;
            }
        });
}
