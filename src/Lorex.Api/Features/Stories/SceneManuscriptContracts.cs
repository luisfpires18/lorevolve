namespace Lorex.Api.Features.Stories;

/// <summary>
/// One save of a scene's prose.
///
/// <paramref name="Content"/> is the whole text, stored exactly as sent. An empty string clears it; null is refused, so a
/// malformed body can never wipe a manuscript. A save that would store exactly what is stored writes nothing and records
/// no version.
///
/// <paramref name="ExpectedUpdatedAt"/> is the <c>updatedAt</c> of the manuscript this text was written over, as the last
/// read or save returned it - null when nothing had been saved yet. A save naming anything else is refused with 409
/// <c>scene_manuscript_changed</c> and writes nothing: the prose was saved somewhere else in the meantime, and writing over
/// it unseen could lose it.
///
/// Nothing else about the scene - no title, chapter or point of view. Those belong to the scene route.
/// </summary>
public sealed record SceneManuscriptRequest(string? Content, DateTime? ExpectedUpdatedAt);

/// <summary>
/// A scene's prose. <paramref name="Content"/> is <c>""</c> for a scene nothing has been written for, so a client only
/// ever sees one shape; <paramref name="UpdatedAt"/> is null until the first save.
/// </summary>
public sealed record SceneManuscriptResponse(Guid SceneId, string Content, DateTime? UpdatedAt);

/// <summary>Puts a saved version back, naming the manuscript it is written over exactly as a save does.</summary>
public sealed record SceneManuscriptRestoreRequest(DateTime? ExpectedUpdatedAt);

/// <summary>
/// A row in a manuscript's history: no text, so the whole history is one small response. <paramref name="IsEmpty"/> says the
/// version was a save that emptied the prose. <paramref name="ActorName"/> as on
/// <see cref="Lore.EntityRevisionSummary"/>.
/// </summary>
public sealed record SceneManuscriptRevisionSummary(
    Guid Id,
    int Number,
    SceneManuscriptRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    bool IsEmpty,
    string? ActorName);

/// <summary>One saved version of a manuscript, whole.</summary>
public sealed record SceneManuscriptRevisionDetail(
    Guid Id,
    int Number,
    SceneManuscriptRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    string Content);
