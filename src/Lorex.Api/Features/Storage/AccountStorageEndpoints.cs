using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Storage;

/// <summary>
/// The signed-in account's own storage, read from the session alone like the rest of <c>/api/profile</c>: no route
/// carries an account id, so no account can ask after another's. Read only - nothing here changes an allowance.
/// </summary>
public static class AccountStorageEndpoints
{
    public static IEndpointRouteBuilder MapAccountStorageEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/profile/storage", GetAsync)
            .WithTags("Storage")
            .WithName("GetAccountStorage")
            .RequireAuthorization();

        return endpoints;
    }

    /// <summary>
    /// What the universes this account owns use, against its allowance. One query at any size. A universe the account
    /// only collaborates on is its owner's storage, so it is not here.
    /// </summary>
    private static async Task<IResult> GetAsync(ClaimsPrincipal principal, LorexDbContext db, CancellationToken cancellationToken)
    {
        var usage = await AccountStorage.UsageAsync(db, principal.RequireUserId(), cancellationToken);

        return usage is null
            ? Results.NotFound()
            : Results.Ok(new AccountStorageResponse(usage.UsedBytes, usage.QuotaBytes, usage.RemainingBytes, usage.LoreImageBytes, usage.MapImageBytes));
    }
}

/// <summary>
/// The account's storage in bytes. <c>UsedBytes</c> is the total; <c>LoreImagesBytes</c> and <c>MapImagesBytes</c>
/// (issue #52) are the categories that make it up, kept apart so another can be added beside them without changing what
/// the total means.
/// </summary>
public sealed record AccountStorageResponse(long UsedBytes, long QuotaBytes, long RemainingBytes, long LoreImagesBytes, long MapImagesBytes);
