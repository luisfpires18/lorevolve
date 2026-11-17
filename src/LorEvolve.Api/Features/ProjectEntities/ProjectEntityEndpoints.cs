using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Features.ProjectEntities.ProjectEntityTypeEndpoints;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// The entries a project holds: a game's maps, units and items, and later a series' episodes or a film's scenes (#144).
///
/// <para>These are <c>Entities</c> rows scoped by <see cref="LoreEntity.ProjectId"/>, written through the same engine
/// the lore uses: <see cref="EntityEndpoints.CreateEntryAsync"/> validates the type, writes the field values and
/// refuses a required field left empty, with the project passed in so every one of those checks happens inside the
/// project's own scope. There is no second schema engine, which is what this issue asks for.</para>
///
/// <para>What a project's entry deliberately does not have: a Canon status, a publication, an article, revisions or a
/// place in universe search. Those describe the world's record, and a unit of a game is not a claim about the world.
/// What it does have instead is <see cref="LoreEntity.CanonEntityId"/>, an optional link to the lore entry it stands
/// for, which is checked to be of the project's own universe and never required.</para>
/// </summary>
public static class ProjectEntityEndpoints
{
    /// <summary>The 409 for a save written over a version that is no longer current (ADR 0043).</summary>
    public const string ChangedCode = "project_entity_changed";

    /// <summary>
    /// The most rows one read of the list returns, and what a caller that sends no <c>take</c> gets (#196). High enough
    /// that no project an author has built by hand is cut short, low enough that one request is always bounded; the
    /// web client reads a page at a time well under it.
    /// </summary>
    public const int ListMaxTake = 500;

    private const int MaxSearchLength = 200;

