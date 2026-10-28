using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Progression;

/// <summary>
/// An entry's progression and its history, read and written on their own address (Issue #30), like the article (ADR 0028):
/// the entry's routes, the listing, the Trash, a suggestion and an AI change never carry it, and saving it writes nothing of
/// the entry's structured lore. Reading is for every member; saving is for Editors and the owner; history is theirs too.
///
/// Every route proves access to the universe, then a live entry in it, before reading a body - so a stranger's malformed
/// save is a 404 like any other. A save is the whole progression over the version it was read at (ADR 0043); one written
/// over a version that has moved on is refused and writes nothing. A save that changes nothing records nothing.
///
/// <b>Not Canon.</b> Nothing here is read by a Canon rule, the timeline or the family tree, so a save passes no gate.
/// </summary>
public static class ProgressionEndpoints
{
    public const string ChangedCode = "entity_progression_changed";

    /// <summary>The 409 for removing an era that still holds an archived field's value.</summary>
    public const string EraArchivedValuesCode = "entity_era_archived_values";

    /// <summary>The 409 for removing an era a relationship's period names (Issue #18).</summary>
    public const string EraInRelationshipCode = "entity_era_in_relationship";

    /// <summary>The 409 for removing, by a save or a restore, an appearance that still holds pictures (Issue #43).</summary>
    public const string AppearanceHoldsPicturesCode = "entity_appearance_has_pictures";

    /// <summary>
    /// The 409 for restoring a version that can no longer be put back exactly as it was saved: it overrides a field that is
    /// archived now or that the entry's type no longer has, chooses an option since removed, or names a story, scene or entry
    /// that is gone.
    /// </summary>
    public const string RevisionUnrestorableCode = "entity_progression_revision_unrestorable";

    public static IEndpointRouteBuilder MapProgressionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/universes/{universeId:guid}/entities/{entityId:guid}/progression")
            .WithTags("Entities")
            .RequireAuthorization();

        group.MapGet("/", GetAsync).WithName("GetEntityProgression");
        group.MapPut("/", SaveAsync).WithName("SaveEntityProgression");
        group.MapGet("/revisions", ListRevisionsAsync).WithName("ListEntityProgressionRevisions");
        group.MapGet("/revisions/{revisionId:guid}", GetRevisionAsync).WithName("GetEntityProgressionRevision");
        group.MapPost("/revisions/{revisionId:guid}/restore", RestoreRevisionAsync).WithName("RestoreEntityProgressionRevision");

