using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Features.ProjectEntities.ProjectEntityTypeEndpoints;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// The pages of a comic's chapter and the panels on them (#147).
///
/// <para>A comic's volumes and chapters are the structure a series and a film already share
/// (<see cref="SeriesEndpoints"/>), under a comic's names; these are the two levels beneath a chapter that no other
/// kind has. Reached through the chapter, through its volume, through the project, so one read proves the whole chain
/// belongs to a project the caller may touch.</para>
///
/// <para><b>A panel references art rather than holding it.</b> #147 puts replacing the Media feature out of scope, and
/// a picture in LorEvolve is an upload with thumbnails, crops and storage keys hanging off an entry
/// (<see cref="EntityImage"/>). A panel names a lore entry, and that entry's picture resolves through the existing
/// feature on its own route. Panel art of its own is a feature with an upload path, a quota and a storage key scheme,
/// which is more than this issue asks for and would be the thing the scope forbids.</para>
/// </summary>
public static class ComicEndpoints
{
    /// <summary>The 409 for deleting a page that still holds panels.</summary>
    public const string PageHasPanelsCode = "project_page_has_panels";

    public static IEndpointRouteBuilder MapComicEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/projects/{projectId:guid}/seasons/{seasonId:guid}/episodes/{episodeId:guid}/pages")
            .WithTags("Project pages")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListProjectPages");
        group.MapPost("/", CreatePageAsync).WithName("CreateProjectPage");
        group.MapPut("/{pageId:guid}", UpdatePageAsync).WithName("UpdateProjectPage");
        group.MapDelete("/{pageId:guid}", DeletePageAsync).WithName("DeleteProjectPage");
        group.MapPost("/{pageId:guid}/move", MovePageAsync).WithName("MoveProjectPage");

        group.MapPost("/{pageId:guid}/panels", CreatePanelAsync).WithName("CreateProjectPanel");
        group.MapPut("/{pageId:guid}/panels/{panelId:guid}", UpdatePanelAsync).WithName("UpdateProjectPanel");
        group.MapDelete("/{pageId:guid}/panels/{panelId:guid}", DeletePanelAsync).WithName("DeleteProjectPanel");
        group.MapPost("/{pageId:guid}/panels/{panelId:guid}/move", MovePanelAsync).WithName("MoveProjectPanel");

