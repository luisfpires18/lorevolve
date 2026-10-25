using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lorex.Api.Data;
using Lorex.Api.Features.Maps;
using Lorex.Api.Features.Reading;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Lorex.Api.Features.Mcp;

/// <summary>
/// The MCP geography tools (issue #53, ADR 0061): the universe's maps, where an entry is pinned, pins found by name, and the
/// straight-line separation of two pins - every one a call into <see cref="MapGeography"/>, the same reader the built-in
/// assistant uses. Read-only; nothing here places, moves or calibrates anything.
///
/// <para>A location is a pin someone placed, never a guess from a name or a picture. A distance exists only when both pins
/// are on one map whose creator recorded a scale on the picture it shows; otherwise the result says what is missing. The
/// universe is the caller's, set by the gate from the token; an id from elsewhere is not found.</para>
/// </summary>
[McpServerToolType]
public sealed class LorexMcpMapTools(LorexDbContext db, McpCaller caller, McpSite site)
{
    public const string ListTool = "list_maps";
    public const string SearchTool = "search_map_locations";
    public const string LocateTool = "get_map_location";
    public const string MeasureTool = "measure_map_distance";

    /// <summary>Longer than any entry name or alias Lorex stores: anything past it names nothing.</summary>
    private const int NameLength = 200;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    [McpServerTool(Name = ListTool, Title = "List the universe's maps", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("The maps of the connected universe: each with its id, name, description, picture size in pixels, how many pins it holds, "
        + "and its scale when the creator recorded one (a distance between two points in the creator's own unit). A map without a scale "
        + "can locate places but not measure distances.")]
    public async Task<CallToolResult> ListMapsAsync(CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        var maps = await MapGeography.ListMapsAsync(db, caller.UniverseId, cancellationToken);
        return Result(new
        {
            maps = maps.Select(map => new
            {
                map.Id,
                map.Name,
                map.Description,
                map.Width,
                map.Height,
                map.PinCount,
                calibrated = map.Scale is not null,
                scale = map.Scale is null ? null : new { map.Scale.Distance, map.Scale.Unit, map.Scale.UnitsPerPixel },
                url = $"{site.Base}{MapGeography.FocusPath(caller.UniverseId, map.Id)}",
            }),
            note = maps.Count == 0 ? "This universe has no maps." : null,
        });
    }

    [McpServerTool(Name = SearchTool, Title = "Find places on the maps", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Find pins on the universe's maps whose title, or whose lore entry's name or alias, contains the words given. Returns every "
        + "match, up to 20, each with its map, position as fractions of the picture, the entry it stands for and a link that opens the map "
        + "on the pin. Several matches mean several recorded places: ask which is meant rather than choosing. Nothing is inferred from a "
        + "name that matches no pin.")]
    public async Task<CallToolResult> SearchMapLocationsAsync(
        [Description("A name or part of one.")] string query,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (string.IsNullOrWhiteSpace(query) || query.Length > NameLength)
        {
            return Error("bad_arguments", "Give a name, or part of one, to look for.");
        }

        var found = await MapGeography.SearchLocationsAsync(db, caller.UniverseId, query, cancellationToken);
        return Result(new
        {
            locations = found.Select(Location),
            note = found.Count == 0 ? "No pin on any map of this universe matches. Nothing is recorded about where this is."
                : found.Count >= MapGeography.SearchLimit ? "Only the first 20 matches are listed; narrow the words." : null,
        });
    }

    [McpServerTool(Name = LocateTool, Title = "Where a lore entry is on the maps", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Every map one lore entry is pinned on, by the entry's id or its exact name or alias (an ambiguous name is refused with the "
        + "candidates). To locate something named by its role - a kingdom's capital - find the entry first through recorded relationships "
        + "and fields, then call this with its id. An entry on no map is reported as such; one on several maps lists each, and no map is "
        + "preferred. Each pin carries a link that opens its map on it.")]
    public async Task<CallToolResult> GetMapLocationAsync(
        [Description("The lore entry: its id, or its exact name or alias.")] string lore,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        var (loreId, resolveFailure) = await ResolveLoreAsync(lore, cancellationToken);
        if (loreId is not { } id)
        {
            return resolveFailure!;
        }

        var located = await MapGeography.LocateAsync(db, caller.UniverseId, id, cancellationToken);
        if (located is null)
        {
            return NotFound();
        }

        return Result(new
        {
            lore = new { located.Lore.Id, located.Lore.Name, type = located.Lore.TypeName },
            locations = located.Pins.Select(Location),
            note = located.Pins.Count switch
            {
                0 => $"{located.Lore.Name} is pinned on no map. LoreX records no location for it.",
                1 => null,
                _ => $"{located.Lore.Name} is pinned on {located.Pins.Count} maps; say which map is meant before measuring anything.",
            },
        });
    }

    [McpServerTool(Name = MeasureTool, Title = "Distance between two pins", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("The straight-line separation of two pins, by their pin ids. A distance in the creator's unit is given only when both pins "
        + "are on the same map, both positions are confirmed on the picture it shows, and the creator recorded a scale on that picture; "
        + "then it is approximate, straight-line, on the picture - never a route, a travel time or a real-world distance. Otherwise the "
        + "result says what is missing (no scale, different maps, an unconfirmed position) and gives the picture's own geometry where it "
        + "can. Never estimate a distance yourself.")]
    public async Task<CallToolResult> MeasureMapDistanceAsync(
        [Description("The first pin's id, as a location result gave it.")] string fromPinId,
        [Description("The second pin's id.")] string toPinId,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (!Guid.TryParse(fromPinId, out var from) || !Guid.TryParse(toPinId, out var to))
        {
            return NotFound();
        }

        if (from == to)
        {
            return Error("bad_arguments", "Give two different pins.");
        }

        var reading = await MapGeography.MeasureAsync(db, caller.UniverseId, from, to, cancellationToken);
        return reading is null ? NotFound() : Result(Distance(reading));
    }

    // ---------- Resolving ----------

    /// <summary>
    /// A live entry of this universe by id, or by its exact name or alias (case folded); a name two live entries answer to
    /// is refused with the candidates, never guessed.
    /// </summary>
    private async Task<(Guid? LoreId, CallToolResult? Refused)> ResolveLoreAsync(string? text, CancellationToken cancellationToken)
    {
        var wanted = text?.Trim();
        if (string.IsNullOrEmpty(wanted))
        {
            return (null, Error("bad_arguments", "Give the lore entry's id, or its exact name or alias."));
        }

        if (Guid.TryParse(wanted, out var id))
        {
            return (id, null);
        }

        if (wanted.Length > NameLength)
        {
            return (null, NotFound());
        }

        var folded = wanted.ToLowerInvariant();
#pragma warning disable CA1862 // ToLower() is what EF Core translates to SQLite's lower(); a StringComparison overload is not translated.
        var matches = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == caller.UniverseId
                && entity.DeletedAt == null
                && (entity.Name.ToLower() == folded || entity.Aliases.Any(alias => alias.Value.ToLower() == folded)))
            .OrderBy(entity => entity.Name)
            .ThenBy(entity => entity.Id)
            .Select(entity => new { entity.Id, entity.Name, Type = entity.EntityType!.Name })
            .Take(11)
            .ToListAsync(cancellationToken);
#pragma warning restore CA1862

        return matches.Count switch
        {
            0 => (null, Error("not_found", "No live lore entry has that name or alias in this universe. Try search_universe or search_map_locations.")),
            1 => (matches[0].Id, null),
            _ => (null, Error(
                "ambiguous",
                $"'{wanted}' names more than one lore entry. Call again with one of their ids.",
                new { candidates = matches.Take(10).Select(match => new { id = match.Id, name = match.Name, type = match.Type }) })),
        };
    }

    // ---------- Shaping ----------

    private object Location(LocationReading pin) => new
    {
        pinId = pin.PinId,
        pin.Title,
        pin.Note,
        pin.MapId,
        pin.MapName,
        position = new { pin.X, pin.Y, basis = "fractions of the map picture's width and height, from its top-left corner" },
        lore = pin.Lore is null ? null : new { pin.Lore.Id, pin.Lore.Name, type = pin.Lore.TypeName },
        pin.PositionConfirmed,
        url = $"{site.Base}{pin.Path}",
    };

    private object Distance(DistanceReading reading) => new
    {
        status = reading.Status,
        reading.Method,
        from = Location(reading.From),
        to = Location(reading.To),
        map = reading.MapId is null ? null : new { id = reading.MapId, name = reading.MapName, assetId = reading.AssetId },
        reading.PixelDistance,
        reading.DiagonalFraction,
        reading.Distance,
        reading.Unit,
        calibration = reading.Scale is null ? null : new { reading.Scale.Distance, reading.Scale.Unit, reading.Scale.UnitsPerPixel, reading.Scale.UpdatedAt, assetId = reading.Scale.AssetId },
        reading.Note,
    };

    private CallToolResult? Guard() => caller.IsAllowed ? null : Error("not_allowed", "This connection cannot read a universe.");

    private static CallToolResult NotFound() => Error("not_found", "Nothing with that id is in this universe.");

    private static CallToolResult Result<T>(T value) => new()
    {
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(value, Json) }],
    };

    private static CallToolResult Error(string code, string message, object? details = null) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(new { error = code, message, details }, Json) }],
    };
}
