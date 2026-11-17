namespace LorEvolve.Api.Features.ComicCollections;

/// <summary>A new collection's kind, name and summary. Kind is read on create only.</summary>
public sealed record ComicCollectionRequest(string? Kind, string? Name, string? Summary, int? ExpectedVersion = null);

public sealed record ComicEntryRequest(Guid NodeId);

public sealed record ComicPlaceRequest(int Place);

public sealed record ComicCollectionsResponse(
    IReadOnlyList<ComicCollectionResponse> Collections,
    IReadOnlyList<ComicNodeResponse> Candidates);

public sealed record ComicCollectionResponse(
    Guid Id,
    string Kind,
    string Name,
    string? Summary,
    int SortOrder,
    int Version,
    IReadOnlyList<ComicEntryResponse> Entries);

/// <summary>An entry as a collection lists it; <c>Available</c> is false when its node no longer fits the kind.</summary>
public sealed record ComicEntryResponse(Guid NodeId, Guid ProjectId, string ProjectName, string Level, string? Title, bool Available);

public sealed record ComicNodeResponse(Guid NodeId, Guid ProjectId, string ProjectName, string Level, string? Title);
