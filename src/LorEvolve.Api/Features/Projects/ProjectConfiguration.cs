using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Projects;

/// <summary>The bounds a project is held to. Mirrored by the web client, which says so before a save rather than after.</summary>
public static class ProjectLimits
{
    /// <summary>The same bound a story, scene, arc, beat or idea title has.</summary>
    public const int NameMaxLength = 200;

    /// <summary>Short on purpose: a subtype is a word or two, not a description.</summary>
    public const int SubtypeMaxLength = 60;

    /// <summary>A paragraph or two. A project's real writing lives in its stories, not in this field.</summary>
    public const int SummaryMaxLength = 2_000;
}

public sealed class CreativeProjectConfiguration : IEntityTypeConfiguration<CreativeProject>
{
    public void Configure(EntityTypeBuilder<CreativeProject> builder)
    {
        builder.ToTable("CreativeProjects");
        builder.HasKey(project => project.Id);

        builder.Property(project => project.OwnerId).IsRequired();
        builder.Property(project => project.Name).IsRequired().HasMaxLength(ProjectLimits.NameMaxLength);
        builder.Property(project => project.Subtype).HasMaxLength(ProjectLimits.SubtypeMaxLength);
        builder.Property(project => project.Summary).IsRequired();

        // Every other enum in this schema is stored as an int, so a rename never rewrites rows.
        builder.Property(project => project.Kind).HasConversion<int>();
        builder.Property(project => project.Lifecycle).HasConversion<int>();

        // Owned by the account, and gone with it - like an idea or a universe.
        builder.HasOne(project => project.Owner)
            .WithMany()
            .HasForeignKey(project => project.OwnerId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Ownership, not a link (#171). A project is a subdivision of its universe and goes with it, the way a story
        // does; SET NULL is gone because there is no standalone state left for a project to fall back to.
        builder.HasOne(project => project.Universe)
            .WithMany()
            .HasForeignKey(project => project.UniverseId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // The account's own list, newest first.
        builder.HasIndex(project => new { project.OwnerId, project.UpdatedAt });

        // One universe's projects, which is also how a collaborator's list is read, and the foreign key.
        builder.HasIndex(project => new { project.UniverseId, project.UpdatedAt });
    }
}
