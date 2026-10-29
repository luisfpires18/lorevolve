using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Stories;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Publishing what is inside a story (Product refinement 015, ADR 0039).
///
/// The claims this file carries. A scene's outline, a scene's prose and a plot arc are each selected on their own, private
/// by default, and read on the story's own page only while the universe, the story and the part are all public and the
/// part is out of the Trash. A parent going private hides its selected parts and clears none of them. The page reads them
/// in the author's order, carries each part's allow-list and nothing else - no id, note, chapter, count or trace of what is
/// private - and selecting a part is not an edit. Names are invented.
/// </summary>
public sealed partial class StoryContentPublicationTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_public_story_with_nothing_published_inside_is_its_summary_and_no_hint_of_the_rest()
    {
        var world = await PublicStory("parts-none");
        var scene = await Scene(world, "Hidden landing", "Summary secret: the keeper lies.", notes: "Notes secret");
        await WriteManuscript(world.Owner, world.U, world.Story, scene, "Prose secret.");
        await CreateArc(world.Owner, world.U, world.Story, "Arc secret", "Description secret", "Arc notes secret");

        var body = await Anonymous(_factory).GetStringAsync(world.Page);
        using var document = JsonDocument.Parse(body);
        foreach (var part in new[] { "manuscript", "scenes", "plot" })
        {
            Assert.Equal(0, document.RootElement.GetProperty(part).GetArrayLength());
        }

        foreach (var secret in new[] { "Hidden landing", "Summary secret", "Notes secret", "Prose secret", "Arc secret", "Description secret", "Premise secret" })
        {
            Assert.DoesNotContain(secret, body, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Selected_parts_are_read_in_the_authors_order_with_their_allow_lists_and_nothing_else()
    {
        var world = await PublicStory("parts-order");
        var o = world.Owner;

        // Chapters and titles chosen against the alphabet, so only the author's order can produce the expected lists.
        var late = await CreateChapter(o, world.U, world.Story, "Chapter title secret one");
        var early = await CreateChapter(o, world.U, world.Story, "Chapter title secret two");
        (await o.PutAsJsonAsync($"{Story(world.U, world.Story)}/chapters/order", new ChapterOrderRequest([early, late]))).EnsureSuccessStatusCode();

        var zed = await Scene(world, "Zed prologue", "Before anything.");
        var yak = await Scene(world, "Yak crossing", "Private outline", chapterId: late);
        var xylo = await Scene(world, "Xylo tide", null, chapterId: late, notes: "Scene notes secret");
        var apple = await Scene(world, "Apple harbour", "The harbour opens.", chapterId: early);

        await WriteManuscript(o, world.U, world.Story, yak, "Yak walks.\n\nThen runs.");
        await WriteManuscript(o, world.U, world.Story, apple, "The harbour opens its gates.");
        await WriteManuscript(o, world.U, world.Story, xylo, "Unpublished prose.");

        foreach (var scene in new[] { zed, xylo, apple })
        {
            await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/publish");
        }

        // Zed's prose is selected but empty: nothing to read, so nothing shown.
        foreach (var scene in new[] { apple, yak, zed })
        {
            await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/manuscript/publish");
        }

        var zeta = await CreateArc(o, world.U, world.Story, "Zeta arc", "What drives it.", "Arc notes secret");
        await CreateArc(o, world.U, world.Story, "Private arc");
        await CreateBeat(o, world.U, world.Story, zeta.Id, "Omega beat", scenes: [yak], description: "First.", notes: "Beat notes secret");
        var trashed = await CreateBeat(o, world.U, world.Story, zeta.Id, "Trashed beat");
        await CreateBeat(o, world.U, world.Story, zeta.Id, "Alpha beat");
        (await o.DeleteAsync(Beat(world.U, world.Story, trashed.Id))).EnsureSuccessStatusCode();
        await Part(o, $"{Arc(world.U, world.Story, zeta.Id)}/publish");

        var body = await Anonymous(_factory).GetStringAsync(world.Page);
        var page = JsonSerializer.Deserialize<PublicStoryDetail>(body, JsonSerializerOptions.Web)!;

        // Reading order: Unchaptered, then the chapters in their order, then each chapter's own order.
        Assert.Equal(["Zed prologue", "Apple harbour", "Xylo tide"], page.Scenes.Select(scene => scene.Title));
        Assert.Equal(["Before anything.", "The harbour opens.", null], page.Scenes.Select(scene => scene.Summary));
        Assert.Equal(
            [("Apple harbour", "The harbour opens its gates."), ("Yak crossing", "Yak walks.\n\nThen runs.")],
            page.Manuscript.Select(part => (part.Title, part.Text)));
        var arc = Assert.Single(page.Plot);
        Assert.Equal(("Zeta arc", "What drives it."), (arc.Title, arc.Description));
        Assert.Equal([("Omega beat", "First."), ("Alpha beat", null)], arc.Beats.Select(beat => (beat.Title, beat.Description)));

        using var document = JsonDocument.Parse(body);
        Assert.Equal(["summary", "title"], Keys(document.RootElement.GetProperty("scenes")[0]));
        Assert.Equal(["links", "text", "title"], Keys(document.RootElement.GetProperty("manuscript")[0]));
        Assert.Equal(["beats", "description", "title"], Keys(document.RootElement.GetProperty("plot")[0]));
        Assert.Equal(["description", "title"], Keys(document.RootElement.GetProperty("plot")[0].GetProperty("beats")[0]));

        foreach (var secret in new[] { "Private outline", "Unpublished prose", "Private arc", "Trashed beat", "notes secret", "Chapter title secret", "Premise secret" })
        {
            Assert.DoesNotContain(secret, body, StringComparison.OrdinalIgnoreCase);
        }

        Assert.False(AnyId().IsMatch(body), "An anonymous story page carries no id of any kind.");
    }

    [Fact]
    public async Task Private_parents_hide_selected_parts_and_publishing_them_again_brings_back_exactly_those()
    {
        var world = await PublicStory("parts-parents");
        var o = world.Owner;
        var scene = await Scene(world, "Kept selection", "Outline for readers.");
        await WriteManuscript(o, world.U, world.Story, scene, "Prose for readers.");
        var arc = await CreateArc(o, world.U, world.Story, "Kept arc");
        await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/publish");
        await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/manuscript/publish");
        await Part(o, $"{Arc(world.U, world.Story, arc.Id)}/publish");
        var anonymous = Anonymous(_factory);

        async Task Visible()
        {
            var page = (await anonymous.GetFromJsonAsync<PublicStoryDetail>(world.Page))!;
            Assert.Equal((1, 1, 1), (page.Scenes.Count, page.Manuscript.Count, page.Plot.Count));
        }

        async Task StillSelected()
        {
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(world.Page)).StatusCode);
            var stored = Assert.Single((await ReadStory(o, world.U, world.Story)).Scenes);
            Assert.Equal((ContentVisibility.Public, ContentVisibility.Public), (stored.Visibility, stored.ManuscriptVisibility));
            Assert.Equal(ContentVisibility.Public, Assert.Single(await Plot(o, world.U, world.Story)).Visibility);
        }

        await Visible();

        (await o.PostAsync($"{Story(world.U, world.Story)}/unpublish", null)).EnsureSuccessStatusCode();
        await StillSelected();
        (await o.PostAsync($"{Story(world.U, world.Story)}/publish", null)).EnsureSuccessStatusCode();
        await Visible();

        (await Unpublish(o, world.U)).EnsureSuccessStatusCode();
        await StillSelected();
        await Published(o, world.U);
        await Visible();

        // A part selected while its story is private says so, and is read the moment the story is.
        (await o.PostAsync($"{Story(world.U, world.Story)}/unpublish", null)).EnsureSuccessStatusCode();
        var late = await Scene(world, "Selected late", null);
        var state = await Part(o, $"{Story(world.U, world.Story)}/scenes/{late}/publish");
        Assert.Equal((ContentVisibility.Public, false), (state.Visibility, state.StoryIsPublic));
        (await o.PostAsync($"{Story(world.U, world.Story)}/publish", null)).EnsureSuccessStatusCode();
        Assert.Contains("Selected late", (await anonymous.GetFromJsonAsync<PublicStoryDetail>(world.Page))!.Scenes.Select(part => part.Title));
    }

    [Fact]
    public async Task Each_part_is_private_by_default_and_made_private_again_or_trashed_it_is_gone()
    {
        var world = await PublicStory("parts-matrix");
        var o = world.Owner;
        var scene = await Scene(world, "Matrix scene", "Outline.");
        await WriteManuscript(o, world.U, world.Story, scene, "Words.");
        var arc = await CreateArc(o, world.U, world.Story, "Matrix arc");
        var anonymous = Anonymous(_factory);

        var created = Assert.Single((await ReadStory(o, world.U, world.Story)).Scenes);
        Assert.Equal((ContentVisibility.Private, ContentVisibility.Private), (created.Visibility, created.ManuscriptVisibility));
        Assert.Equal(ContentVisibility.Private, arc.Visibility);

        async Task<PublicStoryDetail> Read() => (await anonymous.GetFromJsonAsync<PublicStoryDetail>(world.Page))!;

        // Each selection is its own: the outline does not publish the prose, nor the prose the outline.
        var state = await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/publish");
        Assert.Equal((ContentVisibility.Public, true), (state.Visibility, state.StoryIsPublic));
        Assert.Equal((1, 0, 0), Counts(await Read()));
        await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/unpublish");
        await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/manuscript/publish");
        Assert.Equal((0, 1, 0), Counts(await Read()));
        await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/manuscript/unpublish");
        Assert.Equal((0, 0, 0), Counts(await Read()));

        // Plot only on purpose - publishing everything else around it does not publish it - and idempotent.
        Assert.Equal((0, 0, 0), Counts(await Read()));
        await Part(o, $"{Arc(world.U, world.Story, arc.Id)}/publish");
        await Part(o, $"{Arc(world.U, world.Story, arc.Id)}/publish");
        Assert.Equal((0, 0, 1), Counts(await Read()));
        await Part(o, $"{Arc(world.U, world.Story, arc.Id)}/unpublish");
        Assert.Equal((0, 0, 0), Counts(await Read()));

        // The Trash hides a selected part; restoring it brings the selection back.
        await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/publish");
        await Part(o, $"{Arc(world.U, world.Story, arc.Id)}/publish");
        (await o.DeleteAsync($"{Story(world.U, world.Story)}/scenes/{scene}")).EnsureSuccessStatusCode();
        (await o.DeleteAsync(Arc(world.U, world.Story, arc.Id))).EnsureSuccessStatusCode();
        Assert.Equal((0, 0, 0), Counts(await Read()));
        (await o.PostAsync($"/api/universes/{world.U}/trash/scenes/{scene}/restore", null)).EnsureSuccessStatusCode();
        (await o.PostAsync($"/api/universes/{world.U}/trash/plot-arcs/{arc.Id}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal((1, 0, 1), Counts(await Read()));
    }

    [Fact]
    public async Task Only_the_owner_selects_a_part_and_only_a_live_part_of_that_story()
    {
        var world = await PublicStory("parts-owner");
        var o = world.Owner;
        var scene = await Scene(world, "Owned scene", null);
        var arc = await CreateArc(o, world.U, world.Story, "Owned arc");
        var other = await CreateStory(o, world.U, "Other story");
        var sceneRoute = $"{Story(world.U, world.Story)}/scenes/{scene}";

        Assert.Equal(HttpStatusCode.Unauthorized, (await Anonymous(_factory).PostAsync($"{sceneRoute}/publish", null)).StatusCode);

        var (stranger, _) = await Account(_factory, "parts-stranger");
        foreach (var route in new[] { $"{sceneRoute}/publish", $"{sceneRoute}/manuscript/publish", $"{Arc(world.U, world.Story, arc.Id)}/publish" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync(route, null)).StatusCode);
        }

        // A scene or arc only through its own story.
        Assert.Equal(HttpStatusCode.NotFound, (await o.PostAsync($"{Story(world.U, other)}/scenes/{scene}/publish", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await o.PostAsync($"{Arc(world.U, other, arc.Id)}/publish", null)).StatusCode);

        (await o.DeleteAsync(sceneRoute)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await o.PostAsync($"{sceneRoute}/publish", null)).StatusCode);
        Assert.Equal(ContentVisibility.Private, Assert.Single(await Plot(o, world.U, world.Story)).Visibility);
    }

    [Fact]
    public async Task Selecting_a_part_is_not_an_edit()
    {
        var world = await PublicStory("parts-not-edit");
        var o = world.Owner;
        var scene = await Scene(world, "Untouched", "Outline.");
        var arc = await CreateArc(o, world.U, world.Story, "Untouched arc");
        var before = await ReadStory(o, world.U, world.Story);

        await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/publish");
        await Part(o, $"{Story(world.U, world.Story)}/scenes/{scene}/manuscript/publish");
        await Part(o, $"{Arc(world.U, world.Story, arc.Id)}/publish");

        var after = await ReadStory(o, world.U, world.Story);
        Assert.Equal(before.UpdatedAt, after.UpdatedAt);
        Assert.Equal(Assert.Single(before.Scenes).UpdatedAt, Assert.Single(after.Scenes).UpdatedAt);
        Assert.Equal(arc.UpdatedAt, Assert.Single(await Plot(o, world.U, world.Story)).UpdatedAt);
    }

    // ---------- Helpers ----------

    private sealed record World(HttpClient Owner, Guid U, Guid Story, string Page);

    /// <summary>A public universe holding one public story, whose premise is a secret.</summary>
    private async Task<World> PublicStory(string tag)
    {
        var (owner, _) = await Account(_factory, tag);
        var universe = await Ready(owner, $"{tag} world");
        var story = (await PostJson<StoryDetail>(owner, Stories(universe.Id), new StoryRequest($"{tag} tale", "Premise secret.", StoryStatus.Drafting))).Id;
        (await owner.PutAsJsonAsync($"{Story(universe.Id, story)}/publication", new StoryPublicationRequest("For readers."))).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{Story(universe.Id, story)}/publish", null)).EnsureSuccessStatusCode();
        var world = await Published(owner, universe.Id);
        return new World(owner, universe.Id, story, $"{PublicRoute}/{world.PublicSlug}/stories/{tag}-tale");
    }

    private static async Task<Guid> Scene(World world, string title, string? summary, Guid? chapterId = null, string? notes = null) =>
        (await PostJson<SceneResponse>(
            world.Owner,
            $"{Story(world.U, world.Story)}/scenes",
            new SceneRequest(title, summary, notes, null, null, null, chapterId))).Id;

    private static Task WriteManuscript(HttpClient client, Guid u, Guid story, Guid scene, string text) =>
        ManuscriptTestClient.WriteManuscript(client, u, story, scene, text);

    private static async Task<StoryPartPublicationState> Part(HttpClient client, string route)
    {
        var response = await client.PostAsync(route, null);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<StoryPartPublicationState>())!;
    }

    private static (int Scenes, int Manuscript, int Plot) Counts(PublicStoryDetail page) =>
        (page.Scenes.Count, page.Manuscript.Count, page.Plot.Count);

    private static string[] Keys(JsonElement element) =>
        [.. element.EnumerateObject().Select(member => member.Name).Order(StringComparer.Ordinal)];

    [GeneratedRegex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")]
    private static partial Regex AnyId();
}
