using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Trash;
using LorEvolve.Api.Features.WorldRules;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.IdeaTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.WorldRuleTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// World rules over HTTP (ADR 0033): created, read, listed and saved whole with their words kept exactly; stale and unchanged
/// saves; the bounds in any script; the Trash; a universe's deletion; ownership, universe and guessed-id boundaries that learn
/// nothing; and that no rule write changes lore, stories, the timeline, ideas or Canon, whatever its words say. Credentials are
/// obviously synthetic.
/// </summary>
public sealed class WorldRuleEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_rule_is_created_read_listed_and_saved_whole_with_its_words_kept_exactly()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrcrud");
        var u = universe.Id;
        const string description = "  Not even the Old Ones may step through.\n\n\tNo exceptions. 北の門 👩‍👩‍👧 & <b>not html</b>  ";

        var response = await client.PostAsJsonAsync(Rules(u), new WorldRuleRequest("  Teleportation cannot cross the Veil  ", description, null));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<WorldRuleDetail>())!;

        Assert.Equal(Rule(u, created.Id), response.Headers.Location!.OriginalString);
        Assert.Equal("Teleportation cannot cross the Veil", created.Title);
        Assert.Equal(description, created.Description, StringComparer.Ordinal);
        Assert.Equal(created.CreatedAt, created.UpdatedAt);

        var read = await ReadRule(client, u, created.Id);
        Assert.Equal(created, read);

        // No description is an empty one, never null.
        var bonded = await CreateRule(client, u, "a bonded dragon dies if its rider dies");
        Assert.Equal(string.Empty, bonded.Description);
        var crown = await CreateRule(client, u, "Only blood of House Valen can wear the Crown", new string('x', 300));

        // By title, case folded: a rule's place in the list says nothing about how much it matters.
        Assert.Equal(
            ["a bonded dragon dies if its rider dies", "Only blood of House Valen can wear the Crown", "Teleportation cannot cross the Veil"],
            await ListedTitles(client, u));

        // A row carries the start of the description, never all of it.
        var page = await ListRules(client, u);
        Assert.Equal((3, 1), (page.TotalCount, page.TotalPages));
        var crownRow = page.Items.Single(item => item.Id == crown.Id);
        Assert.Equal((WorldRuleLimits.ExcerptLength, true), (crownRow.Excerpt.Length, crownRow.IsExcerptShortened));
        var veilRow = page.Items.Single(item => item.Id == created.Id);
        Assert.Equal((description, false), (veilRow.Excerpt, veilRow.IsExcerptShortened));
        Assert.DoesNotContain(new string('x', 241), await client.GetStringAsync(Rules(u)), StringComparison.Ordinal);

        var paged = await ListRules(client, u, "?page=2&pageSize=2");
        Assert.Equal((2, 2, 3, 2), (paged.Page, paged.PageSize, paged.TotalCount, paged.TotalPages));
        Assert.Equal(["Teleportation cannot cross the Veil"], paged.Items.Select(item => item.Title));

        // A whole save: the title trimmed, the description exact, the moment it changed.
        var saved = await SaveRule(client, u, read, title: " Teleportation cannot cross the Veil or the Sea ", description: "Nor the Sea.");
        Assert.Equal(("Teleportation cannot cross the Veil or the Sea", "Nor the Sea."), (saved.Title, saved.Description));
        Assert.Equal(read.CreatedAt, saved.CreatedAt);
        Assert.True(saved.UpdatedAt > read.UpdatedAt);
        Assert.Equal(saved, await ReadRule(client, u, created.Id));
    }

    [Fact]
    public async Task A_save_that_changes_nothing_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrnoop");
        var u = universe.Id;
        var rule = await CreateRule(client, u, "Magic has a cost", "Always.");

        // Spaces around the title are not a change; the description is compared exactly.
        var unchanged = await SaveRule(client, u, rule, title: "  Magic has a cost  ", description: "Always.");
        Assert.Equal(rule, unchanged);

        await WithDb(_factory, async db =>
        {
            var stored = await db.WorldRules.AsNoTracking().SingleAsync(candidate => candidate.Id == rule.Id);
            Assert.Equal(rule.UpdatedAt.Ticks, stored.UpdatedAt.Ticks);
        });

        // The same token is still the stored one, so the next real change is accepted - and a space is a real change there.
        var changed = await SaveRule(client, u, rule, description: "Always. ");
        Assert.Equal("Always. ", changed.Description);
        Assert.True(changed.UpdatedAt > rule.UpdatedAt);
    }

    [Fact]
    public async Task A_save_over_a_rule_saved_elsewhere_since_is_refused_and_nothing_is_written()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrstale");
        var u = universe.Id;
        var opened = await CreateRule(client, u, "The dead stay dead", "Mostly.");

        // Another tab saves first.
        var elsewhere = await SaveRule(client, u, opened, description: "Always.");

        var stale = await TrySaveRule(client, u, opened, description: "Mine.");
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using (var problem = JsonDocument.Parse(await stale.Content.ReadAsStringAsync()))
        {
            Assert.Equal(WorldRuleEndpoints.ChangedCode, problem.RootElement.GetProperty("code").GetString());
            Assert.Equal(elsewhere.UpdatedAt, problem.RootElement.GetProperty("updatedAt").GetDateTime().ToUniversalTime());
        }

        Assert.Equal(elsewhere, await ReadRule(client, u, opened.Id));

        // Naming no moment at all is stale too.
        Assert.Equal(HttpStatusCode.Conflict, (await TrySaveRule(client, u, elsewhere, description: "Mine.", expectedUpdatedAt: (DateTime?)null)).StatusCode);

        // A stale save that would change nothing is refused rather than answered as saved.
        Assert.Equal(HttpStatusCode.Conflict, (await TrySaveRule(client, u, opened, description: "Always.")).StatusCode);

        // Keeping mine, having seen the warning: named over the stored moment.
        var mine = await SaveRule(client, u, elsewhere, description: "Mine.");
        Assert.Equal("Mine.", (await ReadRule(client, u, opened.Id)).Description);
        Assert.Equal(mine, await ReadRule(client, u, opened.Id));
    }

    [Fact]
    public async Task Titles_and_descriptions_are_held_to_their_bounds_in_any_script()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrbounds");
        var u = universe.Id;

        foreach (var title in new string?[] { null, "", "   \t\n" })
        {
            var refused = await client.PostAsJsonAsync(Rules(u), new WorldRuleRequest(title, "Words.", null));
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Contains("title", await Errors(refused), StringComparison.Ordinal);
        }

        var tooLongTitle = await client.PostAsJsonAsync(Rules(u), new WorldRuleRequest(new string('t', WorldRuleLimits.TitleMaxLength + 1), null, null));
        Assert.Equal(HttpStatusCode.BadRequest, tooLongTitle.StatusCode);
        Assert.Contains("title", await Errors(tooLongTitle), StringComparison.Ordinal);

        var tooLongDescription = await client.PostAsJsonAsync(Rules(u), new WorldRuleRequest("Long", new string('d', WorldRuleLimits.DescriptionMaxLength + 1), null));
        Assert.Equal(HttpStatusCode.BadRequest, tooLongDescription.StatusCode);
        Assert.Contains("description", await Errors(tooLongDescription), StringComparison.Ordinal);

        // Exactly at each bound is kept, and a title's surrounding spaces do not count against it.
        var atBounds = await CreateRule(
            client, u, "  " + new string('t', WorldRuleLimits.TitleMaxLength) + "  ", new string('d', WorldRuleLimits.DescriptionMaxLength));
        Assert.Equal((WorldRuleLimits.TitleMaxLength, WorldRuleLimits.DescriptionMaxLength), (atBounds.Title.Length, atBounds.Description.Length));

        // Any script, right to left, mixed and unbroken, kept as written.
        const string rtl = "لا يعبر النقل الآني الحجاب — the Veil";
        var mixed = "שבע שנים 七年 " + new string('ᚠ', 180);
        var written = await CreateRule(client, u, rtl, mixed);
        Assert.Equal((rtl, mixed), (written.Title, written.Description));
        Assert.Equal(written, await ReadRule(client, u, written.Id));

        // A refused save writes nothing.
        var blanked = await TrySaveRule(client, u, written, title: "   ");
        Assert.Equal(HttpStatusCode.BadRequest, blanked.StatusCode);
        var overlong = await TrySaveRule(client, u, written, description: new string('d', WorldRuleLimits.DescriptionMaxLength + 1));
        Assert.Equal(HttpStatusCode.BadRequest, overlong.StatusCode);
        Assert.Equal(written, await ReadRule(client, u, written.Id));

        Assert.Equal(2, (await ListRules(client, u)).TotalCount);
    }

    [Fact]
    public async Task Another_account_another_universe_and_a_guessed_id_reach_no_rule_and_learn_nothing()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "wrowner");
        var u = universe.Id;
        var other = await CreateUniverse(owner, "World wrowner other");
        var rule = await CreateRule(owner, u, "The Veil holds", "Secret words.");
        var binned = await CreateRule(owner, u, "Binned rule");
        await DeleteRule(owner, u, binned.Id);

        var stranger = await SignedIn(_factory, "user-wrstranger");
        var strangersOwn = await CreateUniverse(stranger, "World wrstranger");
        var nowhere = Guid.NewGuid();
        var request = new WorldRuleRequest("Hijacked", "A stranger's words.", rule.UpdatedAt);

        // A universe and rule that exist answer exactly as ones that do not, on every route.
        await Same(() => stranger.GetAsync(Rules(u)), () => stranger.GetAsync(Rules(nowhere)));
        await Same(() => stranger.GetAsync(Rule(u, rule.Id)), () => stranger.GetAsync(Rule(nowhere, Guid.NewGuid())));
        await Same(() => stranger.PostAsJsonAsync(Rules(u), request), () => stranger.PostAsJsonAsync(Rules(nowhere), request));
        await Same(() => stranger.PutAsJsonAsync(Rule(u, rule.Id), request), () => stranger.PutAsJsonAsync(Rule(nowhere, Guid.NewGuid()), request));
        await Same(() => stranger.DeleteAsync(Rule(u, rule.Id)), () => stranger.DeleteAsync(Rule(nowhere, Guid.NewGuid())));
        await Same(() => stranger.PostAsync(RestorePath(u, binned.Id), null), () => stranger.PostAsync(RestorePath(nowhere, Guid.NewGuid()), null));
        await Same(() => stranger.GetAsync($"/api/universes/{u}/trash"), () => stranger.GetAsync($"/api/universes/{nowhere}/trash"));

        // The stranger's own universe is no way in: a rule is found only through the universe it belongs to.
        await Same(() => stranger.GetAsync(Rule(strangersOwn.Id, rule.Id)), () => stranger.GetAsync(Rule(strangersOwn.Id, Guid.NewGuid())));
        await Same(() => stranger.PutAsJsonAsync(Rule(strangersOwn.Id, rule.Id), request), () => stranger.PutAsJsonAsync(Rule(strangersOwn.Id, Guid.NewGuid()), request));
        await Same(() => stranger.DeleteAsync(Rule(strangersOwn.Id, rule.Id)), () => stranger.DeleteAsync(Rule(strangersOwn.Id, Guid.NewGuid())));
        await Same(() => stranger.PostAsync(RestorePath(strangersOwn.Id, binned.Id), null), () => stranger.PostAsync(RestorePath(strangersOwn.Id, Guid.NewGuid()), null));
        Assert.Empty((await ListRules(stranger, strangersOwn.Id)).Items);
        Assert.Empty((await stranger.GetFromJsonAsync<TrashPage>($"/api/universes/{strangersOwn.Id}/trash"))!.Items);

        // Nor is the owner's other universe: the id of a rule of one universe means nothing in another.
        await Same(() => owner.GetAsync(Rule(other.Id, rule.Id)), () => owner.GetAsync(Rule(other.Id, Guid.NewGuid())));
        await Same(() => owner.PutAsJsonAsync(Rule(other.Id, rule.Id), request), () => owner.PutAsJsonAsync(Rule(other.Id, Guid.NewGuid()), request));
        await Same(() => owner.DeleteAsync(Rule(other.Id, rule.Id)), () => owner.DeleteAsync(Rule(other.Id, Guid.NewGuid())));
        await Same(() => owner.PostAsync(RestorePath(other.Id, binned.Id), null), () => owner.PostAsync(RestorePath(other.Id, Guid.NewGuid()), null));
        Assert.Empty((await ListRules(owner, other.Id)).Items);
        Assert.Empty((await owner.GetFromJsonAsync<TrashPage>($"/api/universes/{other.Id}/trash"))!.Items);

        // A guessed id in the right universe is missing, like any other.
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(Rule(u, Guid.NewGuid()))).StatusCode);

        // Signed out is refused before anything is read.
        var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Rules(u))).StatusCode);

        // And nothing any of that tried was written.
        Assert.Equal(rule, await ReadRule(owner, u, rule.Id));
        Assert.Equal(["The Veil holds"], await ListedTitles(owner, u));
        Assert.Equal(binned.Id, Assert.Single((await owner.GetFromJsonAsync<TrashPage>($"/api/universes/{u}/trash"))!.Items).Id);

        // One request after the other: the test host shares one in-memory connection, so requests are never concurrent.
        static async Task Same(Func<Task<HttpResponseMessage>> guessed, Func<Task<HttpResponseMessage>> missing)
        {
            var one = await guessed();
            var two = await missing();
            Assert.Equal(HttpStatusCode.NotFound, one.StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, two.StatusCode);
            Assert.Equal(await two.Content.ReadAsStringAsync(), await one.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task Deleting_moves_a_rule_to_the_Trash_and_a_restore_brings_it_back_whole()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrtrash");
        var u = universe.Id;
        var kept = await CreateRule(client, u, "Kept rule");
        var rule = await CreateRule(client, u, "A bonded dragon dies if its rider dies", "The bond is one life.");
        rule = await SaveRule(client, u, rule, description: "The bond is one life, shared.");

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Rule(u, rule.Id))).StatusCode);

        // Out of every live read and write, and not deleted twice.
        Assert.Equal(["Kept rule"], await ListedTitles(client, u));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Rule(u, rule.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await TrySaveRule(client, u, rule, description: "Edited in the Trash.")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Rule(u, rule.Id))).StatusCode);

        // In the Trash as a world rule, waiting for nothing, carrying its name and nothing else.
        var raw = await client.GetStringAsync($"/api/universes/{u}/trash");
        var row = Assert.Single(JsonSerializer.Deserialize<TrashPage>(raw, JsonSerializerOptions.Web)!.Items);
        Assert.Equal(
            (TrashItemKind.WorldRule, rule.Id, "A bonded dragon dies if its rider dies", TrashRestoreBlock.None),
            (row.Kind, row.Id, row.Name, row.BlockedBy));
        Assert.Null(row.StoryId);
        Assert.Null(row.PlotArcId);
        Assert.Null(row.EntityTypeName);
        Assert.Null(row.CanonStatus);
        Assert.DoesNotContain("one life", raw, StringComparison.Ordinal);

        var restoring = await client.PostAsync(RestorePath(u, rule.Id), null);
        Assert.Equal(HttpStatusCode.OK, restoring.StatusCode);
        var restored = (await restoring.Content.ReadFromJsonAsync<WorldRuleDetail>())!;

        Assert.Equal(rule, restored);
        Assert.Equal(rule, await ReadRule(client, u, rule.Id));
        Assert.Equal(["A bonded dragon dies if its rider dies", "Kept rule"], await ListedTitles(client, u));
        Assert.Empty((await client.GetFromJsonAsync<TrashPage>($"/api/universes/{u}/trash"))!.Items);

        // What is not in the Trash cannot be restored.
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync(RestorePath(u, rule.Id), null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync(RestorePath(u, kept.Id), null)).StatusCode);

        // Nothing about the rule moved, so the moment it was read at still saves.
        Assert.Equal("Back again.", (await SaveRule(client, u, restored, description: "Back again.")).Description);
    }

    [Fact]
    public async Task Deleting_a_universe_deletes_its_rules_and_nothing_of_another_universe()
    {
        var (client, doomed) = await SignedInWithUniverse(_factory, "wrcascade");
        var survivor = await CreateUniverse(client, "World wrcascade survivor");
        var live = await CreateRule(client, doomed.Id, "Doomed rule", "Gone with its world.");
        var binned = await CreateRule(client, doomed.Id, "Doomed binned rule");
        await DeleteRule(client, doomed.Id, binned.Id);
        var kept = await CreateRule(client, survivor.Id, "Surviving rule", "Stays.");

        await DeleteUniverse(client, doomed.Id);

        await WithDb(_factory, async db =>
        {
            Assert.Equal(0, await db.WorldRules.CountAsync(rule => rule.UniverseId == doomed.Id));
            Assert.Equal(1, await db.WorldRules.CountAsync(rule => rule.UniverseId == survivor.Id));

            foreach (var id in new[] { live.Id, binned.Id })
            {
                var key = id.ToString().ToUpperInvariant();
                Assert.Equal(0, await db.Database
                    .SqlQuery<int>($"SELECT COUNT(*) AS Value FROM WorldRuleSearchIndex WHERE WorldRuleId = {key}")
                    .SingleAsync());
            }
        });

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Rules(doomed.Id))).StatusCode);
        Assert.Equal(kept, await ReadRule(client, survivor.Id, kept.Id));
    }

    [Fact]
    public async Task No_rule_write_changes_lore_stories_the_timeline_ideas_or_Canon_whatever_its_words_say()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "wrcanon");
        var u = universe.Id;

        // A world with something Canon already finds: a Canon link onto an entry that is only an idea.
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var character = types.First(type => type.Name == "Character").Id;
        var arlen = (await PostJson<EntityDetail>(
            client, $"/api/universes/{u}/entities", new EntityRequest(character, "Arlen", null, CanonStatus.Canon, null, null, null))).Id;
        var mira = (await PostJson<EntityDetail>(
            client, $"/api/universes/{u}/entities", new EntityRequest(character, "Mira", null, CanonStatus.Idea, null, null, null))).Id;
        var parentOf = await PostJson<RelationshipTypeResponse>(
            client, $"/api/universes/{u}/relationship-types", new RelationshipTypeRequest("parent of", "child of", false, null, null));
        (await client.PostAsJsonAsync(
            $"/api/universes/{u}/relationships",
            new RelationshipRequest(parentOf.Id, mira, arlen, CanonStatus.Canon, null, null, null)))
            .EnsureSuccessStatusCode();
        var story = await CreateStory(client, u, "The Long Winter");
        await CreateScene(client, u, story, "The Council");
        (await client.PostAsJsonAsync(
            $"/api/universes/{u}/timeline",
            new TimelineEntryRequest("Arlen falls", "In the pass.", CanonStatus.Canon, TimelineDateKind.Exact, 12, null, null, null, null, null, null, [arlen, mira])))
            .EnsureSuccessStatusCode();
        await CreateIdea(client, "Maybe Arlen returns", "Once.", u);
        (await client.PostAsync($"/api/universes/{u}/canon-conflicts/evaluate", null)).EnsureSuccessStatusCode();

        var before = await Snapshot();
        Assert.Contains("conflict|", before, StringComparison.Ordinal);

        // Rules whose words sound like facts, constraints, relationships and events - and are none of them.
        var resurrection = await CreateRule(
            client, u, "A person can only be resurrected once",
            "Canon: Arlen is dead. Arlen died in year 12. Mira is his parent. Mira is immortal. Teleportation and magic are forbidden.");
        resurrection = await SaveRule(client, u, resurrection, title: "One resurrection per person");
        var crown = await CreateRule(client, u, "Only blood descendants of House Valen can use the Crown", "parent child sibling spouse descendant");
        await DeleteRule(client, u, crown.Id);
        await RestoreRule(client, u, crown.Id);
        await DeleteRule(client, u, resurrection.Id);

        Assert.Equal(before, await Snapshot());

        // Evaluating Canon again finds exactly what it found before: a rule is no rule's input.
        (await client.PostAsync($"/api/universes/{u}/canon-conflicts/evaluate", null)).EnsureSuccessStatusCode();
        Assert.Equal(before, await Snapshot());

        var conflicts = await client.GetStringAsync($"/api/universes/{u}/canon-conflicts?pageSize=100");
        Assert.DoesNotContain(resurrection.Id.ToString(), conflicts, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(crown.Id.ToString(), conflicts, StringComparison.OrdinalIgnoreCase);

        // The lore search reads no word of a rule either.
        Assert.Contains("\"items\":[]", await client.GetStringAsync($"/api/universes/{u}/entities?search=resurrected"), StringComparison.Ordinal);
        Assert.Contains("\"items\":[]", await client.GetStringAsync($"/api/universes/{u}/entities?search=Valen"), StringComparison.Ordinal);

        async Task<string> Snapshot()
        {
            var text = string.Empty;
            await WithDb(_factory, async db =>
            {
                var rows = new List<string>();
                rows.AddRange((await db.Entities.AsNoTracking().Where(row => row.UniverseId == u).ToListAsync())
                    .Select(row => $"entity|{row.Id}|{row.Name}|{row.Summary}|{row.CanonStatus}|{row.DeletedAt?.Ticks}|{row.UpdatedAt.Ticks}"));
                rows.AddRange((await db.EntityRevisions.AsNoTracking().Where(row => row.Entity!.UniverseId == u).ToListAsync())
                    .Select(row => $"revision|{row.Id}|{row.Number}"));
                rows.AddRange((await db.Relationships.AsNoTracking().Where(row => row.UniverseId == u).ToListAsync())
                    .Select(row => $"relationship|{row.Id}|{row.UpdatedAt.Ticks}"));
                rows.AddRange((await db.TimelineEntries.AsNoTracking().Where(row => row.UniverseId == u).ToListAsync())
                    .Select(row => $"moment|{row.Id}|{row.Title}|{row.Description}|{row.CanonStatus}|{row.StartYear}|{row.UpdatedAt.Ticks}"));
                rows.AddRange((await db.TimelineEntryLinks.AsNoTracking().Where(row => row.TimelineEntry!.UniverseId == u).ToListAsync())
                    .Select(row => $"participant|{row.TimelineEntryId}|{row.EntityId}"));
                rows.AddRange((await db.Stories.AsNoTracking().Where(row => row.UniverseId == u).ToListAsync())
                    .Select(row => $"story|{row.Id}|{row.Title}|{row.UpdatedAt.Ticks}"));
                rows.AddRange((await db.Scenes.AsNoTracking().Where(row => row.Story!.UniverseId == u).ToListAsync())
                    .Select(row => $"scene|{row.Id}|{row.Title}|{row.UpdatedAt.Ticks}"));
                rows.AddRange((await db.Ideas.AsNoTracking().Where(row => row.UniverseId == u).ToListAsync())
                    .Select(row => $"idea|{row.Id}|{row.Title}|{row.Body}|{row.UpdatedAt.Ticks}"));
                rows.AddRange((await db.CanonConflicts.AsNoTracking().Where(row => row.UniverseId == u).ToListAsync())
                    .Select(row => $"conflict|{row.RuleCode}|{row.Fingerprint}|{row.Status}"));
                rows.Add($"universe|{(await db.Universes.AsNoTracking().SingleAsync(row => row.Id == u)).UpdatedAt.Ticks}");
                text = string.Join('\n', rows.Order(StringComparer.Ordinal));
            });
            return text;
        }
    }
}
