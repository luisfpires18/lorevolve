using System.Net;
using System.Net.Http.Json;
using System.Text;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Publishing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A universe's artwork: the original kept as uploaded, one 16:10 card cut from it on the server, and the
/// line between the two - the owner reads both, anyone reads the card of a public universe and nothing
/// else (ADR 0036). The write ordering is the profile photo's and is proven there; what is proven here is
/// what is different: the frame, the keys, who may read what, and what publishing forbids.
/// </summary>
public sealed class UniverseArtworkTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Artwork_is_an_original_and_a_16_10_card_under_the_universe_and_ids_alone()
    {
        var (owner, _) = await Account(_factory, "art-keys");
        var universe = await CreateUniverse(owner, "Artwork keys");

        var stored = await UploadedArtwork(owner, universe.Id, Png(1600, 1200), "Cover by me.png");

        var row = await Row(universe.Id);
        Assert.Equal($"universes/{universe.Id:D}/artwork/{stored.AssetId:D}/original.png", row.OriginalKey);
        Assert.Equal($"universes/{universe.Id:D}/artwork/{stored.AssetId:D}/card-{stored.CardId:D}.webp", row.CardKey);
        Assert.Equal("image/png", _factory.Media.ContentType(row.OriginalKey));
        Assert.Equal("image/webp", _factory.Media.ContentType(row.CardKey));
        Assert.Equal((1600, 1200, "Cover by me.png"), (stored.Width, stored.Height, stored.FileName));

        // No crop asked for: the largest centred 16:10 frame, stored at the card's width.
        using var card = Image.Load<Rgba32>(_factory.Media.Bytes(row.CardKey));
        Assert.Equal((960, 600), (card.Width, card.Height));
        Assert.Equal(new ImageCrop(0, 0.0833, 1, 0.8333), Round(stored.Crop));
    }

    [Fact]
    public async Task A_small_picture_is_never_enlarged()
    {
        var (owner, _) = await Account(_factory, "art-small");
        var universe = await CreateUniverse(owner, "Artwork small");

        await UploadedArtwork(owner, universe.Id, Png(480, 300));

        using var card = Image.Load<Rgba32>(_factory.Media.Bytes((await Row(universe.Id)).CardKey));
        Assert.Equal((480, 300), (card.Width, card.Height));
    }

    [Fact]
    public async Task The_frame_the_author_chose_is_the_card_and_a_frame_of_another_shape_is_refused()
    {
        var (owner, _) = await Account(_factory, "art-frame");
        var universe = await CreateUniverse(owner, "Artwork frame");

        // The right half of a red/blue picture, framed 16:10: all blue, never the centred cut.
        var stored = await UploadedArtwork(owner, universe.Id, Halves(1600, 500), crop: new ImageCrop(0.5, 0, 0.5, 1));
        using (var card = Image.Load<Rgba32>(_factory.Media.Bytes((await Row(universe.Id)).CardKey)))
        {
            Assert.Equal((800, 500), (card.Width, card.Height));
            Assert.True(card[10, 10].B > 160 && card[card.Width - 10, card.Height - 10].B > 160);
        }

        Assert.Equal(new ImageCrop(0.5, 0, 0.5, 1), Round(stored.Crop));

        // A square is a thumbnail's frame, not a card's.
        var square = await UploadArtwork(owner, universe.Id, Halves(1600, 500), crop: new ImageCrop(0, 0, 0.3125, 1));
        Assert.Equal(HttpStatusCode.BadRequest, square.StatusCode);
        Assert.Equal(["crop"], await ErrorKeys(square));
        Assert.Contains("16:10", await square.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task What_is_not_a_picture_is_refused_whatever_it_is_called()
    {
        var (owner, _) = await Account(_factory, "art-refused");
        var universe = await CreateUniverse(owner, "Artwork refused");

        var text = await UploadArtwork(owner, universe.Id, Encoding.UTF8.GetBytes("not a picture"), "cover.png");
        var svg = await UploadArtwork(owner, universe.Id, Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"), "cover.png");
        var empty = await UploadArtwork(owner, universe.Id, [], "cover.png");

        foreach (var refused in new[] { text, svg, empty })
        {
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Equal(["file"], await ErrorKeys(refused));
        }

        Assert.Equal(HttpStatusCode.NoContent, (await owner.GetAsync($"/api/universes/{universe.Id}/artwork")).StatusCode);
        Assert.DoesNotContain(_factory.Media.Keys, key => key.StartsWith($"universes/{universe.Id:D}/", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Replacing_the_artwork_of_a_public_universe_moves_its_card_and_sweeps_the_old_pair()
    {
        var (owner, _) = await Account(_factory, "art-replace");
        var universe = await Ready(owner, "Artwork replace");
        var state = await Published(owner, universe.Id);
        var anonymous = Anonymous(_factory);
        var before = (await PublicBySlug(anonymous, state.PublicSlug!))!.CardImageUrl;
        var oldRow = await Row(universe.Id);

        var replaced = await UploadedArtwork(owner, universe.Id, Png(1200, 750), "second.png");

        var after = (await PublicBySlug(anonymous, state.PublicSlug!))!.CardImageUrl;
        Assert.NotEqual(before, after);
        Assert.EndsWith($"/{replaced.CardId:D}", after, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(before)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(after)).StatusCode);
        Assert.False(_factory.Media.Contains(oldRow.OriginalKey));
        Assert.False(_factory.Media.Contains(oldRow.CardKey));
    }

    [Fact]
    public async Task Reframing_cuts_a_new_card_from_the_stored_original_and_leaves_the_original_alone()
    {
        var (owner, _) = await Account(_factory, "art-reframe");
        var universe = await CreateUniverse(owner, "Artwork reframe");
        var stored = await UploadedArtwork(owner, universe.Id, Halves(1600, 500));
        var first = await Row(universe.Id);
        var originalBytes = _factory.Media.Bytes(first.OriginalKey);

        var response = await owner.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/artwork/card",
            new UniverseArtworkCardRequest(stored.AssetId, new ImageCrop(0, 0, 0.5, 1)));
        response.EnsureSuccessStatusCode();
        var reframed = (await response.Content.ReadFromJsonAsync<UniverseArtworkRef>())!;

        var row = await Row(universe.Id);
        Assert.Equal(stored.AssetId, reframed.AssetId);
        Assert.NotEqual(stored.CardId, reframed.CardId);
        Assert.Equal(first.OriginalKey, row.OriginalKey);
        Assert.Equal(originalBytes, _factory.Media.Bytes(row.OriginalKey));
        Assert.False(_factory.Media.Contains(first.CardKey));

        using var card = Image.Load<Rgba32>(_factory.Media.Bytes(row.CardKey));
        Assert.True(card[10, 10].R > 160, "the card shows the left half now");

        // A frame chosen on a picture that has since been replaced is refused, not applied to the new one.
        var stale = await owner.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/artwork/card",
            new UniverseArtworkCardRequest(Guid.NewGuid(), new ImageCrop(0, 0, 0.5, 1)));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(UniverseArtworkEndpoints.ArtworkChangedCode, await ProblemCode(stale));
    }

    [Fact]
    public async Task The_owner_reads_both_objects_and_nobody_else_reads_either_through_the_owner_routes()
    {
        var (owner, _) = await Account(_factory, "art-owner");
        var (stranger, _) = await Account(_factory, "art-stranger");
        var universe = await CreateUniverse(owner, "Artwork owner");
        var stored = await UploadedArtwork(owner, universe.Id, Png(800, 500));

        var original = $"/api/universes/{universe.Id}/artwork/{stored.AssetId}/original";
        var card = $"/api/universes/{universe.Id}/artwork/{stored.AssetId}/card/{stored.CardId}";

        var mine = await owner.GetAsync(original);
        Assert.Equal(HttpStatusCode.OK, mine.StatusCode);
        Assert.True(mine.Headers.CacheControl!.Private);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync(card)).StatusCode);

        foreach (var route in new[] { original, card, $"/api/universes/{universe.Id}/artwork" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(route)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await Anonymous(_factory).GetAsync(route)).StatusCode);
        }
    }

    [Fact]
    public async Task The_public_card_answers_only_while_public_and_is_revalidated_every_time()
    {
        var (owner, _) = await Account(_factory, "art-public");
        var universe = await Ready(owner, "Artwork public");
        var anonymous = Anonymous(_factory);
        var cardId = (await State(owner, universe.Id)).Artwork!.CardId;
        var url = $"/api/public/universes/artwork-public/artwork/card/{cardId:D}";

        // Private: no card, however it is asked for.
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(url)).StatusCode);

        await Published(owner, universe.Id);

        var served = await anonymous.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/webp", served.Content.Headers.ContentType!.MediaType);
        Assert.True(served.Headers.CacheControl!.NoCache);
        Assert.Equal("nosniff", served.Headers.GetValues("X-Content-Type-Options").Single());
        var tag = served.Headers.ETag!;

        // The current card, already held: 304, and the store is not asked.
        _factory.Media.FailGet = _ => new MediaStorageFailedException("Image storage could not complete the request.", new IOException("down"));
        try
        {
            using var conditional = new HttpRequestMessage(HttpMethod.Get, url);
            conditional.Headers.IfNoneMatch.Add(tag);
            Assert.Equal(HttpStatusCode.NotModified, (await anonymous.SendAsync(conditional)).StatusCode);
        }
        finally
        {
            _factory.Media.FailGet = null;
        }

        // Private again: the same revalidation is a 404, so a cached copy is not reused.
        (await Unpublish(owner, universe.Id)).EnsureSuccessStatusCode();
        using var afterUnpublish = new HttpRequestMessage(HttpMethod.Get, url);
        afterUnpublish.Headers.IfNoneMatch.Add(tag);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.SendAsync(afterUnpublish)).StatusCode);

        // Another card id, or the original, is never served publicly.
        await Published(owner, universe.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/public/universes/artwork-public/artwork/card/{Guid.NewGuid():D}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/public/universes/artwork-public/artwork/original")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/public/universes/Artwork-Public/artwork/card/{cardId:D}")).StatusCode);
    }

    [Fact]
    public async Task The_card_carries_nothing_the_camera_wrote()
    {
        var (owner, _) = await Account(_factory, "art-exif");
        var universe = await CreateUniverse(owner, "Artwork exif");

        using var image = new Image<Rgba32>(800, 500);
        image.Metadata.ExifProfile = new SixLabors.ImageSharp.Metadata.Profiles.Exif.ExifProfile();
        image.Metadata.ExifProfile.SetValue(SixLabors.ImageSharp.Metadata.Profiles.Exif.ExifTag.ImageDescription, "Taken at home, 51.5N 0.1W");
        using var buffer = new MemoryStream();
        await image.SaveAsJpegAsync(buffer);

        await UploadedArtwork(owner, universe.Id, buffer.ToArray(), "photo.jpg");

        var card = _factory.Media.Bytes((await Row(universe.Id)).CardKey);
        Assert.DoesNotContain("51.5N", Encoding.Latin1.GetString(card), StringComparison.Ordinal);
        using var decoded = Image.Load(card);
        Assert.Null(decoded.Metadata.ExifProfile);
    }

    [Fact]
    public async Task No_response_names_a_storage_key()
    {
        var (owner, _) = await Account(_factory, "art-nokeys");
        var universe = await Ready(owner, "Artwork no keys");
        var state = await Published(owner, universe.Id);

        var bodies = new[]
        {
            await owner.GetStringAsync($"/api/universes/{universe.Id}/publication"),
            await owner.GetStringAsync($"/api/universes/{universe.Id}/artwork"),
            await Anonymous(_factory).GetStringAsync($"/api/public/universes/{state.PublicSlug}"),
        };

        foreach (var body in bodies)
        {
            Assert.DoesNotContain($"universes/{universe.Id:D}/artwork", body, StringComparison.Ordinal);
            Assert.DoesNotContain("original.png", body, StringComparison.Ordinal);
            Assert.DoesNotContain(".webp", body, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Removing_the_artwork_of_a_private_universe_clears_it_and_sweeps_both_objects()
    {
        var (owner, _) = await Account(_factory, "art-remove");
        var universe = await CreateUniverse(owner, "Artwork remove");
        await UploadedArtwork(owner, universe.Id, Png(800, 500));
        var row = await Row(universe.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/universes/{universe.Id}/artwork")).StatusCode);

        Assert.False(_factory.Media.Contains(row.OriginalKey));
        Assert.False(_factory.Media.Contains(row.CardKey));
        var state = await State(owner, universe.Id);
        Assert.Null(state.Artwork);
        Assert.Contains("artwork", state.Missing.Keys);

        // Removing nothing is the outcome asked for.
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/universes/{universe.Id}/artwork")).StatusCode);
    }

    private async Task<UniverseArtwork> Row(Guid universeId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
        return await db.UniverseArtworks.AsNoTracking().SingleAsync(artwork => artwork.UniverseId == universeId);
    }

    private static ImageCrop Round(ImageCrop crop) =>
        new(Math.Round(crop.X, 4), Math.Round(crop.Y, 4), Math.Round(crop.Width, 4), Math.Round(crop.Height, 4));
}
