using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.TypeTemplates;

/// <summary>
/// A universe's reusable types (#281): blueprints a project's author can start a type from. They live beside the
/// universe, not inside any project, and nothing points at them, so creating, changing or deleting one never touches a
/// project's types or entries. Validation is the project types' own (<see cref="ProjectEntityTypeEndpoints"/>), so a
/// template accepts exactly what a project type would, less a parent and a link to an entry.
///
/// <para>Every query names the route's universe beside the template id, so an id from another universe is a 404.</para>
/// </summary>
public static class TypeTemplateEndpoints
{
    public const int MaxTemplatesPerUniverse = ProjectEntityTypeEndpoints.MaxTypesPerProject;

    public static IEndpointRouteBuilder MapTypeTemplateEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/type-templates")
            .WithTags("Type templates")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListTypeTemplates");
        group.MapGet("/{templateId:guid}", GetAsync).WithName("GetTypeTemplate");
        group.MapPost("/", CreateAsync).WithName("CreateTypeTemplate");
        group.MapPut("/{templateId:guid}", UpdateAsync).WithName("UpdateTypeTemplate");
        group.MapDelete("/{templateId:guid}", DeleteAsync).WithName("DeleteTypeTemplate");

        group.MapPost("/{templateId:guid}/fields", AddFieldAsync).WithName("AddTypeTemplateField");
        group.MapPut("/{templateId:guid}/fields/{fieldId:guid}", UpdateFieldAsync).WithName("UpdateTypeTemplateField");
        group.MapDelete("/{templateId:guid}/fields/{fieldId:guid}", DeleteFieldAsync).WithName("DeleteTypeTemplateField");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (denied, _) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var templates = await Query(db, universeId).OrderBy(template => template.Name).ToListAsync(cancellationToken);
        return Results.Ok(templates.Select(ToResponse).ToList());
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid templateId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (denied, _) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        return await LoadAsync(db, universeId, templateId, cancellationToken) is { } template
            ? Results.Ok(ToResponse(template))
            : Results.NotFound();
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        ProjectEntityTypeRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (denied, _) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (Refused(request) is { } refused)
        {
            return refused;
        }

        var name = request.Name!.Trim();

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var names = await db.TypeTemplates
            .Where(template => template.UniverseId == universeId)
            .Select(template => template.Name)
            .ToListAsync(cancellationToken);

        if (names.Count >= MaxTemplatesPerUniverse)
        {
            return Problems.Field("name", $"A universe can have at most {MaxTemplatesPerUniverse} templates.");
        }

        if (names.Any(each => string.Equals(each, name, StringComparison.OrdinalIgnoreCase)))
        {
            return NameTaken();
        }

