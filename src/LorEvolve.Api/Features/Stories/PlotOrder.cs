using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// The arc order of a story and the one way it is rewritten: contiguous from 0 and unique, held by an index, with the
/// park-then-place technique <see cref="StoryOrder"/> describes. The write belongs to the caller's transaction.
/// </summary>
internal static class PlotOrder
{
    /// <summary>Gives <paramref name="ordered"/> - every arc of one story - the positions 0, 1, 2... in that order.</summary>
    public static async Task PlaceArcsAsync(
        LorEvolveDbContext db,
        List<PlotArc> ordered,
        CancellationToken cancellationToken)
    {
        if (ordered.Select((arc, index) => arc.SortOrder == index).All(inPlace => inPlace))
        {
            return;
        }

        var parked = -1;
        foreach (var arc in ordered)
        {
            arc.SortOrder = parked--;
        }

        await db.SaveChangesAsync(cancellationToken);

        for (var index = 0; index < ordered.Count; index++)
        {
            ordered[index].SortOrder = index;
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
