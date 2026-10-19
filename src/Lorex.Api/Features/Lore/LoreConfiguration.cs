using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Lore;

public static class LoreLimits
{
    public const int NameMaxLength = 160;
    public const int SummaryMaxLength = 1000;
    public const int DescriptionMaxLength = 1000;
    public const int TextValueMaxLength = 4000;
    public const int TagMaxLength = 60;
    public const int IconMaxLength = 40;
    public const int AccentColorLength = 7;

    /// <summary>One article's document, in characters of Tiptap JSON. Mirrored by the web client.</summary>
    public const int ContentMaxLength = 200_000;
    public const int OptionMaxLength = 120;
}

public sealed class EntityTypeConfiguration : IEntityTypeConfiguration<EntityType>
{
    public void Configure(EntityTypeBuilder<EntityType> builder)
    {
        builder.ToTable("EntityTypes");
        builder.HasKey(type => type.Id);

        builder.Property(type => type.Name).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(type => type.Description).HasMaxLength(LoreLimits.DescriptionMaxLength);
        builder.Property(type => type.Icon).HasMaxLength(LoreLimits.IconMaxLength);
        builder.Property(type => type.AccentColor).HasMaxLength(LoreLimits.AccentColorLength);

        builder.HasOne(type => type.Universe)
            .WithMany()
            .HasForeignKey(type => type.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // Names are unique per universe, which is also what makes default seeding idempotent.
        builder.HasIndex(type => new { type.UniverseId, type.Name }).IsUnique();
        builder.HasIndex(type => new { type.UniverseId, type.DisplayOrder });

        // A type's parent (ADR 0007 amendment, 2026-10-01). Deliberately not a foreign key: SQLite adds one only by rebuilding
        // the table, and a rebuilt EntityTypes changes the order a universe's delete cascades in - the types would go before
        // the entries using them, and those entries' RESTRICT key would refuse the delete. The same guarantees are triggers
        // instead, written by the migration: a parent is a type of the same universe, and a type with children cannot be
        // deleted except with its universe. That a parent is never the type itself or beneath it is the API's and the
        // restore's, which walk the graph; a trigger cannot.
        builder.HasIndex(type => new { type.UniverseId, type.ParentId });
    }
}

public sealed class EntityTypeGroupConfiguration : IEntityTypeConfiguration<EntityTypeGroup>
{
    public void Configure(EntityTypeBuilder<EntityTypeGroup> builder)
    {
        builder.ToTable("EntityTypeGroups");
        builder.HasKey(group => group.Id);

        builder.Property(group => group.Name).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);

