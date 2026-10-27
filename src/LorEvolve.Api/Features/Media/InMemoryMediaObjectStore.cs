using System.Collections.Concurrent;

namespace LorEvolve.Api.Features.Media;

/// <summary>
/// Objects in a dictionary, for the two hosts that must run without Cloudflare: the local
/// development server and the Playwright suite that drives it.
///
/// It is a real implementation of the contract, not a stub - a put replaces, a miss returns
/// null, a delete is idempotent - so a journey that exercises upload, replace and remove
/// proves the same lifecycle against this as it does against R2. What it is not is durable:
/// the process holds the bytes and restarting it loses them. That is stated in the runbook,
/// because a developer whose images vanish on a rebuild deserves to have been told.
/// </summary>
public sealed class InMemoryMediaObjectStore : IMediaObjectStore
{
    private readonly ConcurrentDictionary<string, StoredBytes> _objects = new(StringComparer.Ordinal);

    public Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        content.CopyTo(buffer);
        _objects[key] = new StoredBytes(buffer.ToArray(), contentType);
        return Task.CompletedTask;
    }

    public Task<StoredMediaObject?> GetAsync(string key, CancellationToken cancellationToken)
    {
        if (!_objects.TryGetValue(key, out var stored))
        {
            return Task.FromResult<StoredMediaObject?>(null);
        }

        return Task.FromResult<StoredMediaObject?>(
            new StoredMediaObject(new MemoryStream(stored.Bytes, writable: false), stored.ContentType, stored.Bytes.Length));
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        _objects.TryRemove(key, out _);
        return Task.CompletedTask;
    }

    /// <summary>Whether an object exists, for tests that assert on the store rather than through it.</summary>
    public bool Contains(string key) => _objects.ContainsKey(key);

    /// <summary>Every key currently held, for tests that assert on the key convention.</summary>
    public IReadOnlyCollection<string> Keys => [.. _objects.Keys];

    private sealed record StoredBytes(byte[] Bytes, string ContentType);
}
