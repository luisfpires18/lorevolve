using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Admin;

/// <summary>An account's role on LorEvolve itself (#40). Independent of every universe role.</summary>
public enum PlatformRole
{
    Member = 0,
    Admin = 1,
}

/// <summary>What an Admin did to an account. Block and unblock are the only actions V1 has (#40).</summary>
public enum AdminAction
{
    Block = 1,
    Unblock = 2,
}

/// <summary>
/// One Admin action on one account, written in the same transaction as the action itself (#40): who did it, to which
/// account (by its immutable id), what, why and when. Append-only - no route edits or removes one - and read only by an
/// Admin. Holds no token, no password, no email and no Lore content: only the reason the Admin typed.
///
/// The ids are plain strings rather than foreign keys, so the record outlives either account.
/// </summary>
public sealed class AdminAuditRecord
{
    public Guid Id { get; set; }

    public required string ActorUserId { get; set; }

    public required string TargetUserId { get; set; }

    public AdminAction Action { get; set; }

    public required string Reason { get; set; }

    /// <summary>UTC.</summary>
    public DateTime CreatedAt { get; set; }
}

public sealed class AdminAuditRecordConfiguration : IEntityTypeConfiguration<AdminAuditRecord>
{
    public void Configure(EntityTypeBuilder<AdminAuditRecord> builder)
    {
        builder.ToTable("AdminAuditRecords");
        builder.HasKey(record => record.Id);
        builder.Property(record => record.ActorUserId).HasMaxLength(450);
        builder.Property(record => record.TargetUserId).HasMaxLength(450);
        builder.Property(record => record.Action).HasConversion<int>();
        builder.Property(record => record.Reason).HasMaxLength(AdminLimits.ReasonMaxLength);

        // An account's own history, newest first.
        builder.HasIndex(record => new { record.TargetUserId, record.CreatedAt });
    }
}
