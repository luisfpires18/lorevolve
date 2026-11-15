using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Projects;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// The starter types a kind of project may be given (#144).
///
/// <para><b>Offered, never imposed.</b> A project begins with no types at all; a template is written only when the
/// author asks for it, and what it writes is ordinary types with ordinary fields, which they may then rename, delete or
/// add to. Nothing afterwards records that a type came from a template, because a template is a convenience and not a
/// schema: a game whose author deleted Map and added Encounter is not a broken game.</para>
///
/// <para><b>No WOO-specific content.</b> These are the shapes any game, series, film or comic has, not one world's.
/// Nothing here names a faction, a rune or a weapon.</para>
///
/// <para>Game (#144), Series (#145), Film (#146) and Comic (#147) are all here. Only Comic reads the project's
/// subtype, because #147 names three forms - comic, manga and webtoon - where the other issues name one each. A kind
/// with no template is not an error: its author defines every type themselves, which is also what happens to an author
/// who declines one.</para>
///
/// <para>Film and Series start from the same three types under different billing vocabulary, which is honest rather
/// than lazy: a film and a series are made of characters, places and things either way, and inventing a difference to
/// look thorough would leave an author deleting types they did not want.</para>
/// </summary>
public static class ProjectTemplates
{
    /// <summary>A starter type: a name, what it is for, and the fields it starts with.</summary>
    public sealed record StarterType(string Name, string? Description, IReadOnlyList<StarterField> Fields);

    /// <summary>A starter field. <paramref name="Options"/> is empty unless the kind is a list of choices.</summary>
    public sealed record StarterField(string Name, EntityFieldKind Kind, IReadOnlyList<string> Options);

    public sealed record Template(string Name, IReadOnlyList<StarterType> Types);

    /// <summary>
    /// The player counts a map may declare it supports. A list of choices rather than a number, because a map supports
    /// a set of counts and not one: a four-player map that also plays two-against-two says 2 and 4. Nothing fixes how
    /// many maps a game has or which counts it must offer; this is only what the starter Map type can record.
    /// </summary>
    public static readonly IReadOnlyList<string> SupportedPlayerCounts = ["2", "3", "4", "5", "6", "7", "8"];

    private static readonly Template GameTemplate = new(
        "Game",
        [
            new StarterType(
                "Map",
                "A place the game is played on.",
                [
                    new StarterField("Supported players", EntityFieldKind.MultiSelect, SupportedPlayerCounts),
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
            new StarterType(
                "Unit",
                "Something the player commands.",
                [
                    new StarterField("Cost", EntityFieldKind.Number, []),
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
            new StarterType(
                "Item",
                "Something the player carries, uses or builds with.",
                [
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
        ]);

    private static readonly Template SeriesTemplate = new(
        "Series",
        [
            new StarterType(
                "Character",
                "Someone who appears in the series. Separate from the lore's own characters, and may point at one.",
                [
                    new StarterField("Billing", EntityFieldKind.Select, ["Main", "Recurring", "Guest"]),
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
            new StarterType(
                "Location",
                "A standing set or place the series returns to.",
                [
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
            new StarterType(
                "Prop",
                "Something that has to exist on screen.",
                [
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
        ]);

    private static readonly Template FilmTemplate = new(
        "Film",
        [
            new StarterType(
                "Character",
                "Someone who appears in the film. Separate from the lore's own characters, and may point at one.",
                [
                    new StarterField("Billing", EntityFieldKind.Select, ["Lead", "Supporting", "Background"]),
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
            new StarterType(
                "Location",
                "A place the film is set or shot in.",
                [
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
            new StarterType(
                "Prop",
                "Something that has to exist on screen.",
                [
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
        ]);

    /// <summary>
    /// A comic's starter types, and the two variants #147 asks for by name. The three differ only where the form
    /// genuinely does: a manga's chapters are serialised, so its Character carries a first-appearance chapter; a
    /// webtoon scrolls, so its page-level type is an Episode rather than an Issue. Everything else is the same three
    /// types, because inventing differences would leave an author deleting types they never wanted.
    /// </summary>
    private static Template ComicTemplate(string name, string unit, IReadOnlyList<StarterField> extra) => new(
        name,
        [
            new StarterType(
                "Character",
                "Someone who appears in it. Separate from the lore's own characters, and may point at one.",
                [
                    new StarterField("Billing", EntityFieldKind.Select, ["Main", "Recurring", "Guest"]),
                    .. extra,
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
            new StarterType(
                "Location",
                "A place it returns to.",
                [new StarterField("Notes", EntityFieldKind.LongText, [])]),
            new StarterType(
                unit,
                "A published part: what a reader buys or opens at once.",
                [
                    new StarterField("Published", EntityFieldKind.Date, []),
                    new StarterField("Notes", EntityFieldKind.LongText, []),
                ]),
        ]);

    private static readonly Template Empty = new("None", []);

    /// <summary>
    /// The starter types for a kind of project, or a template with none when that kind has no starters yet. A kind
    /// without a template is not an error: it means an author of that kind defines every type themselves, which is
    /// also what happens to a kind whose template they decline.
    /// </summary>
    public static Template For(ProjectKind kind, string? subtype = null) => kind switch
    {
        ProjectKind.Game => GameTemplate,
        ProjectKind.Series => SeriesTemplate,
        ProjectKind.Film => FilmTemplate,
        ProjectKind.Comic => Comic(subtype),
        _ => Empty,
    };

    /// <summary>
    /// Which comic template a project gets, from its own subtype (#147). The subtype is free text an author typed, so
    /// it is matched loosely and anything unrecognised gets the plain comic one: a project called "graphic novel"
    /// should start somewhere rather than nowhere.
    /// </summary>
    private static Template Comic(string? subtype)
    {
        var said = subtype?.Trim() ?? string.Empty;

        if (said.Contains("manga", StringComparison.OrdinalIgnoreCase))
        {
            return ComicTemplate(
                "Manga",
                "Chapter",
                [new StarterField("First appears in", EntityFieldKind.ShortText, [])]);
        }

        return said.Contains("webtoon", StringComparison.OrdinalIgnoreCase)
            ? ComicTemplate("Webtoon", "Episode", [])
            : ComicTemplate("Comic", "Issue", []);
    }
}
