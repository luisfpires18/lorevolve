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

/// <summary>
/// "Import lore entry": copies a lore entry's field values onto a project entry, so a game does not retype what the
/// world already says.
///
/// <para><b>Copy, never share.</b> Every value lands as a new row on the project entry. A link to a lore entry (a
/// rune, say) cannot be kept as it is, because a project's link fields reach only entries of that project; the import
/// instead links to the project's own copy of the target (a project entry whose <see cref="LoreEntity.CanonEntityId"/>
/// is that lore entry), and makes the copy when there is none. A copy has its own rows and carries only the target's
/// plain values, not its links, so nothing the project edits afterwards reaches the lore. This route only ever reads
/// lore rows.</para>
///
/// <para><b>Matching.</b> A lore field fills the project field of the same name and kind (case-insensitive). Options
/// match by text. What matches nothing, or fails the field's own rules, is skipped and named in the answer; fields the
/// lore entry has no value for are left as the project entry has them.</para>
/// </summary>
public static class ProjectEntityImport
{
    internal static void Map(RouteGroupBuilder group) =>
        group.MapPost("/{entityId:guid}/import-lore", ImportAsync).WithName("ImportLoreIntoProjectEntity");

    private static async Task<IResult> ImportAsync(
        Guid projectId,
        Guid entityId,
        [FromBody] ImportLoreRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var universeId = project!.UniverseId;
        var actor = principal.RequireUserId();

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var entity = await db.Entities.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                candidate => candidate.Id == entityId && candidate.ProjectId == projectId && candidate.DeletedAt == null,
                cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        if (!EditVersion.Matches(entity.Version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                ProjectEntityEndpoints.ChangedCode,
                "Entry changed",
                "This entry was changed after it was opened here. Nothing was overwritten.",
                entity.Version);
        }

        var lore = await db.Entities.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                candidate => candidate.Id == request.LoreEntityId
                    && candidate.UniverseId == universeId
                    && candidate.ProjectId == null
                    && candidate.DeletedAt == null,
                cancellationToken);

        if (lore is null)
        {
            return Results.NotFound();
        }

        var copied = new List<string>();
        IResult? failure = null;

        async Task<Guid?> CopyOfAsync(Guid loreTargetId)
        {
            var existing = await db.Entities.IgnoreQueryFilters()
                .Where(candidate => candidate.ProjectId == projectId
                    && candidate.CanonEntityId == loreTargetId
                    && candidate.DeletedAt == null)
                .Select(candidate => (Guid?)candidate.Id)
                .FirstOrDefaultAsync(cancellationToken);

            if (existing is not null)
            {
                return existing;
            }

            var target = await db.Entities.IgnoreQueryFilters()
                .Include(candidate => candidate.EntityType)
                .FirstOrDefaultAsync(
                    candidate => candidate.Id == loreTargetId
                        && candidate.UniverseId == universeId
                        && candidate.ProjectId == null
                        && candidate.DeletedAt == null,
                    cancellationToken);

            if (target is null)
            {
                return null;
            }

            // The project's own type of the same name; a project with none cannot hold the copy, so the link is skipped.
            var typeId = await db.EntityTypes.IgnoreQueryFilters()
                .Where(type => type.UniverseId == universeId
                    && type.ProjectId == projectId
                    && type.Name == target.EntityType!.Name)
                .Select(type => (Guid?)type.Id)
                .FirstOrDefaultAsync(cancellationToken);

            if (typeId is null)
            {
                return null;
            }

            // No link resolver: a copy takes plain values only, so one import never fans out through the lore.
            var plain = await MapAsync(db, universeId, projectId, target, typeId.Value, linkFor: null, cancellationToken);

            var (created, problem) = await EntityEndpoints.CreateEntryAsync(
                db,
                universeId,
                new EntityRequest(typeId.Value, target.Name, target.Summary, CanonStatus.Draft, null, null, plain.Inputs),
                actor,
                cancellationToken,
                projectId,
                target.Id);

            if (problem is not null)
            {
                failure = problem;
                return null;
            }

            copied.Add(target.Name);
            return created!.Id;
        }

        var mapped = await MapAsync(db, universeId, projectId, lore, entity.EntityTypeId, CopyOfAsync, cancellationToken);

        if (failure is not null)
        {
            return failure;
        }

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);
        var (referenced, members, parentOf) = await EntityEndpoints.LinkTargetsAsync(
            db,
            universeId,
            mapped.Targets,
            mapped.Inputs.Select(input => input.ReferencedEntityId).OfType<Guid>(),
            cancellationToken,
            projectId);

        var rows = new List<EntityFieldValue>();
        var imported = new List<string>();
        var skipped = mapped.Skipped;

        foreach (var input in mapped.Inputs)
        {
            var definition = mapped.Targets.First(target => target.Id == input.FieldDefinitionId);
            var errors = new Dictionary<string, string[]>();
            var built = EntityEndpoints.BuildRows(
                entity.Id, definition, input, chronology, referenced, members, parentOf, errors);

            if (errors.Count > 0 || built.Count == 0)
            {
                skipped.Add(definition.Name);
                continue;
            }

            rows.AddRange(built);
            imported.Add(definition.Name);
        }

        // Only the imported fields are replaced; every other value the entry holds stays.
        var replaced = rows.Select(row => row.FieldDefinitionId).Distinct().ToList();

        entity.CanonEntityId ??= lore.Id;
        entity.UpdatedAt = DateTime.UtcNow;

        await db.EntityFieldValues
            .Where(value => value.EntityId == entity.Id && replaced.Contains(value.FieldDefinitionId))
            .ExecuteDeleteAsync(cancellationToken);

        db.EntityFieldValues.AddRange(rows);
        await db.SaveChangesAsync(cancellationToken);

        if (await EntityRevisions.CaptureAsync(
            db, entity.Id, EntityRevisionKind.Edited, restoredFromRevisionId: null, actor, cancellationToken))
        {
            entity.Version++;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        var detail = await EntityEndpoints.LoadDetailAsync(
            db, universeId, entity.Id, cancellationToken, liveOnly: false, projectId);

        return Results.Ok(new ImportLoreResult(detail, imported, skipped, copied));
    }

    /// <summary>
    /// The lore entry's values as inputs for the fields of <paramref name="targetTypeId"/> they match. A reference goes
    /// through <paramref name="linkFor"/>, the project-side entry to link to, or is skipped when there is none.
    /// </summary>
    private static async Task<(List<EntityFieldDefinition> Targets, List<FieldValueInput> Inputs, List<string> Skipped)> MapAsync(
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
                    .Select(text => target.Options.FirstOrDefault(option => option.Value == text)?.Id)
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
