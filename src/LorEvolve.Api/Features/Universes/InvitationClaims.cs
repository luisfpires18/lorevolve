using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;

namespace LorEvolve.Api.Features.Universes;

/// <summary>
/// The protected token an invitation link carries (ADR 0041 amendment): ASP.NET Core Data Protection, on the host's own
/// key ring, under a purpose of its own. It names the invitation and the address it was made for, so a token cannot be
/// edited into another invitation's, and a token for a revoked invitation never matches the next one to the same address.
///
/// A token proves only that its holder was given the link. Whether it still opens anything is the database's to say:
/// the invitation must still exist, be live and be pending, and the role is read from it at that moment - so revoking,
/// expiry, accepting or declining ends every token ever issued for it. A token is minted afresh each time the owner's
/// list is read; all of them stay equivalent.
/// </summary>
public static class InvitationClaims
{
    /// <summary>Versioned, so a future change of payload can never read an old token as a new one.</summary>
    private const string Purpose = "LorEvolve.UniverseInvitation.Claim.v1";

    public static string Issue(IDataProtectionProvider provider, Guid invitationId, string normalizedEmail) =>
        provider.CreateProtector(Purpose).Protect($"{invitationId:N}|{normalizedEmail}");

    /// <summary>The invitation and address a token was issued for, or null for anything not issued by this host's keys.</summary>
    public static (Guid InvitationId, string NormalizedEmail)? Read(IDataProtectionProvider provider, string? token)
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
        return separator > 0 && Guid.TryParseExact(payload[..separator], "N", out var id)
            ? (id, payload[(separator + 1)..])
            : null;
    }
}
