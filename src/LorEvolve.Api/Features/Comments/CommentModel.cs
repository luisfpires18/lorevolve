using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Comments;

/// <summary>
/// A review conversation about one piece of content as a whole: a Lore entry, a story or a scene (task 043). Exactly one
/// of <see cref="EntityId"/>, <see cref="StoryId"/> and <see cref="SceneId"/> is set, and the database refuses anything
/// else. Each is a real cascading key, so a thread lives exactly as long as what it is about: the Trash leaves it in place
/// for a restore, and a permanent delete - of the content or the universe - takes it with it. No anchor inside the text.
///
/// Open until an owner or Editor resolves it; resolving keeps every word, and reopening puts it back as it was. Private
/// collaboration metadata, never written to a backup (ADR 0041 amendment).
/// </summary>
public sealed class CommentThread
{
    public Guid Id { get; set; }

    public Guid? EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public Guid? StoryId { get; set; }

    public Story? Story { get; set; }

    public Guid? SceneId { get; set; }

    public Scene? Scene { get; set; }

    /// <summary>UTC. The first comment's moment.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>UTC, while resolved; null while open.</summary>
    public DateTime? ResolvedAt { get; set; }

    /// <summary>Who resolved it, as on <see cref="Comment.AuthorUserId"/>. Null while open.</summary>
    public string? ResolvedByUserId { get; set; }

    /// <summary>The first is what started the thread; the rest are replies, oldest first.</summary>
    public ICollection<Comment> Comments { get; } = [];
}

/// <summary>One thing said in a thread: plain text, trimmed, never edited or deleted on its own.</summary>
public sealed class Comment
{
    public Guid Id { get; set; }

    public Guid ThreadId { get; set; }

    public CommentThread? Thread { get; set; }

    /// <summary>
    /// The account that wrote it. A raw id with no foreign key, like a revision's author (ADR 0041 amendment, 042): a
    /// collaborator leaving the universe, or an account going, never touches what they said. Read as the username, live.
    /// </summary>
    public required string AuthorUserId { get; set; }

    public required string Body { get; set; }

    /// <summary>UTC.</summary>
    public DateTime CreatedAt { get; set; }
}

public static class CommentLimits
{
    public const int BodyMaxLength = 4000;
}

public sealed class CommentThreadConfiguration : IEntityTypeConfiguration<CommentThread>
{
    public void Configure(EntityTypeBuilder<CommentThread> builder)
    {
        builder.ToTable("CommentThreads", table => table.HasCheckConstraint(
            "CK_CommentThreads_Subject",
            "(\"EntityId\" IS NOT NULL) + (\"StoryId\" IS NOT NULL) + (\"SceneId\" IS NOT NULL) = 1"));

        // Each key's index also serves "the threads about this", the only way threads are listed.
        builder.HasOne(thread => thread.Entity).WithMany().HasForeignKey(thread => thread.EntityId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(thread => thread.Story).WithMany().HasForeignKey(thread => thread.StoryId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(thread => thread.Scene).WithMany().HasForeignKey(thread => thread.SceneId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class CommentConfiguration : IEntityTypeConfiguration<Comment>
{
    public void Configure(EntityTypeBuilder<Comment> builder)
    {
        builder.Property(comment => comment.Body).HasMaxLength(CommentLimits.BodyMaxLength);

        builder.HasOne(comment => comment.Thread)
            .WithMany(thread => thread.Comments)
            .HasForeignKey(comment => comment.ThreadId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
