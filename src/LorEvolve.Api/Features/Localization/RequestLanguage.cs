namespace LorEvolve.Api.Features.Localization;

/// <summary>
/// The language a request is written for (ADR 0071). The web app sends `Accept-Language` with the reader's own choice,
/// the one they made in the switch, not the browser's list; anything else, including a request with no header at all,
/// is English.
///
/// This is deliberately small. The API's text is a handful of places - two emails, the starter types a new universe is
/// given, the line that tells the assistant which language to answer in - so each of those holds its own words beside
/// the English, in the same shape the web app's dictionary uses. There is no resource file and no
/// <c>IStringLocalizer</c>: a feature that needs a second language adds a <c>switch</c>, and one that needs none says
/// nothing.
/// </summary>
public static class RequestLanguage
{
    /// <summary>What LorEvolve writes in. Mirrors the web app's `LOCALES` (`src/i18n/locales.ts`).</summary>
    public const string English = "en";

    public const string Portuguese = "pt-PT";

    /// <summary>
    /// The language for this request: the first tag in `Accept-Language` LorEvolve has words for, matched on its base so
    /// `pt`, `pt-BR` and `pt-PT` all read as European Portuguese, else English. Quality values are honoured by order
    /// only, which is what the web app sends: one tag, the reader's choice.
    /// </summary>
    public static string Of(HttpRequest request)
    {
        foreach (var value in request.Headers.AcceptLanguage)
        {
            foreach (var part in (value ?? string.Empty).Split(','))
            {
                var tag = part.Split(';')[0].Trim();
                if (tag.Length == 0 || tag == "*")
                {
                    continue;
                }

                if (IsBase(tag, "pt"))
                {
                    return Portuguese;
                }

                if (IsBase(tag, "en"))
                {
                    return English;
                }
            }
        }

        return English;
    }

    /// <summary>
    /// Whether a tag is that language: the base subtag itself, or the base followed by a region or script
    /// (`pt`, `pt-PT`, `pt-BR`). A tag that merely starts with the same letters is a different language, so
    /// `ptx` and `english` are not matches and fall through to English.
    /// </summary>
    private static bool IsBase(string tag, string language) =>
        tag.Equals(language, StringComparison.OrdinalIgnoreCase)
        || (tag.Length > language.Length
            && tag[language.Length] == '-'
            && tag.AsSpan(0, language.Length).Equals(language, StringComparison.OrdinalIgnoreCase));

    /// <summary>The language's own name, for telling the assistant which one to answer in.</summary>
    public static string NameOf(string language) => language == Portuguese ? "European Portuguese" : "English";
}
