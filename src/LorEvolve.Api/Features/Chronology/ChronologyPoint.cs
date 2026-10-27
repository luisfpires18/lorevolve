namespace LorEvolve.Api.Features.Chronology;

/// <summary>
/// One position on a universe's line of time, reduced to four numbers that sort.
///
/// This is the only place LorEvolve decides what "earlier" means. The timeline's range check,
/// every chronology rule in Canon Integrity and the birth and death years they read all
/// compare these, and the timeline listing's SQL ordering is the same key written as a query
/// (a test holds the two together). Nothing compares a formatted date, and nothing compares an
/// era by its name.
///
/// <list type="bullet">
/// <item><see cref="EraRank"/> is the era's place in the universe's order. A plain signed year
/// in a universe with no eras has rank 0 and is never compared with a year inside an era,
/// because a universe is always one or the other.</item>
/// <item><see cref="Year"/> is signed by the era's direction: a descending era's year 10 is
/// stored here as -10, so it sorts before its year 1. Nothing about "before" or "after" is
/// special-cased; the author's configuration decides the sign.</item>
/// <item><see cref="Month"/> and <see cref="Day"/> are 0 when absent, so a bare year sorts
/// before any dated moment inside it. They always ascend - even in a year that counts down,
/// the third month of it comes after the first.</item>
/// </list>
///
/// A double rather than an integer year, because a declared birth year is a Number field and
/// every custom number is stored as one. Inside an era a year is validated whole and at least
/// <see cref="FirstEraYear"/>, so the double is exact.
/// </summary>
public readonly record struct ChronologyPoint(int EraRank, double Year, int Month, int Day)
    : IComparable<ChronologyPoint>
{
    /// <summary>
    /// Inside an era, years count from 1. There is no year 0 in an era: the era's own label
    /// carries what a sign would, and "BF 0" beside "AF 0" would be two names for a moment no
    /// author asked for. A plain signed year keeps 0 and negatives, as it always has.
    /// </summary>
    public const int FirstEraYear = 1;

    /// <summary>A year on a universe that names no eras: the signed number, as written.</summary>
    public static ChronologyPoint Plain(double year, int? month = null, int? day = null) =>
        new(0, year, month ?? 0, day ?? 0);

    /// <summary>A year counted inside <paramref name="era"/>, placed by the era's order and direction.</summary>
    public static ChronologyPoint InEra(ChronologyEra era, double year, int? month = null, int? day = null) =>
        new(era.SortOrder, SignedYear(era.Direction, year), month ?? 0, day ?? 0);

    /// <summary>
    /// The within-era sort value of a year. Exposed so the timeline's SQL ordering and this type
    /// cannot mean two different things by "direction".
    /// </summary>
    public static double SignedYear(ChronologyEraDirection direction, double year) =>
        direction == ChronologyEraDirection.Descending ? -year : year;

    /// <summary>
    /// A custom month's place in the year, from 1: its position in the calendar's current order. Simple month N and the
    /// custom month at position N rank alike, so turning a calendar on or off never moves a date. The timeline's SQL writes
    /// the same rule as <c>SortOrder + 1</c>; a test holds the two together.
    /// </summary>
    public static int MonthRank(ChronologyCalendarMonth month) => month.SortOrder + 1;

    /// <summary>Whether a year can be written inside an era: whole, and counted from 1.</summary>
    public static bool IsEraYear(double year) =>
        year >= FirstEraYear && year <= int.MaxValue && Math.Floor(year) == year;

    /// <summary>The same point with month and day dropped, for comparing against a bare year.</summary>
    public ChronologyPoint YearOnly => this with { Month = 0, Day = 0 };

    public int CompareTo(ChronologyPoint other)
    {
        var byEra = EraRank.CompareTo(other.EraRank);
        if (byEra != 0)
        {
            return byEra;
        }

        var byYear = Year.CompareTo(other.Year);
        if (byYear != 0)
        {
            return byYear;
        }

        var byMonth = Month.CompareTo(other.Month);
        return byMonth != 0 ? byMonth : Day.CompareTo(other.Day);
    }

    public static bool operator <(ChronologyPoint left, ChronologyPoint right) => left.CompareTo(right) < 0;

    public static bool operator >(ChronologyPoint left, ChronologyPoint right) => left.CompareTo(right) > 0;

    public static bool operator <=(ChronologyPoint left, ChronologyPoint right) => left.CompareTo(right) <= 0;

    public static bool operator >=(ChronologyPoint left, ChronologyPoint right) => left.CompareTo(right) >= 0;
}
