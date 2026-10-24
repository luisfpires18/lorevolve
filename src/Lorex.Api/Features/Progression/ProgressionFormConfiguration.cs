using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Progression;

public sealed class EntityFormConfiguration : IEntityTypeConfiguration<EntityForm>
{
    public void Configure(EntityTypeBuilder<EntityForm> builder)
    {
        builder.ToTable("EntityForms");
        builder.HasKey(form => form.Id);

        builder.Property(form => form.Name).IsRequired().HasMaxLength(ProgressionLimits.NameMaxLength);
        builder.Property(form => form.Description).HasMaxLength(ProgressionLimits.DescriptionMaxLength);

        builder.HasOne(form => form.Entity).WithMany().HasForeignKey(form => form.EntityId).OnDelete(DeleteBehavior.Cascade);

        // A milestone that goes - an era removed, a scene or moment deleted for good - leaves "when" unknown; nothing else moves.
        builder.HasOne(form => form.UnlockEntityEra).WithMany().HasForeignKey(form => form.UnlockEntityEraId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(form => form.UnlockScene).WithMany().HasForeignKey(form => form.UnlockSceneId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(form => form.UnlockTimelineEntry).WithMany().HasForeignKey(form => form.UnlockTimelineEntryId).OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(form => new { form.EntityId, form.SortOrder });
    }
}

public sealed class EntityFormEraConfiguration : IEntityTypeConfiguration<EntityFormEra>
{
    public void Configure(EntityTypeBuilder<EntityFormEra> builder)
    {
        builder.ToTable("EntityFormEras");
        builder.HasKey(link => new { link.EntityFormId, link.EntityEraId });
        builder.HasOne(link => link.Form).WithMany(form => form.Eras).HasForeignKey(link => link.EntityFormId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Era).WithMany().HasForeignKey(link => link.EntityEraId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(link => link.EntityEraId);
    }
}

public sealed class EntityFormSceneConfiguration : IEntityTypeConfiguration<EntityFormScene>
{
    public void Configure(EntityTypeBuilder<EntityFormScene> builder)
    {
        builder.ToTable("EntityFormScenes");
        builder.HasKey(link => new { link.EntityFormId, link.SceneId });
        builder.HasOne(link => link.Form).WithMany(form => form.Scenes).HasForeignKey(link => link.EntityFormId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Scene).WithMany().HasForeignKey(link => link.SceneId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(link => link.SceneId);
    }
}

public sealed class EntityAbilityConfiguration : IEntityTypeConfiguration<EntityAbility>
{
    public void Configure(EntityTypeBuilder<EntityAbility> builder)
    {
        builder.ToTable("EntityAbilities");
        builder.HasKey(ability => ability.Id);

        builder.Property(ability => ability.Name).IsRequired().HasMaxLength(ProgressionLimits.NameMaxLength);
        builder.Property(ability => ability.Description).HasMaxLength(ProgressionLimits.DescriptionMaxLength);

        builder.HasOne(ability => ability.Entity).WithMany().HasForeignKey(ability => ability.EntityId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(ability => ability.UnlockEntityEra).WithMany().HasForeignKey(ability => ability.UnlockEntityEraId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(ability => ability.UnlockScene).WithMany().HasForeignKey(ability => ability.UnlockSceneId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(ability => ability.UnlockTimelineEntry).WithMany().HasForeignKey(ability => ability.UnlockTimelineEntryId).OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(ability => new { ability.EntityId, ability.SortOrder });
    }
}

public sealed class EntityAbilityEraConfiguration : IEntityTypeConfiguration<EntityAbilityEra>
{
    public void Configure(EntityTypeBuilder<EntityAbilityEra> builder)
    {
        builder.ToTable("EntityAbilityEras");
        builder.HasKey(link => new { link.EntityAbilityId, link.EntityEraId });
        builder.HasOne(link => link.Ability).WithMany(ability => ability.Eras).HasForeignKey(link => link.EntityAbilityId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Era).WithMany().HasForeignKey(link => link.EntityEraId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(link => link.EntityEraId);
    }
}

public sealed class EntityAbilitySceneConfiguration : IEntityTypeConfiguration<EntityAbilityScene>
{
    public void Configure(EntityTypeBuilder<EntityAbilityScene> builder)
    {
        builder.ToTable("EntityAbilityScenes");
        builder.HasKey(link => new { link.EntityAbilityId, link.SceneId });
        builder.HasOne(link => link.Ability).WithMany(ability => ability.Scenes).HasForeignKey(link => link.EntityAbilityId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Scene).WithMany().HasForeignKey(link => link.SceneId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(link => link.SceneId);
    }
}

public sealed class EntityAbilityFormConfiguration : IEntityTypeConfiguration<EntityAbilityForm>
{
    public void Configure(EntityTypeBuilder<EntityAbilityForm> builder)
    {
        builder.ToTable("EntityAbilityForms");
        builder.HasKey(link => new { link.EntityAbilityId, link.EntityFormId });
        builder.HasOne(link => link.Ability).WithMany(ability => ability.Forms).HasForeignKey(link => link.EntityAbilityId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Form).WithMany().HasForeignKey(link => link.EntityFormId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(link => link.EntityFormId);
    }
}
