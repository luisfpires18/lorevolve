using System.Net;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Assistant;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Maps;
using LorEvolve.Api.Features.Relationships;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.MapTestClient;
using static LorEvolve.Api.Tests.McpTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.ScriptedAssistantProvider;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A shared universe with two maps: "The Known World" (1000 by 500), calibrated at half a league a pixel, pinning the capital
/// Arkazia at (0.2, 0.5), the Sylvara Jungle at (0.5, 0.9) and an annotation; and "The North" (400 by 400), uncalibrated,
/// pinning Arkazia again. A kingdom whose recorded relationship names Arkazia as its capital, an entry pinned nowhere, two
/// entries sharing an alias, and a Viewer's MCP connection. The assistant runs on a scripted model. Made once for the class.
/// </summary>
public sealed class MapGeographyFixture : IAsyncLifetime
{
    public MapGeographyFixture() => Api = new LorEvolveApiFactory { Assistant = Model };

    public LorEvolveApiFactory Api { get; }

    public ScriptedAssistantProvider Model { get; } = new();

    internal SharedWorld World { get; private set; } = null!;

    internal Connection Viewer { get; private set; } = null!;

    public Guid WorldMap { get; private set; }

    public Guid NorthMap { get; private set; }

    public Guid Kingdom { get; private set; }

    public Guid Capital { get; private set; }

    public Guid Jungle { get; private set; }

    public Guid Unpinned { get; private set; }

    public Guid CapitalPin { get; private set; }

    public Guid CapitalNorthPin { get; private set; }

    public Guid JunglePin { get; private set; }

    public Guid DragonsPin { get; private set; }

    public Guid NorthPin { get; private set; }

    public async Task InitializeAsync()
    {
        World = await NewSharedWorld(Api, "geo");
        Viewer = await Connect(Api, await SignIn(Api, "user-geo-viewer"), World.U);
        var owner = World.Owner;
        var u = World.U;

        Kingdom = await CreateEntity(owner, u, "Arkazia Kingdom");
        Capital = await CreateEntity(owner, u, "Arkazia");
        Jungle = await CreateEntity(owner, u, "Sylvara Jungle");
        Unpinned = await CreateEntity(owner, u, "Nowhere Keep");
        await CreateAliased(owner, u, "Ash Ember", "Ember");
        await CreateAliased(owner, u, "Dusk Ember", "Ember");

        var kind = await PostJson<RelationshipTypeResponse>(owner, $"/api/universes/{u}/relationship-types", new RelationshipTypeRequest("Has capital", "Capital of", false, null, null));
        await PostJson<RelationshipDetail>(owner, $"/api/universes/{u}/relationships", new RelationshipRequest(kind.Id, Kingdom, Capital, CanonStatus.Canon, null, null, null));

        WorldMap = (await CreateMap(owner, u, "The Known World", RestoreTestClient.Png(1000, 500, 21))).Id;
        CapitalPin = (await AddPin(owner, u, WorldMap, "Arkazia", 0.2, 0.5, Capital, "The capital, on the river.")).Id;
        JunglePin = (await AddPin(owner, u, WorldMap, "Sylvara Jungle", 0.5, 0.9, Jungle)).Id;
        DragonsPin = (await AddPin(owner, u, WorldMap, "Here be dragons", 0.95, 0.05)).Id;

        // Two points 800 pixels apart, 400 leagues between them: half a league a pixel.
        (await owner.PutAsJsonAsync($"{Map(u, WorldMap)}/calibration", new MapCalibrationRequest(0.1, 0.5, 0.9, 0.5, 400, "leagues"))).EnsureSuccessStatusCode();

        NorthMap = (await CreateMap(owner, u, "The North", RestoreTestClient.Png(400, 400, 22))).Id;
        CapitalNorthPin = (await AddPin(owner, u, NorthMap, "Arkazia (north chart)", 0.5, 0.5, Capital)).Id;
        NorthPin = (await AddPin(owner, u, NorthMap, "Frostgate", 0.5, 1.0)).Id;
    }

    public Task DisposeAsync()
    {
        Api.Dispose();
        return Task.CompletedTask;
    }

