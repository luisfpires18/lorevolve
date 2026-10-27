using System.Security.Claims;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Profile;

/// <summary>
/// The one photo on the signed-in account: read it, set it, reframe it, remove it.
///
/// <para><b>Whose photo it is, is never asked.</b> There is no user id anywhere in these routes
/// and none is read from a body. Every one of them derives the account from the session's own
/// principal, so "read my photo" and "read that person's photo" are not two requests that differ
/// by a parameter - the second cannot be expressed. That is the whole authorization model, and it
/// is why cross-account isolation here needs no ownership query at all.</para>
///
/// <para><b>Everything else is the entity-image design, reused.</b> The bytes come through LorEvolve
/// rather than from a presigned Cloudflare URL, for the reasons ADR 0019 sets out; the server
/// decides what is an image by decoding it and cuts every square itself from the original; the
/// write ordering below is the same one, and for the same reason - R2 and SQLite are two stores
/// with no transaction across them. The gate that accepts the bytes and renders the square is
/// literally the same code, <see cref="ImagePreparation"/>, so the formats, the limits, the
/// orientation rule and the crop arithmetic cannot drift between a character portrait and a
/// person's avatar.</para>
///
/// <para><b>What is deliberately not here.</b> No revision history - an account is not authored
/// lore and has no versions - and nothing that reaches a universe backup: a backup holds one
/// world's authored data, and whose account exported it is not part of it. See
/// <c>docs/architecture/decisions/0021-profile-photo.md</c>.</para>
/// </summary>
public static partial class ProfileImageEndpoints
{
    /// <summary>Stable marker for a crop that arrived after its picture had changed.</summary>
    public const string ImageChangedCode = "image_changed";

    /// <summary>Stable marker for an original the store cannot hand back.</summary>
    public const string OriginalUnavailableCode = "image_original_unavailable";

    private const string LoggerName = "LorEvolve.ProfileImages";

    /// <summary>
    /// A backstop well above <see cref="ImagePreparation.MaxUploadBytes"/>, not a second limit.
    /// The friendly refusal is the validation one; this only stops a request that is gross.
    /// </summary>
    private const long RequestBodyCeiling = ImagePreparation.MaxUploadBytes * 2;

    /// <summary>
    /// Enough for any upload the gate will accept, so the body is never spooled to disk. An int
    /// because that is what the form reader takes.
    /// </summary>
    private const int InMemoryBodyThreshold = (int)ImagePreparation.MaxUploadBytes + 64 * 1024;

    public static IEndpointRouteBuilder MapProfileImageEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/profile/image")
            .WithTags("Profile image")
            .RequireAuthorization();

        group.MapGet("/", GetAsync).WithName("GetProfileImage");

