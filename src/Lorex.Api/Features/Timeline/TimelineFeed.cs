using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Timeline;

/// <summary>
/// The unified timeline: one universe's world chronology, read from every place a world date is written, in one order.
///
/// <b>One stored kind, two read ones.</b> A timeline moment (<see cref="TimelineEntry"/>) is the only row the timeline owns. A
/// live scene with a world date, and a live entry's birth or death year, are read from the scene and the entry on every
/// request: never copied, never synchronised. Change the source and the item moves; empty it, or put it in the Trash, and
/// the item is gone; restore it and it returns.
///
/// <b>World order, never narrative order.</b> Every item is ranked by the key the moment list already uses - three blocks
/// (placed in time; dated before the universe named eras; unknown), then the era's place, the year signed by the era's
/// direction, month and day with an absent one as zero - and only then by title, kind and id. A custom month ranks by its
/// place in the calendar, joined live per row in the same statement, so reordering the months reorders every source at once. A scene's place in its story,
/// chapter or plot is never part of it, so a flashback sits where it happens.
///
/// <b>One stream, then one page.</b> The three sources are one UNION ALL of the same flat columns, filtered, counted and
/// paged in SQL. Only the rows on the page are then read whole, one query per source kind, so a page costs a fixed number
/// of queries however many items it holds, and no manuscript text is ever read.
/// </summary>
internal static class TimelineFeed
{
    private const int DefaultPageSize = 25;
    private const int MaxPageSize = 100;

