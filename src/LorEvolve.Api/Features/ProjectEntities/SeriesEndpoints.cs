using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Features.ProjectEntities.ProjectEntityTypeEndpoints;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>
/// The seasons of a project and the episodes in them (#145).
///
/// <para><b>A Series project only.</b> #145 asks for seasons as the structure a Series groups episodes into, and the
/// first review of this PR was right that offering them on every kind is wider than the issue. A project of another
/// kind answers exactly as one with no seasons route at all, so nothing discloses that the feature exists elsewhere.
/// When a comic wants volumes and issues (#147), that kind joins <see cref="Holds"/>: one line, and the structure is
/// already here.</para>
///
/// <para>Order is a stored place, not a derivation: an author reorders seasons and episodes, and "Season 10" sorts
/// before "Season 2" by name. Both lists are renumbered 0, 1, 2 on every move, the same way a story's arcs are
/// (<see cref="Stories.PlotOrder"/>), so a place is always the index it claims to be.</para>
///
/// <para>Access is the project's, through <see cref="Projects.ProjectAccess"/>, so nothing here decides it again and a
/// project the caller cannot reach answers exactly as a missing one.</para>
/// </summary>
public static class SeriesEndpoints
{
    /// <summary>The 409 for an episode save written over a version that is no longer current (ADR 0043).</summary>
    public const string EpisodeChangedCode = "project_episode_changed";

    /// <summary>The 409 for deleting a season that still holds episodes.</summary>
    public const string SeasonHasEpisodesCode = "project_season_has_episodes";

    /// <summary>
    /// The kinds of project that have seasons. Series alone today (#145); a comic's volumes would add
    /// <see cref="Projects.ProjectKind.Comic"/> here and nothing else.
    /// </summary>
    private static bool Holds(Projects.ProjectKind kind) => kind is Projects.ProjectKind.Series;

    /// <summary>
    /// The project when it may be read and has seasons at all, otherwise the answer to send. A project of another kind
    /// is answered as a missing one rather than refused, because for it this route does not exist.
    /// </summary>
    private static async Task<(Projects.CreativeProject? Project, IResult? Denied)> SeriesReadableAsync(
        LorEvolveDbContext db,
        Guid projectId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await ReadableAsync(db, projectId, principal, cancellationToken);

        return denied is not null
            ? (null, denied)
            : Holds(project!.Kind) ? (project, null) : (null, Results.NotFound());
    }

    /// <summary>The same, for a write.</summary>
    private static async Task<(Projects.CreativeProject? Project, IResult? Denied)> SeriesWritableAsync(
        LorEvolveDbContext db,
        Guid projectId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var (project, denied) = await WritableAsync(db, projectId, principal, cancellationToken);

        return denied is not null
            ? (null, denied)
            : Holds(project!.Kind) ? (project, null) : (null, Results.NotFound());
    }

    public static IEndpointRouteBuilder MapSeriesEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/projects/{projectId:guid}/seasons")
            .WithTags("Project seasons")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListProjectSeasons");
        group.MapPost("/", CreateSeasonAsync).WithName("CreateProjectSeason");
        group.MapPut("/{seasonId:guid}", UpdateSeasonAsync).WithName("UpdateProjectSeason");
        group.MapDelete("/{seasonId:guid}", DeleteSeasonAsync).WithName("DeleteProjectSeason");
        group.MapPost("/{seasonId:guid}/move", MoveSeasonAsync).WithName("MoveProjectSeason");

        group.MapPost("/{seasonId:guid}/episodes", CreateEpisodeAsync).WithName("CreateProjectEpisode");
        group.MapGet("/{seasonId:guid}/episodes/{episodeId:guid}", GetEpisodeAsync).WithName("GetProjectEpisode");
        group.MapPut("/{seasonId:guid}/episodes/{episodeId:guid}", UpdateEpisodeAsync).WithName("UpdateProjectEpisode");
        group.MapDelete("/{seasonId:guid}/episodes/{episodeId:guid}", DeleteEpisodeAsync).WithName("DeleteProjectEpisode");
        group.MapPost("/{seasonId:guid}/episodes/{episodeId:guid}/move", MoveEpisodeAsync).WithName("MoveProjectEpisode");

