using Lorex.Api.Features.Chronology;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Lore;

public sealed class EntityRevisionConfiguration : IEntityTypeConfiguration<EntityRevision>
{
    public void Configure(EntityTypeBuilder<EntityRevision> builder)
    {
        builder.ToTable("EntityRevisions");
        builder.HasKey(revision => revision.Id);

        builder.Property(revision => revision.Name).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(revision => revision.EntityTypeName).IsRequired()
            .HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(revision => revision.Summary).HasMaxLength(LoreLimits.SummaryMaxLength);
        builder.Property(revision => revision.Content).HasMaxLength(LoreLimits.ContentMaxLength);
        builder.Property(revision => revision.CanonStatus).HasConversion<int>();
        builder.Property(revision => revision.Kind).HasConversion<int>();
        builder.Property(revision => revision.Changes).HasConversion<int>();

        // The only key into live lore. History belongs to its entry and goes with it.
        builder.HasOne(revision => revision.Entity)
            .WithMany()
            .HasForeignKey(revision => revision.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        // Two versions of one entry can never share a number, which is also what makes the
        // next number safe to derive from the highest one on record.
        builder.HasIndex(revision => new { revision.EntityId, revision.Number }).IsUnique();
    }
}

public sealed class EntityRevisionAliasConfiguration : IEntityTypeConfiguration<EntityRevisionAlias>
{
    public void Configure(EntityTypeBuilder<EntityRevisionAlias> builder)
    {
        builder.ToTable("EntityRevisionAliases");
        builder.HasKey(alias => alias.Id);

        builder.Property(alias => alias.Value).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);

        builder.HasOne(alias => alias.Revision)
            .WithMany(revision => revision.Aliases)
            .HasForeignKey(alias => alias.RevisionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(alias => alias.RevisionId);
    }
}

public sealed class EntityRevisionTagConfiguration : IEntityTypeConfiguration<EntityRevisionTag>
{
    public void Configure(EntityTypeBuilder<EntityRevisionTag> builder)
    {
        builder.ToTable("EntityRevisionTags");
        builder.HasKey(tag => tag.Id);

        builder.Property(tag => tag.Name).IsRequired().HasMaxLength(LoreLimits.TagMaxLength);

        builder.HasOne(tag => tag.Revision)
            .WithMany(revision => revision.Tags)
            .HasForeignKey(tag => tag.RevisionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(tag => tag.RevisionId);
    }
}

public sealed class EntityRevisionFieldValueConfiguration
    : IEntityTypeConfiguration<EntityRevisionFieldValue>
{
    public void Configure(EntityTypeBuilder<EntityRevisionFieldValue> builder)
    {
        builder.ToTable("EntityRevisionFieldValues");
        builder.HasKey(value => value.Id);

        builder.Property(value => value.FieldName).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(value => value.TextValue).HasMaxLength(LoreLimits.TextValueMaxLength);
        builder.Property(value => value.OptionValue).HasMaxLength(LoreLimits.OptionMaxLength);
        builder.Property(value => value.ReferencedEntityName).HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(value => value.EraLabel).HasMaxLength(ChronologyLimits.NameMaxLength);
        builder.Property(value => value.Kind).HasConversion<int>();

        builder.HasOne(value => value.Revision)
            .WithMany(revision => revision.FieldValues)
            .HasForeignKey(value => value.RevisionId)
            .OnDelete(DeleteBehavior.Cascade);

        // No key on FieldDefinitionId, OptionId, ReferencedEntityId or EraId on purpose: a
        // snapshot is never rewritten when what it names changes or goes. Since Issue #39 a field
        // definition or a choice a snapshot names is still never deleted - the API refuses it, read
        // through these two indexes - but that is a check, not a key, so the snapshot stays plain data.
        builder.HasIndex(value => value.RevisionId);
        builder.HasIndex(value => value.FieldDefinitionId);
        builder.HasIndex(value => value.OptionId);
    }
}
