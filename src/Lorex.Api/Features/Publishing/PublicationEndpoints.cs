using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Publishing;

/// <summary>
/// An owner preparing, publishing and unpublishing one universe's public shell (ADR 0036).
///
/// <para><b>The owner's alone.</b> Each route passes <see cref="UniverseAccess"/>'s Publish capability, so a member is
/// refused with 403 and any other account gets a 404, exactly like a universe that does not exist (ADR 0041); each still
/// finds the universe by its id and the owner's id together. Nothing here is anonymous: the anonymous side is <see cref="PublicUniverseEndpoints"/>,
/// which only reads.</para>
///
/// <para><b>A public universe is never incomplete.</b> Publishing refuses until every requirement
/// holds, and while it is public a save that would break one is refused with the reason - make it
/// private first. The check and the write share one transaction, and Microsoft.Data.Sqlite begins
/// every transaction <c>IMMEDIATE</c>, so a publish and a save racing each other are serialised
/// rather than each passing its own check against the other's stale read.</para>
///
/// <para><b>Publishing publishes the shell only.</b> Nothing inside the universe - lore, stories,
/// timeline, ideas, rules, relationships, Canon, the Trash - is read or changed by any of this. An entry or
/// a story is published on its own (<see cref="ContentPublicationEndpoints"/>); publishing the universe lets
/// the ones already selected be read, and making it private hides them again without clearing the selection.</para>
/// </summary>
public static class PublicationEndpoints
{
    /// <summary>Publishing was refused because something it needs is missing; the errors say what.</summary>
    public const string IncompleteCode = "publication_incomplete";

    /// <summary>A save would leave a public universe without something publishing needs.</summary>
    public const string RequiredWhilePublicCode = "publication_required_while_public";

    /// <summary>How many selected entries the publish review names; the rest are counted.</summary>
    public const int SelectedLoreLimit = 100;

