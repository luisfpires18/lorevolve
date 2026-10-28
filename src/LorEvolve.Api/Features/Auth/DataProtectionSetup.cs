using Microsoft.AspNetCore.DataProtection;

namespace LorEvolve.Api.Features.Auth;

/// <summary>
/// Where the Data Protection key ring lives.
///
/// The session cookie is encrypted with a Data Protection key. In memory - the default - that
/// key is new on every start, so every restart signs everyone out. ADR 0005 recorded that as a
/// deployment concern; this is the deployment answering it, with the smallest thing that works:
/// a directory on storage that outlives the deployed content.
///
/// Deliberately not more than that. The keys are written unencrypted at rest, protected by the
/// file system alone, and there is no revocation, rotation policy or key vault. That is a
/// documented DEV limitation, not an oversight - see the deployment runbook.
///
/// Unset means unchanged: development and the test host keep the in-memory key ring.
/// </summary>
public static class DataProtectionSetup
{
    public const string KeyRingPathKey = "DataProtection:KeyRingPath";

    /// <summary>
    /// Fixed so the key ring is discriminated by the product, not by the content root. App
    /// Service gives a redeploy a different path, and a changed discriminator would invalidate
    /// every existing cookie - the exact restart the persisted keys exist to survive.
    /// </summary>
    private const string ApplicationName = "LorEvolve";

    public static IServiceCollection AddLorEvolveDataProtection(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var configuredPath = configuration[KeyRingPathKey];
        if (string.IsNullOrWhiteSpace(configuredPath))
        {
            return services;
        }

        var keyRing = Directory.CreateDirectory(
            Path.GetFullPath(configuredPath, environment.ContentRootPath));

        services.AddDataProtection()
            .SetApplicationName(ApplicationName)
            .PersistKeysToFileSystem(keyRing);

        return services;
    }
}
