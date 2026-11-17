using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Features.TypeTemplates;

/// <summary>
/// A reusable type a universe keeps for its projects (#281): a name, a look and a list of fields with their choices.
/// It is a blueprint, not a schema: nothing points at it, and no entry is ever of a template.
/// </summary>
public sealed class TypeTemplate
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public string? AccentColor { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public List<TypeTemplateField> Fields { get; set; } = [];
}

/// <summary>One field of a template. The kinds are the lore's own, except a link to an entry.</summary>
public sealed class TypeTemplateField
{
    public Guid Id { get; set; }

    public Guid TemplateId { get; set; }

    public TypeTemplate? Template { get; set; }

    public string Name { get; set; } = string.Empty;

    public EntityFieldKind Kind { get; set; }

    public bool IsRequired { get; set; }

    public int DisplayOrder { get; set; }

    public FieldImageShape? ImageShape { get; set; }

    public List<TypeTemplateFieldOption> Options { get; set; } = [];
}

public sealed class TypeTemplateFieldOption
{
    public Guid Id { get; set; }

    public Guid FieldId { get; set; }

    public TypeTemplateField? Field { get; set; }

    public string Value { get; set; } = string.Empty;

    public int DisplayOrder { get; set; }
}
