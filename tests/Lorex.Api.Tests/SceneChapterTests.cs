using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// Scenes inside chapters.
///
/// The invariant this file exists for: <b>a scene's order is its place inside its container</b> - one
/// chapter, or Unchaptered - contiguous from 0 there, and never a single order across the story. Every
/// write that touches order keeps both sides of a move contiguous, touches no other container, and
/// leaves the scene itself - its id, text, point of view, chronology and links - exactly as it was.
/// A chapter id a request names is resolved inside the story, never trusted.
///
/// Every structural assertion goes through <see cref="Shape"/>, which also proves each container's
/// order is contiguous and that the story reads Unchaptered first and then chapter by chapter.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class SceneChapterTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Containers ----------

    [Fact]
    public async Task A_story_needs_no_chapter_and_a_scene_without_one_is_Unchaptered()
    {
        var (client, universe, story) = await WithStory("scenenochapter");

        var a = await Create(client, universe.Id, story.Id, Scene("A"));
        var b = await Create(client, universe.Id, story.Id, Scene("B"));

        Assert.Null(a.ChapterId);
        Assert.Equal([0, 1], new[] { a, b }.Select(scene => scene.SortOrder));

        var detail = await Detail(client, universe.Id, story.Id);
        Assert.Empty(detail.Chapters);
        Assert.Equal(["Unchaptered: A, B"], Shape(detail));
    }

    [Fact]
    public async Task A_scene_created_in_a_chapter_is_appended_to_that_chapter_alone()
    {
        var (client, universe, story) = await WithStory("scenecreateinchapter");
        var one = await CreateChapter(client, universe.Id, story.Id, "One");
        var two = await CreateChapter(client, universe.Id, story.Id, "Two");

        var created = new List<SceneResponse>
        {
            await Create(client, universe.Id, story.Id, Scene("U1")),
            await Create(client, universe.Id, story.Id, Scene("O1", one.Id)),
            await Create(client, universe.Id, story.Id, Scene("O2", one.Id)),
            await Create(client, universe.Id, story.Id, Scene("T1", two.Id)),
            await Create(client, universe.Id, story.Id, Scene("U2")),
            await Create(client, universe.Id, story.Id, Scene("O3", one.Id)),
        };

        Assert.Equal(
            new (Guid?, int)[] { (null, 0), (one.Id, 0), (one.Id, 1), (two.Id, 0), (null, 1), (one.Id, 2) },
            created.Select(scene => (scene.ChapterId, scene.SortOrder)));

        var detail = await Detail(client, universe.Id, story.Id);
        Assert.Equal(["Unchaptered: U1, U2", "One: O1, O2, O3", "Two: T1"], Shape(detail));

        // The scene list reads in the same order as the story.
        var listed = (await client.GetFromJsonAsync<List<SceneResponse>>(ScenesPath(universe.Id, story.Id)))!;
        Assert.Equal(detail.Scenes.Select(scene => scene.Id), listed.Select(scene => scene.Id));
    }

    [Fact]
    public async Task A_chapter_holds_scenes_in_any_chronological_order()
    {
        var (client, universe, story) = await WithStory("scenechapternonlinear");
        var eras = await TheFall(client, universe.Id);
        var one = await CreateChapter(client, universe.Id, story.Id, "One");

        await Create(client, universe.Id, story.Id, Scene("AF 100", one.Id, new ChronologyValue(eras.After, 100, null, null)));
        await Create(client, universe.Id, story.Id, Scene("BF 20", one.Id, new ChronologyValue(eras.Before, 20, null, null)));
        await Create(client, universe.Id, story.Id, Scene("AF 2", one.Id, new ChronologyValue(eras.After, 2, null, null)));

        Assert.Equal(["Unchaptered: ", "One: AF 100, BF 20, AF 2"], Shape(await Detail(client, universe.Id, story.Id)));
    }

    [Fact]
    public async Task A_chapter_from_another_story_another_universe_or_nowhere_is_refused_everywhere_a_scene_names_one()
    {
        var (client, universe, story) = await WithStory("scenechapterforeign");
        var one = await CreateChapter(client, universe.Id, story.Id, "One");

        var other = await CreateStory(client, universe.Id, "Another story");
        var elsewhere = await CreateChapter(client, universe.Id, other.Id, "Elsewhere");

        var (stranger, strangerUniverse, strangerStory) = await WithStory("scenechapterforeignstranger");
        var theirs = await CreateChapter(stranger, strangerUniverse.Id, strangerStory.Id, "Theirs");

        foreach (var foreign in new[] { elsewhere.Id, theirs.Id, Guid.NewGuid() })
        {
            await AssertRefused(await Post(client, universe.Id, story.Id, Scene("X", foreign)), "chapterId");
        }

        var a = await Create(client, universe.Id, story.Id, Scene("A", one.Id));

        await AssertRefused(
            await client.PutVersionedAsync(ScenePath(universe.Id, story.Id, a.Id), Scene("A", elsewhere.Id)),
            "chapterId");
        await AssertRefused(await Move(client, universe.Id, story.Id, a.Id, elsewhere.Id, null), "chapterId");
        await AssertRefused(await Move(client, universe.Id, story.Id, a.Id, theirs.Id, 0), "chapterId");
        await AssertRefused(await Reorder(client, universe.Id, story.Id, elsewhere.Id), "chapterId");

        Assert.Equal(["Unchaptered: ", "One: A"], Shape(await Detail(client, universe.Id, story.Id)));
        Assert.Equal(["Unchaptered: ", "Elsewhere: "], Shape(await Detail(client, universe.Id, other.Id)));
    }

    // ---------- Order inside one container ----------

    [Fact]
    public async Task Reordering_one_chapter_never_touches_Unchaptered_or_another_chapter()
    {
        var (client, universe, story) = await WithStory("scenereorderchapter");
        var world = await Build(client, universe.Id, story.Id);

        var response = await Reorder(client, universe.Id, story.Id, world.One, world["c"], world["a"], world["b"]);
        response.EnsureSuccessStatusCode();

        // The answer is that container alone, in its new order.
        var returned = (await response.Content.ReadFromJsonAsync<List<SceneResponse>>())!;
        Assert.Equal(["c", "a", "b"], returned.Select(scene => scene.Title));
        Assert.Equal([0, 1, 2], returned.Select(scene => scene.SortOrder));
        Assert.All(returned, scene => Assert.Equal(world.One, scene.ChapterId));

        Assert.Equal(["Unchaptered: u, v", "One: c, a, b", "Two: d, e"], Shape(await Detail(client, universe.Id, story.Id)));
    }

    [Fact]
    public async Task Reordering_Unchaptered_leaves_every_chapter_alone()
    {
        var (client, universe, story) = await WithStory("scenereorderunchaptered");
        var world = await Build(client, universe.Id, story.Id);

        var response = await Reorder(client, universe.Id, story.Id, null, world["v"], world["u"]);
        response.EnsureSuccessStatusCode();

        var returned = (await response.Content.ReadFromJsonAsync<List<SceneResponse>>())!;
        Assert.Equal(["v", "u"], returned.Select(scene => scene.Title));
        Assert.All(returned, scene => Assert.Null(scene.ChapterId));

        Assert.Equal(["Unchaptered: v, u", "One: a, b, c", "Two: d, e"], Shape(await Detail(client, universe.Id, story.Id)));
    }

    [Fact]
    public async Task A_reorder_must_name_exactly_the_scenes_of_the_container_it_names()
    {
        var (client, universe, story) = await WithStory("scenereordercontainerbad");
        var world = await Build(client, universe.Id, story.Id);

        // A scene from another chapter, one too many, one too few.
        await AssertRefused(await Reorder(client, universe.Id, story.Id, world.One, world["a"], world["b"], world["d"]), "sceneIds");
        await AssertRefused(await Reorder(client, universe.Id, story.Id, world.One, world["a"], world["b"], world["c"], world["u"]), "sceneIds");
        await AssertRefused(await Reorder(client, universe.Id, story.Id, world.One, world["a"], world["b"]), "sceneIds");

        // Unchaptered is its own container, and never "the whole story".
        await AssertRefused(await Reorder(client, universe.Id, story.Id, null, world["u"], world["v"], world["a"]), "sceneIds");
        await AssertRefused(await Reorder(client, universe.Id, story.Id, null, world["a"], world["b"], world["c"]), "sceneIds");
        await AssertRefused(await Reorder(client, universe.Id, story.Id, null, world["u"], world["u"]), "sceneIds");
        await AssertRefused(
            await client.PutAsJsonAsync($"{ScenesPath(universe.Id, story.Id)}/order", new SceneOrderRequest(null, world.One)),
            "sceneIds");

        Assert.Equal(["Unchaptered: u, v", "One: a, b, c", "Two: d, e"], Shape(await Detail(client, universe.Id, story.Id)));
    }

    // ---------- Moving between containers ----------

    [Fact]
    public async Task A_scene_moves_from_Unchaptered_into_a_chapter_and_both_containers_close_up()
    {
        var (client, universe, story) = await WithStory("scenemoveintochapter");
        var one = await CreateChapter(client, universe.Id, story.Id, "One");
        var rich = await RichScene(client, universe.Id, story.Id, "v", null);
        var u = await Create(client, universe.Id, story.Id, Scene("u"));
        await Create(client, universe.Id, story.Id, Scene("w"));
        await Create(client, universe.Id, story.Id, Scene("a", one.Id));
        await Create(client, universe.Id, story.Id, Scene("b", one.Id));

        // Appended when no position is given. The answer is the story's whole structure.
        var moved = await MoveOk(client, universe.Id, story.Id, rich.Id, one.Id, null);
        Assert.Equal(["Unchaptered: u, w", "One: a, b, v"], Shape(moved));
        AssertSameScene(rich, moved.Scenes.Single(scene => scene.Id == rich.Id));

        // Placed first when asked.
        var first = await MoveOk(client, universe.Id, story.Id, u.Id, one.Id, 0);
        Assert.Equal(["Unchaptered: w", "One: u, a, b, v"], Shape(first));

        Assert.Equal(Shape(first), Shape(await Detail(client, universe.Id, story.Id)));
    }

    [Fact]
    public async Task A_scene_moves_from_a_chapter_back_to_Unchaptered()
    {
        var (client, universe, story) = await WithStory("scenemoveout");
        var one = await CreateChapter(client, universe.Id, story.Id, "One");
        await Create(client, universe.Id, story.Id, Scene("u"));
        await Create(client, universe.Id, story.Id, Scene("a", one.Id));
        var b = await RichScene(client, universe.Id, story.Id, "b", one.Id);
        var c = await Create(client, universe.Id, story.Id, Scene("c", one.Id));

        var moved = await MoveOk(client, universe.Id, story.Id, b.Id, null, null);
        Assert.Equal(["Unchaptered: u, b", "One: a, c"], Shape(moved));
        AssertSameScene(b, moved.Scenes.Single(scene => scene.Id == b.Id));

        Assert.Equal(["Unchaptered: c, u, b", "One: a"], Shape(await MoveOk(client, universe.Id, story.Id, c.Id, null, 0)));
    }

    [Fact]
    public async Task A_scene_moves_from_one_chapter_to_another_keeping_everything_it_holds()
    {
        var (client, universe, story) = await WithStory("scenemoveacross");
        var one = await CreateChapter(client, universe.Id, story.Id, "One");
        var two = await CreateChapter(client, universe.Id, story.Id, "Two");
        await Create(client, universe.Id, story.Id, Scene("x", one.Id));
        var r = await RichScene(client, universe.Id, story.Id, "r", one.Id);
        await Create(client, universe.Id, story.Id, Scene("y", one.Id));
        await Create(client, universe.Id, story.Id, Scene("z", two.Id));

        var moved = await MoveOk(client, universe.Id, story.Id, r.Id, two.Id, 1);

        Assert.Equal(["Unchaptered: ", "One: x, y", "Two: z, r"], Shape(moved));
        AssertSameScene(r, moved.Scenes.Single(scene => scene.Id == r.Id));

        // The same row, not a copy: one scene fewer nowhere, and its links are the rows it always had.
        await WithDb(async db =>
        {
            Assert.Equal(4, await db.Scenes.CountAsync(scene => scene.StoryId == story.Id));
            Assert.Equal(2, await db.SceneEntityLinks.CountAsync(link => link.SceneId == r.Id));
        });
    }

    [Fact]
    public async Task A_scene_moves_within_its_own_container_to_a_chosen_position()
    {
        var (client, universe, story) = await WithStory("scenemovewithin");
        var one = await CreateChapter(client, universe.Id, story.Id, "One");
        var a = await Create(client, universe.Id, story.Id, Scene("a", one.Id));
        await Create(client, universe.Id, story.Id, Scene("b", one.Id));
        var c = await Create(client, universe.Id, story.Id, Scene("c", one.Id));

        Assert.Equal(["Unchaptered: ", "One: c, a, b"], Shape(await MoveOk(client, universe.Id, story.Id, c.Id, one.Id, 0)));
        Assert.Equal(["Unchaptered: ", "One: a, b, c"], Shape(await MoveOk(client, universe.Id, story.Id, c.Id, one.Id, 2)));
        Assert.Equal(["Unchaptered: ", "One: b, c, a"], Shape(await MoveOk(client, universe.Id, story.Id, a.Id, one.Id, null)));
    }

    [Fact]
    public async Task A_position_outside_the_container_is_refused_and_nothing_moves()
    {
        var (client, universe, story) = await WithStory("scenemovebadposition");
        var one = await CreateChapter(client, universe.Id, story.Id, "One");
        var two = await CreateChapter(client, universe.Id, story.Id, "Two");
        var a = await Create(client, universe.Id, story.Id, Scene("a", one.Id));
        await Create(client, universe.Id, story.Id, Scene("b", one.Id));
        await Create(client, universe.Id, story.Id, Scene("d", two.Id));

        // Two holds one scene, so a scene arriving there may go at 0 or 1.
        await AssertRefused(await Move(client, universe.Id, story.Id, a.Id, two.Id, 2), "position");
        await AssertRefused(await Move(client, universe.Id, story.Id, a.Id, two.Id, -1), "position");

        // Inside its own chapter the scene is counted out first: b alone, so 0 or 1.
        await AssertRefused(await Move(client, universe.Id, story.Id, a.Id, one.Id, 2), "position");

        Assert.Equal(["Unchaptered: ", "One: a, b", "Two: d"], Shape(await Detail(client, universe.Id, story.Id)));
    }

    // ---------- Editing and deleting ----------

    [Fact]
    public async Task Editing_a_scene_into_another_chapter_moves_it_and_naming_its_own_chapter_leaves_it_in_place()
    {
        var (client, universe, story) = await WithStory("sceneeditmove");
        var one = await CreateChapter(client, universe.Id, story.Id, "One");
        var two = await CreateChapter(client, universe.Id, story.Id, "Two");
        await Create(client, universe.Id, story.Id, Scene("a", one.Id));
        var b = await Create(client, universe.Id, story.Id, Scene("b", one.Id));
        await Create(client, universe.Id, story.Id, Scene("c", one.Id));
        await Create(client, universe.Id, story.Id, Scene("d", two.Id));

        // Into Two: appended there, and One closes up behind it.
        var moved = await Update(client, universe.Id, story.Id, b.Id, Scene("b", two.Id));
        Assert.Equal(((Guid?)two.Id, 1), (moved.ChapterId, moved.SortOrder));
        Assert.Equal(["Unchaptered: ", "One: a, c", "Two: d, b"], Shape(await Detail(client, universe.Id, story.Id)));

        // Saved again in the chapter it is already in: only the title changes.
        var retitled = await Update(client, universe.Id, story.Id, b.Id, Scene("b, retitled", two.Id));
        Assert.Equal(((Guid?)two.Id, 1), (retitled.ChapterId, retitled.SortOrder));

        // Out to Unchaptered.
        var loose = await Update(client, universe.Id, story.Id, b.Id, Scene("b, retitled"));
        Assert.Equal(((Guid?)null, 0), (loose.ChapterId, loose.SortOrder));
        Assert.Equal(["Unchaptered: b, retitled", "One: a, c", "Two: d"], Shape(await Detail(client, universe.Id, story.Id)));
    }

    [Fact]
    public async Task Deleting_a_scene_closes_the_gap_in_its_own_container_only()
    {
        var (client, universe, story) = await WithStory("scenedeletecontainer");
        var world = await Build(client, universe.Id, story.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(ScenePath(universe.Id, story.Id, world["b"]))).StatusCode);
        Assert.Equal(["Unchaptered: u, v", "One: a, c", "Two: d, e"], Shape(await Detail(client, universe.Id, story.Id)));

        var appended = await Create(client, universe.Id, story.Id, Scene("f", world.One));
        Assert.Equal(2, appended.SortOrder);
    }

    // ---------- Who may move one ----------

    [Fact]
    public async Task Someone_else_cannot_move_or_reorder_a_scene_and_a_scene_from_another_story_is_not_found()
    {
        var (owner, universe, story) = await WithStory("scenemovemine");
        var world = await Build(owner, universe.Id, story.Id);
        var other = await CreateStory(owner, universe.Id, "Another");

        var stranger = await SignedInClient("user-scenemoveyours");

        Assert.Equal(HttpStatusCode.NotFound, (await Move(stranger, universe.Id, story.Id, world["a"], null, null)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await Reorder(stranger, universe.Id, story.Id, world.One, world["c"], world["b"], world["a"])).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await Move(owner, universe.Id, other.Id, world["a"], null, null)).StatusCode);

        Assert.Equal(["Unchaptered: u, v", "One: a, b, c", "Two: d, e"], Shape(await Detail(owner, universe.Id, story.Id)));
    }

    // ---------- Helpers ----------

    /// <summary>Unchaptered u, v; chapter One a, b, c; chapter Two d, e.</summary>
    private sealed class World(Guid one, Guid two, Dictionary<string, Guid> scenes)
    {
        public Guid One { get; } = one;

        public Guid Two { get; } = two;

        public Guid this[string title] => scenes[title];
    }

    private static async Task<World> Build(HttpClient client, Guid universeId, Guid storyId)
    {
        var one = await CreateChapter(client, universeId, storyId, "One");
        var two = await CreateChapter(client, universeId, storyId, "Two");
        var scenes = new Dictionary<string, Guid>();

        foreach (var (title, chapter) in new (string, Guid?)[]
                 {
                     ("u", null), ("a", one.Id), ("d", two.Id), ("b", one.Id), ("v", null), ("c", one.Id), ("e", two.Id),
                 })
        {
            scenes[title] = (await Create(client, universeId, storyId, Scene(title, chapter))).Id;
        }

        return new World(one.Id, two.Id, scenes);
    }

    /// <summary>
    /// The story's structure as it reads: "Unchaptered: ..." then one line per chapter in order. Proves on
    /// the way that each container is numbered 0, 1, 2... and that the scene list is exactly that grouping.
    /// </summary>
    private static string[] Shape(StoryDetail detail)
    {
        var unchaptered = detail.Scenes.Where(scene => scene.ChapterId is null).ToList();
        AssertContiguous(unchaptered);

        var lines = new List<string> { Line("Unchaptered", unchaptered) };
        var reading = new List<SceneResponse>(unchaptered);

        foreach (var chapter in detail.Chapters)
        {
            var inside = detail.Scenes.Where(scene => scene.ChapterId == chapter.Id).ToList();
            AssertContiguous(inside);
            lines.Add(Line(chapter.Title, inside));
            reading.AddRange(inside);
        }

        Assert.Equal(reading.Select(scene => scene.Id), detail.Scenes.Select(scene => scene.Id));
        return [.. lines];

        static string Line(string name, List<SceneResponse> scenes) =>
            $"{name}: {string.Join(", ", scenes.Select(scene => scene.Title))}";

        static void AssertContiguous(List<SceneResponse> scenes) =>
            Assert.Equal(Enumerable.Range(0, scenes.Count), scenes.Select(scene => scene.SortOrder));
    }

    /// <summary>Everything a scene holds, other than where it is told, is exactly as it was.</summary>
    private static void AssertSameScene(SceneResponse expected, SceneResponse actual)
    {
        Assert.Equal(expected.Id, actual.Id);
        Assert.Equal(expected.Title, actual.Title);
        Assert.Equal(expected.Summary, actual.Summary);
        Assert.Equal(expected.Notes, actual.Notes);
        Assert.Equal(expected.Pov?.EntityId, actual.Pov?.EntityId);
        Assert.Equal(expected.Chronology, actual.Chronology);
        Assert.Equal(expected.Entities.Select(entity => entity.EntityId), actual.Entities.Select(entity => entity.EntityId));
        Assert.Equal(expected.CreatedAt, actual.CreatedAt);
        Assert.Equal(expected.UpdatedAt, actual.UpdatedAt);
    }

    /// <summary>A scene with something in every field a move must not disturb.</summary>
    private static async Task<SceneResponse> RichScene(HttpClient client, Guid universeId, Guid storyId, string title, Guid? chapterId)
    {
        var arlen = await CreateEntity(client, universeId, $"Arlen {title}");
        var tower = await CreateEntity(client, universeId, $"Tower {title}");
        return await Create(
            client, universeId, storyId,
            new SceneRequest(
                title, "What happens.", "Planning notes.", arlen, new ChronologyValue(null, -40, 2, 3), [arlen, tower], chapterId));
    }

    private static SceneRequest Scene(string title, Guid? chapterId = null, ChronologyValue? chronology = null) =>
        new(title, null, null, null, chronology, null, chapterId);

    private static string StoryPath(Guid universeId, Guid storyId) => $"/api/universes/{universeId}/stories/{storyId}";

    private static string ScenesPath(Guid universeId, Guid storyId) => $"{StoryPath(universeId, storyId)}/scenes";

    private static string ScenePath(Guid universeId, Guid storyId, Guid sceneId) => $"{ScenesPath(universeId, storyId)}/{sceneId}";

    private static Task<HttpResponseMessage> Post(HttpClient client, Guid universeId, Guid storyId, SceneRequest request) =>
        client.PostAsJsonAsync(ScenesPath(universeId, storyId), request);

    private static async Task<SceneResponse> Create(HttpClient client, Guid universeId, Guid storyId, SceneRequest request)
    {
        var response = await Post(client, universeId, storyId, request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SceneResponse>())!;
    }

    private static async Task<SceneResponse> Update(HttpClient client, Guid universeId, Guid storyId, Guid sceneId, SceneRequest request)
    {
        var response = await client.PutVersionedAsync(ScenePath(universeId, storyId, sceneId), request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SceneResponse>())!;
    }

    private static Task<HttpResponseMessage> Reorder(HttpClient client, Guid universeId, Guid storyId, Guid? chapterId, params Guid[] sceneIds) =>
        client.PutAsJsonAsync($"{ScenesPath(universeId, storyId)}/order", new SceneOrderRequest(sceneIds, chapterId));

    private static Task<HttpResponseMessage> Move(HttpClient client, Guid universeId, Guid storyId, Guid sceneId, Guid? chapterId, int? position) =>
        client.PutAsJsonAsync($"{ScenePath(universeId, storyId, sceneId)}/position", new ScenePositionRequest(chapterId, position));

    private static async Task<StoryDetail> MoveOk(HttpClient client, Guid universeId, Guid storyId, Guid sceneId, Guid? chapterId, int? position)
    {
        var response = await Move(client, universeId, storyId, sceneId, chapterId, position);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<StoryDetail>())!;
    }

    private static async Task<StoryDetail> Detail(HttpClient client, Guid universeId, Guid storyId) =>
        (await client.GetFromJsonAsync<StoryDetail>(StoryPath(universeId, storyId)))!;

    private static async Task AssertRefused(HttpResponseMessage response, string key)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains($"\"{key}\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    private static async Task<ChapterResponse> CreateChapter(HttpClient client, Guid universeId, Guid storyId, string title)
    {
        var response = await client.PostAsJsonAsync($"{StoryPath(universeId, storyId)}/chapters", new ChapterRequest(title, null, null));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ChapterResponse>())!;
    }

    private static async Task<StoryDetail> CreateStory(HttpClient client, Guid universeId, string title)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/stories",
            new StoryRequest(title, null, StoryStatus.Planning));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<StoryDetail>())!;
    }

    private static async Task<Guid> CreateEntity(HttpClient client, Guid universeId, string name)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(types.First(type => type.Name == "Character").Id, name, null, CanonStatus.Canon, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!.Id;
    }

    private sealed record FallEras(Guid Before, Guid After);

    private static async Task<FallEras> TheFall(HttpClient client, Guid universeId)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        response.EnsureSuccessStatusCode();
        var eras = (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
        return new FallEras(eras[0].Id, eras[1].Id);
    }

    private async Task WithDb(Func<LorexDbContext, Task> work)
    {
        using var scope = _factory.Services.CreateScope();
        await work(scope.ServiceProvider.GetRequiredService<LorexDbContext>());
    }

    private async Task<(HttpClient Client, UniverseDetail Universe, StoryDetail Story)> WithStory(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        var universe = await CreateUniverse(client, $"World {tag}");
        return (client, universe, await CreateStory(client, universe.Id, $"Story {tag}"));
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

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }
}
