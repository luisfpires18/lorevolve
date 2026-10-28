using LorEvolve.Api.Features.Auth;

namespace LorEvolve.Api.Features.Profile;

/// <summary>
/// The one photo an account may have.
///
/// Its own table keyed by <see cref="UserId"/>, not columns bolted onto <see cref="LorEvolveUser"/>.
/// The primary key <i>is</i> the "one photo" rule, an account without one is the absence of a row
/// rather than a dozen nulls on the Identity table, and none of this is Identity's schema to
/// carry - a migration of theirs should never have to think about LorEvolve's bucket.
///
/// Deliberately not <c>EntityImage</c> with a nullable entry. That row is keyed by an entry's id,
/// cascades with an entry, is captured by an entry's revision history and is written into a
/// universe backup. A profile photo has none of those: it belongs to a person, not to authored
/// lore, and overloading the two would have meant a nullable key, an exception in the backup
/// builder and an exception in revision capture - three holes in proven code to save one table.
///
/// It holds identifiers, never a URL: the keys are stored as they were written rather than
/// recomputed, so changing the convention later cannot orphan what is already in the bucket.
///
/// See <c>docs/architecture/decisions/0021-profile-photo.md</c>.
/// </summary>
public sealed class ProfileImage
{
    /// <summary>
    /// Primary key and foreign key at once - the Identity user's own id. One account, at most one
    /// photo. Never taken from a request: every route derives it from the signed-in principal.
    /// </summary>
    public required string UserId { get; set; }

    public LorEvolveUser? User { get; set; }

    /// <summary>
    /// Identity of the stored pair. New for every upload, replacements included, so the objects
    /// of the photo being replaced are never written over while it is still the live one - and so
    /// a served URL names the same bytes for as long as it resolves.
    /// </summary>
    public Guid AssetId { get; set; }

    /// <summary>Object key of the original, exactly as uploaded. Never rewritten while the asset lives.</summary>
    public required string OriginalKey { get; set; }

    /// <summary>
    /// Identity of the square currently cut from the original. New every time one is cut - on
    /// upload and on every reframe - for the same two reasons <see cref="AssetId"/> is.
    /// </summary>
    public Guid ThumbnailId { get; set; }

    /// <summary>Object key of the generated square avatar. Always WebP.</summary>
    public required string ThumbnailKey { get; set; }

    /// <summary>
    /// The square the avatar was cut from, as fractions of the displayed original. All four are
    /// set or none is, and they are what lets "Edit photo" reopen the cropper where it was left
    /// without sending the picture again.
    /// </summary>
    public double? CropX { get; set; }

    public double? CropY { get; set; }

    public double? CropWidth { get; set; }

    public double? CropHeight { get; set; }

    /// <summary>The original's content type, decided by decoding the bytes and never by the filename.</summary>
    public required string ContentType { get; set; }

    /// <summary>What the file was called. Kept as a label only, and never used to build a key.</summary>
    public string? FileName { get; set; }

    /// <summary>Original pixel width as displayed - after EXIF orientation where a browser applies one.</summary>
    public int Width { get; set; }

    /// <summary>Original pixel height, as displayed.</summary>
    public int Height { get; set; }

    /// <summary>Size of the original in bytes.</summary>
    public long ByteSize { get; set; }

    public DateTime UploadedAt { get; set; }

    /// <summary>
    /// Whether the account chose to show this photo on its public author page (ADR 0037). False for every photo until
    /// its owner says otherwise, and false again whenever the photo is replaced: consent is for a picture, not for
    /// whatever picture comes next. Only the square is ever served publicly, never the original.
    /// </summary>
    public bool IsPublic { get; set; }
}
