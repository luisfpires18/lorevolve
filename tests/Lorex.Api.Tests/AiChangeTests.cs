using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.AiChanges;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.AiChangeTestClient;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Staged AI changes (ADR 0047): staging writes nothing but the proposal; an approval applies exactly the selected changes,
/// together or not at all, through each resource's own write path; dependencies, versions and stored forms are checked
/// again at approval; and a repeated approval applies nothing twice.
/// </summary>
public sealed class AiChangeTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private async Task<(HttpClient Owner, string OwnerId, Guid U, Guid Character, Guid Location)> World(string tag)
    {
        var (owner, ownerId) = await PublishingTestClient.Account(_factory, tag);
        var u = (await CreateUniverse(owner, $"World {tag}")).Id;
        return (owner, ownerId, u, await TypeId(owner, u, "Character"), await TypeId(owner, u, "Location"));
    }

    private async Task<int> Count<T>(Func<IQueryable<T>, Task<int>> count, Func<Lorex.Api.Data.LorexDbContext, IQueryable<T>> set)
    {
        var result = 0;
        await WithDb(_factory, async db => result = await count(set(db)));
        return result;
    }

    [Fact]
    public async Task Staging_writes_nothing_but_the_proposal()
    {
        var (owner, ownerId, u, character, _) = await World("aistage");
        var before = await Count(rows => rows.CountAsync(), db => db.Entities.Where(entity => entity.UniverseId == u));

        var id = await Staged(_factory, u, ownerId, NewLore("arin", character, "Arin"), NewLore("bel", character, "Bel"));

        Assert.Equal(before, await Count(rows => rows.CountAsync(), db => db.Entities.Where(entity => entity.UniverseId == u)));
        var proposal = await Read(owner, u, id);
        Assert.Equal(AiChangeProposalStatus.Open, proposal.Proposal.Status);
        Assert.Equal(AiChangeSource.Assistant, proposal.Proposal.Source);
        Assert.True(proposal.CanReview);
        Assert.Equal(["arin", "bel"], proposal.Operations.Select(operation => operation.Key));
        Assert.All(proposal.Operations, operation => Assert.Empty(operation.Issues));
        Assert.Equal("New Character: Arin", proposal.Operations[0].Title);
        Assert.Contains(proposal.Operations[0].Lines, line => line.Label == "Name" && line.After == "Arin");
    }

    [Fact]
    public async Task An_invalid_submission_stores_nothing_and_lists_every_problem()
    {
        var (_, ownerId, u, character, _) = await World("aiinvalid");
        var staged = await Stage(
            _factory,
            u,
            ownerId,
            NewLore("a", Guid.NewGuid(), "Wrong type"),
            NewLore("b", character, "Unknown field", new AiFieldInput(Guid.NewGuid(), Text: "x")),
            NewLore("b", character, "Duplicate key"),
            new AiChangeOperationInput("s", "create", "story", Story: new AiStoryInput("A tale")),
            new AiChangeOperationInput("c", "create", "relationship", Relationship: new AiRelationshipInput(Guid.NewGuid(), Ref("nowhere"), Ref("s"))),
            new AiChangeOperationInput("d", "explode", "lore_entry"),
            Remove("e", "manuscript", Guid.NewGuid()));

        Assert.Null(staged.Proposal);
        var codes = staged.Issues.Select(issue => (issue.Id, issue.Code)).ToList();
        Assert.Contains(("a", AiChangeCodes.NotFound), codes);
        Assert.Contains(("b", AiChangeCodes.NotFound), codes);
        Assert.Contains(("b", AiChangeCodes.Duplicate), codes);
        Assert.Contains(("c", AiChangeCodes.UnknownRef), codes);
        Assert.Contains(("c", AiChangeCodes.WrongRef), codes);
        Assert.Contains(("d", AiChangeCodes.Invalid), codes);
        Assert.Contains(("e", AiChangeCodes.Unsupported), codes);
        Assert.Equal(0, await Count(rows => rows.CountAsync(), db => db.AiChangeProposals.Where(proposal => proposal.UniverseId == u)));
    }

    [Fact]
    public async Task A_value_in_the_wrong_member_or_a_foreign_choice_is_refused_rather_than_dropped()
    {
        var (owner, ownerId, u, character, _) = await World("aikind");
        var age = await Field(owner, u, character, new FieldDefinitionRequest("Age", EntityFieldKind.Number, false, null, null, null));
        var house = await Field(owner, u, character, new FieldDefinitionRequest("House", EntityFieldKind.Select, false, null, null, ["Ash", "Oak"]));

        var staged = await Stage(
            _factory,
            u,
            ownerId,
            NewLore("a", character, "Text in a number", new AiFieldInput(age.Id, Text: "forty")),
            NewLore("b", character, "Someone else's choice", new AiFieldInput(house.Id, OptionIds: [Guid.NewGuid()])),
            NewLore("c", character, "Two choices", new AiFieldInput(house.Id, OptionIds: [.. house.Options.Select(option => option.Id)])));

        Assert.Null(staged.Proposal);
        Assert.Equal(["a", "b", "c"], staged.Issues.Select(issue => issue.Id).Distinct().Order());
    }

    [Fact]
    public async Task Connected_creation_applies_in_dependency_order_with_real_ids()
    {
        var (owner, ownerId, u, character, location) = await World("aiconnect");
        var home = await Field(owner, u, character, new FieldDefinitionRequest("Home", EntityFieldKind.EntityReference, false, null, null, null, TargetEntityTypeId: location));
        var kind = await Kind(owner, u, "Sworn to", symmetric: true);

        // Listed out of order: the relationship and the link name entries created later in the list.
        var id = await Staged(
            _factory,
            u,
            ownerId,
            NewLink("oath", kind.Id, Ref("arin"), Ref("bel")),
            NewLore("arin", character, "Arin", new AiFieldInput(home.Id, Entry: Ref("vale"))),
            NewLore("bel", character, "Bel"),
            NewLore("vale", location, "Vale"));

        var proposal = await Read(owner, u, id);
        Assert.Equal(["arin", "bel"], proposal.Operations.Single(operation => operation.Key == "oath").DependsOn.Order());
        Assert.Equal(["vale"], proposal.Operations.Single(operation => operation.Key == "arin").DependsOn);
        Assert.Contains("Vale (new)", proposal.Operations.Single(operation => operation.Key == "arin").Lines.Single(line => line.Label == "Home").After);

        var receipt = await ApproveAll(owner, u, id);
        var made = receipt.Applied.ToDictionary(line => line.Key, line => line.ResultId!.Value);
        var order = receipt.Applied.Select(line => line.Key).ToList();
        Assert.True(order.IndexOf("vale") < order.IndexOf("arin"), string.Join(", ", order));
        Assert.Equal("oath", order[^1]);

        var arin = await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{made["arin"]}");
        Assert.Equal(made["vale"], arin!.Fields.Single(field => field.FieldDefinitionId == home.Id).ReferencedEntityId);
        var relationship = await owner.GetFromJsonAsync<RelationshipDetail>($"/api/universes/{u}/relationships/{made["oath"]}");
        Assert.Equal((made["arin"], made["bel"]), (relationship!.SourceEntityId, relationship.TargetEntityId));
        Assert.Equal(AiChangeProposalStatus.Approved, receipt.Proposal.Proposal.Status);

        // History names the approver as the author of the new entry.
        var history = await owner.GetFromJsonAsync<List<EntityRevisionSummary>>($"/api/universes/{u}/entities/{made["arin"]}/revisions");
        Assert.Single(history!);
    }

    [Fact]
    public async Task A_change_cannot_be_approved_without_what_it_needs_and_rejecting_takes_what_needs_it()
    {
        var (owner, ownerId, u, character, _) = await World("aideps");
        var kind = await Kind(owner, u, "Knows");
        var id = await Staged(_factory, u, ownerId, NewLore("a", character, "Ada"), NewLore("b", character, "Bo"), NewLink("ab", kind.Id, Ref("a"), Ref("b")));
        var proposal = await Read(owner, u, id);

        var alone = await Approve(owner, u, proposal, ["ab"]);
        Assert.Equal(HttpStatusCode.Conflict, alone.StatusCode);
        Assert.Equal(AiChangeCodes.MissingDependency, await Code(alone));

        Assert.Equal(HttpStatusCode.OK, (await Approve(owner, u, proposal, ["a"])).StatusCode);
        proposal = await Read(owner, u, id);
        Assert.Equal(AiChangeProposalStatus.Open, proposal.Proposal.Status);

        // Rejecting Bo rejects the relationship that needs him; Ada stays applied.
        var rejected = await Reject(owner, u, id, [Op(proposal, "b")]);
        Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);
        proposal = (await rejected.Content.ReadFromJsonAsync<AiChangeProposalResponse>())!;
        Assert.Equal(AiChangeOperationStatus.Rejected, proposal.Operations.Single(operation => operation.Key == "ab").Status);
        Assert.Equal("needs_rejected", proposal.Operations.Single(operation => operation.Key == "ab").ResolutionNote);
        Assert.Equal(AiChangeProposalStatus.PartiallyApproved, proposal.Proposal.Status);
        Assert.Equal(1, await Count(rows => rows.CountAsync(), db => db.Entities.Where(entity => entity.UniverseId == u && entity.Name == "Ada")));
        Assert.Equal(0, await Count(rows => rows.CountAsync(), db => db.Entities.Where(entity => entity.UniverseId == u && entity.Name == "Bo")));
    }

    [Fact]
    public async Task A_repeated_approval_applies_nothing_twice_and_a_second_approver_finds_it_decided()
    {
        var (owner, ownerId, u, character, _) = await World("aiidem");
        var id = await Staged(_factory, u, ownerId, NewLore("a", character, "Once"));
        var proposal = await Read(owner, u, id);
        var approval = Guid.NewGuid();

        var first = await Approve(owner, u, proposal, ["a"], approval);
        var again = await Approve(owner, u, proposal, ["a"], approval);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(
            (await first.Content.ReadFromJsonAsync<AiChangeReceipt>())!.Applied.Single().ResultId,
            (await again.Content.ReadFromJsonAsync<AiChangeReceipt>())!.Applied.Single().ResultId);

        var other = await Approve(owner, u, proposal, ["a"]);
        Assert.Equal(HttpStatusCode.Conflict, other.StatusCode);
        Assert.Equal(AiChangeCodes.NotOpen, await Code(other));
        Assert.Equal(1, await Count(rows => rows.CountAsync(), db => db.Entities.Where(entity => entity.UniverseId == u && entity.Name == "Once")));
    }

    [Fact]
    public async Task A_failure_part_way_through_an_approval_applies_none_of_it_and_the_same_approval_can_be_sent_again()
    {
        var (owner, ownerId, u, character, _) = await World("aiatomic");
        var kind = await Kind(owner, u, "Rivals", symmetric: true);
        var id = await Staged(_factory, u, ownerId, NewLore("a", character, "Cara"), NewLore("b", character, "Dane"), NewLink("ab", kind.Id, Ref("a"), Ref("b")));
        var proposal = await Read(owner, u, id);
        var approval = Guid.NewGuid();

        // The relationship's insert fails after both entries were written in the same transaction.
        _factory.Commands.FailWhen = command => command.CommandText.Contains("INSERT INTO \"Relationships\"", StringComparison.Ordinal);
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await Approve(owner, u, proposal, ["a", "b", "ab"], approval)).StatusCode);
        }
        finally
        {
            _factory.Commands.FailWhen = null;
        }

        Assert.Equal(0, await Count(rows => rows.CountAsync(), db => db.Entities.Where(entity => entity.UniverseId == u && (entity.Name == "Cara" || entity.Name == "Dane"))));
        proposal = await Read(owner, u, id);
        Assert.All(proposal.Operations, operation => Assert.Equal(AiChangeOperationStatus.Pending, operation.Status));

        var retried = await Approve(owner, u, proposal, ["a", "b", "ab"], approval);
        Assert.Equal(HttpStatusCode.OK, retried.StatusCode);
        Assert.Equal(1, await Count(rows => rows.CountAsync(), db => db.Relationships.Where(row => row.UniverseId == u)));
    }

    [Fact]
    public async Task An_entry_saved_after_staging_is_a_conflict_and_is_never_overwritten()
    {
        var (owner, ownerId, u, character, _) = await World("aistale");
        var entry = await CreateEntity(owner, u, "Edda");
        var id = await Staged(_factory, u, ownerId, EditLore("e", entry, new AiLoreInput(Summary: "From the AI.")));

        (await owner.PutVersionedAsync($"/api/universes/{u}/entities/{entry}", new EntityRequest(character, "Edda", "By hand.", CanonStatus.Canon, null, null, null))).EnsureSuccessStatusCode();

        var proposal = await Read(owner, u, id);
        Assert.True(proposal.Operations.Single().IsConflict);
        var approve = await Approve(owner, u, proposal, ["e"]);
        Assert.Equal(HttpStatusCode.Conflict, approve.StatusCode);
        Assert.Equal(AiChangeCodes.CannotApprove, await Code(approve));
        Assert.Equal("By hand.", (await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}"))!.Summary);
    }

    [Fact]
    public async Task Two_proposals_for_one_entry_apply_the_first_and_refuse_the_second()
    {
        var (owner, ownerId, u, _, _) = await World("aitwice");
        var entry = await CreateEntity(owner, u, "Fen");
        var first = await Staged(_factory, u, ownerId, EditLore("e", entry, new AiLoreInput(Summary: "First.")));
        var second = await Staged(_factory, u, ownerId, EditLore("e", entry, new AiLoreInput(Summary: "Second.")));

        await ApproveAll(owner, u, first);
        var refused = await Approve(owner, u, await Read(owner, u, second), ["e"]);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("First.", (await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}"))!.Summary);
    }

    [Fact]
    public async Task An_edit_is_checked_moves_the_revision_and_is_exactly_what_is_applied()
    {
        var (owner, ownerId, u, character, _) = await World("aiedit");
        var id = await Staged(_factory, u, ownerId, NewLore("a", character, "Gil"));
        var stale = await Read(owner, u, id);
        var op = Op(stale, "a");
        var edit = $"{Path(u, id)}/operations/{op}";

        var blank = await owner.PutAsJsonAsync(edit, new AiChangeEditRequest(stale.Revision, new AiChangeEditable(Name: " ")));
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);

        var edited = await owner.PutAsJsonAsync(edit, new AiChangeEditRequest(stale.Revision, new AiChangeEditable(Name: "Gilda", Summary: "Renamed in review.")));
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        Assert.Equal(stale.Revision + 1, (await edited.Content.ReadFromJsonAsync<AiChangeProposalResponse>())!.Revision);

        var outOfDate = await Approve(owner, u, stale, ["a"]);
        Assert.Equal(AiChangeCodes.ProposalChanged, await Code(outOfDate));

        var receipt = await ApproveAll(owner, u, id);
        var made = await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{receipt.Applied.Single().ResultId}");
        Assert.Equal(("Gilda", "Renamed in review."), (made!.Name, made.Summary));
    }

    [Fact]
    public async Task Entries_are_updated_through_their_save_and_removed_to_the_trash()
    {
        var (owner, ownerId, u, character, _) = await World("aientry");
        var age = await Field(owner, u, character, new FieldDefinitionRequest("Age", EntityFieldKind.Number, false, null, null, null));
        var keep = await CreateEntity(owner, u, "Hale");
        var gone = await CreateEntity(owner, u, "Ivo");

        var id = await Staged(
            _factory,
            u,
            ownerId,
            EditLore("hale", keep, new AiLoreInput(Name: "Hale the Elder", Aliases: ["Old Hale"], Fields: [new AiFieldInput(age.Id, Number: 71)])),
            Remove("ivo", "lore_entry", gone));
        var proposal = await Read(owner, u, id);
        Assert.Contains(proposal.Operations.Single(operation => operation.Key == "hale").Lines, line => line.Label == "Name" && line.Before == "Hale" && line.After == "Hale the Elder");
        Assert.NotNull(proposal.Operations.Single(operation => operation.Key == "ivo").Impact);

        await ApproveAll(owner, u, id);

        var hale = await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{keep}");
        Assert.Equal(("Hale the Elder", 71d), (hale!.Name, hale.Fields.Single().Number));
        Assert.Equal(["Old Hale"], hale.Aliases);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/universes/{u}/entities/{gone}")).StatusCode);

        // In the Trash, not erased: it restores.
        (await owner.PostAsync($"/api/universes/{u}/trash/{gone}/restore", null)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Stories_chapters_scenes_and_prose_go_through_their_own_paths()
    {
        var (owner, ownerId, u, character, _) = await World("aistory");
        var hero = await CreateEntity(owner, u, "Jun");
        var existing = await CreateStory(owner, u, "Old tale");
        var oldChapter = await CreateChapter(owner, u, existing, "Prologue");
        var oldScene = await CreateScene(owner, u, existing, "Gate", oldChapter);
        await WriteManuscript(owner, u, existing, oldScene, "It began.");

        var id = await Staged(
            _factory,
            u,
            ownerId,
            new AiChangeOperationInput("tale", "create", "story", Story: new AiStoryInput("New tale", "A premise.", "drafting")),
            new AiChangeOperationInput("one", "create", "chapter", Chapter: new AiChapterInput(Ref("tale"), "One")),
            new AiChangeOperationInput("meet", "create", "scene", Scene: new AiSceneInput(Ref("tale"), Ref("one"), "The meeting", PointOfView: Id(hero), Lore: [Id(hero)])),
            new AiChangeOperationInput("words", "update", "manuscript", Manuscript: new AiManuscriptInput(Ref("meet"), "append", "They met at dusk.")),
            new AiChangeOperationInput("more", "update", "manuscript", Manuscript: new AiManuscriptInput(Id(oldScene), "append", "Then it rained.")),
            new AiChangeOperationInput("retitle", "update", "story", existing, Story: new AiStoryInput(Title: "Older tale")),
            new AiChangeOperationInput("prologue", "update", "chapter", oldChapter, Chapter: new AiChapterInput(Summary: "Where it starts.")));

        var receipt = await ApproveAll(owner, u, id);
        var made = receipt.Applied.ToDictionary(line => line.Key, line => line.ResultId!.Value);

        var tale = await ReadStory(owner, u, made["tale"]);
        Assert.Equal(("New tale", StoryStatus.Drafting), (tale.Title, tale.Status));
        var scene = tale.Scenes.Single();
        Assert.Equal((made["one"], hero), (scene.ChapterId!.Value, scene.Pov!.EntityId));
        Assert.Equal("They met at dusk.", (await owner.GetFromJsonAsync<SceneManuscriptResponse>(Manuscript(u, made["tale"], made["meet"])))!.Content);
        Assert.Equal("It began.\n\nThen it rained.", (await owner.GetFromJsonAsync<SceneManuscriptResponse>(Manuscript(u, existing, oldScene)))!.Content);
        var older = await ReadStory(owner, u, existing);
        Assert.Equal(("Older tale", "Where it starts."), (older.Title, older.Chapters.Single().Summary));

        // Removing the chapter keeps its scene, in Unchaptered; removing the story puts it in the Trash.
        var removal = await Staged(_factory, u, ownerId, new AiChangeOperationInput("drop", "remove", "chapter", made["one"]), Remove("story", "story", existing));
        await ApproveAll(owner, u, removal);
        tale = await ReadStory(owner, u, made["tale"]);
        Assert.Empty(tale.Chapters);
        Assert.Null(tale.Scenes.Single().ChapterId);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(Story(u, existing))).StatusCode);
    }

    [Fact]
    public async Task Replacing_prose_needs_the_version_read_and_never_overwrites_newer_prose()
    {
        var (owner, ownerId, u, _, _) = await World("aiprose");
        var story = await CreateStory(owner, u, "Tale");
        var scene = await CreateScene(owner, u, story, "Scene");
        await WriteManuscript(owner, u, story, scene, "First draft.");
        var version = (await owner.GetFromJsonAsync<SceneManuscriptResponse>(Manuscript(u, story, scene)))!.Version;

        var unversioned = await Stage(_factory, u, ownerId, new AiChangeOperationInput("p", "update", "manuscript", Manuscript: new AiManuscriptInput(Id(scene), "replace", "AI draft.")));
        Assert.Null(unversioned.Proposal);

        var id = await Staged(_factory, u, ownerId, new AiChangeOperationInput("p", "update", "manuscript", ExpectedVersion: version, Manuscript: new AiManuscriptInput(Id(scene), "replace", "AI draft.")));
        var proposal = await Read(owner, u, id);
        Assert.Equal(("First draft.", "AI draft."), (proposal.Operations.Single().Prose!.Current, proposal.Operations.Single().Prose!.Proposed));

        await WriteManuscript(owner, u, story, scene, "Second draft, by hand.");
        var refused = await Approve(owner, u, await Read(owner, u, id), ["p"]);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("Second draft, by hand.", (await owner.GetFromJsonAsync<SceneManuscriptResponse>(Manuscript(u, story, scene)))!.Content);
    }

    [Fact]
    public async Task Timeline_moments_are_created_updated_and_removed_only_to_the_Trash()
    {
        var (owner, ownerId, u, character, _) = await World("aitime");
        var id = await Staged(
            _factory,
            u,
            ownerId,
            NewLore("k", character, "Kai"),
            new AiChangeOperationInput("war", "create", "timeline_event", Timeline: new AiTimelineInput(
                "The long war", "It went on.", "draft", new AiTimelineDateInput("range", StartYear: 10, EndYear: 14), [Ref("k")])));
        var receipt = await ApproveAll(owner, u, id);
        var made = receipt.Applied.ToDictionary(line => line.Key, line => line.ResultId!.Value);
        var war = await owner.GetFromJsonAsync<TimelineEntryResponse>($"/api/universes/{u}/timeline/{made["war"]}");
        Assert.Equal((10, 14, made["k"]), (war!.Date.StartYear!.Value, war.Date.EndYear!.Value, war.Entities.Single().EntityId));

        var edit = await Staged(_factory, u, ownerId, new AiChangeOperationInput("w", "update", "timeline_event", made["war"], Timeline: new AiTimelineInput(Title: "The longest war")));
        await ApproveAll(owner, u, edit);
        Assert.Equal("The longest war", (await owner.GetFromJsonAsync<TimelineEntryResponse>($"/api/universes/{u}/timeline/{made["war"]}"))!.Title);

        // Removal is reversible since ADR 0048: the moment goes to the Trash, and comes back from it whole.
        var removal = await Staged(_factory, u, ownerId, Remove("w", "timeline_event", made["war"]));
        await ApproveAll(owner, u, removal);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/universes/{u}/timeline/{made["war"]}")).StatusCode);
        await WithDb(_factory, async db => Assert.NotNull((await db.TimelineEntries.SingleAsync(row => row.Id == made["war"])).DeletedAt));

        (await owner.PostAsync($"/api/universes/{u}/trash/timeline/{made["war"]}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal("The longest war", (await owner.GetFromJsonAsync<TimelineEntryResponse>($"/api/universes/{u}/timeline/{made["war"]}"))!.Title);
    }

    [Fact]
    public async Task A_bounded_batch_of_fifty_entries_and_their_links_applies_in_one_approval()
    {
        var (owner, ownerId, u, character, location) = await World("aibatch");
        var kind = await Kind(owner, u, "Lives in");
        var operations = new List<AiChangeOperationInput>();
        for (var kingdom = 0; kingdom < 5; kingdom++)
        {
            operations.Add(NewLore($"kingdom-{kingdom}", location, $"Kingdom {kingdom}"));
        }

        for (var person = 0; person < 45; person++)
        {
            operations.Add(NewLore($"person-{person}", character, $"Person {person}"));
            operations.Add(NewLink($"home-{person}", kind.Id, Ref($"person-{person}"), Ref($"kingdom-{person % 5}")));
        }

        var id = await Staged(_factory, u, ownerId, [.. operations]);
        var receipt = await ApproveAll(owner, u, id);
        Assert.Equal(95, receipt.Applied.Count);
        Assert.Equal(45, await Count(rows => rows.CountAsync(), db => db.Relationships.Where(row => row.UniverseId == u)));

        var tooMany = await Stage(_factory, u, ownerId, [.. Enumerable.Range(0, AiChangeLimits.MaxOperations + 1).Select(index => NewLore($"x{index}", character, $"X {index}"))]);
        Assert.Equal(AiChangeCodes.TooLarge, Assert.Single(tooMany.Issues).Code);
    }

    [Fact]
    public async Task Changes_that_need_each_other_in_a_ring_are_refused()
    {
        var (owner, ownerId, u, character, _) = await World("airing");
        var friend = await Field(owner, u, character, new FieldDefinitionRequest("Friend", EntityFieldKind.EntityReference, false, null, null, null));
        var staged = await Stage(
            _factory,
            u,
            ownerId,
            NewLore("a", character, "Lia", new AiFieldInput(friend.Id, Entry: Ref("b"))),
            NewLore("b", character, "Mo", new AiFieldInput(friend.Id, Entry: Ref("a"))));

        Assert.Null(staged.Proposal);
        Assert.All(staged.Issues, issue => Assert.Equal(AiChangeCodes.Cycle, issue.Code));
    }

    [Fact]
    public async Task An_open_proposal_expires_unapplied()
    {
        var (owner, ownerId, u, character, _) = await World("aiexpire");
        var id = await Staged(_factory, u, ownerId, NewLore("a", character, "Never"));
        var proposal = await Read(owner, u, id);

        // Its lifetime runs out (moved here rather than on the clock, which the session would follow).
        await WithDb(_factory, db => db.AiChangeProposals.Where(row => row.Id == id)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.ExpiresAt, DateTime.UtcNow.AddMinutes(-1))));

        var expired = await Approve(owner, u, proposal, ["a"]);
        Assert.Equal(AiChangeCodes.NotOpen, await Code(expired));
        proposal = await Read(owner, u, id);
        Assert.Equal(AiChangeProposalStatus.Expired, proposal.Proposal.Status);
        Assert.Equal("expired", proposal.Operations.Single().ResolutionNote);

        Assert.Equal(0, await Count(rows => rows.CountAsync(), db => db.Entities.Where(entity => entity.UniverseId == u && entity.Name == "Never")));
    }
}
