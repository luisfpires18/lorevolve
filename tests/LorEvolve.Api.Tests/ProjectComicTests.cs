using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A comic's four levels (#147): volumes and chapters, which are the structure a series and a film already share, and
/// pages and panels, which only a comic has.
///
/// <para>Written against the three things the issue asks to be true and one it asks to stay true. <b>Order persists</b>
/// across four levels, so the places have to be right after a move and after a delete at every one. <b>Templates</b>
/// are three forms chosen by the project's subtype, and customisable afterwards because what they write are ordinary
/// types. <b>Links resolve with scoped authorization</b>: a panel names a lore entry of its own universe and nothing
/// else, and a stranger reaches none of it. And <b>the existing media handling is unchanged</b>, which this PR keeps by
/// not touching it: a panel references an entry whose picture the Media feature already serves.</para>
/// </summary>
public sealed class ProjectComicTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_comic_holds_volumes_chapters_pages_and_panels_in_order()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicorder");
        var comic = await NewComic(client, universe.Id, subtype: null);

        var volume = await NewVolume(client, comic.Id, "Volume 1");
        var chapter = await NewChapter(client, comic.Id, volume.Id, "The tide goes out");

        var first = await NewPage(client, comic.Id, volume.Id, chapter.Id, "1");
        var second = await NewPage(client, comic.Id, volume.Id, chapter.Id, "2");
        var third = await NewPage(client, comic.Id, volume.Id, chapter.Id, "3");

        Assert.Equal([0, 1, 2], (await Pages(client, comic.Id, volume.Id, chapter.Id)).Select(page => page.SortOrder));

        // A page moved to the front, and the places follow rather than leaving a gap or a tie.
        await Post(client, $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{third.Id}/move", new ProjectMoveRequest(0));

        var moved = await Pages(client, comic.Id, volume.Id, chapter.Id);
        Assert.Equal(["3", "1", "2"], moved.Select(page => page.Name));
        Assert.Equal([0, 1, 2], moved.Select(page => page.SortOrder));

        // Panels on a page, ordered the same way.
        var panels = new List<ProjectPanelResponse>();
        foreach (var line in new[] { "Wide on the saltflats", "Alenna's hand", "The knife" })
        {
            panels.Add(await NewPanel(client, comic.Id, volume.Id, chapter.Id, first.Id, line));
        }

        Assert.Equal([0, 1, 2], (await PanelsOf(client, comic.Id, volume.Id, chapter.Id, first.Id)).Select(panel => panel.SortOrder));

        await Post(
            client,
            $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{first.Id}/panels/{panels[2].Id}/move",
            new ProjectPanelMoveRequest(0));

        var reordered = await PanelsOf(client, comic.Id, volume.Id, chapter.Id, first.Id);
        Assert.Equal(["The knife", "Wide on the saltflats", "Alenna's hand"], reordered.Select(panel => panel.Description));
        Assert.Equal([0, 1, 2], reordered.Select(panel => panel.SortOrder));

        // A panel moved to another page of the same chapter closes up the page it left.
        await Post(
            client,
            $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{first.Id}/panels/{panels[0].Id}/move",
            new ProjectPanelMoveRequest(0, second.Id));

        Assert.Equal([0, 1], (await PanelsOf(client, comic.Id, volume.Id, chapter.Id, first.Id)).Select(panel => panel.SortOrder));
        Assert.Equal(
            ["Wide on the saltflats"],
            (await PanelsOf(client, comic.Id, volume.Id, chapter.Id, second.Id)).Select(panel => panel.Description));

        // Deleting a panel closes the places up behind it, at the deepest level too.
        await Delete(client, $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{first.Id}/panels/{panels[2].Id}");
        Assert.Equal([0], (await PanelsOf(client, comic.Id, volume.Id, chapter.Id, first.Id)).Select(panel => panel.SortOrder));
    }

    [Fact]
    public async Task Comic_manga_and_webtoon_are_three_templates_chosen_by_the_subtype()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comictemplates");

        var plain = await NewComic(client, universe.Id, subtype: null);
        var manga = await NewComic(client, universe.Id, subtype: "manga");
        var webtoon = await NewComic(client, universe.Id, subtype: "  WEBTOON  ");
        var novel = await NewComic(client, universe.Id, subtype: "graphic novel");

        Assert.Equal("Comic", (await Template(client, plain.Id)).Name);
        Assert.Equal("Manga", (await Template(client, manga.Id)).Name);

        // Matched loosely and trimmed, because the subtype is free text an author typed.
        Assert.Equal("Webtoon", (await Template(client, webtoon.Id)).Name);

        // Anything unrecognised starts somewhere rather than nowhere.
        Assert.Equal("Comic", (await Template(client, novel.Id)).Name);

        // The published unit is the form's own word, and a manga's character carries a first appearance.
        Assert.Equal(["Character", "Location", "Issue"], (await Template(client, plain.Id)).Types);
        Assert.Equal(["Character", "Location", "Chapter"], (await Template(client, manga.Id)).Types);
        Assert.Equal(["Character", "Location", "Episode"], (await Template(client, webtoon.Id)).Types);

        var applied = await Apply(client, manga.Id);
        var character = applied.First(type => type.Name == "Character");
        Assert.Contains("First appears in", character.Fields.Select(field => field.Name));

        // And they are ordinary types once written: renamed, deleted, added to.
        var renamed = await Put<ProjectEntityTypeResponse>(
            client,
            $"/api/projects/{manga.Id}/entity-types/{character.Id}",
            new ProjectEntityTypeRequest("Cast member", null, null, null));

        Assert.Equal("Cast member", renamed.Name);
    }

    [Fact]
    public async Task A_panel_shows_a_lore_entry_of_its_own_universe_and_nothing_else()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comiclinks");
        var comic = await NewComic(client, universe.Id, subtype: null);
        var volume = await NewVolume(client, comic.Id, "Volume 1");
        var chapter = await NewChapter(client, comic.Id, volume.Id, "The tide goes out");
        var page = await NewPage(client, comic.Id, volume.Id, chapter.Id, "1");

        var loreId = await CreateEntity(client, universe.Id, "Alenna Vance");

        var shown = await NewPanel(client, comic.Id, volume.Id, chapter.Id, page.Id, "Alenna, close", loreId);
        Assert.Equal(loreId, shown.CanonEntityId);

        // The listing resolves the name through the existing entry, which is how a panel reaches its art: the Media
        // feature serves that entry's picture on its own route, and nothing here uploads anything.
        var listed = (await PanelsOf(client, comic.Id, volume.Id, chapter.Id, page.Id)).Single();
        Assert.Equal("Alenna Vance", listed.CanonEntityName);

        // Anything that is not a live lore entry of this universe is refused by field.
        var refused = await client.PostAsJsonAsync(
            $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{page.Id}/panels",
            new ProjectPanelRequest("Impossible", null, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);

        // A project's own entry is not a candidate either: a panel showing one project's entry inside another's work
        // is exactly what the scoping is for.
        var type = await NewType(client, comic.Id, "Prop");
        var entry = await NewProjectEntry(client, comic.Id, type.Id, "The salt knife");

        var crossed = await client.PostAsJsonAsync(
            $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{page.Id}/panels",
            new ProjectPanelRequest("Also impossible", null, entry));
        Assert.Equal(HttpStatusCode.BadRequest, crossed.StatusCode);
    }

    [Fact]
    public async Task A_page_that_still_holds_panels_is_not_deleted_and_a_full_page_takes_no_more()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicrefusals");
        var comic = await NewComic(client, universe.Id, subtype: null);
        var volume = await NewVolume(client, comic.Id, "Volume 1");
        var chapter = await NewChapter(client, comic.Id, volume.Id, "The tide goes out");
        var page = await NewPage(client, comic.Id, volume.Id, chapter.Id, "1");
        var full = await NewPage(client, comic.Id, volume.Id, chapter.Id, "2");
        var panel = await NewPanel(client, comic.Id, volume.Id, chapter.Id, page.Id, "Wide on the saltflats");

        var refused = await client.DeleteAsync($"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{page.Id}");
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(2, (await Pages(client, comic.Id, volume.Id, chapter.Id)).Count);

        // A page filled to its limit takes no more, by a create or by a move: the lesson #145's review taught about
        // episodes, applied here before a review had to ask.
        await WithDb(_factory, async db =>
        {
            var now = DateTime.UtcNow;
            for (var index = 0; index < ComicLimits.MaxPanelsPerPage; index++)
            {
                db.ProjectPanels.Add(new ProjectPanel
                {
                    Id = Guid.NewGuid(),
                    PageId = full.Id,
                    Description = $"Panel {index}",
                    SortOrder = index,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }

            await db.SaveChangesAsync();
        });

        var created = await client.PostAsJsonAsync(
            $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{full.Id}/panels",
            new ProjectPanelRequest("One too many", null));
        Assert.Equal(HttpStatusCode.BadRequest, created.StatusCode);

        var moved = await client.PostAsJsonAsync(
            $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{page.Id}/panels/{panel.Id}/move",
            new ProjectPanelMoveRequest(0, full.Id));
        Assert.Equal(HttpStatusCode.BadRequest, moved.StatusCode);

        // The panel stayed where it was.
        Assert.Single(await PanelsOf(client, comic.Id, volume.Id, chapter.Id, page.Id));

        // Emptied, the page goes.
        await Delete(client, $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{page.Id}/panels/{panel.Id}");
        await Delete(client, $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{page.Id}");
        Assert.Single(await Pages(client, comic.Id, volume.Id, chapter.Id));
    }

    [Fact]
    public async Task A_chapter_of_another_project_or_another_kind_has_no_pages_and_a_stranger_reaches_none()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicaccess");
        var comic = await NewComic(client, universe.Id, subtype: null);
        var volume = await NewVolume(client, comic.Id, "Volume 1");
        var chapter = await NewChapter(client, comic.Id, volume.Id, "The tide goes out");
        var page = await NewPage(client, comic.Id, volume.Id, chapter.Id, "1");

        // Another comic of the same account: its path does not reach this chapter.
        var other = await NewComic(client, universe.Id, subtype: null);
        var otherVolume = await NewVolume(client, other.Id, "Volume 1");

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"{Chapter(other.Id, otherVolume.Id, chapter.Id)}/pages")).StatusCode);

        // A Game has no such structure at all, so it has no pages either.
        var game = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest("Hollow Season", ProjectKind.Game, ProjectLifecycle.Active, null, null, universe.Id, null));
        game.EnsureSuccessStatusCode();
        var gameId = (await game.Content.ReadFromJsonAsync<ProjectDetail>())!.Id;

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"{Chapter(gameId, volume.Id, chapter.Id)}/pages")).StatusCode);

        // And a stranger is told nothing at any level.
        var stranger = await SignedIn(_factory, "comicstranger");

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.GetAsync($"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.PostAsJsonAsync(
                $"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages",
                new ProjectPageRequest("Theirs", null))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.DeleteAsync($"{Chapter(comic.Id, volume.Id, chapter.Id)}/pages/{page.Id}")).StatusCode);
    }

    [Fact]
    public async Task A_comic_s_pages_and_panels_come_back_from_a_restore_in_order()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "comicbackup");
        var comic = await NewComic(client, universe.Id, subtype: "manga");
        var volume = await NewVolume(client, comic.Id, "Volume 1");
        var chapter = await NewChapter(client, comic.Id, volume.Id, "The tide goes out");
        var page = await NewPage(client, comic.Id, volume.Id, chapter.Id, "1");

        var loreId = await CreateEntity(client, universe.Id, "Alenna Vance");
        await NewPanel(client, comic.Id, volume.Id, chapter.Id, page.Id, "Wide on the saltflats");
        await NewPanel(client, comic.Id, volume.Id, chapter.Id, page.Id, "Alenna, close", loreId);

        var restored = await RestoreArchive(client, await RawArchive(client, universe.Id), "Comic restored");

        await WithDb(_factory, async db =>
        {
            var copiedProject = await db.CreativeProjects.AsNoTracking()
                .SingleAsync(each => each.UniverseId == restored.Id);

            var copiedPage = await db.ProjectPages.AsNoTracking()
                .Include(each => each.Panels)
                .SingleAsync(each => each.Episode!.Season!.ProjectId == copiedProject.Id);

            Assert.Equal("1", copiedPage.Name);
            Assert.NotEqual(page.Id, copiedPage.Id);

            var panels = copiedPage.Panels.OrderBy(each => each.SortOrder).ToList();
            Assert.Equal(["Wide on the saltflats", "Alenna, close"], panels.Select(each => each.Description));
            Assert.Equal([0, 1], panels.Select(each => each.SortOrder));

            // The panel's lore link points at the restored entry, not the one in the file.
            var canon = await db.Entities.AsNoTracking().SingleAsync(each => each.Id == panels[1].CanonEntityId!.Value);
            Assert.Equal("Alenna Vance", canon.Name);
            Assert.Equal(restored.Id, canon.UniverseId);
            Assert.NotEqual(loreId, canon.Id);
        });
    }

    // ---------- helpers ----------

    private static string Chapter(Guid projectId, Guid volumeId, Guid chapterId) =>
        $"/api/projects/{projectId}/seasons/{volumeId}/episodes/{chapterId}";

    private static async Task<ProjectDetail> NewComic(HttpClient client, Guid universeId, string? subtype)
    {
        var response = await client.PostAsJsonAsync(
            "/api/projects",
            new ProjectRequest("Low Tide", ProjectKind.Comic, ProjectLifecycle.Active, subtype, null, universeId, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }

    private static async Task<ProjectSeasonResponse> NewVolume(HttpClient client, Guid projectId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/projects/{projectId}/seasons",
            new ProjectSeasonRequest(name, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectSeasonResponse>())!;
    }

    private static async Task<ProjectEpisodeDetail> NewChapter(
        HttpClient client,
        Guid projectId,
        Guid volumeId,
        string title)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/projects/{projectId}/seasons/{volumeId}/episodes",
            new ProjectEpisodeRequest(title, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectEpisodeDetail>())!;
    }

    private static async Task<ProjectPageResponse> NewPage(
        HttpClient client,
        Guid projectId,
        Guid volumeId,
        Guid chapterId,
        string name)
    {
        var response = await client.PostAsJsonAsync(
            $"{Chapter(projectId, volumeId, chapterId)}/pages",
            new ProjectPageRequest(name, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectPageResponse>())!;
    }

    private static async Task<ProjectPanelResponse> NewPanel(
        HttpClient client,
        Guid projectId,
        Guid volumeId,
        Guid chapterId,
        Guid pageId,
        string description,
        Guid? canonEntityId = null)
    {
        var response = await client.PostAsJsonAsync(
            $"{Chapter(projectId, volumeId, chapterId)}/pages/{pageId}/panels",
            new ProjectPanelRequest(description, null, canonEntityId));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectPanelResponse>())!;
    }

    private static async Task<List<ProjectPageResponse>> Pages(
        HttpClient client,
        Guid projectId,
        Guid volumeId,
        Guid chapterId) =>
        (await client.GetFromJsonAsync<List<ProjectPageResponse>>($"{Chapter(projectId, volumeId, chapterId)}/pages"))!;

    private static async Task<List<ProjectPanelResponse>> PanelsOf(
        HttpClient client,
        Guid projectId,
        Guid volumeId,
        Guid chapterId,
        Guid pageId) =>
        [.. (await Pages(client, projectId, volumeId, chapterId)).First(page => page.Id == pageId).Panels];

    private static async Task<ProjectTemplateResponse> Template(HttpClient client, Guid projectId) =>
        (await client.GetFromJsonAsync<ProjectTemplateResponse>($"/api/projects/{projectId}/template"))!;

    private static async Task<List<ProjectEntityTypeResponse>> Apply(HttpClient client, Guid projectId)
    {
        var response = await client.PostAsync($"/api/projects/{projectId}/template", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<List<ProjectEntityTypeResponse>>())!;
    }

    private static async Task<ProjectEntityTypeResponse> NewType(HttpClient client, Guid projectId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/projects/{projectId}/entity-types",
            new ProjectEntityTypeRequest(name, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectEntityTypeResponse>())!;
    }

    private static async Task<Guid> NewProjectEntry(HttpClient client, Guid projectId, Guid typeId, string name)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/projects/{projectId}/entities",
            new ProjectEntityRequest(typeId, name, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!.Id;
    }

    private static async Task Post(HttpClient client, string path, object request) =>
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
