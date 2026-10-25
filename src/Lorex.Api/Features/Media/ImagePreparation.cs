using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace Lorex.Api.Features.Media;

/// <summary>What passed validation, and everything a write path needs from the bytes.</summary>
/// <param name="Width">Displayed width - after orientation, see <see cref="ImagePreparation"/>.</param>
/// <param name="Height">Displayed height.</param>
/// <param name="Crop">The frame actually cut, as fractions. Always set, even when none was asked for.</param>
/// <param name="Thumbnail">The derivative the frame asked for: the square thumbnail, or a universe's card.</param>
internal sealed record PreparedImage(
    string ContentType,
    string Extension,
    int Width,
    int Height,
    ImageCrop Crop,
    byte[] Thumbnail);

/// <summary>Why an image was not accepted, and which part of the request to blame.</summary>
internal sealed record ImageRejection(string Field, string Message);

/// <summary>A whole picture fitted within a square, as lossy WebP with no metadata: what an MCP client is shown (ADR 0046).</summary>
internal sealed record ImagePreview(byte[] Bytes, int Width, int Height);

/// <summary>
/// An upload that passed the gate whole, with the whole picture fitted within a side as its derivative (a map, issue #52):
/// the original's decoded type, its displayed size, and the fitted WebP with its own size. No crop: nothing is cut.
/// </summary>
internal sealed record PreparedFit(string ContentType, string Extension, int Width, int Height, ImagePreview Display);

/// <summary>A crop, placed on pixels: a rectangle of the frame's shape, inside the image, in whole pixels.</summary>
internal readonly record struct CropRect(int Left, int Top, int Width, int Height);

/// <summary>
/// The shape a derivative is cut to and the widest it is stored at. <see cref="Square"/> is every
/// thumbnail and avatar; <see cref="Card"/> is a universe's artwork on its public card (ADR 0036).
/// <paramref name="Noun"/> and <paramref name="ShapeRule"/> are only the words a refusal uses.
/// </summary>
internal sealed record ImageFrame(int AspectWidth, int AspectHeight, int MaxWidth, string Noun, string ShapeRule)
{
    public static readonly ImageFrame Square = new(1, 1, ImagePreparation.ThumbnailSize, "thumbnail", "square");

    /// <summary>
    /// 16:10, because that is the picture above a card's words in the portal's composition: a card
    /// about as tall as it is wide, its top five eighths picture. 960 wide covers a card drawn up to
    /// 480 CSS pixels on a 2x screen; a hero cut for a universe's own page is a later frame of the
    /// same original.
    /// </summary>
    public static readonly ImageFrame Card = new(16, 10, 960, "card", "16:10");
}

/// <summary>
/// The upload gate: what Lorex will accept as a picture anywhere in the product, and the square
/// thumbnail it makes from it.
///
/// One gate, two callers. An entry's primary image and a person's profile photo are the same
/// problem - accept only a real picture, orient it the way a browser will draw it, cut the square
/// its owner framed - and the differences between them are where the bytes go and who may ask,
/// which is the callers' business and not this file's. Nothing here knows about a universe, an
/// entry or an account.
///
/// Nothing here trusts the request. The filename is a label, the browser's content type is a
/// claim, and both are ignored - the format is whatever the bytes decode as, and an upload
/// whose bytes are not one of the three accepted formats is refused however it was named. The
/// crop is a request too: the browser says which square it wants, and the thumbnail is still
/// cut here, from the original, never accepted ready-made.
///
/// SVG is refused outright, deliberately. It is a document format with scripting and external
/// references in it, not a picture, and making one safe means writing and maintaining a
/// sanitiser - a project of its own with a long history of bypasses. It also has no pixels to
/// resample, so the thumbnail path could not treat it like the others anyway. Refusing it is
/// one line; sanitising it would be a phase.
///
/// The size checks run in the right order to matter. The byte length is checked first, then the
/// header is read for the dimensions, and only an image that passed both is fully decoded - so
/// a small file claiming to be 60,000 pixels square is refused before anything tries to
/// allocate it.
/// </summary>
internal static class ImagePreparation
{
    public const string FileField = "file";

