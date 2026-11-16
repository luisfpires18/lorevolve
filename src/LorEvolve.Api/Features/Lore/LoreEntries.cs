using LorEvolve.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Lore;

/// <summary>The one question about a lore entry every feature that hangs something off it asks the same way.</summary>
public static class LoreEntries
{
    /// <summary>A live (not trashed) lore entry of this universe. <c>db.Entities</c> is filtered to the lore, so a project's entry is not found.</summary>
    public static Task<bool> IsLiveAsync(LorEvolveDbContext db, Guid universeId, Guid entityId, CancellationToken cancellationToken) =>
        db.Entities.AnyAsync(entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null, cancellationToken);
}
