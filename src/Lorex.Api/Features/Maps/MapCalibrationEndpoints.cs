using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Maps;

/// <summary>A calibration as written: two points as fractions of the picture, and the distance between them in a named unit.</summary>
public sealed record MapCalibrationRequest(double? X1, double? Y1, double? X2, double? Y2, double? Distance, string? Unit);

/// <summary>
/// A map's calibration as read: the points, the distance and unit as written, the picture it was measured on, and the scale
/// that follows - the creator's distance over the points' separation in pixels of the displayed picture.
/// </summary>
public sealed record MapCalibrationResponse(
    Guid AssetId,
    double X1,
    double Y1,
    double X2,
    double Y2,
    double Distance,
    string Unit,
    double UnitsPerPixel,
    DateTime UpdatedAt)
{
    public static MapCalibrationResponse? Of(MapScaleReading? scale) => scale is null
        ? null
        : new(scale.AssetId, scale.X1, scale.Y1, scale.X2, scale.Y2, scale.Distance, scale.Unit, scale.UnitsPerPixel, scale.UpdatedAt);
}

/// <summary>
/// The creator's scale for a map (issue #53, ADR 0061): set, read with the map, remove. Editors and the owner set it
/// (<see cref="UniverseCapability.EditContent"/>); it is written against the picture the map shows now and deleted by a
/// replacement, so a stale scale is never kept.
/// </summary>
public static partial class MapEndpoints
{
    private static void MapCalibrationRoutes(RouteGroupBuilder group)
    {
        group.MapPut("/{mapId:guid}/calibration", SetCalibrationAsync).WithName("SetMapCalibration");
        group.MapDelete("/{mapId:guid}/calibration", RemoveCalibrationAsync).WithName("RemoveMapCalibration");
    }

    /// <summary>
    /// Validates the two points and the distance, then writes the calibration against the map's current picture. Finite
    /// fractions on the picture, at least a pixel apart; a distance above zero and finite; a unit of 1-40 characters with no
    /// control characters, kept as written.
    /// </summary>
    private static async Task<IResult> SetCalibrationAsync(
        Guid universeId,
        Guid mapId,
        MapCalibrationRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var errors = new Dictionary<string, string[]>();
        void Fraction(string name, double? value)
        {
            if (value is not { } number || !double.IsFinite(number) || number < 0 || number > 1)
            {
                errors[name] = ["Each point must be on the map."];
            }
        }

        Fraction("x1", request.X1);
        Fraction("y1", request.Y1);
        Fraction("x2", request.X2);
        Fraction("y2", request.Y2);

        if (request.Distance is not { } distance || !double.IsFinite(distance) || distance <= 0)
        {
            errors["distance"] = ["The distance must be a number above zero."];
        }

        var unit = request.Unit?.Trim();
        if (string.IsNullOrEmpty(unit))
        {
            errors["unit"] = ["Name the unit, such as km, miles or leagues."];
        }
        else if (unit.Length > MapCalibrationLimits.UnitMaxLength)
        {
            errors["unit"] = [$"A unit's name is at most {MapCalibrationLimits.UnitMaxLength} characters."];
        }
        else if (unit.Any(character => char.IsControl(character)))
        {
            errors["unit"] = ["A unit's name cannot hold control characters."];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var map = await db.UniverseMaps.AsNoTracking()
            .Where(candidate => candidate.Id == mapId && candidate.UniverseId == universeId)
            .Select(candidate => new { candidate.AssetId, candidate.Width, candidate.Height })
            .FirstOrDefaultAsync(cancellationToken);
        if (map is null)
        {
            return Results.NotFound();
        }

        // Against the picture's pixels, so two fractions that are one pixel apart on a small map are refused as one point.
        var pixels = MapGeography.PixelDistance(request.X1!.Value, request.Y1!.Value, request.X2!.Value, request.Y2!.Value, map.Width, map.Height);
        if (pixels < MapCalibrationLimits.MinPointSeparationPixels)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["x2"] = ["Choose two different points, further apart than a pixel."] });
        }

        var now = DateTime.UtcNow;
        var existing = await db.Set<MapCalibration>().FirstOrDefaultAsync(candidate => candidate.MapId == mapId, cancellationToken);
        var row = existing ?? new MapCalibration { MapId = mapId, Unit = unit!, CreatedAt = now };
        row.AssetId = map.AssetId;
        row.X1 = request.X1.Value;
        row.Y1 = request.Y1.Value;
        row.X2 = request.X2.Value;
        row.Y2 = request.Y2.Value;
        row.Distance = request.Distance!.Value;
        row.Unit = unit!;
        row.UpdatedAt = now;
        if (existing is null)
        {
            db.Set<MapCalibration>().Add(row);
        }

        await db.UniverseMaps.Where(candidate => candidate.Id == mapId)
            .ExecuteUpdateAsync(update => update.SetProperty(candidate => candidate.UpdatedAt, now), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(MapCalibrationResponse.Of(MapGeography.ScaleOf(row, map.AssetId, map.Width, map.Height)));
    }

    private static async Task<IResult> RemoveCalibrationAsync(
        Guid universeId,
        Guid mapId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await db.UniverseMaps.AnyAsync(candidate => candidate.Id == mapId && candidate.UniverseId == universeId, cancellationToken))
        {
            return Results.NotFound();
        }

        var removed = await db.Set<MapCalibration>().Where(candidate => candidate.MapId == mapId).ExecuteDeleteAsync(cancellationToken);
        if (removed > 0)
        {
            await db.UniverseMaps.Where(candidate => candidate.Id == mapId)
                .ExecuteUpdateAsync(update => update.SetProperty(candidate => candidate.UpdatedAt, DateTime.UtcNow), cancellationToken);
        }

        return Results.NoContent();
    }

    /// <summary>The map's calibration for the picture it shows now, read for its detail; null without one.</summary>
    internal static async Task<MapScaleReading?> ScaleAsync(LorexDbContext db, UniverseMap map, CancellationToken cancellationToken) =>
        MapGeography.ScaleOf(
            await db.Set<MapCalibration>().AsNoTracking().FirstOrDefaultAsync(candidate => candidate.MapId == map.Id, cancellationToken),
            map.AssetId,
            map.Width,
            map.Height);
}
