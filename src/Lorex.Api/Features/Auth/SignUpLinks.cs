using System.Globalization;
using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;

namespace Lorex.Api.Features.Auth;

/// <summary>
/// The token an Admin's sign-up link carries while registration is invitation-only: ASP.NET Core Data Protection under a
/// purpose of its own, naming the one address it lets register and when it stops. Nothing is stored. It opens one account,
/// because an email address registers once; after that the link only meets "already registered".
/// </summary>
public static class SignUpLinks
{
    /// <summary>Versioned, so a future change of payload can never read an old token as a new one.</summary>
    private const string Purpose = "Lorex.Registration.SignUp.v1";

    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    public static string Issue(IDataProtectionProvider provider, string normalizedEmail, DateTime expiresAt) =>
        provider.CreateProtector(Purpose).Protect($"{expiresAt.Ticks.ToString(CultureInfo.InvariantCulture)}|{normalizedEmail}");

    /// <summary>The address and expiry a token was issued for, or null for anything not issued by this host's keys.</summary>
    public static (string NormalizedEmail, DateTime ExpiresAt)? Read(IDataProtectionProvider provider, string? token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 2048)
        {
            return null;
        }

        string payload;
        try
        {
            payload = provider.CreateProtector(Purpose).Unprotect(token);
        }
        catch (CryptographicException)
        {
            return null;
        }
        catch (FormatException)
        {
            return null;
        }

        var separator = payload.IndexOf('|', StringComparison.Ordinal);
        return separator > 0 && long.TryParse(payload[..separator], NumberStyles.None, CultureInfo.InvariantCulture, out var ticks)
            ? (payload[(separator + 1)..], new DateTime(ticks, DateTimeKind.Utc))
            : null;
    }
}
