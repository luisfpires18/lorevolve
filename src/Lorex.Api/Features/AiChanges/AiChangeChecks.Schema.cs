using Lorex.Api.Features.Lore;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.AiChanges;

/// <summary>
/// The checks of schema changes (ADR 0062), run where every other change's run: at staging, on every read, and inside every
/// approval. Each is what the Types screen's own save refuses - the same validators and, for an existing type, the same
/// read-only refusals the write path asks (<see cref="EntityTypeEndpoints.FieldAddRefusalAsync"/>,
/// <see cref="EntityTypeEndpoints.FieldEditRefusalAsync"/>, leaving a group links rely on) - plus what a batch needs: names
/// unique across the batch too, a parent that never puts a type inside itself, and references to types and groups this
/// proposal creates.
/// </summary>
internal sealed partial class AiChangeChecker
{
    // Read with the types in LoadAsync: a link field limited to a type accepts the types nested beneath it too (Issue #61).
    private Dictionary<Guid, Guid?> _typeParents = [];

    private Dictionary<Guid, string> _groups = [];

    private async Task LoadSchemaAsync(CancellationToken cancellationToken)
    {
        _groups = await db.EntityTypeGroups.AsNoTracking()
            .Where(group => group.UniverseId == universeId)
            .ToDictionaryAsync(group => group.Id, group => group.Name, cancellationToken);
    }

    private async Task CheckLoreTypeAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var type = (TypeValues)work.Proposed;
        TypeValues? stored = null;

