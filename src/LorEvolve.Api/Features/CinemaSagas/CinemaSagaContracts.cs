using LorEvolve.Api.Features.Projects;

namespace LorEvolve.Api.Features.CinemaSagas;

/// <summary>A saga or a phase: its name and summary, and the version an edit was written over.</summary>
public sealed record CinemaGroupRequest(string? Name, string? Summary, int? ExpectedVersion = null);

public sealed record CinemaMemberRequest(Guid ProjectId);

public sealed record CinemaPlaceRequest(int Place);

public sealed record CinemaSagasResponse(IReadOnlyList<CinemaSagaResponse> Sagas, IReadOnlyList<CinemaProductionResponse> Unassigned);

public sealed record CinemaSagaResponse(
    Guid Id,
    string Name,
    string? Summary,
    int SortOrder,
    int Version,
    IReadOnlyList<CinemaPhaseResponse> Phases);

public sealed record CinemaPhaseResponse(
    Guid Id,
    string Name,
    string? Summary,
    int SortOrder,
    int Version,
    IReadOnlyList<CinemaProductionResponse> Members);

/// <summary>A production as a phase lists it: the original project's id, name, kind and format.</summary>
public sealed record CinemaProductionResponse(Guid ProjectId, string Name, ProjectKind Kind, string? Format);
