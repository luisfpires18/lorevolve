using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Storage;

/// <summary>An account's allowance beside what it is using, by category. Lore pictures are the only category so far.</summary>
public sealed record StorageUsage(long QuotaBytes, long LoreImageBytes)
{
    public long UsedBytes => LoreImageBytes;

    /// <summary>Never below zero: an account over its allowance - stored before there was one - has none left, not less.</summary>
    public long RemainingBytes => Math.Max(0, QuotaBytes - UsedBytes);
}

/// <summary>Bytes held for one upload in flight. Null wherever an upload needs no room: one that frees space or keeps it level.</summary>
public sealed record StorageHold(Guid Id, string OwnerId, long Bytes);

/// <summary>The hold for an upload lapsed and, checked again at the commit, the bytes no longer fit. Nothing was kept.</summary>
public sealed class StorageQuotaExceededException() : Exception("The owner's storage has no room for this upload.");

/// <summary>
/// Reads an account's storage and holds room in it. The database is the index: usage is summed from the rows that
/// name stored pictures, set-based, every time - never a counter kept beside them that could drift, and never a
/// listing of the bucket. See ADR 0042.
///
/// <para><b>The order an upload follows.</b> The picture is checked and prepared first, so a file that is not an
/// image never holds anything. Then <see cref="ReserveAsync"/> checks the room and holds the net increase in one
/// short transaction - which Microsoft.Data.Sqlite begins IMMEDIATE, so two holds for one account are serialised -
/// and commits before any byte goes to the bucket. The bucket write runs with no transaction open. The transaction
/// that then moves the picture calls <see cref="ConsumeAsync"/> first, so the hold goes in the same commit that makes
/// the bytes count for real. Every failure in between calls <see cref="ReleaseAsync"/>. A process that dies leaves a
/// hold that stops counting at its expiry.</para>
///
/// <para>Holds are durable rows rather than a lock in memory, because a lock held by one process is nothing to
/// another.</para>
/// </summary>
public static partial class AccountStorage
{
    /// <summary>
    /// The account's allowance and what its owned universes use. One command, whatever the number of universes or
    /// pictures. Null only for an account that no longer exists.
    /// </summary>
    public static Task<StorageUsage?> UsageAsync(LorexDbContext db, string userId, CancellationToken cancellationToken)
    {
        // Captured as queries, so EF Core folds them into the one statement as subqueries.
        var loreImages = LoreImageBytes(db, userId);
        var appearanceImages = AppearanceImageBytes(db, userId);

        return db.Users
            .Where(user => user.Id == userId)
            .Select(user => new StorageUsage(
                user.StorageQuotaBytes,
                (loreImages.Sum(bytes => (long?)bytes) ?? 0) + (appearanceImages.Sum(bytes => (long?)bytes) ?? 0)))
            .FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// Holds <paramref name="bytes"/> - the upload's net increase, above zero - against <paramref name="ownerId"/>'s
    /// storage, or returns null when they do not fit beside what is stored and what is already held. Must be called
    /// outside any transaction, because its own has to commit before the slow part starts.
    /// </summary>
    public static async Task<StorageHold?> ReserveAsync(
        LorexDbContext db,
        TimeProvider clock,
        string ownerId,
        long bytes,
        CancellationToken cancellationToken)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(bytes);

        if (db.Database.CurrentTransaction is not null)
        {
            throw new InvalidOperationException("A storage hold commits on its own, before the upload it protects.");
        }

        var now = clock.GetUtcNow().UtcDateTime;

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        if (!await FitsAsync(db, ownerId, bytes, now, cancellationToken))
        {
            return null;
        }

        // Lapsed holds count for nothing already; this only keeps the table from growing with them.
        await db.StorageReservations
            .Where(reservation => reservation.UserId == ownerId && reservation.ExpiresAt <= now)
            .ExecuteDeleteAsync(cancellationToken);

        var hold = new StorageReservation
        {
            Id = Guid.NewGuid(),
            UserId = ownerId,
            Bytes = bytes,
            CreatedAt = now,
            ExpiresAt = now + StorageQuota.ReservationLifetime,
        };

        db.StorageReservations.Add(hold);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        // Nothing else in this request touches the row through the change tracker; it goes by statement.
        db.Entry(hold).State = EntityState.Detached;

        return new StorageHold(hold.Id, ownerId, bytes);
    }

