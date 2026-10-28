using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Universes;

/// <summary>
/// A universe whose owner turned AI help off: the workspace hides the assistant, Connect to AI and AI Changes. A row means
/// off; no row, the default, means on, so no existing universe needs one. Presentation only: the API's AI routes still
/// answer by role (ADR 0041). Not carried in a backup, so a restored universe starts with AI help on.
/// </summary>
public sealed class UniverseAiHelpOff
{
    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }
}

public sealed class UniverseAiHelpOffConfiguration : IEntityTypeConfiguration<UniverseAiHelpOff>
{
    public void Configure(EntityTypeBuilder<UniverseAiHelpOff> builder)
    {
        // A table beside Universes, never a column on it: a Universes column breaks the migration rollback tests.
        builder.ToTable("UniverseAiHelpOff");
        builder.HasKey(row => row.UniverseId);
        builder.HasOne(row => row.Universe).WithMany().HasForeignKey(row => row.UniverseId).OnDelete(DeleteBehavior.Cascade);
    }
}
