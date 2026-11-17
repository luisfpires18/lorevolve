using System.Security.Claims;
using LorEvolve.Api.Common;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.CinemaSagas;

/// <summary>
/// Cinema Sagas and Phases (#289): a universe's release order across independent Film and Series projects. Every
/// write here touches only saga, phase and membership rows; a project is never moved, copied or changed.
/// </summary>
public static class CinemaSagaEndpoints
{
    public const string SagaChangedCode = "cinema_saga_changed";

    public const string PhaseChangedCode = "cinema_phase_changed";

    public const string MembershipExistsCode = "cinema_membership_exists";

    public static IEndpointRouteBuilder MapCinemaSagaEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/cinema-sagas")
            .WithTags("Cinema sagas")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListCinemaSagas");
        group.MapPost("/", CreateSagaAsync).WithName("CreateCinemaSaga");
        group.MapPut("/{sagaId:guid}", UpdateSagaAsync).WithName("UpdateCinemaSaga");
        group.MapDelete("/{sagaId:guid}", DeleteSagaAsync).WithName("DeleteCinemaSaga");
        group.MapPost("/{sagaId:guid}/move", MoveSagaAsync).WithName("MoveCinemaSaga");

        group.MapPost("/{sagaId:guid}/phases", CreatePhaseAsync).WithName("CreateCinemaPhase");
        group.MapPut("/{sagaId:guid}/phases/{phaseId:guid}", UpdatePhaseAsync).WithName("UpdateCinemaPhase");
        group.MapDelete("/{sagaId:guid}/phases/{phaseId:guid}", DeletePhaseAsync).WithName("DeleteCinemaPhase");
        group.MapPost("/{sagaId:guid}/phases/{phaseId:guid}/move", MovePhaseAsync).WithName("MoveCinemaPhase");

        group.MapPost("/{sagaId:guid}/phases/{phaseId:guid}/members", AddMemberAsync).WithName("AddCinemaPhaseMember");
        group.MapDelete("/{sagaId:guid}/phases/{phaseId:guid}/members/{projectId:guid}", RemoveMemberAsync)
            .WithName("RemoveCinemaPhaseMember");
        group.MapPost("/{sagaId:guid}/phases/{phaseId:guid}/members/{projectId:guid}/move", MoveMemberAsync)
            .WithName("MoveCinemaPhaseMember");

