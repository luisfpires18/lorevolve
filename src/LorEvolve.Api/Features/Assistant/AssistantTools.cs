using System.Text.Json;
using System.Text.Json.Serialization;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Maps;
using LorEvolve.Api.Features.Reading;
using LorEvolve.Api.Features.Search;
using LorEvolve.Api.Features.Timeline;

namespace LorEvolve.Api.Features.Assistant;

/// <summary>
/// The only things the model can do: read this universe, through <see cref="UniverseReader"/> (ADR 0045).
///
/// <b>Read-only by construction.</b> Every tool below reads; there is no tool that writes, and a name the model invents is
/// answered with an error, never resolved to anything. Nothing takes SQL, a URL, a path or a route.
///
/// <b>The universe is the request's.</b> An instance is made for one question in one universe the caller may read, and no
/// tool takes a universe. Every id the model sends is parsed and read through that universe, so an id from another
/// universe, from the Trash or from nowhere reads as not found.
///
/// <b>Sources are what was read.</b> Every object a tool returns is remembered with its kind and title as LorEvolve holds them.
/// An answer may cite only those - so a cited id is always real, readable here, and titled by LorEvolve rather than by the model.
/// </summary>
internal sealed class AssistantTools(LorEvolveDbContext db, Guid universeId, AssistantProposing? proposing = null)
{
    public const string SearchUniverse = "search_universe";
    public const string GetLore = "get_lore";
    public const string GetRelationships = "get_relationships";
    public const string GetStory = "get_story";
    public const string GetScene = "get_scene";
    public const string GetTimelineItem = "get_timeline_item";
    public const string BrowseTimeline = "browse_timeline";
    public const string GetUniverseOverview = "get_universe_overview";
    public const string ListMaps = "list_maps";
    public const string SearchMapLocations = "search_map_locations";
    public const string GetMapLocation = "get_map_location";
    public const string MeasureMapDistance = "measure_map_distance";

    private const string IdSchema = """{"type":"object","properties":{"id":{"type":"string","description":"The id exactly as a tool result gave it."}},"required":["id"],"additionalProperties":false}""";

