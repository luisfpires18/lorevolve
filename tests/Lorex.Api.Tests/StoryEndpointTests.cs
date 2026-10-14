using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// Stories inside a universe: what one holds, who may reach it, what deleting one takes with it, and
/// the boundary that matters most - a story is authored narrative, so writing one changes nothing
/// about the lore, the timeline or Canon Integrity.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class StoryEndpointTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Writing and reading ----------

    [Fact]
    public async Task A_story_is_created_read_and_listed()
    {
        var (client, universe) = await SignedInWithUniverse("storycreate");

        var created = await CreateStory(
            client, universe.Id, new StoryRequest("  The Long Winter  ", " A siege, told backwards. ", StoryStatus.Drafting));

        Assert.Equal("The Long Winter", created.Title);
        Assert.Equal("A siege, told backwards.", created.Premise);
        Assert.Equal(StoryStatus.Drafting, created.Status);
        Assert.Empty(created.Scenes);

        var read = await client.GetFromJsonAsync<StoryDetail>(Story(universe.Id, created.Id));
        Assert.Equal(created.Id, read!.Id);
        Assert.Equal("The Long Winter", read.Title);

        var listed = Assert.Single(await List(client, universe.Id));
        Assert.Equal(created.Id, listed.Id);
        Assert.Equal(0, listed.SceneCount);
        Assert.Equal(StoryStatus.Drafting, listed.Status);
    }

    [Fact]
    public async Task A_story_is_updated()
    {
        var (client, universe) = await SignedInWithUniverse("storyupdate");
        var created = await CreateStory(client, universe.Id, new StoryRequest("Draft title", null, StoryStatus.Planning));

        var response = await client.PutVersionedAsync(
            Story(universe.Id, created.Id),
            new StoryRequest("The Council", "Nine voices, one vote.", StoryStatus.Complete));
        response.EnsureSuccessStatusCode();

        var read = (await client.GetFromJsonAsync<StoryDetail>(Story(universe.Id, created.Id)))!;
        Assert.Equal("The Council", read.Title);
        Assert.Equal("Nine voices, one vote.", read.Premise);
        Assert.Equal(StoryStatus.Complete, read.Status);
    }

    [Fact]
    public async Task A_story_needs_a_title_and_a_status_Lorex_knows()
    {
        var (client, universe) = await SignedInWithUniverse("storyinvalid");

        var untitled = await client.PostAsJsonAsync(Stories(universe.Id), new StoryRequest("   ", null, StoryStatus.Planning));
        Assert.Equal(HttpStatusCode.BadRequest, untitled.StatusCode);
        Assert.Contains("\"title\"", await untitled.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var unknown = await client.PostAsJsonAsync(Stories(universe.Id), new StoryRequest("Fine", null, (StoryStatus)9));
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Contains("\"status\"", await unknown.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        Assert.Empty(await List(client, universe.Id));
    }

    [Fact]
    public async Task Stories_are_listed_by_title_with_how_many_scenes_each_has()
    {
        var (client, universe) = await SignedInWithUniverse("storylist");

        var winter = await CreateStory(client, universe.Id, new StoryRequest("Winter", null, StoryStatus.Planning));
        var autumn = await CreateStory(client, universe.Id, new StoryRequest("Autumn", null, StoryStatus.Planning));

        await AddScene(client, universe.Id, winter.Id, "Snowfall");
        await AddScene(client, universe.Id, winter.Id, "Thaw");

        var listed = await List(client, universe.Id);
        Assert.Equal(["Autumn", "Winter"], listed.Select(story => story.Title));
        Assert.Equal([0, 2], listed.Select(story => story.SceneCount));
        _ = autumn;
    }

    [Fact]
    public async Task A_story_is_read_in_the_same_few_queries_however_many_chapters_and_scenes_it_holds()
    {
        var (client, universe) = await SignedInWithUniverse("storyqueries");

        var lore = new List<Guid>();
        for (var index = 0; index < 5; index++)
        {
            lore.Add((await CreateEntity(client, universe.Id, $"Entry {index}")).Id);
        }

        var small = await CreateStory(client, universe.Id, new StoryRequest("Small", null, StoryStatus.Planning));
        await AddScene(client, universe.Id, small.Id, "Alone", pov: lore[0], entities: [lore[1]]);

        var large = await CreateStory(client, universe.Id, new StoryRequest("Large", null, StoryStatus.Planning));
        for (var chapterIndex = 0; chapterIndex < 10; chapterIndex++)
        {
            var created = await client.PostAsJsonAsync(
                $"{Story(universe.Id, large.Id)}/chapters", new ChapterRequest($"Chapter {chapterIndex}", null, null));
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            var chapter = (await created.Content.ReadFromJsonAsync<ChapterResponse>())!;

            for (var sceneIndex = 0; sceneIndex < 10; sceneIndex++)
            {
                await AddScene(
                    client, universe.Id, large.Id, $"Scene {chapterIndex}.{sceneIndex}",
                    pov: lore[sceneIndex % 5],
                    entities: [lore[(sceneIndex + 1) % 5], lore[(sceneIndex + 2) % 5]],
                    chapterId: chapter.Id);
            }
        }

        var (smallQueries, _) = await CountQueries(
            [universe.Id, small.Id], () => client.GetFromJsonAsync<StoryDetail>(Story(universe.Id, small.Id)));
        var (largeQueries, detail) = await CountQueries(
            [universe.Id, large.Id], () => client.GetFromJsonAsync<StoryDetail>(Story(universe.Id, large.Id)));

        Assert.Equal(10, detail!.Chapters.Count);
        Assert.Equal(100, detail.Scenes.Count);
        Assert.All(detail.Scenes, scene =>
        {
            Assert.NotNull(scene.Pov);
            Assert.Equal(2, scene.Entities.Count);
        });

        // One scene or a hundred in ten chapters, the same queries: nothing is read per chapter, per scene
        // or per reference - ownership, the story, its chapters, its scenes and the lore they name.
        Assert.Equal(smallQueries, largeQueries);
        Assert.InRange(largeQueries, 1, 5);
    }

    // ---------- What deleting takes with it ----------

    [Fact]
    public async Task Deleting_a_story_moves_it_to_the_trash_with_its_scenes_and_links_and_no_lore()
    {
        var (client, universe) = await SignedInWithUniverse("storydelete");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var story = await CreateStory(client, universe.Id, new StoryRequest("Doomed", null, StoryStatus.Planning));

        var scene = await AddScene(client, universe.Id, story.Id, "The Council", pov: arlen.Id, entities: [arlen.Id]);

        var response = await client.DeleteAsync(Story(universe.Id, story.Id));
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        // Gone from the story, the list and every write, and a second delete finds nothing to delete.
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Story(universe.Id, story.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Story(universe.Id, story.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutVersionedAsync(Story(universe.Id, story.Id), new StoryRequest("Back", null, StoryStatus.Planning))).StatusCode);
        Assert.DoesNotContain(
            "Doomed", await client.GetStringAsync($"/api/universes/{universe.Id}/stories"), StringComparison.Ordinal);

        // Nothing is erased: the story is marked, and what it holds waits with it (ADR 0029).
        await WithDb(async db =>
        {
            Assert.True(await db.Stories.AnyAsync(candidate => candidate.Id == story.Id && candidate.DeletedAt != null));
            Assert.True(await db.Scenes.AnyAsync(candidate => candidate.Id == scene.Id && candidate.DeletedAt == null));
            Assert.True(await db.SceneEntityLinks.AnyAsync(link => link.SceneId == scene.Id));
            Assert.True(await db.Entities.AnyAsync(entity => entity.Id == arlen.Id && entity.DeletedAt == null));
        });
    }

    [Fact]
    public async Task Deleting_a_universe_takes_its_stories_scenes_and_links_with_it()
    {
        var (client, universe) = await SignedInWithUniverse("storyuniversedelete");
        var eras = await TheFall(client, universe.Id);
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var story = await CreateStory(client, universe.Id, new StoryRequest("Gone", null, StoryStatus.Planning));
        await AddScene(
            client, universe.Id, story.Id, "Everything at once",
            pov: arlen.Id, entities: [arlen.Id], chronology: new ChronologyValue(eras[1].Id, 12, null, null));

        (await client.PostAsync($"/api/universes/{universe.Id}/archive", content: null)).EnsureSuccessStatusCode();
        var deleted = await client.DeleteAsync($"/api/universes/{universe.Id}");

        // The point of view (set null), the era (no action) and the links (cascade) all meet the
        // universe's own cascade in one statement, and none of them may stop it.
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        await WithDb(async db =>
        {
            Assert.False(await db.Stories.AnyAsync(candidate => candidate.UniverseId == universe.Id));
            Assert.False(await db.Scenes.AnyAsync(candidate => candidate.StoryId == story.Id));
            Assert.False(await db.SceneEntityLinks.AnyAsync(link => link.EntityId == arlen.Id));
        });
    }

    // ---------- A story is not lore ----------

    [Fact]
    public async Task Writing_a_story_creates_no_canon_findings_no_timeline_entries_and_changes_no_entry()
    {
        var (client, universe) = await SignedInWithUniverse("storynotlore");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var before = await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{arlen.Id}");

        var story = await CreateStory(client, universe.Id, new StoryRequest("What if", "A hypothetical.", StoryStatus.Planning));
        var scene = await AddScene(
            client, universe.Id, story.Id, "Arlen dies",
            pov: arlen.Id, entities: [arlen.Id], chronology: new ChronologyValue(null, -40, 2, 3),
            summary: "Arlen is killed at the gate.");

        (await client.PutVersionedAsync(
            $"{Scenes(universe.Id, story.Id)}/{scene.Id}",
            new SceneRequest("Arlen lives", "He does not die after all.", "Undecided.", arlen.Id, null, [arlen.Id])))
            .EnsureSuccessStatusCode();

        var conflicts = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universe.Id}/canon-conflicts?pageSize=100"))!;
        Assert.Empty(conflicts.Items);

        var timeline = (await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{universe.Id}/timeline"))!;
        Assert.Equal(0, timeline.TotalCount);

        Assert.Equal(before, await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{arlen.Id}"));
    }

    // ---------- Who may reach one ----------

    [Fact]
    public async Task Someone_else_cannot_list_read_change_or_delete_a_story()
    {
        var (owner, universe) = await SignedInWithUniverse("storymine");
        var story = await CreateStory(owner, universe.Id, new StoryRequest("Private", null, StoryStatus.Planning));

        var stranger = await SignedInClient("user-storyyours");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Stories(universe.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Story(universe.Id, story.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.PostAsJsonAsync(Stories(universe.Id), new StoryRequest("Intruder", null, StoryStatus.Planning))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.PutVersionedAsync(Story(universe.Id, story.Id), new StoryRequest("Mine now", null, StoryStatus.Planning))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync(Story(universe.Id, story.Id))).StatusCode);

        var read = (await owner.GetFromJsonAsync<StoryDetail>(Story(universe.Id, story.Id)))!;
        Assert.Equal("Private", read.Title);
        Assert.Single(await List(owner, universe.Id));
    }

    [Fact]
    public async Task A_story_id_from_another_universe_is_not_found_even_for_its_owner()
    {
        var (client, first) = await SignedInWithUniverse("storyelsewhere");
        var second = await CreateUniverse(client, "World storyelsewhere two");
        var story = await CreateStory(client, first.Id, new StoryRequest("Belongs to the first", null, StoryStatus.Planning));

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Story(second.Id, story.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutVersionedAsync(Story(second.Id, story.Id), new StoryRequest("Moved", null, StoryStatus.Planning))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Story(second.Id, story.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(Scenes(second.Id, story.Id), new SceneRequest("Smuggled", null, null, null, null, null))).StatusCode);

        Assert.Empty(await List(client, second.Id));
        Assert.Equal("Belongs to the first", (await client.GetFromJsonAsync<StoryDetail>(Story(first.Id, story.Id)))!.Title);
    }

    [Fact]
    public async Task An_anonymous_caller_is_challenged_rather_than_answered()
    {
        var (owner, universe) = await SignedInWithUniverse("storyanon");
        await CreateStory(owner, universe.Id, new StoryRequest("Hidden", null, StoryStatus.Planning));

        var anonymous = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Stories(universe.Id))).StatusCode);
    }

    // ---------- Helpers ----------

    private static string Stories(Guid universeId) => $"/api/universes/{universeId}/stories";

    private static string Story(Guid universeId, Guid storyId) => $"{Stories(universeId)}/{storyId}";

    private static string Scenes(Guid universeId, Guid storyId) => $"{Story(universeId, storyId)}/scenes";

    private static async Task<List<StorySummary>> List(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<StorySummary>>(Stories(universeId)))!;

    private static async Task<StoryDetail> CreateStory(HttpClient client, Guid universeId, StoryRequest request)
    {
        var response = await client.PostAsJsonAsync(Stories(universeId), request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<StoryDetail>())!;
    }

    private static async Task<SceneResponse> AddScene(
        HttpClient client,
        Guid universeId,
        Guid storyId,
        string title,
        Guid? pov = null,
        IReadOnlyList<Guid>? entities = null,
        ChronologyValue? chronology = null,
        string? summary = null,
        Guid? chapterId = null)
    {
        var response = await client.PostAsJsonAsync(
            Scenes(universeId, storyId),
            new SceneRequest(title, summary, null, pov, chronology, entities, chapterId));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SceneResponse>())!;
    }

    private static Task<(int Queries, T Result)> CountQueries<T>(IReadOnlyCollection<Guid> ids, Func<Task<T>> work) =>
        CommandCounter.CountAsync(ids, work);

    private static async Task<EntityDetail> CreateEntity(HttpClient client, Guid universeId, string name)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(types.First(type => type.Name == "Character").Id, name, null, CanonStatus.Canon, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<IReadOnlyList<ChronologyEraResponse>> TheFall(HttpClient client, Guid universeId)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(
                    null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(
                    null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
    }

    private async Task WithDb(Func<LorexDbContext, Task> read)
    {
        using var scope = _factory.Services.CreateScope();
        await read(scope.ServiceProvider.GetRequiredService<LorexDbContext>());
    }

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        return (client, await CreateUniverse(client, $"World {tag}"));
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }
}
