using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The unified timeline (ADR 0009 amendment, 038): moments written on the timeline, live dated scenes and live entries' birth and
/// death years, in one world order, filtered, counted and paged as one stream. Scenes and facts are read from their source on
/// every request - nothing is copied - so editing, emptying, trashing or restoring the source moves the item with it.
/// </summary>
public sealed class TimelineFeedTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Helpers ----------

    private static string Items(Guid u, string query = "") => $"/api/universes/{u}/timeline/items{query}";

    private static async Task<TimelineItemPage> Feed(HttpClient client, Guid u, string query = "") =>
        (await client.GetFromJsonAsync<TimelineItemPage>(Items(u, query)))!;

    private static async Task<List<(TimelineSourceKind Kind, string Title)>> Read(HttpClient client, Guid u, string query = "") =>
        [.. (await Feed(client, u, query)).Items.Select(item => (item.SourceKind, item.Title))];

    private static SceneRequest SceneAt(string title, int? year, int? month = null, int? day = null, Guid? era = null, string? summary = null) =>
        new(title, summary, null, null, year is null ? null : new ChronologyValue(era, year, month, day), null);

    private static async Task<Guid> DatedScene(HttpClient client, Guid u, Guid story, string title, int? year, int? month = null, int? day = null, Guid? era = null, string? summary = null) =>
        (await PostJson<SceneResponse>(client, $"{Story(u, story)}/scenes", SceneAt(title, year, month, day, era, summary))).Id;

    private static Task<HttpResponseMessage> PutScene(HttpClient client, Guid u, Guid story, Guid scene, SceneRequest request) =>
        client.PutVersionedAsync($"{Story(u, story)}/scenes/{scene}", request);

    private static TimelineEntryRequest Moment(
        string title,
        int? year,
        IReadOnlyList<Guid>? stories = null,
        Guid? era = null,
        CanonStatus status = CanonStatus.Draft,
        string? description = null) =>
        new(
            title,
            description,
            status,
            year is null ? TimelineDateKind.Unknown : TimelineDateKind.Exact,
            year,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            era,
            null,
            null,
            stories);

    private static Task<HttpResponseMessage> PostMoment(HttpClient client, Guid u, TimelineEntryRequest request) =>
        client.PostAsJsonAsync($"/api/universes/{u}/timeline", request);

    private static async Task<TimelineEntryResponse> CreateMoment(HttpClient client, Guid u, TimelineEntryRequest request)
    {
        var response = await PostMoment(client, u, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;
    }

    private static Task<HttpResponseMessage> PutMoment(HttpClient client, Guid u, Guid id, TimelineEntryRequest request) =>
        client.PutAsJsonAsync($"/api/universes/{u}/timeline/{id}", request);

    private sealed record LoreFields(Guid TypeId, Guid Born, Guid Died, Guid Age, Guid Height, Guid Founded);

    private static async Task<LoreFields> Fields(HttpClient client, Guid u)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var type = types.First(candidate => candidate.Name == "Character").Id;

        async Task<Guid> Add(string name, EntityFieldKind kind, EntityFieldSemantic? semantic)
        {
            var response = await client.PostAsJsonAsync(
                $"/api/universes/{u}/entity-types/{type}/fields",
                new FieldDefinitionRequest(name, kind, false, null, null, null, semantic));
            response.EnsureSuccessStatusCode();
            return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Fields.First(field => field.Name == name).Id;
        }

        return new LoreFields(
            type,
            await Add("Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear),
            await Add("Died", EntityFieldKind.Number, EntityFieldSemantic.DeathYear),
            await Add("Age", EntityFieldKind.Number, EntityFieldSemantic.Age),
            await Add("Height", EntityFieldKind.Number, null),
            await Add("Founded", EntityFieldKind.Date, null));
    }

    private static FieldValueInput Number(Guid field, double value, Guid? era = null) =>
        new(field, null, value, null, null, null, null, era);

    private static EntityRequest Person(LoreFields fields, string name, CanonStatus status, params FieldValueInput[] values) =>
        new(fields.TypeId, name, null, status, null, null, values);

    private static async Task<Guid> CreatePerson(HttpClient client, Guid u, EntityRequest request) =>
        (await PostJson<EntityDetail>(client, $"/api/universes/{u}/entities", request)).Id;

    // ---------- Mixed order, paging, kinds ----------

    [Fact]
    public async Task Moments_scenes_and_lifespans_are_one_world_ordered_stream_never_the_narrative_order()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "feedmixed");
        var u = universe.Id;
        var story = await CreateStory(client, u, "The Last Kingdom");

        // Told first, happens later; told second, happens first; and one with no date at all.
        await DatedScene(client, u, story, "Coronation", 114, 3, 12);
        await DatedScene(client, u, story, "Aftermath", 100);
        await CreateScene(client, u, story, "Undated");

        var fields = await Fields(client, u);
        await CreatePerson(client, u, Person(
            fields,
            "Akron Wright",
            CanonStatus.Canon,
            Number(fields.Born, 113),
            Number(fields.Died, 160),
            Number(fields.Age, 47),
            Number(fields.Height, 105),
            new FieldValueInput(fields.Founded, null, null, null, new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc), null, null)));
        await CreateMoment(client, u, Moment("Fall of Armath", 115, status: CanonStatus.Canon));
        await CreateMoment(client, u, Moment("Someday", null));

        var all = await Feed(client, u);
        Assert.Equal(
            [
                (TimelineSourceKind.Scene, "Aftermath"),
                (TimelineSourceKind.LoreFact, "Akron Wright"),
                (TimelineSourceKind.Scene, "Coronation"),
                (TimelineSourceKind.Event, "Fall of Armath"),
                (TimelineSourceKind.LoreFact, "Akron Wright"),
                (TimelineSourceKind.Event, "Someday"),
            ],
            all.Items.Select(item => (item.SourceKind, item.Title)));
        Assert.Equal(6, all.TotalCount);

        // Each item carries exactly its own kind's source, and only that.
        var born = all.Items[1];
        Assert.Equal((EntityFieldSemantic.BirthYear, CanonStatus.Canon), (born.LoreFact!.Fact, born.LoreFact.CanonStatus));
        Assert.Equal((113, TimelineDatePrecision.Year), (born.Date.StartYear, born.Date.StartPrecision));
        Assert.Null(born.Event);
        Assert.Null(born.Scene);
        Assert.Equal(EntityFieldSemantic.DeathYear, all.Items[4].LoreFact!.Fact);

        var coronation = all.Items[2];
        Assert.Equal(
            (TimelineDateKind.Exact, 114, 3, 12, TimelineDatePrecision.Day),
            (coronation.Date.Kind, coronation.Date.StartYear, coronation.Date.StartMonth, coronation.Date.StartDay, coronation.Date.StartPrecision));
        Assert.Equal(("The Last Kingdom", (int?)null), (coronation.Scene!.StoryTitle, coronation.Scene.ChapterNumber));
        Assert.Null(coronation.Event);
        Assert.Null(coronation.LoreFact);

        Assert.Equal(CanonStatus.Canon, all.Items[3].Event!.CanonStatus);
        Assert.Equal(TimelineDateKind.Unknown, all.Items[5].Date.Kind);

        // One total, one page at a time, across every kind.
        var pages = new List<TimelineItem>();
        for (var page = 1; page <= 3; page++)
        {
            var slice = await Feed(client, u, $"?pageSize=2&page={page}");
            Assert.Equal((6, 3), (slice.TotalCount, slice.TotalPages));
            pages.AddRange(slice.Items);
        }

        Assert.Equal(all.Items.Select(item => (item.SourceKind, item.SourceId)), pages.Select(item => (item.SourceKind, item.SourceId)));

        // Each source alone.
        Assert.Equal(2, (await Feed(client, u, "?source=0")).TotalCount);
        Assert.Equal(["Aftermath", "Coronation"], (await Read(client, u, "?source=1")).Select(item => item.Title));
        Assert.Equal(2, (await Feed(client, u, "?source=2")).TotalCount);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(Items(u, "?source=9"))).StatusCode);

        // A status is a moment's or an entry's; a scene has none, so a status leaves scenes out.
        Assert.Equal(
            [(TimelineSourceKind.LoreFact, "Akron Wright"), (TimelineSourceKind.Event, "Fall of Armath"), (TimelineSourceKind.LoreFact, "Akron Wright")],
            await Read(client, u, $"?canonStatus={(int)CanonStatus.Canon}"));
    }

    [Fact]
    public async Task Search_reads_each_source_by_its_own_words()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "feedsearch");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Ashes of Velm");
        await DatedScene(client, u, story, "The bridge", 10, summary: "Mira burns the bridge.");
        await DatedScene(client, u, story, "The gate", 11);
        var fields = await Fields(client, u);
        await CreatePerson(client, u, Person(fields, "Mira Vane", CanonStatus.Draft, Number(fields.Born, 5)));
        await CreateMoment(client, u, Moment("The long dark", 12, description: "Velm goes quiet."));

        Assert.Equal([(TimelineSourceKind.Scene, "The bridge")], await Read(client, u, "?search=bridge"));
        Assert.Equal(
            [(TimelineSourceKind.LoreFact, "Mira Vane"), (TimelineSourceKind.Scene, "The bridge")],
            await Read(client, u, "?search=mira"));
        Assert.Equal(
            [(TimelineSourceKind.Scene, "The bridge"), (TimelineSourceKind.Scene, "The gate"), (TimelineSourceKind.Event, "The long dark")],
            await Read(client, u, "?search=velm"));
        Assert.Empty((await Feed(client, u, "?search=100%25")).Items);
    }

    [Fact]
    public async Task Scenes_and_lifespans_follow_the_universes_date_periods()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "feederas");
        var u = universe.Id;
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{u}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear),
            ]));
        response.EnsureSuccessStatusCode();
        var eras = (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
        var (before, after) = (eras[0].Id, eras[1].Id);

        var story = await CreateStory(client, u, "Fallen");
        await DatedScene(client, u, story, "Late before", 2, era: before);
        await DatedScene(client, u, story, "Early after", 1, era: after);
        var fields = await Fields(client, u);
        await CreatePerson(client, u, Person(fields, "Old Tam", CanonStatus.Draft, Number(fields.Born, 40, before), Number(fields.Died, 3, after)));
        await CreateMoment(client, u, Moment("The Fall", null));
        await CreateMoment(client, u, Moment("Mid after", 2, era: after));

        Assert.Equal(
            ["Old Tam", "Late before", "Early after", "Mid after", "Old Tam", "The Fall"],
            (await Read(client, u)).Select(item => item.Title));
        Assert.Equal(before, (await Feed(client, u)).Items[0].Date.StartEraId);
    }

    // ---------- Scenes: the scene is the source ----------

    [Fact]
    public async Task A_scene_item_follows_its_scene_and_story_through_dates_names_and_the_trash()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "feedscene");
        var u = universe.Id;
        var story = await CreateStory(client, u, "The Last Kingdom");
        var scene = await CreateScene(client, u, story, "Coronation");
        await CreateMoment(client, u, Moment("Anchor", 50));

        Assert.Equal(["Anchor"], (await Read(client, u)).Select(item => item.Title));

        // A date added: it appears. Changed: it moves. Removed: it is gone. No timeline call anywhere.
        (await PutScene(client, u, story, scene, SceneAt("Coronation", 10))).EnsureSuccessStatusCode();
        Assert.Equal(["Coronation", "Anchor"], (await Read(client, u)).Select(item => item.Title));

        (await PutScene(client, u, story, scene, SceneAt("Coronation", 90))).EnsureSuccessStatusCode();
        Assert.Equal(["Anchor", "Coronation"], (await Read(client, u)).Select(item => item.Title));
        Assert.Equal(90, (await Feed(client, u)).Items[1].Date.StartYear);

        (await PutScene(client, u, story, scene, SceneAt("Crowning", 90))).EnsureSuccessStatusCode();
        (await client.PutVersionedAsync(Story(u, story), new StoryRequest("The Lost Kingdom", null, StoryStatus.Drafting))).EnsureSuccessStatusCode();
        var renamed = (await Feed(client, u)).Items[1];
        Assert.Equal(("Crowning", "The Lost Kingdom"), (renamed.Title, renamed.Scene!.StoryTitle));

        (await PutScene(client, u, story, scene, SceneAt("Crowning", null))).EnsureSuccessStatusCode();
        Assert.Equal(["Anchor"], (await Read(client, u)).Select(item => item.Title));

        // The Trash: the scene's, then its story's. Each restore brings it back where it was.
        (await PutScene(client, u, story, scene, SceneAt("Crowning", 90))).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"{Story(u, story)}/scenes/{scene}")).EnsureSuccessStatusCode();
        Assert.Equal(["Anchor"], (await Read(client, u)).Select(item => item.Title));
        (await client.PostAsync($"/api/universes/{u}/trash/scenes/{scene}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(["Anchor", "Crowning"], (await Read(client, u)).Select(item => item.Title));
        Assert.Equal(90, (await Feed(client, u)).Items[1].Date.StartYear);

        (await client.DeleteAsync(Story(u, story))).EnsureSuccessStatusCode();
        Assert.Equal(["Anchor"], (await Read(client, u)).Select(item => item.Title));
        (await client.PostAsync($"/api/universes/{u}/trash/stories/{story}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(["Anchor", "Crowning"], (await Read(client, u)).Select(item => item.Title));

        // Nothing was ever written to the timeline for it.
        await WithDb(_factory, async db =>
            Assert.Equal(1, await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.CountAsync(
                db.TimelineEntries, entry => entry.UniverseId == u)));
    }

    [Fact]
    public async Task A_scene_carries_its_chapter_by_position_and_its_first_beat()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "feedcontext");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Plotted");
        await CreateChapter(client, u, story, "Prologue");
        var chapter = await CreateChapter(client, u, story, "Ashes");
        var scene = (await PostJson<SceneResponse>(
            client, $"{Story(u, story)}/scenes", SceneAt("Ember", 5) with { ChapterId = chapter })).Id;
        var arc = await CreateArc(client, u, story, "Fall");
        var beat = await CreateBeat(client, u, story, arc.Id, "The spark", scenes: [scene]);
        await CreateBeat(client, u, story, arc.Id, "The blaze", scenes: [scene]);

        var item = (await Feed(client, u)).Items.Single();
        Assert.Equal((chapter, 2, "Ashes", beat.Id, 2), (item.Scene!.ChapterId, item.Scene.ChapterNumber, item.Scene.ChapterTitle, item.Scene.PlotBeatId, item.Scene.PlotBeatCount));
    }

    // ---------- Lore facts: the entry is the source ----------

    [Fact]
    public async Task Only_birth_and_death_years_of_live_entries_are_read_and_they_follow_the_entry()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "feedlore");
        var u = universe.Id;
        var fields = await Fields(client, u);
        var akron = await CreatePerson(client, u, Person(fields, "Akron Wright", CanonStatus.Idea, Number(fields.Born, 113), Number(fields.Age, 30)));
        await CreatePerson(client, u, Person(fields, "Half year", CanonStatus.Draft, Number(fields.Born, 113.5)));

        var facts = await Feed(client, u);
        var only = Assert.Single(facts.Items);
        Assert.Equal((akron, CanonStatus.Idea, 113), (only.LoreFact!.EntityId, only.LoreFact.CanonStatus, only.Date.StartYear));

        // The year changed, then a death added: it moves, and a second fact appears.
        (await client.PutVersionedAsync(
            $"/api/universes/{u}/entities/{akron}",
            Person(fields, "Akron Wright", CanonStatus.Draft, Number(fields.Born, 120), Number(fields.Died, 170)))).EnsureSuccessStatusCode();
        var moved = await Feed(client, u);
        Assert.Equal([(120, EntityFieldSemantic.BirthYear), (170, EntityFieldSemantic.DeathYear)], moved.Items.Select(item => (item.Date.StartYear!.Value, item.LoreFact!.Fact)));
        Assert.All(moved.Items, item => Assert.Equal(CanonStatus.Draft, item.LoreFact!.CanonStatus));

        // The value removed: gone.
        (await client.PutVersionedAsync(
            $"/api/universes/{u}/entities/{akron}",
            Person(fields, "Akron Wright", CanonStatus.Draft, Number(fields.Died, 170)))).EnsureSuccessStatusCode();
        Assert.Equal([EntityFieldSemantic.DeathYear], (await Feed(client, u)).Items.Select(item => item.LoreFact!.Fact));

        // The field no longer means a death year: gone, though the number is still stored.
        (await client.PutFieldAsync(u, fields.TypeId, fields.Died, new FieldDefinitionRequest("Died", EntityFieldKind.Number, false, null, null, null, null))).EnsureSuccessStatusCode();
        Assert.Empty((await Feed(client, u)).Items);

        (await client.PutFieldAsync(u, fields.TypeId, fields.Died, new FieldDefinitionRequest("Died", EntityFieldKind.Number, false, null, null, null, EntityFieldSemantic.DeathYear))).EnsureSuccessStatusCode();
        Assert.Single((await Feed(client, u)).Items);

        // The entry to the Trash and back.
        (await client.DeleteAsync($"/api/universes/{u}/entities/{akron}")).EnsureSuccessStatusCode();
        Assert.Empty((await Feed(client, u)).Items);
        (await client.PostAsync($"/api/universes/{u}/trash/{akron}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(170, Assert.Single((await Feed(client, u)).Items).Date.StartYear);
    }

    // ---------- A story's timeline ----------

    [Fact]
    public async Task A_story_reads_its_dated_scenes_and_the_moments_linked_to_it_and_nothing_else()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "feedstory");
        var u = universe.Id;
        var a = await CreateStory(client, u, "Story A");
        var b = await CreateStory(client, u, "Story B");
        await DatedScene(client, u, a, "Scene A", 3);
        await DatedScene(client, u, b, "Scene B", 4);
        await CreateMoment(client, u, Moment("Event A", 5, [a]));
        await CreateMoment(client, u, Moment("Event B", 6, [b]));
        await CreateMoment(client, u, Moment("Event A and B", 7, [a, b]));
        await CreateMoment(client, u, Moment("Unrelated", 8));
        var fields = await Fields(client, u);
        await CreatePerson(client, u, Person(fields, "Everyone's ancestor", CanonStatus.Draft, Number(fields.Born, 1)));

        Assert.Equal(["Scene A", "Event A", "Event A and B"], (await Read(client, u, $"?storyId={a}")).Select(item => item.Title));
        Assert.Equal(["Scene B", "Event B", "Event A and B"], (await Read(client, u, $"?storyId={b}")).Select(item => item.Title));
        Assert.Equal(3, (await Feed(client, u, $"?storyId={a}")).TotalCount);

        // Composes with the source; facts are never a story's, even asked for by name.
        Assert.Equal(["Event A", "Event A and B"], (await Read(client, u, $"?storyId={a}&source=0")).Select(item => item.Title));
        Assert.Empty((await Feed(client, u, $"?storyId={a}&source=2")).Items);
        Assert.Equal(7, (await Feed(client, u)).TotalCount);

        // Another universe's story, or none, narrows to nothing rather than saying whose it is.
        Assert.Empty((await Feed(client, u, $"?storyId={Guid.NewGuid()}")).Items);
    }

    [Fact]
    public async Task A_moments_stories_are_its_own_universes_kept_through_the_trash_and_replaced_only_when_sent()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "feedlinks");
        var u = universe.Id;
        var a = await CreateStory(client, u, "Alpha");
        var b = await CreateStory(client, u, "Beta");
        var foreign = await CreateStory(client, (await CreateUniverse(client, "Elsewhere")).Id, "Foreign");

        var none = await CreateMoment(client, u, Moment("None", 1));
        Assert.Empty(none.Stories!);

        // Several, sent twice over: linked once each, by title.
        var several = await CreateMoment(client, u, Moment("Several", 2, [b, a, a]));
        Assert.Equal([("Alpha", false), ("Beta", false)], several.Stories!.Select(story => (story.Title, story.IsTrashed)));

        // Another universe's story is refused exactly as one that does not exist.
        var intoForeign = await PostMoment(client, u, Moment("Foreign", 3, [foreign]));
        var intoNothing = await PostMoment(client, u, Moment("Foreign", 3, [Guid.NewGuid()]));
        Assert.Equal(HttpStatusCode.BadRequest, intoForeign.StatusCode);
        Assert.Equal(await Errors(intoNothing), await Errors(intoForeign));

        // A save that says nothing of stories keeps them; an empty list clears them.
        var kept = await PutMoment(client, u, several.Id, Moment("Several, renamed", 2));
        Assert.Equal(2, (await kept.Content.ReadFromJsonAsync<TimelineEntryResponse>())!.Stories!.Count);

        // Alpha to the Trash: the link stays, Alpha's timeline is closed, and an edit sending it back keeps it.
        (await client.DeleteAsync(Story(u, a))).EnsureSuccessStatusCode();
        Assert.Empty((await Feed(client, u, $"?storyId={a}")).Items);
        var withTrashed = await PutMoment(client, u, several.Id, Moment("Several, renamed", 2, [a, b]));
        withTrashed.EnsureSuccessStatusCode();
        Assert.Equal([("Alpha", true), ("Beta", false)], (await withTrashed.Content.ReadFromJsonAsync<TimelineEntryResponse>())!.Stories!.Select(story => (story.Title, story.IsTrashed)));

        // But a story in the Trash cannot be newly linked.
        Assert.Equal(HttpStatusCode.BadRequest, (await PutMoment(client, u, none.Id, Moment("None", 1, [a]))).StatusCode);

        (await client.PostAsync($"/api/universes/{u}/trash/stories/{a}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(["Several, renamed"], (await Read(client, u, $"?storyId={a}")).Select(item => item.Title));

        var cleared = await PutMoment(client, u, several.Id, Moment("Several, renamed", 2, []));
        Assert.Empty((await cleared.Content.ReadFromJsonAsync<TimelineEntryResponse>())!.Stories!);
        Assert.Empty((await Feed(client, u, $"?storyId={b}")).Items);

        // A story deleted for good takes only the link: the moment stays.
        (await PutMoment(client, u, several.Id, Moment("Several, renamed", 2, [a, b]))).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Story(u, b))).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"/api/universes/{u}/trash/stories/{b}")).EnsureSuccessStatusCode();
        var survivor = (await client.GetFromJsonAsync<TimelineEntryResponse>($"/api/universes/{u}/timeline/{several.Id}"))!;
        Assert.Equal(["Alpha"], survivor.Stories!.Select(story => story.Title));
    }

    [Fact]
    public async Task Every_member_reads_the_timeline_and_only_editors_link_stories()
    {
        var (owner, ownerId) = await PublishingTestClient.Account(_factory, "feedroles-owner");
        var u = (await CreateUniverse(owner, "Shared timeline")).Id;
        var story = await CreateStory(owner, u, "Shared story");
        await DatedScene(owner, u, story, "Shared scene", 1);
        var moment = await CreateMoment(owner, u, Moment("Shared moment", 2));

        var (editor, editorId) = await PublishingTestClient.Account(_factory, "feedroles-editor");
        var (reviewer, reviewerId) = await PublishingTestClient.Account(_factory, "feedroles-reviewer");
        var (viewer, viewerId) = await PublishingTestClient.Account(_factory, "feedroles-viewer");
        var (outsider, _) = await PublishingTestClient.Account(_factory, "feedroles-outsider");
        await CollaborationTestClient.Join(_factory, u, editorId, UniverseRole.Editor);
        await CollaborationTestClient.Join(_factory, u, reviewerId, UniverseRole.Reviewer);
        await CollaborationTestClient.Join(_factory, u, viewerId, UniverseRole.Viewer);

        foreach (var member in new[] { owner, editor, reviewer, viewer })
        {
            Assert.Equal(2, (await Feed(member, u)).TotalCount);
        }

        Assert.False((await outsider.GetAsync(Items(u))).IsSuccessStatusCode);

        foreach (var reader in new[] { reviewer, viewer })
        {
            Assert.False((await PutMoment(reader, u, moment.Id, Moment("Shared moment", 2, [story]))).IsSuccessStatusCode);
        }

        Assert.Empty((await Feed(owner, u, $"?storyId={story}&source=0")).Items);
        (await PutMoment(editor, u, moment.Id, Moment("Shared moment", 2, [story]))).EnsureSuccessStatusCode();
        Assert.Equal(["Shared scene", "Shared moment"], (await Read(viewer, u, $"?storyId={story}")).Select(item => item.Title));
        _ = ownerId;
    }

    // ---------- Cost ----------

    [Fact]
    public async Task A_page_costs_the_same_number_of_queries_however_many_items_of_every_kind_it_holds()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "feedcount");
        var u = universe.Id;
        var story = await CreateStory(client, u, "Counted");
        var fields = await Fields(client, u);
        var arc = await CreateArc(client, u, story, "Arc");

        var counts = new List<(int Items, int Queries)>();
        var made = 0;
        foreach (var target in new[] { 1, 12, 60 })
        {
            for (; made < target; made++)
            {
                switch (made % 3)
                {
                    case 0:
                        await CreateMoment(client, u, Moment($"Moment {made}", made, [story]));
                        break;
                    case 1:
                        var scene = await DatedScene(client, u, story, $"Scene {made}", made);
                        await CreateBeat(client, u, story, arc.Id, $"Beat {made}", scenes: [scene]);
                        break;
                    default:
                        await CreatePerson(client, u, Person(fields, $"Person {made}", CanonStatus.Draft, Number(fields.Born, made)));
                        break;
                }
            }

            var first = await Feed(client, u, "?pageSize=100");
            Assert.Equal(target, first.Items.Count);
            Assert.Contains(first.Items, item => item.SourceKind == TimelineSourceKind.Event) ;
            string[] keys = [u.ToString(), .. first.Items.Select(item => item.SourceId.ToString())];

            using var counter = new CommandCounter(keys);
            await Feed(client, u, "?pageSize=100");
            counts.Add((target, counter.Count));
        }

        // Access, the era check, the count, the page, and one read per kind present on it.
        Assert.Equal(5, counts[0].Queries);
        Assert.Equal(7, counts[1].Queries);
        Assert.Equal(7, counts[2].Queries);
    }

    [Fact]
    public async Task A_moment_trashed_between_choosing_the_page_and_reading_it_is_left_out()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "feedtrashrace");
        var u = universe.Id;
        await CreateMoment(client, u, Moment("Kept", 1));
        var late = await CreateMoment(client, u, Moment("Trashed late", 2));

        // The feed reads twice: the page of ids, then each moment whole. Right after the page is chosen, before the moments
        // are read, the moment goes to the Trash - on the same connection, as another request's write would land between.
        var paged = false;
        var trashed = false;
        _factory.Commands.FailWhen = command =>
        {
            if (paged && !trashed)
            {
                trashed = true;
                using var update = command.Connection!.CreateCommand();
                update.Transaction = command.Transaction;
                update.CommandText = "UPDATE \"TimelineEntries\" SET \"DeletedAt\" = $now WHERE \"Id\" = $id";
                update.Parameters.Add(new Microsoft.Data.Sqlite.SqliteParameter("$now", DateTime.UtcNow));
                update.Parameters.Add(new Microsoft.Data.Sqlite.SqliteParameter("$id", late.Id));
                update.ExecuteNonQuery();
            }
            else if (command.CommandText.Contains("UNION ALL", StringComparison.Ordinal)
                && command.CommandText.Contains("LIMIT", StringComparison.Ordinal))
            {
                paged = true;
            }

            return false;
        };

        TimelineItemPage page;
        try
        {
            page = await Feed(client, u);
        }
        finally
        {
            _factory.Commands.FailWhen = null;
        }

        Assert.True(trashed, "The race was never staged: no read followed the page query.");
        Assert.Equal(["Kept"], page.Items.Select(item => item.Title));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/universes/{u}/timeline/{late.Id}")).StatusCode);
    }
}
