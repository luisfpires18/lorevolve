using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;

namespace LorEvolve.Api.Features.Progression;

/// <summary>
/// An entry's whole progression, saved at once over the version it was read at (ADR 0043). Each collection left out keeps
/// what is stored - so a client that predates a part of it cannot clear that part - and an empty list removes it all.
/// The list's order is the order saved.
/// </summary>
public sealed record ProgressionRequest(
    IReadOnlyList<EraInput?>? Eras,
    int? ExpectedVersion = null,
    IReadOnlyList<FormInput?>? Forms = null,
    IReadOnlyList<AbilityInput?>? Abilities = null,
    IReadOnlyList<AppearanceInput?>? Appearances = null);

/// <summary>
/// One appearance as saved (Issue #43): a label, notes, and the eras, forms and scenes of this entry and universe it belongs to,
/// exactly as ticked. Its pictures are not part of a save.
/// </summary>
public sealed record AppearanceInput(
    Guid? Id,
    string? Label,
    string? Notes,
    IReadOnlyList<Guid>? EraIds,
    IReadOnlyList<Guid>? FormIds,
    IReadOnlyList<Guid>? SceneIds);

/// <summary>One picture of an appearance's gallery: its id names its address.</summary>
public sealed record AppearanceImageRef(Guid Id, string ContentType, int Width, int Height, string? FileName);

/// <summary>One appearance, read, with the pictures it holds now in their order.</summary>
public sealed record AppearanceResponse(
    Guid Id,
    string Label,
    string? Notes,
    int SortOrder,
    IReadOnlyList<EraRef> Eras,
    IReadOnlyList<EraRef> Forms,
    IReadOnlyList<EraSceneRef> Scenes,
    IReadOnlyList<AppearanceImageRef> Images);

/// <summary>An appearance's gallery in a new order: exactly its pictures, each once.</summary>
public sealed record AppearanceImageOrderRequest(IReadOnlyList<Guid>? ImageIds);

/// <summary>
/// One form as saved (Issue #42). <paramref name="Id"/> names one of this entry's forms, or null for a new one. The first
/// unlock - an era of this entry, a scene, a timeline moment - is each optional and none is derived from another.
/// <paramref name="EraIds"/> are the eras of this entry it is available in, exactly as ticked; <paramref name="SceneIds"/> the
/// scenes it is used in.
/// </summary>
public sealed record FormInput(
    Guid? Id,
    string? Name,
    string? Description,
    Guid? UnlockEraId,
    Guid? UnlockSceneId,
    Guid? UnlockMomentId,
    IReadOnlyList<Guid>? EraIds,
    IReadOnlyList<Guid>? SceneIds);

/// <summary>One ability as saved (Issue #42): what a form has, and <paramref name="FormIds"/>, the forms of this entry it belongs to.</summary>
public sealed record AbilityInput(
    Guid? Id,
    string? Name,
    string? Description,
    Guid? UnlockEraId,
    Guid? UnlockSceneId,
    Guid? UnlockMomentId,
    IReadOnlyList<Guid>? EraIds,
    IReadOnlyList<Guid>? SceneIds,
    IReadOnlyList<Guid>? FormIds);

/// <summary>
/// One era as saved. <paramref name="Id"/> names one of this entry's eras, kept with its id; null makes a new one.
/// <paramref name="Start"/> and <paramref name="End"/> are optional bounds on the universe's own chronology, each as precise as
/// written: a year alone covers the whole year. <paramref name="Fields"/> are the era's overrides - a field left out is
/// inherited from the entry.
/// </summary>
public sealed record EraInput(
    Guid? Id,
    string? Name,
    string? Description,
    ChronologyValue? Start,
    ChronologyValue? End,
    IReadOnlyList<Guid>? StoryIds,
    IReadOnlyList<Guid>? SceneIds,
    IReadOnlyList<EraFieldInput>? Fields);

/// <summary>
/// One field an era overrides: a value in the members <see cref="FieldValueInput"/> uses, read by the field's kind, or
/// <paramref name="Cleared"/> - no value in this era, which only an optional field may be. An override that is neither
/// cleared nor holds a value is no override, and the era inherits the field.
/// </summary>
public sealed record EraFieldInput(
    Guid FieldDefinitionId,
    bool Cleared,
    string? Text,
    double? Number,
    bool? Boolean,
    DateTime? Date,
    IReadOnlyList<Guid>? OptionIds,
    Guid? ReferencedEntityId,
    Guid? EraId = null)
{
    public FieldValueInput ToValue() => new(FieldDefinitionId, Text, Number, Boolean, Date, OptionIds, ReferencedEntityId, EraId);
}