    /// <summary>
    /// <paramref name="source"/> narrows to one kind. <paramref name="storyId"/> narrows to one story: its dated scenes and the
    /// moments linked to it - never birth or death years, which no story is linked to - and a story in the Trash narrows to
    /// nothing. <paramref name="canonStatus"/> is a moment's own status or a fact's entry's; a scene has none, so a status
    /// leaves scenes out. <paramref name="entityId"/> is an entry taking part: in a moment, linked to or the point of view of
    /// a scene, or the entry a fact is about. <paramref name="search"/> matches a moment's title or description, a scene's
    /// title or summary or its story's title, or a fact's entry's name.
    /// </summary>
    public static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] TimelineSourceKind? source = null,
        [FromQuery] Guid? storyId = null,
        [FromQuery] CanonStatus? canonStatus = null,
        [FromQuery] Guid? entityId = null,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (source is { } kind && !Enum.IsDefined(kind))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["source"] = ["That is not something the timeline shows."],
            });
        }

        return Results.Ok(await ReadAsync(db, universeId, source, storyId, canonStatus, entityId, search, page, pageSize, cancellationToken));
    }

    /// <summary>
    /// The feed itself, beneath the route: one page of the unified timeline with the route's filters. The caller has already
    /// proved the universe may be read and that <paramref name="source"/> is a defined kind; every query names the universe.
    /// Shared with the assistant's timeline reading (ADR 0045), so both read the same order and the same filters.
    /// </summary>
    internal static async Task<TimelineItemPage> ReadAsync(
        LorexDbContext db,
        Guid universeId,
        TimelineSourceKind? source,
        Guid? storyId,
        CanonStatus? canonStatus,
        Guid? entityId,
        string? search,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var namesEras = await db.ChronologyEras.AnyAsync(era => era.UniverseId == universeId, cancellationToken);
        var pattern = string.IsNullOrWhiteSpace(search) ? null : $"%{IdeaEndpoints.EscapeLike(search.Trim())}%";

        IQueryable<FeedRow>? stream = null;

        if (source is null or TimelineSourceKind.Event)
        {
            stream = Join(stream, Events(db, universeId, namesEras, storyId, canonStatus, entityId, pattern));
        }

        if ((source is null or TimelineSourceKind.Scene) && canonStatus is null)
        {
            stream = Join(stream, Scenes(db, universeId, namesEras, storyId, entityId, pattern));
        }

        if ((source is null or TimelineSourceKind.LoreFact) && storyId is null)
        {
            stream = Join(stream, Facts(db, universeId, namesEras, canonStatus, entityId, pattern));
        }

        // A status with only scenes asked for, or a story with only facts, leaves nothing to read.
        if (stream is null)
        {
            return new TimelineItemPage([], page, pageSize, 0, 0);
        }

        var totalCount = await stream.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var rows = await stream
            .OrderBy(row => row.Block)
            .ThenBy(row => row.EraOrder)
            .ThenBy(row => row.SignedYear)
            .ThenBy(row => row.MonthRank)
            .ThenBy(row => row.StartDay ?? 0)
            .ThenBy(row => row.Title)
            .ThenBy(row => row.Kind)
            .ThenBy(row => row.Id)
            .Skip(skip)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var items = await EnrichAsync(db, rows, cancellationToken);
        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return new TimelineItemPage(items, page, pageSize, totalCount, totalPages);
    }

    private static IQueryable<FeedRow> Join(IQueryable<FeedRow>? stream, IQueryable<FeedRow> next) =>
        stream is null ? next : stream.Concat(next);

    // ---------- The three sources, as the same flat columns ----------

    /// <summary>
    /// Which of the three blocks a date sits in: placed (0), dated before the universe named eras (1), unknown (2). The same
    /// rule for every source, so a scene written before eras existed waits beside the moments that were.
    /// </summary>
    private static IQueryable<FeedRow> Events(
        LorexDbContext db,
        Guid universeId,
        bool namesEras,
        Guid? storyId,
        CanonStatus? canonStatus,
        Guid? entityId,
        string? pattern)
    {
        var query = db.TimelineEntries.Where(entry => entry.UniverseId == universeId);

        if (storyId is { } story)
        {
            // A link to a story in the Trash is kept, but the story's timeline is not open while it is there.
            query = query.Where(entry => entry.StoryLinks.Any(link => link.StoryId == story && link.Story!.DeletedAt == null));
        }

        if (canonStatus is { } status)
        {
            query = query.Where(entry => entry.CanonStatus == status);
        }

        if (entityId is { } participant)
        {
            query = query.Where(entry => entry.EntityLinks.Any(link => link.EntityId == participant));
        }

        if (pattern is not null)
        {
            query = query.Where(entry => EF.Functions.Like(entry.Title, pattern, "\\")
                || (entry.Description != null && EF.Functions.Like(entry.Description, pattern, "\\")));
        }

        return query.Select(entry => new FeedRow
        {
            Kind = (int)TimelineSourceKind.Event,
            Id = entry.Id,
            Title = entry.Title,
            Block = entry.DateKind == TimelineDateKind.Unknown ? 2 : namesEras && entry.StartEraId == null ? 1 : 0,
            EraOrder = entry.StartEraId == null ? 0 : entry.StartEra!.SortOrder,
            SignedYear = entry.StartEraId != null && entry.StartEra!.Direction == ChronologyEraDirection.Descending
                ? -entry.StartYear
                : entry.StartYear,
            DateKind = (int)entry.DateKind,
            StartYear = entry.StartYear,
            MonthRank = entry.StartMonthId != null ? entry.StartCalendarMonth!.SortOrder + 1 : entry.StartMonth ?? 0,
            StartMonth = entry.StartMonth,
            StartMonthId = entry.StartMonthId,
            StartDay = entry.StartDay,
            EndYear = entry.EndYear,
            EndMonth = entry.EndMonth,
            EndMonthId = entry.EndMonthId,
            EndDay = entry.EndDay,
            EraLabel = entry.EraLabel,
            StartEraId = entry.StartEraId,
            EndEraId = entry.EndEraId,
        });
    }

    /// <summary>
    /// Live scenes of live stories that carry a year. A scene stores a point - era, year, month, day - and nothing more, so it is
    /// an exact date at the precision it was written to, never approximate and never a span.
    /// </summary>
    private static IQueryable<FeedRow> Scenes(
        LorexDbContext db,
        Guid universeId,
        bool namesEras,
        Guid? storyId,
        Guid? entityId,
        string? pattern)
    {
        var query = db.Scenes.Where(scene => scene.Story!.UniverseId == universeId
            && scene.Year != null
            && scene.DeletedAt == null
            && scene.Story.DeletedAt == null);

        if (storyId is { } story)
        {
            query = query.Where(scene => scene.StoryId == story);
        }

        if (entityId is { } participant)
        {
            query = query.Where(scene => scene.PovEntityId == participant
                || scene.EntityLinks.Any(link => link.EntityId == participant));
        }

        if (pattern is not null)
        {
            query = query.Where(scene => EF.Functions.Like(scene.Title, pattern, "\\")
                || (scene.Summary != null && EF.Functions.Like(scene.Summary, pattern, "\\"))
                || EF.Functions.Like(scene.Story!.Title, pattern, "\\"));
        }

        return query.Select(scene => new FeedRow
        {
            Kind = (int)TimelineSourceKind.Scene,
            Id = scene.Id,
            Title = scene.Title,
            Block = namesEras && scene.EraId == null ? 1 : 0,
            EraOrder = scene.EraId == null ? 0 : scene.Era!.SortOrder,
            SignedYear = scene.EraId != null && scene.Era!.Direction == ChronologyEraDirection.Descending
                ? -scene.Year
                : scene.Year,
            DateKind = (int)TimelineDateKind.Exact,
            StartYear = scene.Year,
            MonthRank = scene.MonthId != null ? scene.CalendarMonth!.SortOrder + 1 : scene.Month ?? 0,
            StartMonth = scene.Month,
            StartMonthId = scene.MonthId,
            StartDay = scene.Day,
            EndYear = null,
            EndMonth = null,
            EndMonthId = null,
            EndDay = null,
            EraLabel = null,
            StartEraId = scene.EraId,
            EndEraId = null,
        });
    }

    /// <summary>
    /// Live entries' birth and death years: a whole-number value of an active field that means one, nothing else (an archived
    /// field's years are kept and read again once it is restored, Issue #39). Age is not a moment,
    /// and a Date field holds a real-world calendar date, not a year of this world, so neither is read.
    /// </summary>
    private static IQueryable<FeedRow> Facts(
        LorexDbContext db,
        Guid universeId,
        bool namesEras,
        CanonStatus? canonStatus,
        Guid? entityId,
        string? pattern)
    {
        var query = db.EntityFieldValues.Where(value => value.Entity!.UniverseId == universeId
            && value.Entity.DeletedAt == null
            && value.NumberValue != null
            && value.NumberValue == (double)(int)value.NumberValue
            && value.FieldDefinition!.ArchivedAt == null
            && (value.FieldDefinition.Semantic == EntityFieldSemantic.BirthYear
                || value.FieldDefinition.Semantic == EntityFieldSemantic.DeathYear));

        if (canonStatus is { } status)
        {
            query = query.Where(value => value.Entity!.CanonStatus == status);
        }

        if (entityId is { } participant)
        {
            query = query.Where(value => value.EntityId == participant);
        }

        if (pattern is not null)
        {
            query = query.Where(value => EF.Functions.Like(value.Entity!.Name, pattern, "\\"));
        }

        return query.Select(value => new FeedRow
        {
            Kind = (int)TimelineSourceKind.LoreFact,
            Id = value.Id,
            Title = value.Entity!.Name,
            Block = namesEras && value.EraId == null ? 1 : 0,
            EraOrder = value.EraId == null ? 0 : value.Era!.SortOrder,
            SignedYear = value.EraId != null && value.Era!.Direction == ChronologyEraDirection.Descending
                ? -(int)value.NumberValue!.Value
                : (int)value.NumberValue!.Value,
            DateKind = (int)TimelineDateKind.Exact,
            StartYear = (int)value.NumberValue!.Value,
            MonthRank = 0,
            StartMonth = null,
            StartMonthId = null,
            StartDay = null,
            EndYear = null,
            EndMonth = null,
            EndMonthId = null,
            EndDay = null,
            EraLabel = null,
            StartEraId = value.EraId,
            EndEraId = null,
        });
    }

    // ---------- The page, read whole ----------

    /// <summary>
    /// One query per source kind on the page, never one per item: the moments whole, the scenes' story, chapter and plot
    /// context, the facts' entries. A row whose source changed between the page query and these is left out rather than
    /// guessed at.
    /// </summary>
    private static async Task<List<TimelineItem>> EnrichAsync(
        LorexDbContext db,
        List<FeedRow> rows,
        CancellationToken cancellationToken)
    {
        var eventIds = Ids(rows, TimelineSourceKind.Event);
        var sceneIds = Ids(rows, TimelineSourceKind.Scene);
        var factIds = Ids(rows, TimelineSourceKind.LoreFact);

        var events = eventIds.Count == 0
            ? []
            : (await db.TimelineEntries.AsNoTracking()
                .Where(entry => eventIds.Contains(entry.Id))
                .Select(TimelineEndpoints.Projection())
                .ToListAsync(cancellationToken))
            .ToDictionary(row => row.Id, TimelineEndpoints.Map);

        var scenes = sceneIds.Count == 0
            ? []
            : await db.Scenes.AsNoTracking()
                .Where(scene => sceneIds.Contains(scene.Id))
                .Select(scene => new
                {
                    scene.Id,
                    Source = new TimelineSceneSource(
                        scene.StoryId,
                        scene.Story!.Title,
                        scene.ChapterId,
                        scene.ChapterId == null ? null : scene.Chapter!.SortOrder + 1,
                        scene.ChapterId == null ? null : scene.Chapter!.Title,
                        db.PlotBeatScenes
                            .Where(link => link.SceneId == scene.Id
                                && link.PlotBeat!.DeletedAt == null
                                && link.PlotBeat.PlotArc!.DeletedAt == null)
                            .OrderBy(link => link.PlotBeat!.PlotArc!.SortOrder)
                            .ThenBy(link => link.PlotBeat!.SortOrder)
                            .Select(link => (Guid?)link.PlotBeatId)
                            .FirstOrDefault(),
                        db.PlotBeatScenes.Count(link => link.SceneId == scene.Id
                            && link.PlotBeat!.DeletedAt == null
                            && link.PlotBeat.PlotArc!.DeletedAt == null)),
                })
                .ToDictionaryAsync(scene => scene.Id, scene => scene.Source, cancellationToken);

        var facts = factIds.Count == 0
            ? []
            : await db.EntityFieldValues.AsNoTracking()
                .Where(value => factIds.Contains(value.Id))
                .Select(value => new
                {
                    value.Id,
                    Source = new TimelineLoreFactSource(
                        value.EntityId,
                        value.FieldDefinition!.Semantic!.Value,
                        value.Entity!.CanonStatus,
                        value.Entity.EntityTypeId,
                        value.Entity.EntityType!.Name,
                        value.Entity.EntityType.Icon,
                        value.Entity.EntityType.AccentColor),
                })
                .ToDictionaryAsync(value => value.Id, value => value.Source, cancellationToken);

        var items = new List<TimelineItem>(rows.Count);

        foreach (var row in rows)
        {
            var kind = (TimelineSourceKind)row.Kind;
            var date = new TimelineDate(
                (TimelineDateKind)row.DateKind,
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
                row.EndMonthId);

            var item = kind switch
            {
                TimelineSourceKind.Event when events.TryGetValue(row.Id, out var entry) =>
                    new TimelineItem(kind, row.Id, entry.Title, entry.Date, entry, null, null),
                TimelineSourceKind.Scene when scenes.TryGetValue(row.Id, out var scene) =>
                    new TimelineItem(kind, row.Id, row.Title, date, null, scene, null),
                TimelineSourceKind.LoreFact when facts.TryGetValue(row.Id, out var fact) =>
                    new TimelineItem(kind, row.Id, row.Title, date, null, null, fact),
                _ => null,
            };

            if (item is not null)
            {
                items.Add(item);
            }
        }

        return items;
    }

    private static List<Guid> Ids(List<FeedRow> rows, TimelineSourceKind kind) =>
        [.. rows.Where(row => row.Kind == (int)kind).Select(row => row.Id)];

    /// <summary>
    /// The columns every source is read as, so the three can be one UNION ALL. A class with settable members, not a record,
    /// because a set operation needs a projection EF Core can see column by column. The kind and date kind are numbers here
    /// and enums again once read.
    /// </summary>
    private sealed class FeedRow
    {
        public int Kind { get; set; }

        public Guid Id { get; set; }

        public string Title { get; set; } = "";

        public int Block { get; set; }

        public int EraOrder { get; set; }

        public int? SignedYear { get; set; }

        public int DateKind { get; set; }

        public int? StartYear { get; set; }

        /// <summary>The month's place in the year: the numeric month, or a custom month's position plus one, 0 for none.</summary>
        public int MonthRank { get; set; }

        public int? StartMonth { get; set; }

        public Guid? StartMonthId { get; set; }

        public int? StartDay { get; set; }

        public int? EndYear { get; set; }

        public int? EndMonth { get; set; }

        public Guid? EndMonthId { get; set; }

        public int? EndDay { get; set; }

        public string? EraLabel { get; set; }

        public Guid? StartEraId { get; set; }

        public Guid? EndEraId { get; set; }
    }
}
