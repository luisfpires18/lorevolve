using System.Net;
using System.Net.Http.Json;
using System.Text;
using Lorex.Api.Data;
using Lorex.Api.Features.Maps;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Storage;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.MapTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A universe's maps and their pins (issue #52, ADR 0060): what is stored for a map and how its picture is served, who may
/// read and change it, what a pin may and may not say, how a replaced picture treats the pins placed on it, where an entry
/// is pinned, what deleting takes with it, and what the owner's storage counts. Nothing here reaches Cloudflare: the host
/// runs against <see cref="TestMediaObjectStore"/>. Credentials are obviously synthetic.
/// </summary>
public sealed class MapTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _api = factory;

    // ---------- A map and its picture ----------

    [Fact]
    public async Task A_map_is_created_with_its_picture_kept_whole_and_a_fitted_display_copy()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "mapcreate");
        var u = universe.Id;

        var map = await CreateMap(client, u, "The Known World", RestoreTestClient.Png(900, 600, 3), "Every road and river.");

        Assert.Equal("The Known World", map.Name);
        Assert.Equal("Every road and river.", map.Description);
        Assert.Equal((900, 600), (map.Image.Width, map.Image.Height));
        Assert.Equal("image/png", map.Image.ContentType);
        Assert.Equal("world.png", map.Image.FileName);
        Assert.Empty(map.Pins);
        Assert.Equal(1, map.Version);

        // Two objects, under ids and nothing an author wrote.
        var prefix = $"universes/{u:D}/maps/{map.Id:D}/{map.Image.AssetId:D}";
        var original = $"{prefix}/original.png";
        var display = $"{prefix}/display.webp";
        Assert.True(_api.Media.Contains(original));
        Assert.True(_api.Media.Contains(display));
        Assert.DoesNotContain(_api.Media.Keys, key => key.Contains("Known", StringComparison.OrdinalIgnoreCase));

        // The original is the bytes as uploaded; the display copy is WebP at the picture's own size, never enlarged.
        Assert.Equal("image/png", _api.Media.ContentType(original));
        Assert.Equal("image/webp", _api.Media.ContentType(display));
        using var fitted = Image.Load<Rgba32>(_api.Media.Bytes(display));
        Assert.Equal((900, 600), (fitted.Width, fitted.Height));

        // Listed, with its pins counted, and read back whole.
        var listed = Assert.Single((await client.GetFromJsonAsync<List<MapSummary>>(Maps(u)))!);
        Assert.Equal((map.Id, 0), (listed.Id, listed.PinCount));
        var read = await ReadMap(client, u, map.Id);
        Assert.Equal(map.Image.AssetId, read.Image.AssetId);

        // Both addresses stream the picture, privately and immutably; a stale asset id answers nothing.
        var served = await client.GetAsync($"{Map(u, map.Id)}/image/{map.Image.AssetId}/display");
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/webp", served.Content.Headers.ContentType!.MediaType);
        Assert.Contains("immutable", served.Headers.CacheControl!.ToString(), StringComparison.Ordinal);
        Assert.True(served.Headers.CacheControl.Private);
        Assert.Equal("image/png", (await client.GetAsync($"{Map(u, map.Id)}/image/{map.Image.AssetId}/original")).Content.Headers.ContentType!.MediaType);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{Map(u, map.Id)}/image/{Guid.NewGuid()}/display")).StatusCode);
    }

    [Fact]
    public async Task A_large_picture_is_fitted_for_display_and_its_displayed_size_is_the_originals()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "mapfit");
        var map = await CreateMap(client, universe.Id, "Wide", RestoreTestClient.Png(5000, 2500, 1));

        Assert.Equal((5000, 2500), (map.Image.Width, map.Image.Height));
        using var fitted = Image.Load<Rgba32>(_api.Media.Bytes($"universes/{universe.Id:D}/maps/{map.Id:D}/{map.Image.AssetId:D}/display.webp"));
        Assert.Equal((MapLimits.DisplaySide, MapLimits.DisplaySide / 2), (fitted.Width, fitted.Height));
    }

    [Fact]
    public async Task What_is_not_a_map_is_refused_and_nothing_is_stored()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "maprefuse");
        var u = universe.Id;
        var before = _api.Media.Keys.Count;

        var text = await client.PostAsync(Maps(u), MapForm("Notes", Encoding.UTF8.GetBytes("not a picture"), fileName: "map.png"));
        Assert.Equal(HttpStatusCode.BadRequest, text.StatusCode);
        Assert.Contains("file", await PublishingTestClient.ErrorKeys(text));

        var svg = await client.PostAsync(Maps(u), MapForm("Vector", Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"), fileName: "map.svg", contentType: "image/svg+xml"));
        Assert.Equal(HttpStatusCode.BadRequest, svg.StatusCode);

        var unnamed = await client.PostAsync(Maps(u), MapForm("   ", RestoreTestClient.Png(200, 200)));
        Assert.Equal(HttpStatusCode.BadRequest, unnamed.StatusCode);
        Assert.Contains("name", await PublishingTestClient.ErrorKeys(unnamed));

        var noFile = new MultipartFormDataContent { { new StringContent("Nameless"), "name" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(Maps(u), noFile)).StatusCode);

        await CreateMap(client, u, "Twice");
        var duplicate = await client.PostAsync(Maps(u), MapForm("Twice", RestoreTestClient.Png(200, 200)));
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        Assert.Contains("name", await PublishingTestClient.ErrorKeys(duplicate));

        Assert.Empty((await client.GetFromJsonAsync<List<MapSummary>>(Maps(u)))!.Where(map => map.Name != "Twice"));
        Assert.Equal(before + 2, _api.Media.Keys.Count);
    }

    [Fact]
    public async Task A_store_that_fails_leaves_no_map_and_no_object()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "mapstorefail");
        _api.Media.FailPut = key => key.Contains("/maps/", StringComparison.Ordinal) ? new MediaStorageFailedException("Image storage could not complete the request.", new IOException()) : null;
        try
        {
            var response = await client.PostAsync(Maps(universe.Id), MapForm("Doomed", RestoreTestClient.Png(300, 200)));
            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            Assert.DoesNotContain("cloudflare", await response.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            _api.Media.FailPut = null;
        }

        Assert.Empty((await client.GetFromJsonAsync<List<MapSummary>>(Maps(universe.Id)))!);
        Assert.DoesNotContain(_api.Media.Keys, key => key.Contains($"universes/{universe.Id:D}/maps/", StringComparison.Ordinal));

        // The hold taken for the upload was given back.
        var ownerId = await WithDbReturning(_api, db => db.Universes.Where(candidate => candidate.Id == universe.Id).Select(candidate => candidate.OwnerId).SingleAsync());
        await WithDb(_api, async db => Assert.Empty(await db.StorageReservations.Where(hold => hold.UserId == ownerId).ToListAsync()));
    }

    [Fact]
    public async Task A_maps_original_counts_against_the_owners_storage_and_a_full_owner_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "mapquota");
        var u = universe.Id;
        var ownerId = await WithDbReturning(_api, db => db.Universes.Where(candidate => candidate.Id == u).Select(candidate => candidate.OwnerId).SingleAsync());

        var png = RestoreTestClient.Png(640, 480, 5);
        var map = await CreateMap(client, u, "Counted", png);
        Assert.Equal(png.Length, map.Image.ByteSize);

        var usage = (await client.GetFromJsonAsync<AccountStorageResponse>("/api/profile/storage"))!;
        Assert.Equal(png.Length, usage.MapImagesBytes);
        Assert.Equal(png.Length, usage.UsedBytes);

        // An allowance smaller than the next picture: refused before the bucket is touched, and the owner is told it is theirs.
        await WithDb(_api, async db =>
        {
            await db.Users.Where(user => user.Id == ownerId).ExecuteUpdateAsync(update => update.SetProperty(user => user.StorageQuotaBytes, (long)png.Length + 10));
        });
        var keys = _api.Media.Keys.Count;
        var refused = await client.PostAsync(Maps(u), MapForm("Too much", RestoreTestClient.Png(640, 480, 9)));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(StorageQuota.ExceededCode, await PublishingTestClient.ProblemCode(refused));
        Assert.Equal(keys, _api.Media.Keys.Count);

        // Deleting the map gives the room back.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Map(u, map.Id))).StatusCode);
        Assert.Equal(0, (await client.GetFromJsonAsync<AccountStorageResponse>("/api/profile/storage"))!.MapImagesBytes);
    }

    // ---------- Who may ----------

    [Fact]
    public async Task Members_read_editors_change_and_everyone_else_is_refused_or_told_nothing()
    {
        var w = await NewSharedWorld(_api, "mapwho");
        var map = await CreateMap(w.Owner, w.U, "Shared map");
        var pin = await AddPin(w.Editor, w.U, map.Id, "The Vale", 0.5, 0.5, w.Entry);

        foreach (var who in Members)
        {
            var client = w.Client(who);
            Assert.Single((await client.GetFromJsonAsync<List<MapSummary>>(Maps(w.U)))!);
            var read = await ReadMap(client, w.U, map.Id);
            Assert.Equal("Ember Vale", Assert.Single(read.Pins).Lore!.Name);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"{Map(w.U, map.Id)}/image/{map.Image.AssetId}/display")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/universes/{w.U}/entities/{w.Entry}/map-pins")).StatusCode);
        }

        // A Viewer and a Reviewer read; they do not place, move, rename or replace.
        foreach (var client in new[] { w.Viewer, w.Reviewer })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Pins(w.U, map.Id), new MapPinRequest("Try", null, 0.1, 0.1, null))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(Pin(w.U, map.Id, pin.Id), new MapPinRequest("Moved", null, 0.2, 0.2, null))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(Map(w.U, map.Id), new MapDetailsRequest("Renamed", null, 1))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(Maps(w.U), MapForm("Another", RestoreTestClient.Png(100, 100)))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsync($"{Map(w.U, map.Id)}/image", ReplaceForm(RestoreTestClient.Png(100, 100), "keep"))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync(Map(w.U, map.Id))).StatusCode);
        }

        // An outsider learns nothing: 404 everywhere, the picture included, whether or not the id is real.
        foreach (var path in new[] { Maps(w.U), Map(w.U, map.Id), $"{Map(w.U, map.Id)}/image/{map.Image.AssetId}/display", $"/api/universes/{w.U}/entities/{w.Entry}/map-pins" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await w.Outsider.GetAsync(path)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await w.Outsider.PostAsJsonAsync(Pins(w.U, map.Id), new MapPinRequest("Try", null, 0.1, 0.1, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _api.CreateClient().GetAsync(Map(w.U, map.Id))).StatusCode);

        // The map's id under another universe the caller does own is not found either: ids do not cross universes.
        var elsewhere = (await CreateUniverse(w.Owner, "Elsewhere mapwho")).Id;
        Assert.Equal(HttpStatusCode.NotFound, (await w.Owner.GetAsync(Map(elsewhere, map.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Owner.GetAsync($"{Map(elsewhere, map.Id)}/image/{map.Image.AssetId}/display")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Owner.PostAsJsonAsync(Pins(elsewhere, map.Id), new MapPinRequest("Try", null, 0.1, 0.1, null))).StatusCode);
    }

    // ---------- Pins ----------

    [Fact]
    public async Task A_pin_is_placed_as_fractions_linked_to_an_entry_of_this_universe_and_read_back_exactly()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "mappin");
        var u = universe.Id;
        var map = await CreateMap(client, u, "Pinned");
        var city = await CreateEntity(client, u, "Arkazia");

        var pin = await AddPin(client, u, map.Id, "Arkazia", 0.25, 0.75, city, "The capital.");
        Assert.Equal((0.25, 0.75), (pin.X, pin.Y));
        Assert.Equal("The capital.", pin.Note);
        Assert.Equal((city, "Arkazia", "Character", false), (pin.Lore!.Id, pin.Lore.Name, pin.Lore.TypeName, pin.Lore.IsTrashed));
        Assert.True(pin.PlacedOnCurrentImage);

        var annotation = await AddPin(client, u, map.Id, "Here be dragons", 1, 0);
        Assert.Null(annotation.Lore);

        var read = await ReadMap(client, u, map.Id);
        Assert.Equal(["Arkazia", "Here be dragons"], read.Pins.Select(each => each.Title));
        Assert.Equal(0, read.PinsAwaitingReview);
        Assert.Equal(2, Assert.Single((await client.GetFromJsonAsync<List<MapSummary>>(Maps(u)))!).PinCount);

        // Moved and retitled; the whole pin is saved, and the entry is read live from its row, not copied.
        var moved = await client.PutAsJsonAsync(Pin(u, map.Id, pin.Id), new MapPinRequest("Arkazia, the capital", null, 0.3, 0.7, city));
        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        var after = (await moved.Content.ReadFromJsonAsync<MapPinResponse>())!;
        Assert.Equal((0.3, 0.7, "Arkazia, the capital"), (after.X, after.Y, after.Title));
        Assert.Null(after.Note);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Pin(u, map.Id, annotation.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Pin(u, map.Id, annotation.Id))).StatusCode);
        Assert.Single((await ReadMap(client, u, map.Id)).Pins);
    }

    [Fact]
    public async Task A_pin_off_the_map_without_a_title_or_for_an_entry_it_cannot_stand_for_is_refused()
    {
        var w = await NewSharedWorld(_api, "mappinbad");
        var map = await CreateMap(w.Owner, w.U, "Bounds");
        var foreign = await CreateEntity(w.Owner, (await CreateUniverse(w.Owner, "Other mappinbad")).Id, "Elsewhere");

        async Task Refused(MapPinRequest request, string field)
        {
            var response = await w.Owner.PostAsJsonAsync(Pins(w.U, map.Id), request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains(field, await PublishingTestClient.ErrorKeys(response));
        }

        await Refused(new MapPinRequest("Off", null, 1.5, 0.5, null), "x");
        await Refused(new MapPinRequest("Off", null, 0.5, -0.1, null), "y");
        await Refused(new MapPinRequest("Off", null, null, 0.5, null), "x");
        await Refused(new MapPinRequest("  ", null, 0.5, 0.5, null), "title");
        await Refused(new MapPinRequest(new string('x', MapLimits.NameMaxLength + 1), null, 0.5, 0.5, null), "title");
        await Refused(new MapPinRequest("Long note", new string('n', MapLimits.NoteMaxLength + 1), 0.5, 0.5, null), "note");
        await Refused(new MapPinRequest("Foreign", null, 0.5, 0.5, foreign), "entityId");
        await Refused(new MapPinRequest("Nowhere", null, 0.5, 0.5, Guid.NewGuid()), "entityId");
        await Refused(new MapPinRequest("Binned", null, 0.5, 0.5, w.Trash.Entry), "entityId");

        Assert.Empty((await ReadMap(w.Owner, w.U, map.Id)).Pins);
    }

    [Fact]
    public async Task An_entry_is_pinned_once_per_map_and_may_be_on_several_maps()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "mapcard");
        var u = universe.Id;
        var world = await CreateMap(client, u, "World");
        var region = await CreateMap(client, u, "Region");
        var city = await CreateEntity(client, u, "Sylvara");

        var first = await AddPin(client, u, world.Id, "Sylvara", 0.4, 0.4, city);

        var second = await client.PostAsJsonAsync(Pins(u, world.Id), new MapPinRequest("Sylvara again", null, 0.6, 0.6, city));
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal(MapEndpoints.DuplicateLinkCode, await PublishingTestClient.ProblemCode(second));
        using (var problem = System.Text.Json.JsonDocument.Parse(await second.Content.ReadAsStringAsync()))
        {
            Assert.Equal(first.Id, problem.RootElement.GetProperty("pinId").GetGuid());
        }

        // Another pin on the same map may not be moved onto the entry either.
        var other = await AddPin(client, u, world.Id, "Jungle", 0.9, 0.9);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(Pin(u, world.Id, other.Id), new MapPinRequest("Jungle", null, 0.9, 0.9, city))).StatusCode);

        // But the same pin saved again keeps its own link, and another map may pin the entry too.
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(Pin(u, world.Id, first.Id), new MapPinRequest("Sylvara", null, 0.45, 0.4, city))).StatusCode);
        var onRegion = await AddPin(client, u, region.Id, "Sylvara", 0.1, 0.2, city);

        // From the entry: both places, by map name.
        var places = (await client.GetFromJsonAsync<List<EntityMapPin>>($"/api/universes/{u}/entities/{city}/map-pins"))!;
        Assert.Equal([("Region", onRegion.Id), ("World", first.Id)], places.Select(place => (place.MapName, place.PinId)));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/universes/{u}/entities/{Guid.NewGuid()}/map-pins")).StatusCode);
    }

    [Fact]
    public async Task A_pin_whose_entry_is_in_the_Trash_keeps_its_title_and_names_no_entry_and_an_erased_entry_leaves_an_annotation()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "mappintrash");
        var u = universe.Id;
        var map = await CreateMap(client, u, "Trash");
        var fort = await CreateEntity(client, u, "Fort Ash");
        var pin = await AddPin(client, u, map.Id, "Fort Ash", 0.2, 0.2, fort);

        (await client.DeleteAsync($"/api/universes/{u}/entities/{fort}")).EnsureSuccessStatusCode();
        var trashed = Assert.Single((await ReadMap(client, u, map.Id)).Pins);
        Assert.Equal("Fort Ash", trashed.Title);
        Assert.True(trashed.Lore!.IsTrashed);
        Assert.Null(trashed.Lore.Name);
        Assert.Equal(fort, trashed.Lore.Id);

        // Restored, it is a linked pin again; erased for good, the pin stays as an annotation.
        (await client.PostAsync($"/api/universes/{u}/trash/{fort}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal("Fort Ash", Assert.Single((await ReadMap(client, u, map.Id)).Pins).Lore!.Name);

        (await client.DeleteAsync($"/api/universes/{u}/entities/{fort}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{u}/trash/{fort}")).StatusCode);
        var orphaned = Assert.Single((await ReadMap(client, u, map.Id)).Pins);
        Assert.Equal((pin.Id, "Fort Ash"), (orphaned.Id, orphaned.Title));
        Assert.Null(orphaned.Lore);
    }

    // ---------- The picture replaced ----------

    [Fact]
    public async Task Replacing_the_picture_keeps_pins_only_for_review_or_removes_them_and_sweeps_the_old_pair()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "mapreplace");
        var u = universe.Id;
        var map = await CreateMap(client, u, "Replaced", RestoreTestClient.Png(400, 300, 2));
        var pin = await AddPin(client, u, map.Id, "Old place", 0.5, 0.5);
        var oldOriginal = $"universes/{u:D}/maps/{map.Id:D}/{map.Image.AssetId:D}/original.png";
        var oldDisplay = $"universes/{u:D}/maps/{map.Id:D}/{map.Image.AssetId:D}/display.webp";

        // No decision about the pins: nothing happens.
        var undecided = new MultipartFormDataContent { { new ByteArrayContent(RestoreTestClient.Png(800, 300, 4)), "file", "new.png" } };
        var refused = await client.PutAsync($"{Map(u, map.Id)}/image", undecided);
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("pins", await PublishingTestClient.ErrorKeys(refused));
        Assert.Equal(map.Image.AssetId, (await ReadMap(client, u, map.Id)).Image.AssetId);

        // Kept: the pin stays at its fractions and waits for review; the old objects are gone and the new ones serve.
        var kept = await client.PutAsync($"{Map(u, map.Id)}/image", ReplaceForm(RestoreTestClient.Png(800, 300, 4), "keep"));
        Assert.Equal(HttpStatusCode.OK, kept.StatusCode);
        var replaced = (await kept.Content.ReadFromJsonAsync<MapDetail>())!;
        Assert.NotEqual(map.Image.AssetId, replaced.Image.AssetId);
        Assert.Equal((800, 300), (replaced.Image.Width, replaced.Image.Height));
        var waiting = Assert.Single(replaced.Pins);
        Assert.Equal((pin.Id, 0.5, 0.5, false), (waiting.Id, waiting.X, waiting.Y, waiting.PlacedOnCurrentImage));
        Assert.Equal(1, replaced.PinsAwaitingReview);
        Assert.False(_api.Media.Contains(oldOriginal));
        Assert.False(_api.Media.Contains(oldDisplay));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{Map(u, map.Id)}/image/{map.Image.AssetId}/display")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"{Map(u, map.Id)}/image/{replaced.Image.AssetId}/display")).StatusCode);

        // Saving the pin - moved or not - is the review.
        (await client.PutAsJsonAsync(Pin(u, map.Id, pin.Id), new MapPinRequest("Old place", null, 0.5, 0.5, null))).EnsureSuccessStatusCode();
        var reviewed = await ReadMap(client, u, map.Id);
        Assert.True(Assert.Single(reviewed.Pins).PlacedOnCurrentImage);
        Assert.Equal(0, reviewed.PinsAwaitingReview);

        // Removed: the pins go with the old picture.
        var removed = await client.PutAsync($"{Map(u, map.Id)}/image", ReplaceForm(RestoreTestClient.Png(200, 200, 6), "remove"));
        Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
        Assert.Empty((await removed.Content.ReadFromJsonAsync<MapDetail>())!.Pins);
        Assert.Equal(2, _api.Media.Keys.Count(key => key.Contains($"/maps/{map.Id:D}/", StringComparison.Ordinal)));
    }

    // ---------- Details ----------

    [Fact]
    public async Task Details_are_saved_over_the_version_they_were_read_at()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "mapdetails");
        var u = universe.Id;
        var map = await CreateMap(client, u, "Before");
        await CreateMap(client, u, "Taken");

        var saved = await client.PutAsJsonAsync(Map(u, map.Id), new MapDetailsRequest("After", "A new description.", 1));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var after = (await saved.Content.ReadFromJsonAsync<MapDetail>())!;
        Assert.Equal(("After", "A new description.", 2), (after.Name, after.Description, after.Version));

        var stale = await client.PutAsJsonAsync(Map(u, map.Id), new MapDetailsRequest("Stale", null, 1));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(MapEndpoints.DetailsChangedCode, await PublishingTestClient.ProblemCode(stale));

        var taken = await client.PutAsJsonAsync(Map(u, map.Id), new MapDetailsRequest("Taken", null, 2));
        Assert.Equal(HttpStatusCode.BadRequest, taken.StatusCode);

        // An unchanged save writes nothing and keeps the version.
        var same = await client.PutAsJsonAsync(Map(u, map.Id), new MapDetailsRequest("After", "A new description.", 2));
        Assert.Equal(2, (await same.Content.ReadFromJsonAsync<MapDetail>())!.Version);
    }

    // ---------- Deleting ----------

    [Fact]
    public async Task Deleting_a_map_takes_its_pins_and_objects_and_deleting_the_universe_sweeps_every_maps_objects()
    {
        var (client, universe) = await SignedInWithUniverse(_api, "mapdelete");
        var u = universe.Id;
        var map = await CreateMap(client, u, "Doomed");
        var city = await CreateEntity(client, u, "Somewhere");
        await AddPin(client, u, map.Id, "Somewhere", 0.1, 0.1, city);
        var kept = await CreateMap(client, u, "Kept");

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Map(u, map.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Map(u, map.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Map(u, map.Id))).StatusCode);
        Assert.DoesNotContain(_api.Media.Keys, key => key.Contains($"/maps/{map.Id:D}/", StringComparison.Ordinal));
        Assert.Empty((await client.GetFromJsonAsync<List<EntityMapPin>>($"/api/universes/{u}/entities/{city}/map-pins"))!);
        await WithDb(_api, async db => Assert.Equal(0, await db.MapPins.CountAsync(pin => pin.MapId == map.Id)));

        (await client.PostAsync($"/api/universes/{u}/archive", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{u}")).StatusCode);
        Assert.DoesNotContain(_api.Media.Keys, key => key.Contains($"/maps/{kept.Id:D}/", StringComparison.Ordinal));
    }

    // ---------- Helpers ----------

    private static async Task<T> WithDbReturning<T>(LorexApiFactory factory, Func<LorexDbContext, Task<T>> read)
    {
        using var scope = factory.Services.CreateScope();
        return await read(scope.ServiceProvider.GetRequiredService<LorexDbContext>());
    }
}
