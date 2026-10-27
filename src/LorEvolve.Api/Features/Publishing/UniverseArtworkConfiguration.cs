using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// The universe's id is the key, so "one artwork" is a constraint, and the row goes with the universe.
/// No navigation on <see cref="Universe"/>: nothing that reads a universe loads its artwork by accident.
/// </summary>
public sealed class UniverseArtworkConfiguration : IEntityTypeConfiguration<UniverseArtwork>
{
    public void Configure(EntityTypeBuilder<UniverseArtwork> builder)
    {
        builder.ToTable("UniverseArtworks");
        builder.HasKey(artwork => artwork.UniverseId);

        builder.Property(artwork => artwork.OriginalKey).IsRequired().HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(artwork => artwork.CardKey).IsRequired().HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(artwork => artwork.ContentType).IsRequired().HasMaxLength(StoredImageLimits.ContentTypeMaxLength);
        builder.Property(artwork => artwork.FileName).HasMaxLength(StoredImageLimits.FileNameMaxLength);

        builder.HasOne<Universe>()
            .WithOne()
            .HasForeignKey<UniverseArtwork>(artwork => artwork.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
