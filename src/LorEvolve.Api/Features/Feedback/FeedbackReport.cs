using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Feedback;

/// <summary>What a report is about.</summary>
public enum FeedbackKind
{
    Bug = 0,
    Feature = 1,
}

/// <summary>
/// A bug report or feature request, sent from the button on every signed-in page and read only by an Admin. Holds what the
/// person wrote, the page it was sent from and who sent it. The account id is a plain string rather than a foreign key, as
/// on <c>AdminAuditRecord</c>, so a report outlives the account. Never part of a universe's backup.
/// </summary>
public sealed class FeedbackReport
{
    public const int TextMaxLength = 4000;

    public const int PageMaxLength = 500;

    public Guid Id { get; set; }

    public required string UserId { get; set; }

    public FeedbackKind Kind { get; set; }

    public required string Text { get; set; }

    /// <summary>The path the report was sent from, such as <c>/app/universes/{id}/lore</c>. No query string, no host.</summary>
    public string? Page { get; set; }

    /// <summary>UTC.</summary>
    public DateTime CreatedAt { get; set; }
}

public sealed class FeedbackReportConfiguration : IEntityTypeConfiguration<FeedbackReport>
{
    public void Configure(EntityTypeBuilder<FeedbackReport> builder)
    {
        builder.ToTable("FeedbackReports");
        builder.HasKey(report => report.Id);
        builder.Property(report => report.UserId).HasMaxLength(450);
        builder.Property(report => report.Text).HasMaxLength(FeedbackReport.TextMaxLength);
        builder.Property(report => report.Page).HasMaxLength(FeedbackReport.PageMaxLength);
        builder.HasIndex(report => report.CreatedAt);
    }
}
