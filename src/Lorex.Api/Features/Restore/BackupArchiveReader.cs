using System.Buffers.Binary;
using System.IO.Compression;
using System.Text.Json;
using Lorex.Api.Features.Export;

namespace Lorex.Api.Features.Restore;

/// <summary>
/// Which backup format versions this build restores. See ADR 0032.
///
/// Every version Lorex has ever written, 1 to 18: each one's shape is a subset of the next, each
/// member that was added reads as null in a file from before it, and ADR 0014 records what every
/// change re-meant, so each older file normalizes into the current shape without a guess.
///
/// <see cref="MaxVersion"/> is its own number rather than <see cref="UniverseBackup.CurrentVersion"/>
/// on purpose. The export moving to version 13 does not teach the importer what 13 means, so a
/// test holds the two equal and a bump fails it until someone has taught the importer.
/// </summary>
public static class BackupFormatSupport
{
    public const int MinVersion = 1;

    public const int MaxVersion = 35;

    /// <summary>Versions 1 and 2 were a single JSON file; from 3 a backup is a ZIP holding it (ADR 0014).</summary>
    public const int FirstArchiveVersion = 3;
}

/// <summary>
/// One uploaded backup, opened and parsed: the document, and a way to read each picture beside it.
/// Nothing has been decided about whether its content can be restored - that is
/// <see cref="BackupValidation"/>'s - only that it is a readable Lorex backup of a version this
/// build knows.
///
/// Pictures are read one at a time and only on request, each against its own bound, so holding
/// one of these costs the document and nothing more.
/// </summary>
internal sealed class OpenedBackup(
    UniverseBackup backup,
    ZipArchive? archive,
    IReadOnlyDictionary<string, ZipArchiveEntry> media) : IDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);

    private long _mediaBytesRead;

    public UniverseBackup Backup { get; } = backup;

    /// <summary>Every file in the archive other than the document and directory entries, by exact path.</summary>
    public IReadOnlyCollection<string> MediaPaths => (IReadOnlyCollection<string>)media.Keys;

    /// <summary>The size the archive declares for a file, or null when it holds no such file.</summary>
    public long? MediaLength(string path) => media.TryGetValue(path, out var entry) ? entry.Length : null;

    /// <summary>
    /// The bytes of one picture, exactly as stored. Bounded by the archive's own declared size and
    /// by <see cref="BackupRestoreLimits.MaxMediaBytes"/>, whichever is smaller - so an entry that
    /// inflates beyond what it claims is refused rather than followed.
    ///
    /// <see cref="ZipArchive"/> is not safe for concurrent reads, so reads queue here; decoding and
    /// storing what was read is the caller's and may overlap.
    /// </summary>
    public async Task<byte[]> ReadMediaAsync(string path, CancellationToken cancellationToken)
    {
        if (archive is null || !media.TryGetValue(path, out var entry))
        {
            throw BackupRejectedException.One(
                BackupRejection.Damaged,
                BackupIssueCodes.MissingMedia,
                "A picture the backup names is not in the archive.");
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            var bytes = await BackupArchiveReader.ReadEntryAsync(entry, BackupRestoreLimits.MaxMediaBytes, cancellationToken);

            if (Interlocked.Add(ref _mediaBytesRead, bytes.Length) > BackupRestoreLimits.MaxUncompressedBytes)
            {
                throw BackupArchiveReader.TooLarge();
            }

            return bytes;
        }
        finally
        {
            _gate.Release();
        }
    }

    public void Dispose()
    {
        archive?.Dispose();
        _gate.Dispose();
    }
}

/// <summary>
/// Opens an uploaded file as a Lorex backup, treating every byte of it as hostile.
///
/// <para><b>Nothing is extracted.</b> No entry is ever written to a filesystem, so no entry's name is
/// ever used to build a path, and a name that climbs out of the archive has nowhere to climb to.
/// Names are still checked - a backup Lorex wrote has a precise layout, and an archive carrying
/// <c>../</c>, an absolute path or a symbolic link was not written by Lorex - but the defence is
/// that bytes are only ever read into memory, each against a bound.</para>
///
/// <para><b>Sizes are checked against what is read, not what is declared.</b> The table of contents
/// is counted from its end record before the platform reads it, each entry's declared size must
/// be within its bound before a byte is inflated, and every read stops one byte past the declared
/// size - so a decompression bomb, a lying header and a truncated entry all fail the same way,
/// early and with nothing allocated beyond the limit.</para>
///
/// <para><b>The version is read before the shape.</b> The envelope's <c>format</c> and
/// <c>formatVersion</c> are read with a forward-only reader first, so a file from a newer Lorex is
/// told it is newer rather than that it is damaged - its payload may not parse as this build's
/// records at all.</para>
///
/// <para>The platform's ZIP support is enough: stored and deflated entries, ZIP64, no encryption.
/// Anything else it cannot open is a damaged backup, which is what it would be to any Lorex.</para>
/// </summary>
internal static class BackupArchiveReader
{
    private static readonly byte[] ZipLocalHeader = [0x50, 0x4b, 0x03, 0x04];