        return endpoints;
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await LiveTypeAsync(db, universeId, entityId, cancellationToken) is null)
        {
            return Results.NotFound();
        }

        return Results.Ok(await ResponseAsync(db, universeId, entityId, cancellationToken));
    }

    private static async Task<IResult> SaveAsync(
        Guid universeId,
        Guid entityId,
        [FromBody] ProgressionRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var result = await WriteAsync(db, universeId, entityId, request, EntityRevisionKind.Edited, null, principal.RequireUserId(), cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    /// <summary>Newest first. A row says when, by whom and what kind of save; the version itself is read on its own.</summary>
    private static async Task<IResult> ListRevisionsAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await LiveTypeAsync(db, universeId, entityId, cancellationToken) is null)
        {
            return Results.NotFound();
        }

        var revisions = await db.EntityProgressionRevisions.AsNoTracking()
            .Where(revision => revision.EntityId == entityId)
            .OrderByDescending(revision => revision.Number)
            .Select(revision => new ProgressionRevisionSummary(
                revision.Id,
                revision.Number,
                revision.Kind,
                revision.RestoredFromRevisionId,
                revision.CreatedAt,
                db.Users.Where(user => user.Id == revision.ActorUserId).Select(user => user.UserName).FirstOrDefault()))
            .ToListAsync(cancellationToken);

        return Results.Ok(revisions.Select(revision => revision with { CreatedAt = Utc(revision.CreatedAt) }));
    }

    private static async Task<IResult> GetRevisionAsync(
        Guid universeId,
        Guid entityId,
        Guid revisionId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await FindRevisionAsync(db, universeId, entityId, revisionId, cancellationToken) is not { } revision)
        {
            return Results.NotFound();
        }

        var snapshot = ProgressionState.Deserialize(revision.Snapshot);
        var actor = await db.Users.Where(user => user.Id == revision.ActorUserId).Select(user => user.UserName).FirstOrDefaultAsync(cancellationToken);
        var (forms, abilities) = await ProgressionForms.DescribeAsync(db, universeId, snapshot, cancellationToken);
        var appearances = await ProgressionAppearances.DescribeAsync(db, universeId, snapshot, withImages: false, cancellationToken);

        return Results.Ok(new ProgressionRevisionDetail(
            revision.Id,
            revision.Number,
            revision.Kind,
            revision.RestoredFromRevisionId,
            Utc(revision.CreatedAt),
            actor,
            await ProgressionState.DescribeAsync(db, universeId, snapshot.Eras, cancellationToken),
            forms,
            abilities,
            appearances));
    }

    /// <summary>
    /// Puts a saved version back through the same write a save uses - checked as a save is, over the version named, recorded as
    /// the next version naming what it came from. An era the version held and that was removed since comes back with its own
    /// id. A version that the save's own checks would not store exactly as it was recorded - a field archived since, an option
    /// removed, a story gone - is refused whole: put back without those parts it would quietly be another version.
    /// </summary>
    private static async Task<IResult> RestoreRevisionAsync(
        Guid universeId,
        Guid entityId,
        Guid revisionId,
        [FromBody] ProgressionRestoreRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        if (await FindRevisionAsync(db, universeId, entityId, revisionId, cancellationToken) is not { } revision)
        {
            return Results.NotFound();
        }

        var snapshot = ProgressionState.Deserialize(revision.Snapshot);

        var result = await WriteAsync(
            db,
            universeId,
            entityId,
            snapshot.ToRequest(request.ExpectedVersion),
            EntityRevisionKind.Restored,
            revision.Id,
            principal.RequireUserId(),
            cancellationToken,
            exactly: snapshot);

        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    /// <summary>
    /// The one write, inside the caller's transaction: a live entry, the version named, the save checked and normalised, then
    /// the difference written, the version moved on once, a version of the history recorded, and the entry's <c>UpdatedAt</c>
    /// touched so it sorts as recently worked on. A save equal to what is stored writes nothing. <paramref name="givenIds"/>: new
    /// items arrive with ids LorEvolve already gave them - an approved AI change's (ADR 0062), whose new items name each other - and
    /// are taken as a restore takes an era back, never an id another entry's item has.
    /// </summary>
    internal static async Task<IResult> WriteAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid entityId,
        ProgressionRequest request,
        EntityRevisionKind kind,
        Guid? restoredFromRevisionId,
        string actorUserId,
        CancellationToken cancellationToken,
        ProgressionSnapshot? exactly = null,
        bool givenIds = false)
    {
        if (await LiveTypeAsync(db, universeId, entityId, cancellationToken) is not { } typeId)
        {
            return Results.NotFound();
        }

        var progression = await db.EntityProgressions.FirstOrDefaultAsync(row => row.EntityId == entityId, cancellationToken);
        var version = progression?.Version ?? 0;

        if (!EditVersion.Matches(version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                ChangedCode,
                "Progression changed",
                "This entry's eras were changed somewhere else after they were opened here. Nothing was overwritten.",
                version);
        }

        var current = await ProgressionState.ReadAsync(db, entityId, cancellationToken);
        var (wanted, errors) = await ProgressionState.NormalizeAsync(
            db, universeId, entityId, typeId, current, request, kind == EntityRevisionKind.Restored || givenIds, cancellationToken);

        var json = ProgressionState.Serialize(wanted);

        // A restore lands exactly as recorded, or not at all. A part the version did not record is compared as it is kept.
        if (exactly is not null && (errors.Count > 0 || json != ProgressionState.Serialize(exactly with
            {
                Forms = exactly.Forms ?? wanted.Forms,
                Abilities = exactly.Abilities ?? wanted.Abilities,
                Appearances = exactly.Appearances ?? wanted.Appearances,
            })))
        {
            return Results.Problem(
                title: "Version can't be put back as it was",
                detail: "This version names something that is no longer as it was - a field archived or removed since, a "
                    + "choice taken off a field, or a story, scene or entry deleted or moved to the Trash. Nothing was changed.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = RevisionUnrestorableCode });
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        if (json == ProgressionState.Serialize(current))
        {
            return Results.Ok(await ResponseAsync(db, universeId, entityId, cancellationToken));
        }

        if (await ProgressionState.ApplyAsync(db, entityId, current, wanted, cancellationToken) is { } refused)
        {
            return refused;
        }

        var now = DateTime.UtcNow;

        if (progression is null)
        {
            db.EntityProgressions.Add(new EntityProgression { EntityId = entityId, UpdatedAt = now, Version = 1 });
        }
        else
        {
            progression.UpdatedAt = now;
            progression.Version = version + 1;
        }

        var lastNumber = await db.EntityProgressionRevisions
            .Where(revision => revision.EntityId == entityId)
            .MaxAsync(revision => (int?)revision.Number, cancellationToken) ?? 0;

        db.EntityProgressionRevisions.Add(new EntityProgressionRevision
        {
            Id = Guid.NewGuid(),
            EntityId = entityId,
            Number = lastNumber + 1,
            Kind = lastNumber == 0 ? EntityRevisionKind.Created : kind,
            RestoredFromRevisionId = restoredFromRevisionId,
            CreatedAt = now,
            ActorUserId = actorUserId,
            Snapshot = json,
        });

        await db.SaveChangesAsync(cancellationToken);

        await db.Entities
            .Where(entity => entity.Id == entityId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(entity => entity.UpdatedAt, now), cancellationToken);

        return Results.Ok(await ResponseAsync(db, universeId, entityId, cancellationToken));
    }

    private static async Task<ProgressionResponse> ResponseAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid entityId,
        CancellationToken cancellationToken)
    {
        var stored = await db.EntityProgressions.AsNoTracking()
            .Where(row => row.EntityId == entityId)
            .Select(row => new { row.UpdatedAt, row.Version })
            .FirstOrDefaultAsync(cancellationToken);

        var state = await ProgressionState.ReadAsync(db, entityId, cancellationToken);
        var (forms, abilities) = await ProgressionForms.DescribeAsync(db, universeId, state, cancellationToken);
        var appearances = await ProgressionAppearances.DescribeAsync(db, universeId, state, withImages: true, cancellationToken);

        return new ProgressionResponse(
            entityId,
            await ProgressionState.DescribeAsync(db, universeId, state.Eras, cancellationToken),
            stored is null ? null : Utc(stored.UpdatedAt),
            stored?.Version ?? 0,
            forms,
            abilities,
            appearances);
    }

    /// <summary>The type of a live entry of this universe, or null when there is none - so a trashed entry is not reachable.</summary>
    private static Task<Guid?> LiveTypeAsync(LorEvolveDbContext db, Guid universeId, Guid entityId, CancellationToken cancellationToken) =>
        db.Entities.AsNoTracking()
            .Where(entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null)
            .Select(entity => (Guid?)entity.EntityTypeId)
            .FirstOrDefaultAsync(cancellationToken);

    private static Task<EntityProgressionRevision?> FindRevisionAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid entityId,
        Guid revisionId,
        CancellationToken cancellationToken) =>
        db.EntityProgressionRevisions.AsNoTracking()
            .FirstOrDefaultAsync(
                revision => revision.Id == revisionId
                    && revision.EntityId == entityId
                    && revision.Entity!.UniverseId == universeId
                    && revision.Entity.DeletedAt == null,
                cancellationToken);

    private static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
