using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Projects;

/// <summary>
/// Who may see and change a project. One place, so no route decides it again.
///
/// A project is reached in one of two ways and never a third: the account made it, or it is in a universe the account
/// can reach. Reading needs only to be able to read that universe, which every role can
/// (<see cref="UniverseAccess.Allows"/> grants <see cref="UniverseCapability.Read"/> to Owner, Editor, Reviewer and
/// Viewer alike), so membership is enough and this class states it as a query. Changing needs
/// <see cref="UniverseCapability.EditContent"/>, which is Owner and Editor only, and that decision stays in
/// <see cref="UniverseAccess"/> where the whole permission matrix lives.
///
/// A project the caller cannot reach answers exactly as a missing one does, so no route tells one account that another
/// account's project exists.
/// </summary>
public static class ProjectAccess
{
    /// <summary>
    /// Every project the caller may read: their own, plus those linked to a universe they own or are a member of.
    /// </summary>
    public static IQueryable<CreativeProject> Readable(LorEvolveDbContext db, string userId) =>
        db.CreativeProjects.Where(project =>
            project.OwnerId == userId
            || project.Universe!.OwnerId == userId
            || db.UniverseMemberships.Any(membership =>
                membership.UniverseId == project.UniverseId && membership.UserId == userId));

    /// <summary>
    /// Null when the caller may change this project; otherwise the answer to send. The account that made it always may.
    /// Anyone else goes through its universe's matrix, which answers 404 without access and 403 with too little.
    /// </summary>
    public static async Task<IResult?> DenyChangeAsync(
        LorEvolveDbContext db,
        CreativeProject project,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        if (project.OwnerId == principal.RequireUserId())
        {
            return null;
        }

        // Every project is in a universe (#171), so the universe's matrix is the only other way in: 404 without access
        // to it, 403 with too little.
        return await UniverseAccess.DenyAsync(
            db,
            project.UniverseId,
            principal,
            UniverseCapability.EditContent,
            cancellationToken);
    }

    /// <summary>
    /// Null when the caller may put a project in <paramref name="universeId"/>. Doing so needs the same capability as
    /// changing that universe's content, so a Viewer cannot add a project to someone else's world. A null universe is
    /// refused rather than allowed: a project without one does not exist (#171), and validation says so by field before
    /// this is reached.
    /// </summary>
    public static async Task<IResult?> DenyLinkAsync(
        LorEvolveDbContext db,
        Guid? universeId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken) =>
        universeId is { } id
            ? await UniverseAccess.DenyAsync(db, id, principal, UniverseCapability.EditContent, cancellationToken)
            : Results.NotFound();
}