        if (work.Action == AiChangeAction.Update)
        {
            stored = await AiChangeSnapshots.TypeAsync(db, universeId, work.TargetId!.Value, cancellationToken);
            if (stored is null)
            {
                work.Problem(AiChangeCodes.NotFound, "This lore type isn't in this universe any more.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone changed this type after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }
        }

        // The type's own save checks the shape; a group is named by id here, existing or new.
        work.Problems(LoreValidation.ValidateEntityType(new EntityTypeRequest(
            type.Name,
            type.Description,
            type.Icon,
            type.AccentColor,
            null,
            type.FamilyTreeEligible,
            null,
            [.. type.Groups.Select(_ => new EntityTypeGroupChoice(Guid.NewGuid()))])));

        if (_types.Any(other => other.Key != work.TargetId && other.Value.Name == type.Name))
        {
            work.Problem(AiChangeCodes.Duplicate, $"This universe already has a type called {type.Name}.", "name");
        }
        else if (Earlier(works, work, AiChangeResource.LoreType).Any(other => ((TypeValues)other.Proposed).Name == type.Name))
        {
            work.Problem(AiChangeCodes.Duplicate, $"Another change in this proposal also names a type {type.Name}.", "name");
        }

        var (newParentId, pendingNewParent) = type.Parent is { } parent ? Resolve(parent) : (null, null);
        var parentFits = true;
        if (newParentId is { } existing && !_types.ContainsKey(existing))
        {
            work.Problem(AiChangeCodes.NotFound, "Choose a parent type from this universe, or none.", "parent");
            parentFits = false;
        }
        else if (work.TargetId is { } typeId && Inside(typeId, newParentId, pendingNewParent))
        {
            work.Problem(AiChangeCodes.Invalid, $"{type.Name} can't sit beneath itself or one of its own nested types.", "parent");
            parentFits = false;
        }

        // Moving out from under a type that link fields are limited to, while links rely on it, is refused by the save (Issue
        // #61); said here too. A new parent this proposal creates sits under the stored type its chain ends at.
        if (parentFits && stored is not null && work.TargetId is { } moved
            && await EntityTypeEndpoints.LeavingBranchRefusalAsync(db, _typeParents, moved, stored.Name, StoredParent(newParentId, pendingNewParent), cancellationToken) is { } stranded)
        {
            Refusal(work, stranded, "parent");
        }

        foreach (var group in type.Groups)
        {
            if (Resolve(group).Id is { } groupId && !_groups.ContainsKey(groupId))
            {
                work.Problem(AiChangeCodes.NotFound, "Choose a group from this universe, or one this proposal creates.", "groups");
            }
        }

        // Leaving a group that existing links rely on is refused by the save; said here, with its own reasons.
        if (stored is not null && work.TargetId is { } target)
        {
            var kept = type.Groups.Select(group => Resolve(group).Id).OfType<Guid>().ToHashSet();
            var leaving = stored.Groups.Select(group => group.Id!.Value).Where(groupId => !kept.Contains(groupId)).ToList();
            if (leaving.Count > 0
                && await EntityTypeGroupEndpoints.LeavingRefusalAsync(db, new EntityType { Id = target, UniverseId = universeId, Name = stored.Name }, leaving, cancellationToken) is { } refused)
            {
                Refusal(work, refused, "groups");
            }
        }
    }

    /// <summary>
    /// Whether putting the type <paramref name="typeId"/> beneath this parent would put it inside itself: the parent is the type,
    /// or sits beneath it - through stored types, or through types this proposal creates beneath one another.
    /// </summary>
    private bool Inside(Guid typeId, Guid? parentId, AiChangeWork? pendingParent) =>
        StoredParent(parentId, pendingParent) is { } existing && (existing == typeId || EntityTypeHierarchy.WouldCycle(_typeParents, typeId, existing));

    /// <summary>
    /// The stored type a parent leads to: the parent itself, or - through types this proposal creates beneath one another -
    /// the stored type their chain ends under; null for the root.
    /// </summary>
    private Guid? StoredParent(Guid? parentId, AiChangeWork? pendingParent)
    {
        for (var guard = 0; pendingParent is not null && guard < _byKey.Count; guard++)
        {
            (parentId, pendingParent) = (pendingParent.Proposed as TypeValues)?.Parent is { } next ? Resolve(next) : (null, null);
        }

        return parentId;
    }

    private async Task CheckLoreFieldAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var field = (FieldValues)work.Proposed;
        var (typeId, pendingType) = Resolve(field.Type);
        if (pendingType is null && (typeId is not { } known || !_types.ContainsKey(known)))
        {
            work.Problem(AiChangeCodes.NotFound, "Choose a lore type from this universe, or one this proposal creates.", "type");
            return;
        }

        var (targetType, pendingTargetType) = field.TargetType is { } linksToType ? Resolve(linksToType) : (null, null);
        var (targetGroup, pendingTargetGroup) = field.TargetGroup is { } linksToGroup ? Resolve(linksToGroup) : (null, null);
        if (targetType is { } existingType && !_types.ContainsKey(existingType))
        {
            work.Problem(AiChangeCodes.NotFound, "Choose a type from this universe to link to, or any entry.", "linksToType");
        }

        if (targetGroup is { } existingGroup && !_groups.ContainsKey(existingGroup))
        {
            work.Problem(AiChangeCodes.NotFound, "Choose a group from this universe to link to, or any entry.", "linksToGroup");
        }

        // The field's own shape, as the Types screen checks it. A limit to a type or group this proposal creates stands in
        // as an id here; it exists once its own change is applied, first.
        var shape = new FieldDefinitionRequest(
            field.Name,
            field.Kind,
            field.Required,
            null,
            field.DefaultValue,
            field.Options,
            field.Semantic,
            field.TargetType is null ? null : targetType ?? Guid.NewGuid(),
            field.TargetGroup is null ? null : targetGroup ?? Guid.NewGuid(),
            work.BaseVersion);
        var shapeErrors = LoreValidation.ValidateField(shape);
        work.Problems(shapeErrors);

        if (Earlier(works, work, AiChangeResource.LoreField).Any(other => other.Proposed is FieldValues earlier
                && earlier.Type == field.Type
                && earlier.Name == field.Name
                && (other.Action == AiChangeAction.Create || other.TargetId != work.TargetId)))
        {
            work.Problem(AiChangeCodes.Duplicate, $"Another change in this proposal also names a field {field.Name} on this type.", "name");
        }

        if (shapeErrors is not null || pendingType is not null)
        {
            return;
        }

        // Only real ids go to the write path's own refusals; a new type or group as a limit has nothing to check against yet.
        var asStored = shape with
        {
            TargetEntityTypeId = pendingTargetType is null ? shape.TargetEntityTypeId : null,
            TargetGroupId = pendingTargetGroup is null ? shape.TargetGroupId : null,
        };

        if (work.Action == AiChangeAction.Create)
        {
            if (await EntityTypeEndpoints.FieldAddRefusalAsync(db, universeId, typeId!.Value, asStored, cancellationToken) is { } refused)
            {
                Refusal(work, refused, "field");
            }

            return;
        }

        var definition = await db.EntityFieldDefinitions.AsNoTracking()
            .Include(candidate => candidate.Options)
            .FirstOrDefaultAsync(candidate => candidate.Id == work.TargetId && candidate.EntityType!.UniverseId == universeId, cancellationToken);
        if (definition is null)
        {
            work.Problem(AiChangeCodes.NotFound, "This field isn't in this universe any more.");
            return;
        }

        if (definition.ArchivedAt is not null)
        {
            work.Problem(AiChangeCodes.Unsupported, "This field was archived after the AI suggested this change. Restore it in LoreX's Types first.");
            return;
        }

        if (definition.Version != work.BaseVersion)
        {
            work.Conflict("Someone changed this field after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
        }

        if ((pendingTargetType ?? pendingTargetGroup) is not null && await HoldsLinksAsync(definition.Id, cancellationToken))
        {
            work.Problem(AiChangeCodes.Invalid, "This field already links to entries, so it can't be limited to a type or group that doesn't exist yet.", "field");
        }

        if (await EntityTypeEndpoints.FieldEditRefusalAsync(db, universeId, typeId!.Value, definition, asStored, cancellationToken) is { } editRefused)
        {
            Refusal(work, editRefused, "field");
        }
    }

    private async Task<bool> HoldsLinksAsync(Guid fieldId, CancellationToken cancellationToken) =>
        await db.EntityFieldValues.AnyAsync(value => value.FieldDefinitionId == fieldId && value.ReferencedEntityId != null, cancellationToken)
        || await db.EntityEraFieldValues.AnyAsync(value => value.FieldDefinitionId == fieldId && value.ReferencedEntityId != null, cancellationToken);

    private async Task CheckLoreGroupAsync(AiChangeWork work, IReadOnlyList<AiChangeWork> works, CancellationToken cancellationToken)
    {
        var group = (GroupValues)work.Proposed;

        if (work.Action == AiChangeAction.Update)
        {
            var stored = await AiChangeSnapshots.GroupAsync(db, universeId, work.TargetId!.Value, cancellationToken);
            if (stored is null)
            {
                work.Problem(AiChangeCodes.NotFound, "This group isn't in this universe any more.");
                return;
            }

            if (!AiChangeSnapshots.Same(stored, work.Before))
            {
                work.Conflict("Someone changed this group after the AI suggested this change, so it can't be applied. Reject it, or ask for the change again.");
            }
        }

        work.Problems(EntityTypeGroupEndpoints.NameProblem(group.Name));

        if (_groups.Any(other => other.Key != work.TargetId && other.Value == group.Name))
        {
            work.Problem(AiChangeCodes.Duplicate, $"This universe already has a group called {group.Name}.", "name");
        }
        else if (Earlier(works, work, AiChangeResource.LoreGroup).Any(other => ((GroupValues)other.Proposed).Name == group.Name))
        {
            work.Problem(AiChangeCodes.Duplicate, $"Another change in this proposal also names a group {group.Name}.", "name");
        }
    }

    /// <summary>The pending changes of one kind before this one, archives aside: what a name must not collide with.</summary>
    private static IEnumerable<AiChangeWork> Earlier(IReadOnlyList<AiChangeWork> works, AiChangeWork work, AiChangeResource resource) =>
        works.Where(other => other != work
            && other.IsPending
            && other.Sequence < work.Sequence
            && other.Resource == resource
            && other.Action != AiChangeAction.Remove);

    /// <summary>A write path's refusal, said as this change's problems in its own words.</summary>
    private static void Refusal(AiChangeWork work, IResult refused, string field)
    {
        switch (refused)
        {
            case ValidationProblem validation:
                work.Problems(validation.ProblemDetails.Errors.ToDictionary(error => error.Key, error => error.Value));
                break;
            case ProblemHttpResult { ProblemDetails: HttpValidationProblemDetails validation }:
                work.Problems(validation.Errors.ToDictionary(error => error.Key, error => error.Value));
                break;
            case ProblemHttpResult problem:
                work.Problem(AiChangeCodes.Invalid, problem.ProblemDetails.Detail ?? problem.ProblemDetails.Title ?? "LoreX would refuse this change.", field);
                break;
            default:
                work.Problem(AiChangeCodes.Invalid, "LoreX would refuse this change.", field);
                break;
        }
    }
}
