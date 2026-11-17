using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Storage;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Covers;

/// <summary>
/// A story's and a project's cover: set it, reframe its card, remove it, and read both objects. The universe artwork's
/// design (<see cref="UniverseArtworkEndpoints"/>) on the shared image gate, with two differences: who may ask (anyone who
/// can read the universe reads, anyone who can edit its content writes) and the account's storage, which an original
/// counts against as every other authored picture does (ADR 0042). The frame is the subject's: a story's card is a 2:3
/// book cover, a project's a 16:10 screen (a comic's a 2:3 issue cover), and the server checks the crop against it on every route.
/// </summary>
public static partial class CoverEndpoints
{
    public const string CoverChangedCode = "cover_changed";

    public const string OriginalUnavailableCode = "cover_original_unavailable";

    internal const string LoggerName = "LorEvolve.Covers";

    private const long RequestBodyCeiling = ImagePreparation.MaxUploadBytes * 2;

    private const int InMemoryBodyThreshold = (int)ImagePreparation.MaxUploadBytes + 64 * 1024;

    /// <summary>What a cover belongs to, once the caller has been let in.</summary>
    private sealed record Subject(Guid UniverseId, Guid SubjectId, string OwnerId, string Kind, ImageFrame Frame);

    public static IEndpointRouteBuilder MapCoverEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var story = endpoints.MapGroup("/api/universes/{universeId:guid}/stories/{storyId:guid}/cover")
            .WithTags("Stories")
            .RequireAuthorization();

        story.MapGet("/", (Guid universeId, Guid storyId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken ct) =>
                GetAsync(db.StoryCovers, StoryAsync(db, universeId, storyId, principal, UniverseCapability.Read, ct), ct))
            .WithName("GetStoryCover");
        Upload(story.MapPut("/", (Guid universeId, Guid storyId, IFormFile? file, [FromForm(Name = "crop")] string? crop, ClaimsPrincipal principal,
                LorEvolveDbContext db, IMediaObjectStore store, TimeProvider clock, ILoggerFactory loggers, CancellationToken ct) =>
                UploadAsync(db, db.StoryCovers, NewStoryCover, StoryAsync(db, universeId, storyId, principal, UniverseCapability.EditContent, ct),
                    file, crop, principal, store, clock, loggers, ct)))
            .WithName("SetStoryCover");
        story.MapPut("/card", (Guid universeId, Guid storyId, UniverseArtworkCardRequest request, ClaimsPrincipal principal,
                LorEvolveDbContext db, IMediaObjectStore store, ILoggerFactory loggers, CancellationToken ct) =>
                ReframeAsync(db.StoryCovers, StoryAsync(db, universeId, storyId, principal, UniverseCapability.EditContent, ct), request, store, loggers, ct))
            .WithName("SetStoryCoverCard");
        story.MapDelete("/", (Guid universeId, Guid storyId, ClaimsPrincipal principal, LorEvolveDbContext db, IMediaObjectStore store,
                ILoggerFactory loggers, CancellationToken ct) =>
                RemoveAsync(db, db.StoryCovers, StoryAsync(db, universeId, storyId, principal, UniverseCapability.EditContent, ct), store, loggers, ct))
            .WithName("RemoveStoryCover");
        story.MapGet("/{assetId:guid}/original", (Guid universeId, Guid storyId, Guid assetId, ClaimsPrincipal principal, LorEvolveDbContext db,
                IMediaObjectStore store, ILoggerFactory loggers, HttpContext context, CancellationToken ct) =>
                ReadAsync(db.StoryCovers, StoryAsync(db, universeId, storyId, principal, UniverseCapability.Read, ct), assetId, null, store, loggers, context, ct))
            .WithName("ReadStoryCoverOriginal");
        story.MapGet("/{assetId:guid}/card/{cardId:guid}", (Guid universeId, Guid storyId, Guid assetId, Guid cardId, ClaimsPrincipal principal,
                LorEvolveDbContext db, IMediaObjectStore store, ILoggerFactory loggers, HttpContext context, CancellationToken ct) =>
                ReadAsync(db.StoryCovers, StoryAsync(db, universeId, storyId, principal, UniverseCapability.Read, ct), assetId, cardId, store, loggers, context, ct))
            .WithName("ReadStoryCoverCard");

