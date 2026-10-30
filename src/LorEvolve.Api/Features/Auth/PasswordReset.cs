using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using LorEvolve.Api.Features.Email;
using LorEvolve.Api.Features.Seo;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace LorEvolve.Api.Features.Auth;

/// <summary>
/// Forgot password (#69): a link by email to <c>/reset-password</c>, carrying the account's id and an Identity password-reset
/// token. The token is Identity's own (Data Protection, tied to the security stamp), so it lasts <see cref="Lifetime"/>, works
/// once - a reset rotates the stamp - and the same rotation ends every session the account has (<see cref="AccountSessions"/>).
///
/// <para><b>Says nothing about who has an account.</b> Asking answers the same for any address, and the email is sent after
/// the answer, so neither the response nor its timing tells a registered address from an unknown one.</para>
///
/// <para><b>No mail bombing.</b> One link per account per <see cref="Cooldown"/>; asking again sooner is answered the same and
/// sends nothing. An Admin's send (<see cref="Admin.AdminEndpoints"/>) is deliberate and skips it.</para>
/// </summary>
public static class PasswordReset
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(1);

    public static readonly TimeSpan Cooldown = TimeSpan.FromMinutes(2);

    public const string InvalidLink = "This link is no longer valid. Ask for a new one.";

    private static readonly EmailAddressAttribute EmailValidator = new();

    // ponytail: in-process map, one entry per account that asked; per-instance, so a scale-out would need a shared store.
    private static readonly ConcurrentDictionary<string, DateTime> LastSent = new();

    public static void Map(RouteGroupBuilder group)
    {
        group.MapPost("/forgot-password", ForgotAsync).WithName("ForgotPassword");
        group.MapPost("/reset-password", ResetAsync).WithName("ResetPassword");
    }

    /// <summary>
    /// The reset email for one account, its link built on the configured public origin, never the request's host. The token
    /// rides after <c>#</c>: a browser never sends the fragment, so it stays out of server and proxy request logs (N-4).
    /// </summary>
    public static async Task<AppEmailMessage> MessageAsync(UserManager<LorEvolveUser> userManager, LorEvolveUser user, PublicSite site)
    {
        var token = await userManager.GeneratePasswordResetTokenAsync(user);
        var link = site.Absolute($"/reset-password#user={Uri.EscapeDataString(user.Id)}&token={Uri.EscapeDataString(token)}")!;
        return PasswordResetEmail.For(user.Email!, link);
    }

    private static async Task<IResult> ForgotAsync(
        [FromBody] ForgotPasswordRequest request,
        UserManager<LorEvolveUser> userManager,
        AppEmail email,
        PublicSite site,
        TimeProvider clock)
    {
        var address = request.Email?.Trim() ?? string.Empty;
        if (address.Length == 0 || EmailValidator.GetValidationResult(address, new ValidationContext(address)) != ValidationResult.Success)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Enter a valid email address."] });
        }

        var now = clock.GetUtcNow().UtcDateTime;
        if (email.IsConfigured
            && site.Origin is not null
            && await userManager.FindByEmailAsync(address) is { BlockedAt: null, Email: not null } user
            && (!LastSent.TryGetValue(user.Id, out var last) || now - last >= Cooldown))
        {
            LastSent[user.Id] = now;
            var message = await MessageAsync(userManager, user, site);

            // After the answer, so its timing is the same as for an unknown address. AppEmail logs its own failures.
            _ = Task.Run(() => email.SendAsync(message, CancellationToken.None));
        }

        return Results.NoContent();
    }

    private static async Task<IResult> ResetAsync([FromBody] ResetPasswordRequest request, UserManager<LorEvolveUser> userManager)
    {
        var password = request.Password ?? string.Empty;
        if (password.Length == 0)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["password"] = ["Choose a password."] });
        }

        var user = string.IsNullOrWhiteSpace(request.UserId) || string.IsNullOrWhiteSpace(request.Token)
            ? null
            : await userManager.FindByIdAsync(request.UserId);
        if (user is null || user.BlockedAt is not null)
        {
            return InvalidLinkProblem();
        }

        // Identity checks the token before the password, and a refused password leaves the token usable.
        var result = await userManager.ResetPasswordAsync(user, request.Token!, password);
        if (!result.Succeeded)
        {
            return result.Errors.Any(error => error.Code == nameof(IdentityErrorDescriber.InvalidToken))
                ? InvalidLinkProblem()
                : Results.ValidationProblem(AuthEndpoints.ToValidationErrors(result));
        }

        // Locked out by failed sign-ins is the usual reason to be here: the new password works at once.
        await userManager.SetLockoutEndDateAsync(user, null);
        await userManager.ResetAccessFailedCountAsync(user);
        LastSent.TryRemove(user.Id, out _);
        return Results.NoContent();
    }

    private static IResult InvalidLinkProblem() =>
        Results.ValidationProblem(new Dictionary<string, string[]> { ["token"] = [InvalidLink] });
}
