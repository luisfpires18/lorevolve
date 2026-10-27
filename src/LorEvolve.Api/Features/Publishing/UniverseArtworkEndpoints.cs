using System.Security.Claims;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// A universe's artwork, for its owner: set it, reframe its card, remove it, and read both objects.
///
/// Everything is the profile photo's design (ADR 0021), which is the entry image's (ADR 0019): the
/// upload gate decides what is an image by decoding it (<see cref="ImagePreparation"/>, here with the
/// 16:10 <see cref="ImageFrame.Card"/> frame); the browser chooses four fractions and the server cuts;
/// both new objects are written before the row moves and the superseded pair is swept only after it
/// has; a reframe moves the row only if it still names what was framed. The differences are who may
/// ask - the universe's owner, found with the session exactly as every universe route does - and one
/// rule of publishing: a public universe cannot lose its artwork, only have it replaced.
///
/// The public card is not served here. <see cref="PublicUniverseEndpoints"/> serves it to anyone, and
/// only while the universe is public; these reads are the owner's, public or not.
/// </summary>
public static partial class UniverseArtworkEndpoints
{
    public const string ArtworkChangedCode = "artwork_changed";

    public const string OriginalUnavailableCode = "artwork_original_unavailable";

    public const string RequiredWhilePublicCode = "artwork_required_while_public";

    internal const string LoggerName = "LorEvolve.UniverseArtwork";

    private const long RequestBodyCeiling = ImagePreparation.MaxUploadBytes * 2;

    private const int InMemoryBodyThreshold = (int)ImagePreparation.MaxUploadBytes + 64 * 1024;

    public static IEndpointRouteBuilder MapUniverseArtworkEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/artwork")
            .WithTags("Publishing")
            .RequireAuthorization();

        group.MapGet("/", GetAsync).WithName("GetUniverseArtwork");