        return endpoints;
    }

    /// <summary>Every saga in order with its phases and their productions, plus the Cinema projects in no phase.</summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var sagas = await db.CinemaSagas.AsNoTracking()
            .Where(saga => saga.UniverseId == universeId)
            .OrderBy(saga => saga.SortOrder)
            .Select(saga => new CinemaSagaResponse(
                saga.Id,
                saga.Name,
                saga.Summary,
                saga.SortOrder,
                saga.Version,
                saga.Phases
                    .OrderBy(phase => phase.SortOrder)
                    .Select(phase => new CinemaPhaseResponse(
                        phase.Id,
                        phase.Name,
                        phase.Summary,
                        phase.SortOrder,
                        phase.Version,
                        phase.Members
                            .OrderBy(member => member.SortOrder)
                            .Select(member => new CinemaProductionResponse(
                                member.ProjectId,
                                member.Project!.Name,
                                member.Project.Kind,
                                member.Project.Format))
                            .ToList()))
                    .ToList()))
            .ToListAsync(cancellationToken);

        var unassigned = await db.CreativeProjects.AsNoTracking()
            .Where(project => project.UniverseId == universeId
                && (project.Kind == Projects.ProjectKind.Film || project.Kind == Projects.ProjectKind.Series)
                && !db.CinemaPhaseMemberships.Any(member => member.ProjectId == project.Id))
            .OrderBy(project => project.Name)
            .Select(project => new CinemaProductionResponse(project.Id, project.Name, project.Kind, project.Format))
            .ToListAsync(cancellationToken);

        return Results.Ok(new CinemaSagasResponse(sagas, unassigned));
    }

    private static async Task<IResult> CreateSagaAsync(
        Guid universeId,
        [FromBody] CinemaGroupRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var count = await db.CinemaSagas.CountAsync(saga => saga.UniverseId == universeId, cancellationToken);

        if (count >= CinemaSagaLimits.MaxSagasPerUniverse)
        {
            return Problems.Field("name", $"A universe can have at most {CinemaSagaLimits.MaxSagasPerUniverse} sagas.");
        }

        var now = DateTime.UtcNow;
        var saga = new CinemaSaga
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Name = request.Name!.Trim(),
            Summary = LoreValidation.Normalize(request.Summary),
            SortOrder = count,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.CinemaSagas.Add(saga);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Created(
            $"/api/universes/{universeId}/cinema-sagas/{saga.Id}",
            new CinemaSagaResponse(saga.Id, saga.Name, saga.Summary, saga.SortOrder, saga.Version, []));
    }

    private static async Task<IResult> UpdateSagaAsync(
        Guid universeId,
        Guid sagaId,
        [FromBody] CinemaGroupRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var saga = await db.CinemaSagas
            .FirstOrDefaultAsync(candidate => candidate.Id == sagaId && candidate.UniverseId == universeId, cancellationToken);

        if (saga is null)
        {
            return Results.NotFound();
        }

        if (!EditVersion.Matches(saga.Version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                SagaChangedCode,
                "Saga changed",
                "This saga was changed after it was opened here. Nothing was overwritten.",
                saga.Version);
        }

        saga.Name = request.Name!.Trim();
        saga.Summary = LoreValidation.Normalize(request.Summary);
        saga.UpdatedAt = DateTime.UtcNow;
        saga.Version++;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(new CinemaSagaResponse(saga.Id, saga.Name, saga.Summary, saga.SortOrder, saga.Version, []));
    }

    /// <summary>Deletes the saga, its phases and their memberships. The projects stay as they are.</summary>
    private static async Task<IResult> DeleteSagaAsync(
        Guid universeId,
        Guid sagaId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var saga = await db.CinemaSagas
            .FirstOrDefaultAsync(candidate => candidate.Id == sagaId && candidate.UniverseId == universeId, cancellationToken);

        if (saga is null)
        {
            return Results.NotFound();
        }

        db.CinemaSagas.Remove(saga);
        await db.SaveChangesAsync(cancellationToken);

        var rest = await db.CinemaSagas.Where(candidate => candidate.UniverseId == universeId)
            .OrderBy(candidate => candidate.SortOrder).ToListAsync(cancellationToken);
        await SeriesEndpoints.PlaceAsync(db, rest, item => item.SortOrder, (item, order) => item.SortOrder = order, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> MoveSagaAsync(
        Guid universeId,
        Guid sagaId,
        [FromBody] CinemaPlaceRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var sagas = await db.CinemaSagas.Where(saga => saga.UniverseId == universeId)
            .OrderBy(saga => saga.SortOrder).ToListAsync(cancellationToken);

        if (!await MoveAsync(db, sagas, saga => saga.Id == sagaId, request.Place,
                saga => saga.SortOrder, (saga, order) => saga.SortOrder = order, cancellationToken))
        {
            return Results.NotFound();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> CreatePhaseAsync(
        Guid universeId,
        Guid sagaId,
        [FromBody] CinemaGroupRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (!await db.CinemaSagas.AnyAsync(saga => saga.Id == sagaId && saga.UniverseId == universeId, cancellationToken))
        {
            return Results.NotFound();
        }

        var count = await db.CinemaPhases.CountAsync(phase => phase.SagaId == sagaId, cancellationToken);

        if (count >= CinemaSagaLimits.MaxPhasesPerSaga)
        {
            return Problems.Field("name", $"A saga can have at most {CinemaSagaLimits.MaxPhasesPerSaga} phases.");
        }

        var now = DateTime.UtcNow;
        var phase = new CinemaPhase
        {
            Id = Guid.NewGuid(),
            SagaId = sagaId,
            Name = request.Name!.Trim(),
            Summary = LoreValidation.Normalize(request.Summary),
            SortOrder = count,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.CinemaPhases.Add(phase);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Created(
            $"/api/universes/{universeId}/cinema-sagas/{sagaId}/phases/{phase.Id}",
            new CinemaPhaseResponse(phase.Id, phase.Name, phase.Summary, phase.SortOrder, phase.Version, []));
    }

    private static async Task<IResult> UpdatePhaseAsync(
        Guid universeId,
        Guid sagaId,
        Guid phaseId,
        [FromBody] CinemaGroupRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var phase = await FindPhase(db, universeId, sagaId, phaseId).FirstOrDefaultAsync(cancellationToken);

        if (phase is null)
        {
            return Results.NotFound();
        }

        if (!EditVersion.Matches(phase.Version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                PhaseChangedCode,
                "Phase changed",
                "This phase was changed after it was opened here. Nothing was overwritten.",
                phase.Version);
        }

        phase.Name = request.Name!.Trim();
        phase.Summary = LoreValidation.Normalize(request.Summary);
        phase.UpdatedAt = DateTime.UtcNow;
        phase.Version++;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(new CinemaPhaseResponse(phase.Id, phase.Name, phase.Summary, phase.SortOrder, phase.Version, []));
    }

    /// <summary>Deletes the phase and its memberships. Its projects become unassigned, nothing more.</summary>
    private static async Task<IResult> DeletePhaseAsync(
        Guid universeId,
        Guid sagaId,
        Guid phaseId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var phase = await FindPhase(db, universeId, sagaId, phaseId).FirstOrDefaultAsync(cancellationToken);

        if (phase is null)
        {
            return Results.NotFound();
        }

        db.CinemaPhases.Remove(phase);
        await db.SaveChangesAsync(cancellationToken);

        var rest = await db.CinemaPhases.Where(candidate => candidate.SagaId == sagaId)
            .OrderBy(candidate => candidate.SortOrder).ToListAsync(cancellationToken);
        await SeriesEndpoints.PlaceAsync(db, rest, item => item.SortOrder, (item, order) => item.SortOrder = order, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> MovePhaseAsync(
        Guid universeId,
        Guid sagaId,
        Guid phaseId,
        [FromBody] CinemaPlaceRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var phases = await db.CinemaPhases
            .Where(phase => phase.SagaId == sagaId && phase.Saga!.UniverseId == universeId)
            .OrderBy(phase => phase.SortOrder).ToListAsync(cancellationToken);

        if (!await MoveAsync(db, phases, phase => phase.Id == phaseId, request.Place,
                phase => phase.SortOrder, (phase, order) => phase.SortOrder = order, cancellationToken))
        {
            return Results.NotFound();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Appends a project to the phase. The project must be a Film or Series of this same universe (404 for anything
    /// else of another universe, so nothing leaks), and in no phase yet: a membership never moves silently.
    /// </summary>
    private static async Task<IResult> AddMemberAsync(
        Guid universeId,
        Guid sagaId,
        Guid phaseId,
        [FromBody] CinemaMemberRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (!await FindPhase(db, universeId, sagaId, phaseId).AnyAsync(cancellationToken))
        {
            return Results.NotFound();
        }

        var project = await db.CreativeProjects.AsNoTracking()
            .Where(candidate => candidate.Id == request.ProjectId && candidate.UniverseId == universeId)
            .Select(candidate => new { candidate.Kind })
            .FirstOrDefaultAsync(cancellationToken);

        if (project is null)
        {
            return Results.NotFound();
        }

        if (!CinemaSagaLimits.Holds(project.Kind))
        {
            return Problems.Field("projectId", "Only a film or a series can be part of a phase.");
        }

        if (await db.CinemaPhaseMemberships.AnyAsync(member => member.ProjectId == request.ProjectId, cancellationToken))
        {
            return MembershipExists();
        }

        var count = await db.CinemaPhaseMemberships.CountAsync(member => member.PhaseId == phaseId, cancellationToken);

        if (count >= CinemaSagaLimits.MaxMembersPerPhase)
        {
            return Problems.Field("projectId", $"A phase can hold at most {CinemaSagaLimits.MaxMembersPerPhase} productions.");
        }

        db.CinemaPhaseMemberships.Add(new CinemaPhaseMembership
        {
            Id = Guid.NewGuid(),
            PhaseId = phaseId,
            ProjectId = request.ProjectId,
            SortOrder = count,
        });

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            return MembershipExists();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>Takes the project out of the phase. The project itself is untouched.</summary>
    private static async Task<IResult> RemoveMemberAsync(
        Guid universeId,
        Guid sagaId,
        Guid phaseId,
        Guid projectId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var members = await Members(db, universeId, sagaId, phaseId).ToListAsync(cancellationToken);
        var leaving = members.FirstOrDefault(member => member.ProjectId == projectId);

        if (leaving is null)
        {
            return Results.NotFound();
        }

        db.CinemaPhaseMemberships.Remove(leaving);
        members.Remove(leaving);
        await db.SaveChangesAsync(cancellationToken);
        await SeriesEndpoints.PlaceAsync(db, members, item => item.SortOrder, (item, order) => item.SortOrder = order, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> MoveMemberAsync(
        Guid universeId,
        Guid sagaId,
        Guid phaseId,
        Guid projectId,
        [FromBody] CinemaPlaceRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await WriteDeniedAsync(db, universeId, principal, cancellationToken) is { } denied)
        {
            return denied;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var members = await Members(db, universeId, sagaId, phaseId).ToListAsync(cancellationToken);

        if (!await MoveAsync(db, members, member => member.ProjectId == projectId, request.Place,
                member => member.SortOrder, (member, order) => member.SortOrder = order, cancellationToken))
        {
            return Results.NotFound();
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    private static Task<IResult?> WriteDeniedAsync(
        LorEvolveDbContext db,
        Guid universeId,
        ClaimsPrincipal principal,
        CancellationToken cancellationToken) =>
        UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken);

    private static IQueryable<CinemaPhase> FindPhase(LorEvolveDbContext db, Guid universeId, Guid sagaId, Guid phaseId) =>
        db.CinemaPhases.Where(phase => phase.Id == phaseId && phase.SagaId == sagaId && phase.Saga!.UniverseId == universeId);

    private static IQueryable<CinemaPhaseMembership> Members(LorEvolveDbContext db, Guid universeId, Guid sagaId, Guid phaseId) =>
        db.CinemaPhaseMemberships
            .Where(member => member.PhaseId == phaseId
                && member.Phase!.SagaId == sagaId
                && member.Phase.Saga!.UniverseId == universeId)
            .OrderBy(member => member.SortOrder);

    /// <summary>Moves one item of an ordered list to a place, clamped as the season moves are; false when it is not there.</summary>
    private static async Task<bool> MoveAsync<T>(
        LorEvolveDbContext db,
        List<T> ordered,
        Func<T, bool> isMoving,
        int place,
        Func<T, int> read,
        Action<T, int> write,
        CancellationToken cancellationToken)
    {
        var moving = ordered.FirstOrDefault(isMoving);

        if (moving is null)
        {
            return false;
        }

        ordered.Remove(moving);
        ordered.Insert(Math.Clamp(place, 0, ordered.Count), moving);
        await SeriesEndpoints.PlaceAsync(db, ordered, read, write, cancellationToken);

        return true;
    }

    private static Dictionary<string, string[]>? Validate(CinemaGroupRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            errors["name"] = ["Give it a name."];
        }
        else if (request.Name.Trim().Length > CinemaSagaLimits.NameMaxLength)
        {
            errors["name"] = ["That name is too long."];
        }

        if (request.Summary is { Length: > CinemaSagaLimits.SummaryMaxLength })
        {
            errors["summary"] = ["That summary is too long."];
        }

        return errors.Count == 0 ? null : errors;
    }

    private static IResult MembershipExists() =>
        Results.Problem(
            statusCode: StatusCodes.Status409Conflict,
            title: "Already in a phase",
            detail: "This production is already in a phase. Remove it there first.",
            extensions: new Dictionary<string, object?> { ["code"] = MembershipExistsCode });
}
