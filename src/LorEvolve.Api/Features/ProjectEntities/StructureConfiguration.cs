using LorEvolve.Api.Features.Media;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>What a structure node may hold (#290).</summary>
public static class StructureLimits
{
    public const int LevelMaxLength = 24;

    /// <summary>How many nodes one project may hold in all, so one project cannot grow without bound.</summary>
    public const int MaxNodesPerProject = 5_000;

    /// <summary>The cap on each of a panel's script fields (#295).</summary>
    public const int ScriptFieldMaxLength = 4_000;

    /// <summary>The levels that may hold a picture (#295).</summary>
    public static readonly string[] ArtLevels = ["page", "panel"];
}

public sealed class ProjectNodeConfiguration : IEntityTypeConfiguration<ProjectNode>
{
    public void Configure(EntityTypeBuilder<ProjectNode> builder)
    {
        builder.ToTable("ProjectNodes");
        builder.HasKey(node => node.Id);

        builder.Property(node => node.Level).IsRequired().HasMaxLength(StructureLimits.LevelMaxLength);
        builder.Property(node => node.Title).HasMaxLength(SeriesLimits.NameMaxLength);
        builder.Property(node => node.Summary).HasMaxLength(SeriesLimits.SummaryMaxLength);
        builder.Property(node => node.Body).HasMaxLength(SeriesLimits.ScriptMaxLength);
        builder.Property(node => node.Dialogue).HasMaxLength(StructureLimits.ScriptFieldMaxLength);
        builder.Property(node => node.Caption).HasMaxLength(StructureLimits.ScriptFieldMaxLength);
        builder.Property(node => node.Sfx).HasMaxLength(StructureLimits.ScriptFieldMaxLength);
        builder.Property(node => node.Notes).HasMaxLength(StructureLimits.ScriptFieldMaxLength);

        builder.HasOne(node => node.Project)
            .WithMany()
            .HasForeignKey(node => node.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        // A node's subtree goes with it.
        builder.HasOne(node => node.Parent)
            .WithMany(node => node.Children)
            .HasForeignKey(node => node.ParentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(node => new { node.ProjectId, node.ParentId, node.SortOrder });
    }
}

public sealed class ProjectNodeImageConfiguration : IEntityTypeConfiguration<ProjectNodeImage>
{
    public void Configure(EntityTypeBuilder<ProjectNodeImage> builder)
    {
        builder.ToTable("ProjectNodeImages");
        builder.HasKey(image => image.NodeId);

        builder.Property(image => image.OriginalKey).IsRequired().HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(image => image.CropKey).IsRequired().HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(image => image.ContentType).IsRequired().HasMaxLength(StoredImageLimits.ContentTypeMaxLength);
        builder.Property(image => image.FileName).HasMaxLength(StoredImageLimits.FileNameMaxLength);

        builder.HasOne(image => image.Node)
            .WithOne()
            .HasForeignKey<ProjectNodeImage>(image => image.NodeId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
