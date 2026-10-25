namespace Lorex.Api.Features.Knowledge;

/// <summary>
/// One knowledge record as it is created or replaced (issue 15). <paramref name="KnowerEntityId"/> is required;
/// <paramref name="SubjectEntityId"/> is optional and never the knower; <paramref name="Statement"/> is trimmed and
/// required; exactly one of <paramref name="SceneId"/> and <paramref name="KnownFromStart"/>. Every id must be live in the
/// universe named, except one the record already holds, which it may keep after a move to the Trash.
/// </summary>
public sealed record KnowledgeRecordRequest(
    Guid? KnowerEntityId,
    Guid? SubjectEntityId,
    string? Statement,
    Guid? SceneId,
    bool KnownFromStart);

/// <summary>An entry as a record names it: read from the entry on every request, marked when it is in the Trash.</summary>
public sealed record KnowledgeLoreRef(Guid Id, string Name, string TypeName, bool IsTrashed);

/// <summary>
/// The scene a record is anchored to, placed in its story's reading order: the story, the chapter it is in (number and
/// title; none for Unchaptered) and its place among the live scenes of that container, from 1. Marked when the scene or
/// its story is in the Trash.
/// </summary>
public sealed record KnowledgeSceneRef(
    Guid SceneId,
    string Title,
    Guid StoryId,
    string StoryTitle,
    Guid? ChapterId,
    int? ChapterNumber,
    string? ChapterTitle,
    int Position,
    bool IsTrashed);

/// <summary>
/// One record, with the continuity readings a list can give without inferring anything:
/// <paramref name="Issues"/> is zero or more of <c>knower_not_in_scene</c> (the knower is neither in the scene's lore nor its
/// point of view), <c>scene_trashed</c>, <c>knower_trashed</c>, <c>subject_trashed</c>.
/// </summary>
public sealed record KnowledgeRecordResponse(
    Guid Id,
    KnowledgeLoreRef Knower,
    KnowledgeLoreRef? Subject,
    string Statement,
    bool KnownFromStart,
    KnowledgeSceneRef? Scene,
    IReadOnlyList<string> Issues,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public static class KnowledgeIssues
{
    public const string KnowerNotInScene = "knower_not_in_scene";
    public const string SceneTrashed = "scene_trashed";
    public const string KnowerTrashed = "knower_trashed";
    public const string SubjectTrashed = "subject_trashed";
}
