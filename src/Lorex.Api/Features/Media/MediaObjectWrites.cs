namespace Lorex.Api.Features.Media;

/// <summary>One object waiting to be written. The stream is this write's own and is read once.</summary>
/// <param name="Key">Where it goes. Nothing is ever written over a key that is currently live.</param>
internal sealed record PendingMediaObject(string Key, Stream Content, string ContentType);

/// <summary>
/// Writing more than one object, and deleting more than one, without waiting for each in turn.
///
/// <para><b>Why concurrency is safe here and only here.</b> An image is stored as a pair - the
/// original and the square cut from it - and both are fully prepared in memory before either is
/// written, under an asset id nothing is using. Neither write depends on the other's result, and
/// neither can be read by anything until the database moves, which happens after both have
/// succeeded. So the only thing the sequential version bought was latency: two round trips to a
/// bucket on the other side of the internet, one after the other, for work that has no order.</para>
///
/// <para><b>What does not change.</b> The failure contract is exactly the one the sequential
/// version had, because it was already written for "the first may have landed before the second
/// did not": on any failure the caller sweeps every key it was writing, and a delete of an object
/// that was never written succeeds. Concurrency only widens which of the two might be the one that
/// landed, and the caller already made no assumption about that.</para>
///
/// <para><see cref="MediaStorageUnavailableException"/> keeps its stronger meaning - nothing was
/// attempted, so there is nothing to sweep - and is only reported when <i>every</i> write failed
/// that way. If even one write failed for another reason, the caller is told it was a failure
/// rather than an absence, so it sweeps.</para>
/// </summary>
internal static class MediaObjectWrites
{
    /// <summary>
    /// Writes every object at once. Throws the way one <see cref="IMediaObjectStore.PutAsync"/>
    /// would, so callers keep the two catch blocks they already have.
    /// </summary>
    public static async Task PutAllAsync(
        IMediaObjectStore store,
        CancellationToken cancellationToken,
        params PendingMediaObject[] objects)
    {
        var writes = objects
            .Select(pending => store.PutAsync(pending.Key, pending.Content, pending.ContentType, cancellationToken))
            .ToArray();

        try
        {
            await Task.WhenAll(writes);
        }
        catch
        {
            // Task.WhenAll surfaces only the first exception, and which one that is says nothing
            // useful. What the caller needs is whether anything could have landed, so every
            // failure is looked at rather than just the one that got thrown.
            var failures = writes
                .Where(write => write.IsFaulted)
                .Select(write => write.Exception!.InnerExceptions[0])
                .ToArray();

            if (failures.Length == 0)
            {
                // Cancelled rather than faulted. The caller's own token, so let it through.
                throw;
            }

            throw failures.All(failure => failure is MediaStorageUnavailableException)
                ? failures[0]
                : failures.FirstOrDefault(failure => failure is not MediaStorageUnavailableException) ?? failures[0];
        }
    }

    /// <summary>
    /// Deletes objects nothing points at any more, a few at a time, and never throws.
    ///
    /// Every caller has already decided what the truth is - either the write did not happen and
    /// these are litter, or it did and the superseded objects are litter - so the request has its
    /// answer either way. A key that will not delete is logged with its key and left; there is no
    /// retry queue, for the reasons ADR 0019 gives.
    ///
    /// The token is deliberately not the request's: cleanup after a commit must not be abandoned
    /// because the client hung up.
    /// </summary>
    public static Task SweepAsync(
        IMediaObjectStore store,
        ILogger logger,
        Action<ILogger, string, Exception> onOrphan,
        params string[] keys) =>
        // Bounded: a failed restore can leave thousands of keys, and R2 throttles a burst that size.
        Parallel.ForEachAsync(keys, new ParallelOptions { MaxDegreeOfParallelism = 8 }, async (key, _) =>
        {
            try
            {
                await store.DeleteAsync(key, CancellationToken.None);
            }
            catch (Exception exception)
            {
                onOrphan(logger, key, exception);
            }
        });
}
