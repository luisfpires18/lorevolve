using System.Security.Claims;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Storage;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// The one primary image on one entry: set it, frame its thumbnail, read it, remove it.
///
/// <para><b>Why the bytes come through LorEvolve rather than straight from Cloudflare.</b> Two
/// models were available for a private bucket. A short-lived presigned URL takes the server out
/// of the read path, but it also turns the URL itself into the credential: it survives in
/// history and in anything the author pastes it into, it cannot be withdrawn before it expires,
/// and it has to be reissued and threaded back into every <c>img</c> tag as it does. The
/// alternative is this one - an authenticated route that proves ownership per request and
/// streams the object - and it costs bandwidth LorEvolve already pays for everything else it
/// serves. Ownership is then checked in exactly the same place as every other lore read, the
/// browser sends the session cookie it already has, and no URL anywhere points at Cloudflare.
/// See <c>docs/architecture/decisions/0019-entity-primary-image.md</c>.</para>
///
/// <para><b>Why uploads are mediated too.</b> The server has to see the bytes: it is what
/// decides whether the file is an image at all, and it is what makes the thumbnail. A browser
/// uploading straight to R2 would put both decisions on the client, and would need CORS opened
/// on the bucket to do it. The author chooses which square of the picture the thumbnail shows,
/// but only as four fractions; the thumbnail itself is always cut here, from the original.</para>
///
/// <para><b>What the URL shape buys.</b> The asset id is in both paths, and the thumbnail's id is
/// in its own. A new asset is minted for every upload and a new thumbnail for every framing, so
/// a given URL always names the same bytes. A replacement or a reframing is a different URL
/// rather than the same URL with different content, which is what lets the response be cached
/// honestly and what stops a stale thumbnail surviving either.</para>
///
/// <para><b>What storage failing looks like.</b> A store that is not configured, refuses a call
/// or does not answer surfaces as a <see cref="MediaStorageException"/>, and every route here
/// turns that into a 503 problem carrying LorEvolve's own sentence. An SDK exception never reaches
/// the response, and a write that fails part-way sweeps what it had written.</para>
///
/// <para>Every route passes <see cref="UniverseAccess"/> first: members read, Editors and the owner change (ADR
/// 0041), and an entry in a world the caller has no access to answers 404, indistinguishable from one that is not there.
/// Nothing in a response, an error or a log carries a bucket name, an endpoint or a
/// credential.</para>
/// </summary>
public static partial class EntityImageEndpoints
{
    /// <summary>Stable marker for a framing that arrived after its picture had changed.</summary>
    public const string ImageChangedCode = "image_changed";

    /// <summary>Stable marker for an original the store cannot hand back.</summary>
    public const string OriginalUnavailableCode = "image_original_unavailable";

    /// <summary>
    /// A backstop well above <see cref="ImagePreparation.MaxUploadBytes"/>, not a second
    /// limit. The friendly refusal is the validation one; this only stops a request that is
    /// gross rather than merely too big.
    /// </summary>
    private const long RequestBodyCeiling = ImagePreparation.MaxUploadBytes * 2;

    /// <summary>Enough for any upload the gate accepts, so the body is never spooled to disk.</summary>
    private const int InMemoryBodyThreshold = (int)ImagePreparation.MaxUploadBytes + 64 * 1024;

    public static IEndpointRouteBuilder MapEntityImageEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/entities/{entityId:guid}/image")
            .WithTags("Entity images")
            .RequireAuthorization();

