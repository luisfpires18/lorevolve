namespace LorEvolve.Api.Features.Projects;

/// <summary>
/// The production formats a project can be made in (#288), each with the one kind it belongs to. The stored value is the
/// identifier, so a backup and an MCP reader see a readable word rather than a number nothing documents.
///
/// Adding a format is one line here (#293 adds the Comic ones). Validation, the API and the backup all read this map.
/// </summary>
public static class ProjectFormats
{
    public const int MaxLength = 40;

    private static readonly Dictionary<string, ProjectKind> KindOf = new(StringComparer.Ordinal)
    {
        ["feature-film"] = ProjectKind.Film,
        ["short-film"] = ProjectKind.Film,
        ["special"] = ProjectKind.Film,
        ["trailer"] = ProjectKind.Film,
        ["tv-show"] = ProjectKind.Series,
        ["limited-series"] = ProjectKind.Series,
    };

    /// <summary>True when <paramref name="format"/> is a known format that belongs to <paramref name="kind"/>.</summary>
    public static bool Allows(ProjectKind kind, string format) => KindOf.TryGetValue(format, out var owner) && owner == kind;
}
