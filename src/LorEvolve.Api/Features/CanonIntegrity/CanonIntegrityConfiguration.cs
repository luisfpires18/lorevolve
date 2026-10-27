using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.CanonIntegrity;

public static class CanonIntegrityLimits
{
    public const int RuleCodeMaxLength = 40;

    /// <summary>SHA-256 rendered as lowercase hex.</summary>
    public const int FingerprintLength = 64;

    public const int TitleMaxLength = 200;
    public const int ExplanationMaxLength = 2000;
    public const int RoleMaxLength = 40;
}

public sealed class CanonConflictConfiguration : IEntityTypeConfiguration<CanonConflict>
{
    public void Configure(EntityTypeBuilder<CanonConflict> builder)
    {
        builder.ToTable("CanonConflicts");
        builder.HasKey(conflict => conflict.Id);

        builder.Property(conflict => conflict.RuleCode)
            .IsRequired()
            .HasMaxLength(CanonIntegrityLimits.RuleCodeMaxLength);

        builder.Property(conflict => conflict.Fingerprint)
            .IsRequired()
            .HasMaxLength(CanonIntegrityLimits.FingerprintLength);

        builder.Property(conflict => conflict.Title)
            .IsRequired()
            .HasMaxLength(CanonIntegrityLimits.TitleMaxLength);

        builder.Property(conflict => conflict.Explanation)
            .IsRequired()
            .HasMaxLength(CanonIntegrityLimits.ExplanationMaxLength);

        builder.Property(conflict => conflict.Severity).HasConversion<int>();
        builder.Property(conflict => conflict.Status).HasConversion<int>();

        builder.HasOne(conflict => conflict.Universe)
            .WithMany()
            .HasForeignKey(conflict => conflict.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // The fingerprint is what makes evaluation idempotent, so the database enforces it
        // rather than trusting the evaluator to look first. Scoped to the universe: the
        // same rule finding the same shape of problem in two universes is two conflicts.
        builder.HasIndex(conflict => new { conflict.UniverseId, conflict.Fingerprint })
            .IsUnique();

        // The review listing: pending first, then severity, inside one universe.
        builder.HasIndex(conflict => new { conflict.UniverseId, conflict.Status, conflict.Severity });
    }
}

public sealed class CanonConflictSubjectConfiguration : IEntityTypeConfiguration<CanonConflictSubject>
{
    public void Configure(EntityTypeBuilder<CanonConflictSubject> builder)
    {
        builder.ToTable("CanonConflictSubjects");

        // A record may appear twice in one conflict under different roles - the owner of a
        // field and the entity it points at are both entities - so the role is part of the key.
        builder.HasKey(subject => new
        {
            subject.ConflictId,
            subject.SubjectKind,
            subject.SubjectId,
            subject.Role,
        });

        builder.Property(subject => subject.SubjectKind).HasConversion<int>();

        builder.Property(subject => subject.Role)
            .IsRequired()
            .HasMaxLength(CanonIntegrityLimits.RoleMaxLength);

        builder.HasOne(subject => subject.Conflict)
            .WithMany(conflict => conflict.Subjects)
            .HasForeignKey(subject => subject.ConflictId)
            .OnDelete(DeleteBehavior.Cascade);

        // Read from the lore side too: "what is wrong with this character?".
        builder.HasIndex(subject => new { subject.SubjectKind, subject.SubjectId });
    }
}
