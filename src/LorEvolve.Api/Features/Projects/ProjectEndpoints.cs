using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Projects;

/// <summary>
/// An account's creative projects: the novels, games, series, films and comics it is making.
///
/// <b>Access is decided once</b>, in <see cref="ProjectAccess"/>: the owner, or a collaborator reaching the project
/// through the universe it is linked to. A project neither of those covers answers as a missing one does.
///
/// <b>Nothing here touches a story or a world.</b> No route reads or writes a Story, a scene, an entry, a timeline
/// moment or anything published, and linking a universe changes nothing inside it. Associating existing Stories with a
/// project is #140's work.
///
/// <b>No silent overwrite.</b> A save names the <c>version</c> it was written over; when the project has moved on since,
/// it is refused with 409 <c>project_changed</c> and nothing is written (ADR 0043). A save that would change nothing
/// writes nothing and leaves the version alone.
/// </summary>
public static class ProjectEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a save written over a project that has since changed.</summary>
    public const string ChangedCode = "project_changed";

    public static IEndpointRouteBuilder MapProjectEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/projects")
            .WithTags("Projects")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListProjects");
        group.MapPost("/", CreateAsync).WithName("CreateProject");
        group.MapGet("/{id:guid}", GetAsync).WithName("GetProject");
        group.MapPut("/{id:guid}", UpdateAsync).WithName("UpdateProject");

        return endpoints;
    }

    /// <summary>
    /// The projects the caller can reach, most recently updated first. <paramref name="universeId"/> narrows to one
    /// universe's projects.
    ///
    /// There is no filter for projects belonging to no universe, because there are none: every project is inside
    /// exactly one (#171).
    /// </summary>
    private static async Task<IResult> ListAsync(
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? universeId = null)
    {
        var userId = principal.RequireUserId();
        IQueryable<CreativeProject> query = ProjectAccess.Readable(db, userId)
            .AsNoTracking()
            .Include(project => project.Universe);

        if (universeId is { } id)
        {
            query = query.Where(project => project.UniverseId == id);
        }

        var projects = await query.ToListAsync(cancellationToken);
        var rows = projects.Select(project => Detail(project, userId)).ToList();

        // Every Story the caller can read is already a Writing Project, so the list says so rather than pretending an
        // author's existing work is not a project (#140). Nothing of the story is stored or copied: see StoryProjects.
        rows.AddRange(await StoryProjects.ReadableAsync(db, userId, universeId, cancellationToken));

        return Results.Ok(rows.OrderByDescending(project => project.UpdatedAt).ToList());
    }

    private static async Task<IResult> GetAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();
        var project = await ProjectAccess.Readable(db, userId)
            .AsNoTracking()
            .Include(candidate => candidate.Universe)
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        return project is null ? Results.NotFound() : Results.Ok(Detail(project, userId));
    }

    private static async Task<IResult> CreateAsync(
        [FromBody] ProjectRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await ProjectAccess.DenyLinkAsync(db, request.UniverseId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var userId = principal.RequireUserId();
        var now = DateTime.UtcNow;
        var project = new CreativeProject
        {
            Id = Guid.NewGuid(),
            OwnerId = userId,
            UniverseId = request.UniverseId!.Value,
            Kind = request.Kind,
            Lifecycle = request.Lifecycle,
            Subtype = Cleaned(request.Subtype),
            Name = request.Name!.Trim(),
            Summary = request.Summary ?? string.Empty,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1,
        };

        db.CreativeProjects.Add(project);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Created($"/api/projects/{project.Id}", await LoadAsync(db, project.Id, userId, cancellationToken));
    }

    /// <summary>
    /// Saves the project whole: name, kind, subtype, lifecycle, summary and universe link together. Refused while the
    /// project has changed since the edit began.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid id,
        [FromBody] ProjectRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var userId = principal.RequireUserId();

        // The read, the version check and the write are one transaction, so nothing lands between them.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var project = await db.CreativeProjects.FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        if (project is null || !await ProjectAccess.Readable(db, userId).AnyAsync(candidate => candidate.Id == id, cancellationToken))
        {
            return Results.NotFound();
        }

        if (await ProjectAccess.DenyChangeAsync(db, project, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!EditVersion.Matches(project.Version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                ChangedCode,
                "The project changed while you were editing.",
                "This project was changed somewhere else. Open it again to see the latest.",
                project.Version);
        }

        // Changing the link needs the same permission on the universe it moves into as creating one there would.
        if (project.UniverseId != request.UniverseId
            && await ProjectAccess.DenyLinkAsync(db, request.UniverseId, principal, cancellationToken) is { } refused)
        {
            return refused;
        }

        var name = request.Name!.Trim();
        var subtype = Cleaned(request.Subtype);
        var summary = request.Summary ?? string.Empty;
        var unchanged = project.Name == name
            && project.Kind == request.Kind
            && project.Lifecycle == request.Lifecycle
            && project.Subtype == subtype
            && project.Summary == summary
            && project.UniverseId == request.UniverseId!.Value;

        if (!unchanged)
        {
            project.Name = name;
            project.Kind = request.Kind;
            project.Lifecycle = request.Lifecycle;
            project.Subtype = subtype;
            project.Summary = summary;
            project.UniverseId = request.UniverseId!.Value;
            project.UpdatedAt = DateTime.UtcNow;
            project.Version++;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadAsync(db, id, userId, cancellationToken));
    }

    /// <summary>
    /// The field errors, or null when the request is sound. The enums travel as numbers, so an undeclared one is refused
    /// here rather than stored as an int nothing can read.
    /// </summary>
    private static Dictionary<string, string[]>? Validate(ProjectRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors["name"] = ["Give the project a name."];
        }
        else if (request.Name.Trim().Length > ProjectLimits.NameMaxLength)
        {
            errors["name"] = [$"A name is at most {ProjectLimits.NameMaxLength} characters."];
        }

        // Every project is inside exactly one universe (#171), so a request without one is a field error here rather
        // than a foreign key failure later.
        if (request.UniverseId is null || request.UniverseId == Guid.Empty)
        {
            errors["universeId"] = ["Choose the universe this project belongs to."];
        }

        if (!Enum.IsDefined(request.Kind))
        {
            errors["kind"] = ["That is not a kind of project LorEvolve knows."];
        }

        if (!Enum.IsDefined(request.Lifecycle))
        {
            errors["lifecycle"] = ["That is not a stage LorEvolve knows."];
        }

        if (Cleaned(request.Subtype) is { Length: > ProjectLimits.SubtypeMaxLength })
        {
            errors["subtype"] = [$"A subtype is at most {ProjectLimits.SubtypeMaxLength} characters."];
        }

        if ((request.Summary?.Length ?? 0) > ProjectLimits.SummaryMaxLength)
        {
            errors["summary"] = [$"A summary is at most {ProjectLimits.SummaryMaxLength} characters."];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>A subtype as it is stored: trimmed, and null rather than empty.</summary>
    private static string? Cleaned(string? subtype) =>
        string.IsNullOrWhiteSpace(subtype) ? null : subtype.Trim();

    private static async Task<ProjectDetail?> LoadAsync(
        LorEvolveDbContext db,
        Guid id,
        string userId,
        CancellationToken cancellationToken)
    {
        var project = await db.CreativeProjects.AsNoTracking()
            .Include(candidate => candidate.Universe)
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        return project is null ? null : Detail(project, userId);
    }

    /// <summary>One project as a client reads it, mapped after the rows are in hand.</summary>
    private static ProjectDetail Detail(CreativeProject project, string userId) =>
        new(
            project.Id,
            project.Name,
            project.Kind,
            project.Lifecycle,
            project.Subtype,
            project.Summary,
            project.Universe is not { } universe
                ? null
                : new ProjectUniverse(universe.Id, universe.Name, universe.AccentColor, universe.IsArchived),
            project.OwnerId == userId,
            Utc(project.CreatedAt),
            Utc(project.UpdatedAt),
            project.Version);

    /// <summary>
    /// SQLite hands a stored moment back with no kind, so every timestamp is stamped UTC on the way out. Without this a
    /// client parses <c>updatedAt</c> as local time and shows a project saved minutes ago as hours old.
    /// </summary>
    private static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
