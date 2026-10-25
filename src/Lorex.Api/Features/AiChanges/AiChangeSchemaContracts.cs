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
    string Notes,
    AiChangeOptionChronology? Chronology = null);

// ---------- Phase 2: relationship kinds, chronology, event kinds and methods ----------

[Description("A relationship kind: how two entries relate, read as \"source <name> target\" and, unless symmetric, \"target <inverseName> source\". Create: name is required. Update: only what you set changes; a kind in use can't change between symmetric and directed.")]
public sealed record AiRelationshipKindInput(
    string? Name = null,
    [property: Description("How the relationship reads from the target's side, such as \"child of\" for \"parent of\". Not for a symmetric kind.")] string? InverseName = null,
    [property: Description("true when it reads the same both ways, such as \"sibling of\".")] bool? Symmetric = null,
    [property: Description("On update, \"\" clears it.")] string? Description = null);

[Description("The universe's reckoning, written whole: its date periods (eras) earliest first and, optionally, a custom calendar's months in the order of the year. Existing periods and months are listed by id, in their current order; new ones go without an id. Nothing is removed or reordered here.")]
public sealed record AiChronologyInput(
    [property: Description("Every date period, earliest first: the existing ones by id, in their order, and any new ones. Leave it out to keep them.")] IReadOnlyList<AiDatePeriodInput>? Eras = null,
    [property: Description("Every month of the custom calendar, in the order of the year: the existing ones by id, and any new ones after them. Leave it out to keep the calendar as it is.")] IReadOnlyList<AiMonthInput>? Months = null);

public sealed record AiDatePeriodInput(
    [property: Description("An existing date period's id, from get_change_options; leave it out for a new one.")] Guid? Id = null,
    string? Name = null,
    [property: Description("A short label such as \"TA\". On an existing period, \"\" clears it.")] string? Abbreviation = null,
    [property: Description("ascending (years count up from 1) or descending (years count down to 1). Only a new or unused period can change it.")] string? Direction = null,
    [property: Description("before (\"TA 3019\") or after (\"3019 TA\").")] string? Label = null);

public sealed record AiMonthInput(
    [property: Description("An existing month's id, from get_change_options; leave it out for a new one.")] Guid? Id = null,
    string? Name = null,
    [property: Description("On an existing month, \"\" clears it.")] string? Abbreviation = null,
    int? Days = null);

[Description("An event kind or a method: the small vocabulary world rule checks and moments name. Create: name is required. Update: renames it; its kind never changes.")]
public sealed record AiTermInput(string? Name = null);

/// <summary>
/// A relationship kind as a change stores it. <paramref name="Constraints"/> and <paramref name="FamilySemantic"/> are the
/// stored Canon age rules and family meaning, carried through unchanged: what a kind means to the rules is the author's to say
/// (ADR 0035, ADR 0062), like a field's meaning.
/// </summary>
public sealed record RelationshipKindValues(
    string Name,
    string? InverseName,
    bool Symmetric,
    string? Description,
    Relationships.RelationshipTypeCanonConstraints? Constraints,
    Relationships.RelationshipFamilySemantic FamilySemantic);

public sealed record DatePeriodValue(Guid? Id, string Name, string? Abbreviation, Chronology.ChronologyEraDirection Direction, Chronology.ChronologyLabelPosition Label);

public sealed record MonthValue(Guid? Id, string Name, string? Abbreviation, int Days);

/// <summary>The universe's whole reckoning as a change stores it: its periods in order, and its calendar's months, or null for simple dates.</summary>
public sealed record ChronologyValues(List<DatePeriodValue> Eras, List<MonthValue>? Months);

public sealed record TermValues(RuleValidation.ValidationTermKind Kind, string Name);

/// <summary>
/// The chronology half of get_change_options: each period with what it dates, the calendar's months with what uses them, and
/// whether simple dates already use months - which a new calendar would reinterpret, so an AI cannot start one then.
/// </summary>
public sealed record AiChangeOptionChronology(
    IReadOnlyList<AiChangeOptionPeriod> Eras,
    IReadOnlyList<AiChangeOptionMonth>? Months,
    bool SimpleMonthsInUse);

public sealed record AiChangeOptionPeriod(Guid Id, string Name, string? Abbreviation, string Direction, string Label, bool InUse);

public sealed record AiChangeOptionMonth(Guid Id, string Name, string? Abbreviation, int Days, bool InUse);
