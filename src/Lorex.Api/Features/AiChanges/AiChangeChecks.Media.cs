using Lorex.Api.Features.Progression;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.AiChanges;

/// <summary>
/// A picture change's check (ADR 0062): the entry live in this universe; for a profile picture, none there yet; for an
/// appearance, one of the entry's, with room left once every picture change of this proposal for it is counted; and the
/// file uploaded. Until the person uploads it in LoreX, the change waits with <see cref="AiChangeCodes.AwaitingUpload"/>,
/// which keeps it from being approved.
/// </summary>
internal sealed partial class AiChangeChecker
{
    private async Task CheckMediaAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var media = (MediaValues)work.Proposed;
        var live = await db.Entities.AsNoTracking()
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
            if (await db.EntityImages.AsNoTracking().AnyAsync(image => image.EntityId == media.EntityId, cancellationToken))
            {
                work.Problem(AiChangeCodes.Unsupported, "This entry already has a profile picture. An AI change never replaces one, since the old picture would be deleted for good; replace it by hand, or add the picture to an appearance.", "entry");
            }
            else if (alongside.Any())
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

        if (work.OperationId == Guid.Empty || !await db.AiChangeMedia.AsNoTracking().AnyAsync(row => row.OperationId == work.OperationId, cancellationToken))
        {
            work.Problem(AiChangeCodes.AwaitingUpload, "Waiting for the picture: upload it here, in LoreX, before approving. No file comes from the AI.", "file");
        }
    }
}
