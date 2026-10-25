using System.Security.Claims;
using Lorex.Api.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Lorex.Api.Features.Auth;

/// <summary>
/// Whether a session cookie still stands, checked on every request that carries one (#40): its account must still exist,
/// must not be blocked, and must have the security stamp the cookie was issued with. Blocking an account rotates the
/// stamp, so every session it has ends at its next request - not after Identity's own half-hour revalidation - and stays
/// ended after an unblock.
///
/// One lookup by primary key per signed-in request; tagged so the tests that count a read's queries can leave it out.
/// Identity's own validator still runs after it, unchanged.
/// </summary>
public static class AccountSessions
{
    public const string QueryTag = "lorex:session-check";

    public static async Task ValidateAsync(CookieValidatePrincipalContext context)
    {
        var principal = context.Principal;
        var http = context.HttpContext;
        var stampClaim = http.RequestServices.GetRequiredService<IOptions<IdentityOptions>>().Value.ClaimsIdentity.SecurityStampClaimType;
        var userId = principal?.FindFirstValue(ClaimTypes.NameIdentifier);

        var account = userId is null
            ? null
            : await http.RequestServices.GetRequiredService<LorexDbContext>().Users.AsNoTracking()
                .TagWith(QueryTag)
                .Where(user => user.Id == userId)
                .Select(user => new { user.SecurityStamp, user.BlockedAt })
                .FirstOrDefaultAsync(http.RequestAborted);

        if (account is null || account.BlockedAt is not null || account.SecurityStamp != principal!.FindFirstValue(stampClaim))
        {
            context.RejectPrincipal();
            await http.SignOutAsync(IdentityConstants.ApplicationScheme);
            return;
        }

        await SecurityStampValidator.ValidatePrincipalAsync(context);
    }
}
