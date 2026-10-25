using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Auth;

/// <summary>
/// Identity only indexes the normalized email, it does not make it unique, so
/// <c>RequireUniqueEmail</c> is enforced by an application-level check that two concurrent
/// registrations can slip past. The unique index makes the database the arbiter.
/// </summary>
public sealed class LorexUserConfiguration : IEntityTypeConfiguration<LorexUser>
{
    public void Configure(EntityTypeBuilder<LorexUser> builder)
    {
        builder.HasIndex(user => user.NormalizedEmail)
            .HasDatabaseName("EmailIndex")
            .IsUnique();

        builder.Property(user => user.PublicDisplayName)
            .HasMaxLength(Publishing.PublicationLimits.DisplayNameMaxLength);

        // The public author address (ADR 0037): unique across accounts; nulls - every account never published -
        // do not collide.
        builder.Property(user => user.PublicAuthorSlug)
            .HasMaxLength(Publishing.PublicationLimits.SlugMaxLength);
        builder.HasIndex(user => user.PublicAuthorSlug).IsUnique();

        // The column's default is what every account that existed before storage quotas receives (ADR 0042). A new
        // account gets the same from the property's own initializer.
        builder.Property(user => user.StorageQuotaBytes).HasDefaultValue(Storage.StorageQuota.DefaultBytes);

        // Every existing account is a Member (#40): the column's default, 0. At most one account is Admin, held by the
        // database whatever writes the row (ADR 0059): a unique index over the Admin rows alone.
        builder.Property(user => user.PlatformRole).HasConversion<int>();
        builder.HasIndex(user => user.PlatformRole)
            .HasDatabaseName("IX_AspNetUsers_SoleAdmin")
            .IsUnique()
            .HasFilter($"\"PlatformRole\" = {(int)Admin.PlatformRole.Admin}");
    }
}
