using System.Net;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;

namespace LorEvolve.Api.Features.Media;

/// <summary>
/// Cloudflare R2, over its S3-compatible API.
///
/// R2 is not S3. Three of the places it differs are settled in <see cref="MediaSetup"/>, not
/// here: the endpoint is the account's own, addressing is path-style, and the region is the
/// literal string <c>auto</c>. The fourth is on the upload itself - see <see cref="PutAsync"/>.
///
/// The bucket is private. Nothing in this class makes an object public, sets an ACL, or hands
/// out a URL that points at Cloudflare - reads go through LorEvolve's own authenticated route, so
/// the credentials and the endpoint never leave the server. See ADR 0019.
///
/// Every SDK failure leaves this class as a <see cref="MediaStorageFailedException"/> carrying
/// LorEvolve's own sentence, so an R2 error response can never reach a caller - or a client - as a
/// raw <see cref="AmazonS3Exception"/>. The provider's own message survives only as the inner
/// exception, for the log.
/// </summary>
public sealed class R2MediaObjectStore(IAmazonS3 client, string bucket) : IMediaObjectStore
{
    private const string FailureMessage = "Image storage could not complete the request.";

    /// <summary>
    /// Writes one object.
    ///
    /// <para><b>The two flags below are not tuning, and removing either breaks every upload.</b>
    /// By default AWSSDK.S3 streams a PutObject body as <c>aws-chunked</c>, signing each chunk
    /// (<c>x-amz-content-sha256: STREAMING-AWS4-HMAC-SHA256-PAYLOAD</c>) or trailing a checksum
    /// after the last one. R2 implements neither, and answers
    /// <c>STREAMING-AWS4-HMAC-SHA256-PAYLOAD not implemented</c> - which is exactly how the
    /// first live upload on Azure DEV failed. Cloudflare's own .NET guide for R2 sets both on
    /// every PutObject.</para>
    ///
    /// <para><c>DisablePayloadSigning</c> sends <c>UNSIGNED-PAYLOAD</c> instead, so the request
    /// is still SigV4-signed but the body is sent plainly. The SDK only permits that over HTTPS,
    /// and the endpoint is always HTTPS, so transport integrity is TLS's job - the same trade
    /// Cloudflare's guide makes. <c>DisableDefaultChecksumValidation</c> stops the SDK adding the
    /// trailing checksum that would otherwise turn the body back into a chunked stream. Both are
    /// asserted, on the request and on the wire, by <c>R2MediaObjectStoreTests</c>.</para>
    /// </summary>
    public async Task PutAsync(
        string key,
        Stream content,
        string contentType,
        CancellationToken cancellationToken)
    {
        try
        {
            await client.PutObjectAsync(
                new PutObjectRequest
                {
                    BucketName = bucket,
                    Key = key,
                    InputStream = content,
                    ContentType = contentType,

                    // Nothing is inferred from the key's extension. The content type was decided
                    // by decoding the bytes, and this is the only thing that should be able to set it.
                    AutoCloseStream = false,

                    // R2 compatibility. Required, not optional - see the summary above.
                    DisablePayloadSigning = true,
                    DisableDefaultChecksumValidation = true,
                },
                cancellationToken);
        }
        catch (Exception exception) when (IsProviderFailure(exception, cancellationToken))
        {
            throw new MediaStorageFailedException(FailureMessage, exception);
        }
    }

    public async Task<StoredMediaObject?> GetAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            var response = await client.GetObjectAsync(bucket, key, cancellationToken);
            return new StoredMediaObject(
                response.ResponseStream,
                response.Headers.ContentType ?? "application/octet-stream",
                response.ContentLength);
        }
        catch (AmazonS3Exception exception) when (IsMissing(exception))
        {
            // A key the database still names but the bucket no longer holds. That is a gap
            // between two stores, not a server fault, and the caller answers 404 for it.
            return null;
        }
        catch (Exception exception) when (IsProviderFailure(exception, cancellationToken))
        {
            throw new MediaStorageFailedException(FailureMessage, exception);
        }
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            await client.DeleteObjectAsync(bucket, key, cancellationToken);
        }
        catch (AmazonS3Exception exception) when (IsMissing(exception))
        {
            // Deleting what is not there is the outcome the caller wanted. S3 itself answers
            // 204 for this; R2 is not required to, so it is absorbed rather than assumed.
        }
        catch (Exception exception) when (IsProviderFailure(exception, cancellationToken))
        {
            throw new MediaStorageFailedException(FailureMessage, exception);
        }
    }

    private static bool IsMissing(AmazonS3Exception exception) =>
        exception.StatusCode is HttpStatusCode.NotFound
        || string.Equals(exception.ErrorCode, "NoSuchKey", StringComparison.Ordinal)
        || string.Equals(exception.ErrorCode, "NoSuchBucket", StringComparison.Ordinal);

    /// <summary>
    /// What the provider can do wrong: an error response, a connection that failed, or a call
    /// that timed out. A cancellation the caller asked for is not one of them and is left alone,
    /// and neither is anything else - a bug in LorEvolve should stay a bug, not become a 503.
    /// </summary>
    private static bool IsProviderFailure(Exception exception, CancellationToken cancellationToken) =>
        exception switch
        {
            // Siblings, not parent and child: a service error is not a client exception.
            AmazonServiceException or AmazonClientException => true,
            HttpRequestException or IOException or TimeoutException => true,
            OperationCanceledException => !cancellationToken.IsCancellationRequested,
            _ => false,
        };
}
