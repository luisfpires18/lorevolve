using LorEvolve.Api.Features.Lore;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// What a project's own schema and entries look like on the wire (#144).
///
/// Deliberately narrower than the lore's contracts rather than a copy of them. A project's entry has no Canon status,
/// no publication and no aliases: those say something about the world's record, and a game's unit or a film's shot
/// says nothing about the world. What it does have that a lore entry does not is
/// <see cref="ProjectEntityRequest.CanonEntityId"/>, the optional link back to the lore entry it stands for.
/// </summary>
public sealed record ProjectEntityTypeRequest(
    string? Name,
    string? Description,
    string? Icon,
    string? AccentColor,
    Guid? ParentId = null);

/// <summary>Copy a universe type template into a project as a new type (#283). The name defaults to the template's.</summary>
public sealed record ProjectTypeFromTemplateRequest(Guid TemplateId, string? Name);

/// <summary>One field on a project's type. The kinds are the lore's own <see cref="EntityFieldKind"/>, unchanged.</summary>
public sealed record ProjectEntityFieldRequest(
    string? Name,
    EntityFieldKind Kind,
    bool? IsRequired = null,
    IReadOnlyList<string>? Options = null,
    FieldImageShape? ImageShape = null);

public sealed record ProjectEntityFieldResponse(
    Guid Id,
    string Name,
    EntityFieldKind Kind,
    bool IsRequired,
    int DisplayOrder,
    IReadOnlyList<ProjectEntityFieldOptionResponse> Options,
    FieldImageShape? ImageShape = null);

public sealed record ProjectEntityFieldOptionResponse(Guid Id, string Value, int DisplayOrder);

/// <summary>
/// A type of one project, with the fields defined on it. <paramref name="InheritedFields"/> are the fields it has from
/// the types above it, which are defined once on the parent and never copied down (#143, #144).
/// </summary>
public sealed record ProjectEntityTypeResponse(
    Guid Id,
    string Name,
    string? Description,
    string? Icon,
    string? AccentColor,
    Guid? ParentId,
    int DisplayOrder,
    int EntryCount,
    IReadOnlyList<ProjectEntityFieldResponse> Fields,
    IReadOnlyList<ProjectEntityFieldResponse> InheritedFields);

/// <summary>
/// The starter types a kind of project is offered. Applying one writes ordinary types the author may then rename,
/// delete or add to; nothing marks them as starters afterwards, because a template is a convenience and not a schema.
/// </summary>
public sealed record ProjectTemplateResponse(string Name, IReadOnlyList<string> Types, bool AlreadyApplied);

public sealed record ProjectEntityRequest(
    Guid EntityTypeId,
    string? Name,
    string? Summary,
    Guid? CanonEntityId = null,
    IReadOnlyList<FieldValueInput>? Fields = null,
    int? ExpectedVersion = null);

public sealed record ProjectEntitySummary(
    Guid Id,
    string Name,
    string? Summary,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    Guid? CanonEntityId,
    string? CanonEntityName,
    DateTime UpdatedAt,
    EntityImageRef? Image = null);
