using LorEvolve.Api.Features.Media;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Progression;

public sealed class EntityAppearanceConfiguration : IEntityTypeConfiguration<EntityAppearance>
{
    public void Configure(EntityTypeBuilder<EntityAppearance> builder)
    {
        builder.ToTable("EntityAppearances");
        builder.HasKey(appearance => appearance.Id);

        builder.Property(appearance => appearance.Label).IsRequired().HasMaxLength(ProgressionLimits.NameMaxLength);
        builder.Property(appearance => appearance.Notes).HasMaxLength(ProgressionLimits.DescriptionMaxLength);

        builder.HasOne(appearance => appearance.Entity).WithMany().HasForeignKey(appearance => appearance.EntityId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(appearance => new { appearance.EntityId, appearance.SortOrder });
    }
}

public sealed class EntityAppearanceEraConfiguration : IEntityTypeConfiguration<EntityAppearanceEra>
{
    public void Configure(EntityTypeBuilder<EntityAppearanceEra> builder)
    {
        builder.ToTable("EntityAppearanceEras");
        builder.HasKey(link => new { link.EntityAppearanceId, link.EntityEraId });
        builder.HasOne(link => link.Appearance).WithMany(appearance => appearance.Eras).HasForeignKey(link => link.EntityAppearanceId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Era).WithMany().HasForeignKey(link => link.EntityEraId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(link => link.EntityEraId);
    }
}

public sealed class EntityAppearanceFormConfiguration : IEntityTypeConfiguration<EntityAppearanceForm>
{
    public void Configure(EntityTypeBuilder<EntityAppearanceForm> builder)
    {
        builder.ToTable("EntityAppearanceForms");
        builder.HasKey(link => new { link.EntityAppearanceId, link.EntityFormId });
        builder.HasOne(link => link.Appearance).WithMany(appearance => appearance.Forms).HasForeignKey(link => link.EntityAppearanceId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Form).WithMany().HasForeignKey(link => link.EntityFormId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(link => link.EntityFormId);
    }
}

public sealed class EntityAppearanceSceneConfiguration : IEntityTypeConfiguration<EntityAppearanceScene>
{
    public void Configure(EntityTypeBuilder<EntityAppearanceScene> builder)
    {
        builder.ToTable("EntityAppearanceScenes");
        builder.HasKey(link => new { link.EntityAppearanceId, link.SceneId });
        builder.HasOne(link => link.Appearance).WithMany(appearance => appearance.Scenes).HasForeignKey(link => link.EntityAppearanceId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Scene).WithMany().HasForeignKey(link => link.SceneId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(link => link.SceneId);
    }
}

public sealed class EntityAppearanceImageConfiguration : IEntityTypeConfiguration<EntityAppearanceImage>
{
    public void Configure(EntityTypeBuilder<EntityAppearanceImage> builder)
    {
        builder.ToTable("EntityAppearanceImages");
        builder.HasKey(image => image.Id);

        builder.Property(image => image.OriginalKey).IsRequired().HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(image => image.ThumbnailKey).IsRequired().HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(image => image.ContentType).IsRequired().HasMaxLength(StoredImageLimits.ContentTypeMaxLength);
        builder.Property(image => image.FileName).HasMaxLength(StoredImageLimits.FileNameMaxLength);

        // Only an entry erased for good, or its universe, takes these rows with it - and both sweep the objects first. A save or a
        // restore never removes an appearance that still holds pictures.
        builder.HasOne(image => image.Appearance).WithMany(appearance => appearance.Images).HasForeignKey(image => image.EntityAppearanceId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(image => new { image.EntityAppearanceId, image.SortOrder });
    }
}
