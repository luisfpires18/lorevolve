using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Projects;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The projects list is paged (#198). The list joins two sources, stored projects and stories shown as Writing
/// Projects, so the cases that matter are the ones where a page boundary falls between rows of different sources:
/// a story must never be dropped or pushed past the bound because it came from the second query.
///
/// Update times are written straight to the database, one minute apart, so the expected order is known exactly rather
/// than depending on how fast the requests ran.
/// </summary>
public sealed class ProjectListPagingTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Projects = "/api/projects";

    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Pages_interleave_projects_and_stories_by_update_time_and_lose_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pagemix");

        // Ten rows, newest first, alternating source: project, story, project, story...
        var expected = new List<Guid>();
        for (var index = 0; index < 10; index++)
        {
            expected.Add(index % 2 == 0
                ? (await CreateProject(client, universe.Id, $"Project {index}")).Id
                : await CreateStory(client, universe.Id, $"Story {index}"));
        }

        await Age(expected);

        // A bound of four crosses both sources twice.
        var first = await List(client, universe.Id, "&limit=4");
        Assert.Equal(expected.Take(4), first.Select(row => row.Id));
        Assert.Equal(2, first.Count(row => row.StoryId is not null));

        // Walking every page in threes returns all ten, in order, once each, including a final short page.
        var walked = new List<Guid>();
        for (var offset = 0; offset < 12; offset += 3)
        {
            walked.AddRange((await List(client, universe.Id, $"&offset={offset}&limit=3")).Select(row => row.Id));
        }

        Assert.Equal(expected, walked);
    }

    [Fact]
    public async Task Stories_newer_than_every_project_fill_the_first_page_rather_than_follow_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pagestory");

        // Three stories newest, then three projects: appending stories after the bound would show only projects.
        var stories = new List<Guid>();
        for (var index = 0; index < 3; index++)
        {
            stories.Add(await CreateStory(client, universe.Id, $"Story {index}"));
        }

        var projects = new List<Guid>();
        for (var index = 0; index < 3; index++)
        {
            projects.Add((await CreateProject(client, universe.Id, $"Project {index}")).Id);
        }

        await Age([.. stories, .. projects]);

        var page = await List(client, universe.Id, "&limit=3");
        Assert.Equal(stories, page.Select(row => row.Id));
    }

    [Fact]
    public async Task The_default_page_is_bounded_and_a_bad_page_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pagedefault");
        var ids = new List<Guid>();
        for (var index = 0; index < ProjectEndpoints.MaxPageSize + 2; index++)
        {
            ids.Add((await CreateProject(client, universe.Id, $"Project {index}")).Id);
        }

        await Age(ids);

        var page = await List(client, universe.Id, string.Empty);
        Assert.Equal(ids.Take(ProjectEndpoints.MaxPageSize), page.Select(row => row.Id));

        var rest = await List(client, universe.Id, $"&offset={ProjectEndpoints.MaxPageSize}");
        Assert.Equal(ids.Skip(ProjectEndpoints.MaxPageSize), rest.Select(row => row.Id));

        foreach (var bad in new[] { "limit=0", $"limit={ProjectEndpoints.MaxPageSize + 1}", "offset=-1" })
        {
            var response = await client.GetAsync($"{Projects}?universeId={universe.Id}&{bad}");
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
    }

    [Fact]
    public async Task The_project_being_read_is_added_when_it_falls_past_the_bound()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "pageinclude");
        var ids = new List<Guid>();
        for (var index = 0; index < 5; index++)
        {
            ids.Add((await CreateProject(client, universe.Id, $"Project {index}")).Id);
        }

        var oldestStory = await CreateStory(client, universe.Id, "Oldest story");
        ids.Add(oldestStory);
        await Age(ids);

        // The oldest project, well past a bound of two, is added after the page.
        var withProject = await List(client, universe.Id, $"&limit=2&include={ids[4]}");
        Assert.Equal([ids[0], ids[1], ids[4]], withProject.Select(row => row.Id));

        // A story is a project the author can be in too.
        var withStory = await List(client, universe.Id, $"&limit=2&include={oldestStory}");
        Assert.Equal([ids[0], ids[1], oldestStory], withStory.Select(row => row.Id));

        // Already on the page: not repeated.
        var onPage = await List(client, universe.Id, $"&limit=2&include={ids[1]}");
        Assert.Equal([ids[0], ids[1]], onPage.Select(row => row.Id));

        // Someone else's project is never added, the same as it is never listed.
        var (stranger, theirs) = await SignedInWithUniverse(_factory, "pageother");
        var hidden = (await CreateProject(stranger, theirs.Id, "Not yours")).Id;
        var refused = await List(client, universe.Id, $"&limit=2&include={hidden}");
        Assert.Equal([ids[0], ids[1]], refused.Select(row => row.Id));

        // Nor is a project of another universe when the list is narrowed to this one.
        var elsewhere = await CreateUniverse(client, "World pageelsewhere");
        var outside = (await CreateProject(client, elsewhere.Id, "Elsewhere")).Id;
        var narrowed = await List(client, universe.Id, $"&limit=2&include={outside}");
        Assert.Equal([ids[0], ids[1]], narrowed.Select(row => row.Id));
    }

    /// <summary>Stamps the rows one minute apart, the first newest, whichever source each one is in.</summary>
    private Task Age(IReadOnlyList<Guid> newestFirst) =>
        WithDb(_factory, async db =>
        {
            var start = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
            for (var index = 0; index < newestFirst.Count; index++)
            {
                var id = newestFirst[index];
                var at = start.AddMinutes(-index);
                if (await db.CreativeProjects.Where(project => project.Id == id)
                        .ExecuteUpdateAsync(set => set.SetProperty(project => project.UpdatedAt, at)) == 0)
                {
                    await db.Stories.Where(story => story.Id == id)
                        .ExecuteUpdateAsync(set => set.SetProperty(story => story.UpdatedAt, at));
                }
            }
        });

    private static async Task<ProjectDetail> CreateProject(HttpClient client, Guid universeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            Projects,
            new ProjectRequest(name, ProjectKind.Game, ProjectLifecycle.Planning, null, null, universeId, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static async Task<List<ProjectDetail>> List(HttpClient client, Guid universeId, string page)
    {
        var response = await client.GetAsync($"{Projects}?universeId={universeId}{page}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<List<ProjectDetail>>())!;
    }
}
