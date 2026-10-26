using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Lorex.Api.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Universes;

/// <summary>
/// The owner's management of who works on a universe (ADR 0041 amendment): its collaborators and its pending
/// invitations. Every route asks <see cref="UniverseAccess"/> for <see cref="UniverseCapability.ManageCollaborators"/>, so
/// a collaborator is refused with 403 and anyone else gets the 404 of a missing universe.
///
/// <para><b>An invitation names an address; the owner never learns about accounts.</b> Creating one answers the same,
/// field for field, whether an account holds that address or not, and nothing here searches accounts. It is never bound to
/// an account that happens to hold the address: Lorex verifies no email, so whoever registered it first would receive it
/// (issue #33, H-1). The invitee claims it through its link. The only account ever named back is one already
/// collaborating here, which the owner can see anyway.</para>
///
/// <para>The owner is <see cref="Universe.OwnerId"/> and has no membership row, so none of these routes can reach, change
/// or remove them: their id answers 404 like any id that collaborates on nothing here.</para>
/// </summary>
public static class CollaboratorEndpoints
{
    public const string InvitationPendingCode = "invitation_pending";

    private static readonly EmailAddressAttribute EmailValidator = new();

    public static IEndpointRouteBuilder MapCollaboratorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}")
            .WithTags("Collaborators")
            .RequireAuthorization();

        group.MapGet("/collaborators", ListAsync).WithName("ListCollaborators");
        group.MapPut("/collaborators/{userId}", ChangeRoleAsync).WithName("ChangeCollaboratorRole");
        group.MapDelete("/collaborators/{userId}", RemoveAsync).WithName("RemoveCollaborator");
        group.MapPost("/invitations", InviteAsync).WithName("CreateInvitation");
        group.MapPut("/invitations/{invitationId:guid}", ChangeInvitationRoleAsync).WithName("ChangeInvitationRole");
        group.MapDelete("/invitations/{invitationId:guid}", RevokeAsync).WithName("RevokeInvitation");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        IDataProtectionProvider protection,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageCollaborators, cancellationToken) is { } denied)
        {
            return denied;
        }

        var now = clock.GetUtcNow().UtcDateTime;

        var members = await db.UniverseMemberships.AsNoTracking()
            .Where(membership => membership.UniverseId == universeId)
            .OrderBy(membership => membership.User!.UserName)
            .Select(membership => new CollaboratorResponse(
                membership.UserId, membership.User!.UserName!, membership.Role, membership.CreatedAt))
            .ToListAsync(cancellationToken);

        var invitations = (await db.UniverseInvitations.AsNoTracking()
            .Where(invitation => invitation.UniverseId == universeId && invitation.ExpiresAt > now)
            .OrderByDescending(invitation => invitation.CreatedAt)
            .ToListAsync(cancellationToken))
            .Select(invitation => ToResponse(invitation, protection))
            .ToList();

        return Results.Ok(new CollaboratorsResponse(members, invitations));
    }

    private static async Task<IResult> InviteAsync(
        Guid universeId,
        [FromBody] InvitationRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        ILookupNormalizer normalizer,
        TimeProvider clock,
        IDataProtectionProvider protection,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageCollaborators, cancellationToken) is { } denied)
        {
            return denied;
        }

        var email = request.Email?.Trim() ?? string.Empty;
        var errors = new Dictionary<string, string[]>();

        if (email.Length == 0)
        {
            errors["email"] = ["Enter the email address of the person to invite."];
        }
        else if (email.Length > InvitationLimits.EmailMaxLength || !EmailValidator.IsValid(email))
        {
            errors["email"] = ["Enter a valid email address."];
        }

        if (RoleError(request.Role) is { } roleError)
        {
            errors["role"] = [roleError];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var normalized = normalizer.NormalizeEmail(email);
        var now = clock.GetUtcNow().UtcDateTime;

        // One transaction, begun IMMEDIATE by Microsoft.Data.Sqlite: two invitations to the same address cannot both
        // find the place free.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var ownerEmail = await db.Universes
            .Where(universe => universe.Id == universeId)
            .Select(universe => universe.Owner!.NormalizedEmail)
            .FirstOrDefaultAsync(cancellationToken);

        if (ownerEmail == normalized)
        {
            return EmailProblem("That is your own email address. You already own this universe.");
        }

        if (await db.UniverseMemberships.AnyAsync(
                membership => membership.UniverseId == universeId && membership.User!.NormalizedEmail == normalized,
                cancellationToken))
        {
            return EmailProblem("This person already collaborates on this universe.");
        }

        if (await LiveInvitationIdAsync(db, universeId, normalized, now, cancellationToken) is { } pending)
        {
            return PendingProblem(pending);
        }

        // Expired invitations are ignored everywhere and cleared here, the one place that needs their place back.
        await db.UniverseInvitations
            .Where(invitation => invitation.UniverseId == universeId && invitation.ExpiresAt <= now)
            .ExecuteDeleteAsync(cancellationToken);

        var created = new UniverseInvitation
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Email = email,
            NormalizedEmail = normalized,
            Role = request.Role!.Value,
            CreatedAt = now,
            ExpiresAt = now + InvitationLimits.Lifetime,
        };

        db.UniverseInvitations.Add(created);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return PendingProblem(await LiveInvitationIdAsync(db, universeId, normalized, now, cancellationToken));
        }

        // The same answer whether or not an account holds the address: the owner learns nothing about accounts.
        return Results.Created((string?)null, ToResponse(created, protection));
    }

    private static async Task<IResult> ChangeInvitationRoleAsync(
        Guid universeId,
        Guid invitationId,
        [FromBody] CollaboratorRoleRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        TimeProvider clock,
        IDataProtectionProvider protection,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageCollaborators, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (RoleError(request.Role) is { } roleError)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["role"] = [roleError] });
        }

        var now = clock.GetUtcNow().UtcDateTime;
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var invitation = await db.UniverseInvitations.FirstOrDefaultAsync(
            candidate => candidate.Id == invitationId && candidate.UniverseId == universeId && candidate.ExpiresAt > now,
            cancellationToken);

        if (invitation is null)
        {
            return InvitationEndpoints.NotFoundProblem();
        }

        invitation.Role = request.Role!.Value;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(ToResponse(invitation, protection));
    }

    /// <summary>Withdraws an invitation, expired or not. Whoever holds its link is told it is no longer available.</summary>
    private static async Task<IResult> RevokeAsync(
        Guid universeId,
        Guid invitationId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageCollaborators, cancellationToken) is { } denied)
        {
            return denied;
        }

        var removed = await db.UniverseInvitations
            .Where(invitation => invitation.Id == invitationId && invitation.UniverseId == universeId)
            .ExecuteDeleteAsync(cancellationToken);

        return removed == 0 ? InvitationEndpoints.NotFoundProblem() : Results.NoContent();
    }

    /// <summary>A collaborator's new role, in force from their next request. The owner has no row here to change.</summary>
    private static async Task<IResult> ChangeRoleAsync(
        Guid universeId,
        string userId,
        [FromBody] CollaboratorRoleRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageCollaborators, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (RoleError(request.Role) is { } roleError)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["role"] = [roleError] });
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var membership = await db.UniverseMemberships.FirstOrDefaultAsync(
            candidate => candidate.UniverseId == universeId && candidate.UserId == userId,
            cancellationToken);

        if (membership is null)
        {
            return Results.NotFound();
        }

        membership.Role = request.Role!.Value;
        membership.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var username = await db.Users
            .Where(user => user.Id == userId)
            .Select(user => user.UserName!)
            .FirstAsync(cancellationToken);

        return Results.Ok(new CollaboratorResponse(userId, username, membership.Role, membership.CreatedAt));
    }

    /// <summary>
    /// Ends a collaborator's access, and nothing else: what they wrote, trashed or restored stays exactly as it is, and
    /// their account and ideas are theirs. Their next request into this universe is an outsider's.
    /// </summary>
    private static async Task<IResult> RemoveAsync(
        Guid universeId,
        string userId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageCollaborators, cancellationToken) is { } denied)
        {
            return denied;
        }

        var removed = await db.UniverseMemberships
            .Where(membership => membership.UniverseId == universeId && membership.UserId == userId)
            .ExecuteDeleteAsync(cancellationToken);

        return removed == 0 ? Results.NotFound() : Results.NoContent();
    }

    // ---------- Helpers ----------

    /// <summary>Why a role cannot be given, or null. Owner is never one: ownership is the universe's, not a role.</summary>
    internal static string? RoleError(UniverseRole? role) =>
        role is UniverseRole.Viewer or UniverseRole.Reviewer or UniverseRole.Editor
            ? null
            : "Choose Editor, Reviewer or Viewer.";

    private static Task<Guid?> LiveInvitationIdAsync(
        LorexDbContext db, Guid universeId, string normalized, DateTime now, CancellationToken cancellationToken) =>
        db.UniverseInvitations.AsNoTracking()
            .Where(invitation => invitation.UniverseId == universeId
                && invitation.NormalizedEmail == normalized
                && invitation.ExpiresAt > now)
            .Select(invitation => (Guid?)invitation.Id)
            .FirstOrDefaultAsync(cancellationToken);

    private static PendingInvitationResponse ToResponse(UniverseInvitation invitation, IDataProtectionProvider protection) =>
        new(invitation.Id, invitation.Email, invitation.Role, invitation.CreatedAt, invitation.ExpiresAt,
            InvitationClaims.Issue(protection, invitation.Id, invitation.NormalizedEmail));

    private static IResult EmailProblem(string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { ["email"] = [message] });

    /// <summary>
    /// The address already has a live invitation here. Not a second one: the existing one is named, to change, copy or
    /// revoke. The owner's own data, so naming it discloses nothing.
    /// </summary>
    private static IResult PendingProblem(Guid? invitationId) =>
        Results.Problem(
            title: "Already invited",
            detail: "This address already has a pending invitation to this universe.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = InvitationPendingCode,
                ["invitationId"] = invitationId,
            });
}
