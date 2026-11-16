using LorEvolve.Api.Features.Media;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Lore;

/// <summary>Schema for an image field's picture: one row per (entry, field).</summary>
public sealed class EntityFieldImageConfiguration : IEntityTypeConfiguration<EntityFieldImage>
{
    public void Configure(EntityTypeBuilder<EntityFieldImage> builder)
    {
        builder.ToTable("EntityFieldImages");
        builder.HasKey(image => new { image.EntityId, image.FieldDefinitionId });

        builder.Property(image => image.OriginalKey)
            .IsRequired()
            .HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(image => image.CropKey)
            .IsRequired()
            .HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(image => image.ContentType)
            .IsRequired()
            .HasMaxLength(StoredImageLimits.ContentTypeMaxLength);
        builder.Property(image => image.FileName)
            .HasMaxLength(StoredImageLimits.FileNameMaxLength);

        builder.HasOne(image => image.Entity)
            .WithMany()
            .HasForeignKey(image => image.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(image => image.FieldDefinition)
            .WithMany()
            .HasForeignKey(image => image.FieldDefinitionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(image => image.FieldDefinitionId);
    }
}
