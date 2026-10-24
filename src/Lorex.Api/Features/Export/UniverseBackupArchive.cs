using System.IO.Compression;
using System.Text.Json;

namespace Lorex.Api.Features.Export;

/// <summary>
/// Where things sit inside a backup archive, and how a media path is built.
///
/// One place, shared by the writer and by the payload, so the path recorded in
/// <see cref="BackupEntityImage.MediaPath"/> and the path the bytes are written to cannot drift
/// apart.
///
/// Paths are ids and a fixed leaf. No entry name, no world name, no author - the same rule the
/// object keys follow (ADR 0019), for the same reasons and one more: a name is mutable, and a
/// path built from one would change every time an author renamed a character, so two backups of
/// unchanged lore would stop being comparable.
/// </summary>
public static class BackupArchive
{
    /// <summary>The document. Always the first entry, so a reader finds it without scanning.</summary>
    public const string DocumentPath = "backup.json";

    /// <summary>
    /// Every archive entry carries this instead of the moment it was written.
    ///
    /// A timestamp is metadata about the export, not about the world, and letting the clock into
    /// the file would make two archives of identical lore differ for a reason nobody cares
    /// about. It is the earliest moment the ZIP format can represent, which reads unmistakably
    /// as "not a real date" rather than as a date somebody might trust.
    /// </summary>
    public static readonly DateTimeOffset Timestamp = new(1980, 1, 1, 0, 0, 0, TimeSpan.Zero);

    /// <summary>The original image of one entry, inside the archive.</summary>
    public static string MediaPathFor(Guid entityId, string contentType) =>
        $"media/entities/{entityId:D}/original.{ExtensionFor(contentType)}";

    /// <summary>The original of one picture of one entry's appearance, inside the archive (since version 30).</summary>
    public static string AppearanceMediaPathFor(Guid entityId, Guid imageId, string contentType) =>
        $"media/entities/{entityId:D}/appearances/{imageId:D}/original.{ExtensionFor(contentType)}";

    /// <summary>The original of the universe's artwork, inside the archive (since version 15). One per archive.</summary>
    public static string ArtworkPathFor(string contentType) =>
        $"media/universe/artwork/original.{ExtensionFor(contentType)}";

    /// <summary>
    /// The file extension for a stored content type. Derived from the type that was decided by
    /// decoding the bytes, never from the object key and never from what the author called the
    /// file, so the name in the archive says what the file actually is.
    /// </summary>
    public static string ExtensionFor(string contentType) => contentType switch
    {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",

        // Unreachable while the upload gate accepts exactly three formats. Kept honest rather
        // than throwing: a backup must not fail because of a leaf name.
        _ => "bin",
    };
}

/// <summary>
/// One image to be written into the archive. The object key is here and only here - it is how
/// this installation reaches the bytes, and it never reaches the file. <paramref name="EntityId"/> is
/// the entry the picture belongs to, or null for the universe's own artwork.
/// </summary>
public sealed record BackupMediaObject(
    Guid? EntityId,
    string ArchivePath,
    string ObjectKey,
    string ContentType);

/// <summary>
/// Everything one export needs: the document, and the media it refers to.
/// </summary>
public sealed record UniverseBackupSnapshot(
    UniverseBackupPayload Payload,
    IReadOnlyList<BackupMediaObject> Media);

/// <summary>
/// Raised when a backup names an image the object store cannot produce.
///
/// It exists so the failure is loud. A backup is a promise about completeness, and an archive
/// that quietly left out a picture would break that promise at exactly the moment the promise
/// mattered - when the file is all that is left.
/// </summary>
public sealed class BackupMediaMissingException(Guid? entityId)
    : InvalidOperationException(entityId is { } id
        ? $"The image stored for entry {id:D} could not be read."
        : "The universe's artwork could not be read.")
{
    /// <summary>The entry whose picture is missing, or null when it is the universe's artwork.</summary>
    public Guid? EntityId { get; } = entityId;
}

/// <summary>
/// Writes one backup archive.
///
/// <b>Built whole in memory, then handed over.</b> Streaming a ZIP straight to the response
/// would start with a 200 and could only report a missing image by truncating the download - a
/// broken archive that already claimed to have succeeded. Buffering means a failure is a status
/// code and an explanation, before a single byte of file has been sent. Uploads are capped at
/// 8 MB apiece (ADR 0019), so what is held is bounded by the size of a world.
///
/// <b>Deterministic apart from the envelope.</b> Entries are written in a fixed order -
/// <c>backup.json</c>, then the media sorted by archive path with an ordinal comparer - and every
/// entry carries <see cref="BackupArchive.Timestamp"/> rather than the clock. Two exports of
/// unchanged lore therefore differ only where <c>generatedAt</c> lands inside the document,
/// which is the one volatile member ADR 0014 already allows.
/// </summary>
public static class UniverseBackupArchiveWriter
{
    public static async Task<byte[]> WriteAsync(
        UniverseBackup backup,
        IReadOnlyList<BackupMediaObject> media,
        Func<string, CancellationToken, Task<Stream?>> readObject,
        CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();

        // Left open so the archive is flushed and its central directory written before the
        // buffer is read - disposing the archive is what finishes the file.
        using (var archive = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            var document = archive.CreateEntry(BackupArchive.DocumentPath, CompressionLevel.Optimal);
            document.LastWriteTime = BackupArchive.Timestamp;

            await using (var writing = document.Open())
            {
                await JsonSerializer.SerializeAsync(writing, backup, UniverseBackupJson.Options, cancellationToken);
            }

            foreach (var item in media.OrderBy(one => one.ArchivePath, StringComparer.Ordinal))
            {
                var bytes = await readObject(item.ObjectKey, cancellationToken)
                    ?? throw new BackupMediaMissingException(item.EntityId);

                await using (bytes)
                {
                    // Stored rather than deflated. A JPEG, PNG or WebP is already compressed, so
                    // deflating it costs time and saves nothing - and storing it is what makes
                    // "the original bytes, exactly" the plainest possible thing to verify.
                    var entry = archive.CreateEntry(item.ArchivePath, CompressionLevel.NoCompression);
                    entry.LastWriteTime = BackupArchive.Timestamp;

                    await using var writing = entry.Open();
                    await bytes.CopyToAsync(writing, cancellationToken);
                }
            }
        }

        return buffer.ToArray();
    }
}
