using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The chapters of a story.
///
/// The invariants this file exists for: a chapter is optional structure in an order only its author
/// sets; its number is its position and is never stored; and deleting one never deletes a scene - its
/// scenes move to the end of Unchaptered, in their order, and keep everything they hold. Around that:
/// ownership at every level, and what deleting a story, a universe or an entry takes with it.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class ChapterEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Writing and reading ----------

    [Fact]
    public async Task A_chapter_is_appended_read_listed_and_updated()
    {
        var (client, universe, story) = await WithStory("chaptercrud");

        var arrival = await CreateChapter(
            client, universe.Id, story.Id, new ChapterRequest("  Arrival  ", " They reach the gate. ", " Open cold. "));
        var ashes = await CreateChapter(client, universe.Id, story.Id, Chapter("Ashes"));

        Assert.Equal("Arrival", arrival.Title);
        Assert.Equal("They reach the gate.", arrival.Summary);
        Assert.Equal("Open cold.", arrival.Notes);
        Assert.Equal(story.Id, arrival.StoryId);
        Assert.Equal([0, 1], new[] { arrival, ashes }.Select(chapter => chapter.SortOrder));

        var read = (await client.GetFromJsonAsync<ChapterResponse>(ChapterPath(universe.Id, story.Id, arrival.Id)))!;
        Assert.Equal(arrival.Id, read.Id);
        Assert.Equal("They reach the gate.", read.Summary);

        Assert.Equal(["Arrival", "Ashes"], (await ListChapters(client, universe.Id, story.Id)).Select(chapter => chapter.Title));

        var response = await client.PutAsJsonAsync(
            ChapterPath(universe.Id, story.Id, arrival.Id), new ChapterRequest("Arrival at the Gate", null, "  "));
        response.EnsureSuccessStatusCode();

        var updated = (await response.Content.ReadFromJsonAsync<ChapterResponse>())!;
        Assert.Equal("Arrival at the Gate", updated.Title);
        Assert.Null(updated.Summary);
        Assert.Null(updated.Notes);
        Assert.Equal(0, updated.SortOrder);

        var detail = await Detail(client, universe.Id, story.Id);
        Assert.Equal(["Arrival at the Gate", "Ashes"], detail.Chapters.Select(chapter => chapter.Title));
        Assert.True(detail.UpdatedAt >= story.UpdatedAt);
    }

    [Fact]
    public async Task A_chapter_needs_a_title_and_keeps_its_text_within_bounds()
    {
        var (client, universe, story) = await WithStory("chapterinvalid");

        await AssertRefused(await PostChapter(client, universe.Id, story.Id, Chapter("   ")), "title");
        await AssertRefused(
            await PostChapter(client, universe.Id, story.Id, Chapter(new string('x', StoryLimits.TitleMaxLength + 1))),
            "title");
        await AssertRefused(
            await PostChapter(
                client, universe.Id, story.Id,
                new ChapterRequest("Fine", new string('x', StoryLimits.ChapterSummaryMaxLength + 1), null)),
            "summary");
        await AssertRefused(
            await PostChapter(
                client, universe.Id, story.Id,
                new ChapterRequest("Fine", null, new string('x', StoryLimits.ChapterNotesMaxLength + 1))),
            "notes");

        Assert.Empty(await ListChapters(client, universe.Id, story.Id));

        var kept = await CreateChapter(client, universe.Id, story.Id, Chapter("Kept"));
        await AssertRefused(
            await client.PutAsJsonAsync(ChapterPath(universe.Id, story.Id, kept.Id), Chapter(" ")),
            "title");
        Assert.Equal("Kept", Assert.Single(await ListChapters(client, universe.Id, story.Id)).Title);
    }

    [Fact]
    public async Task A_chapter_s_number_is_its_position_and_its_title_is_only_what_the_author_wrote()
    {
        var (client, universe, story) = await WithStory("chapternumber");
        var fall = await CreateChapter(client, universe.Id, story.Id, Chapter("The Fall"));
        var rise = await CreateChapter(client, universe.Id, story.Id, Chapter("The Rise"));

        // Nothing on the wire is a number beyond the position.
        var raw = await client.GetStringAsync(ChaptersPath(universe.Id, story.Id));
        Assert.DoesNotContain("number", raw, StringComparison.OrdinalIgnoreCase);

        var reordered = await ReorderChapters(client, universe.Id, story.Id, rise.Id, fall.Id);
        reordered.EnsureSuccessStatusCode();

        var chapters = (await reordered.Content.ReadFromJsonAsync<List<ChapterResponse>>())!;
        Assert.Equal(["The Rise", "The Fall"], chapters.Select(chapter => chapter.Title));
        Assert.Equal([0, 1], chapters.Select(chapter => chapter.SortOrder));
    }

    // ---------- Chapter order ----------

    [Fact]
    public async Task Reordering_chapters_replaces_the_whole_order_and_every_scene_stays_where_it_is_told()
    {
        var (client, universe, story) = await WithStory("chapterreorder");
        var a = await CreateChapter(client, universe.Id, story.Id, Chapter("A"));
        var b = await CreateChapter(client, universe.Id, story.Id, Chapter("B"));
        var c = await CreateChapter(client, universe.Id, story.Id, Chapter("C"));

        await CreateScene(client, universe.Id, story.Id, "a1", a.Id);
        await CreateScene(client, universe.Id, story.Id, "a2", a.Id);
        await CreateScene(client, universe.Id, story.Id, "b1", b.Id);
        await CreateScene(client, universe.Id, story.Id, "c1", c.Id);
        await CreateScene(client, universe.Id, story.Id, "u1", null);

        var before = (await Detail(client, universe.Id, story.Id)).Scenes
            .ToDictionary(scene => scene.Id, scene => (scene.ChapterId, scene.SortOrder));

        var response = await ReorderChapters(client, universe.Id, story.Id, c.Id, a.Id, b.Id);
        response.EnsureSuccessStatusCode();

        var returned = (await response.Content.ReadFromJsonAsync<List<ChapterResponse>>())!;
        Assert.Equal(["C", "A", "B"], returned.Select(chapter => chapter.Title));
        Assert.Equal([0, 1, 2], returned.Select(chapter => chapter.SortOrder));

        var detail = await Detail(client, universe.Id, story.Id);
        Assert.Equal(["C", "A", "B"], detail.Chapters.Select(chapter => chapter.Title));

        // The story reads in the new chapter order; no scene changed chapter or place inside it.
        Assert.Equal(["u1", "c1", "a1", "a2", "b1"], detail.Scenes.Select(scene => scene.Title));
        Assert.All(detail.Scenes, scene => Assert.Equal(before[scene.Id], (scene.ChapterId, scene.SortOrder)));
    }

    [Fact]
    public async Task Reordering_chapters_refuses_a_repeated_a_missing_or_a_foreign_chapter_and_changes_nothing()
    {
        var (client, universe, story) = await WithStory("chapterreorderbad");
        var a = await CreateChapter(client, universe.Id, story.Id, Chapter("A"));
        var b = await CreateChapter(client, universe.Id, story.Id, Chapter("B"));

        var other = await CreateStory(client, universe.Id, "Another story");
        var foreign = await CreateChapter(client, universe.Id, other.Id, Chapter("Not yours"));

        await AssertRefused(await ReorderChapters(client, universe.Id, story.Id, a.Id, a.Id), "chapterIds");
        await AssertRefused(await ReorderChapters(client, universe.Id, story.Id, b.Id), "chapterIds");
        await AssertRefused(await ReorderChapters(client, universe.Id, story.Id, b.Id, foreign.Id), "chapterIds");
        await AssertRefused(await ReorderChapters(client, universe.Id, story.Id, b.Id, a.Id, foreign.Id), "chapterIds");
        await AssertRefused(await ReorderChapters(client, universe.Id, story.Id, b.Id, Guid.NewGuid()), "chapterIds");
        await AssertRefused(
            await client.PutAsJsonAsync($"{ChaptersPath(universe.Id, story.Id)}/order", new ChapterOrderRequest(null)),
            "chapterIds");

        Assert.Equal(["A", "B"], (await ListChapters(client, universe.Id, story.Id)).Select(chapter => chapter.Title));
        Assert.Equal(["Not yours"], (await ListChapters(client, universe.Id, other.Id)).Select(chapter => chapter.Title));
    }

    // ---------- Deleting a chapter ----------

    [Fact]
    public async Task Deleting_a_chapter_keeps_its_scenes_and_moves_them_to_the_end_of_Unchaptered_in_their_order()
    {
        var (client, universe, story) = await WithStory("chapterdelete");
        var eras = await TheFall(client, universe.Id);
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var tower = await CreateEntity(client, universe.Id, "White Tower");

        var one = await CreateChapter(client, universe.Id, story.Id, Chapter("One"));
        var two = await CreateChapter(client, universe.Id, story.Id, Chapter("Two"));

        await CreateScene(client, universe.Id, story.Id, "A", null);
        await CreateScene(client, universe.Id, story.Id, "B", null);
        var c = await Create(
            client, universe.Id, story.Id,
            new SceneRequest(
                "C", "What happens.", "Planning notes.", arlen.Id,
                new ChronologyValue(eras[1].Id, 12, 3, 4), [arlen.Id, tower.Id], one.Id));
        await CreateScene(client, universe.Id, story.Id, "D", one.Id);
        await CreateScene(client, universe.Id, story.Id, "E", two.Id);

        // The delete answers after the whole move; nothing about C is recreated or re-dated.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(ChapterPath(universe.Id, story.Id, one.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(ChapterPath(universe.Id, story.Id, one.Id))).StatusCode);

        var detail = await Detail(client, universe.Id, story.Id);

        var remaining = Assert.Single(detail.Chapters);
        Assert.Equal(two.Id, remaining.Id);
        Assert.Equal(0, remaining.SortOrder);

        Assert.Equal(
            new (string, Guid?, int)[] { ("A", null, 0), ("B", null, 1), ("C", null, 2), ("D", null, 3), ("E", two.Id, 0) },
            detail.Scenes.Select(scene => (scene.Title, scene.ChapterId, scene.SortOrder)));

        AssertSameScene(c, detail.Scenes.Single(scene => scene.Id == c.Id));

        // The last chapter goes the same way, after the four already there.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(ChapterPath(universe.Id, story.Id, two.Id))).StatusCode);

        var flat = await Detail(client, universe.Id, story.Id);
        Assert.Empty(flat.Chapters);
        Assert.Equal(["A", "B", "C", "D", "E"], flat.Scenes.Select(scene => scene.Title));
        Assert.Equal([0, 1, 2, 3, 4], flat.Scenes.Select(scene => scene.SortOrder));
        Assert.All(flat.Scenes, scene => Assert.Null(scene.ChapterId));

        await WithDb(async db =>
        {
            Assert.Equal(5, await db.Scenes.CountAsync(scene => scene.StoryId == story.Id));
            Assert.Equal(2, await db.SceneEntityLinks.CountAsync(link => link.SceneId == c.Id));
        });
    }

    [Fact]
    public async Task The_database_refuses_to_remove_a_chapter_that_still_holds_a_scene()
    {
        var (client, universe, story) = await WithStory("chapternoaction");
        var chapter = await CreateChapter(client, universe.Id, story.Id, Chapter("Held"));
        var scene = await CreateScene(client, universe.Id, story.Id, "Inside", chapter.Id);
        await CreateScene(client, universe.Id, story.Id, "Loose", null);

        // Only the chapter route may empty a chapter, because only it renumbers Unchaptered first. A delete
        // that skipped that - a bare SET NULL would have dropped the scene onto a place already taken - is
        // refused by the foreign key itself.
        await WithDb(async db =>
        {
            var refused = await Assert.ThrowsAnyAsync<Exception>(
                () => db.Chapters.Where(candidate => candidate.Id == chapter.Id).ExecuteDeleteAsync());
            Assert.Contains("FOREIGN KEY", refused.ToString(), StringComparison.Ordinal);
        });

        var detail = await Detail(client, universe.Id, story.Id);
        Assert.Equal(chapter.Id, Assert.Single(detail.Chapters).Id);
        var kept = detail.Scenes.Single(candidate => candidate.Id == scene.Id);
        Assert.Equal((chapter.Id, 0), (kept.ChapterId!.Value, kept.SortOrder));
    }

    [Fact]
    public async Task Deleting_a_chapter_closes_the_chapter_order_and_the_next_chapter_still_lands_last()
    {
        var (client, universe, story) = await WithStory("chapterdeletegap");
        await CreateChapter(client, universe.Id, story.Id, Chapter("A"));
        var b = await CreateChapter(client, universe.Id, story.Id, Chapter("B"));
        await CreateChapter(client, universe.Id, story.Id, Chapter("C"));

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(ChapterPath(universe.Id, story.Id, b.Id))).StatusCode);

        var chapters = await ListChapters(client, universe.Id, story.Id);
        Assert.Equal(["A", "C"], chapters.Select(chapter => chapter.Title));
        Assert.Equal([0, 1], chapters.Select(chapter => chapter.SortOrder));

        Assert.Equal(2, (await CreateChapter(client, universe.Id, story.Id, Chapter("D"))).SortOrder);
    }

    // ---------- What deleting other things takes with it ----------

    [Fact]
    public async Task Deleting_a_story_moves_it_to_the_trash_holding_its_chapters_scenes_and_links_and_no_lore()
    {
        var (client, universe, story) = await WithStory("chapterstorydelete");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var chapter = await CreateChapter(client, universe.Id, story.Id, Chapter("Doomed"));
        var inside = await Create(
            client, universe.Id, story.Id, new SceneRequest("Inside", null, null, arlen.Id, null, [arlen.Id], chapter.Id));
        var loose = await CreateScene(client, universe.Id, story.Id, "Loose", null);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{universe.Id}/stories/{story.Id}")).StatusCode);

        // Every route into the story answers as missing while it is in the Trash.
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(ChaptersPath(universe.Id, story.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(ChapterPath(universe.Id, story.Id, chapter.Id))).StatusCode);

        // Only the story is marked. What it holds is kept exactly as it was, for a restore to bring back (ADR 0029).
        await WithDb(async db =>
        {
            Assert.True(await db.Stories.AnyAsync(candidate => candidate.Id == story.Id && candidate.DeletedAt != null));
            Assert.True(await db.Chapters.AnyAsync(candidate => candidate.StoryId == story.Id && candidate.DeletedAt == null));
            Assert.Equal(2, await db.Scenes.CountAsync(candidate => (candidate.Id == inside.Id || candidate.Id == loose.Id) && candidate.DeletedAt == null));
            Assert.True(await db.SceneEntityLinks.AnyAsync(link => link.SceneId == inside.Id));
            Assert.True(await db.Entities.AnyAsync(entity => entity.Id == arlen.Id && entity.DeletedAt == null));
        });
    }

    [Fact]
    public async Task Deleting_a_universe_takes_its_chapters_with_everything_else()
    {
        var (client, universe, story) = await WithStory("chapteruniversedelete");
        var eras = await TheFall(client, universe.Id);
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var chapter = await CreateChapter(client, universe.Id, story.Id, Chapter("Everything"));
        await Create(
            client, universe.Id, story.Id,
            new SceneRequest("All at once", null, null, arlen.Id, new ChronologyValue(eras[1].Id, 2, null, null), [arlen.Id], chapter.Id));

        (await client.PostAsync($"/api/universes/{universe.Id}/archive", content: null)).EnsureSuccessStatusCode();

        // The chapter (no action), the point of view (set null), the era (no action) and the links
        // (cascade) all meet the universe's own cascade in one statement, and none of them may stop it.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{universe.Id}")).StatusCode);

        await WithDb(async db =>
        {
            Assert.False(await db.Chapters.AnyAsync(candidate => candidate.Id == chapter.Id));
            Assert.False(await db.Scenes.AnyAsync(candidate => candidate.StoryId == story.Id));
            Assert.False(await db.Stories.AnyAsync(candidate => candidate.Id == story.Id));
        });
    }

    [Fact]
    public async Task An_entry_removed_for_good_never_takes_a_chapter_or_a_scene_with_it()
    {
        var (client, universe, story) = await WithStory("chapterhardentity");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var tower = await CreateEntity(client, universe.Id, "White Tower");
        var chapter = await CreateChapter(client, universe.Id, story.Id, Chapter("Held"));
        var scene = await Create(
            client, universe.Id, story.Id, new SceneRequest("Survives", null, null, arlen.Id, null, [arlen.Id, tower.Id], chapter.Id));
        await CreateScene(client, universe.Id, story.Id, "After it", chapter.Id);

        // LorEvolve has no permanent delete for an entry. This is the database's own answer if a row ever goes.
        await WithDb(async db => await db.Entities.Where(entity => entity.Id == arlen.Id).ExecuteDeleteAsync());

        var detail = await Detail(client, universe.Id, story.Id);
        Assert.Equal(chapter.Id, Assert.Single(detail.Chapters).Id);

        var read = detail.Scenes.Single(candidate => candidate.Id == scene.Id);
        Assert.Equal(chapter.Id, read.ChapterId);
        Assert.Equal(0, read.SortOrder);
        Assert.Null(read.Pov);
        Assert.Equal([tower.Id], read.Entities.Select(entity => entity.EntityId));
        Assert.Equal(2, detail.Scenes.Count);
    }

    // ---------- A chapter is not lore ----------

    [Fact]
    public async Task Chapters_create_no_canon_findings_no_timeline_entries_and_change_no_entry()
    {
        var (client, universe, story) = await WithStory("chapternotlore");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var before = await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{arlen.Id}");

        var one = await CreateChapter(client, universe.Id, story.Id, new ChapterRequest("Arlen dies", "He falls at the gate.", null));
        var two = await CreateChapter(client, universe.Id, story.Id, Chapter("Arlen lives"));
        var scene = await Create(
            client, universe.Id, story.Id, new SceneRequest("The gate", null, null, arlen.Id, new ChronologyValue(null, -40, null, null), [arlen.Id], one.Id));

        (await client.PutAsJsonAsync($"{ScenesPath(universe.Id, story.Id)}/{scene.Id}/position", new ScenePositionRequest(two.Id, null)))
            .EnsureSuccessStatusCode();
        (await ReorderChapters(client, universe.Id, story.Id, two.Id, one.Id)).EnsureSuccessStatusCode();
        (await client.DeleteAsync(ChapterPath(universe.Id, story.Id, one.Id))).EnsureSuccessStatusCode();

        var conflicts = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universe.Id}/canon-conflicts?pageSize=100"))!;
        Assert.Empty(conflicts.Items);

        var timeline = (await client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{universe.Id}/timeline"))!;
        Assert.Equal(0, timeline.TotalCount);

        Assert.Equal(before, await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{arlen.Id}"));
    }

    // ---------- Who may reach one ----------

    [Fact]
    public async Task A_chapter_id_from_another_story_is_not_found_even_for_its_owner()
    {
        var (client, universe, story) = await WithStory("chapterotherstory");
        var other = await CreateStory(client, universe.Id, "Another");
        var chapter = await CreateChapter(client, universe.Id, story.Id, Chapter("Belongs here"));

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(ChapterPath(universe.Id, other.Id, chapter.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutAsJsonAsync(ChapterPath(universe.Id, other.Id, chapter.Id), Chapter("Moved"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(ChapterPath(universe.Id, other.Id, chapter.Id))).StatusCode);

        // A story from another universe answers as a missing one, whatever route reaches it.
        var elsewhere = await CreateUniverse(client, "World chapterotherstory two");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(ChaptersPath(elsewhere.Id, story.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PostChapter(client, elsewhere.Id, story.Id, Chapter("Smuggled"))).StatusCode);

        Assert.Equal(["Belongs here"], (await ListChapters(client, universe.Id, story.Id)).Select(candidate => candidate.Title));
        Assert.Empty(await ListChapters(client, universe.Id, other.Id));
    }

    [Fact]
    public async Task Someone_else_cannot_list_read_create_change_reorder_or_delete_a_chapter()
    {
        var (owner, universe, story) = await WithStory("chaptermine");
        var a = await CreateChapter(owner, universe.Id, story.Id, Chapter("A"));
        var b = await CreateChapter(owner, universe.Id, story.Id, Chapter("B"));

        var stranger = await SignedInClient("user-chapteryours");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(ChaptersPath(universe.Id, story.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(ChapterPath(universe.Id, story.Id, a.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PostChapter(stranger, universe.Id, story.Id, Chapter("Intruder"))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.PutAsJsonAsync(ChapterPath(universe.Id, story.Id, a.Id), Chapter("Mine now"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ReorderChapters(stranger, universe.Id, story.Id, b.Id, a.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync(ChapterPath(universe.Id, story.Id, a.Id))).StatusCode);

        Assert.Equal(["A", "B"], (await ListChapters(owner, universe.Id, story.Id)).Select(chapter => chapter.Title));
    }

    // ---------- Helpers ----------

    private static ChapterRequest Chapter(string title) => new(title, null, null);

    private static string StoryPath(Guid universeId, Guid storyId) => $"/api/universes/{universeId}/stories/{storyId}";

    private static string ChaptersPath(Guid universeId, Guid storyId) => $"{StoryPath(universeId, storyId)}/chapters";

    private static string ChapterPath(Guid universeId, Guid storyId, Guid chapterId) => $"{ChaptersPath(universeId, storyId)}/{chapterId}";

    private static string ScenesPath(Guid universeId, Guid storyId) => $"{StoryPath(universeId, storyId)}/scenes";

    private static Task<HttpResponseMessage> PostChapter(HttpClient client, Guid universeId, Guid storyId, ChapterRequest request) =>
        client.PostAsJsonAsync(ChaptersPath(universeId, storyId), request);

    private static async Task<ChapterResponse> CreateChapter(HttpClient client, Guid universeId, Guid storyId, ChapterRequest request)
    {
        var response = await PostChapter(client, universeId, storyId, request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ChapterResponse>())!;
    }

    private static async Task<List<ChapterResponse>> ListChapters(HttpClient client, Guid universeId, Guid storyId) =>
        (await client.GetFromJsonAsync<List<ChapterResponse>>(ChaptersPath(universeId, storyId)))!;

    private static Task<HttpResponseMessage> ReorderChapters(HttpClient client, Guid universeId, Guid storyId, params Guid[] chapterIds) =>
        client.PutAsJsonAsync($"{ChaptersPath(universeId, storyId)}/order", new ChapterOrderRequest(chapterIds));

    private static async Task<SceneResponse> Create(HttpClient client, Guid universeId, Guid storyId, SceneRequest request)
    {
        var response = await client.PostAsJsonAsync(ScenesPath(universeId, storyId), request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SceneResponse>())!;
    }

    private static Task<SceneResponse> CreateScene(HttpClient client, Guid universeId, Guid storyId, string title, Guid? chapterId) =>
        Create(client, universeId, storyId, new SceneRequest(title, null, null, null, null, null, chapterId));

    private static async Task<StoryDetail> Detail(HttpClient client, Guid universeId, Guid storyId) =>
        (await client.GetFromJsonAsync<StoryDetail>(StoryPath(universeId, storyId)))!;

    /// <summary>Everything a scene holds, other than where it is told, is exactly as it was.</summary>
    private static void AssertSameScene(SceneResponse expected, SceneResponse actual)
    {
        Assert.Equal(expected.Id, actual.Id);
        Assert.Equal(expected.StoryId, actual.StoryId);
        Assert.Equal(expected.Title, actual.Title);
        Assert.Equal(expected.Summary, actual.Summary);
        Assert.Equal(expected.Notes, actual.Notes);
        Assert.Equal(expected.Pov?.EntityId, actual.Pov?.EntityId);
        Assert.Equal(expected.Chronology, actual.Chronology);
        Assert.Equal(expected.Entities.Select(entity => entity.EntityId), actual.Entities.Select(entity => entity.EntityId));
        Assert.Equal(expected.CreatedAt, actual.CreatedAt);
        Assert.Equal(expected.UpdatedAt, actual.UpdatedAt);
    }

    private static async Task AssertRefused(HttpResponseMessage response, string key)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains($"\"{key}\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    private static async Task<StoryDetail> CreateStory(HttpClient client, Guid universeId, string title)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/stories",
            new StoryRequest(title, null, StoryStatus.Planning));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<StoryDetail>())!;
    }

    private static async Task<EntityDetail> CreateEntity(HttpClient client, Guid universeId, string name)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
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
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
    }

    private async Task WithDb(Func<LorEvolveDbContext, Task> work)
    {
        using var scope = _factory.Services.CreateScope();
        await work(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>());
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
