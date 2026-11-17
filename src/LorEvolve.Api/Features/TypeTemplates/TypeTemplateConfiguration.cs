using LorEvolve.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.TypeTemplates;

public sealed class TypeTemplateConfiguration : IEntityTypeConfiguration<TypeTemplate>
{
    public void Configure(EntityTypeBuilder<TypeTemplate> builder)
    {
        builder.ToTable("TypeTemplates");
        builder.HasKey(template => template.Id);

        builder.Property(template => template.Name).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(template => template.Description).HasMaxLength(LoreLimits.DescriptionMaxLength);
        builder.Property(template => template.Icon).HasMaxLength(LoreLimits.IconMaxLength);
        builder.Property(template => template.AccentColor).HasMaxLength(LoreLimits.AccentColorLength);

        // A template goes with its universe; nothing else refers to it.
        builder.HasOne(template => template.Universe)
            .WithMany()
            .HasForeignKey(template => template.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(template => new { template.UniverseId, template.Name }).IsUnique();
    }
}

public sealed class TypeTemplateFieldConfiguration : IEntityTypeConfiguration<TypeTemplateField>
{
    public void Configure(EntityTypeBuilder<TypeTemplateField> builder)
    {
        builder.ToTable("TypeTemplateFields");
        builder.HasKey(field => field.Id);

        builder.Property(field => field.Name).IsRequired().HasMaxLength(LoreLimits.NameMaxLength);
        builder.Property(field => field.Kind).HasConversion<int>();
        builder.Property(field => field.ImageShape).HasConversion<int?>();

        builder.HasOne(field => field.Template)
            .WithMany(template => template.Fields)
            .HasForeignKey(field => field.TemplateId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class TypeTemplateFieldOptionConfiguration : IEntityTypeConfiguration<TypeTemplateFieldOption>
{
    public void Configure(EntityTypeBuilder<TypeTemplateFieldOption> builder)
    {
        builder.ToTable("TypeTemplateFieldOptions");
        builder.HasKey(option => option.Id);

        builder.Property(option => option.Value).IsRequired().HasMaxLength(LoreLimits.OptionMaxLength);

        builder.HasOne(option => option.Field)
            .WithMany(field => field.Options)
            .HasForeignKey(option => option.FieldId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
