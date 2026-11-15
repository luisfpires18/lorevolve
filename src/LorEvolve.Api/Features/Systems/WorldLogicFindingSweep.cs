using System.Diagnostics;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.RuleValidation.Conditions;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// What one sweep did. Counts only; the findings themselves are read back.
///
/// <paramref name="Closed"/> covers every finding that stopped being produced, dismissed ones included.
/// <paramref name="IsTruncated"/> is true when the rules produced more findings than one sweep records
/// (<see cref="WorldLogicFindingLimits.MaxFindingsPerSweep"/>); nothing is closed in that case, because a sweep
/// that did not see everything must not conclude that anything is gone.
/// </summary>
public sealed record WorldLogicSweepSummary(
    int Detected,
    int Created,
    int Reopened,
    int Persisted,
    int Closed,
    bool IsTruncated,
    DateTime EvaluatedAt);

/// <summary>
/// Evaluates every stored rule of one universe and reconciles what it found against what is already recorded
/// (ADR 0072, LOREX-020).
///
/// <b>It stores the evaluator's answer, and computes nothing of its own.</b> The outcome, versions, error code,
/// evidence and rationale are copied from <see cref="ConditionResult"/>. The only thing derived here is the
/// fingerprint, and that is a hash of those same fields.
///
/// <b>A sweep is idempotent.</b> Running it twice over unchanged lore and unchanged rules leaves the table exactly
/// as the first run left it, because a result is matched to a stored finding by fingerprint rather than by anything
/// about when or how it was found.
///
/// <b>A scope is swept on its own.</b> A project-scoped exception applies only when a project is named, so the same
/// rule can answer differently per project. A sweep reconciles only the findings of the scope it ran in, and never
/// closes another scope's.
///
/// Ownership is not checked here. The caller proves it, and this class is never reached from anywhere that has not.
/// </summary>
public sealed partial class WorldLogicFindingSweep(
    LorEvolveDbContext db,
    ILogger<WorldLogicFindingSweep> logger)
{
    /// <summary>A sweep this long is logged as a warning, as a Canon sweep is: it holds SQLite's one writer.</summary>
    public static readonly TimeSpan Slow = TimeSpan.FromSeconds(2);

    /// <summary>
    /// Evaluates the universe's rules and records what they found.
    ///
    /// <paramref name="projectId"/> names the project the evaluation runs in, or null for the whole universe. It is
    /// the caller's job to have checked that the project belongs to this universe.
    /// </summary>
    public async Task<WorldLogicSweepSummary> RunAsync(
        Guid universeId,
        Guid? projectId,
        CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();

        var rules = await WorldLogicRuleSet.LoadAsync(db, universeId, cancellationToken);
        var facts = await UniverseConditionFacts.LoadAsync(db, universeId, cancellationToken);
        var evaluator = new WorldLogicEvaluator(facts, rules);

        // No target: a sweep asks every rule about the universe, not about one entry. A rule written with "self"
        // answers unknown without one, which is the honest answer rather than a defect (ADR 0072).
        var results = evaluator.EvaluateAll(targetId: null, projectId: projectId?.ToString());

        // A rule that is words only is not a question the evaluator was asked: it has no condition, so it answers
        // unknown for every universe forever. Recording that would bury the unknowns that mean something.
        var conditioned = rules
            .Where(rule => rule.ConditionJson is not null)
            .Select(rule => rule.Id)
            .ToHashSet(StringComparer.Ordinal);

        var found = new Dictionary<string, Detection>(StringComparer.Ordinal);

        foreach (var result in results)
        {
            if (!conditioned.Contains(result.RuleId)
                || Recordable(result.Outcome) is not { } outcome
                || !Guid.TryParse(result.RuleId, out var ruleId))
            {
                continue;
            }

            var fingerprint = WorldLogicFingerprint.Of(ruleId, projectId, outcome, result.ErrorCode, result.Evidence);

            // Ordinal order, so a truncated sweep records the same subset every time rather than a different one
            // per run; TryAdd because one rule and one scope produce one result, so a repeat would be the same row.
            found.TryAdd(fingerprint, new Detection(ruleId, outcome, fingerprint, result));
        }

        var truncated = found.Count > WorldLogicFindingLimits.MaxFindingsPerSweep;
        var detections = truncated
            ? found.OrderBy(pair => pair.Key, StringComparer.Ordinal)
                .Take(WorldLogicFindingLimits.MaxFindingsPerSweep)
                .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal)
            : found;

        var summary = await ReconcileAsync(universeId, projectId, detections, truncated, cancellationToken);

        var elapsed = Stopwatch.GetElapsedTime(started);
        if (elapsed >= Slow)
        {
            SlowSweep(logger, universeId, elapsed.TotalMilliseconds, detections.Count);
        }

        return summary;
    }

    private sealed record Detection(
        Guid RuleId,
        WorldLogicFindingOutcome Outcome,
        string Fingerprint,
        ConditionResult Result);

    /// <summary>
    /// The outcome a finding records, or null for one it does not. <c>true</c> is nothing to report, and
    /// <c>exempt</c> is the author having already written down why the rule does not have to hold here.
    /// </summary>
    private static WorldLogicFindingOutcome? Recordable(ConditionOutcome outcome) => outcome switch
    {
        ConditionOutcome.False => WorldLogicFindingOutcome.Violation,
        ConditionOutcome.Unknown => WorldLogicFindingOutcome.Unknown,
        ConditionOutcome.Error => WorldLogicFindingOutcome.Error,
        _ => null,
    };

    private async Task<WorldLogicSweepSummary> ReconcileAsync(
        Guid universeId,
        Guid? projectId,
        Dictionary<string, Detection> detections,
        bool truncated,
        CancellationToken cancellationToken)
    {
        var existing = await db.WorldLogicFindings
            .Where(finding => finding.UniverseId == universeId && finding.ProjectId == projectId)
            .ToListAsync(cancellationToken);

        var stored = existing.ToDictionary(finding => finding.Fingerprint, StringComparer.Ordinal);
        var now = DateTime.UtcNow;

        int created = 0, reopened = 0, persisted = 0, closed = 0;

        foreach (var detection in detections.Values)
        {
            if (!stored.TryGetValue(detection.Fingerprint, out var finding))
            {
                db.WorldLogicFindings.Add(Open(universeId, projectId, detection, now));
                created++;
                continue;
            }

            var changed = Refresh(finding, detection);

            if (finding.Status == WorldLogicFindingStatus.Resolved)
            {
                // The same problem, by fingerprint, is being produced again. A finding the author dismissed is left
                // alone instead: a dismissal suppresses a problem that is still there, and reopening it on every
                // sweep would undo that decision immediately.
                finding.Status = WorldLogicFindingStatus.Open;
                finding.ResolvedAt = null;
                db.WorldLogicFindingEvents.Add(Event(finding, WorldLogicFindingAction.Reopened, now));
                changed = true;
                reopened++;
            }
            else
            {
                persisted++;
            }

            if (changed)
            {
                finding.UpdatedAt = now;
            }
        }

        // A sweep that hit its own cap did not see every finding the rules produce, so it must not conclude that
        // the ones it is missing are gone. Nothing is closed; the summary says it was truncated.
        if (!truncated)
        {
            foreach (var finding in existing.Where(finding =>
                finding.Status != WorldLogicFindingStatus.Resolved
                && !detections.ContainsKey(finding.Fingerprint)))
            {
                // The rules no longer produce it. A dismissed finding is closed here too: a dismissal suppresses a
                // problem that is still there, not the fingerprint forever. Once it is actually fixed there is
                // nothing left to suppress, and if the same problem comes back it deserves to be raised again
                // rather than swallowed by a decision made about the old occurrence.
                finding.Status = WorldLogicFindingStatus.Resolved;
                finding.ResolvedAt = now;
                finding.UpdatedAt = now;
                db.WorldLogicFindingEvents.Add(Event(finding, WorldLogicFindingAction.Closed, now));
                closed++;
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        return new WorldLogicSweepSummary(
            detections.Count,
            created,
            reopened,
            persisted,
            closed,
            truncated,
            now);
    }

    /// <summary>A newly detected finding, with its evidence and the first entry of its history.</summary>
    private static WorldLogicFinding Open(
        Guid universeId,
        Guid? projectId,
        Detection detection,
        DateTime now)
    {
        var finding = new WorldLogicFinding
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            RuleId = detection.RuleId,
            ProjectId = projectId,
            Outcome = detection.Outcome,
            ErrorCode = detection.Result.ErrorCode,
            RuleVersion = detection.Result.RuleVersion,
            SchemaVersion = detection.Result.SchemaVersion,
            Fingerprint = detection.Fingerprint,
            Status = WorldLogicFindingStatus.Open,
            Rationale = WorldLogicRationale.Store(detection.Result.Rationale),
            CreatedAt = now,
            UpdatedAt = now,
        };

        var order = 0;
        foreach (var item in detection.Result.Evidence)
        {
            finding.Evidence.Add(new WorldLogicFindingEvidence
            {
                FindingId = finding.Id,
                SortOrder = order++,
                Source = Fit(item.Source, WorldLogicFindingLimits.SourceMaxLength),
                SourceRowId = Fit(item.Id, WorldLogicFindingLimits.SourceRowIdMaxLength),
                Role = Fit(item.Role, WorldLogicFindingLimits.RoleMaxLength),
            });
        }

        finding.Events.Add(Event(finding, WorldLogicFindingAction.Detected, now));
        return finding;
    }

    /// <summary>
    /// Brings a recorded finding up to date with the evaluation that produced it again, and says whether anything
    /// changed. The evidence is part of the fingerprint, so a match means the evidence matches; what can move is the
    /// rule's version, its schema version and the trace.
    /// </summary>
    private static bool Refresh(WorldLogicFinding finding, Detection detection)
    {
        var rationale = WorldLogicRationale.Store(detection.Result.Rationale);
        var changed = finding.RuleVersion != detection.Result.RuleVersion
            || finding.SchemaVersion != detection.Result.SchemaVersion
            || !string.Equals(finding.Rationale, rationale, StringComparison.Ordinal);

        finding.RuleVersion = detection.Result.RuleVersion;
        finding.SchemaVersion = detection.Result.SchemaVersion;
        finding.Rationale = rationale;
        return changed;
    }

    /// <summary>
    /// One history entry for a change evaluation made. No account made it, so the actor is null.
    ///
    /// It is added through <c>db.WorldLogicFindingEvents</c> rather than through the finding's navigation wherever
    /// the finding is a tracked row the sweep loaded: an entry put on a collection that was never loaded is taken
    /// for an existing row and saved as an update of nothing, which fails the whole sweep. A brand new finding is
    /// itself Added, so its own children are Added with it.
    /// </summary>
    private static WorldLogicFindingEvent Event(
        WorldLogicFinding finding,
        WorldLogicFindingAction action,
        DateTime at) =>
        new()
        {
            Id = Guid.NewGuid(),
            FindingId = finding.Id,
            Action = action,
            ActorId = null,
            Note = string.Empty,
            At = at,
        };

    /// <summary>
    /// A value cut to what its column holds. The evaluator's own sources, ids and roles are well inside these
    /// bounds; a fixture could exceed one, and a finding with a shortened role is better than a failed sweep.
    /// </summary>
    private static string Fit(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];

    [LoggerMessage(
        EventId = 9201,
        Level = LogLevel.Warning,
        Message = "World Logic sweep of universe {UniverseId} took {ElapsedMilliseconds} ms for {Detected} findings.")]
    private static partial void SlowSweep(
        ILogger logger,
        Guid universeId,
        double elapsedMilliseconds,
        int detected);
}
