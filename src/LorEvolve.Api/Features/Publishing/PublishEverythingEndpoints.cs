using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// "Publish everything" on a universe's Publish page: one owner action that selects every finished thing at once, after a
/// confirmation that names it all. The same selections the per-item routes make (<see cref="ContentPublicationEndpoints"/>),
/// nothing more.
///
/// <para><b>Finished only.</b> Every live <see cref="CanonStatus.Canon"/> lore entry, and every live
/// <see cref="StoryStatus.Complete"/> story with its live scenes' outlines and manuscripts. Idea and Draft lore, Planning and
/// Drafting stories, plot arcs (the author's planning, ADR 0039) and everything in the Trash are never touched. A Complete
/// story with no public summary is skipped and named, as its own publish would refuse it.</para>
///
/// <para><b>Only adds.</b> Nothing is made private, and what is already public is left as it is: its address and first
/// publication date never move. The owner's alone, like every publishing route. The preview and the publish read the same
/// rule, and the publish reads it again inside one transaction, so it applies exactly what is eligible when it runs.</para>
/// </summary>
public static class PublishEverythingEndpoints
{
    public static IEndpointRouteBuilder MapPublishEverythingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/publication/everything")
            .WithTags("Publishing")
            .RequireAuthorization();

        group.MapGet("", PreviewAsync).WithName("PreviewPublishEverything");
        group.MapPost("", PublishAsync).WithName("PublishEverything");
        return endpoints;
    }

    private static async Task<IResult> PreviewAsync(
        Guid universeId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        // ponytail: every name in one answer, no paging; cap it like SelectedLoreLimit if a universe ever has thousands.
        var lore = await Lore(db, universeId)
            .OrderBy(entity => EF.Functions.Collate(entity.Name, "NOCASE"))
            .ThenBy(entity => entity.Id)
            .Select(entity => new PublishEverythingLore(entity.Id, entity.Name, entity.EntityType!.Name))
            .ToListAsync(cancellationToken);

        var stories = await CompleteStories(db, universeId)
            .OrderBy(story => EF.Functions.Collate(story.Title, "NOCASE"))
            .ThenBy(story => story.Id)
            .Select(story => new
            {
                story.Id,
                story.Title,
                Ready = story.PublicSummary != null,
                IsPublic = story.Visibility == ContentVisibility.Public,
                Scenes = db.Scenes.Count(scene => scene.StoryId == story.Id
                    && scene.DeletedAt == null
                    && (scene.Visibility == ContentVisibility.Private || scene.ManuscriptVisibility == ContentVisibility.Private)),
            })
            .ToListAsync(cancellationToken);

        return Results.Ok(new PublishEverythingPreview(
            lore,
            [.. stories.Where(story => story.Ready && (!story.IsPublic || story.Scenes > 0))
                .Select(story => new PublishEverythingStory(story.Id, story.Title, story.Scenes))],
            [.. stories.Where(story => !story.Ready).Select(story => new PublishEverythingSkipped(story.Id, story.Title))]));
    }

    private static async Task<IResult> PublishAsync(
        Guid universeId, ClaimsPrincipal principal, LorEvolveDbContext db, CancellationToken cancellationToken)
    {
        // Microsoft.Data.Sqlite begins it IMMEDIATE: the check, every address and every write hold the one writer together.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Publish, cancellationToken) is { } denied)
        {
            return denied;
        }

        var now = DateTime.UtcNow;
        var lore = await Lore(db, universeId).ToListAsync(cancellationToken);
        foreach (var entry in lore)
        {
            entry.PublicSlug ??= await PublicSlugs.ChooseAsync(
                db.Entities.AsNoTracking().Where(candidate => candidate.UniverseId == universeId).Select(candidate => candidate.PublicSlug),
                entry.Name,
                PublicSlugs.LoreFallback,
                cancellationToken);
            entry.PublishedAt ??= now;
            entry.Visibility = ContentVisibility.Public;

            // Saved one by one, so the next address chosen sees this one as taken.
            await db.SaveChangesAsync(cancellationToken);
        }

        var stories = await CompleteStories(db, universeId)
            .Where(story => story.PublicSummary != null)
            .ToListAsync(cancellationToken);
        var storiesPublished = 0;
        foreach (var story in stories.Where(story => story.Visibility == ContentVisibility.Private))
        {
            story.PublicSlug ??= await PublicSlugs.ChooseAsync(
                db.Stories.AsNoTracking().Where(candidate => candidate.UniverseId == universeId).Select(candidate => candidate.PublicSlug),
                story.Title,
                PublicSlugs.StoryFallback,
                cancellationToken);
            story.PublishedAt ??= now;
            story.Visibility = ContentVisibility.Public;
            storiesPublished++;
            await db.SaveChangesAsync(cancellationToken);
        }

        var storyIds = stories.Select(story => story.Id).ToList();
        var scenes = await db.Scenes
            .Where(scene => storyIds.Contains(scene.StoryId)
                && scene.DeletedAt == null
                && (scene.Visibility == ContentVisibility.Private || scene.ManuscriptVisibility == ContentVisibility.Private))
            .ExecuteUpdateAsync(
                set => set
                    .SetProperty(scene => scene.Visibility, ContentVisibility.Public)
                    .SetProperty(scene => scene.ManuscriptVisibility, ContentVisibility.Public),
                cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(new PublishEverythingResult(lore.Count, storiesPublished, scenes));
    }

    /// <summary>Canon lore not yet selected: live, in this universe.</summary>
    private static IQueryable<LoreEntity> Lore(LorEvolveDbContext db, Guid universeId) =>
        db.Entities.Where(entity => entity.UniverseId == universeId
            && entity.DeletedAt == null
            && entity.CanonStatus == CanonStatus.Canon
            && entity.Visibility == ContentVisibility.Private);

    /// <summary>Every live Complete story, selected or not: a selected one may still have scenes to publish.</summary>
    private static IQueryable<Story> CompleteStories(LorEvolveDbContext db, Guid universeId) =>
        db.Stories.Where(story => story.UniverseId == universeId
            && story.DeletedAt == null
            && story.Status == StoryStatus.Complete);
}

/// <summary>
/// What "Publish everything" would select now, for the owner's confirmation: the Canon entries, the Complete stories that
/// gain anything (the story itself, or scenes not yet public, counted), and the Complete stories skipped for want of a public
/// summary. Never what is already public with nothing to add.
/// </summary>
public sealed record PublishEverythingPreview(
    IReadOnlyList<PublishEverythingLore> Lore,
    IReadOnlyList<PublishEverythingStory> Stories,
    IReadOnlyList<PublishEverythingSkipped> SkippedStories);

public sealed record PublishEverythingLore(Guid Id, string Name, string TypeName);

/// <summary>A Complete story and how many of its scenes gain a public outline or manuscript.</summary>
public sealed record PublishEverythingStory(Guid Id, string Title, int Scenes);

public sealed record PublishEverythingSkipped(Guid Id, string Title);

/// <summary>What one run selected: entries, stories newly selected, and scenes whose outline or manuscript became public.</summary>
public sealed record PublishEverythingResult(int Lore, int Stories, int Scenes);
