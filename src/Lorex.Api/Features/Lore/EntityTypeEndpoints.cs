using System.Linq.Expressions;
using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.FamilyTrees;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// Entity types and their field definitions. Every route proves universe ownership before
/// touching anything, and every nested lookup is re-scoped to that universe so an id from
/// another universe cannot be smuggled in through the path or the body.
/// </summary>
public static class EntityTypeEndpoints
{
    /// <summary>The machine-readable marker on the 409 a type still used by an entry gets, in Lore or in the Trash.</summary>
    public const string TypeInUseCode = "entity_type_in_use";

    /// <summary>
    /// Why a type cannot be deleted, in the author's terms: how many entries still use it and how many of those are in the
    /// Trash, since an entry there is invisible in Lore and still keeps its type. Mirrored by the Types screen.
    /// </summary>
    internal static string InUseDetail(string name, int live, int trashed, int children = 0)
    {
        if (live + trashed == 0)
        {
            return $"{name} can't be deleted because it still contains {Nested(children)}. Move or delete those types first.";
        }

        var total = live + trashed;
        var uses = total == 1 ? "1 entry still uses it" : $"{total} entries still use it";
        var where = trashed == 0
            ? string.Empty
            : trashed == total
                ? total == 1 ? ", and it is in the Trash" : ", all of them in the Trash"
                : $", {trashed} of them in the Trash";
        var fix = (total, trashed) switch
        {
            (1, 0) => "Move it to another type first.",
            (1, _) => "Restore it from the Trash, then move it to another type.",
            (_, 0) => "Move them to another type first.",
            _ => "Move them to another type first; an entry in the Trash has to be restored before it can be moved.",
        };

        return children == 0
            ? $"{name} can't be deleted because {uses}{where}. {fix}"
            : $"{name} can't be deleted because {uses}{where}, and it still contains {Nested(children)}. {fix} "
                + (children == 1 ? "Move or delete that type too." : "Move or delete those types too.");
    }

    private static string Nested(int children) => children == 1 ? "1 nested type" : $"{children} nested types";

    /// <summary>The marker on the 409 for deleting a type that a link field is limited to.</summary>
    public const string TypeTargetedCode = "entity_type_targeted";

    /// <summary>The marker on the 409 for limiting a link field to a type some of its links are not of.</summary>
    public const string TargetConflictCode = "entity_field_target_conflict";

    /// <summary>The marker on the 409 for editing an archived field: it is restored first (Issue #39).</summary>
    public const string FieldArchivedCode = "entity_field_archived";

    /// <summary>The marker on the 409 for making a field required - by an edit or a restore - while live entries of its type have no value for it.</summary>
    public const string RequiredMissingCode = "entity_field_required_missing";

    /// <summary>The marker on the 409 for permanently deleting a field that holds values, the Trash included.</summary>
    public const string FieldInUseCode = "entity_field_in_use";

    /// <summary>The machine-readable marker on the refusal of a parent or a move that would put a type inside itself.</summary>
    public const string ParentCycleCode = "entity_type_parent_cycle";

    /// <summary>The machine-readable marker on a reorder whose type no longer sits under the parent the client saw.</summary>
    public const string ParentChangedCode = "entity_type_parent_changed";

    public static IEndpointRouteBuilder MapEntityTypeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/entity-types")
            .WithTags("Entity types")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListEntityTypes");
        group.MapPost("/", CreateAsync).WithName("CreateEntityType");
        group.MapPut("/{typeId:guid}", UpdateAsync).WithName("UpdateEntityType");
        group.MapDelete("/{typeId:guid}", DeleteAsync).WithName("DeleteEntityType");
        group.MapPost("/{typeId:guid}/move", MoveAsync).WithName("MoveEntityType");
        group.MapPost("/{typeId:guid}/reorder", ReorderAsync).WithName("ReorderEntityType");

        group.MapPost("/{typeId:guid}/fields", AddFieldAsync).WithName("AddEntityField");
        group.MapPut("/{typeId:guid}/fields/{fieldId:guid}", UpdateFieldAsync).WithName("UpdateEntityField");
        group.MapDelete("/{typeId:guid}/fields/{fieldId:guid}", DeleteFieldAsync).WithName("DeleteEntityField");
        group.MapPost("/{typeId:guid}/fields/{fieldId:guid}/archive", ArchiveFieldAsync).WithName("ArchiveEntityField");
        group.MapPost("/{typeId:guid}/fields/{fieldId:guid}/restore", RestoreFieldAsync).WithName("RestoreEntityField");

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

