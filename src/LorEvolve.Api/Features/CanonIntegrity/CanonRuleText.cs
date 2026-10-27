using System.Globalization;
using LorEvolve.Api.Features.Lore;

namespace LorEvolve.Api.Features.CanonIntegrity;

/// <summary>
/// The wording rules share. Titles and explanations are written for the author, so they
/// name the records rather than their ids, and they always end with what can be done
/// about it - a conflict that only says something is wrong is not worth showing.
/// </summary>
internal static class CanonRuleText
{
    /// <summary>
    /// Truncates on a word boundary where it can, so a long title ends readably rather
    /// than mid-word. The column limits are the hard constraint; this keeps under them.
    /// </summary>
    public static string Fit(string text, int maxLength)
    {
        if (text.Length <= maxLength)
        {
            return text;
        }

        var cut = text[..(maxLength - 1)];
        var lastSpace = cut.LastIndexOf(' ');

        if (lastSpace > maxLength / 2)
        {
            cut = cut[..lastSpace];
        }

        return cut.TrimEnd() + "…";
    }

    public static string Title(string text) => Fit(text, CanonIntegrityLimits.TitleMaxLength);

    public static string Explanation(string text) =>
        Fit(text, CanonIntegrityLimits.ExplanationMaxLength);

    /// <summary>Quotes a name so a title reads as a sentence about a record.</summary>
    public static string Quoted(string name) => $"“{name}”";

    /// <summary>A number of years as a sentence reads it: "1 year", "12 years", "8.5 years".</summary>
    public static string Years(double years) =>
        years == 1 ? "1 year" : $"{years.ToString("0.####", CultureInfo.InvariantCulture)} years";

    public static string StatusWord(CanonStatus status) => status switch
    {
        CanonStatus.Idea => "an Idea",
        CanonStatus.Draft => "a Draft",
        _ => "Canon",
    };
}
