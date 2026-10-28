using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Relationships;

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
/// a rule the author configured, which LorEvolve cannot tell from a law of the world (ADR 0023). The
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
///
/// <b>Removing a link moves it to the Trash</b> (ADR 0048), as removing an entry, a story or a rule does: the row keeps
/// everything it says and is read nowhere until the Trash restores it. Only the Trash erases one for good, and only a person
/// does that - an AI change can only ever move a link there.
/// </summary>
public static class RelationshipEndpoints
{
    /// <summary>The refusal an exact duplicate gets, so a client can tell it from any other conflict.</summary>
    public const string DuplicateCode = "relationship_already_exists";

    /// <summary>The refusal for moving an end of a link while a period it keeps names an era of the end it leaves (Issue #18).</summary>
    public const string PeriodEraMovedCode = "relationship_period_era_moved";

    /// <summary>The refusal a restore gets while one of the link's ends is still in the Trash.</summary>
    public const string EndInTrashCode = "relationship_end_in_trash";

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

    /// <summary>
    /// Every link of one entry; or, asked about a time (Issue #18), only those that hold then, each saying how: during one of
    /// this entry's eras (<paramref name="era"/>), or at a point on the universe's chronology (<paramref name="atYear"/> with
    /// its date period, month and day as precise as wanted). Links that hold at another time are left out; a link that cannot
    /// be placed is listed and marked so.
    /// </summary>
    private static async Task<IResult> ListForEntityAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? era = null,
        [FromQuery] Guid? atEraId = null,
        [FromQuery] int? atYear = null,
        [FromQuery] int? atMonth = null,
        [FromQuery] Guid? atMonthId = null,
        [FromQuery] int? atDay = null)
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

        var askedAtPoint = atEraId is not null || atYear is not null || atMonth is not null || atMonthId is not null || atDay is not null;

        if (era is null && !askedAtPoint)
        {
            return Results.Ok(await LoadForEntityAsync(db, universeId, entityId, cancellationToken));
        }

        if (era is not null && askedAtPoint)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["era"] = ["Ask about an era or a point in time, not both."] });
        }

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        if (era is { } eraId)
        {
            var span = await db.EntityEras.AsNoTracking()
                .Where(candidate => candidate.Id == eraId && candidate.EntityId == entityId)
                .Select(candidate => new
                {
                    candidate.StartEraId,
                    candidate.StartYear,
                    candidate.StartMonth,
                    candidate.StartMonthId,
                    candidate.StartDay,
                    candidate.EndEraId,
                    candidate.EndYear,
                    candidate.EndMonth,
                    candidate.EndMonthId,
                    candidate.EndDay,
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (span is null)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["era"] = ["Choose one of this entry's eras."] });
            }

            var start = span.StartYear is null ? null : new ChronologyValue(span.StartEraId, span.StartYear, span.StartMonth, span.StartDay, span.StartMonthId);
            var end = span.EndYear is null ? null : new ChronologyValue(span.EndEraId, span.EndYear, span.EndMonth, span.EndDay, span.EndMonthId);
            var views = await LoadForEntityAsync(db, universeId, entityId, cancellationToken);

            return Results.Ok(Holding(views, periods => RelationshipPeriods.During(periods, eraId, entityId, start, end, chronology)));
        }

        var point = new ChronologyValue(atEraId, atYear, atMonth, atDay, atMonthId);
        var errors = new Dictionary<string, string[]>();
        ChronologyPointValidation.ValidatePoint(point, ChronologyPointKeys.Prefixed("at"), chronology, errors);

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var all = await LoadForEntityAsync(db, universeId, entityId, cancellationToken);
        return Results.Ok(Holding(all, periods => RelationshipPeriods.At(periods, point, chronology)));
    }

    /// <summary>The links that hold, each marked with how.</summary>
    private static List<RelationshipView> Holding(
        List<RelationshipView> views,
        Func<IReadOnlyList<RelationshipPeriodResponse>, RelationshipValidity?> holds) =>
    [
        .. views
            .Select(view => view with { Validity = holds(view.Periods ?? []) })
            .Where(view => view.Validity is not null),
    ];

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid relationshipId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
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
        LorEvolveDbContext db,
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
        LorEvolveDbContext db,
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

        if (request.Periods is { } periods
            && await RelationshipPeriods.CheckAsync(db, universeId, request.SourceEntityId, request.TargetEntityId, periods, cancellationToken) is { } periodErrors)
        {
            return Results.ValidationProblem(periodErrors);
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
        await RelationshipPeriods.ReplaceAsync(db, relationship.Id, request.Periods ?? [], cancellationToken, isNew: true);
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
        LorEvolveDbContext db,
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
        LorEvolveDbContext db,
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

        // Periods left out are kept as they are - and an era they name must still be one of the link's ends' if an end moved.
        var endsMoved = relationship.SourceEntityId != request.SourceEntityId || relationship.TargetEntityId != request.TargetEntityId;

        if (request.Periods is { } sent
            && await RelationshipPeriods.CheckAsync(db, universeId, request.SourceEntityId, request.TargetEntityId, sent, cancellationToken) is { } periodErrors)
        {
            return Results.ValidationProblem(periodErrors);
        }

        if (request.Periods is null && endsMoved
            && await RelationshipPeriods.CheckAsync(
                db, universeId, request.SourceEntityId, request.TargetEntityId,
                await RelationshipPeriods.StoredAsync(db, relationshipId, cancellationToken), cancellationToken) is not null)
        {
            return Results.Problem(
                title: "Period names an era",
                detail: "This relation holds during an era of an entry it would no longer connect. Change that period first, "
                    + "then move the relation.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = PeriodEraMovedCode });
        }

        if (request.Periods is not null)
        {
            await RelationshipPeriods.ReplaceAsync(db, relationshipId, request.Periods, cancellationToken);
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
        LorEvolveDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await canon.RecordAsync(
            universeId,
            token => TrashCoreAsync(universeId, relationshipId, db, token),
            cancellationToken);
    }

    /// <summary>
    /// Moves the link to the Trash (ADR 0048), shared with an approved AI change. Only the marker moves; one row holds both
    /// readings, so the link leaves both ends at once. A link with an end in the Trash is not reachable either: it is not the
    /// author's to act on until they decide what to do with that end. Access and the Canon reconciliation are the caller's.
    /// </summary>
    internal static async Task<IResult> TrashCoreAsync(
        Guid universeId,
        Guid relationshipId,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var relationship = await FindLiveAsync(db, universeId, relationshipId, cancellationToken);

        if (relationship is null)
        {
            return Results.NotFound();
        }

        relationship.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Brings a link back from the Trash exactly as it was, mapped by the Trash under its own typed route. Refused while one of
    /// its ends is in the Trash (that entry comes back first), and as a duplicate when the same link was made again meanwhile -
    /// the one that is there is named, never overwritten. Reconciled, as every relationship write is. A link of another
    /// universe, one not in the Trash, or a guessed id answers as missing.
    /// </summary>
    public static async Task<IResult> RestoreAsync(
        Guid universeId,
        Guid relationshipId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await canon.RecordAsync(
            universeId,
            token => RestoreCoreAsync(universeId, relationshipId, db, token),
            cancellationToken);
    }

    private static async Task<IResult> RestoreCoreAsync(
        Guid universeId,
        Guid relationshipId,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var relationship = await db.Relationships
            .Include(candidate => candidate.SourceEntity)
            .Include(candidate => candidate.TargetEntity)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == relationshipId && candidate.UniverseId == universeId && candidate.DeletedAt != null,
                cancellationToken);

        if (relationship is null)
        {
            return Results.NotFound();
        }

        if (relationship.SourceEntity!.DeletedAt is not null || relationship.TargetEntity!.DeletedAt is not null)
        {
            return Results.Problem(
                title: "Entry in the Trash",
                detail: "One of the entries this relationship connects is in the Trash. Restore that entry first.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = EndInTrashCode });
        }

        var same = new RelationshipRequest(
            relationship.RelationshipTypeId, relationship.SourceEntityId, relationship.TargetEntityId, relationship.CanonStatus, null, null, null);
        if (await FindDuplicateAsync(db, universeId, same, relationship.Id, cancellationToken) is { } existing)
        {
            return AlreadyExists(existing);
        }

        relationship.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(await LoadDetailAsync(db, universeId, relationship.Id, cancellationToken));
    }

    /// <summary>
    /// One relationship, only while it and both of its ends are live. Every read hides a link in
    /// the Trash or whose endpoint is, so every write refuses the same one.
    /// </summary>
    private static Task<LoreRelationship?> FindLiveAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid relationshipId,
        CancellationToken cancellationToken) =>
        db.Relationships.FirstOrDefaultAsync(
            candidate => candidate.Id == relationshipId
                && candidate.UniverseId == universeId
                && candidate.DeletedAt == null
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
        LorEvolveDbContext db,
        Guid universeId,
        RelationshipRequest request,
        Guid? excluding,
        CancellationToken cancellationToken) =>
        await db.Relationships.AsNoTracking()
            .Where(candidate => candidate.UniverseId == universeId
                && candidate.DeletedAt == null
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
        LorEvolveDbContext db,
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
        LorEvolveDbContext db,
        Guid universeId,
        Guid relationshipId,
        CancellationToken cancellationToken)
    {
        var detail = await DetailRowAsync(db, universeId, relationshipId, cancellationToken);
        return detail is null
            ? null
            : detail with { Periods = (await RelationshipPeriods.ReadAsync(db, [relationshipId], cancellationToken)).GetValueOrDefault(relationshipId, []) };
    }

    private static async Task<RelationshipDetail?> DetailRowAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid relationshipId,
        CancellationToken cancellationToken) =>
        await db.Relationships.AsNoTracking()
            .Where(relationship => relationship.Id == relationshipId
                && relationship.UniverseId == universeId
                && relationship.DeletedAt == null
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
        LorEvolveDbContext db,
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
                && relationship.DeletedAt == null
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

        // When each holds (Issue #18), read for every link at once.
        var periods = await RelationshipPeriods.ReadAsync(db, [.. rows.Select(row => row.Id)], cancellationToken);

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
                    row.UpdatedAt,
                    periods.GetValueOrDefault(row.Id, [])));
            })
            .OrderBy(entry => entry.TypeDisplayOrder)
            .ThenBy(entry => entry.View.Label, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.View.RelatedEntityName, StringComparer.OrdinalIgnoreCase)
            .Select(entry => entry.View)
            .ToList();
    }
}
