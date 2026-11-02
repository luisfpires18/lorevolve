using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;

namespace LorEvolve.Api.Features.Auth;

/// <summary>
/// How the desktop edition signs its one author in without a login screen (ADR 0070).
///
/// <para><b>One local account.</b> Made on the first launch, named <see cref="LocalUserName"/>, with no password: nothing
/// but the launch route can sign it in. Its storage allowance is <see cref="LocalStorageQuotaBytes"/>, because the buyer's
/// own disk is the real limit.</para>
///
/// <para><b>A token per launch.</b> The shell starts the host with a fresh random <c>Desktop:LaunchToken</c> and opens
/// <see cref="LaunchPath"/> with it. A request without that token, or with another, signs nothing in and is answered 404,
/// so no other program on the machine can open a session by guessing the port.</para>
///
/// <para><b>Loopback names only.</b> <c>appsettings.Desktop.json</c> sets <c>AllowedHosts</c> to the loopback names, so
/// ASP.NET Core's host filtering refuses a web page that points its own DNS name at 127.0.0.1 (DNS rebinding) before
/// anything answers.</para>
/// </summary>
public static class DesktopLaunch
{
    public const string TokenKey = "Desktop:LaunchToken";

    public const string LaunchPath = "/desktop/launch";

    public const string LocalUserName = "author";

    /// <summary>An address no mail can reach: <c>.invalid</c> is reserved (RFC 2606). Identity requires a unique one.</summary>
    public const string LocalEmail = "author@desktop.lorevolve.invalid";

    /// <summary>1 TiB.</summary>
    public const long LocalStorageQuotaBytes = 1L << 40;

    public static IEndpointRouteBuilder MapDesktopLaunch(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet(LaunchPath, LaunchAsync).AllowAnonymous().ExcludeFromDescription();
        return endpoints;
    }

    private static async Task<IResult> LaunchAsync(
        string? token,
        IConfiguration configuration,
        UserManager<LorEvolveUser> userManager,
        SignInManager<LorEvolveUser> signInManager)
    {
        if (!Matches(configuration[TokenKey], token))
        {
            return Results.NotFound();
        }

        var user = await userManager.FindByNameAsync(LocalUserName);
        if (user is null)
        {
            user = new LorEvolveUser
            {
                UserName = LocalUserName,
                Email = LocalEmail,
                EmailConfirmed = true,
                StorageQuotaBytes = LocalStorageQuotaBytes,
            };
            var created = await userManager.CreateAsync(user);
            if (!created.Succeeded)
            {
                throw new InvalidOperationException(
                    "The local account could not be created: " + string.Join(" ", created.Errors.Select(error => error.Code)));
            }
        }

        await signInManager.SignInAsync(user, isPersistent: true);
        return Results.Redirect("/app");
    }

    /// <summary>Constant time, and never a match when the host was started without a token.</summary>
    private static bool Matches(string? expected, string? offered) =>
        !string.IsNullOrEmpty(expected)
        && offered is not null
        && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(offered));
}