        builder.HasOne(group => group.Universe)
            .WithMany()
            .HasForeignKey(group => group.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // Names are unique per universe, like types: two groups both called Runes could not be told apart in a picker.
        builder.HasIndex(group => new { group.UniverseId, group.Name }).IsUnique();
    }
}

public sealed class EntityTypeGroupMemberConfiguration : IEntityTypeConfiguration<EntityTypeGroupMember>
{
    public void Configure(EntityTypeBuilder<EntityTypeGroupMember> builder)
    {
        builder.ToTable("EntityTypeGroupMembers");

        // The key serves "which types are in this group" (filters, link checks); the index serves "which groups is this
        // type in" (the type's own save).
        builder.HasKey(member => new { member.EntityTypeGroupId, member.EntityTypeId });

        builder.HasOne(member => member.Group)
            .WithMany(group => group.Members)
            .HasForeignKey(member => member.EntityTypeGroupId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(member => member.EntityType)
            .WithMany()
            .HasForeignKey(member => member.EntityTypeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(member => member.EntityTypeId);
    }
}

public sealed class EntityFieldDefinitionConfiguration : IEntityTypeConfiguration<EntityFieldDefinition>
{
    public void Configure(EntityTypeBuilder<EntityFieldDefinition> builder)
    {
        builder.ToTable("EntityFieldDefinitions");
        builder.HasKey(field => field.Id);

        builder.Property(field => field.Name).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(field => field.DefaultValue).HasMaxLength(LoreLimits.TextValueMaxLength);
        builder.Property(field => field.Kind).HasConversion<int>();
        builder.Property(field => field.Semantic).HasConversion<int?>();

        builder.HasOne(field => field.EntityType)
            .WithMany(type => type.Fields)
            .HasForeignKey(field => field.EntityTypeId)
            .OnDelete(DeleteBehavior.Cascade);

        // A type a reference field is restricted to is not deleted from under it: the type endpoint refuses first, with
        // the reason. No action rather than restrict, so a whole universe still goes in one cascade - the field and the
        // type it names leave together, and the key is checked once the statement is done.
        builder.HasOne(field => field.TargetEntityType)
            .WithMany()
            .HasForeignKey(field => field.TargetEntityTypeId)
            .OnDelete(DeleteBehavior.NoAction);

        // A group a reference field is restricted to is not deleted from under it: the group endpoint refuses first, with
        // the reason. No action, for the same one-cascade universe delete as the type target above.
        builder.HasOne(field => field.TargetGroup)
            .WithMany()
            .HasForeignKey(field => field.TargetGroupId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(field => new { field.EntityTypeId, field.Name }).IsUnique();

        // One meaning per type at most. Filtered, because the ordinary case is a type with
        // several semantic-free fields and a unique index over nulls would forbid that.
        builder.HasIndex(field => new { field.EntityTypeId, field.Semantic })
            .IsUnique()
            .HasFilter("\"Semantic\" IS NOT NULL");
    }
}

public sealed class EntityFieldOptionConfiguration : IEntityTypeConfiguration<EntityFieldOption>
{
    public void Configure(EntityTypeBuilder<EntityFieldOption> builder)
    {
        builder.ToTable("EntityFieldOptions");
        builder.HasKey(option => option.Id);

        builder.Property(option => option.Value).IsRequired().HasMaxLength(LoreLimits.OptionMaxLength);

        builder.HasOne(option => option.FieldDefinition)
            .WithMany(field => field.Options)
            .HasForeignKey(option => option.FieldDefinitionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(option => new { option.FieldDefinitionId, option.Value }).IsUnique();
    }
}

public sealed class LoreEntityConfiguration : IEntityTypeConfiguration<LoreEntity>
{
    public void Configure(EntityTypeBuilder<LoreEntity> builder)
    {
        builder.ToTable("Entities");
        builder.HasKey(entity => entity.Id);

        builder.Property(entity => entity.Name).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(entity => entity.Summary).HasMaxLength(LoreLimits.SummaryMaxLength);
        builder.Property(entity => entity.CanonStatus).HasConversion<int>();

        builder.HasOne(entity => entity.Universe)
            .WithMany()
            .HasForeignKey(entity => entity.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // Removing a type would orphan its entities, so the type cannot be deleted while
        // any entity still uses it.
        builder.HasOne(entity => entity.EntityType)
            .WithMany()
            .HasForeignKey(entity => entity.EntityTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        // Browse and Trash are the same shape read from opposite sides of DeletedAt, so one
        // index serves both: every ordinary listing is UniverseId + DeletedAt is null, and the
        // Trash is UniverseId + DeletedAt is not null.
        builder.HasIndex(entity => new
        {
            entity.UniverseId,
            entity.DeletedAt,
            entity.IsArchived,
            entity.UpdatedAt,
        });
        builder.HasIndex(entity => new { entity.UniverseId, entity.EntityTypeId });
        builder.HasIndex(entity => new { entity.UniverseId, entity.Name });

        // Publishing (ADR 0036). An address is unique among one universe's entries - a story may share it, under
        // its own route segment. Only entries ever published have one, so the same index is what the public
        // listing reads: UniverseId, and a slug that is not null.
        builder.Property(entity => entity.PublicSlug).HasMaxLength(Publishing.PublicationLimits.SlugMaxLength);
        builder.HasIndex(entity => new { entity.UniverseId, entity.PublicSlug }).IsUnique();
    }
}

public sealed class EntityAliasConfiguration : IEntityTypeConfiguration<EntityAlias>
{
    public void Configure(EntityTypeBuilder<EntityAlias> builder)
    {
        builder.ToTable("EntityAliases");
        builder.HasKey(alias => alias.Id);

        builder.Property(alias => alias.Value).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);

        builder.HasOne(alias => alias.Entity)
            .WithMany(entity => entity.Aliases)
            .HasForeignKey(alias => alias.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(alias => new { alias.EntityId, alias.Value }).IsUnique();
    }
}

public sealed class EntityFieldValueConfiguration : IEntityTypeConfiguration<EntityFieldValue>
{
    public void Configure(EntityTypeBuilder<EntityFieldValue> builder)
    {
        builder.ToTable("EntityFieldValues");
        builder.HasKey(value => value.Id);

        builder.Property(value => value.TextValue).HasMaxLength(LoreLimits.TextValueMaxLength);

        builder.HasOne(value => value.Entity)
            .WithMany(entity => entity.FieldValues)
            .HasForeignKey(value => value.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict, not Cascade: deleting a field definition that still holds values would
        // destroy authored data silently. The API refuses that deletion instead.
        builder.HasOne(value => value.FieldDefinition)
            .WithMany(field => field.Values)
            .HasForeignKey(value => value.FieldDefinitionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(value => value.Option)
            .WithMany()
            .HasForeignKey(value => value.OptionId)
            .OnDelete(DeleteBehavior.Cascade);

        // A referenced entity disappearing clears the reference rather than deleting the
        // referring entity.
        builder.HasOne(value => value.ReferencedEntity)
            .WithMany()
            .HasForeignKey(value => value.ReferencedEntityId)
            .OnDelete(DeleteBehavior.SetNull);

        // A year written in an era keeps that era. Removing it is refused by the chronology route
        // while anything is dated in it; no action here holds the line against a race, and is
        // checked at the end of the statement so deleting a whole universe still cascades.
        builder.HasOne(value => value.Era)
            .WithMany()
            .HasForeignKey(value => value.EraId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(value => new { value.EntityId, value.FieldDefinitionId });
    }
}

public sealed class TagConfiguration : IEntityTypeConfiguration<Tag>
{
    public void Configure(EntityTypeBuilder<Tag> builder)
    {
        builder.ToTable("Tags");
        builder.HasKey(tag => tag.Id);

        builder.Property(tag => tag.Name).IsRequired().HasMaxLength(LoreLimits.TagMaxLength);
        builder.Property(tag => tag.Slug).IsRequired().HasMaxLength(LoreLimits.TagMaxLength);

        builder.HasOne(tag => tag.Universe)
            .WithMany()
            .HasForeignKey(tag => tag.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(tag => new { tag.UniverseId, tag.Slug }).IsUnique();
    }
}

public sealed class EntityTagConfiguration : IEntityTypeConfiguration<EntityTag>
{
    public void Configure(EntityTypeBuilder<EntityTag> builder)
    {
        builder.ToTable("EntityTags");
        builder.HasKey(link => new { link.EntityId, link.TagId });

        builder.HasOne(link => link.Entity)
            .WithMany(entity => entity.EntityTags)
            .HasForeignKey(link => link.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(link => link.Tag)
            .WithMany(tag => tag.EntityTags)
            .HasForeignKey(link => link.TagId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