        var now = DateTime.UtcNow;
        var template = new TypeTemplate
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Name = name,
            Description = LoreValidation.Normalize(request.Description),
            Icon = LoreValidation.Normalize(request.Icon),
            AccentColor = LoreValidation.NormalizeAccent(request.AccentColor),
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.TypeTemplates.Add(template);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTaken();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Created($"/api/universes/{universeId}/type-templates/{template.Id}", ToResponse(template));
    }

    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid templateId,
        ProjectEntityTypeRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (denied, _) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (Refused(request) is { } refused)
        {
            return refused;
        }

        var template = await LoadAsync(db, universeId, templateId, cancellationToken, tracked: true);

        if (template is null)
        {
            return Results.NotFound();
        }

        var name = request.Name!.Trim();

        if (await db.TypeTemplates.AnyAsync(
                other => other.UniverseId == universeId && other.Id != templateId && other.Name.ToLower() == name.ToLower(),
                cancellationToken))
        {
            return NameTaken();
        }

        template.Name = name;
        template.Description = LoreValidation.Normalize(request.Description);
        template.Icon = LoreValidation.Normalize(request.Icon);
        template.AccentColor = LoreValidation.NormalizeAccent(request.AccentColor);
        template.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return NameTaken();
        }

        return Results.Ok(ToResponse(template));
    }

    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid templateId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (denied, _) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var deleted = await db.TypeTemplates
            .Where(template => template.UniverseId == universeId && template.Id == templateId)
            .ExecuteDeleteAsync(cancellationToken);

        return deleted == 0 ? Results.NotFound() : Results.NoContent();
    }

    private static async Task<IResult> AddFieldAsync(
        Guid universeId,
        Guid templateId,
        ProjectEntityFieldRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (denied, _) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (Refused(request) is { } refused)
        {
            return refused;
        }

        var template = await LoadAsync(db, universeId, templateId, cancellationToken, tracked: true);

        if (template is null)
        {
            return Results.NotFound();
        }

        if (template.Fields.Count >= ProjectEntityTypeEndpoints.MaxFieldsPerType)
        {
            return Problems.Field("name", $"A type can have at most {ProjectEntityTypeEndpoints.MaxFieldsPerType} fields.");
        }

        var name = request.Name!.Trim();

        if (template.Fields.Any(field => string.Equals(field.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            return FieldNameTaken();
        }

        var field = new TypeTemplateField
        {
            Id = Guid.NewGuid(),
            TemplateId = templateId,
            DisplayOrder = template.Fields.Count == 0 ? 0 : template.Fields.Max(each => each.DisplayOrder) + 1,
        };

        Apply(field, request, name);
        db.TypeTemplateFields.Add(field);
        template.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Created(
            $"/api/universes/{universeId}/type-templates/{templateId}/fields/{field.Id}",
            ToResponse(template));
    }

    private static async Task<IResult> UpdateFieldAsync(
        Guid universeId,
        Guid templateId,
        Guid fieldId,
        ProjectEntityFieldRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (denied, _) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (Refused(request) is { } refused)
        {
            return refused;
        }

        var template = await LoadAsync(db, universeId, templateId, cancellationToken, tracked: true);

        if (template?.Fields.FirstOrDefault(each => each.Id == fieldId) is not { } field)
        {
            return Results.NotFound();
        }

        var name = request.Name!.Trim();

        if (template.Fields.Any(each => each.Id != fieldId && string.Equals(each.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            return FieldNameTaken();
        }

        // Nothing holds a value of a template's field, so its kind may change and its choices are replaced as sent.
        db.TypeTemplateFieldOptions.RemoveRange(field.Options);
        field.Options = [];
        Apply(field, request, name);
        db.TypeTemplateFieldOptions.AddRange(field.Options);
        template.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(ToResponse(template));
    }

    private static async Task<IResult> DeleteFieldAsync(
        Guid universeId,
        Guid templateId,
        Guid fieldId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (denied, _) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var template = await LoadAsync(db, universeId, templateId, cancellationToken, tracked: true);

        if (template?.Fields.FirstOrDefault(each => each.Id == fieldId) is not { } field)
        {
            return Results.NotFound();
        }

        db.TypeTemplateFields.Remove(field);
        template.Fields.Remove(field);
        template.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static IQueryable<TypeTemplate> Query(LorEvolveDbContext db, Guid universeId) =>
        db.TypeTemplates.AsNoTracking()
            .Where(template => template.UniverseId == universeId)
            .Include(template => template.Fields)
            .ThenInclude(field => field.Options);

    private static Task<TypeTemplate?> LoadAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid templateId,
        CancellationToken cancellationToken,
        bool tracked = false)
    {
        var query = tracked ? Query(db, universeId).AsTracking() : Query(db, universeId);
        return query.FirstOrDefaultAsync(template => template.Id == templateId, cancellationToken);
    }

    private static void Apply(TypeTemplateField field, ProjectEntityFieldRequest request, string name)
    {
        field.Name = name;
        field.Kind = request.Kind;
        field.IsRequired = request.IsRequired ?? false;
        field.ImageShape = request.Kind == EntityFieldKind.Image ? request.ImageShape ?? FieldImageShape.Free : null;

        var order = 0;
        field.Options = [.. ProjectEntityTypeEndpoints.Options(request).Select(value => new TypeTemplateFieldOption
        {
            Id = Guid.NewGuid(),
            FieldId = field.Id,
            Value = value,
            DisplayOrder = order++,
        })];
    }

    private static IResult? Refused(ProjectEntityTypeRequest request)
    {
        if (ProjectEntityTypeEndpoints.Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        return request.ParentId is null
            ? null
            : Problems.Field("parentId", "A template cannot sit under another type.");
    }

    private static IResult? Refused(ProjectEntityFieldRequest request)
    {
        if (ProjectEntityTypeEndpoints.ValidateField(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        // A link names an entry of one universe's lore, which a blueprint shared by projects cannot hold.
        return request.Kind == EntityFieldKind.EntityReference
            ? Problems.Field("kind", "A template cannot hold a field that links to an entry.")
            : null;
    }

    private static TypeTemplateResponse ToResponse(TypeTemplate template) =>
        new(
            template.Id,
            template.Name,
            template.Description,
            template.Icon,
            template.AccentColor,
            template.CreatedAt,
            template.UpdatedAt,
            [.. template.Fields
                .OrderBy(field => field.DisplayOrder)
                .Select(field => new ProjectEntityFieldResponse(
                    field.Id,
                    field.Name,
                    field.Kind,
                    field.IsRequired,
                    field.DisplayOrder,
                    [.. field.Options
                        .OrderBy(option => option.DisplayOrder)
                        .Select(option => new ProjectEntityFieldOptionResponse(option.Id, option.Value, option.DisplayOrder))],
                    field.ImageShape))]);

    private static IResult NameTaken() =>
        Problems.Field("name", "This universe already has a template with that name.");

    private static IResult FieldNameTaken() =>
        Problems.Field("name", "This template already has a field with that name.");
}
