using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// The two plot orders - arcs per story, beats per arc - and the one way either is rewritten.
///
/// Both are contiguous from 0 and unique, held by an index, and both use the park-then-place technique
/// <see cref="StoryOrder"/> describes: every row being placed first steps aside to its own negative position -
/// distinct across every arc in the call, so a beat changing arc cannot collide on either side - and then lands
/// on its final one. Both writes belong to the caller's transaction.
///
/// Neither order reads anything about a scene. Arcs and beats are ordered by the author's intent, never by the
/// order, chapter or chronology of the scenes they point at (ADR 0026).
/// </summary>
internal static class PlotOrder
{
    /// <summary>One arc's live beats, tracked, in order. A beat in the Trash holds no place in its arc (ADR 0029).</summary>
    public static Task<List<PlotBeat>> LoadBeatsAsync(
        LorEvolveDbContext db,
        Guid plotArcId,
        CancellationToken cancellationToken) =>
        db.PlotBeats
            .Where(beat => beat.PlotArcId == plotArcId && beat.DeletedAt == null)
            .OrderBy(beat => beat.SortOrder)
            .ThenBy(beat => beat.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Makes each list exactly its arc: every beat in it takes that arc's id and the positions 0, 1, 2... in list
    /// order. A beat listed for another arc than the one it is in is moved there. Writes nothing when everything
    /// is already where it belongs.
    /// </summary>
    public static async Task PlaceBeatsAsync(
        LorEvolveDbContext db,
        IReadOnlyList<BeatContainer> arcs,
        CancellationToken cancellationToken)
    {
        var settled = arcs.All(arc => arc.Beats
            .Select((beat, index) => beat.PlotArcId == arc.PlotArcId && beat.SortOrder == index)
            .All(inPlace => inPlace));

        if (settled)
        {
            return;
        }

        var parked = -1;
        foreach (var arc in arcs)
        {
            foreach (var beat in arc.Beats)
            {
                beat.PlotArcId = arc.PlotArcId;
                beat.SortOrder = parked--;
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        foreach (var arc in arcs)
        {
            for (var index = 0; index < arc.Beats.Count; index++)
            {
                arc.Beats[index].SortOrder = index;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

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

/// <summary>An arc's id and the beats it should hold, first first.</summary>
internal sealed record BeatContainer(Guid PlotArcId, List<PlotBeat> Beats);