        // PUT and a multipart body, with antiforgery off, for the reasons the profile photo gives:
        // the cookie is SameSite=Strict and a form cannot issue a PUT.
        group.MapPut("/", UploadAsync)
            .WithName("SetUniverseArtwork")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling))
            .WithMetadata(new RequestFormLimitsAttribute { MemoryBufferThreshold = InMemoryBodyThreshold });

        group.MapPut("/card", ReframeAsync).WithName("SetUniverseArtworkCard");
        group.MapDelete("/", RemoveAsync).WithName("RemoveUniverseArtwork");
        group.MapGet("/{assetId:guid}/original", ReadOriginalAsync).WithName("ReadUniverseArtworkOriginal");
        group.MapGet("/{assetId:guid}/card/{cardId:guid}", ReadCardAsync).WithName("ReadUniverseArtworkCard");

        return endpoints;
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var artwork = await db.UniverseArtworks.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.UniverseId == universeId, cancellationToken);

        return artwork is null ? Results.NoContent() : Results.Ok(UniverseArtworkRef.Of(artwork));
    }

    /// <summary>
    /// Stores new artwork and points the universe at it: both objects first, under ids nothing uses,
    /// then the row, then the superseded pair. A public universe may replace its artwork; its public
    /// card moves to the new cut the moment the row does.
    /// </summary>
    private static async Task<IResult> UploadAsync(
        Guid universeId,
        IFormFile? file,
        [FromForm(Name = "crop")] string? crop,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (file is null || file.Length == 0)
        {
            return Invalid(ImagePreparation.FileField, "Choose a picture to upload.");
        }

        ImageCrop? requestedCrop = null;
        if (!string.IsNullOrWhiteSpace(crop))
        {
            requestedCrop = ReadCrop(crop);

            if (requestedCrop is null)
            {
                return Invalid(ImagePreparation.CropField, "The card selection could not be read.");
            }
        }

        await using var upload = file.OpenReadStream();
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, requestedCrop, ImageFrame.Card, cancellationToken);

        if (prepared is null)
        {
            return Invalid(rejection!.Field, rejection.Message);
        }

        var logger = loggerFactory.CreateLogger(LoggerName);

        var existing = await db.UniverseArtworks
            .FirstOrDefaultAsync(candidate => candidate.UniverseId == universeId, cancellationToken);

        var supersededOriginal = existing?.OriginalKey;
        var supersededCard = existing?.CardKey;

        var assetId = Guid.NewGuid();
        var cardId = Guid.NewGuid();
        var originalKey = UniverseArtworkKeys.Original(universeId, assetId, prepared.Extension);
        var cardKey = UniverseArtworkKeys.Card(universeId, assetId, cardId);

        try
        {
            bytes.Position = 0;
            using var card = new MemoryStream(prepared.Thumbnail, writable: false);

            await MediaObjectWrites.PutAllAsync(
                store,
                cancellationToken,
                new PendingMediaObject(originalKey, bytes, prepared.ContentType),
                new PendingMediaObject(cardKey, card, "image/webp"));
        }
        catch (MediaStorageUnavailableException exception)
        {
            return Unavailable(exception);
        }
        catch (MediaStorageFailedException exception)
        {
            LogStorageFailure(logger, "upload", exception);
            await SweepAsync(store, logger, originalKey, cardKey);
            return Unavailable(exception);
        }
        catch (Exception)
        {
            await SweepAsync(store, logger, originalKey, cardKey);
            throw;
        }

        var stored = existing ?? new UniverseArtwork
        {
            UniverseId = universeId,
            OriginalKey = originalKey,
            CardKey = cardKey,
            ContentType = prepared.ContentType,
        };

        stored.AssetId = assetId;
        stored.CardId = cardId;
        stored.OriginalKey = originalKey;
        stored.CardKey = cardKey;
        stored.ContentType = prepared.ContentType;
        stored.FileName = TrimFileName(file.FileName);
        stored.Width = prepared.Width;
        stored.Height = prepared.Height;
        stored.ByteSize = bytes.Length;
        stored.UploadedAt = DateTime.UtcNow;
        SetCrop(stored, prepared.Crop);

        try
        {
            if (existing is null)
            {
                db.UniverseArtworks.Add(stored);
            }

            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception)
        {
            await SweepAsync(store, logger, originalKey, cardKey);
            throw;
        }

        if (supersededOriginal is not null)
        {
            await SweepAsync(store, logger, supersededOriginal, supersededCard!);
        }

        return Results.Ok(UniverseArtworkRef.Of(stored));
    }

    /// <summary>
    /// Cuts a new card from the stored original, which is read back and never written, moved or
    /// deleted. The row moves only if it still names the asset and card that were read.
    /// </summary>
    private static async Task<IResult> ReframeAsync(
        Guid universeId,
        UniverseArtworkCardRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var artwork = await db.UniverseArtworks.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.UniverseId == universeId, cancellationToken);

        if (artwork is null)
        {
            return Results.NotFound();
        }

        if (request.Crop is null)
        {
            return Invalid(ImagePreparation.CropField, "Choose the part of the picture the card shows.");
        }

        if (ImagePreparation.CheckCrop(request.Crop, ImageFrame.Card) is { } badCrop)
        {
            return Invalid(ImagePreparation.CropField, badCrop);
        }

        if (request.AssetId != artwork.AssetId)
        {
            return Changed();
        }

        var logger = loggerFactory.CreateLogger(LoggerName);

        using var bytes = new MemoryStream();
        try
        {
            var original = await store.GetAsync(artwork.OriginalKey, cancellationToken);

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
            LogStorageFailure(logger, "reframe", exception);
            return Unavailable(exception as MediaStorageException
                ?? new MediaStorageFailedException("Image storage could not complete the request.", exception));
        }

        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, request.Crop, ImageFrame.Card, cancellationToken);

        if (prepared is null)
        {
            return rejection!.Field == ImagePreparation.CropField
                ? Invalid(ImagePreparation.CropField, rejection.Message)
                : OriginalUnavailable();
        }

        var cardId = Guid.NewGuid();
        var cardKey = UniverseArtworkKeys.Card(universeId, artwork.AssetId, cardId);

        try
        {
            using var card = new MemoryStream(prepared.Thumbnail, writable: false);
            await store.PutAsync(cardKey, card, "image/webp", cancellationToken);
        }
        catch (MediaStorageUnavailableException exception)
        {
            return Unavailable(exception);
        }
        catch (MediaStorageFailedException exception)
        {
            LogStorageFailure(logger, "reframe", exception);
            await SweepAsync(store, logger, cardKey);
            return Unavailable(exception);
        }
        catch (Exception)
        {
            await SweepAsync(store, logger, cardKey);
            throw;
        }

        int moved;
        try
        {
            moved = await db.UniverseArtworks
                .Where(candidate => candidate.UniverseId == universeId
                    && candidate.AssetId == artwork.AssetId
                    && candidate.CardId == artwork.CardId)
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(candidate => candidate.CardId, cardId)
                        .SetProperty(candidate => candidate.CardKey, cardKey)
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
            await SweepAsync(store, logger, cardKey);
            throw;
        }

        if (moved == 0)
        {
            await SweepAsync(store, logger, cardKey);
            return Changed();
        }

        await SweepAsync(store, logger, artwork.CardKey);

        artwork.CardId = cardId;
        artwork.CardKey = cardKey;
        artwork.Width = prepared.Width;
        artwork.Height = prepared.Height;
        SetCrop(artwork, prepared.Crop);

        return Results.Ok(UniverseArtworkRef.Of(artwork));
    }

    /// <summary>
    /// Clears the association, then cleans the bucket - unless the universe is public, which needs its
    /// artwork: that is refused with the way forward (replace it, or make the universe private first).
    /// The check and the delete share a transaction with the publish route's, so neither slips past
    /// the other.
    /// </summary>
    private static async Task<IResult> RemoveAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ownerId = principal.RequireUserId();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var visibility = await db.Universes
            .Where(universe => universe.Id == universeId && universe.OwnerId == ownerId)
            .Select(universe => (UniverseVisibility?)universe.Visibility)
            .FirstOrDefaultAsync(cancellationToken);

        if (visibility is null)
        {
            return Results.NotFound();
        }

        var artwork = await db.UniverseArtworks
            .FirstOrDefaultAsync(candidate => candidate.UniverseId == universeId, cancellationToken);

        if (artwork is null)
        {
            return Results.NoContent();
        }

        if (visibility == UniverseVisibility.Public)
        {
            return Results.Problem(
                title: "A public universe needs its artwork.",
                detail: "Replace the artwork, or make the universe private before removing it.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = RequiredWhilePublicCode });
        }

        var originalKey = artwork.OriginalKey;
        var cardKey = artwork.CardKey;

        db.UniverseArtworks.Remove(artwork);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await SweepAsync(store, loggerFactory.CreateLogger(LoggerName), originalKey, cardKey);

        return Results.NoContent();
    }

    private static Task<IResult> ReadOriginalAsync(
        Guid universeId,
        Guid assetId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken) =>
        ReadAsync(universeId, assetId, cardId: null, principal, db, store, loggerFactory, context, cancellationToken);

    private static Task<IResult> ReadCardAsync(
        Guid universeId,
        Guid assetId,
        Guid cardId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken) =>
        ReadAsync(universeId, assetId, cardId, principal, db, store, loggerFactory, context, cancellationToken);

    /// <summary>
    /// One object, to the universe's owner, public or not. Both ids in the route are checked against
    /// the row, so an address stops resolving the moment what it named is replaced or reframed.
    /// </summary>
    private static async Task<IResult> ReadAsync(
        Guid universeId,
        Guid assetId,
        Guid? cardId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ownerId = principal.RequireUserId();

        var artwork = await db.UniverseArtworks.AsNoTracking()
            .Where(candidate => candidate.UniverseId == universeId
                && candidate.AssetId == assetId
                && db.Universes.Any(universe => universe.Id == universeId && universe.OwnerId == ownerId))
            .Select(candidate => new { candidate.OriginalKey, candidate.CardId, candidate.CardKey, candidate.ContentType })
            .FirstOrDefaultAsync(cancellationToken);

        if (artwork is null || (cardId is not null && cardId != artwork.CardId))
        {
            return Results.NotFound();
        }

        StoredMediaObject? stored;
        try
        {
            stored = await store.GetAsync(cardId is null ? artwork.OriginalKey : artwork.CardKey, cancellationToken);
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
            return Results.NotFound();
        }

        // The owner's own copy: private, and immutable under an address whose ids are never reused.
        context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        context.Response.Headers.XContentTypeOptions = "nosniff";

        return Results.Stream(stored.Content, cardId is null ? artwork.ContentType : "image/webp", enableRangeProcessing: false);
    }

    /// <summary>Deletes artwork objects nothing points at any more, together. See MediaObjectWrites.</summary>
    internal static Task SweepAsync(IMediaObjectStore store, ILogger logger, params string[] keys) =>
        MediaObjectWrites.SweepAsync(store, logger, LogOrphanedObject, keys);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Orphaned media object left behind at '{ObjectKey}'. Nothing references it and it is safe to delete.")]
    private static partial void LogOrphanedObject(ILogger logger, string objectKey, Exception exception);

    [LoggerMessage(
        Level = LogLevel.Error,
        Message = "Universe artwork storage failed during {Operation}. Nothing was changed.")]
    private static partial void LogStorageFailure(ILogger logger, string operation, Exception exception);

    private static void SetCrop(UniverseArtwork artwork, ImageCrop crop)
    {
        artwork.CropX = crop.X;
        artwork.CropY = crop.Y;
        artwork.CropWidth = crop.Width;
        artwork.CropHeight = crop.Height;
    }

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

    internal static IResult Unavailable(MediaStorageException exception) =>
        Results.Problem(
            title: "Image storage is unavailable.",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);

    private static IResult Changed() =>
        Results.Problem(
            title: "The artwork changed while it was being framed.",
            detail: "This universe's artwork was replaced somewhere else. Open it again to choose the framing.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ArtworkChangedCode });

    private static IResult OriginalUnavailable() =>
        Results.Problem(
            title: "The stored artwork could not be read.",
            detail: "Its card cannot be cut again. Upload the picture again to replace it.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = OriginalUnavailableCode });

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
