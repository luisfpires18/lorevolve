using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Features.Projects;

/// <summary>
/// What kind of thing an author is making. Closed and deliberately small: it says what the work is, never how far along
/// it is (that is <see cref="ProjectLifecycle"/>) and never anything about a world (that is the universe it may be
/// linked to).
///
/// Stored as an int, so the names may be reordered only by never reusing a number.
/// </summary>
public enum ProjectKind
{
    Writing = 0,
    Game = 1,
    Series = 2,
    Film = 3,
    Comic = 4,
}

/// <summary>
/// How far along a project is, from the author's point of view.
///
/// Modelled on <see cref="Stories.StoryStatus"/>, which is <c>Planning</c>, <c>Drafting</c>, <c>Complete</c>, so the two
/// read the same way in a list. <c>Active</c> stands where a story says <c>Drafting</c>, because a game or a film is not
/// drafted; <c>Archived</c> has no equivalent there, and is here because a project outlives a story and an author needs
/// to be able to put one down without saying it is finished.
/// </summary>
public enum ProjectLifecycle
{
    Planning = 0,
    Active = 1,
    Complete = 2,
    Archived = 3,
}

/// <summary>
/// One creative project: a novel, a game, a series, a film or a comic an author is making.
///
/// <b>Inside exactly one universe.</b> <see cref="UniverseId"/> is required: a project is a subdivision of a universe,
/// alongside its worldbuilding, and there is no such thing as a project without one (#171). <see cref="OwnerId"/> is
/// still the account that made it and still the privacy boundary for a project nobody has been given access to, but it
/// is no longer what holds a project in existence. In that respect this follows <see cref="Stories.Story"/>, which is
/// owned by its universe and deleted with it, rather than <see cref="Ideas.Idea"/>, which may belong to no universe.
///
/// <b>Access comes from the universe.</b> A collaborator who can read the universe can read its projects, and one who
/// can edit its content can edit them. Deciding that in one place is why every route goes through
/// <see cref="ProjectAccess"/>.
///
/// <b>It holds nothing yet.</b> A project has no scenes, entries, media or members of its own. Associating existing
/// Stories with a project is #140's work, and nothing here reads or writes a Story, a scene or an id either of them
/// uses.
/// </summary>
public sealed class CreativeProject
{
    public Guid Id { get; set; }

    /// <summary>The account the project belongs to. Deleting the account deletes the project.</summary>
    public required string OwnerId { get; set; }

    public LorEvolveUser? Owner { get; set; }

    /// <summary>
    /// The universe this project belongs to. **Required: every project belongs to exactly one universe** (#171,
    /// superseding the optional-universe design of #138). A universe may hold very little worldbuilding, so a game or a
    /// film with almost no lore still has one; what it may not do is float free of every universe.
    ///
    /// Deleting the universe deletes its projects with it, as it deletes its stories: a project is a subdivision of a
    /// universe, not an account-level record that happens to point at one.
    /// </summary>
    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public ProjectKind Kind { get; set; }

    /// <summary>
    /// What the author calls this kind of work more precisely: "novel", "tabletop", "limited series". Free text, trimmed,
    /// and null when the author says nothing.
    ///
    /// There is no fixed vocabulary per kind, and that is recorded as an open choice on Issue #138 rather than invented
    /// here: naming the subtypes of five media is the owner's, and a list guessed now would be wrong in a way a stored
    /// enum makes expensive to correct.
    /// </summary>
    public string? Subtype { get; set; }

    public ProjectLifecycle Lifecycle { get; set; }

    public required string Name { get; set; }

    /// <summary>What the project is, in the author's words. <c>""</c> when there is none; never read for meaning.</summary>
    public required string Summary { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// What a save names as the version it was written over (ADR 0043), so two windows cannot quietly overwrite each
    /// other. Starts at 1 and rises by one on every save that changes something.
    /// </summary>
    public int Version { get; set; } = 1;
}
