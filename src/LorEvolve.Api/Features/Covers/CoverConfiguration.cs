using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Covers;

/// <summary>Side tables, as <see cref="Publishing.UniverseArtworkConfiguration"/>: no navigation, and the row goes with its subject.</summary>
internal static class CoverColumns
{
    public static void Configure<TCover>(EntityTypeBuilder<TCover> builder, string table, string subjectColumn)
        where TCover : CoverImage
    {
        builder.ToTable(table);
        builder.HasKey(cover => cover.SubjectId);
        builder.Property(cover => cover.SubjectId).HasColumnName(subjectColumn);
        builder.Property(cover => cover.OriginalKey).IsRequired().HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(cover => cover.CardKey).IsRequired().HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(cover => cover.ContentType).IsRequired().HasMaxLength(StoredImageLimits.ContentTypeMaxLength);
        builder.Property(cover => cover.FileName).HasMaxLength(StoredImageLimits.FileNameMaxLength);
        builder.HasIndex(cover => cover.UniverseId);
    }
}

public sealed class StoryCoverConfiguration : IEntityTypeConfiguration<StoryCover>
{
    public void Configure(EntityTypeBuilder<StoryCover> builder)
    {
        CoverColumns.Configure(builder, "StoryCovers", "StoryId");
        builder.HasOne<Story>().WithOne().HasForeignKey<StoryCover>(cover => cover.SubjectId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class ProjectCoverConfiguration : IEntityTypeConfiguration<ProjectCover>
{
    public void Configure(EntityTypeBuilder<ProjectCover> builder)
    {
        CoverColumns.Configure(builder, "ProjectCovers", "ProjectId");
        builder.HasOne<CreativeProject>().WithOne().HasForeignKey<ProjectCover>(cover => cover.SubjectId).OnDelete(DeleteBehavior.Cascade);
    }
}
