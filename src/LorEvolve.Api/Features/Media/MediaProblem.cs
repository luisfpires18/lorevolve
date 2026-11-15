namespace LorEvolve.Api.Features.Media;

/// <summary>
/// The one refusal for a request that needed object storage and did not get it (Issue #108).
///
/// Six features upload or read pictures, and each answered a <see cref="MediaStorageException"/> with its own copy of
/// the same 503. They now share this one, so the refusal carries one stable <c>code</c> rather than a different one per
/// feature: a client that has words for "image storage is unavailable" has them everywhere, and the web app's
/// dictionary needs a single entry.
///
/// The exception's own message is LorEvolve's sentence and is safe to show (see <see cref="MediaStorageException"/>),
/// so it stays the <c>detail</c>, in English, for a client that has no words for the code.
/// </summary>
public static class MediaProblem
{
    /// <summary>Stable marker for the 503 when object storage is not configured or did not answer.</summary>
    public const string UnavailableCode = "image_storage_unavailable";

    /// <summary>The 503.</summary>
    public static IResult Unavailable(MediaStorageException exception) =>
        Results.Problem(
            title: "Image storage is unavailable.",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable,
            extensions: new Dictionary<string, object?> { ["code"] = UnavailableCode });
}
