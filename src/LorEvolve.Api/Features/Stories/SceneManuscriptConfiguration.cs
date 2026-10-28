using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Stories;

public sealed class SceneManuscriptConfiguration : IEntityTypeConfiguration<SceneManuscript>
{
    public void Configure(EntityTypeBuilder<SceneManuscript> builder)
    {
        builder.ToTable("SceneManuscripts");
        builder.HasKey(manuscript => manuscript.SceneId);

        // Long text: the column has no length. One save is bounded by the API (StoryLimits.ManuscriptMaxLength), which
        // is a limit on a request, not on what a scene may hold in the schema.
        builder.Property(manuscript => manuscript.Content).IsRequired();

        // Owned by the scene and deleted with it, so with its story and its universe too. A chapter's delete moves its
        // scenes and deletes none, so it reaches no manuscript. Nothing on Scene points back here: reading or tracking a
        // scene - a reorder, a move, the story read - can never pull its prose along.
        builder.HasOne(manuscript => manuscript.Scene)
            .WithOne()
            .HasForeignKey<SceneManuscript>(manuscript => manuscript.SceneId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class SceneManuscriptRevisionConfiguration : IEntityTypeConfiguration<SceneManuscriptRevision>
{
    public void Configure(EntityTypeBuilder<SceneManuscriptRevision> builder)
    {
        builder.ToTable("SceneManuscriptRevisions");
        builder.HasKey(revision => revision.Id);

        // Long text, like the manuscript itself: a version is bounded by the save that wrote it.
        builder.Property(revision => revision.Content).IsRequired();
        builder.Property(revision => revision.Kind).HasConversion<int>();

        // A manuscript's history belongs to its scene and is deleted with it - with its story or universe, since nothing
        // else deletes a scene for good. Moving the scene to the Trash deletes nothing, so its history waits there too.
        builder.HasOne(revision => revision.Scene)
            .WithMany()
            .HasForeignKey(revision => revision.SceneId)
            .OnDelete(DeleteBehavior.Cascade);

        // Two versions of one manuscript never share a number, which is what makes the next number safe to derive from
        // the highest one on record.
        builder.HasIndex(revision => new { revision.SceneId, revision.Number }).IsUnique();
    }
}
