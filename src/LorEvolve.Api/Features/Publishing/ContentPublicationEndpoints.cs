using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// An owner selecting one lore entry or one story for the public portal, and taking it back (ADR 0036, Task 010).
///
/// <para><b>Explicit at every level.</b> Publishing a universe publishes none of its entries or stories, and
/// publishing an entry or a story publishes nothing of its universe. An item is read publicly only while both are
/// public - <see cref="PublicationRules.PublicLore"/> and <see cref="PublicationRules.PublicStories"/> - so an owner
/// may select items while the universe is still private, and making the universe private hides every one of them
/// without clearing what was selected.</para>
///
/// <para><b>The owner's alone.</b> <see cref="UniverseAccess"/>'s Publish capability first - a member is refused with 403,
/// and nobody else learns the universe exists (ADR 0041) - then the item by its id and that universe together, live only:
/// another account's item, one from another universe and one in the Trash all answer
/// 404. The item in the Trash keeps its selection and its address; restoring it lets it be read again if it and its
/// universe are still public.</para>
///
/// <para><b>A story needs a public summary.</b> Publishing a story is refused (<c>publication_incomplete</c>) until its
/// author has written the summary readers see (Task 011) - its premise is planning text and is never used instead. A
/// story selected before that rule stays selected and stays hidden until it has one.</para>
///
/// <para><b>Transitions, not fields.</b> POST with no body, like a universe's publish. No entry or story save binds
/// the visibility, the address or the date. Publishing mints the address the first time - from the name or title,
/// unique among the universe's items of that kind - and sets the first publication date once; both are kept by
/// unpublishing and by renames. Nothing here touches <c>UpdatedAt</c>, the history or the search index: a selection
/// is not an edit, so it neither reorders a list nor makes an open editor's save stale.</para>
/// </summary>
public static class ContentPublicationEndpoints
{
    public static IEndpointRouteBuilder MapContentPublicationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var entries = endpoints.MapGroup("/api/universes/{universeId:guid}/entities/{entityId:guid}")
            .WithTags("Publishing")
            .RequireAuthorization();

        entries.MapGet("/publication", GetEntryAsync).WithName("GetEntityPublication");
        entries.MapPost("/publish", PublishEntryAsync).WithName("PublishEntity");
        entries.MapPost("/unpublish", UnpublishEntryAsync).WithName("UnpublishEntity");

        var stories = endpoints.MapGroup("/api/universes/{universeId:guid}/stories/{storyId:guid}")
            .WithTags("Publishing")
            .RequireAuthorization();

        stories.MapGet("/publication", GetStoryAsync).WithName("GetStoryPublication");
        stories.MapPut("/publication", SaveStorySummaryAsync).WithName("SaveStoryPublication");
        stories.MapPost("/publish", PublishStoryAsync).WithName("PublishStory");
        stories.MapPost("/unpublish", UnpublishStoryAsync).WithName("UnpublishStory");

