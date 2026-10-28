using LorEvolve.Api.Features.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Universes;

/// <summary>The bounds an invitation is held to (ADR 0041 amendment, refinement 030).</summary>
public static class InvitationLimits
{
    /// <summary>How long an invitation stays acceptable. One value, read by every route that creates or checks one.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);

    /// <summary>Identity's own bound on an email address, so anything an account can hold can be invited.</summary>
    public const int EmailMaxLength = 256;
}

/// <summary>
/// A pending offer to join one universe as a collaborator, addressed to an email address, so the owner never learns
/// whether an account holds it (ADR 0041 amendment). Only pending invitations exist: accepting turns one into a
/// <see cref="UniverseMembership"/> and deletes it, declining or revoking deletes it, and an expired one is ignored until
/// it is replaced or removed. Account access metadata, never part of a backup.
///
/// <para><b>An email address is not an identity here</b>: LorEvolve does not verify one at registration. So an invitation is
/// claimed only through its protected link (<see cref="InvitationClaims"/>). Matching an account's email to
/// <see cref="NormalizedEmail"/> is an extra check on a link, never permission on its own.</para>
/// </summary>
public sealed class UniverseInvitation
{
    /// <summary>Random, minted by the server.</summary>
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>As the owner typed it, trimmed: what the owner's list shows.</summary>
    public required string Email { get; set; }

    /// <summary>Identity's normalization of <see cref="Email"/>, compared with an account's <c>NormalizedEmail</c>.</summary>
    public required string NormalizedEmail { get; set; }

    /// <summary>Viewer, Reviewer or Editor - the role accepting gives. Never Owner.</summary>
    public UniverseRole Role { get; set; }

    /// <summary>UTC.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>UTC. <see cref="CreatedAt"/> plus <see cref="InvitationLimits.Lifetime"/>; a role change does not extend it.</summary>
    public DateTime ExpiresAt { get; set; }
}

public sealed class UniverseInvitationConfiguration : IEntityTypeConfiguration<UniverseInvitation>
{
    public void Configure(EntityTypeBuilder<UniverseInvitation> builder)
    {
        builder.ToTable("UniverseInvitations", table => table.HasCheckConstraint(
            "CK_UniverseInvitations_Role",
            $"\"Role\" IN ({(int)UniverseRole.Viewer}, {(int)UniverseRole.Reviewer}, {(int)UniverseRole.Editor})"));
        builder.HasKey(invitation => invitation.Id);
        builder.Property(invitation => invitation.Id).ValueGeneratedNever();

        builder.Property(invitation => invitation.Email).IsRequired().HasMaxLength(InvitationLimits.EmailMaxLength);
        builder.Property(invitation => invitation.NormalizedEmail).IsRequired().HasMaxLength(InvitationLimits.EmailMaxLength);
        builder.Property(invitation => invitation.Role).HasConversion<int>();

        // Gone with the universe.
        builder.HasOne(invitation => invitation.Universe)
            .WithMany()
            .HasForeignKey(invitation => invitation.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // One invitation per universe and address. An expired one is deleted by the create that replaces it.
        builder.HasIndex(invitation => new { invitation.UniverseId, invitation.NormalizedEmail }).IsUnique();
    }
}