    public const string CropField = "crop";

    /// <summary>Largest upload accepted. One picture on one entry or one account does not need more.</summary>
    public const long MaxUploadBytes = 8L * 1024 * 1024;

    /// <summary>Longest side accepted, before any pixel is decoded.</summary>
    public const int MaxSide = 10_000;

    /// <summary>
    /// Total pixel ceiling, which is the check that actually stops a decompression bomb: a file
    /// of a few kilobytes can describe an image whose decoded form would take gigabytes, and
    /// only the pixel count sees that coming.
    /// </summary>
    public const long MaxPixels = 24_000_000;

    /// <summary>
    /// Square edge of the generated thumbnail. The largest place one is drawn is the profile
    /// avatar, at 7.5rem, and the lore grid draws its portraits at well under half of this - so
    /// there is room for a high-density screen and for either to grow, without storing a second
    /// near-full-size copy of every image.
    /// </summary>
    public const int ThumbnailSize = 320;

    /// <summary>
    /// How far a fraction may overshoot the edge of the image and still count as the edge. It
    /// absorbs floating-point noise in a crop computed by a browser, and nothing larger: a crop
    /// that genuinely runs off the picture is refused.
    /// </summary>
    private const double EdgeTolerance = 1e-6;

    private static readonly Dictionary<string, string> AcceptedFormats = new(StringComparer.Ordinal)
    {
        [JpegFormat.Instance.Name] = "jpg",
        [PngFormat.Instance.Name] = "png",
        [WebpFormat.Instance.Name] = "webp",
    };

    /// <summary>
    /// The only decoders an upload ever reaches: the three accepted formats, and one frame. ImageSharp's default
    /// configuration also carries TIFF, BMP, GIF and more, whose decoders a refused file would otherwise run while it is
    /// still being identified - a BigTIFF can hold a decoder in a loop there (issue #33, M-1). Anything else is simply not
    /// an image Lorex can read.
    /// </summary>
    private static readonly DecoderOptions Decoding = new()
    {
        Configuration = new Configuration(
            new JpegConfigurationModule(), new PngConfigurationModule(), new WebpConfigurationModule()),
        MaxFrames = 1,
    };

    /// <summary>
    /// Deterministic by construction: a fixed sampler, a fixed encoder and a size derived only
    /// from the square being cut, so the same original and the same crop always produce the same
    /// thumbnail bytes - which is what lets an importer regenerate one rather than carry it.
    /// </summary>
    private static readonly PngEncoder PreviewPngEncoder = new() { CompressionLevel = PngCompressionLevel.BestCompression };

    private static readonly WebpEncoder ThumbnailEncoder = new()
    {
        Quality = 80,
        FileFormat = WebpFileFormatType.Lossy,
        SkipMetadata = true,
    };

    /// <summary>
    /// A crop's own shape, checked before a byte of the image is read: four finite fractions
    /// describing a non-empty rectangle that stays inside the picture. Whether it is square can
    /// only be decided against the picture's pixels, and <see cref="Place(ImageCrop?, int, int, ImageFrame)"/> does that.
    /// </summary>
    public static string? CheckCrop(ImageCrop crop) => CheckCrop(crop, ImageFrame.Square);

    public static string? CheckCrop(ImageCrop crop, ImageFrame frame)
    {
        if (!double.IsFinite(crop.X) || !double.IsFinite(crop.Y)
            || !double.IsFinite(crop.Width) || !double.IsFinite(crop.Height))
        {
            return $"The {frame.Noun} selection must be four numbers.";
        }

        if (crop.Width <= 0 || crop.Height <= 0)
        {
            return $"The {frame.Noun} selection must have a size.";
        }

        if (crop.X < -EdgeTolerance || crop.Y < -EdgeTolerance
            || crop.X + crop.Width > 1 + EdgeTolerance
            || crop.Y + crop.Height > 1 + EdgeTolerance)
        {
            return $"The {frame.Noun} selection must lie inside the image.";
        }

        return null;
    }