        // A read only reads. The starter types are written once, when the universe is created (UniverseEndpoints); from
        // then on a universe's types are its author's, so a starter they deleted or renamed - or every type, deleted - is
        // never put back here. Reads used to fill missing starter names in, which is what made deleting Location look
        // like it had silently failed (ADR 0007 amendment).
        return Results.Ok(await LoadTypesAsync(db, universeId, cancellationToken));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] EntityTypeRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (LoreValidation.ValidateEntityType(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();
        var parentId = request.Parent?.Id;

        // One writer at a time from here, so two types created under the same parent cannot both take the last place.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        if (await db.EntityTypes.AnyAsync(
                type => type.UniverseId == universeId && type.Name == name,
                cancellationToken))
        {
            return NameTaken();
        }

        if (parentId is { } parent
            && !await db.EntityTypes.AnyAsync(type => type.Id == parent && type.UniverseId == universeId, cancellationToken))
        {
            return ParentMissing();
        }

        var now = DateTime.UtcNow;
        var order = await NextPlaceAsync(db, universeId, parentId, cancellationToken);

        var entityType = new EntityType
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Name = name,
            Description = LoreValidation.Normalize(request.Description),
            Icon = LoreValidation.Normalize(request.Icon),
            AccentColor = LoreValidation.NormalizeAccent(request.AccentColor),
            FamilyTreeEligible = request.FamilyTreeEligible ?? false,
            ParentId = parentId,
            DisplayOrder = order,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.EntityTypes.Add(entityType);

        // Its groups go in with it, new ones included, so a refused create leaves no group behind.
        if (request.Groups is { } groups
            && await EntityTypeGroupEndpoints.ApplyMembershipAsync(db, universeId, entityType, groups, isNew: true, cancellationToken) is { } refusedGroups)
        {
            return refusedGroups;
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTaken();
        }

        await transaction.CommitAsync(cancellationToken);

        var created = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Created(
            $"/api/universes/{universeId}/entity-types/{entityType.Id}",
            created.First(type => type.Id == entityType.Id));
    }

    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid typeId,
        [FromBody] EntityTypeRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var entityType = await FindTypeAsync(db, universeId, typeId, cancellationToken);
        if (entityType is null)
        {
            return Results.NotFound();
        }

        if (LoreValidation.ValidateEntityType(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        if (!string.Equals(entityType.Name, name, StringComparison.Ordinal)
            && await db.EntityTypes.AnyAsync(
                other => other.UniverseId == universeId && other.Name == name && other.Id != typeId,
                cancellationToken))
        {
            return NameTaken();
        }

        entityType.Name = name;
        entityType.Description = LoreValidation.Normalize(request.Description);
        entityType.Icon = LoreValidation.Normalize(request.Icon);
        entityType.AccentColor = LoreValidation.NormalizeAccent(request.AccentColor);
        entityType.FamilyTreeEligible = request.FamilyTreeEligible ?? entityType.FamilyTreeEligible;
        entityType.UpdatedAt = DateTime.UtcNow;

        // Absent keeps the parent; present - a type, or null for the root - moves the type there with everything beneath it.
        if (request.Parent is { } parent && parent.Id != entityType.ParentId
            && await ReparentAsync(db, universeId, entityType, parent.Id, cancellationToken) is { } refused)
        {
            return refused;
        }

        // Absent keeps the groups; present is the whole set. Leaving a group that links rely on is refused, and nothing of
        // this save is written then.
        if (request.Groups is { } groups
            && await EntityTypeGroupEndpoints.ApplyMembershipAsync(db, universeId, entityType, groups, isNew: false, cancellationToken) is { } refusedGroups)
        {
            return refusedGroups;
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTaken();
        }

        await transaction.CommitAsync(cancellationToken);

        var types = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Ok(types.First(type => type.Id == typeId));
    }

    /// <summary>
    /// Puts <paramref name="entityType"/> beneath <paramref name="parentId"/> (null for the root), last among its new siblings,
    /// and closes the gap it leaves among the old ones. Its descendants are untouched: they hang from it, so they move with it
    /// in their own order. Refuses a parent that is not a type of this universe, or that is the type itself or beneath it.
    /// Staged on the context; the caller saves, inside its transaction.
    /// </summary>
    private static async Task<IResult?> ReparentAsync(
        LorexDbContext db,
        Guid universeId,
        EntityType entityType,
        Guid? parentId,
        CancellationToken cancellationToken)
    {
        if (parentId is { } parent)
        {
            var parentOf = await ParentsAsync(db, universeId, cancellationToken);
            if (!parentOf.ContainsKey(parent))
            {
                return ParentMissing();
            }

            if (EntityTypeHierarchy.WouldCycle(parentOf, entityType.Id, parent))
            {
                return Results.Problem(
                    title: "A type can't sit inside itself",
                    detail: parent == entityType.Id
                        ? $"{entityType.Name} can't be its own parent. Choose another type, or none."
                        : $"{entityType.Name} can't go beneath one of its own nested types. Choose another type, or none.",
                    statusCode: StatusCodes.Status409Conflict,
                    extensions: new Dictionary<string, object?> { ["code"] = ParentCycleCode });
            }
        }

        var now = DateTime.UtcNow;
        var oldParentId = entityType.ParentId;
        var order = await NextPlaceAsync(db, universeId, parentId, cancellationToken);

        entityType.ParentId = parentId;
        entityType.DisplayOrder = order;
        entityType.UpdatedAt = now;

        var formerSiblings = await SiblingsAsync(db, universeId, oldParentId, cancellationToken);
        Renumber(formerSiblings.Where(sibling => sibling.Id != entityType.Id).ToList(), now);

        return null;
    }

    /// <summary>
    /// Moves a type one place up or down among its direct siblings - the types with the same parent, and only those - and
    /// numbers that sibling group 1..n again, so gaps and ties left by older data are gone after the first move. Up on the
    /// first sibling and down on the last are an unchanged 200, deliberately: the button that asked is already disabled on
    /// screen, and a stale second click should find the list as it is, not an error. Answers the whole list, in order.
    ///
    /// One writer at a time (the transaction takes SQLite's write lock first), and the group is read inside it, so two moves
    /// at once apply one after the other and never leave two siblings in one place.
    /// </summary>
    private static async Task<IResult> MoveAsync(
        Guid universeId,
        Guid typeId,
        [FromBody] EntityTypeMoveRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var step = request.Direction?.Trim().ToLowerInvariant() switch
        {
            "up" => -1,
            "down" => 1,
            _ => 0,
        };

        if (step == 0)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["direction"] = ["Say \"up\" or \"down\"."],
            });
        }

        // Past either end is no move at all: the same list back, not an error.
        return await PlaceAmongSiblingsAsync(
            db,
            universeId,
            typeId,
            (moving, from, count) =>
            {
                var to = from + step;
                return to >= 0 && to < count ? to : from;
            },
            cancellationToken);
    }

    /// <summary>
    /// Puts a type at an absolute place among its direct siblings in one request - a desktop drag, however far it went - and
    /// numbers the group 1..n again. Only the order of that one sibling group changes: the parent, the type's own nested types
    /// (which hang from it, and so move with it in the shown order), its fields and its entries are untouched. Its own place
    /// is an unchanged 200. An index outside the group is a 400 on <c>index</c>; a type no longer under the parent the client
    /// saw is a 409 <see cref="ParentChangedCode"/>, so a stale screen reloads rather than reordering a group it never showed.
    /// Answers the whole list, in order, as a move does.
    /// </summary>
    private static async Task<IResult> ReorderAsync(
        Guid universeId,
        Guid typeId,
        [FromBody] EntityTypeReorderRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (request.Index is not { } index || index < 0)
        {
            return OutOfRange();
        }

        return await PlaceAmongSiblingsAsync(
            db,
            universeId,
            typeId,
            (moving, _, count) =>
                moving.ParentId != request.ParentId ? SiblingPlace.Refused(ParentChanged())
                : index >= count ? SiblingPlace.Refused(OutOfRange())
                : index,
            cancellationToken);

        static IResult OutOfRange() => Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["index"] = ["Choose a place among this type's siblings."],
        });

        static IResult ParentChanged() => Results.Problem(
            title: "This type has moved",
            detail: "It no longer sits where this list showed it. Reload the types and try again.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ParentChangedCode });
    }

    /// <summary>
    /// The one place a type's position among its siblings is changed, for a one-step move and an absolute reorder alike. Inside
    /// one transaction - which takes SQLite's write lock first, so two at once apply one after the other - it reads the type
    /// and its sibling group, asks <paramref name="target"/> for the new index (or a refusal), takes the type out and puts it
    /// back there, numbers the group 1..n, and answers the whole list.
    /// </summary>
    private static async Task<IResult> PlaceAmongSiblingsAsync(
        LorexDbContext db,
        Guid universeId,
        Guid typeId,
        Func<EntityType, int, int, SiblingPlace> target,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var moving = await db.EntityTypes.FirstOrDefaultAsync(
            type => type.Id == typeId && type.UniverseId == universeId,
            cancellationToken);

        if (moving is null)
        {
            return Results.NotFound();
        }

        var siblings = await SiblingsAsync(db, universeId, moving.ParentId, cancellationToken);
        var from = siblings.FindIndex(sibling => sibling.Id == typeId);
        var decided = target(moving, from, siblings.Count);
        if (decided.Refusal is { } refusal)
        {
            return refusal;
        }

        siblings.RemoveAt(from);
        siblings.Insert(decided.Index, moving);

        Renumber(siblings, DateTime.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadTypesAsync(db, universeId, cancellationToken));
    }

    /// <summary>Where a type goes among its siblings, or why it does not.</summary>
    private readonly record struct SiblingPlace(int Index, IResult? Refusal)
    {
        public static implicit operator SiblingPlace(int index) => new(index, null);

        public static SiblingPlace Refused(IResult refusal) => new(0, refusal);
    }

    /// <summary>A type's direct siblings with <paramref name="parentId"/>, tracked, in their shown order.</summary>
    private static async Task<List<EntityType>> SiblingsAsync(
        LorexDbContext db,
        Guid universeId,
        Guid? parentId,
        CancellationToken cancellationToken)
    {
        var siblings = await db.EntityTypes
            .Where(type => type.UniverseId == universeId && type.ParentId == parentId)
            .ToListAsync(cancellationToken);

        return [.. siblings.OrderBy(type => type.DisplayOrder).ThenBy(type => type.Name, StringComparer.Ordinal).ThenBy(type => type.Id)];
    }

    /// <summary>Numbers a sibling group 1..n in the order given; a row whose place changed records the edit.</summary>
    private static void Renumber(List<EntityType> siblings, DateTime now)
    {
        for (var index = 0; index < siblings.Count; index++)
        {
            if (siblings[index].DisplayOrder != index + 1)
            {
                siblings[index].DisplayOrder = index + 1;
                siblings[index].UpdatedAt = now;
            }
        }
    }

    /// <summary>The place after the last of <paramref name="parentId"/>'s children (the roots, for null).</summary>
    private static async Task<int> NextPlaceAsync(
        LorexDbContext db,
        Guid universeId,
        Guid? parentId,
        CancellationToken cancellationToken) =>
        (await db.EntityTypes
            .Where(type => type.UniverseId == universeId && type.ParentId == parentId)
            .MaxAsync(type => (int?)type.DisplayOrder, cancellationToken) ?? 0) + 1;

    /// <summary>Every type of the universe and its parent: the whole graph, which is small.</summary>
    private static async Task<Dictionary<Guid, Guid?>> ParentsAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken) =>
        await db.EntityTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .ToDictionaryAsync(type => type.Id, type => type.ParentId, cancellationToken);

    private static IResult ParentMissing() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["parent"] = ["Choose a type from this universe, or none."],
        });

    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid typeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        // One writer at a time (IMMEDIATE): an entry, a nested type or a field that names this type, written at the same
        // moment, is either seen below or waits until the type is gone and is then refused.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var entityType = await FindTypeAsync(db, universeId, typeId, cancellationToken);
        if (entityType is null)
        {
            return Results.NotFound();
        }

        // Entries in the Trash count. The foreign key is Restrict precisely so a type cannot
        // be pulled out from under lore that is still restorable, and an entry that came back
        // to a type that no longer exists would not be the entry the author threw away.
        var users = await db.Entities
            .Where(entity => entity.EntityTypeId == typeId)
            .GroupBy(entity => entity.DeletedAt == null)
            .Select(group => new { Live = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        var live = users.Where(group => group.Live).Sum(group => group.Count);
        var trashed = users.Where(group => !group.Live).Sum(group => group.Count);

        // A type holding nested types is refused too - never deleted with them, and never leaving them promoted or moved
        // somewhere the author did not choose. The key refuses it as well.
        var children = await db.EntityTypes.CountAsync(
            type => type.UniverseId == universeId && type.ParentId == typeId,
            cancellationToken);

        if (live + trashed + children > 0)
        {
            return Results.Problem(
                title: "Type is in use",
                detail: InUseDetail(entityType.Name, live, trashed, children),
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?>
                {
                    ["code"] = TypeInUseCode,
                    ["liveCount"] = live,
                    ["trashedCount"] = trashed,
                    ["childCount"] = children,
                });
        }

        // A link field on another type limited to this one would be left pointing at nothing. Named, so the author knows
        // which field to change; one is enough to say what to do, and the count says how many. A field of this type that
        // links to its own kind goes with it. An archived field counts and says so (Issue #39): its limit and links are kept.
        var targeting = await db.EntityFieldDefinitions.AsNoTracking()
            .Where(field => field.TargetEntityTypeId == typeId && field.EntityTypeId != typeId)
            .OrderBy(field => field.EntityType!.Name)
            .ThenBy(field => field.Name)
            .Select(field => new { field.Name, TypeName = field.EntityType!.Name, Archived = field.ArchivedAt != null })
            .ToListAsync(cancellationToken);

        if (targeting.Count > 0)
        {
            var first = targeting[0];
            var others = targeting.Count - 1;
            return Results.Problem(
                title: "Type is in use",
                detail: $"{entityType.Name} can't be deleted because the field \"{first.Name}\"{ArchivedMark(first.Archived)} on {first.TypeName}"
                    + (others == 0 ? string.Empty : others == 1 ? " and 1 other field" : $" and {others} other fields")
                    + " can only link to it. Change those fields to allow another type first.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?>
                {
                    ["code"] = TypeTargetedCode,
                    ["fieldCount"] = targeting.Count,
                });
        }

        db.EntityTypes.Remove(entityType);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> AddFieldAsync(
        Guid universeId,
        Guid typeId,
        [FromBody] FieldDefinitionRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var entityType = await FindTypeAsync(db, universeId, typeId, cancellationToken);
        if (entityType is null)
        {
            return Results.NotFound();
        }

        if (LoreValidation.ValidateField(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        // One writer at a time from here (IMMEDIATE), so the target checked below cannot be deleted before the field that
        // names it is written: a type or group delete racing this one either sees the field or is seen as gone.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        if (await UnknownTargetAsync(db, universeId, request.TargetEntityTypeId, cancellationToken))
        {
            return UnknownTarget();
        }

        if (await UnknownGroupAsync(db, universeId, request.TargetGroupId, cancellationToken))
        {
            return UnknownGroup();
        }

        var name = request.Name!.Trim();

        if (await NameClashAsync(db, typeId, null, name, cancellationToken) is { } nameClash)
        {
            return FieldNameTaken(nameClash);
        }

        if (await SemanticClashAsync(db, typeId, null, request.Semantic, cancellationToken) is { } semanticClash)
        {
            return SemanticTaken(request.Semantic!.Value, semanticClash);
        }

        var order = request.DisplayOrder
            ?? await db.EntityFieldDefinitions.Where(field => field.EntityTypeId == typeId)
                .Select(field => (int?)field.DisplayOrder).MaxAsync(cancellationToken) + 1
            ?? 1;

        var definition = new EntityFieldDefinition
        {
            Id = Guid.NewGuid(),
            EntityTypeId = typeId,
            Name = name,
            Kind = request.Kind,
            Semantic = request.Semantic,
            IsRequired = request.IsRequired,
            DisplayOrder = order,
            DefaultValue = LoreValidation.Normalize(request.DefaultValue),
            TargetEntityTypeId = request.TargetEntityTypeId,
            TargetGroupId = request.TargetGroupId,
        };

        AddOptions(definition, request.Options);

        db.EntityFieldDefinitions.Add(definition);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return FieldNameTaken(archived: false);
        }

        await transaction.CommitAsync(cancellationToken);

        var types = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Ok(types.First(type => type.Id == typeId));
    }

    /// <summary>
    /// Gated, because this is where meaning is declared on a field that may already hold
    /// values. Pointing <c>DeathYear</c> at a number field a hundred Canon characters have
    /// filled in tells the chronology rules something new about every one of them at once,
    /// which is a straightforward way to introduce a High finding.
    ///
    /// Adding a field is not gated: a field that has just been created holds no values, so
    /// whatever it is declared to mean, there is nothing yet for a rule to read.
    /// </summary>
    private static async Task<IResult> UpdateFieldAsync(
        Guid universeId,
        Guid typeId,
        Guid fieldId,
        [FromBody] FieldDefinitionRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var entityType = await FindTypeAsync(db, universeId, typeId, cancellationToken);
        if (entityType is null)
        {
            return Results.NotFound();
        }

        return await gate.RunAsync(
            universeId,
            token => UpdateFieldCoreAsync(universeId, typeId, fieldId, request, db, token),
            cancellationToken);
    }

    private static async Task<IResult> UpdateFieldCoreAsync(
        Guid universeId,
        Guid typeId,
        Guid fieldId,
        FieldDefinitionRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var definition = await db.EntityFieldDefinitions
            .Include(field => field.Options)
            .FirstOrDefaultAsync(field => field.Id == fieldId && field.EntityTypeId == typeId, cancellationToken);

        if (definition is null)
        {
            return Results.NotFound();
        }

        // An archived field is kept exactly as it was archived, so its restore checks what was there. Editing it would be
        // editing something no form shows (Issue #39).
        if (definition.ArchivedAt is not null)
        {
            return Results.Problem(
                title: "Field is archived",
                detail: $"\"{definition.Name}\" is archived. Restore it before changing its settings.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = FieldArchivedCode });
        }

        if (LoreValidation.ValidateField(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var hasValues = await db.EntityFieldValues.AnyAsync(
            value => value.FieldDefinitionId == fieldId,
            cancellationToken);

        // Changing the kind would reinterpret every stored value, so it is refused while
        // any exist. Renaming and reordering stay safe.
        if (hasValues && definition.Kind != request.Kind)
        {
            return Results.Problem(
                title: "Field is in use",
                detail: "This field already holds values, so its type cannot change. "
                    + "Add a new field instead.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var name = request.Name!.Trim();

        if (!string.Equals(definition.Name, name, StringComparison.Ordinal)
            && await NameClashAsync(db, typeId, fieldId, name, cancellationToken) is { } nameClash)
        {
            return FieldNameTaken(nameClash);
        }

        if (await SemanticClashAsync(db, typeId, fieldId, request.Semantic, cancellationToken) is { } semanticClash)
        {
            return SemanticTaken(request.Semantic!.Value, semanticClash);
        }

        if (await UnknownTargetAsync(db, universeId, request.TargetEntityTypeId, cancellationToken))
        {
            return UnknownTarget();
        }

        if (await UnknownGroupAsync(db, universeId, request.TargetGroupId, cancellationToken))
        {
            return UnknownGroup();
        }

        // Narrowing a link field - from any type to one, from one type to another, or to a group - is refused while any entry
        // links it to an entry the new limit would not allow: nothing is cleared or rewritten behind the author's back.
        // Widening to any type is always safe.
        if (((request.TargetEntityTypeId is { } target && target != definition.TargetEntityTypeId)
                || (request.TargetGroupId is { } group && group != definition.TargetGroupId))
            && await TargetConflictAsync(db, fieldId, request.TargetEntityTypeId, request.TargetGroupId, cancellationToken) is { } conflict)
        {
            return conflict;
        }

        // Making a field required is refused while a live entry of the type has no value for it: the next save of each would
        // fail, so the author fills them in first. An entry in the Trash is not checked until it is back and saved again.
        if (request.IsRequired && !definition.IsRequired
            && await MissingRequiredAsync(db, typeId, fieldId, cancellationToken) is > 0 and var missing)
        {
            return RequiredMissing(definition.Name, await TypeNameAsync(db, typeId, cancellationToken), missing, restoring: false);
        }

        definition.Name = name;
        definition.TargetEntityTypeId = request.TargetEntityTypeId;
        definition.TargetGroupId = request.TargetGroupId;
        definition.Kind = request.Kind;

        // Meaning is metadata about the field, not about what is stored in it, so it may be
        // declared or withdrawn at any time - unlike the kind, which is frozen once values exist.
        definition.Semantic = request.Semantic;
        definition.IsRequired = request.IsRequired;
        definition.DisplayOrder = request.DisplayOrder ?? definition.DisplayOrder;
        definition.DefaultValue = LoreValidation.Normalize(request.DefaultValue);

        if (request.Options is not null)
        {
            var keep = new HashSet<string>(
                request.Options.Where(option => !string.IsNullOrWhiteSpace(option)).Select(option => option.Trim()),
                StringComparer.OrdinalIgnoreCase);

            // An option still chosen somewhere is kept, so removing it cannot quietly drop
            // an author's answer.
            foreach (var option in definition.Options.ToList())
            {
                if (keep.Contains(option.Value))
                {
                    continue;
                }

                var optionInUse = await db.EntityFieldValues.AnyAsync(
                    value => value.OptionId == option.Id,
                    cancellationToken);

                if (optionInUse)
                {
                    return Results.Problem(
                        title: "Option is in use",
                        detail: $"The option \"{option.Value}\" is chosen on at least one entity. "
                            + "Clear it there before removing the option.",
                        statusCode: StatusCodes.Status409Conflict);
                }

                definition.Options.Remove(option);
            }

            var existing = new HashSet<string>(
                definition.Options.Select(option => option.Value),
                StringComparer.OrdinalIgnoreCase);

            var order = 0;
            foreach (var value in keep)
            {
                order++;
                if (existing.Contains(value))
                {
                    continue;
                }

                // Added through the set, not the tracked collection: a new option arrives with its id already set, and EF
                // Core would take one found in the collection that way for an existing row and update nothing.
                db.EntityFieldOptions.Add(new EntityFieldOption
                {
                    Id = Guid.NewGuid(),
                    FieldDefinitionId = fieldId,
                    Value = value,
                    DisplayOrder = order,
                });
            }
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return FieldNameTaken(archived: false);
        }

        var types = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Ok(types.First(type => type.Id == typeId));
    }

    /// <summary>
    /// Permanent deletion, for a field that holds nothing (Issue #39). Refused while any entry - in Lore or in the Trash - has a
    /// value for it, whether the field is active or archived: archiving is the way to put a populated field away, and nothing
    /// here cascades into authored values. One writer at a time (IMMEDIATE), so an entry save that would add the first value
    /// either lands first and is counted, or waits until the field is gone and is then ignored like any unknown field.
    /// </summary>
    private static async Task<IResult> DeleteFieldAsync(
        Guid universeId,
        Guid typeId,
        Guid fieldId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var entityType = await FindTypeAsync(db, universeId, typeId, cancellationToken);
        if (entityType is null)
        {
            return Results.NotFound();
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var definition = await db.EntityFieldDefinitions
            .FirstOrDefaultAsync(field => field.Id == fieldId && field.EntityTypeId == typeId, cancellationToken);

        if (definition is null)
        {
            return Results.NotFound();
        }

        var holders = await db.EntityFieldValues.AsNoTracking()
            .Where(value => value.FieldDefinitionId == fieldId)
            .Select(value => new { value.EntityId, Trashed = value.Entity!.DeletedAt != null })
            .Distinct()
            .ToListAsync(cancellationToken);

        if (holders.Count > 0)
        {
            var trashed = holders.Count(holder => holder.Trashed);
            return Results.Problem(
                title: "Field is in use",
                detail: FieldInUseDetail(holders.Count, trashed),
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?>
                {
                    ["code"] = FieldInUseCode,
                    ["entryCount"] = holders.Count,
                    ["trashedCount"] = trashed,
                });
        }

        db.EntityFieldDefinitions.Remove(definition);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>Why a field holding values cannot be deleted, in the author's terms. Mirrored by the Types screen.</summary>
    internal static string FieldInUseDetail(int entries, int trashed)
    {
        var where = trashed == 0
            ? string.Empty
            : trashed == entries
                ? entries == 1 ? ", and it is in the Trash" : ", all of them in the Trash"
                : $", {trashed} of them in the Trash";
        var holds = entries == 1 ? "a value in 1 entry" : $"values in {entries} entries";
        return $"This field contains {holds}{where}. Archive it to hide it without losing its data.";
    }

    /// <summary>
    /// Archives a field (Issue #39): it leaves entry forms, entry reads, filters and required checks, and every Canon and
    /// timeline reading, and keeps everything - definition, id, options, meaning, target, required flag, and every value in
    /// Lore and in the Trash. Nothing is cleared, moved or rewritten, so restoring it is the same field with the same data.
    ///
    /// Reconciled, not gated: archiving only takes facts away from the rules (a birth year, a link), so it can close findings
    /// and never open one. Archiving an archived field is the same field back, unchanged.
    /// </summary>
    private static async Task<IResult> ArchiveFieldAsync(
        Guid universeId,
        Guid typeId,
        Guid fieldId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await FindTypeAsync(db, universeId, typeId, cancellationToken) is null)
        {
            return Results.NotFound();
        }

        return await canon.RecordAsync(
            universeId,
            async token =>
            {
                var definition = await db.EntityFieldDefinitions
                    .FirstOrDefaultAsync(field => field.Id == fieldId && field.EntityTypeId == typeId, token);

                if (definition is null)
                {
                    return Results.NotFound();
                }

                if (definition.ArchivedAt is null)
                {
                    definition.ArchivedAt = DateTime.UtcNow;
                    await db.SaveChangesAsync(token);
                    await InvalidateOpenFormsAsync(db, fieldId, token);
                }

                var types = await LoadTypesAsync(db, universeId, token);
                return Results.Ok(types.First(type => type.Id == typeId));
            },
            cancellationToken);
    }

    /// <summary>
    /// Restores an archived field (Issue #39): the same definition, id, options, meaning and target, with every value it kept.
    /// Checked first, inside the gate's transaction: its links must still fit its limit (they always should - every retype and
    /// group change counts them - but a restore never takes that on trust), and a required field comes back required only
    /// when no live entry of its type is missing a value. Otherwise the 409 says how many are, and the author may restore it
    /// as optional instead - explicitly, with <see cref="FieldRestoreRequest.AsOptional"/>; it is never relaxed silently. No
    /// limit is widened and no value is cleared to make a restore succeed.
    ///
    /// Gated, because a restored birth year or link is read by the Canon rules again, and that can open a High finding. A
    /// restore that would is refused like any gated write. Restoring an active field is the same field back, unchanged.
    /// </summary>
    private static async Task<IResult> RestoreFieldAsync(
        Guid universeId,
        Guid typeId,
        Guid fieldId,
        [FromBody] FieldRestoreRequest? request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await FindTypeAsync(db, universeId, typeId, cancellationToken) is not { } entityType)
        {
            return Results.NotFound();
        }

        var asOptional = request?.AsOptional == true;

        return await gate.RunAsync(
            universeId,
            async token =>
            {
                var definition = await db.EntityFieldDefinitions
                    .FirstOrDefaultAsync(field => field.Id == fieldId && field.EntityTypeId == typeId, token);

                if (definition is null)
                {
                    return Results.NotFound();
                }

                if (definition.ArchivedAt is not null)
                {
                    if (await TargetConflictAsync(db, fieldId, definition.TargetEntityTypeId, definition.TargetGroupId, token) is { } conflict)
                    {
                        return conflict;
                    }

                    if (definition.IsRequired && !asOptional
                        && await MissingRequiredAsync(db, typeId, fieldId, token) is > 0 and var missing)
                    {
                        return RequiredMissing(definition.Name, entityType.Name, missing, restoring: true);
                    }

                    if (asOptional)
                    {
                        definition.IsRequired = false;
                    }

                    definition.ArchivedAt = null;
                    await db.SaveChangesAsync(token);
                    await InvalidateOpenFormsAsync(db, fieldId, token);
                }

                var types = await LoadTypesAsync(db, universeId, token);
                return Results.Ok(types.First(type => type.Id == typeId));
            },
            cancellationToken);
    }

    /// <summary>
    /// Moves on the edit version (ADR 0043) of every entry - Trash included - holding a value for the field, when it is archived
    /// or restored. A form opened before the change, or a suggestion made over the old version, is then refused as stale
    /// rather than saved over a field set it never showed. This is what keeps a restore safe: a form opened while the field was
    /// archived does not carry it, and saving that form after the restore would otherwise remove the values the restore
    /// brought back. Entries with no value for the field have nothing such a save could lose.
    /// </summary>
    private static Task<int> InvalidateOpenFormsAsync(LorexDbContext db, Guid fieldId, CancellationToken cancellationToken) =>
        db.Entities
            .Where(entity => entity.FieldValues.Any(value => value.FieldDefinitionId == fieldId))
            .ExecuteUpdateAsync(setters => setters.SetProperty(entity => entity.Version, entity => entity.Version + 1), cancellationToken);

    /// <summary>How many live entries of the type have no value for the field: what making it required would leave invalid.</summary>
    private static Task<int> MissingRequiredAsync(LorexDbContext db, Guid typeId, Guid fieldId, CancellationToken cancellationToken) =>
        db.Entities.CountAsync(
            entity => entity.EntityTypeId == typeId
                && entity.DeletedAt == null
                && !entity.FieldValues.Any(value => value.FieldDefinitionId == fieldId),
            cancellationToken);

    private static Task<string> TypeNameAsync(LorexDbContext db, Guid typeId, CancellationToken cancellationToken) =>
        db.EntityTypes.Where(type => type.Id == typeId).Select(type => type.Name).SingleAsync(cancellationToken);

    private static IResult RequiredMissing(string fieldName, string typeName, int missing, bool restoring)
    {
        var entries = missing == 1 ? $"1 {typeName} entry has" : $"{missing} {typeName} entries have";
        var extensions = new Dictionary<string, object?> { ["code"] = RequiredMissingCode, ["missingCount"] = missing };
        if (restoring)
        {
            extensions["canRestoreOptional"] = true;
        }

        return Results.Problem(
            title: restoring ? "Field can't come back as required" : "Field can't be required yet",
            detail: restoring
                ? $"{entries} no {fieldName}, so it can't come back as required. Restore it as optional, fill those in, then make it required again."
                : $"{entries} no {fieldName} yet, so it can't be required. Fill it in on those entries first, or keep it optional.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: extensions);
    }

    /// <summary>
    /// The 409 for a link field limited to <paramref name="targetType"/> or <paramref name="targetGroup"/> while any of its
    /// stored links - the Trash included, since those values come back with their entries - points at an entry the limit
    /// would not allow; null when every link fits, or for no limit. Group membership is read as it is now, inside the caller's
    /// transaction, so a retype or a membership change cannot slip between. Shared by an edit that narrows a field and a restore.
    /// </summary>
    private static async Task<IResult?> TargetConflictAsync(
        LorexDbContext db,
        Guid fieldId,
        Guid? targetType,
        Guid? targetGroup,
        CancellationToken cancellationToken)
    {
        if (targetType is { } type
            && await db.EntityFieldValues.AnyAsync(
                value => value.FieldDefinitionId == fieldId
                    && value.ReferencedEntityId != null
                    && value.ReferencedEntity!.EntityTypeId != type,
                cancellationToken))
        {
            return Results.Problem(
                title: "Field is in use",
                detail: "Some entries link this field to entries of another type. "
                    + "Change those links first, then limit the field to this type.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = TargetConflictCode });
        }

        if (targetGroup is { } group
            && await db.EntityFieldValues.AnyAsync(
                value => value.FieldDefinitionId == fieldId
                    && value.ReferencedEntityId != null
                    && !db.EntityTypeGroupMembers.Any(member =>
                        member.EntityTypeGroupId == group && member.EntityTypeId == value.ReferencedEntity!.EntityTypeId),
                cancellationToken))
        {
            return Results.Problem(
                title: "Field is in use",
                detail: "Some entries link this field to entries whose type is not in that group. "
                    + "Change those links, or add their types to the group, then limit the field to it.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = TargetConflictCode });
        }

        return null;
    }

    /// <summary>" (archived)" after a field's quoted name in a refusal, so the author knows to look among the archived fields.</summary>
    internal static string ArchivedMark(bool archived) => archived ? " (archived)" : string.Empty;

    // ---------- Helpers ----------

    /// <summary>The type, tracked, found by its id and its universe together. The caller has passed the universe gate.</summary>
    private static async Task<EntityType?> FindTypeAsync(
        LorexDbContext db,
        Guid universeId,
        Guid typeId,
        CancellationToken cancellationToken) =>
        await db.EntityTypes
            .FirstOrDefaultAsync(type => type.Id == typeId && type.UniverseId == universeId, cancellationToken);

    private static void AddOptions(EntityFieldDefinition definition, IReadOnlyList<string>? options)
    {
        if (options is null)
        {
            return;
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var order = 0;

        foreach (var raw in options)
        {
            var value = raw?.Trim();
            if (string.IsNullOrWhiteSpace(value) || !seen.Add(value))
            {
                continue;
            }

            order++;
            definition.Options.Add(new EntityFieldOption
            {
                Id = Guid.NewGuid(),
                FieldDefinitionId = definition.Id,
                Value = value,
                DisplayOrder = order,
            });
        }
    }

    /// <summary>
    /// One field as the types list reads it, active or archived, with how many entries hold a value for it and how many of
    /// those are in the Trash - what decides whether it can be deleted, and what an archived field still keeps.
    /// </summary>
    private static readonly Expression<Func<EntityFieldDefinition, FieldDefinitionResponse>> ToFieldResponse =
        field => new FieldDefinitionResponse(
            field.Id,
            field.Name,
            field.Kind,
            field.IsRequired,
            field.DisplayOrder,
            field.DefaultValue,
            field.Options
                .OrderBy(option => option.DisplayOrder)
                .Select(option => new FieldOptionResponse(option.Id, option.Value, option.DisplayOrder))
                .ToList(),
            field.Semantic,
            field.TargetEntityTypeId,
            field.TargetGroupId,
            field.ArchivedAt,
            field.Values.Select(value => value.EntityId).Distinct().Count(),
            field.Values.Where(value => value.Entity!.DeletedAt != null).Select(value => value.EntityId).Distinct().Count());

    internal static async Task<List<EntityTypeResponse>> LoadTypesAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var familyTree = FamilyTreeEligibility.TypeIds(db, universeId);

        return EntityTypeHierarchy.Preorder(
            await db.EntityTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .Select(type => new EntityTypeResponse(
                type.Id,
                type.Name,
                type.Description,
                type.Icon,
                type.AccentColor,
                type.DisplayOrder,
                db.Entities.Count(entity => entity.EntityTypeId == type.Id),
                db.Entities.Count(entity => entity.EntityTypeId == type.Id && entity.DeletedAt != null),
                type.Fields.AsQueryable()
                    .Where(field => field.ArchivedAt == null)
                    .OrderBy(field => field.DisplayOrder)
                    .ThenBy(field => field.Name)
                    .Select(ToFieldResponse)
                    .ToList(),
                type.FamilyTreeEligible,
                type.ParentId,
                familyTree.Contains(type.Id),
                type.Fields.AsQueryable()
                    .Where(field => field.ArchivedAt != null)
                    .OrderBy(field => field.DisplayOrder)
                    .ThenBy(field => field.Name)
                    .Select(ToFieldResponse)
                    .ToList()))
            .ToListAsync(cancellationToken),
            type => type.Id,
            type => type.ParentId,
            type => type.DisplayOrder,
            type => type.Name);
    }

    private static IResult NameTaken() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = ["This universe already has a type with that name."],
        });

    /// <summary>
    /// Whether some other field on this type already claims that meaning - null when none does, else whether that field is
    /// archived. Checked here so the author gets a readable error rather than a unique-index violation, and enforced again by
    /// the index so a race cannot leave a rule with two birth years to choose from. An archived field keeps its meaning, so it
    /// still holds it (Issue #39): restoring it can then never meet a second birth year.
    /// </summary>
    private static async Task<bool?> SemanticClashAsync(
        LorexDbContext db,
        Guid typeId,
        Guid? excludingFieldId,
        EntityFieldSemantic? semantic,
        CancellationToken cancellationToken) =>
        semantic is { } value
            ? await db.EntityFieldDefinitions
                .Where(field => field.EntityTypeId == typeId && field.Semantic == value && field.Id != excludingFieldId)
                .Select(field => (bool?)(field.ArchivedAt != null))
                .FirstOrDefaultAsync(cancellationToken)
            : null;

    private static IResult SemanticTaken(EntityFieldSemantic semantic, bool archived) =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["semantic"] = [
                archived
                    ? $"An archived field on this type is already {LoreValidation.SemanticWord(semantic)}. "
                        + "Only one field may mean it. Restore that field, or choose no meaning here."
                    : $"Another field on this type is already {LoreValidation.SemanticWord(semantic)}. "
                        + "Only one field may mean it."],
        });

    /// <summary>
    /// Whether another field on this type already has the name - null when none does, else whether that field is archived. An
    /// archived field keeps its name, so a restore can never meet a twin.
    /// </summary>
    private static Task<bool?> NameClashAsync(
        LorexDbContext db,
        Guid typeId,
        Guid? excludingFieldId,
        string name,
        CancellationToken cancellationToken) =>
        db.EntityFieldDefinitions
            .Where(field => field.EntityTypeId == typeId && field.Name == name && field.Id != excludingFieldId)
            .Select(field => (bool?)(field.ArchivedAt != null))
            .FirstOrDefaultAsync(cancellationToken);

    private static IResult FieldNameTaken(bool archived) =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = [
                archived
                    ? "An archived field on this type already has that name. Restore it, or choose another name."
                    : "This type already has a field with that name."],
        });

    /// <summary>
    /// Whether a link field names a type that is not this universe's. One answer for a type that does not exist and one
    /// that belongs to another universe, so neither can be told apart.
    /// </summary>
    private static async Task<bool> UnknownTargetAsync(
        LorexDbContext db,
        Guid universeId,
        Guid? target,
        CancellationToken cancellationToken) =>
        target is { } typeId
        && !await db.EntityTypes.AnyAsync(type => type.Id == typeId && type.UniverseId == universeId, cancellationToken);

    /// <summary>Whether a link field names a group that is not this universe's; the same answer for missing and foreign.</summary>
    private static async Task<bool> UnknownGroupAsync(
        LorexDbContext db,
        Guid universeId,
        Guid? target,
        CancellationToken cancellationToken) =>
        target is { } groupId
        && !await db.EntityTypeGroups.AnyAsync(group => group.Id == groupId && group.UniverseId == universeId, cancellationToken);

    private static IResult UnknownGroup() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["targetGroupId"] = ["Choose a group from this universe, or any Lore type."],
        });

    private static IResult UnknownTarget() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["targetEntityTypeId"] = ["Choose a type from this universe, or any Lore type."],
        });
}
