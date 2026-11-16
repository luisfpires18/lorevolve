using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Storage;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// The picture of one image field on one entry (Issue #238): set it, crop it again, read it, remove it. The entry picture's
/// pipeline throughout (<see cref="EntityImageEndpoints"/>, ADR 0019, ADR 0042): the server decides what is an image and cuts
/// the crop to the field's <see cref="FieldImageShape"/>, objects are written under new ids before the row names them, growth
/// is held against the universe owner's storage first, and superseded objects are swept only after the commit. Serves Lore and
/// project entries alike: both are <see cref="LoreEntity"/> rows on the same field engine. Not versioned: a revision holds no
/// field picture and a revision restore leaves them alone.
/// </summary>
public static partial class EntityFieldImageEndpoints
{
    private const long RequestBodyCeiling = ImagePreparation.MaxUploadBytes * 2;

    private const int InMemoryBodyThreshold = (int)ImagePreparation.MaxUploadBytes + 64 * 1024;

    private const string LoggerName = "LorEvolve.EntityFieldImages";

    public static IEndpointRouteBuilder MapEntityFieldImageEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/entities/{entityId:guid}/field-images/{fieldId:guid}")
            .WithTags("Entity field images")
            .RequireAuthorization();

        // PUT for the reasons the entry picture's upload gives: a cross-site form cannot send it.
        group.MapPut("/", UploadAsync)
            .WithName("SetEntityFieldImage")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling))
            .WithMetadata(new RequestFormLimitsAttribute { MemoryBufferThreshold = InMemoryBodyThreshold });

        group.MapPut("/crop", RecropAsync).WithName("SetEntityFieldImageCrop");
        group.MapDelete("/", RemoveAsync).WithName("RemoveEntityFieldImage");

        group.MapGet("/{assetId:guid}/original", (Guid universeId, Guid entityId, Guid fieldId, Guid assetId, ClaimsPrincipal principal,
                LorEvolveDbContext db, IMediaObjectStore store, ILoggerFactory loggerFactory, HttpContext context, CancellationToken cancellationToken) =>
            ReadAsync(universeId, entityId, fieldId, assetId, cropId: null, principal, db, store, loggerFactory, context, cancellationToken))
            .WithName("ReadEntityFieldImageOriginal");
        group.MapGet("/{assetId:guid}/crop/{cropId:guid}", (Guid universeId, Guid entityId, Guid fieldId, Guid assetId, Guid cropId, ClaimsPrincipal principal,
                LorEvolveDbContext db, IMediaObjectStore store, ILoggerFactory loggerFactory, HttpContext context, CancellationToken cancellationToken) =>
            ReadAsync(universeId, entityId, fieldId, assetId, cropId, principal, db, store, loggerFactory, context, cancellationToken))
            .WithName("ReadEntityFieldImageCrop");

        return endpoints;
    }

    /// <summary>The frame a field's shape cuts its picture to. A field with no shape recorded is free.</summary>
    internal static ImageFrame FrameFor(FieldImageShape? shape) => shape switch
    {
        FieldImageShape.Square => ImageFrame.FieldSquare,
        FieldImageShape.FourByThree => ImageFrame.FieldFourByThree,
        FieldImageShape.SixteenByNine => ImageFrame.FieldSixteenByNine,
        _ => ImageFrame.FieldFree,
    };

    /// <summary>
    /// When an entry changes type, the pictures in fields its new type does not have (by the same lineage values use,
    /// inherited fields included) are deleted with the rest of the save, and their keys are noted on the context for the
    /// route to sweep once that save has committed (<see cref="SweepDroppedAsync"/>). Archived fields of the new lineage keep
    /// their pictures, as they keep their values.
    /// </summary>
    internal static async Task DropInapplicableAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid entityId,
        Guid typeId,
        Guid? projectId,
        CancellationToken cancellationToken)
    {
        var lineage = await EntityEndpoints.FieldLineageAsync(db, universeId, typeId, cancellationToken, projectId);
        var gone = db.EntityFieldImages
            .Where(image => image.EntityId == entityId && !lineage.Contains(image.FieldDefinition!.EntityTypeId));

        var keys = await gone.Select(image => new { image.OriginalKey, image.CropKey }).ToListAsync(cancellationToken);
        if (keys.Count == 0)
        {
            return;
        }

        await gone.ExecuteDeleteAsync(cancellationToken);
        db.DroppedFieldImageKeys.AddRange(keys.SelectMany(key => new[] { key.OriginalKey, key.CropKey }));
    }

    /// <summary>
    /// Sweeps the keys this request's saves dropped (<see cref="DropInapplicableAsync"/>), called by a route after its commit,
    /// whichever path the save took: an entry edit, a restored version, an accepted suggestion, an approved AI change. A save
    /// that rolled back names its pictures again, so any key still named is kept: only what nothing names is deleted.
    /// </summary>
    internal static async Task SweepDroppedAsync(
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (db.DroppedFieldImageKeys.Count == 0)
        {
            return;
        }

        var dropped = db.DroppedFieldImageKeys.Distinct(StringComparer.Ordinal).ToList();
        db.DroppedFieldImageKeys.Clear();

        var named = (await db.EntityFieldImages.AsNoTracking()
                .Where(image => dropped.Contains(image.OriginalKey) || dropped.Contains(image.CropKey))
                .Select(image => new { image.OriginalKey, image.CropKey })
                .ToListAsync(cancellationToken))
            .SelectMany(key => new[] { key.OriginalKey, key.CropKey })
            .ToHashSet(StringComparer.Ordinal);

        await SweepAsync(store, loggerFactory, dropped.Where(key => !named.Contains(key)));
    }

    /// <summary>Deletes every picture of a field that is being deleted and answers their keys, to sweep after the commit.</summary>
    internal static async Task<string[]> DropFieldAsync(LorEvolveDbContext db, Guid fieldId, CancellationToken cancellationToken)
    {
        var pictures = db.EntityFieldImages.Where(image => image.FieldDefinitionId == fieldId);
        var keys = await pictures.Select(image => new { image.OriginalKey, image.CropKey }).ToListAsync(cancellationToken);
        if (keys.Count == 0)
        {
            return [];
        }

        await pictures.ExecuteDeleteAsync(cancellationToken);
        return [.. keys.SelectMany(key => new[] { key.OriginalKey, key.CropKey })];
    }

    /// <summary>Best-effort sweep of objects nothing names any more (ADR 0019), always after the commit that stopped naming them.</summary>
    internal static Task SweepAsync(IMediaObjectStore store, ILoggerFactory loggerFactory, IEnumerable<string> keys) =>
        EntityImageEndpoints.SweepAsync(store, loggerFactory.CreateLogger(LoggerName), [.. keys]);

    /// <summary>A live entry of this universe (Lore or project) and an unarchived Image field that applies to its type.</summary>
    private sealed record Target(string OwnerId, ImageFrame Frame);

    /// <summary>
    /// The entry and the field a write names, or null for anything else - another universe's ids, an entry in the Trash, a
    /// field of another type, of another kind or archived - so a 404 discloses nothing. Inherited fields count, as for values.
    /// </summary>
    private static async Task<Target?> FindTargetAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid entityId,
        Guid fieldId,
        CancellationToken cancellationToken)
    {
        // IgnoreQueryFilters with the scope named, as the entry read does: a project's entry is filtered out of db.Entities.
        var entry = await db.Entities.AsNoTracking().IgnoreQueryFilters()
            .Where(candidate => candidate.Id == entityId
                && candidate.UniverseId == universeId
                && candidate.DeletedAt == null)
            .Select(candidate => new { candidate.EntityTypeId, candidate.ProjectId, candidate.Universe!.OwnerId })
            .FirstOrDefaultAsync(cancellationToken);

        if (entry is null)
        {
            return null;
        }

        var lineage = await EntityEndpoints.FieldLineageAsync(db, universeId, entry.EntityTypeId, cancellationToken, entry.ProjectId);

        var field = await db.EntityFieldDefinitions.AsNoTracking().IgnoreQueryFilters()
            .Where(candidate => candidate.Id == fieldId
                && lineage.Contains(candidate.EntityTypeId)
                && candidate.EntityType!.UniverseId == universeId
                && candidate.EntityType.ProjectId == entry.ProjectId
                && candidate.Kind == EntityFieldKind.Image
                && candidate.ArchivedAt == null)
            .Select(candidate => new { candidate.ImageShape })
            .FirstOrDefaultAsync(cancellationToken);

        return field is null ? null : new Target(entry.OwnerId, FrameFor(field.ImageShape));
    }

    // ---------- Upload and replace ----------

    /// <summary>
    /// Stores a new picture and points the field at it, in <see cref="EntityImageEndpoints"/>' order: both objects under a new
    /// asset id first, then the row, then the superseded pair is swept. <paramref name="crop"/> is the frame the author chose,
    /// JSON in its own form field; without one the crop is the largest centred frame of the field's shape (free: the whole picture).
    /// </summary>
    private static async Task<IResult> UploadAsync(
        Guid universeId,
        Guid entityId,
        Guid fieldId,
        IFormFile? file,
        [FromForm(Name = "crop")] string? crop,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        TimeProvider clock,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await FindTargetAsync(db, universeId, entityId, fieldId, cancellationToken) is not { } target)
        {
            return Results.NotFound();
        }

        if (file is null || file.Length == 0)
        {
            return EntityImageEndpoints.Invalid(ImagePreparation.FileField, "Choose an image to upload.");
        }

        EntityImageCrop? requestedCrop = null;
        if (!string.IsNullOrWhiteSpace(crop))
        {
            requestedCrop = EntityImageEndpoints.ReadCrop(crop);

            if (requestedCrop is null)
            {
                return EntityImageEndpoints.Invalid(ImagePreparation.CropField, "The image selection could not be read.");
            }
        }

        await using var upload = file.OpenReadStream();
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, requestedCrop?.ToShared(), target.Frame, cancellationToken);

        if (prepared is null)
        {
            return EntityImageEndpoints.Invalid(rejection!.Field, rejection.Message);
        }

        var logger = loggerFactory.CreateLogger(LoggerName);

        var existing = await db.EntityFieldImages
            .FirstOrDefaultAsync(image => image.EntityId == entityId && image.FieldDefinitionId == fieldId, cancellationToken);

        var replacedAssetId = existing?.AssetId;

        // Only growth is held, measured from the bytes received less the original this one replaces (ADR 0042).
        var growth = bytes.Length - (existing?.ByteSize ?? 0);
        StorageHold? hold = null;

        if (growth > 0)
        {
            hold = await AccountStorage.ReserveAsync(db, clock, target.OwnerId, growth, cancellationToken);

            if (hold is null)
            {
                return StorageQuota.Exceeded(isOwner: target.OwnerId == principal.RequireUserId());
            }
        }

        var committed = false;
        try
        {
            var assetId = Guid.NewGuid();
            var cropId = Guid.NewGuid();
            var originalKey = EntityFieldImageKeys.Original(universeId, entityId, fieldId, assetId, prepared.Extension);
            var cropKey = EntityFieldImageKeys.Crop(universeId, entityId, fieldId, assetId, cropId);

            try
            {
                bytes.Position = 0;
                using var cropped = new MemoryStream(prepared.Thumbnail, writable: false);

                await MediaObjectWrites.PutAllAsync(
                    store,
                    cancellationToken,
                    new PendingMediaObject(originalKey, bytes, prepared.ContentType),
                    new PendingMediaObject(cropKey, cropped, "image/webp"));
            }
            catch (MediaStorageUnavailableException exception)
            {
                return EntityImageEndpoints.Unavailable(exception);
            }
            catch (MediaStorageFailedException exception)
            {
                LogStorageFailure(logger, "upload", entityId, exception);
                await EntityImageEndpoints.SweepAsync(store, logger, originalKey, cropKey);
                return EntityImageEndpoints.Unavailable(exception);
            }
            catch (Exception)
            {
                await EntityImageEndpoints.SweepAsync(store, logger, originalKey, cropKey);
                throw;
            }

            var stored = existing ?? new EntityFieldImage
            {
                EntityId = entityId,
                FieldDefinitionId = fieldId,
                OriginalKey = originalKey,
                CropKey = cropKey,
                ContentType = prepared.ContentType,
            };

            string? supersededOriginal = null;
            string? supersededCrop = null;
            var entryGone = false;

            try
            {
                await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

                // Under the writer lock: the entry must still be live and the field must still hold the picture this upload
                // was measured against, or a concurrent write wins and this one keeps nothing.
                var live = await db.Entities.IgnoreQueryFilters().AnyAsync(
                    candidate => candidate.Id == entityId && candidate.UniverseId == universeId && candidate.DeletedAt == null,
                    cancellationToken);
                var current = live
                    ? await db.EntityFieldImages.AsNoTracking()
                        .Where(image => image.EntityId == entityId && image.FieldDefinitionId == fieldId)
                        .Select(image => new { image.AssetId, image.OriginalKey, image.CropKey })
                        .FirstOrDefaultAsync(cancellationToken)
                    : null;

                // A picture that changed meanwhile leaves this one uncommitted: the concurrent write wins.
                entryGone = !live;
                if (live && current?.AssetId == replacedAssetId)
                {
                    supersededOriginal = current?.OriginalKey;
                    supersededCrop = current?.CropKey;

                    await AccountStorage.ConsumeAsync(db, clock, hold, cancellationToken);

                    stored.AssetId = assetId;
                    stored.CropId = cropId;
                    stored.OriginalKey = originalKey;
                    stored.CropKey = cropKey;
                    stored.ContentType = prepared.ContentType;
                    stored.FileName = EntityImageEndpoints.TrimFileName(file.FileName);
                    stored.Width = prepared.Width;
                    stored.Height = prepared.Height;
                    stored.ByteSize = bytes.Length;
                    stored.UploadedAt = DateTime.UtcNow;
                    SetCrop(stored, prepared.Crop);

                    if (existing is null)
                    {
                        db.EntityFieldImages.Add(stored);
                    }

                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    committed = true;
                }
            }
            catch (StorageQuotaExceededException)
            {
                await EntityImageEndpoints.SweepAsync(store, logger, originalKey, cropKey);
                return StorageQuota.Exceeded(isOwner: target.OwnerId == principal.RequireUserId());
            }
            catch (Exception)
            {
                await EntityImageEndpoints.SweepAsync(store, logger, originalKey, cropKey);
                throw;
            }

            if (!committed)
            {
                await EntityImageEndpoints.SweepAsync(store, logger, originalKey, cropKey);
                return entryGone ? Results.NotFound() : EntityImageEndpoints.ReplacedMeanwhile();
            }

            // Past the commit: the new picture stands whatever happens next.
            await EntityImageEndpoints.SweepAsync(store, logger, supersededOriginal, supersededCrop);

            return Results.Ok(FieldImageRef.Of(stored));
        }
        finally
        {
            if (!committed)
            {
                await AccountStorage.ReleaseAsync(db, hold, logger);
            }
        }
    }

    // ---------- Crop again ----------

    /// <summary>
    /// Cuts a new crop from the stored original, to the field's shape as it is now. The original is never rewritten; the new
    /// crop is written under a new id, the row moves only if it still names the asset and crop that were read, and the old
    /// crop is swept after the commit.
    /// </summary>
    private static async Task<IResult> RecropAsync(
        Guid universeId,
        Guid entityId,
        Guid fieldId,
        FieldImageCropRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await FindTargetAsync(db, universeId, entityId, fieldId, cancellationToken) is not { } target)
        {
            return Results.NotFound();
        }

        var image = await db.EntityFieldImages.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.EntityId == entityId && candidate.FieldDefinitionId == fieldId, cancellationToken);

        if (image is null)
        {
            return Results.NotFound();
        }

        if (request.Crop is null)
        {
            return EntityImageEndpoints.Invalid(ImagePreparation.CropField, "Choose the part of the image to show.");
        }

        if (ImagePreparation.CheckCrop(request.Crop.ToShared(), target.Frame) is { } badCrop)
        {
            return EntityImageEndpoints.Invalid(ImagePreparation.CropField, badCrop);
        }

        if (request.AssetId != image.AssetId)
        {
            return EntityImageEndpoints.Changed();
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

                return EntityImageEndpoints.OriginalUnavailable();
            }

            await using (original)
            {
                await original.Content.CopyToAsync(bytes, cancellationToken);
            }
        }
        catch (MediaStorageUnavailableException exception)
        {
            return EntityImageEndpoints.Unavailable(exception);
        }
        catch (Exception exception) when (exception is MediaStorageFailedException or IOException or HttpRequestException)
        {
            LogStorageFailure(logger, "recrop", entityId, exception);
            return EntityImageEndpoints.Unavailable(exception as MediaStorageException
                ?? new MediaStorageFailedException("Image storage could not complete the request.", exception));
        }

        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, request.Crop.ToShared(), target.Frame, cancellationToken);

        if (prepared is null)
        {
            return rejection!.Field == ImagePreparation.CropField
                ? EntityImageEndpoints.Invalid(ImagePreparation.CropField, rejection.Message)
                : EntityImageEndpoints.OriginalUnavailable();
        }

        var cropId = Guid.NewGuid();
        var cropKey = EntityFieldImageKeys.Crop(universeId, entityId, fieldId, image.AssetId, cropId);

        try
        {
            using var cropped = new MemoryStream(prepared.Thumbnail, writable: false);
            await store.PutAsync(cropKey, cropped, "image/webp", cancellationToken);
        }
        catch (MediaStorageUnavailableException exception)
        {
            return EntityImageEndpoints.Unavailable(exception);
        }
        catch (MediaStorageFailedException exception)
        {
            LogStorageFailure(logger, "recrop", entityId, exception);
            await EntityImageEndpoints.SweepAsync(store, logger, cropKey);
            return EntityImageEndpoints.Unavailable(exception);
        }
        catch (Exception)
        {
            await EntityImageEndpoints.SweepAsync(store, logger, cropKey);
            throw;
        }

        int moved;
        try
        {
            // One conditional statement: the check that the picture and crop are still the ones read and the move cannot be
            // separated by another write.
            moved = await db.EntityFieldImages
                .Where(candidate => candidate.EntityId == entityId
                    && candidate.FieldDefinitionId == fieldId
                    && candidate.AssetId == image.AssetId
                    && candidate.CropId == image.CropId)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(candidate => candidate.CropId, cropId)
                        .SetProperty(candidate => candidate.CropKey, cropKey)
                        .SetProperty(candidate => candidate.CropX, prepared.Crop.X)
                        .SetProperty(candidate => candidate.CropY, prepared.Crop.Y)
                        .SetProperty(candidate => candidate.CropWidth, prepared.Crop.Width)
                        .SetProperty(candidate => candidate.CropHeight, prepared.Crop.Height)
                        .SetProperty(candidate => candidate.Width, prepared.Width)
                        .SetProperty(candidate => candidate.Height, prepared.Height),
                    cancellationToken);
        }
        catch (Exception)
        {
            await EntityImageEndpoints.SweepAsync(store, logger, cropKey);
            throw;
        }

        if (moved == 0)
        {
            await EntityImageEndpoints.SweepAsync(store, logger, cropKey);
            return EntityImageEndpoints.Changed();
        }

        await EntityImageEndpoints.SweepAsync(store, logger, image.CropKey);

        image.CropId = cropId;
        image.CropKey = cropKey;
        image.Width = prepared.Width;
        image.Height = prepared.Height;
        SetCrop(image, prepared.Crop);

        return Results.Ok(FieldImageRef.Of(image));
    }

    // ---------- Remove ----------

    /// <summary>Clears the row, then sweeps its objects. Nothing to remove answers 204, as the entry picture's does.</summary>
    private static async Task<IResult> RemoveAsync(
        Guid universeId,
        Guid entityId,
        Guid fieldId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await FindTargetAsync(db, universeId, entityId, fieldId, cancellationToken) is null)
        {
            return Results.NotFound();
        }

        var image = await db.EntityFieldImages
            .FirstOrDefaultAsync(candidate => candidate.EntityId == entityId && candidate.FieldDefinitionId == fieldId, cancellationToken);

        if (image is null)
        {
            return Results.NoContent();
        }

        db.EntityFieldImages.Remove(image);
        await db.SaveChangesAsync(cancellationToken);

        await EntityImageEndpoints.SweepAsync(store, loggerFactory.CreateLogger(LoggerName), image.OriginalKey, image.CropKey);

        return Results.NoContent();
    }

    // ---------- Read ----------

    /// <summary>
    /// Streams the original when <paramref name="cropId"/> is null, otherwise that crop. Every id in the route is checked against
    /// the row, so a URL stops resolving the moment its picture is replaced or recropped. Members read; a trashed entry's picture
    /// stays readable, as the entry picture's does.
    /// </summary>
    private static async Task<IResult> ReadAsync(
        Guid universeId,
        Guid entityId,
        Guid fieldId,
        Guid assetId,
        Guid? cropId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        // The entry filter is lifted so a project's entry is found too, with the universe named.
        var image = await db.EntityFieldImages.AsNoTracking().IgnoreQueryFilters()
            .Where(candidate => candidate.EntityId == entityId
                && candidate.FieldDefinitionId == fieldId
                && candidate.AssetId == assetId
                && candidate.Entity!.UniverseId == universeId)
            .Select(candidate => new { candidate.OriginalKey, candidate.CropId, candidate.CropKey, candidate.ContentType })
            .FirstOrDefaultAsync(cancellationToken);

        if (image is null || (cropId is not null && cropId != image.CropId))
        {
            return Results.NotFound();
        }

        StoredMediaObject? stored;
        try
        {
            stored = await store.GetAsync(cropId is null ? image.OriginalKey : image.CropKey, cancellationToken);
        }
        catch (MediaStorageException exception)
        {
            if (exception is MediaStorageFailedException)
            {
                LogStorageFailure(loggerFactory.CreateLogger(LoggerName), "read", entityId, exception);
            }

            return EntityImageEndpoints.Unavailable(exception);
        }

        if (stored is null)
        {
            return Results.NotFound();
        }

        // Content-addressed, so cacheable for long and private (ADR 0017, ADR 0019).
        context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        context.Response.Headers.XContentTypeOptions = "nosniff";

        return Results.Stream(stored.Content, cropId is null ? image.ContentType : "image/webp", enableRangeProcessing: false);
    }

    private static void SetCrop(EntityFieldImage image, ImageCrop crop)
    {
        image.CropX = crop.X;
        image.CropY = crop.Y;
        image.CropWidth = crop.Width;
        image.CropHeight = crop.Height;
    }

    [LoggerMessage(
        Level = LogLevel.Error,
        Message = "Image storage failed during {Operation} for a field picture of entry {EntityId}. Nothing was changed.")]
    private static partial void LogStorageFailure(ILogger logger, string operation, Guid entityId, Exception exception);
}
