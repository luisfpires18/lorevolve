namespace Lorex.Api.Features.Maps;

/// <summary>
/// The map's picture as a client needs it: the asset id its two addresses are built from, the displayed size a pin's
/// fractions are measured against, and the original's facts. Never a URL or an object key.
/// </summary>
public sealed record MapImageRef(
    Guid AssetId,
    int Width,
    int Height,
    string ContentType,
    string? FileName,
    long ByteSize,
    DateTime UploadedAt)
{
    public static MapImageRef Of(UniverseMap map) =>
        new(map.AssetId, map.Width, map.Height, map.ContentType, map.FileName, map.ByteSize, map.UploadedAt);
}

/// <summary>One map in the universe's list.</summary>
public sealed record MapSummary(
    Guid Id,
    string Name,
    string? Description,
    MapImageRef Image,
    int PinCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>
/// The entry a pin stands for, as a member may read it. <paramref name="Name"/> and <paramref name="TypeName"/> are null
/// for an entry in the Trash - a member without the Trash never reads what it holds - and <paramref name="IsTrashed"/>
/// says so; the pin's own title still names the place.
/// </summary>
public sealed record MapPinLore(Guid Id, string? Name, string? TypeName, string? TypeIcon, string? TypeAccentColor, bool IsTrashed);

/// <summary>
/// One pin. <paramref name="PlacedOnCurrentImage"/> is false for a pin placed on a picture the map has since replaced:
/// its position is shown, but as one the author has yet to confirm against the picture shown now.
/// </summary>
public sealed record MapPinResponse(
    Guid Id,
    string Title,
    string? Note,
    double X,
    double Y,
    MapPinLore? Lore,
    bool PlacedOnCurrentImage,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>One map whole: its details, its picture and every pin, with the edit version of its details.</summary>
public sealed record MapDetail(
    Guid Id,
    string Name,
    string? Description,
    MapImageRef Image,
    IReadOnlyList<MapPinResponse> Pins,
    int PinsAwaitingReview,
    int Version,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>A map's details, saved over the version they were read at (ADR 0043).</summary>
public sealed record MapDetailsRequest(string? Name, string? Description, int? ExpectedVersion);

/// <summary>
/// A pin as written: its title, note, position as fractions, and the entry it stands for, or null for an annotation.
/// </summary>
public sealed record MapPinRequest(string? Title, string? Note, double? X, double? Y, Guid? EntityId);

/// <summary>Where one entry is pinned: the map, and the pin on it. One per map at most.</summary>
public sealed record EntityMapPin(Guid MapId, string MapName, Guid PinId, string Title, double X, double Y);