    private static readonly byte[] ZipEmptyArchive = [0x50, 0x4b, 0x05, 0x06];

    /// <summary>The export's own options, with a depth bound and no room for a doubled property.</summary>
    private static readonly JsonSerializerOptions ReadOptions = new(UniverseBackupJson.Options)
    {
        MaxDepth = BackupRestoreLimits.MaxJsonDepth,
        AllowDuplicateProperties = false,
    };

    public static async Task<OpenedBackup> OpenAsync(Stream file, CancellationToken cancellationToken)
    {
        if (file.Length > BackupRestoreLimits.MaxUploadBytes)
        {
            throw TooLarge();
        }

        var head = new byte[4];
        file.Position = 0;
        var headLength = await file.ReadAtLeastAsync(head, head.Length, throwOnEndOfStream: false, cancellationToken);
        file.Position = 0;

        if (headLength == 4 && (head.AsSpan().SequenceEqual(ZipLocalHeader) || head.AsSpan().SequenceEqual(ZipEmptyArchive)))
        {
            return await OpenArchiveAsync(file, cancellationToken);
        }

        if (headLength > 0 && LooksLikeJson(head.AsSpan(0, headLength)))
        {
            return await OpenDocumentAsync(file, cancellationToken);
        }

        throw NotABackup();
    }

    // ---------- Archive ----------

    private static async Task<OpenedBackup> OpenArchiveAsync(Stream file, CancellationToken cancellationToken)
    {
        CheckTableOfContents(file);

        ZipArchive archive;
        try
        {
            archive = new ZipArchive(file, ZipArchiveMode.Read, leaveOpen: true);
        }
        catch (InvalidDataException)
        {
            throw Damaged("The archive could not be opened. It may be incomplete or damaged.");
        }

        try
        {
            var (document, media) = Inventory(archive);

            if (document is null)
            {
                throw Damaged("The archive holds no backup.json, so it is not a complete Lorex backup.");
            }

            var bytes = await ReadEntryAsync(document, BackupRestoreLimits.MaxDocumentBytes, cancellationToken);
            var backup = Parse(bytes, isArchive: true);

            return new OpenedBackup(backup, archive, media);
        }
        catch
        {
            archive.Dispose();
            throw;
        }
    }

