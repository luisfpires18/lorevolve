using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Reading what is published inside a public universe (Task 011, ADR 0036).
///
/// The claims this file carries. A published entry has a page of its own whose allow-list adds its article - with every
/// link that could point into the workspace unwrapped - and nothing else of the entry; a published story has a page that
/// is its listing, and it can only be published with a public summary its author wrote, never its premise. Both pages
/// answer only through the same two-level predicate as the listings, so a private universe, a private or trashed item and
/// an address nobody holds are one 404. The owner's way back to the workspace answers only its owner and puts no id or
/// owner into anything anonymous.
/// </summary>
public sealed class PublicReadingTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private static readonly string[] LoreDetailKeys = ["article", "name", "publishedAt", "slug", "summary", "thumbnailUrl", "typeName"];
    private static readonly string[] StoryKeys = ["manuscript", "plot", "publicSummary", "publishedAt", "scenes", "slug", "title"];

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Lore ----------

    [Fact]
    public async Task A_published_entry_has_a_page_with_its_article_and_nothing_else_of_the_entry()
    {
        var (owner, userId) = await Account(_factory, "read-lore");
        var universe = await Ready(owner, "Read lore world");
        var u = universe.Id;
        var types = (await owner.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var entry = (await PlotTestClient.PostJson<EntityDetail>(owner, $"/api/universes/{u}/entities", new EntityRequest(
            types[0].Id, "Salt Warden", "Keeper of the count.", CanonStatus.Canon, ["Secret alias"], ["secret-tag"], null))).Id;

        // Prose, a link out, and a link into the workspace that carries its ids.
        var article = $$$"""
            {"type":"doc","content":[
              {"type":"paragraph","content":[{"type":"text","text":"The warden counts the tide."}]},
              {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"The count"}]},
              {"type":"paragraph","content":[
                {"type":"text","text":"Charts","marks":[{"type":"link","attrs":{"href":"https://example.test/charts"}}]},
                {"type":"text","text":" and "},
                {"type":"text","text":"notes","marks":[{"type":"bold"},{"type":"link","attrs":{"href":"/app/universes/{{{u}}}/lore/{{{entry}}}"}}]}
              ]}
            ]}
            """;
        await ArticleTestClient.WriteArticle(owner, u, entry, article);

        (await owner.PostAsync($"/api/universes/{u}/entities/{entry}/publish", null)).EnsureSuccessStatusCode();
        var world = await Published(owner, u);
        var anonymous = Anonymous(_factory);

        var body = await anonymous.GetStringAsync($"{PublicRoute}/{world.PublicSlug}/lore/salt-warden");
        using var document = JsonDocument.Parse(body);
        Assert.Equal(LoreDetailKeys, Keys(document.RootElement));
        Assert.Equal("Salt Warden", document.RootElement.GetProperty("name").GetString());
        Assert.Equal("Keeper of the count.", document.RootElement.GetProperty("summary").GetString());

        var reader = JsonDocument.Parse(document.RootElement.GetProperty("article").GetString()!).RootElement;
        // The page's title is its only first-level heading: the article's own read as second-level ones.
        Assert.Equal(2, reader.GetProperty("content")[1].GetProperty("attrs").GetProperty("level").GetInt32());

        var runs = reader.GetProperty("content")[2].GetProperty("content");
        Assert.Equal("https://example.test/charts", runs[0].GetProperty("marks")[0].GetProperty("attrs").GetProperty("href").GetString());
        // The workspace link is gone; its text and its other marks stay.
        Assert.Equal("notes", runs[2].GetProperty("text").GetString());
        Assert.Equal(["bold"], runs[2].GetProperty("marks").EnumerateArray().Select(mark => mark.GetProperty("type").GetString()));

        foreach (var secret in new[] { entry.ToString(), u.ToString(), userId, "Secret alias", "secret-tag", "/app/", "canonStatus", "Private notes" })
        {
            Assert.DoesNotContain(secret, body, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task An_entry_page_answers_only_while_the_entry_and_its_universe_are_public_and_it_is_not_in_the_trash()
    {
        var (owner, _) = await Account(_factory, "read-lore-matrix");
        var universe = await Ready(owner, "Read lore matrix");
        var u = universe.Id;
        var entry = await Entry(owner, u, "Tidewright");
        var anonymous = Anonymous(_factory);
        var page = $"{PublicRoute}/read-lore-matrix/lore/tidewright";
        var nobody = await (await anonymous.GetAsync($"{PublicRoute}/read-lore-matrix/lore/no-such-entry")).Content.ReadAsStringAsync();

        async Task Hidden()
        {
            var response = await anonymous.GetAsync(page);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal(nobody, await response.Content.ReadAsStringAsync());
        }

        await Hidden(); // both private
        (await owner.PostAsync($"/api/universes/{u}/entities/{entry}/publish", null)).EnsureSuccessStatusCode();
        await Hidden(); // universe private
        await Published(owner, u);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(page)).StatusCode);
        Assert.Equal(JsonValueKind.Null, JsonDocument.Parse(await anonymous.GetStringAsync(page)).RootElement.GetProperty("article").ValueKind);

        (await owner.PostAsync($"/api/universes/{u}/entities/{entry}/unpublish", null)).EnsureSuccessStatusCode();
        await Hidden(); // entry private
        (await owner.PostAsync($"/api/universes/{u}/entities/{entry}/publish", null)).EnsureSuccessStatusCode();
        (await owner.DeleteAsync($"/api/universes/{u}/entities/{entry}")).EnsureSuccessStatusCode();
        await Hidden(); // in the Trash
        (await owner.PostAsync($"/api/universes/{u}/trash/{entry}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(page)).StatusCode);
        (await Unpublish(owner, u)).EnsureSuccessStatusCode();
        await Hidden(); // universe made private again
    }

    // ---------- Stories ----------

    [Fact]
    public async Task A_story_is_published_only_with_a_public_summary_and_its_page_carries_nothing_else()
    {
        var (owner, _) = await Account(_factory, "read-story");
        var universe = await Ready(owner, "Read story world");
        var u = universe.Id;
        var story = (await PlotTestClient.PostJson<StoryDetail>(
            owner, PlotTestClient.Stories(u), new StoryRequest("The Glass Ebb", "Premise secret: the narrator drowns.", StoryStatus.Drafting))).Id;
        await PlotTestClient.CreateScene(owner, u, story, "Scene secret");
        await Published(owner, u);

        // No summary: refused, named, and still private. The premise is never taken instead.
        var refused = await owner.PostAsync($"{PlotTestClient.Story(u, story)}/publish", null);
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal(PublicationEndpoints.IncompleteCode, await ProblemCode(refused));
        Assert.Equal(["publicSummary"], await ErrorKeys(refused));
        Assert.Equal(ContentVisibility.Private, (await State(owner, u, story)).Visibility);

        // Bounded; trimmed; saved on its own route.
        Assert.Equal(HttpStatusCode.BadRequest, (await SaveSummary(owner, u, story, new string('x', PublicationLimits.SummaryMaxLength + 1))).StatusCode);
        var saved = await (await SaveSummary(owner, u, story, "  A tide that counts the drowned.  ")).Content.ReadFromJsonAsync<ContentPublicationState>();
        Assert.Equal("A tide that counts the drowned.", saved!.PublicSummary);

        (await owner.PostAsync($"{PlotTestClient.Story(u, story)}/publish", null)).EnsureSuccessStatusCode();
        var anonymous = Anonymous(_factory);
        var body = await anonymous.GetStringAsync($"{PublicRoute}/read-story-world/stories/the-glass-ebb");
        using (var document = JsonDocument.Parse(body))
        {
            Assert.Equal(StoryKeys, Keys(document.RootElement));
            Assert.Equal("A tide that counts the drowned.", document.RootElement.GetProperty("publicSummary").GetString());

            // Nothing inside it was published, so nothing inside it is read - not even that it exists (ADR 0039).
            foreach (var part in new[] { "manuscript", "scenes", "plot" })
            {
                Assert.Equal(0, document.RootElement.GetProperty(part).GetArrayLength());
            }
        }

        foreach (var secret in new[] { "Premise secret", "Scene secret", story.ToString(), u.ToString(), "drafting", "chapters" })
        {
            Assert.DoesNotContain(secret, body, StringComparison.OrdinalIgnoreCase);
        }

        // While published it cannot be removed; once private it can, and the page is gone either way.
        var clearing = await SaveSummary(owner, u, story, " ");
        Assert.Equal(HttpStatusCode.BadRequest, clearing.StatusCode);
        Assert.Equal(PublicationEndpoints.RequiredWhilePublicCode, await ProblemCode(clearing));
        (await owner.PostAsync($"{PlotTestClient.Story(u, story)}/unpublish", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{PublicRoute}/read-story-world/stories/the-glass-ebb")).StatusCode);
        Assert.Null((await (await SaveSummary(owner, u, story, null)).Content.ReadFromJsonAsync<ContentPublicationState>())!.PublicSummary);
    }

    [Fact]
    public async Task A_story_selected_before_summaries_existed_stays_selected_and_hidden_until_it_has_one()
    {
        var (owner, _) = await Account(_factory, "read-legacy");
        var universe = await Ready(owner, "Read legacy world");
        var u = universe.Id;
        var story = await PlotTestClient.CreateStory(owner, u, "Old Tide");
        await Published(owner, u);

        // What Task 010 could leave behind: selected, addressed and dated, with no summary.
        await PlotTestClient.WithDb(_factory, async db =>
        {
            var stored = await db.Stories.SingleAsync(candidate => candidate.Id == story);
            stored.Visibility = ContentVisibility.Public;
            stored.PublicSlug = "old-tide";
            stored.PublishedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        });

        var anonymous = Anonymous(_factory);
        Assert.Equal(0, (await anonymous.GetFromJsonAsync<PublicContentPage<PublicStory>>($"{PublicRoute}/read-legacy-world/stories"))!.TotalCount);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{PublicRoute}/read-legacy-world/stories/old-tide")).StatusCode);

        var state = await State(owner, u, story);
        Assert.Equal((ContentVisibility.Public, null, true), (state.Visibility, state.PublicSummary, state.UniverseIsPublic));

        (await SaveSummary(owner, u, story, "Told at last.")).EnsureSuccessStatusCode();
        Assert.Equal("Told at last.", (await anonymous.GetFromJsonAsync<PublicStory>($"{PublicRoute}/read-legacy-world/stories/old-tide"))!.PublicSummary);
    }

    [Fact]
    public async Task No_story_save_or_create_can_write_the_public_summary_and_saving_it_is_not_an_edit()
    {
        var (owner, _) = await Account(_factory, "read-overpost");
        var universe = await Ready(owner, "Read overpost world");
        var u = universe.Id;

        var created = await owner.PostAsJsonAsync(PlotTestClient.Stories(u), new Dictionary<string, object?>
        {
            ["title"] = "Sneaky tale",
            ["status"] = 0,
            ["publicSummary"] = "Sneaked in.",
        });
        created.EnsureSuccessStatusCode();
        var story = (await created.Content.ReadFromJsonAsync<StoryDetail>())!;
        Assert.Null((await State(owner, u, story.Id)).PublicSummary);

        (await SaveSummary(owner, u, story.Id, "Written on purpose.")).EnsureSuccessStatusCode();
        Assert.Equal(story.UpdatedAt, (await PlotTestClient.ReadStory(owner, u, story.Id)).UpdatedAt);

        (await owner.PutVersionedAsync(PlotTestClient.Story(u, story.Id), new Dictionary<string, object?>
        {
            ["title"] = "Sneaky tale",
            ["status"] = 0,
            ["publicSummary"] = null,
        })).EnsureSuccessStatusCode();

        Assert.Equal("Written on purpose.", (await State(owner, u, story.Id)).PublicSummary);
    }

    [Fact]
    public async Task A_story_summary_is_the_owners_alone()
    {
        var (owner, _) = await Account(_factory, "read-summary-owner");
        var (stranger, _) = await Account(_factory, "read-summary-stranger");
        var universe = await Ready(owner, "Read summary owner");
        var story = await PlotTestClient.CreateStory(owner, universe.Id, "Held tale");

        Assert.Equal(HttpStatusCode.NotFound, (await SaveSummary(stranger, universe.Id, story, "Mine now.")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await SaveSummary(Anonymous(_factory), universe.Id, story, "Mine now.")).StatusCode);
        Assert.Null((await State(owner, universe.Id, story)).PublicSummary);
    }

    // ---------- The owner's way back ----------

    [Fact]
    public async Task Only_the_owner_is_told_where_a_public_address_is_edited()
    {
        var (owner, _) = await Account(_factory, "read-bridge");
        var (stranger, _) = await Account(_factory, "read-bridge-stranger");
        var universe = await Ready(owner, "Read bridge world");
        var u = universe.Id;
        var entry = await Entry(owner, u, "Bridge keeper");
        var story = await PlotTestClient.CreateStory(owner, u, "Bridge tale");
        (await SaveSummary(owner, u, story, "For readers.")).EnsureSuccessStatusCode();
        (await owner.PostAsync($"/api/universes/{u}/entities/{entry}/publish", null)).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{PlotTestClient.Story(u, story)}/publish", null)).EnsureSuccessStatusCode();
        await Published(owner, u);

        Assert.Equal(new WorkspaceLink(u, null, null), await owner.GetFromJsonAsync<WorkspaceLink>("/api/universes/by-address/read-bridge-world"));
        Assert.Equal(new WorkspaceLink(u, entry, null), await owner.GetFromJsonAsync<WorkspaceLink>("/api/universes/by-address/read-bridge-world?lore=bridge-keeper"));
        Assert.Equal(new WorkspaceLink(u, null, story), await owner.GetFromJsonAsync<WorkspaceLink>("/api/universes/by-address/read-bridge-world?story=bridge-tale"));
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync("/api/universes/by-address/read-bridge-world?lore=nobody")).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync("/api/universes/by-address/read-bridge-world")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Anonymous(_factory).GetAsync("/api/universes/by-address/read-bridge-world")).StatusCode);

        // Nothing anonymous names the owner or an id.
        var anonymous = Anonymous(_factory);
        foreach (var route in new[] { "read-bridge-world", "read-bridge-world/lore/bridge-keeper", "read-bridge-world/stories/bridge-tale" })
        {
            var body = await anonymous.GetStringAsync($"{PublicRoute}/{route}");
            Assert.DoesNotContain(u.ToString(), body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("owner", body, StringComparison.OrdinalIgnoreCase);
        }
    }

    // ---------- Helpers ----------

    private static async Task<Guid> Entry(HttpClient client, Guid universeId, string name)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        return (await PlotTestClient.PostJson<EntityDetail>(
            client,
            $"/api/universes/{universeId}/entities",
            new EntityRequest(types[0].Id, name, null, CanonStatus.Draft, null, null, null))).Id;
    }

    private static Task<HttpResponseMessage> SaveSummary(HttpClient client, Guid universeId, Guid storyId, string? summary) =>
        client.PutAsJsonAsync($"{PlotTestClient.Story(universeId, storyId)}/publication", new StoryPublicationRequest(summary));

    private static async Task<ContentPublicationState> State(HttpClient client, Guid universeId, Guid storyId) =>
        (await client.GetFromJsonAsync<ContentPublicationState>($"{PlotTestClient.Story(universeId, storyId)}/publication"))!;

    private static string[] Keys(JsonElement element) =>
        [.. element.EnumerateObject().Select(member => member.Name).Order(StringComparer.Ordinal)];
}
