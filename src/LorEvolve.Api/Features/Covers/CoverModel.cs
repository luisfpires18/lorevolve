using LorEvolve.Api.Features.Media;

namespace LorEvolve.Api.Features.Covers;

/// <summary>
/// A cover: the original as uploaded and the card cut from it, exactly as a universe's artwork is stored
/// (<see cref="Publishing.UniverseArtwork"/>): a new asset id per upload and a new card id per cut, so a served
/// address always names the same bytes. <see cref="SubjectId"/> is the story or project it covers and the key, so
/// "one cover" is a constraint and the row goes with its subject. <see cref="UniverseId"/> names the bucket prefix.
/// </summary>
public abstract class CoverImage
{
    public Guid SubjectId { get; set; }

    public Guid UniverseId { get; set; }

    public Guid AssetId { get; set; }

    public required string OriginalKey { get; set; }

    public Guid CardId { get; set; }

    public required string CardKey { get; set; }

    public double CropX { get; set; }

    public double CropY { get; set; }

    public double CropWidth { get; set; }

    public double CropHeight { get; set; }

    public required string ContentType { get; set; }

    public string? FileName { get; set; }

    public int Width { get; set; }

    public int Height { get; set; }

    public long ByteSize { get; set; }

    public DateTime UploadedAt { get; set; }
}

/// <summary>A story's cover, cut to a 2:3 book cover (<see cref="CoverFrames.Story"/>).</summary>
public sealed class StoryCover : CoverImage;

/// <summary>A project's cover, cut to a 16:10 screen (<see cref="CoverFrames.Project"/>).</summary>
public sealed class ProjectCover : CoverImage;

public static class CoverFrames
{
    internal static readonly ImageFrame Story = ImageFrame.BookCover;

    internal static readonly ImageFrame Project = ImageFrame.Card;
}

/// <summary>
/// Where a cover lives, under its universe's prefix beside the rest of the world's pictures:
///
///   universes/{universeId}/{stories|projects}/{subjectId}/cover/{assetId}/original.{ext}
///   universes/{universeId}/{stories|projects}/{subjectId}/cover/{assetId}/card-{cardId}.webp
/// </summary>
public static class CoverKeys
{
    public const string Stories = "stories";

    public const string Projects = "projects";

    public static string Original(string kind, Guid universeId, Guid subjectId, Guid assetId, string extension) =>
        $"universes/{universeId:D}/{kind}/{subjectId:D}/cover/{assetId:D}/original.{extension}";

    public static string Card(string kind, Guid universeId, Guid subjectId, Guid assetId, Guid cardId) =>
        $"universes/{universeId:D}/{kind}/{subjectId:D}/cover/{assetId:D}/card-{cardId:D}.webp";
}