    /// <summary>
    /// Reads the ZIP's end record - never more than the last 65,557 bytes - and refuses an archive
    /// whose table of contents is too long before the platform allocates an entry for each line of it.
    /// </summary>
    private static void CheckTableOfContents(Stream file)
    {
        const int EndRecordSize = 22;
        const int Zip64LocatorSize = 20;
        const int Zip64RecordSize = 56;

        var length = file.Length;
        if (length < EndRecordSize)
        {
            throw Damaged("The archive is incomplete.");
        }

        var tailLength = (int)Math.Min(length, EndRecordSize + ushort.MaxValue);
        var tail = new byte[tailLength];
        file.Position = length - tailLength;
        file.ReadExactly(tail);

        var at = -1;
        for (var index = tailLength - EndRecordSize; index >= 0; index--)
        {
            if (tail[index] == 0x50 && tail[index + 1] == 0x4b && tail[index + 2] == 0x05 && tail[index + 3] == 0x06)
            {
                at = index;
                break;
            }
        }

        if (at < 0)
        {
            throw Damaged("The archive is incomplete: its table of contents is missing.");
        }

        ulong entries = BinaryPrimitives.ReadUInt16LittleEndian(tail.AsSpan(at + 10));
        ulong directoryBytes = BinaryPrimitives.ReadUInt32LittleEndian(tail.AsSpan(at + 12));

        if (entries == ushort.MaxValue || directoryBytes == uint.MaxValue)
        {
            // ZIP64: the real numbers are in a second record the locator just before this one points at.
            var locatorAt = length - tailLength + at - Zip64LocatorSize;
            if (locatorAt < 0)
            {
                throw Damaged("The archive is incomplete: its table of contents is missing.");
            }

            var locator = new byte[Zip64LocatorSize];
            file.Position = locatorAt;
            file.ReadExactly(locator);

            if (BinaryPrimitives.ReadUInt32LittleEndian(locator) != 0x07064b50)
            {
                throw Damaged("The archive is incomplete: its table of contents is missing.");
            }

            var recordAt = BinaryPrimitives.ReadUInt64LittleEndian(locator.AsSpan(8));
            if (recordAt > (ulong)(length - Zip64RecordSize))
            {
                throw Damaged("The archive is incomplete: its table of contents is missing.");
            }

            var record = new byte[Zip64RecordSize];
            file.Position = (long)recordAt;
            file.ReadExactly(record);

            if (BinaryPrimitives.ReadUInt32LittleEndian(record) != 0x06064b50)
            {
                throw Damaged("The archive is incomplete: its table of contents is missing.");
            }

            entries = BinaryPrimitives.ReadUInt64LittleEndian(record.AsSpan(32));
            directoryBytes = BinaryPrimitives.ReadUInt64LittleEndian(record.AsSpan(40));
        }

        file.Position = 0;

        if (entries > BackupRestoreLimits.MaxArchiveEntries || directoryBytes > BackupRestoreLimits.MaxCentralDirectoryBytes)
        {
            throw BackupRejectedException.One(
                BackupRejection.TooLarge,
                BackupIssueCodes.TooLarge,
                $"The archive holds more files than a Lorex backup can - at most {BackupRestoreLimits.MaxArchiveEntries - 1:N0} pictures and its backup.json.");
        }
    }

    /// <summary>
    /// Every entry's name, kind and declared size, checked before anything is read. Returns the
    /// document and the other files; directory entries - which some tools add when re-zipping -
    /// are allowed and ignored.
    /// </summary>
    private static (ZipArchiveEntry? Document, Dictionary<string, ZipArchiveEntry> Media) Inventory(ZipArchive archive)
    {
        System.Collections.ObjectModel.ReadOnlyCollection<ZipArchiveEntry> entries;
        try
        {
            entries = archive.Entries;
        }
        catch (InvalidDataException)
        {
            throw Damaged("The archive's table of contents could not be read. It may be incomplete or damaged.");
        }

        if (entries.Count > BackupRestoreLimits.MaxArchiveEntries)
        {
            throw BackupRejectedException.One(
                BackupRejection.TooLarge,
                BackupIssueCodes.TooLarge,
                $"The archive holds more files than a Lorex backup can - at most {BackupRestoreLimits.MaxArchiveEntries - 1:N0} pictures and its backup.json.");
        }

        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var media = new Dictionary<string, ZipArchiveEntry>(StringComparer.Ordinal);
        ZipArchiveEntry? document = null;
        long declared = 0;

        foreach (var entry in entries)
        {
            var name = entry.FullName;

            if (!IsSafeName(name) || IsLink(entry))
            {
                throw BackupRejectedException.One(
                    BackupRejection.Unsafe,
                    BackupIssueCodes.UnsafeEntry,
                    "The archive holds a file with a path Lorex will not read, such as one that is absolute, climbs out of the archive or is a link. Lorex never writes one.");
            }

            if (!names.Add(name))
            {
                throw BackupRejectedException.One(
                    BackupRejection.Unsafe,
                    BackupIssueCodes.UnsafeEntry,
                    "The archive lists the same file twice, so which copy is the real one cannot be told.");
            }

            if (name.EndsWith('/'))
            {
                if (entry.Length != 0)
                {
                    throw BackupRejectedException.One(
                        BackupRejection.Unsafe,
                        BackupIssueCodes.UnsafeEntry,
                        "The archive holds a folder entry with content in it.");
                }

                continue;
            }

            if (entry.IsEncrypted)
            {
                throw Damaged("The archive is encrypted. Lorex backups never are.");
            }

            var bound = name == BackupArchive.DocumentPath
                ? BackupRestoreLimits.MaxDocumentBytes
                : BackupRestoreLimits.MaxMediaBytes;

            if (entry.Length < 0 || entry.Length > bound)
            {
                throw TooLarge();
            }

            declared += entry.Length;
            if (declared > BackupRestoreLimits.MaxUncompressedBytes)
            {
                throw TooLarge();
            }

            if (name == BackupArchive.DocumentPath)
            {
                document = entry;
            }
            else
            {
                media[name] = entry;
            }
        }

        return (document, media);
    }

