using System.Security.Claims;

namespace LorEvolve.Api.Common;

internal static class PrincipalExtensions
{
    /// <summary>
    /// The endpoints run behind <c>RequireAuthorization</c>, so a missing id means the
    /// pipeline is misconfigured rather than that the caller is anonymous.
    /// </summary>
    public static string RequireUserId(this ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("Authenticated principal is missing a user id claim.");
}
