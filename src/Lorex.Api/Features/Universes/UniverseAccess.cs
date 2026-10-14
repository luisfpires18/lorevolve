using System.Security.Claims;
using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Universes;

/// <summary>
/// What a route under a universe asks permission for (ADR 0041). Named capabilities rather than a role threshold, so a
/// role can later gain one (a Reviewer commenting) without gaining the rest.
/// </summary>
public enum UniverseCapability
{
    /// <summary>Read the live universe: lore, stories, timeline, rules, search and every derived view.</summary>
    Read,

    /// <summary>Create and edit ordinary creative content, its taxonomy and its media.</summary>
    EditContent,

    /// <summary>Move content to the Trash, list it, and restore from it.</summary>
    ManageTrash,

    /// <summary>Read saved versions and restore one. History can hold what the live universe no longer shows.</summary>
    ManageHistory,

    /// <summary>Erase from the Trash for good. The owner's recovery copy, so the owner's alone.</summary>
    PermanentlyDelete,

    /// <summary>Rename, describe, archive, unarchive and delete the universe itself.</summary>
    ManageUniverse,

    /// <summary>Everything about public exposure: the universe, its content, its public details and artwork.</summary>
    Publish,

    /// <summary>Export the whole universe as a backup.</summary>
    Backup,

    /// <summary>Invite people, change their roles and remove them.</summary>
    ManageCollaborators,

    /// <summary>Start a review thread on content and reply to one (task 043). Reading comments is <see cref="Read"/>.</summary>
    Comment,

    /// <summary>Resolve a review thread and reopen it.</summary>
    ResolveComments,

    /// <summary>
    /// Propose changes to an entry, story or scene for someone else to accept (task 045). Never a write to the content
    /// itself. Reading suggestions is <see cref="Read"/>.
    /// </summary>
    SuggestChanges,

    /// <summary>Accept a suggestion - which then saves it as an ordinary edit - or reject it.</summary>
    ResolveSuggestedChanges,
}

/// <summary>
/// The one gate every private route under a universe passes through (ADR 0041, superseding ADR 0006's owner-only
/// rule). The caller is the authenticated principal, never an id from the request.
///
/// A caller with no access at all gets the same 404 as a universe that does not exist, so another author's private
/// world stays undiscoverable. A member asking for something their role does not allow gets 403
/// <see cref="PermissionDeniedCode"/>: they already know the universe is there.
/// </summary>
public static class UniverseAccess
{
    public const string PermissionDeniedCode = "universe_permission_denied";

    /// <summary>
    /// The caller's effective role, or null when the universe is missing or they have no access to it. Ownership wins
    /// over any membership row. One query.
    /// </summary>
    public static Task<UniverseRole?> RoleAsync(
        LorexDbContext db,
        Guid universeId,
        string userId,
        CancellationToken cancellationToken) =>
        db.Universes.AsNoTracking()
            .Where(universe => universe.Id == universeId)
            .Select(universe => universe.OwnerId == userId
                ? (UniverseRole?)UniverseRole.Owner
                : db.UniverseMemberships
                    .Where(membership => membership.UniverseId == universe.Id && membership.UserId == userId)
                    .Select(membership => (UniverseRole?)membership.Role)
                    .FirstOrDefault())
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>Whether a role carries a capability. The whole permission matrix lives here and nowhere else.</summary>
    public static bool Allows(UniverseRole role, UniverseCapability capability) => capability switch
    {
        UniverseCapability.Read =>
            role is UniverseRole.Owner or UniverseRole.Editor or UniverseRole.Reviewer or UniverseRole.Viewer,
        UniverseCapability.Comment or UniverseCapability.SuggestChanges =>
            role is UniverseRole.Owner or UniverseRole.Editor or UniverseRole.Reviewer,
        UniverseCapability.EditContent or UniverseCapability.ManageTrash or UniverseCapability.ManageHistory
            or UniverseCapability.ResolveComments or UniverseCapability.ResolveSuggestedChanges =>
            role is UniverseRole.Owner or UniverseRole.Editor,
        UniverseCapability.PermanentlyDelete or UniverseCapability.ManageUniverse or UniverseCapability.Publish
            or UniverseCapability.Backup or UniverseCapability.ManageCollaborators =>
            role is UniverseRole.Owner,
        _ => false,
    };

    /// <summary>
    /// Null when the caller may do this; otherwise the answer to send: 404 without access, 403 with too little.
    /// </summary>
    public static async Task<IResult?> DenyAsync(
        LorexDbContext db,
        Guid universeId,
        ClaimsPrincipal principal,
        UniverseCapability capability,
        CancellationToken cancellationToken) =>
        (await AuthorizeAsync(db, universeId, principal, capability, cancellationToken)).Denied;

    /// <summary>
    /// <see cref="DenyAsync"/>, and the caller's role when they may go on - for a route whose effect depends on what else
    /// the role carries (an Editor's restore never publishes). One query.
    /// </summary>
    public static async Task<(IResult? Denied, UniverseRole Role)> AuthorizeAsync(
        LorexDbContext db,
        Guid universeId,
        ClaimsPrincipal principal,
        UniverseCapability capability,
        CancellationToken cancellationToken)
    {
        var role = await RoleAsync(db, universeId, principal.RequireUserId(), cancellationToken);

        if (role is not { } effective)
        {
            return (Results.NotFound(), default);
        }

        return Allows(effective, capability) ? (null, effective) : (PermissionDenied(), effective);
    }

    /// <summary>The single refusal for a member lacking a capability. It names nothing about what the role lacks.</summary>
    public static IResult PermissionDenied() =>
        Results.Problem(
            title: "Not allowed",
            detail: "Your role in this universe does not allow this.",
            statusCode: StatusCodes.Status403Forbidden,
            extensions: new Dictionary<string, object?> { ["code"] = PermissionDeniedCode });
}
