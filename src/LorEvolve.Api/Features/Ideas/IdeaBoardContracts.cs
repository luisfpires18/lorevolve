namespace LorEvolve.Api.Features.Ideas;

/// <summary>
/// One card as a save names it. <paramref name="Id"/> is chosen by the client and is unique within the board. Exactly the
/// payload <paramref name="Kind"/> names is set: <paramref name="Text"/> for a note (null reads as <c>""</c>),
/// <paramref name="IdeaId"/> for an idea, <paramref name="EntityId"/> for an entry.
/// </summary>
public sealed record IdeaBoardCardInput(
    Guid Id,
    IdeaBoardCardKind Kind,
    double X,
    double Y,
    double Width,
    double Height,
    string? Text,
    Guid? IdeaId,
    Guid? EntityId);

/// <summary>A line between two cards of the same save, by their ids. <paramref name="Label"/> is optional and trimmed.</summary>
public sealed record IdeaBoardConnectionInput(Guid Id, Guid FromCardId, Guid ToCardId, string? Label);

/// <summary>
/// Creating a board, or saving one whole: its title, its universe, and every card and connection, which replace what is
/// stored. The cards' order is their draw order. <paramref name="ExpectedUpdatedAt"/> is the <c>updatedAt</c> the edit was
/// written over, on an update; a board changed since is refused with 409 <c>idea_board_changed</c>. Ignored on create.
/// </summary>
public sealed record IdeaBoardRequest(
    string? Title,
    Guid? UniverseId,
    IReadOnlyList<IdeaBoardCardInput>? Cards,
    IReadOnlyList<IdeaBoardConnectionInput>? Connections,
    DateTime? ExpectedUpdatedAt);

public sealed record IdeaBoardSummary(
    Guid Id,
    string Title,
    IdeaUniverse? Universe,
    int CardCount,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? DeletedAt);

public sealed record IdeaBoardPage(
    IReadOnlyList<IdeaBoardSummary> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>
/// One card, resolved for display: what it points at is read on every request and never stored on the card.
/// <paramref name="Name"/> is the idea's title or the entry's name, <paramref name="Excerpt"/> the start of an idea's body,
/// <paramref name="EntityTypeName"/> an entry's type. <paramref name="IsGone"/> is true for a deleted idea or an entry in
/// the Trash: shown as such, and kept by a save that sends it back.
/// </summary>
public sealed record IdeaBoardCardView(
    Guid Id,
    IdeaBoardCardKind Kind,
    double X,
    double Y,
    double Width,
    double Height,
    string? Text,
    Guid? IdeaId,
    Guid? EntityId,
    string? Name,
    string? Excerpt,
    string? EntityTypeName,
    bool IsGone);

public sealed record IdeaBoardDetail(
    Guid Id,
    string Title,
    IdeaUniverse? Universe,
    IReadOnlyList<IdeaBoardCardView> Cards,
    IReadOnlyList<IdeaBoardConnectionInput> Connections,
    DateTime CreatedAt,
    DateTime UpdatedAt);
