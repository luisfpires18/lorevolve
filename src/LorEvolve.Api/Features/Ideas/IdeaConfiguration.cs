using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Ideas;

/// <summary>The bounds an idea is held to. Mirrored by the web client, which says so before a save rather than after.</summary>
public static class IdeaLimits
{
    /// <summary>The same bound a story, scene, arc or beat title has: short enough to stay identifiable in a list.</summary>
    public const int TitleMaxLength = 200;

    /// <summary>
    /// How long a body may be, in characters as .NET and JavaScript both count them (UTF-16 units). An idea is a note, not a
    /// manuscript: this is twice a scene's notes, and there so one save stays a small request.
    /// </summary>
    public const int BodyMaxLength = 20_000;

    /// <summary>How much of a body a list row carries. The rest is read when the idea is opened.</summary>
    public const int ExcerptLength = 240;

    /// <summary>The same bound a scene's linked lore and a beat's scenes have.</summary>
    public const int MaxReferences = 100;
}

public sealed class IdeaConfiguration : IEntityTypeConfiguration<Idea>
{
    public void Configure(EntityTypeBuilder<Idea> builder)
    {
        builder.ToTable("Ideas");
        builder.HasKey(idea => idea.Id);

        builder.Property(idea => idea.OwnerId).IsRequired();
        builder.Property(idea => idea.Title).IsRequired().HasMaxLength(IdeaLimits.TitleMaxLength);
        builder.Property(idea => idea.Body).IsRequired();

        // Owned by the account, and gone with it - like a universe.
        builder.HasOne(idea => idea.Owner)
            .WithMany()
            .HasForeignKey(idea => idea.OwnerId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // An association, not ownership. Deleting a universe never deletes an idea: the universe route unassigns them and
        // removes their references first, in its own transaction, and SET NULL holds that line for any path that does not.
        builder.HasOne(idea => idea.Universe)
            .WithMany()
            .HasForeignKey(idea => idea.UniverseId)
            .OnDelete(DeleteBehavior.SetNull);

        // Every list starts from the account, says live or deleted, and reads newest first; the deleted list orders by
        // DeletedAt, which this index leads to as well.
        builder.HasIndex(idea => new { idea.OwnerId, idea.DeletedAt, idea.UpdatedAt });

        // One universe's ideas, and the foreign key.
        builder.HasIndex(idea => new { idea.UniverseId, idea.DeletedAt, idea.UpdatedAt });
    }
}

public sealed class IdeaEntityReferenceConfiguration : IEntityTypeConfiguration<IdeaEntityReference>
{
    public void Configure(EntityTypeBuilder<IdeaEntityReference> builder)
    {
        builder.ToTable("IdeaEntityReferences");
        builder.HasKey(reference => new { reference.IdeaId, reference.EntityId });

        builder.HasOne(reference => reference.Idea)
            .WithMany(idea => idea.EntityReferences)
            .HasForeignKey(reference => reference.IdeaId)
            .OnDelete(DeleteBehavior.Cascade);

        // Trashing an entry deletes nothing, so the reference stays and is shown marked. Only an entry gone for good -
        // today, with its whole universe - takes the reference, and never the idea.
        builder.HasOne(reference => reference.Entity)
            .WithMany()
            .HasForeignKey(reference => reference.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(reference => reference.EntityId);
    }
}

public sealed class IdeaStoryReferenceConfiguration : IEntityTypeConfiguration<IdeaStoryReference>
{
    public void Configure(EntityTypeBuilder<IdeaStoryReference> builder)
    {
        builder.ToTable("IdeaStoryReferences");
        builder.HasKey(reference => new { reference.IdeaId, reference.StoryId });

        builder.HasOne(reference => reference.Idea)
            .WithMany(idea => idea.StoryReferences)
            .HasForeignKey(reference => reference.IdeaId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(reference => reference.Story)
            .WithMany()
            .HasForeignKey(reference => reference.StoryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(reference => reference.StoryId);
    }
}

public sealed class IdeaSceneReferenceConfiguration : IEntityTypeConfiguration<IdeaSceneReference>
{
    public void Configure(EntityTypeBuilder<IdeaSceneReference> builder)
    {
        builder.ToTable("IdeaSceneReferences");
        builder.HasKey(reference => new { reference.IdeaId, reference.SceneId });

        builder.HasOne(reference => reference.Idea)
            .WithMany(idea => idea.SceneReferences)
            .HasForeignKey(reference => reference.IdeaId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(reference => reference.Scene)
            .WithMany()
            .HasForeignKey(reference => reference.SceneId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(reference => reference.SceneId);
    }
}

public sealed class IdeaPlotArcReferenceConfiguration : IEntityTypeConfiguration<IdeaPlotArcReference>
{
    public void Configure(EntityTypeBuilder<IdeaPlotArcReference> builder)
    {
        builder.ToTable("IdeaPlotArcReferences");
        builder.HasKey(reference => new { reference.IdeaId, reference.PlotArcId });

        builder.HasOne(reference => reference.Idea)
            .WithMany(idea => idea.PlotArcReferences)
            .HasForeignKey(reference => reference.IdeaId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(reference => reference.PlotArc)
            .WithMany()
            .HasForeignKey(reference => reference.PlotArcId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(reference => reference.PlotArcId);
    }
}

public sealed class IdeaPlotBeatReferenceConfiguration : IEntityTypeConfiguration<IdeaPlotBeatReference>
{
    public void Configure(EntityTypeBuilder<IdeaPlotBeatReference> builder)
    {
        builder.ToTable("IdeaPlotBeatReferences");
        builder.HasKey(reference => new { reference.IdeaId, reference.PlotBeatId });

        builder.HasOne(reference => reference.Idea)
            .WithMany(idea => idea.PlotBeatReferences)
            .HasForeignKey(reference => reference.IdeaId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(reference => reference.PlotBeat)
            .WithMany()
            .HasForeignKey(reference => reference.PlotBeatId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(reference => reference.PlotBeatId);
    }
}
