using System.ComponentModel;
using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.AiChanges;

// ---------- What an AI sends: schema definitions (issue #59, ADR 0062) ----------
//
// Definitions, never values: a lore type, a field of a type, a semantic group. An entry's field values are a lore_entry
// change, made in a later proposal with the ids these definitions get once approved. Nothing here can say what a field
// means to Lorex's rules (ADR 0011: meaning is declared by the author, never by AI), and nothing deletes a definition.

[Description("A lore type: a kind of entry, such as Kingdom or Weapon. Create: name is required. Update: only what you set changes.")]
public sealed record AiLoreTypeInput(
    string? Name = null,
    [property: Description("On update, \"\" clears it.")] string? Description = null,
    [property: Description("One of the icon keys get_change_options lists, or \"\" for none.")] string? Icon = null,
    [property: Description("A hex colour such as #8a5a44, or \"\" for none.")] string? AccentColor = null,
    [property: Description("The type it sits beneath: an existing type's id, or a type this proposal creates. Leave it out to keep it (a new type is a root); set root true to make it a root.")] AiRefInput? Parent = null,
    [property: Description("On update, true makes the type a root.")] bool? Root = null,
    [property: Description("The whole set of semantic groups the type is in: existing group ids, or groups this proposal creates. On update, leave it out to keep them; [] leaves every group.")] IReadOnlyList<AiRefInput>? Groups = null,
    [property: Description("Whether the Family Tree is offered for this type's entries.")] bool? FamilyTree = null);

[Description("A field of a lore type: its definition, not an entry's value. Create: type, name and kind are required. Update: only what you set changes; the kind can change only while the field holds no values.")]
public sealed record AiLoreFieldInput(
    [property: Description("Create only: the type it belongs to - an existing type's id, or a type this proposal creates.")] AiRefInput? Type = null,
    string? Name = null,
    [property: Description("short_text, long_text, number, yes_no, date, one_choice, choices or link.")] string? Kind = null,
    [property: Description("Whether every entry of the type must have a value.")] bool? Required = null,
    [property: Description("Text shown as the field's default. On update, \"\" clears it.")] string? DefaultValue = null,
    [property: Description("For one_choice and choices: the whole list of choices, in order. On update, a choice an entry or an older version still uses can't be left out.")] IReadOnlyList<string>? Options = null,
    [property: Description("For link: limit it to entries of one type - an existing type's id or a type this proposal creates.")] AiRefInput? LinksToType = null,
    [property: Description("For link: limit it to entries of any type in one semantic group - an existing group's id or a group this proposal creates.")] AiRefInput? LinksToGroup = null,
    [property: Description("For link, on update: true lets it link to any entry again.")] bool? LinksToAny = null);

[Description("A semantic group: a named collection of lore types, such as Locations. It is not a type, a parent or a field. Types join it through their groups.")]
public sealed record AiLoreGroupInput(
    string? Name = null,
    [property: Description("Whether the Family Tree is offered for every type in the group.")] bool? FamilyTree = null);

// ---------- What is stored ----------

/// <summary>
/// A lore type as a change stores it. <paramref name="Parent"/> is null for a root; <paramref name="Groups"/> is the whole set,
/// sorted, so an unchanged type compares equal.
/// </summary>
public sealed record TypeValues(
    string Name,
    string? Description,
    string? Icon,
    string? AccentColor,
    AiRef? Parent,
    List<AiRef> Groups,
    bool FamilyTreeEligible);

/// <summary>
/// A field definition as a change stores it. <paramref name="Semantic"/> is the stored meaning, carried through an update
/// unchanged: no AI change ever sets one (ADR 0011).
/// </summary>
public sealed record FieldValues(
    AiRef Type,
    string Name,
    EntityFieldKind Kind,
    bool Required,
    string? DefaultValue,
    List<string> Options,
    AiRef? TargetType,
    AiRef? TargetGroup,
    EntityFieldSemantic? Semantic);

public sealed record GroupValues(string Name, bool FamilyTreeEnabled);

/// <summary>What get_change_options says about a universe's semantic groups.</summary>
public sealed record AiChangeOptionGroup(Guid Id, string Name, IReadOnlyList<Guid> TypeIds, bool FamilyTree);

/// <summary>
/// The schema half of get_change_options: what definitions exist beyond the types' active fields, and what may be proposed
/// about them. <paramref name="CanPropose"/> is whether this person, through this entry point, may stage schema changes now.
/// </summary>
public sealed record AiChangeSchemaOptions(
    bool CanPropose,
    string? Why,
    IReadOnlyList<string> FieldKinds,
    IReadOnlyList<string> Icons,
    IReadOnlyList<AiChangeOptionGroup> Groups,
    string Notes);
