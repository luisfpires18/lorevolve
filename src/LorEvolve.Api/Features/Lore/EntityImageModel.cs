namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// The one primary image an entry may have.
///
/// A separate table keyed by <see cref="EntityId"/>, not a handful of nullable columns on
/// <see cref="LoreEntity"/>. The primary key *is* the "one image" rule: the schema refuses a
/// second row rather than trusting every write path to remember, and an entry without one is
/// the absence of a row rather than six nulls on the busiest table in the product.
///
/// It holds identifiers, never a URL. The object keys are stored as written rather than
/// recomputed from the convention, so changing the convention later cannot orphan what is
/// already in the bucket - the row keeps pointing at the objects it actually created.
///
/// Cascades with the entry, which is why the Trash needs no special case: trashing marks
/// <see cref="LoreEntity.DeletedAt"/> and deletes nothing, so this row is untouched and a
/// restore reconnects the image with nothing to rebuild.
///
/// See <c>docs/architecture/decisions/0019-entity-primary-image.md</c>.
/// </summary>
public sealed class EntityImage
{
    /// <summary>Primary key and foreign key at once. One entry, at most one image.</summary>
    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    /// <summary>
    /// Identity of the stored pair. New for every upload, including a replacement, so the
    /// object keys of the image being replaced are never written over while it is still the
    /// live one - and so a served URL is immutable and can be cached honestly.
    /// </summary>
    public Guid AssetId { get; set; }

    /// <summary>Object key of the original, exactly as uploaded. Never rewritten while the asset lives.</summary>
    public required string OriginalKey { get; set; }

    /// <summary>
    /// Identity of the thumbnail currently cut from the original. New every time a thumbnail is
    /// made - on upload, and on every change of framing - for the same two reasons
    /// <see cref="AssetId"/> is: the working thumbnail is never written over while it is live,
    /// and a served thumbnail URL always names the same bytes.
    /// </summary>
    public Guid ThumbnailId { get; set; }

    /// <summary>Object key of the generated square thumbnail. Always WebP.</summary>
    public required string ThumbnailKey { get; set; }

    /// <summary>
    /// The square the thumbnail was cut from, as fractions of the displayed original - see
    /// <see cref="EntityImageCrop"/>. All four are set or none is. None only for a picture stored
    /// before framing was recorded, whose thumbnail is the centred square.
    ///
    /// Kept because it is the one thing about the thumbnail that is not derivable: with it the
    /// cropper reopens where the author left it, a backup preserves their choice, and a thumbnail
    /// can be regenerated from the original alone. Fractions, never screen pixels.
    /// </summary>
    public double? CropX { get; set; }

    public double? CropY { get; set; }

    public double? CropWidth { get; set; }

    public double? CropHeight { get; set; }

    /// <summary>The original's content type, decided by decoding the bytes and never by the filename.</summary>
    public required string ContentType { get; set; }

    /// <summary>What the author called the file. Shown in the editor so a replacement is recognisable.</summary>
    public string? FileName { get; set; }

    /// <summary>
    /// Original pixel width as the picture is displayed, so after its EXIF orientation where a
    /// browser applies one. Sent to the client so an image reserves its space before it loads.
    /// </summary>
    public int Width { get; set; }

    /// <summary>Original pixel height, as displayed.</summary>
    public int Height { get; set; }

    /// <summary>Size of the original in bytes.</summary>
    public long ByteSize { get; set; }

    public DateTime UploadedAt { get; set; }
}
