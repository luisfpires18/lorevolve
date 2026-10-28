using System.ClientModel.Primitives;
using System.Diagnostics;
using System.Net;
using System.Text;
using LorEvolve.Api.Features.Assistant;
using static LorEvolve.Api.Tests.OpenAIAssistantProviderTests;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A provider rate limiting this host (Issue #46): Groq's 429, as DEV logged it, against a stub transport that answers with
/// it a given number of times and then with an answer. The client pipeline sends a 429 once more, after its own backoff or
/// the server's Retry-After, whichever is longer, and only when that wait is short; otherwise the question is busy at once.
/// No key, no network.
/// </summary>
public sealed class AssistantRateLimitTests
{
    // Groq's own body, as DEV logged it on 2026-10-23.
    private const string RateLimited =
        """{"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 3716, Requested 4322. Please try again in 285ms.","type":"tokens","code":"rate_limit_exceeded"}}""";

    private const string Answer = """{"segments":[{"kind":"note","text":"Done.","sources":[]}]}""";

    private static readonly AssistantBrief Brief = new(
        "Standing instructions.",
        [new AssistantMessage(AssistantRole.User, "Who is Arin?")],
        AssistantTools.Definitions,
        UniverseAssistant.AnswerSchema,
        UniverseAssistant.MaxOutputTokens);

    /// <summary>A 429 for the first <paramref name="limited"/> requests, with <paramref name="retryAfter"/> if given; then an answer.</summary>
    private sealed class LimitedGroq(int limited, string? retryAfter = null) : HttpMessageHandler
    {
        private readonly Stopwatch _clock = Stopwatch.StartNew();

        /// <summary>When each request arrived, from the stub's creation.</summary>
        public List<TimeSpan> Sent { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Sent.Add(_clock.Elapsed);
            if (Sent.Count > limited)
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(Response(Message(Answer)), Encoding.UTF8, "application/json"),
                });
            }

            var refused = new HttpResponseMessage(HttpStatusCode.TooManyRequests)
            {
                Content = new StringContent(RateLimited, Encoding.UTF8, "application/json"),
            };
            if (retryAfter is not null)
            {
                refused.Headers.TryAddWithoutValidation("retry-after", retryAfter);
            }

            return Task.FromResult(refused);
        }
    }

    private static IAssistantConversation Begin(LimitedGroq groq) =>
        new GroqAssistantProvider(
                GroqAssistantProvider.CreateClient("test-only-not-a-key", new HttpClientPipelineTransport(new HttpClient(groq))),
                "openai/gpt-oss-120b")
            .Begin(Brief);

    [Fact]
    public async Task A_short_lived_429_is_sent_once_more_after_a_backoff_and_answers()
    {
        var groq = new LimitedGroq(limited: 1);

        var turn = await Begin(groq).NextAsync([], toolsAllowed: false, CancellationToken.None);

        Assert.Equal(Answer, turn.Answer);
        Assert.Equal(2, groq.Sent.Count);
        // Not an immediate repeat: the pipeline's own backoff (0.8 s) when the server names no wait.
        Assert.True(groq.Sent[1] - groq.Sent[0] >= TimeSpan.FromMilliseconds(700), $"{groq.Sent[1] - groq.Sent[0]}");
    }

    [Fact]
    public async Task The_retry_waits_as_long_as_the_server_asks_when_that_is_longer_than_the_backoff()
    {
        var groq = new LimitedGroq(limited: 1, retryAfter: "2");

        var turn = await Begin(groq).NextAsync([], toolsAllowed: false, CancellationToken.None);

        Assert.Equal(Answer, turn.Answer);
        Assert.Equal(2, groq.Sent.Count);
        Assert.True(groq.Sent[1] - groq.Sent[0] >= TimeSpan.FromSeconds(1.9), $"{groq.Sent[1] - groq.Sent[0]}");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("1")]
    public async Task A_persistent_429_is_busy_after_one_retry_and_no_more(string? retryAfter)
    {
        var groq = new LimitedGroq(limited: int.MaxValue, retryAfter);

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(
            () => Begin(groq).NextAsync([], toolsAllowed: false, CancellationToken.None));

        Assert.Equal(AssistantFailure.Busy, thrown.Failure);
        Assert.Equal("Groq is rate limiting this host.", thrown.Message);
        Assert.Equal(2, groq.Sent.Count);
    }

    [Fact]
    public async Task A_wait_longer_than_the_retry_allows_is_busy_at_once_not_slept_through_until_the_question_times_out()
    {
        // A daily limit, say: waiting it out would hold the question until its own timeout, reported as too slow.
        var groq = new LimitedGroq(limited: 1, retryAfter: "120");
        var clock = Stopwatch.StartNew();

        var thrown = await Assert.ThrowsAsync<AssistantProviderException>(
            () => Begin(groq).NextAsync([], toolsAllowed: false, CancellationToken.None));

        Assert.Equal(AssistantFailure.Busy, thrown.Failure);
        Assert.Single(groq.Sent);
        Assert.True(clock.Elapsed < TimeSpan.FromSeconds(5), $"{clock.Elapsed}");
    }

    [Fact]
    public async Task Closing_the_question_during_the_wait_stops_it_and_sends_nothing_more()
    {
        var groq = new LimitedGroq(limited: 1, retryAfter: "8");
        using var cancel = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
        var clock = Stopwatch.StartNew();

        var thrown = await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => Begin(groq).NextAsync([], toolsAllowed: false, cancel.Token));

        // Cancelled, not a timeout or a failure, and well before the wait would have ended.
        Assert.Equal(cancel.Token, thrown.CancellationToken);
        Assert.Single(groq.Sent);
        Assert.True(clock.Elapsed < TimeSpan.FromSeconds(4), $"{clock.Elapsed}");
    }
}
