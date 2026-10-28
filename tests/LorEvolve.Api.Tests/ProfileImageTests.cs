using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Profile;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The one photo on an account: what LorEvolve stores, who may touch it, and what the two stores are
/// allowed to disagree about.
///
/// The claims this file carries. A signed-in person can set, reframe, read and remove their own
/// photo, and can express nothing else - there is no user id in any of these routes, so "someone
/// else's photo" is not a request that exists, and the isolation tests prove that from the other
/// side. What is stored is an image, decided by decoding it. The original and the square it makes
/// are two separate objects, keyed by ids and nothing a person typed, under a prefix no universe
/// owns. Reframing cuts a new square from the stored original and never touches it. A replacement
/// or a reframe never destroys the working photo before the new one is the account's, and never
/// leaves the row naming objects that were deliberately deleted. And a universe backup does not
/// contain any of it, because a backup holds one world's authored data and this is not that.
///
/// No test here touches Cloudflare. The host runs against <see cref="TestMediaObjectStore"/>,
/// which is a real implementation of the same contract, so the ordering asserted is the ordering
/// R2 would see.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class ProfileImageTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private const string Route = "/api/profile/image";

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Uploading ----------

    [Fact]
    public async Task An_account_uploads_a_photo_and_it_becomes_its_own()
    {
        var (client, _) = await Account("photoup");

        // Before anything is uploaded, having no photo is an ordinary state and not a 404.
        var before = await client.GetAsync(Route);
        Assert.Equal(HttpStatusCode.NoContent, before.StatusCode);

        var response = await Upload(client, Png(900, 600), "me.png");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var stored = (await response.Content.ReadFromJsonAsync<ProfileImageRef>())!;

        Assert.NotEqual(Guid.Empty, stored.AssetId);
        Assert.NotEqual(Guid.Empty, stored.ThumbnailId);
        Assert.Equal(900, stored.Width);
        Assert.Equal(600, stored.Height);
        Assert.Equal("image/png", stored.ContentType);
        Assert.Equal("me.png", stored.FileName);
        Assert.True(stored.ByteSize > 0);

        // And it is what the account reads back without being told where to look.
        var current = await Current(client);
        Assert.Equal(stored.AssetId, current!.AssetId);
        Assert.Equal(stored.ThumbnailId, current.ThumbnailId);
    }

    [Fact]
    public async Task The_original_and_its_square_are_two_objects_and_the_row_names_both()
    {
        var (client, userId) = await Account("photopair");

        var stored = await Uploaded(client, Png(900, 600), "me.png");

        var originalKey = Key(userId, stored.AssetId, "original.png");
        var thumbnailKey = ThumbnailKey(userId, stored);

        Assert.NotEqual(originalKey, thumbnailKey);
        Assert.True(_factory.Media.Contains(originalKey));
        Assert.True(_factory.Media.Contains(thumbnailKey));

        // The original is the bytes that were uploaded, in the format they were uploaded in.
        Assert.Equal("image/png", _factory.Media.ContentType(originalKey));

        // The square is a square WebP, never enlarged past the target.
        Assert.Equal("image/webp", _factory.Media.ContentType(thumbnailKey));
        using var thumbnail = Image.Load<Rgba32>(_factory.Media.Bytes(thumbnailKey));
        Assert.Equal(320, thumbnail.Width);
        Assert.Equal(320, thumbnail.Height);

        var row = await Row(userId);
        Assert.Equal(stored.AssetId, row.AssetId);
        Assert.Equal(originalKey, row.OriginalKey);
        Assert.Equal(thumbnailKey, row.ThumbnailKey);
        Assert.Equal(900, row.Width);
        Assert.Equal(600, row.Height);
    }

    [Fact]
    public async Task The_square_is_filled_by_the_picture_and_nothing_else()
    {
        var (client, userId) = await Account("photofill");

        // Far wider than it is tall, so a square that was fitted rather than cut would have to
        // pad two sides with something that is not the picture.
        var stored = await Uploaded(client, Png(Halves(1200, 300)), "wide.png");

        using var square = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(userId, stored)));

        Assert.Equal(square.Width, square.Height);

        for (var y = 0; y < square.Height; y += 16)
        {
            for (var x = 0; x < square.Width; x += 16)
            {
                var pixel = square[x, y];
                Assert.Equal(255, pixel.A);
                Assert.True(
                    IsRed(pixel) || IsBlue(pixel),
                    $"the square holds something that is not the picture at {x},{y}");
            }
        }
    }

    [Fact]
    public async Task The_chosen_square_is_what_is_cut_and_it_is_persisted()
    {
        var (client, userId) = await Account("photocrop");

        // The right-hand square of a red/blue picture: entirely blue, and never the centred one.
        var crop = new ImageCrop(0.5, 0, 0.5, 1);
        var stored = await Uploaded(client, Png(Halves(800, 400)), "halves.png", crop);

        Assert.NotNull(stored.Crop);
        Assert.Equal(0.5, stored.Crop!.X, 3);
        Assert.Equal(0d, stored.Crop.Y, 3);
        Assert.Equal(0.5, stored.Crop.Width, 3);
        Assert.Equal(1d, stored.Crop.Height, 3);

        // Persisted, so "Edit photo" can reopen on it without the picture being sent again.
        var row = await Row(userId);
        Assert.Equal(0.5, row.CropX!.Value, 3);
        Assert.Equal(0.5, row.CropWidth!.Value, 3);

        using var square = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(userId, stored)));
        Assert.True(IsBlue(square[square.Width / 2, square.Height / 2]));
        Assert.True(IsBlue(square[4, 4]));
    }

    [Fact]
    public async Task An_upload_that_is_not_an_image_is_refused_and_nothing_is_stored()
    {
        var (client, _) = await Account("photojunk");

        var response = await Upload(client, Encoding.UTF8.GetBytes("this is not a picture"), "me.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(await Current(client));
        Assert.DoesNotContain(_factory.Media.Keys, key => key.StartsWith("users/", StringComparison.Ordinal)
            && key.Contains("photojunk", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task An_upload_larger_than_the_limit_is_refused_before_it_is_decoded()
    {
        var (client, _) = await Account("photobig");

        var response = await Upload(client, new byte[ImagePreparation.MaxUploadBytes + 1], "huge.png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(await Current(client));
    }

    [Fact]
    public async Task A_selection_that_is_not_square_is_refused()
    {
        var (client, _) = await Account("photooblong");

        var response = await Upload(
            client, Png(800, 400), "me.png", crop: CropJson(new ImageCrop(0, 0, 0.9, 0.2)));

        await AssertCropRefused(response);
        Assert.Null(await Current(client));
    }

    // ---------- Reframing ----------

    [Fact]
    public async Task Reframing_cuts_a_new_square_and_leaves_the_original_exactly_as_it_was()
    {
        var (client, userId) = await Account("photoreframe");

        var first = await Uploaded(client, Png(Halves(800, 400)), "halves.png", new ImageCrop(0, 0, 0.5, 1));
        var originalKey = Key(userId, first.AssetId, "original.png");
        var originalBytes = _factory.Media.Bytes(originalKey);

        var second = await Reframed(client, first.AssetId, new ImageCrop(0.5, 0, 0.5, 1));

        // Same picture, new square.
        Assert.Equal(first.AssetId, second.AssetId);
        Assert.NotEqual(first.ThumbnailId, second.ThumbnailId);

        // The original was not rewritten, moved or re-uploaded.
        Assert.True(_factory.Media.Contains(originalKey));
        Assert.Equal(originalBytes, _factory.Media.Bytes(originalKey));
        Assert.Equal(originalKey, (await Row(userId)).OriginalKey);

        // The square that was replaced is gone, and the new one is the account's.
        Assert.False(_factory.Media.Contains(ThumbnailKey(userId, first)));
        Assert.True(_factory.Media.Contains(ThumbnailKey(userId, second)));

        using var square = Image.Load<Rgba32>(_factory.Media.Bytes(ThumbnailKey(userId, second)));
        Assert.True(IsBlue(square[square.Width / 2, square.Height / 2]));
    }

    [Fact]
    public async Task Reframing_a_photo_that_has_since_been_replaced_is_refused_and_leaves_no_litter()
    {
        var (client, userId) = await Account("photostale");

        var first = await Uploaded(client, Png(800, 400), "one.png");
        var second = await Uploaded(client, Png(800, 400), "two.png");

        var before = _factory.Media.Keys.Count;

        var response = await Reframe(client, first.AssetId, new ImageCrop(0, 0, 0.5, 1));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(ProfileImageEndpoints.ImageChangedCode, await ProblemCode(response));

        // The live photo is untouched, and the refused square was swept.
        var row = await Row(userId);
        Assert.Equal(second.AssetId, row.AssetId);
        Assert.Equal(second.ThumbnailId, row.ThumbnailId);
        Assert.Equal(before, _factory.Media.Keys.Count);
    }

    [Fact]
    public async Task Reframing_when_the_stored_original_has_vanished_says_so_rather_than_failing()
    {
        var (client, userId) = await Account("photolost");

        var stored = await Uploaded(client, Png(800, 400), "me.png");
        _factory.Media.Evict(Key(userId, stored.AssetId, "original.png"));

        var response = await Reframe(client, stored.AssetId, new ImageCrop(0, 0, 0.5, 1));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(ProfileImageEndpoints.OriginalUnavailableCode, await ProblemCode(response));
    }

    // ---------- Replacing and removing ----------

    [Fact]
    public async Task A_replacement_keeps_one_row_and_sweeps_the_photo_it_replaced()
    {
        var (client, userId) = await Account("photoreplace");

        var first = await Uploaded(client, Png(900, 600), "one.png");
        var firstOriginal = Key(userId, first.AssetId, "original.png");
        var firstThumbnail = ThumbnailKey(userId, first);

        var second = await Uploaded(client, Jpeg(600, 900), "two.jpg");

        Assert.NotEqual(first.AssetId, second.AssetId);

        // The superseded pair is gone, and only after the new pair became the account's.
        Assert.False(_factory.Media.Contains(firstOriginal));
        Assert.False(_factory.Media.Contains(firstThumbnail));
        Assert.True(_factory.Media.Contains(Key(userId, second.AssetId, "original.jpg")));
        Assert.True(_factory.Media.Contains(ThumbnailKey(userId, second)));

        // One account, one photo - a replacement is not a second row.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        Assert.Equal(1, await db.ProfileImages.CountAsync(image => image.UserId == userId));
        Assert.Equal("image/jpeg", (await Row(userId)).ContentType);
    }

    [Fact]
    public async Task Removing_clears_the_association_and_then_the_objects()
    {
        var (client, userId) = await Account("photoremove");

        var stored = await Uploaded(client, Png(900, 600), "me.png");
        var originalKey = Key(userId, stored.AssetId, "original.png");
        var thumbnailKey = ThumbnailKey(userId, stored);

        var response = await client.DeleteAsync(Route);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await Current(client));
        Assert.False(_factory.Media.Contains(originalKey));
        Assert.False(_factory.Media.Contains(thumbnailKey));

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        Assert.False(await db.ProfileImages.AnyAsync(image => image.UserId == userId));

        // Removing a photo that is not there is the outcome the caller asked for.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Route)).StatusCode);
    }

    // ---------- Reading ----------

    [Fact]
    public async Task An_owner_reads_both_variants_and_an_address_dies_with_what_it_named()
    {
        var (client, _) = await Account("photoread");

        var stored = await Uploaded(client, Png(900, 600), "me.png");

        var original = await client.GetAsync($"{Route}/{stored.AssetId}/original");
        Assert.Equal(HttpStatusCode.OK, original.StatusCode);
        Assert.Equal("image/png", original.Content.Headers.ContentType!.MediaType);
        Assert.Contains("immutable", original.Headers.CacheControl!.ToString(), StringComparison.Ordinal);

        var thumbnail = await client.GetAsync(ThumbnailUrl(stored));
        Assert.Equal(HttpStatusCode.OK, thumbnail.StatusCode);
        Assert.Equal("image/webp", thumbnail.Content.Headers.ContentType!.MediaType);

        // Replace it, and the addresses of what it replaced stop resolving.
        var replacement = await Uploaded(client, Png(400, 400), "next.png");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{Route}/{stored.AssetId}/original")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(ThumbnailUrl(stored))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(ThumbnailUrl(replacement))).StatusCode);
    }

    // ---------- Who may touch it ----------

    [Fact]
    public async Task One_account_cannot_read_or_disturb_another_accounts_photo()
    {
        var (mine, myId) = await Account("photomine");
        var (theirs, _) = await Account("photoyours");

        var stored = await Uploaded(mine, Png(900, 600), "me.png");

        // The other session has no photo of its own, and asking does not surface anyone else's.
        Assert.Null(await Current(theirs));

        // The addresses of my photo mean nothing in their session: the row is found by the
        // session's own user id, so an asset id that is not theirs simply is not there.
        Assert.Equal(HttpStatusCode.NotFound, (await theirs.GetAsync($"{Route}/{stored.AssetId}/original")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await theirs.GetAsync(ThumbnailUrl(stored))).StatusCode);

        // Nor can they reframe it: the request names an asset, never an account.
        var reframe = await Reframe(theirs, stored.AssetId, new ImageCrop(0, 0, 0.5, 1));
        Assert.Equal(HttpStatusCode.NotFound, reframe.StatusCode);

        // Their own delete clears their own nothing, and leaves mine whole.
        Assert.Equal(HttpStatusCode.NoContent, (await theirs.DeleteAsync(Route)).StatusCode);
        Assert.True(_factory.Media.Contains(Key(myId, stored.AssetId, "original.png")));
        Assert.Equal(stored.AssetId, (await Current(mine))!.AssetId);

        // And their own upload is their own: two accounts, two prefixes, one row each.
        await Uploaded(theirs, Png(400, 400), "them.png");
        Assert.Equal(stored.AssetId, (await Current(mine))!.AssetId);
    }

    [Fact]
    public async Task Every_route_refuses_a_visitor_who_is_not_signed_in()
    {
        var (owner, _) = await Account("photoguard");
        var stored = await Uploaded(owner, Png(400, 400), "me.png");

        using var anonymous = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Route)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Upload(anonymous, Png(400, 400), "me.png")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await Reframe(anonymous, stored.AssetId, new ImageCrop(0, 0, 0.5, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.DeleteAsync(Route)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(ThumbnailUrl(stored))).StatusCode);
    }

    // ---------- The keys ----------

    [Fact]
    public async Task Object_keys_carry_ids_only_and_sit_under_no_universe()
    {
        var (client, userId) = await Account("photokeys");

        var stored = await Uploaded(client, Png(400, 400), "Luis Pires holiday.png");

        var keys = _factory.Media.Keys
            .Where(key => key.Contains(userId, StringComparison.Ordinal))
            .ToList();

        Assert.Equal(2, keys.Count);

        foreach (var key in keys)
        {
            Assert.StartsWith($"users/{userId}/profile/{stored.AssetId:D}/", key, StringComparison.Ordinal);

            // Account data does not live under a universe, where a per-world rule could sweep it.
            Assert.DoesNotContain("universes/", key, StringComparison.Ordinal);

            // Nothing a person typed, and nothing anyone could be identified by.
            Assert.DoesNotContain("photokeys@", key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("user-photokeys", key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("holiday", key, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Luis", key, StringComparison.OrdinalIgnoreCase);
        }
    }

    // ---------- When storage fails ----------

    [Fact]
    public async Task The_original_and_its_square_are_written_at_the_same_time()
    {
        var (client, userId) = await Account("photoconc");

        // Neither write may finish until the other has started. If the pair were written one
        // after the other, the first would wait for a second that had not begun, and the wait
        // would time out rather than the upload succeeding.
        var originalStarted = new TaskCompletionSource();
        var thumbnailStarted = new TaskCompletionSource();

        _factory.Media.BeforePut = async key =>
        {
            if (key.EndsWith(".webp", StringComparison.Ordinal))
            {
                thumbnailStarted.TrySetResult();
                await originalStarted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            }
            else
            {
                originalStarted.TrySetResult();
                await thumbnailStarted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            }
        };

        HttpResponseMessage response;
        try
        {
            response = await Upload(client, Png(900, 600), "me.png");
        }
        finally
        {
            _factory.Media.BeforePut = null;
        }

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var stored = (await response.Content.ReadFromJsonAsync<ProfileImageRef>())!;
        Assert.True(_factory.Media.Contains(Key(userId, stored.AssetId, "original.png")));
        Assert.True(_factory.Media.Contains(ThumbnailKey(userId, stored)));
    }

    [Fact]
    public async Task A_store_that_fails_the_original_leaves_the_square_nothing_points_at_swept()
    {
        var (client, userId) = await Account("photohalf");

        var first = await Uploaded(client, Png(900, 600), "one.png");
        var before = _factory.Media.Keys.Count;

        // The mirror of the case below it: now the square lands and the original does not. Both
        // orders are reachable once the pair is written at once, and neither may leave litter or
        // disturb the photo the account already had.
        _factory.Media.FailPut = key => key.EndsWith(".webp", StringComparison.Ordinal) ? null : StorageFailure();
        try
        {
            await AssertStorageProblem(await Upload(client, Png(400, 400), "two.png"));
        }
        finally
        {
            _factory.Media.FailPut = null;
        }

        Assert.Equal(first.AssetId, (await Current(client))!.AssetId);
        Assert.True(_factory.Media.Contains(Key(userId, first.AssetId, "original.png")));
        Assert.True(_factory.Media.Contains(ThumbnailKey(userId, first)));
        Assert.Equal(before, _factory.Media.Keys.Count);
    }

    [Fact]
    public async Task A_store_that_fails_mid_upload_leaves_the_previous_photo_working_and_no_litter()
    {
        var (client, userId) = await Account("photofail");

        var first = await Uploaded(client, Png(900, 600), "one.png");
        var firstOriginal = Key(userId, first.AssetId, "original.png");
        var before = _factory.Media.Keys.Count;

        // The original lands; the square does not. The half-written asset must not survive, and
        // the photo the account already had must.
        _factory.Media.FailPut = key => key.EndsWith(".webp", StringComparison.Ordinal) ? StorageFailure() : null;
        try
        {
            await AssertStorageProblem(await Upload(client, Png(400, 400), "two.png"));
        }
        finally
        {
            _factory.Media.FailPut = null;
        }

        Assert.Equal(first.AssetId, (await Current(client))!.AssetId);
        Assert.True(_factory.Media.Contains(firstOriginal));
        Assert.True(_factory.Media.Contains(ThumbnailKey(userId, first)));
        Assert.Equal(before, _factory.Media.Keys.Count);
    }

    [Fact]
    public async Task A_store_that_will_not_answer_a_read_is_a_503_that_says_nothing_about_the_provider()
    {
        var (client, _) = await Account("photoreadfail");

        var stored = await Uploaded(client, Png(400, 400), "me.png");

        _factory.Media.FailGet = _ => StorageFailure();
        try
        {
            await AssertStorageProblem(await client.GetAsync(ThumbnailUrl(stored)));
        }
        finally
        {
            _factory.Media.FailGet = null;
        }
    }

    [Fact]
    public async Task A_sweep_that_cannot_run_is_not_the_callers_problem()
    {
        var (client, userId) = await Account("photosweepfail");

        var stored = await Uploaded(client, Png(400, 400), "me.png");

        // The bucket refuses the cleanup. The removal itself already committed, so the caller is
        // told it worked - the orphan is logged and left, which is what ADR 0019 chose.
        _factory.Media.FailDelete = _ => StorageFailure();
        try
        {
            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Route)).StatusCode);
        }
        finally
        {
            _factory.Media.FailDelete = null;
        }

        Assert.Null(await Current(client));
        Assert.True(_factory.Media.Contains(Key(userId, stored.AssetId, "original.png")));
    }

    // ---------- What a backup is not ----------

    [Fact]
    public async Task A_universe_backup_holds_no_trace_of_the_account_photo()
    {
        var (client, userId) = await Account("photobackup");

        var stored = await Uploaded(client, Png(900, 600), "me.png");
        var universe = await CreateUniverse(client, "World photobackup");

        var response = await client.GetAsync($"/api/universes/{universe.Id}/export");
        response.EnsureSuccessStatusCode();
        var archive = await response.Content.ReadAsByteArrayAsync();

        using var zip = new ZipArchive(new MemoryStream(archive, writable: false), ZipArchiveMode.Read);

        // Nothing of the account's media, by path...
        Assert.DoesNotContain(zip.Entries, entry => entry.FullName.StartsWith("users/", StringComparison.Ordinal));
        Assert.DoesNotContain(zip.Entries, entry => entry.FullName.Contains(userId, StringComparison.Ordinal));

        // ...and nothing of it by id in the document either.
        var document = zip.GetEntry("backup.json")!;
        using var reader = new StreamReader(document.Open(), Encoding.UTF8);
        var text = await reader.ReadToEndAsync();

        Assert.DoesNotContain(stored.AssetId.ToString(), text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(userId, text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("profile", text, StringComparison.OrdinalIgnoreCase);
    }

    // ---------- Addresses and keys ----------

    private static string ThumbnailUrl(ProfileImageRef image) =>
        $"{Route}/{image.AssetId}/thumbnail/{image.ThumbnailId}";

    private static string Key(string userId, Guid assetId, string leaf) =>
        $"users/{userId}/profile/{assetId:D}/{leaf}";

    private static string ThumbnailKey(string userId, ProfileImageRef image) =>
        Key(userId, image.AssetId, $"thumbnail-{image.ThumbnailId:D}.webp");

    // ---------- Calling ----------

    private static async Task<HttpResponseMessage> Upload(
        HttpClient client,
        byte[] bytes,
        string fileName,
        string? crop = null)
    {
        var contentType = Path.GetExtension(fileName) switch
        {
            ".jpg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => "image/png",
        };

        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", fileName);

        if (crop is not null)
        {
            form.Add(new StringContent(crop), "crop");
        }

        return await client.PutAsync(Route, form);
    }

    private static async Task<ProfileImageRef> Uploaded(
        HttpClient client,
        byte[] bytes,
        string fileName,
        ImageCrop? crop = null)
    {
        var response = await Upload(client, bytes, fileName, crop is null ? null : CropJson(crop));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProfileImageRef>())!;
    }

    private static Task<HttpResponseMessage> Reframe(HttpClient client, Guid assetId, ImageCrop? crop) =>
        client.PutAsJsonAsync($"{Route}/thumbnail", new ProfileThumbnailRequest(assetId, crop));

    private static async Task<ProfileImageRef> Reframed(HttpClient client, Guid assetId, ImageCrop crop)
    {
        var response = await Reframe(client, assetId, crop);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProfileImageRef>())!;
    }

    /// <summary>The account's photo, or null when it has none. 204 is the "none" answer.</summary>
    private static async Task<ProfileImageRef?> Current(HttpClient client)
    {
        var response = await client.GetAsync(Route);
        response.EnsureSuccessStatusCode();

        return response.StatusCode == HttpStatusCode.NoContent
            ? null
            : await response.Content.ReadFromJsonAsync<ProfileImageRef>();
    }

    private static string CropJson(ImageCrop crop) => JsonSerializer.Serialize(crop, JsonSerializerOptions.Web);

    /// <summary>
    /// A storage failure as R2 would produce one through the adapter: LorEvolve's sentence outside,
    /// and a provider message inside that names things no response may carry.
    /// </summary>
    private static MediaStorageFailedException StorageFailure() =>
        new(
            "Image storage could not complete the request.",
            new InvalidOperationException("synthetic-bucket: STREAMING-AWS4-HMAC-SHA256-PAYLOAD not implemented"));

    private static async Task AssertStorageProblem(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        using var problem = JsonDocument.Parse(body);

        Assert.Equal("Image storage is unavailable.", problem.RootElement.GetProperty("title").GetString());
        Assert.DoesNotContain("synthetic-bucket", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("STREAMING", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("users/", body, StringComparison.OrdinalIgnoreCase);
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

    // ---------- Building an account ----------

    /// <summary>A signed-in client and the account id its session carries.</summary>
    private async Task<(HttpClient Client, string UserId)> Account(string tag)
    {
        var username = $"user-{tag}";
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{tag}@example.test", Password));
        response.EnsureSuccessStatusCode();

        var user = (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!;
        return (client, user.Id);
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private async Task<ProfileImage> Row(string userId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        return await db.ProfileImages.AsNoTracking().SingleAsync(image => image.UserId == userId);
    }

    // ---------- Building a picture ----------

    private static byte[] Png(int width, int height) => Png(Painted(width, height));

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

    /// <summary>Red on the left half, blue on the right, so a crop is checkable by eye and by assertion.</summary>
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

    /// <summary>A picture with structure in it, so a re-encode cannot collapse to one flat colour.</summary>
    private static Image<Rgba32> Painted(int width, int height)
    {
        var image = new Image<Rgba32>(width, height);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = new Rgba32((byte)(x % 251), (byte)(y % 241), (byte)((x + y) % 233));
                }
            }
        });
        return image;
    }

    private static bool IsRed(Rgba32 pixel) => pixel.R > 160 && pixel.G < 90 && pixel.B < 90;

    private static bool IsBlue(Rgba32 pixel) => pixel.B > 160 && pixel.R < 90 && pixel.G < 90;
}
