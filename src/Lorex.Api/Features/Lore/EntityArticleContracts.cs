namespace Lorex.Api.Features.Lore;

/// <summary>
/// One save of an entry's article.
///
/// <paramref name="Content"/> is the whole Tiptap document. An empty or blank string clears the article; null is refused,
/// so a malformed body can never wipe one.
///
/// <paramref name="ExpectedUpdatedAt"/> is the <c>updatedAt</c> of the article this text was written over, as the last read
/// or save returned it - null when nothing had been saved yet. A save naming anything else is refused with 409
/// <c>entity_article_changed</c> and writes nothing.
///
/// Nothing structured - no name, summary, status or field. Those belong to the entry's own route, and that route has no
/// article: a stale client still sending <c>content</c> there has it ignored.
/// </summary>
public sealed record EntityArticleRequest(string? Content, DateTime? ExpectedUpdatedAt);

/// <summary>
/// An entry's article. <paramref name="Content"/> is <c>""</c> for an entry with no article, so a client only ever sees one
/// shape; <paramref name="UpdatedAt"/> is null until the first save that wrote something.
/// </summary>
public sealed record EntityArticleResponse(Guid EntityId, string Content, DateTime? UpdatedAt);

/// <summary>Puts a saved version back, naming the article it is written over exactly as a save does.</summary>
public sealed record EntityArticleRestoreRequest(DateTime? ExpectedUpdatedAt);

/// <summary>
/// A row in the article's history: no text, so the whole history is one small response. <paramref name="IsEmpty"/> says the
/// version was a save that cleared the article. <paramref name="ActorName"/> as on <see cref="EntityRevisionSummary"/>.
/// </summary>
public sealed record EntityArticleRevisionSummary(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    bool IsEmpty,
    string? ActorName);

/// <summary>One saved version, whole.</summary>
public sealed record EntityArticleRevisionDetail(
    Guid Id,
    int Number,
    EntityRevisionKind Kind,
    Guid? RestoredFromRevisionId,
    DateTime CreatedAt,
    string Content);