        // A story's parts (ADR 0039): each selected on its own, next to where it is written, and read only while the story is.
        stories.MapPost("/scenes/{sceneId:guid}/publish", (Guid universeId, Guid storyId, Guid sceneId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
            SetSceneAsync(db, universeId, storyId, sceneId, principal, manuscript: false, ContentVisibility.Public, cancellationToken)).WithName("PublishScene");
        stories.MapPost("/scenes/{sceneId:guid}/unpublish", (Guid universeId, Guid storyId, Guid sceneId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
            SetSceneAsync(db, universeId, storyId, sceneId, principal, manuscript: false, ContentVisibility.Private, cancellationToken)).WithName("UnpublishScene");
        stories.MapPost("/scenes/{sceneId:guid}/manuscript/publish", (Guid universeId, Guid storyId, Guid sceneId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
            SetSceneAsync(db, universeId, storyId, sceneId, principal, manuscript: true, ContentVisibility.Public, cancellationToken)).WithName("PublishSceneManuscript");
        stories.MapPost("/scenes/{sceneId:guid}/manuscript/unpublish", (Guid universeId, Guid storyId, Guid sceneId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
            SetSceneAsync(db, universeId, storyId, sceneId, principal, manuscript: true, ContentVisibility.Private, cancellationToken)).WithName("UnpublishSceneManuscript");
        stories.MapPost("/plot-arcs/{plotArcId:guid}/publish", (Guid universeId, Guid storyId, Guid plotArcId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
            SetArcAsync(db, universeId, storyId, plotArcId, principal, ContentVisibility.Public, cancellationToken)).WithName("PublishPlotArc");
        stories.MapPost("/plot-arcs/{plotArcId:guid}/unpublish", (Guid universeId, Guid storyId, Guid plotArcId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
            SetArcAsync(db, universeId, storyId, plotArcId, principal, ContentVisibility.Private, cancellationToken)).WithName("UnpublishPlotArc");

        return endpoints;
    }

    // ---------- Lore entries ----------

    private static Task<IResult> GetEntryAsync(
        Guid universeId, Guid entityId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
        TransitionAsync(db, universeId, principal, () => LiveEntry(db, universeId, entityId, cancellationToken), to: null, mint: null, cancellationToken);

    private static Task<IResult> PublishEntryAsync(
        Guid universeId, Guid entityId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
        TransitionAsync(
            db,
            universeId,
            principal,
            () => LiveEntry(db, universeId, entityId, cancellationToken),
            ContentVisibility.Public,
            entry => PublicSlugs.ChooseAsync(
                db.Entities.AsNoTracking().Where(candidate => candidate.UniverseId == universeId).Select(candidate => candidate.PublicSlug),
                entry.Name,
                PublicSlugs.LoreFallback,
                cancellationToken),
            cancellationToken);

    private static Task<IResult> UnpublishEntryAsync(
        Guid universeId, Guid entityId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
        TransitionAsync(db, universeId, principal, () => LiveEntry(db, universeId, entityId, cancellationToken), ContentVisibility.Private, mint: null, cancellationToken);

    private static Task<LoreEntity?> LiveEntry(LorEvolveDbContext db, Guid universeId, Guid entityId, CancellationToken cancellationToken) =>
        db.Entities.FirstOrDefaultAsync(
            entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null,
            cancellationToken);

    // ---------- Stories ----------

    private static Task<IResult> GetStoryAsync(
        Guid universeId, Guid storyId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
        TransitionAsync(db, universeId, principal, () => StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken), to: null, mint: null, cancellationToken);

    private static Task<IResult> PublishStoryAsync(
        Guid universeId, Guid storyId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
        TransitionAsync(
            db,
            universeId,
            principal,
            () => StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken),
            ContentVisibility.Public,
            story => PublicSlugs.ChooseAsync(
                db.Stories.AsNoTracking().Where(candidate => candidate.UniverseId == universeId).Select(candidate => candidate.PublicSlug),
                story.Title,
                PublicSlugs.StoryFallback,
                cancellationToken),
            cancellationToken,
            story => story.PublicSummary is null
                ? new Dictionary<string, string[]> { [PublicationRules.PublicSummary] = ["Write a public summary for readers before publishing this story."] }
                : null);

    /// <summary>
    /// Saves the story's public summary (Task 011) - the one thing about a story written for the portal. Trimmed, blank
    /// is none, at most <see cref="PublicationLimits.SummaryMaxLength"/>. While the story is selected it cannot be
    /// removed - make the story private first - as a public universe keeps its own summary. Not an edit of the story:
    /// its <c>UpdatedAt</c> and history are left alone, like every other publication write.
    /// </summary>
    private static async Task<IResult> SaveStorySummaryAsync(
        Guid universeId,
        Guid storyId,
        [FromBody] StoryPublicationRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        var summary = string.IsNullOrWhiteSpace(request.PublicSummary) ? null : request.PublicSummary.Trim();
        if (summary is { Length: > PublicationLimits.SummaryMaxLength })
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                [PublicationRules.PublicSummary] = [$"Keep the public summary under {PublicationLimits.SummaryMaxLength} characters."],
            });
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken) is not { } story)
        {
            return Results.NotFound();
        }

        if (summary is null && story.Visibility == ContentVisibility.Public)
        {
            return Results.ValidationProblem(
                new Dictionary<string, string[]>
                {
                    [PublicationRules.PublicSummary] = ["A published story needs its public summary. Make the story private before removing it."],
                },
                extensions: new Dictionary<string, object?> { ["code"] = PublicationEndpoints.RequiredWhilePublicCode });
        }

        if (story.PublicSummary != summary)
        {
            story.PublicSummary = summary;
            await db.SaveChangesAsync(cancellationToken);
        }

        var state = await StateAsync(db, universeId, story, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(state);
    }

    private static Task<IResult> UnpublishStoryAsync(
        Guid universeId, Guid storyId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken) =>
        TransitionAsync(db, universeId, principal, () => StoryEndpoints.FindAsync(db, universeId, storyId, cancellationToken), ContentVisibility.Private, mint: null, cancellationToken);

    // ---------- A story's parts (ADR 0039) ----------

    /// <summary>
    /// Selects a scene's outline, or its manuscript, for the story's public page, or takes it back. Idempotent; the owner's
    /// alone - the Publish capability, then the live story, then the live scene in it, so another account's scene, one of
    /// another story and one in the Trash are all 404. Nothing is minted - a part is read on its story's page - and, like
    /// every selection, it is not an edit: no <c>UpdatedAt</c>, history or search change.
    /// </summary>
    private static async Task<IResult> SetSceneAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        Guid sceneId,
        ClaimsPrincipal principal,
        bool manuscript,
        ContentVisibility to,
        CancellationToken cancellationToken)
    {
        if (await StoryEndpoints.DenyStoryAsync(db, universeId, storyId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await db.Scenes.FirstOrDefaultAsync(
                scene => scene.Id == sceneId && scene.StoryId == storyId && scene.DeletedAt == null,
                cancellationToken) is not { } scene)
        {
            return Results.NotFound();
        }

        if (manuscript)
        {
            scene.ManuscriptVisibility = to;
        }
        else
        {
            scene.Visibility = to;
        }

        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(await PartStateAsync(db, storyId, to, cancellationToken));
    }

    /// <summary>A plot arc's selection, as a scene's. Plot is published only by this, on purpose, never by anything around it.</summary>
    private static async Task<IResult> SetArcAsync(
        LorEvolveDbContext db,
        Guid universeId,
        Guid storyId,
        Guid plotArcId,
        ClaimsPrincipal principal,
        ContentVisibility to,
        CancellationToken cancellationToken)
    {
        if (await StoryEndpoints.DenyStoryAsync(db, universeId, storyId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await db.PlotArcs.FirstOrDefaultAsync(
                arc => arc.Id == plotArcId && arc.StoryId == storyId && arc.DeletedAt == null,
                cancellationToken) is not { } arc)
        {
            return Results.NotFound();
        }

        arc.Visibility = to;
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(await PartStateAsync(db, storyId, to, cancellationToken));
    }

    private static async Task<StoryPartPublicationState> PartStateAsync(
        LorEvolveDbContext db, Guid storyId, ContentVisibility visibility, CancellationToken cancellationToken) =>
        new(visibility, await PublicationRules.PublicStories(db).AnyAsync(story => story.Id == storyId, cancellationToken));

    // ---------- Shared ----------

    /// <summary>
    /// Reads the item's publication, or moves it to <paramref name="to"/> first when that is given. Idempotent: an
    /// item already there is left alone. For a move, the ownership check, the read, the address and the write share
    /// one transaction, which Microsoft.Data.Sqlite begins <c>IMMEDIATE</c>, so two publishes cannot both see an address
    /// as free - and a failed write leaves nothing half-published, because the address, the date and the visibility
    /// are one row saved once.
    /// </summary>
    private static async Task<IResult> TransitionAsync<T>(
        LorEvolveDbContext db,
        Guid universeId,
        ClaimsPrincipal principal,
        Func<Task<T?>> find,
        ContentVisibility? to,
        Func<T, Task<string>>? mint,
        CancellationToken cancellationToken,
        Func<T, Dictionary<string, string[]>?>? missing = null)
        where T : class, IPublishable
    {
        // A read takes no write lock: SQLite has one writer, and a GET should not queue behind it.
        await using var transaction = to is null ? null : await db.Database.BeginTransactionAsync(cancellationToken);

        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var item = await find();
        if (item is null)
        {
            return Results.NotFound();
        }

        if (to is { } visibility && item.Visibility != visibility)
        {
            if (visibility == ContentVisibility.Public)
            {
                if (missing?.Invoke(item) is { } needed)
                {
                    return Results.ValidationProblem(
                        needed,
                        detail: "This is not ready to publish yet.",
                        extensions: new Dictionary<string, object?> { ["code"] = PublicationEndpoints.IncompleteCode });
                }

                item.PublicSlug ??= await mint!(item);
                item.PublishedAt ??= DateTime.UtcNow;
            }

            item.Visibility = visibility;
            await db.SaveChangesAsync(cancellationToken);
        }

        var state = await StateAsync(db, universeId, item, cancellationToken);
        if (transaction is not null)
        {
            await transaction.CommitAsync(cancellationToken);
        }

        return Results.Ok(state);
    }

    private static async Task<ContentPublicationState> StateAsync<T>(
        LorEvolveDbContext db,
        Guid universeId,
        T item,
        CancellationToken cancellationToken)
        where T : class, IPublishable =>
        new(
            item.Visibility,
            item.PublicSlug,
            item.PublishedAt,
            await PublicationRules.Public(db).AnyAsync(universe => universe.Id == universeId, cancellationToken),
            (item as Story)?.PublicSummary);
}
