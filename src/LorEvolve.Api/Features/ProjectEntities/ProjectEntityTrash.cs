using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Features.ProjectEntities.ProjectEntityTypeEndpoints;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>A project's entries going to the universe's Trash, one or a selection: what Lore's Move to Trash does (ADR 0015).</summary>
internal static class ProjectEntityTrash
{
    /// <summary>
    /// Moves many of the project's entries to the universe's Trash at once, all or nothing, each exactly as
    /// <see cref="DeleteAsync"/> does one; they restore from there like a lore entry.
    /// Checked whole first: an id that is not a live entry of this project refuses the request and confirms nothing.
    /// </summary>
    internal static async Task<IResult> BulkTrashAsync(
        Guid projectId,
        [FromBody] BulkTrashRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await TrashDeniedAsync(db, projectId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ids = request.EntityIds;

        if (ids is not { Count: > 0 } || ids.Count > EntityEndpoints.BulkTrashMaxEntries || ids.Distinct().Count() != ids.Count)
        {
            return Problems.Field(
                "entityIds",
                ids is not { Count: > 0 }
                    ? "Choose at least one entry."
                    : ids.Count > EntityEndpoints.BulkTrashMaxEntries
                        ? $"Move up to {EntityEndpoints.BulkTrashMaxEntries} entries at a time. This has {ids.Count}."
                        : "The same entry is listed more than once.");
        }

        var entries = await db.Entities.IgnoreQueryFilters()
            .Where(entry => entry.ProjectId == projectId && entry.DeletedAt == null && ids.Contains(entry.Id))
            .ToListAsync(cancellationToken);

        if (entries.Count != ids.Count)
        {
            return Problems.Field("entityIds", "An entry is not in this project any more. It may already be in the Trash.");
        }

        var now = DateTime.UtcNow;

        foreach (var entry in entries)
        {
            entry.DeletedAt = now;
            entry.UpdatedAt = now;
        }

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new { trashed = entries.Count });
    }

    /// <summary>The project's write access, then what a lore entry's move to the Trash asks: the universe's Manage Trash.</summary>
    private static async Task<IResult?> TrashDeniedAsync(
        LorEvolveDbContext db,
        Guid projectId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        return denied
            ?? await UniverseAccess.DenyAsync(
                db, project!.UniverseId, principal, UniverseCapability.ManageTrash, cancellationToken);
    }

    /// <summary>
    /// Moves the entry to the Trash, the same way a lore entry goes: the row and everything pointing at it stay where
    /// they are and a timestamp says when it was thrown away (ADR 0015), so nothing dependent is destroyed on the way
    /// in and a restore has nothing to rebuild.
    /// </summary>
    internal static async Task<IResult> DeleteAsync(
        Guid projectId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await TrashDeniedAsync(db, projectId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var entity = await db.Entities.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                candidate => candidate.Id == entityId && candidate.ProjectId == projectId,
                cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        if (entity.DeletedAt is null)
        {
            entity.DeletedAt = DateTime.UtcNow;
            entity.UpdatedAt = entity.DeletedAt.Value;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.NoContent();
    }
}
