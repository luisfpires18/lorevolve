using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>What a structure node may hold (#290).</summary>
public static class StructureLimits
{
    public const int LevelMaxLength = 24;

    /// <summary>How many nodes one project may hold in all, so one project cannot grow without bound.</summary>
    public const int MaxNodesPerProject = 5_000;
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
