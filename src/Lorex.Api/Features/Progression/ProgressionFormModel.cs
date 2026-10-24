using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;

namespace Lorex.Api.Features.Progression;

/// <summary>
/// One form an entry can take (Issue #42): "Super Saiyan", a werewolf's change, a ship's battle configuration - never a second
/// entry and never an era. A form says what it is, and - each optional and explicit - when it was first unlocked (an era of the
/// entry, a scene, a timeline moment), the eras it is available in, and the scenes it is used in.
///
/// <b>Available is not used, and neither is inferred.</b> Availability is the eras the author ticked (<see cref="Eras"/>);
/// nothing follows from the order of eras or from where it was first unlocked. Being used in a scene is its own list
/// (<see cref="Scenes"/>) and is never checked against availability: the author's story decides that. A form overrides no field
/// (owner decision, 2026-10-24); what it changes is said in its description, its abilities and its appearances.
/// </summary>
public sealed class EntityForm
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    /// <summary>"Super Saiyan 3". Unique among the entry's forms, ignoring case.</summary>
    public required string Name { get; set; }

    public string? Description { get; set; }

    /// <summary>The form's place among the entry's forms, 0 first; the author's order.</summary>
    public int SortOrder { get; set; }

    /// <summary>The era of this entry it was first unlocked in, or null. Left unknown if that era goes.</summary>
    public Guid? UnlockEntityEraId { get; set; }

    public EntityEra? UnlockEntityEra { get; set; }

    /// <summary>The scene it was first unlocked in, or null. A scene deleted for good leaves it unknown.</summary>
    public Guid? UnlockSceneId { get; set; }

    public Scene? UnlockScene { get; set; }

    /// <summary>The timeline moment it was first unlocked at, or null. A moment deleted for good leaves it unknown.</summary>
    public Guid? UnlockTimelineEntryId { get; set; }

    public TimelineEntry? UnlockTimelineEntry { get; set; }

    public ICollection<EntityFormEra> Eras { get; } = [];

    public ICollection<EntityFormScene> Scenes { get; } = [];
}

/// <summary>One era a form is available in, as the author said.</summary>
public sealed class EntityFormEra
{
    public Guid EntityFormId { get; set; }

    public EntityForm? Form { get; set; }

    public Guid EntityEraId { get; set; }

    public EntityEra? Era { get; set; }
}

/// <summary>One scene a form is used or active in. Kept through the Trash, like an era's scenes.</summary>
public sealed class EntityFormScene
{
    public Guid EntityFormId { get; set; }

    public EntityForm? Form { get; set; }

    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }
}

/// <summary>
/// One significant ability of an entry (Issue #42), with the same explicit milestone, availability and use as a form
/// (<see cref="EntityForm"/>), and the forms it belongs to, if any - an ability need not belong to one, and may belong to
/// several.
/// </summary>
public sealed class EntityAbility
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    /// <summary>"Instant Transmission". Unique among the entry's abilities, ignoring case.</summary>
    public required string Name { get; set; }

    public string? Description { get; set; }

    public int SortOrder { get; set; }

    public Guid? UnlockEntityEraId { get; set; }

    public EntityEra? UnlockEntityEra { get; set; }

    public Guid? UnlockSceneId { get; set; }

    public Scene? UnlockScene { get; set; }

    public Guid? UnlockTimelineEntryId { get; set; }

    public TimelineEntry? UnlockTimelineEntry { get; set; }

    public ICollection<EntityAbilityEra> Eras { get; } = [];

    public ICollection<EntityAbilityScene> Scenes { get; } = [];

    public ICollection<EntityAbilityForm> Forms { get; } = [];
}

public sealed class EntityAbilityEra
{
    public Guid EntityAbilityId { get; set; }

    public EntityAbility? Ability { get; set; }

    public Guid EntityEraId { get; set; }

    public EntityEra? Era { get; set; }
}

public sealed class EntityAbilityScene
{
    public Guid EntityAbilityId { get; set; }

    public EntityAbility? Ability { get; set; }

    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }
}

/// <summary>One form an ability belongs to.</summary>
public sealed class EntityAbilityForm
{
    public Guid EntityAbilityId { get; set; }

    public EntityAbility? Ability { get; set; }

    public Guid EntityFormId { get; set; }

    public EntityForm? Form { get; set; }
}
