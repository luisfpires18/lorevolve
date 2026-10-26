namespace Lorex.Api.Features.Admin;

/// <summary>
/// One account as the Users grid shows it (#40). No email, no photo, no token: the id, the login name, the public name
/// the account chose (if any), its platform role and whether it is blocked.
/// </summary>
public sealed record AdminUserSummary(string Id, string Username, string? PublicDisplayName, string Role, bool IsBlocked);

public sealed record AdminUserPage(IReadOnlyList<AdminUserSummary> Items, int Page, int PageSize, int TotalCount, int TotalPages);

/// <summary>One audit record, as an Admin reads it. <c>ActorUsername</c> is null when that account no longer exists.</summary>
public sealed record AdminAuditEntry(Guid Id, string Action, string Reason, DateTime CreatedAt, string ActorUserId, string? ActorUsername);

/// <summary>
/// One account's metadata for an Admin (#40): counts of universes, never their names or anything in them; storage as the
/// account's own Profile reads it (ADR 0042); how many AI apps it has connected (ADR 0046); and its audit history.
/// What LoreX does not record - when the account was made, its last sign-in, any subscription - is absent here, and the
/// client says so rather than guessing.
/// </summary>
public sealed record AdminUserDetail(
    string Id,
    string Username,
    string? PublicDisplayName,
    string Role,
    bool IsBlocked,
    DateTime? BlockedAt,
    int OwnedUniverses,
    int SharedUniverses,
    long StorageUsedBytes,
    long StorageQuotaBytes,
    int ConnectedApps,
    IReadOnlyList<AdminAuditEntry> History);

/// <summary>Block or unblock: the reason is required and goes into the audit record.</summary>
public sealed record AdminActionRequest(string? Reason);

/// <summary>Universes created in one UTC calendar month.</summary>
public sealed record MonthCount(int Year, int Month, int Count);

/// <summary>
/// The Main dashboard (#40): only what LoreX already records, counted now, in UTC. Each figure's source is in
/// ADR 0059. Anything LoreX does not record is not here at all.
/// </summary>
public sealed record AdminOverview(
    DateTime GeneratedAt,
    int Accounts,
    int Admins,
    int BlockedAccounts,
    int Universes,
    int PublicUniverses,
    int Collaborations,
    long StoredImageBytes,
    int ConnectedApps,
    IReadOnlyList<MonthCount> UniversesCreatedByMonth);

/// <summary>The address an Admin's sign-up link lets register while registration is invitation-only.</summary>
public sealed record SignUpLinkRequest(string? Email);

/// <summary>The link's token (the client puts it in <c>/register?invite=</c>) and when it stops working.</summary>
public sealed record SignUpLinkResponse(string Token, DateTime ExpiresAt);
