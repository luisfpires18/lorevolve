using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.WorldRules;

/// <summary>The bounds a world rule is held to. Mirrored by the web client, which says so before a save rather than after.</summary>
public static class WorldRuleLimits
{
    /// <summary>The same bound a story, scene or idea title has: short enough to stay identifiable in a list.</summary>
    public const int TitleMaxLength = 200;

    /// <summary>
    /// How long a description may be, in characters as .NET and JavaScript both count them (UTF-16 units). The same bound a
    /// scene's or chapter's notes have: a rule is short explanatory text in a form, not prose in an editor.
    /// </summary>
    public const int DescriptionMaxLength = 10_000;

    /// <summary>How much of a description a list row carries. The rest is read when the rule is opened.</summary>
    public const int ExcerptLength = 240;
}

public sealed class WorldRuleConfiguration : IEntityTypeConfiguration<WorldRule>
{
    public void Configure(EntityTypeBuilder<WorldRule> builder)
    {
        builder.ToTable("WorldRules");
        builder.HasKey(rule => rule.Id);

        builder.Property(rule => rule.Title).IsRequired().HasMaxLength(WorldRuleLimits.TitleMaxLength);
        builder.Property(rule => rule.Description).IsRequired().HasMaxLength(WorldRuleLimits.DescriptionMaxLength);

        // Owned by the universe and gone with it. Unlike an idea, a rule is about one world and means nothing apart from it.
        builder.HasOne(rule => rule.Universe)
            .WithMany()
            .HasForeignKey(rule => rule.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // Every read starts from the universe and says live or in the Trash; the foreign key too.
        builder.HasIndex(rule => new { rule.UniverseId, rule.DeletedAt });
    }
}
