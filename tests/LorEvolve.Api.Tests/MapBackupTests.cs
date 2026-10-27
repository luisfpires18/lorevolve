using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Maps;
using LorEvolve.Api.Features.Restore;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using static LorEvolve.Api.Tests.MapTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Maps in a backup (format version 34, ADR 0014 amendment): every map travels with its original and its pins, a restore
/// puts them back under new ids pointing at the restored entries with a pin's review state kept, a file from before maps
/// restores none, and a file that points a pin at an entry it does not hold is refused.
/// </summary>
public sealed class MapBackupTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _api = factory;

    [Fact]
    public async Task A_backup_carries_every_map_with_its_original_and_pins_and_a_restore_puts_them_back_under_new_ids()
    {
        var client = await SignedIn(_api, "mapbackup");
        var universe = await CreateUniverse(client, "Mapped world");
        var u = universe.Id;
        var capital = await CreateEntity(client, u, "Arkazia");
        var png = Png(640, 400, 11);
        var map = await CreateMap(client, u, "The Known World", png, "Every road.");
        var linked = await AddPin(client, u, map.Id, "Arkazia", 0.25, 0.5, capital, "The capital.");
        await AddPin(client, u, map.Id, "Here be dragons", 0.9, 0.1);

        // A second map whose picture was replaced with the pins kept: one pin still waits for review.
        (await client.PutAsJsonAsync($"{Map(u, map.Id)}/calibration", new MapCalibrationRequest(0.1, 0.5, 0.9, 0.5, 400, "leagues"))).EnsureSuccessStatusCode();

        var old = await CreateMap(client, u, "Old chart", Png(300, 300, 12));
        var waiting = await AddPin(client, u, old.Id, "Waiting", 0.5, 0.5);
        (await client.PutAsync($"{Map(u, old.Id)}/image", ReplaceForm(Png(600, 300, 13), "keep"))).EnsureSuccessStatusCode();

        var archive = await RawArchive(client, u);
        var backup = BackupOf(archive);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);
        var maps = backup.Payload.Maps!;
        Assert.Equal(["Old chart", "The Known World"], maps.Select(each => each.Name));

        var known = maps.Single(each => each.Name == "The Known World");
        Assert.Equal(("Every road.", 640, 400, png.Length, "image/png"), (known.Description, known.Image.Width, known.Image.Height, known.Image.ByteSize, known.Image.ContentType));
        Assert.Equal($"media/maps/{map.Id:D}/original.png", known.Image.MediaPath);
        Assert.Equal(["Arkazia", "Here be dragons"], known.Pins.Select(pin => pin.Title));
        Assert.Equal((capital, 0.25, 0.5, "The capital.", true), (known.Pins[0].EntityId, known.Pins[0].X, known.Pins[0].Y, known.Pins[0].Note, known.Pins[0].PlacedOnCurrentImage));
        Assert.False(maps.Single(each => each.Name == "Old chart").Pins.Single().PlacedOnCurrentImage);
        Assert.Equal((0.1, 0.5, 0.9, 0.5, 400d, "leagues"), (known.Calibration!.X1, known.Calibration.Y1, known.Calibration.X2, known.Calibration.Y2, known.Calibration.Distance, known.Calibration.Unit));
        Assert.Null(maps.Single(each => each.Name == "Old chart").Calibration);

        // The originals are in the archive, byte for byte; no display copy, no key, no URL.
        var entries = Entries(archive);
        Assert.Equal(png, entries[known.Image.MediaPath]);
        Assert.DoesNotContain(entries.Keys, path => path.Contains("display", StringComparison.Ordinal));
        Assert.DoesNotContain("universes/", DocumentOf(archive), StringComparison.Ordinal);

        // Restored: new ids throughout, the pins pointing at the restored entry, the review state kept, the display copy fitted again.
        var validated = await Validated(client, archive);
        Assert.Equal((2, 3), (validated.Preview.Counts.Maps, validated.Preview.Counts.MapPins));
        var restored = await Restored(client, validated.Token, "Mapped world restored");
        var restoredMaps = (await client.GetFromJsonAsync<List<MapSummary>>(Maps(restored.Id)))!;
        Assert.Equal(["Old chart", "The Known World"], restoredMaps.Select(each => each.Name));
        var restoredKnown = await ReadMap(client, restored.Id, restoredMaps.Single(each => each.Name == "The Known World").Id);
        Assert.NotEqual(map.Id, restoredKnown.Id);
        Assert.Equal((640, 400), (restoredKnown.Image.Width, restoredKnown.Image.Height));
        var restoredPin = restoredKnown.Pins.Single(pin => pin.Title == "Arkazia");
        Assert.NotEqual(linked.Id, restoredPin.Id);
        Assert.NotEqual(capital, restoredPin.Lore!.Id);
        Assert.Equal("Arkazia", restoredPin.Lore.Name);
        Assert.Equal((0.25, 0.5, true), (restoredPin.X, restoredPin.Y, restoredPin.PlacedOnCurrentImage));
        Assert.Equal(0, restoredKnown.PinsAwaitingReview);
        Assert.Equal(("leagues", 400d, restoredKnown.Image.AssetId), (restoredKnown.Calibration!.Unit, restoredKnown.Calibration.Distance, restoredKnown.Calibration.AssetId));
        // 400 leagues over the 512 pixels between the points of a 640-wide picture.
        Assert.Equal(400d / 512, restoredKnown.Calibration.UnitsPerPixel, 10);

        var restoredOld = await ReadMap(client, restored.Id, restoredMaps.Single(each => each.Name == "Old chart").Id);
        Assert.False(Assert.Single(restoredOld.Pins).PlacedOnCurrentImage);
        Assert.Equal(1, restoredOld.PinsAwaitingReview);
        Assert.NotEqual(waiting.Id, restoredOld.Pins[0].Id);

        var display = _api.Media.Bytes($"universes/{restored.Id:D}/maps/{restoredKnown.Id:D}/{restoredKnown.Image.AssetId:D}/display.webp");
        using var fitted = Image.Load<Rgba32>(display);
        Assert.Equal((640, 400), (fitted.Width, fitted.Height));
        Assert.Equal(png, _api.Media.Bytes($"universes/{restored.Id:D}/maps/{restoredKnown.Id:D}/{restoredKnown.Image.AssetId:D}/original.png"));

        // And the copy exports the same maps, under ids shared with nothing.
        var again = BackupOf(await RawArchive(client, restored.Id));
        Assert.Equal(
            maps.Select(each => (each.Name, each.Image.Width, each.Pins.Count, each.Pins.Select(pin => (pin.Title, pin.X, pin.Y, pin.PlacedOnCurrentImage)).ToList())),
            again.Payload.Maps!.Select(each => (each.Name, each.Image.Width, each.Pins.Count, each.Pins.Select(pin => (pin.Title, pin.X, pin.Y, pin.PlacedOnCurrentImage)).ToList())));
        Assert.Empty(GuidsIn(DocumentOf(archive)).Intersect(GuidsIn(DocumentOf(await RawArchive(client, restored.Id)))));
    }

    [Fact]
    public async Task A_file_from_before_maps_restores_none_and_one_that_lies_about_a_pin_is_refused()
    {
        var client = await SignedIn(_api, "mapbackupold");
        var u = (await CreateUniverse(client, "Charted")).Id;
        var place = await CreateEntity(client, u, "Place");
        var map = await CreateMap(client, u, "Chart", Png(200, 200, 14));
        await AddPin(client, u, map.Id, "Place", 0.5, 0.5, place);
        var archive = await RawArchive(client, u);

        // Version 33 knows no maps: the member is ignored and the picture it names is then an unexpected file.
        var downgraded = Rewrite(Downgrade(archive, 33), files: files => files.Remove($"media/maps/{map.Id:D}/original.png"));
        var restored = await Restored(client, (await Validated(client, downgraded)).Token, "Charted from 33");
        Assert.Empty((await client.GetFromJsonAsync<List<MapSummary>>(Maps(restored.Id)))!);

        // Version 34 knows maps but no scale: the map restores, uncalibrated.
        (await client.PutAsJsonAsync($"{Map(u, map.Id)}/calibration", new MapCalibrationRequest(0, 0, 1, 1, 10, "km"))).EnsureSuccessStatusCode();
        var scaled = await RawArchive(client, u);
        var from34 = await Restored(client, (await Validated(client, Downgrade(scaled, 34))).Token, "Charted from 34");
        var restoredMap = Assert.Single((await client.GetFromJsonAsync<List<MapSummary>>(Maps(from34.Id)))!);
        Assert.Null((await ReadMap(client, from34.Id, restoredMap.Id)).Calibration);

        // A scale whose two points are one point, or whose distance is nothing.
        var onePoint = Rewrite(scaled, document: root => { Payload(root)["maps"]![0]!["calibration"]!["x2"] = 0; Payload(root)["maps"]![0]!["calibration"]!["y2"] = 0; });
        Assert.Contains((await Refused(await Validate(client, onePoint))).Issues, issue => issue.Code == BackupIssueCodes.InvalidValue && issue.Message.Contains("scale", StringComparison.Ordinal));
        var noDistance = Rewrite(scaled, document: root => { Payload(root)["maps"]![0]!["calibration"]!["distance"] = 0; });
        Assert.Contains((await Refused(await Validate(client, noDistance))).Issues, issue => issue.Code == BackupIssueCodes.InvalidValue);

        // A pin standing for an entry the file does not hold.
        var foreignPin = Rewrite(archive, document: root =>
        {
            Payload(root)["maps"]![0]!["pins"]![0]!["entityId"] = Guid.NewGuid().ToString();
        });
        var refused = await Refused(await Validate(client, foreignPin));
        Assert.Contains(refused.Issues, issue => issue.Code == BackupIssueCodes.MissingReference && issue.Message.Contains("pin", StringComparison.Ordinal));

        // A pin off the map.
        var offMap = Rewrite(archive, document: root =>
        {
            Payload(root)["maps"]![0]!["pins"]![0]!["x"] = 1.5;
        });
        Assert.Contains((await Refused(await Validate(client, offMap))).Issues, issue => issue.Code == BackupIssueCodes.InvalidValue);

        // A picture whose stated size is not the picture's: every pin would land somewhere else.
        var wrongSize = Rewrite(archive, document: root =>
        {
            Payload(root)["maps"]![0]!["image"]!["width"] = 999;
        });
        Assert.Contains((await Refused(await Validate(client, wrongSize))).Issues, issue => issue.Code == BackupIssueCodes.InvalidImage);

        // The original missing from the archive.
        var missing = Rewrite(archive, files: files => files.Remove($"media/maps/{map.Id:D}/original.png"));
        Assert.Contains((await Refused(await Validate(client, missing))).Issues, issue => issue.Code == BackupIssueCodes.MissingMedia);
    }
}
