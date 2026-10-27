using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Relationships;

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

public sealed class RelationshipPeriodConfiguration : IEntityTypeConfiguration<RelationshipPeriod>
{
    public void Configure(EntityTypeBuilder<RelationshipPeriod> builder)
    {
        builder.ToTable("RelationshipPeriods");
        builder.HasKey(period => period.Id);

        // Part of the link: replaced with its save, and gone with it.
        builder.HasOne(period => period.Relationship)
            .WithMany(relationship => relationship.Periods)
            .HasForeignKey(period => period.RelationshipId)
            .OnDelete(DeleteBehavior.Cascade);

        // An era a period names cannot be removed from its entry's progression (the save refuses it); no action, checked at the
        // end of the statement, so deleting an entry - which takes its eras and every link it ends - still cascades.
        builder.HasOne(period => period.EntityEra).WithMany().HasForeignKey(period => period.EntityEraId).OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(period => period.StartEra).WithMany().HasForeignKey(period => period.StartEraId).OnDelete(DeleteBehavior.NoAction);
        builder.HasOne(period => period.EndEra).WithMany().HasForeignKey(period => period.EndEraId).OnDelete(DeleteBehavior.NoAction);
        builder.HasOne(period => period.StartCalendarMonth).WithMany().HasForeignKey(period => period.StartMonthId).OnDelete(DeleteBehavior.NoAction);
        builder.HasOne(period => period.EndCalendarMonth).WithMany().HasForeignKey(period => period.EndMonthId).OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(period => new { period.RelationshipId, period.SortOrder });
    }
}
