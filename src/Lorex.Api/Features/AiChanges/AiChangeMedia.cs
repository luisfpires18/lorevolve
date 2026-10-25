using System.ComponentModel;
using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Progression;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.AiChanges;

// ---------- What an AI sends ----------

[Description("A picture for an entry: its profile picture, when it has none yet, or one more picture in one of its appearances. The AI sends no file: the person uploads it in LoreX, on the proposal's review page, and approves it there.")]
public sealed record AiImageInput(
    [property: Description("The entry's id.")] Guid? Entry = null,
    [property: Description("An appearance of that entry, by id from get_change_options with loreId. Leave it out for the entry's profile picture.")] Guid? Appearance = null,
    [property: Description("What picture the person should upload, in a short line, such as \"Bilbo at Bag End\".")] string? Note = null);

/// <summary>Where a staged picture goes once approved: the entry's profile picture, or a picture of one of its appearances.</summary>
public sealed record MediaValues(Guid EntityId, Guid? AppearanceId, string? Note);

/// <summary>
/// A media change's file, as the review shows it: not uploaded yet, or uploaded - with its preview, read through LoreX's own
/// route behind the session, never a storage URL.
/// </summary>
public sealed record AiChangeMediaInfo(bool Uploaded, string? FileName, string? ContentType, int? Width, int? Height, long? ByteSize, DateTime? UploadedAt);

// ---------- What is held ----------

/// <summary>
/// A picture a person uploaded for a pending media change (issue 59 phase 4, ADR 0062): quarantined until it is approved. Its
/// two objects are written under the keys the picture will have once attached - the entry's or appearance's own prefix, a
/// fresh asset id - but nothing serves them: no image row names them, only this one, and its only reader is the review's
/// preview, behind the proposal's own access. Approval moves ownership to the picture's row in the same commit that removes
/// this one. Anything else - a rejection, an expiry, a replaced upload, a deleted universe - leaves this row behind with no
/// pending change, and <see cref="AiChangeMediaSweep"/> deletes its objects and then the row.
///
/// No foreign keys on purpose: a cascade would forget the keys before anything could delete their objects.
/// </summary>
public sealed class AiChangeMedia
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Guid OperationId { get; set; }

    public Guid EntityId { get; set; }

    public Guid? AppearanceId { get; set; }

    /// <summary>The asset id of a profile picture, or the image id of an appearance's picture, it will have once attached.</summary>
    public Guid AssetId { get; set; }

    public Guid ThumbnailId { get; set; }

    public required string OriginalKey { get; set; }

    public required string ThumbnailKey { get; set; }

    public required string ContentType { get; set; }

    public string? FileName { get; set; }

    public int Width { get; set; }

    public int Height { get; set; }

    public long ByteSize { get; set; }

    public double CropX { get; set; }

    public double CropY { get; set; }

    public double CropWidth { get; set; }

    public double CropHeight { get; set; }

    public required string UploadedByUserId { get; set; }

    /// <summary>UTC.</summary>
    public DateTime UploadedAt { get; set; }
}

public sealed class AiChangeMediaConfiguration : IEntityTypeConfiguration<AiChangeMedia>
{
    public void Configure(EntityTypeBuilder<AiChangeMedia> builder)
    {
        builder.ToTable("AiChangeMedia");
        builder.HasKey(media => media.Id);
        builder.Property(media => media.OriginalKey).HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(media => media.ThumbnailKey).HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(media => media.ContentType).HasMaxLength(StoredImageLimits.ContentTypeMaxLength);
        builder.Property(media => media.FileName).HasMaxLength(StoredImageLimits.FileNameMaxLength);
        builder.Property(media => media.UploadedByUserId).HasMaxLength(450);

        // One file per change; "what this account has in quarantine" for its bound.
        builder.HasIndex(media => media.OperationId).IsUnique();
        builder.HasIndex(media => media.UploadedByUserId);
    }
}

