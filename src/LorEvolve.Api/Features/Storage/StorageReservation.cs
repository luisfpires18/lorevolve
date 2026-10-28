using LorEvolve.Api.Features.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Storage;

/// <summary>
/// Bytes held against an account while an upload is in flight - between the quota check and the commit that makes the
/// picture count for real. Nothing else.
///
/// It exists because the database cannot hold a write transaction open across the object store: the check runs in
/// one short transaction, the bytes go to the bucket with no transaction open, and the association commits in a
/// second. Without a hold, two uploads could both pass the check before either committed. With one, the second check
/// sees the first upload's bytes already spoken for.
///
/// A hold is consumed in the transaction that commits the picture, released when the upload fails, and stops counting
/// at <see cref="ExpiresAt"/> whatever happened - so a process that dies mid-upload cannot keep an account's space
/// forever. Not part of any universe, so never in a backup. See ADR 0042.
/// </summary>
public sealed class StorageReservation
{
    public Guid Id { get; set; }

    /// <summary>The account whose storage the bytes are held against: the universe's owner, never the uploader.</summary>
    public required string UserId { get; set; }

    public LorEvolveUser? User { get; set; }

    /// <summary>The net increase being held, always above zero. An upload that frees space or keeps it level holds nothing.</summary>
    public long Bytes { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>From this moment the hold counts for nothing, whether or not its row is still there.</summary>
    public DateTime ExpiresAt { get; set; }
}

/// <summary>
/// Reservation schema: held per account, read by account and expiry, gone with the account, never zero or negative.
/// </summary>
public sealed class StorageReservationConfiguration : IEntityTypeConfiguration<StorageReservation>
{
    public void Configure(EntityTypeBuilder<StorageReservation> builder)
    {
        builder.ToTable("StorageReservations", table =>
            table.HasCheckConstraint("CK_StorageReservations_Bytes", "\"Bytes\" > 0"));
        builder.HasKey(reservation => reservation.Id);

        builder.Property(reservation => reservation.UserId).IsRequired();

        builder.HasOne(reservation => reservation.User)
            .WithMany()
            .HasForeignKey(reservation => reservation.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Every read is "this account's holds that have not lapsed".
        builder.HasIndex(reservation => new { reservation.UserId, reservation.ExpiresAt });
    }
}
