using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Data;

/// <summary>
/// Says what a <see cref="DbUpdateException"/> actually was.
///
/// Every write that races another one ends in <see cref="DbUpdateException"/>, and so does every
/// write the database refused for a reason that has nothing to do with the request: a locked file,
/// a full disk, a broken connection. Translating the whole type into one domain refusal tells the
/// author their name was taken when the truth was that SQLite was busy, which is a lie they cannot
/// act on. These predicates keep the friendly refusal for the constraint it was written for and
/// let everything else fail as the failure it is.
///
/// Codes are SQLite's own: <c>SQLITE_CONSTRAINT</c> is 19, and the extended codes name which
/// constraint held. A busy or locked database is 5 or 6 and matches nothing here.
/// </summary>
internal static class DatabaseFailures
{
    private const int Constraint = 19;
    private const int ConstraintForeignKey = 787;
    private const int ConstraintPrimaryKey = 1555;
    private const int ConstraintUnique = 2067;

    /// <summary>
    /// Whether a unique index refused the write - the race two creates of the same name lose.
    /// </summary>
    internal static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is SqliteException sqlite
        && sqlite.SqliteErrorCode == Constraint
        && sqlite.SqliteExtendedErrorCode is ConstraintUnique or ConstraintPrimaryKey;

    /// <summary>
    /// Whether a unique index or a foreign key refused the write. For the writes whose expected
    /// loss is a row moving or vanishing underneath them, not only a duplicate. A check or a
    /// not-null column refusing is a bug in the write, not a race, so it fails as one.
    /// </summary>
    internal static bool IsConstraintViolation(DbUpdateException exception) =>
        exception.InnerException is SqliteException sqlite
        && sqlite.SqliteErrorCode == Constraint
        && sqlite.SqliteExtendedErrorCode is ConstraintUnique or ConstraintPrimaryKey or ConstraintForeignKey;
}
