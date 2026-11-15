using System.Globalization;
using System.Text;

namespace LorEvolve.Api.Features.RuleValidation.Conditions;

/// <summary>The five value types of a condition, and the absence that is not one (ADR 0072, specification section 2.1).</summary>
public enum ConditionValueKind
{
    /// <summary>No value: an absent attribute, an absent row, a target that was not named. Makes its node unknown.</summary>
    Missing = 0,

    Boolean = 1,

    Number = 2,

    Text = 3,

    /// <summary>A point in one scope, section 6. Ordered only inside that scope.</summary>
    TimePoint = 4,

    /// <summary>An id. Equality only.</summary>
    Reference = 5,
}

/// <summary>
/// One typed value an operand resolved to.
///
/// <b>Missing is not a type.</b> It is the absence the specification names, and every node that reads a missing
/// operand answers <c>unknown</c>. That is the whole reason this is a type of its own rather than a null string: a
/// null that defaulted to false or to the empty text is exactly the silent coercion ADR 0072 forbids.
///
/// Text is compared by exact code points after Unicode composition, never case folded and never trimmed, because a
/// comparison that folded case would make two authored values equal that the author wrote differently.
/// </summary>
public readonly record struct ConditionValue(ConditionValueKind Kind, bool Boolean, decimal Number, string? Text)
{
    public static readonly ConditionValue Missing = new(ConditionValueKind.Missing, false, 0m, null);

    public static ConditionValue Of(bool value) => new(ConditionValueKind.Boolean, value, 0m, null);

    public static ConditionValue Of(decimal value) => new(ConditionValueKind.Number, false, value, null);

    public static ConditionValue OfText(string? value) =>
        value is null ? Missing : new(ConditionValueKind.Text, false, 0m, value.Normalize(NormalizationForm.FormC));

    public static ConditionValue OfTimePoint(string? value) =>
        value is null ? Missing : new(ConditionValueKind.TimePoint, false, 0m, value);

    public static ConditionValue OfReference(string? value) =>
        value is null ? Missing : new(ConditionValueKind.Reference, false, 0m, value);

    public bool IsMissing => Kind == ConditionValueKind.Missing;

    /// <summary>The scope of a time point, or null for any other kind. <c>calendar</c> or <c>era/&lt;eraId&gt;</c>.</summary
    /// >
    public string? TimeScope()
    {
        if (Kind != ConditionValueKind.TimePoint || Text is null)
        {
            return null;
        }

        var separator = Text.IndexOf(':', StringComparison.Ordinal);
        if (separator <= 0)
        {
            return null;
        }

        var scope = Text[..separator];
        if (scope != "era")
        {
            // calendar and year are each one scope; an era is one scope per era, below.
            return scope;
        }

        // Two eras are two scopes: version 1 does not store the relation between them, so a point in one is not
        // ordered against a point in another. The era's own id is part of the scope for that reason.
        var rest = Text[(separator + 1)..];
        var slash = rest.IndexOf('/', StringComparison.Ordinal);
        return slash <= 0 ? null : $"era/{rest[..slash]}";
    }

    /// <summary>The number inside a time point, within its scope, or null when it does not read as one.</summary>
    public decimal? TimeOrder()
    {
        if (Kind != ConditionValueKind.TimePoint || Text is null)
        {
            return null;
        }

        var separator = Text.IndexOf(':', StringComparison.Ordinal);
        if (separator <= 0)
        {
            return null;
        }

        var scope = Text[..separator];
        var rest = Text[(separator + 1)..];

        if (scope == "calendar")
        {
            // A date orders as a date, and never as text: 0400-10-01 is after 0400-9-01, which text comparison
            // would get the other way round.
            return DateOnly.TryParse(rest, CultureInfo.InvariantCulture, out var date)
                ? date.DayNumber
                : null;
        }

        if (scope == "year")
        {
            // A plain signed year, as ADR 0022 keeps it on a universe that has not named its eras.
            return decimal.TryParse(rest, CultureInfo.InvariantCulture, out var plain) ? plain : null;
        }

        if (scope != "era")
        {
            return null;
        }

        var slash = rest.IndexOf('/', StringComparison.Ordinal);
        return slash > 0 && decimal.TryParse(rest[(slash + 1)..], CultureInfo.InvariantCulture, out var number)
            ? number
            : null;
    }

    /// <summary>The value in a rationale line: diagnostic, invariant and never localised.</summary>
    public override string ToString() => Kind switch
    {
        ConditionValueKind.Missing => "missing",
        ConditionValueKind.Boolean => Boolean ? "true" : "false",
        ConditionValueKind.Number => Number.ToString(CultureInfo.InvariantCulture),
        _ => Text ?? "missing",
    };

    /// <summary>The type's name as the specification writes it, for a rationale line and an error message.</summary>
    public string TypeName() => Kind switch
    {
        ConditionValueKind.Boolean => "boolean",
        ConditionValueKind.Number => "number",
        ConditionValueKind.Text => "text",
        ConditionValueKind.TimePoint => "timePoint",
        ConditionValueKind.Reference => "reference",
        _ => "missing",
    };
}
