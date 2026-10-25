using Lorex.Api.Features.Media;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Maps;

/// <summary>The numbers of maps (issue #52), in one place.</summary>
public static class MapLimits
{
    public const int MaxMapsPerUniverse = 50;

    public const int MaxPinsPerMap = 500;

    public const int NameMaxLength = 120;

    public const int DescriptionMaxLength = 2_000;

    public const int NoteMaxLength = 2_000;

    /// <summary>
    /// The longer side of the picture the viewer draws. Wide enough to zoom into a hand-drawn continent; small enough that a
    /// phone decodes it. The original is kept whole and is what a backup carries.
    /// </summary>
    public const int DisplaySide = 4096;

    /// <summary>How a replacement treats the pins placed on the picture it replaces.</summary>
    public const string KeepPins = "keep";

    public const string RemovePins = "remove";
}

public sealed class UniverseMapConfiguration : IEntityTypeConfiguration<UniverseMap>
{
    public void Configure(EntityTypeBuilder<UniverseMap> builder)
    {
        builder.ToTable("UniverseMaps");
        builder.HasKey(map => map.Id);

        builder.Property(map => map.Name).IsRequired().HasMaxLength(MapLimits.NameMaxLength);
        builder.Property(map => map.Description).HasMaxLength(MapLimits.DescriptionMaxLength);
        builder.Property(map => map.OriginalKey).IsRequired().HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(map => map.DisplayKey).IsRequired().HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(map => map.ContentType).IsRequired().HasMaxLength(StoredImageLimits.ContentTypeMaxLength);
        builder.Property(map => map.FileName).HasMaxLength(StoredImageLimits.FileNameMaxLength);

        builder.HasOne(map => map.Universe)
            .WithMany()
            .HasForeignKey(map => map.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // One name per universe: a map is named without ambiguity, by a person or by a tool (#53).
        builder.HasIndex(map => new { map.UniverseId, map.Name }).IsUnique();
    }
}

public sealed class MapPinConfiguration : IEntityTypeConfiguration<MapPin>
{
    public void Configure(EntityTypeBuilder<MapPin> builder)
    {
        builder.ToTable("MapPins");
        builder.HasKey(pin => pin.Id);

        builder.Property(pin => pin.Title).IsRequired().HasMaxLength(MapLimits.NameMaxLength);
        builder.Property(pin => pin.Note).HasMaxLength(MapLimits.NoteMaxLength);

        builder.HasOne(pin => pin.Map)
            .WithMany(map => map.Pins)
            .HasForeignKey(pin => pin.MapId)
            .OnDelete(DeleteBehavior.Cascade);

        // An erased entry leaves its pin as an annotation rather than taking it: the pin's title still says what it marks.
        builder.HasOne(pin => pin.Entity)
            .WithMany()
            .HasForeignKey(pin => pin.EntityId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(pin => pin.MapId);
        builder.HasIndex(pin => pin.EntityId);

        // An entry is pinned at most once on one map, so following an entry to a map never lands on two pins.
        builder.HasIndex(pin => new { pin.MapId, pin.EntityId })
            .IsUnique()
            .HasFilter("\"EntityId\" IS NOT NULL");
    }
}
