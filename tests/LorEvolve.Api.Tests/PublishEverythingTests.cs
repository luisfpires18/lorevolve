using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Stories;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// "Publish everything" on a universe's Publish page. The claims this file carries: it selects every live Canon entry and
/// every live Complete story with a public summary, with that story's scenes and their prose, and nothing else - not Idea or
/// Draft lore, not Planning or Drafting stories, not plot arcs, not the Trash. A Complete story with no summary is skipped
/// and named. It only adds: what is already public keeps its address and date, and nothing becomes private. The preview
/// names exactly what the publish then applies. The owner's alone. Names are invented.
/// </summary>
public sealed class PublishEverythingTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Publishes_canon_lore_and_complete_stories_with_their_scenes_and_nothing_else()
    {
        var (owner, _) = await Account(_factory, "pe-scope");
        var universe = await Ready(owner, "Pe scope world");
        var u = universe.Id;

        var canon = await Entry(owner, u, "Tide keeper", CanonStatus.Canon);
        var draft = await Entry(owner, u, "Half a rumour", CanonStatus.Draft);
        var idea = await Entry(owner, u, "Maybe a ghost", CanonStatus.Idea);
        var trashed = await Entry(owner, u, "Drowned clerk", CanonStatus.Canon);
        (await owner.DeleteAsync($"/api/universes/{u}/entities/{trashed}")).EnsureSuccessStatusCode();

        var complete = await StoryOf(owner, u, "The Long Ebb", StoryStatus.Complete, "For readers: the ebb.");
        var scene = await CreateScene(owner, u, complete, "Low water");
        await ManuscriptTestClient.WriteManuscript(owner, u, complete, scene, "The sea went out and kept going.");
        await CreateArc(owner, u, complete, "Planning arc");
        var drafting = await StoryOf(owner, u, "Still drafting", StoryStatus.Drafting, "For readers: not yet.");
        var unsummarised = await StoryOf(owner, u, "No summary yet", StoryStatus.Complete, null);

        var preview = await Preview(owner, u);
        Assert.Equal("Tide keeper", Assert.Single(preview.Lore).Name);
        var listed = Assert.Single(preview.Stories);
        Assert.Equal((complete, 1), (listed.Id, listed.Scenes));
        Assert.Equal(unsummarised, Assert.Single(preview.SkippedStories).Id);

        var result = await PublishAll(owner, u);
        Assert.Equal(new PublishEverythingResult(1, 1, 1), result);

        Assert.Equal(ContentVisibility.Public, (await EntryState(owner, u, canon)).Visibility);
        foreach (var untouched in new[] { draft, idea })
        {
            Assert.Equal(ContentVisibility.Private, (await EntryState(owner, u, untouched)).Visibility);
        }

        Assert.Equal(ContentVisibility.Public, (await StoryState(owner, u, complete)).Visibility);
        Assert.Equal(ContentVisibility.Private, (await StoryState(owner, u, drafting)).Visibility);
        Assert.Equal(ContentVisibility.Private, (await StoryState(owner, u, unsummarised)).Visibility);

        // Read as anyone: the scene's outline and prose are on the story's page, the arc is not.
        var world = await Published(owner, u);
        var page = (await Anonymous(_factory).GetFromJsonAsync<PublicStoryDetail>($"{PublicRoute}/{world.PublicSlug}/stories/the-long-ebb"))!;
        Assert.Equal("Low water", Assert.Single(page.Scenes).Title);
        Assert.Equal("The sea went out and kept going.", Assert.Single(page.Manuscript).Text);
        Assert.Empty(page.Plot);

        // Nothing left to do, and running it again changes nothing.
        var after = await Preview(owner, u);
        Assert.Empty(after.Lore);
        Assert.Empty(after.Stories);
        Assert.Equal(new PublishEverythingResult(0, 0, 0), await PublishAll(owner, u));
    }

    [Fact]
    public async Task Already_public_items_keep_their_address_and_date_and_nothing_becomes_private()
    {
        var (owner, _) = await Account(_factory, "pe-keep");
        var universe = await Ready(owner, "Pe keep world");
        var u = universe.Id;

        var early = await Entry(owner, u, "Early keeper", CanonStatus.Canon);
        var before = await Transition(owner, $"/api/universes/{u}/entities/{early}/publish");
        var selectedDraft = await Entry(owner, u, "Selected draft", CanonStatus.Draft);
        await Transition(owner, $"/api/universes/{u}/entities/{selectedDraft}/publish");
        var twin = await Entry(owner, u, "Early keeper", CanonStatus.Canon);

        var story = await StoryOf(owner, u, "Told already", StoryStatus.Complete, "For readers: told.");
        var storyBefore = await Transition(owner, $"{Story(u, story)}/publish");
        await CreateScene(owner, u, story, "A later scene");

        var preview = await Preview(owner, u);
        Assert.Equal(twin, Assert.Single(preview.Lore).Id);
        Assert.Equal((story, 1), (Assert.Single(preview.Stories).Id, Assert.Single(preview.Stories).Scenes));

        Assert.Equal(new PublishEverythingResult(1, 0, 1), await PublishAll(owner, u));

        var kept = await EntryState(owner, u, early);
        Assert.Equal((before.PublicSlug, before.PublishedAt), (kept.PublicSlug, kept.PublishedAt));
        Assert.Equal("early-keeper-2", (await EntryState(owner, u, twin)).PublicSlug);
        Assert.Equal(ContentVisibility.Public, (await EntryState(owner, u, selectedDraft)).Visibility);
        var storyAfter = await StoryState(owner, u, story);
        Assert.Equal((storyBefore.PublicSlug, storyBefore.PublishedAt), (storyAfter.PublicSlug, storyAfter.PublishedAt));
    }

    [Fact]
    public async Task Only_the_owner_may_preview_or_publish_everything()
    {
        var (owner, _) = await Account(_factory, "pe-owner");
        var universe = await Ready(owner, "Pe owner world");
        var entry = await Entry(owner, universe.Id, "Kept private", CanonStatus.Canon);
        var (stranger, _) = await Account(_factory, "pe-stranger");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Route(universe.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync(Route(universe.Id), null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Anonymous(_factory).PostAsync(Route(universe.Id), null)).StatusCode);
        Assert.Equal(ContentVisibility.Private, (await EntryState(owner, universe.Id, entry)).Visibility);
    }

    private static string Route(Guid universeId) => $"/api/universes/{universeId}/publication/everything";

    private static async Task<PublishEverythingPreview> Preview(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<PublishEverythingPreview>(Route(universeId)))!;

    private static async Task<PublishEverythingResult> PublishAll(HttpClient client, Guid universeId)
    {
        var response = await client.PostAsync(Route(universeId), null);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<PublishEverythingResult>())!;
    }

    private static async Task<Guid> Entry(HttpClient client, Guid universeId, string name, CanonStatus status)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        return (await PostJson<EntityDetail>(
            client, $"/api/universes/{universeId}/entities", new EntityRequest(types[0].Id, name, null, status, null, null, null))).Id;
    }

    private static async Task<Guid> StoryOf(HttpClient client, Guid universeId, string title, StoryStatus status, string? summary)
    {
        var story = (await PostJson<StoryDetail>(client, Stories(universeId), new StoryRequest(title, null, status))).Id;
        if (summary is not null)
        {
            (await client.PutAsJsonAsync($"{Story(universeId, story)}/publication", new StoryPublicationRequest(summary))).EnsureSuccessStatusCode();
        }

        return story;
    }

    private static async Task<ContentPublicationState> Transition(HttpClient client, string path)
    {
        var response = await client.PostAsync(path, null);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ContentPublicationState>())!;
    }

    private static async Task<ContentPublicationState> EntryState(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<ContentPublicationState>($"/api/universes/{universeId}/entities/{entityId}/publication"))!;

    private static async Task<ContentPublicationState> StoryState(HttpClient client, Guid universeId, Guid storyId) =>
        (await client.GetFromJsonAsync<ContentPublicationState>($"{Story(universeId, storyId)}/publication"))!;
}
