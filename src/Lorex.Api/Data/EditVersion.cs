namespace Lorex.Api.Data;

/// <summary>
/// The one refusal for a save written over content that changed after it was read (ADR 0043).
///
/// Every protected save names the <c>version</c> its editor started from as <c>expectedVersion</c>. Inside the write's own
/// transaction - SQLite's one writer, so nothing lands between the comparison and the write - a version that is not the
/// stored one is refused with a 409 and nothing is written. A missing version is refused the same way: a save that cannot
/// say what it was written over is never trusted to be current.
///
/// The refusal carries the resource's own <c>code</c> and the <c>currentVersion</c>, and nothing of the content: a client
/// reads the latest through the ordinary read, under the ordinary access check. It is only ever answered after that check
/// and after the content was found live in the universe, so it confirms nothing a 404 would not.
/// </summary>
public static class EditVersion
{
    /// <summary>Whether a save names the version as it is stored.</summary>
    public static bool Matches(int stored, int? expected) => expected == stored;

    /// <summary>The 409. <paramref name="also"/> is anything a resource's refusal carried before versions, kept as it was.</summary>
    public static IResult Changed(
        string code,
        string title,
        string detail,
        int currentVersion,
        IReadOnlyDictionary<string, object?>? also = null)
    {
        var extensions = new Dictionary<string, object?>
        {
            ["code"] = code,
            ["currentVersion"] = currentVersion,
        };

        foreach (var (key, value) in also ?? new Dictionary<string, object?>())
        {
            extensions[key] = value;
        }

        return Results.Problem(
            title: title,
            detail: detail,
            statusCode: StatusCodes.Status409Conflict,
            extensions: extensions);
    }
}
