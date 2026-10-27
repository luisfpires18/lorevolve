using LorEvolve.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Admin;

/// <summary>The numbers of the Admin workspace (#40), in one place.</summary>
public static class AdminLimits
{
    public const int ReasonMaxLength = 500;

    public const int PageSize = 24;

    /// <summary>How many of an account's audit records its detail shows, newest first.</summary>
    public const int HistoryShown = 20;

    /// <summary>How many calendar months (UTC) the universes trend covers, this one included.</summary>
    public const int TrendMonths = 6;
}

/// <summary>An Admin request: a signed-in account that is an Admin, and not blocked, in the database right now.</summary>
public sealed class PlatformAdminRequirement : IAuthorizationRequirement;

/// <summary>
/// Read from the database on every request rather than from a claim in the cookie, so a role taken away in the database
/// is gone at the next request, never at the next sign-in - including the previous owner's, the moment provisioning moves
/// the role to another account. Exactly one row can be Admin (<see cref="PlatformAdminProvisioning"/>, ADR 0059). One
/// indexed lookup by key.
/// </summary>
public sealed class PlatformAdminHandler(LorEvolveDbContext db) : AuthorizationHandler<PlatformAdminRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PlatformAdminRequirement requirement)
    {
        if (context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value is not { } userId)
        {
            return;
        }

        var cancellationToken = (context.Resource as HttpContext)?.RequestAborted ?? CancellationToken.None;
        if (await db.Users.AnyAsync(
                user => user.Id == userId && user.PlatformRole == PlatformRole.Admin && user.BlockedAt == null,
                cancellationToken))
        {
            context.Succeed(requirement);
        }
    }
}

public static class AdminSetup
{
    /// <summary>The policy every <c>/api/admin</c> route requires. Hiding the entry in the client is never the guard.</summary>
    public const string Policy = "PlatformAdmin";

    public static IServiceCollection AddLorEvolveAdmin(this IServiceCollection services)
    {
        services.AddAuthorizationBuilder().AddPolicy(Policy, policy => policy
            .RequireAuthenticatedUser()
            .AddRequirements(new PlatformAdminRequirement()));
        services.AddScoped<IAuthorizationHandler, PlatformAdminHandler>();
        services.AddHostedService<PlatformAdminProvisioning>();
        return services;
    }
}
