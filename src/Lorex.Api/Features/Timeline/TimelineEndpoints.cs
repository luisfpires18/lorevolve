using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Timeline;

/// <summary>
/// Timeline entries inside one universe. Every route proves universe ownership first, then
/// re-resolves every id the client sent inside that same universe, so an entry id or an
/// entity id from somewhere else is refused without ever confirming that it exists.
/// </summary>
public static class TimelineEndpoints
{
    private const int DefaultPageSize = 25;
    private const int MaxPageSize = 100;

    public static IEndpointRouteBuilder MapTimelineEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/timeline")
            .WithTags("Timeline")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListTimelineEntries");
        group.MapGet("/items", TimelineFeed.ListAsync).WithName("ListTimelineItems");
        group.MapPost("/", CreateAsync).WithName("CreateTimelineEntry");
        group.MapGet("/{entryId:guid}", GetAsync).WithName("GetTimelineEntry");
        group.MapPut("/{entryId:guid}", UpdateAsync).WithName("UpdateTimelineEntry");
        group.MapDelete("/{entryId:guid}", DeleteAsync).WithName("DeleteTimelineEntry");

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] CanonStatus? canonStatus = null,
        [FromQuery] Guid? entityId = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.UniverseId == universeId);

        if (canonStatus is { } status)
        {
            query = query.Where(entry => entry.CanonStatus == status);
        }

        if (entityId is { } participant)
        {
            // Scoped to this universe by the outer filter already, so an id from another
            // universe simply matches nothing rather than reporting that it is foreign.
            query = query.Where(entry => entry.EntityLinks.Any(link => link.EntityId == participant));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var namesEras = await db.ChronologyEras.AnyAsync(era => era.UniverseId == universeId, cancellationToken);

        var rows = await Ordered(query, namesEras)
            .Skip(skip)
            .Take(pageSize)
            .Select(Projection())
            .ToListAsync(cancellationToken);

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new TimelineEntryPage(
            rows.Select(Map).ToList(), page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid entryId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var entry = await LoadAsync(db, universeId, entryId, cancellationToken);
        return entry is null ? Results.NotFound() : Results.Ok(entry);
    }

    /// <summary>
    /// Gated: a Canon moment dated outside a Canon participant's declared lifespan is exactly
    /// what <c>CANON-LIFE-002</c> and <c>CANON-LIFE-003</c> report, and this route is where
    /// the date, the Canon status and the participants all arrive at once.
    /// </summary>
    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] TimelineEntryRequest request,
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
            token => CreateCoreAsync(universeId, request, db, token),
            cancellationToken);
    }

    internal static async Task<IResult> CreateCoreAsync(
        Guid universeId,
        TimelineEntryRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        if (TimelineValidation.Validate(request, chronology) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await ResolveEntitiesAsync(db, universeId, request, cancellationToken)
            is not { } entityIds)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["entityIds"] = ["Link entries from this universe."],
            });
        }

        if (request.Validation is { } details
            && await RuleValidationInput.ValidateMomentAsync(db, universeId, details, null, cancellationToken) is { } detailErrors)
        {
            return Results.ValidationProblem(detailErrors);
        }

        if (await ResolveStoriesAsync(db, universeId, request.StoryIds ?? [], [], cancellationToken) is not { } storyIds)
        {
            return StoriesRefused();
        }

        var now = DateTime.UtcNow;
        var entry = new TimelineEntry
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Title = TimelineValidation.Normalize(request.Title)!,
            CreatedAt = now,
            UpdatedAt = now,
        };

        Apply(entry, request);

        if (request.Validation is { } chosen)
        {
            RuleValidationInput.ApplyMoment(db, entry, chosen);
        }

        foreach (var id in entityIds)
        {
            entry.EntityLinks.Add(new TimelineEntryLink { EntityId = id });
        }

        foreach (var id in storyIds)
        {
            entry.StoryLinks.Add(new TimelineEntryStory { StoryId = id });
        }

        db.TimelineEntries.Add(entry);
        await db.SaveChangesAsync(cancellationToken);

        var created = await LoadAsync(db, universeId, entry.Id, cancellationToken);
        return Results.Created($"/api/universes/{universeId}/timeline/{entry.Id}", created);
    }

    /// <summary>
    /// Gated for the same reasons as creation: redating a moment, promoting it to Canon or
    /// adding a participant can each put a Canon moment outside a Canon lifespan.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid entryId,
        [FromBody] TimelineEntryRequest request,
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
            token => UpdateCoreAsync(universeId, entryId, request, db, token),
            cancellationToken);
    }

    internal static async Task<IResult> UpdateCoreAsync(
        Guid universeId,
        Guid entryId,
        TimelineEntryRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entry = await db.TimelineEntries
            .Include(candidate => candidate.EntityLinks)
            .Include(candidate => candidate.StoryLinks)
            .Include(candidate => candidate.Validation)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == entryId && candidate.UniverseId == universeId,
                cancellationToken);

        if (entry is null)
        {
            return Results.NotFound();
        }

        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        if (TimelineValidation.Validate(request, chronology) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (await ResolveEntitiesAsync(db, universeId, request, cancellationToken)
            is not { } entityIds)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["entityIds"] = ["Link entries from this universe."],
            });
        }

        if (request.Validation is { } details
            && await RuleValidationInput.ValidateMomentAsync(
                db, universeId, details, entry.Validation?.ParticipantEntityId, cancellationToken) is { } detailErrors)
        {
            return Results.ValidationProblem(detailErrors);
        }

        // Left out, the stored stories stand, as the details do: a client that knows nothing of them cannot erase them.
        List<Guid>? storyIds = null;
        if (request.StoryIds is { } requestedStories)
        {
            var stored = entry.StoryLinks.Select(link => link.StoryId).ToHashSet();
            storyIds = await ResolveStoriesAsync(db, universeId, requestedStories, stored, cancellationToken);
            if (storyIds is null)
            {
                return StoriesRefused();
            }
        }

        entry.Title = TimelineValidation.Normalize(request.Title)!;
        Apply(entry, request);
        entry.UpdatedAt = DateTime.UtcNow;

        // Left out of the request, the stored details stand: a client that knows nothing of them cannot erase them.
        if (request.Validation is { } chosen)
        {
            RuleValidationInput.ApplyMoment(db, entry, chosen);
        }

        // The request carries the whole participant set, so the stored links are made to
        // match it: anything absent is dropped, anything new is added, and a link that was
        // already there keeps its row.
        var wanted = entityIds.ToHashSet();

        foreach (var link in entry.EntityLinks.Where(link => !wanted.Contains(link.EntityId)).ToList())
        {
            entry.EntityLinks.Remove(link);
        }

        var existing = entry.EntityLinks.Select(link => link.EntityId).ToHashSet();

        foreach (var id in entityIds.Where(id => !existing.Contains(id)))
        {
            entry.EntityLinks.Add(new TimelineEntryLink { TimelineEntryId = entry.Id, EntityId = id });
        }

        if (storyIds is not null)
        {
            var keep = storyIds.ToHashSet();
            foreach (var link in entry.StoryLinks.Where(link => !keep.Contains(link.StoryId)).ToList())
            {
                entry.StoryLinks.Remove(link);
            }

            var linked = entry.StoryLinks.Select(link => link.StoryId).ToHashSet();
            foreach (var id in storyIds.Where(id => !linked.Contains(id)))
            {
                entry.StoryLinks.Add(new TimelineEntryStory { TimelineEntryId = entry.Id, StoryId = id });
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        var updated = await LoadAsync(db, universeId, entry.Id, cancellationToken);
        return Results.Ok(updated);
    }

    /// <summary>
    /// Reconciled but not gated: removing a moment removes the only findings it could
    /// contribute to, so there is nothing to refuse and everything to resolve.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid entryId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await canon.RecordAsync(
            universeId,
            token => DeleteCoreAsync(universeId, entryId, db, token),
            cancellationToken);
    }

    private static async Task<IResult> DeleteCoreAsync(
        Guid universeId,
        Guid entryId,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entry = await db.TimelineEntries.FirstOrDefaultAsync(
            candidate => candidate.Id == entryId && candidate.UniverseId == universeId,
            cancellationToken);

        if (entry is null)
        {
            return Results.NotFound();
        }

        db.TimelineEntries.Remove(entry);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    // ---------- Writing ----------

    /// <summary>Copies the chronology and status across. Title is set by the caller.</summary>
    private static void Apply(TimelineEntry entry, TimelineEntryRequest request)
    {
        entry.Description = TimelineValidation.Normalize(request.Description);
        entry.CanonStatus = request.CanonStatus;
        entry.DateKind = request.DateKind;
        entry.StartYear = request.StartYear;
        entry.StartMonth = request.StartMonth;
        entry.StartMonthId = request.StartMonthId;
        entry.StartDay = request.StartDay;
        entry.EndYear = request.EndYear;
        entry.EndMonth = request.EndMonth;
        entry.EndMonthId = request.EndMonthId;
        entry.EndDay = request.EndDay;
        entry.StartEraId = request.StartEraId;
        entry.EndEraId = request.EndEraId;
        entry.EraLabel = TimelineValidation.Normalize(request.EraLabel);
    }

    /// <summary>
    /// Re-resolves every requested participant inside this universe. Returns null when any
    /// id does not resolve, which the caller reports as an unusable choice rather than as
    /// someone else's row, so the response discloses nothing about it.
    /// </summary>
    private static async Task<List<Guid>?> ResolveEntitiesAsync(
        LorexDbContext db,
        Guid universeId,
        TimelineEntryRequest request,
        CancellationToken cancellationToken)
    {
        var requested = request.EntityIds?.Distinct().ToList() ?? [];

        if (requested.Count == 0)
        {
            return requested;
        }

        // A trashed entry is deliberately still resolvable here. The form posts the whole
        // participant set on every save, so refusing one would turn an unrelated edit to this
        // moment into a validation failure or silently drop the participation. Nothing new can
        // be pointed at a trashed entry regardless, because the picker never offers one.
        var resolved = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && requested.Contains(entity.Id))
            .Select(entity => entity.Id)
            .ToListAsync(cancellationToken);

        return resolved.Count == requested.Count ? requested : null;
    }

    /// <summary>
    /// Re-resolves every requested story inside this universe, once each. Null when any id is not a story of this universe,
    /// or names a story in the Trash that was not already linked - <paramref name="stored"/> - so an unrelated edit never
    /// drops, or fails on, a link to a story that has since been put in the Trash. Another universe's story answers exactly
    /// as one that does not exist.
    /// </summary>
    private static async Task<List<Guid>?> ResolveStoriesAsync(
        LorexDbContext db,
        Guid universeId,
        IReadOnlyList<Guid> requested,
        HashSet<Guid> stored,
        CancellationToken cancellationToken)
    {
        var wanted = requested.Distinct().ToList();

        if (wanted.Count == 0)
        {
            return wanted;
        }

        if (wanted.Count > TimelineLimits.MaxLinkedStories)
        {
            return null;
        }

        var found = await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == universeId && wanted.Contains(story.Id))
            .Select(story => new { story.Id, IsTrashed = story.DeletedAt != null })
            .ToListAsync(cancellationToken);

        return found.Count == wanted.Count && found.All(story => !story.IsTrashed || stored.Contains(story.Id))
            ? wanted
            : null;
    }

    private static IResult StoriesRefused() =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["storyIds"] =
            [
                $"Choose up to {TimelineLimits.MaxLinkedStories} stories from this universe. A story in the Trash cannot be newly linked.",
            ],
        });

    // ---------- Reading ----------

    /// <summary>
    /// The chronological order, done in SQL so paging stays stable.
    ///
    /// The key is <see cref="ChronologyPoint"/>'s, written as a query: the start era's place in
    /// the order, then the start year signed by that era's direction, then month and day with
    /// an absent one counting as zero - so an entry known only to its year comes before any
    /// dated moment inside it. A custom month ranks by its calendar position plus one
    /// (<see cref="ChronologyPoint.MonthRank"/>), joined live, so reordering the months reorders the dates in them. A universe with no eras has no era to rank by and its years are
    /// already signed, which is exactly the order the timeline has always had. A test holds this
    /// query and the comparer to the same answer.
    ///
    /// Three blocks, in order. Moments placed in time. Then, only on a universe that names eras,
    /// dated moments written before it did: they carry no era, so they are not on its line at
    /// all, and ranking them among the eras would be guessing which one they meant. Then unknown
    /// dates, which are placed in the story but not in time. The free-text era label of the
    /// plain reckoning takes no part in any of it. Title then id break the remaining ties, so two
    /// moments never swap places between one page and the next.
    /// </summary>
    private static IOrderedQueryable<TimelineEntry> Ordered(IQueryable<TimelineEntry> query, bool namesEras) =>
        query
            .OrderBy(entry => entry.DateKind == TimelineDateKind.Unknown ? 2
                : namesEras && entry.StartEraId == null ? 1
                : 0)
            .ThenBy(entry => entry.StartEraId == null ? 0 : entry.StartEra!.SortOrder)
            .ThenBy(entry => entry.StartEraId != null && entry.StartEra!.Direction == ChronologyEraDirection.Descending
                ? -entry.StartYear
                : entry.StartYear)
            .ThenBy(entry => entry.StartMonthId != null ? entry.StartCalendarMonth!.SortOrder + 1 : entry.StartMonth ?? 0)
            .ThenBy(entry => entry.StartDay ?? 0)
            .ThenBy(entry => entry.Title)
            .ThenBy(entry => entry.Id);

    internal static async Task<TimelineEntryResponse?> LoadAsync(
        LorexDbContext db,
        Guid universeId,
        Guid entryId,
        CancellationToken cancellationToken)
    {
        var row = await db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.Id == entryId && entry.UniverseId == universeId)
            .Select(Projection())
            .FirstOrDefaultAsync(cancellationToken);

        return row is null ? null : Map(row);
    }

    /// <summary>
    /// The stored shape, flat. Precision is worked out afterwards in memory rather than
    /// pushed into SQL, so the query stays one statement and the DTO stays derived.
    /// </summary>
    internal sealed record Row(
        Guid Id,
        string Title,
        string? Description,
        CanonStatus CanonStatus,
        TimelineDateKind DateKind,
        int? StartYear,
        int? StartMonth,
        int? StartDay,
        int? EndYear,
        int? EndMonth,
        int? EndDay,
        string? EraLabel,
        Guid? StartEraId,
        Guid? EndEraId,
        List<TimelineEntityLink> Entities,
        List<TimelineStoryLink> Stories,
        DateTime CreatedAt,
        DateTime UpdatedAt,
        bool HasValidation,
        Guid? EventKindId,
        string? EventKindName,
        Guid? MethodId,
        string? MethodName,
        Guid? ParticipantId,
        string? ParticipantName,
        bool IsParticipantTrashed,
        Guid? StartMonthId,
        Guid? EndMonthId);

    internal static System.Linq.Expressions.Expression<Func<TimelineEntry, Row>> Projection() =>
        entry => new Row(
            entry.Id,
            entry.Title,
            entry.Description,
            entry.CanonStatus,
            entry.DateKind,
            entry.StartYear,
            entry.StartMonth,
            entry.StartDay,
            entry.EndYear,
            entry.EndMonth,
            entry.EndDay,
            entry.EraLabel,
            entry.StartEraId,
            entry.EndEraId,
            entry.EntityLinks
                .OrderBy(link => link.Entity!.Name)
                .ThenBy(link => link.EntityId)
                .Select(link => new TimelineEntityLink(
                    link.EntityId,
                    link.Entity!.Name,
                    link.Entity.EntityTypeId,
                    link.Entity.EntityType!.Name,
                    link.Entity.EntityType.Icon,
                    link.Entity.EntityType.AccentColor,
                    link.Entity.CanonStatus,
                    link.Entity.DeletedAt != null))
                .ToList(),
            entry.StoryLinks
                .OrderBy(link => link.Story!.Title)
                .ThenBy(link => link.StoryId)
                .Select(link => new TimelineStoryLink(link.StoryId, link.Story!.Title, link.Story.DeletedAt != null))
                .ToList(),
            entry.CreatedAt,
            entry.UpdatedAt,
            entry.Validation != null,
            entry.Validation!.EventKindTermId,
            entry.Validation.EventKindTerm!.Name,
            entry.Validation.MethodTermId,
            entry.Validation.MethodTerm!.Name,
            entry.Validation.ParticipantEntityId,
            entry.Validation.ParticipantEntity!.Name,
            entry.Validation.ParticipantEntity.DeletedAt != null,
            entry.StartMonthId,
            entry.EndMonthId);

    internal static TimelineEntryResponse Map(Row row) =>
        new(
            row.Id,
            row.Title,
            row.Description,
            row.CanonStatus,
            new TimelineDate(
                row.DateKind,
                row.StartYear,
                row.StartMonth,
                row.StartDay,
                row.EndYear,
                row.EndMonth,
                row.EndDay,
                row.EraLabel,
                TimelineValidation.PrecisionOf(row.StartYear, row.StartMonth, row.StartDay, row.StartMonthId),
                TimelineValidation.PrecisionOf(row.EndYear, row.EndMonth, row.EndDay, row.EndMonthId),
                row.StartEraId,
                row.EndEraId,
                row.StartMonthId,
                row.EndMonthId),
            row.Entities,
            row.CreatedAt,
            row.UpdatedAt,
            row.HasValidation
                ? new TimelineValidationResponse(
                    row.EventKindId is { } eventKind ? new ValidationTermReference(eventKind, row.EventKindName!) : null,
                    row.MethodId is { } method ? new ValidationTermReference(method, row.MethodName!) : null,
                    row.ParticipantId is { } participant
                        ? new TimelineValidationParticipant(participant, row.ParticipantName!, row.IsParticipantTrashed)
                        : null)
                : null,
            row.Stories);
}
