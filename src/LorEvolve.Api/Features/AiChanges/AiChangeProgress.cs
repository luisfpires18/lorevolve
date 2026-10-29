using System.Collections.Concurrent;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// How far a running approval has got: changes applied so far out of those selected, so the reviewer's page can show a
/// count while one long transaction runs. Kept in memory under the approval's own id, only while it runs, and readable only
/// by the person who started it. It says nothing about what was committed - the receipt does that, and a refusal still
/// rolls everything back.
/// </summary>
// ponytail: one process's memory, fine on DEV's single instance; a scaled-out host would need a shared store (or a
// streamed answer) for the count to reach every instance.
public sealed class AiChangeProgress
{
    private readonly ConcurrentDictionary<Guid, Entry> running = new();

    public sealed record Entry(string UserId, int Done, int Total);

    public void Report(Guid approvalId, string userId, int done, int total) =>
        running[approvalId] = new Entry(userId, done, total);

    public void Finish(Guid approvalId) => running.TryRemove(approvalId, out _);

    public Entry? Read(Guid approvalId, string userId) =>
        running.TryGetValue(approvalId, out var entry) && entry.UserId == userId ? entry : null;
}
