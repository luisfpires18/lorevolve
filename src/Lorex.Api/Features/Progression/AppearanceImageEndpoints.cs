using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Storage;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Progression;

/// <summary>
/// Where an appearance's pictures live in the bucket - ids only, a new <c>{imageId}</c> for every upload (ADR 0019's rules):
///
///   universes/{universeId}/entities/{entityId}/appearances/{appearanceId}/{imageId}/original.{ext}
///   universes/{universeId}/entities/{entityId}/appearances/{appearanceId}/{imageId}/thumbnail.webp
/// </summary>
public static class AppearanceImageKeys
{
    private static string Prefix(Guid universeId, Guid entityId, Guid appearanceId, Guid imageId) =>
        $"universes/{universeId:D}/entities/{entityId:D}/appearances/{appearanceId:D}/{imageId:D}";

    public static string Original(Guid universeId, Guid entityId, Guid appearanceId, Guid imageId, string extension) =>
        $"{Prefix(universeId, entityId, appearanceId, imageId)}/original.{extension}";

    public static string Thumbnail(Guid universeId, Guid entityId, Guid appearanceId, Guid imageId) =>
        $"{Prefix(universeId, entityId, appearanceId, imageId)}/thumbnail.webp";
}

/// <summary>
/// The pictures of one appearance (Issue #43, ADR 0053): add one, remove one, put them in order, read one. The entry picture's
/// pipeline throughout (<see cref="EntityImageEndpoints"/>, ADR 0019, ADR 0042): the server decides what is an image and cuts
/// the thumbnail - the centred square, since a gallery picture is never framed - both objects are written under a new id before
/// the row exists, growth is held against the universe owner's storage first, and objects are swept only after the database
/// stopped naming them. Members read through Lorex; nothing is ever public. Pictures are not versioned: a removed one is gone.
/// </summary>
public static partial class AppearanceImageEndpoints
{
    private const long RequestBodyCeiling = ImagePreparation.MaxUploadBytes * 2;

    private const int InMemoryBodyThreshold = (int)ImagePreparation.MaxUploadBytes + 64 * 1024;

    public const string LoggerName = "Lorex.AppearanceImages";

    public static IEndpointRouteBuilder MapAppearanceImageEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/entities/{entityId:guid}/appearances/{appearanceId:guid}/images")
            .WithTags("Appearance images")
            .RequireAuthorization();