    /// <summary>
    /// Validates the upload and produces its thumbnail, or says in one sentence why it will not
    /// be stored. The sentence is shown to the author, so it says what to do about it.
    ///
    /// <paramref name="crop"/> is the square the author chose. Without one the thumbnail is the
    /// centred square, and the crop that describes it is returned anyway, so every picture
    /// stored from here on records its framing.
    /// </summary>
    public static Task<(PreparedImage? Image, ImageRejection? Rejection)> PrepareAsync(
        Stream upload,
        long byteLength,
        ImageCrop? crop,
        CancellationToken cancellationToken) =>
        PrepareAsync(upload, byteLength, crop, ImageFrame.Square, cancellationToken);

    /// <summary>The same gate, cutting <paramref name="frame"/>'s shape rather than the square.</summary>
    public static async Task<(PreparedImage? Image, ImageRejection? Rejection)> PrepareAsync(
        Stream upload,
        long byteLength,
        ImageCrop? crop,
        ImageFrame frame,
        CancellationToken cancellationToken)
    {
        if (byteLength <= 0)
        {
            return Refuse(FileField, "That file is empty.");
        }

        if (byteLength > MaxUploadBytes)
        {
            return Refuse(FileField, $"Images must be {MaxUploadBytes / (1024 * 1024)} MB or smaller.");
        }

        if (crop is not null && CheckCrop(crop, frame) is { } badCrop)
        {
            return Refuse(CropField, badCrop);
        }

        ImageInfo info;
        try
        {
            info = await Image.IdentifyAsync(Decoding, upload, cancellationToken);
        }
        catch (Exception exception) when (exception is UnknownImageFormatException or InvalidImageContentException)
        {
            return Refuse(FileField, "That file is not an image Lorex can read. Use a JPEG, PNG or WebP.");
        }

        var format = info.Metadata.DecodedImageFormat;

        if (format is null || !AcceptedFormats.TryGetValue(format.Name, out var extension))
        {
            return Refuse(FileField, "Images must be a JPEG, PNG or WebP.");
        }

        if (info.Width <= 0 || info.Height <= 0)
        {
            return Refuse(FileField, "That image has no size Lorex can use.");
        }

        // Both limits are symmetric, so they hold whichever way round the picture is displayed.
        if (info.Width > MaxSide || info.Height > MaxSide)
        {
            return Refuse(FileField, $"Images must be {MaxSide} pixels or smaller on each side.");
        }

        if ((long)info.Width * info.Height > MaxPixels)
        {
            return Refuse(FileField, $"That image is too large to process - {MaxPixels / 1_000_000} megapixels is the limit.");
        }

        upload.Position = 0;

        Image decoded;
        try
        {
            // One frame. An animated WebP is accepted as a picture, not as an animation, and
            // decoding only the first frame is also what stops a many-thousand-frame file from
            // multiplying the pixel ceiling that was just checked against a single frame.
            decoded = await Image.LoadAsync(Decoding, upload, cancellationToken);
        }
        catch (Exception exception) when (exception is UnknownImageFormatException
            or InvalidImageContentException
            or ImageFormatException)
        {
            // Identify reads a header; this reads the whole file. A truncated or corrupt image
            // gets that far and no further, and it is still the author's file that is wrong.
            return Refuse(FileField, "That image could not be read. It may be incomplete or damaged.");
        }

        using (decoded)
        {
            if (HonoursOrientation(format))
            {
                // Before anything is measured, cropped or stripped: a phone photo carries its
                // rotation in EXIF, the author framed it the right way up, and the fractions they
                // sent are fractions of that upright picture.
                decoded.Mutate(context => context.AutoOrient());
            }

            // Measured now, because rendering the thumbnail cuts this same image down in place.
            var width = decoded.Width;
            var height = decoded.Height;

            var (rect, rejection) = Place(crop, width, height, frame);

            if (rejection is not null)
            {
                return Refuse(CropField, rejection);
            }

            var thumbnail = await RenderAsync(decoded, rect, frame, cancellationToken);

            return (
                new PreparedImage(
                    format.DefaultMimeType,
                    extension,
                    width,
                    height,
                    Describe(rect, width, height),
                    thumbnail),
                null);
        }
    }

