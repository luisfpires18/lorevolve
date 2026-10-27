using LorEvolve.Api.Features.Progression;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// A progression change's check (ADR 0062): the entry still live, its progression still at the version the change was staged
/// over, and the whole would-be progression passed through the save's own normalisation - names, dated spans on the
/// universe's chronology, stories, scenes and moments of this universe, overrides held to each field's rules, every link to an
/// era or form of this same save - exactly as the Progression page's save checks it.
/// </summary>
internal sealed partial class AiChangeChecker
{
    private async Task CheckProgressionAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        var progression = (ProgressionValues)work.Proposed;
        var typeId = await db.Entities.AsNoTracking()
            .Where(entity => entity.Id == progression.EntityId && entity.UniverseId == universeId && entity.DeletedAt == null)
            .Select(entity => (Guid?)entity.EntityTypeId)
            .FirstOrDefaultAsync(cancellationToken);
        if (typeId is null)
        {
            work.Problem(AiChangeCodes.NotFound, "This entry isn't in this universe any more. It may be in the Trash.");
            return;
        }

        var version = await db.EntityProgressions.AsNoTracking()
            .Where(row => row.EntityId == progression.EntityId)
            .Select(row => (int?)row.Version)
            .FirstOrDefaultAsync(cancellationToken) ?? 0;
        if (version != work.BaseVersion)
        {
            work.Conflict("Someone saved this entry's progression after the AI suggested this change, so it can't be applied. Nothing newer will be overwritten. Reject it, or ask for the change again.");
        }

        var current = await ProgressionState.ReadAsync(db, progression.EntityId, cancellationToken);
        var (_, errors) = await ProgressionState.NormalizeAsync(
            db, universeId, progression.EntityId, typeId.Value, current, progression.Form.ToRequest(work.BaseVersion), recreating: true, cancellationToken);
        work.Problems(errors);
    }
}
