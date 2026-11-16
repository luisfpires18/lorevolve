using LorEvolve.Api.Common;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;

namespace LorEvolve.Api.Features.ProjectEntities;

public static class CanonLink
{
    /// <summary>
    /// The optional link to a lore entry: null is accepted, and a value has to be a live lore entry of the project's
    /// own universe. A link to a project's entry, to a trashed entry or to another universe's entry is refused by field
    /// rather than reported as missing, so the message tells an author what to fix without disclosing what exists
    /// elsewhere.
    /// </summary>
    public static async Task<IResult?> CheckAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid? canonEntityId,
        CancellationToken cancellationToken)
    {
        if (canonEntityId is not { } id)
        {
            return null;
        }

        return await LoreEntries.IsLiveAsync(db, universeId, id, cancellationToken)
            ? null
            : Problems.Field("canonEntityId", "Choose an entry from this universe's lore, or none.");
    }
}