        // PUT rather than POST, and that is a security choice as well as a semantic one. The
        // session cookie is SameSite=Strict, so a cross-site request never carries it in the
        // first place; PUT closes the same hole a second time, because an HTML form can only
        // issue GET and POST and a scripted PUT is forced through a CORS preflight. Antiforgery
        // is disabled because there is no token to check on an API called by fetch - the cookie
        // policy and the method are what defend it.
        group.MapPut("/", UploadAsync)
            .WithName("SetProfileImage")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling))
            // The form reader spools a section over 64 KB to a temporary file, and this handler
            // then reads the whole thing back into memory anyway - the bytes are needed three
            // times, to identify, to decode and to store. Raising the threshold past what the
            // upload limit allows takes that write-and-read-back off the path entirely; it holds
            // no more memory than the handler already held.
            .WithMetadata(new RequestFormLimitsAttribute { MemoryBufferThreshold = InMemoryBodyThreshold });

        // A JSON body, so it needs no antiforgery exemption, and PUT for the same reasons.
        group.MapPut("/thumbnail", ReframeAsync).WithName("SetProfileThumbnail");

        group.MapDelete("/", RemoveAsync).WithName("RemoveProfileImage");

        group.MapGet("/{assetId:guid}/original", ReadOriginalAsync).WithName("ReadProfileImageOriginal");

        group.MapGet("/{assetId:guid}/thumbnail/{thumbnailId:guid}", ReadThumbnailAsync)
            .WithName("ReadProfileImageThumbnail");

        return endpoints;
    }

    // ---------- Read the association ----------

    /// <summary>
    /// What the account's photo is, or nothing. 204 rather than 404, because having no photo is
    /// an ordinary state of a perfectly good account and not a missing resource.
    /// </summary>
    private static async Task<IResult> GetAsync(
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var image = await db.ProfileImages.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.UserId == principal.RequireUserId(), cancellationToken);

        return image is null ? Results.NoContent() : Results.Ok(ProfileImageRef.Of(image));
    }

    // ---------- Upload and replace ----------

    /// <summary>
    /// Stores a new asset and points the account at it.
    ///
    /// The order is the design. Both new objects are written first, under an asset id nothing is
    /// using; only then does the database move; and only after that commit is the previous pair
    /// deleted. A failure anywhere before the commit leaves the account showing the photo it had,
    /// still whole; a failure after it leaves the new photo in place with two objects to sweep.
    /// What cannot happen is a row naming objects that are gone.
    ///
    /// The crop travels with the file in its own form field, so nothing is uploaded until the
    /// square has been confirmed and a cancelled cropper costs nothing.
    /// </summary>
    private static async Task<IResult> UploadAsync(
        IFormFile? file,
        [FromForm(Name = "crop")] string? crop,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();

        if (file is null || file.Length == 0)
        {
            return Invalid(ImagePreparation.FileField, "Choose a photo to upload.");
        }

        ImageCrop? requestedCrop = null;
        if (!string.IsNullOrWhiteSpace(crop))
        {
            requestedCrop = ReadCrop(crop);

            if (requestedCrop is null)
            {
                return Invalid(ImagePreparation.CropField, "The photo selection could not be read.");
            }
        }

        await using var upload = file.OpenReadStream();

        // Buffered rather than streamed to R2 directly, because the bytes are read three times:
        // once for the header, once to decode, and once to store. The ceiling above is what makes
        // holding them safe.
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, requestedCrop, cancellationToken);

        if (prepared is null)
        {
            return Invalid(rejection!.Field, rejection.Message);
        }

        var logger = loggerFactory.CreateLogger(LoggerName);

        var existing = await db.ProfileImages
            .FirstOrDefaultAsync(candidate => candidate.UserId == userId, cancellationToken);

        var supersededOriginal = existing?.OriginalKey;
        var supersededThumbnail = existing?.ThumbnailKey;

        var assetId = Guid.NewGuid();
        var thumbnailId = Guid.NewGuid();
        var originalKey = ProfileImageKeys.Original(userId, assetId, prepared.Extension);
        var thumbnailKey = ProfileImageKeys.Thumbnail(userId, assetId, thumbnailId);

        try
        {
            bytes.Position = 0;
            using var thumbnail = new MemoryStream(prepared.Thumbnail, writable: false);

            // Both at once. Neither depends on the other and nothing can read either until the row
            // moves below, so waiting for the first before starting the second only ever bought a
            // second round trip to the bucket - see MediaObjectWrites.
            await MediaObjectWrites.PutAllAsync(
                store,
                cancellationToken,
                new PendingMediaObject(originalKey, bytes, prepared.ContentType),
                new PendingMediaObject(thumbnailKey, thumbnail, "image/webp"));
        }
        catch (MediaStorageUnavailableException exception)
        {
            // Nothing is configured, so nothing was written and there is nothing to sweep.
            return Unavailable(exception);
        }
        catch (MediaStorageFailedException exception)
        {
            // The original may well have landed before the thumbnail did not. Nothing points at
            // either yet, so both come back out and the account keeps the photo it had.
            LogStorageFailure(logger, "upload", exception);
            await SweepAsync(store, logger, originalKey, thumbnailKey);
            return Unavailable(exception);
        }
        catch (Exception)
        {
            await SweepAsync(store, logger, originalKey, thumbnailKey);
            throw;
        }

        var stored = existing ?? new ProfileImage
        {
            UserId = userId,
            OriginalKey = originalKey,
            ThumbnailKey = thumbnailKey,
            ContentType = prepared.ContentType,
        };

        stored.AssetId = assetId;
        stored.ThumbnailId = thumbnailId;
        stored.OriginalKey = originalKey;
        stored.ThumbnailKey = thumbnailKey;
        stored.ContentType = prepared.ContentType;
        stored.FileName = TrimFileName(file.FileName);
        stored.Width = prepared.Width;
        stored.Height = prepared.Height;
        stored.ByteSize = bytes.Length;
        stored.UploadedAt = DateTime.UtcNow;
        SetCrop(stored, prepared.Crop);

        // A new picture is not the one its owner agreed to show publicly (ADR 0037): it starts private again.
        stored.IsPublic = false;

        try
        {
            if (existing is null)
            {
                db.ProfileImages.Add(stored);
            }

            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception)
        {
            // The association never moved, so the old photo is still the live one and the new
            // objects are unreferenced. Take them back out.
            await SweepAsync(store, logger, originalKey, thumbnailKey);
            throw;
        }

        // Past the commit. The new photo is the account's photo whatever happens next, so a
        // failure here is litter to be reported, never a reason to undo the write.
        if (supersededOriginal is not null)
        {
            await SweepAsync(store, logger, supersededOriginal, supersededThumbnail!);
        }

        return Results.Ok(ProfileImageRef.Of(stored));
    }

    // ---------- Reframing ----------

    /// <summary>
    /// Cuts a new square from the original the account already has, and nothing else.
    ///
    /// The original is read back from the store and never uploaded again, and its object is not
    /// written, moved or deleted: its key stays exactly what it was. The new square is written
    /// under a thumbnail id nothing is using; the row moves to it; only after that commit is the
    /// old square deleted.
    ///
    /// The row only moves if it still names the asset and the square that were read, so a
    /// replacement that landed in between wins and this one answers 409 - an account can never
    /// end up showing part of a photo it no longer has.
    /// </summary>
    private static async Task<IResult> ReframeAsync(
        ProfileThumbnailRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();

        var image = await db.ProfileImages.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.UserId == userId, cancellationToken);

        if (image is null)
        {
            return Results.NotFound();
        }

        if (request.Crop is null)
        {
            return Invalid(ImagePreparation.CropField, "Choose the part of the photo the avatar shows.");
        }

        if (ImagePreparation.CheckCrop(request.Crop) is { } badCrop)
        {
            return Invalid(ImagePreparation.CropField, badCrop);
        }

        if (request.AssetId != image.AssetId)
        {
            return Changed();
        }

        var logger = loggerFactory.CreateLogger(LoggerName);

        using var bytes = new MemoryStream();
        try
        {
            var original = await store.GetAsync(image.OriginalKey, cancellationToken);

            if (original is null || original.Length > ImagePreparation.MaxUploadBytes)
            {
                if (original is not null)
                {
                    await original.DisposeAsync();
                }

                return OriginalUnavailable();
            }

            await using (original)
            {
                await original.Content.CopyToAsync(bytes, cancellationToken);
            }
        }
        catch (MediaStorageUnavailableException exception)
        {
            return Unavailable(exception);
        }
        catch (Exception exception) when (exception is MediaStorageFailedException
            or IOException
            or HttpRequestException)
        {
            // A read that died part-way through the body is the store failing too, just later.
            LogStorageFailure(logger, "reframe", exception);
            return Unavailable(exception as MediaStorageException
                ?? new MediaStorageFailedException("Image storage could not complete the request.", exception));
        }

        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, request.Crop, cancellationToken);

        if (prepared is null)
        {
            // A crop that is not square on this picture is the caller's to fix. Anything else
            // means the stored original itself no longer passes, which is not.
            return rejection!.Field == ImagePreparation.CropField
                ? Invalid(ImagePreparation.CropField, rejection.Message)
                : OriginalUnavailable();
        }

        var thumbnailId = Guid.NewGuid();
        var thumbnailKey = ProfileImageKeys.Thumbnail(userId, image.AssetId, thumbnailId);

        try
        {
            using var thumbnail = new MemoryStream(prepared.Thumbnail, writable: false);
            await store.PutAsync(thumbnailKey, thumbnail, "image/webp", cancellationToken);
        }
        catch (MediaStorageUnavailableException exception)
        {
            return Unavailable(exception);
        }
        catch (MediaStorageFailedException exception)
        {
            LogStorageFailure(logger, "reframe", exception);
            await SweepAsync(store, logger, thumbnailKey);
            return Unavailable(exception);
        }
        catch (Exception)
        {
            await SweepAsync(store, logger, thumbnailKey);
            throw;
        }

        int moved;
        try
        {
            // One conditional statement rather than a tracked read and a save: the check that the
            // photo is still the one that was framed and the move to the new square cannot be
            // separated by another write. Width and height are refreshed from the decode in
            // passing, exactly as the entity path does it.
            moved = await db.ProfileImages
                .Where(candidate => candidate.UserId == userId
                    && candidate.AssetId == image.AssetId
                    && candidate.ThumbnailId == image.ThumbnailId)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(candidate => candidate.ThumbnailId, thumbnailId)
                        .SetProperty(candidate => candidate.ThumbnailKey, thumbnailKey)
                        .SetProperty(candidate => candidate.CropX, (double?)prepared.Crop.X)
                        .SetProperty(candidate => candidate.CropY, (double?)prepared.Crop.Y)
                        .SetProperty(candidate => candidate.CropWidth, (double?)prepared.Crop.Width)
                        .SetProperty(candidate => candidate.CropHeight, (double?)prepared.Crop.Height)
                        .SetProperty(candidate => candidate.Width, prepared.Width)
                        .SetProperty(candidate => candidate.Height, prepared.Height),
                    cancellationToken);
        }
        catch (Exception)
        {
            await SweepAsync(store, logger, thumbnailKey);
            throw;
        }

        if (moved == 0)
        {
            // Something else moved the photo first. Nothing points at this square.
            await SweepAsync(store, logger, thumbnailKey);
            return Changed();
        }

        // Past the commit, and only the square. The original is still the account's photo.
        await SweepAsync(store, logger, image.ThumbnailKey);

        image.ThumbnailId = thumbnailId;
        image.ThumbnailKey = thumbnailKey;
        image.Width = prepared.Width;
        image.Height = prepared.Height;
        SetCrop(image, prepared.Crop);

        return Results.Ok(ProfileImageRef.Of(image));
    }

    // ---------- Remove ----------

    /// <summary>
    /// Clears the association, then cleans the bucket.
    ///
    /// The reverse order of the upload, for the same reason: the database is what says the photo
    /// exists, so it moves first and the objects follow. An account with no photo is a correct
    /// state; a row naming two objects that were deliberately deleted is not.
    /// </summary>
    private static async Task<IResult> RemoveAsync(
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var image = await db.ProfileImages
            .FirstOrDefaultAsync(candidate => candidate.UserId == principal.RequireUserId(), cancellationToken);

        if (image is null)
        {
            // Nothing to remove is the outcome the caller asked for.
            return Results.NoContent();
        }

        var originalKey = image.OriginalKey;
        var thumbnailKey = image.ThumbnailKey;

        db.ProfileImages.Remove(image);
        await db.SaveChangesAsync(cancellationToken);

        // Only past the commit, so the objects go after the account has stopped naming them.
        await SweepAsync(store, loggerFactory.CreateLogger(LoggerName), originalKey, thumbnailKey);

        return Results.NoContent();
    }

    // ---------- Read the bytes ----------

    private static Task<IResult> ReadOriginalAsync(
        Guid assetId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken) =>
        ReadAsync(assetId, thumbnailId: null, principal, db, store, loggerFactory, context, cancellationToken);

    private static Task<IResult> ReadThumbnailAsync(
        Guid assetId,
        Guid thumbnailId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken) =>
        ReadAsync(assetId, thumbnailId, principal, db, store, loggerFactory, context, cancellationToken);

    /// <summary>
    /// Streams one object to the account that owns it: the original when
    /// <paramref name="thumbnailId"/> is null, otherwise that square.
    ///
    /// The row is found by the session's user id, and both ids in the route are checked against it
    /// rather than trusted - so an old asset id stops resolving the moment the photo is replaced,
    /// and an old thumbnail id the moment it is reframed. A URL cannot outlive the row that
    /// authorised it, and one account's URL means nothing in another account's session.
    /// </summary>
    private static async Task<IResult> ReadAsync(
        Guid assetId,
        Guid? thumbnailId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        var image = await db.ProfileImages.AsNoTracking()
            .Where(candidate => candidate.UserId == principal.RequireUserId() && candidate.AssetId == assetId)
            .Select(candidate => new
            {
                candidate.OriginalKey,
                candidate.ThumbnailId,
                candidate.ThumbnailKey,
                candidate.ContentType,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (image is null || (thumbnailId is not null && thumbnailId != image.ThumbnailId))
        {
            return Results.NotFound();
        }

        var key = thumbnailId is null ? image.OriginalKey : image.ThumbnailKey;

        StoredMediaObject? stored;
        try
        {
            stored = await store.GetAsync(key, cancellationToken);
        }
        catch (MediaStorageException exception)
        {
            if (exception is MediaStorageFailedException)
            {
                LogStorageFailure(loggerFactory.CreateLogger(LoggerName), "read", exception);
            }

            return Unavailable(exception);
        }

        if (stored is null)
        {
            // The row names an object the bucket does not hold. Two stores can disagree and this
            // is what that looks like from here: not found, and nothing said about which store.
            return Results.NotFound();
        }

        // Private, and cacheable for a long time because the URL is content-addressed: the ids are
        // in the path and are never reused, so these bytes cannot change under this URL. `private`
        // keeps it out of any shared cache, and the service worker refuses everything under /api
        // by construction - ADR 0017 - so it never reaches the app shell cache either.
        context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        context.Response.Headers.XContentTypeOptions = "nosniff";

        var contentType = thumbnailId is null ? image.ContentType : "image/webp";

        return Results.Stream(stored.Content, contentType, enableRangeProcessing: false);
    }

    // ---------- Shared ----------

    /// <summary>Deletes objects nothing points at any more, together. See MediaObjectWrites.</summary>
    private static Task SweepAsync(IMediaObjectStore store, ILogger logger, params string[] keys) =>
        MediaObjectWrites.SweepAsync(store, logger, LogOrphanedObject, keys);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Orphaned media object left behind at '{ObjectKey}'. Nothing references it and it is safe to delete.")]
    private static partial void LogOrphanedObject(ILogger logger, string objectKey, Exception exception);

    /// <summary>
    /// The account is not named, deliberately: a log line about a person's photo failing to store
    /// does not need to say whose, and the operation plus the exception is what a fix starts from.
    /// </summary>
    [LoggerMessage(
        Level = LogLevel.Error,
        Message = "Profile photo storage failed during {Operation}. Nothing was changed.")]
    private static partial void LogStorageFailure(ILogger logger, string operation, Exception exception);

    private static void SetCrop(ProfileImage image, ImageCrop crop)
    {
        image.CropX = crop.X;
        image.CropY = crop.Y;
        image.CropWidth = crop.Width;
        image.CropHeight = crop.Height;
    }

    /// <summary>The crop form field, or null when it is not the four numbers a crop is.</summary>
    private static ImageCrop? ReadCrop(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<ImageCrop>(json, JsonSerializerOptions.Web);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    /// <summary>
    /// 503, whatever the store's reason. The detail is the exception's own message, which is
    /// always LorEvolve's sentence - never the provider's, which stays in the log.
    /// </summary>
    private static IResult Unavailable(MediaStorageException exception) =>
        Results.Problem(
            title: "Image storage is unavailable.",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);

    private static IResult Changed() =>
        Results.Problem(
            title: "The photo changed while it was being framed.",
            detail: "Your profile photo was replaced somewhere else. Open it again to choose the framing.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ImageChangedCode });

    private static IResult OriginalUnavailable() =>
        Results.Problem(
            title: "The stored photo could not be read.",
            detail: "Its avatar cannot be made again. Upload the photo again to replace it.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = OriginalUnavailableCode });

    /// <summary>The file's own name, kept only as a label and never used to build a key.</summary>
    private static string? TrimFileName(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return null;
        }

        var name = Path.GetFileName(fileName.Trim());

        return name.Length switch
        {
            0 => null,
            > StoredImageLimits.FileNameMaxLength => name[..StoredImageLimits.FileNameMaxLength],
            _ => name,
        };
    }
}
