namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>A new node: its level, the node it sits under (null for a root), and where among its siblings.</summary>
public sealed record ProjectNodeRequest(
    string? Level,
    Guid? ParentId = null,
    string? Title = null,
    string? Summary = null,
    string? Body = null,
    int? Place = null);

public sealed record ProjectNodeUpdate(string? Title, string? Summary, string? Body, int? ExpectedVersion = null);

/// <summary>Where a node goes: its parent (null = root) and its place there, clamped to the list.</summary>
public sealed record ProjectNodeMove(int Place, Guid? ParentId = null);

/// <summary>A node in the tree read: everything but its body, whose size is given instead.</summary>
public sealed record ProjectNodeSummary(
    Guid Id,
    Guid? ParentId,
    string Level,
    string? Title,
    string? Summary,
    int BodyLength,
    int SortOrder,
    int Version);

public sealed record ProjectNodeDetail(
    Guid Id,
    Guid? ParentId,
    string Level,
    string? Title,
    string? Summary,
    string? Body,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    int Version);

/// <summary>The whole structure with the rules that shape it, so a client never holds its own copy of them.</summary>
public sealed record ProjectStructureTree(
    string Format,
    string[] Roots,
    IReadOnlyDictionary<string, string[]> Children,
    IReadOnlyList<ProjectNodeSummary> Nodes);
