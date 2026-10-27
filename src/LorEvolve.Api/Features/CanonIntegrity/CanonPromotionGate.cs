using LorEvolve.Api.Data;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace LorEvolve.Api.Features.CanonIntegrity;

/// <summary>
/// Refuses the one write that would introduce a provable contradiction, and nothing else.
///
/// High severity finally means something: a mutation may not <em>add</em> a High finding to
/// a universe. What it deliberately does not mean is that a universe holding a High conflict
/// is frozen. A world with one impossible lifespan in it must still be editable everywhere
/// else, or the gate stops being a guard rail and becomes a lock on work the author is in the
/// middle of. So the comparison is a difference, never a count: the High fingerprints present
/// before the write are collected, the write is applied, the High fingerprints present after
/// it are collected, and only a fingerprint in the second set and not the first is a reason to
/// refuse. An unrelated edit leaves that difference empty and goes through, with the
/// pre-existing conflict untouched.
///
/// A fingerprint is the right unit for this. It is derived from the rule code and the ids of
/// the facts that disagree, so the same problem survives a rename and a materially different
/// problem is a different key - exactly the identity the recorded conflicts already use.
/// Comparing counts would let a write swap one contradiction for another unnoticed.
///
/// Evaluating the candidate means the candidate has to exist first. The rules read the
/// database, not the change tracker, so there is no way to ask them about lore that has only
/// been staged in memory. The write is therefore applied for real inside a transaction that is
/// rolled back when the answer comes back bad, which is what makes a refusal atomic from the
/// caller's side: the lore is exactly as it was, and the recorded conflicts are untouched too,
/// because detection is all that runs before the decision. A rejected candidate opens,
/// resolves and reopens nothing on its way out.
///
/// An accepted candidate is the opposite case and needs the opposite treatment. It is the lore
/// now, so the conflict table has to describe it: the candidate findings - already in hand, and
/// not gathered again - are reconciled through the ordinary evaluator, inside the same
/// transaction, before the commit. Lore and conflicts therefore move together or not at all,
/// and every lifecycle rule stays exactly where it was written, because this is the same
/// reconciliation <c>POST /evaluate</c> runs.
/// </summary>
public sealed class CanonPromotionGate(LorEvolveDbContext db, CanonIntegrityEvaluator evaluator)
{
    /// <summary>The machine-readable marker on the 409 body, so a client need not match prose.</summary>
    public const string BlockedCode = "canon_promotion_blocked";

