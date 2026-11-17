using LorEvolve.Api.Features.Projects;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// One unit of a project's authored structure (#290): an act, a sequence, a scene, a beat, and later the season,
/// episode, segment, shot, issue, chapter, page and panel levels other formats add.
///
/// <para>One self-referencing table for every format rather than a table per level. Which level may sit where is not
/// held here but in <see cref="ProjectStructures"/>, keyed by the project's format, so a new format is a rule entry
/// and never a new hierarchy. The older season, episode, page and panel tables stay for projects without a
/// rule-backed format; nothing converts them.</para>
/// </summary>
public sealed class ProjectNode
{
    public Guid Id { get; set; }

    public Guid ProjectId { get; set; }

    public CreativeProject? Project { get; set; }

    /// <summary>The node it sits under, or null for a root of the project's structure.</summary>
    public Guid? ParentId { get; set; }

    public ProjectNode? Parent { get; set; }

    public List<ProjectNode> Children { get; set; } = [];

    /// <summary>The level word, one of <see cref="ProjectStructures"/>' levels: "act", "scene", "beat".</summary>
    public required string Level { get; set; }

    /// <summary>Optional: a beat or a shot is often untitled.</summary>
    public string? Title { get; set; }

    public string? Summary { get; set; }

    /// <summary>The node's text: a scene's script, a beat's description.</summary>
    public string? Body { get; set; }

    /// <summary>A comic panel's script (#295): what is spoken, the caption box, sound effects, notes for the artist.
    /// Only a panel holds them; <see cref="Body"/> is its visual description.</summary>
    public string? Dialogue { get; set; }

    public string? Caption { get; set; }

    public string? Sfx { get; set; }

    public string? Notes { get; set; }

    /// <summary>Its place among its siblings, renumbered 0, 1, 2 on every move.</summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>The edit version (ADR 0043), as <see cref="ProjectEpisode.Version"/>.</summary>
    public int Version { get; set; } = 1;
}

/// <summary>
/// The one picture of a comic page or panel (#295): the same columns and pipeline as
/// <see cref="Lore.EntityFieldImage"/>, keyed by its node. Cascades with the node; the delete routes sweep its objects.
/// </summary>
public sealed class ProjectNodeImage
{
    public Guid NodeId { get; set; }

    public ProjectNode? Node { get; set; }

    public Guid AssetId { get; set; }

    public required string OriginalKey { get; set; }

    public Guid CropId { get; set; }

    public required string CropKey { get; set; }

    public double CropX { get; set; }

    public double CropY { get; set; }

    public double CropWidth { get; set; }

    public double CropHeight { get; set; }

    public required string ContentType { get; set; }

    public string? FileName { get; set; }

    public int Width { get; set; }

    public int Height { get; set; }

    public long ByteSize { get; set; }

    public DateTime UploadedAt { get; set; }
}

/// <summary>Where a node's picture lives, by the rules of <see cref="Lore.EntityFieldImageKeys"/>.
///   universes/{universeId}/projects/{projectId}/nodes/{nodeId}/{assetId}/original.{ext}, .../crop-{cropId}.webp</summary>
public static class ProjectNodeImageKeys
{
    private static string Prefix(Guid universeId, Guid projectId, Guid nodeId, Guid assetId) =>
        $"universes/{universeId:D}/projects/{projectId:D}/nodes/{nodeId:D}/{assetId:D}";

    public static string Original(Guid universeId, Guid projectId, Guid nodeId, Guid assetId, string extension) =>
        $"{Prefix(universeId, projectId, nodeId, assetId)}/original.{extension}";

    public static string Crop(Guid universeId, Guid projectId, Guid nodeId, Guid assetId, Guid cropId) =>
        $"{Prefix(universeId, projectId, nodeId, assetId)}/crop-{cropId:D}.webp";
}
