using System.Globalization;
using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// An entry's history, and putting an older version back.
///
/// Read-only apart from the restore, and the restore writes nothing here: it replays a
/// snapshot through the ordinary entity update, so it passes the same validation and the
/// same Canon promotion gate as any other edit and is recorded as the next revision by the
/// same capture. Nothing on this surface rewrites or removes a revision.
///
/// Ownership is proved against the universe on every route, exactly as the rest of the lore
/// surface does, and a revision is only ever reached through the entry that owns it - so a
/// trashed entry's history is not reachable here, and is not touched either. Restoring an
/// entry from the Trash and restoring one of its revisions are different operations: the first
/// puts back the rows exactly as they were stored and writes no version, the second replays an
/// older snapshot over the live entry and writes one. See ADR 0013 and ADR 0015.
/// </summary>
public static class RevisionEndpoints
{
    /// <summary>The machine-readable marker on the 409 a restore answers when it cannot be replayed.</summary>
    public const string NotRestorableCode = "revision_not_restorable";

    public static IEndpointRouteBuilder MapEntityRevisionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/universes/{universeId:guid}/entities/{entityId:guid}/revisions")
            .WithTags("Entities")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListEntityRevisions");
        group.MapGet("/{revisionId:guid}", GetAsync).WithName("GetEntityRevision");
        group.MapPost("/{revisionId:guid}/restore", RestoreAsync).WithName("RestoreEntityRevision");

