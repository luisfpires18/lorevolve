using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Lore;

public sealed class EntityArticleConfiguration : IEntityTypeConfiguration<EntityArticle>
{
    public void Configure(EntityTypeBuilder<EntityArticle> builder)
    {
        builder.ToTable("EntityArticles");
        builder.HasKey(article => article.EntityId);

        builder.Property(article => article.Content).IsRequired().HasMaxLength(LoreLimits.ContentMaxLength);

        // Owned by the entry and deleted with it, so with its universe too. Trashing an entry deletes nothing, so it
        // reaches no article. Nothing on LoreEntity points back here: reading or tracking an entry - a structured edit,
        // a promotion, a trash, a restore - can never pull its article along.
        builder.HasOne(article => article.Entity)
            .WithOne()
            .HasForeignKey<EntityArticle>(article => article.EntityId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class EntityArticleRevisionConfiguration : IEntityTypeConfiguration<EntityArticleRevision>
{
    public void Configure(EntityTypeBuilder<EntityArticleRevision> builder)
    {
        builder.ToTable("EntityArticleRevisions");
        builder.HasKey(revision => revision.Id);

        builder.Property(revision => revision.Content).IsRequired().HasMaxLength(LoreLimits.ContentMaxLength);
        builder.Property(revision => revision.Kind).HasConversion<int>();

        // History of an entry's article belongs to the entry and goes with it, like the entry's own history.
        builder.HasOne(revision => revision.Entity)
            .WithMany()
            .HasForeignKey(revision => revision.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        // Two versions of one article never share a number, which is what makes the next number safe to derive from the
        // highest one on record.
        builder.HasIndex(revision => new { revision.EntityId, revision.Number }).IsUnique();
    }
}
