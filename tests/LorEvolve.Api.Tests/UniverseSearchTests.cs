using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Search;
using LorEvolve.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.ArticleTestClient;
using static LorEvolve.Api.Tests.IdeaTestClient;
using static LorEvolve.Api.Tests.ManuscriptTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The universe search (ADR 0031): recorded words across one universe's lore, articles, stories, chapters, scenes, plot,
/// saved manuscripts and its ideas - what it finds, what it must never find or show, how it orders what it finds, and what
/// keeps its indexes in step. Credentials are obviously synthetic.
/// </summary>
public sealed class UniverseSearchTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Who may search ----------

    [Fact]
    public async Task Only_the_owner_can_search_a_universe_and_a_stranger_learns_nothing_whatever_they_type()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "usown");
        await CreateEntity(owner, universe.Id, "Zyqvane the Warden");
        var story = await CreateStory(owner, universe.Id, "Zyqvane Rising");
        var scene = await CreateScene(owner, universe.Id, story, "The hall");
        await WriteManuscript(owner, universe.Id, story, scene, "Zyqvane walked the hall.");
        await CreateIdea(owner, "Zyqvane betrays everyone", "Secret.", universe.Id);

        Assert.NotEmpty((await Search(owner, universe.Id, "Zyqvane")).Results);

        var stranger = await SignedIn(_factory, "user-usstranger");
        var strangersOwn = await CreateUniverse(stranger, "World usstranger");

        // A universe that exists and one that does not answer the same, for any search, the blank one included.
        foreach (var query in new[] { "Zyqvane", "nothing-like-it", "", "%" })
        {
            var guessed = await stranger.GetAsync(SearchPath(universe.Id, query));
            var missing = await stranger.GetAsync(SearchPath(Guid.NewGuid(), query));

            Assert.Equal(HttpStatusCode.NotFound, guessed.StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
            Assert.Equal(await missing.Content.ReadAsStringAsync(), await guessed.Content.ReadAsStringAsync());
        }

        // Their own universe is theirs alone, and holds none of the owner's words.
        Assert.Empty((await Search(stranger, strangersOwn.Id, "Zyqvane")).Results);

        // Signed out is refused before anything is read.
        var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(SearchPath(universe.Id, "Zyqvane"))).StatusCode);
    }

    [Fact]
    public async Task A_search_never_reaches_another_universe_of_the_same_account()
    {
        var (client, first) = await SignedInWithUniverse(_factory, "ustwo");
        var second = await CreateUniverse(client, "World ustwo other");

        await CreateEntity(client, first.Id, "Quillon of the First");
        var story = await CreateStory(client, first.Id, "Quillon's Road");
        var scene = await CreateScene(client, first.Id, story, "Quillon waits");
        await WriteManuscript(client, first.Id, story, scene, "Quillon never came back.");
        await CreateArc(client, first.Id, story, "Quillon's fall");
        await CreateIdea(client, "Quillon lives", null, first.Id);

        Assert.Equal(6, (await Search(client, first.Id, "Quillon")).Results.Count);
        Assert.Empty((await Search(client, second.Id, "Quillon")).Results);
    }

    // ---------- Lore ----------

    [Fact]
    public async Task An_entry_is_found_by_its_name_alias_summary_or_article_once_and_says_where()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "uslore");

        var named = await CreateEntity(client, universe.Id, "Brannoch Vale");
        var aliased = await CreateEntity(client, universe.Id, "The Old Keeper", aliases: ["Brannoch's Shadow"]);
        var summarised = await CreateEntity(client, universe.Id, "Harbour Guild", summary: "Founded by Brannoch in the drowned years.");
        var written = await CreateEntity(client, universe.Id, "Salt Ledger");
        await WriteArticle(client, universe.Id, written, Doc("Long before the war, Brannoch kept the tide's ledger by hand."));

        // Named and written about: still one result, and the name is why.
        await WriteArticle(client, universe.Id, named, Doc("Brannoch was born under the seawall."));

        var results = (await Search(client, universe.Id, "Brannoch")).Results;
        Assert.All(results, result => Assert.Equal(UniverseSearchKind.Entity, result.Kind));
        Assert.Equal([named, aliased, summarised, written], results.Select(result => result.Id));
        Assert.Equal(
            [UniverseSearchField.Title, UniverseSearchField.Alias, UniverseSearchField.Summary, UniverseSearchField.Article],
            results.Select(result => result.MatchedIn));
        Assert.All(results, result => Assert.Equal("Character", result.EntityTypeName));

        // A name says it all; anything else carries the words around the match, marked.
        Assert.Null(results[0].Excerpt);
        foreach (var result in results.Skip(1))
        {
            Assert.Contains(result.Excerpt!, part => part.IsMatch && part.Text.StartsWith("Brannoch", StringComparison.Ordinal));
        }

        Assert.Contains("kept the tide", Text(results[3].Excerpt), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_trashed_entry_and_its_article_leave_the_search_and_come_back_with_a_restore()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "uslotrash");
        var entity = await CreateEntity(client, universe.Id, "Corrow Vane");
        await WriteArticle(client, universe.Id, entity, Doc("The siege of Halloway broke on the third winter."));

        Assert.Single((await Search(client, universe.Id, "Halloway")).Results);

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{entity}")).EnsureSuccessStatusCode();
        Assert.Empty((await Search(client, universe.Id, "Corrow")).Results);
        Assert.Empty((await Search(client, universe.Id, "Halloway")).Results);

        (await client.PostAsync($"/api/universes/{universe.Id}/trash/{entity}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(entity, Assert.Single((await Search(client, universe.Id, "Halloway")).Results).Id);
        Assert.Equal(entity, Assert.Single((await Search(client, universe.Id, "Corrow")).Results).Id);
    }

    [Fact]
    public async Task An_archived_entry_stays_out_as_the_lore_listing_keeps_it_out()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usarchived");
        var entity = await CreateEntity(client, universe.Id, "Mistral Keep");

        await WithDb(_factory, db => db.Entities.Where(candidate => candidate.Id == entity)
            .ExecuteUpdateAsync(update => update.SetProperty(candidate => candidate.IsArchived, true)));

        Assert.Empty((await Search(client, universe.Id, "Mistral")).Results);
    }

    // ---------- Ideas ----------

    [Fact]
    public async Task Ideas_of_this_universe_are_found_by_title_or_body_and_no_other_idea_ever_is()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usideas");
        var other = await CreateUniverse(client, "World usideas other");

        var titled = await CreateIdea(client, "Velmora floats above the sea", "Maybe.", universe.Id);
        var bodied = await CreateIdea(client, "A religion of forgetting", "Its priests come from Velmora.", universe.Id);
        await CreateIdea(client, "Velmora, but unassigned", "No world yet.");
        await CreateIdea(client, "Velmora elsewhere", null, other.Id);

        var results = (await Search(client, universe.Id, "Velmora")).Results;
        Assert.Equal([titled.Id, bodied.Id], results.Select(result => result.Id));
        Assert.All(results, result => Assert.Equal(UniverseSearchKind.Idea, result.Kind));
        Assert.Equal([UniverseSearchField.Title, UniverseSearchField.Body], results.Select(result => result.MatchedIn));
        Assert.Null(results[0].Excerpt);
        Assert.Contains(results[1].Excerpt!, part => part.IsMatch && part.Text == "Velmora");

        // Deleted, it is gone; restored, it is back. Saved with new words, the old ones find nothing.
        (await client.DeleteAsync(Idea(titled.Id))).EnsureSuccessStatusCode();
        Assert.Equal([bodied.Id], (await Search(client, universe.Id, "Velmora")).Results.Select(result => result.Id));

        (await client.PostAsync($"{Idea(titled.Id)}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(2, (await Search(client, universe.Id, "Velmora")).Results.Count);

        await Save(client, await ReadIdea(client, titled.Id), title: "Ostrava sinks");
        Assert.Equal([titled.Id], (await Search(client, universe.Id, "Ostrava")).Results.Select(result => result.Id));
        Assert.Equal([bodied.Id], (await Search(client, universe.Id, "Velmora")).Results.Select(result => result.Id));

        // Taken out of the universe, it is no longer this universe's to find.
        await Save(client, await ReadIdea(client, bodied.Id), universeId: new Optional<Guid?>(null));
        Assert.Empty((await Search(client, universe.Id, "Velmora")).Results);
    }

    // ---------- Stories ----------

    [Fact]
    public async Task Stories_chapters_scenes_arcs_and_beats_are_found_by_their_own_planning_text()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usstory");

        var story = (await PostJson<StoryDetail>(
            client, Stories(universe.Id), new StoryRequest("The Long Winter", "A siege told from its last day, over Tessaly.", StoryStatus.Drafting))).Id;
        var chapter = (await PostJson<ChapterResponse>(
            client, $"{Story(universe.Id, story)}/chapters", new ChapterRequest("Arrival", "The Tessaly road.", null))).Id;
        var second = (await PostJson<ChapterResponse>(
            client, $"{Story(universe.Id, story)}/chapters", new ChapterRequest("Tessaly Burns", null, "Keep it short."))).Id;
        var scene = (await PostJson<SceneResponse>(
            client,
            $"{Story(universe.Id, story)}/scenes",
            new SceneRequest("The Council", "The nine argue.", "Mira hides the Tessaly letter.", null, null, null, second))).Id;
        var arc = (await CreateArc(client, universe.Id, story, "Fall of the King", description: "Tessaly is the price.")).Id;
        var beat = (await CreateBeat(client, universe.Id, story, arc, "The crown is refused", notes: "Echo Tessaly here.")).Id;

        var results = (await Search(client, universe.Id, "Tessaly")).Results;

        // The one title match first; then planning text, kind by kind.
        Assert.Equal(
            [
                (UniverseSearchKind.Chapter, second, UniverseSearchField.Title),
                (UniverseSearchKind.Story, story, UniverseSearchField.Premise),
                (UniverseSearchKind.Chapter, chapter, UniverseSearchField.Summary),
                (UniverseSearchKind.Scene, scene, UniverseSearchField.Notes),
                (UniverseSearchKind.PlotArc, arc, UniverseSearchField.Description),
                (UniverseSearchKind.PlotBeat, beat, UniverseSearchField.Notes),
            ],
            results.Select(result => (result.Kind, result.Id, result.MatchedIn)));

        var burning = results[0];
        Assert.Equal((story, "The Long Winter", 2), (burning.StoryId!.Value, burning.StoryTitle, burning.ChapterNumber!.Value));
        Assert.Null(burning.Excerpt);

        var storyResult = results[1];
        Assert.Equal((story, "The Long Winter"), (storyResult.StoryId!.Value, storyResult.Title));
        Assert.Contains(storyResult.Excerpt!, part => part.IsMatch && part.Text == "Tessaly");

        var sceneResult = results[3];
        Assert.Equal(("The Council", "The Long Winter", "Tessaly Burns", 2), (sceneResult.Title, sceneResult.StoryTitle, sceneResult.ChapterTitle, sceneResult.ChapterNumber));
        Assert.Contains("hides the", Text(sceneResult.Excerpt), StringComparison.Ordinal);

        var beatResult = results[5];
        Assert.Equal((arc, "Fall of the King", story), (beatResult.PlotArcId!.Value, beatResult.PlotArcTitle, beatResult.StoryId!.Value));

        // A status is a label, not text anyone wrote: it is not searched.
        Assert.Empty((await Search(client, universe.Id, "Drafting")).Results);
    }

    [Fact]
    public async Task Editing_planning_text_keeps_what_the_search_finds_in_step()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usedit");
        var story = await CreateStory(client, universe.Id, "Edits");
        var scene = await CreateScene(client, universe.Id, story, "Quorra hall");
        var arc = await CreateArc(client, universe.Id, story, "Thread");

        Assert.Single((await Search(client, universe.Id, "Quorra")).Results);

        await PutJson<SceneResponse>(
            client,
            $"{Story(universe.Id, story)}/scenes/{scene}",
            new SceneRequest("Zephyr hall", "Now with a summary about Ombrel.", null, null, null, null));
        await PutJson<PlotArcResponse>(client, Arc(universe.Id, story, arc.Id), new PlotArcRequest("Thread", null, "Ombrel returns."));

        Assert.Empty((await Search(client, universe.Id, "Quorra")).Results);
        Assert.Equal([scene], (await Search(client, universe.Id, "Zephyr")).Results.Select(result => result.Id));
        Assert.Equal(
            [(UniverseSearchKind.Scene, UniverseSearchField.Summary), (UniverseSearchKind.PlotArc, UniverseSearchField.Notes)],
            (await Search(client, universe.Id, "Ombrel")).Results.Select(result => (result.Kind, result.MatchedIn)));

        // A reorder writes no indexed text, and nothing about the result changes.
        var another = await CreateScene(client, universe.Id, story, "Another");
        (await client.PutAsJsonAsync(
            $"{Story(universe.Id, story)}/scenes/order",
            new SceneOrderRequest([another, scene]))).EnsureSuccessStatusCode();
        Assert.Equal([scene], (await Search(client, universe.Id, "Zephyr")).Results.Select(result => result.Id));
    }

    // ---------- Manuscripts ----------

    [Fact]
    public async Task Saved_prose_is_its_own_result_beside_its_scene_and_follows_every_save()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usprose");
        var story = await CreateStory(client, universe.Id, "The Long Winter");
        var chapter = await CreateChapter(client, universe.Id, story, "The Gates");
        var scene = await CreateScene(client, universe.Id, story, "Pellam's watch", chapter);

        await WriteManuscript(client, universe.Id, story, scene, "The hall had emptied long before Arlen understood why Pellam would not meet his eyes.");

        var prose = Assert.Single((await Search(client, universe.Id, "understood")).Results);
        Assert.Equal(
            (UniverseSearchKind.Manuscript, scene, "Pellam's watch", UniverseSearchField.Prose, story, "The Gates", 1),
            (prose.Kind, prose.Id, prose.Title, prose.MatchedIn, prose.StoryId!.Value, prose.ChapterTitle, prose.ChapterNumber!.Value));
        Assert.Equal(["understood"], prose.Excerpt!.Where(part => part.IsMatch).Select(part => part.Text));

        // The scene's own title and its prose both hold the name: two places to open, two results.
        Assert.Equal(
            [(UniverseSearchKind.Scene, UniverseSearchField.Title), (UniverseSearchKind.Manuscript, UniverseSearchField.Prose)],
            (await Search(client, universe.Id, "Pellam")).Results.Select(result => (result.Kind, result.MatchedIn)));

        await WriteManuscript(client, universe.Id, story, scene, "Nothing of that remains.");
        Assert.Empty((await Search(client, universe.Id, "understood")).Results);
        Assert.Single((await Search(client, universe.Id, "remains")).Results);

        // An earlier version restored is the prose again, and so is what search finds.
        var versions = await client.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>(
            $"{Manuscript(universe.Id, story, scene)}/revisions");
        var current = await ReadManuscript(client, universe.Id, story, scene);
        (await client.PostAsJsonAsync(
            $"{Manuscript(universe.Id, story, scene)}/revisions/{versions!.Last().Id}/restore",
            new SceneManuscriptRestoreRequest(current.Version))).EnsureSuccessStatusCode();
        Assert.Single((await Search(client, universe.Id, "understood")).Results);

        // An old version on its own is never a result.
        Assert.Empty((await Search(client, universe.Id, "remains")).Results);
    }

    // ---------- The Trash, for story content ----------

    [Fact]
    public async Task A_trashed_scene_hides_its_prose_and_a_trashed_story_hides_everything_it_holds_until_restored()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ustrash");
        var story = await CreateStory(client, universe.Id, "Varrow chronicle");
        var chapter = await CreateChapter(client, universe.Id, story, "Varrow gate");
        var scene = await CreateScene(client, universe.Id, story, "Varrow falls", chapter);
        await WriteManuscript(client, universe.Id, story, scene, "Varrow burned all night.");
        var arc = await CreateArc(client, universe.Id, story, "Varrow thread");
        await CreateBeat(client, universe.Id, story, arc.Id, "Varrow beat");

        Assert.Equal(
            [UniverseSearchKind.Story, UniverseSearchKind.Chapter, UniverseSearchKind.Scene, UniverseSearchKind.PlotArc, UniverseSearchKind.PlotBeat, UniverseSearchKind.Manuscript],
            await Kinds(client, universe.Id, "Varrow"));

        // The scene: its planning and its prose go, nothing else.
        (await client.DeleteAsync($"{Story(universe.Id, story)}/scenes/{scene}")).EnsureSuccessStatusCode();
        Assert.Equal(
            [UniverseSearchKind.Story, UniverseSearchKind.Chapter, UniverseSearchKind.PlotArc, UniverseSearchKind.PlotBeat],
            await Kinds(client, universe.Id, "Varrow"));

        (await client.PostAsync($"/api/universes/{universe.Id}/trash/scenes/{scene}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(6, (await Search(client, universe.Id, "Varrow")).Results.Count);

        // The arc: its beats go with it, though their own rows are not marked.
        (await client.DeleteAsync(Arc(universe.Id, story, arc.Id))).EnsureSuccessStatusCode();
        Assert.Equal(
            [UniverseSearchKind.Story, UniverseSearchKind.Chapter, UniverseSearchKind.Scene, UniverseSearchKind.Manuscript],
            await Kinds(client, universe.Id, "Varrow"));

        (await client.PostAsync($"/api/universes/{universe.Id}/trash/plot-arcs/{arc.Id}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(6, (await Search(client, universe.Id, "Varrow")).Results.Count);

        // The story: nothing it holds is findable, though nothing inside it is marked.
        (await client.DeleteAsync(Story(universe.Id, story))).EnsureSuccessStatusCode();
        Assert.Empty((await Search(client, universe.Id, "Varrow")).Results);

        (await client.PostAsync($"/api/universes/{universe.Id}/trash/stories/{story}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(6, (await Search(client, universe.Id, "Varrow")).Results.Count);

        // A chapter in the Trash is out; its scenes moved to Unchaptered are not, and no longer name it.
        (await client.DeleteAsync($"{Story(universe.Id, story)}/chapters/{chapter}")).EnsureSuccessStatusCode();
        var afterChapter = (await Search(client, universe.Id, "Varrow")).Results;
        Assert.DoesNotContain(afterChapter, result => result.Kind == UniverseSearchKind.Chapter);
        Assert.All(
            afterChapter.Where(result => result.Kind is UniverseSearchKind.Scene or UniverseSearchKind.Manuscript),
            result => Assert.Null(result.ChapterTitle));
    }

    // ---------- What the author types ----------

    [Fact]
    public async Task Anything_typed_is_searched_for_and_never_run_as_syntax_or_answered_with_a_500()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ussyntax");
        var story = await CreateStory(client, universe.Id, "Café Ærendel");
        var scene = await CreateScene(client, universe.Id, story, "北の門");
        await WriteManuscript(client, universe.Id, story, scene, "“Don't,” said O'Brien (quietly) - a well-known hero. المدينة 👩‍👩‍👧 done.");
        await CreateIdea(client, "Mira's betrayal", null, universe.Id);

        var inputs = new[]
        {
            "\"", "'", "''", "O'Brien", "\"unbalanced", "(", ")", "()", "(quietly)", "well-known", "-negated", "a OR b",
            "a AND", "NOT", "NEAR(a b)", "Title:", "{Title}:x", "column:value", "*", "^", "%", "_", "\\", "' OR 1=1 --",
            "; DROP TABLE Scenes; --", "🙂", "👩‍👩‍👧", "北の門", "المدينة", " ", "Mira", "   ", "\t\n",
            new string('x', 10_000), string.Concat(Enumerable.Repeat("Mira ", 500)),
        };

        foreach (var input in inputs)
        {
            var response = await client.GetAsync(SearchPath(universe.Id, input));
            Assert.True(response.StatusCode == HttpStatusCode.OK, $"{(int)response.StatusCode} for {Describe(input)}");
            var body = (await response.Content.ReadFromJsonAsync<UniverseSearchResponse>())!;
            Assert.NotNull(body.Results);
        }

        // Nothing with a letter or digit in it finds nothing, rather than everything.
        foreach (var blank in new[] { "", "   ", "\t\n", "%", "()", "🙂" })
        {
            Assert.Empty((await Search(client, universe.Id, blank)).Results);
        }

        // Words inside punctuation are still those words; accents fold both ways; other scripts are words too.
        Assert.Equal([UniverseSearchKind.Manuscript], await Kinds(client, universe.Id, "(quietly)"));
        Assert.Equal([UniverseSearchKind.Manuscript], await Kinds(client, universe.Id, "O'Brien"));
        Assert.Equal([UniverseSearchKind.Manuscript], await Kinds(client, universe.Id, "well-known"));
        Assert.Equal([UniverseSearchKind.Story], await Kinds(client, universe.Id, "CAFE ærendel"));
        Assert.Equal([UniverseSearchKind.Scene], await Kinds(client, universe.Id, "北の門"));
        Assert.Equal([UniverseSearchKind.Manuscript], await Kinds(client, universe.Id, "المدينة"));
        Assert.Equal([UniverseSearchKind.Idea], await Kinds(client, universe.Id, "Mira's"));

        // A private-use character around a word is not a word, and cannot fake a match marker.
        Assert.Equal([UniverseSearchKind.Idea], await Kinds(client, universe.Id, "Mira"));
    }

    [Fact]
    public async Task An_author_s_own_marker_characters_are_text_never_a_match_marker()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usmarker");
        var story = await CreateStory(client, universe.Id, "Markers");
        var scene = await CreateScene(client, universe.Id, story, "Scene");
        await WriteManuscript(client, universe.Id, story, scene, "Before not a match then Ysolde arrives.");
        var entity = await CreateEntity(client, universe.Id, "Plain");
        await WriteArticle(client, universe.Id, entity, Doc("Also not this but Ysolde."));

        var results = (await Search(client, universe.Id, "Ysolde")).Results;
        Assert.Equal(2, results.Count);
        Assert.All(results, result =>
        {
            Assert.Equal(["Ysolde"], result.Excerpt!.Where(part => part.IsMatch).Select(part => part.Text));
            Assert.DoesNotContain('', Text(result.Excerpt));
            Assert.DoesNotContain('', Text(result.Excerpt));
        });

        // The prose itself is stored exactly as written.
        Assert.Contains('', (await ReadManuscript(client, universe.Id, story, scene)).Content);
    }

    // ---------- What a response carries ----------

    [Fact]
    public async Task Results_are_bounded_per_kind_carry_short_excerpts_and_never_the_text_they_were_found_in()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usbound");
        var story = await CreateStory(client, universe.Id, "Bounds");

        for (var index = 0; index < UniverseSearchEndpoints.ResultsPerKind + 2; index++)
        {
            var scene = await CreateScene(client, universe.Id, story, $"Lantern scene {index}");
            await WriteManuscript(
                client,
                universe.Id,
                story,
                scene,
                string.Concat(Enumerable.Repeat($"ZQXJPROSE{index} carried the lantern down the long stair. ", 8_000)));
        }

        var entity = await CreateEntity(client, universe.Id, "Keeper");
        await WriteArticle(client, universe.Id, entity, Doc("The lantern " + new string('x', 5_000) + " went out."));

        var response = await client.GetAsync(SearchPath(universe.Id, "lantern"));
        var raw = await response.Content.ReadAsStringAsync();
        var body = (await response.Content.ReadFromJsonAsync<UniverseSearchResponse>())!;

        Assert.True(body.HasMore);
        Assert.Equal(UniverseSearchEndpoints.ResultsPerKind, body.Results.Count(result => result.Kind == UniverseSearchKind.Scene));
        Assert.Equal(UniverseSearchEndpoints.ResultsPerKind, body.Results.Count(result => result.Kind == UniverseSearchKind.Manuscript));
        Assert.Single(body.Results, result => result.Kind == UniverseSearchKind.Entity);

        Assert.All(body.Results.Where(result => result.Excerpt is not null), result =>
            Assert.InRange(Text(result.Excerpt).Length, 1, 241));

        // Seven manuscripts of over four hundred thousand characters each, and an answer of a few kilobytes.
        Assert.True(raw.Length < 16_000, $"A response of {raw.Length} characters.");
        Assert.DoesNotContain(new string('x', 400), raw, StringComparison.Ordinal);

        // A kind with room to spare says nothing is hidden.
        Assert.False((await Search(client, universe.Id, "Keeper")).HasMore);
    }

    [Fact]
    public async Task A_title_outranks_planning_text_which_outranks_long_prose_whatever_the_kind()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usrank");

        // Written in the reverse of the order they should come back in, so recency cannot pass for ranking.
        var entity = await CreateEntity(client, universe.Id, "Council Minutes");
        await WriteArticle(client, universe.Id, entity, Doc("Aldric arrived late and said little."));
        var story = await CreateStory(client, universe.Id, "The Winter");
        var scene = await CreateScene(client, universe.Id, story, "The hall");
        await WriteManuscript(client, universe.Id, story, scene, string.Concat(Enumerable.Repeat("Aldric. ", 400)));
        var idea = await CreateIdea(client, "Something about the king", "Aldric could be the heir.", universe.Id);
        var beatArc = await CreateArc(client, universe.Id, story, "Thread");
        var beat = await CreateBeat(client, universe.Id, story, beatArc.Id, "Aldric's refusal");
        var named = await CreateEntity(client, universe.Id, "Aldric Vane");

        var results = (await Search(client, universe.Id, "Aldric")).Results;

        Assert.Equal(
            [
                (UniverseSearchKind.Entity, named),
                (UniverseSearchKind.PlotBeat, beat.Id),
                (UniverseSearchKind.Idea, idea.Id),
                (UniverseSearchKind.Entity, entity),
                (UniverseSearchKind.Manuscript, scene),
            ],
            results.Select(result => (result.Kind, result.Id)));

        // The same search over the same content reads the same way every time.
        Assert.Equal(results.Select(result => result.Id), (await Search(client, universe.Id, "Aldric")).Results.Select(result => result.Id));
    }

    [Fact]
    public async Task A_search_is_the_same_handful_of_queries_however_much_matches()
    {
        var (client, small) = await SignedInWithUniverse(_factory, "usqueries");
        var large = await CreateUniverse(client, "World usqueries large");

        var smallIds = await Seed(small.Id, 1);
        var largeIds = await Seed(large.Id, 12);

        var (smallQueries, smallBody) = await CommandCounter.CountAsync([small.Id, .. smallIds], () => Search(client, small.Id, "Gravemark"));
        var (largeQueries, largeBody) = await CommandCounter.CountAsync([large.Id, .. largeIds], () => Search(client, large.Id, "Gravemark"));

        Assert.Equal(9, smallBody.Results.Select(result => result.Kind).Distinct().Count());
        Assert.Equal(9 * UniverseSearchEndpoints.ResultsPerKind, largeBody.Results.Count);

        // Ownership, one query per kind, and one excerpt query per index - nothing per result.
        Assert.Equal(smallQueries, largeQueries);
        Assert.InRange(largeQueries, 1, 15);

        async Task<List<Guid>> Seed(Guid universeId, int count)
        {
            var ids = new List<Guid>();
            for (var index = 0; index < count; index++)
            {
                var entity = await CreateEntity(client, universeId, $"Someone {index}");
                await WriteArticle(client, universeId, entity, Doc($"Gravemark {index} was here."));
                var story = (await PostJson<StoryDetail>(client, Stories(universeId), new StoryRequest($"Story {index}", $"Gravemark premise {index}", StoryStatus.Planning))).Id;
                var chapter = (await PostJson<ChapterResponse>(client, $"{Story(universeId, story)}/chapters", new ChapterRequest($"Chapter {index}", "Gravemark summary", null))).Id;
                var scene = (await PostJson<SceneResponse>(
                    client, $"{Story(universeId, story)}/scenes", new SceneRequest($"Scene {index}", "Gravemark summary", null, null, null, null, chapter))).Id;
                await WriteManuscript(client, universeId, story, scene, $"Gravemark prose {index}.");
                var arc = await CreateArc(client, universeId, story, $"Arc {index}", description: "Gravemark description");
                var beat = await CreateBeat(client, universeId, story, arc.Id, $"Beat {index}", description: "Gravemark description");
                var idea = await CreateIdea(client, $"Idea {index}", "Gravemark body", universeId);
                var rule = await WorldRuleTestClient.CreateRule(client, universeId, $"Rule {index}", "Gravemark description");
                ids.AddRange([entity, story, chapter, scene, arc.Id, beat.Id, idea.Id, rule.Id]);
            }

            return ids;
        }
    }

    // ---------- The indexes ----------

    [Fact]
    public async Task Deleting_a_universe_takes_every_index_row_of_its_story_content_and_prose_and_leaves_its_ideas_findable_nowhere()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "uscascade");
        var story = await CreateStory(client, universe.Id, "Cascade");
        var chapter = await CreateChapter(client, universe.Id, story, "Chapter");
        var scene = await CreateScene(client, universe.Id, story, "Scene", chapter);
        await WriteManuscript(client, universe.Id, story, scene, "Some prose.");
        var arc = await CreateArc(client, universe.Id, story, "Arc");
        var beat = await CreateBeat(client, universe.Id, story, arc.Id, "Beat");
        var idea = await CreateIdea(client, "Kept idea", "Its words stay its own.", universe.Id);

        Assert.Equal(5, await StoryIndexRows(story, chapter, scene, arc.Id, beat.Id));
        Assert.Equal(1, await ManuscriptIndexRows(scene));

        await DeleteUniverse(client, universe.Id);

        Assert.Equal(0, await StoryIndexRows(story, chapter, scene, arc.Id, beat.Id));
        Assert.Equal(0, await ManuscriptIndexRows(scene));

        // The idea survives, unassigned, with its words indexed - and no universe search can reach it.
        Assert.Equal(1, await Count($"SELECT COUNT(*) AS Value FROM IdeaSearchIndex WHERE IdeaId = '{Key(idea.Id)}'"));
        Assert.Null((await ReadIdea(client, idea.Id)).Universe);
    }

    [Fact]
    public async Task Every_index_is_derived_and_a_rebuild_from_the_authored_rows_gives_the_same_answers()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usrebuild");
        var story = (await PostJson<StoryDetail>(client, Stories(universe.Id), new StoryRequest("Derived", "Umbrage premise", StoryStatus.Planning))).Id;
        var scene = await CreateScene(client, universe.Id, story, "Umbrage scene");
        await WriteManuscript(client, universe.Id, story, scene, "Umbrage prose.");
        await CreateIdea(client, "Umbrage idea", null, universe.Id);

        var before = (await Search(client, universe.Id, "Umbrage")).Results;
        Assert.Equal(4, before.Count);

        // This universe's rows emptied and filled again from the rows an author wrote, the way a future migration would
        // rebuild an index. Nothing authored is read from an index, so nothing authored can differ.
        var u = universe.Id;
        await WithDb(_factory, db => db.Database.ExecuteSqlAsync(
            $"""
            DELETE FROM StorySearchIndex WHERE ItemId IN (SELECT Id FROM Stories WHERE UniverseId = {u});
            DELETE FROM StorySearchIndex WHERE ItemId IN (SELECT s.Id FROM Scenes s JOIN Stories t ON t.Id = s.StoryId WHERE t.UniverseId = {u});
            DELETE FROM SceneManuscriptSearchIndex WHERE SceneId IN (SELECT s.Id FROM Scenes s JOIN Stories t ON t.Id = s.StoryId WHERE t.UniverseId = {u});
            DELETE FROM IdeaSearchIndex WHERE IdeaId IN (SELECT Id FROM Ideas WHERE UniverseId = {u});
            """));

        Assert.Empty((await Search(client, universe.Id, "Umbrage")).Results);

        await WithDb(_factory, db => db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO StorySearchIndex (Kind, ItemId, Title, Summary, Notes)
            SELECT 'story', Id, Title, coalesce(Premise, ''), '' FROM Stories WHERE UniverseId = {u};
            INSERT INTO StorySearchIndex (Kind, ItemId, Title, Summary, Notes)
            SELECT 'scene', s.Id, s.Title, coalesce(s.Summary, ''), coalesce(s.Notes, '') FROM Scenes s JOIN Stories t ON t.Id = s.StoryId WHERE t.UniverseId = {u};
            INSERT INTO SceneManuscriptSearchIndex (SceneId, Content)
            SELECT m.SceneId, m.Content FROM SceneManuscripts m JOIN Scenes s ON s.Id = m.SceneId JOIN Stories t ON t.Id = s.StoryId WHERE t.UniverseId = {u};
            INSERT INTO IdeaSearchIndex (IdeaId, Title, Body) SELECT Id, Title, Body FROM Ideas WHERE UniverseId = {u};
            """));

        Assert.Equal(
            before.Select(result => (result.Kind, result.Id, result.MatchedIn)),
            (await Search(client, universe.Id, "Umbrage")).Results.Select(result => (result.Kind, result.Id, result.MatchedIn)));
    }

    [Fact]
    public async Task A_refused_or_rolled_back_write_leaves_no_index_row_behind()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usrefused");
        var story = await CreateStory(client, universe.Id, "Refusals");
        var scene = await CreateScene(client, universe.Id, story, "Scene");
        var saved = await WriteManuscript(client, universe.Id, story, scene, "Kestrel prose.");

        // A stale save is refused inside its transaction: the prose, and so the index, keep what was saved.
        var stale = await PutManuscript(client, universe.Id, story, scene, "Wyvern prose.", saved.Version - 1);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        // A scene too long for its title is refused before anything is written.
        var tooLong = await client.PostAsJsonAsync(
            $"{Story(universe.Id, story)}/scenes",
            new SceneRequest("Wyvern " + new string('t', 300), null, null, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);

        // A write that reached the database and was then rolled back: the trigger's row was in the same transaction, and
        // goes with it.
        await WithDb(_factory, async db =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            var now = DateTime.UtcNow;
            db.Stories.Add(new Story { Id = Guid.NewGuid(), UniverseId = universe.Id, Title = "Wyvern saga", CreatedAt = now, UpdatedAt = now });
            await db.SaveChangesAsync();

            Assert.Equal(1, await db.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS Value FROM StorySearchIndex WHERE StorySearchIndex MATCH '\"wyvern\"'").SingleAsync());

            await transaction.RollbackAsync();
        });

        Assert.Empty((await Search(client, universe.Id, "Wyvern")).Results);
        Assert.Single((await Search(client, universe.Id, "Kestrel")).Results);
        Assert.Equal(0, await Count("SELECT COUNT(*) AS Value FROM StorySearchIndex WHERE StorySearchIndex MATCH '\"wyvern\"'"));
    }

    // ---------- The backup ----------

    [Fact]
    public async Task A_backup_carries_no_search_index()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "usbackup");
        var story = await CreateStory(client, universe.Id, "Backed up");
        var scene = await CreateScene(client, universe.Id, story, "Scene");
        await WriteManuscript(client, universe.Id, story, scene, "Words.");
        await CreateIdea(client, "An idea", "Body.", universe.Id);

        Assert.NotEmpty((await Search(client, universe.Id, "Words")).Results);

        var raw = DocumentText(await RawArchive(client, universe.Id));
        var backup = System.Text.Json.JsonSerializer.Deserialize<UniverseBackup>(raw, UniverseBackupJson.Options)!;

        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);
        Assert.DoesNotContain("SearchIndex", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("excerpt", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("matchedIn", raw, StringComparison.OrdinalIgnoreCase);
    }

    // ---------- Helpers ----------

    private static string SearchPath(Guid universeId, string query) =>
        $"/api/universes/{universeId}/search?q={Uri.EscapeDataString(query)}";

    private static async Task<UniverseSearchResponse> Search(HttpClient client, Guid universeId, string query)
    {
        var response = await client.GetAsync(SearchPath(universeId, query));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<UniverseSearchResponse>())!;
    }

    private static async Task<List<UniverseSearchKind>> Kinds(HttpClient client, Guid universeId, string query) =>
        [.. (await Search(client, universeId, query)).Results.Select(result => result.Kind)];

    private static string Text(IReadOnlyList<SearchExcerptPart>? parts) =>
        parts is null ? string.Empty : string.Concat(parts.Select(part => part.Text));

    private static string Describe(string input) =>
        input.Length > 40 ? $"{input.Length} characters starting \"{input[..20]}\"" : $"\"{input}\"";

    private static async Task<Guid> CreateEntity(
        HttpClient client,
        Guid universeId,
        string name,
        string? summary = null,
        IReadOnlyList<string>? aliases = null)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        var entity = await PostJson<EntityDetail>(
            client,
            $"/api/universes/{universeId}/entities",
            new EntityRequest(types.First(type => type.Name == "Character").Id, name, summary, CanonStatus.Idea, aliases, null, null));
        return entity.Id;
    }

    /// <summary>A Guid as the schema stores it.</summary>
    private static string Key(Guid id) => id.ToString().ToUpperInvariant();

    private Task<int> StoryIndexRows(params Guid[] ids) =>
        Count($"SELECT COUNT(*) AS Value FROM StorySearchIndex WHERE ItemId IN ({string.Join(", ", ids.Select(id => $"'{Key(id)}'"))})");

    private Task<int> ManuscriptIndexRows(Guid sceneId) =>
        Count($"SELECT COUNT(*) AS Value FROM SceneManuscriptSearchIndex WHERE SceneId = '{Key(sceneId)}'");

    private async Task<int> Count(string sql)
    {
        var count = 0;
        await WithDb(_factory, async db =>
        {
            count = await db.Database.SqlQueryRaw<int>(sql).SingleAsync();
        });
        return count;
    }
}
