using LorEvolve.Api.Features.Chronology;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The one comparison every chronology consumer shares. No host, no database: if these do not
/// hold, nothing built on them can.
///
/// The ordering always comes from the eras' configuration. Nothing here is named "before" or
/// "after" in a way the comparer could see, and one test deliberately configures an era whose
/// name says the opposite of its direction.
/// </summary>
public sealed class ChronologyPointTests
{
    private static readonly ChronologyEra BeforeTheFall = Era("Before the Fall", "BF", 0, ChronologyEraDirection.Descending);
    private static readonly ChronologyEra AfterTheFall = Era("After the Fall", "AF", 1, ChronologyEraDirection.Ascending);

    [Fact]
    public void A_descending_era_puts_its_larger_years_first()
    {
        Assert.True(Point(BeforeTheFall, 100) < Point(BeforeTheFall, 10));
        Assert.True(Point(BeforeTheFall, 10) < Point(BeforeTheFall, 1));
    }

    [Fact]
    public void The_last_year_of_one_era_comes_before_the_first_of_the_next()
    {
        Assert.True(Point(BeforeTheFall, 1) < Point(AfterTheFall, 1));
    }

    [Fact]
    public void An_ascending_era_puts_its_smaller_years_first()
    {
        Assert.True(Point(AfterTheFall, 1) < Point(AfterTheFall, 10));
    }

    [Fact]
    public void Every_year_of_an_earlier_era_comes_before_every_year_of_a_later_one()
    {
        Assert.True(Point(BeforeTheFall, 1) < Point(AfterTheFall, 1));
        Assert.True(Point(BeforeTheFall, 1_000_000) < Point(AfterTheFall, 1));
        Assert.True(Point(BeforeTheFall, 1) < Point(AfterTheFall, 1_000_000));
    }

    [Fact]
    public void Three_eras_sort_by_their_configured_order_and_each_ones_direction()
    {
        var dawn = Era("The Dawn", "D", 0, ChronologyEraDirection.Ascending);
        var longNight = Era("The Long Night", "LN", 1, ChronologyEraDirection.Descending);
        var return_ = Era("The Return", "R", 2, ChronologyEraDirection.Ascending);

        var expected = new[]
        {
            Point(dawn, 1),
            Point(dawn, 500),
            Point(longNight, 90),
            Point(longNight, 2),
            Point(return_, 1),
            Point(return_, 3),
        };

        var shuffled = new[] { expected[4], expected[1], expected[5], expected[2], expected[0], expected[3] };

        Assert.Equal(expected, shuffled.Order().ToArray());
    }

    [Fact]
    public void The_order_is_the_configuration_and_never_the_name()
    {
        // Named as if it came first and counted down; configured to come second and count up.
        var misleading = Era("Before Everything", "BE", 1, ChronologyEraDirection.Ascending);
        var first = Era("After Everything", "AE", 0, ChronologyEraDirection.Descending);

        Assert.True(Point(first, 1) < Point(misleading, 1));
        Assert.True(Point(misleading, 1) < Point(misleading, 2));
        Assert.True(Point(first, 2) < Point(first, 1));
    }

    [Fact]
    public void Months_and_days_run_forwards_even_in_a_year_that_counts_down()
    {
        Assert.True(Point(BeforeTheFall, 10, 1) < Point(BeforeTheFall, 10, 3));
        Assert.True(Point(BeforeTheFall, 10, 3, 1) < Point(BeforeTheFall, 10, 3, 22));
        Assert.True(Point(BeforeTheFall, 10, 12, 31) < Point(BeforeTheFall, 9, 1, 1));
    }

    [Fact]
    public void A_bare_year_sorts_before_anything_dated_inside_it()
    {
        Assert.True(Point(AfterTheFall, 5) < Point(AfterTheFall, 5, 1));
        Assert.True(ChronologyPoint.Plain(3018) < ChronologyPoint.Plain(3018, 9));
    }

    [Fact]
    public void Dropping_month_and_day_compares_by_the_year_alone()
    {
        Assert.Equal(Point(BeforeTheFall, 10), Point(BeforeTheFall, 10, 6, 2).YearOnly);
    }

    [Fact]
    public void Plain_signed_years_keep_the_order_lorevolve_always_had()
    {
        var years = new[] { 3019, -4200, 0, 1, -1, 3018 };

        Assert.Equal(
            [-4200, -1, 0, 1, 3018, 3019],
            years.Select(year => ChronologyPoint.Plain(year)).Order().Select(point => (int)point.Year).ToArray());
    }

    [Theory]
    [InlineData(1, true)]
    [InlineData(3441, true)]
    [InlineData(0, false)]
    [InlineData(-5, false)]
    [InlineData(1.5, false)]
    public void Inside_an_era_a_year_is_whole_and_counts_from_one(double year, bool allowed)
    {
        Assert.Equal(allowed, ChronologyPoint.IsEraYear(year));
    }

    [Fact]
    public void A_universe_without_eras_places_plain_years_only()
    {
        var plain = UniverseChronology.Plain;

        Assert.False(plain.NamesEras);
        Assert.Equal(ChronologyPoint.Plain(-42), plain.Point(null, -42));
        Assert.Null(plain.Point(Guid.NewGuid(), 42));
        Assert.Equal("-42", plain.FormatYear(null, -42));
        Assert.Equal("3441", plain.FormatYear(null, 3441.0));
    }

    [Fact]
    public void A_universe_with_eras_never_guesses_the_era_of_a_year_without_one()
    {
        var chronology = UniverseChronology.Of([AfterTheFall, BeforeTheFall]);

        Assert.True(chronology.NamesEras);
        Assert.Equal([BeforeTheFall, AfterTheFall], chronology.Eras);
        Assert.Null(chronology.Point(null, 10));
        Assert.Null(chronology.Point(Guid.NewGuid(), 10));
        Assert.Equal(Point(BeforeTheFall, 10), chronology.Point(BeforeTheFall.Id, 10));
    }

    [Fact]
    public void A_year_in_an_era_is_written_with_its_label_where_the_era_says()
    {
        var third = Era("Third Age", null, 2, ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear);
        var chronology = UniverseChronology.Of([BeforeTheFall, AfterTheFall, third]);

        Assert.Equal("BF 10", chronology.FormatYear(BeforeTheFall.Id, 10));
        Assert.Equal("3018 Third Age", chronology.FormatYear(third.Id, 3018));
    }

    private static ChronologyPoint Point(ChronologyEra era, int year, int? month = null, int? day = null) =>
        ChronologyPoint.InEra(era, year, month, day);

    private static ChronologyEra Era(
        string name,
        string? abbreviation,
        int order,
        ChronologyEraDirection direction,
        ChronologyLabelPosition position = ChronologyLabelPosition.BeforeYear) =>
        new()
        {
            Id = Guid.NewGuid(),
            Name = name,
            Abbreviation = abbreviation,
            SortOrder = order,
            Direction = direction,
            LabelPosition = position,
        };
}