        var project = endpoints.MapGroup("/api/projects/{projectId:guid}/cover")
            .WithTags("Projects")
            .RequireAuthorization();

        project.MapGet("/", (Guid projectId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken ct) =>
                GetAsync(db.ProjectCovers, ProjectAsync(db, projectId, principal, write: false, ct), ct))
            .WithName("GetProjectCover");
        Upload(project.MapPut("/", (Guid projectId, IFormFile? file, [FromForm(Name = "crop")] string? crop, ClaimsPrincipal principal,
                LorEvolveDbContext db, IMediaObjectStore store, TimeProvider clock, ILoggerFactory loggers, CancellationToken ct) =>
                UploadAsync(db, db.ProjectCovers, NewProjectCover, ProjectAsync(db, projectId, principal, write: true, ct),
                    file, crop, principal, store, clock, loggers, ct)))
            .WithName("SetProjectCover");
        project.MapPut("/card", (Guid projectId, UniverseArtworkCardRequest request, ClaimsPrincipal principal,
                LorEvolveDbContext db, IMediaObjectStore store, ILoggerFactory loggers, CancellationToken ct) =>
                ReframeAsync(db.ProjectCovers, ProjectAsync(db, projectId, principal, write: true, ct), request, store, loggers, ct))
            .WithName("SetProjectCoverCard");
        project.MapDelete("/", (Guid projectId, ClaimsPrincipal principal, LorEvolveDbContext db, IMediaObjectStore store,
                ILoggerFactory loggers, CancellationToken ct) =>
                RemoveAsync(db, db.ProjectCovers, ProjectAsync(db, projectId, principal, write: true, ct), store, loggers, ct))
            .WithName("RemoveProjectCover");
        project.MapGet("/{assetId:guid}/original", (Guid projectId, Guid assetId, ClaimsPrincipal principal, LorEvolveDbContext db,
                IMediaObjectStore store, ILoggerFactory loggers, HttpContext context, CancellationToken ct) =>
                ReadAsync(db.ProjectCovers, ProjectAsync(db, projectId, principal, write: false, ct), assetId, null, store, loggers, context, ct))
            .WithName("ReadProjectCoverOriginal");
        project.MapGet("/{assetId:guid}/card/{cardId:guid}", (Guid projectId, Guid assetId, Guid cardId, ClaimsPrincipal principal,
                LorEvolveDbContext db, IMediaObjectStore store, ILoggerFactory loggers, HttpContext context, CancellationToken ct) =>
                ReadAsync(db.ProjectCovers, ProjectAsync(db, projectId, principal, write: false, ct), assetId, cardId, store, loggers, context, ct))
            .WithName("ReadProjectCoverCard");

