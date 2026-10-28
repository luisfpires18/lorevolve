namespace LorEvolve.Api.Features.Assistant;

/// <summary>What a question asks the assistant for, each with its own allowance: reading, or preparing changes (ADR 0047).</summary>
public enum AssistantQuestionKind
{
    Ask,
    Propose,
}

/// <summary>
/// How many questions of each kind every account has asked in its current window, and the one place that decides whether
/// it may ask another (ADR 0045). Enforcement and the usage the Profile shows read the same numbers, so they cannot
/// disagree.
///
/// A fixed window per account and kind: the first question of a kind after a quiet spell opens a window of
/// <see cref="AssistantSetup.QuestionWindow"/>, every question of that kind in it counts, and when it ends the count goes
/// back to zero all at once. A refused question is not counted. Held in this process's memory: a restart forgets it, and
/// two instances would each count on their own.
/// </summary>
public sealed class AssistantAllowance(TimeProvider clock)
{
    // ponytail: one lock for every account; a question is seconds of model time, so this is never the contention point.
    private readonly Lock _gate = new();
    private readonly Dictionary<(string Account, AssistantQuestionKind Kind), (DateTimeOffset Start, int Used)> _windows = [];

    public static int Limit(AssistantQuestionKind kind) =>
        kind == AssistantQuestionKind.Propose ? AssistantSetup.ProposeQuestionsPerWindow : AssistantSetup.AskQuestionsPerWindow;

    /// <summary>
    /// Counts one question of <paramref name="kind"/> for <paramref name="accountId"/>, or returns how long until it may ask
    /// another if that window is full.
    /// </summary>
    public TimeSpan? TryTake(string accountId, AssistantQuestionKind kind)
    {
        var now = clock.GetUtcNow();
        lock (_gate)
        {
            if (!_windows.TryGetValue((accountId, kind), out var window) || now >= window.Start + AssistantSetup.QuestionWindow)
            {
                // A window ends unseen when nobody asks again, so whoever opens a new one clears the ended ones away.
                foreach (var ended in _windows.Where(entry => now >= entry.Value.Start + AssistantSetup.QuestionWindow).Select(entry => entry.Key).ToList())
                {
                    _windows.Remove(ended);
                }

                window = (now, 0);
            }

            if (window.Used >= Limit(kind))
            {
                return window.Start + AssistantSetup.QuestionWindow - now;
            }

            _windows[(accountId, kind)] = (window.Start, window.Used + 1);
            return null;
        }
    }

    /// <summary>Gives back a question taken by <see cref="TryTake"/> that never reached the model: the assistant was busy.</summary>
    public void GiveBack(string accountId, AssistantQuestionKind kind)
    {
        lock (_gate)
        {
            if (_windows.TryGetValue((accountId, kind), out var window) && window.Used > 0)
            {
                _windows[(accountId, kind)] = (window.Start, window.Used - 1);
            }
        }
    }

    /// <summary>The account's questions of each kind in its current windows; none open is nothing used.</summary>
    public AssistantUsage Read(string accountId)
    {
        var now = clock.GetUtcNow();
        lock (_gate)
        {
            AssistantKindUsage Of(AssistantQuestionKind kind) =>
                _windows.TryGetValue((accountId, kind), out var window) && now < window.Start + AssistantSetup.QuestionWindow
                    ? new(window.Used, Limit(kind), Limit(kind) - window.Used, window.Start + AssistantSetup.QuestionWindow)
                    : new(0, Limit(kind), Limit(kind), null);

            return new(Of(AssistantQuestionKind.Ask), Of(AssistantQuestionKind.Propose), (int)AssistantSetup.QuestionWindow.TotalSeconds);
        }
    }
}

/// <summary>
/// The line of questions waiting for the model, shared by every account on this host. A provider whose rate limit is the
/// host's, not the account's (Groq's free tier: 8,000 tokens a minute, one proposal step about 6,500), answers one question
/// at a time; two at once would both be refused. The others wait their turn, for at most <see cref="Wait"/>, then are
/// told the assistant is busy. A provider without such a limit has a line with no end.
/// </summary>
public sealed class AssistantLine(int places)
{
    /// <summary>How long a question waits for its turn. With the question's own timeout, under App Service's 230 s.</summary>
    public static readonly TimeSpan Wait = TimeSpan.FromSeconds(40);

    // ponytail: this process only; a second instance would have its own line, so scale out needs a shared one.
    private readonly SemaphoreSlim _places = new(places, places);

    /// <summary>A place in the line, released when disposed; null when no place came free in time.</summary>
    public async Task<IDisposable?> EnterAsync(CancellationToken cancellationToken) =>
        await _places.WaitAsync(Wait, cancellationToken) ? new Place(_places) : null;

    private sealed class Place(SemaphoreSlim places) : IDisposable
    {
        private int _left;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _left, 1) == 0)
            {
                places.Release();
            }
        }
    }
}

/// <summary>
/// One account's assistant allowance: its questions and its prepared changes, counted apart, in windows of
/// <c>WindowSeconds</c>. No other account, no question and no answer is ever in it.
/// </summary>
public sealed record AssistantUsage(AssistantKindUsage Ask, AssistantKindUsage Propose, int WindowSeconds);

/// <summary>
/// One kind's count. <c>ResetsAt</c> is when its current window ends and <c>Used</c> drops to zero; null when no window
/// is open.
/// </summary>
public sealed record AssistantKindUsage(int Used, int Limit, int Remaining, DateTimeOffset? ResetsAt);
