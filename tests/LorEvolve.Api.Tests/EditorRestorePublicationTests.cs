using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Trash;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.ManuscriptTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// An Editor may restore from the Trash, never publish (ADR 0041 amendment, the 030 correction). So whatever the owner
/// had selected for publication comes back private when an Editor restores it - decided on the server from the caller's
/// role, whatever the request says. Entries, stories, scenes (outline and manuscript) and arcs carry a selection of their
/// own; a restored story hides everything in it while it is private. The owner's restore keeps the selection, as before.
/// </summary>
public sealed class EditorRestorePublicationTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task An_entry_restored_by_an_editor_comes_back_private_and_by_the_owner_comes_back_as_it_was()
    {
        var p = await PublicWorld("restore-entry");
        var anonymous = PublishingTestClient.Anonymous(_factory);

        var editorsOne = await PublishedEntry(p, "Tidewarden");
        var ownersOne = await PublishedEntry(p, "Saltmother");
        var privateOne = await CreateEntity(p.Owner, p.U, "Quiet Heir");
        Assert.Equal(2, (await Lore(anonymous, p.Slug)).Count);

        foreach (var id in new[] { editorsOne.Id, ownersOne.Id, privateOne })
        {
            await Ok(p.Owner.DeleteAsync($"/api/universes/{p.U}/entities/{id}"));
        }

        Assert.Empty(await Lore(anonymous, p.Slug));

        // The Editor restores. A body asking for anything is ignored: the restore takes none.
        await Ok(p.Editor.PostAsJsonAsync($"/api/universes/{p.U}/trash/{editorsOne.Id}/restore", new { visibility = 1 }));
        await Ok(p.Editor.PostAsync($"/api/universes/{p.U}/trash/{privateOne}/restore", null));
        await Ok(p.Owner.PostAsync($"/api/universes/{p.U}/trash/{ownersOne.Id}/restore", null));

        await WithDb(_factory, async db =>
        {
            var editors = await db.Entities.SingleAsync(row => row.Id == editorsOne.Id);
            Assert.Null(editors.DeletedAt);
            Assert.Equal(ContentVisibility.Private, editors.Visibility);
            Assert.Equal(editorsOne.Slug, editors.PublicSlug);
            Assert.NotNull(editors.PublishedAt);

            var quiet = await db.Entities.SingleAsync(row => row.Id == privateOne);
            Assert.Null(quiet.DeletedAt);
            Assert.Equal(ContentVisibility.Private, quiet.Visibility);

            Assert.Equal(ContentVisibility.Public, (await db.Entities.SingleAsync(row => row.Id == ownersOne.Id)).Visibility);
        });

        // Anonymous readers see only the owner's restore; the Editor's waits for the owner.
        Assert.Equal(["Saltmother"], [.. (await Lore(anonymous, p.Slug)).Select(entry => entry.Name)]);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{PublishingTestClient.PublicRoute}/{p.Slug}/lore/{editorsOne.Slug}")).StatusCode);
        await AssertDenied(await p.Editor.PostAsync($"/api/universes/{p.U}/entities/{editorsOne.Id}/publish", null), "editor publish");

        await Ok(p.Owner.PostAsync($"/api/universes/{p.U}/entities/{editorsOne.Id}/publish", null));
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"{PublishingTestClient.PublicRoute}/{p.Slug}/lore/{editorsOne.Slug}")).StatusCode);
    }

    [Fact]
    public async Task A_story_restored_by_an_editor_hides_everything_in_it_and_restored_parts_come_back_private()
    {
        var p = await PublicWorld("restore-story");
        var anonymous = PublishingTestClient.Anonymous(_factory);

        var (story, storySlug, scene, arc) = await PublishedStory(p, "The Long Tide", "Low Water", "Inheritance");
        var page = $"{PublishingTestClient.PublicRoute}/{p.Slug}/stories/{storySlug}";
        var shown = await anonymous.GetStringAsync(page);
        Assert.Contains("Low Water", shown, StringComparison.Ordinal);
        Assert.Contains("She walked into the sea.", shown, StringComparison.Ordinal);
        Assert.Contains("Inheritance", shown, StringComparison.Ordinal);

        // A part trashed and restored by the Editor, inside a story that stays public: back, private, not read publicly.
        await Ok(p.Owner.DeleteAsync($"{Story(p.U, story)}/scenes/{scene}"));
        await Ok(p.Owner.DeleteAsync(Arc(p.U, story, arc)));
        await Ok(p.Editor.PostAsync($"/api/universes/{p.U}/trash/scenes/{scene}/restore", null));
        await Ok(p.Editor.PostAsync($"/api/universes/{p.U}/trash/plot-arcs/{arc}/restore", null));

        await WithDb(_factory, async db =>
        {
            var row = await db.Scenes.SingleAsync(candidate => candidate.Id == scene);
            Assert.Null(row.DeletedAt);
            Assert.Equal(ContentVisibility.Private, row.Visibility);
            Assert.Equal(ContentVisibility.Private, row.ManuscriptVisibility);
            Assert.Equal(ContentVisibility.Private, (await db.PlotArcs.SingleAsync(candidate => candidate.Id == arc)).Visibility);
        });

        var afterParts = await anonymous.GetStringAsync(page);
        Assert.DoesNotContain("Low Water", afterParts, StringComparison.Ordinal);
        Assert.DoesNotContain("She walked into the sea.", afterParts, StringComparison.Ordinal);
        Assert.DoesNotContain("Inheritance", afterParts, StringComparison.Ordinal);

        // The owner selects them again; then the whole story goes to the Trash, and the Editor brings it back.
        await Ok(p.Owner.PostAsync($"{Story(p.U, story)}/scenes/{scene}/publish", null));
        await Ok(p.Owner.PostAsync($"{Story(p.U, story)}/scenes/{scene}/manuscript/publish", null));
        await Ok(p.Owner.PostAsync($"{Arc(p.U, story, arc)}/publish", null));
        await Ok(p.Owner.DeleteAsync(Story(p.U, story)));
        await Ok(p.Editor.PostAsync($"/api/universes/{p.U}/trash/stories/{story}/restore", null));

        await WithDb(_factory, async db =>
            Assert.Equal(ContentVisibility.Private, (await db.Stories.SingleAsync(candidate => candidate.Id == story)).Visibility));

        // A private story hides its story page and every part in it, whatever the parts still have selected.
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(page)).StatusCode);
        Assert.DoesNotContain("The Long Tide", await anonymous.GetStringAsync($"{PublishingTestClient.PublicRoute}/{p.Slug}/stories"), StringComparison.Ordinal);

        // Only the owner's publish brings it back.
        await AssertDenied(await p.Editor.PostAsync($"{Story(p.U, story)}/publish", null), "editor story publish");
        await Ok(p.Owner.PostAsync($"{Story(p.U, story)}/publish", null));
        Assert.Contains("Low Water", await anonymous.GetStringAsync(page), StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_owners_restore_keeps_every_selection_as_it_was()
    {
        var p = await PublicWorld("restore-owner");
        var anonymous = PublishingTestClient.Anonymous(_factory);
        var (story, storySlug, scene, arc) = await PublishedStory(p, "Owner Tide", "Owner Scene", "Owner Arc");
        var page = $"{PublishingTestClient.PublicRoute}/{p.Slug}/stories/{storySlug}";

        await Ok(p.Owner.DeleteAsync($"{Story(p.U, story)}/scenes/{scene}"));
        await Ok(p.Owner.DeleteAsync(Arc(p.U, story, arc)));
        await Ok(p.Owner.PostAsync($"/api/universes/{p.U}/trash/scenes/{scene}/restore", null));
        await Ok(p.Owner.PostAsync($"/api/universes/{p.U}/trash/plot-arcs/{arc}/restore", null));
        await Ok(p.Owner.DeleteAsync(Story(p.U, story)));
        await Ok(p.Owner.PostAsync($"/api/universes/{p.U}/trash/stories/{story}/restore", null));

        var shown = await anonymous.GetStringAsync(page);
        Assert.Contains("Owner Scene", shown, StringComparison.Ordinal);
        Assert.Contains("She walked into the sea.", shown, StringComparison.Ordinal);
        Assert.Contains("Owner Arc", shown, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Editors_keep_restore_readers_have_no_trash_and_erasing_stays_the_owners()
    {
        var p = await PublicWorld("restore-roles");
        var entry = await CreateEntity(p.Owner, p.U, "Binned");
        await Ok(p.Owner.DeleteAsync($"/api/universes/{p.U}/entities/{entry}"));

        foreach (var reader in new[] { p.World.Reviewer, p.World.Viewer })
        {
            await AssertDenied(await reader.GetAsync($"/api/universes/{p.U}/trash"), "trash list");
            await AssertDenied(await reader.PostAsync($"/api/universes/{p.U}/trash/{entry}/restore", null), "restore");
        }

        await AssertDenied(await p.Editor.DeleteAsync($"/api/universes/{p.U}/trash/{entry}"), "erase");
        await Ok(p.Editor.PostAsync($"/api/universes/{p.U}/trash/{entry}/restore", null));
        await Ok(p.Owner.DeleteAsync($"/api/universes/{p.U}/entities/{entry}"));
        await Ok(p.Owner.DeleteAsync($"/api/universes/{p.U}/trash/{entry}"));
    }

    // ---------- A public world with an Editor ----------

    private sealed record Public(SharedWorld World, string Slug)
    {
        public Guid U => World.U;

        public HttpClient Owner => World.Owner;

        public HttpClient Editor => World.Editor;
    }

    /// <summary>A shared world made publishable and published, with its Editor, Reviewer and Viewer.</summary>
    private async Task<Public> PublicWorld(string tag)
    {
        var w = await NewSharedWorld(_factory, tag);
        await PublishingTestClient.SavedDetails(w.Owner, w.U, "A drowned coast.", UniverseCategory.Books, UniverseGenres.Fantasy);
        await PublishingTestClient.UploadedArtwork(w.Owner, w.U, PublishingTestClient.Png(1600, 1000));
        (await PublishingTestClient.SetPublicName(w.Owner, $"Author {tag}")).EnsureSuccessStatusCode();
        var published = await PublishingTestClient.Published(w.Owner, w.U);
        return new Public(w, published.PublicSlug!);
    }

    private static async Task<(Guid Id, string Slug)> PublishedEntry(Public p, string name)
    {
        var id = await CreateEntity(p.Owner, p.U, name);
        var state = await (await p.Owner.PostAsync($"/api/universes/{p.U}/entities/{id}/publish", null))
            .Content.ReadFromJsonAsync<ContentPublicationState>();
        return (id, state!.PublicSlug!);
    }

    private static async Task<(Guid Story, string Slug, Guid Scene, Guid Arc)> PublishedStory(Public p, string title, string sceneTitle, string arcTitle)
    {
        var story = await CreateStory(p.Owner, p.U, title);
        var scene = await CreateScene(p.Owner, p.U, story, sceneTitle);
        await WriteManuscript(p.Owner, p.U, story, scene, "She walked into the sea.");
        var arc = (await CreateArc(p.Owner, p.U, story, arcTitle)).Id;
        await Ok(p.Owner.PutAsJsonAsync($"{Story(p.U, story)}/publication", new StoryPublicationRequest("A tale of the tide.")));
        var state = await (await p.Owner.PostAsync($"{Story(p.U, story)}/publish", null)).Content.ReadFromJsonAsync<ContentPublicationState>();
        await Ok(p.Owner.PostAsync($"{Story(p.U, story)}/scenes/{scene}/publish", null));
        await Ok(p.Owner.PostAsync($"{Story(p.U, story)}/scenes/{scene}/manuscript/publish", null));
        await Ok(p.Owner.PostAsync($"{Arc(p.U, story, arc)}/publish", null));
        return (story, state!.PublicSlug!, scene, arc);
    }

    private static async Task<List<PublicLoreEntry>> Lore(HttpClient anonymous, string slug)
    {
        var response = await anonymous.GetAsync($"{PublishingTestClient.PublicRoute}/{slug}/lore");
        response.EnsureSuccessStatusCode();
        return [.. (await response.Content.ReadFromJsonAsync<PublicContentPage<PublicLoreEntry>>())!.Items];
    }
}
