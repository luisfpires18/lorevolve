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

public sealed class PlotBeatConfiguration : IEntityTypeConfiguration<PlotBeat>
{
    public void Configure(EntityTypeBuilder<PlotBeat> builder)
    {
        builder.ToTable("PlotBeats");
        builder.HasKey(beat => beat.Id);

        builder.Property(beat => beat.Title).IsRequired().HasMaxLength(StoryLimits.TitleMaxLength);
        builder.Property(beat => beat.Description).HasMaxLength(StoryLimits.PlotDescriptionMaxLength);
        builder.Property(beat => beat.Notes).HasMaxLength(StoryLimits.PlotNotesMaxLength);

        // A beat belongs to its arc, and goes with it.
        builder.HasOne(beat => beat.PlotArc)
            .WithMany(arc => arc.Beats)
            .HasForeignKey(beat => beat.PlotArcId)
            .OnDelete(DeleteBehavior.Cascade);

        // Beat order is contiguous and unique among an arc's live beats, and answers every read of them. A beat in
        // the Trash holds no place; the plain index serves the arc's foreign key, which a partial index cannot.
        builder.HasIndex(beat => new { beat.PlotArcId, beat.SortOrder })
            .IsUnique()
            .HasFilter("\"DeletedAt\" IS NULL");

        builder.HasIndex(beat => beat.PlotArcId);
    }
}

public sealed class PlotBeatSceneConfiguration : IEntityTypeConfiguration<PlotBeatScene>
{
    public void Configure(EntityTypeBuilder<PlotBeatScene> builder)
    {
        builder.ToTable("PlotBeatScenes");
        builder.HasKey(link => new { link.PlotBeatId, link.SceneId });

        builder.HasOne(link => link.PlotBeat)
            .WithMany(beat => beat.SceneLinks)
            .HasForeignKey(link => link.PlotBeatId)
            .OnDelete(DeleteBehavior.Cascade);

        // A reference, not ownership, in both directions: a deleted scene takes only the link, and the beat
        // stays where it is in its arc. Nothing about a beat can delete a scene.
        builder.HasOne(link => link.Scene)
            .WithMany()
            .HasForeignKey(link => link.SceneId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(link => link.SceneId);
    }
}

public sealed class PlotBeatEntityConfiguration : IEntityTypeConfiguration<PlotBeatEntity>
{
    public void Configure(EntityTypeBuilder<PlotBeatEntity> builder)
    {
        builder.ToTable("PlotBeatEntities");
        builder.HasKey(link => new { link.PlotBeatId, link.EntityId });

        builder.HasOne(link => link.PlotBeat)
            .WithMany(beat => beat.EntityLinks)
            .HasForeignKey(link => link.PlotBeatId)
            .OnDelete(DeleteBehavior.Cascade);

        // Like a scene's linked lore: the link means nothing once the entry is gone for good, and losing it
        // never takes the beat with it. Trashing an entry deletes nothing.
        builder.HasOne(link => link.Entity)
            .WithMany()
            .HasForeignKey(link => link.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(link => link.EntityId);
    }
}
