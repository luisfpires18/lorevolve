using System.IO.Compression;
using System.Net;
using System.Text;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Restore;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// An uploaded archive is hostile until read (ADR 0032). Paths that climb out, absolute paths, links, doubled entries,
/// decompression bombs, oversized pictures and tables of contents that claim thousands of files are each refused before
/// they cost anything - and nothing is ever written anywhere under a name the archive chose.
/// </summary>
public sealed class BackupArchiveSafetyTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Theory]
    [InlineData("../escape.txt")]
    [InlineData("media/../../escape.txt")]
    [InlineData("/etc/escape.txt")]
    [InlineData("C:/escape.txt")]
    [InlineData("media\\entities\\escape.txt")]
    [InlineData("media/./escape.txt")]
    [InlineData("media//escape.txt")]
    [InlineData("media/esc\u0001ape.txt")]
    public async Task An_entry_whose_path_could_escape_is_refused_and_nothing_is_written_under_it(string name)
    {
        var client = await SignedIn(_factory, $"unsafe-{Guid.NewGuid():N}");
        var file = RawZip((BackupArchive.DocumentPath, Encoding.UTF8.GetBytes("{}"), null), (name, Encoding.UTF8.GetBytes("escaped"), null));

        var refusal = await Refused(await Validate(client, file));

        Assert.Equal(BackupIssueCodes.Unsafe, refusal.Code);
        Assert.Equal([BackupIssueCodes.UnsafeEntry], refusal.IssueCodes);
        Assert.False(File.Exists(Path.Combine(Path.GetTempPath(), "escape.txt")));
        Assert.False(File.Exists(Path.Combine(AppContext.BaseDirectory, "escape.txt")));
        AssertNoStrayUploads();
    }

    [Fact]
    public async Task A_symbolic_link_in_the_archive_is_refused()
    {
        var client = await SignedIn(_factory, "unsafe-link");

        // A Unix link: mode 0120777 in the high half of the external attributes, the target as its content.
        var file = RawZip((BackupArchive.DocumentPath, Encoding.UTF8.GetBytes("{}"), null), ("media/entities/link", Encoding.UTF8.GetBytes("/etc/passwd"), unchecked((int)0xA1FF0000)));

        Assert.Equal(BackupIssueCodes.Unsafe, (await Refused(await Validate(client, file))).Code);
    }

    [Theory]
    [InlineData("backup.json", "backup.json")]
    [InlineData("backup.json", "BACKUP.JSON")]
    public async Task The_same_path_twice_is_refused_because_which_copy_is_real_cannot_be_told(string first, string second)
    {
        var client = await SignedIn(_factory, $"unsafe-twice-{Guid.NewGuid():N}");
        var file = RawZip((first, Encoding.UTF8.GetBytes("{}"), null), (second, Encoding.UTF8.GetBytes("{}"), null));

        Assert.Equal(BackupIssueCodes.Unsafe, (await Refused(await Validate(client, file))).Code);
    }

    [Fact]
    public async Task A_document_that_inflates_past_its_bound_is_refused_before_it_is_read()
    {
        var client = await SignedIn(_factory, "bomb-document");

        // A few hundred kilobytes on the wire, more than the document bound once inflated.
        var file = ZeroFilled(BackupArchive.DocumentPath, BackupRestoreLimits.MaxDocumentBytes + 1);
        Assert.True(file.Length < 1024 * 1024);

        var refusal = await Refused(await Validate(client, file), HttpStatusCode.RequestEntityTooLarge);
        Assert.Equal(BackupIssueCodes.TooLarge, refusal.Code);
        AssertNoStrayUploads();
    }

    [Fact]
    public async Task A_picture_larger_than_LorEvolve_ever_accepted_is_refused()
    {
        var client = await SignedIn(_factory, "bomb-picture");
        var file = ZeroFilled($"media/entities/{Guid.NewGuid():D}/original.png", BackupRestoreLimits.MaxMediaBytes + 1);

        Assert.Equal(BackupIssueCodes.TooLarge, (await Refused(await Validate(client, file), HttpStatusCode.RequestEntityTooLarge)).Code);
    }

    [Fact]
    public async Task An_archive_claiming_more_files_than_a_backup_can_hold_is_refused_from_its_table_of_contents()
    {
        var client = await SignedIn(_factory, "bomb-entries");
        var entries = Enumerable.Range(0, BackupRestoreLimits.MaxArchiveEntries + 1)
            .Select(index => ($"media/entities/{index}.png", Array.Empty<byte>(), (int?)null))
            .ToArray();

        Assert.Equal(BackupIssueCodes.TooLarge, (await Refused(await Validate(client, RawZip(entries)), HttpStatusCode.RequestEntityTooLarge)).Code);
    }

    [Fact]
    public async Task An_upload_declaring_more_bytes_than_the_limit_is_refused_before_it_is_read()
    {
        var client = await SignedIn(_factory, "bomb-length");
        using var content = new DeclaredLengthContent(BackupRestoreLimits.MaxUploadBytes + 1);

        var response = await client.PutAsync(ValidatePath, content);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        AssertNoStrayUploads();
    }

    [Theory]
    [InlineData("backup.json", true)]
    [InlineData("media/entities/3f2c8a9e-0000-4000-8000-000000000000/original.png", true)]
    [InlineData("media/", true)]
    [InlineData("media/entities/", true)]
    [InlineData("", false)]
    [InlineData("/", false)]
    [InlineData("..", false)]
    [InlineData("a/../b", false)]
    [InlineData("./backup.json", false)]
    [InlineData("\\\\server\\share", false)]
    [InlineData("D:backup.json", false)]
    public void Only_plain_relative_paths_are_safe(string name, bool safe) =>
        Assert.Equal(safe, BackupArchiveReader.IsSafeName(name));

    // ---------- Helpers ----------

    private void AssertNoStrayUploads()
    {
        var census = _factory.Services.GetRequiredService<BackupRestoreStaging>().Census();
        Assert.Equal(census.Waiting, census.Files);
    }

    /// <summary>An archive written entry by entry, names exactly as given, optionally with raw external attributes.</summary>
    private static byte[] RawZip(params (string Name, byte[] Bytes, int? Attributes)[] entries)
    {
        using var buffer = new MemoryStream();
        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, bytes, attributes) in entries)
            {
                var entry = zip.CreateEntry(name, CompressionLevel.Fastest);

                if (attributes is { } value)
                {
                    entry.ExternalAttributes = value;
                }

                using var writing = entry.Open();
                writing.Write(bytes);
            }
        }

        return buffer.ToArray();
    }

    /// <summary>One entry of zeros, deflated as it is written so the test never holds the inflated size.</summary>
    private static byte[] ZeroFilled(string name, long length)
    {
        using var buffer = new MemoryStream();
        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            using var writing = zip.CreateEntry(name, CompressionLevel.SmallestSize).Open();
            var chunk = new byte[1024 * 1024];

            for (var left = length; left > 0; left -= chunk.Length)
            {
                writing.Write(chunk, 0, (int)Math.Min(chunk.Length, left));
            }
        }

        return buffer.ToArray();
    }

    /// <summary>A body that claims a length far beyond what it would send.</summary>
    private sealed class DeclaredLengthContent(long length) : HttpContent
    {
        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) =>
            stream.WriteAsync(new byte[16]).AsTask();

        protected override bool TryComputeLength(out long computed)
        {
            computed = length;
            return true;
        }
    }
}