        return endpoints;
    }

    /// <summary>
    /// Every season of the project in its place, each with its episodes in theirs. The scripts are left out on
    /// purpose: a season of television is a great deal of text, and a list that carried every script would send a
    /// book to draw a table of contents. One episode's script comes from its own route.
    /// </summary>
    private static async Task<IResult> ListAsync(
        Guid projectId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await SeriesReadableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        var seasons = await db.ProjectSeasons.AsNoTracking()
            .Where(season => season.ProjectId == projectId)
            .OrderBy(season => season.SortOrder)
            .Select(season => new ProjectSeasonResponse(
                season.Id,
                season.Name,
                season.Summary,
                season.SortOrder,
                season.CreatedAt,
                season.UpdatedAt,
                season.Episodes
                    .OrderBy(episode => episode.SortOrder)
                    .Select(episode => new ProjectEpisodeResponse(
                        episode.Id,
                        episode.SeasonId,
                        episode.Title,
                        episode.Synopsis,
                        episode.Script != null,
                        episode.Script != null ? episode.Script.Length : 0,
                        episode.SortOrder,
                        episode.CreatedAt,
                        episode.UpdatedAt,
                        episode.Version))
                    .ToList()))
            .ToListAsync(cancellationToken);

        return Results.Ok(seasons);
    }

    private static async Task<IResult> CreateSeasonAsync(
        Guid projectId,
        [FromBody] ProjectSeasonRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await SeriesWritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (ValidateSeason(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        // One writer at a time, so two seasons created at once cannot both take the last place.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var seasons = await db.ProjectSeasons
            .Where(season => season.ProjectId == projectId)
            .OrderBy(season => season.SortOrder)
            .ToListAsync(cancellationToken);

        if (seasons.Count >= SeriesLimits.MaxSeasonsPerProject)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["name"] = [$"A project can have at most {SeriesLimits.MaxSeasonsPerProject} seasons."],
            });
        }

        if (seasons.Any(season => string.Equals(season.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            return SeasonNameTaken();
        }

        var now = DateTime.UtcNow;
        var created = new ProjectSeason
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            Name = name,
            Summary = LoreValidation.Normalize(request.Summary),
            SortOrder = seasons.Count,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.ProjectSeasons.Add(created);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return SeasonNameTaken();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Created(
            $"/api/projects/{projectId}/seasons/{created.Id}",
            new ProjectSeasonResponse(created.Id, created.Name, created.Summary, created.SortOrder, created.CreatedAt, created.UpdatedAt, []));
    }

    private static async Task<IResult> UpdateSeasonAsync(
        Guid projectId,
        Guid seasonId,
        [FromBody] ProjectSeasonRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await SeriesWritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (ValidateSeason(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var season = await db.ProjectSeasons
            .FirstOrDefaultAsync(candidate => candidate.Id == seasonId && candidate.ProjectId == projectId, cancellationToken);

        if (season is null)
        {
            return Results.NotFound();
        }

        season.Name = request.Name!.Trim();
        season.Summary = LoreValidation.Normalize(request.Summary);
        season.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return SeasonNameTaken();
        }

        return Results.Ok(new ProjectSeasonResponse(
            season.Id, season.Name, season.Summary, season.SortOrder, season.CreatedAt, season.UpdatedAt, []));
    }

    /// <summary>
    /// Deletes an empty season. A season holding episodes is refused rather than taking an author's scripts with it:
    /// the cascade exists so that deleting the project is one operation, not so that a mis-click can empty a series.
    /// </summary>
    private static async Task<IResult> DeleteSeasonAsync(
        Guid projectId,
        Guid seasonId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await SeriesWritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var season = await db.ProjectSeasons
            .FirstOrDefaultAsync(candidate => candidate.Id == seasonId && candidate.ProjectId == projectId, cancellationToken);

        if (season is null)
        {
            return Results.NotFound();
        }

        var episodes = await db.ProjectEpisodes.CountAsync(episode => episode.SeasonId == seasonId, cancellationToken);

        if (episodes > 0)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Season still holds episodes",
                detail: episodes == 1
                    ? $"{season.Name} can't be deleted because it still holds 1 episode. Move or delete it first."
                    : $"{season.Name} can't be deleted because it still holds {episodes} episodes. Move or delete them first.",
                extensions: new Dictionary<string, object?> { ["code"] = SeasonHasEpisodesCode });
        }

        db.ProjectSeasons.Remove(season);
        await db.SaveChangesAsync(cancellationToken);

        // The places close up behind it, so a list never shows a gap.
        await PlaceSeasonsAsync(db, projectId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> MoveSeasonAsync(
        Guid projectId,
        Guid seasonId,
        [FromBody] ProjectMoveRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await SeriesWritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var seasons = await db.ProjectSeasons
            .Where(season => season.ProjectId == projectId)
            .OrderBy(season => season.SortOrder)
            .ToListAsync(cancellationToken);

        var moving = seasons.FirstOrDefault(season => season.Id == seasonId);

        if (moving is null)
        {
            return Results.NotFound();
        }

        // A place outside the list is clamped rather than refused: the author's intent is "first" or "last", and a
        // validation error for asking to move something to the end is noise.
        var place = Math.Clamp(request.Place, 0, seasons.Count - 1);

        seasons.Remove(moving);
        seasons.Insert(place, moving);

        await PlaceAsync(db, seasons, season => season.SortOrder, (season, order) => season.SortOrder = order, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> CreateEpisodeAsync(
        Guid projectId,
        Guid seasonId,
        [FromBody] ProjectEpisodeRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await SeriesWritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (ValidateEpisode(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (!await db.ProjectSeasons.AnyAsync(
                season => season.Id == seasonId && season.ProjectId == projectId,
                cancellationToken))
        {
            return Results.NotFound();
        }

        var count = await db.ProjectEpisodes.CountAsync(episode => episode.SeasonId == seasonId, cancellationToken);

        if (count >= SeriesLimits.MaxEpisodesPerSeason)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["title"] = [$"A season can hold at most {SeriesLimits.MaxEpisodesPerSeason} episodes."],
            });
        }

        var now = DateTime.UtcNow;
        var created = new ProjectEpisode
        {
            Id = Guid.NewGuid(),
            SeasonId = seasonId,
            Title = request.Title!.Trim(),
            Synopsis = LoreValidation.Normalize(request.Synopsis),
            Script = LoreValidation.Normalize(request.Script),
            SortOrder = count,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.ProjectEpisodes.Add(created);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Created($"/api/projects/{projectId}/seasons/{seasonId}/episodes/{created.Id}", Describe(created));
    }

    private static async Task<IResult> GetEpisodeAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await SeriesReadableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        // Scoped through the season to the project in one read, so an episode of another project is not found rather
        // than refused.
        var episode = await db.ProjectEpisodes.AsNoTracking()
            .Where(candidate => candidate.Id == episodeId
                && candidate.SeasonId == seasonId
                && candidate.Season!.ProjectId == projectId)
            .FirstOrDefaultAsync(cancellationToken);

        return episode is null ? Results.NotFound() : Results.Ok(Describe(episode));
    }

    private static async Task<IResult> UpdateEpisodeAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        [FromBody] ProjectEpisodeRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await SeriesWritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        if (ValidateEpisode(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var episode = await db.ProjectEpisodes
            .Where(candidate => candidate.Id == episodeId
                && candidate.SeasonId == seasonId
                && candidate.Season!.ProjectId == projectId)
            .FirstOrDefaultAsync(cancellationToken);

        if (episode is null)
        {
            return Results.NotFound();
        }

        // Read inside the transaction the write commits in, so nothing lands between the comparison and the write.
        if (!EditVersion.Matches(episode.Version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                EpisodeChangedCode,
                "Episode changed",
                "This episode was changed after it was opened here. Nothing was overwritten.",
                episode.Version);
        }

        episode.Title = request.Title!.Trim();
        episode.Synopsis = LoreValidation.Normalize(request.Synopsis);
        episode.Script = LoreValidation.Normalize(request.Script);
        episode.UpdatedAt = DateTime.UtcNow;
        episode.Version++;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(Describe(episode));
    }

    private static async Task<IResult> DeleteEpisodeAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await SeriesWritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var episode = await db.ProjectEpisodes
            .Where(candidate => candidate.Id == episodeId
                && candidate.SeasonId == seasonId
                && candidate.Season!.ProjectId == projectId)
            .FirstOrDefaultAsync(cancellationToken);

        if (episode is null)
        {
            return Results.NotFound();
        }

        db.ProjectEpisodes.Remove(episode);
        await db.SaveChangesAsync(cancellationToken);

        await PlaceEpisodesAsync(db, seasonId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Moves an episode inside its season, or into another season of the same project. The target season is checked to
    /// be this project's, so an episode cannot be moved into someone else's series through the body.
    /// </summary>
    private static async Task<IResult> MoveEpisodeAsync(
        Guid projectId,
        Guid seasonId,
        Guid episodeId,
        [FromBody] ProjectMoveRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var (_, denied) = await SeriesWritableAsync(db, projectId, principal, cancellationToken);

        if (denied is not null)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var episode = await db.ProjectEpisodes
            .Where(candidate => candidate.Id == episodeId
                && candidate.SeasonId == seasonId
                && candidate.Season!.ProjectId == projectId)
            .FirstOrDefaultAsync(cancellationToken);

        if (episode is null)
        {
            return Results.NotFound();
        }

        var targetId = request.SeasonId ?? seasonId;

        if (targetId != seasonId)
        {
            if (!await db.ProjectSeasons.AnyAsync(
                    season => season.Id == targetId && season.ProjectId == projectId,
                    cancellationToken))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["seasonId"] = ["Choose a season of this project."],
                });
            }

            // The limit a create respects holds for a move as well. Without this an author could put more episodes in
            // a season by moving them in than by making them there, which is the limit saying one thing and meaning
            // another.
            if (await db.ProjectEpisodes.CountAsync(episode => episode.SeasonId == targetId, cancellationToken)
                >= SeriesLimits.MaxEpisodesPerSeason)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["seasonId"] = [$"That season already holds {SeriesLimits.MaxEpisodesPerSeason} episodes."],
                });
            }
        }

        var from = episode.SeasonId;
        episode.SeasonId = targetId;
        episode.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        var target = await db.ProjectEpisodes
            .Where(candidate => candidate.SeasonId == targetId)
            .OrderBy(candidate => candidate.SortOrder)
            .ToListAsync(cancellationToken);

        var moving = target.First(candidate => candidate.Id == episodeId);
        var place = Math.Clamp(request.Place, 0, target.Count - 1);

        target.Remove(moving);
        target.Insert(place, moving);

        await PlaceAsync(db, target, episode => episode.SortOrder, (episode, order) => episode.SortOrder = order, cancellationToken);

        if (from != targetId)
        {
            await PlaceEpisodesAsync(db, from, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static ProjectEpisodeDetail Describe(ProjectEpisode episode) => new(
        episode.Id,
        episode.SeasonId,
        episode.Title,
        episode.Synopsis,
        episode.Script,
        episode.SortOrder,
        episode.CreatedAt,
        episode.UpdatedAt,
        episode.Version);

    /// <summary>Renumbers one project's seasons 0, 1, 2 in their current order, so a place is the index it claims.</summary>
    private static async Task PlaceSeasonsAsync(LorEvolveDbContext db, Guid projectId, CancellationToken cancellationToken)
    {
        var seasons = await db.ProjectSeasons
            .Where(season => season.ProjectId == projectId)
            .OrderBy(season => season.SortOrder)
            .ToListAsync(cancellationToken);

        await PlaceAsync(db, seasons, season => season.SortOrder, (season, order) => season.SortOrder = order, cancellationToken);
    }

    private static async Task PlaceEpisodesAsync(LorEvolveDbContext db, Guid seasonId, CancellationToken cancellationToken)
    {
        var episodes = await db.ProjectEpisodes
            .Where(episode => episode.SeasonId == seasonId)
            .OrderBy(episode => episode.SortOrder)
            .ToListAsync(cancellationToken);

        await PlaceAsync(db, episodes, episode => episode.SortOrder, (episode, order) => episode.SortOrder = order, cancellationToken);
    }

    /// <summary>
    /// Gives an ordered list the places 0, 1, 2. Neither index is unique, so this writes straight through rather than
    /// parking the rows first the way <see cref="Stories.PlotOrder"/> has to.
    /// </summary>
    private static async Task PlaceAsync<T>(
        LorEvolveDbContext db,
        List<T> ordered,
        Func<T, int> read,
        Action<T, int> write,
        CancellationToken cancellationToken)
    {
        if (ordered.Select((item, index) => read(item) == index).All(inPlace => inPlace))
        {
            return;
        }

        for (var index = 0; index < ordered.Count; index++)
        {
            write(ordered[index], index);
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static Dictionary<string, string[]>? ValidateSeason(ProjectSeasonRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors["name"] = ["Give the season a name."];
        }
        else if (request.Name.Trim().Length > SeriesLimits.NameMaxLength)
        {
            errors["name"] = ["That name is too long."];
        }

        if (request.Summary is { Length: > SeriesLimits.SummaryMaxLength })
        {
            errors["summary"] = ["That summary is too long."];
        }

        return errors.Count == 0 ? null : errors;
    }

    private static Dictionary<string, string[]>? ValidateEpisode(ProjectEpisodeRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            errors["title"] = ["Give the episode a title."];
        }
        else if (request.Title.Trim().Length > SeriesLimits.NameMaxLength)
        {
            errors["title"] = ["That title is too long."];
        }

        if (request.Synopsis is { Length: > SeriesLimits.SummaryMaxLength })
        {
            errors["synopsis"] = ["That synopsis is too long."];
        }

        if (request.Script is { Length: > SeriesLimits.ScriptMaxLength })
        {
            errors["script"] = ["That script is too long to save in one piece."];
        }

        return errors.Count == 0 ? null : errors;
    }

    private static IResult SeasonNameTaken() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = ["This project already has a season with that name."],
        });
}
