using System.Net;
using System.Reflection;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using LorEvolve.Api.Features.Media;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The R2 adapter, on its own and without Cloudflare.
///
/// The first upload on Azure DEV failed with <c>STREAMING-AWS4-HMAC-SHA256-PAYLOAD not
/// implemented</c>: AWSSDK.S3 streamed the body as a signed <c>aws-chunked</c> payload, which S3
/// accepts and R2 does not. Nothing in the rest of the suite could have caught that, because the
/// API host runs against an in-process store. So the compatibility requirement is pinned twice
/// here - once on the request the adapter builds, and once on the HTTP request a real SDK client
/// configured exactly as a deployment would actually send - so it cannot quietly disappear in a
/// refactor or an SDK upgrade.
///
/// No request leaves the process. The wire test hands the SDK an HTTP handler that answers
/// itself, and every credential is obviously synthetic.
/// </summary>
public sealed class R2MediaObjectStoreTests
{
    private const string Bucket = "synthetic-bucket";

    private const string Key = "universes/00000000-0000-0000-0000-000000000001/entities/00000000-0000-0000-0000-000000000002/primary/00000000-0000-0000-0000-000000000003/original.png";

    // ---------- The live bug ----------

    [Fact]
    public async Task A_put_disables_payload_signing_and_the_default_checksum_as_R2_requires()
    {
        var s3 = FakeS3.Create(out var fake);
        fake.Handle = (method, args) => method.Name == nameof(IAmazonS3.PutObjectAsync)
            ? Task.FromResult(new PutObjectResponse())
            : throw new InvalidOperationException($"Unexpected call to {method.Name}.");

        using var body = new MemoryStream([1, 2, 3, 4]);
        await new R2MediaObjectStore(s3, Bucket).PutAsync(Key, body, "image/png", CancellationToken.None);

        var request = Assert.IsType<PutObjectRequest>(Assert.Single(fake.Calls).Args[0]);

        // Cloudflare's own .NET guide for R2 sets exactly these two on every PutObject.
        Assert.True(request.DisablePayloadSigning);
        Assert.True(request.DisableDefaultChecksumValidation);

        Assert.Equal(Bucket, request.BucketName);
        Assert.Equal(Key, request.Key);
        Assert.Equal("image/png", request.ContentType);
        Assert.False(request.AutoCloseStream);
    }

    [Fact]
    public async Task On_the_wire_a_put_is_one_plain_unsigned_payload_over_https_and_never_a_signed_stream()
    {
        var handler = new AnsweringHandler();
        var config = MediaSetup.R2ClientConfig("https://synthetic-account.r2.cloudflarestorage.com");
        config.HttpClientFactory = new HandlerClientFactory(handler);

        using var client = new AmazonS3Client(
            new BasicAWSCredentials("synthetic-access-key-id", "synthetic-secret-access-key"),
            config);

        var bytes = Enumerable.Range(0, 70_000).Select(index => (byte)(index % 251)).ToArray();
        using var body = new MemoryStream(bytes);

        await new R2MediaObjectStore(client, Bucket).PutAsync(Key, body, "image/png", CancellationToken.None);

        var sent = Assert.Single(handler.Requests);

        Assert.Equal(HttpMethod.Put, sent.Method);
        Assert.Equal(Uri.UriSchemeHttps, sent.Uri.Scheme);

        // Path-style: the bucket is the first segment, not a subdomain R2 does not serve.
        Assert.StartsWith($"/{Bucket}/universes/", sent.Uri.AbsolutePath, StringComparison.Ordinal);

        // The regression itself. R2 answers "STREAMING-AWS4-HMAC-SHA256-PAYLOAD not implemented"
        // to any streaming payload mode, signed or trailed, so the body has to be declared unsigned.
        Assert.Equal("UNSIGNED-PAYLOAD", sent.Header("x-amz-content-sha256"));
        Assert.DoesNotContain("STREAMING", sent.AllHeaderValues, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("aws-chunked", sent.AllHeaderValues, StringComparison.OrdinalIgnoreCase);
        Assert.Null(sent.Header("x-amz-decoded-content-length"));
        Assert.Null(sent.Header("x-amz-trailer"));

        // Still SigV4, still for R2's "auto" region: unsigned payload is not an unsigned request.
        Assert.Contains("AWS4-HMAC-SHA256", sent.Header("Authorization"), StringComparison.Ordinal);
        Assert.Contains("/auto/s3/aws4_request", sent.Header("Authorization"), StringComparison.Ordinal);

        // And the body is the object, byte for byte - no chunk framing around it.
        Assert.Equal(bytes, sent.Body);
    }

    // ---------- Failures stay LorEvolve's own ----------

    [Fact]
    public async Task An_R2_error_becomes_a_storage_failure_and_never_an_sdk_exception()
    {
        var s3 = FakeS3.Create(out var fake);
        var refusal = new AmazonS3Exception(
            "STREAMING-AWS4-HMAC-SHA256-PAYLOAD not implemented",
            ErrorType.Sender,
            "NotImplemented",
            "synthetic-request",
            HttpStatusCode.NotImplemented);

        fake.Handle = (_, _) => Task.FromException<PutObjectResponse>(refusal);

        using var body = new MemoryStream([1, 2, 3]);
        var thrown = await Assert.ThrowsAsync<MediaStorageFailedException>(() =>
            new R2MediaObjectStore(s3, Bucket).PutAsync(Key, body, "image/png", CancellationToken.None));

        // The sentence a response may carry is LorEvolve's; what R2 said is kept for the log only.
        Assert.DoesNotContain("STREAMING", thrown.Message, StringComparison.Ordinal);
        Assert.Same(refusal, thrown.InnerException);
    }

    [Fact]
    public async Task A_network_failure_on_a_read_becomes_a_storage_failure()
    {
        var s3 = FakeS3.Create(out var fake);
        fake.Handle = (_, _) => Task.FromException<GetObjectResponse>(new HttpRequestException("Connection refused."));

        await Assert.ThrowsAsync<MediaStorageFailedException>(() =>
            new R2MediaObjectStore(s3, Bucket).GetAsync(Key, CancellationToken.None));
    }

    [Fact]
    public async Task A_missing_object_is_still_a_miss_and_not_a_failure()
    {
        var s3 = FakeS3.Create(out var fake);
        fake.Handle = (method, _) => method.Name switch
        {
            nameof(IAmazonS3.GetObjectAsync) => Task.FromException<GetObjectResponse>(Missing()),
            _ => Task.FromException<DeleteObjectResponse>(Missing()),
        };

        var store = new R2MediaObjectStore(s3, Bucket);

        Assert.Null(await store.GetAsync(Key, CancellationToken.None));
        await store.DeleteAsync(Key, CancellationToken.None);
    }

    [Fact]
    public async Task A_cancellation_the_caller_asked_for_is_not_reported_as_a_storage_failure()
    {
        using var cancelled = new CancellationTokenSource();
        await cancelled.CancelAsync();

        var s3 = FakeS3.Create(out var fake);
        fake.Handle = (_, _) => Task.FromCanceled<PutObjectResponse>(cancelled.Token);

        using var body = new MemoryStream([1]);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            new R2MediaObjectStore(s3, Bucket).PutAsync(Key, body, "image/png", cancelled.Token));
    }

