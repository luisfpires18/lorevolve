using LorEvolve.Api.Features.Media;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// Schema for the one primary image. The entry's id is the key, so "at most one" is a
/// constraint rather than a convention every write path has to remember.
/// </summary>
public sealed class EntityImageConfiguration : IEntityTypeConfiguration<EntityImage>
{
    public void Configure(EntityTypeBuilder<EntityImage> builder)
    {
        builder.ToTable("EntityImages");
        builder.HasKey(image => image.EntityId);

        builder.Property(image => image.OriginalKey)
            .IsRequired()
            .HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(image => image.ThumbnailKey)
            .IsRequired()
            .HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(image => image.ContentType)
            .IsRequired()
            .HasMaxLength(StoredImageLimits.ContentTypeMaxLength);
        builder.Property(image => image.FileName)
            .HasMaxLength(StoredImageLimits.FileNameMaxLength);

        builder.HasOne(image => image.Entity)
            .WithOne(entity => entity.Image)
            .HasForeignKey<EntityImage>(image => image.EntityId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
