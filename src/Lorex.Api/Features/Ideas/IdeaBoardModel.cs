using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Ideas;

/// <summary>
/// A canvas an author lays possibilities out on: notes, ideas and entries placed anywhere, and lines between them (ADR 0066).
///
/// <b>A board is not lore</b>, exactly as an idea is not (ADR 0030). Saving one never changes an idea, an entry or a
/// relationship, and a line between two cards means nothing to anything else.
///
/// <b>Owned by the account</b>, like an idea: <see cref="OwnerId"/> is the boundary, <see cref="UniverseId"/> an optional
/// association with one of that account's universes. One kind of board, listed among all ideas and in a universe's Ideas.
/// </summary>
public sealed class IdeaBoard
{
    public Guid Id { get; set; }

    public required string OwnerId { get; set; }

    public LorexUser? Owner { get; set; }

    /// <summary>The universe this board is about, or null. When that universe is deleted the board stays, unassigned.</summary>
    public Guid? UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Title { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>When the board last changed, and the token a whole save names.</summary>
    public DateTime UpdatedAt { get; set; }

    public DateTime? DeletedAt { get; set; }

    public ICollection<IdeaBoardCard> Cards { get; } = [];
}

/// <summary>What a card on a board holds. Stated on every card and never inferred from its payload.</summary>
public enum IdeaBoardCardKind
{
    /// <summary>Plain text that lives only on the board.</summary>
    Note = 0,

    /// <summary>One of the owner's ideas, shown by its current title.</summary>
    Idea = 1,

    /// <summary>A lore entry of the board's universe, shown by its current name.</summary>
    Entity = 2,
}

/// <summary>
/// One card, keyed inside its board: the id is the client's, and two boards can never collide. Exactly one payload is set,
/// the one its <see cref="Kind"/> names - the schema holds that line too.
/// </summary>
public sealed class IdeaBoardCard
{
    public Guid BoardId { get; set; }

    public IdeaBoard? Board { get; set; }

    public Guid Id { get; set; }

    public IdeaBoardCardKind Kind { get; set; }

    /// <summary>Top-left corner and size, in board units. The board has no edge; the client decides what is in view.</summary>
    public double X { get; set; }

    public double Y { get; set; }

    public double Width { get; set; }

    public double Height { get; set; }

    /// <summary>Draw order: the card's position in the list it was saved in.</summary>
    public int Z { get; set; }

    /// <summary>A note's text, plain and exactly as written; null for every other kind.</summary>
    public string? Text { get; set; }

    public Guid? IdeaId { get; set; }

    public Idea? Idea { get; set; }

    public Guid? EntityId { get; set; }

    public LoreEntity? Entity { get; set; }
}

/// <summary>
/// A line between two cards of one board. Both ends are keyed with the board, so a line can never join two boards, and it
/// goes with either card. Not a relationship: it has no type and means nothing outside the board.
/// </summary>
public sealed class IdeaBoardConnection
{
    public Guid BoardId { get; set; }

    public Guid Id { get; set; }

    public Guid FromCardId { get; set; }

    public IdeaBoardCard? FromCard { get; set; }

    public Guid ToCardId { get; set; }

    public IdeaBoardCard? ToCard { get; set; }

    public string? Label { get; set; }
}