/// <summary>
/// The stored form of one saved version: the save's own request, normalised - eras in order with their ids, links sorted,
/// overrides by field. A restore replays it as a save. A member absent from an older version's JSON is null - that part did
/// not exist then - and a restore keeps it as stored, exactly as a save that leaves it out does.
/// </summary>
public sealed record ProgressionSnapshot(
    IReadOnlyList<EraInput> Eras,
    IReadOnlyList<FormInput>? Forms = null,
    IReadOnlyList<AbilityInput>? Abilities = null,
    IReadOnlyList<AppearanceInput>? Appearances = null)
{
    public static ProgressionSnapshot Empty { get; } = new([], [], [], []);

    public ProgressionRequest ToRequest(int? expectedVersion) =>
        new([.. Eras ?? []], expectedVersion, Forms is null ? null : [.. Forms], Abilities is null ? null : [.. Abilities],
            Appearances is null ? null : [.. Appearances]);
}

public sealed record ProgressionResponse(
    Guid EntityId,
    IReadOnlyList<EraResponse> Eras,
    DateTime? UpdatedAt,
    int Version,
    IReadOnlyList<FormResponse>? Forms = null,
    IReadOnlyList<AbilityResponse>? Abilities = null,
    IReadOnlyList<AppearanceResponse>? Appearances = null);

/// <summary>An era named by a form or ability, as it reads now.</summary>
public sealed record EraRef(Guid Id, string Name);

/// <summary>A timeline moment named as a milestone, as it reads now.</summary>
public sealed record MomentRef(Guid Id, string Title, bool IsTrashed);

/// <summary>When a form or ability was first unlocked: each part optional, none derived from another.</summary>
public sealed record UnlockMilestone(EraRef? Era, EraSceneRef? Scene, MomentRef? Moment);

/// <summary>One form, read (Issue #42): what it is, its first unlock, the eras it is available in and the scenes it is used in.</summary>
public sealed record FormResponse(
    Guid Id,
    string Name,
    string? Description,
    int SortOrder,
    UnlockMilestone Unlock,
    IReadOnlyList<EraRef> Eras,
    IReadOnlyList<EraSceneRef> Scenes);

/// <summary>One ability, read (Issue #42), with the forms it belongs to.</summary>
public sealed record AbilityResponse(
    Guid Id,
    string Name,
    string? Description,
    int SortOrder,
    UnlockMilestone Unlock,
    IReadOnlyList<EraRef> Eras,
    IReadOnlyList<EraSceneRef> Scenes,
    IReadOnlyList<EraRef> Forms);

/// <summary>
/// One era, with what it links to named as it reads now. <paramref name="Fields"/> are only the overrides; every other field
/// reads from the entry. A story or scene in the Trash stays listed, marked, so a save that sends the list back keeps it.
/// </summary>
public sealed record EraResponse(
    Guid Id,
    string Name,
    string? Description,
    int SortOrder,
    ChronologyValue? Start,
    ChronologyValue? End,
    IReadOnlyList<EraStoryRef> Stories,
    IReadOnlyList<EraSceneRef> Scenes,
    IReadOnlyList<EraFieldResponse> Fields);

public sealed record EraStoryRef(Guid Id, string Title, bool IsTrashed);

public sealed record EraSceneRef(Guid Id, Guid StoryId, string Title, string StoryTitle, bool IsTrashed);

/// <summary>An era's override of one field, in <see cref="FieldValueResponse"/>'s members, or <paramref name="Cleared"/>.</summary>
public sealed record EraFieldResponse(
    Guid FieldDefinitionId,
    string Name,
    EntityFieldKind Kind,
    bool Cleared,
    string? Text,
    double? Number,
    bool? Boolean,
    DateTime? Date,
    IReadOnlyList<Guid> OptionIds,
    IReadOnlyList<string> OptionValues,
    Guid? ReferencedEntityId,
    string? ReferencedEntityName,
    bool ReferencedEntityIsTrashed,
    Guid? EraId);

public sealed record ProgressionRevisionSummary(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    string? ActorName);

/// <summary>One saved version, read against today's names: a field, story or entry deleted since reads as removed.</summary>
public sealed record ProgressionRevisionDetail(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    string? ActorName,
    IReadOnlyList<EraResponse> Eras,
    IReadOnlyList<FormResponse>? Forms = null,
    IReadOnlyList<AbilityResponse>? Abilities = null,
    IReadOnlyList<AppearanceResponse>? Appearances = null);

public sealed record ProgressionRestoreRequest(int? ExpectedVersion);
