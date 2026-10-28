using System.Net;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;

namespace LorEvolve.Api.Features.DatabaseBackups;

/// <summary>One object in the backup store.</summary>
public sealed record StoredBackupObject(string Key, long Size, DateTime LastModified);

/// <summary>
/// Where database backups go (ADR 0064). Two real stores: R2 for a deployment, a folder for local drills and tests. Nothing
/// here is reachable from a route - only the backup runner, the Admin status and the CLI use it.
/// </summary>
public interface IDatabaseBackupStore
{
    /// <summary>Where, for status and logs: a bucket name or a folder. Never a credential.</summary>
    string Describe { get; }

    Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken);

    /// <summary>The object's bytes, or null when it is not there.</summary>
    Task<Stream?> OpenAsync(string key, CancellationToken cancellationToken);

    Task<IReadOnlyList<StoredBackupObject>> ListAsync(string prefix, CancellationToken cancellationToken);

    Task DeleteAsync(string key, CancellationToken cancellationToken);
}

/// <summary>
/// A private R2 bucket over its S3 API, with the same R2 settings the media store proved (<c>MediaSetup.R2ClientConfig</c>,
/// unsigned payload, no default checksum). Nothing here makes an object public or hands out a URL.
/// </summary>
public sealed class R2DatabaseBackupStore(IAmazonS3 client, string bucket) : IDatabaseBackupStore
{
    public string Describe => $"R2 bucket {bucket}";

    public async Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken) =>
        await client.PutObjectAsync(
            new PutObjectRequest
            {
                BucketName = bucket,
                Key = key,
                InputStream = content,
                ContentType = contentType,
                AutoCloseStream = false,
                DisablePayloadSigning = true,
                DisableDefaultChecksumValidation = true,
            },
            cancellationToken);

    public async Task<Stream?> OpenAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            return (await client.GetObjectAsync(bucket, key, cancellationToken)).ResponseStream;
        }
        catch (AmazonS3Exception missing) when (missing.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<StoredBackupObject>> ListAsync(string prefix, CancellationToken cancellationToken)
    {
        var found = new List<StoredBackupObject>();
        var request = new ListObjectsV2Request { BucketName = bucket, Prefix = prefix };
        ListObjectsV2Response page;
        do
        {
            page = await client.ListObjectsV2Async(request, cancellationToken);
            found.AddRange((page.S3Objects ?? []).Select(item =>
                new StoredBackupObject(item.Key, item.Size ?? 0, item.LastModified?.ToUniversalTime() ?? DateTime.MinValue)));
            request.ContinuationToken = page.NextContinuationToken;
        }
        while (page.IsTruncated == true);

        return found;
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken) =>
        await client.DeleteObjectAsync(bucket, key, cancellationToken);

    /// <summary>A storage failure as one line for status and logs: status and error code only, never a key or a secret.</summary>
    public static string? Explain(Exception exception) => exception switch
    {
        AmazonServiceException service => $"Backup storage refused the request ({(int)service.StatusCode} {service.ErrorCode}).",
        AmazonClientException => "Backup storage could not be reached.",
        _ => null,
    };
}

/// <summary>
/// A folder. Each object is written beside its key as a temporary file and renamed into place, so a half-written object
/// never appears under its key.
/// </summary>
public sealed class FileSystemDatabaseBackupStore(string root) : IDatabaseBackupStore
{
    private readonly string _root = Path.GetFullPath(root);

    public string Describe => $"folder {_root}";

    public async Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken)
    {
        var path = PathOf(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var partial = $"{path}.{Guid.NewGuid():N}.partial";
        await using (var file = File.Create(partial))
        {
            await content.CopyToAsync(file, cancellationToken);
        }

        File.Move(partial, path, overwrite: true);
    }

    public Task<Stream?> OpenAsync(string key, CancellationToken cancellationToken) =>
        Task.FromResult<Stream?>(File.Exists(PathOf(key)) ? File.OpenRead(PathOf(key)) : null);

    public Task<IReadOnlyList<StoredBackupObject>> ListAsync(string prefix, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<StoredBackupObject>>(!Directory.Exists(_root)
            ? []
            : [.. Directory.EnumerateFiles(_root, "*", SearchOption.AllDirectories)
                .Where(path => !path.EndsWith(".partial", StringComparison.Ordinal))
                .Select(path => (Path: path, Key: Path.GetRelativePath(_root, path).Replace('\\', '/')))
                .Where(item => item.Key.StartsWith(prefix, StringComparison.Ordinal))
                .Select(item => new StoredBackupObject(item.Key, new FileInfo(item.Path).Length, File.GetLastWriteTimeUtc(item.Path)))]);

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        File.Delete(PathOf(key));
        return Task.CompletedTask;
    }

    private string PathOf(string key)
    {
        var path = Path.GetFullPath(Path.Combine(_root, key));
        return path.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal)
            ? path
            : throw new ArgumentException("A backup key must stay inside the store.", nameof(key));
    }
}
