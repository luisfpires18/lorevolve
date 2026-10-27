using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Features.Ideas;

/// <summary>
/// A possibility an author wants to keep: "Maybe this city floats", "What if Mira betrays Arlen?".
///
/// <b>An idea is not lore.</b> Nothing about it is true in the world, and nothing reads it for meaning. Saving, deleting or
/// restoring one never creates or changes an entry, a relationship, a timeline moment, a story, Canon or a Canon finding,
/// and nothing promotes an idea into any of them (ADR 0030).
///
/// <b>Owned by the account, not by a universe.</b> <see cref="OwnerId"/> is the privacy boundary and every query starts
/// from it. <see cref="UniverseId"/> is an optional association with one of that same account's universes - never a hidden
/// universe, and never how ownership is decided. An idea with no universe belongs to its account directly.
///
/// Deliberately small: a title, a plain-text body and the association. No status, priority, order, colour, tag or folder;
/// the list is most recently updated first, so nothing needs organising.
/// </summary>
public sealed class Idea
{
    public Guid Id { get; set; }

    public required string OwnerId { get; set; }

    public LorEvolveUser? Owner { get; set; }

    /// <summary>
    /// The universe this idea is about, or null for an idea that belongs to no universe. Always one the owner owns. When that
    /// universe is deleted the idea stays, unassigned, with its title and body intact.
    /// </summary>
    public Guid? UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Title { get; set; }

    /// <summary>Plain text exactly as written: never trimmed, rendered or read for meaning. <c>""</c> when there is none.</summary>
    public required string Body { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>When the idea last changed. Also the token a save names, so two windows cannot quietly overwrite each other.</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>When the idea was deleted, or null while it is live. Deleted ideas are kept and can be restored whole.</summary>
    public DateTime? DeletedAt { get; set; }

    public ICollection<IdeaEntityReference> EntityReferences { get; } = [];

    public ICollection<IdeaStoryReference> StoryReferences { get; } = [];

    public ICollection<IdeaSceneReference> SceneReferences { get; } = [];

    public ICollection<IdeaPlotArcReference> PlotArcReferences { get; } = [];

    public ICollection<IdeaPlotBeatReference> PlotBeatReferences { get; } = [];
}

/// <summary>
/// What an idea may point at. Stated explicitly on every reference and never inferred from an id or a name. An article is
/// not a target of its own - it belongs to its entry - and neither is a manuscript, which belongs to its scene.
/// </summary>
public enum IdeaReferenceKind
{
    Entity = 0,
    Story = 1,
    Scene = 2,
    PlotArc = 3,
    PlotBeat = 4,
}

// One relational row per pair, as a scene's or a beat's links are: the foreign keys are real, a pair exists once, and a
// target deleted for good takes only the reference with it. A reference copies nothing from its target, means nothing
// about it and changes nothing in it.

public sealed class IdeaEntityReference
{
    public Guid IdeaId { get; set; }

    public Idea? Idea { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }
}

public sealed class IdeaStoryReference
{
    public Guid IdeaId { get; set; }

    public Idea? Idea { get; set; }

    public Guid StoryId { get; set; }

    public Story? Story { get; set; }
}

public sealed class IdeaSceneReference
{
    public Guid IdeaId { get; set; }

    public Idea? Idea { get; set; }

    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }
}

public sealed class IdeaPlotArcReference
{
    public Guid IdeaId { get; set; }

    public Idea? Idea { get; set; }

    public Guid PlotArcId { get; set; }

    public PlotArc? PlotArc { get; set; }
}

public sealed class IdeaPlotBeatReference
{
    public Guid IdeaId { get; set; }

    public Idea? Idea { get; set; }

    public Guid PlotBeatId { get; set; }

    public PlotBeat? PlotBeat { get; set; }
}
