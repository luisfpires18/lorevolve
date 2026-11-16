namespace LorEvolve.Api.Common;

internal static class Sql
{
    /// <summary>Escapes the LIKE wildcards so a search for "100%" cannot match everything.</summary>
    public static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
}
