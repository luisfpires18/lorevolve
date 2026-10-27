using System.Globalization;
using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// An author's public identity (ADR 0037): the anonymous author page's data and photo, and the owner's side of both.
///
/// <para><b>Only authors of something public exist publicly.</b> An address resolves only while its account has a
/// universe <see cref="PublicationRules.Public"/> answers; otherwise it is the same 404 as an address nobody holds. So
/// registering never makes an account findable, and making every world private takes the author page down with them.
/// The page is the public name, the address and - only if the owner chose to show it - the photo's public square. No
/// account id, username or email is read by any anonymous route here.</para>
///
/// <para><b>The photo is the owner's choice, per picture.</b> The account's photo is private (ADR 0021) until its owner
/// says to show it (<see cref="Profile.ProfileImage.IsPublic"/>); replacing the photo makes it private again. Only its
/// square - cut and re-encoded by the upload gate, so nothing a camera wrote survives - is ever served here, never the
/// original, and only for the square the photo currently has: ETag = its id, checked after the visibility.</para>
/// </summary>
public static class PublicAuthorEndpoints
{
    public static IEndpointRouteBuilder MapPublicAuthorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var anonymous = endpoints.MapGroup("/api/public/authors")
            .WithTags("Public portal")
            .AllowAnonymous()
            .AddEndpointFilter(async (context, next) =>
            {
                context.HttpContext.Response.Headers.CacheControl = "no-cache";
                return await next(context);
            });

        anonymous.MapGet("/{slug}", GetAsync).WithName("GetPublicAuthor");
        anonymous.MapGet("/{slug}/avatar/{thumbnailId:guid}", ReadAvatarAsync).WithName("ReadPublicAuthorAvatar");

        var owner = endpoints.MapGroup("/api/profile/public-author")
            .WithTags("Publishing")
            .RequireAuthorization();

        owner.MapGet("/", GetSettingsAsync).WithName("GetPublicAuthorSettings");
        owner.MapPut("/photo", SetPhotoAsync).WithName("SetPublicAuthorPhoto");

        return endpoints;
    }

    private static async Task<IResult> GetAsync(string slug, LorEvolveDbContext db, CancellationToken cancellationToken)
    {
        if (!PublicUniverseEndpoints.SlugShape().IsMatch(slug))
        {
            return Results.NotFound();
        }

        var author = await Authors(db, slug)
            .Select(user => new
            {
                user.PublicDisplayName,
                Avatar = db.ProfileImages
                    .Where(image => image.UserId == user.Id && image.IsPublic)
                    .Select(image => (Guid?)image.ThumbnailId)
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return author is null
            ? Results.NotFound()
            : Results.Ok(new PublicAuthor(
                slug,
                author.PublicDisplayName!,
                author.Avatar is { } avatar ? AvatarUrl(slug, avatar) : null));
    }

    private static async Task<IResult> ReadAvatarAsync(
        string slug,
        Guid thumbnailId,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        HttpContext context,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!PublicUniverseEndpoints.SlugShape().IsMatch(slug))
        {
            return Results.NotFound();
        }

        var key = await Authors(db, slug)
            .SelectMany(user => db.ProfileImages.Where(image => image.UserId == user.Id && image.IsPublic && image.ThumbnailId == thumbnailId))
            .Select(image => image.ThumbnailKey)
            .FirstOrDefaultAsync(cancellationToken);

        return key is null
            ? Results.NotFound()
            : await PublicUniverseEndpoints.ServeWebpAsync(key, thumbnailId, context, store, loggerFactory, cancellationToken);
    }

    /// <summary>The account at an author address, only while it has a public universe. The one query both routes start from.</summary>
    private static IQueryable<Auth.LorEvolveUser> Authors(LorEvolveDbContext db, string slug)
    {
        var universes = PublicationRules.Public(db);
        return db.Users.AsNoTracking()
            .Where(user => user.PublicAuthorSlug == slug && universes.Any(universe => universe.OwnerId == user.Id));
    }

    internal static string AvatarUrl(string slug, Guid thumbnailId) =>
        string.Create(CultureInfo.InvariantCulture, $"/api/public/authors/{slug}/avatar/{thumbnailId:D}");

    // ---------- The owner's side ----------

    private static async Task<IResult> GetSettingsAsync(ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
        Results.Ok(await SettingsAsync(db, principal.RequireUserId(), cancellationToken));

    /// <summary>
    /// Shows or hides the account's photo on its author page. Showing needs a photo; hiding always succeeds and is
    /// immediate - the next request for the square is a 404.
    /// </summary>
    private static async Task<IResult> SetPhotoAsync(
        [FromBody] PublicAuthorPhotoRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();
        var image = await db.ProfileImages.FirstOrDefaultAsync(candidate => candidate.UserId == userId, cancellationToken);

        if (image is null)
        {
            return request.IsPublic
                ? Results.ValidationProblem(new Dictionary<string, string[]> { ["photo"] = ["Add a photo to your profile first."] })
                : Results.Ok(await SettingsAsync(db, userId, cancellationToken));
        }

        if (image.IsPublic != request.IsPublic)
        {
            image.IsPublic = request.IsPublic;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(await SettingsAsync(db, userId, cancellationToken));
    }

    private static async Task<PublicAuthorSettings> SettingsAsync(LorEvolveDbContext db, string userId, CancellationToken cancellationToken)
    {
        var universes = PublicationRules.Public(db);
        var settings = await db.Users.AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => new
            {
                user.PublicAuthorSlug,
                HasPublicWorld = universes.Any(universe => universe.OwnerId == user.Id),
                Photo = db.ProfileImages.Where(image => image.UserId == user.Id).Select(image => (bool?)image.IsPublic).FirstOrDefault(),
            })
            .FirstAsync(cancellationToken);

        return new PublicAuthorSettings(settings.PublicAuthorSlug, settings.HasPublicWorld, settings.Photo is not null, settings.Photo == true);
    }
}
