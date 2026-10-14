using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;

namespace Lorex.Api.Features.Suggestions;

/// <summary>
/// What a suggestion holds of an entry: exactly what the entry form edits, as the entry reads it - names beside ids, so it
/// still explains itself after the type, a choice or a linked entry is renamed or gone. Nothing else of the entry.
/// </summary>
public sealed record EntrySuggestion(
    Guid EntityTypeId,
    string EntityTypeName,
    string Name,
    string? Summary,
    CanonStatus CanonStatus,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    IReadOnlyList<FieldValueResponse> Fields)
{
    public static EntrySuggestion From(EntityDetail entry) =>
        new(entry.EntityTypeId, entry.EntityTypeName, entry.Name, entry.Summary, entry.CanonStatus, entry.Aliases, entry.Tags, entry.Fields);

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
}

/// <summary>What a suggestion holds of a story: its form - title, premise and status.</summary>
public sealed record StorySuggestion(string Title, string? Premise, StoryStatus Status)
{
    public static StorySuggestion From(StoryDetail story) => new(story.Title, story.Premise, story.Status);

    public StoryRequest Request(int expectedVersion) => new(Title, Premise, Status, expectedVersion);
}

/// <summary>
/// What a suggestion holds of a scene: its form - title, chapter, summary, notes, point of view, date and linked lore, the
/// lore as the scene reads it (names beside ids).
/// </summary>
public sealed record SceneSuggestion(
    string Title,
    Guid? ChapterId,
    string? Summary,
    string? Notes,
    SceneLoreReference? Pov,
    ChronologyValue? Chronology,
    IReadOnlyList<SceneLoreReference> Entities)
{
    public static SceneSuggestion From(SceneResponse scene) =>
        new(scene.Title, scene.ChapterId, scene.Summary, scene.Notes, scene.Pov, scene.Chronology, scene.Entities);

    public SceneRequest Request(int expectedVersion) =>
        new(Title, Summary, Notes, Pov?.EntityId, Chronology, [.. Entities.Select(entity => entity.EntityId)], ChapterId, expectedVersion);
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
