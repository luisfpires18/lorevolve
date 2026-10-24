using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;

namespace Lorex.Api.Features.Progression;

/// <summary>
/// One look of an entry (Issue #43): an outfit, a costume, armour, a disguise, how a place or a ship looked for a while. A
/// label, notes, an ordered gallery of zero or more pictures, and - each optional and explicit - the eras, forms and scenes it
/// belongs to. A form's look is the appearances that name it; nothing is copied into the form.
///
/// <b>Not the entry's picture.</b> The entry's own primary image (ADR 0019) is untouched and stays what cards and pickers show.
///
/// <b>Pictures are not versioned.</b> The appearance itself is part of the progression and its history; its pictures are
/// stored objects, added and removed one at a time, and a removed picture is deleted, not kept for a restore (owner decision,
/// 2026-10-24). So an appearance that still holds pictures is never removed by a save or a restore; its pictures go first.
/// </summary>
public sealed class EntityAppearance
{
    public Guid Id { get; set; }

    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    /// <summary>"Battle armour". Unique among the entry's appearances, ignoring case.</summary>
    public required string Label { get; set; }

    public string? Notes { get; set; }

    /// <summary>The appearance's place among the entry's appearances, 0 first; the author's order.</summary>
    public int SortOrder { get; set; }

    public ICollection<EntityAppearanceEra> Eras { get; } = [];

    public ICollection<EntityAppearanceForm> Forms { get; } = [];

    public ICollection<EntityAppearanceScene> Scenes { get; } = [];

    public ICollection<EntityAppearanceImage> Images { get; } = [];
}

/// <summary>One era an appearance belongs to, as the author said.</summary>
public sealed class EntityAppearanceEra
{
    public Guid EntityAppearanceId { get; set; }

    public EntityAppearance? Appearance { get; set; }

    public Guid EntityEraId { get; set; }

    public EntityEra? Era { get; set; }
}

/// <summary>One form an appearance is a look of.</summary>
public sealed class EntityAppearanceForm
{
    public Guid EntityAppearanceId { get; set; }

    public EntityAppearance? Appearance { get; set; }

    public Guid EntityFormId { get; set; }

    public EntityForm? Form { get; set; }
}

/// <summary>One scene an appearance is worn or seen in. Kept through the Trash, like an era's scenes.</summary>
public sealed class EntityAppearanceScene
{
    public Guid EntityAppearanceId { get; set; }

    public EntityAppearance? Appearance { get; set; }

    public Guid SceneId { get; set; }

    public Scene? Scene { get; set; }
}

/// <summary>
/// One picture in an appearance's gallery, stored the way an entry's own picture is (ADR 0019): the original exactly as
/// uploaded and a square WebP thumbnail cut from its centre, under keys made of ids only, in the private store, served only
/// to members through Lorex. <see cref="Id"/> is new for every upload and names the pair, so a served address always names
/// the same bytes. Counts against the universe owner's storage like any Lore picture (ADR 0042).
/// </summary>
public sealed class EntityAppearanceImage
{
    public Guid Id { get; set; }

    public Guid EntityAppearanceId { get; set; }

    public EntityAppearance? Appearance { get; set; }

    /// <summary>The picture's place in the gallery, 0 first.</summary>
    public int SortOrder { get; set; }

    public required string OriginalKey { get; set; }

    public required string ThumbnailKey { get; set; }

    public required string ContentType { get; set; }

    /// <summary>The author's own filename, a label only.</summary>
    public string? FileName { get; set; }

    public int Width { get; set; }

    public int Height { get; set; }

    /// <summary>The original's size in bytes, as received.</summary>
    public long ByteSize { get; set; }

    public DateTime UploadedAt { get; set; }
}
