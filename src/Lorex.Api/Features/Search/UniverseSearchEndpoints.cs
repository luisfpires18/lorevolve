using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Search;

/// <summary>
/// The universe search behind the persistent search bar (ADR 0031): what an author typed, looked for across the recorded
/// content of one universe - lore and articles, stories, chapters, scenes, plot arcs and beats, saved manuscripts, the ideas
/// that belong to the universe, and its world rules.
///
/// <b>Recorded words, nothing more.</b> Keyword search over saved text, with the lore search's own rules: words ANDed, the
/// last one a prefix, accents folded, nothing typed ever run as query syntax. No meaning is read, no question answered.
///
/// <b>One universe, the caller's.</b> Ownership is proved before anything is read, so another account's universe - whatever
/// was typed - is the same 404 as one that does not exist. Every query then names this universe; ideas also name the
/// account, and an idea that belongs to no universe is never a result here.
///
/// <b>Live content only, as the workspace sees it.</b> Nothing in the Trash, and nothing inside something that is: a scene
/// or arc of a trashed story, a beat of a trashed arc, the prose of a trashed scene. Archived entries stay out, as the lore
/// listing keeps them out. Local recovery copies never reach the server and are never searched.
///
/// <b>Best first, and every kind represented.</b> Each kind is its own query - its own index's scores are compared only with
/// each other - and returns at most <see cref="ResultsPerKind"/>, best first by where the words were found and then by BM25.
/// The kinds are then merged by where the words were found - a title, then planning text (a summary, premise, description,
/// notes or idea body), then long prose (an article or a manuscript) - and inside that by a fixed order of kinds, so a long
/// manuscript can never crowd a title out. No score crosses an index.
///
/// A fixed number of queries whatever matches: the ownership check, one per kind, and one excerpt query per index.
/// </summary>
public static class UniverseSearchEndpoints
{
    /// <summary>The most results of one kind a search returns. Enough to recognise what matched, few enough to read.</summary>
    public const int ResultsPerKind = 5;

    /// <summary>Where the words were found, as the merge ranks it. A title beats planning text, which beats long prose.</summary>
    private const int TitleTier = 0;

    private const int PlanningTier = 1;

    private const int ProseTier = 2;