    /// <summary>
    /// A relative path of plain segments: no drive, no root, no backslash, no control character,
    /// no empty, <c>.</c> or <c>..</c> segment, and a folder entry only by its trailing slash.
    /// </summary>
    internal static bool IsSafeName(string name)
    {
        if (name.Length == 0 || name.Length > BackupRestoreLimits.MaxEntryNameLength)
        {
            return false;
        }

        foreach (var character in name)
        {
            if (char.IsControl(character) || character is '\\' or ':')
            {
                return false;
            }
        }

        var path = name.EndsWith('/') ? name[..^1] : name;

        if (path.Length == 0)
        {
            return false;
        }

        foreach (var segment in path.Split('/'))
        {
            if (segment.Length == 0 || segment is "." or "..")
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>A Unix symbolic link, as a ZIP made on Linux or macOS marks one in its external attributes.</summary>
    private static bool IsLink(ZipArchiveEntry entry) => ((entry.ExternalAttributes >> 16) & 0xF000) == 0xA000;

    /// <summary>
    /// One entry's bytes, read into memory and never onto disk. The entry must yield exactly the
    /// size it declares: fewer is a truncated file, and more - checked by asking for one byte past
    /// the end - is an entry that inflates beyond its header, which is refused before it is followed.
    /// </summary>
    internal static async Task<byte[]> ReadEntryAsync(ZipArchiveEntry entry, long bound, CancellationToken cancellationToken)
    {
        if (entry.Length > bound)
        {
            throw TooLarge();
        }

        var bytes = new byte[entry.Length];

        try
        {
            await using var stream = entry.Open();
            await stream.ReadExactlyAsync(bytes, cancellationToken);

            var probe = new byte[1];
            if (await stream.ReadAsync(probe, cancellationToken) != 0)
            {
                throw Damaged("A file in the archive is larger than the archive says it is.");
            }
        }
        catch (EndOfStreamException)
        {
            throw Damaged("A file in the archive is shorter than the archive says it is. The backup may be incomplete.");
        }
        catch (InvalidDataException)
        {
            throw Damaged("A file in the archive could not be read. The backup may be damaged.");
        }

        return bytes;
    }

    // ---------- A single document (versions 1 and 2) ----------

    private static async Task<OpenedBackup> OpenDocumentAsync(Stream file, CancellationToken cancellationToken)
    {
        if (file.Length > BackupRestoreLimits.MaxDocumentBytes)
        {
            throw TooLarge();
        }

        var bytes = new byte[file.Length];
        file.Position = 0;
        await file.ReadExactlyAsync(bytes, cancellationToken);

        return new OpenedBackup(Parse(bytes, isArchive: false), archive: null, new Dictionary<string, ZipArchiveEntry>());
    }

    // ---------- The document ----------

    /// <summary>The envelope first, then - only for a version this build reads - the whole payload.</summary>
    private static UniverseBackup Parse(byte[] bytes, bool isArchive)
    {
        var json = SkipByteOrderMark(bytes);
        var (format, version) = ReadEnvelope(json);

        if (!string.Equals(format, UniverseBackup.FormatName, StringComparison.Ordinal))
        {
            throw NotABackup();
        }

        if (version is not { } formatVersion)
        {
            throw Damaged("The backup does not say which format version it is.");
        }

        if (formatVersion > BackupFormatSupport.MaxVersion)
        {
            throw BackupRejectedException.One(
                BackupRejection.UnsupportedVersion,
                BackupIssueCodes.UnsupportedVersion,
                $"This backup was made by a newer Lorex (format version {formatVersion}). This Lorex restores backups up to format version {BackupFormatSupport.MaxVersion}. Update Lorex, then try again.");
        }

        if (formatVersion < BackupFormatSupport.MinVersion)
        {
            throw BackupRejectedException.One(
                BackupRejection.UnsupportedVersion,
                BackupIssueCodes.UnsupportedVersion,
                $"Format version {formatVersion} is not a version Lorex has ever written, so this backup cannot be restored.");
        }

        if (isArchive && formatVersion < BackupFormatSupport.FirstArchiveVersion)
        {
            throw Damaged($"A format version {formatVersion} backup is a single .json file, but this one is inside an archive. It was not written by Lorex.");
        }

        if (!isArchive && formatVersion >= BackupFormatSupport.FirstArchiveVersion)
        {
            throw BackupRejectedException.One(
                BackupRejection.NotABackup,
                BackupIssueCodes.NotABackup,
                "This is the backup.json from inside a Lorex backup. Choose the .zip file Lorex downloaded instead - it also holds the pictures.");
        }

        UniverseBackup? backup;
        try
        {
            backup = JsonSerializer.Deserialize<UniverseBackup>(json, ReadOptions);
        }
        catch (JsonException exception)
        {
            throw Damaged(exception.Path is { Length: > 0 } path
                ? $"backup.json could not be read: something at {path} is not what a Lorex backup holds there."
                : "backup.json could not be read. It may be damaged.");
        }

        if (backup?.Payload is null)
        {
            throw Damaged("backup.json holds no universe.");
        }

        return backup;
    }

    /// <summary>
    /// The two envelope members, read forward-only without building anything. Reading to the end
    /// also proves the whole document is well-formed JSON within the depth bound.
    /// </summary>
    private static (string? Format, int? Version) ReadEnvelope(ReadOnlySpan<byte> json)
    {
        string? format = null;
        int? version = null;

        try
        {
            var reader = new Utf8JsonReader(json, new JsonReaderOptions { MaxDepth = BackupRestoreLimits.MaxJsonDepth });

            if (!reader.Read() || reader.TokenType != JsonTokenType.StartObject)
            {
                throw NotABackup();
            }

            while (reader.Read() && reader.TokenType == JsonTokenType.PropertyName)
            {
                var name = reader.GetString();
                reader.Read();

                if (string.Equals(name, "format", StringComparison.OrdinalIgnoreCase) && reader.TokenType == JsonTokenType.String)
                {
                    format = reader.GetString();
                }
                else if (string.Equals(name, "formatVersion", StringComparison.OrdinalIgnoreCase)
                    && reader.TokenType == JsonTokenType.Number
                    && reader.TryGetInt32(out var number))
                {
                    version = number;
                }
                else
                {
                    reader.Skip();
                }
            }

            if (reader.TokenType != JsonTokenType.EndObject || reader.Read())
            {
                throw new JsonException();
            }
        }
        catch (JsonException)
        {
            if (string.Equals(format, UniverseBackup.FormatName, StringComparison.Ordinal))
            {
                throw Damaged("backup.json is not complete, well-formed JSON. The backup may be damaged.");
            }

            throw NotABackup();
        }

        return (format, version);
    }

    private static ReadOnlySpan<byte> SkipByteOrderMark(byte[] bytes) =>
        bytes.AsSpan().StartsWith((ReadOnlySpan<byte>)[0xEF, 0xBB, 0xBF]) ? bytes.AsSpan(3) : bytes;

    private static bool LooksLikeJson(ReadOnlySpan<byte> head)
    {
        var start = head.StartsWith((ReadOnlySpan<byte>)[0xEF, 0xBB, 0xBF]) ? 3 : 0;

        for (var index = start; index < head.Length; index++)
        {
            var value = head[index];
            if (value is (byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n')
            {
                continue;
            }

            return value == (byte)'{';
        }

        // Only whitespace in the first bytes: not enough to say, so let the envelope reader decide.
        return head.Length > start;
    }

    private static BackupRejectedException NotABackup() =>
        BackupRejectedException.One(
            BackupRejection.NotABackup,
            BackupIssueCodes.NotABackup,
            "This file is not a Lorex backup. Choose the .zip file Lorex downloaded from a universe's Settings.");

    internal static BackupRejectedException Damaged(string message) =>
        BackupRejectedException.One(BackupRejection.Damaged, BackupIssueCodes.Damaged, message);

    internal static BackupRejectedException TooLarge() =>
        BackupRejectedException.One(
            BackupRejection.TooLarge,
            BackupIssueCodes.TooLarge,
            $"This backup is larger than Lorex restores: at most {BackupRestoreLimits.MaxUploadBytes / (1024 * 1024)} MB as a file, "
                + $"{BackupRestoreLimits.MaxDocumentBytes / (1024 * 1024)} MB of backup.json and {BackupRestoreLimits.MaxMediaBytes / (1024 * 1024)} MB per picture.");
}
