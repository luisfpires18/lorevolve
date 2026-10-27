using LorEvolve.Api.Features.Publishing;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The stem of a public address, alone: lowercase ASCII letters, digits and single hyphens, accents
/// folded, anything else a word break, <c>world</c> when nothing is left, and never longer than a slug
/// has room for. Uniqueness and stability are proven over HTTP in <see cref="UniversePublicationTests"/>.
/// </summary>
public sealed class PublicSlugTests
{
    [Theory]
    [InlineData("The Nail Ark", "the-nail-ark")]
    [InlineData("  The   Nail---Ark!!  ", "the-nail-ark")]
    [InlineData("Ilúvatar's Song", "iluvatar-s-song")]
    [InlineData("Crème Brûlée", "creme-brulee")]
    [InlineData("Straße der Æsir", "strasse-der-aesir")]
    [InlineData("Ørnen og Łódź", "ornen-og-lodz")]
    [InlineData("ＦＵＬＬ　ＷＩＤＴＨ", "full-width")]
    [InlineData("Book 2: The Return (Draft)", "book-2-the-return-draft")]
    [InlineData("آكرون — 12 / Wright", "12-wright")]
    [InlineData("עיר 7", "7")]
    [InlineData("عالم الظلال", "world")]
    [InlineData("北の門", "world")]
    [InlineData("!!! ???", "world")]
    [InlineData("🐉 Dragons", "dragons")]
    public void A_name_becomes_a_plain_stem(string name, string stem) =>
        Assert.Equal(stem, PublicSlugs.Stem(name));

    [Fact]
    public void A_long_name_is_cut_at_a_word_and_never_ends_on_a_hyphen()
    {
        var stem = PublicSlugs.Stem(string.Join(' ', Enumerable.Repeat("chronicle", 20)));

        Assert.True(stem.Length <= 60, stem);
        Assert.EndsWith("chronicle", stem, StringComparison.Ordinal);
        Assert.DoesNotContain("--", stem, StringComparison.Ordinal);
    }

    [Fact]
    public void A_long_word_is_cut_where_it_must_be()
    {
        var stem = PublicSlugs.Stem(new string('a', 200));

        Assert.Equal(new string('a', 60), stem);
    }
}
