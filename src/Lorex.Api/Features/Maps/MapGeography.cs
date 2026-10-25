using Lorex.Api.Data;
using Lorex.Api.Features.Reading;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Maps;

/// <summary>
/// The one geography reader (issue #53, ADR 0061): a universe's maps, where an entry is pinned, pins found by name, one pin,
/// and the straight-line separation of two pins - read live from the rows the map screen reads, and nothing else. The
/// built-in assistant and the MCP tools are adapters over this class; neither keeps a geography of its own.
///
/// <para><b>One universe, already allowed.</b> The caller has proved the universe may be read; every read names the universe
/// again, so a map, pin or entry id from anywhere else is simply not found. Live entries only: a pin whose entry is in the
/// Trash reads as a pin with no entry, and an entry in the Trash is on no map.</para>
///
/// <para><b>Nothing is inferred.</b> A location is a pin someone placed. A name finds pins by their own titles and by the
/// exact words in the names and aliases of the entries they stand for, and returns every match: choosing between them is
/// the caller's. A distance is a straight line between two pins on one picture, scaled by a calibration the creator
/// recorded on that very picture, or it is not given, and the reading says why.</para>
///
/// <para><b>Bounded.</b> At most <see cref="SearchLimit"/> locations a search, <see cref="MapLimits.MaxPinsPerMap"/> pins an
/// entry can have; notes and descriptions cut to <see cref="UniverseReader.TextLength"/>.</para>
/// </summary>
public static class MapGeography
{
    public const int SearchLimit = 20;

    /// <summary>How a distance is measured, said with every reading so no client has to guess.</summary>
    public const string Method = "Straight line on the map picture between the two pins' positions, scaled by the creator's recorded calibration. Not a route, a travel time or a real-world distance.";

    /// <summary>The map's page, opened on one pin, relative to the site.</summary>
    public static string FocusPath(Guid universeId, Guid mapId, Guid? pinId = null) =>
        $"/app/universes/{universeId:D}/maps/{mapId:D}{(pinId is { } pin ? $"?pin={pin:D}" : string.Empty)}";

