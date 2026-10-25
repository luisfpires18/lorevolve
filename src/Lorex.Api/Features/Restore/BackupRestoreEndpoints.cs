using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Storage;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Lorex.Api.Features.Restore;

/// <summary>
/// Restoring a backup as a new universe: validate, then restore. See ADR 0032.
///
/// <para><b>Two steps, and the second never trusts the first's client.</b> <c>PUT /api/backups/validate</c>
/// takes the archive as the request body, reads and validates it, keeps the file, and answers with a preview
/// and a token. <c>POST /api/backups/restore</c> names the token and the new universe's name - nothing else
/// the client could have edited - and validates the kept file again before writing a row. The preview's
/// counts are the server's, and are never sent back.</para>
///
/// <para><b>No overwrite, no merge.</b> Neither route takes a universe id. A restore creates a universe, owned
/// by whoever is signed in; there is no request that could make it write into one that exists.</para>
///
/// <para><b>Why the upload is a <c>PUT</c> of the raw file.</b> The body is the archive itself rather than a
/// multipart form, so it is streamed straight to the staging file with its size counted as it arrives, and
/// no form reader buffers it first. <c>PUT</c> for the reason the image uploads give: a cross-site HTML form
/// cannot send one, on top of the <c>SameSite=Strict</c> cookie.</para>
///
/// <para>Every refusal is a problem response carrying a stable <c>code</c> and the author-facing
/// <c>issues</c> - never an exception message, a stack, SQL, a path on this machine or an object key.</para>
/// </summary>
public static partial class BackupRestoreEndpoints
{
    public const string ExpiredCode = "backup_restore_expired";
    public const string BusyCode = "backup_restore_busy";
    public const string InProgressCode = "backup_restore_in_progress";
    public const string StorageCode = "backup_restore_storage";
    public const string FailedCode = "backup_restore_failed";

    /// <summary>A backstop above the friendly limit, which is the one the body is counted against.</summary>
    private const long RequestBodyCeiling = BackupRestoreLimits.MaxUploadBytes + (1024 * 1024);

    public static IServiceCollection AddBackupRestore(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<BackupRestoreStaging>();
        return services;
    }

    public static IEndpointRouteBuilder MapBackupRestoreEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/backups")
            .WithTags("Backups")
            .RequireAuthorization();

