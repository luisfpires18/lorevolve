using System.Net;
using System.Net.Http.Json;
using System.Text;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Trash;
using Lorex.Api.Features.Universes;
using Lorex.Api.Features.WorldRules;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.ArticleTestClient;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.IdeaTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// What each collaborator may actually do (ADR 0041), as whole flows rather than single refusals - those are
/// <see cref="UniverseAccessMatrixTests"/>. An Editor writes every family of content, manages types, trashes and
/// restores, and uses history; the Trash's erase, the universe itself, publication and backups stay the owner's. A
/// Reviewer and a Viewer read. Nobody's ideas cross over, and a membership never leaves the database in a backup.
/// </summary>
public sealed class UniverseCollaborationTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    // ---------- The capability matrix itself ----------

    [Theory]
    [InlineData(UniverseRole.Owner, "Read EditContent ManageTrash ManageHistory PermanentlyDelete ManageUniverse Publish Backup ManageCollaborators Comment ResolveComments SuggestChanges ResolveSuggestedChanges")]
    [InlineData(UniverseRole.Editor, "Read EditContent ManageTrash ManageHistory Comment ResolveComments SuggestChanges ResolveSuggestedChanges")]
    [InlineData(UniverseRole.Reviewer, "Read Comment SuggestChanges")]
    [InlineData(UniverseRole.Viewer, "Read")]
    public void Each_role_carries_exactly_its_capabilities(UniverseRole role, string expected)
    {
        var granted = Enum.GetValues<UniverseCapability>().Where(capability => UniverseAccess.Allows(role, capability));
        Assert.Equal(expected, string.Join(' ', granted));
    }

    [Fact]
    public void A_role_the_matrix_does_not_know_carries_nothing() =>
        Assert.DoesNotContain(Enum.GetValues<UniverseCapability>(), capability => UniverseAccess.Allows((UniverseRole)99, capability));

    // ---------- An Editor edits ----------

    [Fact]
    public async Task An_editor_creates_and_edits_every_family_of_content()
    {
        var w = await NewSharedWorld(_factory, "coedit");
        var c = w.Editor;
        var u = $"/api/universes/{w.U}";

        // Lore, its taxonomy and its media.
        var created = await PostJson<EntityDetail>(c, $"{u}/entities", new EntityRequest(w.CharacterType, "Editor's heir", null, CanonStatus.Draft, null, null, null));
        await Ok(c.PutVersionedAsync($"{u}/entities/{created.Id}", new EntityRequest(w.CharacterType, "Editor's heir", "Now canon.", CanonStatus.Canon, null, null, null)));
        await Ok(c.PostAsJsonAsync($"{u}/entities/bulk", new BulkEntityRequest([new BulkEntityRow(w.CharacterType, "Bulk heir", CanonStatus.Canon)])));
        await WriteArticle(c, w.U, created.Id, Doc("Written by an editor."));
        await UploadImage(c, w.U, created.Id);

        var type = await PostJson<EntityTypeResponse>(c, $"{u}/entity-types", new EntityTypeRequest("Relic", null, null, null, null));
        await Ok(c.PutAsJsonAsync($"{u}/entity-types/{type.Id}", new EntityTypeRequest("Relics", null, null, null, null)));
        await Ok(c.PostAsJsonAsync($"{u}/entity-types/{type.Id}/reorder", new EntityTypeReorderRequest(0, null)));
        await Ok(c.PutAsJsonAsync($"{u}/entity-types/{type.Id}", new EntityTypeRequest("Relics", null, null, null, null, Parent: new EntityTypeParentChoice(w.CharacterType))));
        await Ok(c.PutAsJsonAsync($"{u}/entity-types/{type.Id}", new EntityTypeRequest("Relics", null, null, null, null, Parent: new EntityTypeParentChoice(null))));
        var withField = await PostJson<EntityTypeResponse>(c, $"{u}/entity-types/{type.Id}/fields", new FieldDefinitionRequest("Forged by", EntityFieldKind.ShortText, false, null, null, null));
        await Ok(c.DeleteAsync($"{u}/entity-types/{type.Id}/fields/{withField.Fields.Single().Id}"));
        await Ok(c.DeleteAsync($"{u}/entity-types/{type.Id}"));

        // Relationships, timeline, chronology, rules, terms, Canon.
        var kind = await PostJson<RelationshipTypeResponse>(c, $"{u}/relationship-types", new RelationshipTypeRequest("Rival of", null, true, null, null));
        var link = await PostJson<RelationshipDetail>(c, $"{u}/relationships", new RelationshipRequest(kind.Id, created.Id, w.Entry, CanonStatus.Canon, null, null, null));
        await Ok(c.PutAsJsonAsync($"{u}/relationships/{link.Id}", new RelationshipRequest(kind.Id, created.Id, w.Entry, CanonStatus.Canon, null, null, "Bitter.")));
        await Ok(c.DeleteAsync($"{u}/relationships/{link.Id}"));
        var moment = await RuleValidationTestClient.CreateMoment(c, w.U, RuleValidationTestClient.Moment("The editor's flood", null));
        await RuleValidationTestClient.UpdateMoment(c, w.U, moment.Id, RuleValidationTestClient.Moment("The editor's great flood", null));
        await Ok(c.PutAsJsonAsync($"{u}/chronology", new Lorex.Api.Features.Chronology.ChronologyRequest([])));
        var rule = await WorldRuleTestClient.CreateRule(c, w.U, "Salt binds");
        await WorldRuleTestClient.SaveRule(c, w.U, rule, description: "Edited by an editor.");
        var term = await RuleValidationTestClient.EventKind(c, w.U, "Abdication");
        await Ok(RuleValidationTestClient.RenameTerm(c, w.U, term.Id, "Crowning"));
        await RuleValidationTestClient.Evaluate(c, w.U);

        // Stories, chapters, scenes, manuscripts, plot.
        var story = await CreateStory(c, w.U, "The editor's book");
        await PutJson<StoryDetail>(c, Story(w.U, story), new StoryRequest("The editor's book", "A premise.", StoryStatus.Drafting));
        var chapter = await CreateChapter(c, w.U, story, "One");
        var scene = await CreateScene(c, w.U, story, "Opening", chapter);
        await Ok(c.PutAsJsonAsync($"{Story(w.U, story)}/scenes/{scene}/position", new ScenePositionRequest(null, 0)));
        await ManuscriptTestClient.WriteManuscript(c, w.U, story, scene, "Prose by an editor.");
        var arc = await CreateArc(c, w.U, story, "Rise");
        var beat = await CreateBeat(c, w.U, story, arc.Id, "First step", scenes: [scene], entities: [created.Id]);
        await PutJson<PlotBeatResponse>(c, Beat(w.U, story, beat.Id), new PlotBeatRequest("First steps", null, null, [scene], [created.Id]));

        // The owner sees every word of it.
        Assert.Equal("Now canon.", (await w.Owner.GetFromJsonAsync<EntityDetail>($"{u}/entities/{created.Id}"))!.Summary);
        Assert.Equal("Prose by an editor.", (await ManuscriptTestClient.ReadManuscript(w.Owner, w.U, story, scene)).Content);
        Assert.Equal("First steps", (await ReadBeat(w.Owner, w.U, story, beat.Id)).Title);
    }

    [Fact]
    public async Task An_editor_reads_and_restores_history()
    {
        var w = await NewSharedWorld(_factory, "cohistory");
        var e = $"/api/universes/{w.U}/entities/{w.Entry}";

        Assert.NotEmpty((await w.Editor.GetFromJsonAsync<List<EntityRevisionSummary>>($"{e}/revisions"))!);
        await Ok(VersionTestClient.RestoreEntryVersion(w.Editor, e, w.EntryRevision));

        var article = await ReadArticle(w.Editor, w.U, w.Entry);
        await Ok(RestoreArticle(w.Editor, w.U, w.Entry, w.ArticleRevision, article.Version));

        var scene = ManuscriptTestClient.Manuscript(w.U, w.Story, w.Scene);
        var manuscript = await ManuscriptTestClient.ReadManuscript(w.Editor, w.U, w.Story, w.Scene);
        await Ok(w.Editor.PostAsJsonAsync($"{scene}/revisions/{w.ManuscriptRevision}/restore", new SceneManuscriptRestoreRequest(manuscript.Version)));
        Assert.Equal("She walked.", (await ManuscriptTestClient.ReadManuscript(w.Owner, w.U, w.Story, w.Scene)).Content);
    }

    // ---------- The Trash: Editors trash and restore, only the owner erases ----------

    [Fact]
    public async Task An_editor_trashes_lists_and_restores_but_the_trash_stays_the_owners_to_erase()
    {
        var w = await NewSharedWorld(_factory, "cotrash");
        var u = $"/api/universes/{w.U}";

        // Trash: one by one and in bulk.
        var bulkA = await CreateEntity(w.Owner, w.U, "Bulk A");
        var bulkB = await CreateEntity(w.Owner, w.U, "Bulk B");
        await Ok(w.Editor.DeleteAsync($"{u}/entities/{w.Other}"));
        await Ok(w.Editor.PostAsJsonAsync($"{u}/entities/bulk-trash", new BulkTrashRequest([bulkA, bulkB])));
        await Ok(w.Editor.DeleteAsync(Beat(w.U, w.Story, w.Beat)));
        await Ok(w.Editor.DeleteAsync(Arc(w.U, w.Story, w.Arc)));
        await Ok(w.Editor.DeleteAsync($"{Story(w.U, w.Story)}/scenes/{w.Scene}"));
        await Ok(w.Editor.DeleteAsync($"{Story(w.U, w.Story)}/chapters/{w.Chapter}"));
        await Ok(w.Editor.DeleteAsync(WorldRuleTestClient.Rule(w.U, w.Rule)));
        await Ok(w.Editor.DeleteAsync(Story(w.U, w.Story)));

        var listed = (await w.Editor.GetFromJsonAsync<TrashPage>($"{u}/trash?pageSize=50"))!;
        Assert.Contains(listed.Items, item => item.Id == w.Other);
        Assert.Contains(listed.Items, item => item.Id == w.Story);

        // Restore: every kind, from the owner's own trashing too.
        var t = $"{u}/trash";
        await Ok(w.Editor.PostAsync($"{t}/{w.Other}/restore", null));
        await Ok(w.Editor.PostAsync($"{t}/{w.Trash.Entry}/restore", null));
        await Ok(w.Editor.PostAsync($"{t}/stories/{w.Trash.Story}/restore", null));
        await Ok(w.Editor.PostAsync($"{t}/chapters/{w.Trash.Chapter}/restore", null));
        await Ok(w.Editor.PostAsync($"{t}/scenes/{w.Trash.Scene}/restore", null));
        await Ok(w.Editor.PostAsync($"{t}/plot-arcs/{w.Trash.Arc}/restore", null));
        await Ok(w.Editor.PostAsync($"{t}/plot-beats/{w.Trash.Beat}/restore", null));
        await Ok(w.Editor.PostAsync($"{t}/world-rules/{w.Trash.Rule}/restore", null));
        await Ok(w.Editor.PostAsync($"{t}/stories/{w.Story}/restore", null));

        // Reviewers and Viewers neither see nor touch it.
        foreach (var reader in new[] { w.Reviewer, w.Viewer })
        {
            await AssertDenied(await reader.GetAsync($"{u}/trash"), "trash list");
            await AssertDenied(await reader.PostAsync($"{t}/{bulkA}/restore", null), "restore");
            await AssertDenied(await reader.DeleteAsync($"{u}/entities/{w.Entry}"), "trash entry");
            await AssertDenied(await reader.PostAsJsonAsync($"{u}/entities/bulk-trash", new BulkTrashRequest([w.Entry])), "bulk trash");
        }

        Assert.True(await LiveEntry(w.Entry));
        Assert.False(await LiveEntry(bulkA));
    }

    [Fact]
    public async Task No_editor_erases_anything_from_the_trash_and_the_owner_still_can()
    {
        var w = await NewSharedWorld(_factory, "coerase");
        var t = $"/api/universes/{w.U}/trash";

        // Things the Editor trashed themselves are no exception.
        var own = await CreateEntity(w.Editor, w.U, "Editor's own");
        await Ok(w.Editor.DeleteAsync($"/api/universes/{w.U}/entities/{own}"));

        var routes = new[]
        {
            $"{t}/{w.Trash.Entry}",
            $"{t}/{own}",
            $"{t}/stories/{w.Trash.Story}",
            $"{t}/chapters/{w.Trash.Chapter}",
            $"{t}/scenes/{w.Trash.Scene}",
            $"{t}/plot-arcs/{w.Trash.Arc}",
            $"{t}/plot-beats/{w.Trash.Beat}",
            $"{t}/world-rules/{w.Trash.Rule}",
            $"{t}/relationships/{w.Trash.Relationship}",
            $"{t}/timeline/{w.Trash.Moment}",
        };

        var mixed = new BulkTrashDeleteRequest(
        [
            new TrashSelection(TrashItemKind.Entry, w.Trash.Entry),
            new TrashSelection(TrashItemKind.Entry, own),
            new TrashSelection(TrashItemKind.Story, w.Trash.Story),
            new TrashSelection(TrashItemKind.Chapter, w.Trash.Chapter),
            new TrashSelection(TrashItemKind.Scene, w.Trash.Scene),
            new TrashSelection(TrashItemKind.PlotArc, w.Trash.Arc),
            new TrashSelection(TrashItemKind.PlotBeat, w.Trash.Beat),
            new TrashSelection(TrashItemKind.WorldRule, w.Trash.Rule),
            new TrashSelection(TrashItemKind.Relationship, w.Trash.Relationship),
            new TrashSelection(TrashItemKind.TimelineEvent, w.Trash.Moment),
        ]);

        foreach (var who in new[] { w.Editor, w.Reviewer, w.Viewer })
        {
            foreach (var route in routes)
            {
                await AssertDenied(await who.DeleteAsync(route), route);
            }

            await AssertDenied(await who.PostAsJsonAsync($"{t}/bulk-delete", mixed), "bulk erase");
        }

        Assert.Equal(10, (await w.Owner.GetFromJsonAsync<TrashPage>($"{t}?pageSize=50"))!.TotalCount);

        // The owner erases one alone and the rest in one mixed bulk.
        await Ok(w.Owner.DeleteAsync(routes[0]));
        var erased = await w.Owner.PostAsJsonAsync($"{t}/bulk-delete", new BulkTrashDeleteRequest([.. mixed.Items!.Skip(1)]));
        await Ok(Task.FromResult(erased));
        Assert.Equal(0, (await w.Owner.GetFromJsonAsync<TrashPage>(t))!.TotalCount);
    }

    // ---------- The universe and its public face stay the owner's ----------

    [Fact]
    public async Task Only_the_owner_renames_archives_or_deletes_the_universe()
    {
        var w = await NewSharedWorld(_factory, "comanage");
        var u = $"/api/universes/{w.U}";

        foreach (var who in new[] { w.Editor, w.Reviewer, w.Viewer })
        {
            await AssertDenied(await who.PutAsJsonAsync(u, new UpdateUniverseRequest("Taken over", null, null)), "rename");
            await AssertDenied(await who.PostAsync($"{u}/archive", null), "archive");
            await AssertDenied(await who.PostAsync($"{u}/unarchive", null), "unarchive");
            await AssertDenied(await who.DeleteAsync(u), "delete");
        }

        await Ok(w.Owner.PutAsJsonAsync(u, new UpdateUniverseRequest("Still mine", "Owner's words.", "#4f6bd6")));
        await Ok(w.Owner.PostAsync($"{u}/archive", null));

        // A collaborator follows the owner's archive: out of their default list, in it with archived ones.
        Assert.DoesNotContain((await UniverseList(w.Editor)).Items, item => item.Id == w.U);
        Assert.Contains((await UniverseList(w.Editor, "includeArchived=true")).Items, item => item.Id == w.U && item.IsArchived);
        await AssertDenied(await w.Editor.PostAsync($"{u}/unarchive", null), "unarchive archived");

        // Deleting it takes every membership with it.
        await Ok(w.Owner.DeleteAsync(u));
        await WithDb(_factory, async db => Assert.Equal(0, await db.UniverseMemberships.CountAsync(row => row.UniverseId == w.U)));
        Assert.Equal(HttpStatusCode.NotFound, (await w.Editor.GetAsync(u)).StatusCode);
    }

    [Fact]
    public async Task Publication_is_the_owners_alone_and_public_reading_is_unchanged()
    {
        var (owner, _) = await PublishingTestClient.Account(_factory, "copub-owner");
        var (editor, editorId) = await PublishingTestClient.Account(_factory, "copub-editor");
        var (viewer, viewerId) = await PublishingTestClient.Account(_factory, "copub-viewer");
        var universe = await PublishingTestClient.Ready(owner, "Copub world");
        var u = universe.Id;
        await Join(_factory, u, editorId, UniverseRole.Editor);
        await Join(_factory, u, viewerId, UniverseRole.Viewer);
        var entry = await CreateEntity(owner, u, "Tidewarden");
        var story = await CreateStory(owner, u, "Tide book");
        var anonymous = PublishingTestClient.Anonymous(_factory);

        // The Editor edits the very entry they cannot publish.
        var entryType = (await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{entry}"))!.EntityTypeId;
        await Ok(editor.PutVersionedAsync(
            $"/api/universes/{u}/entities/{entry}",
            new EntityRequest(entryType, "Tidewarden", "Edited by the editor.", CanonStatus.Canon, null, null, null)));

        foreach (var who in new[] { editor, viewer })
        {
            await AssertDenied(await PublishingTestClient.Publish(who, u), "publish");
            await AssertDenied(await PublishingTestClient.SaveDetails(who, u, "Rewritten", UniverseCategory.Books), "details");
            await AssertDenied(await who.PostAsync($"/api/universes/{u}/entities/{entry}/publish", null), "publish entry");
            await AssertDenied(await who.PostAsync($"/api/universes/{u}/stories/{story}/publish", null), "publish story");
            await AssertDenied(await PublishingTestClient.UploadArtwork(who, u, PublishingTestClient.Png(1600, 1000)), "artwork");
            await AssertDenied(await who.DeleteAsync($"/api/universes/{u}/artwork"), "remove artwork");
        }

        var published = await PublishingTestClient.Published(owner, u);
        await Ok(owner.PostAsync($"/api/universes/{u}/entities/{entry}/publish", null));
        var slug = published.PublicSlug!;
        Assert.NotNull(await PublishingTestClient.PublicBySlug(anonymous, slug));

        // Members cannot take it back down, and the public page never names them.
        foreach (var who in new[] { editor, viewer })
        {
            await AssertDenied(await PublishingTestClient.Unpublish(who, u), "unpublish");
            await AssertDenied(await who.PostAsync($"/api/universes/{u}/entities/{entry}/unpublish", null), "unpublish entry");
        }

        var page = await anonymous.GetStringAsync($"{PublishingTestClient.PublicRoute}/{slug}");
        var lore = await anonymous.GetStringAsync($"{PublishingTestClient.PublicRoute}/{slug}/lore");
        Assert.Contains("Tidewarden", lore, StringComparison.Ordinal);
        foreach (var text in new[] { page, lore })
        {
            Assert.DoesNotContain("copub-editor", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(editorId, text, StringComparison.Ordinal);
            Assert.DoesNotContain("accessRole", text, StringComparison.OrdinalIgnoreCase);
        }
    }

    // ---------- Backups ----------

    [Fact]
    public async Task Only_the_owner_exports_and_the_backup_carries_no_membership()
    {
        var w = await NewSharedWorld(_factory, "cobackup");

        foreach (var who in new[] { w.Editor, w.Reviewer, w.Viewer })
        {
            await AssertDenied(await who.GetAsync($"/api/universes/{w.U}/export"), "export");
        }

        await AssertHidden(await w.Outsider.GetAsync($"/api/universes/{w.U}/export"), "outsider export");

        var archive = await RawArchive(w.Owner, w.U);
        var document = DocumentText(archive);
        Assert.Equal(27, UniverseBackup.CurrentVersion);
        Assert.Equal(27, (await Backup(w.Owner, w.U)).FormatVersion);
        foreach (var id in new[] { w.OwnerId, w.EditorId, w.ReviewerId, w.ViewerId })
        {
            Assert.DoesNotContain(id, document, StringComparison.OrdinalIgnoreCase);
        }

        foreach (var word in new[] { "membership", "member", "collaborator", "accessRole", "cobackup-editor", "cobackup-reviewer", "cobackup-viewer" })
        {
            Assert.DoesNotContain(word, document, StringComparison.OrdinalIgnoreCase);
        }

        // Restored by its owner, and by an Editor holding a copy: each gets a universe of their own and nobody else's.
        var mine = await RestoreTestClient.RestoreArchive(w.Owner, archive, "Cobackup restored");
        var theirs = await RestoreTestClient.RestoreArchive(w.Editor, archive, "Cobackup editor copy");
        Assert.Equal(UniverseRole.Owner, mine.AccessRole);
        Assert.Equal(UniverseRole.Owner, theirs.AccessRole);

        await WithDb(_factory, async db =>
        {
            Assert.Equal(w.OwnerId, await db.Universes.Where(row => row.Id == mine.Id).Select(row => row.OwnerId).SingleAsync());
            Assert.Equal(w.EditorId, await db.Universes.Where(row => row.Id == theirs.Id).Select(row => row.OwnerId).SingleAsync());
            Assert.Equal(0, await db.UniverseMemberships.CountAsync(row => row.UniverseId == mine.Id || row.UniverseId == theirs.Id));
            Assert.Equal(3, await db.UniverseMemberships.CountAsync(row => row.UniverseId == w.U));
        });

        foreach (var who in new[] { w.Reviewer, w.Viewer, w.Outsider })
        {
            await AssertHidden(await who.GetAsync($"/api/universes/{mine.Id}"), "restored for owner");
            await AssertHidden(await who.GetAsync($"/api/universes/{theirs.Id}"), "restored for editor");
        }

        await AssertHidden(await w.Editor.GetAsync($"/api/universes/{mine.Id}"), "editor on owner's restore");
        await AssertHidden(await w.Owner.GetAsync($"/api/universes/{theirs.Id}"), "owner on editor's restore");
    }

    // ---------- The universe list ----------

    [Fact]
    public async Task The_list_holds_owned_and_shared_universes_with_the_callers_role_and_nothing_else()
    {
        var w = await NewSharedWorld(_factory, "colist");
        var editorsOwn = await CreateUniverse(w.Editor, "Colist editor's own");
        var stranger = await CreateUniverse(w.Outsider, "Colist stranger");

        // A malformed row naming the owner as a member: still listed once, still the owner's.
        await Join(_factory, w.U, w.OwnerId, UniverseRole.Viewer);

        var expected = new Dictionary<Who, UniverseRole>
        {
            [Who.Owner] = UniverseRole.Owner,
            [Who.Editor] = UniverseRole.Editor,
            [Who.Reviewer] = UniverseRole.Reviewer,
            [Who.Viewer] = UniverseRole.Viewer,
        };

        foreach (var (who, role) in expected)
        {
            var page = await UniverseList(w.Client(who));
            Assert.Equal(role, Assert.Single(page.Items, item => item.Id == w.U).AccessRole);
            Assert.DoesNotContain(page.Items, item => item.Id == stranger.Id);
            Assert.Equal(page.Items.Count, page.TotalCount);

            var detail = (await w.Client(who).GetFromJsonAsync<UniverseDetail>($"/api/universes/{w.U}"))!;
            Assert.Equal(role, detail.AccessRole);
        }

        Assert.DoesNotContain((await UniverseList(w.Outsider)).Items, item => item.Id == w.U);

        // The Editor's page: their own and the shared one, counted and searched together, paged without repeats.
        var editors = await UniverseList(w.Editor);
        Assert.Equal(2, editors.TotalCount);
        Assert.Equal(UniverseRole.Owner, Assert.Single(editors.Items, item => item.Id == editorsOwn.Id).AccessRole);
        Assert.Equal(w.U, Assert.Single((await UniverseList(w.Editor, "search=Shared")).Items).Id);
        var first = await UniverseList(w.Editor, "pageSize=1&page=1");
        var second = await UniverseList(w.Editor, "pageSize=1&page=2");
        Assert.Equal(2, first.TotalCount);
        Assert.Equal(2, first.TotalPages);
        Assert.NotEqual(Assert.Single(first.Items).Id, Assert.Single(second.Items).Id);

        // A list row says nothing about anyone else.
        var raw = await w.Editor.GetStringAsync("/api/universes");
        foreach (var other in new[] { w.OwnerId, w.ReviewerId, w.ViewerId, "colist-owner", "colist-viewer" })
        {
            Assert.DoesNotContain(other, raw, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task The_list_and_a_routed_check_are_fixed_query_counts()
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, "coqueries");
        var owners = new List<Guid>();
        for (var index = 0; index < 3; index++)
        {
            var (other, _) = await PublishingTestClient.Account(_factory, $"coqueries-{index}");
            var shared = await CreateUniverse(other, $"Coqueries shared {index}");
            await Join(_factory, shared.Id, userId, UniverseRole.Viewer);
            owners.Add(shared.Id);
        }

        var own = await CreateUniverse(client, "Coqueries own");

        // The list: one count and one page, however many universes are shared - no lookup per row.
        UniversePage page;
        using (var counter = new CommandCounter([userId]))
        {
            page = await UniverseList(client);
            Assert.Equal(2, counter.Count);
        }

        Assert.Equal(4, page.TotalCount);
        Assert.Equal(UniverseRole.Viewer, page.Items.Single(item => item.Id == owners[0]).AccessRole);

        // A routed read: the access check is one query, on top of the read itself.
        var (readQueries, _) = await CommandCounter.CountAsync([owners[0]], () => client.GetStringAsync($"/api/universes/{owners[0]}"));
        Assert.Equal(2, readQueries);
    }

    // ---------- Ideas stay the account's ----------

    [Fact]
    public async Task Sharing_a_universe_never_shares_an_idea()
    {
        var w = await NewSharedWorld(_factory, "coideas");
        var ownersIdea = await CreateIdea(w.Owner, "Ember secret", "The heir is alive.", w.U, [Ref(IdeaReferenceKind.Entity, w.Entry)]);
        var editorsIdea = await CreateIdea(w.Editor, "Editor's private hunch", "Nobody else reads this.");

        Assert.DoesNotContain(await ListedTitles(w.Editor), title => title == "Ember secret");
        Assert.DoesNotContain(await ListedTitles(w.Owner), title => title == "Editor's private hunch");
        Assert.Equal(HttpStatusCode.NotFound, (await w.Editor.GetAsync(Idea(ownersIdea.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Owner.GetAsync(Idea(editorsIdea.Id))).StatusCode);

        // Universe search reads the caller's own ideas only.
        var ownerSearch = await w.Owner.GetStringAsync($"/api/universes/{w.U}/search?q=Ember");
        var editorSearch = await w.Editor.GetStringAsync($"/api/universes/{w.U}/search?q=Ember");
        Assert.Contains("Ember secret", ownerSearch, StringComparison.Ordinal);
        Assert.DoesNotContain("Ember secret", editorSearch, StringComparison.Ordinal);
        Assert.Contains("Ember Vale", editorSearch, StringComparison.Ordinal);

        // An idea still points only into its author's own universes (unchanged, ADR 0041 follow-up).
        var assigned = await w.Editor.PostAsJsonAsync(Ideas, new IdeaRequest("Into the shared world", null, w.U, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, assigned.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Editor.GetAsync($"{Ideas}/reference-targets?universeId={w.U}&kind=0")).StatusCode);

        // And the owner's backup, which carries the owner's ideas, is not the Editor's to take.
        await AssertDenied(await w.Editor.GetAsync($"/api/universes/{w.U}/export"), "export");
    }

    // ---------- Helpers ----------

    private static async Task<UniversePage> UniverseList(HttpClient client, string query = "") =>
        (await client.GetFromJsonAsync<UniversePage>($"/api/universes?{query}"))!;

    private async Task<bool> LiveEntry(Guid id)
    {
        var live = false;
        await WithDb(_factory, async db => live = await db.Entities.AnyAsync(row => row.Id == id && row.DeletedAt == null));
        return live;
    }
}
