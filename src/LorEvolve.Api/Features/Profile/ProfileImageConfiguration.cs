using LorEvolve.Api.Features.Media;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Profile;

/// <summary>
/// Schema for the one profile photo. The account's id is the key, so "at most one" is a
/// constraint rather than a convention every write path has to remember, and the row goes when
/// the account does.
/// </summary>
public sealed class ProfileImageConfiguration : IEntityTypeConfiguration<ProfileImage>
{
    public void Configure(EntityTypeBuilder<ProfileImage> builder)
    {
        builder.ToTable("ProfileImages");
        builder.HasKey(image => image.UserId);

        builder.Property(image => image.OriginalKey)
            .IsRequired()
            .HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(image => image.ThumbnailKey)
            .IsRequired()
            .HasMaxLength(StoredImageLimits.ObjectKeyMaxLength);
        builder.Property(image => image.ContentType)
            .IsRequired()
            .HasMaxLength(StoredImageLimits.ContentTypeMaxLength);
        builder.Property(image => image.FileName)
            .HasMaxLength(StoredImageLimits.FileNameMaxLength);

        builder.HasOne(image => image.User)
            .WithOne()
            .HasForeignKey<ProfileImage>(image => image.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
