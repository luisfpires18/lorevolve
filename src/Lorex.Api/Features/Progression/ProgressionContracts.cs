using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;

namespace Lorex.Api.Features.Progression;

/// <summary>
/// An entry's whole progression, saved at once over the version it was read at (ADR 0043). Each collection left out keeps
/// what is stored - so a client that predates a part of it cannot clear that part - and an empty list removes it all.
/// The list's order is the order saved.
/// </summary>
public sealed record ProgressionRequest(IReadOnlyList<EraInput?>? Eras, int? ExpectedVersion = null);

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
/// overrides by field. A restore replays it as a save. A member absent from an older version's JSON reads as empty: that
/// part had nothing then.
/// </summary>
public sealed record ProgressionSnapshot(IReadOnlyList<EraInput> Eras)
{
    public static ProgressionSnapshot Empty { get; } = new([]);

    public ProgressionRequest ToRequest(int? expectedVersion) => new([.. Eras ?? []], expectedVersion);
}

public sealed record ProgressionResponse(
    Guid EntityId,
    IReadOnlyList<EraResponse> Eras,
    DateTime? UpdatedAt,
    int Version);

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
    IReadOnlyList<EraResponse> Eras);

public sealed record ProgressionRestoreRequest(int? ExpectedVersion);
