namespace LorEvolve.Api.Features.Storage;

/// <summary>
/// The one definition of what an account's storage is and how it is refused. See
/// <c>docs/architecture/decisions/0042-account-storage-quota.md</c>.
///
/// Storage belongs to the account that owns the universe, across every universe it owns, and what counts is the
/// original of each Lore entry's picture (<c>EntityImage.ByteSize</c>) - never a thumbnail, which LorEvolve derives, and
/// never an object an infrastructure failure left behind, which no row names. An entry in the Trash still counts:
/// its picture is still stored, and a restore brings it back.
/// </summary>
public static class StorageQuota
{
    /// <summary>
    /// Every account's allowance until something trusted on the server says otherwise: 1 GiB. A product entitlement,
    /// not a price. There is no unlimited value - no zero, no <see cref="long.MaxValue"/> - and no route an account can
    /// raise its own with.
    /// </summary>
    public const long DefaultBytes = 1L * 1024 * 1024 * 1024;

    /// <summary>
    /// How long bytes held for an upload in flight count against the owner if nothing comes back to consume or release
    /// them - a process that died mid-upload, say. Comfortably longer than the largest accepted picture takes to read,
    /// decode and store, or than a restore's pictures take; and it is only a backstop, because the commit checks the
    /// quota again whenever its hold has lapsed.
    /// </summary>
    public static readonly TimeSpan ReservationLifetime = TimeSpan.FromMinutes(15);

    /// <summary>Stable marker for an upload the owner's storage has no room for.</summary>
    public const string ExceededCode = "storage_quota_exceeded";

    /// <summary>
    /// The refusal. The owner is told it is their storage; anyone else is told only that this universe has no room -
    /// never the owner's usage, allowance or what is left of it.
    /// </summary>
    public static IResult Exceeded(bool isOwner) =>
        Results.Problem(
            title: "Not enough storage.",
            detail: isOwner
                ? "There isn't room for this image in your storage. Remove some images first, or choose a smaller one."
                : "There isn't room for this image in this universe's storage. Its owner needs to free some space first.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ExceededCode });
}
