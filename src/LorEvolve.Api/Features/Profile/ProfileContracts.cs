using LorEvolve.Api.Features.Media;

namespace LorEvolve.Api.Features.Profile;

/// <summary>
/// What the client is told about the signed-in account's photo. Identifiers and pixels, never a
/// URL: the client composes <c>/api/profile/image/{assetId}/{variant}</c> from these, which is the
/// same derivation on the other side of the wire. Nothing that names Cloudflare, a bucket or an
/// endpoint is ever in a response, and neither is the user id - the session already says who this
/// is, and putting an account id in every avatar URL would only be a second place to get it wrong.
///
/// <paramref name="ThumbnailId"/> names the square currently cut from that original, and is in the
/// avatar's own route: choosing a new crop makes a new square at a new address, so a cached one
/// can never be served for a crop that was replaced.
///
/// <paramref name="Crop"/> is what "Edit photo" reopens the cropper on. Null only for a photo
/// stored without one, whose square is the centred one.
/// </summary>
public sealed record ProfileImageRef(
    Guid AssetId,
    Guid ThumbnailId,
    int Width,
    int Height,
    string ContentType,
    string? FileName,
    long ByteSize,
    DateTime UploadedAt,
    ImageCrop? Crop)
{
    public static ProfileImageRef Of(ProfileImage image) => new(
        image.AssetId,
        image.ThumbnailId,
        image.Width,
        image.Height,
        image.ContentType,
        image.FileName,
        image.ByteSize,
        image.UploadedAt,
        CropOf(image));

    internal static ImageCrop? CropOf(ProfileImage image) =>
        image is { CropX: { } x, CropY: { } y, CropWidth: { } width, CropHeight: { } height }
            ? new ImageCrop(x, y, width, height)
            : null;
}

/// <summary>
/// A new square for the photo the account already has.
///
/// <paramref name="AssetId"/> is the picture whoever chose it was looking at. If the photo has
/// been replaced since, the fractions describe a different picture and the request is refused
/// rather than applied to it.
/// </summary>
public sealed record ProfileThumbnailRequest(Guid AssetId, ImageCrop? Crop);
