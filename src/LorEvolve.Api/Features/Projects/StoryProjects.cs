using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Projects;

/// <summary>
/// Every Story an author already has, shown as the Writing Project it is (#140).
///
/// <b>Nothing is migrated and nothing is copied.</b> Issue #140 allows either a migration or a compatibility mapping,
/// and this is the mapping: no table, no column, no rows written, no schema change at all. A story's id is the
/// project's id, its title the project's name, its premise the summary, and its <see cref="StoryStatus"/> the
/// lifecycle. Every value is read from the story on each request, so a story renamed a second later is renamed here
/// too, and nothing can drift out of step with it.
///
/// <b>Why that is the right shape and not the lazy one.</b> The acceptance criteria say original Story URLs and MCP
/// story ids must still resolve, and that scene order, manuscript revisions, arcs, beats and story-scoped Ideas must
/// be unchanged. A mapping satisfies all of those by construction rather than by care: there is no write to get
/// wrong, no second source of truth to reconcile, and the idempotence the issue asks for is not a property this code
/// has to maintain, because there is nothing to run twice. A migration that created one row per story would have had
/// to be written, reviewed, run on the owner's data and trusted, to deliver a list that can be derived in one query.
///
/// <b>What it deliberately does not do.</b> A derived project has no fields of its own to save: lifecycle, name and
/// summary belong to the story and are changed where the story is changed. So nothing here writes, and
/// <c>/api/projects/{id}</c> does not resolve a story id; a client follows <see cref="ProjectDetail.StoryId"/> to the
/// story's own address, which is where its content has always been.
/// </summary>
public static class StoryProjects
{
    /// <summary>
    /// How far along a story is, as a project's lifecycle. <see cref="StoryStatus.Drafting"/> is
    /// <see cref="ProjectLifecycle.Active"/>: the two vocabularies were deliberately modelled on each other
    /// (see <see cref="ProjectLifecycle"/>), and a story has nothing that maps to Archived.
    /// </summary>
    public static ProjectLifecycle LifecycleOf(StoryStatus status) => status switch
    {
        StoryStatus.Drafting => ProjectLifecycle.Active,
        StoryStatus.Complete => ProjectLifecycle.Complete,
        _ => ProjectLifecycle.Planning,
    };

    /// <summary>
    /// The live stories the caller can read, as Writing Projects. Access is the universe's, exactly as it is for the
    /// story itself: a story in a universe the caller owns or is a member of, and nothing else. A story in the Trash
    /// is not offered, the same way it leaves every other list.
    /// </summary>
    public static async Task<List<ProjectDetail>> ReadableAsync(
        LorEvolveDbContext db,
        string userId,
        Guid? universeId,
        CancellationToken cancellationToken)
    {
        var query = db.Stories.AsNoTracking()
            .Include(story => story.Universe)
            .Where(story =>
                story.DeletedAt == null
                && (story.Universe!.OwnerId == userId
                    || db.UniverseMemberships.Any(membership =>
                        membership.UniverseId == story.UniverseId && membership.UserId == userId)));

        if (universeId is { } id)
        {
            query = query.Where(story => story.UniverseId == id);
        }

        var stories = await query.ToListAsync(cancellationToken);
        return [.. stories.Select(story => Detail(story, userId))];
    }

    /// <summary>One story as a Writing Project. A projection, never a stored row.</summary>
    private static ProjectDetail Detail(Story story, string userId) =>
        new(
            story.Id,
            story.Title,
            ProjectKind.Writing,
            LifecycleOf(story.Status),
            null,
            story.Premise ?? string.Empty,
            story.Universe is not { } universe
                ? null
                : new ProjectUniverse(universe.Id, universe.Name, universe.AccentColor, universe.IsArchived),
            story.Universe?.OwnerId == userId,
            Utc(story.CreatedAt),
            Utc(story.UpdatedAt),
            story.Version,
            story.Id);

    /// <summary>SQLite hands a stored moment back with no kind, so every timestamp is stamped UTC on the way out.</summary>
    private static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };
}
