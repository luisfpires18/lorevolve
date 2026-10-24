using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Chronology;

/// <summary>
/// A universe's reckoning: read it, or replace it whole. Ownership is proved first on both
/// routes, and every era id the client sends is re-resolved inside that universe, so an era
/// from another world is refused without confirming it exists.
/// </summary>
public static class ChronologyEndpoints
{
    /// <summary>The machine-readable marker on the 409 for removing an era something is dated in.</summary>
    public const string EraInUseCode = "chronology_era_in_use";

    public static IEndpointRouteBuilder MapChronologyEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/chronology")
            .WithTags("Chronology")
            .RequireAuthorization();

        group.MapGet("/", GetAsync).WithName("GetChronology");
        group.MapPut("/", UpdateAsync).WithName("UpdateChronology");
        group.MapChronologyCalendarEndpoints();

        return endpoints;
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return Results.Ok(await DescribeAsync(db, universeId, cancellationToken));
    }

    /// <summary>
    /// Gated. Reordering two eras or turning an era's years around re-places every moment and
    /// every birth year dated in it at once, which is exactly how a moment ends up before a Canon
    /// participant is born. The write is refused if it would introduce a High finding, the same
    /// as any other write that can.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        [FromBody] ChronologyRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await gate.RunAsync(
            universeId,
            token => UpdateCoreAsync(universeId, request, db, token),
            cancellationToken);
    }

    private static async Task<IResult> UpdateCoreAsync(
        Guid universeId,
        ChronologyRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (ChronologyValidation.Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var wanted = request.Eras!;

        var stored = await db.ChronologyEras
            .Where(era => era.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var byId = stored.ToDictionary(era => era.Id);

        var foreign = new Dictionary<string, string[]>();
        for (var index = 0; index < wanted.Count; index++)
        {
            if (wanted[index].Id is { } id && !byId.ContainsKey(id))
            {
                foreign[$"eras[{index}].id"] = ["Choose date periods from this universe."];
            }
        }

        if (foreign.Count > 0)
        {
            return Results.ValidationProblem(foreign);
        }

        var kept = wanted.Where(era => era.Id is not null).Select(era => era.Id!.Value).ToHashSet();
        var removed = stored.Where(era => !kept.Contains(era.Id)).ToList();

        if (await InUseAsync(db, removed, cancellationToken) is { Count: > 0 } inUse)
        {
            return EraInUse(inUse);
        }

        try
        {
            foreach (var era in removed)
            {
                db.ChronologyEras.Remove(era);
            }

            // Positions are unique per universe and SQLite checks that row by row, so a plain swap
            // of two eras would collide halfway through. Every surviving era steps out of the way to
            // a negative position first, inside the same transaction, and then every era lands on
            // its final one - which lets any reordering through.
            var parked = -1;
            foreach (var era in stored.Where(era => kept.Contains(era.Id)))
            {
                era.SortOrder = parked--;
            }

            await db.SaveChangesAsync(cancellationToken);

            for (var index = 0; index < wanted.Count; index++)
            {
                var input = wanted[index];

                var era = input.Id is { } id ? byId[id] : null;
                if (era is null)
                {
                    era = new ChronologyEra
                    {
                        Id = Guid.NewGuid(),
                        UniverseId = universeId,
                        Name = string.Empty,
                    };
                    db.ChronologyEras.Add(era);
                }

                era.Name = ChronologyValidation.Normalize(input.Name)!;
                era.Abbreviation = ChronologyValidation.Normalize(input.Abbreviation);
                era.SortOrder = index;
                era.Direction = input.Direction;
                era.LabelPosition = input.LabelPosition;
            }

            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsConstraintViolation(failure))
        {
            // The in-use check above answers every ordinary request. Reaching here means something
            // was dated in an era between that check and the delete, and the foreign key held.
            return Results.Problem(
                title: "Chronology changed",
                detail: "Something was dated in one of these date periods while this was being saved. "
                    + "Reload the chronology and try again.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = EraInUseCode });
        }

        return Results.Ok(await DescribeAsync(db, universeId, cancellationToken));
    }

    private sealed record EraUse(Guid Id, string Name, int MomentCount, int YearCount, int SceneCount, int EntryEraCount);

    /// <summary>Of the eras about to be removed, the ones something is still dated in.</summary>
    private static async Task<List<EraUse>> InUseAsync(
        LorexDbContext db,
        List<ChronologyEra> removed,
        CancellationToken cancellationToken)
    {
        if (removed.Count == 0)
        {
            return [];
        }

        var ids = removed.Select(era => era.Id).ToList();

        var moments = await db.TimelineEntries.AsNoTracking()
            .Where(entry => (entry.StartEraId != null && ids.Contains(entry.StartEraId.Value))
                || (entry.EndEraId != null && ids.Contains(entry.EndEraId.Value)))
            .Select(entry => new { entry.StartEraId, entry.EndEraId })
            .ToListAsync(cancellationToken);

        var years = await db.EntityFieldValues.AsNoTracking()
            .Where(value => value.EraId != null && ids.Contains(value.EraId.Value))
            .Select(value => value.EraId!.Value)
            .ToListAsync(cancellationToken);

        // A scene's position is a year counted in an era like any other, even though a story is
        // not lore: removing the era would leave that year floating in no era at all.
        var scenes = await db.Scenes.AsNoTracking()
            .Where(scene => scene.EraId != null && ids.Contains(scene.EraId.Value))
            .Select(scene => scene.EraId!.Value)
            .ToListAsync(cancellationToken);

        // An entry's era is dated on the same line, and its overrides may hold a year in a date period (Issue #41).
        var entryEras = await db.EntityEras.AsNoTracking()
            .Where(era => (era.StartEraId != null && ids.Contains(era.StartEraId.Value))
                || (era.EndEraId != null && ids.Contains(era.EndEraId.Value)))
            .Select(era => new { era.StartEraId, era.EndEraId })
            .ToListAsync(cancellationToken);

        var overrideYears = await db.EntityEraFieldValues.AsNoTracking()
            .Where(value => value.EraId != null && ids.Contains(value.EraId.Value))
            .Select(value => value.EraId!.Value)
            .ToListAsync(cancellationToken);

        return
        [
            .. removed
                .OrderBy(era => era.SortOrder)
                .Select(era => new EraUse(
                    era.Id,
                    era.Name,
                    moments.Count(moment => moment.StartEraId == era.Id || moment.EndEraId == era.Id),
                    years.Count(id => id == era.Id) + overrideYears.Count(id => id == era.Id),
                    scenes.Count(id => id == era.Id),
                    entryEras.Count(entryEra => entryEra.StartEraId == era.Id || entryEra.EndEraId == era.Id)))
                .Where(use => use.MomentCount > 0 || use.YearCount > 0 || use.SceneCount > 0 || use.EntryEraCount > 0),
        ];
    }

    /// <summary>
    /// Refused rather than cleared. Removing an era that dates something would either delete what
    /// is dated in it or leave its year floating in no era, and neither is a choice for Lorex to
    /// make on the author's behalf.
    /// </summary>
    private static IResult EraInUse(List<EraUse> inUse)
    {
        var sentences = inUse.Select(use =>
        {
            var parts = new List<string>();

            if (use.MomentCount > 0)
            {
                parts.Add(use.MomentCount == 1 ? "1 timeline entry" : $"{use.MomentCount} timeline entries");
            }

            if (use.YearCount > 0)
            {
                parts.Add(use.YearCount == 1 ? "1 year on an entry" : $"{use.YearCount} years on entries");
            }

            if (use.SceneCount > 0)
            {
                parts.Add(use.SceneCount == 1 ? "1 scene" : $"{use.SceneCount} scenes");
            }

            if (use.EntryEraCount > 0)
            {
                parts.Add(use.EntryEraCount == 1 ? "1 era of an entry" : $"{use.EntryEraCount} eras of entries");
            }

            return $"\"{use.Name}\" still dates {string.Join(" and ", parts)}";
        });

        return Results.Problem(
            title: inUse.Count == 1 ? "Date period is in use" : "Date periods are in use",
            detail: $"{string.Join("; ", sentences)}, counting anything in the Trash. "
                + "Move them to another date period before removing it.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = EraInUseCode,
                ["eraIds"] = inUse.Select(use => use.Id).ToList(),
            });
    }

    internal static async Task<ChronologyResponse> DescribeAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var eras = await db.ChronologyEras.AsNoTracking()
            .Where(era => era.UniverseId == universeId)
            .OrderBy(era => era.SortOrder)
            .Select(era => new ChronologyEraResponse(
                era.Id,
                era.Name,
                era.Abbreviation,
                era.SortOrder,
                era.Direction,
                era.LabelPosition,
                db.TimelineEntries.Count(entry => entry.StartEraId == era.Id || entry.EndEraId == era.Id),
                db.EntityFieldValues.Count(value => value.EraId == era.Id) + db.EntityEraFieldValues.Count(value => value.EraId == era.Id),
                db.Scenes.Count(scene => scene.EraId == era.Id),
                db.EntityEras.Count(entryEra => entryEra.StartEraId == era.Id || entryEra.EndEraId == era.Id)))
            .ToListAsync(cancellationToken);

        var unplacedMoments = await db.TimelineEntries.AsNoTracking()
            .CountAsync(
                entry => entry.UniverseId == universeId
                    && entry.DeletedAt == null
                    && entry.DateKind != TimelineDateKind.Unknown
                    && entry.StartEraId == null,
                cancellationToken);

        var unplacedYears = await db.EntityFieldValues.AsNoTracking()
            .CountAsync(
                value => value.Entity!.UniverseId == universeId
                    && value.NumberValue != null
                    && value.EraId == null
                    && value.FieldDefinition!.ArchivedAt == null
                    && (value.FieldDefinition.Semantic == EntityFieldSemantic.BirthYear
                        || value.FieldDefinition.Semantic == EntityFieldSemantic.DeathYear),
                cancellationToken);

        var months = await ChronologyCalendarEndpoints.MonthsAsync(db, universeId, cancellationToken);

        var calendar = months.Count == 0
            ? null
            : new ChronologyCalendarResponse(
                months[0].CalendarId,
                [
                    .. months.Select(month => new ChronologyCalendarMonthResponse(
                        month.Id,
                        month.Name,
                        month.Abbreviation,
                        month.SortOrder,
                        month.DayCount,
                        month.UseCount,
                        month.MaxDayUsed)),
                ]);

        return new ChronologyResponse(eras, unplacedMoments, unplacedYears, calendar);
    }
}
