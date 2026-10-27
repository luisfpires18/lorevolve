using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

using static LorEvolve.Api.Tests.VersionTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// An entry's one primary image: what LorEvolve will store, who may touch it, and what the two
/// stores are allowed to disagree about.
///
/// Seven claims carry this file. An owner - and only an owner - can set, frame, read and remove
/// the image on their own entry. What is stored is an image, proved by decoding it and not by
/// what the request called it. The thumbnail is the square the author chose, cut on the server
/// from the picture as it is displayed, and choosing again never touches the original. The
/// object keys say what they are supposed to say, in ids and nothing else. A replacement or a
/// reframing never destroys the working image before the new one is the entry's image, and never
/// leaves the database naming objects that were deliberately deleted. The Trash keeps an image
/// and a restore brings it back. And nothing about Cloudflare - a bucket, an endpoint, a key, a
/// provider's error - reaches a response.
///
/// No test here touches Cloudflare. The host runs against <see cref="TestMediaObjectStore"/>,
/// which is a real implementation of the same contract, so the ordering being asserted is the
/// ordering R2 would see.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class EntityImageTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Uploading ----------

    [Fact]
    public async Task An_owner_uploads_an_image_and_it_becomes_the_entrys_own()
    {
        var (client, universe, type) = await World("imgup");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(client, universe.Id, entry.Id, Png(900, 600), "portrait.png");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var stored = (await response.Content.ReadFromJsonAsync<EntityImageRef>())!;

        Assert.NotEqual(Guid.Empty, stored.AssetId);
        Assert.Equal(900, stored.Width);
        Assert.Equal(600, stored.Height);
        Assert.Equal("image/png", stored.ContentType);
        Assert.Equal("portrait.png", stored.FileName);
        Assert.True(stored.ByteSize > 0);

        // The entry now carries it, on the page and on the card, without a second request.
        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(stored.AssetId, detail.Image!.AssetId);

        var card = Assert.Single((await Page(client, universe.Id)).Items, item => item.Id == entry.Id);
        Assert.Equal(stored.AssetId, card.Image!.AssetId);
    }

    [Fact]
    public async Task Both_objects_are_stored_and_the_association_is_persisted()
    {
        var (client, universe, type) = await World("imgpair");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var stored = await Uploaded(client, universe.Id, entry.Id, Png(900, 600), "portrait.png");

        var originalKey = Key(universe.Id, entry.Id, stored.AssetId, "original.png");
        var thumbnailKey = ThumbnailKey(universe.Id, entry.Id, stored);

        Assert.True(_factory.Media.Contains(originalKey));
        Assert.True(_factory.Media.Contains(thumbnailKey));

        // The original is the bytes that were uploaded, untouched.
        Assert.Equal("image/png", _factory.Media.ContentType(originalKey));

        // The thumbnail is a square WebP that was never enlarged past the target.
        Assert.Equal("image/webp", _factory.Media.ContentType(thumbnailKey));
        using var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(thumbnailKey));
        Assert.Equal(320, thumbnail.Width);
        Assert.Equal(320, thumbnail.Height);

        // And the row says exactly which objects those are.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        var row = await db.EntityImages.AsNoTracking()
            .SingleAsync(image => image.EntityId == entry.Id);

        Assert.Equal(stored.AssetId, row.AssetId);
        Assert.Equal(originalKey, row.OriginalKey);
        Assert.Equal(thumbnailKey, row.ThumbnailKey);
        Assert.Equal(900, row.Width);
        Assert.Equal(600, row.Height);
    }

    [Fact]
    public async Task Object_keys_carry_ids_and_nothing_an_author_wrote()
    {
        var (client, universe, type) = await World("imgkeys");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance of Tidewatch");

        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "Alenna Vance.png");

        var keys = _factory.Media.Keys
            .Where(key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal))
            .ToList();

        Assert.Equal(2, keys.Count);

        var prefix = $"universes/{universe.Id:D}/entities/{entry.Id:D}/primary/{stored.AssetId:D}";
        Assert.Contains($"{prefix}/original.png", keys);
        Assert.Contains($"{prefix}/thumbnail-{stored.ThumbnailId:D}.webp", keys);

        // Not the world's name, not the entry's, not the author's, and not the filename.
        foreach (var key in keys)
        {
            Assert.DoesNotContain("Alenna", key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Tidewatch", key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("imgkeys", key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("example.test", key, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task A_tiny_image_is_cropped_square_and_never_enlarged()
    {
        var (client, universe, type) = await World("imgtiny");
        var entry = await Entry(client, universe.Id, type, "Sigil");

        var stored = await Uploaded(client, universe.Id, entry.Id, Png(120, 80), "sigil.png");

        using var thumbnail = Image.Load<Rgba32>(
            _factory.Media.Bytes(ThumbnailKey(universe.Id, entry.Id, stored)));

        // The shorter side, not the 320 target: storing more bytes to show the same detail
        // blurrier is not an improvement.
        Assert.Equal(80, thumbnail.Width);
        Assert.Equal(80, thumbnail.Height);
    }

    // ---------- What is refused ----------

    [Theory]
    [InlineData("notes.txt", "text/plain")]
    [InlineData("portrait.png", "image/png")]
    public async Task A_file_that_is_not_an_image_is_refused_however_it_is_named(
        string fileName,
        string contentType)
    {
        var (client, universe, type) = await World($"imgnot{fileName.Length}");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(
            client,
            universe.Id,
            entry.Id,
            Encoding.UTF8.GetBytes("This is not a picture, whatever the request called it."),
            fileName,
            contentType);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
        Assert.DoesNotContain(
            _factory.Media.Keys,
            key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal));
    }

    [Fact]
    public async Task An_svg_is_refused()
    {
        var (client, universe, type) = await World("imgsvg");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var svg = Encoding.UTF8.GetBytes(
            """<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>""");

        var response = await Upload(client, universe.Id, entry.Id, svg, "portrait.svg", "image/svg+xml");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task An_image_in_an_unaccepted_format_is_refused()
    {
        var (client, universe, type) = await World("imggif");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A real, decodable image - just not one of the three LorEvolve stores.
        using var source = new Image<Rgba32>(64, 64);
        using var buffer = new MemoryStream();
        source.SaveAsGif(buffer);

        var response = await Upload(client, universe.Id, entry.Id, buffer.ToArray(), "portrait.gif", "image/gif");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("JPEG", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task A_tiff_or_bmp_never_reaches_its_decoder()
    {
        var (client, universe, type) = await World("imgtiff");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // Only the three accepted decoders are configured (issue #33, M-1), so these are unreadable from the first byte,
        // rather than identified by their own decoder - where a BigTIFF can loop - and then refused for their format.
        using var source = new Image<Rgba32>(64, 64);
        foreach (var (save, name, contentType) in new (Action<Stream>, string, string)[]
        {
            (stream => source.SaveAsTiff(stream), "portrait.tiff", "image/tiff"),
            (stream => source.SaveAsBmp(stream), "portrait.bmp", "image/bmp"),
        })
        {
            using var buffer = new MemoryStream();
            save(buffer);

            var response = await Upload(client, universe.Id, entry.Id, buffer.ToArray(), name, contentType);

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains("not an image LorEvolve can read", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }

        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task An_oversized_upload_is_refused()
    {
        var (client, universe, type) = await World("imgbig");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(
            client,
            universe.Id,
            entry.Id,
            new byte[ImagePreparation.MaxUploadBytes + 1],
            "portrait.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task An_image_with_too_many_pixels_is_refused_before_it_is_decoded()
    {
        var (client, universe, type) = await World("imgbomb");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A few hundred bytes on the wire, declaring 81 megapixels. Nothing may try to allocate
        // that in order to find out it is too big - this is the whole decompression-bomb case,
        // and it is why the header is read before the pixels.
        var response = await Upload(
            client, universe.Id, entry.Id, PngClaiming(9000, 9000), "bomb.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task An_image_larger_than_the_side_limit_is_refused()
    {
        var (client, universe, type) = await World("imgwide");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(
            client, universe.Id, entry.Id, Png(ImagePreparation.MaxSide + 1, 4), "banner.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task An_empty_file_is_refused()
    {
        var (client, universe, type) = await World("imgzero");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(client, universe.Id, entry.Id, [], "portrait.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    [Fact]
    public async Task A_truncated_image_is_refused()
    {
        var (client, universe, type) = await World("imgcut");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A valid header over a body that stops halfway. It gets past Identify and dies in the
        // decoder, which is a different branch and still the author's file that is wrong.
        var whole = Png(600, 600);
        var response = await Upload(client, universe.Id, entry.Id, whole[..(whole.Length / 2)], "portrait.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(await HasImage(entry.Id));
    }

    // ---------- Reading ----------

    [Fact]
    public async Task An_owner_reads_both_variants_and_the_response_is_private()
    {
        var (client, universe, type) = await World("imgread");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(900, 600), "portrait.png");

        var original = await client.GetAsync(OriginalUrl(universe.Id, entry.Id, stored.AssetId));
        Assert.Equal(HttpStatusCode.OK, original.StatusCode);
        Assert.Equal("image/png", original.Content.Headers.ContentType!.MediaType);
        Assert.NotEmpty(await original.Content.ReadAsByteArrayAsync());

        var thumbnail = await client.GetAsync(ThumbnailUrl(universe.Id, entry.Id, stored));
        Assert.Equal(HttpStatusCode.OK, thumbnail.StatusCode);
        Assert.Equal("image/webp", thumbnail.Content.Headers.ContentType!.MediaType);

        // Private, never shared, and never public: a proxy or a shared cache must not keep one
        // author's picture. The service worker refuses everything under /api by construction
        // (ADR 0017), and this route is under /api, so it is out of the app-shell cache too.
        foreach (var response in new[] { original, thumbnail })
        {
            var cache = response.Headers.CacheControl!;
            Assert.True(cache.Private);
            Assert.False(cache.Public);
        }

        Assert.StartsWith("/api/", OriginalUrl(universe.Id, entry.Id, stored.AssetId), StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_unknown_variant_asset_or_thumbnail_is_not_found()
    {
        var (client, universe, type) = await World("imgvar");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        string[] misses =
        [
            $"{ImageRoute(universe.Id, entry.Id)}/{stored.AssetId}/full",
            OriginalUrl(universe.Id, entry.Id, Guid.NewGuid()),

            // A thumbnail is addressed by its own id as well as the asset's, so neither the bare
            // variant nor an id that is not the current one resolves.
            $"{ImageRoute(universe.Id, entry.Id)}/{stored.AssetId}/thumbnail",
            $"{ImageRoute(universe.Id, entry.Id)}/{stored.AssetId}/thumbnail/{Guid.NewGuid()}",
            $"{ImageRoute(universe.Id, entry.Id)}/{Guid.NewGuid()}/thumbnail/{stored.ThumbnailId}",
        ];

        foreach (var url in misses)
        {
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(url)).StatusCode);
        }
    }

    [Fact]
    public async Task An_object_the_bucket_no_longer_holds_answers_not_found()
    {
        var (client, universe, type) = await World("imggone");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        // The row still names it; the bucket has lost it. Two stores disagreeing is not a server
        // fault, and it must not become a 500.
        _factory.Media.Evict(Key(universe.Id, entry.Id, stored.AssetId, "original.png"));

        var response = await client.GetAsync(OriginalUrl(universe.Id, entry.Id, stored.AssetId));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        // The thumbnail is a separate object and is still there.
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ThumbnailUrl(universe.Id, entry.Id, stored))).StatusCode);
    }

    [Fact]
    public async Task A_store_that_fails_a_read_answers_503_in_LorEvolves_words()
    {
        var (client, universe, type) = await World("imgreadfail");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        var brokenUrl = OriginalUrl(universe.Id, entry.Id, stored.AssetId);

        HttpResponseMessage response;
        _factory.Media.FailGet = _ => StorageFailure();
        try
        {
            response = await client.GetAsync(brokenUrl);
        }
        finally
        {
            _factory.Media.FailGet = null;
        }

        await AssertStorageProblem(response);
    }

    // ---------- Replacing ----------

    [Fact]
    public async Task A_replacement_mints_a_new_asset_switches_to_it_and_sweeps_the_old_pair()
    {
        var (client, universe, type) = await World("imgswap");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var first = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "first.png");
        var second = await Uploaded(client, universe.Id, entry.Id, Jpeg(500, 500), "second.jpg");

        // A new identity, never the old one written over.
        Assert.NotEqual(first.AssetId, second.AssetId);
        Assert.Equal("image/jpeg", second.ContentType);

        // The entry points at the new pair.
        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(second.AssetId, detail.Image!.AssetId);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        var row = await db.EntityImages.AsNoTracking().SingleAsync(image => image.EntityId == entry.Id);
        Assert.Equal(Key(universe.Id, entry.Id, second.AssetId, "original.jpg"), row.OriginalKey);
        Assert.Equal(ThumbnailKey(universe.Id, entry.Id, second), row.ThumbnailKey);

        // And the pair it replaced is gone from the bucket.
        Assert.False(_factory.Media.Contains(Key(universe.Id, entry.Id, first.AssetId, "original.png")));
        Assert.False(_factory.Media.Contains(ThumbnailKey(universe.Id, entry.Id, first)));

        // A URL for the replaced asset stops resolving, so nothing can serve the old picture.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(OriginalUrl(universe.Id, entry.Id, first.AssetId))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(ThumbnailUrl(universe.Id, entry.Id, first))).StatusCode);
    }

    [Fact]
    public async Task A_failed_replacement_leaves_the_working_image_active_and_cleans_up_after_itself()
    {
        var (client, universe, type) = await World("imgfail");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var first = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "first.png");

        // The original lands and the thumbnail does not: the half-finished upload, which is the
        // case the whole ordering exists for.
        _factory.Media.FailPut = key =>
            key.Contains("/thumbnail-", StringComparison.Ordinal) && !key.Contains(first.AssetId.ToString("D"), StringComparison.Ordinal)
                ? new InvalidOperationException("The bucket refused the thumbnail.")
                : null;

        try
        {
            // Answered as a deployment answers it: the exception handler's 500 (issue 55, W2).
            Assert.Equal(
                HttpStatusCode.InternalServerError,
                (await Upload(client, universe.Id, entry.Id, Jpeg(500, 500), "second.jpg")).StatusCode);
        }
        finally
        {
            _factory.Media.FailPut = null;
        }

        // The image the author had is still the image the author has.
        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(first.AssetId, detail.Image!.AssetId);
        Assert.True(_factory.Media.Contains(Key(universe.Id, entry.Id, first.AssetId, "original.png")));
        Assert.True(_factory.Media.Contains(ThumbnailKey(universe.Id, entry.Id, first)));
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(OriginalUrl(universe.Id, entry.Id, first.AssetId))).StatusCode);

        // And the half of the new asset that did land was taken back out. Exactly two objects
        // belong to this entry, and both are the first asset's.
        var mine = _factory.Media.Keys
            .Where(key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal))
            .ToList();

        Assert.Equal(2, mine.Count);
        Assert.All(mine, key => Assert.Contains(first.AssetId.ToString("D"), key, StringComparison.Ordinal));
    }

    [Fact]
    public async Task A_sweep_that_cannot_run_does_not_fail_the_write()
    {
        var (client, universe, type) = await World("imgsweep");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var first = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "first.png");

        _factory.Media.FailDelete = _ => new InvalidOperationException("The bucket refused the delete.");

        EntityImageRef second;
        try
        {
            // Past the commit the new image is the entry's image. An orphan left in the bucket
            // is litter to be logged, never a reason to put the old asset back.
            second = await Uploaded(client, universe.Id, entry.Id, Jpeg(500, 500), "second.jpg");
        }
        finally
        {
            _factory.Media.FailDelete = null;
        }

        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(second.AssetId, detail.Image!.AssetId);
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ThumbnailUrl(universe.Id, entry.Id, second))).StatusCode);
    }

    [Fact]
    public async Task A_store_that_fails_the_original_leaves_no_thumbnail_behind()
    {
        var (client, universe, type) = await World("imghalf");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var first = await Uploaded(client, universe.Id, entry.Id, Png(900, 600), "one.png");
        var before = _factory.Media.Keys.Count;

        // The pair is written at once, so the square can be the one that lands while the original
        // is the one that fails. Neither order may leave litter or disturb the entry's picture.
        _factory.Media.FailPut = key => key.EndsWith(".webp", StringComparison.Ordinal) ? null : StorageFailure();
        try
        {
            await AssertStorageProblem(
                await Upload(client, universe.Id, entry.Id, Png(400, 400), "two.png"));
        }
        finally
        {
            _factory.Media.FailPut = null;
        }

        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(first.AssetId, detail.Image!.AssetId);
        Assert.True(_factory.Media.Contains(Key(universe.Id, entry.Id, first.AssetId, "original.png")));
        Assert.True(_factory.Media.Contains(ThumbnailKey(universe.Id, entry.Id, first)));
        Assert.Equal(before, _factory.Media.Keys.Count);
    }

    [Fact]
    public async Task A_store_that_fails_mid_upload_answers_503_keeps_the_working_image_and_sweeps_what_landed()
    {
        var (client, universe, type) = await World("imgr2fail");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var first = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "first.png");

        // The original is accepted and the thumbnail is refused, the way R2 refused the live
        // upload: a controlled storage failure rather than a bug in LorEvolve.
        _factory.Media.FailPut = key =>
            key.Contains("/thumbnail-", StringComparison.Ordinal) && !key.Contains(first.AssetId.ToString("D"), StringComparison.Ordinal)
                ? StorageFailure()
                : null;

        HttpResponseMessage response;
        try
        {
            response = await Upload(client, universe.Id, entry.Id, Jpeg(500, 500), "second.jpg", "image/jpeg");
        }
        finally
        {
            _factory.Media.FailPut = null;
        }

        await AssertStorageProblem(response);

        // The entry still has its first picture, whole and readable.
        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(first.AssetId, detail.Image!.AssetId);
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ThumbnailUrl(universe.Id, entry.Id, first))).StatusCode);

        // And the new original that did land was taken back out.
        var mine = _factory.Media.Keys
            .Where(key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal))
            .ToList();

        Assert.Equal(2, mine.Count);
        Assert.All(mine, key => Assert.Contains(first.AssetId.ToString("D"), key, StringComparison.Ordinal));
    }

    // ---------- Removing ----------

    [Fact]
    public async Task Removing_clears_the_association_and_cleans_the_objects()
    {
        var (client, universe, type) = await World("imgdel");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        var response = await client.DeleteAsync(ImageRoute(universe.Id, entry.Id));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Null(detail.Image);
        Assert.False(await HasImage(entry.Id));

        Assert.False(_factory.Media.Contains(Key(universe.Id, entry.Id, stored.AssetId, "original.png")));
        Assert.False(_factory.Media.Contains(ThumbnailKey(universe.Id, entry.Id, stored)));

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(OriginalUrl(universe.Id, entry.Id, stored.AssetId))).StatusCode);
    }

    [Fact]
    public async Task Removing_an_image_that_is_not_there_succeeds()
    {
        var (client, universe, type) = await World("imgdel2");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await client.DeleteAsync(ImageRoute(universe.Id, entry.Id));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    // ---------- The Trash ----------

    [Fact]
    public async Task Trashing_keeps_the_image_and_restoring_reconnects_it()
    {
        var (client, universe, type) = await World("imgtrash");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{entry.Id}"))
            .EnsureSuccessStatusCode();

        // Nothing was erased: the row, both objects and the owner's access to them all survive
        // the Trash, because trashing marks an entry rather than deleting it.
        Assert.True(await HasImage(entry.Id));
        Assert.True(_factory.Media.Contains(Key(universe.Id, entry.Id, stored.AssetId, "original.png")));
        Assert.True(_factory.Media.Contains(ThumbnailKey(universe.Id, entry.Id, stored)));
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ThumbnailUrl(universe.Id, entry.Id, stored))).StatusCode);

        // A trashed entry is not editable, and its image - thumbnail included - is part of what
        // may not be edited.
        var upload = await Upload(client, universe.Id, entry.Id, Png(300, 300), "other.png");
        Assert.Equal(HttpStatusCode.NotFound, upload.StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Reframe(client, universe.Id, entry.Id, stored.AssetId, new EntityImageCrop(0, 0, 1, 1))).StatusCode);

        var restore = await client.PostAsync($"/api/universes/{universe.Id}/trash/{entry.Id}/restore", null);
        restore.EnsureSuccessStatusCode();

        var restored = (await restore.Content.ReadFromJsonAsync<EntityDetail>())!;
        Assert.Equal(stored.AssetId, restored.Image!.AssetId);
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(OriginalUrl(universe.Id, entry.Id, stored.AssetId))).StatusCode);
    }

    // ---------- Ownership ----------

    [Fact]
    public async Task Another_owner_can_neither_read_set_nor_remove_an_image()
    {
        var (mine, universe, type) = await World("imgmine");
        var entry = await Entry(mine, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(mine, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        var theirs = await SignedInClient("user-imgtheirs");

        // Every route answers the same 404 an absent universe answers, so nothing distinguishes
        // "not yours" from "not there" - including whether the entry has an image at all.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await theirs.GetAsync(OriginalUrl(universe.Id, entry.Id, stored.AssetId))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await theirs.GetAsync(ThumbnailUrl(universe.Id, entry.Id, stored))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Upload(theirs, universe.Id, entry.Id, Png(300, 300), "theirs.png")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Reframe(theirs, universe.Id, entry.Id, stored.AssetId, new EntityImageCrop(0, 0, 0.5, 0.5))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await theirs.DeleteAsync(ImageRoute(universe.Id, entry.Id))).StatusCode);

        // And the owner's image is untouched by any of it.
        Assert.Equal(
            HttpStatusCode.OK,
            (await mine.GetAsync(OriginalUrl(universe.Id, entry.Id, stored.AssetId))).StatusCode);
        Assert.Equal(stored.ThumbnailId, (await Detail(mine, universe.Id, entry.Id)).Image!.ThumbnailId);
    }

    [Fact]
    public async Task An_image_cannot_be_read_through_another_universe()
    {
        var (client, universe, type) = await World("imgcross");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        // The same owner's other world. The entry is theirs, the image is theirs, and the route
        // still refuses it, because the universe in the path is the one that grants access.
        var other = await CreateUniverse(client, "World imgcross-two");

        var response = await client.GetAsync(OriginalUrl(other.Id, entry.Id, stored.AssetId));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task An_anonymous_caller_is_refused()
    {
        var (client, universe, type) = await World("imganon");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        using var anonymous = _factory.CreateClient();

        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.GetAsync(OriginalUrl(universe.Id, entry.Id, stored.AssetId))).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.GetAsync(ThumbnailUrl(universe.Id, entry.Id, stored))).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await Upload(anonymous, universe.Id, entry.Id, Png(300, 300), "anon.png")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await Reframe(anonymous, universe.Id, entry.Id, stored.AssetId, new EntityImageCrop(0, 0, 1, 1))).StatusCode);
    }

    // ---------- Disclosure ----------

    [Fact]
    public async Task Nothing_about_the_bucket_reaches_a_response()
    {
        var (client, universe, type) = await World("imgleak");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var accepted = await Upload(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");
        var refused = await Upload(client, universe.Id, entry.Id, [1, 2, 3, 4], "portrait.png");

        foreach (var response in new[] { accepted, refused })
        {
            var body = await response.Content.ReadAsStringAsync();

            // Not the provider, not the endpoint, not a credential, and not an object key -
            // a key is an internal address and belongs in the database and the log, not the wire.
            Assert.DoesNotContain("r2.cloudflarestorage", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("cloudflare", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("AccessKey", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("SecretAccessKey", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("universes/", body, StringComparison.OrdinalIgnoreCase);
        }

        // The entry's own payloads carry identifiers and shape, never a URL to anywhere.
        var detail = await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{entry.Id}");
        Assert.DoesNotContain("cloudflarestorage", detail, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("originalKey", detail, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("thumbnailKey", detail, StringComparison.OrdinalIgnoreCase);
    }

    // ---------- History ----------

    [Fact]
    public async Task Setting_replacing_and_removing_a_picture_are_each_recorded_as_history()
    {
        var (client, universe, type) = await World("imghist");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var created = await History(client, universe.Id, entry.Id);
        Assert.Single(created);

        // Three writes, three versions. An image change is author-visible state, so a history
        // that stayed the same length across all three would be quietly omitting what was done.
        await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "first.png");
        await Uploaded(client, universe.Id, entry.Id, Jpeg(500, 500), "second.jpg");
        (await client.DeleteAsync(ImageRoute(universe.Id, entry.Id))).EnsureSuccessStatusCode();

        var versions = await History(client, universe.Id, entry.Id);

        Assert.Equal(4, versions.Count);

        // Newest first, and each of the three says the same thing: the picture moved, and
        // nothing else did.
        foreach (var version in versions.Take(3))
        {
            Assert.Equal(EntityRevisionChange.Image, version.Changes);
            Assert.Equal(EntityRevisionKind.Edited, version.Kind);
        }

        Assert.Equal([4, 3, 2, 1], versions.Select(version => version.Number));
    }

    [Fact]
    public async Task A_version_holds_no_trace_of_the_picture_it_was_taken_beside()
    {
        var (client, universe, type) = await World("imghistbare");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var stored = await Uploaded(client, universe.Id, entry.Id, Png(400, 400), "portrait.png");

        var version = (await History(client, universe.Id, entry.Id))[0];
        var raw = await client.GetStringAsync(
            $"/api/universes/{universe.Id}/entities/{entry.Id}/revisions/{version.Id}");

        // No bytes, no asset id, no key. A replacement deletes the objects it supersedes, so a
        // key recorded here would name nothing - the change is remembered, the picture is not.
        Assert.DoesNotContain(stored.AssetId.ToString("D"), raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("universes/", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("portrait.png", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("image", raw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Putting_an_old_version_back_leaves_the_current_picture_alone()
    {
        var (client, universe, type) = await World("imghistrestore");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A version written before there was ever a picture.
        (await client.PutVersionedAsync(
            Entity(universe.Id, entry.Id),
            new EntityRequest(type, "Alenna of Tidewatch", null, CanonStatus.Idea, null, null, null)))
            .EnsureSuccessStatusCode();

        var beforeAnyPicture = (await History(client, universe.Id, entry.Id))
            .Single(version => version.Number == 1);

        var uploaded = await Uploaded(client, universe.Id, entry.Id, Png(Halves(400, 200)), "portrait.png", LeftSquare);

        // And framed again after that, so there is a thumbnail history could be tempted to rewind.
        var stored = await Reframed(client, universe.Id, entry.Id, uploaded.AssetId, RightSquare);

        var restore = await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{entry.Id}", beforeAnyPicture.Id);
        restore.EnsureSuccessStatusCode();

        var restored = (await restore.Content.ReadFromJsonAsync<EntityDetail>())!;

        // The lore went back; the picture did not move. Restoring cannot put back an image whose
        // objects were deleted when it was superseded, so it does not pretend to - it leaves the
        // entry's current picture exactly where it is, which is what the history screen says.
        // The framing is part of the picture, so it stays too.
        Assert.Equal("Alenna Vance", restored.Name);
        Assert.Equal(stored.AssetId, restored.Image!.AssetId);
        Assert.Equal(stored.ThumbnailId, restored.Image.ThumbnailId);
        Assert.Equal(RightSquare, restored.Image.Crop);
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(OriginalUrl(universe.Id, entry.Id, stored.AssetId))).StatusCode);
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ThumbnailUrl(universe.Id, entry.Id, stored))).StatusCode);
    }

    [Fact]
    public async Task A_picture_that_would_not_store_records_no_history()
    {
        var (client, universe, type) = await World("imghistfail");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var before = await History(client, universe.Id, entry.Id);

        // Refused at the gate, so nothing was stored and nothing happened to remember.
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await Upload(client, universe.Id, entry.Id, [1, 2, 3, 4], "portrait.png")).StatusCode);

        // And a removal of an image that is not there is not an event either.
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync(ImageRoute(universe.Id, entry.Id))).StatusCode);

        Assert.Equal(before.Count, (await History(client, universe.Id, entry.Id)).Count);
    }

    [Fact]
    public async Task A_new_framing_is_recorded_as_an_image_change()
    {
        var (client, universe, type) = await World("imghistframe");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(Halves(400, 200)), "halves.png", LeftSquare);

        var before = await History(client, universe.Id, entry.Id);

        await Reframed(client, universe.Id, entry.Id, stored.AssetId, RightSquare);

        var after = await History(client, universe.Id, entry.Id);

        // The card shows a different picture now, so it is a version - flagged exactly as a
        // replacement is, with nothing else claimed to have moved.
        Assert.Equal(before.Count + 1, after.Count);
        Assert.Equal(EntityRevisionChange.Image, after[0].Changes);
        Assert.Equal(EntityRevisionKind.Edited, after[0].Kind);
    }

    // ---------- Framing ----------

    /// <summary>Left half of a picture wide enough to have two squares.</summary>
    private static readonly EntityImageCrop LeftSquare = new(0, 0, 0.5, 1);

    /// <summary>Right half. Neither this nor the left is anywhere near the centred square.</summary>
    private static readonly EntityImageCrop RightSquare = new(0.5, 0, 0.5, 1);

    [Fact]
    public async Task The_thumbnail_is_the_square_the_author_chose_and_the_original_is_stored_untouched()
    {
        var (client, universe, type) = await World("imgframe");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // Red on the left, blue on the right. The centred square would be half of each, so a
        // thumbnail that ignored the choice - or quietly centre-cropped - cannot pass below.
        var source = Png(Halves(400, 200));
        var stored = await Uploaded(client, universe.Id, entry.Id, source, "halves.png", RightSquare);

        Assert.Equal(RightSquare, stored.Crop);
        Assert.Equal(400, stored.Width);
        Assert.Equal(200, stored.Height);

        using var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(universe.Id, entry.Id, stored)));

        // Square, at the chosen square's own size because it is under the 320 target, and blue
        // edge to edge.
        Assert.Equal(200, thumbnail.Width);
        Assert.Equal(200, thumbnail.Height);
        AssertEverywhere(thumbnail, IsBlue);

        // The original is the file that was uploaded: not cropped, not re-encoded, not resized.
        Assert.Equal(source, _factory.Media.Bytes(Key(universe.Id, entry.Id, stored.AssetId, "original.png")));

        // And the choice travels with the entry, so the cropper can reopen where it was left.
        Assert.Equal(RightSquare, (await Detail(client, universe.Id, entry.Id)).Image!.Crop);
    }

    [Theory]
    [InlineData(640, 320)]
    [InlineData(300, 900)]
    [InlineData(120, 80)]
    public async Task A_thumbnail_is_picture_edge_to_edge_with_no_empty_space(int width, int height)
    {
        var (client, universe, type) = await World($"imgcover{width}x{height}");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // An opaque picture in, so any transparent or letterboxed pixel out would be the thumbnail's
        // own doing. Wide, tall and smaller than the target: the square is cut from inside the
        // picture every time, never padded out to fill it.
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(width, height), "shape.png");

        using var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(universe.Id, entry.Id, stored)));

        var edge = Math.Min(320, Math.Min(width, height));
        Assert.Equal(edge, thumbnail.Width);
        Assert.Equal(edge, thumbnail.Height);

        var clear = 0;
        thumbnail.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                foreach (var pixel in accessor.GetRowSpan(y))
                {
                    if (pixel.A != 255)
                    {
                        clear++;
                    }
                }
            }
        });

        Assert.Equal(0, clear);
    }

    [Fact]
    public async Task A_framing_mode_sent_by_an_older_client_is_ignored_and_the_thumbnail_is_still_a_square_crop()
    {
        var (client, universe, type) = await World("imgstaleclient");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A client from before "Fit full image" was withdrawn still sends `framing` beside the crop,
        // here asking for the fit. There is only a square crop now: the field is not read, the crop
        // is, and nothing is refused for carrying it.
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Png(Halves(400, 200)));
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "halves.png");
        form.Add(new StringContent("1"), "framing");
        form.Add(new StringContent(CropJson(RightSquare)), "crop");

        var upload = await client.PutAsync(ImageRoute(universe.Id, entry.Id), form);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var stored = (await upload.Content.ReadFromJsonAsync<EntityImageRef>())!;

        Assert.Equal(RightSquare, stored.Crop);
        using (var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(universe.Id, entry.Id, stored))))
        {
            AssertEverywhere(thumbnail, IsBlue);
        }

        // The same on a reframing: a crop beside the old mode is applied as the crop it is...
        var reframe = await client.PutAsJsonAsync(
            $"{ImageRoute(universe.Id, entry.Id)}/thumbnail",
            new { assetId = stored.AssetId, crop = LeftSquare, framing = 1 });
        Assert.Equal(HttpStatusCode.OK, reframe.StatusCode);
        var reframed = (await reframe.Content.ReadFromJsonAsync<EntityImageRef>())!;

        using (var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(universe.Id, entry.Id, reframed))))
        {
            AssertEverywhere(thumbnail, IsRed);
        }

        // ...and the old way of asking for a fit - the mode with no crop - is simply a reframing
        // without a square, refused as one, with the thumbnail left as it was.
        await AssertCropRefused(await client.PutAsJsonAsync(
            $"{ImageRoute(universe.Id, entry.Id)}/thumbnail",
            new { assetId = stored.AssetId, crop = (EntityImageCrop?)null, framing = 1 }));
        Assert.Equal(reframed.ThumbnailId, (await Detail(client, universe.Id, entry.Id)).Image!.ThumbnailId);
    }

    [Fact]
    public async Task Without_a_choice_the_thumbnail_is_the_centred_square_and_that_framing_is_recorded()
    {
        var (client, universe, type) = await World("imgcentre");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var stored = await Uploaded(client, universe.Id, entry.Id, Png(Halves(400, 200)), "halves.png");

        // Recorded rather than left null, so every picture stored from now on says how it was cut.
        Assert.Equal(new EntityImageCrop(0.25, 0, 0.5, 1), stored.Crop);

        using var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(universe.Id, entry.Id, stored)));
        Assert.True(IsRed(At(thumbnail, 0.1, 0.5)));
        Assert.True(IsBlue(At(thumbnail, 0.9, 0.5)));
    }

    [Theory]
    [InlineData("left", """{"x":-0.1,"y":0,"width":0.5,"height":1}""")]
    [InlineData("right", """{"x":0.6,"y":0,"width":0.5,"height":1}""")]
    [InlineData("below", """{"x":0,"y":0.5,"width":0.25,"height":0.75}""")]
    [InlineData("empty", """{"x":0,"y":0,"width":0,"height":0}""")]
    [InlineData("prose", "the left bit, please")]
    public async Task A_crop_off_the_picture_or_unreadable_is_refused_and_nothing_is_stored(string tag, string crop)
    {
        var (client, universe, type) = await World($"imgbadcrop{tag}");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Upload(client, universe.Id, entry.Id, Png(Halves(400, 200)), "halves.png", crop: crop);

        await AssertCropRefused(response);
        Assert.False(await HasImage(entry.Id));
        Assert.DoesNotContain(_factory.Media.Keys, key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal));
    }

    [Fact]
    public async Task A_crop_that_is_not_square_on_the_picture_is_refused_rather_than_stretched()
    {
        var (client, universe, type) = await World("imgoblong");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A quarter of each side of a 2:1 picture is 100 by 50 pixels: inside the picture, and
        // not a square. Squashing it into one would be exactly the distortion a card must not show.
        var response = await Upload(
            client, universe.Id, entry.Id, Png(Halves(400, 200)), "halves.png", crop: CropJson(new EntityImageCrop(0, 0, 0.25, 0.25)));

        await AssertCropRefused(response);
        Assert.False(await HasImage(entry.Id));
    }

    [Theory]
    [InlineData(1001, 333, 17, 0, 333)]
    [InlineData(333, 1001, 0, 668, 333)]
    [InlineData(4000, 3000, 1234, 567, 1789)]
    [InlineData(7, 5, 2, 0, 5)]
    public void A_crop_made_from_whole_pixels_lands_back_on_exactly_those_pixels(
        int width,
        int height,
        int left,
        int top,
        int side)
    {
        // The cropper sends whole pixels divided by the picture's size, and a backup stores the
        // same fractions. Either way the server has to recover the exact square, or a thumbnail
        // regenerated from a backup would drift from the one the author approved.
        var crop = new EntityImageCrop((double)left / width, (double)top / height, (double)side / width, (double)side / height);

        var (square, rejection) = ImagePreparation.Place(crop.ToShared(), width, height);

        Assert.Null(rejection);
        Assert.Equal(new CropRect(left, top, side, side), square);
    }

    [Fact]
    public async Task A_crop_is_measured_on_the_picture_as_it_is_displayed()
    {
        var (client, universe, type) = await World("imgorient");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        // A JPEG stored sideways: 200 by 100 pixels, red left and blue right, with an EXIF tag
        // saying to turn it a quarter clockwise. A browser draws it 100 wide by 200 tall, red above
        // blue, and that upright picture is the one the author frames - so the lower square has
        // to be blue.
        var sideways = await Uploaded(
            client, universe.Id, entry.Id, Jpeg(Halves(200, 100), orientation: 6), "sideways.jpg", new EntityImageCrop(0, 0.5, 1, 0.5));

        Assert.Equal(100, sideways.Width);
        Assert.Equal(200, sideways.Height);

        using (var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(universe.Id, entry.Id, sideways))))
        {
            Assert.Equal(100, thumbnail.Width);
            Assert.Equal(100, thumbnail.Height);
            AssertEverywhere(thumbnail, IsBlue);

            // Rotated into its pixels, and the tag that said so stripped with everything else.
            Assert.Null(thumbnail.Metadata.ExifProfile);
        }

        // A WebP carrying the same tag is drawn by browsers exactly as its pixels are stored, so
        // the frame is 200 by 100 and its right-hand square is the blue one.
        var webp = await Uploaded(
            client, universe.Id, entry.Id, Webp(Halves(200, 100), orientation: 6), "sideways.webp", RightSquare);

        Assert.Equal(200, webp.Width);
        Assert.Equal(100, webp.Height);

        using (var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(universe.Id, entry.Id, webp))))
        {
            AssertEverywhere(thumbnail, IsBlue);
        }
    }

    // ---------- Reframing ----------

    [Fact]
    public async Task Reframing_cuts_a_new_thumbnail_from_the_stored_original_and_never_touches_the_original()
    {
        var (client, universe, type) = await World("imgreframe");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var source = Png(Halves(400, 200));
        var first = await Uploaded(client, universe.Id, entry.Id, source, "halves.png", LeftSquare);
        var originalKey = Key(universe.Id, entry.Id, first.AssetId, "original.png");

        var reframed = await Reframed(client, universe.Id, entry.Id, first.AssetId, RightSquare);

        // The same picture. Same asset, same key, same bytes: nothing was uploaded, and the
        // original object was not written, moved or deleted to make the new thumbnail.
        Assert.Equal(first.AssetId, reframed.AssetId);
        Assert.Equal(source, _factory.Media.Bytes(originalKey));

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
            var row = await db.EntityImages.AsNoTracking().SingleAsync(image => image.EntityId == entry.Id);

            Assert.Equal(originalKey, row.OriginalKey);
            Assert.Equal(ThumbnailKey(universe.Id, entry.Id, reframed), row.ThumbnailKey);
        }

        // A new thumbnail under a new id, showing the new square.
        Assert.NotEqual(first.ThumbnailId, reframed.ThumbnailId);
        Assert.Equal(RightSquare, reframed.Crop);

        using (var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(universe.Id, entry.Id, reframed))))
        {
            AssertEverywhere(thumbnail, IsBlue);
        }

        // The thumbnail it replaced is gone, and its address stops resolving rather than starting
        // to serve different bytes - which is what keeps a cached one from surviving.
        Assert.False(_factory.Media.Contains(ThumbnailKey(universe.Id, entry.Id, first)));
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(ThumbnailUrl(universe.Id, entry.Id, first))).StatusCode);
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ThumbnailUrl(universe.Id, entry.Id, reframed))).StatusCode);

        // The original's address is the one it always had, and it still answers.
        var original = await client.GetAsync(OriginalUrl(universe.Id, entry.Id, first.AssetId));
        Assert.Equal(HttpStatusCode.OK, original.StatusCode);
        Assert.Equal(source, await original.Content.ReadAsByteArrayAsync());

        // Two objects, as ever: the original and the one live thumbnail.
        Assert.Equal(
            2,
            _factory.Media.Keys.Count(key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal)));

        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(reframed.ThumbnailId, detail.Image!.ThumbnailId);
        Assert.Equal(RightSquare, detail.Image.Crop);
    }

    [Fact]
    public async Task A_reframing_whose_thumbnail_will_not_store_leaves_the_working_thumbnail()
    {
        var (client, universe, type) = await World("imgreframefail");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var first = await Uploaded(client, universe.Id, entry.Id, Png(Halves(400, 200)), "halves.png", LeftSquare);
        var workingKey = ThumbnailKey(universe.Id, entry.Id, first);
        var history = await History(client, universe.Id, entry.Id);

        _factory.Media.FailPut = key => key != workingKey ? StorageFailure() : null;

        HttpResponseMessage response;
        try
        {
            response = await Reframe(client, universe.Id, entry.Id, first.AssetId, RightSquare);
        }
        finally
        {
            _factory.Media.FailPut = null;
        }

        await AssertStorageProblem(response);

        // Nothing moved: the entry names the thumbnail it had, that thumbnail still exists and is
        // still the left square, and no version claims a change that did not happen.
        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(first.ThumbnailId, detail.Image!.ThumbnailId);
        Assert.Equal(LeftSquare, detail.Image.Crop);

        using (var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(workingKey)))
        {
            AssertEverywhere(thumbnail, IsRed);
        }

        Assert.Equal(
            HttpStatusCode.OK,
            (await client.GetAsync(ThumbnailUrl(universe.Id, entry.Id, first))).StatusCode);
        Assert.Equal(
            2,
            _factory.Media.Keys.Count(key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal)));
        Assert.Equal(history.Count, (await History(client, universe.Id, entry.Id)).Count);
    }

    [Fact]
    public async Task A_framing_chosen_for_a_picture_that_has_since_been_replaced_is_refused()
    {
        var (client, universe, type) = await World("imgreframestale");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var first = await Uploaded(client, universe.Id, entry.Id, Png(Halves(400, 200)), "first.png", LeftSquare);
        var second = await Uploaded(client, universe.Id, entry.Id, Jpeg(500, 500), "second.jpg");

        // The author framed the first picture in one tab; the second landed from another. The
        // fractions describe a picture the entry no longer has, so they are not applied to this one.
        var response = await Reframe(client, universe.Id, entry.Id, first.AssetId, RightSquare);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(EntityImageEndpoints.ImageChangedCode, await ProblemCode(response));

        var detail = await Detail(client, universe.Id, entry.Id);
        Assert.Equal(second.ThumbnailId, detail.Image!.ThumbnailId);
        Assert.Equal(
            2,
            _factory.Media.Keys.Count(key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal)));
    }

    [Fact]
    public async Task A_reframing_checks_its_crop_before_anything_is_written()
    {
        var (client, universe, type) = await World("imgreframecrop");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(Halves(400, 200)), "halves.png", LeftSquare);

        EntityImageCrop?[] refused =
        [
            null,
            new EntityImageCrop(0.75, 0, 0.5, 1),
            new EntityImageCrop(0, 0, 0.25, 0.25),
        ];

        foreach (var crop in refused)
        {
            await AssertCropRefused(await Reframe(client, universe.Id, entry.Id, stored.AssetId, crop));
        }

        Assert.Equal(stored.ThumbnailId, (await Detail(client, universe.Id, entry.Id)).Image!.ThumbnailId);
        Assert.Equal(
            2,
            _factory.Media.Keys.Count(key => key.Contains(entry.Id.ToString("D"), StringComparison.Ordinal)));
    }

    [Fact]
    public async Task A_reframing_with_no_original_to_cut_from_says_so_and_changes_nothing()
    {
        var (client, universe, type) = await World("imgreframegone");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");
        var stored = await Uploaded(client, universe.Id, entry.Id, Png(Halves(400, 200)), "halves.png", LeftSquare);

        _factory.Media.Evict(Key(universe.Id, entry.Id, stored.AssetId, "original.png"));

        var response = await Reframe(client, universe.Id, entry.Id, stored.AssetId, RightSquare);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(EntityImageEndpoints.OriginalUnavailableCode, await ProblemCode(response));
        Assert.Equal(stored.ThumbnailId, (await Detail(client, universe.Id, entry.Id)).Image!.ThumbnailId);
        Assert.True(_factory.Media.Contains(ThumbnailKey(universe.Id, entry.Id, stored)));
    }

    [Fact]
    public async Task Reframing_an_entry_with_no_picture_is_not_found()
    {
        var (client, universe, type) = await World("imgreframenone");
        var entry = await Entry(client, universe.Id, type, "Alenna Vance");

        var response = await Reframe(client, universe.Id, entry.Id, Guid.NewGuid(), LeftSquare);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------- Routes ----------

    private static string ImageRoute(Guid universeId, Guid entityId) =>
        $"/api/universes/{universeId}/entities/{entityId}/image";

    private static string OriginalUrl(Guid universeId, Guid entityId, Guid assetId) =>
        $"{ImageRoute(universeId, entityId)}/{assetId}/original";

    private static string ThumbnailUrl(Guid universeId, Guid entityId, EntityImageRef image) =>
        $"{ImageRoute(universeId, entityId)}/{image.AssetId}/thumbnail/{image.ThumbnailId}";

    private static string Key(Guid universeId, Guid entityId, Guid assetId, string leaf) =>
        $"universes/{universeId:D}/entities/{entityId:D}/primary/{assetId:D}/{leaf}";

    private static string ThumbnailKey(Guid universeId, Guid entityId, EntityImageRef image) =>
        Key(universeId, entityId, image.AssetId, $"thumbnail-{image.ThumbnailId:D}.webp");

    // ---------- Calling ----------

    private static async Task<HttpResponseMessage> Upload(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        byte[] bytes,
        string fileName,
        string contentType = "image/png",
        string? crop = null)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", fileName);

        if (crop is not null)
        {
            form.Add(new StringContent(crop), "crop");
        }

        return await client.PutAsync(ImageRoute(universeId, entityId), form);
    }

    private static async Task<EntityImageRef> Uploaded(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        byte[] bytes,
        string fileName,
        EntityImageCrop? crop = null)
    {
        var contentType = Path.GetExtension(fileName) switch
        {
            ".jpg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => "image/png",
        };

        var response = await Upload(
            client, universeId, entityId, bytes, fileName, contentType, crop is null ? null : CropJson(crop));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityImageRef>())!;
    }

    private static Task<HttpResponseMessage> Reframe(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        Guid assetId,
        EntityImageCrop? crop) =>
        client.PutAsJsonAsync($"{ImageRoute(universeId, entityId)}/thumbnail", new EntityThumbnailRequest(assetId, crop));

    private static async Task<EntityImageRef> Reframed(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        Guid assetId,
        EntityImageCrop crop)
    {
        var response = await Reframe(client, universeId, entityId, assetId, crop);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityImageRef>())!;
    }

    private static string CropJson(EntityImageCrop crop) => JsonSerializer.Serialize(crop, JsonSerializerOptions.Web);

    /// <summary>
    /// A storage failure as R2 would produce one through the adapter: LorEvolve's sentence outside,
    /// and a provider message inside that names things no response may carry.
    /// </summary>
    private static MediaStorageFailedException StorageFailure() =>
        new(
            "Image storage could not complete the request.",
            new InvalidOperationException("synthetic-bucket: STREAMING-AWS4-HMAC-SHA256-PAYLOAD not implemented"));

    /// <summary>
    /// The one answer a failing store gets: a 503 problem in LorEvolve's words, with nothing the
    /// provider said and nothing that names the bucket.
    /// </summary>
    private static async Task AssertStorageProblem(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        using var problem = JsonDocument.Parse(body);

        Assert.Equal("Image storage is unavailable.", problem.RootElement.GetProperty("title").GetString());
        Assert.DoesNotContain("synthetic-bucket", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("STREAMING", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("universes/", body, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task AssertCropRefused(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(problem.RootElement.GetProperty("errors").TryGetProperty("crop", out _));
    }

    private static async Task<string?> ProblemCode(HttpResponseMessage response)
    {
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    private static async Task<EntityDetail> Detail(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{universeId}/entities/{entityId}"))!;

    private static string Entity(Guid universeId, Guid entityId) =>
        $"/api/universes/{universeId}/entities/{entityId}";

    private static async Task<IReadOnlyList<EntityRevisionSummary>> History(
        HttpClient client,
        Guid universeId,
        Guid entityId) =>
        (await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"{Entity(universeId, entityId)}/revisions"))!;

    private static async Task<EntityPage> Page(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universeId}/entities?page=1&pageSize=50"))!;

    private async Task<bool> HasImage(Guid entityId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        return await db.EntityImages.AsNoTracking().AnyAsync(image => image.EntityId == entityId);
    }

    // ---------- Building a world ----------

    private async Task<(HttpClient Client, UniverseDetail Universe, Guid CharacterTypeId)> World(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        var universe = await CreateUniverse(client, $"World {tag}");
        return (client, universe, await CharacterType(client, universe.Id));
    }

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<Guid> CharacterType(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        return types.First(type => type.Name == "Character").Id;
    }

    private static async Task<EntityDetail> Entry(HttpClient client, Guid universeId, Guid typeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, CanonStatus.Idea, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    // ---------- Building an image ----------

    private static byte[] Png(int width, int height)
    {
        using var image = Painted(width, height);
        using var buffer = new MemoryStream();
        image.SaveAsPng(buffer);
        return buffer.ToArray();
    }

    private static byte[] Jpeg(int width, int height)
    {
        using var image = Painted(width, height);
        using var buffer = new MemoryStream();
        image.SaveAsJpeg(buffer);
        return buffer.ToArray();
    }

    /// <summary>Encodes and disposes <paramref name="image"/>.</summary>
    private static byte[] Png(Image<Rgba32> image)
    {
        using (image)
        {
            using var buffer = new MemoryStream();
            image.SaveAsPng(buffer);
            return buffer.ToArray();
        }
    }

    /// <summary>Encodes and disposes <paramref name="image"/>, tagged with an EXIF orientation.</summary>
    private static byte[] Jpeg(Image<Rgba32> image, ushort orientation)
    {
        using (image)
        {
            Orient(image, orientation);
            using var buffer = new MemoryStream();
            image.SaveAsJpeg(buffer);
            return buffer.ToArray();
        }
    }

    /// <summary>Encodes and disposes <paramref name="image"/>, tagged with an EXIF orientation.</summary>
    private static byte[] Webp(Image<Rgba32> image, ushort orientation)
    {
        using (image)
        {
            Orient(image, orientation);
            using var buffer = new MemoryStream();
            image.SaveAsWebp(buffer, new WebpEncoder { FileFormat = WebpFileFormatType.Lossless });
            return buffer.ToArray();
        }
    }

    private static void Orient(Image image, ushort orientation)
    {
        image.Metadata.ExifProfile = new ExifProfile();
        image.Metadata.ExifProfile.SetValue(ExifTag.Orientation, orientation);
    }

    /// <summary>
    /// Red on the left half, blue on the right. The picture that makes a crop checkable by eye and
    /// by assertion: every square on one side is one colour, and the centred square is both.
    /// </summary>
    private static Image<Rgba32> Halves(int width, int height)
    {
        var image = new Image<Rgba32>(width, height);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = x < width / 2 ? new Rgba32(220, 30, 30) : new Rgba32(30, 30, 220);
                }
            }
        });
        return image;
    }

    /// <summary>The pixel at a fraction of the way across and down.</summary>
    private static Rgba32 At(Image<Rgba32> image, double across, double down) =>
        image[(int)(across * (image.Width - 1)), (int)(down * (image.Height - 1))];

    // Loose on purpose: the thumbnail is lossy WebP, so a colour is recognised, not matched.
    private static bool IsRed(Rgba32 pixel) => pixel.R > 160 && pixel.G < 90 && pixel.B < 90;

    private static bool IsBlue(Rgba32 pixel) => pixel.B > 160 && pixel.R < 90 && pixel.G < 90;

    /// <summary>Corners, edges and middle - a crop that strayed across the seam shows up at one of them.</summary>
    private static void AssertEverywhere(Image<Rgba32> image, Func<Rgba32, bool> expected)
    {
        foreach (var across in new[] { 0.02, 0.5, 0.98 })
        {
            foreach (var down in new[] { 0.02, 0.5, 0.98 })
            {
                var pixel = At(image, across, down);
                Assert.True(expected(pixel), $"Pixel at ({across}, {down}) was {pixel}.");
            }
        }
    }

    /// <summary>Not a flat colour: a resampler given one has nothing to prove it worked on.</summary>
    private static Image<Rgba32> Painted(int width, int height)
    {
        var image = new Image<Rgba32>(width, height);
        image.Mutate(context => context.BackgroundColor(Color.CornflowerBlue));
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y += 3)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x += 3)
                {
                    row[x] = new Rgba32(220, 40, 60);
                }
            }
        });
        return image;
    }

    /// <summary>
    /// A real, well-formed PNG header declaring dimensions its body does not contain.
    ///
    /// This is what a decompression bomb looks like from the wire: a handful of bytes describing
    /// an image whose decoded form would be gigabytes. Only a check that reads the header before
    /// the pixels can refuse it, so this is how that check is proved rather than assumed.
    /// </summary>
    private static byte[] PngClaiming(int width, int height)
    {
        var png = Png(4, 4);

        // Signature is 8 bytes; the first chunk is IHDR, whose length and type occupy the next
        // 8, so the declared size lives at 16 and the chunk's CRC covers type and data alike.
        WriteBigEndian(png, 16, width);
        WriteBigEndian(png, 20, height);
        WriteBigEndian(png, 29, (int)Crc32(png.AsSpan(12, 17)));

        return png;
    }

    private static void WriteBigEndian(byte[] buffer, int offset, int value)
    {
        buffer[offset] = (byte)(value >> 24);
        buffer[offset + 1] = (byte)(value >> 16);
        buffer[offset + 2] = (byte)(value >> 8);
        buffer[offset + 3] = (byte)value;
    }

    private static uint Crc32(ReadOnlySpan<byte> data)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var value in data)
        {
            crc ^= value;
            for (var bit = 0; bit < 8; bit++)
            {
                crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
            }
        }

        return crc ^ 0xFFFFFFFFu;
    }
}
