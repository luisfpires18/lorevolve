using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Ideas;

/// <summary>
/// An account's idea boards (ADR 0066): canvases of notes, ideas and entries, with lines between them.
///
/// <b>Account-scoped, first and always</b>, as ideas are: every route finds a board by its id and the signed-in account
/// together, so another account's board answers as a missing one does.
///
/// <b>Nothing here touches lore or ideas.</b> A card points at an idea or an entry and changes nothing in it; a line is not a
/// relationship.
///
/// <b>Saved whole, never silently over.</b> A save carries every card and line and the <c>updatedAt</c> it was written over;
/// a board changed since is refused with 409 <c>idea_board_changed</c> and nothing is written.
/// </summary>
public static class IdeaBoardEndpoints
{
    public const string ChangedCode = "idea_board_changed";

    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapIdeaBoardEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/idea-boards")
            .WithTags("Idea boards")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListIdeaBoards");
        group.MapPost("/", CreateAsync).WithName("CreateIdeaBoard");
        group.MapGet("/{id:guid}", GetAsync).WithName("GetIdeaBoard");
        group.MapPut("/{id:guid}", UpdateAsync).WithName("UpdateIdeaBoard");
        group.MapDelete("/{id:guid}", DeleteAsync).WithName("DeleteIdeaBoard");
        group.MapPost("/{id:guid}/restore", RestoreAsync).WithName("RestoreIdeaBoard");

