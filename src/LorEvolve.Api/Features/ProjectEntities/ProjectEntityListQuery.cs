using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>Which of a project's entries a list read matches: its type (or branch), the name search, exact or not, and Lore's field filters.</summary>
internal static class ProjectEntityListQuery
{
    internal static async Task<(IQueryable<LoreEntity> Matching, IResult? Refused)> MatchingAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid projectId,
        Guid? typeId,
        bool includeDescendants,
        string? q,
        bool exact,
        string[]? field,
        CancellationToken cancellationToken)
    {
        // Field filters as Lore's list takes them, resolved against this project's own type: one that does not resolve is refused.
        var (fieldFilters, fieldErrors) = await EntityFieldFilters.ResolveAsync(
            db, universeId, typeId, field ?? [], cancellationToken, projectId);

        if (fieldErrors is not null)
        {
            return (Enumerable.Empty<LoreEntity>().AsQueryable(), Results.ValidationProblem(fieldErrors));
        }

        // The project id stays in the base predicate, before any filter, so no search or type id reaches another game.
        var matching = db.Entities.AsNoTracking().IgnoreQueryFilters()
            .Where(entry => entry.ProjectId == projectId && entry.DeletedAt == null);

        if (typeId is { } wanted && includeDescendants)
        {
            // The type and every type nested beneath it, from this project's own small type graph (as Lore's list does).
            var parentOf = await db.EntityTypes.AsNoTracking().IgnoreQueryFilters()
                .Where(type => type.UniverseId == universeId && type.ProjectId == projectId)
                .ToDictionaryAsync(type => type.Id, type => type.ParentId, cancellationToken);
            var branch = EntityTypeHierarchy.Branch(parentOf, wanted).ToList();
            matching = matching.Where(entry => branch.Contains(entry.EntityTypeId));
        }
        else if (typeId is { } exactType)
        {
            matching = matching.Where(entry => entry.EntityTypeId == exactType);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var text = EntityFieldFilters.AsciiLower(q.Trim());

            // Exact: only the entry called what was typed, whole and ignoring case (a project entry has no aliases).
            matching = exact
                ? matching.Where(entry => entry.Name.ToLower() == text)
                : matching.Where(entry => entry.Name.ToLower().Contains(text));
        }

        matching = EntityFieldFilters.Apply(matching, fieldFilters);

        return (matching, null);
    }
}
