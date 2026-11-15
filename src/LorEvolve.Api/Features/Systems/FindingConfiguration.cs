using LorEvolve.Api.Features.CanonIntegrity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Systems;

/// <summary>The bounds a stored finding is held to.</summary>
public static class WorldLogicFindingLimits
{
    /// <summary>SHA-256 as lowercase hex, exactly as a Canon conflict's fingerprint is.</summary>
    public const int FingerprintLength = CanonIntegrityLimits.FingerprintLength;

    /// <summary>The longest error code the specification defines, with room to spare.</summary>
    public const int ErrorCodeMaxLength = 40;

    /// <summary>A fact source name: "subjects", "relations", "events".</summary>
    public const int SourceMaxLength = 40;

    /// <summary>An evidence id: a Guid in production, a fixture's own label in a test.</summary>
    public const int SourceRowIdMaxLength = 100;

    /// <summary>An evidence role, such as "attribute:purity". As long as a Canon subject's role, plus an attribute name.</summary>
    public const int RoleMaxLength = 120;

    /// <summary>
    /// How much rationale a finding stores. A condition is capped at 256 nodes on save, so a trace is already
    /// bounded; this is the column's own limit, and <see cref="WorldLogicRationale"/> drops trailing lines to fit.
    /// </summary>
    public const int RationaleMaxLength = 8_000;

    /// <summary>How long a note an author may leave when reviewing, dismissing or resolving a finding.</summary>
    public const int NoteMaxLength = 1_000;

    /// <summary>Default and largest page of the findings list, as every other World Logic list has.</summary>
    public const int DefaultPageSize = WorldLogicLimits.DefaultPageSize;

    public const int MaxPageSize = WorldLogicLimits.MaxPageSize;

    /// <summary>
    /// How many findings one sweep may record for one universe and scope. A sweep evaluates every rule, so the
    /// count is bounded by the rule budget already; this is the safety bound on what is written, and a sweep that
    /// reaches it reports itself truncated rather than filling the table.
    /// </summary>
    public const int MaxFindingsPerSweep = 2_000;
}

public sealed class WorldLogicFindingConfiguration : IEntityTypeConfiguration<WorldLogicFinding>
{
    public void Configure(EntityTypeBuilder<WorldLogicFinding> builder)
    {
        builder.ToTable("WorldLogicFindings");
        builder.HasKey(finding => finding.Id);

        builder.Property(finding => finding.Fingerprint)
            .IsRequired()
            .HasMaxLength(WorldLogicFindingLimits.FingerprintLength);

        builder.Property(finding => finding.ErrorCode)
            .HasMaxLength(WorldLogicFindingLimits.ErrorCodeMaxLength);

        builder.Property(finding => finding.Rationale)
            .IsRequired()
            .HasMaxLength(WorldLogicFindingLimits.RationaleMaxLength);

        builder.Property(finding => finding.Outcome).HasConversion<int>();
        builder.Property(finding => finding.Status).HasConversion<int>();

        // The finding reaches its universe through the rule, which cascades from the universe, so deleting a
        // universe deletes its findings without a second cascade path. Deleting one rule takes its findings with
        // it: they are entirely that rule's answer, and nothing else can reproduce them.
        builder.HasOne(finding => finding.Rule)
            .WithMany()
            .HasForeignKey(finding => finding.RuleId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // A project-scoped finding goes with its project, for the same reason: the scope is part of what the
        // finding is. ClientSetNull rather than Cascade would leave it looking like a universe-wide finding.
        builder.HasOne(finding => finding.Project)
            .WithMany()
            .HasForeignKey(finding => finding.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        // The fingerprint is what makes a sweep idempotent, so the database enforces it rather than trusting the
        // sweep to look first. Scoped to the universe, as a Canon conflict's is.
        builder.HasIndex(finding => new { finding.UniverseId, finding.Fingerprint })
            .IsUnique();

        // The review listing: what needs attention first, inside one universe.
        builder.HasIndex(finding => new { finding.UniverseId, finding.Status, finding.Outcome });

        // A sweep reads exactly one universe and one scope.
        builder.HasIndex(finding => new { finding.UniverseId, finding.ProjectId });
    }
}

public sealed class WorldLogicFindingEvidenceConfiguration : IEntityTypeConfiguration<WorldLogicFindingEvidence>
{
    public void Configure(EntityTypeBuilder<WorldLogicFindingEvidence> builder)
    {
        builder.ToTable("WorldLogicFindingEvidence");
        builder.HasKey(evidence => new { evidence.FindingId, evidence.SortOrder });

        builder.Property(evidence => evidence.Source)
            .IsRequired()
            .HasMaxLength(WorldLogicFindingLimits.SourceMaxLength);

        builder.Property(evidence => evidence.SourceRowId)
            .IsRequired()
            .HasMaxLength(WorldLogicFindingLimits.SourceRowIdMaxLength);

        builder.Property(evidence => evidence.Role)
            .IsRequired()
            .HasMaxLength(WorldLogicFindingLimits.RoleMaxLength);

        builder.HasOne(evidence => evidence.Finding)
            .WithMany(finding => finding.Evidence)
            .HasForeignKey(evidence => evidence.FindingId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class WorldLogicFindingEventConfiguration : IEntityTypeConfiguration<WorldLogicFindingEvent>
{
    public void Configure(EntityTypeBuilder<WorldLogicFindingEvent> builder)
    {
        builder.ToTable("WorldLogicFindingEvents");
        builder.HasKey(entry => entry.Id);

        builder.Property(entry => entry.Action).HasConversion<int>();

        builder.Property(entry => entry.Note)
            .IsRequired()
            .HasMaxLength(WorldLogicFindingLimits.NoteMaxLength);

        // No foreign key on the actor: an account may be deleted, and the history of who dismissed a finding is
        // worth more than the row's tidiness. The id is shown only to members of the universe, who can already see
        // each other.
        builder.Property(entry => entry.ActorId)
            .HasMaxLength(450);

        builder.HasOne(entry => entry.Finding)
            .WithMany(finding => finding.Events)
            .HasForeignKey(entry => entry.FindingId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(entry => new { entry.FindingId, entry.At });
    }
}