    /// <summary>
    /// The gate for a picture shown whole rather than cut - a map (issue #52): the same refusals as
    /// <see cref="PrepareAsync(Stream, long, ImageCrop?, CancellationToken)"/>, in the same order and the same words, and
    /// then the whole picture fitted within <paramref name="displaySide"/> as the derivative that is displayed. The
    /// original is kept as uploaded; <see cref="PreparedFit.Width"/> and <see cref="PreparedFit.Height"/> are its size as a
    /// browser draws it, which is the space a pin's fractions are measured against.
    /// </summary>
    public static async Task<(PreparedFit? Image, ImageRejection? Rejection)> FitAsync(
        Stream upload,
        long byteLength,
        int displaySide,
        CancellationToken cancellationToken)
    {
        if (byteLength <= 0)
        {
            return (null, new ImageRejection(FileField, "That file is empty."));
        }

        if (byteLength > MaxUploadBytes)
        {
            return (null, new ImageRejection(FileField, $"Images must be {MaxUploadBytes / (1024 * 1024)} MB or smaller."));
        }

        ImageInfo info;
        try
        {
            info = await Image.IdentifyAsync(Decoding, upload, cancellationToken);
        }
        catch (Exception exception) when (exception is UnknownImageFormatException or InvalidImageContentException)
        {
            return (null, new ImageRejection(FileField, "That file is not an image Lorex can read. Use a JPEG, PNG or WebP."));
        }

        var format = info.Metadata.DecodedImageFormat;
        if (format is null || !AcceptedFormats.TryGetValue(format.Name, out var extension))
        {
            return (null, new ImageRejection(FileField, "Images must be a JPEG, PNG or WebP."));
        }

        if (info.Width <= 0 || info.Height <= 0)
        {
            return (null, new ImageRejection(FileField, "That image has no size Lorex can use."));
        }

        if (info.Width > MaxSide || info.Height > MaxSide)
        {
            return (null, new ImageRejection(FileField, $"Images must be {MaxSide} pixels or smaller on each side."));
        }

        if ((long)info.Width * info.Height > MaxPixels)
        {
            return (null, new ImageRejection(FileField, $"That image is too large to process - {MaxPixels / 1_000_000} megapixels is the limit."));
        }

        upload.Position = 0;
        var display = await PreviewAsync(upload, displaySide, png: false, cancellationToken);
        if (display is null)
        {
            return (null, new ImageRejection(FileField, "That image could not be read. It may be incomplete or damaged."));
        }

        // The displayed size, from the header alone: the stored size, turned when a browser would turn it (EXIF orientation
        // 5-8 swap the sides), so a pin's fractions are measured against the picture the author sees - no second decode.
        var turned = HonoursOrientation(format) && IsTurned(info);
        return (new PreparedFit(format.DefaultMimeType, extension, turned ? info.Height : info.Width, turned ? info.Width : info.Height, display), null);
    }

    /// <summary>Whether a picture's EXIF orientation swaps its sides when applied (values 5 to 8: the rotations by 90 degrees).</summary>
    private static bool IsTurned(ImageInfo info) =>
        info.Metadata.ExifProfile?.TryGetValue(SixLabors.ImageSharp.Metadata.Profiles.Exif.ExifTag.Orientation, out var orientation) == true
        && orientation?.Value is >= 5 and <= 8;

