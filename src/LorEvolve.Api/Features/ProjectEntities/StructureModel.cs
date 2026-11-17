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

    /// <summary>Its place among its siblings, renumbered 0, 1, 2 on every move.</summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>The edit version (ADR 0043), as <see cref="ProjectEpisode.Version"/>.</summary>
    public int Version { get; set; } = 1;
}
