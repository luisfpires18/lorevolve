using LorEvolve.Api.Features.Reading;

namespace LorEvolve.Api.Features.Maps;

// What MapGeography hands back (issue #53, ADR 0061): bounded, plain shapes of a universe's maps and pins, read live and
// filtered by what the caller may see. Every position is the stored fractions; every distance says how it was measured and on
// which picture, or why it could not be. Nothing here carries an object key, an account or anything from the Trash.

/// <summary>One map as a reader sees it: its size (what the fractions are of), how many pins, and whether a scale is recorded.</summary>
public sealed record MapReading(
    Guid Id,
    string Name,
    string? Description,
    int Width,
    int Height,
    int PinCount,
    MapScaleReading? Scale);

/// <summary>
/// A map's scale, as the creator recorded it: the two points, the distance between them in the creator's own unit, and the
/// picture it was measured on. <paramref name="UnitsPerPixel"/> is that distance spread over the points' separation in
/// pixels of the displayed picture.
/// </summary>
public sealed record MapScaleReading(
    Guid AssetId,
    double X1,
    double Y1,
    double X2,
    double Y2,
    double Distance,
    string Unit,
    double UnitsPerPixel,
    DateTime UpdatedAt);

/// <summary>
/// One place on one map: the pin, where it is as fractions, the entry it stands for (live only), and whether its position
/// was placed or confirmed on the picture the map shows now. <paramref name="Path"/> is the map's page opened on this pin,
/// relative to the site, for a client to turn into a link.
/// </summary>
public sealed record LocationReading(
    Guid MapId,
    string MapName,
    Guid PinId,
    string Title,
    string? Note,
    double X,
    double Y,
    LoreMention? Lore,
    bool PositionConfirmed,
    string Path);

/// <summary>Where one live entry is pinned: every map, by name. Empty when it is recorded on no map.</summary>
public sealed record LoreLocationsReading(LoreMention Lore, IReadOnlyList<LocationReading> Pins);

/// <summary>Why a distance could not be given, or that it was.</summary>
public enum DistanceStatus
{
    /// <summary>Both pins on one calibrated map with confirmed positions: <see cref="DistanceReading.Distance"/> is set.</summary>
    Measured = 0,

    /// <summary>The map has no recorded scale: only the separation on the picture is known.</summary>
    NotCalibrated = 1,

    /// <summary>The pins are on different maps, and no shared coordinate system exists between maps.</summary>
    DifferentMaps = 2,

    /// <summary>A pin was placed on an earlier picture and its position has not been confirmed on the one the map shows.</summary>
    PositionUnconfirmed = 3,
}

/// <summary>
/// The straight-line separation of two pins. <paramref name="PixelDistance"/> and <paramref name="DiagonalFraction"/> are
/// the picture's own geometry - the distance in pixels of the displayed picture, and as a fraction of its diagonal - and are
/// given whenever both pins are on one map. <paramref name="Distance"/> in <paramref name="Unit"/> is given only when
/// <paramref name="Status"/> is <see cref="DistanceStatus.Measured"/>: the pixel distance scaled by the creator's calibration,
/// rounded to a precision the picture can honestly carry. Never a route, a travel time or a geodesic.
/// </summary>
public sealed record DistanceReading(
    DistanceStatus Status,
    string Method,
    LocationReading From,
    LocationReading To,
    Guid? MapId,
    string? MapName,
    Guid? AssetId,
    double? PixelDistance,
    double? DiagonalFraction,
    double? Distance,
    string? Unit,
    MapScaleReading? Scale,
    string Note);
