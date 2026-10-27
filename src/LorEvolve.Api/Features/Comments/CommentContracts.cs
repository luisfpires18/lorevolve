namespace LorEvolve.Api.Features.Comments;

/// <summary>A new thread's first comment, or a reply. Plain text, trimmed; blank is refused.</summary>
public sealed record CommentRequest(string? Body);

/// <summary>
/// One comment. <paramref name="AuthorName"/> is the author's username and nothing else of the account; null when the
/// account can no longer be found.
/// </summary>
public sealed record CommentResponse(Guid Id, string? AuthorName, string Body, DateTime CreatedAt);

/// <summary>
/// A thread, its first comment first and its replies after, oldest first. <paramref name="ResolvedByName"/> and
/// <paramref name="ResolvedAt"/> are set while it is resolved.
/// </summary>
public sealed record CommentThreadResponse(
    Guid Id,
    bool IsResolved,
    string? ResolvedByName,
    DateTime? ResolvedAt,
    IReadOnlyList<CommentResponse> Comments);
