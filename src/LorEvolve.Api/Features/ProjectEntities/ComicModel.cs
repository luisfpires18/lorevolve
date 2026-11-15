namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// One page of a comic's chapter (#147).
///
/// <para>A comic is the one kind whose structure does not fit the two levels a series and a film use. Its volumes are
/// <see cref="ProjectSeason"/> rows and its chapters <see cref="ProjectEpisode"/> rows - the same ordered band of
/// ordered units, under the names a comic uses - and pages and panels are these two tables beneath a chapter. Four
/// levels, two of them shared, which is why this PR adds two tables rather than four.</para>
///
/// <para>A page carries no art of its own. The issue puts replacing the Media feature out of scope, and
/// <see cref="Lore.EntityImage"/> is a per-entry upload path with thumbnails and storage keys; a panel names a lore
/// entry and that entry's picture resolves through the existing feature. Panel art upload is a feature of its own.</para>
/// </summary>
public sealed class ProjectPage
{
    public Guid Id { get; set; }

    public Guid EpisodeId { get; set; }

    public ProjectEpisode? Episode { get; set; }

    /// <summary>
    /// What the author calls it, or null for a page known only by its place. A page is usually a number, and a number
    /// that is also a place would be two things to keep in step, so the place is the place and this is a label.
    /// </summary>
    public string? Name { get; set; }

    public string? Notes { get; set; }

    /// <summary>Where it sits in its chapter, renumbered on every move and delete as every other place here is.</summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public List<ProjectPanel> Panels { get; set; } = [];
}

/// <summary>
/// One panel of a page (#147): what happens in it, what is said, and optionally which lore entry it shows.
/// </summary>
public sealed class ProjectPanel
{
    public Guid Id { get; set; }

    public Guid PageId { get; set; }

    public ProjectPage? Page { get; set; }

    /// <summary>What the panel shows, in the author's words. The nearest thing a comic has to a scene's prose.</summary>
    public string? Description { get; set; }

    /// <summary>What is said in it, as written: speech, caption and sound, kept as one block rather than parsed.</summary>
    public string? Dialogue { get; set; }

    /// <summary>
    /// The lore entry this panel shows, or null. Not a foreign key, for the reason
    /// <see cref="Lore.LoreEntity.CanonEntityId"/> is not one: SQLite would add one only by rebuilding the table. The
    /// route checks it is a live lore entry of the project's own universe, and the panel's own project owns the page
    /// above it, so a reference cannot cross a universe.
    /// </summary>
    public Guid? CanonEntityId { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