        return endpoints;
    }

    /// <summary>
    /// Newest first, which is the order a history is read in. Rows are small - no article and
    /// no values - so the whole history of one entry is one response.
    /// </summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        // Reached through the entry, so a trashed entry's history is not reachable either.
        // Nothing is deleted - the revisions are all still there and are readable again the
        // moment the entry is restored.
        var entityExists = await db.Entities.AnyAsync(
            entity => entity.Id == entityId
                && entity.UniverseId == universeId
                && entity.DeletedAt == null,
            cancellationToken);

        if (!entityExists)
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

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid entityId,
        Guid revisionId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        var revision = await LoadAsync(db, universeId, entityId, revisionId, cancellationToken);

        return revision is null ? Results.NotFound() : Results.Ok(Describe(revision));
    }

    /// <summary>
    /// Puts an older version back as an ordinary edit.
    ///
    /// The snapshot is replayed through <see cref="EntityEndpoints.UpdateCoreAsync"/> under the
    /// promotion gate, so a restore that would make the universe newly self-contradictory is
    /// refused with the same 409 any other write would get, and the entry is left untouched.
    /// The restore itself becomes the next revision, marked as a restore and naming what it
    /// came from; the version it restored is not moved, rewritten or removed.
    ///
    /// A snapshot is only replayable while everything it names still exists. Rather than let
    /// the ordinary write silently drop an option or a reference that has since been deleted -
    /// which would put back something that is not what the author saw - the ids are checked
    /// first and a restore that cannot be exact is refused outright.
    ///
    /// The restore names the entry's version it was chosen over, exactly as a save does, and is refused the same way when
    /// the entry has changed since (ADR 0043). A body that names none is refused as changed, never applied blind.
    /// </summary>
    private static async Task<IResult> RestoreAsync(
        Guid universeId,
        Guid entityId,
        Guid revisionId,
        [FromBody] EntityRevisionRestoreRequest? body,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageHistory, cancellationToken) is { } denied)
        {
            return denied;
        }

        var revision = await LoadAsync(db, universeId, entityId, revisionId, cancellationToken);

        if (revision is null)
        {
            return Results.NotFound();
        }

        if (await MissingReferencesAsync(db, universeId, revision, cancellationToken) is { Count: > 0 } missing)
        {
            return NotRestorable(missing);
        }

        var request = RequestFrom(revision) with { ExpectedVersion = body?.ExpectedVersion };

        return await gate.RunAsync(
            universeId,
            async token =>
                await ArchivedFieldConflictAsync(db, entityId, revision, token)
                ?? await EntityEndpoints.UpdateCoreAsync(
                    universeId,
                    entityId,
                    request,
                    principal.RequireUserId(),
                    db,
                    token,
                    EntityRevisionKind.Restored,
                    revision.Id),
            cancellationToken);
    }

    /// <summary>The marker on the 409 for a version whose archived fields' values differ from what the entry keeps now.</summary>
    public const string ArchivedFieldConflictCode = "entity_revision_archived_field";

    /// <summary>
    /// The refusal for putting back a version whose values for an archived field differ from the values the entry keeps for
    /// it now - a value on one side only included - or null (Issue #39). A save never writes an archived field, so applying
    /// such a version would leave the archived values as they are and record a restore that did not happen. Nothing is
    /// written; the author restores the field first, and the version then applies whole. Read inside the gate's
    /// transaction, so an archive or restore of the field cannot slip between this and the write.
    /// </summary>
    private static async Task<IResult?> ArchivedFieldConflictAsync(
        LorexDbContext db,
        Guid entityId,
        EntityRevision revision,
        CancellationToken cancellationToken)
    {
        var current = await db.EntityFieldValues.AsNoTracking()
            .Where(value => value.EntityId == entityId && value.FieldDefinition!.ArchivedAt != null)
            .Select(value => new
            {
                value.FieldDefinitionId,
                value.TextValue,
                value.NumberValue,
                value.EraId,
                value.BooleanValue,
                value.DateValue,
                value.OptionId,
                value.ReferencedEntityId,
            })
            .ToListAsync(cancellationToken);

        var recorded = revision.FieldValues.Select(value => value.FieldDefinitionId).Distinct().ToList();
        var archived = await db.EntityFieldDefinitions.AsNoTracking()
            .Where(field => field.ArchivedAt != null && recorded.Contains(field.Id))
            .Select(field => field.Id)
            .ToListAsync(cancellationToken);

        var fieldIds = archived.Concat(current.Select(value => value.FieldDefinitionId)).ToHashSet();
        var differing = fieldIds
            .Where(fieldId => !Same(
                current.Where(value => value.FieldDefinitionId == fieldId)
                    .Select(value => Key(value.TextValue, value.NumberValue, value.EraId, value.BooleanValue, value.DateValue, value.OptionId, value.ReferencedEntityId)),
                revision.FieldValues.Where(value => value.FieldDefinitionId == fieldId)
                    .Select(value => Key(value.TextValue, value.NumberValue, value.EraId, value.BooleanValue, value.DateValue, value.OptionId, value.ReferencedEntityId))))
            .ToList();

        if (differing.Count == 0)
        {
            return null;
        }

        var names = (await db.EntityFieldDefinitions.AsNoTracking()
                .Where(field => differing.Contains(field.Id))
                .Select(field => field.Name)
                .ToListAsync(cancellationToken))
            .Order(StringComparer.Ordinal)
            .ToList();
        var named = names.Count == 1
            ? $"the archived field \"{names[0]}\""
            : $"{names.Count} archived fields, \"{names[0]}\" among them";

        return Results.Problem(
            title: "Version holds archived values",
            detail: $"This version records a different value in {named} than the entry keeps now, and an archived field is never "
                + "changed by a restore. Restore the field on its type first, then restore this version. Nothing was changed.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ArchivedFieldConflictCode, ["fields"] = names });

        static string Key(string? text, double? number, Guid? era, bool? flag, DateTime? date, Guid? option, Guid? reference) =>
            string.Join(
                '\u001f',
                text,
                number?.ToString("R", CultureInfo.InvariantCulture),
                era?.ToString("N"),
                flag?.ToString(CultureInfo.InvariantCulture),
                date?.ToString("O", CultureInfo.InvariantCulture),
                option?.ToString("N"),
                reference?.ToString("N"));

        static bool Same(IEnumerable<string> a, IEnumerable<string> b) =>
            a.Order(StringComparer.Ordinal).SequenceEqual(b.Order(StringComparer.Ordinal), StringComparer.Ordinal);
    }

    // ---------- Reading ----------

    private static Task<EntityRevision?> LoadAsync(
        LorexDbContext db,
        Guid universeId,
        Guid entityId,
        Guid revisionId,
        CancellationToken cancellationToken) =>
        db.EntityRevisions.AsNoTracking()
            .Include(revision => revision.Aliases)
            .Include(revision => revision.Tags)
            .Include(revision => revision.FieldValues)
            .FirstOrDefaultAsync(
                revision => revision.Id == revisionId
                    && revision.EntityId == entityId
                    && revision.Entity!.UniverseId == universeId
                    && revision.Entity.DeletedAt == null,
                cancellationToken);

    /// <summary>
    /// One version for the reader. Multi-select stored a row per option, so the rows are
    /// folded back into one value per field, exactly as the live detail does.
    /// </summary>
    private static EntityRevisionDetail Describe(EntityRevision revision)
    {
        var fields = revision.FieldValues
            .GroupBy(value => new { value.FieldDefinitionId, value.FieldName, value.Kind, value.DisplayOrder })
            .OrderBy(group => group.Key.DisplayOrder)
            .ThenBy(group => group.Key.FieldName, StringComparer.Ordinal)
            .Select(group => new EntityRevisionFieldResponse(
                group.Key.FieldDefinitionId,
                group.Key.FieldName,
                group.Key.Kind,
                group.Select(value => value.TextValue).FirstOrDefault(text => text != null),
                group.Select(value => value.NumberValue).FirstOrDefault(number => number != null),
                group.Select(value => value.BooleanValue).FirstOrDefault(flag => flag != null),
                group.Select(value => value.DateValue).FirstOrDefault(date => date != null),
                [.. group.Where(value => value.OptionValue != null)
                    .Select(value => value.OptionValue!)
                    .Order(StringComparer.Ordinal)],
                group.Select(value => value.ReferencedEntityName).FirstOrDefault(name => name != null),
                group.Select(value => value.EraId).FirstOrDefault(id => id != null),
                group.Select(value => value.EraLabel).FirstOrDefault(label => label != null)))
            .ToList();

        return new EntityRevisionDetail(
            revision.Id,
            revision.Number,
            revision.Kind,
            revision.Changes,
            revision.RestoredFromRevisionId,
            revision.CreatedAt,
            revision.EntityTypeId,
            revision.EntityTypeName,
            revision.Name,
            revision.Summary,
            revision.Content,
            revision.CanonStatus,
            [.. revision.Aliases.Select(alias => alias.Value).Order(StringComparer.Ordinal)],
            [.. revision.Tags.Select(tag => tag.Name).Order(StringComparer.Ordinal)],
            fields);
    }

    // ---------- Restoring ----------

    /// <summary>
    /// What the snapshot names that the universe no longer has, in the author's words. Empty
    /// when the version can be put back exactly as it was recorded.
    /// </summary>
    private static async Task<List<string>> MissingReferencesAsync(
        LorexDbContext db,
        Guid universeId,
        EntityRevision revision,
        CancellationToken cancellationToken)
    {
        var missing = new List<string>();

        var typeExists = await db.EntityTypes.AnyAsync(
            type => type.Id == revision.EntityTypeId && type.UniverseId == universeId,
            cancellationToken);

        if (!typeExists)
        {
            missing.Add($"the type \"{revision.EntityTypeName}\"");
        }

        var fieldIds = revision.FieldValues.Select(value => value.FieldDefinitionId).Distinct().ToList();

        var liveFieldIds = await db.EntityFieldDefinitions.AsNoTracking()
            .Where(field => fieldIds.Contains(field.Id)
                && field.EntityTypeId == revision.EntityTypeId
                && field.EntityType!.UniverseId == universeId)
            .Select(field => field.Id)
            .ToListAsync(cancellationToken);

        foreach (var value in revision.FieldValues
            .Where(value => !liveFieldIds.Contains(value.FieldDefinitionId))
            .DistinctBy(value => value.FieldDefinitionId))
        {
            missing.Add($"the field \"{value.FieldName}\"");
        }

        var optionIds = revision.FieldValues
            .Where(value => value.OptionId is not null)
            .Select(value => value.OptionId!.Value)
            .Distinct()
            .ToList();

        var liveOptionIds = await db.EntityFieldOptions.AsNoTracking()
            .Where(option => optionIds.Contains(option.Id)
                && option.FieldDefinition!.EntityType!.UniverseId == universeId)
            .Select(option => option.Id)
            .ToListAsync(cancellationToken);

        foreach (var value in revision.FieldValues
            .Where(value => value.OptionId is { } id && !liveOptionIds.Contains(id)))
        {
            missing.Add($"the choice \"{value.OptionValue ?? value.FieldName}\"");
        }

        var referencedIds = revision.FieldValues
            .Where(value => value.ReferencedEntityId is not null)
            .Select(value => value.ReferencedEntityId!.Value)
            .Distinct()
            .ToList();

        var liveReferencedIds = await db.Entities.AsNoTracking()
            .Where(entity => referencedIds.Contains(entity.Id) && entity.UniverseId == universeId)
            .Select(entity => entity.Id)
            .ToListAsync(cancellationToken);

        foreach (var value in revision.FieldValues
            .Where(value => value.ReferencedEntityId is { } id && !liveReferencedIds.Contains(id)))
        {
            missing.Add($"the entry \"{value.ReferencedEntityName ?? value.FieldName}\"");
        }

        var eraIds = revision.FieldValues
            .Where(value => value.EraId is not null)
            .Select(value => value.EraId!.Value)
            .Distinct()
            .ToList();

        var liveEraIds = await db.ChronologyEras.AsNoTracking()
            .Where(era => eraIds.Contains(era.Id) && era.UniverseId == universeId)
            .Select(era => era.Id)
            .ToListAsync(cancellationToken);

        foreach (var value in revision.FieldValues
            .Where(value => value.EraId is { } id && !liveEraIds.Contains(id))
            .DistinctBy(value => value.EraId))
        {
            missing.Add($"the date period \"{value.EraLabel ?? value.FieldName}\"");
        }

        return missing;
    }

    /// <summary>
    /// The snapshot as an ordinary update request. Multi-select option rows are folded back
    /// into one input per field, which is the shape the write path expects from a client.
    /// </summary>
    private static EntityRequest RequestFrom(EntityRevision revision)
    {
        var fields = revision.FieldValues
            .GroupBy(value => value.FieldDefinitionId)
            .Select(group => new FieldValueInput(
                group.Key,
                group.Select(value => value.TextValue).FirstOrDefault(text => text != null),
                group.Select(value => value.NumberValue).FirstOrDefault(number => number != null),
                group.Select(value => value.BooleanValue).FirstOrDefault(flag => flag != null),
                group.Select(value => value.DateValue).FirstOrDefault(date => date != null),
                [.. group.Where(value => value.OptionId is not null).Select(value => value.OptionId!.Value)],
                group.Select(value => value.ReferencedEntityId).FirstOrDefault(id => id != null),
                group.Select(value => value.EraId).FirstOrDefault(id => id != null)))
            .ToList();

        // No article. A version recorded before articles kept their own history still holds a
        // copy of one, and it is never applied: putting back an old name or status must not
        // put back - or wipe - an article saved since (ADR 0028).
        return new EntityRequest(
            revision.EntityTypeId,
            revision.Name,
            revision.Summary,
            revision.CanonStatus,
            [.. revision.Aliases.Select(alias => alias.Value)],
            [.. revision.Tags.Select(tag => tag.Name)],
            fields);
    }

    /// <summary>
    /// ProblemDetails, like every other refusal on this API, with a stable code so a client
    /// need not match prose. The names quoted are the ones the snapshot itself recorded, all
    /// of them inside the universe the caller has already proved they own.
    /// </summary>
    private static IResult NotRestorable(IReadOnlyList<string> missing) =>
        Results.Problem(
            title: "Version cannot be restored",
            detail: $"This version still refers to {string.Join(", ", missing)}, "
                + "which no longer exists, so it cannot be put back exactly as it was.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = NotRestorableCode,
                ["missing"] = missing,
            });
}
