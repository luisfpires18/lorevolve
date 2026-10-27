using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Relationships;

/// <summary>
/// Relationship types, which are universe-scoped and entirely authored. Every route proves
/// universe ownership first, and the type id from the path is re-resolved inside that
/// universe, so an id from elsewhere reads as absent.
/// </summary>
public static class RelationshipTypeEndpoints
{
    public static IEndpointRouteBuilder MapRelationshipTypeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/relationship-types")
            .WithTags("Relationship types")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListRelationshipTypes");
        group.MapPost("/", CreateAsync).WithName("CreateRelationshipType");
        group.MapPut("/{typeId:guid}", UpdateAsync).WithName("UpdateRelationshipType");
        group.MapDelete("/{typeId:guid}", DeleteAsync).WithName("DeleteRelationshipType");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return Results.Ok(await LoadTypesAsync(db, universeId, cancellationToken));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] RelationshipTypeRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CreateCoreAsync(db, universeId, request, cancellationToken);
    }

    /// <summary>A kind's create after the caller's access check: the route's, and an approved AI change's (ADR 0062). Answers 201.</summary>
    internal static async Task<IResult> CreateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        RelationshipTypeRequest request,
        CancellationToken cancellationToken)
    {
        var constraints = request.CanonConstraints ?? RelationshipTypeCanonConstraints.None;
        var familySemantic = request.FamilySemantic ?? RelationshipFamilySemantic.None;

        if (RelationshipValidation.ValidateType(request, constraints, familySemantic) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        if (await db.RelationshipTypes.AnyAsync(
                type => type.UniverseId == universeId && type.Name == name,
                cancellationToken))
        {
            return NameTaken();
        }

        var now = DateTime.UtcNow;
        var order = request.DisplayOrder
            ?? await db.RelationshipTypes.Where(type => type.UniverseId == universeId)
                .Select(type => (int?)type.DisplayOrder).MaxAsync(cancellationToken) + 1
            ?? 1;

        var relationshipType = new RelationshipType
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Name = name,
            InverseName = request.IsSymmetric ? null : RelationshipValidation.Normalize(request.InverseName),
            IsSymmetric = request.IsSymmetric,
            Description = RelationshipValidation.Normalize(request.Description),
            DisplayOrder = order,
            AgeOrder = constraints.AgeOrder,
            MinAgeDifferenceYears = constraints.MinAgeDifferenceYears,
            MaxAgeDifferenceYears = constraints.MaxAgeDifferenceYears,
            FamilySemantic = familySemantic,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.RelationshipTypes.Add(relationshipType);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTaken();
        }

        var types = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Created(
            $"/api/universes/{universeId}/relationship-types/{relationshipType.Id}",
            types.First(type => type.Id == relationshipType.Id));
    }

    /// <summary>
    /// Reconciled but not gated, for two reasons worth writing down.
    ///
    /// <c>CANON-REL-001</c> reads this type's name into the sentence it stores, while its
    /// fingerprint is the relationship and the offending endpoint - so a rename rewords an
    /// existing conflict in place and cannot open, close or duplicate one. <c>CANON-REL-002</c> and
    /// <c>CANON-REL-003</c> read this type's Canon constraints, so changing one can open or resolve
    /// conflicts on every relationship of this type at once. <c>CANON-FAMILY-001</c> reads this type's family meaning, so giving
    /// one or taking it away can open or close an ancestry circle across every link of the type (ADR 0035). Either way the
    /// conflict table has to say so when the write lands, not whenever somebody next asks for an evaluation.
    ///
    /// Nothing is refused, on purpose. A constraint changes the rule being checked, never a fact:
    /// the years and the links are exactly what they were, and reporting what they now contradict is
    /// the whole job of Canon Integrity. Contrast a chronology change, which re-places dated facts
    /// and is gated. All three rules are Medium in any case, so there is nothing a gate could refuse
    /// (ADR 0012, ADR 0023).
    ///
    /// Creating a type is not covered: a type with no relationships on it is read by nothing.
    /// Deleting one is refused outright while it is in use, so it cannot change a finding either.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid typeId,
        [FromBody] RelationshipTypeRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var relationshipType = await FindTypeAsync(db, universeId, typeId, cancellationToken);
        if (relationshipType is null)
        {
            return Results.NotFound();
        }

        return await canon.RecordAsync(
            universeId,
            token => UpdateCoreAsync(universeId, typeId, request, relationshipType, db, token),
            cancellationToken);
    }

    /// <summary>A kind's edit inside the caller's reconciling transaction: an approved AI change's (ADR 0062), under the gate.</summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid typeId,
        RelationshipTypeRequest request,
        CancellationToken cancellationToken) =>
        await FindTypeAsync(db, universeId, typeId, cancellationToken) is { } relationshipType
            ? await UpdateCoreAsync(universeId, typeId, request, relationshipType, db, cancellationToken)
            : Results.NotFound();

    private static async Task<IResult> UpdateCoreAsync(
        Guid universeId,
        Guid typeId,
        RelationshipTypeRequest request,
        RelationshipType relationshipType,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var constraints = request.CanonConstraints ?? RelationshipTypeCanonConstraints.Of(relationshipType);
        var familySemantic = request.FamilySemantic ?? relationshipType.FamilySemantic;

        if (RelationshipValidation.ValidateType(request, constraints, familySemantic) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        if (!string.Equals(relationshipType.Name, name, StringComparison.Ordinal)
            && await db.RelationshipTypes.AnyAsync(
                other => other.UniverseId == universeId && other.Name == name && other.Id != typeId,
                cancellationToken))
        {
            return NameTaken();
        }

        relationshipType.Name = name;
        relationshipType.IsSymmetric = request.IsSymmetric;
        relationshipType.InverseName =
            request.IsSymmetric ? null : RelationshipValidation.Normalize(request.InverseName);
        relationshipType.Description = RelationshipValidation.Normalize(request.Description);
        relationshipType.DisplayOrder = request.DisplayOrder ?? relationshipType.DisplayOrder;
        relationshipType.AgeOrder = constraints.AgeOrder;
        relationshipType.MinAgeDifferenceYears = constraints.MinAgeDifferenceYears;
        relationshipType.MaxAgeDifferenceYears = constraints.MaxAgeDifferenceYears;
        relationshipType.FamilySemantic = familySemantic;
        relationshipType.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTaken();
        }

        var types = await LoadTypesAsync(db, universeId, cancellationToken);
        return Results.Ok(types.First(type => type.Id == typeId));
    }

    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid typeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var relationshipType = await FindTypeAsync(db, universeId, typeId, cancellationToken);
        if (relationshipType is null)
        {
            return Results.NotFound();
        }

        // Deleting a type in use would erase the links it describes, so it is refused until
        // the author clears them deliberately. A link in the Trash still uses its type - it comes
        // back with it - so it counts until it is erased from the Trash (ADR 0048).
        var inUse = await db.Relationships.CountAsync(
            relationship => relationship.RelationshipTypeId == typeId,
            cancellationToken);

        if (inUse > 0)
        {
            var trashed = await db.Relationships.CountAsync(
                relationship => relationship.RelationshipTypeId == typeId && relationship.DeletedAt != null,
                cancellationToken);
            var where = trashed == 0
                ? string.Empty
                : trashed == inUse
                    ? inUse == 1 ? ", and it is in the Trash" : ", all of them in the Trash"
                    : $", {trashed} of them in the Trash";

            return Results.Problem(
                title: "Relationship type is in use",
                detail: (inUse == 1
                    ? $"1 relationship still uses this type{where}. Delete it first"
                    : $"{inUse} relationships still use this type{where}. Delete them first")
                    + (trashed == 0 ? "." : ", and erase what is in the Trash."),
                statusCode: StatusCodes.Status409Conflict);
        }

        db.RelationshipTypes.Remove(relationshipType);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    // ---------- Helpers ----------

    /// <summary>The type, tracked, found by its id and its universe together. The caller has passed the universe gate.</summary>
    private static async Task<RelationshipType?> FindTypeAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid typeId,
        CancellationToken cancellationToken) =>
        await db.RelationshipTypes.FirstOrDefaultAsync(
            type => type.Id == typeId && type.UniverseId == universeId,
            cancellationToken);

    private static async Task<List<RelationshipTypeResponse>> LoadTypesAsync(
        LorEvolveDbContext db,
        Guid universeId,
        CancellationToken cancellationToken) =>
        await db.RelationshipTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .OrderBy(type => type.DisplayOrder)
            .ThenBy(type => type.Name)
            .Select(type => new RelationshipTypeResponse(
                type.Id,
                type.Name,
                type.InverseName,
                type.IsSymmetric,
                type.Description,
                type.DisplayOrder,
                db.Relationships.Count(relationship => relationship.RelationshipTypeId == type.Id),
                new RelationshipTypeCanonConstraints(
                    type.AgeOrder,
                    type.MinAgeDifferenceYears,
                    type.MaxAgeDifferenceYears),
                type.FamilySemantic))
            .ToListAsync(cancellationToken);

    private static IResult NameTaken() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = ["This universe already has a relationship type with that name."],
        });
}
