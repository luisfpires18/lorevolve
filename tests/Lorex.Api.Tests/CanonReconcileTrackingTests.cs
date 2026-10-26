using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Reconciliation loads and tracks only the conflicts it changes (issue 55, W9). Tracking every conflict and its subjects
/// to find nothing to do was most of a gated save on a large universe; the outcome of each kind of reconciliation - nothing
/// changed, a dismissal kept, wording refreshed, a conflict resolved and one reopened - must be what it always was.
/// </summary>
public sealed class CanonReconcileTrackingTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    [Fact]
    public async Task Only_the_conflicts_a_reconciliation_changes_are_tracked_and_each_outcome_is_unchanged()
    {
        var client = await SignedIn(factory, "reconcile-tracking");
        var u = (await CreateUniverse(client, "Reconciled")).Id;

        // Three Canon links, each resting on a Draft entry: three findings.
        var drafts = new List<Guid>();
        await InScope(async (db, _) =>
        {
            var type = await db.EntityTypes.Where(row => row.UniverseId == u && row.Name == "Character").Select(row => row.Id).SingleAsync();
            var now = DateTime.UtcNow;
            var kind = new RelationshipType { Id = Guid.NewGuid(), UniverseId = u, Name = "Knows", CreatedAt = now, UpdatedAt = now };
            db.RelationshipTypes.Add(kind);
            for (var index = 0; index < 3; index++)
            {
                var canon = Entry(u, type, $"Canon {index}", CanonStatus.Canon, now);
                var draft = Entry(u, type, $"Draft {index}", CanonStatus.Draft, now);
                drafts.Add(draft.Id);
                db.Entities.AddRange(canon, draft);
                db.Relationships.Add(new LoreRelationship
                {
                    Id = Guid.NewGuid(),
                    UniverseId = u,
                    RelationshipTypeId = kind.Id,
                    SourceEntityId = canon.Id,
                    TargetEntityId = draft.Id,
                    CanonStatus = CanonStatus.Canon,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }

            await db.SaveChangesAsync();
        });

        var first = await Evaluate(u);
        Assert.Equal((3, 0, 0, 0), (first.Summary.Created, first.Summary.Reopened, first.Summary.Persisted, first.Summary.Resolved));

        // The author dismisses the first.
        await InScope(async (db, _) =>
        {
            var conflict = await Conflict(db, drafts[0]);
            conflict.Status = CanonConflictStatus.Dismissed;
            await db.SaveChangesAsync();
        });
        var before = await Snapshot(u);

        // Nothing changed: nothing is tracked, nothing is written, the dismissal stands.
        var unchanged = await Evaluate(u);
        Assert.Equal((0, 0, 3, 0), (unchanged.Summary.Created, unchanged.Summary.Reopened, unchanged.Summary.Persisted, unchanged.Summary.Resolved));
        Assert.Equal(0, unchanged.Tracked);
        Assert.Equal(before, await Snapshot(u));

        // A rename rewrites the one conflict that names the entry, and only that one is tracked.
        await InScope(async (db, _) =>
        {
            (await db.Entities.SingleAsync(row => row.Id == drafts[1])).Name = "Renamed draft";
            await db.SaveChangesAsync();
        });
        var renamed = await Evaluate(u);
        Assert.Equal(1, renamed.Tracked);
        Assert.Equal(3, renamed.Summary.Persisted);
        var reworded = await Snapshot(u);
        Assert.Contains("Renamed draft", reworded[drafts[1]].Title, StringComparison.Ordinal);
        Assert.Equal(before[drafts[0]], reworded[drafts[0]]);
        Assert.Equal(before[drafts[2]], reworded[drafts[2]]);

        // Promoting the third entry resolves its conflict; demoting it again reopens the same one.
        await SetStatus(drafts[2], CanonStatus.Canon);
        var promoted = await Evaluate(u);
        Assert.Equal((1, 1), (promoted.Summary.Resolved, promoted.Tracked));
        Assert.Equal(CanonConflictStatus.Resolved, (await Snapshot(u))[drafts[2]].Status);

        await SetStatus(drafts[2], CanonStatus.Draft);
        var demoted = await Evaluate(u);
        Assert.Equal((1, 1), (demoted.Summary.Reopened, demoted.Tracked));
        var reopened = (await Snapshot(u))[drafts[2]];
        Assert.Equal((CanonConflictStatus.Pending, before[drafts[2]].Id), (reopened.Status, reopened.Id));

        // The dismissal outlived every one of those reconciliations.
        Assert.Equal(CanonConflictStatus.Dismissed, (await Snapshot(u))[drafts[0]].Status);
    }

    private sealed record Recorded(Guid Id, CanonConflictStatus Status, string Title, DateTime UpdatedAt, string Subjects);

    private static LoreEntity Entry(Guid universeId, Guid typeId, string name, CanonStatus status, DateTime now) => new()
    {
        Id = Guid.NewGuid(),
        UniverseId = universeId,
        EntityTypeId = typeId,
        Name = name,
        CanonStatus = status,
        CreatedAt = now,
        UpdatedAt = now,
    };

    /// <summary>One reconciliation in a scope of its own, and how many conflicts it left in that scope's change tracker.</summary>
    private async Task<(CanonEvaluationSummary Summary, int Tracked)> Evaluate(Guid universeId)
    {
        (CanonEvaluationSummary, int) result = default;
        await InScope(async (db, evaluator) =>
        {
            var summary = await evaluator.EvaluateAsync(universeId, CancellationToken.None);
            result = (summary, db.ChangeTracker.Entries<CanonConflict>().Count());
        });
        return result;
    }

    /// <summary>Every conflict by the draft entry it names, read straight from the database.</summary>
    private async Task<Dictionary<Guid, Recorded>> Snapshot(Guid universeId)
    {
        var snapshot = new Dictionary<Guid, Recorded>();
        await InScope(async (db, _) =>
        {
            var conflicts = await db.CanonConflicts.AsNoTracking().Include(conflict => conflict.Subjects)
                .Where(conflict => conflict.UniverseId == universeId).ToListAsync();
            foreach (var conflict in conflicts)
            {
                var entry = conflict.Subjects.Single(subject => subject.SubjectKind == CanonSubjectKind.Entity).SubjectId;
                var subjects = string.Join(",", conflict.Subjects.Select(subject => $"{subject.SubjectKind}:{subject.SubjectId}:{subject.Role}").Order(StringComparer.Ordinal));
                snapshot[entry] = new Recorded(conflict.Id, conflict.Status, conflict.Title, conflict.UpdatedAt, subjects);
            }
        });
        return snapshot;
    }

    private static Task<CanonConflict> Conflict(LorexDbContext db, Guid entryId) =>
        db.CanonConflicts.SingleAsync(conflict => conflict.Subjects.Any(subject => subject.SubjectKind == CanonSubjectKind.Entity && subject.SubjectId == entryId));

    private Task SetStatus(Guid entryId, CanonStatus status) => InScope(async (db, _) =>
    {
        (await db.Entities.SingleAsync(row => row.Id == entryId)).CanonStatus = status;
        await db.SaveChangesAsync();
    });

    private async Task InScope(Func<LorexDbContext, CanonIntegrityEvaluator, Task> work)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await work(scope.ServiceProvider.GetRequiredService<LorexDbContext>(), scope.ServiceProvider.GetRequiredService<CanonIntegrityEvaluator>());
    }
}