        // PUT rather than POST, and that is a security choice as well as a semantic one. The
        // session cookie is SameSite=Strict, so a cross-site request never carries it in the
        // first place; PUT closes the same hole a second time, because an HTML form can only
        // issue GET and POST and a scripted PUT is forced through a CORS preflight. Antiforgery
        // is disabled because there is no token to check on an API called by fetch - the cookie
        // policy and the method are what defend it.
        group.MapPut("/", UploadAsync)
            .WithName("SetEntityImage")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling))
            // The handler reads the body into memory anyway - three times, to identify, decode and
            // store - so letting the form reader spool it to a temporary file first only added a
            // write and a read back. See the profile upload, which does the same.
            .WithMetadata(new RequestFormLimitsAttribute { MemoryBufferThreshold = InMemoryBodyThreshold });

        // A JSON body, so it needs no antiforgery exemption, and PUT for the same reasons as above.
        group.MapPut("/thumbnail", ReframeAsync).WithName("SetEntityThumbnail");

        group.MapDelete("/", RemoveAsync).WithName("RemoveEntityImage");

        group.MapGet("/{assetId:guid}/original", ReadOriginalAsync).WithName("ReadEntityImageOriginal");

        group.MapGet("/{assetId:guid}/thumbnail/{thumbnailId:guid}", ReadThumbnailAsync)
            .WithName("ReadEntityImageThumbnail");

        return endpoints;
    }

    // ---------- Upload and replace ----------

    /// <summary>
    /// Stores a new asset and points the entry at it.
    ///
    /// The order is the whole design, because R2 and SQLite are two stores and there is no
    /// transaction across them. Both new objects are written first, under an asset id nothing
    /// is using; only then does the database move; and only after that commit is the previous
    /// pair deleted. So a failure anywhere before the commit leaves the entry pointing at the
    /// image it had, still whole, and a failure after it leaves the entry pointing at the new
    /// image with two objects to sweep up. What cannot happen is the database naming objects
    /// that are gone.
    ///
    /// <paramref name="crop"/> is the square the author framed, as JSON in its own form field
    /// beside the file. It is optional - without one the thumbnail is the centred square - and it
    /// travels with the file, so a replacement is one request: nothing is uploaded until the
    /// author has confirmed how the new picture should be framed.
    ///
    /// <para><b>Storage.</b> The picture counts against the universe's owner, whoever uploads it,
    /// and only by what it adds: the new original's size less the one it replaces (ADR 0042). An
    /// upload that adds nothing - the same size, a smaller picture - needs no room and is never
    /// refused for it, even past the allowance. One that adds bytes holds them before the bucket is
    /// touched (<see cref="AccountStorage"/>), and the hold is consumed by the commit or given back
    /// by every way this can fail.</para>
    /// </summary>
    private static async Task<IResult> UploadAsync(
        Guid universeId,
        Guid entityId,
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

        // Trashed is not editable, exactly as the entity update path has it. The same read names
        // whose storage the picture will count against: the universe's owner, not the uploader.
        var ownerId = await db.Entities
            .Where(candidate => candidate.Id == entityId
                && candidate.UniverseId == universeId
                && candidate.DeletedAt == null)
            .Select(candidate => candidate.Universe!.OwnerId)
            .FirstOrDefaultAsync(cancellationToken);

        if (ownerId is null)
        {
            return Results.NotFound();
        }

        if (file is null || file.Length == 0)
        {
            return Invalid(ImagePreparation.FileField, "Choose an image to upload.");
        }

        EntityImageCrop? requestedCrop = null;
        if (!string.IsNullOrWhiteSpace(crop))
        {
            requestedCrop = ReadCrop(crop);

            if (requestedCrop is null)
            {
                return Invalid(ImagePreparation.CropField, "The thumbnail selection could not be read.");
            }
        }

        await using var upload = file.OpenReadStream();

        // Buffered rather than streamed to R2 directly, because the bytes are read three times:
        // once for the header, once to decode, and once to store. The size ceiling above is what
        // makes that safe to hold.
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, requestedCrop?.ToShared(), cancellationToken);

        if (prepared is null)
        {
            return Invalid(rejection!.Field, rejection.Message);
        }

        var logger = loggerFactory.CreateLogger("LorEvolve.EntityImages");

        var existing = await db.EntityImages
            .FirstOrDefaultAsync(image => image.EntityId == entityId, cancellationToken);

        var replacedAssetId = existing?.AssetId;

        // What the owner's storage grows by: the bytes the server received, never a size the
        // browser claimed, less the original this one replaces. Only growth is held.
        var growth = bytes.Length - (existing?.ByteSize ?? 0);
        StorageHold? hold = null;

        if (growth > 0)
        {
            hold = await AccountStorage.ReserveAsync(db, clock, ownerId, growth, cancellationToken);

            if (hold is null)
            {
                return StorageQuota.Exceeded(isOwner: ownerId == principal.RequireUserId());
            }
        }

        var committed = false;
        try
        {
            var assetId = Guid.NewGuid();
            var thumbnailId = Guid.NewGuid();
            var originalKey = EntityImageKeys.Original(universeId, entityId, assetId, prepared.Extension);
            var thumbnailKey = EntityImageKeys.Thumbnail(universeId, entityId, assetId, thumbnailId);

            try
            {
                bytes.Position = 0;
                using var thumbnail = new MemoryStream(prepared.Thumbnail, writable: false);

                // Both at once. Neither depends on the other and nothing can read either until the
                // association moves below, so waiting for the first before starting the second only
                // ever bought a second round trip to the bucket - see MediaObjectWrites.
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
                // The store refused one of the two, or stopped answering. The original may well
                // have landed before the thumbnail did not; nothing points at either yet, so both
                // come back out, and the entry keeps the picture it had.
                LogStorageFailure(logger, "upload", entityId, exception);
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                return Unavailable(exception);
            }
            catch (Exception)
            {
                // Nothing points at these yet, so removing them is safe and is the only thing that
                // keeps a failed upload from leaving litter in the bucket.
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                throw;
            }

            var now = DateTime.UtcNow;
            var stored = existing ?? new EntityImage
            {
                EntityId = entityId,
                OriginalKey = originalKey,
                ThumbnailKey = thumbnailKey,
                ContentType = prepared.ContentType,
            };

            string? supersededOriginal = null;
            string? supersededThumbnail = null;

            // Decided inside the transaction, acted on after it: the transaction does database work only, and
            // every object-store call - this upload's own cleanup included - waits until it has been disposed
            // and SQLite's writer lock is free again (ADR 0042).
            var outcome = UploadOutcome.Committed;

            try
            {
                // The association and the version that records it commit together or not at all.
                // A history that had lost the moment the picture changed would be worse than one
                // that never claimed to hold it - see ADR 0013 and ADR 0019.
                await using (var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken))
                {
                    // Read inside the transaction, which holds the writer lock, so nothing can move between
                    // these checks and the save.
                    //
                    // The entry itself must still be live: a universe deleted, or an entry trashed or erased,
                    // while the bytes were on their way leaves this upload nothing to attach to. The delete
                    // swept only what had been committed; this upload's own objects are its own to remove.
                    var current = await db.Entities.AnyAsync(
                            candidate => candidate.Id == entityId
                                && candidate.UniverseId == universeId
                                && candidate.DeletedAt == null,
                            cancellationToken)
                        ? await db.EntityImages.AsNoTracking()
                            .Where(image => image.EntityId == entityId)
                            .Select(image => new CurrentImage(image.AssetId, image.OriginalKey, image.ThumbnailKey))
                            .FirstOrDefaultAsync(cancellationToken)
                            ?? CurrentImage.None
                        : null;

                    if (current is null)
                    {
                        outcome = UploadOutcome.EntryGone;
                    }
                    else if (current.AssetId != replacedAssetId)
                    {
                        // The picture this upload was measured against is no longer the entry's. Another
                        // upload or a removal that landed meanwhile would make the growth held above
                        // wrong, and its objects are the ones that would need sweeping - so it wins.
                        outcome = UploadOutcome.PictureChanged;
                    }
                    else
                    {
                        // A reframe that landed meanwhile changed the thumbnail, not the picture: the one to
                        // sweep is whichever the row names now.
                        supersededOriginal = current.OriginalKey;
                        supersededThumbnail = current.ThumbnailKey;

                        // Before the picture is written, so a hold that lapsed is checked against storage
                        // as it stands - see AccountStorage.ConsumeAsync.
                        await AccountStorage.ConsumeAsync(db, clock, hold, cancellationToken);

                        stored.AssetId = assetId;
                        stored.ThumbnailId = thumbnailId;
                        stored.OriginalKey = originalKey;
                        stored.ThumbnailKey = thumbnailKey;
                        stored.ContentType = prepared.ContentType;
                        stored.FileName = TrimFileName(file.FileName);
                        stored.Width = prepared.Width;
                        stored.Height = prepared.Height;
                        stored.ByteSize = bytes.Length;
                        stored.UploadedAt = now;
                        SetCrop(stored, prepared.Crop);

                        if (existing is null)
                        {
                            db.EntityImages.Add(stored);
                        }

                        // The entry's own UpdatedAt is left alone. It says when the lore was last authored,
                        // and the image carries its own timestamp - the same reasoning the Trash marker uses.
                        await db.SaveChangesAsync(cancellationToken);

                        // No snapshot can see this, because a revision holds no image: the objects a past
                        // version pointed at are deleted when it is superseded, so a key kept in history
                        // would name nothing. The change is recorded rather than copied.
                        await EntityRevisions.CaptureAsync(
                            db,
                            entityId,
                            EntityRevisionKind.Edited,
                            restoredFromRevisionId: null,
                            principal.RequireUserId(),
                            cancellationToken,
                            also: EntityRevisionChange.Image);

                        await transaction.CommitAsync(cancellationToken);
                        committed = true;
                    }
                }
            }

            // The transaction is disposed - rolled back - before either handler runs, so these sweeps too
            // happen with the writer lock released.
            catch (StorageQuotaExceededException)
            {
                // The hold lapsed and the room went meanwhile. Nothing moved.
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                return StorageQuota.Exceeded(isOwner: ownerId == principal.RequireUserId());
            }
            catch (Exception)
            {
                // The association never moved, so the old image is still the live one and the new
                // objects are unreferenced. Take them back out.
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                throw;
            }

            if (outcome != UploadOutcome.Committed)
            {
                // Lost a race. Nothing was written and nothing names these objects; the hold is given back
                // in the finally below.
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                return outcome == UploadOutcome.EntryGone ? Results.NotFound() : ReplacedMeanwhile();
            }

            // Past the commit. The new image is the entry's image whatever happens next, so a
            // failure here is litter to be reported, never a reason to undo the write.
            if (supersededOriginal is not null)
            {
                await SweepAsync(store, logger, supersededOriginal, supersededThumbnail!);
            }

            return Results.Ok(EntityImageRef.Of(stored));
        }
        finally
        {
            // Every way out that did not commit - a refusal, a store failure, a database failure, a
            // cancelled request - gives the room back. The commit consumed it already.
            if (!committed)
            {
                await AccountStorage.ReleaseAsync(db, hold, logger);
            }
        }
    }

    /// <summary>
    /// A first picture, whose objects are already stored, becomes the entry's image inside the caller's transaction - an
    /// approved AI change's staged picture (ADR 0062). The same commit as an upload's: under the writer lock the entry must be
    /// live and still have no picture, the hold is consumed first, and the change is recorded in the entry's history as an
    /// upload records it. False when the entry is gone or has a picture now: nothing was written.
    /// </summary>
    internal static async Task<bool> AttachFirstAsync(
        LorEvolveDbContext db,
        TimeProvider clock,
        Guid universeId,
        Guid entityId,
        EntityImage stored,
        StorageHold? hold,
        string actorUserId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var live = await db.Entities.AnyAsync(
            candidate => candidate.Id == entityId && candidate.UniverseId == universeId && candidate.DeletedAt == null,
            cancellationToken);
        if (!live || await db.EntityImages.AnyAsync(image => image.EntityId == entityId, cancellationToken))
        {
            return false;
        }

        await AccountStorage.ConsumeAsync(db, clock, hold, cancellationToken);
        stored.EntityId = entityId;
        db.EntityImages.Add(stored);
        await db.SaveChangesAsync(cancellationToken);
        await EntityRevisions.CaptureAsync(
            db,
            entityId,
            EntityRevisionKind.Edited,
            restoredFromRevisionId: null,
            actorUserId,
            cancellationToken,
            also: EntityRevisionChange.Image);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    /// <summary>How an upload's commit ended: it landed, or it lost a race and keeps nothing.</summary>
    private enum UploadOutcome
    {
        Committed,
        EntryGone,
        PictureChanged,
    }

    /// <summary>The picture an entry has at the commit; <see cref="None"/> when it has none.</summary>
    private sealed record CurrentImage(Guid? AssetId, string? OriginalKey, string? ThumbnailKey)
    {
        public static readonly CurrentImage None = new(null, null, null);
    }

    // ---------- Framing the thumbnail ----------

    /// <summary>
    /// Cuts a new thumbnail from the original the entry already has, and nothing else.
    ///
    /// The original is read back from the store and never uploaded again, and its object is not
    /// written, moved or deleted: its key stays exactly what it was. The same ordering as a
    /// replacement protects the working thumbnail. The new one is written under a thumbnail id
    /// nothing is using; the row moves to it; only after that commit is the old thumbnail
    /// deleted. A failure before the commit leaves the entry showing the thumbnail it had.
    ///
    /// The row only moves if it still names the asset and the thumbnail that were read. A
    /// replacement or another framing that landed in between wins, this one answers 409, and its
    /// thumbnail is swept - so an entry can never end up showing a square of a picture it no
    /// longer has.
    /// </summary>
    private static async Task<IResult> ReframeAsync(
        Guid universeId,
        Guid entityId,
        EntityThumbnailRequest request,
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

        // Trashed is not editable here either: a thumbnail is part of the image.
        var image = await db.EntityImages.AsNoTracking()
            .Where(candidate => candidate.EntityId == entityId
                && candidate.Entity!.UniverseId == universeId
                && candidate.Entity.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (image is null)
        {
            return Results.NotFound();
        }

        if (request.Crop is null)
        {
            return Invalid(ImagePreparation.CropField, "Choose the part of the image the thumbnail shows.");
        }

        if (ImagePreparation.CheckCrop(request.Crop.ToShared()) is { } badCrop)
        {
            return Invalid(ImagePreparation.CropField, badCrop);
        }

        if (request.AssetId != image.AssetId)
        {
            return Changed();
        }

        var logger = loggerFactory.CreateLogger("LorEvolve.EntityImages");

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
            LogStorageFailure(logger, "reframe", entityId, exception);
            return Unavailable(exception as MediaStorageException
                ?? new MediaStorageFailedException("Image storage could not complete the request.", exception));
        }

        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, request.Crop.ToShared(), cancellationToken);

        if (prepared is null)
        {
            // A crop that is not square on this picture is the author's to fix. Anything else
            // means the stored original itself no longer passes, which is not.
            return rejection!.Field == ImagePreparation.CropField
                ? Invalid(ImagePreparation.CropField, rejection.Message)
                : OriginalUnavailable();
        }

        var thumbnailId = Guid.NewGuid();
        var thumbnailKey = EntityImageKeys.Thumbnail(universeId, entityId, image.AssetId, thumbnailId);

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
            LogStorageFailure(logger, "reframe", entityId, exception);
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
            await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

            // One conditional statement rather than a tracked read and a save: the check that the
            // picture is still the one that was framed and the move to the new thumbnail cannot
            // be separated by another write. Width and height are refreshed from the decode, so
            // a picture stored before they were measured upright is corrected in passing.
            moved = await db.EntityImages
                .Where(candidate => candidate.EntityId == entityId
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

            if (moved == 1)
            {
                // A new framing is a new picture on the card, so it is an image change like any
                // other. Only the fact is recorded; the thumbnail it replaced is not kept.
                await EntityRevisions.CaptureAsync(
                    db,
                    entityId,
                    EntityRevisionKind.Edited,
                    restoredFromRevisionId: null,
                    principal.RequireUserId(),
                    cancellationToken,
                    also: EntityRevisionChange.Image);

                await transaction.CommitAsync(cancellationToken);
            }
        }
        catch (Exception)
        {
            await SweepAsync(store, logger, thumbnailKey);
            throw;
        }

        if (moved == 0)
        {
            // Something else moved the picture first. Nothing points at this thumbnail.
            await SweepAsync(store, logger, thumbnailKey);
            return Changed();
        }

        // Past the commit, and only the thumbnail. The original is still the entry's image.
        await SweepAsync(store, logger, image.ThumbnailKey);

        image.ThumbnailId = thumbnailId;
        image.ThumbnailKey = thumbnailKey;
        image.Width = prepared.Width;
        image.Height = prepared.Height;
        SetCrop(image, prepared.Crop);

        return Results.Ok(EntityImageRef.Of(image));
    }

    // ---------- Remove ----------

    /// <summary>
    /// Clears the association, then cleans the bucket.
    ///
    /// The reverse order of the upload, for the same reason: the database is the thing that says
    /// what exists, so it moves first and the objects follow. An entry with no image is a
    /// correct state; an entry naming two objects that were deliberately deleted is not.
    /// </summary>
    private static async Task<IResult> RemoveAsync(
        Guid universeId,
        Guid entityId,
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

        var image = await db.EntityImages
            .Where(candidate => candidate.EntityId == entityId
                && candidate.Entity!.UniverseId == universeId
                && candidate.Entity.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (image is null)
        {
            // Nothing to remove is the outcome the caller asked for, and saying so with a 404
            // would make "no image" and "no entry" the same answer.
            return Results.NoContent();
        }

        var originalKey = image.OriginalKey;
        var thumbnailKey = image.ThumbnailKey;

        await using (var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken))
        {
            db.EntityImages.Remove(image);
            await db.SaveChangesAsync(cancellationToken);

            await EntityRevisions.CaptureAsync(
                db,
                entityId,
                EntityRevisionKind.Edited,
                restoredFromRevisionId: null,
                principal.RequireUserId(),
                cancellationToken,
                also: EntityRevisionChange.Image);

            await transaction.CommitAsync(cancellationToken);
        }

        // Only past the commit, so the objects are removed after the entry has stopped naming
        // them - never the other way round.
        await SweepAsync(
            store,
            loggerFactory.CreateLogger("LorEvolve.EntityImages"),
            originalKey,
            thumbnailKey);

        return Results.NoContent();
    }

    // ---------- Read ----------

    private static Task<IResult> ReadOriginalAsync(
        Guid universeId,
        Guid entityId,
        Guid assetId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken) =>
        ReadAsync(universeId, entityId, assetId, thumbnailId: null, principal, db, store, loggerFactory, context, cancellationToken);

    private static Task<IResult> ReadThumbnailAsync(
        Guid universeId,
        Guid entityId,
        Guid assetId,
        Guid thumbnailId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken) =>
        ReadAsync(universeId, entityId, assetId, thumbnailId, principal, db, store, loggerFactory, context, cancellationToken);

    /// <summary>
    /// Streams one object to its owner: the original when <paramref name="thumbnailId"/> is null,
    /// otherwise that thumbnail.
    ///
    /// Both ids in the route are checked against the association rather than trusted, so an old
    /// asset id stops resolving the moment the picture is replaced, and an old thumbnail id the
    /// moment it is reframed - a URL cannot outlive the row that authorised it.
    ///
    /// A trashed entry's image is still readable. Trashing hides lore from the ordinary surface;
    /// it does not withdraw the owner's access to what they have not thrown away irrecoverably,
    /// and a Trash that could not show what it holds would be worse at its job.
    /// </summary>
    private static async Task<IResult> ReadAsync(
        Guid universeId,
        Guid entityId,
        Guid assetId,
        Guid? thumbnailId,
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

        var image = await db.EntityImages.AsNoTracking()
            .Where(candidate => candidate.EntityId == entityId
                && candidate.AssetId == assetId
                && candidate.Entity!.UniverseId == universeId)
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
                LogStorageFailure(loggerFactory.CreateLogger("LorEvolve.EntityImages"), "read", entityId, exception);
            }

            return Unavailable(exception);
        }

        if (stored is null)
        {
            // The row names an object the bucket does not hold. Two stores can disagree and this
            // is what that looks like from here: not found, not a server error, and nothing said
            // about which store was missing it.
            return Results.NotFound();
        }

        // Private, and cacheable for a long time because the URL is content-addressed: the ids
        // are in the path and are never reused, so these bytes cannot change under this URL.
        // `private` keeps the response out of any shared cache, and the service worker refuses
        // everything under /api by construction - ADR 0017 - so it never reaches the app shell
        // cache either.
        context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        context.Response.Headers.XContentTypeOptions = "nosniff";

        var contentType = thumbnailId is null ? image.ContentType : "image/webp";

        return Results.Stream(stored.Content, contentType, enableRangeProcessing: false);
    }

    // ---------- Shared ----------

    /// <summary>Deletes objects nothing points at any more, together. See MediaObjectWrites.</summary>
    internal static Task SweepAsync(IMediaObjectStore store, ILogger logger, params string[] keys) =>
        MediaObjectWrites.SweepAsync(store, logger, LogOrphanedObject, keys);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Orphaned media object left behind at '{ObjectKey}'. Nothing references it and it is safe to delete.")]
    private static partial void LogOrphanedObject(ILogger logger, string objectKey, Exception exception);

    [LoggerMessage(
        Level = LogLevel.Error,
        Message = "Image storage failed during {Operation} for entry {EntityId}. Nothing was changed.")]
    private static partial void LogStorageFailure(ILogger logger, string operation, Guid entityId, Exception exception);

    private static void SetCrop(EntityImage image, ImageCrop crop)
    {
        image.CropX = crop.X;
        image.CropY = crop.Y;
        image.CropWidth = crop.Width;
        image.CropHeight = crop.Height;
    }

    /// <summary>The crop form field, or null when it is not the four numbers a crop is.</summary>
    private static EntityImageCrop? ReadCrop(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<EntityImageCrop>(json, JsonSerializerOptions.Web);
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
            title: "The picture changed while it was being framed.",
            detail: "This entry's image was replaced or reframed somewhere else. Open it again to choose the framing.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ImageChangedCode });

    /// <summary>The entry's picture was replaced or removed while this upload was on its way. That one stands.</summary>
    private static IResult ReplacedMeanwhile() =>
        Results.Problem(
            title: "The picture changed while this one was uploading.",
            detail: "This entry's image was replaced or removed somewhere else, so this one was not kept. Open the entry again and choose the picture.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ImageChangedCode });

    private static IResult OriginalUnavailable() =>
        Results.Problem(
            title: "The stored image could not be read.",
            detail: "Its thumbnail cannot be made again. Upload the picture again to replace it.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = OriginalUnavailableCode });

    /// <summary>The author's own filename, kept only as a label and never used to build a key.</summary>
    internal static string? TrimFileName(string? fileName)
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