    /// <summary>
    /// Turns a hold into stored bytes. Called inside the transaction that commits the picture, before that transaction
    /// writes it, so the hold and the association land together or not at all. A hold that lapsed meanwhile is
    /// checked again here, under the same writer lock as the commit, so a slow upload can never take more than the
    /// allowance; when it no longer fits this throws <see cref="StorageQuotaExceededException"/>.
    /// </summary>
    public static async Task ConsumeAsync(
        LorexDbContext db,
        TimeProvider clock,
        StorageHold? hold,
        CancellationToken cancellationToken)
    {
        if (hold is null)
        {
            return;
        }

        if (db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException("A storage hold is consumed by the transaction that stores what it held.");
        }

        var now = clock.GetUtcNow().UtcDateTime;

        var consumed = await db.StorageReservations
            .Where(reservation => reservation.Id == hold.Id && reservation.ExpiresAt > now)
            .ExecuteDeleteAsync(cancellationToken);

        if (consumed == 1)
        {
            return;
        }

        if (!await FitsAsync(db, hold.OwnerId, hold.Bytes, now, cancellationToken))
        {
            throw new StorageQuotaExceededException();
        }

        await db.StorageReservations
            .Where(reservation => reservation.Id == hold.Id)
            .ExecuteDeleteAsync(cancellationToken);
    }

    /// <summary>
    /// Gives a hold back after an upload that did not land. Never cancelled - a request the browser abandoned still
    /// has to let go of its room - and never throws: a release that cannot run leaves a hold that lapses on its own.
    /// </summary>
    public static async Task ReleaseAsync(LorexDbContext db, StorageHold? hold, ILogger logger)
    {
        if (hold is null)
        {
            return;
        }

        try
        {
            await db.StorageReservations
                .Where(reservation => reservation.Id == hold.Id)
                .ExecuteDeleteAsync(CancellationToken.None);
        }
        catch (Exception exception)
        {
            LogReleaseFailed(logger, hold.Id, exception);
        }
    }

    /// <summary>
    /// The original bytes of every Lore picture in the universes <paramref name="ownerId"/> owns - live entries and
    /// entries in the Trash alike, and whoever uploaded them. The one place another category would be added beside.
    /// </summary>
    private static IQueryable<long> LoreImageBytes(LorexDbContext db, string ownerId) =>
        db.EntityImages
            .Where(image => image.Entity!.Universe!.OwnerId == ownerId)
            .Select(image => image.ByteSize);

    /// <summary>The originals of every appearance's pictures in those universes (Issue #43) - Lore pictures too, counted beside.</summary>
    private static IQueryable<long> AppearanceImageBytes(LorexDbContext db, string ownerId) =>
        db.EntityAppearanceImages
            .Where(image => image.Appearance!.Entity!.Universe!.OwnerId == ownerId)
            .Select(image => image.ByteSize);

    /// <summary>
    /// Whether <paramref name="bytes"/> more fit: stored plus held plus these, at most the allowance. One command.
    /// An account already over its allowance has no room for any increase, however small.
    /// </summary>
    private static async Task<bool> FitsAsync(
        LorexDbContext db,
        string ownerId,
        long bytes,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var loreImages = LoreImageBytes(db, ownerId);
        var appearanceImages = AppearanceImageBytes(db, ownerId);

        var room = await db.Users
            .Where(user => user.Id == ownerId)
            .Select(user => new
            {
                user.StorageQuotaBytes,
                Stored = (loreImages.Sum(stored => (long?)stored) ?? 0) + (appearanceImages.Sum(stored => (long?)stored) ?? 0),
                Held = db.StorageReservations
                    .Where(reservation => reservation.UserId == ownerId && reservation.ExpiresAt > now)
                    .Sum(reservation => (long?)reservation.Bytes) ?? 0,
            })
            .FirstOrDefaultAsync(cancellationToken);

        return room is not null && room.Stored + room.Held + bytes <= room.StorageQuotaBytes;
    }

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Storage hold {ReservationId} could not be released. It stops counting when it expires.")]
    private static partial void LogReleaseFailed(ILogger logger, Guid reservationId, Exception exception);
}
