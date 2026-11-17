using LorEvolve.Api.Features.ProjectEntities;

namespace LorEvolve.Api.Features.TypeTemplates;

/// <summary>
/// A universe's reusable type on the wire (#281). Requests reuse <see cref="ProjectEntityTypeRequest"/> and
/// <see cref="ProjectEntityFieldRequest"/>, and fields are answered in the project types' own shape.
/// </summary>
public sealed record TypeTemplateResponse(
    Guid Id,
    string Name,
    string? Description,
    string? Icon,
    string? AccentColor,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<ProjectEntityFieldResponse> Fields);
