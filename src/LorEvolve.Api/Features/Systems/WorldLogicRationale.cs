using System.Text.Json;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// The evaluator's rationale trace as the column stores it, and back.
///
/// A JSON array of strings, so the lines survive as lines: the trace is read back and shown as a list, and joining
/// it into one string would make a line containing a separator unreadable. A condition is capped at 256 nodes on
/// save, so a trace is bounded already, but a long one is still dropped from the end rather than truncated
/// mid-array, because half a JSON document reads back as nothing at all.
/// </summary>
public static class WorldLogicRationale
{
    /// <summary>The lines as stored text, never longer than the column holds.</summary>
    public static string Store(IReadOnlyList<string> lines)
    {
        var kept = lines.Count;

        while (true)
        {
            var json = JsonSerializer.Serialize(lines.Take(kept));

            if (json.Length <= WorldLogicFindingLimits.RationaleMaxLength || kept == 0)
            {
                return json;
            }

            kept--;
        }
    }

    /// <summary>
    /// The stored lines. Text that does not parse reads back as no rationale rather than failing the request: the
    /// trace is diagnostic, and a finding without it is still a finding.
    /// </summary>
    public static IReadOnlyList<string> Read(string stored)
    {
        try
        {
            return JsonSerializer.Deserialize<List<string>>(stored) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
