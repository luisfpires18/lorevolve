using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.AiChanges;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Lorex.Api.Features.WorldRules;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Lorex.Api.Tests.AiChangeTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Issue 45 (ADR 0048): every creator-authored resource of a universe through the same staged proposal - articles, plot arcs
/// and beats, world rules, the owner's ideas, relationship dates, a moment's stories and details, whole orders - each checked
/// by its own rules, applied through its own write path only on approval, removed only to the Trash, and an idea never
/// reachable by anyone but the owner whose idea it is.
/// </summary>
public sealed class AiChangeContentTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private async Task<(HttpClient Owner, string OwnerId, Guid U, Guid Character)> World(string tag)
    {
        var (owner, ownerId) = await PublishingTestClient.Account(_factory, tag);
        var u = (await CreateUniverse(owner, $"World {tag}")).Id;
        return (owner, ownerId, u, await TypeId(owner, u, "Character"));
    }

    private static AiChangeOperationInput Article(string key, AiRefInput entry, string mode, params AiArticleBlockInput[] blocks) =>
        new(key, "update", "article", Article: new AiArticleInput(entry, mode, blocks));

    private static AiArticleBlockInput Paragraph(string text) => new("paragraph", text);

    private static async Task<EntityArticleResponse> ReadArticle(HttpClient client, Guid u, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityArticleResponse>($"/api/universes/{u}/entities/{entityId}/article"))!;

    // ---------- Articles ----------

    [Fact]
    public async Task An_article_is_written_as_blocks_never_as_markup_and_only_on_approval()
    {
        var (owner, ownerId, u, character) = await World("aiarticle");

        var id = await Staged(
            _factory,
            u,
            ownerId,
            NewLore("mara", character, "Mara"),
            Article(
                "story",
                Ref("mara"),
                "replace",
                new AiArticleBlockInput("heading", "Early life", 2),
                Paragraph("Born in <script>alert(1)</script> the marsh."),
                new AiArticleBlockInput("bullet_list", Items: ["Smith", "Sailor"])));

        var proposal = await Read(owner, u, id);
        var change = proposal.Operations.Single(operation => operation.Key == "story");
        Assert.Equal((AiChangeResource.Article, AiChangeAction.Update), (change.Resource, change.Action));
        Assert.Contains("Born in <script>alert(1)</script> the marsh.", change.Prose!.Proposed, StringComparison.Ordinal);
        Assert.Equal(["mara"], change.DependsOn);

        var receipt = await ApproveAll(owner, u, id);
        var mara = receipt.Applied.Single(line => line.Key == "mara").ResultId!.Value;
        var article = await ReadArticle(owner, u, mara);
        Assert.Equal(1, article.Version);

        // The text is a text node, never markup; the structure is the editor's own.
        Assert.Contains("\"type\":\"heading\"", article.Content, StringComparison.Ordinal);
        Assert.Contains("\"type\":\"bulletList\"", article.Content, StringComparison.Ordinal);
        Assert.Contains("Born in <script>alert(1)</script> the marsh.", LoreArticleText.Extract(article.Content), StringComparison.Ordinal);
        Assert.DoesNotContain("<script>", article.Content, StringComparison.Ordinal);
        Assert.DoesNotContain("marks", article.Content, StringComparison.Ordinal);

        // Appending adds after what is there; replacing must name the version it was written over.
        await ApproveAll(owner, u, await Staged(_factory, u, ownerId, Article("more", Id(mara), "append", Paragraph("Later, a captain."))));
        Assert.Equal(2, (await ReadArticle(owner, u, mara)).Version);

        var unnamed = await Stage(_factory, u, ownerId, Article("again", Id(mara), "replace", Paragraph("Only this.")));
        var issue = Assert.Single(unnamed.Issues);
        Assert.Equal((AiChangeCodes.Invalid, "expectedVersion"), (issue.Code, issue.Field));

        var stale = await Stage(_factory, u, ownerId, Article("again", Id(mara), "replace", Paragraph("Only this.")) with { ExpectedVersion = 1 });
        Assert.Equal(AiChangeCodes.ChangedSince, Assert.Single(stale.Issues).Code);
    }

    [Fact]
    public async Task An_article_written_over_after_staging_is_a_conflict_and_nothing_newer_is_overwritten()
    {
        var (owner, ownerId, u, character) = await World("aiarticlestale");
        var mara = (await PostJson<EntityDetail>(owner, $"/api/universes/{u}/entities", new EntityRequest(character, "Mara", null, CanonStatus.Idea, null, null, null))).Id;

        var id = await Staged(_factory, u, ownerId, Article("a", Id(mara), "append", Paragraph("From the AI.")));
        (await owner.PutAsJsonAsync($"/api/universes/{u}/entities/{mara}/article", new EntityArticleRequest(ArticleTestClient.Doc("By hand."), 0))).EnsureSuccessStatusCode();

        var proposal = await Read(owner, u, id);
        Assert.True(proposal.Operations.Single().IsConflict);
        var refused = await Approve(owner, u, proposal, ["a"]);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains("By hand.", (await ReadArticle(owner, u, mara)).Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_block_outside_the_closed_set_is_refused()
    {
        var (_, ownerId, u, character) = await World("aiarticlebad");
        var staged = await Stage(
            _factory,
            u,
            ownerId,
            NewLore("e", character, "Entry"),
            Article("a", Ref("e"), "replace", new AiArticleBlockInput("script", "x")),
            Article("b", Ref("e"), "append", new AiArticleBlockInput("heading", "Too big", 1)));

        Assert.Null(staged.Proposal);
        Assert.Contains(staged.Issues, problem => problem.Id == "a" && problem.Code == AiChangeCodes.Invalid);
        Assert.Contains(staged.Issues, problem => problem.Id == "b" && problem.Code == AiChangeCodes.Invalid);
    }

    // ---------- Plot ----------

    [Fact]
    public async Task Arcs_and_beats_link_scenes_and_lore_keep_their_order_and_go_only_to_the_Trash()
    {
        var (owner, ownerId, u, character) = await World("aiplot");
        var story = await CreateStory(owner, u, "The Forging");
        var hero = (await PostJson<EntityDetail>(owner, $"/api/universes/{u}/entities", new EntityRequest(character, "Hero", null, CanonStatus.Idea, null, null, null))).Id;

        var id = await Staged(
            _factory,
            u,
            ownerId,
            new AiChangeOperationInput("s1", "create", "scene", Scene: new AiSceneInput(Id(story), Title: "The forge")),
            new AiChangeOperationInput("arc", "create", "plot_arc", PlotArc: new AiPlotArcInput(Id(story), "Rise", "From nothing.")),
            new AiChangeOperationInput("b1", "create", "plot_beat", PlotBeat: new AiPlotBeatInput(Ref("arc"), "First spark", Scenes: [Ref("s1")], Lore: [Id(hero)])),
            new AiChangeOperationInput("b2", "create", "plot_beat", PlotBeat: new AiPlotBeatInput(Ref("arc"), "The blade")));

        // A beat needs its arc in the same approval.
        var proposal = await Read(owner, u, id);
        Assert.Equal(["arc", "s1"], proposal.Operations.Single(operation => operation.Key == "b1").DependsOn.Order());
        Assert.Equal(AiChangeCodes.MissingDependency, await Code(await Approve(owner, u, proposal, ["b1"])));

        var receipt = await ApproveAll(owner, u, id);
        var made = receipt.Applied.ToDictionary(line => line.Key, line => line.ResultId!.Value);
        var arc = Assert.Single(await Plot(owner, u, story));
        Assert.Equal(["First spark", "The blade"], arc.Beats.Select(beat => beat.Title));
        Assert.Equal([made["s1"]], arc.Beats[0].SceneIds);
        Assert.Equal([hero], arc.Beats[0].Entities.Select(entity => entity.EntityId));

        // A whole order, through the arc's own order route.
        await ApproveAll(owner, u, await Staged(_factory, u, ownerId, new AiChangeOperationInput(
            "o", "reorder", "plot_beat", Order: new AiOrderInput(Arc: Id(made["arc"]), Items: [Id(made["b2"]), Id(made["b1"])]))));
        Assert.Equal(["The blade", "First spark"], (await Plot(owner, u, story)).Single().Beats.Select(beat => beat.Title));

        // An order missing an item is refused before anything is staged.
        var partial = await Stage(_factory, u, ownerId, new AiChangeOperationInput(
            "o", "reorder", "plot_beat", Order: new AiOrderInput(Arc: Id(made["arc"]), Items: [Id(made["b1"])])));
        Assert.Contains(partial.Issues, problem => problem.Code == AiChangeCodes.Invalid && problem.Field == "items");

        // Removing an arc moves it, with its beats, to the Trash - restorable.
        await ApproveAll(owner, u, await Staged(_factory, u, ownerId, Remove("r", "plot_arc", made["arc"])));
        Assert.Empty(await Plot(owner, u, story));
        (await owner.PostAsync($"/api/universes/{u}/trash/plot-arcs/{made["arc"]}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(2, (await Plot(owner, u, story)).Single().Beats.Count);
    }

    [Fact]
    public async Task A_beat_links_only_scenes_of_its_own_story()
    {
        var (owner, ownerId, u, _) = await World("aiplotforeign");
        var story = await CreateStory(owner, u, "One");
        var other = await CreateStory(owner, u, "Two");
        var elsewhere = await CreateScene(owner, u, other, "Elsewhere");

        var staged = await Stage(
            _factory,
            u,
            ownerId,
            new AiChangeOperationInput("arc", "create", "plot_arc", PlotArc: new AiPlotArcInput(Id(story), "Arc")),
            new AiChangeOperationInput("b", "create", "plot_beat", PlotBeat: new AiPlotBeatInput(Ref("arc"), "Beat", Scenes: [Id(elsewhere)])));

        Assert.Null(staged.Proposal);
        Assert.Contains(staged.Issues, problem => problem.Id == "b" && problem.Field == "scenes");
    }

    // ---------- Orders ----------

    [Fact]
    public async Task Chapters_are_reordered_with_new_ones_by_ref_and_a_changed_order_is_a_conflict()
    {
        var (owner, ownerId, u, _) = await World("aiorder");
        var story = await CreateStory(owner, u, "Tale");
        var one = await CreateChapter(owner, u, story, "One");
        var two = await CreateChapter(owner, u, story, "Two");

        var id = await Staged(
            _factory,
            u,
            ownerId,
            new AiChangeOperationInput("zero", "create", "chapter", Chapter: new AiChapterInput(Id(story), "Zero")),
            new AiChangeOperationInput("order", "reorder", "chapter", Order: new AiOrderInput(Id(story), Items: [Ref("zero"), Id(one), Id(two)])));
        Assert.Equal(["zero"], (await Read(owner, u, id)).Operations.Single(operation => operation.Key == "order").DependsOn);
        await ApproveAll(owner, u, id);
        Assert.Equal(["Zero", "One", "Two"], (await ReadStory(owner, u, story)).Chapters.Select(chapter => chapter.Title));

        // Leaving out a chapter the proposal creates there is refused.
        var missing = await Stage(
            _factory,
            u,
            ownerId,
            new AiChangeOperationInput("extra", "create", "chapter", Chapter: new AiChapterInput(Id(story), "Extra")),
            new AiChangeOperationInput("order", "reorder", "chapter", Order: new AiOrderInput(Id(story), Items: [Id(two), Id(one)])));
        Assert.Contains(missing.Issues, problem => problem.Id == "order" && problem.Field == "items");

        // Reordering a container and removing from it in one proposal is refused.
        var current = (await ReadStory(owner, u, story)).Chapters.Select(chapter => chapter.Id).ToList();
        var mixed = await Stage(
            _factory,
            u,
            ownerId,
            Remove("gone", "chapter", one),
            new AiChangeOperationInput("order", "reorder", "chapter", Order: new AiOrderInput(Id(story), Items: [.. Enumerable.Reverse(current).Select(Id)])));
        Assert.Contains(mixed.Issues, problem => problem.Id == "order" && problem.Code == AiChangeCodes.Unsupported);

        // The order changes by hand after staging: the change is a conflict and nothing is reordered.
        var reorder = await Staged(_factory, u, ownerId, new AiChangeOperationInput(
            "order", "reorder", "chapter", Order: new AiOrderInput(Id(story), Items: [.. Enumerable.Reverse(current).Select(Id)])));
        (await owner.PutAsJsonAsync($"/api/universes/{u}/stories/{story}/chapters/order", new ChapterOrderRequest([current[1], current[0], current[2]]))).EnsureSuccessStatusCode();
        var proposal = await Read(owner, u, reorder);
        Assert.True(proposal.Operations.Single().IsConflict);
        Assert.Equal(HttpStatusCode.Conflict, (await Approve(owner, u, proposal, ["order"])).StatusCode);
        Assert.Equal([current[1], current[0], current[2]], (await ReadStory(owner, u, story)).Chapters.Select(chapter => chapter.Id));
    }

    [Fact]
    public async Task A_chapters_scenes_are_reordered_through_their_own_container()
    {
        var (owner, ownerId, u, _) = await World("aiorderscenes");
        var story = await CreateStory(owner, u, "Tale");
        var chapter = await CreateChapter(owner, u, story, "One");
        var first = await CreateScene(owner, u, story, "First", chapter);
        var second = await CreateScene(owner, u, story, "Second", chapter);
        var loose = await CreateScene(owner, u, story, "Loose");

        await ApproveAll(owner, u, await Staged(_factory, u, ownerId, new AiChangeOperationInput(
            "o", "reorder", "scene", Order: new AiOrderInput(Id(story), Chapter: Id(chapter), Items: [Id(second), Id(first)]))));

        var scenes = (await ReadStory(owner, u, story)).Scenes;
        Assert.Equal([second, first], scenes.Where(scene => scene.ChapterId == chapter).OrderBy(scene => scene.SortOrder).Select(scene => scene.Id));
        Assert.Equal([loose], scenes.Where(scene => scene.ChapterId == null).Select(scene => scene.Id));
    }

    // ---------- World rules ----------

    [Fact]
    public async Task A_world_rule_is_proposed_with_its_check_and_goes_only_to_the_Trash()
    {
        var (owner, ownerId, u, _) = await World("airule");
        var rite = await RuleValidationTestClient.EventKind(owner, u, "Resurrection");
        var stones = await RuleValidationTestClient.Method(owner, u, "Seven stones");

        var refused = await Stage(_factory, u, ownerId, new AiChangeOperationInput(
            "r", "create", "world_rule", WorldRule: new AiWorldRuleInput("One return", Check: new AiRuleCheckInput(Guid.NewGuid(), stones.Id, 1))));
        Assert.Null(refused.Proposal);
        Assert.Contains(refused.Issues, problem => problem.Id == "r" && problem.Field!.EndsWith("eventKindId", StringComparison.Ordinal));

        var id = await Staged(_factory, u, ownerId, new AiChangeOperationInput(
            "r", "create", "world_rule", WorldRule: new AiWorldRuleInput("One return", "No one comes back twice.", new AiRuleCheckInput(rite.Id, stones.Id, 1))));
        var line = (await Read(owner, u, id)).Operations.Single().Lines.Single(entry => entry.Label == "Check");
        Assert.Equal("At most 1 Canon \"Resurrection\" by \"Seven stones\" for each participant", line.After);
        var ruleId = (await ApproveAll(owner, u, id)).Applied.Single().ResultId!.Value;
        var rule = await owner.GetFromJsonAsync<WorldRuleDetail>($"/api/universes/{u}/world-rules/{ruleId}");
        Assert.Equal((rite.Id, 1), (rule!.Validation!.EventKind.Id, rule.Validation.MaxOccurrences));

        await ApproveAll(owner, u, await Staged(_factory, u, ownerId, new AiChangeOperationInput(
            "e", "update", "world_rule", ruleId, WorldRule: new AiWorldRuleInput(Title: "Only one return", RemoveCheck: true))));
        rule = await owner.GetFromJsonAsync<WorldRuleDetail>($"/api/universes/{u}/world-rules/{ruleId}");
        Assert.Equal(("Only one return", null), (rule!.Title, rule.Validation));

        await ApproveAll(owner, u, await Staged(_factory, u, ownerId, Remove("x", "world_rule", ruleId)));
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/universes/{u}/world-rules/{ruleId}")).StatusCode);
        await WithDb(_factory, async db => Assert.NotNull((await db.WorldRules.SingleAsync(row => row.Id == ruleId)).DeletedAt));
    }

    // ---------- Ideas ----------

    [Fact]
    public async Task Only_the_owner_proposes_and_reviews_their_own_ideas_and_no_collaborator_sees_them()
    {
        var (owner, ownerId, u, character) = await World("aiidea");
        var (editor, editorId) = await PublishingTestClient.Account(_factory, "aiidea-editor");
        await CollaborationTestClient.Join(_factory, u, editorId, UniverseRole.Editor);

        // An editor can stage nothing about ideas.
        var refused = await Stage(_factory, u, editorId, new AiChangeOperationInput("i", "create", "idea", Idea: new AiIdeaInput("Mine?")));
        Assert.Equal(AiChangeCodes.NotAllowed, Assert.Single(refused.Issues).Code);

        var id = await Staged(
            _factory,
            u,
            ownerId,
            NewLore("arin", character, "Arin"),
            new AiChangeOperationInput("i", "create", "idea", Idea: new AiIdeaInput("What if Arin lies?", "A thought.", [new AiIdeaReferenceInput("lore_entry", Ref: "arin")])));

        // The editor is shown nothing of it: not in the list, not by its address, not to decide.
        Assert.DoesNotContain((await editor.GetFromJsonAsync<AiChangePage>($"/api/ai-changes?universeId={u}"))!.Items, item => item.Id == id);
        Assert.Equal(HttpStatusCode.NotFound, (await editor.GetAsync(Path(u, id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Reject(editor, u, id, null, all: true)).StatusCode);

        var receipt = await ApproveAll(owner, u, id);
        var ideaId = receipt.Applied.Single(line => line.Key == "i").ResultId!.Value;
        var idea = await owner.GetFromJsonAsync<IdeaDetail>($"/api/ideas/{ideaId}");
        Assert.Equal((u, "What if Arin lies?"), (idea!.Universe!.Id, idea.Title));
        Assert.Equal([receipt.Applied.Single(line => line.Key == "arin").ResultId!.Value], idea.References.Select(reference => reference.Id));

        // Removing it goes to the owner's deleted ideas, from where it is restored.
        await ApproveAll(owner, u, await Staged(_factory, u, ownerId, Remove("d", "idea", ideaId)));
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/ideas/{ideaId}")).StatusCode);
        (await owner.PostAsync($"/api/ideas/{ideaId}/restore", null)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task An_idea_of_another_account_another_universe_or_none_answers_as_missing()
    {
        var (owner, ownerId, u, _) = await World("aiideaforeign");
        var otherUniverse = (await CreateUniverse(owner, "Elsewhere")).Id;
        var (stranger, _) = await PublishingTestClient.Account(_factory, "aiideaforeign-stranger");

        var elsewhere = await PostJson<IdeaDetail>(owner, "/api/ideas", new IdeaRequest("Elsewhere idea", "", otherUniverse, null, null));
        var unassigned = await PostJson<IdeaDetail>(owner, "/api/ideas", new IdeaRequest("Loose idea", "", null, null, null));
        var theirs = await PostJson<IdeaDetail>(stranger, "/api/ideas", new IdeaRequest("Not yours", "", null, null, null));

        foreach (var target in new[] { elsewhere.Id, unassigned.Id, theirs.Id })
        {
            var staged = await Stage(_factory, u, ownerId, new AiChangeOperationInput("e", "update", "idea", target, Idea: new AiIdeaInput(Title: "Taken")));
            Assert.Equal(AiChangeCodes.NotFound, Assert.Single(staged.Issues).Code);
        }

        // And the catalog lists the owner's ideas of this universe only.
        var mine = await PostJson<IdeaDetail>(owner, "/api/ideas", new IdeaRequest("Here idea", "", u, null, null));
        var options = await Options(u, ownerId);
        Assert.Equal([mine.Id], options.Ideas!.Select(item => item.Id));
    }

    // ---------- Relationships and moments ----------

    [Fact]
    public async Task A_relationship_carries_its_dates_and_is_removed_only_to_the_Trash()
    {
        var (owner, ownerId, u, character) = await World("airel");
        var kind = await Kind(owner, u, "Rules");
        var id = await Staged(
            _factory,
            u,
            ownerId,
            NewLore("a", character, "Arin"),
            NewLore("b", character, "Bel"),
            new AiChangeOperationInput("l", "create", "relationship", Relationship: new AiRelationshipInput(
                kind.Id, Ref("a"), Ref("b"), StartDate: new DateTime(1200, 3, 4), EndDate: new DateTime(1240, 1, 1))));
        var link = (await ApproveAll(owner, u, id)).Applied.Single(line => line.Key == "l").ResultId!.Value;
        var detail = await owner.GetFromJsonAsync<RelationshipDetail>($"/api/universes/{u}/relationships/{link}");
        Assert.Equal((new DateTime(1200, 3, 4), new DateTime(1240, 1, 1)), (detail!.StartDate!.Value.Date, detail.EndDate!.Value.Date));

        var backwards = await Stage(_factory, u, ownerId, new AiChangeOperationInput("e", "update", "relationship", link, Relationship: new AiRelationshipInput(EndDate: new DateTime(1100, 1, 1))));
        Assert.NotEmpty(backwards.Issues);

        await ApproveAll(owner, u, await Staged(_factory, u, ownerId, Remove("x", "relationship", link)));
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/universes/{u}/relationships/{link}")).StatusCode);
        (await owner.PostAsync($"/api/universes/{u}/trash/relationships/{link}/restore", null)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task A_moment_is_linked_to_stories_and_given_details_and_an_older_change_keeps_them()
    {
        var (owner, ownerId, u, character) = await World("aimoment");
        var story = await CreateStory(owner, u, "War");
        var rite = await RuleValidationTestClient.EventKind(owner, u, "Coronation");
        var id = await Staged(
            _factory,
            u,
            ownerId,
            NewLore("k", character, "Kai"),
            new AiChangeOperationInput("m", "create", "timeline_event", Timeline: new AiTimelineInput(
                "Crowned", Date: new AiTimelineDateInput("exact", StartYear: 5), Participants: [Ref("k")], Stories: [Id(story)],
                Details: new AiMomentDetailsInput(rite.Id, null, Ref("k")))));
        var made = (await ApproveAll(owner, u, id)).Applied.ToDictionary(line => line.Key, line => line.ResultId!.Value);
        var moment = await owner.GetFromJsonAsync<TimelineEntryResponse>($"/api/universes/{u}/timeline/{made["m"]}");
        Assert.Equal([story], moment!.Stories!.Select(link => link.StoryId));
        Assert.Equal((rite.Id, made["k"]), (moment.Validation!.EventKind!.Id, moment.Validation.Participant!.EntityId));

        // An update that leaves stories and details out keeps them.
        await ApproveAll(owner, u, await Staged(_factory, u, ownerId, new AiChangeOperationInput("e", "update", "timeline_event", made["m"], Timeline: new AiTimelineInput(Title: "Crowned at last"))));
        moment = await owner.GetFromJsonAsync<TimelineEntryResponse>($"/api/universes/{u}/timeline/{made["m"]}");
        Assert.Equal(("Crowned at last", 1), (moment!.Title, moment.Stories!.Count));
        Assert.NotNull(moment.Validation);

        // A change stored before issue 45 - no stories, no details - is still applied, and keeps both.
        var legacy = await Staged(_factory, u, ownerId, new AiChangeOperationInput("l", "update", "timeline_event", made["m"], Timeline: new AiTimelineInput(Description: "Long ago.")));
        await WithDb(_factory, async db =>
        {
            var row = await db.AiChangeOperations.SingleAsync(operation => operation.ProposalId == legacy);
            row.Proposed = row.Proposed.Replace(",\"stories\":[{\"id\":\"" + story + "\",\"key\":null}]", string.Empty, StringComparison.Ordinal);
            row.Proposed = System.Text.RegularExpressions.Regex.Replace(row.Proposed, ",\"details\":\\{[^}]*\\}\\}", string.Empty);
            row.Before = row.Before!.Replace(",\"stories\":[{\"id\":\"" + story + "\",\"key\":null}]", string.Empty, StringComparison.Ordinal);
            row.Before = System.Text.RegularExpressions.Regex.Replace(row.Before, ",\"details\":\\{[^}]*\\}\\}", string.Empty);
            Assert.DoesNotContain("stories", row.Proposed, StringComparison.Ordinal);
            await db.SaveChangesAsync();
        });
        await ApproveAll(owner, u, legacy);
        moment = await owner.GetFromJsonAsync<TimelineEntryResponse>($"/api/universes/{u}/timeline/{made["m"]}");
        Assert.Equal(("Long ago.", 1), (moment!.Description, moment.Stories!.Count));
        Assert.NotNull(moment.Validation);
    }

    // ---------- Isolation, roles, decisions ----------

    [Fact]
    public async Task Ids_of_another_universe_answer_as_missing_for_every_new_resource()
    {
        var (owner, ownerId, u, character) = await World("aiforeign");
        var other = (await CreateUniverse(owner, "Other world")).Id;
        var story = await CreateStory(owner, other, "Theirs");
        var arc = await PostJson<PlotArcResponse>(owner, $"/api/universes/{other}/stories/{story}/plot-arcs", new PlotArcRequest("Theirs", null, null));
        var rule = await WorldRuleTestClient.CreateRule(owner, other, "Theirs");
        var moment = await RuleValidationTestClient.CreateMoment(owner, other, RuleValidationTestClient.Moment("Theirs", null));
        var otherCharacter = await TypeId(owner, other, "Character");
        var a = (await PostJson<EntityDetail>(owner, $"/api/universes/{other}/entities", new EntityRequest(otherCharacter, "A", null, CanonStatus.Idea, null, null, null))).Id;
        var b = (await PostJson<EntityDetail>(owner, $"/api/universes/{other}/entities", new EntityRequest(otherCharacter, "B", null, CanonStatus.Idea, null, null, null))).Id;
        var link = await PostJson<RelationshipDetail>(owner, $"/api/universes/{other}/relationships", new RelationshipRequest((await Kind(owner, other, "Knows")).Id, a, b, CanonStatus.Idea, null, null, null));

        foreach (var operation in new[]
        {
            new AiChangeOperationInput("x", "update", "plot_arc", arc.Id, PlotArc: new AiPlotArcInput(Title: "Taken")),
            new AiChangeOperationInput("x", "create", "plot_beat", PlotBeat: new AiPlotBeatInput(Id(arc.Id), "Taken")),
            new AiChangeOperationInput("x", "update", "world_rule", rule.Id, WorldRule: new AiWorldRuleInput(Title: "Taken")),
            Remove("x", "timeline_event", moment.Id),
            Remove("x", "relationship", link.Id),
            Article("x", Id(a), "append", Paragraph("Taken")),
            new AiChangeOperationInput("x", "reorder", "plot_arc", Order: new AiOrderInput(Id(story), Items: [Id(arc.Id)])),
        })
        {
            var staged = await Stage(_factory, u, ownerId, operation);
            Assert.Null(staged.Proposal);
            Assert.Contains(staged.Issues, problem => problem.Code == AiChangeCodes.NotFound);
        }

        Assert.Equal("Theirs", (await owner.GetFromJsonAsync<WorldRuleDetail>($"/api/universes/{other}/world-rules/{rule.Id}"))!.Title);
    }

    [Fact]
    public async Task A_proposers_lost_role_blocks_their_changes_and_a_rejected_arc_takes_its_beats()
    {
        var (owner, _, u, _) = await World("airoles");
        var (_, editorId) = await PublishingTestClient.Account(_factory, "airoles-editor");
        await CollaborationTestClient.Join(_factory, u, editorId, UniverseRole.Editor);
        var story = await CreateStory(owner, u, "Tale");

        var id = await Staged(
            _factory,
            u,
            editorId,
            new AiChangeOperationInput("arc", "create", "plot_arc", PlotArc: new AiPlotArcInput(Id(story), "Rise")),
            new AiChangeOperationInput("beat", "create", "plot_beat", PlotBeat: new AiPlotBeatInput(Ref("arc"), "Spark")),
            new AiChangeOperationInput("rule", "create", "world_rule", WorldRule: new AiWorldRuleInput("Steel remembers")));

        // Rejecting the arc rejects the beat that needs it; the rule waits on.
        var proposal = await Read(owner, u, id);
        (await Reject(owner, u, id, [Op(proposal, "arc")])).EnsureSuccessStatusCode();
        proposal = await Read(owner, u, id);
        Assert.Equal(
            [("arc", AiChangeOperationStatus.Rejected), ("beat", AiChangeOperationStatus.Rejected), ("rule", AiChangeOperationStatus.Pending)],
            proposal.Operations.Select(operation => (operation.Key, operation.Status)));

        // The editor becomes a Viewer: nothing they asked for can be applied any more.
        await WithDb(_factory, async db =>
        {
            var membership = await db.UniverseMemberships.SingleAsync(row => row.UniverseId == u && row.UserId == editorId);
            membership.Role = UniverseRole.Viewer;
            await db.SaveChangesAsync();
        });
        proposal = await Read(owner, u, id);
        Assert.NotNull(proposal.Blocked);
        Assert.Equal(AiChangeCodes.Blocked, await Code(await Approve(owner, u, proposal, ["rule"])));
        Assert.Empty((await owner.GetFromJsonAsync<WorldRulePage>($"/api/universes/{u}/world-rules"))!.Items);
    }

    // ---------- The catalog ----------

    [Fact]
    public async Task The_catalog_offers_each_role_what_it_may_propose_and_ideas_to_the_owner_alone()
    {
        var (owner, ownerId, u, _) = await World("aicatalog");
        var (_, editorId) = await PublishingTestClient.Account(_factory, "aicatalog-editor");
        var (_, reviewerId) = await PublishingTestClient.Account(_factory, "aicatalog-reviewer");
        await CollaborationTestClient.Join(_factory, u, editorId, UniverseRole.Editor);
        await CollaborationTestClient.Join(_factory, u, reviewerId, UniverseRole.Reviewer);
        var story = await CreateStory(owner, u, "Tale");
        await PostJson<PlotArcResponse>(owner, $"/api/universes/{u}/stories/{story}/plot-arcs", new PlotArcRequest("Rise", null, null));
        await RuleValidationTestClient.EventKind(owner, u, "Coronation");
        await PostJson<IdeaDetail>(owner, "/api/ideas", new IdeaRequest("Owner idea", "", u, null, null));

        var mine = await Options(u, ownerId);
        Assert.Contains("create idea", mine.Allowed);
        Assert.Contains("reorder chapter", mine.Allowed);
        Assert.Contains("remove relationship", mine.Allowed);
        Assert.Contains("update article", mine.Allowed);
        Assert.DoesNotContain("remove article", mine.Allowed);
        Assert.DoesNotContain("reorder story", mine.Allowed);
        Assert.Single(mine.Ideas!);
        Assert.Equal(["Rise"], mine.Stories.Single().PlotArcs!.Select(arc => arc.Title));
        Assert.Equal(["Coronation"], mine.EventKinds!.Select(term => term.Name));

        var editing = await Options(u, editorId);
        Assert.DoesNotContain(editing.Allowed, allowed => allowed.EndsWith(" idea", StringComparison.Ordinal));
        Assert.Null(editing.Ideas);

        var reviewing = await Options(u, reviewerId);
        Assert.Equal(["update lore_entry", "update scene", "update story"], reviewing.Allowed.Order());
    }

    private async Task<AiChangeOptions> Options(Guid universeId, string userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<Lorex.Api.Data.LorexDbContext>();
        var role = await UniverseAccess.RoleAsync(db, universeId, userId, default);
        return await AiChangeCatalog.ReadAsync(db, universeId, role!.Value, default);
    }
}
