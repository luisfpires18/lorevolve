namespace Lorex.Api.Features.Assistant;

/// <summary>
/// How many questions each account has asked in its current window, and the one place that decides whether it may ask
/// another (ADR 0045). Enforcement and the usage Settings shows read the same numbers, so they cannot disagree.
///
/// A fixed window per account: the first question after a quiet spell opens a window of
/// <see cref="AssistantSetup.QuestionWindow"/>, every question in it counts, and when it ends the count goes back to zero
/// all at once. A refused question is not counted. Held in this process's memory, like the framework limiter it replaced:
/// a restart forgets it, and two instances would each count on their own.
/// </summary>
public sealed class AssistantAllowance(TimeProvider clock)
{
    // ponytail: one lock for every account; a question is seconds of model time, so this is never the contention point.
    private readonly Lock _gate = new();
    private readonly Dictionary<string, (DateTimeOffset Start, int Used)> _windows = new(StringComparer.Ordinal);

    /// <summary>
    /// Counts one question for <paramref name="accountId"/>, or returns how long until it may ask again if its window is
    /// full.
    /// </summary>
    public TimeSpan? TryTake(string accountId)
    {
        var now = clock.GetUtcNow();
        lock (_gate)
        {
            if (!_windows.TryGetValue(accountId, out var window) || now >= window.Start + AssistantSetup.QuestionWindow)
            {
                // A window ends unseen when nobody asks again, so whoever opens a new one clears the ended ones away.
                foreach (var ended in _windows.Where(entry => now >= entry.Value.Start + AssistantSetup.QuestionWindow).Select(entry => entry.Key).ToList())
                {
                    _windows.Remove(ended);
                }

                window = (now, 0);
            }

            if (window.Used >= AssistantSetup.QuestionsPerWindow)
            {
                return window.Start + AssistantSetup.QuestionWindow - now;
            }

            _windows[accountId] = (window.Start, window.Used + 1);
            return null;
        }
    }

    /// <summary>The account's questions in its current window, and when that window ends; none open is nothing used.</summary>
    public AssistantUsage Read(string accountId)
    {
        var now = clock.GetUtcNow();
        lock (_gate)
        {
            return _windows.TryGetValue(accountId, out var window) && now < window.Start + AssistantSetup.QuestionWindow
                ? Usage(window.Used, window.Start + AssistantSetup.QuestionWindow)
                : Usage(0, null);
        }
    }

    private static AssistantUsage Usage(int used, DateTimeOffset? resetsAt) => new(
        used,
        AssistantSetup.QuestionsPerWindow,
        AssistantSetup.QuestionsPerWindow - used,
        (int)AssistantSetup.QuestionWindow.TotalSeconds,
        resetsAt);
}

/// <summary>
/// One account's assistant allowance. <c>ResetsAt</c> is when the current window ends and <c>Used</c> drops to zero; null
/// when no window is open. No other account, no question and no answer is ever in it.
/// </summary>
public sealed record AssistantUsage(int Used, int Limit, int Remaining, int WindowSeconds, DateTimeOffset? ResetsAt);