        group.MapPut("/validate", ValidateAsync)
            .WithName("ValidateBackup")
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling));

        group.MapPost("/restore", RestoreAsync).WithName("RestoreBackup");

        group.MapDelete("/validate/{token}", DiscardAsync).WithName("DiscardBackup");

        return endpoints;
    }

    // ---------- Validate ----------

    private static async Task<IResult> ValidateAsync(
        HttpContext context,
        ClaimsPrincipal principal,
        LorexDbContext db,
        BackupRestoreStaging staging,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();
        var logger = loggerFactory.CreateLogger("Lorex.Restore");
        var declared = context.Request.ContentLength;

        if (declared > BackupRestoreLimits.MaxUploadBytes)
        {
            return Rejected(BackupArchiveReader.TooLarge());
        }

        var staged = staging.Reserve(ownerId, declared ?? BackupRestoreLimits.MaxUploadBytes);

        if (staged is null)
        {
            return Results.Problem(
                title: "Lorex cannot take another backup right now.",
                detail: "Too many backups are waiting to be restored at once. Try again in a few minutes.",
                statusCode: StatusCodes.Status503ServiceUnavailable,
                extensions: new Dictionary<string, object?> { ["code"] = BusyCode });
        }

        try
        {
            long received;

            await using (var file = new FileStream(staged.Path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81_920, FileOptions.Asynchronous))
            {
                received = await CopyBoundedAsync(context.Request.Body, file, cancellationToken);
            }

            if (received == 0)
            {
                throw BackupRejectedException.One(BackupRejection.NotABackup, BackupIssueCodes.NotABackup, "Choose a backup file to restore.");
            }

            BackupPreview preview;

            await using (var file = OpenForReading(staged))
            using (var opened = await BackupArchiveReader.OpenAsync(file, cancellationToken))
            {
                var restorable = await BackupValidation.ValidateAsync(opened, cancellationToken);
                preview = await PreviewAsync(db, ownerId, restorable, opened.Backup.Payload.Universe, cancellationToken);
            }

            staging.MarkReady(staged, received);

            return Results.Ok(new BackupValidationResponse(staged.Token, staged.ExpiresAt.UtcDateTime, preview));
        }
        catch (BackupRejectedException rejected)
        {
            staging.Discard(staged);
            LogRejected(logger, rejected.Rejection, rejected.Issues.Count + rejected.MoreIssues);
            return Rejected(rejected);
        }
        catch (BadHttpRequestException exception) when (exception.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            staging.Discard(staged);
            return Rejected(BackupArchiveReader.TooLarge());
        }
        catch
        {
            staging.Discard(staged);
            throw;
        }
    }

    /// <summary>The body into the staging file, refused the moment it passes the limit rather than after it has all arrived.</summary>
    private static async Task<long> CopyBoundedAsync(Stream body, Stream file, CancellationToken cancellationToken)
    {
        var buffer = new byte[81_920];
        long total = 0;
        int read;

        while ((read = await body.ReadAsync(buffer, cancellationToken)) > 0)
        {
            total += read;

            if (total > BackupRestoreLimits.MaxUploadBytes)
            {
                throw BackupArchiveReader.TooLarge();
            }

            await file.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }

        return total;
    }

    private static async Task<BackupPreview> PreviewAsync(
        LorexDbContext db,
        string ownerId,
        RestorableBackup restorable,
        BackupUniverse universe,
        CancellationToken cancellationToken)
    {
        var name = universe.Name.Trim();
        var available = UniverseEndpoints.NameError(name) is null
            && !await db.Universes.AnyAsync(candidate => candidate.OwnerId == ownerId && candidate.Name == name, cancellationToken);

        return new BackupPreview(
            universe.Name,
            universe.Description,
            universe.AccentColor,
            universe.IsArchived,
            restorable.FormatVersion,
            restorable.GeneratedAt,
            available,
            restorable.Counts);
    }

    // ---------- Restore ----------

    private static async Task<IResult> RestoreAsync(
        [FromBody] RestoreBackupRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        CanonIntegrityEvaluator evaluator,
        BackupRestoreStaging staging,
        TimeProvider clock,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();
        var logger = loggerFactory.CreateLogger("Lorex.Restore");

        // Another account's token, an expired one and one that never existed are one answer.
        var staged = staging.Find(request.Token, ownerId);

        if (staged is null)
        {
            return Expired();
        }

        if (UniverseEndpoints.NameError(request.Name) is { } nameError)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = [nameError] });
        }

        var name = request.Name!.Trim();

        if (!staged.TryBegin())
        {
            return Results.Problem(
                title: "This backup is already being restored.",
                detail: "Wait for the restore that is running to finish.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = InProgressCode });
        }

        try
        {
            Universe universe;

            try
            {
                await using var file = OpenForReading(staged);
                using var opened = await BackupArchiveReader.OpenAsync(file, cancellationToken);

                // Again, on the bytes that are about to be written: nothing validated a moment ago is assumed.
                var restorable = await BackupValidation.ValidateAsync(opened, cancellationToken);

                // The restored universe is the restorer's, so its entries' pictures are their storage, held before
                // a byte of them is stored and consumed by the commit that writes the universe (ADR 0042). The
                // artwork is not a Lore picture and does not count.
                var imageBytes = restorable.Images.Values.Sum(image => image.ByteSize)
                    + (restorable.AppearanceImages?.Values.Sum(image => image.ByteSize) ?? 0)
                    + (restorable.MapImages?.Values.Sum(image => image.ByteSize) ?? 0);
                StorageHold? hold = null;

                if (imageBytes > 0)
                {
                    hold = await AccountStorage.ReserveAsync(db, clock, ownerId, imageBytes, cancellationToken);

                    if (hold is null)
                    {
                        return NoRoom();
                    }
                }

                try
                {
                    universe = await new UniverseRestore(db, store, evaluator, clock, logger)
                        .RestoreAsync(restorable, opened, ownerId, name, hold, cancellationToken);
                }
                catch
                {
                    // Nothing was committed, so the room goes back. A restore that committed consumed it.
                    await AccountStorage.ReleaseAsync(db, hold, logger);
                    throw;
                }
            }
            catch (StorageQuotaExceededException)
            {
                // The hold lapsed during a long restore and the room went meanwhile. Nothing was kept.
                return NoRoom();
            }
            catch (FileNotFoundException)
            {
                return Expired();
            }

            // Only once the file is closed, which is what lets it be deleted on every platform.
            staging.Discard(staged);
            LogRestored(logger, universe.Id);

            return Results.Created(
                $"/api/universes/{universe.Id}",
                new UniverseDetail(
                    universe.Id,
                    universe.Name,
                    universe.Description,
                    universe.AccentColor,
                    universe.IsArchived,
                    universe.CreatedAt,
                    universe.UpdatedAt,

                    // A restored universe is the restoring account's alone: no membership is ever restored (ADR 0041).
                    UniverseRole.Owner,

                    // A backup carries its artwork and the restore has just stored it, under new ids.
                    await UniverseEndpoints.ArtworkIdentityAsync(db, universe.Id, cancellationToken)));
        }
        catch (BackupRejectedException rejected)
        {
            staging.Discard(staged);
            LogRejected(logger, rejected.Rejection, rejected.Issues.Count + rejected.MoreIssues);
            return Rejected(rejected);
        }
        catch (RestoreNameTakenException)
        {
            // The upload stays waiting: the author only has to choose another name.
            return UniverseEndpoints.NameTakenProblem();
        }
        catch (MediaStorageException unavailable)
        {
            if (unavailable is MediaStorageFailedException)
            {
                LogStorageFailure(logger, unavailable);
            }

            return Results.Problem(
                title: "The backup's pictures could not be stored.",
                detail: $"{unavailable.Message} Nothing was restored, and the backup is still waiting - try again.",
                statusCode: StatusCodes.Status503ServiceUnavailable,
                extensions: new Dictionary<string, object?> { ["code"] = StorageCode });
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            LogRestoreFailed(logger, exception);

            return Results.Problem(
                title: "The backup could not be restored.",
                detail: "Something went wrong while the universe was being created, so nothing was kept. The backup is still waiting - try again.",
                statusCode: StatusCodes.Status500InternalServerError,
                extensions: new Dictionary<string, object?> { ["code"] = FailedCode });
        }
        finally
        {
            staged.End();
        }
    }

    /// <summary>
    /// The restorer's own storage has no room for the backup's pictures. The upload stays waiting, as it does for a
    /// taken name: room can be made and the restore tried again.
    /// </summary>
    private static IResult NoRoom() =>
        Results.Problem(
            title: "Not enough storage.",
            detail: "There isn't room in your storage for this backup's pictures. Remove some images, then try again. The backup is still waiting.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = StorageQuota.ExceededCode });

    // ---------- Discard ----------

    /// <summary>The author chose another file or gave up. Silent either way: a token that is not theirs is simply not found.</summary>
    private static IResult DiscardAsync(string token, ClaimsPrincipal principal, BackupRestoreStaging staging)
    {
        if (staging.Find(token, principal.RequireUserId()) is { InUse: false } staged)
        {
            staging.Discard(staged);
        }

        return Results.NoContent();
    }

    // ---------- Shared ----------

    private static FileStream OpenForReading(StagedBackup staged) =>
        new(staged.Path, FileMode.Open, FileAccess.Read, FileShare.Read, 81_920, FileOptions.Asynchronous | FileOptions.RandomAccess);

    private static IResult Rejected(BackupRejectedException rejected)
    {
        var total = rejected.Issues.Count + rejected.MoreIssues;

        return Results.Problem(
            title: "This backup cannot be restored.",
            detail: total == 1
                ? rejected.Issues[0].Message
                : $"Lorex found {total} problems in this backup, so it cannot be restored.",
            statusCode: rejected.Rejection == BackupRejection.TooLarge
                ? StatusCodes.Status413PayloadTooLarge
                : StatusCodes.Status400BadRequest,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = BackupIssueCodes.For(rejected.Rejection),
                ["issues"] = rejected.Issues,
                ["moreIssues"] = rejected.MoreIssues,
            });
    }

    private static IResult Expired() =>
        Results.Problem(
            title: "That backup is no longer waiting to be restored.",
            detail: "It expired, was restored already, or was replaced by another file. Choose the backup file again.",
            statusCode: StatusCodes.Status404NotFound,
            extensions: new Dictionary<string, object?> { ["code"] = ExpiredCode });

    [LoggerMessage(Level = LogLevel.Information, Message = "A backup was refused: {Rejection}, {IssueCount} problem(s).")]
    private static partial void LogRejected(ILogger logger, BackupRejection rejection, int issueCount);

    [LoggerMessage(Level = LogLevel.Information, Message = "A backup was restored as universe {UniverseId}.")]
    private static partial void LogRestored(ILogger logger, Guid universeId);

    [LoggerMessage(Level = LogLevel.Error, Message = "Image storage failed while restoring a backup. Nothing was restored.")]
    private static partial void LogStorageFailure(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "A backup could not be restored. Nothing was kept.")]
    private static partial void LogRestoreFailed(ILogger logger, Exception exception);
}
