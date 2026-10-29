using System.Text.RegularExpressions;

namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// A Lore mention inside a scene's plain-text manuscript (issue 31, ADR 0058): <c>@[Akron Wright](lore:&lt;entry id&gt;)</c>.
///
/// The manuscript stays plain text. A mention is ordinary characters the author can type, paste, undo and delete like any
/// others; it is a mention only while it matches this exact pattern, so no hidden state can disagree with the text. The id
/// is the identity - resolved only against the entries of the manuscript's own universe, never by name - and the name in
/// brackets is what the author's prose said when the mention was chosen, the fallback whenever the id resolves to nothing.
///
/// The one place on the server that knows the shape: reading prose as prose (<see cref="Plain"/>), listing mentions
/// (<see cref="Find"/>) and giving a restored universe its new ids (<see cref="Remap"/>). The web client mirrors it in
/// <c>lore/mentions.ts</c>.
/// </summary>
public static partial class ManuscriptMentions
{
    /// <summary>The longest name a mention may carry. Longer brackets are prose, not a mention.</summary>
    public const int NameMaxLength = 200;

    public sealed record Mention(int Start, int Length, string Name, Guid EntityId);

    [GeneratedRegex(@"@\[([^\[\]\r\n]{1,200})\]\(lore:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)", RegexOptions.CultureInvariant)]
    private static partial Regex Token();

    /// <summary>A mention cut by an excerpt's start: the tail of its name, then its markup.</summary>
    [GeneratedRegex(@"^([^\[\]\r\n]*)\]\(lore:[0-9a-fA-F-]{0,36}\)?", RegexOptions.CultureInvariant)]
    private static partial Regex CutHead();

    /// <summary>A mention cut by an excerpt's end: its opening, the start of its name, and maybe some of its markup.</summary>
    [GeneratedRegex(@"@\[([^\[\]\r\n]*)(?:\]\(lore:[0-9a-fA-F-]{0,36})?$", RegexOptions.CultureInvariant)]
    private static partial Regex CutTail();

    /// <summary>Every mention in <paramref name="text"/>, in order.</summary>
    public static IReadOnlyList<Mention> Find(string? text) =>
        string.IsNullOrEmpty(text)
            ? []
            : [.. Token().Matches(text).Select(match => new Mention(match.Index, match.Length, match.Groups[1].Value, Guid.Parse(match.Groups[2].Value)))];

    /// <summary>
    /// The prose as a reader reads it: every mention as the name the author wrote, in plain text. What the public page, the
    /// assistant and an outside app over MCP are given. Text with no mention comes back as the same string.
    /// </summary>
    public static string Plain(string text) =>
        text.Contains("](lore:", StringComparison.Ordinal) ? Token().Replace(text, match => match.Groups[1].Value) : text;

    /// <summary>
    /// <see cref="Plain"/>, with each mention where its name now sits in the plain text - what the public story page needs to
    /// link a mention whose entry is itself public (ADR 0058 amendment).
    /// </summary>
    public static (string Text, IReadOnlyList<Mention> Mentions) PlainWithMentions(string text)
    {
        var mentions = new List<Mention>();
        var plain = new System.Text.StringBuilder(text.Length);
        var at = 0;
        foreach (var mention in Find(text))
        {
            plain.Append(text, at, mention.Start - at);
            mentions.Add(mention with { Start = plain.Length, Length = mention.Name.Length });
            plain.Append(mention.Name);
            at = mention.Start + mention.Length;
        }

        return mentions.Count == 0 ? (text, mentions) : (plain.Append(text, at, text.Length - at).ToString(), mentions);
    }

    /// <summary>
    /// <see cref="Plain"/>, for a window into the prose that may cut a mention in two: whatever of a mention's markup is left
    /// at either edge goes too and the part of the name it held stays, so a passage never shows <c>](lore:</c> to a reader.
    /// </summary>
    public static string PlainExcerpt(string text) => CutTail().Replace(CutHead().Replace(Plain(text), "$1"), "$1");

    /// <summary>
    /// Every mention's id put through <paramref name="map"/> - the one rewrite a restore makes inside authored text (ADR 0058).
    /// An id the map does not hold is left exactly as it is: it names nothing in the new universe and reads as its name.
    /// Nothing but the id inside a well-formed mention is ever touched.
    /// </summary>
    public static string Remap(string text, Func<Guid, Guid?> map) =>
        text.Contains("](lore:", StringComparison.Ordinal)
            ? Token().Replace(text, match =>
                map(Guid.Parse(match.Groups[2].Value)) is { } mapped
                    ? $"@[{match.Groups[1].Value}](lore:{mapped:D})"
                    : match.Value)
            : text;
}