/// <summary>
/// The person's hand-over of a picture for an AI's media change, and the review's preview of it (ADR 0062). Session routes
/// only - an MCP token is never a session here, so no AI can upload, read or approve a picture through them.
/// </summary>
public static partial class AiChangeMediaEndpoints
{
    /// <summary>The most one account may hold in quarantine at once, across its pending media changes.</summary>
    public const long MaxStagedBytesPerAccount = 64L * 1024 * 1024;

    public const string LoggerName = "Lorex.AiChangeMedia";

    private const long RequestBodyCeiling = ImagePreparation.MaxUploadBytes * 2;

    private const int InMemoryBodyThreshold = (int)ImagePreparation.MaxUploadBytes + 64 * 1024;

    public static IEndpointRouteBuilder MapAiChangeMediaEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/ai-changes/{proposalId:guid}/operations/{operationId:guid}/media")
            .WithTags("AI changes")
            .RequireAuthorization();

        // PUT and SameSite=Strict, as every picture upload (EntityImageEndpoints).
        group.MapPut("/", UploadAsync)
            .WithName("UploadAiChangeMedia")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling))
            .WithMetadata(new RequestFormLimitsAttribute { MemoryBufferThreshold = InMemoryBodyThreshold });
        group.MapGet("/thumbnail", (Guid universeId, Guid proposalId, Guid operationId, ClaimsPrincipal principal, LorexDbContext db, IMediaObjectStore store, HttpContext context, CancellationToken cancellationToken) =>
            ReadAsync(universeId, proposalId, operationId, thumbnail: true, principal, db, store, context, cancellationToken)).WithName("ReadAiChangeMediaThumbnail");
        group.MapGet("/original", (Guid universeId, Guid proposalId, Guid operationId, ClaimsPrincipal principal, LorexDbContext db, IMediaObjectStore store, HttpContext context, CancellationToken cancellationToken) =>
            ReadAsync(universeId, proposalId, operationId, thumbnail: false, principal, db, store, context, cancellationToken)).WithName("ReadAiChangeMediaOriginal");

        return endpoints;
    }

    /// <summary>
    /// The person's picture for a pending media change: checked by the upload gate's own decoders and bounds, written to the
    /// store under its future keys with no transaction open, then recorded - replacing an earlier upload for the same change,
    /// whose objects are swept after the commit. Only the person the AI acted for, or someone who may approve it, while the
    /// change waits. Nothing is attached and nothing counts against storage until approval.
    /// </summary>
    private static async Task<IResult> UploadAsync(
        Guid universeId,
        Guid proposalId,
        Guid operationId,
        IFormFile? file,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        TimeProvider clock,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var (denied, role) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var userId = principal.RequireUserId();
        if (await PendingAsync(db, universeId, proposalId, operationId, userId, role, cancellationToken) is not { } media)
        {
            return Results.NotFound();
        }

        if (file is null || file.Length == 0)
        {
            return Invalid("Choose an image to upload.");
        }

        await using var upload = file.OpenReadStream();
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(bytes, bytes.Length, null, cancellationToken);
        if (prepared is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { [rejection!.Field] = [rejection.Message] });
        }

        var held = await db.AiChangeMedia.Where(row => row.UploadedByUserId == userId && row.OperationId != operationId).SumAsync(row => (long?)row.ByteSize, cancellationToken) ?? 0;
        if (held + bytes.Length > MaxStagedBytesPerAccount)
        {
            return Invalid($"You have {Megabytes(held)} MB of pictures waiting for review, and at most {Megabytes(MaxStagedBytesPerAccount)} MB can wait at once. Approve or reject some first.");
        }

        var assetId = Guid.NewGuid();
        var thumbnailId = Guid.NewGuid();
        var (originalKey, thumbnailKey) = media.AppearanceId is { } appearanceId
            ? (AppearanceImageKeys.Original(universeId, media.EntityId, appearanceId, assetId, prepared.Extension), AppearanceImageKeys.Thumbnail(universeId, media.EntityId, appearanceId, assetId))
            : (EntityImageKeys.Original(universeId, media.EntityId, assetId, prepared.Extension), EntityImageKeys.Thumbnail(universeId, media.EntityId, assetId, thumbnailId));
        var logger = loggerFactory.CreateLogger(LoggerName);

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
            await SweepAsync(store, logger, originalKey, thumbnailKey);
            return Unavailable(exception);
        }
        catch (Exception)
        {
            await SweepAsync(store, logger, originalKey, thumbnailKey);
            throw;
        }

        string[] replaced = [];
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            // Still waiting, under the writer lock: a change decided meanwhile keeps nothing of this upload.
            if (await PendingAsync(db, universeId, proposalId, operationId, userId, role, cancellationToken) is null)
            {
                await transaction.DisposeAsync();
                await SweepAsync(store, logger, originalKey, thumbnailKey);
                return Results.NotFound();
            }

            var earlier = await db.AiChangeMedia.FirstOrDefaultAsync(row => row.OperationId == operationId, cancellationToken);
            if (earlier is not null)
            {
                replaced = [earlier.OriginalKey, earlier.ThumbnailKey];
                db.AiChangeMedia.Remove(earlier);
            }

            db.AiChangeMedia.Add(new AiChangeMedia
            {
                Id = Guid.NewGuid(),
                UniverseId = universeId,
                OperationId = operationId,
                EntityId = media.EntityId,
                AppearanceId = media.AppearanceId,
                AssetId = assetId,
                ThumbnailId = thumbnailId,
                OriginalKey = originalKey,
                ThumbnailKey = thumbnailKey,
                ContentType = prepared.ContentType,
                FileName = EntityImageEndpoints.TrimFileName(file.FileName),
                Width = prepared.Width,
                Height = prepared.Height,
                ByteSize = bytes.Length,
                CropX = prepared.Crop.X,
                CropY = prepared.Crop.Y,
                CropWidth = prepared.Crop.Width,
                CropHeight = prepared.Crop.Height,
                UploadedByUserId = userId,
                UploadedAt = clock.GetUtcNow().UtcDateTime,
            });
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (Exception)
        {
            await SweepAsync(store, logger, originalKey, thumbnailKey);
            throw;
        }

        if (replaced.Length > 0)
        {
            await SweepAsync(store, logger, replaced);
        }

        return Results.Ok(await AiChangeViews.ReadAsync(db, universeId, proposalId, userId, role, cancellationToken));
    }

    /// <summary>The preview: whoever may read the proposal, while the file is held for it. Never cached beyond the session.</summary>
    private static async Task<IResult> ReadAsync(
        Guid universeId,
        Guid proposalId,
        Guid operationId,
        bool thumbnail,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        var (denied, role) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var userId = principal.RequireUserId();
        var mayReview = AiChangePermissions.MayReview(role);
        var mayRead = await db.AiChangeOperations.AsNoTracking().AnyAsync(
            operation => operation.Id == operationId
                && operation.ProposalId == proposalId
                && operation.Proposal!.UniverseId == universeId
                && (mayReview || operation.Proposal.ProposedByUserId == userId),
            cancellationToken);
        var media = mayRead
            ? await db.AiChangeMedia.AsNoTracking().FirstOrDefaultAsync(row => row.OperationId == operationId && row.UniverseId == universeId, cancellationToken)
            : null;
        if (media is null)
        {
            return Results.NotFound();
        }

        try
        {
            var stored = await store.GetAsync(thumbnail ? media.ThumbnailKey : media.OriginalKey, cancellationToken);
            if (stored is null)
            {
                return Results.NotFound();
            }

            context.Response.Headers.CacheControl = "private, no-store";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.Stream(stored.Content, thumbnail ? "image/webp" : media.ContentType);
        }
        catch (MediaStorageException exception)
        {
            return Unavailable(exception);
        }
    }

    /// <summary>The media change a person may hand a picture to now: pending, in an open proposal, theirs or theirs to approve.</summary>
    private static async Task<MediaValues?> PendingAsync(
        LorexDbContext db,
        Guid universeId,
        Guid proposalId,
        Guid operationId,
        string userId,
        UniverseRole role,
        CancellationToken cancellationToken)
    {
        var mayReview = AiChangePermissions.MayReview(role);
        var proposed = await db.AiChangeOperations.AsNoTracking()
            .Where(operation => operation.Id == operationId
                && operation.ProposalId == proposalId
                && operation.Proposal!.UniverseId == universeId
                && operation.Proposal.Status == AiChangeProposalStatus.Open
                && operation.Status == AiChangeOperationStatus.Pending
                && operation.Resource == AiChangeResource.Media
                && (mayReview || operation.Proposal.ProposedByUserId == userId))
            .Select(operation => operation.Proposed)
            .FirstOrDefaultAsync(cancellationToken);
        return proposed is null ? null : (MediaValues)AiChangeJson.ReadProposed(AiChangeResource.Media, AiChangeAction.Create, proposed);
    }

    internal static Task SweepAsync(IMediaObjectStore store, ILogger logger, params string[] keys) =>
        MediaObjectWrites.SweepAsync(store, logger, LogOrphan, keys);

    [LoggerMessage(Level = LogLevel.Warning, Message = "A quarantined AI change picture object could not be deleted and is left in storage: {Key}.")]
    private static partial void LogOrphan(ILogger logger, string key, Exception exception);

    private static IResult Invalid(string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [ImagePreparation.FileField] = [message] });

    private static IResult Unavailable(MediaStorageException exception) =>
        Results.Problem(title: "Image storage is unavailable.", detail: exception.Message, statusCode: StatusCodes.Status503ServiceUnavailable);

    private static string Megabytes(long bytes) => (bytes / (1024.0 * 1024.0)).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);
}