    public static IEndpointRouteBuilder MapUniverseSearchEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/universes/{universeId:guid}/search", SearchAsync)
            .WithTags("Search")
            .WithName("SearchUniverse")
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> SearchAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] string? q = null)
    {
        var ownerId = principal.RequireUserId();

        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return Results.Ok(await RunAsync(db, universeId, q, ownerId, cancellationToken));
    }

    /// <summary>
    /// The search itself, beneath the bar's route: the one implementation of what searching a universe means, shared by the
    /// bar and by anything else that reads the universe the same way (the assistant, ADR 0045). The caller has already
    /// proved the universe may be read; this names it in every query.
    ///
    /// <paramref name="ideasOwnerId"/> is the account whose ideas assigned to this universe are searched too, as the bar
    /// does for the signed-in author. Null searches no ideas at all: the idea query is not run.
    /// </summary>
    internal static async Task<UniverseSearchResponse> RunAsync(
        LorexDbContext db,
        Guid universeId,
        string? q,
        string? ideasOwnerId,
        CancellationToken cancellationToken)
    {
        // Nothing typed, or nothing with a letter or a digit in it: there is no word to look for, so nothing is found. The
        // same expression the lore search builds, so both searches read input the same way.
        var expression = EntitySearchIndex.BuildMatchExpression(q);
        if (expression is null)
        {
            return new UniverseSearchResponse([], false);
        }

        var found = new List<Found>();

        await AddEntitiesAsync(db, universeId, expression, found, cancellationToken);
        await AddStoryContentAsync(db, universeId, expression, found, cancellationToken);
        await AddManuscriptsAsync(db, universeId, expression, found, cancellationToken);
        if (ideasOwnerId is not null)
        {
            await AddIdeasAsync(db, ideasOwnerId, universeId, expression, found, cancellationToken);
        }

        await AddWorldRulesAsync(db, universeId, expression, found, cancellationToken);

        // Each kind read one row past its limit: that row is not shown, it only says the kind holds more.
        var hasMore = found.Exists(one => one.Position >= ResultsPerKind);

        // Where the words were found first, then a fixed order of kinds - the enum's - then each kind's own order. Stable,
        // so the same search over the same content always reads the same way.
        List<UniverseSearchResult> results =
        [
            .. found
                .Where(one => one.Position < ResultsPerKind)
                .OrderBy(one => one.Tier)
                .ThenBy(one => (int)one.Result.Kind)
                .ThenBy(one => one.Position)
                .Select(one => one.Result),
        ];

        return new UniverseSearchResponse(results, hasMore);
    }

    // ---------- Lore ----------

    /// <summary>
    /// Entries, by the lore index: one result per entry however many of its parts hold the words, so an entry whose name and
    /// article both match is not listed twice. Where the words were only in its aliases, summary or article, the excerpt says
    /// so.
    /// </summary>
    private static async Task AddEntitiesAsync(
        LorexDbContext db,
        Guid universeId,
        string expression,
        List<Found> found,
        CancellationToken cancellationToken)
    {
        var rows = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && entity.DeletedAt == null && !entity.IsArchived)
            .Join(
                EntitySearchIndex.MatchByField(db, expression),
                entity => entity.Id,
                match => match.EntityId,
                (entity, match) => new
                {
                    entity.Id,
                    entity.Name,
                    TypeName = entity.EntityType!.Name,
                    match.Field,
                    match.Rank,
                })
            .OrderBy(row => row.Field)
            .ThenBy(row => row.Rank)
            .ThenBy(row => row.Id)
            .Take(ResultsPerKind + 1)
            .ToListAsync(cancellationToken);

        var excerpts = await EntitySearchIndex.FieldExcerptsAsync(
            db,
            expression,
            [.. rows.Take(ResultsPerKind).Where(row => row.Field != EntitySearchField.Name).Select(row => row.Id)],
            cancellationToken);

        for (var position = 0; position < rows.Count; position++)
        {
            var row = rows[position];
            var excerpt = excerpts.GetValueOrDefault(row.Id);

            var (field, parts, tier) = row.Field switch
            {
                EntitySearchField.Name => (UniverseSearchField.Title, (IReadOnlyList<SearchExcerptPart>?)null, TitleTier),
                EntitySearchField.Alias => (UniverseSearchField.Alias, excerpt?.Aliases, TitleTier),
                EntitySearchField.Summary => (UniverseSearchField.Summary, excerpt?.Summary, PlanningTier),
                _ => (UniverseSearchField.Article, excerpt?.Article, ProseTier),
            };

            found.Add(new Found(
                tier,
                position,
                Result(UniverseSearchKind.Entity, row.Id, row.Name, field, parts) with { EntityTypeName = row.TypeName }));
        }
    }

    // ---------- Stories ----------

    /// <summary>
    /// Stories, chapters, scenes, arcs and beats, each kind its own query over the one planning-text index, each limited to
    /// what is live in this universe: the row itself and everything it sits inside.
    /// </summary>
    private static async Task AddStoryContentAsync(
        LorexDbContext db,
        Guid universeId,
        string expression,
        List<Found> found,
        CancellationToken cancellationToken)
    {
        var stories = await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == universeId && story.DeletedAt == null)
            .Join(
                UniverseSearchIndex.StoryContent(db, UniverseSearchIndex.StoryKind, expression),
                story => story.Id,
                match => match.ItemId,
                (story, match) => new { story.Id, story.Title, match.Field, match.Rank })
            .OrderBy(row => row.Field)
            .ThenBy(row => row.Rank)
            .ThenBy(row => row.Id)
            .Take(ResultsPerKind + 1)
            .ToListAsync(cancellationToken);

        var chapters = await db.Chapters.AsNoTracking()
            .Where(chapter => chapter.DeletedAt == null
                && chapter.Story!.UniverseId == universeId
                && chapter.Story.DeletedAt == null)
            .Join(
                UniverseSearchIndex.StoryContent(db, UniverseSearchIndex.ChapterKind, expression),
                chapter => chapter.Id,
                match => match.ItemId,
                (chapter, match) => new
                {
                    chapter.Id,
                    chapter.Title,
                    chapter.SortOrder,
                    chapter.StoryId,
                    StoryTitle = chapter.Story!.Title,
                    match.Field,
                    match.Rank,
                })
            .OrderBy(row => row.Field)
            .ThenBy(row => row.Rank)
            .ThenBy(row => row.Id)
            .Take(ResultsPerKind + 1)
            .ToListAsync(cancellationToken);

        // A live scene is never in a chapter in the Trash - a chapter goes there holding none (ADR 0029) - but the chapter
        // named is still only ever a live one.
        var scenes = await db.Scenes.AsNoTracking()
            .Where(scene => scene.DeletedAt == null
                && scene.Story!.UniverseId == universeId
                && scene.Story.DeletedAt == null)
            .Join(
                UniverseSearchIndex.StoryContent(db, UniverseSearchIndex.SceneKind, expression),
                scene => scene.Id,
                match => match.ItemId,
                (scene, match) => new
                {
                    scene.Id,
                    scene.Title,
                    scene.StoryId,
                    StoryTitle = scene.Story!.Title,
                    ChapterTitle = scene.Chapter != null && scene.Chapter.DeletedAt == null ? scene.Chapter.Title : null,
                    ChapterOrder = scene.Chapter != null && scene.Chapter.DeletedAt == null
                        ? (int?)scene.Chapter.SortOrder
                        : null,
                    match.Field,
                    match.Rank,
                })
            .OrderBy(row => row.Field)
            .ThenBy(row => row.Rank)
            .ThenBy(row => row.Id)
            .Take(ResultsPerKind + 1)
            .ToListAsync(cancellationToken);

        var arcs = await db.PlotArcs.AsNoTracking()
            .Where(arc => arc.DeletedAt == null
                && arc.Story!.UniverseId == universeId
                && arc.Story.DeletedAt == null)
            .Join(
                UniverseSearchIndex.StoryContent(db, UniverseSearchIndex.PlotArcKind, expression),
                arc => arc.Id,
                match => match.ItemId,
                (arc, match) => new
                {
                    arc.Id,
                    arc.Title,
                    arc.StoryId,
                    StoryTitle = arc.Story!.Title,
                    match.Field,
                    match.Rank,
                })
            .OrderBy(row => row.Field)
            .ThenBy(row => row.Rank)
            .ThenBy(row => row.Id)
            .Take(ResultsPerKind + 1)
            .ToListAsync(cancellationToken);

        var beats = await db.PlotBeats.AsNoTracking()
            .Where(beat => beat.DeletedAt == null
                && beat.PlotArc!.DeletedAt == null
                && beat.PlotArc.Story!.UniverseId == universeId
                && beat.PlotArc.Story.DeletedAt == null)
            .Join(
                UniverseSearchIndex.StoryContent(db, UniverseSearchIndex.PlotBeatKind, expression),
                beat => beat.Id,
                match => match.ItemId,
                (beat, match) => new
                {
                    beat.Id,
                    beat.Title,
                    beat.PlotArcId,
                    ArcTitle = beat.PlotArc!.Title,
                    beat.PlotArc.StoryId,
                    StoryTitle = beat.PlotArc.Story!.Title,
                    match.Field,
                    match.Rank,
                })
            .OrderBy(row => row.Field)
            .ThenBy(row => row.Rank)
            .ThenBy(row => row.Id)
            .Take(ResultsPerKind + 1)
            .ToListAsync(cancellationToken);

        // One excerpt query for every kind above, and only for results whose words reached past their title.
        IEnumerable<(Guid Id, int Field)> shown =
        [
            .. stories.Take(ResultsPerKind).Select(row => (row.Id, row.Field)),
            .. chapters.Take(ResultsPerKind).Select(row => (row.Id, row.Field)),
            .. scenes.Take(ResultsPerKind).Select(row => (row.Id, row.Field)),
            .. arcs.Take(ResultsPerKind).Select(row => (row.Id, row.Field)),
            .. beats.Take(ResultsPerKind).Select(row => (row.Id, row.Field)),
        ];

        var excerpts = await UniverseSearchIndex.StoryContentExcerptsAsync(
            db,
            expression,
            [.. shown.Where(row => row.Field != UniverseSearchIndex.TitleField).Select(row => row.Id)],
            cancellationToken);

        for (var position = 0; position < stories.Count; position++)
        {
            var row = stories[position];
            var (field, parts, tier) = StoryField(row.Field, UniverseSearchField.Premise, excerpts.GetValueOrDefault(row.Id));

            found.Add(new Found(
                tier,
                position,
                Result(UniverseSearchKind.Story, row.Id, row.Title, field, parts) with { StoryId = row.Id }));
        }

        for (var position = 0; position < chapters.Count; position++)
        {
            var row = chapters[position];
            var (field, parts, tier) = StoryField(row.Field, UniverseSearchField.Summary, excerpts.GetValueOrDefault(row.Id));

            found.Add(new Found(
                tier,
                position,
                Result(UniverseSearchKind.Chapter, row.Id, row.Title, field, parts) with
                {
                    StoryId = row.StoryId,
                    StoryTitle = row.StoryTitle,
                    ChapterNumber = row.SortOrder + 1,
                }));
        }

        for (var position = 0; position < scenes.Count; position++)
        {
            var row = scenes[position];
            var (field, parts, tier) = StoryField(row.Field, UniverseSearchField.Summary, excerpts.GetValueOrDefault(row.Id));

            found.Add(new Found(
                tier,
                position,
                Result(UniverseSearchKind.Scene, row.Id, row.Title, field, parts) with
                {
                    StoryId = row.StoryId,
                    StoryTitle = row.StoryTitle,
                    ChapterTitle = row.ChapterTitle,
                    ChapterNumber = row.ChapterOrder + 1,
                }));
        }

        for (var position = 0; position < arcs.Count; position++)
        {
            var row = arcs[position];
            var (field, parts, tier) = StoryField(row.Field, UniverseSearchField.Description, excerpts.GetValueOrDefault(row.Id));

            found.Add(new Found(
                tier,
                position,
                Result(UniverseSearchKind.PlotArc, row.Id, row.Title, field, parts) with
                {
                    StoryId = row.StoryId,
                    StoryTitle = row.StoryTitle,
                }));
        }

        for (var position = 0; position < beats.Count; position++)
        {
            var row = beats[position];
            var (field, parts, tier) = StoryField(row.Field, UniverseSearchField.Description, excerpts.GetValueOrDefault(row.Id));

            found.Add(new Found(
                tier,
                position,
                Result(UniverseSearchKind.PlotBeat, row.Id, row.Title, field, parts) with
                {
                    StoryId = row.StoryId,
                    StoryTitle = row.StoryTitle,
                    PlotArcId = row.PlotArcId,
                    PlotArcTitle = row.ArcTitle,
                }));
        }
    }

    /// <summary>
    /// Scenes whose saved prose holds the words - a result of its own beside the scene, because the prose and the planning
    /// open in different places. Only the prose's index copy is read, for the excerpt; never a manuscript row's text.
    /// </summary>
    private static async Task AddManuscriptsAsync(
        LorexDbContext db,
        Guid universeId,
        string expression,
        List<Found> found,
        CancellationToken cancellationToken)
    {
        var rows = await db.SceneManuscripts.AsNoTracking()
            .Where(manuscript => manuscript.Scene!.DeletedAt == null
                && manuscript.Scene.Story!.UniverseId == universeId
                && manuscript.Scene.Story.DeletedAt == null)
            .Join(
                UniverseSearchIndex.Manuscripts(db, expression),
                manuscript => manuscript.SceneId,
                match => match.ItemId,
                (manuscript, match) => new
                {
                    manuscript.SceneId,
                    manuscript.Scene!.Title,
                    manuscript.Scene.StoryId,
                    StoryTitle = manuscript.Scene.Story!.Title,
                    ChapterTitle = manuscript.Scene.Chapter != null && manuscript.Scene.Chapter.DeletedAt == null
                        ? manuscript.Scene.Chapter.Title
                        : null,
                    ChapterOrder = manuscript.Scene.Chapter != null && manuscript.Scene.Chapter.DeletedAt == null
                        ? (int?)manuscript.Scene.Chapter.SortOrder
                        : null,
                    match.Rank,
                })
            .OrderBy(row => row.Rank)
            .ThenBy(row => row.SceneId)
            .Take(ResultsPerKind + 1)
            .ToListAsync(cancellationToken);

        var excerpts = await UniverseSearchIndex.ManuscriptExcerptsAsync(
            db,
            expression,
            [.. rows.Take(ResultsPerKind).Select(row => row.SceneId)],
            cancellationToken);

        for (var position = 0; position < rows.Count; position++)
        {
            var row = rows[position];

            found.Add(new Found(
                ProseTier,
                position,
                Result(
                    UniverseSearchKind.Manuscript,
                    row.SceneId,
                    row.Title,
                    UniverseSearchField.Prose,
                    excerpts.GetValueOrDefault(row.SceneId)?.First) with
                {
                    StoryId = row.StoryId,
                    StoryTitle = row.StoryTitle,
                    ChapterTitle = row.ChapterTitle,
                    ChapterNumber = row.ChapterOrder + 1,
                }));
        }
    }

    // ---------- Ideas ----------

    /// <summary>
    /// The account's live ideas that belong to this universe. The account is named as well as the universe, and an idea with
    /// no universe cannot match a universe id, so an unassigned idea is never a result.
    /// </summary>
    private static async Task AddIdeasAsync(
        LorexDbContext db,
        string ownerId,
        Guid universeId,
        string expression,
        List<Found> found,
        CancellationToken cancellationToken)
    {
        var rows = await db.Ideas.AsNoTracking()
            .Where(idea => idea.OwnerId == ownerId && idea.UniverseId == universeId && idea.DeletedAt == null)
            .Join(
                UniverseSearchIndex.Ideas(db, expression),
                idea => idea.Id,
                match => match.ItemId,
                (idea, match) => new { idea.Id, idea.Title, match.Field, match.Rank })
            .OrderBy(row => row.Field)
            .ThenBy(row => row.Rank)
            .ThenBy(row => row.Id)
            .Take(ResultsPerKind + 1)
            .ToListAsync(cancellationToken);

        var excerpts = await UniverseSearchIndex.IdeaExcerptsAsync(
            db,
            expression,
            [.. rows.Take(ResultsPerKind).Where(row => row.Field != UniverseSearchIndex.TitleField).Select(row => row.Id)],
            cancellationToken);

        for (var position = 0; position < rows.Count; position++)
        {
            var row = rows[position];
            var inTitle = row.Field == UniverseSearchIndex.TitleField;

            found.Add(new Found(
                inTitle ? TitleTier : PlanningTier,
                position,
                Result(
                    UniverseSearchKind.Idea,
                    row.Id,
                    row.Title,
                    inTitle ? UniverseSearchField.Title : UniverseSearchField.Body,
                    inTitle ? null : excerpts.GetValueOrDefault(row.Id)?.First)));
        }
    }

    // ---------- World rules ----------

    /// <summary>
    /// The universe's live world rules, by title or description. A rule in the Trash is never a result. Its words are matched
    /// as words and nothing more: a rule is found by what it says, never by anything read into it.
    /// </summary>
    private static async Task AddWorldRulesAsync(
        LorexDbContext db,
        Guid universeId,
        string expression,
        List<Found> found,
        CancellationToken cancellationToken)
    {
        var rows = await db.WorldRules.AsNoTracking()
            .Where(rule => rule.UniverseId == universeId && rule.DeletedAt == null)
            .Join(
                UniverseSearchIndex.WorldRules(db, expression),
                rule => rule.Id,
                match => match.ItemId,
                (rule, match) => new { rule.Id, rule.Title, match.Field, match.Rank })
            .OrderBy(row => row.Field)
            .ThenBy(row => row.Rank)
            .ThenBy(row => row.Id)
            .Take(ResultsPerKind + 1)
            .ToListAsync(cancellationToken);

        var excerpts = await UniverseSearchIndex.WorldRuleExcerptsAsync(
            db,
            expression,
            [.. rows.Take(ResultsPerKind).Where(row => row.Field != UniverseSearchIndex.TitleField).Select(row => row.Id)],
            cancellationToken);

        for (var position = 0; position < rows.Count; position++)
        {
            var row = rows[position];
            var inTitle = row.Field == UniverseSearchIndex.TitleField;

            found.Add(new Found(
                inTitle ? TitleTier : PlanningTier,
                position,
                Result(
                    UniverseSearchKind.WorldRule,
                    row.Id,
                    row.Title,
                    inTitle ? UniverseSearchField.Title : UniverseSearchField.Description,
                    inTitle ? null : excerpts.GetValueOrDefault(row.Id)?.First)));
        }
    }

    // ---------- Shaping ----------

    /// <summary>
    /// A story content field code as a result says it: the title, the kind's own name for its summary column, or the notes -
    /// with the excerpt from that column and the tier it merges in.
    /// </summary>
    private static (UniverseSearchField Field, IReadOnlyList<SearchExcerptPart>? Excerpt, int Tier) StoryField(
        int field,
        UniverseSearchField summaryName,
        UniverseSearchExcerpts? excerpts) =>
        field switch
        {
            UniverseSearchIndex.TitleField => (UniverseSearchField.Title, null, TitleTier),
            UniverseSearchIndex.SecondField => (summaryName, excerpts?.First, PlanningTier),
            _ => (UniverseSearchField.Notes, excerpts?.Second, PlanningTier),
        };

    private static UniverseSearchResult Result(
        UniverseSearchKind kind,
        Guid id,
        string title,
        UniverseSearchField field,
        IReadOnlyList<SearchExcerptPart>? excerpt) =>
        new(kind, id, title, field, excerpt, null, null, null, null, null, null, null);

    /// <summary>
    /// One result before the merge: where its words were found, and its place among its own kind. A place at or beyond
    /// <see cref="ResultsPerKind"/> is the one extra row read to know that a kind holds more than it shows.
    /// </summary>
    private sealed record Found(int Tier, int Position, UniverseSearchResult Result);
}
