using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Ideas;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.IdeaTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// An account's ideas (ADR 0030): created with or without a universe, saved whole, listed newest first and filtered, refused
/// when stale, deleted and restored, and kept - unassigned, words intact - when their universe is deleted.
/// </summary>
public sealed class IdeaEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task An_idea_is_created_in_a_universe_and_read_back_exactly_and_never_without_one()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "user-ideacreate");
        const string body = "  Maybe the city floats.\n\n\tNobody below has seen its underside. 北の門 👩‍👩‍👧  ";

        // An idea lives only in a universe (#230): none, or one that is not the author's, is a problem on universeId.
        var without = await client.PostAsJsonAsync(Ideas, new IdeaRequest("Maybe this city floats", body, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, without.StatusCode);
        Assert.Contains("universeId", await Errors(without), StringComparison.Ordinal);
        Assert.Empty((await ListIdeas(client)).Items);

        var created = await CreateIdea(client, "  Maybe this city floats  ", body, universe.Id);

        Assert.Equal("Maybe this city floats", created.Title);
        Assert.Equal(body, created.Body, StringComparer.Ordinal);
        Assert.Equal(universe.Id, created.Universe!.Id);
        Assert.Empty(created.References);
        Assert.Equal(DateTimeKind.Utc, created.UpdatedAt.Kind);
        Assert.Equal(created.CreatedAt, created.UpdatedAt);

        var read = await ReadIdea(client, created.Id);
        Assert.Equal(created, read with { References = created.References });
        Assert.Equal(body, read.Body, StringComparer.Ordinal);
    }

    [Fact]
    public async Task A_body_is_optional_and_a_title_is_not()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "user-ideashape");
        var u = universe.Id;

        var bare = await CreateIdea(client, "What if Mira betrays Arlen?", universeId: u);
        Assert.Equal(string.Empty, bare.Body);

        var untitled = await client.PostAsJsonAsync(Ideas, new IdeaRequest("   ", "Body only.", u, null, null));
        Assert.Contains("title", await Errors(untitled), StringComparison.Ordinal);

        var longTitle = await client.PostAsJsonAsync(
            Ideas, new IdeaRequest(new string('t', IdeaLimits.TitleMaxLength + 1), null, u, null, null));
        Assert.Contains("title", await Errors(longTitle), StringComparison.Ordinal);

        var longBody = await client.PostAsJsonAsync(
            Ideas, new IdeaRequest("Too long", new string('b', IdeaLimits.BodyMaxLength + 1), u, null, null));
        Assert.Contains("body", await Errors(longBody), StringComparison.Ordinal);

        var atBound = await CreateIdea(client, new string('t', IdeaLimits.TitleMaxLength), new string('b', IdeaLimits.BodyMaxLength), u);
        Assert.Equal(IdeaLimits.BodyMaxLength, (await ReadIdea(client, atBound.Id)).Body.Length);

        Assert.Equal(2, (await ListIdeas(client)).TotalCount);
    }

    [Fact]
    public async Task An_idea_is_created_in_a_universe_and_can_be_moved_to_another_but_never_out_of_one()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideaassoc");
        var other = await CreateUniverse(client, "Second world ideaassoc");

        var idea = await CreateIdea(client, "Explore a religion of forgotten memories", universeId: universe.Id);
        Assert.Equal(universe.Id, idea.Universe!.Id);
        Assert.Equal(universe.Name, idea.Universe.Name);

        var edited = await Save(client, idea, title: "A religion of forgotten memories", body: "Priests forget on purpose.");
        Assert.Equal(("A religion of forgotten memories", "Priests forget on purpose."), (edited.Title, edited.Body));
        Assert.True(edited.UpdatedAt > idea.UpdatedAt);
        Assert.Equal(idea.CreatedAt, edited.CreatedAt);

        var outOfIt = await TrySave(client, edited, universeId: null);
        Assert.Equal(HttpStatusCode.BadRequest, outOfIt.StatusCode);
        Assert.Contains("universeId", await Errors(outOfIt), StringComparison.Ordinal);
        Assert.Equal(universe.Id, (await ReadIdea(client, idea.Id)).Universe!.Id);

        var moved = await Save(client, edited, universeId: other.Id);
        Assert.Equal(other.Id, moved.Universe!.Id);
        Assert.Equal(("A religion of forgotten memories", "Priests forget on purpose."), (moved.Title, moved.Body));
    }

    [Fact]
    public async Task The_list_is_newest_first_filtered_by_universe_and_searchable()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "idealist");
        var other = await CreateUniverse(client, "Other idealist");

        var floating = await CreateIdea(client, "Floating city", "Held up by old storms.", universe.Id);
        await CreateIdea(client, "Other world's idea", "Elsewhere.", other.Id);
        var betrayal = await CreateIdea(client, "Betrayal", "What if Mira betrays Arlen?", universe.Id);

        Assert.Equal(["Betrayal", "Other world's idea", "Floating city"], await ListedTitles(client));

        // Editing moves an idea to the top; nothing else orders the list.
        await Save(client, floating, body: "Held up by old storms, and by the storms' names.");
        Assert.Equal("Floating city", (await ListedTitles(client))[0]);

        Assert.Equal(["Floating city", "Betrayal"], await ListedTitles(client, $"?universeId={universe.Id}"));
        Assert.Empty(await ListedTitles(client, "?unassigned=true"));
        Assert.Equal(["Other world's idea"], await ListedTitles(client, $"?universeId={other.Id}"));

        // Title or body, case-insensitively, and wildcards are literal.
        Assert.Equal(["Betrayal"], await ListedTitles(client, "?search=mira"));
        Assert.Equal(["Floating city"], await ListedTitles(client, $"?universeId={universe.Id}&search=STORM"));
        Assert.Empty(await ListedTitles(client, "?search=%25"));

        var both = await client.GetAsync($"{Ideas}?universeId={universe.Id}&unassigned=true");
        Assert.Contains("unassigned", await Errors(both), StringComparison.Ordinal);

        // A row names its universe and counts nothing it was not given.
        var row = (await ListIdeas(client, $"?universeId={universe.Id}")).Items.Single(item => item.Id == betrayal.Id);
        Assert.Equal((universe.Id, universe.Name, 0), (row.Universe!.Id, row.Universe.Name, row.ReferenceCount));
    }

    [Fact]
    public async Task A_list_row_carries_a_bounded_excerpt_never_the_whole_body_and_pages_are_stable()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "user-ideapage");
        var longBody = string.Concat(Enumerable.Repeat("北の門 is a gate. ", 200));
        var idea = await CreateIdea(client, "Long idea", longBody, universe.Id);

        using (var document = JsonDocument.Parse(await client.GetStringAsync(Ideas)))
        {
            var item = document.RootElement.GetProperty("items")[0];
            Assert.False(item.TryGetProperty("body", out _));
            var excerpt = item.GetProperty("excerpt").GetString()!;
            Assert.Equal(IdeaLimits.ExcerptLength, excerpt.Length);
            Assert.StartsWith(excerpt, longBody, StringComparison.Ordinal);
            Assert.True(item.GetProperty("isExcerptShortened").GetBoolean());
        }

        Assert.Equal(longBody, (await ReadIdea(client, idea.Id)).Body, StringComparer.Ordinal);

        for (var index = 0; index < 4; index++)
        {
            await CreateIdea(client, $"Short {index}", "Brief.", universe.Id);
        }

        var first = await ListIdeas(client, "?pageSize=2&page=1");
        var second = await ListIdeas(client, "?pageSize=2&page=2");
        var third = await ListIdeas(client, "?pageSize=2&page=3");
        Assert.Equal((5, 3), (first.TotalCount, first.TotalPages));
        Assert.Equal(5, first.Items.Concat(second.Items).Concat(third.Items).Select(item => item.Id).Distinct().Count());
        Assert.False(first.Items[0].IsExcerptShortened);
    }

    [Fact]
    public async Task A_stale_save_is_refused_and_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "user-ideastale");
        var opened = await CreateIdea(client, "Two windows", "First words.", universe.Id);

        var elsewhere = await Save(client, opened, body: "Saved in the other window.");

        var stale = await TrySave(client, opened, body: "Written here, over the old save.");
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using (var problem = JsonDocument.Parse(await stale.Content.ReadAsStringAsync()))
        {
            Assert.Equal(IdeaEndpoints.ChangedCode, problem.RootElement.GetProperty("code").GetString());
            Assert.Equal(elsewhere.UpdatedAt, problem.RootElement.GetProperty("updatedAt").GetDateTime().ToUniversalTime());
        }

        Assert.Equal("Saved in the other window.", (await ReadIdea(client, opened.Id)).Body);

        // No token at all is not a way around the check.
        var unnamed = await TrySave(client, opened, body: "No token.", expectedUpdatedAt: null);
        Assert.Equal(HttpStatusCode.Conflict, unnamed.StatusCode);

        // Naming the save the refusal reported is the author's decision to keep their own version.
        var kept = await TrySave(client, opened, body: "Written here, over the old save.", expectedUpdatedAt: elsewhere.UpdatedAt);
        Assert.Equal(HttpStatusCode.OK, kept.StatusCode);
        Assert.Equal("Written here, over the old save.", (await ReadIdea(client, opened.Id)).Body);
    }

    [Fact]
    public async Task A_save_that_changes_nothing_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideanoop");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var idea = await CreateIdea(client, "Unchanged", "Words.", universe.Id, [Ref(IdeaReferenceKind.Entity, arlen)]);

        var again = await Save(client, idea, references: [Ref(IdeaReferenceKind.Entity, arlen), Ref(IdeaReferenceKind.Entity, arlen)]);

        Assert.Equal(idea.UpdatedAt, again.UpdatedAt);
        Assert.Equal((await ReadIdea(client, idea.Id)).UpdatedAt, idea.UpdatedAt);
    }

    [Fact]
    public async Task A_deleted_idea_leaves_every_list_but_the_deleted_one_and_comes_back_whole()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideatrash");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var idea = await CreateIdea(client, "Binned idea", "Kept words.", universe.Id, [Ref(IdeaReferenceKind.Entity, arlen)]);
        await CreateIdea(client, "Still here", universeId: (await CreateUniverse(client, "Second world ideatrash")).Id);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Idea(idea.Id))).StatusCode);

        Assert.Equal(["Still here"], await ListedTitles(client));
        Assert.Empty(await ListedTitles(client, $"?universeId={universe.Id}"));
        Assert.Empty(await ListedTitles(client, "?search=Kept"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Idea(idea.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await TrySave(client, idea, body: "Edited while deleted.")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Idea(idea.Id))).StatusCode);

        var deleted = await ListIdeas(client, "?deleted=true");
        var row = Assert.Single(deleted.Items);
        Assert.Equal((idea.Id, "Binned idea", universe.Id, 1), (row.Id, row.Title, row.Universe!.Id, row.ReferenceCount));
        Assert.NotNull(row.DeletedAt);
        Assert.Equal(["Binned idea"], await ListedTitles(client, $"?deleted=true&universeId={universe.Id}"));

        var restored = await client.PostAsync($"{Idea(idea.Id)}/restore", content: null);
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        var back = (await restored.Content.ReadFromJsonAsync<IdeaDetail>())!;
        Assert.Equal(("Binned idea", "Kept words.", universe.Id), (back.Title, back.Body, back.Universe!.Id));
        Assert.Equal(arlen, Assert.Single(back.References).Id);
        Assert.Equal(idea.UpdatedAt, back.UpdatedAt);

        Assert.Empty((await ListIdeas(client, "?deleted=true")).Items);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"{Idea(idea.Id)}/restore", content: null)).StatusCode);

        // Restored as it was, so the save it was opened with still holds.
        Assert.Equal(HttpStatusCode.OK, (await TrySave(client, idea, body: "Edited after the restore.")).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_universe_deletes_its_ideas_with_their_references_and_leaves_other_universes_alone()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "ideauniversedelete");
        var kept = await CreateUniverse(client, "Kept world ideauniversedelete");
        var u = universe.Id;

        var arlen = await CreateEntity(client, u, "Arlen");
        var story = await CreateStory(client, u, "The Long Winter");
        var scene = await CreateScene(client, u, story, "The Council");
        var arc = await CreateArc(client, u, story, "Fall of the King");

        var idea = await CreateIdea(
            client,
            "What if the council lies?",
            "Every word of this stays.",
            u,
            [
                Ref(IdeaReferenceKind.Entity, arlen),
                Ref(IdeaReferenceKind.Story, story),
                Ref(IdeaReferenceKind.Scene, scene),
                Ref(IdeaReferenceKind.PlotArc, arc.Id),
            ]);
        var binned = await CreateIdea(client, "Deleted before the universe", "Still words.", u, [Ref(IdeaReferenceKind.Entity, arlen)]);
        (await client.DeleteAsync(Idea(binned.Id))).EnsureSuccessStatusCode();
        var elsewhere = await CreateIdea(client, "In the kept world", universeId: kept.Id);

        await DeleteUniverse(client, u);

        // The ideas go with the universe, the deleted one too: nothing is left to read, list, restore or save.
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Idea(idea.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await TrySave(client, idea, body: "Edited in the old window.")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"{Idea(binned.Id)}/restore", content: null)).StatusCode);
        Assert.Empty(await ListedTitles(client, "?unassigned=true"));
        Assert.Empty((await ListIdeas(client, "?deleted=true")).Items);
        Assert.Equal(["In the kept world"], await ListedTitles(client));

        // The other universe's idea is untouched.
        Assert.Equal(kept.Id, (await ReadIdea(client, elsewhere.Id)).Universe!.Id);

        await WithDb(_factory, async db =>
        {
            Assert.Equal(0, await db.IdeaEntityReferences.CountAsync(reference => reference.IdeaId == idea.Id || reference.IdeaId == binned.Id));
            Assert.Equal(0, await db.Ideas.CountAsync(row => row.Id == idea.Id || row.Id == binned.Id));
            Assert.Equal(0, await db.IdeaStoryReferences.CountAsync(reference => reference.IdeaId == idea.Id));
            Assert.Equal(0, await db.IdeaSceneReferences.CountAsync(reference => reference.IdeaId == idea.Id));
            Assert.Equal(0, await db.IdeaPlotArcReferences.CountAsync(reference => reference.IdeaId == idea.Id));
        });
    }

    [Fact]
    public async Task Without_a_session_nothing_about_ideas_answers()
    {
        var client = _factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Ideas)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(Ideas, new IdeaRequest("Anonymous", null, null, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Idea(Guid.NewGuid()))).StatusCode);
    }
}
