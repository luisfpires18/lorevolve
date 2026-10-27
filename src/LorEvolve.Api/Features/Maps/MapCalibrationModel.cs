using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Maps;

/// <summary>
/// The creator's scale for one map (issue #53, ADR 0061): two points of the picture, as the same fractions a pin uses, and
/// the fictional distance between them in a unit the creator named. One per map, keyed by the map and cascading with it.
///
/// <para><b>Bound to one picture.</b> <see cref="AssetId"/> is the picture the points were chosen on. Replacing the picture
/// deletes the row in the same transaction, so a scale measured on one picture is never applied to another; it is kept here
/// too, so a reading can say which picture a distance rests on.</para>
///
/// <para><b>The unit is a name, never a conversion.</b> "km", "miles", "leagues" and "days' ride" are all kept exactly as
/// written and never turned into one another: LorEvolve knows nothing about what a league is in this world.</para>
/// </summary>
public sealed class MapCalibration
{
    public Guid MapId { get; set; }

    public UniverseMap? Map { get; set; }

    /// <summary>The picture the two points were chosen on. Always the map's current one, because a replacement deletes the row.</summary>
    public Guid AssetId { get; set; }

    public double X1 { get; set; }

    public double Y1 { get; set; }

    public double X2 { get; set; }

    public double Y2 { get; set; }

    /// <summary>The fictional distance between the two points, above zero, in <see cref="Unit"/>.</summary>
    public double Distance { get; set; }

    /// <summary>The unit's name as the creator wrote it.</summary>
    public required string Unit { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}

/// <summary>The numbers of a calibration, in one place.</summary>
public static class MapCalibrationLimits
{
    public const int UnitMaxLength = 40;

    /// <summary>
    /// The two points must be at least this far apart on the picture, in pixels of its displayed size: closer than a pixel
    /// they are one point, and no scale can be read from one point.
    /// </summary>
    public const double MinPointSeparationPixels = 1;
}

public sealed class MapCalibrationConfiguration : IEntityTypeConfiguration<MapCalibration>
{
    public void Configure(EntityTypeBuilder<MapCalibration> builder)
    {
        builder.ToTable("MapCalibrations");
        builder.HasKey(calibration => calibration.MapId);

        builder.Property(calibration => calibration.Unit).IsRequired().HasMaxLength(MapCalibrationLimits.UnitMaxLength);

        builder.HasOne(calibration => calibration.Map)
            .WithOne()
            .HasForeignKey<MapCalibration>(calibration => calibration.MapId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