        return endpoints;
    }

    /// <summary>
    /// A page of the account's boards, live ones most recently updated first or deleted ones most recently deleted first.
    /// <paramref name="universeId"/> narrows to one universe's and <paramref name="unassigned"/> to those in none, never both.
    /// <paramref name="search"/> matches the title.
    /// </summary>
    private static async Task<IResult> ListAsync(
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? universeId = null,
        [FromQuery] bool unassigned = false,
        [FromQuery] bool deleted = false,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        var ownerId = principal.RequireUserId();

        if (universeId is not null && unassigned)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["unassigned"] = ["Ask for one universe's boards or for unassigned ones, not both."],
            });
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.IdeaBoards.AsNoTracking().Where(board => board.OwnerId == ownerId);
        query = deleted ? query.Where(board => board.DeletedAt != null) : query.Where(board => board.DeletedAt == null);

        if (universeId is { } onlyUniverse)
        {
            query = query.Where(board => board.UniverseId == onlyUniverse);
        }
        else if (unassigned)
        {
            query = query.Where(board => board.UniverseId == null);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{IdeaEndpoints.EscapeLike(search.Trim())}%";
            query = query.Where(board => EF.Functions.Like(board.Title, pattern, "\\"));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var ordered = deleted
            ? query.OrderByDescending(board => board.DeletedAt).ThenBy(board => board.Id)
            : query.OrderByDescending(board => board.UpdatedAt).ThenBy(board => board.Id);

        var rows = await ordered
            .Skip(skip)
            .Take(pageSize)
            .Select(board => new
            {
                board.Id,
                board.Title,
                Universe = board.UniverseId == null
                    ? null
                    : new IdeaUniverse(
                        board.Universe!.Id,
                        board.Universe.Name,
                        board.Universe.AccentColor,
                        board.Universe.IsArchived),
                CardCount = board.Cards.Count,
                board.CreatedAt,
                board.UpdatedAt,
                board.DeletedAt,
            })
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(row => new IdeaBoardSummary(
                row.Id,
                row.Title,
                row.Universe,
                row.CardCount,
                IdeaEndpoints.Utc(row.CreatedAt),
                IdeaEndpoints.Utc(row.UpdatedAt),
                row.DeletedAt is { } deletedAt ? IdeaEndpoints.Utc(deletedAt) : null))
            .ToList();

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new IdeaBoardPage(items, page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var detail = await LoadDetailAsync(db, id, principal.RequireUserId(), cancellationToken);
        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    private static async Task<IResult> CreateAsync(
        [FromBody] IdeaBoardRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var cards = Cards(request.Cards);
        var connections = Connections(request.Connections);

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (await CheckContentAsync(db, ownerId, request.UniverseId, cards, [], [], cancellationToken) is { } refused)
        {
            return Results.ValidationProblem(refused);
        }

        var now = DateTime.UtcNow;
        var board = new IdeaBoard
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            UniverseId = request.UniverseId,
            Title = request.Title!.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.IdeaBoards.Add(board);
        AddContent(db, board.Id, cards, connections);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var created = await LoadDetailAsync(db, board.Id, ownerId, cancellationToken);
        return Results.Created($"/api/idea-boards/{board.Id}", created);
    }

    /// <summary>Saves the board whole: title, universe, cards and lines, checked as one. Refused when stale.</summary>
    private static async Task<IResult> UpdateAsync(
        Guid id,
        [FromBody] IdeaBoardRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var board = await db.IdeaBoards.FirstOrDefaultAsync(
            candidate => candidate.Id == id && candidate.OwnerId == ownerId && candidate.DeletedAt == null,
            cancellationToken);
        if (board is null)
        {
            return Results.NotFound();
        }

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (!IdeaEndpoints.SameMoment(board.UpdatedAt, request.ExpectedUpdatedAt))
        {
            return Changed(board.UpdatedAt);
        }

        var cards = Cards(request.Cards);
        var connections = Connections(request.Connections);

        var storedCards = await db.IdeaBoardCards.AsNoTracking()
            .Where(card => card.BoardId == board.Id)
            .OrderBy(card => card.Z)
            .Select(card => new IdeaBoardCardInput(
                card.Id, card.Kind, card.X, card.Y, card.Width, card.Height, card.Text, card.IdeaId, card.EntityId))
            .ToListAsync(cancellationToken);
        var storedConnections = await db.IdeaBoardConnections.AsNoTracking()
            .Where(connection => connection.BoardId == board.Id)
            .Select(connection => new IdeaBoardConnectionInput(
                connection.Id, connection.FromCardId, connection.ToCardId, connection.Label))
            .ToListAsync(cancellationToken);

        if (await CheckContentAsync(
                db,
                ownerId,
                request.UniverseId,
                cards,
                [.. storedCards.Where(card => card.IdeaId is not null).Select(card => card.IdeaId!.Value)],
                [.. storedCards.Where(card => card.EntityId is not null).Select(card => card.EntityId!.Value)],
                cancellationToken) is { } refused)
        {
            return Results.ValidationProblem(refused);
        }

        var title = request.Title!.Trim();
        var unchanged = string.Equals(board.Title, title, StringComparison.Ordinal)
            && board.UniverseId == request.UniverseId
            && cards.SequenceEqual(storedCards)
            && connections.ToHashSet().SetEquals(storedConnections);

        if (!unchanged)
        {
            // Lines first: they hang off the cards.
            await db.IdeaBoardConnections.Where(connection => connection.BoardId == board.Id)
                .ExecuteDeleteAsync(cancellationToken);
            await db.IdeaBoardCards.Where(card => card.BoardId == board.Id).ExecuteDeleteAsync(cancellationToken);

            board.Title = title;
            board.UniverseId = request.UniverseId;
            board.UpdatedAt = DateTime.UtcNow;
            AddContent(db, board.Id, cards, connections);
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadDetailAsync(db, board.Id, ownerId, cancellationToken));
    }

    /// <summary>Into the account's deleted boards, with every card and line kept for a restore.</summary>
    private static async Task<IResult> DeleteAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        var board = await db.IdeaBoards.FirstOrDefaultAsync(
            candidate => candidate.Id == id && candidate.OwnerId == ownerId && candidate.DeletedAt == null,
            cancellationToken);
        if (board is null)
        {
            return Results.NotFound();
        }

        board.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> RestoreAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        var board = await db.IdeaBoards.FirstOrDefaultAsync(
            candidate => candidate.Id == id && candidate.OwnerId == ownerId && candidate.DeletedAt != null,
            cancellationToken);
        if (board is null)
        {
            return Results.NotFound();
        }

        board.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(await LoadDetailAsync(db, board.Id, ownerId, cancellationToken));
    }

    /// <summary>
    /// Lets go of every board's association with a universe about to be deleted, in the caller's transaction: its entry cards
    /// and their lines go with the entries, the board stays unassigned with everything else, and <c>UpdatedAt</c> moves so a
    /// window still holding the old universe saves as stale. Deleted boards are released the same way.
    /// </summary>
    public static async Task ReleaseUniverseAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        await db.IdeaBoardConnections
            .Where(connection => connection.FromCard!.Board!.UniverseId == universeId
                && (connection.FromCard.Kind == IdeaBoardCardKind.Entity
                    || connection.ToCard!.Kind == IdeaBoardCardKind.Entity))
            .ExecuteDeleteAsync(cancellationToken);
        await db.IdeaBoardCards
            .Where(card => card.Board!.UniverseId == universeId && card.Kind == IdeaBoardCardKind.Entity)
            .ExecuteDeleteAsync(cancellationToken);

        var now = DateTime.UtcNow;
        await db.IdeaBoards
            .Where(board => board.UniverseId == universeId)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(board => board.UniverseId, (Guid?)null)
                    .SetProperty(board => board.UpdatedAt, now),
                cancellationToken);
    }

    // ---------- Reading ----------

    /// <summary>One live board of this account, whole, with each card's idea or entry read as it is now - or null.</summary>
    internal static async Task<IdeaBoardDetail?> LoadDetailAsync(
        LorexDbContext db,
        Guid id,
        string ownerId,
        CancellationToken cancellationToken)
    {
        var board = await db.IdeaBoards.AsNoTracking()
            .Where(candidate => candidate.Id == id && candidate.OwnerId == ownerId && candidate.DeletedAt == null)
            .Select(candidate => new
            {
                candidate.Id,
                candidate.Title,
                Universe = candidate.UniverseId == null
                    ? null
                    : new IdeaUniverse(
                        candidate.Universe!.Id,
                        candidate.Universe.Name,
                        candidate.Universe.AccentColor,
                        candidate.Universe.IsArchived),
                candidate.CreatedAt,
                candidate.UpdatedAt,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (board is null)
        {
            return null;
        }

        var cards = await db.IdeaBoardCards.AsNoTracking()
            .Where(card => card.BoardId == id)
            .OrderBy(card => card.Z)
            .Select(card => new IdeaBoardCardView(
                card.Id,
                card.Kind,
                card.X,
                card.Y,
                card.Width,
                card.Height,
                card.Text,
                card.IdeaId,
                card.EntityId,
                card.Kind == IdeaBoardCardKind.Idea
                    ? card.Idea!.Title
                    : card.Kind == IdeaBoardCardKind.Entity ? card.Entity!.Name : null,
                card.Kind == IdeaBoardCardKind.Idea ? card.Idea!.Body.Substring(0, IdeaLimits.ExcerptLength) : null,
                card.Kind == IdeaBoardCardKind.Entity ? card.Entity!.EntityType!.Name : null,
                card.Kind == IdeaBoardCardKind.Idea
                    ? card.Idea!.DeletedAt != null
                    : card.Kind == IdeaBoardCardKind.Entity && card.Entity!.DeletedAt != null))
            .ToListAsync(cancellationToken);

        var connections = await db.IdeaBoardConnections.AsNoTracking()
            .Where(connection => connection.BoardId == id)
            .OrderBy(connection => connection.Id)
            .Select(connection => new IdeaBoardConnectionInput(
                connection.Id, connection.FromCardId, connection.ToCardId, connection.Label))
            .ToListAsync(cancellationToken);

        return new IdeaBoardDetail(
            board.Id,
            board.Title,
            board.Universe,
            cards,
            connections,
            IdeaEndpoints.Utc(board.CreatedAt),
            IdeaEndpoints.Utc(board.UpdatedAt));
    }

    // ---------- Checks ----------

    /// <summary>The request's own shape: title, bounds, one payload per card, lines between distinct cards of this save.</summary>
    private static Dictionary<string, string[]>? Validate(IdeaBoardRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        var title = request.Title?.Trim();
        if (string.IsNullOrEmpty(title))
        {
            errors["title"] = ["Give the board a title, so you can find it again."];
        }
        else if (title.Length > IdeaBoardLimits.TitleMaxLength)
        {
            errors["title"] = [$"Keep the title under {IdeaBoardLimits.TitleMaxLength} characters."];
        }

        var cards = request.Cards ?? [];
        if (cards.Count > IdeaBoardLimits.MaxCards)
        {
            errors["cards"] = [$"A board can hold up to {IdeaBoardLimits.MaxCards} cards."];
        }
        else if (cards.Any(card => card is null || !Enum.IsDefined(card.Kind) || !HasOnePayload(card)))
        {
            errors["cards"] = ["Every card is a note, an idea or an entry, and holds only that."];
        }
        else if (cards.Any(card => card.Text is { Length: > IdeaBoardLimits.NoteMaxLength }))
        {
            errors["cards"] = [$"Keep a note under {IdeaBoardLimits.NoteMaxLength:N0} characters."];
        }
        else if (cards.Any(card => !InBounds(card)))
        {
            errors["cards"] = ["A card is placed or sized outside what a board allows."];
        }
        else if (cards.Select(card => card.Id).Distinct().Count() != cards.Count)
        {
            errors["cards"] = ["Two cards share an id."];
        }

        var connections = request.Connections ?? [];
        if (connections.Count > IdeaBoardLimits.MaxConnections)
        {
            errors["connections"] = [$"A board can hold up to {IdeaBoardLimits.MaxConnections} lines."];
        }
        else if (connections.Any(connection => connection is null))
        {
            errors["connections"] = ["A line joins two cards."];
        }
        else if (!errors.ContainsKey("cards"))
        {
            var cardIds = cards.Select(card => card.Id).ToHashSet();
            if (connections.Any(connection =>
                    !cardIds.Contains(connection.FromCardId)
                    || !cardIds.Contains(connection.ToCardId)
                    || connection.FromCardId == connection.ToCardId))
            {
                errors["connections"] = ["A line joins two different cards of this board."];
            }
            else if (connections.Any(connection => connection.Label?.Trim() is { Length: > IdeaBoardLimits.LabelMaxLength }))
            {
                errors["connections"] = [$"Keep a line's label under {IdeaBoardLimits.LabelMaxLength} characters."];
            }
            else if (connections.Select(connection => connection.Id).Distinct().Count() != connections.Count)
            {
                errors["connections"] = ["Two lines share an id."];
            }
            else if (connections.Select(Pair).Distinct().Count() != connections.Count)
            {
                errors["connections"] = ["Two cards are joined by one line at most."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    private static bool HasOnePayload(IdeaBoardCardInput card) => card.Kind switch
    {
        IdeaBoardCardKind.Note => card.IdeaId is null && card.EntityId is null,
        IdeaBoardCardKind.Idea => card.IdeaId is not null && card.Text is null && card.EntityId is null,
        IdeaBoardCardKind.Entity => card.EntityId is not null && card.Text is null && card.IdeaId is null,
        _ => false,
    };

    private static bool InBounds(IdeaBoardCardInput card) =>
        Coordinate(card.X) && Coordinate(card.Y) && Size(card.Width) && Size(card.Height);

    private static bool Coordinate(double value) =>
        double.IsFinite(value) && Math.Abs(value) <= IdeaBoardLimits.MaxCoordinate;

    private static bool Size(double value) =>
        double.IsFinite(value) && value >= IdeaBoardLimits.MinCardSize && value <= IdeaBoardLimits.MaxCardSize;

    /// <summary>A line's two ends, in either direction.</summary>
    private static (Guid, Guid) Pair(IdeaBoardConnectionInput connection) =>
        connection.FromCardId.CompareTo(connection.ToCardId) < 0
            ? (connection.FromCardId, connection.ToCardId)
            : (connection.ToCardId, connection.FromCardId);

    /// <summary>
    /// The universe and what the cards point at, against what the account owns. Entry cards need a universe and must be in it;
    /// idea cards must be the owner's. Only a newly placed idea or entry - one not in <paramref name="storedIdeas"/> or
    /// <paramref name="storedEntities"/> - must be live, and a newly placed idea must be this universe's or unassigned.
    /// </summary>
    private static async Task<Dictionary<string, string[]>?> CheckContentAsync(
        LorexDbContext db,
        string ownerId,
        Guid? universeId,
        List<IdeaBoardCardInput> cards,
        HashSet<Guid> storedIdeas,
        HashSet<Guid> storedEntities,
        CancellationToken cancellationToken)
    {
        if (universeId is { } universe
            && !await IdeaEndpoints.OwnsUniverseAsync(db, universe, ownerId, cancellationToken))
        {
            return Refused("universeId", "Choose one of your universes, or none.");
        }

        var entityIds = cards.Where(card => card.EntityId is not null).Select(card => card.EntityId!.Value).ToHashSet();
        if (entityIds.Count > 0)
        {
            if (universeId is null)
            {
                return Refused(
                    "cards",
                    "A board that belongs to no universe cannot hold entries. Remove them, or choose a universe.");
            }

            var found = await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && entityIds.Contains(entity.Id))
                .Select(entity => new { entity.Id, InTrash = entity.DeletedAt != null })
                .ToDictionaryAsync(entity => entity.Id, entity => entity.InTrash, cancellationToken);

            if (entityIds.Any(entityId => !found.ContainsKey(entityId)))
            {
                return Refused("cards", "An entry on the board is not in its universe. Entries stay inside one universe.");
            }

            if (entityIds.Any(entityId => found[entityId] && !storedEntities.Contains(entityId)))
            {
                return Refused("cards", "Something in the Trash cannot be newly placed. Restore it first.");
            }
        }

        var ideaIds = cards.Where(card => card.IdeaId is not null).Select(card => card.IdeaId!.Value).ToHashSet();
        if (ideaIds.Count > 0)
        {
            var found = await db.Ideas.AsNoTracking()
                .Where(idea => idea.OwnerId == ownerId && ideaIds.Contains(idea.Id))
                .Select(idea => new { idea.Id, idea.UniverseId, idea.DeletedAt })
                .ToDictionaryAsync(idea => idea.Id, cancellationToken);

            if (ideaIds.Any(ideaId => !found.ContainsKey(ideaId)))
            {
                return Refused("cards", "Choose one of your ideas.");
            }

            var placed = ideaIds.Where(ideaId => !storedIdeas.Contains(ideaId)).Select(ideaId => found[ideaId]).ToList();

            if (placed.Any(idea => idea.DeletedAt is not null))
            {
                return Refused("cards", "A deleted idea cannot be newly placed. Restore it first.");
            }

            if (universeId is not null && placed.Any(idea => idea.UniverseId is not null && idea.UniverseId != universeId))
            {
                return Refused(
                    "cards",
                    "An idea from another universe cannot be placed here. A board takes its universe's ideas and unassigned ones.");
            }
        }

        return null;
    }

    private static Dictionary<string, string[]> Refused(string key, string message) => new() { [key] = [message] };

    /// <summary>The cards as they will be stored: a note's missing text read as <c>""</c>.</summary>
    private static List<IdeaBoardCardInput> Cards(IReadOnlyList<IdeaBoardCardInput>? cards) =>
        cards is null
            ? []
            : [.. cards.Select(card => card.Kind == IdeaBoardCardKind.Note ? card with { Text = card.Text ?? string.Empty } : card)];

    /// <summary>The lines as they will be stored: labels trimmed, an empty one read as none.</summary>
    private static List<IdeaBoardConnectionInput> Connections(IReadOnlyList<IdeaBoardConnectionInput>? connections) =>
        connections is null
            ? []
            : [.. connections.Select(connection => connection with
            {
                Label = string.IsNullOrWhiteSpace(connection.Label) ? null : connection.Label.Trim(),
            })];

    private static void AddContent(
        LorexDbContext db,
        Guid boardId,
        List<IdeaBoardCardInput> cards,
        List<IdeaBoardConnectionInput> connections)
    {
        for (var z = 0; z < cards.Count; z++)
        {
            var card = cards[z];
            db.IdeaBoardCards.Add(new IdeaBoardCard
            {
                BoardId = boardId,
                Id = card.Id,
                Kind = card.Kind,
                X = card.X,
                Y = card.Y,
                Width = card.Width,
                Height = card.Height,
                Z = z,
                Text = card.Text,
                IdeaId = card.IdeaId,
                EntityId = card.EntityId,
            });
        }

        foreach (var connection in connections)
        {
            db.IdeaBoardConnections.Add(new IdeaBoardConnection
            {
                BoardId = boardId,
                Id = connection.Id,
                FromCardId = connection.FromCardId,
                ToCardId = connection.ToCardId,
                Label = connection.Label,
            });
        }
    }

    private static IResult Changed(DateTime current) =>
        Results.Problem(
            title: "Board changed",
            detail: "This board was saved somewhere else after it was opened here. Nothing was overwritten.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = ChangedCode,
                ["updatedAt"] = IdeaEndpoints.Utc(current),
            });
}
