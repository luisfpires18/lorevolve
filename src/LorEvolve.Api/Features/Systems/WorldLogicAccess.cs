using System.Globalization;
using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// What every World Logic route decides the same way: who may read or change a universe's Systems and rule
/// definitions, whether a named project is really inside that universe, and the small formatting both lists share.
///
/// Access is the universe's and nothing else's (ADR 0041), exactly as it is for world rules: reading needs
/// <see cref="UniverseCapability.Read"/>, which every role has, and changing needs
/// <see cref="UniverseCapability.EditContent"/>, which is Owner and Editor. A row of another universe, a guessed
/// id and a universe the caller cannot reach all answer the same 404.
///
/// A project scope is not a second permission. A project is inside exactly one universe (#171), so a
/// project-scoped row is reachable by exactly the accounts that reach its universe; the check below is that the
/// project named is one of this universe's, so a scope cannot point out of the world it belongs to.
/// </summary>
public static class WorldLogicAccess
{
    /// <summary>Null when the caller may read this universe's World Logic; otherwise the answer to send.</summary>
    public static Task<IResult?> DenyReadAsync(
        LorEvolveDbContext db,
        Guid universeId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken) =>
        UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken);

    /// <summary>Null when the caller may change it; otherwise the answer to send.</summary>
    public static Task<IResult?> DenyChangeAsync(
        LorEvolveDbContext db,
        Guid universeId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken) =>
        UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);

    /// <summary>
    /// True when <paramref name="projectId"/> is a project of <paramref name="universeId"/>. A project of another
    /// universe and one that does not exist are the same answer, so a scope never reveals another world's projects.
    /// </summary>
    public static Task<bool> IsProjectOfUniverseAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid projectId,
        CancellationToken cancellationToken) =>
        db.CreativeProjects.AsNoTracking()
            .AnyAsync(project => project.Id == projectId && project.UniverseId == universeId, cancellationToken);

    /// <summary>The start of a body, and whether there is more. Characters as .NET counts them, never half of one.</summary>
    public static (string Excerpt, bool IsShortened) Excerpt(string body) =>
        body.Length > WorldLogicLimits.ExcerptLength
            ? (body[..WorldLogicLimits.ExcerptLength], true)
            : (body, false);

    /// <summary>A page number and size clamped to what a list route serves.</summary>
    public static (int Page, int PageSize) Paging(int page, int pageSize) =>
        (Math.Max(page, 1), Math.Clamp(pageSize, 1, WorldLogicLimits.MaxPageSize));

    /// <summary>How many pages a total makes at this size. Zero rows is zero pages, as every other list says.</summary>
    public static int TotalPages(int totalCount, int pageSize) =>
        totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

    /// <summary>A number in a message, in the invariant culture, so a code never reads differently by locale.</summary>
    public static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);
}