    public static async Task<IReadOnlyList<MapReading>> ListMapsAsync(LorexDbContext db, Guid universeId, CancellationToken cancellationToken)
    {
        var maps = await db.UniverseMaps.AsNoTracking()
            .Where(map => map.UniverseId == universeId)
            .OrderBy(map => map.Name)
            .ThenBy(map => map.Id)
            .Select(map => new
            {
                map.Id,
                map.Name,
                map.Description,
                map.Width,
                map.Height,
                map.AssetId,
                PinCount = map.Pins.Count,
                Calibration = db.Set<MapCalibration>().Where(calibration => calibration.MapId == map.Id).FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);

        return
        [
            .. maps.Select(map => new MapReading(
                map.Id,
                map.Name,
                ReadingText.Cut(map.Description, UniverseReader.TextLength),
                map.Width,
                map.Height,
                map.PinCount,
                ScaleOf(map.Calibration, map.AssetId, map.Width, map.Height))),
        ];
    }

    /// <summary>
    /// Pins whose title, or whose live entry's name or alias, contains <paramref name="query"/> (case folded), across every
    /// map of the universe, by map name then title. Every match: a name shared by several places is several results.
    /// </summary>
    public static async Task<IReadOnlyList<LocationReading>> SearchLocationsAsync(
        LorexDbContext db,
        Guid universeId,
        string query,
        CancellationToken cancellationToken)
    {
        var folded = query.Trim().ToLowerInvariant();
        if (folded.Length == 0)
        {
            return [];
        }

#pragma warning disable CA1862 // ToLower() is what EF Core translates to SQLite's lower(); a StringComparison overload is not translated.
        var pins = await Pins(db, universeId)
            .Where(pin => pin.Title.ToLower().Contains(folded)
                || (pin.Entity != null && pin.Entity.DeletedAt == null
                    && (pin.Entity.Name.ToLower().Contains(folded) || pin.Entity.Aliases.Any(alias => alias.Value.ToLower().Contains(folded)))))
            .OrderBy(pin => pin.Map!.Name)
            .ThenBy(pin => pin.Title)
            .ThenBy(pin => pin.Id)
            .Take(SearchLimit)
            .Select(Projection(universeId))
            .ToListAsync(cancellationToken);
#pragma warning restore CA1862

        return [.. pins.Select(Describe)];
    }

    /// <summary>Where one live entry of this universe is pinned, by map name - or null for no such entry.</summary>
    public static async Task<LoreLocationsReading?> LocateAsync(LorexDbContext db, Guid universeId, Guid loreId, CancellationToken cancellationToken)
    {
        var lore = await db.Entities.AsNoTracking()
            .Where(entity => entity.Id == loreId && entity.UniverseId == universeId && entity.DeletedAt == null)
            .Select(entity => new LoreMention(entity.Id, entity.Name, entity.EntityType!.Name))
            .FirstOrDefaultAsync(cancellationToken);
        if (lore is null)
        {
            return null;
        }

        var pins = await Pins(db, universeId)
            .Where(pin => pin.EntityId == loreId)
            .OrderBy(pin => pin.Map!.Name)
            .ThenBy(pin => pin.Id)
            .Take(MapLimits.MaxMapsPerUniverse)
            .Select(Projection(universeId))
            .ToListAsync(cancellationToken);

        return new LoreLocationsReading(lore, [.. pins.Select(Describe)]);
    }

    /// <summary>One pin of this universe, or null.</summary>
    public static async Task<LocationReading?> GetPinAsync(LorexDbContext db, Guid universeId, Guid pinId, CancellationToken cancellationToken)
    {
        var pin = await Pins(db, universeId)
            .Where(candidate => candidate.Id == pinId)
            .Select(Projection(universeId))
            .FirstOrDefaultAsync(cancellationToken);
        return pin is null ? null : Describe(pin);
    }

    /// <summary>
    /// The straight-line separation of two pins of this universe, or null when either is not here. A distance in the
    /// creator's unit only when both pins are on one map, both positions are confirmed on the picture it shows, and that
    /// picture carries a calibration; otherwise the picture's own geometry where it exists, and the reason.
    /// </summary>
    public static async Task<DistanceReading?> MeasureAsync(
        LorexDbContext db,
        Guid universeId,
        Guid fromPinId,
        Guid toPinId,
        CancellationToken cancellationToken)
    {
        var rows = await Pins(db, universeId)
            .Where(pin => pin.Id == fromPinId || pin.Id == toPinId)
            .Select(Projection(universeId))
            .ToListAsync(cancellationToken);

        var from = rows.FirstOrDefault(row => row.PinId == fromPinId);
        var to = rows.FirstOrDefault(row => row.PinId == toPinId);
        if (from is null || to is null)
        {
            return null;
        }

        var a = Describe(from);
        var b = Describe(to);

        if (from.MapId != to.MapId)
        {
            return new DistanceReading(
                DistanceStatus.DifferentMaps,
                Method,
                a,
                b,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                $"The pins are on different maps ({from.MapName} and {to.MapName}). Maps share no coordinate system, so no distance between them can be measured.");
        }

        var pixels = PixelDistance(from.X, from.Y, to.X, to.Y, from.Width, from.Height);
        var diagonal = Math.Sqrt((double)from.Width * from.Width + (double)from.Height * from.Height);
        var fraction = diagonal > 0 ? pixels / diagonal : 0;

        if (!a.PositionConfirmed || !b.PositionConfirmed)
        {
            return new DistanceReading(
                DistanceStatus.PositionUnconfirmed,
                Method,
                a,
                b,
                from.MapId,
                from.MapName,
                from.AssetId,
                Round(pixels),
                Round(fraction),
                null,
                null,
                null,
                "A pin was placed on an earlier picture of this map and its position has not been confirmed on the picture shown now, so no distance is given.");
        }

        var calibration = await db.Set<MapCalibration>().AsNoTracking()
            .Where(candidate => candidate.MapId == from.MapId && candidate.AssetId == from.AssetId)
            .FirstOrDefaultAsync(cancellationToken);
        var scale = ScaleOf(calibration, from.AssetId, from.Width, from.Height);

        if (scale is null)
        {
            return new DistanceReading(
                DistanceStatus.NotCalibrated,
                Method,
                a,
                b,
                from.MapId,
                from.MapName,
                from.AssetId,
                Round(pixels),
                Round(fraction),
                null,
                null,
                null,
                $"The map {from.MapName} has no recorded scale, so only the separation on the picture is known. A real distance cannot be measured until its creator calibrates the map.");
        }

        var distance = pixels * scale.UnitsPerPixel;
        return new DistanceReading(
            DistanceStatus.Measured,
            Method,
            a,
            b,
            from.MapId,
            from.MapName,
            from.AssetId,
            Round(pixels),
            Round(fraction),
            Approximate(distance),
            scale.Unit,
            scale,
            $"About {Approximate(distance).ToString(System.Globalization.CultureInfo.InvariantCulture)} {scale.Unit} in a straight line on the map {from.MapName}, by the creator's calibration. Approximate: a map picture is not a survey.");
    }

    // ---------- Geometry ----------

    /// <summary>The separation of two fractions in pixels of the displayed picture: isotropic, whatever the picture's proportions.</summary>
    public static double PixelDistance(double x1, double y1, double x2, double y2, int width, int height) =>
        Math.Sqrt(Math.Pow((x2 - x1) * width, 2) + Math.Pow((y2 - y1) * height, 2));

    /// <summary>The creator's scale read from its row, or null without one for this picture. Never a scale from another picture.</summary>
    public static MapScaleReading? ScaleOf(MapCalibration? calibration, Guid currentAssetId, int width, int height)
    {
        if (calibration is null || calibration.AssetId != currentAssetId)
        {
            return null;
        }

        var pixels = PixelDistance(calibration.X1, calibration.Y1, calibration.X2, calibration.Y2, width, height);
        if (!(pixels >= MapCalibrationLimits.MinPointSeparationPixels) || !(calibration.Distance > 0) || !double.IsFinite(calibration.Distance))
        {
            return null;
        }

        return new MapScaleReading(
            calibration.AssetId,
            calibration.X1,
            calibration.Y1,
            calibration.X2,
            calibration.Y2,
            calibration.Distance,
            calibration.Unit,
            calibration.Distance / pixels,
            calibration.UpdatedAt);
    }

    /// <summary>
    /// A distance to a precision a picture can carry: whole units above a hundred, tenths above ten, hundredths below. A pin
    /// is placed by hand on a drawing; more digits would be false precision.
    /// </summary>
    public static double Approximate(double value)
    {
        if (value <= 0 || !double.IsFinite(value))
        {
            return 0;
        }

        var magnitude = Math.Floor(Math.Log10(value));
        var decimals = (int)Math.Clamp(2 - magnitude, 0, 2);
        return Math.Round(value, decimals, MidpointRounding.AwayFromZero);
    }

    private static double Round(double value) => Math.Round(value, 3, MidpointRounding.AwayFromZero);

    // ---------- Rows ----------

    private sealed record PinRow(
        Guid MapId,
        string MapName,
        Guid AssetId,
        int Width,
        int Height,
        Guid PinId,
        string Title,
        string? Note,
        double X,
        double Y,
        Guid PlacedOnAssetId,
        Guid? EntityId,
        string? EntityName,
        string? TypeName,
        Guid UniverseId);

    private static IQueryable<MapPin> Pins(LorexDbContext db, Guid universeId) =>
        db.MapPins.AsNoTracking().Where(pin => pin.Map!.UniverseId == universeId);

    /// <summary>The pin with its map's facts and its entry's, the entry's only while it is live. The universe rides along for the path.</summary>
    private static System.Linq.Expressions.Expression<Func<MapPin, PinRow>> Projection(Guid universeId) =>
        pin => new PinRow(
            pin.MapId,
            pin.Map!.Name,
            pin.Map.AssetId,
            pin.Map.Width,
            pin.Map.Height,
            pin.Id,
            pin.Title,
            pin.Note,
            pin.X,
            pin.Y,
            pin.PlacedOnAssetId,
            pin.Entity != null && pin.Entity.DeletedAt == null ? pin.EntityId : null,
            pin.Entity != null && pin.Entity.DeletedAt == null ? pin.Entity.Name : null,
            pin.Entity != null && pin.Entity.DeletedAt == null ? pin.Entity.EntityType!.Name : null,
            universeId);

    private static LocationReading Describe(PinRow row) => new(
        row.MapId,
        row.MapName,
        row.PinId,
        row.Title,
        ReadingText.Cut(row.Note, UniverseReader.TextLength),
        row.X,
        row.Y,
        row.EntityId is { } entityId ? new LoreMention(entityId, row.EntityName!, row.TypeName!) : null,
        row.PlacedOnAssetId == row.AssetId,
        FocusPath(row.UniverseId, row.MapId, row.PinId));
}