    private async Task CreateAliased(HttpClient client, Guid u, string name, string alias)
    {
        var response = await client.PostAsJsonAsync($"/api/universes/{u}/entities", new EntityRequest(World.CharacterType, name, null, CanonStatus.Canon, [alias], null, null));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }
}

/// <summary>
/// Map geography (issue #53, ADR 0061): a calibration validated and read, a distance measured only on one calibrated map with
/// confirmed pins and refused with its reason otherwise, locations that are recorded pins and nothing more, the same reading
/// through the assistant and through MCP, read-only tools, and the usual walls - roles, the Trash, another universe.
/// </summary>
public sealed class MapGeographyTests(MapGeographyFixture fixture) : IClassFixture<MapGeographyFixture>
{
    private LorEvolveApiFactory Api => fixture.Api;

    private SharedWorld W => fixture.World;

    /// <summary>The capital at (200, 250) and the jungle at (500, 450) on a 1000 by 500 picture: 360.555 pixels, 180.3 leagues.</summary>
    private const double CapitalToJunglePixels = 360.5551275463989;

    // ---------- Calibration ----------

    [Fact]
    public async Task A_calibration_is_validated_kept_in_the_creators_unit_read_with_the_map_and_removable()
    {
        var (client, universe) = await SignedInWithUniverse(Api, "geocal");
        var u = universe.Id;
        var map = await CreateMap(client, u, "Calibrated", RestoreTestClient.Png(800, 600, 23));
        var route = $"{Map(u, map.Id)}/calibration";

        async Task Refused(MapCalibrationRequest request, string field)
        {
            var response = await client.PutAsJsonAsync(route, request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains(field, await PublishingTestClient.ErrorKeys(response));
        }

        await Refused(new MapCalibrationRequest(1.5, 0.5, 0.9, 0.5, 100, "km"), "x1");
        await Refused(new MapCalibrationRequest(0.1, -0.1, 0.9, 0.5, 100, "km"), "y1");
        await Refused(new MapCalibrationRequest(0.1, 0.5, null, 0.5, 100, "km"), "x2");
        await Refused(new MapCalibrationRequest(0.5, 0.5, 0.5, 0.5, 100, "km"), "x2");
        await Refused(new MapCalibrationRequest(0.5, 0.5, 0.5005, 0.5, 100, "km"), "x2");
        await Refused(new MapCalibrationRequest(0.1, 0.5, 0.9, 0.5, 0, "km"), "distance");
        await Refused(new MapCalibrationRequest(0.1, 0.5, 0.9, 0.5, -3, "km"), "distance");
        await Refused(new MapCalibrationRequest(0.1, 0.5, 0.9, 0.5, 100, "  "), "unit");
        await Refused(new MapCalibrationRequest(0.1, 0.5, 0.9, 0.5, 100, new string('u', MapCalibrationLimits.UnitMaxLength + 1)), "unit");
        await Refused(new MapCalibrationRequest(0.1, 0.5, 0.9, 0.5, 100, "km\u0007"), "unit");
        Assert.Null((await ReadMap(client, u, map.Id)).Calibration);

        // 640 pixels for 32 days' ride: a twentieth of a day a pixel, in the creator's own word, never converted.
        var saved = await client.PutAsJsonAsync(route, new MapCalibrationRequest(0.1, 0.25, 0.9, 0.25, 32, "  days' ride "));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var calibration = (await saved.Content.ReadFromJsonAsync<MapCalibrationResponse>())!;
        Assert.Equal(("days' ride", 32d, map.Image.AssetId), (calibration.Unit, calibration.Distance, calibration.AssetId));
        Assert.Equal(0.05, calibration.UnitsPerPixel, 10);

        var detail = await ReadMap(client, u, map.Id);
        Assert.Equal(calibration, detail.Calibration);

        // Saved again, it replaces; removed, it is gone; removing again is still gone.
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(route, new MapCalibrationRequest(0, 0, 1, 1, 1000, "km"))).StatusCode);
        Assert.Equal("km", (await ReadMap(client, u, map.Id)).Calibration!.Unit);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(route)).StatusCode);
        Assert.Null((await ReadMap(client, u, map.Id)).Calibration);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(route)).StatusCode);
    }

    [Fact]
    public async Task Replacing_the_picture_drops_the_calibration_and_the_distance_with_it()
    {
        var (client, universe) = await SignedInWithUniverse(Api, "geostale");
        var u = universe.Id;
        var map = await CreateMap(client, u, "Replaced", RestoreTestClient.Png(1000, 500, 24));
        var a = await AddPin(client, u, map.Id, "A", 0.1, 0.5);
        var b = await AddPin(client, u, map.Id, "B", 0.9, 0.5);
        (await client.PutAsJsonAsync($"{Map(u, map.Id)}/calibration", new MapCalibrationRequest(0.1, 0.5, 0.9, 0.5, 80, "km"))).EnsureSuccessStatusCode();

        await WithDb(Api, async db =>
        {
            var measured = (await MapGeography.MeasureAsync(db, u, a.Id, b.Id, CancellationToken.None))!;
            Assert.Equal((DistanceStatus.Measured, 80d, "km", 800d), (measured.Status, measured.Distance, measured.Unit, measured.PixelDistance));
        });

        // The picture replaced, the pins kept: the scale is gone and the positions wait, so nothing is measured.
        (await client.PutAsync($"{Map(u, map.Id)}/image", ReplaceForm(RestoreTestClient.Png(1000, 500, 25), "keep"))).EnsureSuccessStatusCode();
        Assert.Null((await ReadMap(client, u, map.Id)).Calibration);
        await WithDb(Api, async db =>
        {
            var reading = (await MapGeography.MeasureAsync(db, u, a.Id, b.Id, CancellationToken.None))!;
            Assert.Equal(DistanceStatus.PositionUnconfirmed, reading.Status);
            Assert.Null(reading.Distance);
            Assert.Equal(0, await db.MapCalibrations.CountAsync(calibration => calibration.MapId == map.Id));
        });

        // Both pins confirmed: still no scale, so only the picture's own geometry.
        (await client.PutAsJsonAsync(Pin(u, map.Id, a.Id), new MapPinRequest("A", null, 0.1, 0.5, null))).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync(Pin(u, map.Id, b.Id), new MapPinRequest("B", null, 0.9, 0.5, null))).EnsureSuccessStatusCode();
        await WithDb(Api, async db =>
        {
            var reading = (await MapGeography.MeasureAsync(db, u, a.Id, b.Id, CancellationToken.None))!;
            Assert.Equal((DistanceStatus.NotCalibrated, 800d), (reading.Status, reading.PixelDistance));
            Assert.Null(reading.Distance);
            Assert.Null(reading.Unit);
            Assert.Contains("no recorded scale", reading.Note, StringComparison.Ordinal);
        });
    }

    // ---------- Distance ----------

    [Fact]
    public async Task A_distance_is_the_straight_line_in_the_pictures_pixels_scaled_by_the_calibration_and_rounded_honestly()
    {
        await WithDb(Api, async db =>
        {
            var reading = (await MapGeography.MeasureAsync(db, W.U, fixture.CapitalPin, fixture.JunglePin, CancellationToken.None))!;
            Assert.Equal(DistanceStatus.Measured, reading.Status);
            Assert.Equal(Math.Round(CapitalToJunglePixels, 3), reading.PixelDistance);
            Assert.Equal(180d, reading.Distance);
            Assert.Equal("leagues", reading.Unit);
            Assert.Equal(0.5, reading.Scale!.UnitsPerPixel, 10);
            Assert.Equal(fixture.WorldMap, reading.MapId);
            Assert.Contains("Straight line", reading.Method, StringComparison.Ordinal);
            Assert.Contains("About 180 leagues", reading.Note, StringComparison.Ordinal);
            Assert.EndsWith($"/maps/{fixture.WorldMap:D}?pin={fixture.CapitalPin:D}", reading.From.Path, StringComparison.Ordinal);

            // The same either way round.
            var back = (await MapGeography.MeasureAsync(db, W.U, fixture.JunglePin, fixture.CapitalPin, CancellationToken.None))!;
            Assert.Equal((reading.Distance, reading.PixelDistance), (back.Distance, back.PixelDistance));

            // Different maps: no numbers at all, and the reason.
            var apart = (await MapGeography.MeasureAsync(db, W.U, fixture.CapitalPin, fixture.NorthPin, CancellationToken.None))!;
            Assert.Equal(DistanceStatus.DifferentMaps, apart.Status);
            Assert.Null(apart.Distance);
            Assert.Null(apart.PixelDistance);
            Assert.Contains("different maps", apart.Note, StringComparison.Ordinal);

            // The uncalibrated map: the picture's geometry only - 200 pixels of 400, never a unit.
            var north = (await MapGeography.MeasureAsync(db, W.U, fixture.CapitalNorthPin, fixture.NorthPin, CancellationToken.None))!;
            Assert.Equal((DistanceStatus.NotCalibrated, 200d), (north.Status, north.PixelDistance));
            Assert.Null(north.Distance);

            // A pin that is not here, or of another universe, is nothing.
            Assert.Null(await MapGeography.MeasureAsync(db, W.U, fixture.CapitalPin, Guid.NewGuid(), CancellationToken.None));
            Assert.Null(await MapGeography.MeasureAsync(db, Guid.NewGuid(), fixture.CapitalPin, fixture.JunglePin, CancellationToken.None));
        });

        // Rounding: whole units above a hundred, tenths above ten, hundredths below.
        Assert.Equal(180d, MapGeography.Approximate(180.2775));
        Assert.Equal(18d, MapGeography.Approximate(18.02775));
        Assert.Equal(1.8, MapGeography.Approximate(1.802775));
        Assert.Equal(0.18, MapGeography.Approximate(0.1802775));
        Assert.Equal(0.02, MapGeography.Approximate(0.018));
        Assert.Equal(12346d, MapGeography.Approximate(12345.678));
    }

    // ---------- Locations ----------

    [Fact]
    public async Task Locations_are_recorded_pins_only_every_map_named_and_none_said_plainly()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        // By id and by exact name alike: both maps, by map name, each with a link opening the map on the pin.
        foreach (var lore in new[] { fixture.Capital.ToString(), "arkazia" })
        {
            var located = await Call(client, "get_map_location", new() { ["lore"] = lore });
            Assert.Equal(fixture.Capital, located.GetProperty("lore").GetProperty("id").GetGuid());
            var locations = located.GetProperty("locations").EnumerateArray().ToList();
            Assert.Equal(["The Known World", "The North"], locations.Select(location => location.GetProperty("mapName").GetString()));
            Assert.Equal(fixture.CapitalPin, locations[0].GetProperty("pinId").GetGuid());
            Assert.Equal((0.2, 0.5), (locations[0].GetProperty("position").GetProperty("x").GetDouble(), locations[0].GetProperty("position").GetProperty("y").GetDouble()));
            Assert.EndsWith($"/app/universes/{W.U:D}/maps/{fixture.WorldMap:D}?pin={fixture.CapitalPin:D}", locations[0].GetProperty("url").GetString(), StringComparison.Ordinal);
            Assert.Contains("2 maps", located.GetProperty("note").GetString(), StringComparison.Ordinal);
        }

        // An entry pinned nowhere says so; nothing is guessed from its name.
        var nowhere = await Call(client, "get_map_location", new() { ["lore"] = fixture.Unpinned.ToString() });
        Assert.Empty(nowhere.GetProperty("locations").EnumerateArray());
        Assert.Contains("pinned on no map", nowhere.GetProperty("note").GetString(), StringComparison.Ordinal);

        // A search finds by the pin's title and by the entry's name; a name nothing matches finds nothing.
        var byTitle = await Call(client, "search_map_locations", new() { ["query"] = "dragons" });
        Assert.Equal(fixture.DragonsPin, Assert.Single(byTitle.GetProperty("locations").EnumerateArray()).GetProperty("pinId").GetGuid());
        Assert.False(Assert.Single(byTitle.GetProperty("locations").EnumerateArray()).TryGetProperty("lore", out _));
        var byName = await Call(client, "search_map_locations", new() { ["query"] = "ARKAZ" });
        Assert.Equal(2, byName.GetProperty("locations").GetArrayLength());
        var none = await Call(client, "search_map_locations", new() { ["query"] = "Atlantis" });
        Assert.Empty(none.GetProperty("locations").EnumerateArray());
        Assert.Contains("Nothing is recorded", none.GetProperty("note").GetString(), StringComparison.Ordinal);

        // Ambiguous, trashed, foreign and nowhere are refused, never resolved.
        var ambiguous = await Refused(client, "get_map_location", new() { ["lore"] = "Ember" }, "ambiguous");
        Assert.Equal(2, ambiguous.GetProperty("details").GetProperty("candidates").GetArrayLength());
        await Refused(client, "get_map_location", new() { ["lore"] = W.Trash.Entry.ToString() }, "not_found");
        await Refused(client, "get_map_location", new() { ["lore"] = Guid.NewGuid().ToString() }, "not_found");
        await Refused(client, "get_map_location", new() { ["lore"] = " " }, "bad_arguments");
        await Refused(client, "search_map_locations", new() { ["query"] = "" }, "bad_arguments");

        // The maps, with their scales.
        var maps = await Call(client, "list_maps", new());
        var listed = maps.GetProperty("maps").EnumerateArray().ToList();
        Assert.Equal(["The Known World", "The North"], listed.Select(map => map.GetProperty("name").GetString()));
        Assert.True(listed[0].GetProperty("calibrated").GetBoolean());
        Assert.Equal("leagues", listed[0].GetProperty("scale").GetProperty("unit").GetString());
        Assert.False(listed[1].GetProperty("calibrated").GetBoolean());
        Assert.Equal(3, listed[0].GetProperty("pinCount").GetInt32());
    }

    [Fact]
    public async Task A_pin_whose_entry_went_to_the_Trash_locates_nothing_and_reads_as_a_pin_without_an_entry()
    {
        var (client, universe) = await SignedInWithUniverse(Api, "geotrash");
        var u = universe.Id;
        var map = await CreateMap(client, u, "Bin", RestoreTestClient.Png(200, 200, 26));
        var fort = await CreateEntity(client, u, "Fort Ash");
        var pin = await AddPin(client, u, map.Id, "Fort Ash", 0.5, 0.5, fort);
        (await client.DeleteAsync($"/api/universes/{u}/entities/{fort}")).EnsureSuccessStatusCode();

        await WithDb(Api, async db =>
        {
            Assert.Null(await MapGeography.LocateAsync(db, u, fort, CancellationToken.None));
            var found = Assert.Single(await MapGeography.SearchLocationsAsync(db, u, "Fort", CancellationToken.None));
            Assert.Equal(pin.Id, found.PinId);
            Assert.Null(found.Lore);
            Assert.Empty(await MapGeography.SearchLocationsAsync(db, Guid.NewGuid(), "Fort", CancellationToken.None));
        });
    }

    // ---------- Two transports, one reader ----------

    [Fact]
    public async Task The_assistant_locates_a_capital_through_its_recorded_relationship_and_measures_the_same_distance_MCP_gives()
    {
        fixture.Model.Use(step => step.Number switch
        {
            1 => Calls((AssistantTools.GetRelationships, new { id = fixture.Kingdom })),
            2 => Calls((AssistantTools.GetMapLocation, new { lore_id = fixture.Capital })),
            3 => Calls((AssistantTools.MeasureMapDistance, new { from_pin_id = fixture.CapitalPin, to_pin_id = fixture.JunglePin })),
            _ => Answer(("recorded", "Arkazia, the kingdom's capital, is on The Known World, about 180 leagues from the Sylvara Jungle in a straight line.",
                [fixture.CapitalPin.ToString(), fixture.JunglePin.ToString(), fixture.WorldMap.ToString(), Guid.NewGuid().ToString()])),
        });

        var response = await W.Viewer.PostAsJsonAsync($"/api/universes/{W.U}/assistant", new AssistantRequest("Where is Arkazia Kingdom's capital, and how far is it from the Sylvara Jungle?", null));
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var answer = (await response.Content.ReadFromJsonAsync<AssistantAnswer>())!;

        var segment = Assert.Single(answer.Segments);
        Assert.Equal(AssistantSegmentKind.Recorded, segment.Kind);
        // The invented id is not a source; the pins and the map, read this question, are.
        Assert.Equal([fixture.CapitalPin, fixture.JunglePin, fixture.WorldMap], segment.SourceIds);
        Assert.Contains(answer.Sources, source => source.Kind == AssistantSourceKind.MapPin && source.Id == fixture.CapitalPin && source.Title == "Arkazia" && source.StoryId == fixture.WorldMap);
        Assert.Contains(answer.Sources, source => source.Kind == AssistantSourceKind.Map && source.Id == fixture.WorldMap && source.Title == "The Known World");

        // What the model was handed: the relationship names the capital, the location names two maps, the distance is the reader's.
        var seen = fixture.Model.ResultsSeen();
        Assert.Equal(fixture.Capital, Assert.Single(seen[0].GetProperty("relationships").EnumerateArray()).GetProperty("related").GetProperty("id").GetGuid());
        Assert.Equal(2, seen[1].GetProperty("pins").GetArrayLength());
        var measured = seen[2];
        Assert.Equal("Measured", measured.GetProperty("status").GetString());
        Assert.Equal(180d, measured.GetProperty("distance").GetDouble());
        Assert.Equal("leagues", measured.GetProperty("unit").GetString());

        // MCP, same pins: the same numbers, the same words, from the same reader.
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);
        var mcp = await Call(client, "measure_map_distance", new() { ["fromPinId"] = fixture.CapitalPin.ToString(), ["toPinId"] = fixture.JunglePin.ToString() });
        Assert.Equal("Measured", mcp.GetProperty("status").GetString());
        Assert.Equal(measured.GetProperty("distance").GetDouble(), mcp.GetProperty("distance").GetDouble());
        Assert.Equal(measured.GetProperty("pixelDistance").GetDouble(), mcp.GetProperty("pixelDistance").GetDouble());
        Assert.Equal(measured.GetProperty("unit").GetString(), mcp.GetProperty("unit").GetString());
        Assert.Equal(measured.GetProperty("note").GetString(), mcp.GetProperty("note").GetString());
        Assert.Equal(measured.GetProperty("method").GetString(), mcp.GetProperty("method").GetString());
        Assert.EndsWith($"?pin={fixture.CapitalPin:D}", mcp.GetProperty("from").GetProperty("url").GetString(), StringComparison.Ordinal);

        // And where a distance cannot be given, both say why in the same words.
        fixture.Model.Use(step => step.Number == 1
            ? Calls((AssistantTools.MeasureMapDistance, new { from_pin_id = fixture.CapitalPin, to_pin_id = fixture.NorthPin }))
            : Answer(("note", "They are on different maps.", [])));
        (await W.Viewer.PostAsJsonAsync($"/api/universes/{W.U}/assistant", new AssistantRequest("How far from Arkazia to Frostgate?", null))).EnsureSuccessStatusCode();
        var apart = fixture.Model.ResultsSeen()[0];
        var mcpApart = await Call(client, "measure_map_distance", new() { ["fromPinId"] = fixture.CapitalPin.ToString(), ["toPinId"] = fixture.NorthPin.ToString() });
        Assert.Equal("DifferentMaps", apart.GetProperty("status").GetString());
        Assert.Equal(apart.GetProperty("note").GetString(), mcpApart.GetProperty("note").GetString());
        Assert.False(apart.TryGetProperty("distance", out _));
        Assert.False(mcpApart.TryGetProperty("distance", out _));
    }

    [Fact]
    public async Task The_assistant_refuses_bad_pin_ids_and_the_same_pin_twice()
    {
        fixture.Model.Use(step => step.Number switch
        {
            1 => Calls(
                (AssistantTools.MeasureMapDistance, new { from_pin_id = fixture.CapitalPin, to_pin_id = fixture.CapitalPin }),
                (AssistantTools.MeasureMapDistance, new { from_pin_id = "nope", to_pin_id = fixture.CapitalPin }),
                (AssistantTools.GetMapLocation, new { lore_id = W.Trash.Entry }),
                (AssistantTools.SearchMapLocations, new { query = "" })),
            _ => Answer(("note", "Nothing to say.", [])),
        });
        (await W.Owner.PostAsJsonAsync($"/api/universes/{W.U}/assistant", new AssistantRequest("Measure nothing", null))).EnsureSuccessStatusCode();
        var seen = fixture.Model.ResultsSeen();
        Assert.Equal(["bad_arguments", "not_found", "not_found", "bad_arguments"], seen.Select(result => result.GetProperty("error").GetString()));
    }

    // ---------- Read-only, and the walls ----------

    [Fact]
    public async Task The_map_tools_are_read_only_every_member_reads_them_and_an_outsider_or_Viewer_changes_nothing()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);
        var tools = await client.ListToolsAsync();
        foreach (var name in new[] { "list_maps", "search_map_locations", "get_map_location", "measure_map_distance" })
        {
            var tool = Assert.Single(tools, candidate => candidate.Name == name);
            Assert.True(tool.ProtocolTool.Annotations?.ReadOnlyHint, $"{name} is not marked read-only.");
            Assert.False(tool.ProtocolTool.Annotations?.DestructiveHint ?? false, $"{name} is marked destructive.");
        }

        Assert.DoesNotContain(tools, tool => tool.Name.Contains("calibrat", StringComparison.OrdinalIgnoreCase) || tool.Name.Contains("pin", StringComparison.OrdinalIgnoreCase) && tool.Name.StartsWith("set", StringComparison.Ordinal));

        foreach (var who in Members)
        {
            var connection = await Connect(Api, await SignIn(Api, $"user-geo-{who.ToString().ToLowerInvariant()}"), W.U);
            await using var member = await SdkClient(Api, W.U, connection.AccessToken);
            var located = await Call(member, "get_map_location", new() { ["lore"] = fixture.Capital.ToString() });
            Assert.Equal(2, located.GetProperty("locations").GetArrayLength());
        }

        // Setting or removing a scale is an Editor's; a Viewer and a Reviewer are refused, an outsider told nothing.
        var route = $"{Map(W.U, fixture.WorldMap)}/calibration";
        Assert.Equal(HttpStatusCode.Forbidden, (await W.Viewer.PutAsJsonAsync(route, new MapCalibrationRequest(0, 0, 1, 1, 10, "km"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await W.Reviewer.DeleteAsync(route)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await W.Outsider.PutAsJsonAsync(route, new MapCalibrationRequest(0, 0, 1, 1, 10, "km"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await W.Outsider.DeleteAsync(route)).StatusCode);
        Assert.Equal("leagues", (await ReadMap(W.Viewer, W.U, fixture.WorldMap)).Calibration!.Unit);

        // An MCP connection to another universe reads nothing of this one's pins.
        var elsewhere = (await CreateUniverse(W.Owner, "Elsewhere geo")).Id;
        var foreign = await Connect(Api, await SignIn(Api, "user-geo-owner"), elsewhere);
        await using var other = await SdkClient(Api, elsewhere, foreign.AccessToken);
        await Refused(other, "get_map_location", new() { ["lore"] = fixture.Capital.ToString() }, "not_found");
        await Refused(other, "measure_map_distance", new() { ["fromPinId"] = fixture.CapitalPin.ToString(), ["toPinId"] = fixture.JunglePin.ToString() }, "not_found");
        Assert.Empty((await Call(other, "list_maps", new())).GetProperty("maps").EnumerateArray());
    }

    // ---------- Helpers ----------

    private static async Task<JsonElement> Call(McpClient client, string tool, Dictionary<string, object?> arguments)
    {
        var result = await client.CallToolAsync(tool, arguments);
        Assert.False(result.IsError ?? false, Text(result));
        using var json = JsonDocument.Parse(Text(result));
        return json.RootElement.Clone();
    }

    private static async Task<JsonElement> Refused(McpClient client, string tool, Dictionary<string, object?> arguments, string code)
    {
        var result = await client.CallToolAsync(tool, arguments);
        Assert.True(result.IsError, $"{tool} was not refused: {Text(result)}");
        using var json = JsonDocument.Parse(Text(result));
        Assert.Equal(code, json.RootElement.GetProperty("error").GetString());
        return json.RootElement.Clone();
    }

    private static string Text(CallToolResult result) => result.Content.OfType<TextContentBlock>().Last().Text;
}
