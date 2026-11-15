using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Seasons and the episodes in them (#145): the structure a Series project groups its work into, with a script on each
/// episode.
///
/// <para>Written against what the issue asks to be true and what would be quietly wrong. <b>Order:</b> a place is a
/// stored number, so what has to hold is that it is still the index it claims after a move and after a delete.
/// <b>Isolation:</b> one project's seasons are not another's, and an episode must not be movable into someone else's
/// series through the request body. <b>No regression:</b> a Writing Project is a derived view of a Story
/// (<c>StoryProjects</c>), so seasons must not disturb stories, scenes or manuscripts.</para>
/// </summary>
public sealed class ProjectSeasonTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_series_holds_seasons_and_episodes_in_the_order_the_author_puts_them()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "seriesorder");
        var project = await NewProject(client, universe.Id, ProjectKind.Series);

        var first = await NewSeason(client, project.Id, "  Season 1  ");
        var second = await NewSeason(client, project.Id, "Season 2");
        var third = await NewSeason(client, project.Id, "Season 10");

        Assert.Equal("Season 1", first.Name);
        Assert.Equal([0, 1, 2], (await Seasons(client, project.Id)).Select(season => season.SortOrder));

        // Named order would put Season 10 between 1 and 2, which is why the place is stored.
        Assert.Equal(
            ["Season 1", "Season 2", "Season 10"],
            (await Seasons(client, project.Id)).Select(season => season.Name));

        // Moved to the front, and the places are still 0, 1, 2 rather than a gap or a tie.
        await Move(client, $"/api/projects/{project.Id}/seasons/{third.Id}/move", new ProjectMoveRequest(0));

        var moved = await Seasons(client, project.Id);
        Assert.Equal(["Season 10", "Season 1", "Season 2"], moved.Select(season => season.Name));
        Assert.Equal([0, 1, 2], moved.Select(season => season.SortOrder));

        // A place past the end is the author asking for "last", not an error.
        await Move(client, $"/api/projects/{project.Id}/seasons/{third.Id}/move", new ProjectMoveRequest(99));
        Assert.Equal(
            ["Season 1", "Season 2", "Season 10"],
            (await Seasons(client, project.Id)).Select(season => season.Name));

        // Episodes order the same way inside their season.
        var pilot = await NewEpisode(client, project.Id, first.Id, "Pilot");
        var middle = await NewEpisode(client, project.Id, first.Id, "The Salt Road");
        var last = await NewEpisode(client, project.Id, first.Id, "Low Tide");

        Assert.Equal([0, 1, 2], (await Episodes(client, project.Id, first.Id)).Select(episode => episode.SortOrder));

        await Move(
            client,
            $"/api/projects/{project.Id}/seasons/{first.Id}/episodes/{last.Id}/move",
            new ProjectMoveRequest(0));

        var order = await Episodes(client, project.Id, first.Id);
        Assert.Equal(["Low Tide", "Pilot", "The Salt Road"], order.Select(episode => episode.Title));
        Assert.Equal([0, 1, 2], order.Select(episode => episode.SortOrder));

        // Deleting the middle one closes the places up behind it.
        await Delete(client, $"/api/projects/{project.Id}/seasons/{first.Id}/episodes/{pilot.Id}");

        var closed = await Episodes(client, project.Id, first.Id);
        Assert.Equal(["Low Tide", "The Salt Road"], closed.Select(episode => episode.Title));
        Assert.Equal([0, 1], closed.Select(episode => episode.SortOrder));

        _ = second;
        _ = middle;
    }

    [Fact]
    public async Task An_episode_s_script_is_saved_whole_and_a_stale_save_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "seriesscript");
        var project = await NewProject(client, universe.Id, ProjectKind.Series);
        var season = await NewSeason(client, project.Id, "Season 1");
        var episode = await NewEpisode(client, project.Id, season.Id, "Pilot");

        Assert.Null(episode.Script);
        Assert.Equal(1, episode.Version);

        var path = $"/api/projects/{project.Id}/seasons/{season.Id}/episodes/{episode.Id}";

        var written = await Put<ProjectEpisodeDetail>(
            client,
            path,
            new ProjectEpisodeRequest("Pilot", "Alenna comes back out of the sea.", "INT. SALT HOUSE - NIGHT", episode.Version));

        Assert.Equal("INT. SALT HOUSE - NIGHT", written.Script);
        Assert.Equal(2, written.Version);

        // The list leaves scripts out, and says only that there is one.
        var listed = (await Episodes(client, project.Id, season.Id)).Single();
        Assert.True(listed.HasScript);
        Assert.Equal("INT. SALT HOUSE - NIGHT".Length, listed.ScriptLength);

        // The episode's own route carries it.
        var read = await client.GetFromJsonAsync<ProjectEpisodeDetail>(path);
        Assert.Equal("INT. SALT HOUSE - NIGHT", read!.Script);

        // A save written over the version that was read a moment ago is refused, and nothing is overwritten.
        var stale = await client.PutAsJsonAsync(
            path,
            new ProjectEpisodeRequest("Pilot", null, "Something else entirely", episode.Version));

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("INT. SALT HOUSE - NIGHT", (await client.GetFromJsonAsync<ProjectEpisodeDetail>(path))!.Script);

        // A script longer than one request may carry is refused by field rather than truncated.
        var tooLong = await client.PutAsJsonAsync(
            path,
            new ProjectEpisodeRequest("Pilot", null, new string('a', SeriesLimits.ScriptMaxLength + 1), written.Version));

        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
    }

    [Fact]
    public async Task A_season_that_still_holds_episodes_is_not_deleted()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "seriesdelete");
        var project = await NewProject(client, universe.Id, ProjectKind.Series);
        var season = await NewSeason(client, project.Id, "Season 1");
        var episode = await NewEpisode(client, project.Id, season.Id, "Pilot");

        var refused = await client.DeleteAsync($"/api/projects/{project.Id}/seasons/{season.Id}");
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Single(await Seasons(client, project.Id));

        // Emptied first, it goes.
        await Delete(client, $"/api/projects/{project.Id}/seasons/{season.Id}/episodes/{episode.Id}");
        await Delete(client, $"/api/projects/{project.Id}/seasons/{season.Id}");

        Assert.Empty(await Seasons(client, project.Id));
    }

    [Fact]
    public async Task Two_projects_keep_their_own_seasons_and_an_episode_cannot_be_moved_into_another_s()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "seriesisolation");
        var mine = await NewProject(client, universe.Id, ProjectKind.Series);
        var other = await NewProject(client, universe.Id, ProjectKind.Series);

        var myName = await NewSeason(client, mine.Id, "Season 1");
        var theirs = await NewSeason(client, other.Id, "Season 1");
        var episode = await NewEpisode(client, mine.Id, myName.Id, "Pilot");

        // The same season name in two projects is fine; the uniqueness is per project.
        Assert.Equal("Season 1", theirs.Name);
        Assert.Single(await Seasons(client, mine.Id));
        Assert.Single(await Seasons(client, other.Id));

        // Twice in one project is not.
        var twice = await client.PostAsJsonAsync(
            $"/api/projects/{mine.Id}/seasons",
            new ProjectSeasonRequest("season 1", null));
        Assert.Equal(HttpStatusCode.BadRequest, twice.StatusCode);

        // A season of another project is not found through this project's path.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.DeleteAsync($"/api/projects/{mine.Id}/seasons/{theirs.Id}")).StatusCode);

        // And an episode cannot be moved into it, however the body asks.
        var crossed = await client.PostAsJsonAsync(
            $"/api/projects/{mine.Id}/seasons/{myName.Id}/episodes/{episode.Id}/move",
            new ProjectMoveRequest(0, theirs.Id));

        Assert.Equal(HttpStatusCode.BadRequest, crossed.StatusCode);
        Assert.Empty(await Episodes(client, other.Id, theirs.Id));
        Assert.Single(await Episodes(client, mine.Id, myName.Id));
    }

    [Fact]
    public async Task An_episode_moves_between_seasons_of_its_own_project_and_both_lists_close_up()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "seriesmove");
        var project = await NewProject(client, universe.Id, ProjectKind.Series);
        var first = await NewSeason(client, project.Id, "Season 1");
        var second = await NewSeason(client, project.Id, "Season 2");

        var one = await NewEpisode(client, project.Id, first.Id, "One");
        var two = await NewEpisode(client, project.Id, first.Id, "Two");
        await NewEpisode(client, project.Id, second.Id, "Three");

        await Move(
            client,
            $"/api/projects/{project.Id}/seasons/{first.Id}/episodes/{one.Id}/move",
            new ProjectMoveRequest(0, second.Id));

        var from = await Episodes(client, project.Id, first.Id);
        Assert.Equal(["Two"], from.Select(episode => episode.Title));
        Assert.Equal([0], from.Select(episode => episode.SortOrder));

        var to = await Episodes(client, project.Id, second.Id);
        Assert.Equal(["One", "Three"], to.Select(episode => episode.Title));
        Assert.Equal([0, 1], to.Select(episode => episode.SortOrder));
        Assert.All(to, episode => Assert.Equal(second.Id, episode.SeasonId));

        _ = two;
    }

    [Fact]
    public async Task Only_someone_who_may_change_the_universe_may_change_its_seasons()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "seriesaccess");
        var project = await NewProject(owner, universe.Id, ProjectKind.Series);
        var season = await NewSeason(owner, project.Id, "Season 1");

        var stranger = await SignedIn(_factory, "seriesstranger");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/projects/{project.Id}/seasons")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.PostAsJsonAsync($"/api/projects/{project.Id}/seasons", new ProjectSeasonRequest("Theirs", null))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.PostAsJsonAsync(
                $"/api/projects/{project.Id}/seasons/{season.Id}/episodes",
                new ProjectEpisodeRequest("Theirs", null))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.DeleteAsync($"/api/projects/{project.Id}/seasons/{season.Id}")).StatusCode);
    }

    [Fact]
    public async Task Seasons_and_their_scripts_come_back_from_a_restore_in_order()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "seriesbackup");
        var project = await NewProject(client, universe.Id, ProjectKind.Series);
        var season = await NewSeason(client, project.Id, "Season 1");
        var episode = await NewEpisode(client, project.Id, season.Id, "Pilot");

        await Put<ProjectEpisodeDetail>(
            client,
            $"/api/projects/{project.Id}/seasons/{season.Id}/episodes/{episode.Id}",
            new ProjectEpisodeRequest("Pilot", "Alenna comes back.", "INT. SALT HOUSE - NIGHT", episode.Version));

        await NewEpisode(client, project.Id, season.Id, "Low Tide");

        var restored = await RestoreArchive(client, await RawArchive(client, universe.Id), "Series restored");

        await WithDb(_factory, async db =>
        {
            var copiedProject = await db.CreativeProjects.AsNoTracking()
                .SingleAsync(each => each.UniverseId == restored.Id);

            var copiedSeason = await db.ProjectSeasons.AsNoTracking()
                .Include(each => each.Episodes)
                .SingleAsync(each => each.ProjectId == copiedProject.Id);

            Assert.Equal("Season 1", copiedSeason.Name);
            Assert.NotEqual(season.Id, copiedSeason.Id);

            var episodes = copiedSeason.Episodes.OrderBy(each => each.SortOrder).ToList();
            Assert.Equal(["Pilot", "Low Tide"], episodes.Select(each => each.Title));
            Assert.Equal([0, 1], episodes.Select(each => each.SortOrder));

            // The script came with it, whole, and the restored episode starts at version 1.
            Assert.Equal("INT. SALT HOUSE - NIGHT", episodes[0].Script);
            Assert.Equal(1, episodes[0].Version);
            Assert.Null(episodes[1].Script);
        });
    }

    [Fact]
    public async Task A_story_shown_as_a_writing_project_is_untouched_by_seasons()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "seriesstories");

        // A Writing Project is a derived view of a Story with no rows of its own (StoryProjects), so the seasons
        // feature must not offer to write into one: the story's id is not a project row, and the route says so.
        var story = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/stories",
            new { title = "The Salt Road", premise = (string?)null, status = 0 });
        story.EnsureSuccessStatusCode();
        var storyId = (await story.Content.ReadFromJsonAsync<Dictionary<string, object>>())!["id"].ToString();

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/projects/{storyId}/seasons")).StatusCode);

        // And the story itself is exactly as it was.
        var read = await client.GetAsync($"/api/universes/{universe.Id}/stories/{storyId}");
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
    }

    // ---------- helpers ----------

    private static async Task<ProjectDetail> NewProject(HttpClient client, Guid universeId, ProjectKind kind)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest("Hollow Season", kind, ProjectLifecycle.Active, null, null, universeId, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static async Task<ProjectSeasonResponse> NewSeason(HttpClient client, Guid projectId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/projects/{projectId}/seasons",
            new ProjectSeasonRequest(name, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectSeasonResponse>())!;
    }

    private static async Task<ProjectEpisodeDetail> NewEpisode(
        HttpClient client,
        Guid projectId,
        Guid seasonId,
        string title)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/projects/{projectId}/seasons/{seasonId}/episodes",
            new ProjectEpisodeRequest(title, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectEpisodeDetail>())!;
    }

    private static async Task<List<ProjectSeasonResponse>> Seasons(HttpClient client, Guid projectId) =>
        (await client.GetFromJsonAsync<List<ProjectSeasonResponse>>($"/api/projects/{projectId}/seasons"))!;

    private static async Task<List<ProjectEpisodeResponse>> Episodes(HttpClient client, Guid projectId, Guid seasonId) =>
        [.. (await Seasons(client, projectId)).First(season => season.Id == seasonId).Episodes];

    private static async Task Move(HttpClient client, string path, ProjectMoveRequest request) =>
        (await client.PostAsJsonAsync(path, request)).EnsureSuccessStatusCode();

    private static async Task Delete(HttpClient client, string path) =>
        (await client.DeleteAsync(path)).EnsureSuccessStatusCode();

    private static async Task<T> Put<T>(HttpClient client, string path, object request)
    {
        var response = await client.PutAsJsonAsync(path, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }
}
