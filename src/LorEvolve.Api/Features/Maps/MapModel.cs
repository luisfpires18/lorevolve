using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Features.Maps;

/// <summary>
/// One map of one universe (issue #52, ADR 0060): an uploaded picture of the world, kept as the author's own file and
/// shown whole, with pins placed on it. A universe may hold several, each with its own stable id; a map belongs to exactly
/// one universe and cascades with it.
///
/// <para><b>The picture is a version.</b> <see cref="AssetId"/> is new for every upload, a replacement included, and the
/// two object keys are stored as written (ADR 0019's rules). A pin records the asset it was placed on
/// (<see cref="MapPin.PlacedOnAssetId"/>), so a replaced picture is never quietly trusted to have kept its pins in the
/// right place: the map says which pins were placed on the picture it shows now.</para>
///
/// <para><b>Positions are fractions of the displayed picture</b> - <see cref="Width"/> by <see cref="Height"/>, the
/// original as a browser draws it, after any EXIF orientation - never pixels of a screen or of the fitted derivative.
/// The same fraction names the same point of the map at every zoom and on every screen.</para>
///
/// <para>Never public: a map is read by the universe's members through LorEvolve and nowhere else. It is not Lore the Canon
/// rules read, not searched, and - until #53 - not read by the assistant or MCP.</para>
/// </summary>
public sealed class UniverseMap
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>Unique within the universe, so a map can be named without ambiguity.</summary>
    public required string Name { get; set; }

    public string? Description { get; set; }

    /// <summary>The picture's version: new for every upload, so every served address names one immutable picture.</summary>
    public Guid AssetId { get; set; }

    /// <summary>Object key of the original, exactly as uploaded.</summary>
    public required string OriginalKey { get; set; }

    /// <summary>Object key of the fitted WebP the viewer draws (<see cref="MapLimits.DisplaySide"/> on its longer side).</summary>
    public required string DisplayKey { get; set; }

    /// <summary>The original's content type, decided by decoding the bytes.</summary>
    public required string ContentType { get; set; }

    /// <summary>The author's own filename, a label only.</summary>
    public string? FileName { get; set; }

    /// <summary>The original's displayed width in pixels: the space a pin's X is a fraction of.</summary>
    public int Width { get; set; }

    /// <summary>The original's displayed height in pixels: the space a pin's Y is a fraction of.</summary>
    public int Height { get; set; }

    /// <summary>The original's size in bytes, as received. What the owner's storage counts (ADR 0042).</summary>
    public long ByteSize { get; set; }

    public DateTime UploadedAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// The edit version of the map's details - name and description (ADR 0043): 1 when created, advanced by every save
    /// that changes them. A save names the version it was written over and is refused when it is no longer current.
    /// </summary>
    public int Version { get; set; } = 1;

    public ICollection<MapPin> Pins { get; set; } = [];
}

/// <summary>
/// One pin on one map: a title the author wrote, an optional note, a position as fractions of the map's displayed
/// picture, and optionally the one Lore entry it stands for. A linked pin references an entry of the same universe by its
/// authoritative id and never copies it; an entry may be pinned once per map and on any number of maps. The link is
/// severed - never the pin deleted - when the entry is erased for good.
/// </summary>
public sealed class MapPin
{
    public Guid Id { get; set; }

    public Guid MapId { get; set; }

    public UniverseMap? Map { get; set; }

    /// <summary>The entry this pin stands for, or null for an annotation. Always an entry of the map's universe.</summary>
    public Guid? EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    /// <summary>The pin's own label, always present - so a pin whose entry was erased still says what it marks.</summary>
    public required string Title { get; set; }

    public string? Note { get; set; }

    /// <summary>Fraction of the displayed width, 0 at the left edge and 1 at the right.</summary>
    public double X { get; set; }

    /// <summary>Fraction of the displayed height, 0 at the top edge and 1 at the bottom.</summary>
    public double Y { get; set; }

    /// <summary>
    /// The map picture this position was placed or last confirmed on. Equal to the map's <see cref="UniverseMap.AssetId"/>
    /// for a pin whose place has been seen against the picture the map shows now; anything else means the picture was
    /// replaced since and the position waits for the author's review.
    /// </summary>
    public Guid PlacedOnAssetId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
