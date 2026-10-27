using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// Keeps proposals bounded (ADR 0047): an open one left undecided past <see cref="AiChangeLimits.OpenLifetime"/> is closed
/// as expired, applying nothing, and a decided one is removed <see cref="AiChangeLimits.DecidedRetention"/> after it closed.
/// Run where proposals are staged, listed and approved rather than on a timer: two set-based statements, both cheap.
/// </summary>
internal static class AiChangeRetention
{
    public const string ExpiredNote = "expired";

    public static async Task SweepAsync(LorEvolveDbContext db, DateTime now, CancellationToken cancellationToken)
    {
        var lapsed = db.AiChangeProposals.Where(proposal => proposal.Status == AiChangeProposalStatus.Open && proposal.ExpiresAt <= now);
        if (await lapsed.AnyAsync(cancellationToken))
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            await db.AiChangeOperations
                .Where(operation => operation.Status == AiChangeOperationStatus.Pending
                    && operation.Proposal!.Status == AiChangeProposalStatus.Open
                    && operation.Proposal.ExpiresAt <= now)
                .ExecuteUpdateAsync(
                    set => set
                        .SetProperty(operation => operation.Status, AiChangeOperationStatus.Rejected)
                        .SetProperty(operation => operation.ResolvedAt, now)
                        .SetProperty(operation => operation.ResolutionNote, ExpiredNote),
                    cancellationToken);
            await lapsed.ExecuteUpdateAsync(
                set => set.SetProperty(proposal => proposal.Status, AiChangeProposalStatus.Expired).SetProperty(proposal => proposal.ClosedAt, now),
                cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        // Read first: a sweep with nothing to do takes no write lock, so the routes that sweep stay readers on SQLite.
        var forgotten = now - AiChangeLimits.DecidedRetention;
        var old = db.AiChangeProposals
            .Where(proposal => proposal.Status != AiChangeProposalStatus.Open && proposal.ClosedAt != null && proposal.ClosedAt < forgotten);
        if (await old.AnyAsync(cancellationToken))
        {
            await old.ExecuteDeleteAsync(cancellationToken);
        }
    }
}
