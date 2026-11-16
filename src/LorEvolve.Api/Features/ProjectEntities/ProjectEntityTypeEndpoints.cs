using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// A project's own schema: the types a game, a series, a film or a comic defines for itself, and the fields on them
/// (#144).
///
/// <para>These are the same <c>EntityTypes</c> rows the lore uses, scoped by <see cref="EntityType.ProjectId"/> (#143),
/// so there is one schema engine and not one per kind of project. What differs is the way in: a lore type is reached
/// through its universe and these are reached through their project, which resolves to that universe's permissions
/// through <see cref="ProjectAccess"/>. Nothing here decides access again.</para>
///
/// <para>Every read says <c>IgnoreQueryFilters</c> with the project named, because the filter that keeps a project's
/// types out of the lore would otherwise keep them out of their own screen too.</para>
/// </summary>
public static class ProjectEntityTypeEndpoints
{
    /// <summary>The 409 for deleting a type a project's entries still use.</summary>
    public const string TypeInUseCode = "project_entity_type_in_use";

    /// <summary>The 409 for deleting a type that still has types nested under it.</summary>
    public const string TypeHasChildrenCode = "project_entity_type_has_children";

    /// <summary>The 409 for deleting a field that still holds values.</summary>
    public const string FieldInUseCode = "project_entity_field_in_use";

    /// <summary>Stable marker for a type move that would take an inherited image field from entries holding pictures in it.</summary>
    public const string InheritedPicturesCode = "project_entity_type_inherited_pictures";

    /// <summary>How many types one project may define, and how many fields one type may have.</summary>
    public const int MaxTypesPerProject = 200;

    public const int MaxFieldsPerType = 60;

    public const int MaxOptionsPerField = 60;

    public static IEndpointRouteBuilder MapProjectEntityTypeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/projects/{projectId:guid}/entity-types")
            .WithTags("Project entity types")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListProjectEntityTypes");
        group.MapPost("/", CreateAsync).WithName("CreateProjectEntityType");
        group.MapPut("/{typeId:guid}", UpdateAsync).WithName("UpdateProjectEntityType");
        group.MapDelete("/{typeId:guid}", DeleteAsync).WithName("DeleteProjectEntityType");

        group.MapPost("/{typeId:guid}/fields", AddFieldAsync).WithName("AddProjectEntityField");
        group.MapPut("/{typeId:guid}/fields/{fieldId:guid}", UpdateFieldAsync).WithName("UpdateProjectEntityField");
        group.MapDelete("/{typeId:guid}/fields/{fieldId:guid}", DeleteFieldAsync).WithName("DeleteProjectEntityField");

        endpoints.MapGet("/api/projects/{projectId:guid}/template", TemplateAsync)
            .WithTags("Project entity types")
            .RequireAuthorization()
            .WithName("GetProjectTemplate");

        endpoints.MapPost("/api/projects/{projectId:guid}/template", ApplyTemplateAsync)
            .WithTags("Project entity types")
            .RequireAuthorization()
            .WithName("ApplyProjectTemplate");