    /// <summary>
    /// The whole of a stored picture fitted within <paramref name="maxSide"/> pixels on its longer side - never enlarged -
    /// oriented as a browser draws it, stripped of metadata and encoded as lossy WebP - or as PNG when
    /// <paramref name="png"/> asks, for a client that cannot draw WebP: the preview an MCP client is handed (issue #56). Null when the bytes are not a picture Lorex reads, which for an object Lorex itself wrote means it has
    /// been damaged. The same decoders, ceilings and encoder as an upload, so nothing here reads what the gate refuses.
    /// </summary>
    public static async Task<ImagePreview?> PreviewAsync(Stream original, int maxSide, bool png, CancellationToken cancellationToken)
    {
        ImageInfo info;
        try
        {
            info = await Image.IdentifyAsync(Decoding, original, cancellationToken);
        }
        catch (ImageFormatException)
        {
            return null;
        }

        var format = info.Metadata.DecodedImageFormat;
        if (format is null
            || !AcceptedFormats.ContainsKey(format.Name)
            || info.Width <= 0
            || info.Height <= 0
            || info.Width > MaxSide
            || info.Height > MaxSide
            || (long)info.Width * info.Height > MaxPixels)
        {
            return null;
        }

        original.Position = 0;

        Image decoded;
        try
        {
            decoded = await Image.LoadAsync(Decoding, original, cancellationToken);
        }
        catch (ImageFormatException)
        {
            return null;
        }

        using (decoded)
        {
            if (HonoursOrientation(format))
            {
                decoded.Mutate(context => context.AutoOrient());
            }

            if (decoded.Width > maxSide || decoded.Height > maxSide)
            {
                decoded.Mutate(context => context.Resize(new ResizeOptions
                {
                    Size = new Size(maxSide, maxSide),
                    Mode = ResizeMode.Max,
                    Sampler = KnownResamplers.Lanczos3,
                }));
            }

            // A derived picture carries nothing the original said about itself - no camera, no GPS.
            decoded.Metadata.ExifProfile = null;
            decoded.Metadata.IptcProfile = null;
            decoded.Metadata.XmpProfile = null;

            using var buffer = new MemoryStream();
            await decoded.SaveAsync(buffer, png ? PreviewPngEncoder : ThumbnailEncoder, cancellationToken);
            return new ImagePreview(buffer.ToArray(), decoded.Width, decoded.Height);
        }
    }

    /// <summary>A stored picture's pixel size from its header alone, or null when the bytes are not a picture Lorex reads.</summary>
    public static async Task<(int Width, int Height)?> MeasureAsync(Stream picture, CancellationToken cancellationToken)
    {
        try
        {
            var info = await Image.IdentifyAsync(Decoding, picture, cancellationToken);
            return (info.Width, info.Height);
        }
        catch (ImageFormatException)
        {
            return null;
        }
    }

    /// <summary>
    /// Whether a format's EXIF orientation is applied - decided by what browsers draw, because the
    /// author frames the picture the browser shows them and the thumbnail has to be that square.
    ///
    /// Chromium rotates a JPEG and a PNG by their orientation tag and draws a WebP exactly as its
    /// pixels are stored, tag or no tag; that was checked against a browser rather than assumed.
    /// ImageSharp would rotate all three, so a WebP carrying a tag would otherwise come out turned
    /// sideways against what its author framed.
    /// </summary>
    private static bool HonoursOrientation(IImageFormat format) =>
        !string.Equals(format.Name, WebpFormat.Instance.Name, StringComparison.Ordinal);

    /// <summary>
    /// Puts a crop on whole pixels of a picture <paramref name="width"/> by <paramref name="height"/>.
    ///
    /// Each edge is rounded to the nearest pixel on its own, so a crop that was computed from
    /// whole pixels - as the cropper's is, and as a stored one is - lands back on exactly those
    /// pixels. A crop within a pixel, or one percent, of the frame's shape is trimmed to it evenly
    /// on its longer side; anything further off is refused rather than stretched.
    ///
    /// No crop means the largest centred frame - for the square, what every thumbnail was before
    /// an author could choose.
    /// </summary>
    internal static (CropRect Rect, string? Rejection) Place(ImageCrop? crop, int width, int height) =>
        Place(crop, width, height, ImageFrame.Square);

