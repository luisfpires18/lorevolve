using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A Story shown as the Writing Project it already is (#140).
///
/// The point of these is what they prove is *unchanged*. #140's acceptance criteria are mostly promises about things
/// not moving: story ids, story addresses, scene order, manuscript revisions, arcs, beats and story-scoped ideas. So
/// the tests read the story's own data before and after the projects list has been asked for, and compare it, rather
/// than reading the new code and agreeing with it.
/// </summary>
public sealed class StoryProjectTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Projects = "/api/projects";

    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task An_existing_story_is_listed_as_a_writing_project_without_being_copied()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "storyproj");
        var storyId = await CreateStory(client, universe.Id, "The Salt Road");

        var listed = await List(client);
        var project = Assert.Single(listed, row => row.StoryId == storyId);

        Assert.Equal(storyId, project.Id);
        Assert.Equal("The Salt Road", project.Name);
        Assert.Equal(ProjectKind.Writing, project.Kind);
        Assert.Equal(ProjectLifecycle.Planning, project.Lifecycle);
        Assert.Null(project.Subtype);
        Assert.Equal(universe.Id, project.Universe!.Id);
        Assert.True(project.IsOwned);
        Assert.Equal(DateTimeKind.Utc, project.UpdatedAt.Kind);

        // Nothing was written: no project row exists, and the story is the only record of this work.
        await WithDb(_factory, async db =>
        {
            Assert.Equal(0, await db.CreativeProjects.CountAsync());
            Assert.Equal(1, await db.Stories.CountAsync(story => story.Id == storyId));
        });

        // The project's own address is not a story's: a client follows StoryId to the story instead.
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{Projects}/{storyId}")).StatusCode);
    }

    /// <summary>
    /// The criteria that matter: the story keeps its id, its address, its structure and its revisions. Read before and
    /// after, and compared.
    /// </summary>
    [Fact]
    public async Task A_story_keeps_its_id_address_structure_and_revisions()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "storykeep");
        var storyId = await CreateStory(client, universe.Id, "Winter Light");
        var chapterId = await CreateChapter(client, universe.Id, storyId, "First light");
        var first = await CreateScene(client, universe.Id, storyId, "The road out", chapterId);
        var second = await CreateScene(client, universe.Id, storyId, "The gate", chapterId);
        await CreateArc(client, universe.Id, storyId, "Leaving");
        await SetBeats(client, universe.Id, storyId, first, "She packs", "She leaves");

        var before = await Fingerprint(storyId);
        var storyBefore = await ReadStory(client, universe.Id, storyId);

        // Asking for the projects list is what #140 adds; it must change nothing.
        var listed = await List(client);
        Assert.Contains(listed, row => row.StoryId == storyId);

        var after = await Fingerprint(storyId);
        Assert.Equal(before, after, StringComparer.Ordinal);

        // The story's own address still answers, with the same content as before.
        var storyAfter = await ReadStory(client, universe.Id, storyId);
        Assert.Equal(storyBefore.Title, storyAfter.Title);
        Assert.Equal(storyBefore.Version, storyAfter.Version);

        // And its scenes are still in the author's order, read from the story itself.
        await WithDb(_factory, async db =>
            Assert.Equal(
                [first, second],
                await db.Scenes.AsNoTracking()
                    .Where(scene => scene.StoryId == storyId)
                    .OrderBy(scene => scene.SortOrder)
                    .Select(scene => scene.Id)
                    .ToListAsync()));
    }

    [Fact]
    public async Task A_story_in_the_trash_is_not_a_project_and_its_stage_follows_the_story()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "storystage");
        var kept = await CreateStory(client, universe.Id, "Kept");
        var binned = await CreateStory(client, universe.Id, "Binned");

        (await client.DeleteAsync($"/api/universes/{universe.Id}/stories/{binned}")).EnsureSuccessStatusCode();

        var listed = await List(client);
        Assert.Contains(listed, row => row.StoryId == kept);
        Assert.DoesNotContain(listed, row => row.StoryId == binned);

        // Drafting reads as Active, because a game or a film is not drafted; Complete reads as Complete.
        Assert.Equal(ProjectLifecycle.Planning, StoryProjects.LifecycleOf(StoryStatus.Planning));
        Assert.Equal(ProjectLifecycle.Active, StoryProjects.LifecycleOf(StoryStatus.Drafting));
        Assert.Equal(ProjectLifecycle.Complete, StoryProjects.LifecycleOf(StoryStatus.Complete));

        await WithDb(_factory, async db =>
        {
            var story = await db.Stories.AsNoTracking().SingleAsync(candidate => candidate.Id == kept);
            story.Status = StoryStatus.Drafting;
            db.Stories.Attach(story).Property(candidate => candidate.Status).IsModified = true;
            await db.SaveChangesAsync();
        });

        var again = await List(client);
        Assert.Equal(ProjectLifecycle.Active, Assert.Single(again, row => row.StoryId == kept).Lifecycle);
    }

    [Fact]
    public async Task Another_accounts_story_is_not_in_the_list_and_a_member_sees_it()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "storyshared");
        var storyId = await CreateStory(owner, universe.Id, "The Shared Chronicle");

        var stranger = await SignedIn(_factory, "user-storystranger");
        Assert.DoesNotContain(await List(stranger), row => row.StoryId == storyId);

        var member = await SignedIn(_factory, "user-storymember");
        await Join(universe.Id, "user-storymember", UniverseRole.Viewer);

        var seen = Assert.Single(await List(member), row => row.StoryId == storyId);
        Assert.Equal("The Shared Chronicle", seen.Name);
        Assert.False(seen.IsOwned);
    }

    [Fact]
    public async Task A_standalone_list_holds_no_stories_because_a_story_always_has_a_universe()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "storyalone");
        var storyId = await CreateStory(client, universe.Id, "In a world");

        Assert.Contains(await List(client), row => row.StoryId == storyId);
        Assert.DoesNotContain(await List(client, standalone: true), row => row.StoryId == storyId);
        Assert.Contains(await List(client, universeId: universe.Id), row => row.StoryId == storyId);
    }

    // ---------- steps ----------

    private static async Task<List<ProjectDetail>> List(
        HttpClient client,
        Guid? universeId = null,
        bool standalone = false)
    {
        var query = universeId is { } id ? $"?universeId={id}" : standalone ? "?standalone=true" : string.Empty;
        var response = await client.GetAsync($"{Projects}{query}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<List<ProjectDetail>>())!;
    }

    /// <summary>
    /// Everything of the story that must not move, as one string: its own columns, its chapters, scenes in order,
    /// beats, arcs, manuscripts with their revisions, and the ideas scoped to it.
    /// </summary>
    private async Task<string> Fingerprint(Guid storyId)
    {
        var parts = new List<string>();

        await WithDb(_factory, async db =>
        {
            var story = await db.Stories.AsNoTracking().SingleAsync(candidate => candidate.Id == storyId);
            parts.Add($"story:{story.Id}:{story.Title}:{story.Status}:{story.Version}:{story.SortOrder}:{story.PublicSlug}");

            foreach (var chapter in await db.Chapters.AsNoTracking()
                .Where(chapter => chapter.StoryId == storyId)
                .OrderBy(chapter => chapter.SortOrder)
                .ToListAsync())
            {
                parts.Add($"chapter:{chapter.Id}:{chapter.Title}:{chapter.SortOrder}");
            }

            foreach (var scene in await db.Scenes.AsNoTracking()
                .Where(scene => scene.StoryId == storyId)
                .OrderBy(scene => scene.SortOrder)
                .ToListAsync())
            {
                parts.Add($"scene:{scene.Id}:{scene.Title}:{scene.SortOrder}:{scene.ChapterId}");
            }

            foreach (var arc in await db.PlotArcs.AsNoTracking()
                .Where(arc => arc.StoryId == storyId)
                .OrderBy(arc => arc.SortOrder)
                .ToListAsync())
            {
                parts.Add($"arc:{arc.Id}:{arc.Title}:{arc.SortOrder}");
            }

            foreach (var beat in await db.SceneBeats.AsNoTracking()
                .Where(beat => beat.Scene!.StoryId == storyId)
                .OrderBy(beat => beat.SceneId)
                .ThenBy(beat => beat.SortOrder)
                .ToListAsync())
            {
                parts.Add($"beat:{beat.Id}:{beat.Title}:{beat.SortOrder}");
            }

            foreach (var manuscript in await db.SceneManuscripts.AsNoTracking()
                .Where(manuscript => manuscript.Scene!.StoryId == storyId)
                .OrderBy(manuscript => manuscript.SceneId)
                .ToListAsync())
            {
                parts.Add($"manuscript:{manuscript.SceneId}:{manuscript.Version}");
            }

            foreach (var revision in await db.SceneManuscriptRevisions.AsNoTracking()
                .Where(revision => revision.Scene!.StoryId == storyId)
                .OrderBy(revision => revision.SceneId)
                .ThenBy(revision => revision.Number)
                .ToListAsync())
            {
                parts.Add($"revision:{revision.Id}:{revision.SceneId}:{revision.Number}");
            }

            foreach (var reference in await db.IdeaStoryReferences.AsNoTracking()
                .Where(reference => reference.StoryId == storyId)
                .OrderBy(reference => reference.IdeaId)
                .ToListAsync())
            {
                parts.Add($"idea:{reference.IdeaId}");
            }
        });

        return string.Join("|", parts);
    }

    /// <summary>Gives an account a role in a universe by writing the membership row, because no route creates one yet.</summary>
    private Task Join(Guid universeId, string username, UniverseRole role) =>
        WithDb(_factory, async db =>
        {
            var userId = await db.Users.Where(user => user.UserName == username).Select(user => user.Id).SingleAsync();
            var now = DateTime.UtcNow;

            db.UniverseMemberships.Add(new UniverseMembership
            {
                UniverseId = universeId,
                UserId = userId,
                Role = role,
                CreatedAt = now,
                UpdatedAt = now,
            });

            await db.SaveChangesAsync();
        });
}
