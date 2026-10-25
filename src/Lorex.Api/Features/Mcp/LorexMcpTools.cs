using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lorex.Api.Data;
using Lorex.Api.Features.Reading;
using Lorex.Api.Features.Search;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Lorex.Api.Features.Mcp;

/// <summary>
/// The MCP tools (ADR 0046): one universe, read through <see cref="UniverseReader"/> - the same permission-safe read layer
/// the built-in assistant uses, and nothing of the assistant itself.
///
/// <para><b>Read-only by construction.</b> Every tool reads; none writes, and each says so in its annotations. Nothing
/// takes a universe: the universe is <see cref="McpCaller"/>'s, set by the gate from the token, so an id from another
/// universe, from the Trash or from nowhere reads as not found - the same answer, whatever the reason.</para>
///
/// <para><b>Prose is asked for, never handed over.</b> A scene's own reading carries no manuscript, only its size. A
/// client finds passages (<see cref="SearchSceneManuscriptAsync"/>) or reads the text in ordered, bounded ranges
/// (<see cref="ReadSceneManuscriptAsync"/>) that join back into the manuscript exactly.</para>
/// </summary>
[McpServerToolType]
public sealed class LorexMcpTools(LorexDbContext db, McpCaller caller)
{
    public const string Instructions =
        "LoreX gives read-only access to one universe: its lore entries, their relationships, stories with their chapters, "
        + "scenes and plot, scene manuscripts and the timeline. Nothing here can change LoreX. Start with get_universe_overview "
        + "or search_universe, then read what you found by its id - ids are stable, pass them back exactly. Manuscript prose is "
        + "never included by default, because a long manuscript uses a lot of your context: get_scene gives a scene's details and "
        + "the manuscript's size, search_scene_manuscript finds passages, and read_scene_manuscript reads the text in ordered "
        + "chunks. Read only as much prose as the task needs. Pictures: list_lore_images lists an entry's profile picture and "
        + "the pictures of its appearances, each with the forms and eras it is explicitly linked to - a form with no linked "
        + "picture has none, and the entry's portrait never stands in for it; get_lore_image returns one picture as viewable "
        + "image content, a bounded preview unless the original is asked for. Maps: list_maps names the universe's maps and whether "
        + "each has a recorded scale; get_map_location gives every map a lore entry is pinned on, by id or exact name; "
        + "search_map_locations finds pins by name; measure_map_distance gives the straight-line separation of two pins, as a "
        + "distance only when both are on one calibrated map. A location is a pin someone placed and a distance only what that tool "
        + "returns - never estimate either from a name, a description or the picture.";

    /// <summary>A chunk of prose by default: about 2,000 tokens of English.</summary>
    public const int ManuscriptChunkDefault = 8_000;

    public const int ManuscriptChunkMinimum = 500;

    /// <summary>The most a single read returns: about 3,000 tokens of English.</summary>
    public const int ManuscriptChunkMaximum = 12_000;

    public const int ManuscriptFindLength = 200;

    public const int ManuscriptFindMatches = 5;

    /// <summary>Characters shown either side of a match.</summary>
    public const int ManuscriptFindContext = 240;