    /// <summary>
    /// Runs <paramref name="mutate"/> under the gate and returns either what it produced or a
    /// 409 describing what it would have broken.
    ///
    /// <paramref name="mutate"/> saves its own work, exactly as it did before it was gated.
    /// Anything it returns that is not a success - a validation problem, a 404 for an id that
    /// does not resolve inside this universe - is passed straight back out, with the
    /// transaction rolled back so a half-applied write cannot survive.
    ///
    /// Ownership is not checked here. The caller proves it before the gate is entered, which
    /// also keeps an unauthorised request from ever costing a rule sweep.
    /// </summary>
    public async Task<IResult> RunAsync(
        Guid universeId,
        Func<CancellationToken, Task<IResult>> mutate,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var baseline = await HighFingerprintsAsync(universeId, cancellationToken);

        var result = await mutate(cancellationToken);

        if (!Succeeded(result))
        {
            await AbandonAsync(transaction, cancellationToken);
            return result;
        }

        var candidate = await evaluator.DetectAsync(universeId, cancellationToken);
        var introduced = Introduced(candidate, baseline);

        if (introduced.Count > 0)
        {
            await AbandonAsync(transaction, cancellationToken);
            return Blocked(introduced);
        }

        // Accepted, so the candidate is simply the lore now, and these findings describe it.
        // Reconciling here rather than after the commit is what makes the conflict table and
        // the lore move together: they are one transaction, and a failure in either takes both
        // back. Reconciling any earlier would record conflicts about a candidate that might
        // still be rolled back.
        await evaluator.ReconcileAsync(universeId, candidate, cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    /// <summary>
    /// The same transaction and the same reconciliation as <see cref="RunAsync"/>, without the
    /// gate.
    ///
    /// Gating and reconciling are separate needs and the routes that want them are not the same
    /// set. A write is gated only where it can introduce a High finding; it needs reconciling
    /// wherever it changes anything a rule reads, High or not. A Canon relationship pointed at a
    /// draft entity can never be worse than Medium, so there is nothing to refuse - but it is a
    /// real finding and the conflict table has to say so as soon as the write lands. Likewise a
    /// delete, which can only ever take findings away and so has nothing to refuse either, but
    /// leaves conflicts standing about lore that no longer exists.
    ///
    /// So this collects the findings once, after the write, and reconciles them. There is no
    /// baseline and no comparison: nothing here can be refused, and paying for a second rule
    /// sweep to prove that would be waste.
    ///
    /// Ownership is not checked here, exactly as in <see cref="RunAsync"/>. The caller proves it
    /// before entering.
    /// </summary>
    public async Task<IResult> RecordAsync(
        Guid universeId,
        Func<CancellationToken, Task<IResult>> mutate,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var result = await mutate(cancellationToken);

        if (!Succeeded(result))
        {
            await AbandonAsync(transaction, cancellationToken);
            return result;
        }

        await evaluator.ReconcileAsync(
            universeId,
            await evaluator.DetectAsync(universeId, cancellationToken),
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    /// <summary>
    /// The High findings the universe already carries, as a set of fingerprints. Severity comes
    /// from the finding rather than from the recorded conflict, so a conflict the author
    /// dismissed still counts as pre-existing: dismissing is a statement about an issue that is
    /// there, not a licence to introduce the same issue somewhere else.
    /// </summary>
    private async Task<HashSet<string>> HighFingerprintsAsync(
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var findings = await evaluator.DetectAsync(universeId, cancellationToken);

        return findings.Values
            .Where(finding => finding.Severity == CanonConflictSeverity.High)
            .Select(finding => finding.Fingerprint)
            .ToHashSet(StringComparer.Ordinal);
    }

    /// <summary>
    /// Every High finding the candidate added, in a fixed order so the same rejection reads the
    /// same way on every run.
    /// </summary>
    private static IReadOnlyList<CanonFinding> Introduced(
        Dictionary<string, CanonFinding> candidate,
        HashSet<string> baseline)
    {
        return
        [
            .. candidate.Values
                .Where(finding => finding.Severity == CanonConflictSeverity.High
                    && !baseline.Contains(finding.Fingerprint))
                .OrderBy(finding => finding.RuleCode, StringComparer.Ordinal)
                .ThenBy(finding => finding.Fingerprint, StringComparer.Ordinal),
        ];
    }

    /// <summary>
    /// Undoes the candidate. The change tracker is cleared as well: after a rollback it still
    /// holds the rejected rows as saved, and leaving them there would let a later
    /// <c>SaveChanges</c> on this same request-scoped context write them back.
    /// </summary>
    private async Task AbandonAsync(IDbContextTransaction transaction, CancellationToken cancellationToken)
    {
        await transaction.RollbackAsync(cancellationToken);
        db.ChangeTracker.Clear();
    }

    /// <summary>
    /// ProblemDetails, like every other refusal on this API, plus the two extensions that make
    /// it worth parsing: a stable code and the findings themselves.
    ///
    /// The payload stays inside what the caller already owns. A finding names its rule, its
    /// fingerprint, its severity, the wording the review screen would show, and the ids of the
    /// records it is about - all of them in this universe, which the caller has already proved
    /// they own. Nothing else is added.
    /// </summary>
    private static IResult Blocked(IReadOnlyList<CanonFinding> introduced) =>
        Results.Problem(
            title: "Canon conflict",
            detail: introduced.Count == 1
                ? "This change would introduce a contradiction that cannot be true, so it was not saved."
                : $"This change would introduce {introduced.Count} contradictions that cannot be true, "
                    + "so it was not saved.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = BlockedCode,
                ["blockingFindings"] = introduced.Select(Describe).ToList(),
            });

    /// <summary>
    /// A finding as the refusal reports it. Subject names are left null: resolving them means
    /// reading records the candidate has already been rolled back over, and the id is what a
    /// client needs to link to the lore that is actually stored.
    /// </summary>
    private static CanonBlockingFinding Describe(CanonFinding finding) =>
        new(
            finding.RuleCode,
            finding.Severity,
            finding.Fingerprint,
            finding.Title,
            finding.Explanation,
            [.. finding.Subjects.Select(subject =>
                new CanonBlockingSubject(subject.Kind, subject.SubjectId, subject.Role))]);

    /// <summary>
    /// Whether the wrapped handler produced something worth committing. Minimal-API results
    /// carry their status code, and a result that carries none is a success by construction -
    /// nothing on these routes returns one.
    /// </summary>
    private static bool Succeeded(IResult result) =>
        result is not IStatusCodeHttpResult { StatusCode: { } status } || status is >= 200 and < 300;
}

/// <summary>
/// A transaction, or nothing at all when the context is already inside one.
///
/// One route needs its own atomic step - a delete-then-insert that must not be seen half done
/// - and it now runs inside the transaction <see cref="CanonPromotionGate"/> opened. SQLite has
/// no nested transactions and EF Core refuses a second <c>BeginTransaction</c>, so the route
/// joins the outer one instead, and only whoever actually opened a transaction commits it. Run
/// ungated, it still gets a real transaction of its own.
/// </summary>
public sealed class JoinedTransaction(IDbContextTransaction? owned) : IAsyncDisposable
{
    public static async Task<JoinedTransaction> BeginAsync(
        LorEvolveDbContext db,
        CancellationToken cancellationToken) =>
        new(db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null);

    public Task CommitAsync(CancellationToken cancellationToken) =>
        owned?.CommitAsync(cancellationToken) ?? Task.CompletedTask;

    public ValueTask DisposeAsync() => owned?.DisposeAsync() ?? ValueTask.CompletedTask;
}
