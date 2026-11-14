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
/// <b>Owned by the account, like an idea.</b> <see cref="OwnerId"/> is the privacy boundary and every query starts from
/// it. <see cref="UniverseId"/> is an optional link to one universe the account can reach, and a project with no
/// universe belongs to the account directly: a standalone project is the ordinary case, not a special one. This follows
/// <see cref="Ideas.Idea"/> rather than <see cref="Stories.Story"/>, which is owned by its universe and deleted with it.
///
/// <b>Where it differs from an idea.</b> An idea's universe link never grants access to anyone; a project's does, on
/// purpose, because a project is the thing a team works on together. A collaborator who can read the linked universe can
/// read its projects, and one who can edit its content can edit them. Deciding that in one place is why every route goes
/// through <see cref="ProjectAccess"/>.
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
    /// The universe this project draws on, or null for a standalone project. Deleting the universe leaves the project,
    /// unlinked, with everything else intact: the work is the author's, not the world's.
    /// </summary>
    public Guid? UniverseId { get; set; }

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
