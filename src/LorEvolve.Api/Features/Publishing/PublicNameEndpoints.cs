using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// The name the signed-in account publishes under - the "by …" on its public universes - read and set
/// from the session alone, like the profile photo: no route carries a user id.
///
/// It is the only thing about an account the public portal ever shows. It is chosen here and never
/// filled in from the username or the email; it is read live by the public routes, so changing it
/// changes every published world at once. It cannot be removed while any of the account's universes
/// is public - make them private first - for the same reason a public universe keeps its artwork.
/// </summary>
public static class PublicNameEndpoints
{
    public static IEndpointRouteBuilder MapPublicNameEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/profile/public-name")
            .WithTags("Publishing")
            .RequireAuthorization();

        group.MapGet("/", GetAsync).WithName("GetPublicName");
        group.MapPut("/", SaveAsync).WithName("SetPublicName");

        return endpoints;
    }

    private static async Task<IResult> GetAsync(ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();

        var name = await db.Users
            .Where(user => user.Id == userId)
            .Select(user => user.PublicDisplayName)
            .FirstOrDefaultAsync(cancellationToken);

        return Results.Ok(new PublicNameResponse(name));
    }

    private static async Task<IResult> SaveAsync(
        [FromBody] PublicNameRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();
        var name = string.IsNullOrWhiteSpace(request.PublicDisplayName) ? null : request.PublicDisplayName.Trim();

        if (name is not null && Problem(name) is { } problem)
        {
            return Invalid(problem);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        if (name is null
            && await db.Universes.AnyAsync(
                universe => universe.OwnerId == userId && universe.Visibility == UniverseVisibility.Public,
                cancellationToken))
        {
            return Invalid("Your public universes are published under this name. Make them private before removing it.");
        }

        await db.Users
            .Where(user => user.Id == userId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(user => user.PublicDisplayName, name), cancellationToken);

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(new PublicNameResponse(name));
    }

    /// <summary>
    /// Why a name cannot be published, or null. Measured after trimming, which is what is stored.
    /// Control characters are refused, and so are the invisible direction overrides and isolates -
    /// the characters that make a name display as something other than what it is. Joiners and the
    /// direction marks that real names need are kept.
    /// </summary>
    internal static string? Problem(string name)
    {
        if (name.Length > PublicationLimits.DisplayNameMaxLength)
        {
            return $"Keep your public name under {PublicationLimits.DisplayNameMaxLength} characters.";
        }

        return HasInvisibleControls(name) ? "Your public name cannot contain invisible control characters." : null;
    }

    /// <summary>Control characters, and the direction overrides and isolates that make a name display as something else.</summary>
    internal static bool HasInvisibleControls(string text) =>
        text.Any(character => char.IsControl(character) || character is >= '‪' and <= '‮' or >= '⁦' and <= '⁩');

    private static IResult Invalid(string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [PublicationRules.PublicDisplayName] = [message] });
}
