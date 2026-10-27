using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.RuleValidation;

/// <summary>The bounds world rule checks are held to. Mirrored by the web client.</summary>
public static class RuleValidationLimits
{
    /// <summary>A label in a list, not a sentence.</summary>
    public const int TermNameMaxLength = 80;

    /// <summary>A limit higher than this is not a limit anyone is writing down about a world.</summary>
    public const int MaxOccurrencesCeiling = 10_000;

    /// <summary>How many moments a rule's check names as not counted. The total is always given.</summary>
    public const int UncountedListed = 20;
}

public sealed class ValidationTermConfiguration : IEntityTypeConfiguration<ValidationTerm>
{
    public void Configure(EntityTypeBuilder<ValidationTerm> builder)
    {
        builder.ToTable("ValidationTerms");
        builder.HasKey(term => term.Id);

        builder.Property(term => term.Name).IsRequired().HasMaxLength(RuleValidationLimits.TermNameMaxLength);

        // Composition and case mapping can lengthen a name slightly; the bound that matters is on the name itself.
        builder.Property(term => term.NormalizedName).IsRequired().HasMaxLength(RuleValidationLimits.TermNameMaxLength * 2);
        builder.Property(term => term.Kind).HasConversion<int>();

        // Owned by the universe and gone with it: a vocabulary means nothing outside its world.
        builder.HasOne(term => term.Universe)
            .WithMany()
            .HasForeignKey(term => term.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // Two terms of one kind an author could not tell apart in a list are refused by the database, not only by the route.
        builder.HasIndex(term => new { term.UniverseId, term.Kind, term.NormalizedName }).IsUnique();
    }
}

public sealed class WorldRuleValidationConfiguration : IEntityTypeConfiguration<WorldRuleValidation>
{
    public void Configure(EntityTypeBuilder<WorldRuleValidation> builder)
    {
        builder.ToTable("WorldRuleValidations");
        builder.HasKey(validation => validation.WorldRuleId);
        builder.Property(validation => validation.Kind).HasConversion<int>();

        builder.HasOne(validation => validation.WorldRule)
            .WithOne(rule => rule.Validation)
            .HasForeignKey<WorldRuleValidation>(validation => validation.WorldRuleId)
            .OnDelete(DeleteBehavior.Cascade);

        // No action, not cascade and not set-null: a term a rule checks by cannot quietly take the check with it or leave it
        // half configured. The term route refuses the deletion first; this holds if a race gets past it. No action rather than
        // restrict so deleting a whole universe, which cascades to its terms and its rules in one statement, is checked once the
        // statement is done - as an era a moment is dated in (ADR 0022).
        builder.HasOne(validation => validation.EventKindTerm)
            .WithMany()
            .HasForeignKey(validation => validation.EventKindTermId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(validation => validation.MethodTerm)
            .WithMany()
            .HasForeignKey(validation => validation.MethodTermId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}

public sealed class TimelineEntryValidationConfiguration : IEntityTypeConfiguration<TimelineEntryValidation>
{
    public void Configure(EntityTypeBuilder<TimelineEntryValidation> builder)
    {
        builder.ToTable("TimelineEntryValidations");
        builder.HasKey(validation => validation.TimelineEntryId);

        builder.HasOne(validation => validation.TimelineEntry)
            .WithOne(entry => entry.Validation)
            .HasForeignKey<TimelineEntryValidation>(validation => validation.TimelineEntryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(validation => validation.EventKindTerm)
            .WithMany()
            .HasForeignKey(validation => validation.EventKindTermId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(validation => validation.MethodTerm)
            .WithMany()
            .HasForeignKey(validation => validation.MethodTermId)
            .OnDelete(DeleteBehavior.NoAction);

        // An entry row deleted for good leaves the moment's other details standing and its participant missing - which a check
        // then reports as a moment it could not count, rather than silently forgetting the moment was ever described.
        builder.HasOne(validation => validation.ParticipantEntity)
            .WithMany()
            .HasForeignKey(validation => validation.ParticipantEntityId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
