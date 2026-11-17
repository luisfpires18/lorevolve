namespace LorEvolve.Api.Features.Projects;

/// <summary>
/// Which structure levels a format holds and where (#290). The only thing a later format issue edits: #291 adds
/// tv-show and limited-series, #292 trailer, #294 the comic formats. The engine
/// (<see cref="ProjectEntities.StructureEndpoints"/>), the backup validation and the outline UI all read this map, and
/// the UI receives it with the tree, so it holds no copy.
///
/// <para>An optional level is optional because its parent lists both it and the level below it (an act holds
/// sequences or scenes). Nothing is ever created for the author; an empty structure is valid.</para>
/// </summary>
public static class ProjectStructures
{
    /// <summary>Roots: the levels allowed with no parent. Children: level to the levels it may hold.</summary>
    public sealed record Rules(string[] Roots, IReadOnlyDictionary<string, string[]> Children);

    private static readonly Rules SceneBeat = new(["scene"], new Dictionary<string, string[]>
    {
        ["scene"] = ["beat"],
        ["beat"] = [],
    });

    private static readonly Dictionary<string, Rules> ByFormat = new(StringComparer.Ordinal)
    {
        ["feature-film"] = new(["act"], new Dictionary<string, string[]>
        {
            ["act"] = ["sequence", "scene"],
            ["sequence"] = ["scene"],
            ["scene"] = ["beat"],
            ["beat"] = [],
        }),
        ["short-film"] = SceneBeat,
        ["special"] = SceneBeat,
    };

    /// <summary>The rules of a format, or null when it has no node structure (no format, or not supported yet).</summary>
    public static Rules? For(string? format) => format is not null && ByFormat.TryGetValue(format, out var rules) ? rules : null;

    public static bool AllowsRoot(Rules rules, string level) => rules.Roots.Contains(level, StringComparer.Ordinal);

    public static bool AllowsChild(Rules rules, string parentLevel, string level) =>
        rules.Children.TryGetValue(parentLevel, out var children) && children.Contains(level, StringComparer.Ordinal);

    /// <summary>True when <paramref name="level"/> may sit under <paramref name="parentLevel"/>, or at the root when null.</summary>
    public static bool Allows(Rules rules, string? parentLevel, string level) =>
        parentLevel is null ? AllowsRoot(rules, level) : AllowsChild(rules, parentLevel, level);
}
