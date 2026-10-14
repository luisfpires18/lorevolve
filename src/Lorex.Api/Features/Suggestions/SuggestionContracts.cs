using System.Text.Json;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;

namespace Lorex.Api.Features.Suggestions;

// The records below are what a suggestion stores, as JSON, in `Before` and `Proposed` (ADR 0044). They are this feature's
// own contract, deliberately not the API's response records: a suggestion is a historical review record and has to read
// the same after those responses change. Built and read only through these records - never patched, never reflected.

/// <summary>One custom field's value as a suggestion holds it: its value, and the names it showed, beside the ids.</summary>
public sealed record SuggestedFieldValue(
    Guid FieldDefinitionId,
    string Name,
    EntityFieldKind Kind,
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

/// <summary>A Lore entry a scene names, as a suggestion holds it.</summary>
public sealed record SuggestedLore(Guid EntityId, string Name, bool IsTrashed)
{
    public static SuggestedLore From(SceneLoreReference reference) => new(reference.EntityId, reference.Name, reference.IsTrashed);
}

/// <summary>Where a scene happens in the world, as a suggestion holds it: the stored point's own parts.</summary>
public sealed record SuggestedDate(Guid? EraId, int? Year, int? Month, int? Day, Guid? MonthId)
{
    public static SuggestedDate? From(ChronologyValue? value) =>
        value is null ? null : new(value.EraId, value.Year, value.Month, value.Day, value.MonthId);

    public ChronologyValue Value() => new(EraId, Year, Month, Day, MonthId);
}

/// <summary>
/// What a suggestion holds of an entry: exactly what the entry form edits - names beside ids, so it still explains itself
/// after the type, a choice or a linked entry is renamed or gone. Nothing else of the entry.
/// </summary>
public sealed record EntrySuggestion(
    Guid EntityTypeId,
    string EntityTypeName,
    string Name,
    string? Summary,
    CanonStatus CanonStatus,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    IReadOnlyList<SuggestedFieldValue> Fields)
{
    public static EntrySuggestion From(EntityDetail entry) =>
        new(
            entry.EntityTypeId,
            entry.EntityTypeName,
            entry.Name,
            entry.Summary,
            entry.CanonStatus,
            entry.Aliases,
            entry.Tags,
            [.. entry.Fields.Select(field => new SuggestedFieldValue(
                field.FieldDefinitionId,
                field.Name,
                field.Kind,
                field.Text,
                field.Number,
                field.Boolean,
                field.Date,
                field.OptionIds,
                field.OptionValues,
                field.ReferencedEntityId,
                field.ReferencedEntityName,
                field.ReferencedEntityIsTrashed,
                field.EraId))]);

    /// <summary>The ordinary entry save this stands for, over <paramref name="expectedVersion"/>. Only the form's own fields.</summary>
    public EntityRequest Request(int expectedVersion) =>
        new(
            EntityTypeId,
            Name,
            Summary,
            CanonStatus,
            Aliases,
            Tags,
            [.. Fields.Select(field => new FieldValueInput(
                field.FieldDefinitionId,
                field.Text,
                field.Number,
                field.Boolean,
                field.Date,
                field.OptionIds,
                field.ReferencedEntityId,
                field.EraId))],
            expectedVersion);

    /// <summary>Whether the two hold the same stored values: names shown and the order of sets aside.</summary>
    public bool SameFormAs(EntrySuggestion other) => Key() == other.Key();

    private string Key() => JsonSerializer.Serialize(new
    {
        EntityTypeId,
        Name,
        Summary,
        CanonStatus,
        Aliases = Aliases.Order(StringComparer.Ordinal),
        Tags = Tags.Order(StringComparer.Ordinal),
        Fields = Fields
            .OrderBy(field => field.FieldDefinitionId)
            .Select(field => new
            {
                field.FieldDefinitionId,
                field.Text,
                field.Number,
                field.EraId,
                field.Boolean,
                Date = field.Date?.Ticks,
                Options = field.OptionIds.Order(),
                field.ReferencedEntityId,
            }),
    });
}

/// <summary>What a suggestion holds of a story: its form - title, premise and status.</summary>
public sealed record StorySuggestion(string Title, string? Premise, StoryStatus Status)
{
    public static StorySuggestion From(StoryDetail story) => new(story.Title, story.Premise, story.Status);

    public StoryRequest Request(int expectedVersion) => new(Title, Premise, Status, expectedVersion);
}

/// <summary>
/// What a suggestion holds of a scene: its form - title, chapter, summary, notes, point of view, date and linked lore, the
/// lore by name beside its id.
/// </summary>
public sealed record SceneSuggestion(
    string Title,
    Guid? ChapterId,
    string? Summary,
    string? Notes,
    SuggestedLore? Pov,
    SuggestedDate? Chronology,
    IReadOnlyList<SuggestedLore> Entities)
{
    public static SceneSuggestion From(SceneResponse scene) =>
        new(
            scene.Title,
            scene.ChapterId,
            scene.Summary,
            scene.Notes,
            scene.Pov is null ? null : SuggestedLore.From(scene.Pov),
            SuggestedDate.From(scene.Chronology),
            [.. scene.Entities.Select(SuggestedLore.From)]);

    public SceneRequest Request(int expectedVersion) =>
        new(
            Title,
            Summary,
            Notes,
            Pov?.EntityId,
            Chronology?.Value(),
            [.. Entities.Select(entity => entity.EntityId)],
            ChapterId,
            expectedVersion);

    /// <summary>Whether the two hold the same stored values: names shown and the order of the linked lore aside.</summary>
    public bool SameFormAs(SceneSuggestion other) => Key() == other.Key();

    private string Key() => JsonSerializer.Serialize(new
    {
        Title,
        ChapterId,
        Summary,
        Notes,
        Pov = Pov?.EntityId,
        Chronology,
        Entities = Entities.Select(entity => entity.EntityId).Order(),
    });
}

/// <summary>
/// One suggestion as answered. Names are usernames only, null when the account can no longer be found.
/// <paramref name="TargetChanged"/> is true while it is open and the content has been saved since it was made, so it can no
/// longer be accepted. <paramref name="Before"/> and <paramref name="Proposed"/> are the target kind's snapshot.
/// </summary>
public sealed record SuggestionResponse<TSnapshot>(
    Guid Id,
    SuggestionStatus Status,
    string? ProposedByName,
    DateTime CreatedAt,
    string? ResolvedByName,
    DateTime? ResolvedAt,
    bool TargetChanged,
    TSnapshot Before,
    TSnapshot Proposed);

/// <summary>
/// One page of a target's open or decided suggestions, newest first. <paramref name="HasMore"/>: older ones follow; ask
/// again with <c>before</c> set to the last one's id.
/// </summary>
public sealed record SuggestionPage<TSnapshot>(IReadOnlyList<SuggestionResponse<TSnapshot>> Items, bool HasMore);
