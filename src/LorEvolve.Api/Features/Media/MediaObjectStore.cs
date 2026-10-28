namespace LorEvolve.Api.Features.Media;

/// <summary>
/// One object read back out of the store. The caller owns <see cref="Content"/> and disposes it.
/// </summary>
public sealed record StoredMediaObject(Stream Content, string ContentType, long Length) : IAsyncDisposable
{
    public ValueTask DisposeAsync() => Content.DisposeAsync();
}

/// <summary>
/// The object store, as narrowly as LorEvolve actually needs it: put one object, read one object,
/// delete one object.
///
/// Deliberately not a cloud-storage framework. There is no bucket management, no listing, no
/// copy, no multipart upload and no lifecycle policy here, because nothing in the product wants
/// any of it - a lore entry has one primary image and that is the whole requirement. The
/// interface exists so tests never reach Cloudflare, not so a second provider could be slotted
/// in one day.
///
/// Keys are opaque to this interface. The convention that produces them lives with the feature
/// that owns the objects, in <c>Features/Lore/EntityImageKeys.cs</c>.
///
/// A store that cannot do what it was asked throws a <see cref="MediaStorageException"/>, and
/// nothing provider-specific: the endpoints answer that with a 503 and never see an SDK type.
/// </summary>
public interface IMediaObjectStore
{
    /// <summary>Writes one object, replacing anything already at <paramref name="key"/>.</summary>
    Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken);

    /// <summary>The object, or null when there is nothing at that key. A miss is not an error.</summary>
    Task<StoredMediaObject?> GetAsync(string key, CancellationToken cancellationToken);

    /// <summary>Removes one object. Idempotent: deleting nothing succeeds.</summary>
    Task DeleteAsync(string key, CancellationToken cancellationToken);
}

/// <summary>
/// The store could not do what it was asked. The message is LorEvolve's own sentence and is safe to
/// show; whatever the provider said is only ever the inner exception, and only ever logged.
/// </summary>
public abstract class MediaStorageException(string message, Exception? innerException = null)
    : Exception(message, innerException);

/// <summary>
/// Thrown when a request needs object storage and none is configured. Nothing was attempted, so
/// nothing can have been written. The endpoints turn it into a 503 that says so, rather than a
/// 500 that says nothing.
/// </summary>
public sealed class MediaStorageUnavailableException(string message) : MediaStorageException(message);

/// <summary>
/// Thrown when a configured store refused a call or did not answer it - an R2 error response, a
/// network failure, a timeout. Unlike <see cref="MediaStorageUnavailableException"/>, a write
/// may have landed before the failure surfaced, so a caller that was writing sweeps what it
/// tried to write.
/// </summary>
public sealed class MediaStorageFailedException(string message, Exception innerException)
    : MediaStorageException(message, innerException);

/// <summary>
/// What is registered when no provider is configured. Every call fails the same way, loudly and
/// immediately, so a deployment missing its R2 settings cannot look like a deployment whose
/// images have simply gone missing.
/// </summary>
public sealed class UnavailableMediaObjectStore : IMediaObjectStore
{
    private const string Message = "Image storage is not configured.";

    public Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken) =>
        throw new MediaStorageUnavailableException(Message);

    public Task<StoredMediaObject?> GetAsync(string key, CancellationToken cancellationToken) =>
        throw new MediaStorageUnavailableException(Message);

    public Task DeleteAsync(string key, CancellationToken cancellationToken) =>
        throw new MediaStorageUnavailableException(Message);
}
