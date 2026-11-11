using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// The stories told inside one universe. Every route proves universe ownership first and then finds
/// the story by its id and that universe together, so a story id from another world answers exactly
/// as a missing one does.
///
/// Nothing here passes the Canon promotion gate or reconciles Canon Integrity, and that is the
/// point rather than an omission: a story contributes no facts. Its scenes reference lore and never
/// restate it, so no write to a story can make the world contradict itself or stop doing so
/// (ADR 0024).
///
/// A story in the Trash answers every route here, and every route beneath it, as a missing one does.
/// Restoring it is the Trash's work (ADR 0029).
/// </summary>
public static class StoryEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a story save written over a version that is no longer current.</summary>
    public const string ChangedCode = "story_changed";

    public static IEndpointRouteBuilder MapStoryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/stories")
            .WithTags("Stories")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListStories");
        group.MapPost("/", CreateAsync).WithName("CreateStory");
        group.MapPut("/order", ReorderAsync).WithName("ReorderStories");
        group.MapGet("/{storyId:guid}", GetAsync).WithName("GetStory");
        group.MapPut("/{storyId:guid}", UpdateAsync).WithName("UpdateStory");
        group.MapDelete("/{storyId:guid}", DeleteAsync).WithName("DeleteStory");

        return endpoints;
    }

    /// <summary>
    /// Every story in the universe, in the author's order (ties by title). Unpaged: a universe holds a handful of stories, not
    /// thousands, and paging is the obvious first change if that ever stops being true.
    /// </summary>
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

        var stories = await db.Stories.AsNoTracking()
            .Where(story => story.UniverseId == universeId && story.DeletedAt == null)
            .OrderBy(story => story.SortOrder)
            .ThenBy(story => story.Title)
            .ThenBy(story => story.Id)
            .Select(story => new StorySummary(
                story.Id,
                story.Title,
                story.Premise,
                story.Status,
                story.Scenes.Count(scene => scene.DeletedAt == null),
                story.CreatedAt,
                story.UpdatedAt))
            .ToListAsync(cancellationToken);

        return Results.Ok(stories);
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var story = await LoadDetailAsync(db, universeId, storyId, cancellationToken);
        return story is null ? Results.NotFound() : Results.Ok(story);
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] StoryRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CreateCoreAsync(db, universeId, request, cancellationToken);
    }

    /// <summary>
    /// The one way a story comes into being, shared with an approved AI change (ADR 0047). Access is the caller's to prove
    /// first.
    /// </summary>
    internal static async Task<IResult> CreateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        StoryRequest request,
        CancellationToken cancellationToken)
    {
        if (StoryValidation.ValidateStory(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        // Last in the list: after every story the universe holds, the Trash included, so a restored one keeps its place.
        var last = await db.Stories
            .Where(candidate => candidate.UniverseId == universeId)
            .MaxAsync(candidate => (int?)candidate.SortOrder, cancellationToken);

        var now = DateTime.UtcNow;
        var story = new Story
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Title = StoryValidation.Normalize(request.Title)!,
            Premise = StoryValidation.Normalize(request.Premise),
            Status = request.Status,
            SortOrder = (last ?? -1) + 1,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Stories.Add(story);
        await db.SaveChangesAsync(cancellationToken);

        var created = await LoadDetailAsync(db, universeId, story.Id, cancellationToken);
        return Results.Created($"/api/universes/{universeId}/stories/{story.Id}", created);
    }

    /// <summary>
    /// The universe's stories in a new order: the whole list of live stories, each once. A story in the Trash goes after them,
    /// so it comes back last. Changes no story's edit version or dates: the order is the list's, not a story's.
    /// </summary>
    private static async Task<IResult> ReorderAsync(
        Guid universeId,
        [FromBody] StoryOrderRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (request.StoryIds is not { } ids)
        {
            return Refused("List the universe's stories in order.");
        }

        if (ids.Distinct().Count() != ids.Count)
        {
            return Refused("List each story once.");
        }

        var stories = await db.Stories
            .Where(story => story.UniverseId == universeId && story.DeletedAt == null)
            .ToListAsync(cancellationToken);

        var byId = stories.ToDictionary(story => story.Id);
        if (ids.Count != stories.Count || ids.Any(id => !byId.ContainsKey(id)))
        {
            return Refused("List every story in this universe exactly once.");
        }

        // Live stories take the first places; one in the Trash moves after them, so it comes back last.
        var trashed = await db.Stories
            .Where(story => story.UniverseId == universeId && story.DeletedAt != null)
            .OrderBy(story => story.SortOrder)
            .ToListAsync(cancellationToken);

        foreach (var (story, place) in ids.Select(id => byId[id]).Concat(trashed).Select((story, place) => (story, place)))
        {
            story.SortOrder = place;
        }

        await db.SaveChangesAsync(cancellationToken);

        return await ListAsync(universeId, principal, db, cancellationToken);

        static IResult Refused(string message) =>
            Results.ValidationProblem(new Dictionary<string, string[]> { ["storyIds"] = [message] });
    }

    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] StoryRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await UpdateCoreAsync(db, universeId, storyId, request, cancellationToken);
    }

    /// <summary>
    /// The one write path for an existing story's form, shared with an accepted suggestion (ADR 0044) so it is validated,
    /// versioned and saved exactly like an ordinary edit. Access is the caller's to prove first.
    /// </summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        StoryRequest request,
        CancellationToken cancellationToken)
    {
        // One transaction for the version comparison and the write, so nothing can land between them (ADR 0043) - or the
        // caller's, when it has one.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var story = await FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        if (!EditVersion.Matches(story.Version, request.ExpectedVersion))
        {
            return Changed(story.Version);
        }

        if (StoryValidation.ValidateStory(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var title = StoryValidation.Normalize(request.Title)!;
        var premise = StoryValidation.Normalize(request.Premise);

        // Only a save that changes what the form edits moves the version on; an unchanged one leaves other forms current.
        if (story.Title != title || story.Premise != premise || story.Status != request.Status)
        {
            story.Version++;
        }

        story.Title = title;
        story.Premise = premise;
        story.Status = request.Status;
        story.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadDetailAsync(db, universeId, storyId, cancellationToken));
    }

    /// <summary>The 409 for a story save written over a version that is no longer current (ADR 0043).</summary>
    internal static IResult Changed(int currentVersion) =>
        EditVersion.Changed(
            ChangedCode,
            "Story changed",
            "This story was changed after it was opened here. Nothing was overwritten.",
            currentVersion);

    /// <summary>
    /// Moves the story to the Trash. Only the story is marked: its chapters, scenes, prose, saved versions
    /// and plot stay exactly as they are - out of reach while it is there, and back with it on restore - and
    /// the lore they reference is untouched. A story already in the Trash answers as missing, so the moment
    /// it was thrown away cannot be moved by a second click. Its <c>UpdatedAt</c> is left alone: nothing in it
    /// was written (ADR 0029).
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await TrashCoreAsync(db, universeId, storyId, cancellationToken);
    }

    /// <summary>Marks one live story as trashed, shared with an approved AI change (ADR 0047). Access is the caller's.</summary>
    internal static async Task<IResult> TrashCoreAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        CancellationToken cancellationToken)
    {
        var story = await FindAsync(db, universeId, storyId, cancellationToken);
        if (story is null)
        {
            return Results.NotFound();
        }

        story.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// The story, tracked, only if it belongs to this universe and is not in the Trash. The caller has
    /// already proved the universe is the caller's; the story id alone is never trusted.
    /// </summary>
    internal static Task<Story?> FindAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        CancellationToken cancellationToken) =>
        db.Stories.FirstOrDefaultAsync(
            story => story.Id == storyId && story.UniverseId == universeId && story.DeletedAt == null,
            cancellationToken);

    /// <summary>
    /// Null when the caller may do this in the universe and the story is live in it; otherwise the answer to send - the
    /// universe gate's 404 or 403, or 404 for a story that is not there. A write finds the story tracked instead, with
    /// <see cref="FindAsync"/>.
    /// </summary>
    internal static async Task<IResult?> DenyStoryAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        ClaimsPrincipal principal,
        UniverseCapability capability,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, capability, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await db.Stories.AnyAsync(
            story => story.Id == storyId && story.UniverseId == universeId && story.DeletedAt == null,
            cancellationToken)
            ? null
            : Results.NotFound();
    }

    /// <summary>
    /// The story, its live chapters and every live scene in it. A fixed number of queries whatever the story
    /// holds: the story, its chapters, its scenes with their link ids, and one read of every entry any scene
    /// references - four for a story of ten chapters and a hundred scenes, as for an empty one. Nothing in the
    /// Trash is read.
    /// </summary>
    /// <summary>
    /// Each chapter's number as an author reads it (ADR 0070): from 1 inside its arc, or among the chapters in no arc, in
    /// the story's chapter order. <paramref name="chapters"/> are every live chapter of one story, in that order.
    /// </summary>
    internal static Dictionary<Guid, int> ChapterNumbers(IEnumerable<ChapterResponse> chapters) =>
        Number(chapters.Select(chapter => (chapter.Id, chapter.PlotArcId)));

    /// <summary>
    /// The same numbers for every live chapter of <paramref name="storyIds"/>, read in one query: what a result that names a
    /// chapter by number shows, wherever it is listed.
    /// </summary>
    internal static async Task<Dictionary<Guid, int>> ChapterNumbersAsync(
        LorEvolveDbContext db,
        IReadOnlyCollection<Guid> storyIds,
        CancellationToken cancellationToken)
    {
        if (storyIds.Count == 0)
        {
            return [];
        }

        var rows = await db.Chapters.AsNoTracking()
            .Where(chapter => storyIds.Contains(chapter.StoryId) && chapter.DeletedAt == null)
            .OrderBy(chapter => chapter.SortOrder)
            .ThenBy(chapter => chapter.Id)
            .Select(chapter => new
            {
                chapter.Id,
                chapter.StoryId,
                ArcId = chapter.ArcLink != null && chapter.ArcLink.PlotArc!.DeletedAt == null
                    ? chapter.ArcLink.PlotArcId
                    : (Guid?)null,
            })
            .ToListAsync(cancellationToken);

        var numbers = new Dictionary<Guid, int>();
        foreach (var story in rows.GroupBy(row => row.StoryId))
        {
            foreach (var (id, number) in Number(story.Select(row => (row.Id, row.ArcId))))
            {
                numbers[id] = number;
            }
        }

        return numbers;
    }

    private static Dictionary<Guid, int> Number(IEnumerable<(Guid Id, Guid? ArcId)> chapters)
    {
        var counts = new Dictionary<Guid, int>();
        var unarced = 0;
        var numbers = new Dictionary<Guid, int>();

        foreach (var (id, arcId) in chapters)
        {
            if (arcId is { } arc)
            {
                numbers[id] = counts[arc] = counts.GetValueOrDefault(arc) + 1;
            }
            else
            {
                numbers[id] = ++unarced;
            }
        }

        return numbers;
    }

    internal static async Task<StoryDetail?> LoadDetailAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        CancellationToken cancellationToken)
    {
        var story = await db.Stories.AsNoTracking()
            .Where(candidate => candidate.Id == storyId && candidate.UniverseId == universeId && candidate.DeletedAt == null)
            .Select(candidate => new
            {
                candidate.Id,
                candidate.Title,
                candidate.Premise,
                candidate.Status,
                candidate.CreatedAt,
                candidate.UpdatedAt,
                candidate.Version,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (story is null)
        {
            return null;
        }

        var arcs = await PlotArcEndpoints.LoadArcsAsync(db, storyId, null, cancellationToken);
        var chapters = await ChapterEndpoints.LoadChaptersAsync(db, storyId, cancellationToken);

        var scenes = await SceneEndpoints.LoadScenesAsync(
            db,
            universeId,
            db.Scenes.Where(scene => scene.StoryId == storyId && scene.DeletedAt == null),
            cancellationToken);

        return new StoryDetail(
            story.Id,
            story.Title,
            story.Premise,
            story.Status,
            arcs,
            chapters,
            scenes,
            story.CreatedAt,
            story.UpdatedAt,
            story.Version);
    }
}
