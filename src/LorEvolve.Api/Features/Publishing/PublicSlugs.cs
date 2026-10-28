using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// A public address: a universe's, <c>/worlds/{slug}</c>; inside it a lore entry's or a story's; and an author's,
/// <c>/authors/{slug}</c>, from their public name (ADR 0037). Minted
/// once, from the name or title, the first time it is published, and never changed after - not by a rename, not
/// by unpublishing (ADR 0036). One generator for all three, so they cannot drift apart.
///
/// <para><b>ASCII only.</b> Letters and digits a-z, 0-9 and single hyphens. Accents fold away
/// ("Ilúvatar" is <c>iluvatar</c>, "Straße" <c>strasse</c>) and every other character is a word
/// break. A name with nothing left - Arabic, Hebrew, Chinese, punctuation - takes the kind's fallback:
/// <c>world</c>, <c>entry</c>, <c>story</c> or <c>author</c>. A
/// Unicode address was the alternative and was refused: mixed-direction text and look-alike
/// letters are how an address is made to read as another one. The name itself is never changed
/// for the address; it is shown exactly as written.</para>
///
/// <para><b>Unique in its namespace, and deterministic.</b> A universe's across LorEvolve; an entry's among its
/// universe's entries, a story's among its universe's stories - an entry and a story may share one, since they
/// live under different route segments. The first to take a stem has it; the next gets <c>-2</c>, then
/// <c>-3</c>, whatever is free at the moment it is published - an item in the Trash keeps its address, so it is
/// still taken. No account, id or clock is in it.</para>
/// </summary>
internal static class PublicSlugs
{
    /// <summary>Room for a collision suffix inside <see cref="PublicationLimits.SlugMaxLength"/>.</summary>
    private const int StemMaxLength = 60;

    public const string UniverseFallback = "world";
    public const string LoreFallback = "entry";
    public const string StoryFallback = "story";
    public const string AuthorFallback = "author";

    /// <summary>
    /// The Latin letters of Latin-1 and Latin Extended-A, folded to plain ones. A table rather than
    /// Unicode decomposition, because LorEvolve runs with invariant globalization and has no normalization
    /// data; this covers the letters of the European languages written in Latin script. A Latin letter
    /// outside it (Vietnamese, say) is a word break, like any other script.
    /// </summary>
    private static readonly Dictionary<char, string> Folded = Fold(
        ("a", "àáâãäåāăą"), ("c", "çćĉċč"), ("d", "ďđð"), ("e", "èéêëēĕėęě"), ("g", "ĝğġģ"),
        ("h", "ĥħ"), ("i", "ìíîïĩīĭįı"), ("j", "ĵ"), ("k", "ķĸ"), ("l", "ĺļľŀł"), ("n", "ñńņňŉŋ"),
        ("o", "òóôõöøōŏő"), ("r", "ŕŗř"), ("s", "śŝşšſ"), ("t", "ţťŧ"), ("u", "ùúûüũūŭůűų"),
        ("w", "ŵ"), ("y", "ýÿŷ"), ("z", "źżž"),
        ("ss", "ß"), ("ae", "æ"), ("oe", "œ"), ("th", "þ"), ("ij", "ĳ"));

    /// <summary>The address a name would have if nothing else had taken it.</summary>
    public static string Stem(string name, string fallback = UniverseFallback)
    {
        var slug = new StringBuilder(StemMaxLength);

        foreach (var letter in name.ToLowerInvariant())
        {
            // Full-width letters and digits are ASCII drawn wide.
            var character = letter is >= '０' and <= '９' or >= 'ａ' and <= 'ｚ'
                ? (char)(letter - 0xFEE0)
                : letter;

            if (char.IsAsciiLetterOrDigit(character))
            {
                slug.Append(character);
            }
            else if (Folded.TryGetValue(character, out var folded))
            {
                slug.Append(folded);
            }
            else if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark
                && slug.Length > 0
                && slug[^1] != '-')
            {
                // Anything else separates words; an accent is part of the letter before it.
                slug.Append('-');
            }
        }

        var stem = slug.ToString().Trim('-');

        if (stem.Length > StemMaxLength)
        {
            // Cut at a word where one ends in the second half, so a long name keeps whole words.
            stem = stem[..StemMaxLength];
            var lastBreak = stem.LastIndexOf('-');
            stem = (lastBreak >= StemMaxLength / 2 ? stem[..lastBreak] : stem).TrimEnd('-');
        }

        return stem.Length > 0 ? stem : fallback;
    }

    private static Dictionary<char, string> Fold(params (string Plain, string Letters)[] groups) =>
        groups.SelectMany(group => group.Letters.Select(letter => (letter, group.Plain)))
            .ToDictionary(pair => pair.letter, pair => pair.Plain);

    /// <summary>
    /// The first free address for <paramref name="name"/> among <paramref name="taken"/> - every address already held
    /// in the namespace. Called inside the publishing transaction, which holds SQLite's one writer, so nothing can take
    /// the answer before it is written; the unique index is the guarantee either way.
    /// </summary>
    public static async Task<string> ChooseAsync(
        IQueryable<string?> taken,
        string name,
        string fallback,
        CancellationToken cancellationToken)
    {
        var stem = Stem(name, fallback);
        var numbered = stem + "-";

        var held = (await taken
                .Where(slug => slug == stem || slug!.StartsWith(numbered))
                .Select(slug => slug!)
                .ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.Ordinal);

        if (!held.Contains(stem))
        {
            return stem;
        }

        for (var suffix = 2; ; suffix++)
        {
            var candidate = $"{stem}-{suffix.ToString(CultureInfo.InvariantCulture)}";
            if (!held.Contains(candidate))
            {
                return candidate;
            }
        }
    }
}
