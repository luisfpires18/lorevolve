using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Universes;
using static LorEvolve.Api.Tests.IdeaTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// A story's ideas (ADR 0030 amendment): the account's own ideas in that universe with an explicit reference to the story,
/// or to one of its scenes, arcs or beats. A view of the one idea list, never a second kind of idea: filtered in the
/// database before the count and the page, one row per idea, and never reachable by anyone but the ideas' owner.
/// </summary>
public sealed class IdeaStoryScopeTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private sealed record Parts(Guid Id, Guid Scene, Guid Arc, Guid Beat);

    private static async Task<Parts> BuildStory(HttpClient client, Guid universeId, string title)
    {
        var story = await CreateStory(client, universeId, title);
        var scene = await CreateScene(client, universeId, story, $"{title} scene");
        var arc = await CreateArc(client, universeId, story, $"{title} arc");
        var beat = await CreateBeat(client, universeId, story, arc.Id, $"{title} beat");
        return new Parts(story, scene, arc.Id, beat.Id);
    }

    private static string StoryQuery(Guid universeId, Guid storyId, string extra = "") =>
        $"?universeId={universeId}&storyId={storyId}{extra}";

    [Fact]
    public async Task A_story_lists_ideas_naming_it_or_any_of_its_parts_once_each_and_nothing_else()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideastorymatch");
        var a = await BuildStory(client, universe.Id, "Story A");
        var b = await BuildStory(client, universe.Id, "Story B");

        await CreateIdea(client, "Direct", universeId: universe.Id, references: [Ref(IdeaReferenceKind.Story, a.Id)]);
        await CreateIdea(client, "Via scene", universeId: universe.Id, references: [Ref(IdeaReferenceKind.Scene, a.Scene)]);
        await CreateIdea(client, "Via arc", universeId: universe.Id, references: [Ref(IdeaReferenceKind.PlotArc, a.Arc)]);
        await CreateIdea(client, "Via beat", universeId: universe.Id, references: [Ref(IdeaReferenceKind.PlotBeat, a.Beat)]);
        await CreateIdea(
            client,
            "Many parts",
            universeId: universe.Id,
            references:
            [
                Ref(IdeaReferenceKind.Story, a.Id),
                Ref(IdeaReferenceKind.Scene, a.Scene),
                Ref(IdeaReferenceKind.PlotArc, a.Arc),
                Ref(IdeaReferenceKind.PlotBeat, a.Beat),
            ]);
        await CreateIdea(
            client,
            "Both stories",
            universeId: universe.Id,
            references: [Ref(IdeaReferenceKind.Scene, a.Scene), Ref(IdeaReferenceKind.Story, b.Id)]);
        await CreateIdea(client, "Story B only", universeId: universe.Id, references: [Ref(IdeaReferenceKind.PlotBeat, b.Beat)]);
        await CreateIdea(client, "Universe only", universeId: universe.Id);
        await CreateIdea(client, "Unassigned");

        // A title naming the story is never read: only references count.
        await CreateIdea(client, "Story A", "Story A scene, Story A arc.", universe.Id);

        var storyA = await ListIdeas(client, StoryQuery(universe.Id, a.Id));
        Assert.Equal(
            ["Both stories", "Direct", "Many parts", "Via arc", "Via beat", "Via scene"],
            storyA.Items.Select(item => item.Title).Order(StringComparer.Ordinal));
        Assert.Equal(6, storyA.TotalCount);
        Assert.Equal(4, storyA.Items.Single(item => item.Title == "Many parts").ReferenceCount);

        Assert.Equal(
            ["Both stories", "Story B only"],
            (await ListedTitles(client, StoryQuery(universe.Id, b.Id))).Order(StringComparer.Ordinal));

        // The universe and account views are untouched: every idea is still there, once.
        Assert.Equal(9, (await ListIdeas(client, $"?universeId={universe.Id}")).TotalCount);
        Assert.Equal(10, (await ListIdeas(client)).TotalCount);
    }

    [Fact]
    public async Task Search_and_paging_work_inside_the_story_and_count_only_its_ideas()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideastorypage");
        var a = await BuildStory(client, universe.Id, "Paged");
        var other = await BuildStory(client, universe.Id, "Elsewhere");

        for (var i = 1; i <= 5; i++)
        {
            await CreateIdea(
                client,
                $"Council {i}",
                i % 2 == 0 ? "The tide turns." : null,
                universe.Id,
                [Ref(IdeaReferenceKind.Scene, a.Scene), Ref(IdeaReferenceKind.PlotBeat, a.Beat)]);
        }

        for (var i = 1; i <= 4; i++)
        {
            await CreateIdea(client, $"Council elsewhere {i}", "The tide turns.", universe.Id, [Ref(IdeaReferenceKind.Story, other.Id)]);
        }

        var first = await ListIdeas(client, StoryQuery(universe.Id, a.Id, "&pageSize=2"));
        var second = await ListIdeas(client, StoryQuery(universe.Id, a.Id, "&pageSize=2&page=2"));
        var third = await ListIdeas(client, StoryQuery(universe.Id, a.Id, "&pageSize=2&page=3"));
        Assert.Equal((5, 3), (first.TotalCount, first.TotalPages));
        Assert.Equal([2, 2, 1], new[] { first, second, third }.Select(page => page.Items.Count));
        Assert.Equal(
            5,
            first.Items.Concat(second.Items).Concat(third.Items).Select(item => item.Id).Distinct().Count());

        // Search narrows within the story: by title, and by body.
        Assert.Equal(5, (await ListIdeas(client, StoryQuery(universe.Id, a.Id, "&search=council"))).TotalCount);
        Assert.Equal(
            ["Council 2", "Council 4"],
            (await ListedTitles(client, StoryQuery(universe.Id, a.Id, "&search=tide"))).Order(StringComparer.Ordinal));
        Assert.Empty((await ListIdeas(client, StoryQuery(universe.Id, a.Id, "&search=elsewhere"))).Items);
    }

    [Fact]
    public async Task A_deleted_story_idea_is_in_the_storys_recently_deleted_and_comes_back_to_the_story()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideastorydeleted");
        var a = await BuildStory(client, universe.Id, "Kept");
        var idea = await CreateIdea(client, "Through the arc", universeId: universe.Id, references: [Ref(IdeaReferenceKind.PlotArc, a.Arc)]);
        await CreateIdea(client, "Deleted elsewhere", universeId: universe.Id);

        (await client.DeleteAsync(Idea(idea.Id))).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Idea((await ListIdeas(client, $"?universeId={universe.Id}")).Items.Single().Id)))
            .EnsureSuccessStatusCode();

        Assert.Empty((await ListIdeas(client, StoryQuery(universe.Id, a.Id))).Items);
        Assert.Equal(["Through the arc"], await ListedTitles(client, StoryQuery(universe.Id, a.Id, "&deleted=true")));

        (await client.PostAsync($"{Idea(idea.Id)}/restore", content: null)).EnsureSuccessStatusCode();

        Assert.Equal(["Through the arc"], await ListedTitles(client, StoryQuery(universe.Id, a.Id)));
        Assert.Empty((await ListIdeas(client, StoryQuery(universe.Id, a.Id, "&deleted=true"))).Items);
    }

    [Fact]
    public async Task A_story_filter_needs_its_universe_and_answers_a_wrong_or_foreign_story_as_missing()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "ideastorysafe");
        var second = await CreateUniverse(owner, "Second world");
        var a = await BuildStory(owner, universe.Id, "Private");
        await CreateIdea(owner, "Secret", universeId: universe.Id, references: [Ref(IdeaReferenceKind.Story, a.Id)]);

        var alone = await owner.GetAsync($"{Ideas}?storyId={a.Id}");
        Assert.Equal(HttpStatusCode.BadRequest, alone.StatusCode);
        Assert.Contains("storyId", await Errors(alone), StringComparison.Ordinal);

        // A story asked for under another of the owner's universes, a story that does not exist, and one in the Trash.
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"{Ideas}{StoryQuery(second.Id, a.Id)}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound, (await owner.GetAsync($"{Ideas}{StoryQuery(universe.Id, Guid.NewGuid())}")).StatusCode);
        var binned = await CreateStory(owner, universe.Id, "Binned");
        (await owner.DeleteAsync(PlotTestClient.Story(universe.Id, binned))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"{Ideas}{StoryQuery(universe.Id, binned)}")).StatusCode);

        // Another account answers exactly as for a story that does not exist, under either universe.
        var (intruder, intruderUniverse) = await SignedInWithUniverse(_factory, "ideastoryintruder");
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.GetAsync($"{Ideas}{StoryQuery(universe.Id, a.Id)}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound, (await intruder.GetAsync($"{Ideas}{StoryQuery(intruderUniverse.Id, a.Id)}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await intruder.GetAsync($"{Ideas}{StoryQuery(universe.Id, a.Id, "&deleted=true")}")).StatusCode);

        // A collaborator of every role is no closer: the owner's ideas are not shared with the universe.
        foreach (var role in new[] { UniverseRole.Editor, UniverseRole.Reviewer, UniverseRole.Viewer })
        {
            var (member, memberId) = await PublishingTestClient.Account(_factory, $"ideastory-{role}".ToLowerInvariant());
            await CollaborationTestClient.Join(_factory, universe.Id, memberId, role);

            Assert.Equal(HttpStatusCode.NotFound, (await member.GetAsync($"{Ideas}{StoryQuery(universe.Id, a.Id)}")).StatusCode);
            Assert.Empty((await ListIdeas(member, $"?universeId={universe.Id}")).Items);
            Assert.Empty((await ListIdeas(member)).Items);
        }

        Assert.Equal(["Secret"], await ListedTitles(owner, StoryQuery(universe.Id, a.Id)));
    }

    [Fact]
    public async Task Quick_capture_is_the_ordinary_create_with_the_scope_as_its_starting_place()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideaquick");
        var a = await BuildStory(client, universe.Id, "Captured");

        // What the three lists send: a title, nothing else, and the place it was typed in.
        var anywhere = await CreateIdea(client, "A loose thought");
        var inUniverse = await CreateIdea(client, "A world thought", universeId: universe.Id, references: []);
        var inStory = await CreateIdea(
            client, "What if the council already knows?", universeId: universe.Id, references: [Ref(IdeaReferenceKind.Story, a.Id)]);

        Assert.Equal(("", (Guid?)null, 0), (anywhere.Body, anywhere.Universe?.Id, anywhere.References.Count));
        Assert.Equal(("", (Guid?)universe.Id, 0), (inUniverse.Body, inUniverse.Universe?.Id, inUniverse.References.Count));
        Assert.Equal(("", (Guid?)universe.Id), (inStory.Body, inStory.Universe?.Id));
        Assert.Equal((IdeaReferenceKind.Story, a.Id), (inStory.References.Single().Kind, inStory.References.Single().Id));

        Assert.Equal(["What if the council already knows?"], await ListedTitles(client, StoryQuery(universe.Id, a.Id)));
        Assert.Equal(
            ["A world thought", "What if the council already knows?"],
            (await ListedTitles(client, $"?universeId={universe.Id}")).Order(StringComparer.Ordinal));

        // The server stays the judge of a title, whatever the client checked first.
        var blank = await client.PostAsJsonAsync(Ideas, new IdeaRequest("   ", null, universe.Id, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
        Assert.Contains("title", await Errors(blank), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Every_scope_reads_a_page_in_a_fixed_number_of_commands_however_many_ideas_match()
    {
        var (client, ownerId) = await PublishingTestClient.Account(_factory, "ideastorycount");
        var universe = await CreateUniverse(client, "Counted");
        var a = await BuildStory(client, universe.Id, "Counted story");

        var counts = new List<(int Matching, int All, int Universe, int Story)>();
        var created = 0;
        foreach (var target in new[] { 1, 12, 50 })
        {
            for (; created < target; created++)
            {
                // Each idea names several parts of the story, so a per-reference read would show.
                await CreateIdea(
                    client,
                    $"Idea {created}",
                    universeId: universe.Id,
                    references:
                    [
                        Ref(IdeaReferenceKind.Story, a.Id),
                        Ref(IdeaReferenceKind.Scene, a.Scene),
                        Ref(IdeaReferenceKind.PlotBeat, a.Beat),
                    ]);
            }

            counts.Add((
                target,
                await Count(ownerId, () => ListIdeas(client, "?pageSize=50")),
                await Count(ownerId, () => ListIdeas(client, $"?universeId={universe.Id}&pageSize=50")),
                await Count(ownerId, async () =>
                {
                    var page = await ListIdeas(client, StoryQuery(universe.Id, a.Id, "&pageSize=50"));
                    Assert.Equal(target, page.Items.Count);
                    return page;
                })));
        }

        // A count and a page; a story's list also confirms the story is the caller's.
        Assert.All(counts, row => Assert.Equal((2, 2, 3), (row.All, row.Universe, row.Story)));
    }

    private static async Task<int> Count(string ownerId, Func<Task<IdeaPage>> read)
    {
        using var counter = new CommandCounter([ownerId]);
        await read();
        return counter.Count;
    }
}