    internal static (CropRect Rect, string? Rejection) Place(ImageCrop? crop, int width, int height, ImageFrame frame)
    {
        if (crop is null)
        {
            var (fitWidth, fitHeight) = Fit(width, height, frame);
            return (new CropRect((width - fitWidth) / 2, (height - fitHeight) / 2, fitWidth, fitHeight), null);
        }

        var left = Math.Clamp(Pixel(crop.X * width), 0, width);
        var top = Math.Clamp(Pixel(crop.Y * height), 0, height);
        var right = Math.Clamp(Pixel((crop.X + crop.Width) * width), 0, width);
        var bottom = Math.Clamp(Pixel((crop.Y + crop.Height) * height), 0, height);

        var across = right - left;
        var down = bottom - top;

        if (across < 1 || down < 1)
        {
            return (default, $"The {frame.Noun} selection is smaller than a pixel.");
        }

        var slack = Math.Max(1, (int)Math.Ceiling(Math.Max(across, down) * 0.01));

        // How far the height is from the one the frame's shape gives this width. For the square
        // that is simply the difference between the two sides.
        if (Math.Abs(down - (double)across * frame.AspectHeight / frame.AspectWidth) > slack)
        {
            return (default, $"The {frame.Noun} selection must be {frame.ShapeRule}.");
        }

        var (cutWidth, cutHeight) = Fit(across, down, frame);

        return (new CropRect(left + (across - cutWidth) / 2, top + (down - cutHeight) / 2, cutWidth, cutHeight), null);
    }

    /// <summary>
    /// The largest rectangle of the frame's shape inside <paramref name="across"/> by
    /// <paramref name="down"/>, in whole pixels. For the square, the shorter side both ways.
    /// Rounding cannot overshoot: the side it computes is at most the one it is measured against.
    /// </summary>
    private static (int Width, int Height) Fit(int across, int down, ImageFrame frame) =>
        (long)across * frame.AspectHeight <= (long)down * frame.AspectWidth
            ? (across, Math.Max(1, Pixel((double)across * frame.AspectHeight / frame.AspectWidth)))
            : (Math.Max(1, Pixel((double)down * frame.AspectWidth / frame.AspectHeight)), down);

    /// <summary>The frame that was cut, back as fractions - the form it is stored and exported in.</summary>
    private static ImageCrop Describe(CropRect rect, int width, int height) =>
        new(
            (double)rect.Left / width,
            (double)rect.Top / height,
            (double)rect.Width / width,
            (double)rect.Height / height);

    private static int Pixel(double value) => (int)Math.Round(value, MidpointRounding.AwayFromZero);

    /// <summary>
    /// The chosen frame, cut from the upright original and scaled to the frame's width.
    ///
    /// Cut first, then scale, and nothing else: the cut is already the frame's shape, so scaling
    /// it cannot stretch it by more than the rounding of one pixel, and nothing outside it can
    /// leak in at the edges.
    ///
    /// It never enlarges. A cut already narrower than the target is kept at its own resolution,
    /// because upscaling would store more bytes to show the same detail blurrier.
    /// </summary>
    private static async Task<byte[]> RenderAsync(
        Image image,
        CropRect rect,
        ImageFrame frame,
        CancellationToken cancellationToken)
    {
        var outWidth = Math.Min(frame.MaxWidth, rect.Width);
        var outHeight = outWidth == rect.Width
            ? rect.Height
            : Math.Max(1, Pixel((double)outWidth * frame.AspectHeight / frame.AspectWidth));

        image.Mutate(context =>
        {
            context.Crop(new Rectangle(rect.Left, rect.Top, rect.Width, rect.Height));

            if (outWidth != rect.Width)
            {
                context.Resize(new ResizeOptions
                {
                    Size = new Size(outWidth, outHeight),
                    Mode = ResizeMode.Stretch,
                    Sampler = KnownResamplers.Lanczos3,
                });
            }
        });

        // The thumbnail is a derived preview, so it carries nothing the original said about
        // itself - no EXIF, no camera, and in particular no GPS coordinates.
        image.Metadata.ExifProfile = null;
        image.Metadata.IptcProfile = null;
        image.Metadata.XmpProfile = null;

        using var buffer = new MemoryStream();
        await image.SaveAsync(buffer, ThumbnailEncoder, cancellationToken);
        return buffer.ToArray();
    }

    private static (PreparedImage? Image, ImageRejection? Rejection) Refuse(string field, string message) =>
        (null, new ImageRejection(field, message));
}