    public static IEndpointRouteBuilder MapProjectEntityEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/projects/{projectId:guid}/entities")
            .WithTags("Project entities")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListProjectEntities");
        group.MapPost("/", CreateAsync).WithName("CreateProjectEntity");
        group.MapGet("/{entityId:guid}", GetAsync).WithName("GetProjectEntity");
        group.MapPut("/{entityId:guid}", UpdateAsync).WithName("UpdateProjectEntity");
        group.MapDelete("/{entityId:guid}", DeleteAsync).WithName("DeleteProjectEntity");
        group.MapGet("/{entityId:guid}/revisions", RevisionsAsync).WithName("ListProjectEntityRevisions");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid projectId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? typeId = null,
        [FromQuery] int skip = 0,
        [FromQuery] int take = ListMaxTake,
        [FromQuery] bool recent = false,
        [FromQuery] string? q = null,
        [FromQuery] string? sort = null,
        [FromQuery] bool includeDescendants = false)
    {
        var (project, denied) = await ReadableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (skip < 0 || take < 1 || take > ListMaxTake)
        {
            return Problems.Field(
                skip < 0 ? "skip" : "take",
                skip < 0 ? "Skip cannot be negative." : $"Take must be between 1 and {ListMaxTake}.");
        }

        if (sort is not (null or "updated" or "name" or "created"))
        {
            return Problems.Field("sort", "Sort by updated, name or created.");
        }

        if (q is { Length: > MaxSearchLength })
        {
            return Problems.Field("q", $"Search can be at most {MaxSearchLength} characters.");
        }

        // The project id stays in the base predicate, before any filter, so no search or type id reaches another game.
        var matching = db.Entities.AsNoTracking().IgnoreQueryFilters()
            .Where(entry => entry.ProjectId == projectId && entry.DeletedAt == null);

        if (typeId is { } wanted && includeDescendants)
        {
            // The type and every type nested beneath it, from this project's own small type graph (as Lore's list does).
            var parentOf = await db.EntityTypes.AsNoTracking().IgnoreQueryFilters()
                .Where(type => type.UniverseId == project!.UniverseId && type.ProjectId == projectId)
                .ToDictionaryAsync(type => type.Id, type => type.ParentId, cancellationToken);
            var branch = EntityTypeHierarchy.Branch(parentOf, wanted).ToList();
            matching = matching.Where(entry => branch.Contains(entry.EntityTypeId));
        }
        else if (typeId is { } exact)
        {
            matching = matching.Where(entry => entry.EntityTypeId == exact);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var text = EntityFieldFilters.AsciiLower(q.Trim());
            matching = matching.Where(entry => entry.Name.ToLower().Contains(text));
        }

        // The id breaks ties, so a page boundary never repeats or drops a row. By name is this list's own order, the
        // one the Entities view reads a type a page at a time in. `recent` asks for the newest first instead, for the
        // project's overview (#195): the only way to answer "what was touched last" without reading every row and
        // sorting in the client, which is what the issue's one-request-per-list rule forbids.
        var ordered = (sort ?? (recent ? "updated" : "name")) switch
        {
            "updated" => matching.OrderByDescending(entry => entry.UpdatedAt),
            "created" => matching.OrderByDescending(entry => entry.CreatedAt),
            _ => matching.OrderBy(entry => EF.Functions.Collate(entry.Name, "NOCASE")),
        };

        var rows = await ordered
            .ThenBy(entry => entry.Id)
            .Skip(skip)
            .Take(take)
            .Select(entry => new ProjectEntitySummary(
                entry.Id,
                entry.Name,
                entry.Summary,
                entry.EntityTypeId,
                entry.EntityType!.Name,
                entry.EntityType.Icon,
                entry.EntityType.AccentColor,
                entry.CanonEntityId,
                // The linked entry's name, read through the id rather than a navigation, because the link is
                // deliberately not a foreign key (see LoreConfiguration).
                db.Entities.IgnoreQueryFilters()
                    .Where(canon => canon.Id == entry.CanonEntityId)
                    .Select(canon => canon.Name)
                    .FirstOrDefault(),
                entry.UpdatedAt))
            .ToListAsync(cancellationToken);

        _ = project;
        return Results.Ok(rows);
    }

    private static async Task<IResult> GetAsync(
        Guid projectId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await ReadableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var detail = await EntityEndpoints.LoadDetailAsync(
            db, project!.UniverseId, entityId, cancellationToken, liveOnly: true, projectId);

        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    private static async Task<IResult> CreateAsync(
        Guid projectId,
        [FromBody] ProjectEntityRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (await CanonLink.CheckAsync(db, project!.UniverseId, request.CanonEntityId, cancellationToken) is { } refusedLink)
        {
            return refusedLink;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var (entity, problem) = await EntityEndpoints.CreateEntryAsync(
            db,
            project.UniverseId,
            Lore(request),
            principal.RequireUserId(),
            cancellationToken,
            projectId,
            request.CanonEntityId);

        if (problem is not null)
        {
            return problem;
        }

        await transaction.CommitAsync(cancellationToken);

        var detail = await EntityEndpoints.LoadDetailAsync(
            db, project.UniverseId, entity!.Id, cancellationToken, liveOnly: false, projectId);

        return Results.Created($"/api/projects/{projectId}/entities/{entity.Id}", detail);
    }

    private static async Task<IResult> UpdateAsync(
        Guid projectId,
        Guid entityId,
        [FromBody] ProjectEntityRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (await CanonLink.CheckAsync(db, project!.UniverseId, request.CanonEntityId, cancellationToken) is { } refusedLink)
        {
            return refusedLink;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var entity = await db.Entities.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                candidate => candidate.Id == entityId
                    && candidate.ProjectId == projectId
                    && candidate.DeletedAt == null,
                cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        // Read inside the transaction the write commits in, so nothing can land between the comparison and the write.
        if (!EditVersion.Matches(entity.Version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                ChangedCode,
                "Entry changed",
                "This entry was changed after it was opened here. Nothing was overwritten.",
                entity.Version);
        }

        if (await EntityEndpoints.CheckEntryAsync(db, project.UniverseId, Lore(request), cancellationToken, projectId)
            is { } refused)
        {
            return refused;
        }

        // A picture in a field the new type lacks goes with the retype (Issue #238), its objects swept after the commit.
        if (entity.EntityTypeId != request.EntityTypeId)
        {
            await EntityFieldImageEndpoints.DropInapplicableAsync(
                db, project.UniverseId, entityId, request.EntityTypeId, projectId, cancellationToken);
        }

        entity.EntityTypeId = request.EntityTypeId;
        entity.Name = request.Name!.Trim();
        entity.Summary = LoreValidation.Normalize(request.Summary);
        entity.CanonEntityId = request.CanonEntityId;
        entity.UpdatedAt = DateTime.UtcNow;

        // The client sends the complete set of values it wants stored, so the old rows go first, straight against the
        // database: EF does not promise to order deletes ahead of inserts within one SaveChanges, and re-saving an
        // unchanged value would then collide with the row still in the table.
        // Only active fields' values are replaced: an archived field is in no form, so nothing sends its value back, and it
        // stays until the field is restored (Issue #39). The definitions are read past the type filter, which hides a project's.
        await db.EntityFieldValues
            .Where(value => value.EntityId == entityId
                && !db.EntityFieldDefinitions.IgnoreQueryFilters()
                    .Any(field => field.Id == value.FieldDefinitionId && field.ArchivedAt != null))
            .ExecuteDeleteAsync(cancellationToken);

        var prepared = await EntityEndpoints.PrepareFieldValuesAsync(
            db, project.UniverseId, entityId, Lore(request), cancellationToken, projectId);

        if (prepared.Errors.Count > 0)
        {
            return Results.ValidationProblem(prepared.Errors);
        }

        db.EntityFieldValues.AddRange(prepared.Rows);

        await db.SaveChangesAsync(cancellationToken);

        // The entry's history, through the same capture the lore uses (#146). Inside the transaction, so an edit that
        // fails leaves no version behind claiming it happened.
        // A save that changed the entry moves its version on, as the lore's does, so a form opened before it is refused.
        if (await EntityRevisions.CaptureAsync(
            db, entityId, EntityRevisionKind.Edited, restoredFromRevisionId: null, principal.RequireUserId(), cancellationToken))
        {
            entity.Version++;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        await EntityFieldImageEndpoints.SweepDroppedAsync(db, store, loggerFactory, cancellationToken);

        var detail = await EntityEndpoints.LoadDetailAsync(
            db, project.UniverseId, entityId, cancellationToken, liveOnly: false, projectId);

        return Results.Ok(detail);
    }

    /// <summary>
    /// Moves the entry to the Trash, the same way a lore entry goes: the row and everything pointing at it stay where
    /// they are and a timestamp says when it was thrown away (ADR 0015), so nothing dependent is destroyed on the way
    /// in and a restore has nothing to rebuild.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid projectId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var entity = await db.Entities.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                candidate => candidate.Id == entityId && candidate.ProjectId == projectId,
                cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        if (entity.DeletedAt is null)
        {
            entity.DeletedAt = DateTime.UtcNow;
            entity.UpdatedAt = entity.DeletedAt.Value;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.NoContent();
    }

    /// <summary>
    /// An entry's saved versions, newest first (#146). The same rows and the same shape the lore's history uses, read
    /// through the project so a stranger learns nothing and an entry of another project is not found.
    ///
    /// <para>Reading history needs the universe's <c>ManageHistory</c>, as it does for the lore: a saved version holds
    /// what an entry used to say, which is more than its current state discloses.</para>
    /// </summary>
    private static async Task<IResult> RevisionsAsync(
        Guid projectId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await ReadableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (await UniverseAccess.DenyAsync(
                db, project!.UniverseId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } refused)
        {
            return refused;
        }

        if (!await db.Entities.IgnoreQueryFilters().AnyAsync(
                entry => entry.Id == entityId && entry.ProjectId == projectId && entry.DeletedAt == null,
                cancellationToken))
        {
            return Results.NotFound();
        }

        var revisions = await db.EntityRevisions.AsNoTracking()
            .Where(revision => revision.EntityId == entityId)
            .OrderByDescending(revision => revision.Number)
            .Select(revision => new EntityRevisionSummary(
                revision.Id,
                revision.Number,
                revision.Kind,
                revision.Changes,
                revision.Name,
                revision.CanonStatus,
                revision.RestoredFromRevisionId,
                revision.CreatedAt,
                db.Users.Where(user => user.Id == revision.ActorUserId).Select(user => user.UserName).FirstOrDefault()))
            .ToListAsync(cancellationToken);

        return Results.Ok(revisions);
    }

    // ---------- The core an approved AI change commits through (#148) ----------

    /// <summary>
    /// Creates a project's entry after the caller's check: the route's, and an approved AI change's, which runs it
    /// inside the approval's transaction. One path, so a proposal cannot write what a route would refuse.
    /// </summary>
    internal static async Task<(Guid? Id, IResult? Problem)> CreateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid projectId,
        Guid typeId,
        string name,
        string? summary,
        Guid? canonEntityId,
        IReadOnlyList<FieldValueInput> fields,
        string actorUserId,
        CancellationToken cancellationToken)
    {
        var (entity, problem) = await EntityEndpoints.CreateEntryAsync(
            db,
            universeId,
            new EntityRequest(typeId, name, summary, CanonStatus.Draft, null, null, fields),
            actorUserId,
            cancellationToken,
            projectId,
            canonEntityId);

        return problem is not null ? (null, problem) : (entity!.Id, null);
    }

    /// <summary>
    /// Saves a project's entry after the caller's check. <paramref name="expectedVersion"/> is null for an approved AI
    /// change: the proposal's own check already compared what it read against what is stored, and a second comparison
    /// here would refuse an approval for a change the person had already seen and accepted.
    /// </summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid projectId,
        Guid entityId,
        Guid typeId,
        string name,
        string? summary,
        Guid? canonEntityId,
        IReadOnlyList<FieldValueInput> fields,
        string actorUserId,
        CancellationToken cancellationToken)
    {
        var entity = await db.Entities.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                candidate => candidate.Id == entityId && candidate.ProjectId == projectId && candidate.DeletedAt == null,
                cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        // An approved change that retypes the entry drops the pictures its new type has no field for; the approval route
        // sweeps their objects after the proposal's commit.
        if (entity.EntityTypeId != typeId)
        {
            await EntityFieldImageEndpoints.DropInapplicableAsync(db, universeId, entityId, typeId, projectId, cancellationToken);
        }

        entity.EntityTypeId = typeId;
        entity.Name = name.Trim();
        entity.Summary = LoreValidation.Normalize(summary);
        entity.CanonEntityId = canonEntityId;
        entity.UpdatedAt = DateTime.UtcNow;

        // Only active fields' values are replaced: an archived field is in no form, so nothing sends its value back, and it
        // stays until the field is restored (Issue #39). The definitions are read past the type filter, which hides a project's.
        await db.EntityFieldValues
            .Where(value => value.EntityId == entityId
                && !db.EntityFieldDefinitions.IgnoreQueryFilters()
                    .Any(field => field.Id == value.FieldDefinitionId && field.ArchivedAt != null))
            .ExecuteDeleteAsync(cancellationToken);

        var prepared = await EntityEndpoints.PrepareFieldValuesAsync(
            db,
            universeId,
            entityId,
            new EntityRequest(typeId, name, summary, CanonStatus.Draft, null, null, fields),
            cancellationToken,
            projectId);

        if (prepared.Errors.Count > 0)
        {
            return Results.ValidationProblem(prepared.Errors);
        }

        db.EntityFieldValues.AddRange(prepared.Rows);
        await db.SaveChangesAsync(cancellationToken);

        await EntityRevisions.CaptureAsync(
            db, entityId, EntityRevisionKind.Edited, restoredFromRevisionId: null, actorUserId, cancellationToken);

        return Results.NoContent();
    }

    /// <summary>Moves a project's entry to the Trash, the one way it leaves a listing (ADR 0015).</summary>
    internal static async Task<IResult> TrashCoreAsync(
        LorEvolveDbContext db,
        Guid projectId,
        Guid entityId,
        CancellationToken cancellationToken)
    {
        var entity = await db.Entities.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                candidate => candidate.Id == entityId && candidate.ProjectId == projectId,
                cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        if (entity.DeletedAt is null)
        {
            entity.DeletedAt = DateTime.UtcNow;
            entity.UpdatedAt = entity.DeletedAt.Value;
            await db.SaveChangesAsync(cancellationToken);
        }

        return Results.NoContent();
    }

    /// <summary>
    /// The field values a proposal's shape becomes, with a field of choices resolved from the choice text a client
    /// sent to the option ids the engine stores. A client reads the choices as words from <c>get_project_schema</c>,
    /// so it sends words back; nothing asks it to carry option ids around.
    /// </summary>
    internal static async Task<List<FieldValueInput>> ValuesFromChoicesAsync(
        LorEvolveDbContext db,
        IReadOnlyList<(Guid FieldId, string? Text, double? Number, bool? Boolean, DateTime? Date, IReadOnlyList<string>? Choices, Guid? LinkedEntryId)> values,
        CancellationToken cancellationToken)
    {
        var fieldIds = values.Select(value => value.FieldId).Distinct().ToList();

        var options = await db.EntityFieldOptions.AsNoTracking()
            .Where(option => fieldIds.Contains(option.FieldDefinitionId))
            .Select(option => new { option.Id, option.FieldDefinitionId, option.Value })
            .ToListAsync(cancellationToken);

        return
        [
            .. values.Select(value => new FieldValueInput(
                value.FieldId,
                value.Text,
                value.Number,
                value.Boolean,
                value.Date,
                value.Choices is null
                    ? null
                    : [
                        .. value.Choices
                            .Select(choice => options.FirstOrDefault(option =>
                                option.FieldDefinitionId == value.FieldId
                                && string.Equals(option.Value, choice, StringComparison.OrdinalIgnoreCase)))
                            .Where(option => option is not null)
                            .Select(option => option!.Id),
                    ],
                value.LinkedEntryId)),
        ];
    }

    /// <summary>
    /// The project's request as the lore engine's own request. A project's entry has no Canon status of its own, so it
    /// is written as <see cref="CanonStatus.Draft"/> and never read back: nothing about a game's unit says the world
    /// holds it to be true.
    /// </summary>
    private static EntityRequest Lore(ProjectEntityRequest request) => new(
        request.EntityTypeId,
        request.Name,
        request.Summary,
        CanonStatus.Draft,
        Aliases: null,
        Tags: null,
        request.Fields,
        request.ExpectedVersion);
}
