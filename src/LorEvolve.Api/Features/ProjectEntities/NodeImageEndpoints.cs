using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Storage;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Features.ProjectEntities.ProjectEntityTypeEndpoints;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// The one picture of a comic page or panel (#295): set it, crop it again, read it, remove it. The image field's pipeline
/// (<see cref="EntityFieldImageEndpoints"/>) step for step: objects under new ids before the row names them, growth held
/// against the universe owner's storage first, superseded objects swept after the commit. The frame is free. Access is the
/// project's. Not versioned: a picture change never bumps the node's edit version.
/// </summary>
public static partial class NodeImageEndpoints
{
    private const long RequestBodyCeiling = ImagePreparation.MaxUploadBytes * 2;

    private const int InMemoryBodyThreshold = (int)ImagePreparation.MaxUploadBytes + 64 * 1024;

    internal const string LoggerName = "LorEvolve.ProjectNodeImages";

    public static IEndpointRouteBuilder MapNodeImageEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/projects/{projectId:guid}/structure/{nodeId:guid}/image")
            .WithTags("Project structure")
            .RequireAuthorization();

        group.MapPut("/", UploadAsync)
            .WithName("SetProjectNodeImage")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling))
            .WithMetadata(new RequestFormLimitsAttribute { MemoryBufferThreshold = InMemoryBodyThreshold });

        group.MapPut("/crop", RecropAsync).WithName("SetProjectNodeImageCrop");
        group.MapDelete("/", RemoveAsync).WithName("RemoveProjectNodeImage");

        group.MapGet("/{assetId:guid}/original", (Guid projectId, Guid nodeId, Guid assetId, ClaimsPrincipal principal,
                LorEvolveDbContext db, IMediaObjectStore store, ILoggerFactory loggerFactory, HttpContext context, CancellationToken cancellationToken) =>
            ReadAsync(projectId, nodeId, assetId, cropId: null, principal, db, store, loggerFactory, context, cancellationToken))
            .WithName("ReadProjectNodeImageOriginal");
        group.MapGet("/{assetId:guid}/crop/{cropId:guid}", (Guid projectId, Guid nodeId, Guid assetId, Guid cropId, ClaimsPrincipal principal,
                LorEvolveDbContext db, IMediaObjectStore store, ILoggerFactory loggerFactory, HttpContext context, CancellationToken cancellationToken) =>
            ReadAsync(projectId, nodeId, assetId, cropId, principal, db, store, loggerFactory, context, cancellationToken))
            .WithName("ReadProjectNodeImageCrop");

        return endpoints;
    }

    /// <summary>The universe and its owner (who is charged), for a node of this project that may hold a picture.</summary>
    private sealed record Target(Guid UniverseId, string OwnerId);

    /// <summary>
    /// The caller's access, then the node: 404 without read access, 403 without change access, 404 for a project with no
    /// rule-backed format or a node of another project, 400 on <c>level</c> for a node that is not a page or a panel.
    /// </summary>
    private static async Task<(Target? Target, IResult? Denied)> FindTargetAsync(
        LorEvolveDbContext db,
        Guid projectId,
        Guid nodeId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);
        if (denied is not null)
        {
            return (null, denied);
        }

        if (StructureEndpoints.RulesOf(project!) is null)
        {
            return (null, Results.NotFound());
        }

        var level = await db.ProjectNodes.AsNoTracking()
            .Where(node => node.Id == nodeId && node.ProjectId == projectId)
            .Select(node => node.Level)
            .FirstOrDefaultAsync(cancellationToken);

        if (level is null)
        {
            return (null, Results.NotFound());
        }

        if (!StructureLimits.ArtLevels.Contains(level))
        {
            return (null, Problems.Field("level", "Only pages and panels hold artwork."));
        }

        var ownerId = await db.Universes.AsNoTracking()
            .Where(universe => universe.Id == project!.UniverseId)
            .Select(universe => universe.OwnerId)
            .FirstAsync(cancellationToken);

        return (new Target(project!.UniverseId, ownerId), null);
    }

    /// <summary>The node is still there, inside the writer lock.</summary>
    private static Task<bool> NodeLiveAsync(LorEvolveDbContext db, Guid projectId, Guid nodeId, CancellationToken cancellationToken) =>
        db.ProjectNodes.AnyAsync(node => node.Id == nodeId && node.ProjectId == projectId, cancellationToken);

    // ---------- Upload and replace ----------

    private static async Task<IResult> UploadAsync(
        Guid projectId,
        Guid nodeId,
        IFormFile? file,
        [FromForm(Name = "crop")] string? crop,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        TimeProvider clock,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var (target, denied) = await FindTargetAsync(db, projectId, nodeId, principal, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        if (file is null || file.Length == 0)
        {
            return Problems.Field(ImagePreparation.FileField, "Choose an image to upload.");
        }

        ImageCrop? requestedCrop = null;
        if (!string.IsNullOrWhiteSpace(crop))
        {
            requestedCrop = ImagePreparation.ReadCrop(crop);

            if (requestedCrop is null)
            {
                return Problems.Field(ImagePreparation.CropField, "The image selection could not be read.");
            }
        }

        await using var upload = file.OpenReadStream();
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, requestedCrop, ImageFrame.FieldFree, cancellationToken);

        if (prepared is null)
        {
            return Problems.Field(rejection!.Field, rejection.Message);
        }

        var logger = loggerFactory.CreateLogger(LoggerName);

        var existing = await db.ProjectNodeImages.FirstOrDefaultAsync(image => image.NodeId == nodeId, cancellationToken);
        var replacedAssetId = existing?.AssetId;

        // Only growth is held, measured from the bytes received less the original this one replaces (ADR 0042).
        var growth = bytes.Length - (existing?.ByteSize ?? 0);
        StorageHold? hold = null;

        if (growth > 0)
        {
            hold = await AccountStorage.ReserveAsync(db, clock, target!.OwnerId, growth, cancellationToken);

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
            var originalKey = ProjectNodeImageKeys.Original(target!.UniverseId, projectId, nodeId, assetId, prepared.Extension);
            var cropKey = ProjectNodeImageKeys.Crop(target.UniverseId, projectId, nodeId, assetId, cropId);

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
                return MediaProblem.Unavailable(exception);
            }
            catch (MediaStorageFailedException exception)
            {
                LogStorageFailure(logger, "upload", nodeId, exception);
                await MediaObjectWrites.SweepAsync(store, logger, originalKey, cropKey);
                return MediaProblem.Unavailable(exception);
            }
            catch (Exception)
            {
                await MediaObjectWrites.SweepAsync(store, logger, originalKey, cropKey);
                throw;
            }

            var stored = existing ?? new ProjectNodeImage
            {
                NodeId = nodeId,
                OriginalKey = originalKey,
                CropKey = cropKey,
                ContentType = prepared.ContentType,
            };

            string? supersededOriginal = null;
            string? supersededCrop = null;
            var nodeGone = false;

            try
            {
                await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

                // Under the writer lock: the node must still exist and still hold the picture this upload was measured
                // against, or a concurrent write wins and this one keeps nothing.
                var live = await NodeLiveAsync(db, projectId, nodeId, cancellationToken);
                var current = live
                    ? await db.ProjectNodeImages.AsNoTracking()
                        .Where(image => image.NodeId == nodeId)
                        .Select(image => new { image.AssetId, image.OriginalKey, image.CropKey })
                        .FirstOrDefaultAsync(cancellationToken)
                    : null;

                nodeGone = !live;
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
                    stored.FileName = ImagePreparation.TrimFileName(file.FileName);
                    stored.Width = prepared.Width;
                    stored.Height = prepared.Height;
                    stored.ByteSize = bytes.Length;
                    stored.UploadedAt = DateTime.UtcNow;
                    (stored.CropX, stored.CropY, stored.CropWidth, stored.CropHeight) =
                        (prepared.Crop.X, prepared.Crop.Y, prepared.Crop.Width, prepared.Crop.Height);

                    if (existing is null)
                    {
                        db.ProjectNodeImages.Add(stored);
                    }

                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    committed = true;
                }
            }
            catch (StorageQuotaExceededException)
            {
                await MediaObjectWrites.SweepAsync(store, logger, originalKey, cropKey);
                return StorageQuota.Exceeded(isOwner: target.OwnerId == principal.RequireUserId());
            }
            catch (Exception)
            {
                await MediaObjectWrites.SweepAsync(store, logger, originalKey, cropKey);
                throw;
            }

            if (!committed)
            {
                await MediaObjectWrites.SweepAsync(store, logger, originalKey, cropKey);
                return nodeGone ? Results.NotFound() : EntityImageEndpoints.ReplacedMeanwhile();
            }

            await MediaObjectWrites.SweepAsync(store, logger, supersededOriginal, supersededCrop);

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

    private static async Task<IResult> RecropAsync(
        Guid projectId,
        Guid nodeId,
        FieldImageCropRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var (target, denied) = await FindTargetAsync(db, projectId, nodeId, principal, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var image = await db.ProjectNodeImages.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.NodeId == nodeId, cancellationToken);

        if (image is null)
        {
            return Results.NotFound();
        }

        if (request.Crop is null)
        {
            return Problems.Field(ImagePreparation.CropField, "Choose the part of the image to show.");
        }

        if (ImagePreparation.CheckCrop(request.Crop.ToShared(), ImageFrame.FieldFree) is { } badCrop)
        {
            return Problems.Field(ImagePreparation.CropField, badCrop);
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
            return MediaProblem.Unavailable(exception);
        }
        catch (Exception exception) when (exception is MediaStorageFailedException or IOException or HttpRequestException)
        {
            LogStorageFailure(logger, "recrop", nodeId, exception);
            return MediaProblem.Unavailable(exception as MediaStorageException
                ?? new MediaStorageFailedException("Image storage could not complete the request.", exception));
        }

        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, request.Crop.ToShared(), ImageFrame.FieldFree, cancellationToken);

        if (prepared is null)
        {
            return rejection!.Field == ImagePreparation.CropField
                ? Problems.Field(ImagePreparation.CropField, rejection.Message)
                : EntityImageEndpoints.OriginalUnavailable();
        }

        var cropId = Guid.NewGuid();
        var cropKey = ProjectNodeImageKeys.Crop(target!.UniverseId, projectId, nodeId, image.AssetId, cropId);

        try
        {
            using var cropped = new MemoryStream(prepared.Thumbnail, writable: false);
            await store.PutAsync(cropKey, cropped, "image/webp", cancellationToken);
        }
        catch (MediaStorageUnavailableException exception)
        {
            return MediaProblem.Unavailable(exception);
        }
        catch (MediaStorageFailedException exception)
        {
            LogStorageFailure(logger, "recrop", nodeId, exception);
            await MediaObjectWrites.SweepAsync(store, logger, cropKey);
            return MediaProblem.Unavailable(exception);
        }
        catch (Exception)
        {
            await MediaObjectWrites.SweepAsync(store, logger, cropKey);
            throw;
        }

        int moved;
        try
        {
            moved = await db.ProjectNodeImages
                .Where(candidate => candidate.NodeId == nodeId
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
            await MediaObjectWrites.SweepAsync(store, logger, cropKey);
            throw;
        }

        if (moved == 0)
        {
            await MediaObjectWrites.SweepAsync(store, logger, cropKey);
            return EntityImageEndpoints.Changed();
        }

        await MediaObjectWrites.SweepAsync(store, logger, image.CropKey);

        image.CropId = cropId;
        image.CropKey = cropKey;
        image.Width = prepared.Width;
        image.Height = prepared.Height;
        (image.CropX, image.CropY, image.CropWidth, image.CropHeight) =
            (prepared.Crop.X, prepared.Crop.Y, prepared.Crop.Width, prepared.Crop.Height);

        return Results.Ok(FieldImageRef.Of(image));
    }

    // ---------- Remove ----------

    /// <summary>Clears the row, then sweeps its objects. The node and its script stay. Nothing to remove answers 204.</summary>
    private static async Task<IResult> RemoveAsync(
        Guid projectId,
        Guid nodeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await FindTargetAsync(db, projectId, nodeId, principal, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var image = await db.ProjectNodeImages.FirstOrDefaultAsync(candidate => candidate.NodeId == nodeId, cancellationToken);

        if (image is null)
        {
            return Results.NoContent();
        }

        db.ProjectNodeImages.Remove(image);
        await db.SaveChangesAsync(cancellationToken);

        await MediaObjectWrites.SweepAsync(store, loggerFactory.CreateLogger(LoggerName), image.OriginalKey, image.CropKey);

        return Results.NoContent();
    }

    // ---------- Read ----------

    /// <summary>The original when <paramref name="cropId"/> is null, otherwise that crop; every id is checked against the row.</summary>
    private static async Task<IResult> ReadAsync(
        Guid projectId,
        Guid nodeId,
        Guid assetId,
        Guid? cropId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await ReadableAsync(db, projectId, principal, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var image = await db.ProjectNodeImages.AsNoTracking()
            .Where(candidate => candidate.NodeId == nodeId
                && candidate.AssetId == assetId
                && candidate.Node!.ProjectId == projectId)
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
                LogStorageFailure(loggerFactory.CreateLogger(LoggerName), "read", nodeId, exception);
            }

            return MediaProblem.Unavailable(exception);
        }

        if (stored is null)
        {
            return Results.NotFound();
        }

        context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        context.Response.Headers.XContentTypeOptions = "nosniff";

        return Results.Stream(stored.Content, cropId is null ? image.ContentType : "image/webp", enableRangeProcessing: false);
    }

    [LoggerMessage(
        Level = LogLevel.Error,
        Message = "Image storage failed during {Operation} for the picture of project node {NodeId}. Nothing was changed.")]
    private static partial void LogStorageFailure(ILogger logger, string operation, Guid nodeId, Exception exception);
}
