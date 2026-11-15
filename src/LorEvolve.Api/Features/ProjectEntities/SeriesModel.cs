using LorEvolve.Api.Features.Projects;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// A season of a Series project (#145): the band an author groups episodes into.
///
/// <para>Its own table rather than a reinterpretation of <see cref="Stories.Chapter"/>. A chapter belongs to a story,
/// which is universe-scoped and carries manuscripts, arcs, beats and publication; #145 puts a Story rewrite explicitly
/// out of scope, and a Writing Project is already a derived view of a Story with no rows of its own
/// (<see cref="StoryProjects"/>), so bending chapters into seasons would put a second meaning on rows the Stories
/// feature owns. A season holds episodes and nothing else.</para>
///
/// <para>Deleting the project deletes its seasons, as it deletes everything else of the project (#171).</para>
/// </summary>
public sealed class ProjectSeason
{
    public Guid Id { get; set; }

    public Guid ProjectId { get; set; }

    public CreativeProject? Project { get; set; }

    /// <summary>
    /// What the author calls it: "Season 1", "Book Two", "The Winter Arc". Free text, because a season is not always
    /// numbered and nothing here should insist that it is.
    /// </summary>
    public required string Name { get; set; }

    public string? Summary { get; set; }

    /// <summary>
    /// Where it sits in the project's list, held as a place rather than derived from the name: an author may reorder
    /// seasons, and "Season 10" sorts before "Season 2" by name (ADR 0024's reasoning, applied here).
    /// </summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public List<ProjectEpisode> Episodes { get; set; } = [];
}

/// <summary>
/// One episode of a season (#145), with its script.
///
/// <para>The script is a column here rather than a <see cref="Stories.SceneManuscript"/>: a manuscript hangs off a
/// scene of a story, with its own revision history and mention scanning, and reusing it would mean giving a scene two
/// owners. An episode's script is one document the author edits, guarded by <see cref="Version"/> the way every other
/// editable thing in LorEvolve is (ADR 0043).</para>
/// </summary>
public sealed class ProjectEpisode
{
    public Guid Id { get; set; }

    public Guid SeasonId { get; set; }

    public ProjectSeason? Season { get; set; }

    public required string Title { get; set; }

    public string? Synopsis { get; set; }

    /// <summary>The script as the author saved it, or null while the episode has none.</summary>
    public string? Script { get; set; }

    /// <summary>Where it sits in its season, for the same reason a season has a place of its own.</summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// The edit version: 1 when created, advanced by every write that changes the episode or its script. A save names
    /// the version it was written over and is refused when it is no longer current (ADR 0043).
    /// </summary>
    public int Version { get; set; } = 1;
}