    public static readonly IReadOnlyList<AssistantToolDefinition> Definitions =
    [
        new(
            SearchUniverse,
            "Search this universe's lore entries, stories, chapters, scenes, plot arcs and beats, and scene prose by keywords. "
            + "Every word must appear, so search for one or two distinctive words such as a name, never a whole question. "
            + "Returns up to five matches of each kind, best first.",
            """{"type":"object","properties":{"query":{"type":"string","description":"One or two distinctive words."}},"required":["query"],"additionalProperties":false}"""),
        new(
            GetLore,
            "Read one lore entry: its type, Canon status, summary, aliases, tags, recorded fields, the start of its article, "
            + "the scenes it appears in and the timeline moments it takes part in. Set find to a word or two to also get the "
            + "article's passage around them, wherever they are in it; otherwise null.",
            """{"type":"object","properties":{"id":{"type":"string","description":"The id exactly as a tool result gave it."},"find":{"type":["string","null"],"description":"Words to find in the article, or null."}},"required":["id","find"],"additionalProperties":false}"""),
        new(
            GetRelationships,
            "Read one lore entry's direct relationships, each as a label read from that entry's side and the related entry.",
            IdSchema),
        new(
            GetStory,
            "Read one story: its premise and status, its chapters, its scenes in reading order with short summaries, and its plot arcs and beats.",
            IdSchema),
        new(
            GetScene,
            "Read one scene: its story and chapter, summary, notes, point of view, world date and linked lore. "
            + "Set include_prose to true only when the question needs the start of the scene's written text. Set find to a word "
            + "or two to get the prose's passage around them, wherever they are in it; otherwise null.",
            """{"type":"object","properties":{"id":{"type":"string","description":"The scene id exactly as a tool result gave it."},"include_prose":{"type":"boolean"},"find":{"type":["string","null"],"description":"Words to find in the prose, or null."}},"required":["id","include_prose","find"],"additionalProperties":false}"""),
        new(
            GetTimelineItem,
            "Read one timeline moment: its date, Canon status, description, participants and the stories it belongs to.",
            IdSchema),
        new(
            BrowseTimeline,
            "Read the universe's timeline in world order - moments, dated scenes, births and deaths - 25 to a page. "
            + "Optionally narrow it to words in a title or description, to one lore entry taking part, or to one story.",
            """{"type":"object","properties":{"search":{"type":["string","null"]},"lore_id":{"type":["string","null"]},"story_id":{"type":["string","null"]},"page":{"type":["integer","null"]}},"required":["search","lore_id","story_id","page"],"additionalProperties":false}"""),
        new(
            GetUniverseOverview,
            "Read an overview of the whole universe: its description, its stories, how many lore entries of each type it holds "
            + "with a few examples, and the size of its timeline. Use it for briefings and broad questions.",
            """{"type":"object","properties":{},"required":[],"additionalProperties":false}"""),
        new(
            ListMaps,
            "The universe's maps: each with its id, name, description, picture size, how many pins it holds, and its scale when "
            + "the creator recorded one. A map without a scale can locate places but not measure distances.",
            """{"type":"object","properties":{},"required":[],"additionalProperties":false}"""),
        new(
            SearchMapLocations,
            "Find pins on the maps whose title, or whose lore entry's name or alias, contains the words given. Every match is "
            + "returned, up to 20: several matches are several recorded places, so ask which is meant rather than choosing.",
            """{"type":"object","properties":{"query":{"type":"string","description":"A name, or part of one."}},"required":["query"],"additionalProperties":false}"""),
        new(
            GetMapLocation,
            "Every map one lore entry is pinned on, by the entry's id. Resolve a role - a capital, a seat - to its entry through "
            + "recorded relationships and fields first. An entry on no map is reported as such; one on several maps lists each.",
            """{"type":"object","properties":{"lore_id":{"type":"string","description":"The lore entry's id exactly as a tool result gave it."}},"required":["lore_id"],"additionalProperties":false}"""),
        new(
            MeasureMapDistance,
            "The straight-line separation of two pins by their pin ids. A distance in the creator's unit only when both pins are "
            + "on one map with a recorded scale and confirmed positions; otherwise the result says what is missing. Approximate, "
            + "on the picture, never a route or a travel time.",
            """{"type":"object","properties":{"from_pin_id":{"type":"string"},"to_pin_id":{"type":"string"}},"required":["from_pin_id","to_pin_id"],"additionalProperties":false}"""),
    ];

    /// <summary>How tool results are written for the model: plain JSON, enums by name, nothing empty.</summary>
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly Dictionary<Guid, AssistantSource> _seen = [];

    /// <summary>A source this question's reads returned, by id - or null for anything they did not.</summary>
    public AssistantSource? Seen(Guid id) => _seen.GetValueOrDefault(id);

