using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Relationships;

public static class RelationshipLimits
{
    public const int NameMaxLength = 160;
    public const int DescriptionMaxLength = 1000;
    public const int NotesMaxLength = 4000;
}

public sealed class RelationshipTypeConfiguration : IEntityTypeConfiguration<RelationshipType>
{
    public void Configure(EntityTypeBuilder<RelationshipType> builder)
    {
        builder.ToTable("RelationshipTypes");
        builder.HasKey(type => type.Id);

        builder.Property(type => type.Name).IsRequired().HasMaxLength(RelationshipLimits.NameMaxLength);
        builder.Property(type => type.InverseName).HasMaxLength(RelationshipLimits.NameMaxLength);
        builder.Property(type => type.Description).HasMaxLength(RelationshipLimits.DescriptionMaxLength);
        builder.Property(type => type.AgeOrder).HasConversion<int>();
        builder.Property(type => type.FamilySemantic).HasConversion<int>();

        builder.HasOne(type => type.Universe)
            .WithMany()
            .HasForeignKey(type => type.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(type => new { type.UniverseId, type.Name }).IsUnique();
        builder.HasIndex(type => new { type.UniverseId, type.DisplayOrder });
    }
}

public sealed class LoreRelationshipConfiguration : IEntityTypeConfiguration<LoreRelationship>
{
    public void Configure(EntityTypeBuilder<LoreRelationship> builder)
    {
        builder.ToTable("Relationships");
        builder.HasKey(relationship => relationship.Id);

        builder.Property(relationship => relationship.Notes).HasMaxLength(RelationshipLimits.NotesMaxLength);
        builder.Property(relationship => relationship.CanonStatus).HasConversion<int>();

        builder.HasOne(relationship => relationship.Universe)
            .WithMany()
            .HasForeignKey(relationship => relationship.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict, not Cascade: deleting a type that still describes links would erase
        // authored relationships silently. The API refuses that deletion instead.
        builder.HasOne(relationship => relationship.RelationshipType)
            .WithMany()
            .HasForeignKey(relationship => relationship.RelationshipTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        // A link only means anything while both ends exist, so deleting either entity
        // takes the single stored row with it, from both perspectives at once.
        builder.HasOne(relationship => relationship.SourceEntity)
            .WithMany()
            .HasForeignKey(relationship => relationship.SourceEntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(relationship => relationship.TargetEntity)
            .WithMany()
            .HasForeignKey(relationship => relationship.TargetEntityId)
            .OnDelete(DeleteBehavior.Cascade);

        // One index per end: an entity's relationships are read from both directions.
        builder.HasIndex(relationship => new { relationship.UniverseId, relationship.SourceEntityId });
        builder.HasIndex(relationship => new { relationship.UniverseId, relationship.TargetEntityId });
        builder.HasIndex(relationship => relationship.RelationshipTypeId);

        // The Trash lists a universe's trashed links, newest first (ADR 0048).
        builder.HasIndex(relationship => new { relationship.UniverseId, relationship.DeletedAt });
    }
}
