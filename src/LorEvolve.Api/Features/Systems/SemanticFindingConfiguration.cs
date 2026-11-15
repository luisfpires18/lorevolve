using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Systems;

/// <summary>The bounds a submitted semantic finding is held to.</summary>
public static class SemanticFindingLimits
{
    /// <summary>The same bound a world rule or a System's title has.</summary>
    public const int TitleMaxLength = WorldLogicLimits.NameMaxLength;

    /// <summary>
    /// The claim in the client's words. As long as a world rule's description: a paragraph or two of reasoning, not
    /// an essay, and small enough that a flooded list is still readable.
    /// </summary>
    public const int ClaimMaxLength = WorldLogicLimits.DescriptionMaxLength;

    /// <summary>What one citation contributes, in the client's words.</summary>
    public const int CitationNoteMaxLength = 500;

    /// <summary>How long a note the author may leave when accepting or dismissing one.</summary>
    public const int DecisionNoteMaxLength = WorldLogicFindingLimits.NoteMaxLength;

    /// <summary>The app's name as it registered it, the same bound a connection's client id has.</summary>
    public const int ClientNameMaxLength = 200;

    /// <summary>
    /// A claim must cite at least one record, because an uncited claim is not checkable and the issue's boundary is
    /// that a proposed finding cites its sources.
    /// </summary>
    public const int MinCitations = 1;

    /// <summary>
    /// How many records one claim may cite. Past this it is a report, not a finding, and the author cannot check it.
    /// </summary>
    public const int MaxCitations = 20;

    /// <summary>
    /// How many undecided claims one universe may hold. A connection that keeps submitting stops being useful and
    /// starts being a way to bury the author, so submission is refused once this many are waiting rather than
    /// trimming silently. The author clears it by accepting or dismissing.
    /// </summary>
    public const int MaxUnverifiedPerUniverse = 200;

    /// <summary>Default and largest page, as every other World Logic list has.</summary>
    public const int DefaultPageSize = WorldLogicLimits.DefaultPageSize;

    public const int MaxPageSize = WorldLogicLimits.MaxPageSize;
}

public sealed class SemanticFindingConfiguration : IEntityTypeConfiguration<SemanticFinding>
{
    public void Configure(EntityTypeBuilder<SemanticFinding> builder)
    {
        builder.ToTable("SemanticFindings");
        builder.HasKey(finding => finding.Id);

        builder.Property(finding => finding.Title)
            .IsRequired()
            .HasMaxLength(SemanticFindingLimits.TitleMaxLength);

        builder.Property(finding => finding.Claim)
            .IsRequired()
            .HasMaxLength(SemanticFindingLimits.ClaimMaxLength);

        builder.Property(finding => finding.ClientName)
            .HasMaxLength(SemanticFindingLimits.ClientNameMaxLength);

        builder.Property(finding => finding.SubmittedByUserId)
            .IsRequired();

        builder.Property(finding => finding.DecisionNote)
            .HasMaxLength(SemanticFindingLimits.DecisionNoteMaxLength);

        builder.Property(finding => finding.Status).HasConversion<int>();

        // Gone with the universe it is about, as every other universe-scoped row is.
        builder.HasOne(finding => finding.Universe)
            .WithMany()
            .HasForeignKey(finding => finding.UniverseId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // A claim about one project goes with that project: the scope is part of what the claim is.
        builder.HasOne(finding => finding.Project)
            .WithMany()
            .HasForeignKey(finding => finding.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        // A claim about a rule that is gone is a claim about nothing, so it goes with the rule. The link is
        // optional, but setting it to null on delete would turn a claim about one rule into a claim about the
        // whole universe, which is not what the client said.
        builder.HasOne(finding => finding.Rule)
            .WithMany()
            .HasForeignKey(finding => finding.RuleId)
            .OnDelete(DeleteBehavior.Cascade);

        // The author's list: what is waiting, inside one universe, newest first.
        builder.HasIndex(finding => new { finding.UniverseId, finding.Status, finding.CreatedAt });

        // "How many are waiting for this universe", which every submission asks before writing.
        builder.HasIndex(finding => new { finding.UniverseId, finding.ProjectId });

        builder.HasIndex(finding => finding.RuleId);
    }
}

public sealed class SemanticFindingCitationConfiguration : IEntityTypeConfiguration<SemanticFindingCitation>
{
    public void Configure(EntityTypeBuilder<SemanticFindingCitation> builder)
    {
        builder.ToTable("SemanticFindingCitations");
        builder.HasKey(citation => new { citation.FindingId, citation.SortOrder });

        builder.Property(citation => citation.Kind).HasConversion<int>();

        builder.Property(citation => citation.Note)
            .IsRequired()
            .HasMaxLength(SemanticFindingLimits.CitationNoteMaxLength);

        builder.HasOne(citation => citation.Finding)
            .WithMany(finding => finding.Citations)
            .HasForeignKey(citation => citation.FindingId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
    }
}
