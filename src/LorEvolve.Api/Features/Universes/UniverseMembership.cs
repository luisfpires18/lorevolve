using LorEvolve.Api.Features.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Universes;

/// <summary>
/// What a caller may be to a universe (ADR 0041). <see cref="Owner"/> is never stored: it is read from
/// <see cref="Universe.OwnerId"/>, the one source of ownership. A membership row holds only the collaborator roles,
/// and the database refuses any other value.
///
/// The numbers are not a ladder. What a role may do is <see cref="UniverseAccess.Allows"/>, capability by capability -
/// a Reviewer will gain comments without gaining edits - so nothing compares roles by value.
/// </summary>
public enum UniverseRole
{
    Owner = 0,
    Viewer = 1,
    Reviewer = 2,
    Editor = 3,
}

/// <summary>
/// A non-owner's access to one universe. Account access metadata, not world content: it is never written to a backup,
/// and a restore never creates one (ADR 0041). No route creates one yet - invitations are later work.
/// </summary>
public sealed class UniverseMembership
{
    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string UserId { get; set; }

    public LorEvolveUser? User { get; set; }

    /// <summary>Viewer, Reviewer or Editor. Never Owner.</summary>
    public UniverseRole Role { get; set; }

    /// <summary>UTC.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>UTC.</summary>
    public DateTime UpdatedAt { get; set; }
}

public sealed class UniverseMembershipConfiguration : IEntityTypeConfiguration<UniverseMembership>
{
    public void Configure(EntityTypeBuilder<UniverseMembership> builder)
    {
        // One row per universe and user; the key also serves the per-request lookup, which names both.
        builder.ToTable("UniverseMemberships", table => table.HasCheckConstraint(
            "CK_UniverseMemberships_Role",
            $"\"Role\" IN ({(int)UniverseRole.Viewer}, {(int)UniverseRole.Reviewer}, {(int)UniverseRole.Editor})"));
        builder.HasKey(membership => new { membership.UniverseId, membership.UserId });

        builder.Property(membership => membership.Role).HasConversion<int>();

        // Gone with the universe, and gone with the account.
        builder.HasOne(membership => membership.Universe)
            .WithMany()
            .HasForeignKey(membership => membership.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(membership => membership.User)
            .WithMany()
            .HasForeignKey(membership => membership.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // "Which universes is this account a member of", for the universe list.
        builder.HasIndex(membership => membership.UserId);
    }
}