    /// <summary>
    /// Runs one call and returns what to hand back to the model: the reading as JSON, or a short error the model can act
    /// on. A failed read is reported to the model rather than thrown, so one bad id does not end the answer; a
    /// cancellation is never swallowed.
    /// </summary>
    public async Task<string> RunAsync(AssistantToolCall call, CancellationToken cancellationToken)
    {
        JsonElement arguments;
        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(call.Arguments) ? "{}" : call.Arguments);
            arguments = document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return Error("bad_arguments", "The arguments were not a JSON object.");
        }

        if (arguments.ValueKind != JsonValueKind.Object)
        {
            return Error("bad_arguments", "The arguments were not a JSON object.");
        }

        return call.Name switch
        {
            SearchUniverse => await SearchAsync(Text(arguments, "query"), cancellationToken),
            GetLore => await ReadAsync(
                arguments,
                "id",
                id => UniverseReader.GetLoreAsync(db, universeId, id, cancellationToken, Text(arguments, "find")),
                Remember),
            GetRelationships => await ReadAsync(arguments, "id", id => UniverseReader.GetRelationshipsAsync(db, universeId, id, cancellationToken), Remember),
            GetStory => await ReadAsync(arguments, "id", id => UniverseReader.GetStoryAsync(db, universeId, id, cancellationToken), Remember),
            GetScene => await ReadAsync(
                arguments,
                "id",
                id => UniverseReader.GetSceneAsync(db, universeId, id, Flag(arguments, "include_prose"), cancellationToken, Text(arguments, "find")),
                Remember),
            GetTimelineItem => await ReadAsync(arguments, "id", id => UniverseReader.GetTimelineItemAsync(db, universeId, id, cancellationToken), Remember),
            BrowseTimeline => await BrowseAsync(arguments, cancellationToken),
            GetUniverseOverview => Write(Remember(await UniverseReader.GetOverviewAsync(db, universeId, cancellationToken))),

            // Geography (issue #53, ADR 0061): the same reader the MCP tools call, and nothing of its own.
            ListMaps => Write(Remember(await MapGeography.ListMapsAsync(db, universeId, cancellationToken))),
            SearchMapLocations => await SearchLocationsAsync(Text(arguments, "query"), cancellationToken),
            GetMapLocation => await ReadAsync(arguments, "lore_id", id => MapGeography.LocateAsync(db, universeId, id, cancellationToken), Remember),
            MeasureMapDistance => await MeasureAsync(arguments, cancellationToken),

            // Only in propose mode, which the person turned on for this question (ADR 0047); otherwise no such tool exists.
            AssistantProposing.OptionsTool or AssistantProposing.ProposeTool when proposing is not null => await proposing.RunAsync(call, cancellationToken),
            _ => Error("unknown_tool", "There is no such tool. Only the listed read-only tools exist."),
        };
    }

    // ---------- The tools ----------

    private async Task<string> SearchAsync(string? query, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Error("bad_arguments", "Give one or two words to search for.");
        }

        var results = await UniverseReader.SearchAsync(db, universeId, query, cancellationToken);
        foreach (var result in results)
        {
            Remember(SourceOf(result));
        }

        return Write(new
        {
            results = results.Select(result => new
            {
                kind = SearchKindName(result.Kind),
                id = result.Id,
                title = result.Title,
                type = result.EntityTypeName,
                storyId = result.Kind == UniverseSearchKind.Story ? null : result.StoryId,
                storyTitle = result.Kind == UniverseSearchKind.Story ? null : result.StoryTitle,
                chapter = result.ChapterNumber,
                foundIn = result.MatchedIn.ToString(),
                excerpt = result.Excerpt is { } parts ? string.Concat(parts.Select(part => part.Text)) : null,
            }),
        });
    }

    private async Task<string> BrowseAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var lore = OptionalId(arguments, "lore_id", out var badLore);
        var story = OptionalId(arguments, "story_id", out var badStory);
        if (badLore || badStory)
        {
            return Error("not_found", "That id is not in this universe.");
        }

        var page = arguments.TryGetProperty("page", out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)
            ? Math.Clamp(number, 1, 1_000)
            : 1;

        var reading = await UniverseReader.BrowseTimelineAsync(db, universeId, Text(arguments, "search"), lore, story, page, cancellationToken);

        foreach (var line in reading.Items)
        {
            Remember(line.Kind switch
            {
                TimelineSourceKind.Event => new AssistantSource(AssistantSourceKind.TimelineMoment, line.Id, line.Title, null),
                TimelineSourceKind.Scene => new AssistantSource(AssistantSourceKind.Scene, line.Id, line.Title, line.StoryId),
                _ => new AssistantSource(AssistantSourceKind.Lore, line.Id, line.Title, null),
            });
        }

        return Write(reading);
    }

    /// <summary>One read by one id: parsed, read through this universe, remembered, written - or "not found" for any id that is not here.</summary>
    private static async Task<string> ReadAsync<T>(JsonElement arguments, string name, Func<Guid, Task<T?>> read, Func<T, T> remember)
        where T : class
    {
        if (!Guid.TryParse(Text(arguments, name), out var id) || await read(id) is not { } reading)
        {
            return Error("not_found", "Nothing with that id is in this universe.");
        }

        return Write(remember(reading));
    }

    private async Task<string> SearchLocationsAsync(string? query, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Error("bad_arguments", "Give a name, or part of one, to look for.");
        }

        var found = await MapGeography.SearchLocationsAsync(db, universeId, query, cancellationToken);
        foreach (var location in found)
        {
            Remember(location);
        }

        return Write(new
        {
            locations = found,
            note = found.Count == 0 ? "No pin on any map of this universe matches. Nothing is recorded about where this is."
                : found.Count >= MapGeography.SearchLimit ? "Only the first 20 matches are listed; narrow the words." : null,
        });
    }

    private async Task<string> MeasureAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(Text(arguments, "from_pin_id"), out var from) || !Guid.TryParse(Text(arguments, "to_pin_id"), out var to))
        {
            return Error("not_found", "Nothing with that id is in this universe.");
        }

        if (from == to)
        {
            return Error("bad_arguments", "Give two different pins.");
        }

        var reading = await MapGeography.MeasureAsync(db, universeId, from, to, cancellationToken);
        if (reading is null)
        {
            return Error("not_found", "Nothing with that id is in this universe.");
        }

        Remember(reading.From);
        Remember(reading.To);
        return Write(reading);
    }

    // ---------- Remembering what was read ----------

    private void Remember(AssistantSource source) => _seen.TryAdd(source.Id, source);

    private LoreReading Remember(LoreReading lore)
    {
        Remember(new AssistantSource(AssistantSourceKind.Lore, lore.Id, lore.Name, null));
        foreach (var field in lore.Fields.Where(field => field.LoreId is not null))
        {
            Remember(new AssistantSource(AssistantSourceKind.Lore, field.LoreId!.Value, field.Value, null));
        }

        foreach (var scene in lore.Scenes)
        {
            Remember(new AssistantSource(AssistantSourceKind.Scene, scene.Id, scene.Title, scene.StoryId));
        }

        foreach (var moment in lore.Moments)
        {
            Remember(new AssistantSource(AssistantSourceKind.TimelineMoment, moment.Id, moment.Title, null));
        }

        return lore;
    }

    private RelationshipsReading Remember(RelationshipsReading relationships)
    {
        Remember(relationships.Lore);
        foreach (var relationship in relationships.Relationships)
        {
            Remember(relationship.Related);
        }

        return relationships;
    }

    private StoryReading Remember(StoryReading story)
    {
        Remember(new AssistantSource(AssistantSourceKind.Story, story.Id, story.Title, story.Id));
        foreach (var chapter in story.Chapters)
        {
            Remember(new AssistantSource(AssistantSourceKind.Chapter, chapter.Id, chapter.Title, story.Id));
        }

        foreach (var scene in story.Scenes)
        {
            Remember(new AssistantSource(AssistantSourceKind.Scene, scene.Id, scene.Title, story.Id));
        }

        foreach (var arc in story.Arcs)
        {
            Remember(new AssistantSource(AssistantSourceKind.PlotArc, arc.Id, arc.Title, story.Id));
            foreach (var beat in arc.Beats)
            {
                Remember(new AssistantSource(AssistantSourceKind.PlotBeat, beat.Id, beat.Title, story.Id));
            }
        }

        return story;
    }

    private SceneReading Remember(SceneReading scene)
    {
        Remember(new AssistantSource(AssistantSourceKind.Scene, scene.Id, scene.Title, scene.StoryId));
        Remember(new AssistantSource(AssistantSourceKind.Story, scene.StoryId, scene.StoryTitle, scene.StoryId));
        if (scene.PointOfView is { } pov)
        {
            Remember(pov);
        }

        foreach (var lore in scene.Lore)
        {
            Remember(lore);
        }

        return scene;
    }

    private TimelineItemReading Remember(TimelineItemReading moment)
    {
        Remember(new AssistantSource(AssistantSourceKind.TimelineMoment, moment.Id, moment.Title, null));
        foreach (var participant in moment.Participants)
        {
            Remember(participant);
        }

        foreach (var story in moment.Stories)
        {
            Remember(new AssistantSource(AssistantSourceKind.Story, story.Id, story.Title, story.Id));
        }

        return moment;
    }

    private UniverseOverview? Remember(UniverseOverview? overview)
    {
        foreach (var story in overview?.Stories ?? [])
        {
            Remember(new AssistantSource(AssistantSourceKind.Story, story.Id, story.Title, story.Id));
        }

        foreach (var example in overview?.LoreTypes.SelectMany(type => type.Examples) ?? [])
        {
            Remember(example);
        }

        return overview;
    }

    private void Remember(LoreMention lore) => Remember(new AssistantSource(AssistantSourceKind.Lore, lore.Id, lore.Name, null));

    private void Remember(LocationReading location)
    {
        Remember(new AssistantSource(AssistantSourceKind.MapPin, location.PinId, location.Title, location.MapId));
        Remember(new AssistantSource(AssistantSourceKind.Map, location.MapId, location.MapName, location.MapId));
        if (location.Lore is { } lore)
        {
            Remember(lore);
        }
    }

    private IReadOnlyList<MapReading> Remember(IReadOnlyList<MapReading> maps)
    {
        foreach (var map in maps)
        {
            Remember(new AssistantSource(AssistantSourceKind.Map, map.Id, map.Name, map.Id));
        }

        return maps;
    }

    private LoreLocationsReading Remember(LoreLocationsReading located)
    {
        Remember(located.Lore);
        foreach (var pin in located.Pins)
        {
            Remember(pin);
        }

        return located;
    }

    // ---------- Shaping ----------

    private static AssistantSource SourceOf(UniverseSearchResult result) => result.Kind switch
    {
        UniverseSearchKind.Entity => new(AssistantSourceKind.Lore, result.Id, result.Title, null),
        UniverseSearchKind.Story => new(AssistantSourceKind.Story, result.Id, result.Title, result.Id),
        UniverseSearchKind.Chapter => new(AssistantSourceKind.Chapter, result.Id, result.Title, result.StoryId),
        UniverseSearchKind.PlotArc => new(AssistantSourceKind.PlotArc, result.Id, result.Title, result.StoryId),
        UniverseSearchKind.PlotBeat => new(AssistantSourceKind.PlotBeat, result.Id, result.Title, result.StoryId),

        // A manuscript's id is its scene's: the prose is cited as the scene it tells.
        _ => new(AssistantSourceKind.Scene, result.Id, result.Title, result.StoryId),
    };

    private static string SearchKindName(UniverseSearchKind kind) => kind switch
    {
        UniverseSearchKind.Entity => "lore",
        UniverseSearchKind.Story => "story",
        UniverseSearchKind.Chapter => "chapter",
        UniverseSearchKind.Scene => "scene",
        UniverseSearchKind.PlotArc => "plot_arc",
        UniverseSearchKind.PlotBeat => "plot_beat",
        _ => "scene_prose",
    };

    private static string? Text(JsonElement arguments, string name) =>
        arguments.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static bool Flag(JsonElement arguments, string name) =>
        arguments.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;

    /// <summary>An optional id: absent or null is none; anything else must parse, or it is <paramref name="bad"/>.</summary>
    private static Guid? OptionalId(JsonElement arguments, string name, out bool bad)
    {
        var text = Text(arguments, name);
        bad = !string.IsNullOrWhiteSpace(text) && !Guid.TryParse(text, out _);
        return Guid.TryParse(text, out var id) ? id : null;
    }

    private static string Write<T>(T value) => JsonSerializer.Serialize(value, Json);

    private static string Error(string code, string message) => Write(new { error = code, message });
}