        return endpoints;
    }

    // PUT and a multipart body, with antiforgery off, for the reasons the profile photo gives.
    private static RouteHandlerBuilder Upload(RouteHandlerBuilder route) =>
        route.DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling))
            .WithMetadata(new RequestFormLimitsAttribute { MemoryBufferThreshold = InMemoryBodyThreshold });

    private static StoryCover NewStoryCover() => new() { OriginalKey = string.Empty, CardKey = string.Empty, ContentType = string.Empty };

    private static ProjectCover NewProjectCover() => new() { OriginalKey = string.Empty, CardKey = string.Empty, ContentType = string.Empty };

    // ---------- Who may ask ----------

    /// <summary>A live story of this universe, past the universe's matrix: 404 without access or story, 403 with too little.</summary>
    private static async Task<(Subject? Subject, IResult? Denied)> StoryAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        UniverseCapability capability,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, capability, cancellationToken) is { } denied)
        {
            return (null, denied);
        }

        var ownerId = await db.Stories.AsNoTracking()
            .Where(story => story.Id == storyId && story.UniverseId == universeId && story.DeletedAt == null)
            .Select(story => story.Universe!.OwnerId)
            .FirstOrDefaultAsync(cancellationToken);

        return ownerId is null
            ? (null, Results.NotFound())
            : (new Subject(universeId, storyId, ownerId, CoverKeys.Stories, CoverFrames.Story), null);
    }

    /// <summary>A project, through its universe exactly as every project route resolves it.</summary>
    private static async Task<(Subject? Subject, IResult? Denied)> ProjectAsync(
        LorEvolveDbContext db,
        Guid projectId,
        ClaimsPrincipal principal,
        bool write,
        CancellationToken cancellationToken)
    {
        var (project, denied) = write
            ? await ProjectEntityTypeEndpoints.WritableAsync(db, projectId, principal, cancellationToken)
            : await ProjectEntityTypeEndpoints.ReadableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return (null, denied);
        }

        var ownerId = await db.Universes.AsNoTracking()
            .Where(universe => universe.Id == project!.UniverseId)
            .Select(universe => universe.OwnerId)
            .FirstAsync(cancellationToken);

        return (new Subject(project!.UniverseId, projectId, ownerId, CoverKeys.Projects, CoverFrames.For(project.Kind)), null);
    }

    // ---------- The routes, for either kind of cover ----------

    private static async Task<IResult> GetAsync<TCover>(
        DbSet<TCover> covers,
        Task<(Subject? Subject, IResult? Denied)> access,
        CancellationToken cancellationToken)
        where TCover : CoverImage
    {
        var (subject, denied) = await access;
        if (denied is not null)
        {
            return denied;
        }

        var cover = await covers.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.SubjectId == subject!.SubjectId, cancellationToken);

        return cover is null ? Results.NoContent() : Results.Ok(UniverseArtworkRef.Of(cover));
    }

    /// <summary>
    /// Stores a new cover: the picture is checked first, then the growth is held against the universe owner's storage,
    /// both objects are written under ids nothing uses, and only then does the row move - inside the writer lock, and only
    /// if the subject is still there and still holds what this upload was measured against. The superseded pair goes last.
    /// </summary>
    private static async Task<IResult> UploadAsync<TCover>(
        LorEvolveDbContext db,
        DbSet<TCover> covers,
        Func<TCover> create,
        Task<(Subject? Subject, IResult? Denied)> access,
        IFormFile? file,
        string? crop,
        ClaimsPrincipal principal,
        IMediaObjectStore store,
        TimeProvider clock,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
        where TCover : CoverImage
    {
        var (subject, denied) = await access;
        if (denied is not null)
        {
            return denied;
        }

        if (file is null || file.Length == 0)
        {
            return Problems.Field(ImagePreparation.FileField, "Choose a picture to upload.");
        }

        ImageCrop? requestedCrop = null;
        if (!string.IsNullOrWhiteSpace(crop))
        {
            requestedCrop = ImagePreparation.ReadCrop(crop);

            if (requestedCrop is null)
            {
                return Problems.Field(ImagePreparation.CropField, "The card selection could not be read.");
            }
        }

        await using var upload = file.OpenReadStream();
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, requestedCrop, subject!.Frame, cancellationToken);

        if (prepared is null)
        {
            return Problems.Field(rejection!.Field, rejection.Message);
        }

        var logger = loggerFactory.CreateLogger(LoggerName);

        var existing = await covers.FirstOrDefaultAsync(candidate => candidate.SubjectId == subject.SubjectId, cancellationToken);
        var replacedAssetId = existing?.AssetId;

        // Only growth is held: the bytes received less the original this one replaces (ADR 0042).
        var growth = bytes.Length - (existing?.ByteSize ?? 0);
        StorageHold? hold = null;

        if (growth > 0)
        {
            hold = await AccountStorage.ReserveAsync(db, clock, subject.OwnerId, growth, cancellationToken);

            if (hold is null)
            {
                return StorageQuota.Exceeded(isOwner: subject.OwnerId == principal.RequireUserId());
            }
        }

        var committed = false;
        try
        {
            var assetId = Guid.NewGuid();
            var cardId = Guid.NewGuid();
            var originalKey = CoverKeys.Original(subject.Kind, subject.UniverseId, subject.SubjectId, assetId, prepared.Extension);
            var cardKey = CoverKeys.Card(subject.Kind, subject.UniverseId, subject.SubjectId, assetId, cardId);

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
                return MediaProblem.Unavailable(exception);
            }
            catch (MediaStorageFailedException exception)
            {
                LogStorageFailure(logger, "upload", exception);
                await MediaObjectWrites.SweepAsync(store, logger, originalKey, cardKey);
                return MediaProblem.Unavailable(exception);
            }
            catch (Exception)
            {
                await MediaObjectWrites.SweepAsync(store, logger, originalKey, cardKey);
                throw;
            }

            var stored = existing ?? create();
            string? supersededOriginal = null;
            string? supersededCard = null;
            var subjectGone = false;

            try
            {
                await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

                var live = subject.Kind == CoverKeys.Stories
                    ? await db.Stories.AnyAsync(story => story.Id == subject.SubjectId && story.DeletedAt == null, cancellationToken)
                    : await db.CreativeProjects.AnyAsync(project => project.Id == subject.SubjectId, cancellationToken);
                var current = live
                    ? await covers.AsNoTracking()
                        .Where(candidate => candidate.SubjectId == subject.SubjectId)
                        .Select(candidate => new { candidate.AssetId, candidate.OriginalKey, candidate.CardKey })
                        .FirstOrDefaultAsync(cancellationToken)
                    : null;

                subjectGone = !live;
                if (live && current?.AssetId == replacedAssetId)
                {
                    supersededOriginal = current?.OriginalKey;
                    supersededCard = current?.CardKey;

                    await AccountStorage.ConsumeAsync(db, clock, hold, cancellationToken);

                    stored.SubjectId = subject.SubjectId;
                    stored.UniverseId = subject.UniverseId;
                    stored.AssetId = assetId;
                    stored.CardId = cardId;
                    stored.OriginalKey = originalKey;
                    stored.CardKey = cardKey;
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
                        covers.Add(stored);
                    }

                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    committed = true;
                }
            }
            catch (StorageQuotaExceededException)
            {
                await MediaObjectWrites.SweepAsync(store, logger, originalKey, cardKey);
                return StorageQuota.Exceeded(isOwner: subject.OwnerId == principal.RequireUserId());
            }
            catch (Exception)
            {
                await MediaObjectWrites.SweepAsync(store, logger, originalKey, cardKey);
                throw;
            }

            if (!committed)
            {
                await MediaObjectWrites.SweepAsync(store, logger, originalKey, cardKey);
                return subjectGone ? Results.NotFound() : EntityImageEndpoints.ReplacedMeanwhile();
            }

            await MediaObjectWrites.SweepAsync(store, logger, supersededOriginal, supersededCard);

            return Results.Ok(UniverseArtworkRef.Of(stored));
        }
        finally
        {
            if (!committed)
            {
                await AccountStorage.ReleaseAsync(db, hold, logger);
            }
        }
    }

    /// <summary>
    /// Cuts a new card from the stored original, which is read back and never written. The row moves only if it still
    /// names the asset and card that were read. The original's bytes do not change, so storage does not either.
    /// </summary>
    private static async Task<IResult> ReframeAsync<TCover>(
        DbSet<TCover> covers,
        Task<(Subject? Subject, IResult? Denied)> access,
        UniverseArtworkCardRequest request,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
        where TCover : CoverImage
    {
        var (subject, denied) = await access;
        if (denied is not null)
        {
            return denied;
        }

        var cover = await covers.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.SubjectId == subject!.SubjectId, cancellationToken);

        if (cover is null)
        {
            return Results.NotFound();
        }

        if (request.Crop is null)
        {
            return Problems.Field(ImagePreparation.CropField, "Choose the part of the picture the card shows.");
        }

        if (ImagePreparation.CheckCrop(request.Crop, subject!.Frame) is { } badCrop)
        {
            return Problems.Field(ImagePreparation.CropField, badCrop);
        }

        if (request.AssetId != cover.AssetId)
        {
            return Changed();
        }

        var logger = loggerFactory.CreateLogger(LoggerName);

        using var bytes = new MemoryStream();
        try
        {
            var original = await store.GetAsync(cover.OriginalKey, cancellationToken);
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
            return MediaProblem.Unavailable(exception);
        }
        catch (Exception exception) when (exception is MediaStorageFailedException
            or IOException
            or HttpRequestException)
        {
            LogStorageFailure(logger, "reframe", exception);
            return MediaProblem.Unavailable(exception as MediaStorageException
                ?? new MediaStorageFailedException("Image storage could not complete the request.", exception));
        }

        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(
            bytes, bytes.Length, request.Crop, subject.Frame, cancellationToken);

        if (prepared is null)
        {
            return rejection!.Field == ImagePreparation.CropField
                ? Problems.Field(ImagePreparation.CropField, rejection.Message)
                : OriginalUnavailable();
        }

        var cardId = Guid.NewGuid();
        var cardKey = CoverKeys.Card(subject.Kind, subject.UniverseId, subject.SubjectId, cover.AssetId, cardId);

        try
        {
            using var card = new MemoryStream(prepared.Thumbnail, writable: false);
            await store.PutAsync(cardKey, card, "image/webp", cancellationToken);
        }
        catch (MediaStorageUnavailableException exception)
        {
            return MediaProblem.Unavailable(exception);
        }
        catch (MediaStorageFailedException exception)
        {
            LogStorageFailure(logger, "reframe", exception);
            await MediaObjectWrites.SweepAsync(store, logger, cardKey);
            return MediaProblem.Unavailable(exception);
        }
        catch (Exception)
        {
            await MediaObjectWrites.SweepAsync(store, logger, cardKey);
            throw;
        }

        int moved;
        try
        {
            moved = await covers
                .Where(candidate => candidate.SubjectId == subject.SubjectId
                    && candidate.AssetId == cover.AssetId
                    && candidate.CardId == cover.CardId)
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
            await MediaObjectWrites.SweepAsync(store, logger, cardKey);
            throw;
        }

        if (moved == 0)
        {
            await MediaObjectWrites.SweepAsync(store, logger, cardKey);
            return Changed();
        }

        await MediaObjectWrites.SweepAsync(store, logger, cover.CardKey);

        cover.CardId = cardId;
        cover.CardKey = cardKey;
        cover.Width = prepared.Width;
        cover.Height = prepared.Height;
        (cover.CropX, cover.CropY, cover.CropWidth, cover.CropHeight) =
            (prepared.Crop.X, prepared.Crop.Y, prepared.Crop.Width, prepared.Crop.Height);

        return Results.Ok(UniverseArtworkRef.Of(cover));
    }

    /// <summary>Clears the association, then cleans the bucket. Removing what is not there is already done.</summary>
    private static async Task<IResult> RemoveAsync<TCover>(
        LorEvolveDbContext db,
        DbSet<TCover> covers,
        Task<(Subject? Subject, IResult? Denied)> access,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
        where TCover : CoverImage
    {
        var (subject, denied) = await access;
        if (denied is not null)
        {
            return denied;
        }

        var cover = await covers.FirstOrDefaultAsync(candidate => candidate.SubjectId == subject!.SubjectId, cancellationToken);
        if (cover is null)
        {
            return Results.NoContent();
        }

        covers.Remove(cover);
        await db.SaveChangesAsync(cancellationToken);

        await MediaObjectWrites.SweepAsync(store, loggerFactory.CreateLogger(LoggerName), cover.OriginalKey, cover.CardKey);

        return Results.NoContent();
    }

    /// <summary>One object. Both ids in the route are checked against the row, so an address stops resolving the moment what it named is replaced or reframed.</summary>
    private static async Task<IResult> ReadAsync<TCover>(
        DbSet<TCover> covers,
        Task<(Subject? Subject, IResult? Denied)> access,
        Guid assetId,
        Guid? cardId,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken)
        where TCover : CoverImage
    {
        var (subject, denied) = await access;
        if (denied is not null)
        {
            return denied;
        }

        var cover = await covers.AsNoTracking()
            .Where(candidate => candidate.SubjectId == subject!.SubjectId && candidate.AssetId == assetId)
            .Select(candidate => new { candidate.OriginalKey, candidate.CardId, candidate.CardKey, candidate.ContentType })
            .FirstOrDefaultAsync(cancellationToken);

        if (cover is null || (cardId is not null && cardId != cover.CardId))
        {
            return Results.NotFound();
        }

        StoredMediaObject? stored;
        try
        {
            stored = await store.GetAsync(cardId is null ? cover.OriginalKey : cover.CardKey, cancellationToken);
        }
        catch (MediaStorageException exception)
        {
            if (exception is MediaStorageFailedException)
            {
                LogStorageFailure(loggerFactory.CreateLogger(LoggerName), "read", exception);
            }

            return MediaProblem.Unavailable(exception);
        }

        if (stored is null)
        {
            return Results.NotFound();
        }

        context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        context.Response.Headers.XContentTypeOptions = "nosniff";

        return Results.Stream(stored.Content, cardId is null ? cover.ContentType : "image/webp", enableRangeProcessing: false);
    }

    // ---------- For the lists that show covers ----------

    /// <summary>The covers of these stories, by story.</summary>
    internal static async Task<Dictionary<Guid, UniverseArtworkRef>> StoryCoversAsync(
        LorEvolveDbContext db, IReadOnlyCollection<Guid> storyIds, CancellationToken cancellationToken) =>
        (await db.StoryCovers.AsNoTracking().Where(cover => storyIds.Contains(cover.SubjectId)).ToListAsync(cancellationToken))
            .ToDictionary(cover => cover.SubjectId, UniverseArtworkRef.Of);

    /// <summary>The covers of these projects, by project.</summary>
    internal static async Task<Dictionary<Guid, UniverseArtworkRef>> ProjectCoversAsync(
        LorEvolveDbContext db, IReadOnlyCollection<Guid> projectIds, CancellationToken cancellationToken) =>
        (await db.ProjectCovers.AsNoTracking().Where(cover => projectIds.Contains(cover.SubjectId)).ToListAsync(cancellationToken))
            .ToDictionary(cover => cover.SubjectId, UniverseArtworkRef.Of);

    [LoggerMessage(
        Level = LogLevel.Error,
        Message = "Cover storage failed during {Operation}. Nothing was changed.")]
    private static partial void LogStorageFailure(ILogger logger, string operation, Exception exception);

    private static IResult Changed() =>
        Results.Problem(
            title: "The cover changed while it was being framed.",
            detail: "This cover was replaced somewhere else. Open it again to choose the framing.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = CoverChangedCode });

    private static IResult OriginalUnavailable() =>
        Results.Problem(
            title: "The stored cover could not be read.",
            detail: "Its card cannot be cut again. Upload the picture again to replace it.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = OriginalUnavailableCode });
}