        // PUT, not POST, for the reasons the entry picture's upload gives: a cross-site form cannot send it.
        group.MapPut("/", UploadAsync)
            .WithName("AddAppearanceImage")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling))
            .WithMetadata(new RequestFormLimitsAttribute { MemoryBufferThreshold = InMemoryBodyThreshold });

        group.MapPut("/order", OrderAsync).WithName("OrderAppearanceImages");
        group.MapDelete("/{imageId:guid}", RemoveAsync).WithName("RemoveAppearanceImage");
        group.MapGet("/{imageId:guid}/original", (Guid universeId, Guid entityId, Guid appearanceId, Guid imageId, ClaimsPrincipal principal,
                LorexDbContext db, IMediaObjectStore store, ILoggerFactory loggerFactory, HttpContext context, CancellationToken cancellationToken) =>
            ReadAsync(universeId, entityId, appearanceId, imageId, thumbnail: false, principal, db, store, loggerFactory, context, cancellationToken))
            .WithName("ReadAppearanceImageOriginal");
        group.MapGet("/{imageId:guid}/thumbnail", (Guid universeId, Guid entityId, Guid appearanceId, Guid imageId, ClaimsPrincipal principal,
                LorexDbContext db, IMediaObjectStore store, ILoggerFactory loggerFactory, HttpContext context, CancellationToken cancellationToken) =>
            ReadAsync(universeId, entityId, appearanceId, imageId, thumbnail: true, principal, db, store, loggerFactory, context, cancellationToken))
            .WithName("ReadAppearanceImageThumbnail");

        return endpoints;
    }

    // ---------- Add ----------

    private static async Task<IResult> UploadAsync(
        Guid universeId,
        Guid entityId,
        Guid appearanceId,
        IFormFile? file,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        TimeProvider clock,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        // A live entry's appearance; the same read names whose storage the picture counts against.
        var target = await db.EntityAppearances.AsNoTracking()
            .Where(appearance => appearance.Id == appearanceId
                && appearance.EntityId == entityId
                && appearance.Entity!.UniverseId == universeId
                && appearance.Entity.DeletedAt == null)
            .Select(appearance => new { appearance.Entity!.Universe!.OwnerId, Count = appearance.Images.Count })
            .FirstOrDefaultAsync(cancellationToken);

        if (target is null)
        {
            return Results.NotFound();
        }

        if (target.Count >= ProgressionLimits.MaxImagesPerAppearance)
        {
            return Invalid(ImagePreparation.FileField, $"An appearance can hold at most {ProgressionLimits.MaxImagesPerAppearance} pictures.");
        }

        if (file is null || file.Length == 0)
        {
            return Invalid(ImagePreparation.FileField, "Choose an image to upload.");
        }

        await using var upload = file.OpenReadStream();
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(bytes, bytes.Length, null, cancellationToken);
        if (prepared is null)
        {
            return Invalid(rejection!.Field, rejection.Message);
        }

        var logger = loggerFactory.CreateLogger(LoggerName);
        var ownerId = target.OwnerId;

        // A new picture adds all its bytes, so it always holds them before the bucket is touched (ADR 0042).
        var hold = await AccountStorage.ReserveAsync(db, clock, ownerId, bytes.Length, cancellationToken);
        if (hold is null)
        {
            return StorageQuota.Exceeded(isOwner: ownerId == principal.RequireUserId());
        }

        var committed = false;
        try
        {
            var imageId = Guid.NewGuid();
            var originalKey = AppearanceImageKeys.Original(universeId, entityId, appearanceId, imageId, prepared.Extension);
            var thumbnailKey = AppearanceImageKeys.Thumbnail(universeId, entityId, appearanceId, imageId);

            try
            {
                bytes.Position = 0;
                using var thumbnail = new MemoryStream(prepared.Thumbnail, writable: false);
                await MediaObjectWrites.PutAllAsync(
                    store,
                    cancellationToken,
                    new PendingMediaObject(originalKey, bytes, prepared.ContentType),
                    new PendingMediaObject(thumbnailKey, thumbnail, "image/webp"));
            }
            catch (MediaStorageUnavailableException exception)
            {
                return Unavailable(exception);
            }
            catch (MediaStorageFailedException exception)
            {
                LogStorageFailure(logger, "upload", appearanceId, exception);
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                return Unavailable(exception);
            }
            catch (Exception)
            {
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                throw;
            }

            var row = new EntityAppearanceImage
            {
                Id = imageId,
                EntityAppearanceId = appearanceId,
                OriginalKey = originalKey,
                ThumbnailKey = thumbnailKey,
                ContentType = prepared.ContentType,
                FileName = FileNameLabel(file.FileName),
                Width = prepared.Width,
                Height = prepared.Height,
                ByteSize = bytes.Length,
                UploadedAt = DateTime.UtcNow,
            };

            var gone = false;
            try
            {
                await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

                // Under the writer lock: the appearance must still be there, on a live entry, with room in its gallery.
                var count = await db.EntityAppearances.AsNoTracking()
                    .Where(appearance => appearance.Id == appearanceId && appearance.Entity!.DeletedAt == null)
                    .Select(appearance => (int?)appearance.Images.Count)
                    .FirstOrDefaultAsync(cancellationToken);

                if (count is null || count >= ProgressionLimits.MaxImagesPerAppearance)
                {
                    gone = true;
                }
                else
                {
                    await AccountStorage.ConsumeAsync(db, clock, hold, cancellationToken);
                    row.SortOrder = (await db.EntityAppearanceImages
                        .Where(image => image.EntityAppearanceId == appearanceId)
                        .MaxAsync(image => (int?)image.SortOrder, cancellationToken) ?? -1) + 1;
                    db.EntityAppearanceImages.Add(row);
                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    committed = true;
                }
            }
            catch (StorageQuotaExceededException)
            {
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                return StorageQuota.Exceeded(isOwner: ownerId == principal.RequireUserId());
            }
            catch (Exception)
            {
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                throw;
            }

            if (gone)
            {
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                return Results.Problem(
                    title: "The appearance changed while this picture was uploading.",
                    detail: "It was removed, or its gallery filled up, somewhere else. This picture was not kept.",
                    statusCode: StatusCodes.Status409Conflict,
                    extensions: new Dictionary<string, object?> { ["code"] = EntityImageEndpoints.ImageChangedCode });
            }

            return Results.Ok(new AppearanceImageRef(row.Id, row.ContentType, row.Width, row.Height, row.FileName));
        }
        finally
        {
            if (!committed)
            {
                await AccountStorage.ReleaseAsync(db, hold, logger);
            }
        }
    }

    // ---------- Order ----------

    /// <summary>The gallery in a new order: exactly its pictures, each once. Anything else answers 409 - the gallery changed.</summary>
    private static async Task<IResult> OrderAsync(
        Guid universeId,
        Guid entityId,
        Guid appearanceId,
        AppearanceImageOrderRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var exists = await db.EntityAppearances.AnyAsync(
            appearance => appearance.Id == appearanceId
                && appearance.EntityId == entityId
                && appearance.Entity!.UniverseId == universeId
                && appearance.Entity.DeletedAt == null,
            cancellationToken);
        if (!exists)
        {
            return Results.NotFound();
        }

        var images = await db.EntityAppearanceImages
            .Where(image => image.EntityAppearanceId == appearanceId
                && image.Appearance!.EntityId == entityId
                && image.Appearance.Entity!.UniverseId == universeId
                && image.Appearance.Entity.DeletedAt == null)
            .ToDictionaryAsync(image => image.Id, cancellationToken);

        var order = request.ImageIds ?? [];
        if (order.Count != images.Count || order.Distinct().Count() != order.Count || order.Any(id => !images.ContainsKey(id)))
        {
            return Results.Problem(
                title: "The pictures changed",
                detail: "This appearance's pictures were changed somewhere else. Open it again and put them in order.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = EntityImageEndpoints.ImageChangedCode });
        }

        for (var index = 0; index < order.Count; index++)
        {
            images[order[index]].SortOrder = index;
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Results.NoContent();
    }

    // ---------- Remove ----------

    private static async Task<IResult> RemoveAsync(
        Guid universeId,
        Guid entityId,
        Guid appearanceId,
        Guid imageId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var image = await db.EntityAppearanceImages
            .Where(candidate => candidate.Id == imageId
                && candidate.EntityAppearanceId == appearanceId
                && candidate.Appearance!.EntityId == entityId
                && candidate.Appearance.Entity!.UniverseId == universeId)
            .FirstOrDefaultAsync(cancellationToken);

        if (image is null)
        {
            // Gone already is what was asked for.
            return Results.NoContent();
        }

        // An entry in the Trash keeps its pictures until it is erased or brought back; saying "gone" here would be untrue.
        if (await db.Entities.AnyAsync(entity => entity.Id == entityId && entity.DeletedAt != null, cancellationToken))
        {
            return Results.Problem(
                title: "Entry is in the Trash",
                detail: "Restore the entry from the Trash to change its pictures.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var keys = new[] { image.OriginalKey, image.ThumbnailKey };
        db.EntityAppearanceImages.Remove(image);
        await db.SaveChangesAsync(cancellationToken);

        // Only past the commit: the row stopped naming the objects first.
        await SweepAsync(store, loggerFactory.CreateLogger(LoggerName), keys);
        return Results.NoContent();
    }

    // ---------- Read ----------

    /// <summary>
    /// Streams one picture to a member. Every id in the route is checked against the rows, so an address stops resolving the
    /// moment its picture is removed. A trashed entry's pictures stay readable, as its own picture does.
    /// </summary>
    private static async Task<IResult> ReadAsync(
        Guid universeId,
        Guid entityId,
        Guid appearanceId,
        Guid imageId,
        bool thumbnail,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var image = await db.EntityAppearanceImages.AsNoTracking()
            .Where(candidate => candidate.Id == imageId
                && candidate.EntityAppearanceId == appearanceId
                && candidate.Appearance!.EntityId == entityId
                && candidate.Appearance.Entity!.UniverseId == universeId)
            .Select(candidate => new { candidate.OriginalKey, candidate.ThumbnailKey, candidate.ContentType })
            .FirstOrDefaultAsync(cancellationToken);

        if (image is null)
        {
            return Results.NotFound();
        }

        StoredMediaObject? stored;
        try
        {
            stored = await store.GetAsync(thumbnail ? image.ThumbnailKey : image.OriginalKey, cancellationToken);
        }
        catch (MediaStorageException exception)
        {
            if (exception is MediaStorageFailedException)
            {
                LogStorageFailure(loggerFactory.CreateLogger(LoggerName), "read", appearanceId, exception);
            }

            return Unavailable(exception);
        }

        if (stored is null)
        {
            return Results.NotFound();
        }

        // Private and immutable: the picture's id is in the path and never reused.
        context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        context.Response.Headers.XContentTypeOptions = "nosniff";

        return Results.Stream(stored.Content, thumbnail ? "image/webp" : image.ContentType, enableRangeProcessing: false);
    }

    // ---------- Shared ----------

    internal static Task SweepAsync(IMediaObjectStore store, ILogger logger, params string[] keys) =>
        MediaObjectWrites.SweepAsync(store, logger, LogOrphanedObject, keys);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Orphaned media object left behind at '{ObjectKey}'. Nothing references it and it is safe to delete.")]
    private static partial void LogOrphanedObject(ILogger logger, string objectKey, Exception exception);

    [LoggerMessage(
        Level = LogLevel.Error,
        Message = "Image storage failed during {Operation} for appearance {AppearanceId}. Nothing was changed.")]
    private static partial void LogStorageFailure(ILogger logger, string operation, Guid appearanceId, Exception exception);

    private static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    private static IResult Unavailable(MediaStorageException exception) =>
        Results.Problem(
            title: "Image storage is unavailable.",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);

    private static string? FileNameLabel(string? fileName)
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
