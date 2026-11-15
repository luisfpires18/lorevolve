using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>What a page and a panel may hold (#147).</summary>
public static class ComicLimits
{
    public const int NameMaxLength = 200;

    /// <summary>A panel's description and its dialogue are paragraphs, not documents.</summary>
    public const int TextMaxLength = 4_000;

    public const int MaxPagesPerChapter = 500;

    public const int MaxPanelsPerPage = 100;
}

public sealed class ProjectPageConfiguration : IEntityTypeConfiguration<ProjectPage>
{
    public void Configure(EntityTypeBuilder<ProjectPage> builder)
    {
        builder.ToTable("ProjectPages");
        builder.HasKey(page => page.Id);

        builder.Property(page => page.Name).HasMaxLength(ComicLimits.NameMaxLength);
        builder.Property(page => page.Notes).HasMaxLength(ComicLimits.TextMaxLength);

        // A page goes with its chapter, as a chapter goes with its volume and a volume with its project (#171).
        builder.HasOne(page => page.Episode)
            .WithMany()
            .HasForeignKey(page => page.EpisodeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(page => new { page.EpisodeId, page.SortOrder });
    }
}

public sealed class ProjectPanelConfiguration : IEntityTypeConfiguration<ProjectPanel>
{
    public void Configure(EntityTypeBuilder<ProjectPanel> builder)
    {
        builder.ToTable("ProjectPanels");
        builder.HasKey(panel => panel.Id);

        builder.Property(panel => panel.Description).HasMaxLength(ComicLimits.TextMaxLength);
        builder.Property(panel => panel.Dialogue).HasMaxLength(ComicLimits.TextMaxLength);

        builder.HasOne(panel => panel.Page)
            .WithMany(page => page.Panels)
            .HasForeignKey(panel => panel.PageId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(panel => new { panel.PageId, panel.SortOrder });

        // The lore link is read often enough to be worth an index, and only the panels that have one are in it.
        builder.HasIndex(panel => panel.CanonEntityId).HasFilter("\"CanonEntityId\" IS NOT NULL");
    }
}