/// <summary>
/// Clears the quarantine (ADR 0062), hourly and at start-up: every held picture whose change is no longer waiting - rejected,
/// expired, applied without it, its proposal or universe gone - has its objects deleted, then its row. An attached picture's
/// row went with the approval, so its objects are never touched here. Best effort: a failed delete is logged and the row kept
/// for the next round.
/// </summary>
internal sealed partial class AiChangeMediaSweep(
    IServiceScopeFactory scopes,
    LorexDatabaseInitializer database,
    TimeProvider clock,
    ILogger<AiChangeMediaSweep> logger) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await database.EnsureSchemaAsync(stoppingToken);

        using var timer = new PeriodicTimer(Interval, clock);
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await SweepAsync(
                    scope.ServiceProvider.GetRequiredService<LorexDbContext>(),
                    scope.ServiceProvider.GetRequiredService<IMediaObjectStore>(),
                    logger,
                    stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                LogSweepFailed(logger, exception);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>One round: the abandoned rows, their objects deleted first, the rows only for those whose objects went.</summary>
    internal static async Task<int> SweepAsync(LorexDbContext db, IMediaObjectStore store, ILogger logger, CancellationToken cancellationToken)
    {
        var abandoned = await db.AiChangeMedia
            .Where(media => !db.AiChangeOperations.Any(operation => operation.Id == media.OperationId
                && operation.Status == AiChangeOperationStatus.Pending
                && operation.Proposal!.Status == AiChangeProposalStatus.Open))
            .Take(500)
            .ToListAsync(cancellationToken);

        var gone = new List<AiChangeMedia>();
        foreach (var media in abandoned)
        {
            try
            {
                await store.DeleteAsync(media.OriginalKey, cancellationToken);
                await store.DeleteAsync(media.ThumbnailKey, cancellationToken);
                gone.Add(media);
            }
            catch (MediaStorageException exception)
            {
                LogDeleteFailed(logger, media.Id, exception);
            }
        }

        db.AiChangeMedia.RemoveRange(gone);
        await db.SaveChangesAsync(cancellationToken);
        return gone.Count;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The AI change picture quarantine sweep failed; the next one will try again.")]
    private static partial void LogSweepFailed(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "A quarantined AI change picture {MediaId} could not be deleted; it is kept for the next sweep.")]
    private static partial void LogDeleteFailed(ILogger logger, Guid mediaId, Exception exception);
}
