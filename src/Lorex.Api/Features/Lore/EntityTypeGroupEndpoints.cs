using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// Semantic groups of Lore types (Issue #36, ADR 0007 amendment). Read by every member; renamed, deleted and enabled for the
/// Family Tree (Issue #37) by those who may edit types. Membership is not a route of its own: it is part of the type's save
/// (<see cref="ApplyMembershipAsync"/>), so choosing a group, or creating one and choosing it, is one transaction with the rest
/// of the type.
///
/// Every write runs in a transaction Microsoft.Data.Sqlite begins IMMEDIATE, as an entry save does, so a membership change,
/// a group delete, a field's new target and an entry's new link are serialised: none can check a state another is about to
/// change.
/// </summary>
public static class EntityTypeGroupEndpoints
{
    /// <summary>The marker on the 409 for deleting a group a link field is limited to.</summary>
    public const string GroupTargetedCode = "entity_type_group_targeted";

    /// <summary>The marker on the 409 for taking a type out of a group that existing links rely on.</summary>
    public const string GroupInUseCode = "entity_type_group_in_use";

    /// <summary>The marker on the 409 for deleting a group enabled for the Family Tree.</summary>
    public const string GroupFamilyTreeCode = "entity_type_group_family_tree";

    public static IEndpointRouteBuilder MapEntityTypeGroupEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/entity-type-groups")
            .WithTags("Entity types")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListEntityTypeGroups");
        group.MapPut("/{groupId:guid}", RenameAsync).WithName("RenameEntityTypeGroup");
        group.MapDelete("/{groupId:guid}", DeleteAsync).WithName("DeleteEntityTypeGroup");
        group.MapPut("/{groupId:guid}/family-tree", SetFamilyTreeAsync).WithName("SetEntityTypeGroupFamilyTree");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return Results.Ok(await LoadGroupsAsync(db, universeId, cancellationToken));
    }

    private static async Task<IResult> RenameAsync(
        Guid universeId,
        Guid groupId,
        [FromBody] EntityTypeGroupRenameRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await UpdateCoreAsync(db, universeId, groupId, request.Name, null, cancellationToken);
    }

    /// <summary>Why a group name can't be used, by its shape alone, or null. The name's uniqueness is the write's, in its transaction.</summary>
    internal static Dictionary<string, string[]>? NameProblem(string? name) =>
        string.IsNullOrEmpty(name) || name.Length > LoreLimits.NameMaxLength
            ? new Dictionary<string, string[]>
            {
                ["name"] = [string.IsNullOrEmpty(name) ? "Give the group a name." : $"Keep the name under {LoreLimits.NameMaxLength} characters."],
            }
            : null;

    /// <summary>
    /// A new group with no types yet - what an approved AI change creates before the types that join it (ADR 0062). The app
    /// itself creates a group with the type that first joins it (<see cref="ApplyMembershipAsync"/>); both are one row with a
    /// name unique in the universe, and a group left empty is the state deleting its last type leaves too.
    /// </summary>
    internal static async Task<IResult> CreateCoreAsync(
        LorexDbContext db,
        Guid universeId,
        string? name,
        bool familyTreeEnabled,
        CancellationToken cancellationToken)
    {
        name = name?.Trim();
        if (NameProblem(name) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (await db.EntityTypeGroups.AnyAsync(other => other.UniverseId == universeId && other.Name == name, cancellationToken))
        {
            return NameTaken("name", name!);
        }

        var now = DateTime.UtcNow;
        var group = new EntityTypeGroup { Id = Guid.NewGuid(), UniverseId = universeId, Name = name!, FamilyTreeEnabled = familyTreeEnabled, CreatedAt = now, UpdatedAt = now };
        db.EntityTypeGroups.Add(group);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTaken("name", name!);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok((await LoadGroupsAsync(db, universeId, cancellationToken)).First(each => each.Id == group.Id));
    }

    /// <summary>
    /// A group's rename and, when <paramref name="familyTreeEnabled"/> is given, its Family Tree switch, after the caller's
    /// access check: the rename route's, and an approved AI change's (ADR 0062). The group keeps its id, members and targets.
    /// </summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorexDbContext db,
        Guid universeId,
        Guid groupId,
        string? name,
        bool? familyTreeEnabled,
        CancellationToken cancellationToken)
    {
        name = name?.Trim();
        if (NameProblem(name) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var group = await db.EntityTypeGroups
            .FirstOrDefaultAsync(candidate => candidate.Id == groupId && candidate.UniverseId == universeId, cancellationToken);
        if (group is null)
        {
            return Results.NotFound();
        }

        if (group.Name != name
            && await db.EntityTypeGroups.AnyAsync(other => other.UniverseId == universeId && other.Name == name, cancellationToken))
        {
            return NameTaken("name", name!);
        }

        group.Name = name!;
        group.FamilyTreeEnabled = familyTreeEnabled ?? group.FamilyTreeEnabled;
        group.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTaken("name", name!);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok((await LoadGroupsAsync(db, universeId, cancellationToken)).First(each => each.Id == groupId));
    }

    /// <summary>
    /// Enables a group for the Family Tree, or turns that off (Issue #37): every type in the group is then offered the tree, as a
    /// type enabled on its own is. Only this flag changes - no type's own switch, no membership, no relationship - so turning it
    /// off narrows where the tree is offered and loses no family a link records. The group is matched by id within this
    /// universe; another universe's group is the same 404 as one that does not exist.
    /// </summary>
    private static async Task<IResult> SetFamilyTreeAsync(
        Guid universeId,
        Guid groupId,
        [FromBody] EntityTypeGroupFamilyTreeRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (request.Enabled is not { } enabled)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["enabled"] = ["Say whether the group is enabled for Family Tree."],
            });
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var group = await db.EntityTypeGroups
            .FirstOrDefaultAsync(candidate => candidate.Id == groupId && candidate.UniverseId == universeId, cancellationToken);
        if (group is null)
        {
            return Results.NotFound();
        }

        if (group.FamilyTreeEnabled != enabled)
        {
            group.FamilyTreeEnabled = enabled;
            group.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok((await LoadGroupsAsync(db, universeId, cancellationToken)).First(each => each.Id == groupId));
    }

    /// <summary>
    /// Deletes a group and with it every membership - the types themselves, their fields and entries are untouched. Refused
    /// while a link field is limited to the group: the field would otherwise be left limited to nothing, and it is never
    /// quietly opened to any type instead. The refusal names the fields so the author can change them first. Refused too while
    /// the group is enabled for the Family Tree, so deleting it never quietly takes the tree away from its types: the author
    /// turns that off first, and sees what it covered.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid groupId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var group = await db.EntityTypeGroups
            .FirstOrDefaultAsync(candidate => candidate.Id == groupId && candidate.UniverseId == universeId, cancellationToken);
        if (group is null)
        {
            return Results.NotFound();
        }

        var targeting = await db.EntityFieldDefinitions.AsNoTracking()
            .Where(field => field.TargetGroupId == groupId)
            .OrderBy(field => field.EntityType!.Name)
            .ThenBy(field => field.Name)
            .Select(field => new { FieldId = field.Id, FieldName = field.Name, field.EntityTypeId, TypeName = field.EntityType!.Name, Archived = field.ArchivedAt != null })
            .ToListAsync(cancellationToken);

        if (targeting.Count > 0)
        {
            var first = targeting[0];
            var others = targeting.Count - 1;
            return Results.Problem(
                title: "Group is in use",
                detail: $"{group.Name} can't be deleted because the field \"{first.FieldName}\"{EntityTypeEndpoints.ArchivedMark(first.Archived)} on {first.TypeName}"
                    + (others == 0 ? string.Empty : others == 1 ? " and 1 other field" : $" and {others} other fields")
                    + " can only link to entries in this group. Change those fields to allow something else first.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?>
                {
                    ["code"] = GroupTargetedCode,
                    ["fields"] = targeting
                        .Select(field => new { field.FieldId, field.FieldName, TypeId = field.EntityTypeId, field.TypeName })
                        .ToList(),
                });
        }

        if (group.FamilyTreeEnabled)
        {
            return Results.Problem(
                title: "Group is in use",
                detail: $"{group.Name} can't be deleted while it is enabled for Family Tree. Turn that off on the Family Tree page first.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = GroupFamilyTreeCode });
        }

        db.EntityTypeGroups.Remove(group);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Makes <paramref name="choices"/> the type's whole set of groups, inside the caller's transaction: existing groups by id
    /// (this universe's only), new ones by name (created here, so they exist only if the save commits). Taking the type out of
    /// a group is refused while any link in a field limited to that group points at an entry of this type - Trash included,
    /// since a trashed entry's links come back with it - and nothing is cleared to make it fit. Staged on the context; the
    /// caller saves. Returns the refusal, or null.
    /// </summary>
    internal static async Task<IResult?> ApplyMembershipAsync(
        LorexDbContext db,
        Guid universeId,
        EntityType entityType,
        IReadOnlyList<EntityTypeGroupChoice> choices,
        bool isNew,
        CancellationToken cancellationToken)
    {
        var wantedIds = choices.Where(choice => choice.Id is not null).Select(choice => choice.Id!.Value).ToHashSet();
        var newNames = choices
            .Where(choice => choice.Id is null)
            .Select(choice => choice.Name!.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var existing = wantedIds.Count == 0
            ? []
            : await db.EntityTypeGroups.AsNoTracking()
                .Where(group => group.UniverseId == universeId && wantedIds.Contains(group.Id))
                .Select(group => group.Id)
                .ToListAsync(cancellationToken);

        // One answer for a group that does not exist and one of another universe, so neither can be told apart.
        if (existing.Count != wantedIds.Count)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["groups"] = ["Choose a group from this universe."],
            });
        }

        if (newNames.Count > 0
            && await db.EntityTypeGroups.AsNoTracking()
                .Where(group => group.UniverseId == universeId && newNames.Contains(group.Name))
                .Select(group => group.Name)
                .FirstOrDefaultAsync(cancellationToken) is { } taken)
        {
            return NameTaken("groups", taken);
        }

        var current = isNew
            ? []
            : await db.EntityTypeGroupMembers
                .Where(member => member.EntityTypeId == entityType.Id)
                .ToListAsync(cancellationToken);

        var leaving = current.Where(member => !wantedIds.Contains(member.EntityTypeGroupId)).ToList();
        if (leaving.Count > 0 && await LeavingRefusalAsync(db, entityType, leaving.Select(member => member.EntityTypeGroupId).ToList(), cancellationToken) is { } refused)
        {
            return refused;
        }

        db.EntityTypeGroupMembers.RemoveRange(leaving);

        var now = DateTime.UtcNow;
        foreach (var id in wantedIds.Where(id => current.All(member => member.EntityTypeGroupId != id)))
        {
            db.EntityTypeGroupMembers.Add(new EntityTypeGroupMember { EntityTypeGroupId = id, EntityTypeId = entityType.Id });
        }

        foreach (var name in newNames)
        {
            var group = new EntityTypeGroup { Id = Guid.NewGuid(), UniverseId = universeId, Name = name, CreatedAt = now, UpdatedAt = now };
            db.EntityTypeGroups.Add(group);
            db.EntityTypeGroupMembers.Add(new EntityTypeGroupMember { EntityTypeGroupId = group.Id, EntityTypeId = entityType.Id });
        }

        return null;
    }

    /// <summary>
    /// The refusal for taking <paramref name="entityType"/> out of <paramref name="groupIds"/>, or null when no link relies on
    /// it. Bounded: it reads only the fields limited to those groups and counts, through the reference index, their values
    /// that point at entries of this type.
    /// </summary>
    internal static async Task<IResult?> LeavingRefusalAsync(
        LorexDbContext db,
        EntityType entityType,
        List<Guid> groupIds,
        CancellationToken cancellationToken)
    {
        var typeId = entityType.Id;
        var relying = await db.EntityFieldDefinitions.AsNoTracking()
            .Where(field => field.TargetGroupId != null && groupIds.Contains(field.TargetGroupId.Value))
            .Select(field => new
            {
                FieldId = field.Id,
                FieldName = field.Name,
                TypeId = field.EntityTypeId,
                TypeName = field.EntityType!.Name,
                GroupId = field.TargetGroupId!.Value,
                GroupName = field.TargetGroup!.Name,
                Archived = field.ArchivedAt != null,
                Links = field.Values.Count(value => value.ReferencedEntityId != null && value.ReferencedEntity!.EntityTypeId == typeId)
                    + db.EntityEraFieldValues.Count(value => value.FieldDefinitionId == field.Id
                        && value.ReferencedEntityId != null
                        && value.ReferencedEntity!.EntityTypeId == typeId),
            })
            .Where(field => field.Links > 0)
            .ToListAsync(cancellationToken);

        if (relying.Count == 0)
        {
            return null;
        }

        var ordered = relying.OrderBy(field => field.TypeName, StringComparer.Ordinal).ThenBy(field => field.FieldName, StringComparer.Ordinal).ToList();
        var first = ordered[0];
        var others = ordered.Count - 1;
        var links = first.Links == 1 ? "1 link" : $"{first.Links} links";

        return Results.Problem(
            title: "Group is in use",
            detail: $"{entityType.Name} can't leave {first.GroupName} because the field \"{first.FieldName}\"{EntityTypeEndpoints.ArchivedMark(first.Archived)} on {first.TypeName} "
                + $"has {links} to {entityType.Name} entries that rely on that group"
                + (others == 0 ? string.Empty : others == 1 ? ", and 1 other field does too" : $", and {others} other fields do too")
                + ". Change those links first, then try again.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = GroupInUseCode,
                ["fields"] = ordered
                    .Select(field => new { field.FieldId, field.FieldName, field.TypeId, field.TypeName, field.GroupId, field.GroupName, field.Links })
                    .ToList(),
            });
    }

    internal static async Task<List<EntityTypeGroupResponse>> LoadGroupsAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var groups = await db.EntityTypeGroups.AsNoTracking()
            .Where(group => group.UniverseId == universeId)
            .Select(group => new EntityTypeGroupResponse(
                group.Id,
                group.Name,
                group.Members.Select(member => member.EntityTypeId).ToList(),
                group.FamilyTreeEnabled))
            .ToListAsync(cancellationToken);

        return [.. groups.OrderBy(group => group.Name, StringComparer.OrdinalIgnoreCase).ThenBy(group => group.Name, StringComparer.Ordinal)];
    }

    private static IResult NameTaken(string key, string name) =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            [key] = [$"This universe already has a group called {name}. Choose it from the list instead."],
        });
}
