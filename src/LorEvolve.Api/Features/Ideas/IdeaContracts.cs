namespace LorEvolve.Api.Features.Ideas;

/// <summary>
/// One reference as a request names it: what it is, and its id. The kind is never inferred - an id that exists as a scene is
/// not therefore a scene reference.
/// </summary>
public sealed record IdeaReferenceInput(IdeaReferenceKind Kind, Guid Id);

/// <summary>
/// Creating an idea, or saving one whole.
///
/// <paramref name="Title"/> is required and trimmed. <paramref name="Body"/> is plain text stored exactly as sent; null reads
/// as <c>""</c>. <paramref name="UniverseId"/> is one of the caller's universes, or null for an idea that belongs to none.
///
/// <paramref name="References"/> replace what is stored, and are allowed only while the idea belongs to a universe: every one
/// must be in that universe. So changing the universe and the references is one save, checked as one - references from
/// anywhere else are refused, never dropped quietly. Something in the Trash cannot be newly referenced; a reference already
/// on the idea to something since put in the Trash is kept when it is sent back.
///
/// <paramref name="ExpectedUpdatedAt"/> is the <c>updatedAt</c> the edit was written over, on an update. When the idea has
/// changed since, the save is refused with 409 <c>idea_changed</c> and nothing is written. Ignored on create.
/// </summary>
public sealed record IdeaRequest(
    string? Title,
    string? Body,
    Guid? UniverseId,
    IReadOnlyList<IdeaReferenceInput>? References,
    DateTime? ExpectedUpdatedAt);

/// <summary>The universe an idea belongs to, as much of it as a list or an editor draws.</summary>
public sealed record IdeaUniverse(Guid Id, string Name, string? AccentColor, bool IsArchived);

/// <summary>
/// A list row: enough to find an idea again, never its whole body. <paramref name="Excerpt"/> is the start of the body, and
/// <paramref name="IsExcerptShortened"/> says there is more. <paramref name="Universe"/> is null for an unassigned idea.
/// </summary>
public sealed record IdeaSummary(
    Guid Id,
    string Title,
    string Excerpt,
    bool IsExcerptShortened,
    IdeaUniverse? Universe,
    int ReferenceCount,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt);

public sealed record IdeaPage(
    IReadOnlyList<IdeaSummary> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>
/// One reference, resolved for display: the target's current name, read on every request and never stored on the idea.
///
/// <paramref name="IsInTrash"/> is true when the target, or the story or arc it sits in, is in the Trash: it cannot be opened
/// until it is restored, and it is shown as such rather than as something live. The context members say where a target is -
/// an entry's type, the story of a scene, arc or beat (<paramref name="StoryId"/> is also where it is opened), a beat's arc.
/// </summary>
public sealed record IdeaReferenceView(
    IdeaReferenceKind Kind,
    Guid Id,
    string Name,
    bool IsInTrash,
    string? EntityTypeName,
    Guid? StoryId,
    string? StoryTitle,
    string? PlotArcTitle);

/// <summary>One idea, whole: its body and its references, resolved.</summary>
public sealed record IdeaDetail(
    Guid Id,
    string Title,
    string Body,
    IdeaUniverse? Universe,
    IReadOnlyList<IdeaReferenceView> References,
    DateTime CreatedAt,
    DateTime UpdatedAt);