    private static AmazonS3Exception Missing() =>
        new("The specified key does not exist.", ErrorType.Sender, "NoSuchKey", "synthetic-request", HttpStatusCode.NotFound);

    // ---------- Fakes ----------

    /// <summary>
    /// <see cref="IAmazonS3"/> is several hundred members wide. A dispatch proxy stands in for it
    /// with one delegate, so a test says only what the one call it cares about should do.
    /// </summary>
    public class FakeS3 : DispatchProxy
    {
        public List<(MethodInfo Method, object?[] Args)> Calls { get; } = [];

        public Func<MethodInfo, object?[], object?> Handle { get; set; } =
            (method, _) => throw new InvalidOperationException($"Unexpected call to {method.Name}.");

        public static IAmazonS3 Create(out FakeS3 fake)
        {
            var proxy = Create<IAmazonS3, FakeS3>();
            fake = (FakeS3)(object)proxy;
            return proxy;
        }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            ArgumentNullException.ThrowIfNull(targetMethod);

            if (targetMethod.Name == nameof(IDisposable.Dispose))
            {
                return null;
            }

            Calls.Add((targetMethod, args ?? []));
            return Handle(targetMethod, args ?? []);
        }
    }

    private sealed record SentRequest(HttpMethod Method, Uri Uri, IReadOnlyList<KeyValuePair<string, string>> Headers, byte[] Body)
    {
        public string? Header(string name) =>
            Headers.Where(header => string.Equals(header.Key, name, StringComparison.OrdinalIgnoreCase))
                .Select(header => header.Value)
                .FirstOrDefault();

        public string AllHeaderValues => string.Join('\n', Headers.Select(header => $"{header.Key}: {header.Value}"));
    }

    /// <summary>Answers every request itself with an empty 200, after writing down what it was sent.</summary>
    private sealed class AnsweringHandler : HttpMessageHandler
    {
        public List<SentRequest> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var body = request.Content is null ? [] : await request.Content.ReadAsByteArrayAsync(cancellationToken);

            var headers = request.Headers
                .Concat(request.Content?.Headers ?? Enumerable.Empty<KeyValuePair<string, IEnumerable<string>>>())
                .SelectMany(header => header.Value.Select(value => new KeyValuePair<string, string>(header.Key, value)))
                .ToList();

            Requests.Add(new SentRequest(request.Method, request.RequestUri!, headers, body));

            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                RequestMessage = request,
                Content = new ByteArrayContent([]),
            };
            response.Headers.ETag = new System.Net.Http.Headers.EntityTagHeaderValue("\"synthetic-etag\"");
            return response;
        }
    }

    private sealed class HandlerClientFactory(HttpMessageHandler handler) : HttpClientFactory
    {
        public override HttpClient CreateHttpClient(IClientConfig clientConfig) => new(handler, disposeHandler: false);

        public override bool UseSDKHttpClientCaching(IClientConfig clientConfig) => false;

        public override bool DisposeHttpClientsAfterUse(IClientConfig clientConfig) => true;

        public override string? GetConfigUniqueString(IClientConfig clientConfig) => null;
    }
}
