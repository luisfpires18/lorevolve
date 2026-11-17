using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.RuleValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// A universe's Systems: named sets of rule definitions (ADR 0072).
///
/// <b>Universe-scoped and gated, first and always.</b> Every route passes <see cref="WorldLogicAccess"/> before
/// anything is read, and finds a System only by its id and that universe together.
///
/// <b>A System owns no rule.</b> Linking and unlinking a rule definition changes the link row and nothing else;
/// deleting a System deletes its links and leaves every rule definition standing.
///
/// <b>No silent overwrite.</b> A save names the <c>version</c> it was written over; when the System has moved on
/// since it is refused with 409 <c>system_changed</c> and nothing is written (ADR 0043). A save that would change
/// nothing writes nothing, leaves the version alone and writes no revision.
///
/// <b>Nothing here evaluates anything.</b> No route reads an entry, a relationship, a moment, Canon or a finding.
/// </summary>
public static class SystemEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a save written over a System that has since changed.</summary>
    public const string ChangedCode = "system_changed";

    /// <summary>The marker on the 409 for a name another System in the same scope already has.</summary>
    public const string NameTakenCode = "system_name_taken";

    public static IEndpointRouteBuilder MapSystemEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/systems")
            .WithTags("World Logic systems")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListSystems");
        group.MapPost("/", CreateAsync).WithName("CreateSystem");
        group.MapGet("/{id:guid}", GetAsync).WithName("GetSystem");
        group.MapPut("/{id:guid}", UpdateAsync).WithName("UpdateSystem");
        group.MapDelete("/{id:guid}", DeleteAsync).WithName("DeleteSystem");
        group.MapGet("/{id:guid}/revisions", RevisionsAsync).WithName("ListSystemRevisions");
        group.MapPut("/{id:guid}/rules/{ruleId:guid}", LinkAsync).WithName("LinkSystemRule");
        group.MapDelete("/{id:guid}/rules/{ruleId:guid}", UnlinkAsync).WithName("UnlinkSystemRule");

        return endpoints;
    }

    /// <summary>
    /// A page of the universe's Systems, by name - case folded, then as written, then by id - so the order is
    /// stable and says nothing about which System matters more. <paramref name="projectId"/> narrows to one
    /// project's, and <paramref name="universeScopeOnly"/> to the ones that are the whole universe's.
    /// </summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? projectId = null,
        [FromQuery] bool universeScopeOnly = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = WorldLogicLimits.DefaultPageSize)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        (page, pageSize) = WorldLogicAccess.Paging(page, pageSize);

        var query = db.LoreSystems.AsNoTracking().Where(system => system.UniverseId == universeId);

        if (projectId is { } project)
        {
            query = query.Where(system => system.ProjectId == project);
        }
        else if (universeScopeOnly)
        {
            query = query.Where(system => system.ProjectId == null);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var rows = await query
            .OrderBy(system => system.Name.ToLower())
            .ThenBy(system => system.Name)
            .ThenBy(system => system.Id)
            .Skip(skip)
            .Take(pageSize)
            .Select(system => new
            {
                system.Id,
                system.Name,
                system.Summary,
                system.Scope,
                system.ProjectId,
                system.Version,
                system.CreatedAt,
                system.UpdatedAt,
                RuleCount = system.Rules.Count,
            })
            .ToListAsync(cancellationToken);

        var items = rows.Select(row =>
        {
            var (excerpt, shortened) = WorldLogicAccess.Excerpt(row.Summary);
            return new SystemSummary(
                row.Id,
                row.Name,
                excerpt,
                shortened,
                row.Scope,
                row.ProjectId,
                row.RuleCount,
                row.Version,
                Utc(row.CreatedAt),
                Utc(row.UpdatedAt));
        }).ToList();

        return Results.Ok(new WorldLogicPage<SystemSummary>(
            items, page, pageSize, totalCount, WorldLogicAccess.TotalPages(totalCount, pageSize)));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var system = await db.LoreSystems.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        return system is null ? Results.NotFound() : Results.Ok(await DetailAsync(db, system, cancellationToken));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] SystemRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CreateCoreAsync(db, universeId, request, cancellationToken);
    }

    /// <summary>
    /// The create itself, after the caller's change check. The route calls it, and so does an approved AI change (ADR 0047),
    /// so a System proposed through review is written exactly as one typed in.
    /// </summary>
    internal static async Task<IResult> CreateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        SystemRequest request,
        CancellationToken cancellationToken)
    {
        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (request.ProjectId is { } projectId
            && !await WorldLogicAccess.IsProjectOfUniverseAsync(db, universeId, projectId, cancellationToken))
        {
            return Problems.Field("projectId", "This universe has no such project.");
        }

        var name = request.Name!.Trim();
        var normalized = ValidationTerm.Normalize(name);

        if (await db.LoreSystems.AnyAsync(
                candidate => candidate.UniverseId == universeId
                             && candidate.ProjectId == request.ProjectId
                             && candidate.NormalizedName == normalized,
                cancellationToken))
        {
            return Taken();
        }

        var now = DateTime.UtcNow;
        var system = new LoreSystem
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Scope = request.ProjectId is null ? WorldLogicScope.Universe : WorldLogicScope.Project,
            ProjectId = request.ProjectId,
            Name = name,
            NormalizedName = normalized,
            Summary = request.Summary ?? string.Empty,
            Version = 1,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.LoreSystems.Add(system);
        db.LoreSystemRevisions.Add(new LoreSystemRevision
        {
            SystemId = system.Id,
            Version = 1,
            Name = system.Name,
            Summary = system.Summary,
            SavedAt = now,
        });

        await db.SaveChangesAsync(cancellationToken);

        return Results.Created(
            $"/api/universes/{universeId}/systems/{system.Id}",
            await DetailAsync(db, system, cancellationToken));
    }

    /// <summary>
    /// Saves the System's own metadata. The scope is fixed at creation, so a different project is refused rather
    /// than moved: every project-scoped exception on its rules is written against one project.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid id,
        [FromBody] SystemRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await UpdateCoreAsync(db, universeId, id, request, cancellationToken);
    }

    /// <summary>The update itself, after the caller's change check; shared with an approved AI change.</summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid id,
        SystemRequest request,
        CancellationToken cancellationToken)
    {
        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var system = await db.LoreSystems
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        if (system is null)
        {
            return Results.NotFound();
        }

        if (request.ExpectedVersion != system.Version)
        {
            return Changed();
        }

        if (request.ProjectId != system.ProjectId)
        {
            return Problems.Field("projectId", "A System stays in the scope it was created in.");
        }

        var name = request.Name!.Trim();
        var normalized = ValidationTerm.Normalize(name);
        var summary = request.Summary ?? string.Empty;

        if (system.Name == name && system.Summary == summary)
        {
            // A save that changes nothing writes nothing: no version bump, and no revision row saying the same words.
            return Results.Ok(await DetailAsync(db, system, cancellationToken));
        }

        if (normalized != system.NormalizedName
            && await db.LoreSystems.AnyAsync(
                candidate => candidate.UniverseId == universeId
                             && candidate.ProjectId == system.ProjectId
                             && candidate.NormalizedName == normalized
                             && candidate.Id != system.Id,
                cancellationToken))
        {
            return Taken();
        }

        var now = DateTime.UtcNow;
        system.Name = name;
        system.NormalizedName = normalized;
        system.Summary = summary;
        system.Version++;
        system.UpdatedAt = now;

        db.LoreSystemRevisions.Add(new LoreSystemRevision
        {
            SystemId = system.Id,
            Version = system.Version,
            Name = system.Name,
            Summary = system.Summary,
            SavedAt = now,
        });

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(await DetailAsync(db, system, cancellationToken));
    }

    /// <summary>
    /// Deletes the System and its links, and no rule definition. There is no Trash for a System: it holds no words
    /// of its own that a world rule's Trash protects, and its rules survive it whole.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        var system = await db.LoreSystems
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        if (system is null)
        {
            return Results.NotFound();
        }

        db.LoreSystems.Remove(system);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> RevisionsAsync(
        Guid universeId,
        Guid id,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyReadAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        // The System is read first, so a revision list never confirms an id this universe does not hold.
        if (!await db.LoreSystems.AsNoTracking()
                .AnyAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken))
        {
            return Results.NotFound();
        }

        var rows = await db.LoreSystemRevisions.AsNoTracking()
            .Where(revision => revision.SystemId == id)
            .OrderByDescending(revision => revision.Version)
            .Select(revision => new { revision.Version, revision.SavedAt, revision.Name, revision.Summary })
            .ToListAsync(cancellationToken);

        return Results.Ok(rows
            .Select(row => new WorldLogicRevisionRow(
                row.Version, Utc(row.SavedAt), row.Name, row.Summary, HasCondition: false))
            .ToList());
    }

    /// <summary>
    /// References a rule definition from this System, or moves it in this System's order. Idempotent: linking a
    /// rule that is already referenced sets its order and nothing else, so a client may send the whole order.
    /// </summary>
    private static async Task<IResult> LinkAsync(
        Guid universeId,
        Guid id,
        Guid ruleId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] int sortOrder = 0)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await LinkCoreAsync(db, universeId, id, ruleId, sortOrder, cancellationToken);
    }

    /// <summary>The link itself, after the caller's change check; shared with an approved AI change.</summary>
    internal static async Task<IResult> LinkCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid id,
        Guid ruleId,
        int sortOrder,
        CancellationToken cancellationToken)
    {
        var system = await db.LoreSystems
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        if (system is null)
        {
            return Results.NotFound();
        }

        // The rule has to be of this universe. A rule of another universe answers as a missing one does, so a link
        // never reveals that another world holds that id.
        var rule = await db.SystemRules.AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == ruleId && candidate.UniverseId == universeId, cancellationToken);

        if (rule is null)
        {
            return Results.NotFound();
        }

        // A universe-scoped System may reference any of its universe's rules. A project-scoped one may reference the
        // universe's rules and its own project's, never another project's: that would make one project's logic
        // depend on a sibling an author did not open.
        if (system.ProjectId is { } systemProject && rule.ProjectId is { } ruleProject && ruleProject != systemProject)
        {
            return Problems.Field("ruleId", "A project's System cannot reference another project's rule.");
        }

        var link = await db.LoreSystemRules
            .FirstOrDefaultAsync(candidate => candidate.SystemId == id && candidate.RuleId == ruleId, cancellationToken);

        if (link is null)
        {
            var count = await db.LoreSystemRules.CountAsync(candidate => candidate.SystemId == id, cancellationToken);
            if (count >= WorldLogicLimits.MaxRulesPerSystem)
            {
                return Problems.Field(
                    "ruleId",
                    $"A System references at most {WorldLogicAccess.Number(WorldLogicLimits.MaxRulesPerSystem)} rules.");
            }

            db.LoreSystemRules.Add(new LoreSystemRule
            {
                SystemId = id,
                RuleId = ruleId,
                SortOrder = sortOrder,
                CreatedAt = DateTime.UtcNow,
            });
        }
        else
        {
            link.SortOrder = sortOrder;
        }

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(await DetailAsync(db, system, cancellationToken));
    }

    /// <summary>Stops referencing a rule definition. The rule itself is untouched, as is every other System's link.</summary>
    private static async Task<IResult> UnlinkAsync(
        Guid universeId,
        Guid id,
        Guid ruleId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WorldLogicAccess.DenyChangeAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await UnlinkCoreAsync(db, universeId, id, ruleId, cancellationToken);
    }

    /// <summary>The unlink itself, after the caller's change check; shared with an approved AI change.</summary>
    internal static async Task<IResult> UnlinkCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid id,
        Guid ruleId,
        CancellationToken cancellationToken)
    {
        var system = await db.LoreSystems
            .FirstOrDefaultAsync(candidate => candidate.Id == id && candidate.UniverseId == universeId, cancellationToken);

        if (system is null)
        {
            return Results.NotFound();
        }

        var link = await db.LoreSystemRules
            .FirstOrDefaultAsync(candidate => candidate.SystemId == id && candidate.RuleId == ruleId, cancellationToken);

        if (link is null)
        {
            return Results.NotFound();
        }

        db.LoreSystemRules.Remove(link);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    internal static Dictionary<string, string[]>? Validate(SystemRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors["name"] = ["Insert a name."];
        }
        else if (request.Name.Trim().Length > WorldLogicLimits.NameMaxLength)
        {
            errors["name"] =
            [
                $"A name is at most {WorldLogicAccess.Number(WorldLogicLimits.NameMaxLength)} characters.",
            ];
        }

        if ((request.Summary?.Length ?? 0) > WorldLogicLimits.SummaryMaxLength)
        {
            errors["summary"] =
            [
                $"A summary is at most {WorldLogicAccess.Number(WorldLogicLimits.SummaryMaxLength)} characters.",
            ];
        }

        return errors.Count == 0 ? null : errors;
    }

    internal static async Task<SystemDetail> DetailAsync(
        LorEvolveDbContext db,
        LoreSystem system,
        CancellationToken cancellationToken)
    {
        var rules = await SystemRuleEndpoints.SummariesOfSystemAsync(db, system.Id, cancellationToken);

        return new SystemDetail(
            system.Id,
            system.Name,
            system.Summary,
            system.Scope,
            system.ProjectId,
            system.Version,
            Utc(system.CreatedAt),
            Utc(system.UpdatedAt),
            rules);
    }

    internal static IResult Changed() => Results.Conflict(new
    {
        code = ChangedCode,
        message = "This System changed since the edit began. Reload it and apply the change again.",
    });

    private static IResult Taken() => Results.Conflict(new
    {
        code = NameTakenCode,
        message = "Another System in this scope already has that name.",
    });
}
