using LorEvolve.Api.Features.Publishing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Universes;

public sealed class UniverseConfiguration : IEntityTypeConfiguration<Universe>
{
    public const int NameMaxLength = 120;
    public const int DescriptionMaxLength = 2000;
    public const int AccentColorLength = 7;

    public void Configure(EntityTypeBuilder<Universe> builder)
    {
        builder.HasKey(universe => universe.Id);

        builder.Property(universe => universe.OwnerId).IsRequired();
        builder.Property(universe => universe.Name).IsRequired().HasMaxLength(NameMaxLength);
        builder.Property(universe => universe.Description).HasMaxLength(DescriptionMaxLength);
        builder.Property(universe => universe.AccentColor).HasMaxLength(AccentColorLength);

        builder.HasOne(universe => universe.Owner)
            .WithMany()
            .HasForeignKey(universe => universe.OwnerId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // The universe list starts from the owner (and, through UniverseMemberships, from members) and is usually
        // filtered by archived state, so the index leads with those two columns.
        builder.HasIndex(universe => new { universe.OwnerId, universe.IsArchived, universe.UpdatedAt });

        // One owner cannot hold two universes with the same name, which keeps the list
        // readable without needing a display discriminator.
        builder.HasIndex(universe => new { universe.OwnerId, universe.Name }).IsUnique();

        // Publishing (ADR 0036). A slug is unique across every owner: it is the world's public
        // address. Nulls - every universe never published - do not collide.
        builder.Property(universe => universe.PublicSummary).HasMaxLength(PublicationLimits.SummaryMaxLength);
        builder.Property(universe => universe.PublicSlug).HasMaxLength(PublicationLimits.SlugMaxLength);
        builder.Property(universe => universe.OriginalCreator).HasMaxLength(PublicationLimits.OriginalCreatorMaxLength);
        builder.Property(universe => universe.OriginalWork).HasMaxLength(PublicationLimits.OriginalWorkMaxLength);
        builder.HasIndex(universe => universe.PublicSlug).IsUnique();

        // The public listing reads public universes, most recently published first.
        builder.HasIndex(universe => new { universe.Visibility, universe.PublishedAt });
    }
}
