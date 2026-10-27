using LorEvolve.Api.Features.Chronology;

namespace LorEvolve.Api.Tests;

/// <summary>
/// How far apart two years are, as a universe's chronology measures it. No host, no database.
///
/// The theme is the same restraint the Canon rules have: a distance is given only where the
/// configuration defines one. Eras store an order and a direction and no length, so most spans
/// across eras have no answer - and several tests here exist to prove the answer stays null rather
/// than becoming a plausible-looking number.
/// </summary>
public sealed class ChronologyYearsBetweenTests
{
    private static readonly ChronologyEra BeforeTheFall = Era("Before the Fall", 0, ChronologyEraDirection.Descending);
    private static readonly ChronologyEra AfterTheFall = Era("After the Fall", 1, ChronologyEraDirection.Ascending);
    private static readonly UniverseChronology TheFall = UniverseChronology.Of([BeforeTheFall, AfterTheFall]);

    [Fact]
    public void Plain_years_are_as_far_apart_as_their_difference()
    {
        var plain = UniverseChronology.Plain;

        Assert.Equal(322, plain.YearsBetween(ChronologyPoint.Plain(3119), ChronologyPoint.Plain(3441)));

        // The plain reckoning keeps year 0, so -5 to 5 is ten years.
        Assert.Equal(10, plain.YearsBetween(ChronologyPoint.Plain(-5), ChronologyPoint.Plain(5)));
        Assert.Equal(0, plain.YearsBetween(ChronologyPoint.Plain(0), ChronologyPoint.Plain(0)));
    }

    [Fact]
    public void The_order_of_the_two_years_does_not_matter()
    {
        Assert.Equal(
            TheFall.YearsBetween(In(AfterTheFall, 20), In(BeforeTheFall, 3)),
            TheFall.YearsBetween(In(BeforeTheFall, 3), In(AfterTheFall, 20)));

        Assert.Equal(18, TheFall.YearsBetween(In(AfterTheFall, 20), In(AfterTheFall, 2)));
    }

    [Fact]
    public void Two_years_in_one_ascending_era_are_their_difference()
    {
        Assert.Equal(18, TheFall.YearsBetween(In(AfterTheFall, 2), In(AfterTheFall, 20)));
    }

    [Fact]
    public void Two_years_in_one_descending_era_are_their_difference_too()
    {
        Assert.Equal(10, TheFall.YearsBetween(In(BeforeTheFall, 20), In(BeforeTheFall, 10)));
    }

    [Fact]
    public void A_countdown_into_the_era_that_counts_up_from_it_has_no_year_zero_between()
    {
        Assert.Equal(1, TheFall.YearsBetween(In(BeforeTheFall, 1), In(AfterTheFall, 1)));
        Assert.Equal(9, TheFall.YearsBetween(In(BeforeTheFall, 5), In(AfterTheFall, 5)));
        Assert.Equal(41, TheFall.YearsBetween(In(BeforeTheFall, 12), In(AfterTheFall, 30)));
    }

    [Fact]
    public void An_era_that_counts_up_has_no_known_end()
    {
        var dawn = Era("The Dawn", 0, ChronologyEraDirection.Ascending);
        var noon = Era("The Noon", 1, ChronologyEraDirection.Ascending);
        var chronology = UniverseChronology.Of([dawn, noon]);

        Assert.Null(chronology.YearsBetween(In(dawn, 1), In(noon, 1)));
    }

    [Fact]
    public void An_era_that_counts_down_has_no_known_start()
    {
        var dawn = Era("The Dawn", 0, ChronologyEraDirection.Ascending);
        var dusk = Era("The Dusk", 1, ChronologyEraDirection.Descending);
        Assert.Null(UniverseChronology.Of([dawn, dusk]).YearsBetween(In(dawn, 3), In(dusk, 3)));

        var first = Era("The First Countdown", 0, ChronologyEraDirection.Descending);
        var second = Era("The Second Countdown", 1, ChronologyEraDirection.Descending);
        Assert.Null(UniverseChronology.Of([first, second]).YearsBetween(In(first, 1), In(second, 1)));
    }

    [Fact]
    public void An_era_in_between_has_no_known_length()
    {
        var before = Era("Before", 0, ChronologyEraDirection.Descending);
        var between = Era("Between", 1, ChronologyEraDirection.Ascending);
        var after = Era("After", 2, ChronologyEraDirection.Ascending);
        var chronology = UniverseChronology.Of([before, between, after]);

        // The first boundary alone is known; carrying on past the middle era's end is not.
        Assert.Equal(2, chronology.YearsBetween(In(before, 1), In(between, 2)));
        Assert.Null(chronology.YearsBetween(In(before, 1), In(after, 1)));
    }

    [Fact]
    public void Several_eras_answer_at_every_boundary_their_configuration_defines()
    {
        var dawn = Era("The Dawn", 0, ChronologyEraDirection.Ascending);
        var longNight = Era("The Long Night", 1, ChronologyEraDirection.Descending);
        var return_ = Era("The Return", 2, ChronologyEraDirection.Ascending);
        var chronology = UniverseChronology.Of([return_, dawn, longNight]);

        Assert.Equal(92, chronology.YearsBetween(In(longNight, 90), In(return_, 3)));
        Assert.Null(chronology.YearsBetween(In(dawn, 500), In(longNight, 90)));
        Assert.Null(chronology.YearsBetween(In(dawn, 1), In(return_, 1)));
    }

    [Fact]
    public void The_distance_comes_from_the_configuration_and_never_the_name()
    {
        // Named as if it came after and counted up; configured to come first and count down.
        var misnamedFirst = Era("After Everything", 0, ChronologyEraDirection.Descending);
        var misnamedSecond = Era("Before Anything", 1, ChronologyEraDirection.Ascending);
        var chronology = UniverseChronology.Of([misnamedFirst, misnamedSecond]);

        Assert.Equal(9, chronology.YearsBetween(In(misnamedFirst, 5), In(misnamedSecond, 5)));
    }

    [Fact]
    public void Month_and_day_are_not_counted()
    {
        Assert.Equal(
            1,
            TheFall.YearsBetween(
                ChronologyPoint.InEra(AfterTheFall, 2, month: 12, day: 31),
                ChronologyPoint.InEra(AfterTheFall, 3, month: 1, day: 1)));
    }

    private static ChronologyPoint In(ChronologyEra era, double year) => ChronologyPoint.InEra(era, year);

    private static ChronologyEra Era(string name, int order, ChronologyEraDirection direction) =>
        new()
        {
            Id = Guid.NewGuid(),
            Name = name,
            SortOrder = order,
            Direction = direction,
        };
}
