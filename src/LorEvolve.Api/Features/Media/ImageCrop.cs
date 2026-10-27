namespace LorEvolve.Api.Features.Media;

/// <summary>
/// The square a thumbnail is cut from, as fractions of the picture rather than pixels of any
/// screen: <paramref name="X"/> and <paramref name="Width"/> of its width, <paramref name="Y"/> and
/// <paramref name="Height"/> of its height, from the top-left corner.
///
/// Fractions are what make the crop the picture's rather than the browser's. The same four
/// numbers select the same pixels however large the cropper was drawn, and whether the server is
/// rendering the thumbnail now or regenerating it from the stored original years later.
///
/// "The picture" means it as it is displayed: after its EXIF orientation for a JPEG or a PNG, and
/// as stored for a WebP - which is how browsers draw each one, so the square someone frames is
/// the square that gets cut. <see cref="ImagePreparation"/> owns that rule.
/// </summary>
public sealed record ImageCrop(double X, double Y, double Width, double Height);

/// <summary>
/// How long the columns that describe a stored image are allowed to be. Shared, because an
/// entry's picture and a profile photo are described by the same three strings and there is no
/// reason for two tables to disagree about their widths.
/// </summary>
public static class StoredImageLimits
{
    /// <summary>Comfortably longer than either key convention can ever produce.</summary>
    public const int ObjectKeyMaxLength = 400;

    public const int ContentTypeMaxLength = 100;

    public const int FileNameMaxLength = 255;
}