        return endpoints;
    }

    /// <summary>
    /// The chapter, when it belongs to a project the caller may reach and that project is a kind with this structure.
    /// One read for the whole chain: a chapter of another project, of another kind, or of no project the caller can see
    /// is answered the same way, as missing.
    /// </summary>
    private static async Task<(Projects.CreativeProject? Project, IResult? Denied)> ChapterAsync(
        LorEvolveDbContext db,
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        ClaimsPrincipal principal,
        bool forWrite,
        CancellationToken cancellationToken)
    {
        var (project, denied) = forWrite
            ? await SeriesEndpoints.WritableHolderAsync(db, projectId, principal, cancellationToken)
            : await SeriesEndpoints.ReadableHolderAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return (null, denied);
        }

        var exists = await db.ProjectEpisodes.AnyAsync(
            episode => episode.Id == episodeId
                && episode.SeasonId == seasonId
                && episode.Season!.ProjectId == projectId,
            cancellationToken);

        return exists ? (project, null) : (null, Results.NotFound());
    }

    private static async Task<IResult> ListAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await ChapterAsync(db, projectId, seasonId, episodeId, principal, forWrite: false, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var pages = await db.ProjectPages.AsNoTracking()
            .Where(page => page.EpisodeId == episodeId)
            .OrderBy(page => page.SortOrder)
            .Select(page => new ProjectPageResponse(
                page.Id,
                page.EpisodeId,
                page.Name,
                page.Notes,
                page.SortOrder,
                page.CreatedAt,
                page.UpdatedAt,
                page.Panels
                    .OrderBy(panel => panel.SortOrder)
                    .Select(panel => new ProjectPanelResponse(
                        panel.Id,
                        panel.PageId,
                        panel.Description,
                        panel.Dialogue,
                        panel.CanonEntityId,
                        // The named entry's own name, read by id: the link is deliberately not a foreign key.
                        db.Entities.Where(entry => entry.Id == panel.CanonEntityId).Select(entry => entry.Name).FirstOrDefault(),
                        panel.SortOrder,
                        panel.CreatedAt,
                        panel.UpdatedAt))
                    .ToList()))
            .ToListAsync(cancellationToken);

        return Results.Ok(pages);
    }

    private static async Task<IResult> CreatePageAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        [FromBody] ProjectPageRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await ChapterAsync(db, projectId, seasonId, episodeId, principal, forWrite: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (ValidatePage(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var count = await db.ProjectPages.CountAsync(page => page.EpisodeId == episodeId, cancellationToken);

        if (count >= ComicLimits.MaxPagesPerChapter)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["name"] = [$"A chapter can hold at most {ComicLimits.MaxPagesPerChapter} pages."],
            });
        }

        var now = DateTime.UtcNow;
        var page = new ProjectPage
        {
            Id = Guid.NewGuid(),
            EpisodeId = episodeId,
            Name = LoreValidation.Normalize(request.Name),
            Notes = LoreValidation.Normalize(request.Notes),
            SortOrder = count,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.ProjectPages.Add(page);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Created(
            $"/api/projects/{projectId}/seasons/{seasonId}/episodes/{episodeId}/pages/{page.Id}",
            Describe(page, []));
    }

    private static async Task<IResult> UpdatePageAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        Guid pageId,
        [FromBody] ProjectPageRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await ChapterAsync(db, projectId, seasonId, episodeId, principal, forWrite: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (ValidatePage(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var page = await db.ProjectPages
            .FirstOrDefaultAsync(candidate => candidate.Id == pageId && candidate.EpisodeId == episodeId, cancellationToken);

        if (page is null)
        {
            return Results.NotFound();
        }

        page.Name = LoreValidation.Normalize(request.Name);
        page.Notes = LoreValidation.Normalize(request.Notes);
        page.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(Describe(page, []));
    }

    /// <summary>
    /// Deletes an empty page. A page holding panels is refused rather than taking an author's writing with it, the way
    /// a season holding episodes is (#145).
    /// </summary>
    private static async Task<IResult> DeletePageAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        Guid pageId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await ChapterAsync(db, projectId, seasonId, episodeId, principal, forWrite: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var page = await db.ProjectPages
            .FirstOrDefaultAsync(candidate => candidate.Id == pageId && candidate.EpisodeId == episodeId, cancellationToken);

        if (page is null)
        {
            return Results.NotFound();
        }

        var panels = await db.ProjectPanels.CountAsync(panel => panel.PageId == pageId, cancellationToken);

        if (panels > 0)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Page still holds panels",
                detail: panels == 1
                    ? "This page can't be deleted because it still holds 1 panel. Delete it first."
                    : $"This page can't be deleted because it still holds {panels} panels. Delete them first.",
                extensions: new Dictionary<string, object?> { ["code"] = PageHasPanelsCode });
        }

        db.ProjectPages.Remove(page);
        await db.SaveChangesAsync(cancellationToken);

        await PlacePagesAsync(db, episodeId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> MovePageAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        Guid pageId,
        [FromBody] ProjectMoveRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await ChapterAsync(db, projectId, seasonId, episodeId, principal, forWrite: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var pages = await db.ProjectPages
            .Where(page => page.EpisodeId == episodeId)
            .OrderBy(page => page.SortOrder)
            .ToListAsync(cancellationToken);

        var moving = pages.FirstOrDefault(page => page.Id == pageId);

        if (moving is null)
        {
            return Results.NotFound();
        }

        var place = Math.Clamp(request.Place, 0, pages.Count - 1);
        pages.Remove(moving);
        pages.Insert(place, moving);

        await SeriesEndpoints.PlaceAsync(db, pages, page => page.SortOrder, (page, order) => page.SortOrder = order, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> CreatePanelAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        Guid pageId,
        [FromBody] ProjectPanelRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await ChapterAsync(db, projectId, seasonId, episodeId, principal, forWrite: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (ValidatePanel(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await CheckCanonLinkAsync(db, project!.UniverseId, request.CanonEntityId, cancellationToken) is { } refused)
        {
            return refused;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (!await db.ProjectPages.AnyAsync(page => page.Id == pageId && page.EpisodeId == episodeId, cancellationToken))
        {
            return Results.NotFound();
        }

        var count = await db.ProjectPanels.CountAsync(panel => panel.PageId == pageId, cancellationToken);

        if (count >= ComicLimits.MaxPanelsPerPage)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["description"] = [$"A page can hold at most {ComicLimits.MaxPanelsPerPage} panels."],
            });
        }

        var now = DateTime.UtcNow;
        var panel = new ProjectPanel
        {
            Id = Guid.NewGuid(),
            PageId = pageId,
            Description = LoreValidation.Normalize(request.Description),
            Dialogue = LoreValidation.Normalize(request.Dialogue),
            CanonEntityId = request.CanonEntityId,
            SortOrder = count,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.ProjectPanels.Add(panel);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Created(
            $"/api/projects/{projectId}/seasons/{seasonId}/episodes/{episodeId}/pages/{pageId}/panels/{panel.Id}",
            Describe(panel, null));
    }

    private static async Task<IResult> UpdatePanelAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        Guid pageId,
        Guid panelId,
        [FromBody] ProjectPanelRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await ChapterAsync(db, projectId, seasonId, episodeId, principal, forWrite: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (ValidatePanel(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await CheckCanonLinkAsync(db, project!.UniverseId, request.CanonEntityId, cancellationToken) is { } refused)
        {
            return refused;
        }

        var panel = await db.ProjectPanels
            .Where(candidate => candidate.Id == panelId
                && candidate.PageId == pageId
                && candidate.Page!.EpisodeId == episodeId)
            .FirstOrDefaultAsync(cancellationToken);

        if (panel is null)
        {
            return Results.NotFound();
        }

        panel.Description = LoreValidation.Normalize(request.Description);
        panel.Dialogue = LoreValidation.Normalize(request.Dialogue);
        panel.CanonEntityId = request.CanonEntityId;
        panel.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(Describe(panel, null));
    }

    private static async Task<IResult> DeletePanelAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        Guid pageId,
        Guid panelId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await ChapterAsync(db, projectId, seasonId, episodeId, principal, forWrite: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var panel = await db.ProjectPanels
            .Where(candidate => candidate.Id == panelId
                && candidate.PageId == pageId
                && candidate.Page!.EpisodeId == episodeId)
            .FirstOrDefaultAsync(cancellationToken);

        if (panel is null)
        {
            return Results.NotFound();
        }

        db.ProjectPanels.Remove(panel);
        await db.SaveChangesAsync(cancellationToken);

        await PlacePanelsAsync(db, pageId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Moves a panel inside its page, or onto another page of the same chapter. The target page is checked against the
    /// chapter, so a panel cannot be moved into another comic through the body.
    /// </summary>
    private static async Task<IResult> MovePanelAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        Guid pageId,
        Guid panelId,
        [FromBody] ProjectPanelMoveRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await ChapterAsync(db, projectId, seasonId, episodeId, principal, forWrite: true, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var panel = await db.ProjectPanels
            .Where(candidate => candidate.Id == panelId
                && candidate.PageId == pageId
                && candidate.Page!.EpisodeId == episodeId)
            .FirstOrDefaultAsync(cancellationToken);

        if (panel is null)
        {
            return Results.NotFound();
        }

        var targetId = request.PageId ?? pageId;

        if (targetId != pageId)
        {
            if (!await db.ProjectPages.AnyAsync(
                    page => page.Id == targetId && page.EpisodeId == episodeId,
                    cancellationToken))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["pageId"] = ["Choose a page of this chapter."],
                });
            }

            // The limit a create respects holds for a move too, as #145's review established for episodes.
            if (await db.ProjectPanels.CountAsync(each => each.PageId == targetId, cancellationToken)
                >= ComicLimits.MaxPanelsPerPage)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["pageId"] = [$"That page already holds {ComicLimits.MaxPanelsPerPage} panels."],
                });
            }
        }

        var from = panel.PageId;
        panel.PageId = targetId;
        panel.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        var target = await db.ProjectPanels
            .Where(each => each.PageId == targetId)
            .OrderBy(each => each.SortOrder)
            .ToListAsync(cancellationToken);

        var moving = target.First(each => each.Id == panelId);
        var place = Math.Clamp(request.Place, 0, target.Count - 1);

        target.Remove(moving);
        target.Insert(place, moving);

        await SeriesEndpoints.PlaceAsync(db, target, each => each.SortOrder, (each, order) => each.SortOrder = order, cancellationToken);

        if (from != targetId)
        {
            await PlacePanelsAsync(db, from, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static ProjectPageResponse Describe(ProjectPage page, IReadOnlyList<ProjectPanelResponse> panels) => new(
        page.Id,
        page.EpisodeId,
        page.Name,
        page.Notes,
        page.SortOrder,
        page.CreatedAt,
        page.UpdatedAt,
        panels);

    private static ProjectPanelResponse Describe(ProjectPanel panel, string? canonName) => new(
        panel.Id,
        panel.PageId,
        panel.Description,
        panel.Dialogue,
        panel.CanonEntityId,
        canonName,
        panel.SortOrder,
        panel.CreatedAt,
        panel.UpdatedAt);

    private static async Task PlacePagesAsync(LorEvolveDbContext db, Guid episodeId, CancellationToken cancellationToken)
    {
        var pages = await db.ProjectPages
            .Where(page => page.EpisodeId == episodeId)
            .OrderBy(page => page.SortOrder)
            .ToListAsync(cancellationToken);

        await SeriesEndpoints.PlaceAsync(db, pages, page => page.SortOrder, (page, order) => page.SortOrder = order, cancellationToken);
    }

    private static async Task PlacePanelsAsync(LorEvolveDbContext db, Guid pageId, CancellationToken cancellationToken)
    {
        var panels = await db.ProjectPanels
            .Where(panel => panel.PageId == pageId)
            .OrderBy(panel => panel.SortOrder)
            .ToListAsync(cancellationToken);

        await SeriesEndpoints.PlaceAsync(db, panels, panel => panel.SortOrder, (panel, order) => panel.SortOrder = order, cancellationToken);
    }

    /// <summary>
    /// The panel's optional lore link: null is accepted, and a value has to be a live lore entry of the project's own
    /// universe. The same check a project entry's canon link makes, for the same reason.
    /// </summary>
    private static async Task<IResult?> CheckCanonLinkAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid? canonEntityId,
        CancellationToken cancellationToken)
    {
        if (canonEntityId is not { } id)
        {
            return null;
        }

        // db.Entities is filtered to the lore, which is exactly what a panel may name.
        var exists = await db.Entities.AnyAsync(
            entry => entry.Id == id && entry.UniverseId == universeId && entry.DeletedAt == null,
            cancellationToken);

        return exists
            ? null
            : Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["canonEntityId"] = ["Choose an entry from this universe's lore, or none."],
            });
    }

    private static Dictionary<string, string[]>? ValidatePage(ProjectPageRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Name is { Length: > ComicLimits.NameMaxLength })
        {
            errors["name"] = ["That name is too long."];
        }

        if (request.Notes is { Length: > ComicLimits.TextMaxLength })
        {
            errors["notes"] = ["Those notes are too long."];
        }

        return errors.Count == 0 ? null : errors;
    }

    private static Dictionary<string, string[]>? ValidatePanel(ProjectPanelRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Description is { Length: > ComicLimits.TextMaxLength })
        {
            errors["description"] = ["That description is too long."];
        }

        if (request.Dialogue is { Length: > ComicLimits.TextMaxLength })
        {
            errors["dialogue"] = ["That dialogue is too long."];
        }

        return errors.Count == 0 ? null : errors;
    }
}
