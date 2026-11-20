using LorEvolve.Api.Features.Progression;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>
/// A picture change's check (ADR 0062): the entry live in this universe; for a profile picture, one change per entry; for an
/// appearance, one of the entry's, with room left once every picture change of this proposal for it is counted; and the
/// file uploaded. Until the person uploads it in LorEvolve, the change waits with <see cref="AiChangeCodes.AwaitingUpload"/>,
/// which keeps it from being approved.
/// </summary>
internal sealed partial class AiChangeChecker
{
    private async Task CheckMediaAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var media = (MediaValues)work.Proposed;
        if (media.EntryRef is { } entryRef)
        {
            // An entry this proposal creates (#466): CheckReferences answers for its change. Until that change is applied there
            // is no row to look at; once it is, the entry has the id staging gave this picture.
            if (Resolve(new AiRef(null, entryRef)).Id is null)
            {
                await CheckUploadedAsync(work, cancellationToken);
                if (works.Any(other => other != work && other.IsPending && other.Proposed is MediaValues { EntryRef: { } same } && same == entryRef && other.Sequence < work.Sequence))
                {
                    work.Problem(AiChangeCodes.Duplicate, "Another change in this proposal already gives this entry its profile picture.", "entry");
                }

                return;
            }
        }

        // A game's unit or a series' character takes a picture too (#441): its own universe only, still.
        var live = await db.Entities.IgnoreQueryFilters().AsNoTracking()
            .AnyAsync(entity => entity.Id == media.EntityId && entity.UniverseId == universeId && entity.DeletedAt == null, cancellationToken);
        if (!live)
        {
            work.Problem(AiChangeCodes.NotFound, "That entry isn't in this universe, or it is in the Trash.", "entry");
            return;
        }

        var alongside = works.Where(other => other != work && other.IsPending && other.Proposed is MediaValues same
            && same.EntityId == media.EntityId && same.AppearanceId == media.AppearanceId && other.Sequence < work.Sequence);

        if (media.AppearanceId is not { } appearanceId)
        {
            // A profile picture already there is replaced on approval (#445), as a manual upload replaces it.
            if (alongside.Any())
            {
                work.Problem(AiChangeCodes.Duplicate, "Another change in this proposal already gives this entry its profile picture.", "entry");
            }
        }
        else
        {
            var held = await db.EntityAppearances.AsNoTracking()
                .Where(appearance => appearance.Id == appearanceId && appearance.EntityId == media.EntityId)
                .Select(appearance => (int?)appearance.Images.Count)
                .FirstOrDefaultAsync(cancellationToken);
            if (held is not { } count)
            {
                work.Problem(AiChangeCodes.NotFound, "That appearance isn't one of this entry's.", "appearance");
            }
            else if (count + alongside.Count() >= ProgressionLimits.MaxImagesPerAppearance)
            {
                work.Problem(AiChangeCodes.TooLarge, $"An appearance can hold at most {ProgressionLimits.MaxImagesPerAppearance} pictures.", "appearance");
            }
        }

        await CheckUploadedAsync(work, cancellationToken);
    }

    private async Task CheckUploadedAsync(AiChangeWork work, CancellationToken cancellationToken)
    {
        if (work.OperationId == Guid.Empty || !await db.AiChangeMedia.AsNoTracking().AnyAsync(row => row.OperationId == work.OperationId, cancellationToken))
        {
            work.Problem(AiChangeCodes.AwaitingUpload, "Waiting for the picture: upload it here, in LorEvolve, before approving.", "file");
        }
    }
}