    /// <summary>How tool results are written: plain JSON, enums by name, nothing empty.</summary>
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    [McpServerTool(Name = "search_universe", Title = "Search the universe", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Search this universe's lore entries, stories, chapters, scenes, plot arcs and beats, and scene prose by keywords. "
        + "Every word must appear, so search for one or two distinctive words such as a name, not a whole question. "
        + "Returns up to five matches of each kind, best first, each with its id and a short excerpt.")]
    public async Task<CallToolResult> SearchUniverseAsync(
        [Description("One or two distinctive words.")] string query,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (string.IsNullOrWhiteSpace(query) || query.Length > ManuscriptFindLength)
        {
            return Error("bad_arguments", "Give one or two words to search for.");
        }

        var results = await UniverseReader.SearchAsync(db, caller.UniverseId, query, cancellationToken);
        return Result(new
        {
            results = results.Select(result => new
            {
                kind = KindName(result.Kind),
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

    [McpServerTool(Name = "get_universe_overview", Title = "Universe overview", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("An overview of the connected universe: its name and description, its stories, how many lore entries of each type "
        + "it holds with a few examples, and the size of its timeline. A good first call.")]
    public async Task<CallToolResult> GetUniverseOverviewAsync(CancellationToken cancellationToken) =>
        Guard() ?? Found(await UniverseReader.GetOverviewAsync(db, caller.UniverseId, cancellationToken));

    [McpServerTool(Name = "get_lore_entry", Title = "Read a lore entry", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Read one lore entry: its type, Canon status, summary, aliases, tags, recorded custom fields, the start of its "
        + "article, the scenes it appears in and the timeline moments it takes part in. Set find to a word or two to also get "
        + "the article's passage around them, wherever they are in it.")]
    public async Task<CallToolResult> GetLoreEntryAsync(
        [Description("The lore entry's id, exactly as a result gave it.")] string loreId,
        [Description("Optional words to find in the entry's article.")] string? find = null,
        CancellationToken cancellationToken = default) =>
        Guard() ?? (Guid.TryParse(loreId, out var id)
            ? Found(await UniverseReader.GetLoreAsync(db, caller.UniverseId, id, cancellationToken, Words(find)))
            : NotFound());

    [McpServerTool(Name = "get_lore_relationships", Title = "Read an entry's relationships", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Read one lore entry's direct relationships, each as a label read from that entry's side and the related entry. "
        + "Up to 40; more says the list was cut.")]
    public async Task<CallToolResult> GetLoreRelationshipsAsync(
        [Description("The lore entry's id, exactly as a result gave it.")] string loreId,
        CancellationToken cancellationToken) =>
        Guard() ?? (Guid.TryParse(loreId, out var id)
            ? Found(await UniverseReader.GetRelationshipsAsync(db, caller.UniverseId, id, cancellationToken))
            : NotFound());

    [McpServerTool(Name = "get_story", Title = "Read a story's structure", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Read one story's structure: its premise and status, its chapters, its scenes in reading order with short summaries, "
        + "and its plot arcs and beats. No manuscript prose.")]
    public async Task<CallToolResult> GetStoryAsync(
        [Description("The story's id, exactly as a result gave it.")] string storyId,
        CancellationToken cancellationToken) =>
        Guard() ?? (Guid.TryParse(storyId, out var id)
            ? Found(await UniverseReader.GetStoryAsync(db, caller.UniverseId, id, cancellationToken))
            : NotFound());

    [McpServerTool(Name = "get_scene", Title = "Read a scene's details", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Read one scene without its prose: story and chapter, summary, notes, point of view, world date and linked lore, "
        + "plus the manuscript's size (characters, approximate words and tokens). Use search_scene_manuscript or "
        + "read_scene_manuscript only when the task needs the written text.")]
    public async Task<CallToolResult> GetSceneAsync(
        [Description("The scene's id, exactly as a result gave it.")] string sceneId,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (!Guid.TryParse(sceneId, out var id)
            || await UniverseReader.GetSceneAsync(db, caller.UniverseId, id, includeProse: false, cancellationToken) is not { } scene)
        {
            return NotFound();
        }

        var (text, version) = await ManuscriptAsync(id, cancellationToken);
        return Result(new
        {
            scene,
            manuscript = new
            {
                version,
                characters = text.Length,
                approximateWords = text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length,
                approximateTokens = ApproximateTokens(text.Length),
                chunks = text.Length == 0 ? 0 : (text.Length + ManuscriptChunkDefault - 1) / ManuscriptChunkDefault,
            },
        });
    }

    [McpServerTool(Name = "search_scene_manuscript", Title = "Find passages in a scene's prose", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Find a word or phrase in one scene's manuscript, ignoring case. Returns up to five short excerpts with their "
        + "character offsets, so read_scene_manuscript can read on from one. Cheaper than reading the whole manuscript.")]
    public async Task<CallToolResult> SearchSceneManuscriptAsync(
        [Description("The scene's id, exactly as a result gave it.")] string sceneId,
        [Description("The word or short phrase to find.")] string text,
        CancellationToken cancellationToken)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        var needle = text?.Trim() ?? string.Empty;
        if (needle.Length is 0 or > ManuscriptFindLength)
        {
            return Error("bad_arguments", "Give a word or a short phrase to find.");
        }

        if (!Guid.TryParse(sceneId, out var id) || await SceneTitleAsync(id, cancellationToken) is not { } title)
        {
            return NotFound();
        }

        var (prose, version) = await ManuscriptAsync(id, cancellationToken);
        List<object> matches = [];
        var total = 0;
        for (var at = prose.IndexOf(needle, StringComparison.OrdinalIgnoreCase); at >= 0;
             at = at + needle.Length < prose.Length ? prose.IndexOf(needle, at + needle.Length, StringComparison.OrdinalIgnoreCase) : -1)
        {
            total++;
            if (matches.Count < ManuscriptFindMatches)
            {
                var start = ManuscriptRanges.Snap(prose, Math.Max(0, at - ManuscriptFindContext));
                var end = ManuscriptRanges.Snap(prose, Math.Min(prose.Length, at + needle.Length + ManuscriptFindContext));
                matches.Add(new { offset = at, excerptStart = start, excerptEnd = end, excerpt = prose[start..end] });
            }
        }

        return Result(new
        {
            sceneId = id,
            sceneTitle = title,
            manuscriptVersion = version,
            totalCharacters = prose.Length,
            totalMatches = total,
            matches,
        });
    }

    [McpServerTool(Name = "read_scene_manuscript", Title = "Read a scene's prose", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Read one scene's manuscript exactly as written, in ordered chunks. Start at offset 0 (or an offset another tool "
        + "returned) and, to read on, call again with nextOffset until isComplete is true. Pass the manuscriptVersion you got "
        + "back so every chunk comes from the same text. Chunks are 8,000 characters by default and at most 12,000, ending at a "
        + "paragraph or line break where one is near; joined in order they are the manuscript, with nothing missing or repeated. "
        + "Long manuscripts use a lot of context: read only what the task needs.")]
    public async Task<CallToolResult> ReadSceneManuscriptAsync(
        [Description("The scene's id, exactly as a result gave it.")] string sceneId,
        [Description("Where to start, in characters: 0 for the beginning, or a nextOffset or offset a tool returned.")] int? offset = null,
        [Description("The most characters to return, 500 to 12,000. Default 8,000.")] int? maxCharacters = null,
        [Description("The manuscriptVersion from an earlier chunk, so a manuscript changed in between is noticed.")] int? manuscriptVersion = null,
        CancellationToken cancellationToken = default)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (!Guid.TryParse(sceneId, out var id) || await SceneTitleAsync(id, cancellationToken) is not { } title)
        {
            return NotFound();
        }

        var (prose, version) = await ManuscriptAsync(id, cancellationToken);
        if (manuscriptVersion is { } expected && expected != version)
        {
            return Error(
                "manuscript_changed",
                $"The manuscript has changed since version {expected}; it is now version {version}. Read it again from offset 0.");
        }

        var start = offset ?? 0;
        if (start < 0 || start > prose.Length || (start > 0 && start < prose.Length && char.IsLowSurrogate(prose[start])))
        {
            return Error("bad_arguments", $"The offset must be between 0 and {prose.Length}, as a tool returned it.");
        }

        var end = ManuscriptRanges.End(prose, start, Math.Clamp(maxCharacters ?? ManuscriptChunkDefault, ManuscriptChunkMinimum, ManuscriptChunkMaximum));
        return Result(new
        {
            sceneId = id,
            sceneTitle = title,
            manuscriptVersion = version,
            totalCharacters = prose.Length,
            offset = start,
            endOffset = end,
            text = prose[start..end],
            isComplete = end == prose.Length,
            nextOffset = end == prose.Length ? (int?)null : end,
            remainingCharacters = prose.Length - end,
            approximateTokens = ApproximateTokens(end - start),
        });
    }

    [McpServerTool(Name = "get_timeline_moment", Title = "Read a timeline moment", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Read one timeline moment: its date, Canon status, description, participants and the stories it belongs to.")]
    public async Task<CallToolResult> GetTimelineMomentAsync(
        [Description("The moment's id, exactly as a result gave it.")] string momentId,
        CancellationToken cancellationToken) =>
        Guard() ?? (Guid.TryParse(momentId, out var id)
            ? Found(await UniverseReader.GetTimelineItemAsync(db, caller.UniverseId, id, cancellationToken))
            : NotFound());

    [McpServerTool(Name = "browse_timeline", Title = "Browse the timeline", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Read the universe's timeline in world order, 25 to a page: moments, dated scenes, births and deaths. "
        + "Optionally narrow it to words in a title or description, to one lore entry taking part, or to one story.")]
    public async Task<CallToolResult> BrowseTimelineAsync(
        [Description("Optional words to find in a moment or scene.")] string? search = null,
        [Description("Optional lore entry id: only moments it takes part in.")] string? loreId = null,
        [Description("Optional story id: only moments and scenes of that story.")] string? storyId = null,
        [Description("The page, from 1. Default 1.")] int? page = null,
        CancellationToken cancellationToken = default)
    {
        if (Guard() is { } refused)
        {
            return refused;
        }

        if (!OptionalId(loreId, out var lore) || !OptionalId(storyId, out var story))
        {
            return NotFound();
        }

        return Result(await UniverseReader.BrowseTimelineAsync(
            db, caller.UniverseId, Words(search), lore, story, Math.Clamp(page ?? 1, 1, 1_000), cancellationToken));
    }

    // ---------- Reading ----------

    /// <summary>The title of a live scene of this universe, or null.</summary>
    private Task<string?> SceneTitleAsync(Guid sceneId, CancellationToken cancellationToken) =>
        db.Scenes.AsNoTracking()
            .Where(scene => scene.Id == sceneId
                && scene.DeletedAt == null
                && scene.Story!.UniverseId == caller.UniverseId
                && scene.Story.DeletedAt == null)
            .Select(scene => scene.Title)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>A live scene's prose, exactly as stored, and its edit version (0 for a scene never written in).</summary>
    private async Task<(string Text, int Version)> ManuscriptAsync(Guid sceneId, CancellationToken cancellationToken)
    {
        var manuscript = await db.SceneManuscripts.AsNoTracking()
            .Where(row => row.SceneId == sceneId)
            .Select(row => new { row.Content, row.Version })
            .FirstOrDefaultAsync(cancellationToken);
        // Mentions read as the names the author wrote (ADR 0058); ranges and searches are over this text, so they still join
        // back into exactly what was read.
        return (Stories.ManuscriptMentions.Plain(manuscript?.Content ?? string.Empty), manuscript?.Version ?? 0);
    }

    // ---------- Shaping ----------

    /// <summary>
    /// The gate sets the caller before any tool can run. A tool reached without one - which the gate makes impossible -
    /// still reads nothing.
    /// </summary>
    private CallToolResult? Guard() => caller.IsAllowed ? null : Error("not_allowed", "This connection cannot read a universe.");

    private static CallToolResult Found<T>(T? reading) where T : class => reading is null ? NotFound() : Result(reading);

    private static CallToolResult NotFound() => Error("not_found", "Nothing with that id is in this universe.");

    private static CallToolResult Result<T>(T value) => new()
    {
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(value, Json) }],
    };

    private static CallToolResult Error(string code, string message) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(new { error = code, message }, Json) }],
    };

    private static string? Words(string? text) => string.IsNullOrWhiteSpace(text) ? null : ReadingText.Cut(text, ManuscriptFindLength);

    /// <summary>An optional id: absent or blank is none; anything else must be an id.</summary>
    private static bool OptionalId(string? text, out Guid? id)
    {
        id = Guid.TryParse(text, out var parsed) ? parsed : null;
        return string.IsNullOrWhiteSpace(text) || id is not null;
    }

    /// <summary>Roughly four characters a token for English prose. A guide to context use, never a bill.</summary>
    private static int ApproximateTokens(int characters) => (characters + 3) / 4;

    private static string KindName(UniverseSearchKind kind) => kind switch
    {
        UniverseSearchKind.Entity => "lore",
        UniverseSearchKind.Story => "story",
        UniverseSearchKind.Chapter => "chapter",
        UniverseSearchKind.Scene => "scene",
        UniverseSearchKind.PlotArc => "plot_arc",
        UniverseSearchKind.PlotBeat => "plot_beat",
        _ => "scene_prose",
    };
}

/// <summary>Where a manuscript range ends: exact offsets into the stored text, never inside a surrogate pair.</summary>
internal static class ManuscriptRanges
{
    /// <summary>
    /// The end of a chunk from <paramref name="start"/> of at most <paramref name="max"/> characters: the text's end if it
    /// is near, else just after the last paragraph break, line break or space in the chunk's final fifth, else the limit
    /// itself - one character short when that would split a surrogate pair. Always past <paramref name="start"/>, so
    /// reading on from each end covers the text once, in order.
    /// </summary>
    public static int End(string text, int start, int max)
    {
        var limit = Math.Min(text.Length, start + max);
        if (limit == text.Length)
        {
            return limit;
        }

        var floor = start + (max * 4 / 5);
        foreach (var separator in (string[])["\n\n", "\n", " "])
        {
            var at = text.LastIndexOf(separator, limit - 1, limit - floor, StringComparison.Ordinal);
            if (at >= floor)
            {
                return at + separator.Length;
            }
        }

        return Snap(text, limit);
    }

    /// <summary>An offset moved back one when it would fall between the two halves of a surrogate pair.</summary>
    public static int Snap(string text, int offset) =>
        offset > 0 && offset < text.Length && char.IsLowSurrogate(text[offset]) && char.IsHighSurrogate(text[offset - 1])
            ? offset - 1
            : offset;
}
