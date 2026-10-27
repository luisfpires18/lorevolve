using System.Text.RegularExpressions;

namespace LorEvolve.Api.Features.Lore;

/// <summary>Shared input checks for the lore feature.</summary>
public static partial class LoreValidation
{
    public static Dictionary<string, string[]>? ValidateEntityType(EntityTypeRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        RequireName(errors, request.Name, "Give the type a name.");

        if (request.Description is { Length: > LoreLimits.DescriptionMaxLength })
        {
            errors["description"] = ["That description is too long."];
        }

        // Optional, and only ever one of the built-in keys. Anything else - a name, a URL, markup -
        // is refused rather than stored for a screen that could not draw it.
        if (Normalize(request.Icon) is { } icon && !EntityTypeIcons.IsKnown(icon))
        {
            errors["icon"] = ["That is not one of the icons LorEvolve has. Choose one from the list, or none."];
        }

        ValidateAccent(errors, request.AccentColor);

        // The group choices' shape only; whether an id is this universe's is the endpoint's, inside its transaction.
        if (request.Groups is { } groups)
        {
            if (groups.Count > MaxGroupsPerType)
            {
                errors["groups"] = [$"A type can be in at most {MaxGroupsPerType} groups."];
            }
            else if (groups.Any(choice => choice is null
                || (choice.Id is null) == string.IsNullOrWhiteSpace(choice.Name)))
            {
                errors["groups"] = ["Choose an existing group, or give a new one a name."];
            }
            else if (groups.Any(choice => choice.Name is { } name && name.Trim().Length > LoreLimits.NameMaxLength))
            {
                errors["groups"] = ["That group name is too long."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// How many semantic groups one type may be in. One is the ordinary case and a handful is plenty; the bound keeps a
    /// save's membership work small.
    /// </summary>
    public const int MaxGroupsPerType = 20;

    public static Dictionary<string, string[]>? ValidateField(FieldDefinitionRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        RequireName(errors, request.Name, "Give the field a name.");

        if (!Enum.IsDefined(request.Kind))
        {
            errors["kind"] = ["That is not a field type LorEvolve knows."];
        }

        var needsOptions = request.Kind is EntityFieldKind.Select or EntityFieldKind.MultiSelect;
        var optionCount = request.Options?.Count(option => !string.IsNullOrWhiteSpace(option)) ?? 0;

        if (needsOptions && optionCount == 0)
        {
            errors["options"] = ["A select field needs at least one option."];
        }

        if (request.Options is not null
            && request.Options.Any(option => (option?.Length ?? 0) > LoreLimits.OptionMaxLength))
        {
            errors["options"] = ["One of those options is too long."];
        }

        if (request.Semantic is { } semantic)
        {
            if (!Enum.IsDefined(semantic))
            {
                errors["semantic"] = ["That is not a field meaning LorEvolve knows."];
            }
            else if (!IsSemanticCompatible(semantic, request.Kind))
            {
                errors["semantic"] = [
                    $"A field that means {SemanticWord(semantic)} has to be a Number field, "
                        + "because LorEvolve counts fictional time in plain years."];
            }
        }

        // Refused rather than dropped: a type sent with a number field is a client saying something it should not.
        if (request.TargetEntityTypeId is not null && request.Kind != EntityFieldKind.EntityReference)
        {
            errors["targetEntityTypeId"] = ["Only a field that links to an entry can be limited to a type."];
        }

        if (request.TargetGroupId is not null && request.Kind != EntityFieldKind.EntityReference)
        {
            errors["targetGroupId"] = ["Only a field that links to an entry can be limited to a group."];
        }
        else if (request.TargetGroupId is not null && request.TargetEntityTypeId is not null)
        {
            errors["targetGroupId"] = ["Choose one type or one group, not both."];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// Whether a meaning may be declared on a field of this shape. Every meaning LorEvolve has
    /// is a number on the universe's own reckoning, so the answer is uniform today; it is
    /// written as a switch because the next meaning added will not be.
    /// </summary>
    public static bool IsSemanticCompatible(EntityFieldSemantic semantic, EntityFieldKind kind) =>
        semantic switch
        {
            EntityFieldSemantic.BirthYear => kind is EntityFieldKind.Number,
            EntityFieldSemantic.DeathYear => kind is EntityFieldKind.Number,
            EntityFieldSemantic.Age => kind is EntityFieldKind.Number,
            _ => false,
        };

    /// <summary>How a meaning is named to the author, so an error reads as a sentence.</summary>
    public static string SemanticWord(EntityFieldSemantic semantic) => semantic switch
    {
        EntityFieldSemantic.BirthYear => "a birth year",
        EntityFieldSemantic.DeathYear => "a death year",
        _ => "an age",
    };

    public static Dictionary<string, string[]>? ValidateEntity(EntityRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        RequireName(errors, request.Name, "Give it a name.");

        if (request.Summary?.Trim() is { Length: > LoreLimits.SummaryMaxLength })
        {
            errors["summary"] = ["That summary is too long."];
        }

        if (!Enum.IsDefined(request.CanonStatus))
        {
            errors["canonStatus"] = ["That is not a canon status LorEvolve knows."];
        }

        // A JSON array can carry nulls, so entries are length-checked defensively.
        if (request.Aliases is not null
            && request.Aliases.Any(alias => (alias?.Trim().Length ?? 0) > LoreLimits.NameMaxLength))
        {
            errors["aliases"] = ["One of those aliases is too long."];
        }

        if (request.Tags is not null
            && request.Tags.Any(tag => (tag?.Trim().Length ?? 0) > LoreLimits.TagMaxLength))
        {
            errors["tags"] = ["One of those tags is too long."];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// One article save. Null is refused, so a malformed body can never clear an article; blank clears it; anything else
    /// must be a document <see cref="LoreContent"/> accepts, within the bound.
    /// </summary>
    public static Dictionary<string, string[]>? ValidateArticle(string? content)
    {
        if (content is null)
        {
            return new Dictionary<string, string[]>
            {
                ["content"] = ["Send the article. An empty one clears it."],
            };
        }

        return LoreContent.TryValidate(content, out var error)
            ? null
            : new Dictionary<string, string[]> { ["content"] = [error!] };
    }

    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public static string? NormalizeAccent(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();

    private static void RequireName(Dictionary<string, string[]> errors, string? name, string message)
    {
        var trimmed = name?.Trim();

        if (string.IsNullOrWhiteSpace(trimmed))
        {
            errors["name"] = [message];
        }
        else if (trimmed.Length > LoreLimits.NameMaxLength)
        {
            errors["name"] = [$"Keep the name under {LoreLimits.NameMaxLength} characters."];
        }
    }

    private static void ValidateAccent(Dictionary<string, string[]> errors, string? accentColor)
    {
        if (!string.IsNullOrWhiteSpace(accentColor) && !AccentColorPattern().IsMatch(accentColor.Trim()))
        {
            errors["accentColor"] = ["Use a colour like #4f6bd6."];
        }
    }

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex AccentColorPattern();
}
