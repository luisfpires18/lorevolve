using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Features.ProjectEntities.ProjectEntityTypeEndpoints;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>How a lore entry's stored values become inputs for a project type's fields, for <see cref="ProjectEntityImport"/>.</summary>
internal static class ProjectEntityImportMapping
{
    /// <summary>
    /// The lore entry's values as inputs for the fields of <paramref name="targetTypeId"/> they match. A reference goes
    /// through <paramref name="linkFor"/>, the project-side entry to link to, or is skipped when there is none.
    /// </summary>
    internal static async Task<(List<EntityFieldDefinition> Targets, List<FieldValueInput> Inputs, List<string> Skipped)> MapAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid? projectId,
        LoreEntity source,
        Guid targetTypeId,
        Func<Guid, Task<Guid?>>? linkFor,
        CancellationToken cancellationToken)
    {
        var values = await db.EntityFieldValues.AsNoTracking().IgnoreQueryFilters()
            .Include(value => value.FieldDefinition)
            .Include(value => value.Option)
            .Where(value => value.EntityId == source.Id && value.FieldDefinition!.ArchivedAt == null)
            .ToListAsync(cancellationToken);

        var lineage = await EntityEndpoints.FieldLineageAsync(db, universeId, targetTypeId, cancellationToken, projectId);

        var targets = await db.EntityFieldDefinitions.AsNoTracking().IgnoreQueryFilters()
            .Include(field => field.Options)
            .Where(field => lineage.Contains(field.EntityTypeId)
                && field.EntityType!.UniverseId == universeId
                && field.EntityType!.ProjectId == projectId
                && field.ArchivedAt == null)
            .ToListAsync(cancellationToken);

        var inputs = new List<FieldValueInput>();
        var skipped = new List<string>();

        foreach (var field in values.GroupBy(value => value.FieldDefinitionId))
        {
            var first = field.First();
            var from = first.FieldDefinition!;

            // A picture is never a value (Issue #238); it has its own upload and is not imported.
            var target = from.Kind == EntityFieldKind.Image
                ? null
                : targets.FirstOrDefault(candidate => candidate.Kind == from.Kind
                    && string.Equals(candidate.Name, from.Name, StringComparison.OrdinalIgnoreCase));

            if (target is null)
            {
                if (from.Kind != EntityFieldKind.Image)
                {
                    skipped.Add(from.Name);
                }

                continue;
            }

            Guid? linked = null;

            if (from.Kind == EntityFieldKind.EntityReference)
            {
                linked = linkFor is not null && first.ReferencedEntityId is { } loreTarget
                    ? await linkFor(loreTarget)
                    : null;

                if (linked is null)
                {
                    skipped.Add(from.Name);
                    continue;
                }
            }

            var optionIds = from.Kind is EntityFieldKind.Select or EntityFieldKind.MultiSelect
                ? field.Select(value => value.Option?.Value)
                    .OfType<string>()
                    .Select(text => target.Options.FirstOrDefault(
                        option => string.Equals(option.Value, text, StringComparison.OrdinalIgnoreCase))?.Id)
                    .OfType<Guid>()
                    .ToList()
                : null;

            inputs.Add(new FieldValueInput(
                target.Id,
                first.TextValue,
                first.NumberValue,
                first.BooleanValue,
                first.DateValue,
                optionIds,
                linked,
                first.EraId));
        }

        return (targets, inputs, skipped);
    }
}