        return endpoints;
    }

    /// <summary>
    /// The project, when the caller may read it; otherwise the answer to send. A project the caller cannot reach is
    /// answered exactly as a missing one, so no route tells one account another's project exists.
    /// </summary>
    internal static async Task<(CreativeProject? Project, IResult? Denied)> ReadableAsync(
        LorEvolveDbContext db,
        Guid projectId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var project = await ProjectAccess.Readable(db, principal.RequireUserId())
            .AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == projectId, cancellationToken);

        return project is null ? (null, Results.NotFound()) : (project, null);
    }

    /// <summary>The project, when the caller may change it. Changing goes through its universe's matrix.</summary>
    internal static async Task<(CreativeProject? Project, IResult? Denied)> WritableAsync(
        LorEvolveDbContext db,
        Guid projectId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await ReadableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return (null, denied);
        }

        return await ProjectAccess.DenyChangeAsync(db, project!, principal, cancellationToken) is { } refused
            ? (null, refused)
            : (project, null);
    }

    private static async Task<IResult> ListAsync(
        Guid projectId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await ReadableAsync(db, projectId, principal, cancellationToken);

        return denied ?? Results.Ok(await LoadTypesAsync(db, project!, cancellationToken));
    }

    /// <summary>
    /// Every type of one project, each with the fields defined on it and the fields it inherits. Inheritance is read
    /// from the lineage, by the same helper the lore uses, over this project's types only: a project's type cannot sit
    /// under a lore type, and the database refuses such a parent outright (#143).
    /// </summary>
    internal static async Task<List<ProjectEntityTypeResponse>> LoadTypesAsync(
        LorEvolveDbContext db,
        CreativeProject project,
        CancellationToken cancellationToken)
    {
        var types = await db.EntityTypes.AsNoTracking().IgnoreQueryFilters()
            .Where(type => type.UniverseId == project.UniverseId && type.ProjectId == project.Id)
            .OrderBy(type => type.DisplayOrder).ThenBy(type => type.Name)
            .ToListAsync(cancellationToken);

        if (types.Count == 0)
        {
            return [];
        }

        var typeIds = types.Select(type => type.Id).ToList();

        var fields = await db.EntityFieldDefinitions.AsNoTracking().IgnoreQueryFilters()
            .Include(field => field.Options)
            .Where(field => typeIds.Contains(field.EntityTypeId) && field.ArchivedAt == null)
            .OrderBy(field => field.DisplayOrder).ThenBy(field => field.Name)
            .ToListAsync(cancellationToken);

        var counts = await db.Entities.AsNoTracking().IgnoreQueryFilters()
            .Where(entry => entry.ProjectId == project.Id && entry.DeletedAt == null)
            .GroupBy(entry => entry.EntityTypeId)
            .Select(group => new { TypeId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(row => row.TypeId, row => row.Count, cancellationToken);

        var ownFields = fields
            .GroupBy(field => field.EntityTypeId)
            .ToDictionary(group => group.Key, group => group.Select(Describe).ToList());

        var parentOf = types.ToDictionary(type => type.Id, type => type.ParentId);

        return
        [
            .. types.Select(type => new ProjectEntityTypeResponse(
                type.Id,
                type.Name,
                type.Description,
                type.Icon,
                type.AccentColor,
                type.ParentId,
                type.DisplayOrder,
                counts.GetValueOrDefault(type.Id),
                ownFields.GetValueOrDefault(type.Id) ?? [],
                [
                    .. EntityTypeHierarchy.Lineage(parentOf, type.Id)
                        .Where(ancestor => ancestor != type.Id)
                        .SelectMany(ancestor => ownFields.GetValueOrDefault(ancestor) ?? []),
                ])),
        ];
    }

    private static ProjectEntityFieldResponse Describe(EntityFieldDefinition field) => new(
        field.Id,
        field.Name,
        field.Kind,
        field.IsRequired,
        field.DisplayOrder,
        [
            .. field.Options.OrderBy(option => option.DisplayOrder).ThenBy(option => option.Value, StringComparer.Ordinal)
                .Select(option => new ProjectEntityFieldOptionResponse(option.Id, option.Value, option.DisplayOrder)),
        ],
        field.ImageShape);

    private static async Task<IResult> CreateAsync(
        Guid projectId,
        [FromBody] ProjectEntityTypeRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        return denied ?? await CreateTypeCoreAsync(db, project!, request, cancellationToken);
    }

    // ---------- The cores an approved AI change commits through ----------
    //
    // Each runs after the caller's check: the route's access check, or an approved AI change's own checks, run inside the
    // approval's transaction. One path, so a proposal cannot write what a route would refuse.

    /// <summary>Creates a type of the project. The result is the route's own, the created type with its fields.</summary>
    internal static async Task<IResult> CreateTypeCoreAsync(
        LorEvolveDbContext db,
        CreativeProject project,
        ProjectEntityTypeRequest request,
        CancellationToken cancellationToken)
    {
        var projectId = project.Id;

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var existing = await db.EntityTypes.IgnoreQueryFilters()
            .Where(type => type.ProjectId == projectId)
            .ToListAsync(cancellationToken);

        if (existing.Count >= MaxTypesPerProject)
        {
            return Problems.Field("name", $"A project can have at most {MaxTypesPerProject} types.");
        }

        if (existing.Any(type => string.Equals(type.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            return NameTaken();
        }

        // A parent must be a type of this same project. The database says so too (#143), and would answer with a
        // trigger's message; this says it by field, which is what a form can show.
        if (request.ParentId is { } parentId && existing.All(type => type.Id != parentId))
        {
            return ParentMissing();
        }

        var now = DateTime.UtcNow;
        var created = new EntityType
        {
            Id = Guid.NewGuid(),
            UniverseId = project.UniverseId,
            ProjectId = projectId,
            Name = name,
            Description = LoreValidation.Normalize(request.Description),
            Icon = LoreValidation.Normalize(request.Icon),
            AccentColor = LoreValidation.NormalizeAccent(request.AccentColor),
            ParentId = request.ParentId,
            DisplayOrder = existing.Count == 0 ? 0 : existing.Max(type => type.DisplayOrder) + 1,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.EntityTypes.Add(created);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTaken();
        }

        await transaction.CommitAsync(cancellationToken);

        var types = await LoadTypesAsync(db, project, cancellationToken);
        return Results.Created(
            $"/api/projects/{projectId}/entity-types/{created.Id}",
            types.First(type => type.Id == created.Id));
    }

    private static async Task<IResult> UpdateAsync(
        Guid projectId,
        Guid typeId,
        [FromBody] ProjectEntityTypeRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        return denied ?? await UpdateTypeCoreAsync(db, project!, typeId, request, cancellationToken);
    }

    /// <summary>Saves a type of the project. The result is the route's own, the saved type with its fields.</summary>
    internal static async Task<IResult> UpdateTypeCoreAsync(
        LorEvolveDbContext db,
        CreativeProject project,
        Guid typeId,
        ProjectEntityTypeRequest request,
        CancellationToken cancellationToken)
    {
        var projectId = project.Id;

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var types = await db.EntityTypes.IgnoreQueryFilters()
            .Where(type => type.ProjectId == projectId)
            .ToListAsync(cancellationToken);

        var type = types.FirstOrDefault(candidate => candidate.Id == typeId);

        if (type is null)
        {
            return Results.NotFound();
        }

        var name = request.Name!.Trim();

        if (types.Any(other => other.Id != typeId && string.Equals(other.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            return NameTaken();
        }

        if (request.ParentId is { } parentId)
        {
            if (types.All(other => other.Id != parentId))
            {
                return ParentMissing();
            }

            // A type inside itself, or inside one of its own descendants, is a cycle no listing could draw. Checked on
            // the graph as it stands, before the move: the new parent must not already be beneath this type.
            var parentOf = types.ToDictionary(each => each.Id, each => each.ParentId);

            if (parentId == typeId || EntityTypeHierarchy.IsWithin(parentOf, parentId, typeId))
            {
                return Problems.Field("parentId", "A type cannot be put inside itself.");
            }
        }

        // A move that takes an inherited image field from entries holding pictures in it is refused (Issue #238): nothing is
        // dropped to make it. Values are not checked here, as before.
        if (request.ParentId != type.ParentId)
        {
            var graph = types.ToDictionary(each => each.Id, each => each.ParentId);
            var before = type.ParentId is { } oldParent ? EntityTypeHierarchy.Lineage(graph, oldParent) : [];
            var after = request.ParentId is { } newParent ? EntityTypeHierarchy.Lineage(graph, newParent) : [];
            var lost = before.Except(after).ToList();
            var moving = EntityTypeHierarchy.Branch(graph, typeId).ToList();

            if (lost.Count > 0
                && await db.EntityFieldImages.IgnoreQueryFilters().AnyAsync(
                    image => lost.Contains(image.FieldDefinition!.EntityTypeId) && moving.Contains(image.Entity!.EntityTypeId),
                    cancellationToken))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status409Conflict,
                    title: "Entries hold inherited pictures",
                    detail: $"{type.Name} can't move there because its entries, or entries of a type nested in it, hold pictures "
                        + "in an image field it inherits. It would no longer have that field. Remove those pictures first, or keep it where it is.",
                    extensions: new Dictionary<string, object?> { ["code"] = InheritedPicturesCode });
            }
        }

        type.Name = name;
        type.Description = LoreValidation.Normalize(request.Description);
        type.Icon = LoreValidation.Normalize(request.Icon);
        type.AccentColor = LoreValidation.NormalizeAccent(request.AccentColor);
        type.ParentId = request.ParentId;
        type.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTaken();
        }

        await transaction.CommitAsync(cancellationToken);

        var loaded = await LoadTypesAsync(db, project, cancellationToken);
        return Results.Ok(loaded.First(each => each.Id == typeId));
    }

    private static async Task<IResult> DeleteAsync(
        Guid projectId,
        Guid typeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var type = await db.EntityTypes.IgnoreQueryFilters()
            .FirstOrDefaultAsync(candidate => candidate.Id == typeId && candidate.ProjectId == projectId, cancellationToken);

        if (type is null)
        {
            return Results.NotFound();
        }

        // An entry of this type, in the Trash or not, keeps it: deleting the type would leave the entry pointing at
        // nothing. The entries are moved to another type first, which is the author's decision and not this route's.
        var entries = await db.Entities.IgnoreQueryFilters()
            .CountAsync(entry => entry.EntityTypeId == typeId, cancellationToken);

        if (entries > 0)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Type still in use",
                detail: entries == 1
                    ? $"{type.Name} can't be deleted because 1 entry still uses it. Move it to another type first."
                    : $"{type.Name} can't be deleted because {entries} entries still use it. Move them to another type first.",
                extensions: new Dictionary<string, object?> { ["code"] = TypeInUseCode });
        }

        var children = await db.EntityTypes.IgnoreQueryFilters()
            .CountAsync(candidate => candidate.ParentId == typeId, cancellationToken);

        if (children > 0)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Type still has types in it",
                detail: children == 1
                    ? $"{type.Name} can't be deleted because 1 type is still inside it. Move or delete that type first."
                    : $"{type.Name} can't be deleted because {children} types are still inside it. Move or delete those types first.",
                extensions: new Dictionary<string, object?> { ["code"] = TypeHasChildrenCode });
        }

        db.EntityTypes.Remove(type);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> AddFieldAsync(
        Guid projectId,
        Guid typeId,
        [FromBody] ProjectEntityFieldRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        return denied ?? await AddFieldCoreAsync(db, project!, typeId, request, cancellationToken);
    }

    /// <summary>Adds a field to a type of the project. The result is the route's own, the type with its fields.</summary>
    internal static async Task<IResult> AddFieldCoreAsync(
        LorEvolveDbContext db,
        CreativeProject project,
        Guid typeId,
        ProjectEntityFieldRequest request,
        CancellationToken cancellationToken)
    {
        var projectId = project.Id;

        if (ValidateField(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (!await db.EntityTypes.IgnoreQueryFilters()
                .AnyAsync(type => type.Id == typeId && type.ProjectId == projectId, cancellationToken))
        {
            return Results.NotFound();
        }

        var fields = await db.EntityFieldDefinitions.IgnoreQueryFilters()
            .Where(field => field.EntityTypeId == typeId)
            .ToListAsync(cancellationToken);

        if (fields.Count >= MaxFieldsPerType)
        {
            return Problems.Field("name", $"A type can have at most {MaxFieldsPerType} fields.");
        }

        var name = request.Name!.Trim();

        if (fields.Any(field => string.Equals(field.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            return Problems.Field("name", "This type already has a field with that name.");
        }

        // A required field cannot be added to a type whose entries already exist with nothing in it, or every one of
        // them would be invalid the moment it is saved again.
        if (request.IsRequired is true
            && await db.Entities.IgnoreQueryFilters().AnyAsync(entry => entry.EntityTypeId == typeId, cancellationToken))
        {
            return Problems.Field(
                "isRequired",
                "Entries of this type already exist, so a new field cannot be required. Add it, fill it in, then make it required.");
        }

        var field = new EntityFieldDefinition
        {
            Id = Guid.NewGuid(),
            EntityTypeId = typeId,
            Name = name,
            Kind = request.Kind,
            IsRequired = request.IsRequired ?? false,
            DisplayOrder = fields.Count == 0 ? 0 : fields.Max(each => each.DisplayOrder) + 1,
            ImageShape = request.Kind == EntityFieldKind.Image ? request.ImageShape ?? FieldImageShape.Free : null,
        };

        db.EntityFieldDefinitions.Add(field);
        AddOptions(db, field, request);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var types = await LoadTypesAsync(db, project, cancellationToken);
        return Results.Created(
            $"/api/projects/{projectId}/entity-types/{typeId}/fields/{field.Id}",
            types.First(type => type.Id == typeId));
    }

    private static async Task<IResult> UpdateFieldAsync(
        Guid projectId,
        Guid typeId,
        Guid fieldId,
        [FromBody] ProjectEntityFieldRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        return denied ?? await UpdateFieldCoreAsync(db, project!, typeId, fieldId, request, cancellationToken);
    }

    /// <summary>Saves a field of a type of the project. The result is the route's own, the type with its fields.</summary>
    internal static async Task<IResult> UpdateFieldCoreAsync(
        LorEvolveDbContext db,
        CreativeProject project,
        Guid typeId,
        Guid fieldId,
        ProjectEntityFieldRequest request,
        CancellationToken cancellationToken)
    {
        var projectId = project.Id;

        if (ValidateField(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (!await db.EntityTypes.IgnoreQueryFilters()
                .AnyAsync(type => type.Id == typeId && type.ProjectId == projectId, cancellationToken))
        {
            return Results.NotFound();
        }

        var field = await db.EntityFieldDefinitions.IgnoreQueryFilters()
            .Include(each => each.Options)
            .FirstOrDefaultAsync(each => each.Id == fieldId && each.EntityTypeId == typeId, cancellationToken);

        if (field is null)
        {
            return Results.NotFound();
        }

        var name = request.Name!.Trim();

        if (await db.EntityFieldDefinitions.IgnoreQueryFilters().AnyAsync(
                other => other.EntityTypeId == typeId && other.Id != fieldId && other.Name == name,
                cancellationToken))
        {
            return Problems.Field("name", "This type already has a field with that name.");
        }

        // The kind is locked once the field holds a value: reinterpreting a stored number as a date would not convert
        // the data, it would change what it means.
        var held = await db.EntityFieldValues.CountAsync(value => value.FieldDefinitionId == fieldId, cancellationToken)
            + await db.EntityFieldImages.CountAsync(image => image.FieldDefinitionId == fieldId, cancellationToken);

        if (held > 0 && field.Kind != request.Kind)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Field holds values",
                detail: $"{field.Name} already holds values, so its kind cannot be changed. Add a new field instead.",
                extensions: new Dictionary<string, object?> { ["code"] = FieldInUseCode });
        }

        field.Name = name;
        field.Kind = request.Kind;
        field.IsRequired = request.IsRequired ?? false;

        // A new shape keeps the stored pictures as they are; the next crop uses it (Issue #238).
        field.ImageShape = request.Kind == EntityFieldKind.Image ? request.ImageShape ?? field.ImageShape ?? FieldImageShape.Free : null;

        // The options a save sends are the complete set. Removing one an entry has chosen is refused rather than
        // silently clearing that entry's value.
        if (request.Options is not null)
        {
            var wanted = Options(request);
            var removed = field.Options.Where(option => !wanted.Contains(option.Value, StringComparer.OrdinalIgnoreCase)).ToList();
            var removedIds = removed.Select(option => option.Id).ToList();

            if (removedIds.Count > 0
                && await db.EntityFieldValues.AnyAsync(value => value.OptionId != null && removedIds.Contains(value.OptionId.Value), cancellationToken))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status409Conflict,
                    title: "Choice still in use",
                    detail: $"A choice being removed from {field.Name} is still chosen by an entry. Change those entries first.",
                    extensions: new Dictionary<string, object?> { ["code"] = FieldInUseCode });
            }

            db.EntityFieldOptions.RemoveRange(removed);

            var kept = field.Options.Except(removed).ToList();
            var order = 0;

            foreach (var value in wanted)
            {
                var existing = kept.FirstOrDefault(option => string.Equals(option.Value, value, StringComparison.OrdinalIgnoreCase));

                if (existing is null)
                {
                    db.EntityFieldOptions.Add(new EntityFieldOption
                    {
                        Id = Guid.NewGuid(),
                        FieldDefinitionId = fieldId,
                        Value = value,
                        DisplayOrder = order,
                    });
                }
                else
                {
                    existing.Value = value;
                    existing.DisplayOrder = order;
                }

                order++;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var types = await LoadTypesAsync(db, project, cancellationToken);
        return Results.Ok(types.First(type => type.Id == typeId));
    }

    private static async Task<IResult> DeleteFieldAsync(
        Guid projectId,
        Guid typeId,
        Guid fieldId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (!await db.EntityTypes.IgnoreQueryFilters()
                .AnyAsync(type => type.Id == typeId && type.ProjectId == projectId, cancellationToken))
        {
            return Results.NotFound();
        }

        var field = await db.EntityFieldDefinitions.IgnoreQueryFilters()
            .FirstOrDefaultAsync(each => each.Id == fieldId && each.EntityTypeId == typeId, cancellationToken);

        if (field is null)
        {
            return Results.NotFound();
        }

        // Deleting a field that holds values would destroy what an author wrote, with nothing to undo it from. The
        // values are cleared first, entry by entry, which is a decision the author makes and sees.
        if (await db.EntityFieldValues.AnyAsync(value => value.FieldDefinitionId == fieldId, cancellationToken))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Field holds values",
                detail: $"{field.Name} can't be deleted because entries still have a value for it. Clear those values first.",
                extensions: new Dictionary<string, object?> { ["code"] = FieldInUseCode });
        }

        // An image field's pictures go with it (Issue #238): the rows with the field, the objects once that is saved.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);
        var pictureKeys = await EntityFieldImageEndpoints.DropFieldAsync(db, fieldId, cancellationToken);
        db.EntityFieldDefinitions.Remove(field);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        await EntityFieldImageEndpoints.SweepAsync(store, loggerFactory, pictureKeys);

        return Results.NoContent();
    }

    private static async Task<IResult> TemplateAsync(
        Guid projectId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await ReadableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var template = ProjectTemplates.For(project!.Kind, project.Subtype);
        var applied = await db.EntityTypes.IgnoreQueryFilters()
            .AnyAsync(type => type.ProjectId == projectId, cancellationToken);

        return Results.Ok(new ProjectTemplateResponse(
            template.Name,
            [.. template.Types.Select(type => type.Name)],
            applied));
    }

    /// <summary>
    /// Writes the starter types for this project's kind. Offered rather than imposed: a project starts with no types at
    /// all, this is applied when the author asks for it, and what it writes is ordinary types they may rename, delete
    /// or add to afterwards. Refused once the project has any type, so it can never overwrite an author's own schema.
    /// </summary>
    private static async Task<IResult> ApplyTemplateAsync(
        Guid projectId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (await db.EntityTypes.IgnoreQueryFilters().AnyAsync(type => type.ProjectId == projectId, cancellationToken))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "This project already has types",
                detail: "The starter types are only offered to a project with none, so nothing here replaces types you have already made.",
                extensions: new Dictionary<string, object?> { ["code"] = TypeInUseCode });
        }

        var now = DateTime.UtcNow;
        var order = 0;

        foreach (var starter in ProjectTemplates.For(project!.Kind, project.Subtype).Types)
        {
            var type = new EntityType
            {
                Id = Guid.NewGuid(),
                UniverseId = project.UniverseId,
                ProjectId = projectId,
                Name = starter.Name,
                Description = starter.Description,
                DisplayOrder = order++,
                CreatedAt = now,
                UpdatedAt = now,
            };

            db.EntityTypes.Add(type);

            var fieldOrder = 0;

            foreach (var starterField in starter.Fields)
            {
                var field = new EntityFieldDefinition
                {
                    Id = Guid.NewGuid(),
                    EntityTypeId = type.Id,
                    Name = starterField.Name,
                    Kind = starterField.Kind,
                    IsRequired = false,
                    DisplayOrder = fieldOrder++,
                };

                db.EntityFieldDefinitions.Add(field);

                var optionOrder = 0;

                foreach (var option in starterField.Options)
                {
                    db.EntityFieldOptions.Add(new EntityFieldOption
                    {
                        Id = Guid.NewGuid(),
                        FieldDefinitionId = field.Id,
                        Value = option,
                        DisplayOrder = optionOrder++,
                    });
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadTypesAsync(db, project, cancellationToken));
    }

    private static void AddOptions(LorEvolveDbContext db, EntityFieldDefinition field, ProjectEntityFieldRequest request)
    {
        var order = 0;

        foreach (var value in Options(request))
        {
            db.EntityFieldOptions.Add(new EntityFieldOption
            {
                Id = Guid.NewGuid(),
                FieldDefinitionId = field.Id,
                Value = value,
                DisplayOrder = order++,
            });
        }
    }

    /// <summary>The choices a save stores: trimmed, blanks dropped, each once ignoring case, first spelling kept.</summary>
    internal static List<string> Options(ProjectEntityFieldRequest request)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var kept = new List<string>();

        foreach (var raw in request.Options ?? [])
        {
            var value = raw?.Trim();

            if (!string.IsNullOrWhiteSpace(value) && seen.Add(value))
            {
                kept.Add(value);
            }
        }

        return kept;
    }

    internal static Dictionary<string, string[]>? Validate(ProjectEntityTypeRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors["name"] = ["Give the type a name."];
        }
        else if (request.Name.Trim().Length > LoreLimits.NameMaxLength)
        {
            errors["name"] = ["That name is too long."];
        }

        if (request.Description is { Length: > LoreLimits.DescriptionMaxLength })
        {
            errors["description"] = ["That description is too long."];
        }

        if (LoreValidation.Normalize(request.Icon) is { } icon && !EntityTypeIcons.IsKnown(icon))
        {
            errors["icon"] = ["That is not one of the icons LorEvolve has. Choose one from the list, or none."];
        }

        return errors.Count == 0 ? null : errors;
    }

    internal static Dictionary<string, string[]>? ValidateField(ProjectEntityFieldRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors["name"] = ["Give the field a name."];
        }
        else if (request.Name.Trim().Length > LoreLimits.NameMaxLength)
        {
            errors["name"] = ["That name is too long."];
        }

        if (!Enum.IsDefined(request.Kind))
        {
            errors["kind"] = ["That is not a kind of field LorEvolve has."];
        }

        var options = Options(request);

        if (options.Count > MaxOptionsPerField)
        {
            errors["options"] = [$"A field can have at most {MaxOptionsPerField} choices."];
        }

        // A list of choices with no choices in it cannot be filled in, so it is refused rather than stored as a field
        // nothing can answer.
        if (request.Kind is EntityFieldKind.Select or EntityFieldKind.MultiSelect && options.Count == 0)
        {
            errors["options"] = ["A field of choices needs at least one choice."];
        }

        if (request.Kind is not (EntityFieldKind.Select or EntityFieldKind.MultiSelect) && options.Count > 0)
        {
            errors["options"] = ["Only a field of choices has choices."];
        }

        LoreValidation.ValidateImageField(errors, request.Kind, request.ImageShape, request.IsRequired is true);

        return errors.Count == 0 ? null : errors;
    }

    private static IResult NameTaken() =>
        Problems.Field("name", "This project already has a type with that name.");

    private static IResult ParentMissing() =>
        Problems.Field("parentId", "Choose a type from this project, or none.");
}
