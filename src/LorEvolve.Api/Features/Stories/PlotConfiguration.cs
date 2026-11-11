using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Stories;

public sealed class PlotArcConfiguration : IEntityTypeConfiguration<PlotArc>
{
    public void Configure(EntityTypeBuilder<PlotArc> builder)
    {
        builder.ToTable("PlotArcs");
        builder.HasKey(arc => arc.Id);

        builder.Property(arc => arc.Title).IsRequired().HasMaxLength(StoryLimits.TitleMaxLength);
        builder.Property(arc => arc.Description).HasMaxLength(StoryLimits.PlotDescriptionMaxLength);
        builder.Property(arc => arc.Notes).HasMaxLength(StoryLimits.PlotNotesMaxLength);

        // An arc belongs to its story, and goes with it.
        builder.HasOne(arc => arc.Story)
            .WithMany(story => story.PlotArcs)
            .HasForeignKey(arc => arc.StoryId)
            .OnDelete(DeleteBehavior.Cascade);

        // Arc order is contiguous and unique among a story's live arcs, like chapter order. An arc in the Trash
        // holds no place; the plain index serves the story's foreign key, which a partial index cannot.
        builder.HasIndex(arc => new { arc.StoryId, arc.SortOrder })
            .IsUnique()
            .HasFilter("\"DeletedAt\" IS NULL");

        builder.HasIndex(arc => arc.StoryId);
    }
}

/// <summary>A chapter's arc: one row per chapter at most, gone with the chapter or the arc (ADR 0070).</summary>
public sealed class ChapterArcConfiguration : IEntityTypeConfiguration<ChapterArc>
{
    public void Configure(EntityTypeBuilder<ChapterArc> builder)
    {
        builder.ToTable("ChapterArcs");
        builder.HasKey(link => link.ChapterId);

        builder.HasOne(link => link.Chapter)
            .WithOne(chapter => chapter.ArcLink)
            .HasForeignKey<ChapterArc>(link => link.ChapterId)
            .OnDelete(DeleteBehavior.Cascade);

        // Deleting an arc for good takes only the link: its chapters fall back to no arc, with every scene in them.
        builder.HasOne(link => link.PlotArc)
            .WithMany(arc => arc.ChapterLinks)
            .HasForeignKey(link => link.PlotArcId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(link => link.PlotArcId);
    }
}

/// <summary>A scene's beats: owned by the scene, in an order unique inside it (ADR 0070).</summary>
public sealed class SceneBeatConfiguration : IEntityTypeConfiguration<SceneBeat>
{
    public void Configure(EntityTypeBuilder<SceneBeat> builder)
    {
        builder.ToTable("SceneBeats");
        builder.HasKey(beat => beat.Id);

        builder.Property(beat => beat.Title).IsRequired().HasMaxLength(StoryLimits.TitleMaxLength);
        builder.Property(beat => beat.Note).HasMaxLength(StoryLimits.BeatNoteMaxLength);

        builder.HasOne(beat => beat.Scene)
            .WithMany(scene => scene.Beats)
            .HasForeignKey(beat => beat.SceneId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(beat => new { beat.SceneId, beat.SortOrder }).IsUnique();
    }
}
