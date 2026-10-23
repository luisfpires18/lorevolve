using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Stories;
using static Lorex.Api.Tests.PublishingTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Publishing single lore entries and stories inside a universe, and the privacy boundary around them (ADR 0036,
/// Task 010).
///
/// The claims this file carries. Every entry and story is private until its owner publishes it, and publishing the
/// universe publishes none of them. An item is read publicly only while it and its universe are both public and it is
/// out of the Trash - four combinations, one of them visible - and every transition of either level takes effect at
/// the next read, without clearing what was selected. The public listings and the thumbnail are allow-lists that
/// carry nothing of the workspace. Only the owner can publish, and no save, create or restore can.
/// </summary>
public sealed class ContentPublicationTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private static readonly string[] LoreKeys = ["name", "publishedAt", "slug", "summary", "thumbnailUrl", "typeName"];
    private static readonly string[] StoryKeys = ["publicSummary", "publishedAt", "slug", "title"];
    private static readonly string[] PageKeys = ["items", "page", "pageSize", "totalCount", "totalPages"];

    private readonly LorexApiFactory _factory = factory;

    // ---------- Private by default ----------

    [Fact]
    public async Task Publishing_a_universe_publishes_none_of_its_entries_or_stories()
    {
        var (owner, _) = await Account(_factory, "cp-default");
        var universe = await Ready(owner, "Cp default world");
        var entry = await Entry(owner, universe.Id, "Unselected heir", "Walks the drowned coast.");
        var story = await PlotTestClient.CreateStory(owner, universe.Id, "Unselected tale");
        var slug = (await Published(owner, universe.Id)).PublicSlug!;
        var anonymous = Anonymous(_factory);

        var entryState = await EntryState(owner, universe.Id, entry);
        Assert.Equal(ContentVisibility.Private, entryState.Visibility);
        Assert.Null(entryState.PublicSlug);
        Assert.Null(entryState.PublishedAt);
        Assert.True(entryState.UniverseIsPublic);

        var storyState = await StoryState(owner, universe.Id, story);
        Assert.Equal(ContentVisibility.Private, storyState.Visibility);
        Assert.Null(storyState.PublicSlug);

        Assert.Empty((await Lore(anonymous, slug)).Items);
        Assert.Empty((await Stories(anonymous, slug)).Items);
    }

    // ---------- Both levels ----------

    [Fact]
    public async Task An_entry_is_public_only_while_it_and_its_universe_both_are_and_keeps_its_selection_and_address()
    {
        var (owner, _) = await Account(_factory, "cp-lore-matrix");
        var universe = await Ready(owner, "Cp lore matrix");
        var entry = await Entry(owner, universe.Id, "Tidewarden", "Keeper of the count.");
        var anonymous = Anonymous(_factory);
        const string worldSlug = "cp-lore-matrix";

        // Universe private, entry private: no universe to list anything in.
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(LoreRoute(worldSlug))).StatusCode);

        // Universe private, entry selected: prepared, not visible, and said so.
        var selected = await PublishEntry(owner, universe.Id, entry);
        Assert.Equal(ContentVisibility.Public, selected.Visibility);
        Assert.False(selected.UniverseIsPublic);
        Assert.Equal("tidewarden", selected.PublicSlug);
        Assert.NotNull(selected.PublishedAt);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(LoreRoute(worldSlug))).StatusCode);

        // Both public: listed.
        await Published(owner, universe.Id);
        Assert.True((await EntryState(owner, universe.Id, entry)).UniverseIsPublic);
        Assert.Equal("Tidewarden", Assert.Single((await Lore(anonymous, worldSlug)).Items).Name);

        // The universe goes private: gone at the next read, and the entry is still selected.
        (await Unpublish(owner, universe.Id)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(LoreRoute(worldSlug))).StatusCode);
        var kept = await EntryState(owner, universe.Id, entry);
        Assert.Equal(ContentVisibility.Public, kept.Visibility);
        Assert.False(kept.UniverseIsPublic);

        // Republished: exactly the selected entry comes back, at the same address.
        await Published(owner, universe.Id);
        Assert.Equal("tidewarden", Assert.Single((await Lore(anonymous, worldSlug)).Items).Slug);

        // Universe public, entry private: not listed, the page itself empty.
        var unpublished = await UnpublishEntry(owner, universe.Id, entry);
        Assert.Equal(ContentVisibility.Private, unpublished.Visibility);
        Assert.Equal("tidewarden", unpublished.PublicSlug);
        Assert.Equal(selected.PublishedAt, unpublished.PublishedAt);
        Assert.Empty((await Lore(anonymous, worldSlug)).Items);

        // Selected again: the same address and first publication date, and both transitions idempotent.
        var again = await PublishEntry(owner, universe.Id, entry);
        Assert.Equal(("tidewarden", selected.PublishedAt), (again.PublicSlug, again.PublishedAt));
        Assert.Equal(again, await PublishEntry(owner, universe.Id, entry));
        Assert.Equal(selected.PublishedAt, Assert.Single((await Lore(anonymous, worldSlug)).Items).PublishedAt);
        await UnpublishEntry(owner, universe.Id, entry);
        Assert.Equal(ContentVisibility.Private, (await UnpublishEntry(owner, universe.Id, entry)).Visibility);
    }

    [Fact]
    public async Task A_story_is_public_only_while_it_and_its_universe_both_are_and_keeps_its_selection_and_address()
    {
        var (owner, _) = await Account(_factory, "cp-story-matrix");
        var universe = await Ready(owner, "Cp story matrix");
        var story = await ReadableStory(owner, universe.Id, "The Long Ebb");
        var anonymous = Anonymous(_factory);
        const string worldSlug = "cp-story-matrix";

        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(StoriesRoute(worldSlug))).StatusCode);

        var selected = await PublishStory(owner, universe.Id, story);
        Assert.Equal(ContentVisibility.Public, selected.Visibility);
        Assert.False(selected.UniverseIsPublic);
        Assert.Equal("the-long-ebb", selected.PublicSlug);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(StoriesRoute(worldSlug))).StatusCode);

        await Published(owner, universe.Id);
        Assert.Equal("The Long Ebb", Assert.Single((await Stories(anonymous, worldSlug)).Items).Title);

        (await Unpublish(owner, universe.Id)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(StoriesRoute(worldSlug))).StatusCode);
        Assert.Equal(ContentVisibility.Public, (await StoryState(owner, universe.Id, story)).Visibility);

        await Published(owner, universe.Id);
        Assert.Equal("the-long-ebb", Assert.Single((await Stories(anonymous, worldSlug)).Items).Slug);

        var unpublished = await UnpublishStory(owner, universe.Id, story);
        Assert.Equal("the-long-ebb", unpublished.PublicSlug);
        Assert.Empty((await Stories(anonymous, worldSlug)).Items);

        var again = await PublishStory(owner, universe.Id, story);
        Assert.Equal(("the-long-ebb", selected.PublishedAt), (again.PublicSlug, again.PublishedAt));
        Assert.Single((await Stories(anonymous, worldSlug)).Items);
    }

    // ---------- What anyone reads ----------

    [Fact]
    public async Task The_public_lore_listing_is_its_allow_list_and_nothing_of_the_workspace()
    {
        var (owner, userId) = await Account(_factory, "cp-lore-allow");
        var universe = await Ready(owner, "Cp lore allow");
        var u = universe.Id;
        var types = (await owner.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var heir = await CreateEntry(owner, u, new EntityRequest(
            types[0].Id, "Hidden heir", "Heir to the drowned crown.", CanonStatus.Canon, ["Secret alias"], ["secret-tag"], null));
        var rival = await Entry(owner, u, "Private rival", "Never published.");
        await ArticleTestClient.WriteArticle(owner, u, heir, ArticleTestClient.Doc("Hidden article prose."));

        var kind = await PlotTestClient.PostJson<RelationshipTypeResponse>(
            owner, $"/api/universes/{u}/relationship-types", new RelationshipTypeRequest("Sworn foe", null, true, null, null));
        await PlotTestClient.PostJson<RelationshipDetail>(
            owner, $"/api/universes/{u}/relationships", new RelationshipRequest(kind.Id, heir, rival, CanonStatus.Canon, null, null, "Relation note secret."));

        await PublishEntry(owner, u, heir);
        var world = await Published(owner, u);
        var anonymous = Anonymous(_factory);

        var body = await anonymous.GetStringAsync(LoreRoute(world.PublicSlug!));
        using (var document = JsonDocument.Parse(body))
        {
            Assert.Equal(PageKeys, Keys(document.RootElement));
            var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray().ToList());
            Assert.Equal(LoreKeys, Keys(item));
            Assert.Equal("hidden-heir", item.GetProperty("slug").GetString());
            Assert.Equal("Heir to the drowned crown.", item.GetProperty("summary").GetString());
            Assert.Equal(types[0].Name, item.GetProperty("typeName").GetString());
            Assert.Equal(JsonValueKind.Null, item.GetProperty("thumbnailUrl").ValueKind);
        }

        foreach (var secret in new[]
        {
            heir.ToString(), rival.ToString(), u.ToString(), userId, types[0].Id.ToString(), kind.Id.ToString(),
            "Private rival", "Secret alias", "secret-tag", "Hidden article prose", "Sworn foe", "Relation note secret",
            "canon", "Private notes", "user-cp-lore-allow",
        })
        {
            Assert.DoesNotContain(secret, body, StringComparison.OrdinalIgnoreCase);
        }

        // Nothing private sits under the entry's address either: no article, relationships, history or original.
        foreach (var route in new[] { "/article", "/relationships", "/revisions", "/original", "/image", "/fields" })
        {
            var response = await anonymous.GetAsync($"{LoreRoute(world.PublicSlug!)}/hidden-heir{route}");
            Assert.True(response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed, $"{route} answered {(int)response.StatusCode}");
        }
    }

    [Fact]
    public async Task The_public_story_listing_is_its_allow_list_and_nothing_of_the_story_workspace()
    {
        var (owner, userId) = await Account(_factory, "cp-story-allow");
        var universe = await Ready(owner, "Cp story allow");
        var u = universe.Id;
        var story = await PlotTestClient.PostJson<StoryDetail>(
            owner, PlotTestClient.Stories(u), new StoryRequest("Tide of Glass", "Premise secret: the narrator lies.", StoryStatus.Drafting));
        var chapter = await PlotTestClient.CreateChapter(owner, u, story.Id, "Chapter secret");
        var scene = await PlotTestClient.CreateScene(owner, u, story.Id, "Scene secret", chapter);
        await ManuscriptTestClient.WriteManuscript(owner, u, story.Id, scene, "Manuscript secret prose.");
        await PlotTestClient.CreateArc(owner, u, story.Id, "Arc secret");

        await Summarize(owner, u, story.Id, "Told for readers: a coast that keeps count.");
        await PublishStory(owner, u, story.Id);
        var world = await Published(owner, u);
        var anonymous = Anonymous(_factory);

        var body = await anonymous.GetStringAsync(StoriesRoute(world.PublicSlug!));
        using (var document = JsonDocument.Parse(body))
        {
            Assert.Equal(PageKeys, Keys(document.RootElement));
            var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray().ToList());
            Assert.Equal(StoryKeys, Keys(item));
            Assert.Equal("tide-of-glass", item.GetProperty("slug").GetString());
        }

        foreach (var secret in new[]
        {
            story.Id.ToString(), chapter.ToString(), scene.ToString(), u.ToString(), userId,
            "Premise secret", "Chapter secret", "Scene secret", "Manuscript secret", "Arc secret", "drafting", "status",
        })
        {
            Assert.DoesNotContain(secret, body, StringComparison.OrdinalIgnoreCase);
        }

        // No chapter, scene, manuscript or plot route exists publicly, published or not.
        foreach (var route in new[] { "/chapters", "/scenes", "/plot-arcs", $"/scenes/{scene}/manuscript", "/manuscript", "/plot" })
        {
            var response = await anonymous.GetAsync($"{StoriesRoute(world.PublicSlug!)}/tide-of-glass{route}");
            Assert.True(response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed, $"{route} answered {(int)response.StatusCode}");
        }

        // And the workspace's own story routes stay closed to anyone without the session.
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(PlotTestClient.Story(u, story.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(ManuscriptTestClient.Manuscript(u, story.Id, scene))).StatusCode);
    }

    [Fact]
    public async Task A_private_or_missing_universe_answers_the_same_whatever_it_holds()
    {
        var (owner, _) = await Account(_factory, "cp-enumerate");
        var universe = await Ready(owner, "Cp enumerate");
        var entry = await Entry(owner, universe.Id, "Would be listed", null);
        await PublishEntry(owner, universe.Id, entry);
        var anonymous = Anonymous(_factory);

        foreach (var kind in new[] { "lore", "stories" })
        {
            var held = await anonymous.GetAsync($"{PublicRoute}/cp-enumerate/{kind}");
            var missing = await anonymous.GetAsync($"{PublicRoute}/no-such-world-at-all/{kind}");
            var malformed = await anonymous.GetAsync($"{PublicRoute}/NOT_A_SLUG/{kind}");
            Assert.All(new[] { held, missing, malformed }, response => Assert.Equal(HttpStatusCode.NotFound, response.StatusCode));
            Assert.Equal(await missing.Content.ReadAsStringAsync(), await held.Content.ReadAsStringAsync());
        }
    }

    // ---------- The thumbnail ----------

    [Fact]
    public async Task Only_a_published_entry_in_a_public_universe_has_a_public_thumbnail_and_only_its_current_one()
    {
        var (owner, _) = await Account(_factory, "cp-thumb");
        var universe = await Ready(owner, "Cp thumb");
        var u = universe.Id;
        var entry = await Entry(owner, u, "Painted warden", null);
        var image = await UploadEntryImage(owner, u, entry, Png(640, 480));
        await PublishEntry(owner, u, entry);
        var anonymous = Anonymous(_factory);

        // Selected while the universe is private: nothing to read.
        var address = PublicContentEndpoints.ThumbnailUrl("cp-thumb", "painted-warden", image.ThumbnailId);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(address)).StatusCode);

        await Published(owner, u);
        var listed = Assert.Single((await Lore(anonymous, "cp-thumb")).Items);
        Assert.Equal(address, listed.ThumbnailUrl);

        var served = await anonymous.GetAsync(address);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/webp", served.Content.Headers.ContentType!.MediaType);
        Assert.Equal("no-cache", served.Headers.CacheControl!.ToString());
        Assert.Equal("nosniff", served.Headers.GetValues("X-Content-Type-Options").Single());
        var tag = served.Headers.ETag!;

        // Current: 304 without a body.
        Assert.Equal(HttpStatusCode.NotModified, (await Conditional(anonymous, address, tag)).StatusCode);

        // The entry made private: the same address, even revalidated, is a 404 - visibility is asked before the tag.
        await UnpublishEntry(owner, u, entry);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(address)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Conditional(anonymous, address, tag)).StatusCode);

        // The universe made private: the same.
        await PublishEntry(owner, u, entry);
        (await Unpublish(owner, u)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await Conditional(anonymous, address, tag)).StatusCode);
        await Published(owner, u);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(address)).StatusCode);

        // Replaced: the old address stops answering, the new one is listed.
        var replaced = await UploadEntryImage(owner, u, entry, Png(500, 500));
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(address)).StatusCode);
        var fresh = Assert.Single((await Lore(anonymous, "cp-thumb")).Items).ThumbnailUrl!;
        Assert.Contains(replaced.ThumbnailId.ToString(), fresh, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(fresh)).StatusCode);

        // Never the original, under any address the public API answers, and no storage key anywhere.
        var body = await anonymous.GetStringAsync(LoreRoute("cp-thumb"));
        Assert.DoesNotContain(replaced.AssetId.ToString(), body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("entities/", body, StringComparison.Ordinal);
        Assert.DoesNotContain("original", body, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{LoreRoute("cp-thumb")}/painted-warden/thumbnail/{replaced.AssetId}")).StatusCode);

        // Removed: listed without a picture, still published.
        (await owner.DeleteAsync($"/api/universes/{u}/entities/{entry}/image")).EnsureSuccessStatusCode();
        Assert.Null(Assert.Single((await Lore(anonymous, "cp-thumb")).Items).ThumbnailUrl);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(fresh)).StatusCode);
    }

    // ---------- Trash ----------

    [Fact]
    public async Task A_trashed_entry_or_story_is_never_public_and_a_restore_brings_back_its_selection()
    {
        var (owner, _) = await Account(_factory, "cp-trash");
        var universe = await Ready(owner, "Cp trash");
        var u = universe.Id;
        var entry = await Entry(owner, u, "Discarded seer", null);
        var image = await UploadEntryImage(owner, u, entry, Png(300, 300));
        var story = await ReadableStory(owner, u, "Discarded tale");
        await PublishEntry(owner, u, entry);
        await PublishStory(owner, u, story);
        await Published(owner, u);
        var anonymous = Anonymous(_factory);
        var thumbnail = PublicContentEndpoints.ThumbnailUrl("cp-trash", "discarded-seer", image.ThumbnailId);

        (await owner.DeleteAsync($"/api/universes/{u}/entities/{entry}")).EnsureSuccessStatusCode();
        (await owner.DeleteAsync(PlotTestClient.Story(u, story))).EnsureSuccessStatusCode();

        Assert.Empty((await Lore(anonymous, "cp-trash")).Items);
        Assert.Empty((await Stories(anonymous, "cp-trash")).Items);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(thumbnail)).StatusCode);

        // In the Trash it is out of reach of the publication routes too, like every other route.
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(EntryPath(u, entry, "publication"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.PostAsync(EntryPath(u, entry, "publish"), null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(StoryPath(u, story, "publication"))).StatusCode);

        // Restored, each is exactly as selected - public again, at the same address.
        (await owner.PostAsync($"/api/universes/{u}/trash/{entry}/restore", null)).EnsureSuccessStatusCode();
        (await owner.PostAsync($"/api/universes/{u}/trash/stories/{story}/restore", null)).EnsureSuccessStatusCode();

        Assert.Equal("discarded-seer", Assert.Single((await Lore(anonymous, "cp-trash")).Items).Slug);
        Assert.Equal("discarded-tale", Assert.Single((await Stories(anonymous, "cp-trash")).Items).Slug);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(thumbnail)).StatusCode);
        Assert.Equal(ContentVisibility.Public, (await EntryState(owner, u, entry)).Visibility);
    }

    [Fact]
    public async Task A_private_universe_hides_its_selected_entries_from_every_public_read_and_its_publication_counts_them()
    {
        var (owner, _) = await Account(_factory, "cp-selected-count");
        var universe = await Ready(owner, "Cp selected count");
        var u = universe.Id;
        var chosen = await Entry(owner, u, "Chosen warden", null);
        await Entry(owner, u, "Unchosen warden", null);
        var trashed = await Entry(owner, u, "Trashed warden", null);
        await PublishEntry(owner, u, chosen);
        await PublishEntry(owner, u, trashed);
        (await owner.DeleteAsync($"/api/universes/{u}/entities/{trashed}")).EnsureSuccessStatusCode();

        // What publishing the universe would show (Issue #47): the live selected entry only, read before and after.
        Assert.Equal(1, (await State(owner, u)).SelectedLore);
        var slug = (await Published(owner, u)).PublicSlug!;
        var anonymous = Anonymous(_factory);
        Assert.Equal("chosen-warden", Assert.Single((await Lore(anonymous, slug)).Items).Slug);

        // Private again: every public way to the selected entry answers as if nothing were there, and nothing is rewritten.
        var unpublished = await Unpublish(owner, u);
        unpublished.EnsureSuccessStatusCode();
        Assert.Equal(1, (await unpublished.Content.ReadFromJsonAsync<PublicationState>())!.SelectedLore);
        Assert.Null(await PublicBySlug(anonymous, slug));
        Assert.DoesNotContain(await PublicListing(anonymous), world => world.Slug == slug);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(LoreRoute(slug))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{LoreRoute(slug)}/chosen-warden")).StatusCode);
        var kept = await EntryState(owner, u, chosen);
        Assert.Equal((ContentVisibility.Public, false), (kept.Visibility, kept.UniverseIsPublic));
    }

    // ---------- Who may ----------

    [Fact]
    public async Task Only_the_owner_may_read_or_change_an_items_publication()
    {
        var (owner, _) = await Account(_factory, "cp-owner");
        var (stranger, _) = await Account(_factory, "cp-stranger");
        var anonymous = Anonymous(_factory);
        var universe = await Ready(owner, "Cp owned");
        var u = universe.Id;
        var entry = await Entry(owner, u, "Owned entry", null);
        var story = await PlotTestClient.CreateStory(owner, u, "Owned story");
        await Published(owner, u);

        foreach (var path in new[]
        {
            EntryPath(u, entry, "publication"), EntryPath(u, entry, "publish"), EntryPath(u, entry, "unpublish"),
            StoryPath(u, story, "publication"), StoryPath(u, story, "publish"), StoryPath(u, story, "unpublish"),
        })
        {
            var read = path.EndsWith("publication", StringComparison.Ordinal);
            Task<HttpResponseMessage> Attempt(HttpClient client) => read ? client.GetAsync(path) : client.PostAsync(path, null);

            Assert.Equal(HttpStatusCode.NotFound, (await Attempt(stranger)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await Attempt(anonymous)).StatusCode);
        }

        // A stranger's own universe cannot reach the owner's items by id either.
        var theirs = await CreateUniverse(stranger, "Cp stranger world");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync(EntryPath(theirs.Id, entry, "publish"), null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync(StoryPath(theirs.Id, story, "publish"), null)).StatusCode);

        Assert.Equal(ContentVisibility.Private, (await EntryState(owner, u, entry)).Visibility);
        Assert.Equal(ContentVisibility.Private, (await StoryState(owner, u, story)).Visibility);
        Assert.Empty((await Lore(anonymous, "cp-owned")).Items);
        Assert.Empty((await Stories(anonymous, "cp-owned")).Items);

        // Published by its owner, the stranger cannot take it down.
        await PublishEntry(owner, u, entry);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync(EntryPath(u, entry, "unpublish"), null)).StatusCode);
        Assert.Single((await Lore(anonymous, "cp-owned")).Items);
    }

    [Fact]
    public async Task No_entry_or_story_save_can_publish_or_choose_an_address()
    {
        var (owner, _) = await Account(_factory, "cp-overpost");
        var universe = await Ready(owner, "Cp overpost");
        var u = universe.Id;
        var types = (await owner.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        await Published(owner, u);

        var sneaked = new Dictionary<string, object?>
        {
            ["visibility"] = 1,
            ["publicSlug"] = "sneaked",
            ["publishedAt"] = "2020-01-01T00:00:00Z",
        };

        var entryBody = new Dictionary<string, object?>(sneaked)
        {
            ["entityTypeId"] = types[0].Id,
            ["name"] = "Sneaky entry",
            ["canonStatus"] = 0,
        };
        var created = await owner.PostAsJsonAsync($"/api/universes/{u}/entities", entryBody);
        created.EnsureSuccessStatusCode();
        var entry = (await created.Content.ReadFromJsonAsync<EntityDetail>())!.Id;
        (await owner.PutVersionedAsync($"/api/universes/{u}/entities/{entry}", entryBody)).EnsureSuccessStatusCode();

        var storyBody = new Dictionary<string, object?>(sneaked) { ["title"] = "Sneaky story", ["status"] = 0 };
        var createdStory = await owner.PostAsJsonAsync(PlotTestClient.Stories(u), storyBody);
        createdStory.EnsureSuccessStatusCode();
        var story = (await createdStory.Content.ReadFromJsonAsync<StoryDetail>())!.Id;
        (await owner.PutVersionedAsync(PlotTestClient.Story(u, story), storyBody)).EnsureSuccessStatusCode();

        var entryState = await EntryState(owner, u, entry);
        var storyState = await StoryState(owner, u, story);
        Assert.Equal((ContentVisibility.Private, null, null), (entryState.Visibility, entryState.PublicSlug, entryState.PublishedAt));
        Assert.Equal((ContentVisibility.Private, null, null), (storyState.Visibility, storyState.PublicSlug, storyState.PublishedAt));

        // A publish body is ignored too: the address is minted from the name, never chosen.
        var published = await owner.PostAsJsonAsync(EntryPath(u, entry, "publish"), new { publicSlug = "chosen" });
        published.EnsureSuccessStatusCode();
        Assert.Equal("sneaky-entry", (await published.Content.ReadFromJsonAsync<ContentPublicationState>())!.PublicSlug);

        var anonymous = Anonymous(_factory);
        Assert.Equal("sneaky-entry", Assert.Single((await Lore(anonymous, "cp-overpost")).Items).Slug);
        Assert.Empty((await Stories(anonymous, "cp-overpost")).Items);
    }

    [Fact]
    public async Task Publishing_is_not_an_edit_and_a_later_edit_does_not_unpublish()
    {
        var (owner, _) = await Account(_factory, "cp-not-edit");
        var universe = await Ready(owner, "Cp not edit");
        var u = universe.Id;
        var entry = await Entry(owner, u, "Quiet keeper", null);
        var before = await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}");
        var story = await ReadableStory(owner, u, "Quiet tale");
        var storyBefore = await PlotTestClient.ReadStory(owner, u, story);

        await PublishEntry(owner, u, entry);
        await PublishStory(owner, u, story);

        Assert.Equal(before!.UpdatedAt, (await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}"))!.UpdatedAt);
        Assert.Equal(storyBefore.UpdatedAt, (await PlotTestClient.ReadStory(owner, u, story)).UpdatedAt);

        // Renamed after publication: the address stays, the new name shows.
        (await owner.PutVersionedAsync($"/api/universes/{u}/entities/{entry}", new EntityRequest(
            before.EntityTypeId, "Quiet keeper renamed", null, CanonStatus.Idea, null, null, null))).EnsureSuccessStatusCode();
        (await owner.PutVersionedAsync(PlotTestClient.Story(u, story), new StoryRequest("Quiet tale renamed", null, StoryStatus.Complete)))
            .EnsureSuccessStatusCode();

        await Published(owner, u);
        var anonymous = Anonymous(_factory);
        var listed = Assert.Single((await Lore(anonymous, "cp-not-edit")).Items);
        Assert.Equal(("quiet-keeper", "Quiet keeper renamed"), (listed.Slug, listed.Name));
        var told = Assert.Single((await Stories(anonymous, "cp-not-edit")).Items);
        Assert.Equal(("quiet-tale", "Quiet tale renamed"), (told.Slug, told.Title));
    }

    // ---------- Addresses ----------

    [Fact]
    public async Task Addresses_are_unique_per_universe_and_kind_and_fall_back_for_names_with_no_plain_letters()
    {
        var (owner, _) = await Account(_factory, "cp-slugs");
        var universe = await Ready(owner, "Cp slugs");
        var u = universe.Id;
        var other = await Ready(owner, "Cp slugs other");

        var first = await Entry(owner, u, "Aria", null);
        var second = await Entry(owner, u, "ARIA!", null);
        var accented = await Entry(owner, u, "Ária", null);
        var elsewhere = await Entry(owner, other.Id, "Aria", null);
        var story = await ReadableStory(owner, u, "Aria");
        var arabic = await Entry(owner, u, "المدينة", null);
        var hebrew = await Entry(owner, u, "עיר", null);
        var arabicStory = await ReadableStory(owner, u, "مدينة النحاس");
        var mixed = await Entry(owner, u, "Qasr القصر 7", null);

        Assert.Equal("aria", (await PublishEntry(owner, u, first)).PublicSlug);
        Assert.Equal("aria-2", (await PublishEntry(owner, u, second)).PublicSlug);
        Assert.Equal("aria-3", (await PublishEntry(owner, u, accented)).PublicSlug);
        Assert.Equal("aria", (await PublishEntry(owner, other.Id, elsewhere)).PublicSlug);
        Assert.Equal("aria", (await PublishStory(owner, u, story)).PublicSlug);
        Assert.Equal("entry", (await PublishEntry(owner, u, arabic)).PublicSlug);
        Assert.Equal("entry-2", (await PublishEntry(owner, u, hebrew)).PublicSlug);
        Assert.Equal("story", (await PublishStory(owner, u, arabicStory)).PublicSlug);
        Assert.Equal("qasr-7", (await PublishEntry(owner, u, mixed)).PublicSlug);

        // A trashed entry keeps its address, so it is still taken.
        (await owner.DeleteAsync($"/api/universes/{u}/entities/{first}")).EnsureSuccessStatusCode();
        var third = await Entry(owner, u, "Aria", null);
        Assert.Equal("aria-4", (await PublishEntry(owner, u, third)).PublicSlug);

        // Names in any script are shown exactly as written; only the address is plain.
        await Published(owner, u);
        var names = (await Lore(Anonymous(_factory), "cp-slugs")).Items.ToDictionary(item => item.Slug, item => item.Name);
        Assert.Equal("المدينة", names["entry"]);
        Assert.Equal("עיר", names["entry-2"]);
        Assert.Equal("Qasr القصر 7", names["qasr-7"]);
        Assert.Equal("مدينة النحاس", (await Stories(Anonymous(_factory), "cp-slugs")).Items.Single(item => item.Slug == "story").Title);
    }

    // ---------- Order and paging ----------

    [Fact]
    public async Task The_listings_read_by_name_case_aside_and_page_within_bounds()
    {
        var (owner, _) = await Account(_factory, "cp-order");
        var universe = await Ready(owner, "Cp order");
        var u = universe.Id;
        foreach (var name in new[] { "charlie", "Alpha", "bravo" })
        {
            await PublishEntry(owner, u, await Entry(owner, u, name, null));
            await PublishStory(owner, u, await ReadableStory(owner, u, name));
        }

        await Published(owner, u);
        var anonymous = Anonymous(_factory);

        var first = await Lore(anonymous, "cp-order", "?page=1&pageSize=2");
        Assert.Equal(["Alpha", "bravo"], first.Items.Select(item => item.Name));
        Assert.Equal((1, 2, 3, 2), (first.Page, first.PageSize, first.TotalCount, first.TotalPages));
        Assert.Equal(["charlie"], (await Lore(anonymous, "cp-order", "?page=2&pageSize=2")).Items.Select(item => item.Name));
        Assert.Equal(["Alpha", "bravo", "charlie"], (await Stories(anonymous, "cp-order")).Items.Select(item => item.Title));

        var clamped = await Lore(anonymous, "cp-order", "?page=-4&pageSize=5000");
        Assert.Equal((1, 48), (clamped.Page, clamped.PageSize));
        Assert.Empty((await Stories(anonymous, "cp-order", "?page=9")).Items);
    }

    // ---------- Helpers ----------

    private static string LoreRoute(string universeSlug) => $"{PublicRoute}/{universeSlug}/lore";

    private static string StoriesRoute(string universeSlug) => $"{PublicRoute}/{universeSlug}/stories";

    private static string EntryPath(Guid universeId, Guid entityId, string action) =>
        $"/api/universes/{universeId}/entities/{entityId}/{action}";

    private static string StoryPath(Guid universeId, Guid storyId, string action) =>
        $"{PlotTestClient.Story(universeId, storyId)}/{action}";

    private static async Task<Guid> Entry(HttpClient client, Guid universeId, string name, string? summary)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        return await CreateEntry(client, universeId, new EntityRequest(types[0].Id, name, summary, CanonStatus.Draft, null, null, null));
    }

    private static async Task<Guid> CreateEntry(HttpClient client, Guid universeId, EntityRequest request) =>
        (await PlotTestClient.PostJson<EntityDetail>(client, $"/api/universes/{universeId}/entities", request)).Id;

    private static async Task<ContentPublicationState> Transition(HttpClient client, string path)
    {
        var response = await client.PostAsync(path, null);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ContentPublicationState>())!;
    }

    private static Task<ContentPublicationState> PublishEntry(HttpClient client, Guid universeId, Guid entityId) =>
        Transition(client, EntryPath(universeId, entityId, "publish"));

    private static Task<ContentPublicationState> UnpublishEntry(HttpClient client, Guid universeId, Guid entityId) =>
        Transition(client, EntryPath(universeId, entityId, "unpublish"));

    /// <summary>A story with the public summary publishing needs (Task 011).</summary>
    private static async Task<Guid> ReadableStory(HttpClient client, Guid universeId, string title)
    {
        var story = await PlotTestClient.CreateStory(client, universeId, title);
        await Summarize(client, universeId, story, $"For readers: {title}.");
        return story;
    }

    private static async Task<ContentPublicationState> Summarize(HttpClient client, Guid universeId, Guid storyId, string? summary)
    {
        var response = await client.PutAsJsonAsync(StoryPath(universeId, storyId, "publication"), new StoryPublicationRequest(summary));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ContentPublicationState>())!;
    }

    private static Task<ContentPublicationState> PublishStory(HttpClient client, Guid universeId, Guid storyId) =>
        Transition(client, StoryPath(universeId, storyId, "publish"));

    private static Task<ContentPublicationState> UnpublishStory(HttpClient client, Guid universeId, Guid storyId) =>
        Transition(client, StoryPath(universeId, storyId, "unpublish"));

    private static async Task<ContentPublicationState> EntryState(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<ContentPublicationState>(EntryPath(universeId, entityId, "publication")))!;

    private static async Task<ContentPublicationState> StoryState(HttpClient client, Guid universeId, Guid storyId) =>
        (await client.GetFromJsonAsync<ContentPublicationState>(StoryPath(universeId, storyId, "publication")))!;

    private static async Task<PublicContentPage<PublicLoreEntry>> Lore(HttpClient client, string universeSlug, string query = "") =>
        (await client.GetFromJsonAsync<PublicContentPage<PublicLoreEntry>>(LoreRoute(universeSlug) + query))!;

    private static async Task<PublicContentPage<PublicStory>> Stories(HttpClient client, string universeSlug, string query = "") =>
        (await client.GetFromJsonAsync<PublicContentPage<PublicStory>>(StoriesRoute(universeSlug) + query))!;

    private static async Task<EntityImageRef> UploadEntryImage(HttpClient client, Guid universeId, Guid entityId, byte[] bytes)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "picture.png");
        var response = await client.PutAsync($"/api/universes/{universeId}/entities/{entityId}/image", form);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityImageRef>())!;
    }

    private static Task<HttpResponseMessage> Conditional(HttpClient client, string address, EntityTagHeaderValue tag)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, address);
        request.Headers.IfNoneMatch.Add(tag);
        return client.SendAsync(request);
    }

    private static string[] Keys(JsonElement element) =>
        [.. element.EnumerateObject().Select(member => member.Name).Order(StringComparer.Ordinal)];
}
