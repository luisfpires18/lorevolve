using System.Collections.Concurrent;
using LorEvolve.Api.Features.Media;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The object store the test host runs against: a dictionary, plus two hooks.
///
/// It is a real implementation, not a mock. A put replaces, a miss returns null and a delete is
/// idempotent, so the lifecycle tests exercise the same ordering they would against R2 - and the
/// keys it holds are exactly the keys the endpoint wrote, which is what lets a test assert the
/// naming convention rather than trust it.
///
/// <see cref="FailPut"/>, <see cref="FailGet"/> and <see cref="FailDelete"/> are how the failure
/// paths become testable. An upload that dies halfway, a store that stops answering and a
/// cleanup that will not run are the cases the whole two-store design exists for, and none of
/// them can be provoked from outside.
/// </summary>
public sealed class TestMediaObjectStore : IMediaObjectStore
{
    private readonly ConcurrentDictionary<string, Entry> _objects = new(StringComparer.Ordinal);

    /// <summary>Returns an exception to throw instead of storing the key, or null to store it.</summary>
    public Func<string, Exception?>? FailPut { get; set; }

    /// <summary>
    /// Awaited before an object is stored. It is how a test holds one write open while another
    /// arrives, which is the only way to prove from outside that a pair is written at once rather
    /// than one after the other.
    /// </summary>
    public Func<string, Task>? BeforePut { get; set; }

    /// <summary>Returns an exception to throw instead of reading the key, or null to read it.</summary>
    public Func<string, Exception?>? FailGet { get; set; }

    /// <summary>Returns an exception to throw instead of deleting the key, or null to delete it.</summary>
    public Func<string, Exception?>? FailDelete { get; set; }

    /// <summary>
    /// Awaited before an object is deleted. It is how a test holds a sweep open and looks at what else is true
    /// meanwhile - that the database is free to write, say, because nothing sweeps while holding its lock.
    /// </summary>
    public Func<string, Task>? BeforeDelete { get; set; }

    public IReadOnlyCollection<string> Keys => [.. _objects.Keys];

    public bool Contains(string key) => _objects.ContainsKey(key);

    public byte[] Bytes(string key) => _objects[key].Bytes;

    public string ContentType(string key) => _objects[key].ContentType;

    /// <summary>Drops an object behind the API's back, to model a bucket that lost one.</summary>
    public void Evict(string key) => _objects.TryRemove(key, out _);

    public async Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken)
    {
        if (FailPut?.Invoke(key) is { } failure)
        {
            throw failure;
        }

        if (BeforePut is { } wait)
        {
            await wait(key);
        }

        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, cancellationToken);
        _objects[key] = new Entry(buffer.ToArray(), contentType);
    }

    public Task<StoredMediaObject?> GetAsync(string key, CancellationToken cancellationToken)
    {
        if (FailGet?.Invoke(key) is { } failure)
        {
            throw failure;
        }

        if (!_objects.TryGetValue(key, out var entry))
        {
            return Task.FromResult<StoredMediaObject?>(null);
        }

        return Task.FromResult<StoredMediaObject?>(new StoredMediaObject(
            new MemoryStream(entry.Bytes, writable: false),
            entry.ContentType,
            entry.Bytes.Length));
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        if (FailDelete?.Invoke(key) is { } failure)
        {
            throw failure;
        }

        if (BeforeDelete is { } wait)
        {
            await wait(key);
        }

        _objects.TryRemove(key, out _);
    }

    private sealed record Entry(byte[] Bytes, string ContentType);
}
