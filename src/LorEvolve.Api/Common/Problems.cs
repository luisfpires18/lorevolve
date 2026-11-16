namespace LorEvolve.Api.Common;

/// <summary>The 400 every endpoint answers with when one field is wrong.</summary>
internal static class Problems
{
    public static IResult Field(
        string field,
        string message,
        string? detail = null,
        string? title = null,
        IDictionary<string, object?>? extensions = null) =>
        Results.ValidationProblem(
            new Dictionary<string, string[]> { [field] = [message] },
            detail: detail,
            title: title,
            extensions: extensions);
}
