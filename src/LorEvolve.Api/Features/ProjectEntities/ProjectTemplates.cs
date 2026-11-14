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
/// <para>Only the Game template is filled in here, because #144 is the Game issue; Series, Film and Comic are #145,
/// #146 and #147 and add their own entries to this one table rather than a mechanism of their own.</para>
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

    private static readonly Template Empty = new("None", []);

    /// <summary>
    /// The starter types for a kind of project, or a template with none when that kind has no starters yet. A kind
    /// without a template is not an error: it means an author of that kind defines every type themselves, which is
    /// also what happens to a kind whose template they decline.
    /// </summary>
    public static Template For(ProjectKind kind) => kind switch
    {
        ProjectKind.Game => GameTemplate,
        _ => Empty,
    };
}
