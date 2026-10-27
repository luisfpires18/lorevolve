namespace LorEvolve.Api.Features.Relationships;

/// <summary>Input checks for the relationship feature. Nothing invalid reaches EF Core.</summary>
public static class RelationshipValidation
{
    /// <summary>
    /// <paramref name="constraints"/> is the group as it will be stored: the request's own, or on an
    /// update that sent none, the type's current one. Checking the effective group rather than only
    /// what arrived is what stops a type being turned symmetric underneath an age order it already has.
    /// <paramref name="familySemantic"/> is the family meaning as it will be stored, for the same reason.
    /// </summary>
    public static Dictionary<string, string[]>? ValidateType(
        RelationshipTypeRequest request,
        RelationshipTypeCanonConstraints constraints,
        RelationshipFamilySemantic familySemantic)
    {
        var errors = new Dictionary<string, string[]>();

        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            errors["name"] = ["Give the relationship type a name, like \"rules\"."];
        }
        else if (name.Length > RelationshipLimits.NameMaxLength)
        {
            errors["name"] = [$"Keep the name under {RelationshipLimits.NameMaxLength} characters."];
        }

        var inverse = request.InverseName?.Trim();

        // A symmetric type reads the same from both ends, so a second wording is not asked
        // for and anything sent is dropped rather than stored as a contradiction.
        if (!request.IsSymmetric)
        {
            if (string.IsNullOrWhiteSpace(inverse))
            {
                errors["inverseName"] =
                    ["Give the reverse reading, like \"ruled by\", or mark the type symmetric."];
            }
            else if (inverse.Length > RelationshipLimits.NameMaxLength)
            {
                errors["inverseName"] =
                    [$"Keep the reverse name under {RelationshipLimits.NameMaxLength} characters."];
            }
        }

        if (request.Description?.Trim() is { Length: > RelationshipLimits.DescriptionMaxLength })
        {
            errors["description"] = ["That description is too long."];
        }

        ValidateConstraints(constraints, request.IsSymmetric, errors);
        ValidateFamilySemantic(familySemantic, request.IsSymmetric, errors);

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// A parent meaning names the source as the parent, so a symmetric type - which says neither end is special - cannot carry
    /// one, for the reason it cannot carry an age order. A request that sets one, or turns a type symmetric beneath one, is
    /// refused rather than having the meaning silently dropped (ADR 0035). A non-structural family meaning names no side, so
    /// "married to" may carry it (ADR 0040).
    /// </summary>
    private static void ValidateFamilySemantic(
        RelationshipFamilySemantic familySemantic,
        bool isSymmetric,
        Dictionary<string, string[]> errors)
    {
        if (!Enum.IsDefined(familySemantic))
        {
            errors["familySemantic"] = ["That is not a family meaning LorEvolve knows."];
        }
        else if (isSymmetric && familySemantic.IsParent())
        {
            errors["familySemantic"] =
                ["A kind that reads the same from both sides has no parent side. Remove the family meaning, or make the kind one-way."];
        }
    }

    /// <summary>
    /// The shape of a constraint group, and nothing about whether any relationship obeys it. A type
    /// may be given a rule its existing relationships already break: that is a finding for Canon
    /// Integrity to report, not a reason to refuse the rule (ADR 0023).
    ///
    /// A minimum above the maximum is refused rather than swapped. Which of the two numbers the
    /// author mistyped is not something LorEvolve can know.
    /// </summary>
    private static void ValidateConstraints(
        RelationshipTypeCanonConstraints constraints,
        bool isSymmetric,
        Dictionary<string, string[]> errors)
    {
        if (!Enum.IsDefined(constraints.AgeOrder))
        {
            errors["canonConstraints.ageOrder"] = ["That is not an age rule LorEvolve knows."];
        }
        else if (isSymmetric && constraints.AgeOrder != RelationshipAgeOrder.None)
        {
            // A symmetric type says neither end is special, so "the source is older" would depend
            // only on which entry the author happened to pick first.
            errors["canonConstraints.ageOrder"] =
                ["A kind that reads the same from both sides has no older side. Remove the age order, or make the kind one-way."];
        }

        var min = constraints.MinAgeDifferenceYears;
        var max = constraints.MaxAgeDifferenceYears;

        if (min is < 0)
        {
            errors["canonConstraints.minAgeDifferenceYears"] = ["An age gap is a whole number of years, 0 or more."];
        }

        if (max is < 0)
        {
            errors["canonConstraints.maxAgeDifferenceYears"] = ["An age gap is a whole number of years, 0 or more."];
        }
        else if (min is { } smallest and >= 0 && max is { } largest && smallest > largest)
        {
            errors["canonConstraints.maxAgeDifferenceYears"] =
                [$"The largest gap cannot be smaller than the smallest gap, {smallest} {(smallest == 1 ? "year" : "years")}."];
        }
    }

    public static Dictionary<string, string[]>? ValidateRelationship(RelationshipRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (!Enum.IsDefined(request.CanonStatus))
        {
            errors["canonStatus"] = ["That is not a canon status LorEvolve knows."];
        }

        if (request.SourceEntityId == request.TargetEntityId)
        {
            errors["targetEntityId"] = ["Relate two different entries."];
        }

        if (request.StartDate is { } start && request.EndDate is { } end
            && Utc(end) < Utc(start))
        {
            errors["endDate"] = ["The end date cannot come before the start date."];
        }

        if (request.Notes?.Trim() is { Length: > RelationshipLimits.NotesMaxLength })
        {
            errors["notes"] = ["Those notes are too long."];
        }

        return errors.Count == 0 ? null : errors;
    }

    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// Stored timestamps are UTC <see cref="DateTime"/> values, because SQLite cannot order
    /// by <c>DateTimeOffset</c>. A kind-less value from a client is read as UTC.
    /// </summary>
    public static DateTime? Utc(DateTime? value) => value is { } moment ? Utc(moment) : null;

    public static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    /// <summary>The wording to show when a link is read from <paramref name="perspective"/>.</summary>
    public static string LabelFor(
        string name,
        string? inverseName,
        bool isSymmetric,
        RelationshipPerspective perspective) =>
        perspective == RelationshipPerspective.Forward || isSymmetric
            ? name
            : inverseName ?? name;
}
