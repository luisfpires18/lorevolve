namespace LorEvolve.Api.Features.Universes;

// ---------- The owner's side ----------

/// <summary>An invitation to create: an address and the role accepting gives. Nothing else is bound.</summary>
public sealed record InvitationRequest(string? Email, UniverseRole? Role);

/// <summary>A new role, for a pending invitation or an accepted collaborator.</summary>
public sealed record CollaboratorRoleRequest(UniverseRole? Role);

/// <summary>
/// An accepted collaborator, as the owner manages them: the account's id (the address of its routes), its username and
/// its role. No email, no profile, nothing else of the account.
/// </summary>
public sealed record CollaboratorResponse(string UserId, string Username, UniverseRole Role, DateTime JoinedAt);

/// <summary>
/// A pending invitation, as its owner sees it: the address they typed, the role, when it lapses, and a freshly protected
/// <see cref="ClaimToken"/> for its link. Identical in shape whether or not an account held the address: whether it is
/// bound to one is never said.
/// </summary>
public sealed record PendingInvitationResponse(
    Guid Id,
    string Email,
    UniverseRole Role,
    DateTime CreatedAt,
    DateTime ExpiresAt,
    string ClaimToken);

/// <summary>Who works on a universe besides its owner, and who has been asked to. Expired invitations are left out.</summary>
public sealed record CollaboratorsResponse(
    IReadOnlyList<CollaboratorResponse> Members,
    IReadOnlyList<PendingInvitationResponse> Invitations);

// ---------- The invitee's side ----------

/// <summary>
/// An invitation addressed to the signed-in account: the universe it opens and the role it gives. Only ever answered to
/// the account whose email it names.
/// </summary>
public sealed record ReceivedInvitationResponse(Guid Id, Guid UniverseId, string UniverseName, UniverseRole Role, DateTime ExpiresAt);

/// <summary>Where an accepted invitation leads.</summary>
public sealed record AcceptedInvitationResponse(Guid UniverseId, UniverseRole Role);
