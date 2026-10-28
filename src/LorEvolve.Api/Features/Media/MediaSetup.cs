using Amazon.Runtime;
using Amazon.S3;

namespace LorEvolve.Api.Features.Media;

/// <summary>
/// Which object store this host runs against, and nothing else.
///
/// Three providers, chosen by <c>Media:Provider</c>:
///
///   R2        - Cloudflare, the only one a deployment uses.
///   InMemory  - the local development server and the Playwright suite, so neither needs an
///               account, a bucket or a credential to run the whole image lifecycle.
///   (unset)   - <see cref="UnavailableMediaObjectStore"/>. Every image request answers 503.
///
/// There is no silent fallback. A deployment that lost its R2 settings must not quietly start
/// storing images in a dictionary and lose them on the next restart, so an unrecognised or
/// absent provider fails every call instead of guessing.
///
/// No credential has a default and none is committed. <c>Media:R2:AccessKeyId</c> and
/// <c>Media:R2:SecretAccessKey</c> come from user secrets locally and from App Service settings
/// in Azure - see <c>docs/deployment/cloudflare-r2.md</c>.
/// </summary>
public static class MediaSetup
{
    public static IServiceCollection AddLorEvolveMedia(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var section = configuration.GetSection("Media");
        var provider = section["Provider"];

        if (string.Equals(provider, "InMemory", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IMediaObjectStore, InMemoryMediaObjectStore>();
            return services;
        }

        if (!string.Equals(provider, "R2", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IMediaObjectStore, UnavailableMediaObjectStore>();
            return services;
        }

        var r2 = section.GetSection("R2");
        var accountId = r2["AccountId"];
        var bucket = r2["Bucket"];
        var accessKeyId = r2["AccessKeyId"];
        var secretAccessKey = r2["SecretAccessKey"];

        // An explicit endpoint wins, so a future jurisdiction-specific host does not need code.
        var serviceUrl = r2["ServiceUrl"] is { Length: > 0 } configured
            ? configured
            : $"https://{accountId}.r2.cloudflarestorage.com";

        if (string.IsNullOrWhiteSpace(bucket)
            || string.IsNullOrWhiteSpace(accessKeyId)
            || string.IsNullOrWhiteSpace(secretAccessKey)
            || string.IsNullOrWhiteSpace(accountId) && r2["ServiceUrl"] is not { Length: > 0 })
        {
            // Named R2 but not given what R2 needs. Same treatment as unset: fail every call
            // rather than start and break later.
            services.AddSingleton<IMediaObjectStore, UnavailableMediaObjectStore>();
            return services;
        }

        services.AddSingleton<IAmazonS3>(_ => new AmazonS3Client(
            new BasicAWSCredentials(accessKeyId, secretAccessKey),
            R2ClientConfig(serviceUrl)));

        services.AddSingleton<IMediaObjectStore>(serviceProvider =>
            new R2MediaObjectStore(serviceProvider.GetRequiredService<IAmazonS3>(), bucket));

        return services;
    }

    /// <summary>
    /// The client configuration R2 needs. Its own method so the adapter tests build a client
    /// exactly as a deployment does, rather than a lookalike that could drift from it.
    /// </summary>
    internal static AmazonS3Config R2ClientConfig(string serviceUrl) => new()
    {
        ServiceURL = serviceUrl,

        // R2 has no regions and no virtual-host buckets. Both of these are required,
        // not preferences: the SDK signs with "auto" and addresses the bucket as a path.
        AuthenticationRegion = "auto",
        ForcePathStyle = true,

        // The SDK's v4 default adds a CRC32 checksum header to every request and
        // validates one on every response. R2 is S3-compatible rather than S3, so both
        // are asked for only where the operation genuinely requires them. This alone does
        // not stop a PutObject streaming a signed, chunked body - that needs the per-request
        // flags in R2MediaObjectStore.PutAsync.
        RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
        ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED,
    };
}
