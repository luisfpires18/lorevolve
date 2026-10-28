using System.Security.Claims;
using System.Text.RegularExpressions;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Publishing;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Universes;

/// <summary>
/// Universe CRUD. Every route in this group requires authentication. The list and a read reach the universes the
/// caller owns or is a member of; changing the universe itself is the owner's alone, through
/// <see cref="UniverseAccess"/> (ADR 0041).
/// </summary>
public static partial class UniverseEndpoints
{
    private const int DefaultPageSize = 12;
    private const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapUniverseEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes")
            .WithTags("Universes")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListUniverses");
        group.MapPost("/", CreateAsync).WithName("CreateUniverse");
        group.MapGet("/{id:guid}", GetAsync).WithName("GetUniverse");
        group.MapPut("/{id:guid}", UpdateAsync).WithName("UpdateUniverse");
        group.MapPost("/{id:guid}/archive", ArchiveAsync).WithName("ArchiveUniverse");
        group.MapPost("/{id:guid}/unarchive", UnarchiveAsync).WithName("UnarchiveUniverse");
        group.MapDelete("/{id:guid}", DeleteAsync).WithName("DeleteUniverse");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] string? search = null,
        [FromQuery] bool includeArchived = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        var userId = principal.RequireUserId();

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        // Owned or shared, as one filter on Universes rather than a join, so a universe appears once even if a malformed
        // membership row also names its owner. The membership test is an EXISTS on the (UniverseId, UserId) key.
        var query = db.Universes.AsNoTracking().Where(universe => universe.OwnerId == userId
            || db.UniverseMemberships.Any(membership => membership.UniverseId == universe.Id && membership.UserId == userId));

        if (!includeArchived)
        {
            query = query.Where(universe => !universe.IsArchived);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{EscapeLike(search.Trim())}%";
            query = query.Where(universe => EF.Functions.Like(universe.Name, pattern, "\\"));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        // Widened before multiplying: an absurd page number would otherwise overflow to a
        // negative offset.
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        // Id breaks ties so paging stays stable when two universes share a timestamp. The artwork rides on the page
        // query as a left join on its key - at most one row per universe, so paging is unchanged - joined only for the
        // universes the caller owns, the same test the role makes, so a shared row's artwork is never read at all.
        var items = await WithOwnedArtwork(db, query, userId)
            .OrderByDescending(row => row.Universe.UpdatedAt)
            .ThenBy(row => row.Universe.Id)
            .Skip(skip)
            .Take(pageSize)
            .Select(row => new UniverseSummary(
                row.Universe.Id,
                row.Universe.Name,
                row.Universe.Description,
                row.Universe.AccentColor,
                row.Universe.IsArchived,
                row.Universe.UpdatedAt,
                row.Universe.OwnerId == userId
                    ? UniverseRole.Owner
                    : db.UniverseMemberships
                        .Where(membership => membership.UniverseId == row.Universe.Id && membership.UserId == userId)
                        .Select(membership => membership.Role)
                        .First(),
                row.Artwork != null
                    ? new UniverseArtworkIdentity(row.Artwork.AssetId, row.Artwork.CardId)
                    : null))
            .ToListAsync(cancellationToken);

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new UniversePage(items, page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        // 404 for no access at all: someone else's universe must not be distinguishable from one that does not exist.
        var userId = principal.RequireUserId();

        if (await UniverseAccess.RoleAsync(db, id, userId, cancellationToken) is not { } role)
        {
            return Results.NotFound();
        }

        // The artwork in the same query as the rest, joined only when the caller owns the universe - the test that made
        // the role Owner - so a collaborator's read never selects it (see UniverseArtworkIdentity).
        var universe = await WithOwnedArtwork(db, db.Universes.AsNoTracking().Where(candidate => candidate.Id == id), userId)
            .Select(row => new UniverseDetail(
                row.Universe.Id,
                row.Universe.Name,
                row.Universe.Description,
                row.Universe.AccentColor,
                row.Universe.IsArchived,
                row.Universe.CreatedAt,
                row.Universe.UpdatedAt,
                role,
                row.Artwork != null
                    ? new UniverseArtworkIdentity(row.Artwork.AssetId, row.Artwork.CardId)
                    : null,
                !db.UniverseAiHelpOff.Any(off => off.UniverseId == row.Universe.Id)))
            .FirstOrDefaultAsync(cancellationToken);

        return universe is null ? Results.NotFound() : Results.Ok(universe);
    }

    private static async Task<IResult> CreateAsync(
        [FromBody] CreateUniverseRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        if (Validate(request.Name, request.Description, request.AccentColor) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        if (await db.Universes.AnyAsync(
                universe => universe.OwnerId == ownerId && universe.Name == name,
                cancellationToken))
        {
            return NameTakenProblem();
        }

        var now = DateTime.UtcNow;
        var universe = new Universe
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            Name = name,
            Description = Normalize(request.Description),
            AccentColor = NormalizeAccent(request.AccentColor),
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Universes.Add(universe);
        if (request.AiHelp == false)
        {
            db.UniverseAiHelpOff.Add(new UniverseAiHelpOff { UniverseId = universe.Id });
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            // The unique index settles a concurrent create of the same name.
            return NameTakenProblem();
        }

        // A universe starts with the default entity types, written here and only here: after this they are the
        // author's, and no read puts back one they removed.
        await EntityTypeDefaults.EnsureAsync(db, universe.Id, cancellationToken);

        return Results.Created($"/api/universes/{universe.Id}", ToDetail(universe, artwork: null, aiHelp: request.AiHelp != false));
    }

    private static async Task<IResult> UpdateAsync(
        Guid id,
        [FromBody] UpdateUniverseRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, id, principal, UniverseCapability.ManageUniverse, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ownerId = principal.RequireUserId();

        if (Validate(request.Name, request.Description, request.AccentColor) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var universe = await FindOwnedAsync(db, id, ownerId, cancellationToken);
        if (universe is null)
        {
            return Results.NotFound();
        }

        var name = request.Name!.Trim();

        if (!string.Equals(universe.Name, name, StringComparison.Ordinal)
            && await db.Universes.AnyAsync(
                other => other.OwnerId == ownerId && other.Name == name && other.Id != id,
                cancellationToken))
        {
            return NameTakenProblem();
        }

        universe.Name = name;
        universe.Description = Normalize(request.Description);
        universe.AccentColor = NormalizeAccent(request.AccentColor);
        universe.UpdatedAt = DateTime.UtcNow;

        var off = await db.UniverseAiHelpOff.FindAsync([id], cancellationToken);
        if (request.AiHelp == false && off is null)
        {
            db.UniverseAiHelpOff.Add(new UniverseAiHelpOff { UniverseId = id });
        }
        else if (request.AiHelp == true && off is not null)
        {
            db.UniverseAiHelpOff.Remove(off);
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTakenProblem();
        }

        var aiHelp = request.AiHelp ?? off is null;
        return Results.Ok(ToDetail(universe, await ArtworkIdentityAsync(db, universe.Id, cancellationToken), aiHelp));
    }

    private static Task<IResult> ArchiveAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken) =>
        SetArchivedAsync(id, principal, db, archived: true, cancellationToken);

    private static Task<IResult> UnarchiveAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken) =>
        SetArchivedAsync(id, principal, db, archived: false, cancellationToken);

    private static async Task<IResult> SetArchivedAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        bool archived,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, id, principal, UniverseCapability.ManageUniverse, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ownerId = principal.RequireUserId();

        var universe = await FindOwnedAsync(db, id, ownerId, cancellationToken);
        if (universe is null)
        {
            return Results.NotFound();
        }

        if (universe.IsArchived != archived)
        {
            universe.IsArchived = archived;
            universe.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(ToDetail(
            universe,
            await ArtworkIdentityAsync(db, universe.Id, cancellationToken),
            !await db.UniverseAiHelpOff.AnyAsync(off => off.UniverseId == universe.Id, cancellationToken)));
    }

    /// <summary>
    /// Deletes an archived universe and everything in it, then the pictures it held.
    ///
    /// The order is the one every picture follows (ADR 0019): the database is the thing that says what exists, so it
    /// moves first and the objects follow. The exact keys of every entry picture and of the artwork are read from their
    /// rows inside the delete's own transaction - the rows the cascade is about to remove, and nothing a write still in
    /// flight has not committed - and swept only once the delete has committed. A failed delete leaves the universe and
    /// every object it names whole. A sweep that fails after the commit is logged as litter: the universe stays deleted,
    /// and its pictures stop counting against the owner's storage the moment their rows go (ADR 0042), whatever the
    /// bucket still holds.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, id, principal, UniverseCapability.ManageUniverse, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ownerId = principal.RequireUserId();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var universe = await FindOwnedAsync(db, id, ownerId, cancellationToken);
        if (universe is null)
        {
            return Results.NotFound();
        }

        // Deletion is permanent and there is no undo yet, so it is only offered for a
        // universe the owner has already archived.
        if (!universe.IsArchived)
        {
            return Results.Problem(
                title: "Universe is not archived",
                detail: "Archive the universe before deleting it.",
                statusCode: StatusCodes.Status409Conflict);
        }

        // Ideas belong to the account, not to the universe (ADR 0030): every idea about this
        // universe stays, unassigned, and only its references - to content deleted below - go; so does
        // every board, without its entry cards (ADR 0066).
        // Same transaction, so no idea can be left pointing into a universe that is gone.
        await IdeaReferences.ReleaseUniverseAsync(db, universe.Id, cancellationToken);
        await IdeaBoardEndpoints.ReleaseUniverseAsync(db, universe.Id, cancellationToken);

        // The stored keys, as written - never rebuilt from the naming convention - while the rows still exist.
        var pictureKeys = (await db.EntityImages
                .Where(image => image.Entity!.UniverseId == universe.Id)
                .Select(image => new { image.OriginalKey, image.ThumbnailKey })
                .ToListAsync(cancellationToken))
            .SelectMany(image => new[] { image.OriginalKey, image.ThumbnailKey })
            .Concat((await db.EntityAppearanceImages
                    .Where(image => image.Appearance!.Entity!.UniverseId == universe.Id)
                    .Select(image => new { image.OriginalKey, image.ThumbnailKey })
                    .ToListAsync(cancellationToken))
                .SelectMany(image => new[] { image.OriginalKey, image.ThumbnailKey }))
            .ToArray();

        var artworkKeys = (await db.UniverseArtworks
                .Where(artwork => artwork.UniverseId == universe.Id)
                .Select(artwork => new { artwork.OriginalKey, artwork.CardKey })
                .ToListAsync(cancellationToken))
            .SelectMany(artwork => new[] { artwork.OriginalKey, artwork.CardKey })
            .ToArray();

        // The maps' pictures (issue #52), the same way: keys as written, swept only past the commit.
        var mapKeys = (await db.UniverseMaps
                .Where(map => map.UniverseId == universe.Id)
                .Select(map => new { map.OriginalKey, map.DisplayKey })
                .ToListAsync(cancellationToken))
            .SelectMany(map => new[] { map.OriginalKey, map.DisplayKey })
            .ToArray();

        db.Universes.Remove(universe);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        // Only past the commit, and never a reason to undo it: each helper logs a key that will not delete and moves on.
        await Task.WhenAll(
            EntityImageEndpoints.SweepAsync(store, loggerFactory.CreateLogger("LorEvolve.EntityImages"), pictureKeys),
            UniverseArtworkEndpoints.SweepAsync(store, loggerFactory.CreateLogger(UniverseArtworkEndpoints.LoggerName), artworkKeys),
            Maps.MapEndpoints.SweepAsync(store, loggerFactory.CreateLogger(Maps.MapEndpoints.LoggerName), mapKeys));

        return Results.NoContent();
    }

    private static Task<Universe?> FindOwnedAsync(
        LorEvolveDbContext db,
        Guid id,
        string ownerId,
        CancellationToken cancellationToken) =>
        db.Universes.FirstOrDefaultAsync(
            universe => universe.Id == id && universe.OwnerId == ownerId,
            cancellationToken);

    /// <summary>
    /// Only ever answered to the owner: every route that returns it is the owner's, so the artwork is always theirs to
    /// see. A write answers with what the universe has now, or the client would draw it without its art.
    /// </summary>
    private static UniverseDetail ToDetail(Universe universe, UniverseArtworkIdentity? artwork, bool aiHelp) =>
        new(universe.Id, universe.Name, universe.Description, universe.AccentColor,
            universe.IsArchived, universe.CreatedAt, universe.UpdatedAt, UniverseRole.Owner, artwork, aiHelp);

    /// <summary>
    /// Each universe beside its artwork row - only where <paramref name="callerId"/> owns the universe, null for every
    /// other row and for a universe without artwork. The ownership test is part of the left join's own condition, so
    /// the database never returns a shared universe's artwork ids to be dropped afterwards: the owner-only rule is the
    /// query's, not the projection's (ADR 0041). Internal so a test can hold the query to that.
    /// </summary>
    internal static IQueryable<UniverseWithArtwork> WithOwnedArtwork(
        LorEvolveDbContext db,
        IQueryable<Universe> universes,
        string callerId) =>
        from universe in universes
        join artwork in db.UniverseArtworks
            on new { Id = universe.Id, OwnerId = universe.OwnerId }
            equals new { Id = artwork.UniverseId, OwnerId = callerId } into artworks
        from artwork in artworks.DefaultIfEmpty()
        select new UniverseWithArtwork { Universe = universe, Artwork = artwork };

    // A class with initialisers rather than a positional record: EF Core follows member bindings into the later
    // ordering and projection, not constructor arguments.
    internal sealed class UniverseWithArtwork
    {
        public required Universe Universe { get; init; }

        public UniverseArtwork? Artwork { get; init; }
    }

    /// <summary>
    /// The current card of a universe's artwork, for the owner-only routes that answer with a universe they already
    /// hold - a write, a restore - rather than read it afresh. One query.
    /// </summary>
    internal static Task<UniverseArtworkIdentity?> ArtworkIdentityAsync(
        LorEvolveDbContext db,
        Guid universeId,
        CancellationToken cancellationToken) =>
        db.UniverseArtworks.AsNoTracking()
            .Where(artwork => artwork.UniverseId == universeId)
            .Select(artwork => new UniverseArtworkIdentity(artwork.AssetId, artwork.CardId))
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>Also answered by a restore, which creates a universe under the same rule (ADR 0032).</summary>
    internal static IResult NameTakenProblem() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = ["You already have a universe with that name."],
        });

    /// <summary>Why a universe cannot be given this name, or null. Measured after trimming, which is what is stored.</summary>
    internal static string? NameError(string? name)
    {
        var trimmedName = name?.Trim();

        if (string.IsNullOrWhiteSpace(trimmedName))
        {
            return "Give the universe a name.";
        }

        return trimmedName.Length > UniverseConfiguration.NameMaxLength
            ? $"Keep the name under {UniverseConfiguration.NameMaxLength} characters."
            : null;
    }

    private static Dictionary<string, string[]>? Validate(string? name, string? description, string? accentColor)
    {
        var errors = new Dictionary<string, string[]>();

        if (NameError(name) is { } nameError)
        {
            errors["name"] = [nameError];
        }

        // Measured after trimming, because that is what actually gets stored.
        if (description?.Trim() is { Length: > UniverseConfiguration.DescriptionMaxLength })
        {
            errors["description"] =
                [$"Keep the description under {UniverseConfiguration.DescriptionMaxLength} characters."];
        }

        if (!string.IsNullOrWhiteSpace(accentColor) && !AccentColorPattern().IsMatch(accentColor.Trim()))
        {
            errors["accentColor"] = ["Use a colour like #4f6bd6."];
        }

        return errors.Count == 0 ? null : errors;
    }

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? NormalizeAccent(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();

    /// <summary>Escapes the LIKE wildcards so a search for "100%" cannot match everything.</summary>
    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex AccentColorPattern();
}

internal static class PrincipalExtensions
{
    /// <summary>
    /// The endpoints run behind <c>RequireAuthorization</c>, so a missing id means the
    /// pipeline is misconfigured rather than that the caller is anonymous.
    /// </summary>
    public static string RequireUserId(this ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("Authenticated principal is missing a user id claim.");
}
