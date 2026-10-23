using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Relationships;

/// <summary>
/// Relationships between entities. One row per link: the reverse reading is derived at read
/// time from the relationship type, never stored as a second row. Every route proves
/// universe ownership first, then re-resolves every client id inside that universe, so no
/// id crosses a universe boundary and nothing another owner holds is ever disclosed.
///
/// These writes are reconciled but not gated, which is the distinction Phase 014 turns on.
/// The rules that read relationships are all Medium: <c>CANON-REL-001</c>, because a Canon link
/// resting on a draft endpoint is a loose end rather than an impossibility, and
/// <c>CANON-REL-002</c> and <c>CANON-REL-003</c>, because a breached age constraint is a breach of
/// a rule the author configured, which Lorex cannot tell from a law of the world (ADR 0023). The
/// three High rules read declared years and Canon moments, neither of which a relationship can
/// touch. So no relationship write can introduce a High finding and there is nothing here to
/// refuse; gating anyway would sweep the rules a second time per write to prove an empty set. The
/// moment a High rule does read a relationship - exclusivity overlap is the obvious candidate,
/// and it needs schema that does not exist yet - these routes swap <c>RecordAsync</c> for
/// <c>RunAsync</c> and nothing else changes.
///
/// Reconciling is a separate question from gating, and the answer here is yes: a Medium
/// finding is still a finding, and the conflict table has to describe the relationship that
/// was just written rather than the one that was there before.
///
/// One link is stored once. A create or an edit that would leave two rows saying the same thing is
/// refused as 409 <c>relationship_already_exists</c> - see <see cref="FindDuplicateAsync"/> for what
/// "the same thing" is. It is enforced here rather than by a unique index, because every database
/// written before this rule existed may already hold duplicates an author authored, and no migration
/// of ours is going to delete those to make an index fit. So this route is the rule, and it is the
/// only way a relationship is ever created: the entry's Relations view and the family tree's Add
/// connection both post here, and a restore deliberately does not, so a backup written before the
/// rule still restores exactly as it always did.
///
/// What that costs, and it is the whole cost: two creates racing each other can both read no
/// duplicate and both write. SQLite takes one writer at a time, so the window is the gap between this
/// read and that write, on a database one person is authoring into. A duplicate that does land is a
/// stored row like any other - shown, editable, removable, and drawn once by a family tree.
/// </summary>
public static class RelationshipEndpoints
{
    /// <summary>The refusal an exact duplicate gets, so a client can tell it from any other conflict.</summary>
    public const string DuplicateCode = "relationship_already_exists";

    public static IEndpointRouteBuilder MapRelationshipEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/relationships")
            .WithTags("Relationships")
            .RequireAuthorization();

        group.MapGet("/{relationshipId:guid}", GetAsync).WithName("GetRelationship");
        group.MapPost("/", CreateAsync).WithName("CreateRelationship");
        group.MapPut("/{relationshipId:guid}", UpdateAsync).WithName("UpdateRelationship");
        group.MapDelete("/{relationshipId:guid}", DeleteAsync).WithName("DeleteRelationship");

        endpoints.MapGet(
                "/api/universes/{universeId:guid}/entities/{entityId:guid}/relationships",
                ListForEntityAsync)
            .WithTags("Relationships")
            .WithName("ListEntityRelationships")
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> ListForEntityAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var entityExists = await db.Entities.AnyAsync(
            entity => entity.Id == entityId
                && entity.UniverseId == universeId
                && entity.DeletedAt == null,
            cancellationToken);

        if (!entityExists)
        {
            return Results.NotFound();
        }

