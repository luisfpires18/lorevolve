namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// The picture one entry holds in one <see cref="EntityFieldKind.Image"/> field (Issue #238). The row is the field's value:
/// an image field never carries an <see cref="EntityFieldValue"/>. Keyed by (entry, field), so "one image per field" is a
/// constraint. The same columns as <see cref="EntityImage"/> less the thumbnail pair: one derivative, the crop, per framing.
/// Cascades with the entry and with the field; the field and type delete routes refuse while a row exists, so a cascade
/// never runs with objects still in the bucket.
/// </summary>
public sealed class EntityFieldImage
{
    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public Guid FieldDefinitionId { get; set; }

    public EntityFieldDefinition? FieldDefinition { get; set; }

    /// <summary>New for every upload, so the keys of a picture being replaced are never written over while it is live.</summary>
    public Guid AssetId { get; set; }

    public required string OriginalKey { get; set; }

    /// <summary>New for every framing, for the same reason as <see cref="AssetId"/>.</summary>
    public Guid CropId { get; set; }

    /// <summary>The framed picture fitted within <see cref="Media.ImagePreparation.DisplaySide"/>. Always WebP.</summary>
    public required string CropKey { get; set; }

    public double CropX { get; set; }

    public double CropY { get; set; }

    public double CropWidth { get; set; }

    public double CropHeight { get; set; }

    public required string ContentType { get; set; }

    public string? FileName { get; set; }

    public int Width { get; set; }

    public int Height { get; set; }

    public long ByteSize { get; set; }

    public DateTime UploadedAt { get; set; }
}