    public static IEndpointRouteBuilder MapPublicationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}")
            .WithTags("Publishing")
            .RequireAuthorization();

        group.MapGet("/publication", GetAsync).WithName("GetUniversePublication");
        group.MapGet("/publication/selected-lore", SelectedLoreAsync).WithName("GetSelectedLore");
        group.MapPut("/publication", SaveAsync).WithName("SaveUniversePublication");

        // POST with no body, like archive: a transition, not a field. The cookie is SameSite=Strict,
        // so a cross-site form cannot carry the session to either of them.
        group.MapPost("/publish", PublishAsync).WithName("PublishUniverse");
        group.MapPost("/unpublish", UnpublishAsync).WithName("UnpublishUniverse");

        // The owner bridge (Task 011): from a public address back to where it is edited. Not under a universe id -
        // the public page knows only the address.
        endpoints.MapGet("/api/universes/by-address/{slug}", WorkspaceLinkAsync)
            .WithTags("Publishing")
            .RequireAuthorization()
            .WithName("GetWorkspaceLink");

        return endpoints;
    }

    /// <summary>
    /// Where the signed-in account edits what a public address shows: its universe's id, and - asked with
    /// <c>lore</c> or <c>story</c> - the live entry's or story's. Only the owner gets an answer; anyone else, and any
    /// address the owner does not hold, is a 404, so a public page learns nothing about who owns a world except that the
    /// person looking does. The public DTOs never carry an id or an owner for this.
    /// </summary>
    private static async Task<IResult> WorkspaceLinkAsync(
        string slug,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] string? lore = null,
        [FromQuery] string? story = null)
    {
        var ownerId = principal.RequireUserId();

        var universeId = await db.Universes.AsNoTracking()
            .Where(universe => universe.OwnerId == ownerId && universe.PublicSlug == slug)
            .Select(universe => (Guid?)universe.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (universeId is not { } id)
        {
            return Results.NotFound();
        }

        Guid? entityId = null;
        if (!string.IsNullOrEmpty(lore))
        {
            entityId = await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == id && entity.PublicSlug == lore && entity.DeletedAt == null)
                .Select(entity => (Guid?)entity.Id)
                .FirstOrDefaultAsync(cancellationToken);
            if (entityId is null)
            {
                return Results.NotFound();
            }
        }

        Guid? storyId = null;
        if (!string.IsNullOrEmpty(story))
        {
            storyId = await db.Stories.AsNoTracking()
                .Where(candidate => candidate.UniverseId == id && candidate.PublicSlug == story && candidate.DeletedAt == null)
                .Select(candidate => (Guid?)candidate.Id)
                .FirstOrDefaultAsync(cancellationToken);
            if (storyId is null)
            {
                return Results.NotFound();
            }
        }

        return Results.Ok(new WorkspaceLink(id, entityId, storyId));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var state = await ReadStateAsync(db, universeId, principal.RequireUserId(), cancellationToken);
        return state is null ? Results.NotFound() : Results.Ok(state);
    }

    /// <summary>
    /// The entries publishing would make public, read fresh for the owner's confirmation (Issue #47). The owner's alone, like
    /// every route here: a member is refused, anyone else finds nothing. It reads; it never changes a selection.
    /// </summary>
    private static async Task<IResult> SelectedLoreAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ownerId = principal.RequireUserId();
        var selected = PublicationRules.SelectedLore(db).AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && entity.Universe!.OwnerId == ownerId);
        var total = await selected.CountAsync(cancellationToken);
        var items = await selected
            .OrderBy(entity => EF.Functions.Collate(entity.Name, "NOCASE"))
            .ThenBy(entity => entity.Id)
            .Take(SelectedLoreLimit)
            .Select(entity => new SelectedLoreEntry(entity.Id, entity.Name, entity.EntityType!.Name))
            .ToListAsync(cancellationToken);

        return Results.Ok(new SelectedLore(total, items));
    }

    private static async Task<IResult> SaveAsync(
        Guid universeId,
        [FromBody] PublicationDetailsRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ownerId = principal.RequireUserId();

        var errors = new Dictionary<string, string[]>();
        var summary = string.IsNullOrWhiteSpace(request.PublicSummary) ? null : request.PublicSummary.Trim();

        if (summary is { Length: > PublicationLimits.SummaryMaxLength })
        {
            errors[PublicationRules.PublicSummary] =
                [$"Keep the public summary under {PublicationLimits.SummaryMaxLength} characters."];
        }

        if (request.Category is { } category && !Enum.IsDefined(category))
        {
            errors[PublicationRules.Category] = ["Choose one of Lorex's categories."];
        }

        var genres = UniverseGenres.None;
        foreach (var genre in request.Genres ?? [])
        {
            if (!PublicationRules.IsOneGenre(genre))
            {
                errors[PublicationRules.Genres] = ["Choose genres from Lorex's list."];
                break;
            }

            genres |= genre;
        }

        if (!errors.ContainsKey(PublicationRules.Genres)
            && System.Numerics.BitOperations.PopCount((uint)genres) > PublicationLimits.MaxGenres)
        {
            errors[PublicationRules.Genres] = [$"Choose at most {PublicationLimits.MaxGenres} genres."];
        }

        // Attribution (ADR 0039): checked like every other public text - trimmed, bounded, no invisible controls.
        var creator = Trimmed(request.OriginalCreator);
        var work = Trimmed(request.OriginalWork);
        if (request.BasedOnExternalWork is true)
        {
            if (creator is null)
            {
                errors[PublicationRules.OriginalCreator] = ["Name the original creator or source this universe is based on."];
            }
            else if (AttributionProblem(creator, PublicationLimits.OriginalCreatorMaxLength, "the original creator") is { } problem)
            {
                errors[PublicationRules.OriginalCreator] = [problem];
            }

            if (work is not null && AttributionProblem(work, PublicationLimits.OriginalWorkMaxLength, "the original work") is { } workProblem)
            {
                errors[PublicationRules.OriginalWork] = [workProblem];
            }
        }
        else if (request.BasedOnExternalWork is false)
        {
            // The author's own world: nothing of an earlier attribution is kept to reappear later.
            (creator, work) = (null, null);
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var universe = await db.Universes.FirstOrDefaultAsync(
            candidate => candidate.Id == universeId && candidate.OwnerId == ownerId,
            cancellationToken);

        if (universe is null)
        {
            return Results.NotFound();
        }

        if (universe.Visibility == UniverseVisibility.Public)
        {
            // Only what this save can take away: the artwork and the author's name have routes of their own.
            var needed = new Dictionary<string, string[]>();

            if (summary is null)
            {
                needed[PublicationRules.PublicSummary] =
                    ["A public universe needs its public summary. Make the universe private before removing it."];
            }

            if (request.Category is null)
            {
                needed[PublicationRules.Category] =
                    ["A public universe needs its category. Make the universe private before removing it."];
            }

            if (genres == UniverseGenres.None)
            {
                needed[PublicationRules.Genres] =
                    ["A public universe needs at least one genre. Make the universe private before removing them all."];
            }

            if (needed.Count > 0)
            {
                return Results.ValidationProblem(
                    needed,
                    extensions: new Dictionary<string, object?> { ["code"] = RequiredWhilePublicCode });
            }
        }

        if (request.BasedOnExternalWork is null)
        {
            (creator, work) = (universe.OriginalCreator, universe.OriginalWork);
        }

        if (universe.PublicSummary != summary || universe.Category != request.Category || universe.Genres != genres
            || universe.OriginalCreator != creator || universe.OriginalWork != work)
        {
            universe.PublicSummary = summary;
            universe.Category = request.Category;
            universe.Genres = genres;
            universe.OriginalCreator = creator;
            universe.OriginalWork = work;
            universe.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await ReadStateAsync(db, universeId, ownerId, cancellationToken));
    }

    private static string? Trimmed(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    /// <summary>Why an attribution cannot be published, or null: too long, or holding the invisible controls a public name may not.</summary>
    private static string? AttributionProblem(string text, int maxLength, string what) =>
        text.Length > maxLength
            ? $"Keep {what} under {maxLength} characters."
            : PublicNameEndpoints.HasInvisibleControls(text)
                ? $"The name of {what} cannot contain invisible control characters."
                : null;

    /// <summary>
    /// Private to public, once everything it needs is there. The slug is minted the first time and
    /// kept for good; <c>PublishedAt</c> likewise. Publishing a public universe again changes nothing.
    /// </summary>
    private static async Task<IResult> PublishAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ownerId = principal.RequireUserId();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var universe = await db.Universes.FirstOrDefaultAsync(
            candidate => candidate.Id == universeId && candidate.OwnerId == ownerId,
            cancellationToken);

        if (universe is null)
        {
            return Results.NotFound();
        }

        if (universe.Visibility != UniverseVisibility.Public)
        {
            var hasArtwork = await db.UniverseArtworks.AnyAsync(artwork => artwork.UniverseId == universeId, cancellationToken);
            var authorName = await db.Users
                .Where(user => user.Id == ownerId)
                .Select(user => user.PublicDisplayName)
                .FirstOrDefaultAsync(cancellationToken);

            var missing = PublicationRules.Missing(
                universe.PublicSummary, universe.Category, universe.Genres, hasArtwork, authorName);

            if (missing.Count > 0)
            {
                return Results.ValidationProblem(
                    missing,
                    detail: "This universe is not ready to publish yet.",
                    extensions: new Dictionary<string, object?> { ["code"] = IncompleteCode });
            }

            // The author's own address is minted with their first public universe, from the public name they chose -
            // never the username or email - and kept for good (ADR 0037).
            var owner = await db.Users.FirstAsync(user => user.Id == ownerId, cancellationToken);
            owner.PublicAuthorSlug ??= await PublicSlugs.ChooseAsync(
                db.Users.AsNoTracking().Select(user => user.PublicAuthorSlug),
                owner.PublicDisplayName!,
                PublicSlugs.AuthorFallback,
                cancellationToken);

            var now = DateTime.UtcNow;
            universe.PublicSlug ??= await PublicSlugs.ChooseAsync(
                db.Universes.AsNoTracking().Select(candidate => candidate.PublicSlug),
                universe.Name,
                PublicSlugs.UniverseFallback,
                cancellationToken);
            universe.PublishedAt ??= now;
            universe.Visibility = UniverseVisibility.Public;
            universe.UpdatedAt = now;

            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await ReadStateAsync(db, universeId, ownerId, cancellationToken));
    }

    /// <summary>
    /// Public to private, at once: the next public read no longer finds it, because every public read
    /// asks the database and nothing public is cached. Its details, address and first publication
    /// date stay, for publishing it again.
    /// </summary>
    private static async Task<IResult> UnpublishAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ownerId = principal.RequireUserId();

        var universe = await db.Universes.FirstOrDefaultAsync(
            candidate => candidate.Id == universeId && candidate.OwnerId == ownerId,
            cancellationToken);

        if (universe is null)
        {
            return Results.NotFound();
        }

        if (universe.Visibility != UniverseVisibility.Private)
        {
            universe.Visibility = UniverseVisibility.Private;
            universe.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(await ReadStateAsync(db, universeId, ownerId, cancellationToken));
    }

    /// <summary>The owner's view of one universe's public face, or null when it is not theirs.</summary>
    internal static async Task<PublicationState?> ReadStateAsync(
        LorexDbContext db,
        Guid universeId,
        string ownerId,
        CancellationToken cancellationToken)
    {
        var universe = await db.Universes.AsNoTracking()
            .Where(candidate => candidate.Id == universeId && candidate.OwnerId == ownerId)
            .Select(candidate => new
            {
                candidate.Name,
                candidate.Visibility,
                candidate.PublicSummary,
                candidate.Category,
                candidate.Genres,
                candidate.PublicSlug,
                candidate.PublishedAt,
                Author = candidate.Owner!.PublicDisplayName,
                candidate.OriginalCreator,
                candidate.OriginalWork,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (universe is null)
        {
            return null;
        }

        var artwork = await db.UniverseArtworks.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.UniverseId == universeId, cancellationToken);

        return new PublicationState(
            universe.Name,
            universe.Visibility,
            universe.PublicSummary,
            universe.Category,
            PublicationRules.List(universe.Genres),
            universe.PublicSlug,
            universe.PublishedAt,
            universe.Author,
            artwork is null ? null : UniverseArtworkRef.Of(artwork),
            PublicationRules.Missing(
                universe.PublicSummary, universe.Category, universe.Genres, artwork is not null, universe.Author),
            universe.OriginalCreator,
            universe.OriginalWork);
    }
}