        return Results.Ok(await LoadForEntityAsync(db, universeId, entityId, cancellationToken));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid relationshipId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var detail = await LoadDetailAsync(db, universeId, relationshipId, cancellationToken);

        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] RelationshipRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await canon.RecordAsync(
            universeId,
            token => CreateCoreAsync(universeId, request, db, token),
            cancellationToken);
    }

    internal static async Task<IResult> CreateCoreAsync(
        Guid universeId,
        RelationshipRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (RelationshipValidation.ValidateRelationship(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await ResolveReferencesAsync(db, universeId, request, cancellationToken) is { } unresolved)
        {
            return Results.ValidationProblem(unresolved);
        }

        if (await FindDuplicateAsync(db, universeId, request, null, cancellationToken) is { } existing)
        {
            return AlreadyExists(existing);
        }

        var now = DateTime.UtcNow;
        var relationship = new LoreRelationship
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            RelationshipTypeId = request.RelationshipTypeId,
            SourceEntityId = request.SourceEntityId,
            TargetEntityId = request.TargetEntityId,
            CanonStatus = request.CanonStatus,
            StartDate = RelationshipValidation.Utc(request.StartDate),
            EndDate = RelationshipValidation.Utc(request.EndDate),
            Notes = RelationshipValidation.Normalize(request.Notes),
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Relationships.Add(relationship);
        await db.SaveChangesAsync(cancellationToken);

        var detail = await LoadDetailAsync(db, universeId, relationship.Id, cancellationToken);
        return Results.Created(
            $"/api/universes/{universeId}/relationships/{relationship.Id}",
            detail);
    }

    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid relationshipId,
        [FromBody] RelationshipRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await canon.RecordAsync(
            universeId,
            token => UpdateCoreAsync(universeId, relationshipId, request, db, token),
            cancellationToken);
    }

    internal static async Task<IResult> UpdateCoreAsync(
        Guid universeId,
        Guid relationshipId,
        RelationshipRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        // Hidden means unreachable, for writes as well as reads. A link waiting on a trashed
        // end is not the author's to edit until they decide what to do with that end.
        var relationship = await FindLiveAsync(db, universeId, relationshipId, cancellationToken);

        if (relationship is null)
        {
            return Results.NotFound();
        }

        if (RelationshipValidation.ValidateRelationship(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await ResolveReferencesAsync(db, universeId, request, cancellationToken) is { } unresolved)
        {
            return Results.ValidationProblem(unresolved);
        }

        // An edit can arrive at a link that is already stored just as surely as a create can - re-point one
        // end, or change the kind, and it becomes a copy of its neighbour. Same rule, same refusal, and this
        // row is not its own duplicate.
        if (await FindDuplicateAsync(db, universeId, request, relationshipId, cancellationToken) is { } existing)
        {
            return AlreadyExists(existing);
        }

        relationship.RelationshipTypeId = request.RelationshipTypeId;
        relationship.SourceEntityId = request.SourceEntityId;
        relationship.TargetEntityId = request.TargetEntityId;
        relationship.CanonStatus = request.CanonStatus;
        relationship.StartDate = RelationshipValidation.Utc(request.StartDate);
        relationship.EndDate = RelationshipValidation.Utc(request.EndDate);
        relationship.Notes = RelationshipValidation.Normalize(request.Notes);
        relationship.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        var detail = await LoadDetailAsync(db, universeId, relationship.Id, cancellationToken);
        return Results.Ok(detail);
    }

    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid relationshipId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await canon.RecordAsync(
            universeId,
            token => DeleteCoreAsync(universeId, relationshipId, db, token),
            cancellationToken);
    }

    private static async Task<IResult> DeleteCoreAsync(
        Guid universeId,
        Guid relationshipId,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        // A link with an end in the Trash is not deletable either. Letting one go here would
        // destroy dependent lore on the author's behalf for a link they cannot even see.
        var relationship = await FindLiveAsync(db, universeId, relationshipId, cancellationToken);

        if (relationship is null)
        {
            return Results.NotFound();
        }

        // One row holds both readings, so removing it clears the link from either end.
        db.Relationships.Remove(relationship);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// One relationship, only while both of its ends are live. Every read hides a link whose
    /// endpoint is in the Trash, so every write refuses the same one.
    /// </summary>
    private static Task<LoreRelationship?> FindLiveAsync(
        LorexDbContext db,
        Guid universeId,
        Guid relationshipId,
        CancellationToken cancellationToken) =>
        db.Relationships.FirstOrDefaultAsync(
            candidate => candidate.Id == relationshipId
                && candidate.UniverseId == universeId
                && candidate.SourceEntity!.DeletedAt == null
                && candidate.TargetEntity!.DeletedAt == null,
            cancellationToken);

    // ---------- Duplicates ----------

    /// <summary>
    /// The link this request would be a second copy of, if there is one.
    /// </summary>
    /// <remarks>
    /// A relationship is the same relationship as another when it is the same kind between the same two ends,
    /// the same way round: <c>UniverseId</c>, <c>RelationshipTypeId</c>, <c>SourceEntityId</c>,
    /// <c>TargetEntityId</c>. That is the whole of its identity, and it is read from ids alone - never from a
    /// kind's wording, which means nothing here as it means nothing to a family tree or an age order.
    ///
    /// Everything else a link carries describes that one link rather than distinguishing it. Its Canon status
    /// is how settled it is, and one link cannot be both settled and not. Its notes are what is worth
    /// remembering about it, and the same connection recorded twice with different notes is one connection
    /// whose notes were split in half. Its dates are the span it held, and a link that resumed is an edit to
    /// that span, not a second edge - which is also why the dates are deliberately out of the key: leaving
    /// them in would let the very duplicate this exists to refuse through, by typing a date into one of them.
    ///
    /// Two links between the same pair stay perfectly legal when anything in that key differs: a different
    /// kind ("adoptive parent" beside "biological parent", "commander of" beside "member of"), or the other
    /// direction for a kind where direction means something. The one place direction does not mean anything
    /// is a symmetric kind, whose two readings are the same sentence and which is stored once for exactly
    /// that reason (ADR 0008) - so for one of those, the reversed pair is the same link and is refused too.
    ///
    /// Scoped to the universe the caller has already been proved to own, so a tuple stored in another
    /// universe - or another account's - is not a conflict here and its existence is never disclosed.
    /// </remarks>
    internal static async Task<Guid?> FindDuplicateAsync(
        LorexDbContext db,
        Guid universeId,
        RelationshipRequest request,
        Guid? excluding,
        CancellationToken cancellationToken) =>
        await db.Relationships.AsNoTracking()
            .Where(candidate => candidate.UniverseId == universeId
                && candidate.RelationshipTypeId == request.RelationshipTypeId
                && (excluding == null || candidate.Id != excluding)
                && ((candidate.SourceEntityId == request.SourceEntityId
                        && candidate.TargetEntityId == request.TargetEntityId)
                    || (candidate.RelationshipType!.IsSymmetric
                        && candidate.SourceEntityId == request.TargetEntityId
                        && candidate.TargetEntityId == request.SourceEntityId)))
            .OrderBy(candidate => candidate.CreatedAt)
            .Select(candidate => (Guid?)candidate.Id)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>
    /// The refusal for a link that is already stored. It names the link that is there, so a client can offer
    /// to open the one the author meant rather than only saying no.
    /// </summary>
    private static IResult AlreadyExists(Guid relationshipId) =>
        Results.Problem(
            title: "Relationship already exists",
            detail: "This relationship already exists. Edit the one that is already there, "
                + "or choose a different connection.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = DuplicateCode,
                ["relationshipId"] = relationshipId,
            });

    // ---------- Ownership ----------

    /// <summary>
    /// Re-resolves the type and both entities inside this universe. An id that belongs to
    /// another universe is reported as an unusable choice rather than as someone else's
    /// row, so the response discloses nothing about it.
    /// </summary>
    private static async Task<Dictionary<string, string[]>?> ResolveReferencesAsync(
        LorexDbContext db,
        Guid universeId,
        RelationshipRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        var typeExists = await db.RelationshipTypes.AnyAsync(
            type => type.Id == request.RelationshipTypeId && type.UniverseId == universeId,
            cancellationToken);

        if (!typeExists)
        {
            errors["relationshipTypeId"] = ["Choose a relationship type from this universe."];
        }

        // Trashed entries are not choosable. Nothing round-trips a relationship, so refusing
        // one here cannot destroy an existing link - it only stops a new one being authored
        // against lore that is not in the world.
        var resolvedEntities = await db.Entities
            .Where(entity => entity.UniverseId == universeId
                && entity.DeletedAt == null
                && (entity.Id == request.SourceEntityId || entity.Id == request.TargetEntityId))
            .Select(entity => entity.Id)
            .ToListAsync(cancellationToken);

        if (!resolvedEntities.Contains(request.SourceEntityId))
        {
            errors["sourceEntityId"] = ["Choose an entry from this universe."];
        }

        if (!resolvedEntities.Contains(request.TargetEntityId))
        {
            errors["targetEntityId"] = ["Choose an entry from this universe."];
        }

        return errors.Count == 0 ? null : errors;
    }

    // ---------- Reading ----------

    private static async Task<RelationshipDetail?> LoadDetailAsync(
        LorexDbContext db,
        Guid universeId,
        Guid relationshipId,
        CancellationToken cancellationToken) =>
        await db.Relationships.AsNoTracking()
            .Where(relationship => relationship.Id == relationshipId
                && relationship.UniverseId == universeId
                && relationship.SourceEntity!.DeletedAt == null
                && relationship.TargetEntity!.DeletedAt == null)
            .Select(relationship => new RelationshipDetail(
                relationship.Id,
                relationship.RelationshipTypeId,
                relationship.RelationshipType!.Name,
                relationship.RelationshipType.InverseName,
                relationship.RelationshipType.IsSymmetric,
                relationship.SourceEntityId,
                relationship.SourceEntity!.Name,
                relationship.TargetEntityId,
                relationship.TargetEntity!.Name,
                relationship.CanonStatus,
                relationship.StartDate,
                relationship.EndDate,
                relationship.Notes,
                relationship.CreatedAt,
                relationship.UpdatedAt))
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>
    /// Every link touching one entity, already turned around for that entity. A row where
    /// the entity is the target comes back under the inverse wording, so a client never has
    /// to work out the reverse reading itself.
    /// </summary>
    internal static async Task<List<RelationshipView>> LoadForEntityAsync(
        LorexDbContext db,
        Guid universeId,
        Guid entityId,
        CancellationToken cancellationToken)
    {
        // A link with one end in the Trash is stored, untouched, and simply not shown: it is
        // a row of its own that nothing round-trips, so hiding it destroys nothing and it
        // reappears, both readings intact, the moment that end is restored. Contrast the
        // entity-reference field and timeline participation, which the client rewrites
        // wholesale on every save and which are therefore shown and marked instead.
        var rows = await db.Relationships.AsNoTracking()
            .Where(relationship => relationship.UniverseId == universeId
                && relationship.SourceEntity!.DeletedAt == null
                && relationship.TargetEntity!.DeletedAt == null
                && (relationship.SourceEntityId == entityId || relationship.TargetEntityId == entityId))
            .Select(relationship => new
            {
                relationship.Id,
                relationship.RelationshipTypeId,
                TypeName = relationship.RelationshipType!.Name,
                TypeInverseName = relationship.RelationshipType.InverseName,
                relationship.RelationshipType.IsSymmetric,
                TypeDisplayOrder = relationship.RelationshipType.DisplayOrder,
                relationship.SourceEntityId,
                relationship.TargetEntityId,

                // The other end, chosen in the query so only one entity is ever loaded.
                RelatedId = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntityId
                    : relationship.SourceEntityId,
                RelatedName = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.Name
                    : relationship.SourceEntity!.Name,
                RelatedTypeId = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.EntityTypeId
                    : relationship.SourceEntity!.EntityTypeId,
                RelatedTypeName = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.EntityType!.Name
                    : relationship.SourceEntity!.EntityType!.Name,
                RelatedTypeIcon = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.EntityType!.Icon
                    : relationship.SourceEntity!.EntityType!.Icon,
                RelatedTypeAccent = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.EntityType!.AccentColor
                    : relationship.SourceEntity!.EntityType!.AccentColor,
                RelatedCanonStatus = relationship.SourceEntityId == entityId
                    ? relationship.TargetEntity!.CanonStatus
                    : relationship.SourceEntity!.CanonStatus,
                relationship.CanonStatus,
                relationship.StartDate,
                relationship.EndDate,
                relationship.Notes,
                relationship.CreatedAt,
                relationship.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        return rows
            .Select(row =>
            {
                // Which way the row is being read decides the wording and which end is
                // "the other one". Nothing else about the stored row changes.
                var perspective = row.SourceEntityId == entityId
                    ? RelationshipPerspective.Forward
                    : RelationshipPerspective.Inverse;

                return (row.TypeDisplayOrder, View: new RelationshipView(
                    row.Id,
                    row.RelationshipTypeId,
                    row.TypeName,
                    row.TypeInverseName,
                    row.IsSymmetric,
                    perspective,
                    RelationshipValidation.LabelFor(
                        row.TypeName, row.TypeInverseName, row.IsSymmetric, perspective),
                    entityId,
                    row.RelatedId,
                    row.RelatedName,
                    row.RelatedTypeId,
                    row.RelatedTypeName,
                    row.RelatedTypeIcon,
                    row.RelatedTypeAccent,
                    row.RelatedCanonStatus,
                    row.SourceEntityId,
                    row.TargetEntityId,
                    row.CanonStatus,
                    row.StartDate,
                    row.EndDate,
                    row.Notes,
                    row.CreatedAt,
                    row.UpdatedAt));
            })
            .OrderBy(entry => entry.TypeDisplayOrder)
            .ThenBy(entry => entry.View.Label, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.View.RelatedEntityName, StringComparer.OrdinalIgnoreCase)
            .Select(entry => entry.View)
            .ToList();
    }
}
