using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Progression;

public static class ProgressionLimits
{
    /// <summary>The eras one entry may have. Enough for a long saga; small enough that one save stays bounded.</summary>
    public const int MaxEras = 50;

    public const int NameMaxLength = LoreLimits.NameMaxLength;

    /// <summary>An era's own biography, in characters of plain text.</summary>
    public const int DescriptionMaxLength = 10_000;

    public const int MaxStoriesPerEra = 50;

    public const int MaxScenesPerEra = 100;

    /// <summary>The forms one entry may have (Issue #42).</summary>
    public const int MaxForms = 50;

    /// <summary>The abilities one entry may have (Issue #42).</summary>
    public const int MaxAbilities = 100;
}

public sealed class EntityProgressionConfiguration : IEntityTypeConfiguration<EntityProgression>
{
    public void Configure(EntityTypeBuilder<EntityProgression> builder)
    {
        builder.ToTable("EntityProgressions");
        builder.HasKey(progression => progression.EntityId);

        // Owned by the entry and deleted with it; nothing on LoreEntity points back, so no entry read pulls it along.
        builder.HasOne(progression => progression.Entity)
            .WithOne()
            .HasForeignKey<EntityProgression>(progression => progression.EntityId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class EntityEraConfiguration : IEntityTypeConfiguration<EntityEra>
{
    public void Configure(EntityTypeBuilder<EntityEra> builder)
    {
        builder.ToTable("EntityEras");
        builder.HasKey(era => era.Id);

        builder.Property(era => era.Name).IsRequired().HasMaxLength(ProgressionLimits.NameMaxLength);
        builder.Property(era => era.Description).HasMaxLength(ProgressionLimits.DescriptionMaxLength);

        builder.HasOne(era => era.Entity)
            .WithMany()
            .HasForeignKey(era => era.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        // No action, as on a timeline moment: the chronology routes refuse removing a date period or a month an era is dated
        // in, and this holds if a race gets past them. Checked at the end of the statement, so deleting a universe cascades.
        builder.HasOne(era => era.StartEra).WithMany().HasForeignKey(era => era.StartEraId).OnDelete(DeleteBehavior.NoAction);
        builder.HasOne(era => era.EndEra).WithMany().HasForeignKey(era => era.EndEraId).OnDelete(DeleteBehavior.NoAction);
        builder.HasOne(era => era.StartCalendarMonth).WithMany().HasForeignKey(era => era.StartMonthId).OnDelete(DeleteBehavior.NoAction);
        builder.HasOne(era => era.EndCalendarMonth).WithMany().HasForeignKey(era => era.EndMonthId).OnDelete(DeleteBehavior.NoAction);

        // Not unique: the one save that writes eras assigns every position from the list's order in one go, and a unique
        // index would make a reorder park each row first.
        builder.HasIndex(era => new { era.EntityId, era.SortOrder });
    }
}

public sealed class EntityEraStoryConfiguration : IEntityTypeConfiguration<EntityEraStory>
{
    public void Configure(EntityTypeBuilder<EntityEraStory> builder)
    {
        builder.ToTable("EntityEraStories");
        builder.HasKey(link => new { link.EntityEraId, link.StoryId });

        builder.HasOne(link => link.Era).WithMany(era => era.Stories).HasForeignKey(link => link.EntityEraId).OnDelete(DeleteBehavior.Cascade);

        // A story in the Trash keeps the link and brings it back on restore; only a story deleted for good takes it.
        builder.HasOne(link => link.Story).WithMany().HasForeignKey(link => link.StoryId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(link => link.StoryId);
    }
}

public sealed class EntityEraSceneConfiguration : IEntityTypeConfiguration<EntityEraScene>
{
    public void Configure(EntityTypeBuilder<EntityEraScene> builder)
    {
        builder.ToTable("EntityEraScenes");
        builder.HasKey(link => new { link.EntityEraId, link.SceneId });

        builder.HasOne(link => link.Era).WithMany(era => era.Scenes).HasForeignKey(link => link.EntityEraId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Scene).WithMany().HasForeignKey(link => link.SceneId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(link => link.SceneId);
    }
}

public sealed class EntityEraFieldValueConfiguration : IEntityTypeConfiguration<EntityEraFieldValue>
{
    public void Configure(EntityTypeBuilder<EntityEraFieldValue> builder)
    {
        builder.ToTable("EntityEraFieldValues");
        builder.HasKey(value => value.Id);

        builder.Property(value => value.TextValue).HasMaxLength(LoreLimits.TextValueMaxLength);

        builder.HasOne(value => value.EntityEra)
            .WithMany(era => era.FieldValues)
            .HasForeignKey(value => value.EntityEraId)
            .OnDelete(DeleteBehavior.Cascade);

        // The field's own routes refuse deleting a field, or changing its kind, while an era overrides it - exactly as for an
        // entry's value. No action rather than restrict so a universe's delete, which takes fields and eras in one statement,
        // is checked once the statement is done.
        builder.HasOne(value => value.FieldDefinition)
            .WithMany()
            .HasForeignKey(value => value.FieldDefinitionId)
            .OnDelete(DeleteBehavior.NoAction);

        // As on an entry's value: an option in use is never removed by the field's edit; this only follows a deletion that is.
        builder.HasOne(value => value.Option).WithMany().HasForeignKey(value => value.OptionId).OnDelete(DeleteBehavior.Cascade);

        // An entry deleted for good from the Trash has its references removed first; set-null only holds against a race.
        builder.HasOne(value => value.ReferencedEntity)
            .WithMany()
            .HasForeignKey(value => value.ReferencedEntityId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne(value => value.Era).WithMany().HasForeignKey(value => value.EraId).OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(value => new { value.EntityEraId, value.FieldDefinitionId });
        builder.HasIndex(value => value.FieldDefinitionId);
        builder.HasIndex(value => value.ReferencedEntityId);
    }
}

public sealed class EntityProgressionRevisionConfiguration : IEntityTypeConfiguration<EntityProgressionRevision>
{
    public void Configure(EntityTypeBuilder<EntityProgressionRevision> builder)
    {
        builder.ToTable("EntityProgressionRevisions");
        builder.HasKey(revision => revision.Id);

        builder.Property(revision => revision.Snapshot).IsRequired();
        builder.Property(revision => revision.Kind).HasConversion<int>();

        builder.HasOne(revision => revision.Entity)
            .WithMany()
            .HasForeignKey(revision => revision.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(revision => new { revision.EntityId, revision.Number }).IsUnique();
    }
}
