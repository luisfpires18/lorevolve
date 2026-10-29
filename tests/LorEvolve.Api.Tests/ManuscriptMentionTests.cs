using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Reading;
using LorEvolve.Api.Features.Stories;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.ManuscriptTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.PublishingTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Lore mentions in a manuscript (issue 31, ADR 0058): a mention is plain text of one exact shape, stored and versioned
/// exactly like any other prose; every reader outside the editor - the public page, the assistant and MCP - reads it as the
/// name the author wrote; a restore points it at the restored entry and touches nothing else; the editor's lookup answers
/// only this universe's entries, by id.
/// </summary>
public sealed class ManuscriptMentionTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private static string Token(string name, Guid id) => $"@[{name}](lore:{id})";

    // ---------- The shape ----------

    [Fact]
    public void A_mention_is_exactly_its_shape_and_reads_as_its_name()
    {
        var id = Guid.NewGuid();
        var text = $"She saw {Token("Akron Wright", id)} at dusk.";

        var found = Assert.Single(ManuscriptMentions.Find(text));
        Assert.Equal((8, Token("Akron Wright", id).Length, "Akron Wright", id), (found.Start, found.Length, found.Name, found.EntityId));
        Assert.Equal("She saw Akron Wright at dusk.", ManuscriptMentions.Plain(text));

        // Where each name lands in the plain text, for the public page's links.
        var (plain, placed) = ManuscriptMentions.PlainWithMentions($"{text} {Token("Akron", id)}!");
        Assert.Equal("She saw Akron Wright at dusk. Akron!", plain);
        Assert.Equal(["Akron Wright", "Akron"], placed.Select(mention => plain.Substring(mention.Start, mention.Length)));
        Assert.Equal(("plain prose", 0), (ManuscriptMentions.PlainWithMentions("plain prose").Text, ManuscriptMentions.PlainWithMentions("plain prose").Mentions.Count));

        foreach (var prose in new[]
        {
            "mail me at a@example.test",
            "@[Akron Wright](lore:not-an-id)",
            $"@[Akron Wright] (lore:{id})",
            $"@[Akron\nWright](lore:{id})",
            $"[Akron Wright](lore:{id})",
        })
        {
            Assert.Empty(ManuscriptMentions.Find(prose));
            Assert.Equal(prose, ManuscriptMentions.Plain(prose));
        }

        // An excerpt that cuts a mention shows none of its markup.
        Assert.Equal("ght walked in", ManuscriptMentions.PlainExcerpt($"ght](lore:{id}) walked in"));
        Assert.Equal("then Akron Wr", ManuscriptMentions.PlainExcerpt("then @[Akron Wr"));
        Assert.Equal("then Akron Wright", ManuscriptMentions.PlainExcerpt($"then @[Akron Wright](lore:{id.ToString()[..6]}"));
    }

    [Fact]
    public void A_remap_changes_only_the_ids_of_well_formed_mentions_it_knows()
    {
        var known = Guid.NewGuid();
        var renamed = Guid.NewGuid();
        var unknown = Guid.NewGuid();
        var text = $"  {Token("Mira", known)} and {Token("Ghost", unknown)}\n\nKept: @[Mira](lore:{known}x) and (lore:{known}).  ";

        var remapped = ManuscriptMentions.Remap(text, id => id == known ? renamed : null);

        Assert.Equal(text.Replace($"@[Mira](lore:{known})", $"@[Mira](lore:{renamed})", StringComparison.Ordinal), remapped);
        Assert.Contains(Token("Ghost", unknown), remapped, StringComparison.Ordinal);
        Assert.Contains($"(lore:{known}).", remapped, StringComparison.Ordinal);
        Assert.Same("No mention at all.", ManuscriptMentions.Remap("No mention at all.", _ => renamed));
    }

    // ---------- Stored and read ----------

    [Fact]
    public async Task A_mention_is_stored_versioned_and_read_back_exactly_as_typed()
    {
        var w = await NewSharedWorld(_factory, "mn-store");
        var links = (await w.Owner.GetFromJsonAsync<SceneResponse>($"{Story(w.U, w.Story)}/scenes/{w.Scene}"))!.Entities.Select(link => link.EntityId).ToList();
        var text = $"  {Token("Ember Vale", w.Entry)} crossed.\n\n\tThen @[Ember Vale](lore:{w.Entry} was cut.  ";

        var saved = await WriteManuscript(w.Owner, w.U, w.Story, w.Scene, text);
        Assert.Equal(text, saved.Content);
        Assert.Equal(text, (await ReadManuscript(w.Viewer, w.U, w.Story, w.Scene)).Content);

        var history = (await w.Owner.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>($"{Manuscript(w.U, w.Story, w.Scene)}/revisions"))!;
        var detail = (await w.Owner.GetFromJsonAsync<SceneManuscriptRevisionDetail>($"{Manuscript(w.U, w.Story, w.Scene)}/revisions/{history[0].Id}"))!;
        Assert.Equal(text, detail.Content);

        // The scene's lore links are its own: a mention adds none.
        var scene = (await w.Owner.GetFromJsonAsync<SceneResponse>($"{Story(w.U, w.Story)}/scenes/{w.Scene}"))!;
        Assert.Equal(links, scene.Entities.Select(link => link.EntityId));
        await WithDb(_factory, async db =>
        {
            var reading = await UniverseReader.GetSceneAsync(db, w.U, w.Scene, true, CancellationToken.None);
            Assert.NotNull(reading);
            Assert.Contains("Ember Vale crossed.", reading!.Prose, StringComparison.Ordinal);
            Assert.DoesNotContain(Token("Ember Vale", w.Entry), reading.Prose, StringComparison.Ordinal);
            // What is not exactly a mention is prose, read as typed.
            Assert.Contains($"@[Ember Vale](lore:{w.Entry} was cut.", reading.Prose, StringComparison.Ordinal);
        });
    }

    [Fact]
    public async Task The_public_page_reads_each_mention_as_its_name_in_plain_text()
    {
        var (owner, _) = await Account(_factory, "mn-public");
        var universe = await Ready(owner, "Mention public world");
        var u = universe.Id;
        var secretEntry = await CreateEntity(owner, u, "Private Heir");
        var story = (await PostJson<StoryDetail>(owner, Stories(u), new StoryRequest("Mention tale", null, StoryStatus.Drafting))).Id;
        (await owner.PutAsJsonAsync($"{Story(u, story)}/publication", new StoryPublicationRequest("For readers."))).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{Story(u, story)}/publish", null)).EnsureSuccessStatusCode();
        var scene = await CreateScene(owner, u, story, "The Causeway");
        await WriteManuscript(owner, u, story, scene, $"Then {Token("the heir", secretEntry)} spoke.");
        (await owner.PostAsync($"{Story(u, story)}/scenes/{scene}/manuscript/publish", null)).EnsureSuccessStatusCode();
        var world = await Published(owner, u);

        var body = await Anonymous(_factory).GetStringAsync($"{PublicRoute}/{world.PublicSlug}/stories/mention-tale");
        var page = System.Text.Json.JsonSerializer.Deserialize<PublicStoryDetail>(body, System.Text.Json.JsonSerializerOptions.Web)!;

        Assert.Equal("Then the heir spoke.", Assert.Single(page.Manuscript).Text);
        Assert.DoesNotContain("lore:", body, StringComparison.Ordinal);
        Assert.DoesNotContain(secretEntry.ToString(), body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Private Heir", body, StringComparison.Ordinal);
        Assert.Empty(page.Manuscript[0].Links);
    }

    [Fact]
    public async Task The_public_page_links_a_mention_only_when_its_entry_is_published()
    {
        var (owner, _) = await Account(_factory, "mn-public-link");
        var universe = await Ready(owner, "Mention linked world");
        var u = universe.Id;
        var shown = await CreateEntity(owner, u, "Sabine Varrow");
        var secret = await CreateEntity(owner, u, "Hidden Heir");
        (await owner.PostAsync($"/api/universes/{u}/entities/{shown}/publish", null)).EnsureSuccessStatusCode();
        var story = (await PostJson<StoryDetail>(owner, Stories(u), new StoryRequest("Linked tale", null, StoryStatus.Drafting))).Id;
        (await owner.PutAsJsonAsync($"{Story(u, story)}/publication", new StoryPublicationRequest("For readers."))).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{Story(u, story)}/publish", null)).EnsureSuccessStatusCode();
        var scene = await CreateScene(owner, u, story, "The Wall");
        await WriteManuscript(owner, u, story, scene, $"{Token("the heir", secret)} waited.\r\n\r\nThen {Token("Sabine", shown)} held it, {Token("Sabine", shown)} alone.");
        (await owner.PostAsync($"{Story(u, story)}/scenes/{scene}/manuscript/publish", null)).EnsureSuccessStatusCode();
        var world = await Published(owner, u);

        var body = await Anonymous(_factory).GetStringAsync($"{PublicRoute}/{world.PublicSlug}/stories/linked-tale");
        var page = System.Text.Json.JsonSerializer.Deserialize<PublicStoryDetail>(body, System.Text.Json.JsonSerializerOptions.Web)!;
        var lore = await Anonymous(_factory).GetStringAsync($"{PublicRoute}/{world.PublicSlug}/lore");

        var part = Assert.Single(page.Manuscript);
        Assert.Equal("the heir waited.\r\n\r\nThen Sabine held it, Sabine alone.", part.Text);
        Assert.Equal(2, part.Links.Count);
        Assert.All(part.Links, link => Assert.Equal("Sabine", part.Text.Substring(link.Start, link.Length)));
        Assert.Contains($"\"slug\":\"{part.Links[0].LoreSlug}\"", lore, StringComparison.Ordinal);
        Assert.DoesNotContain(secret.ToString(), body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(shown.ToString(), body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task A_restore_points_mentions_at_the_restored_entries_and_changes_nothing_else()
    {
        var w = await NewSharedWorld(_factory, "mn-restore");
        var stranger = Guid.NewGuid();
        var first = $"First: {Token("Ember Vale", w.Entry)}.";
        var second = $"  {Token("Ember", w.Entry)} met {Token("Nobody", stranger)}.\n\n  Spaces kept.  ";
        await WriteManuscript(w.Owner, w.U, w.Story, w.Scene, first);
        await WriteManuscript(w.Owner, w.U, w.Story, w.Scene, second);

        // The backup holds the prose byte for byte.
        var backup = await Backup(w.Owner, w.U);
        var stored = backup.Payload.Stories!.SelectMany(story => story.Scenes).Single(scene => scene.Id == w.Scene).Manuscript!;
        Assert.Equal(second, stored.Content);

        var restored = await RestoreArchive(w.Owner, await RawArchive(w.Owner, w.U), "Mentions again");
        var copy = (await w.Owner.GetFromJsonAsync<LorEvolve.Api.Features.Lore.EntityPage>($"/api/universes/{restored.Id}/entities?search=Ember"))!.Items.Single();
        var storyTitle = backup.Payload.Stories!.Single(story => story.Id == w.Story).Title;
        var sceneTitle = backup.Payload.Stories!.SelectMany(story => story.Scenes).Single(scene => scene.Id == w.Scene).Title;
        var restoredStory = (await w.Owner.GetFromJsonAsync<List<StorySummary>>(Stories(restored.Id)))!.Single(story => story.Title == storyTitle);
        var restoredScene = (await w.Owner.GetFromJsonAsync<StoryDetail>(Story(restored.Id, restoredStory.Id)))!.Scenes.Single(scene => scene.Title == sceneTitle);
        var prose = await ReadManuscript(w.Owner, restored.Id, restoredStory.Id, restoredScene.Id);

        Assert.Equal(second.Replace($"(lore:{w.Entry})", $"(lore:{copy.Id})", StringComparison.Ordinal), prose.Content);
        Assert.Contains(Token("Nobody", stranger), prose.Content, StringComparison.Ordinal);

        var versions = (await w.Owner.GetFromJsonAsync<List<SceneManuscriptRevisionSummary>>($"{Manuscript(restored.Id, restoredStory.Id, restoredScene.Id)}/revisions"))!;
        // Newest first: the save before the latest, written in this test.
        var earlier = (await w.Owner.GetFromJsonAsync<SceneManuscriptRevisionDetail>($"{Manuscript(restored.Id, restoredStory.Id, restoredScene.Id)}/revisions/{versions[1].Id}"))!;
        Assert.Equal($"First: {Token("Ember Vale", copy.Id)}.", earlier.Content);
    }

    // ---------- The editor's lookup ----------

    [Fact]
    public async Task The_lookup_answers_only_this_universes_entries_by_id_with_the_trash_marked()
    {
        var w = await NewSharedWorld(_factory, "mn-lookup");
        var elsewhere = await CreateEntity(w.Owner, (await CreateUniverse(w.Owner, "Elsewhere mn")).Id, "Stranger");
        var path = $"/api/universes/{w.U}/lore-references?ids={w.Entry},{w.Trash.Entry},{elsewhere},{Guid.NewGuid()},{w.Entry}";

        foreach (var who in Members)
        {
            var found = (await w.Client(who).GetFromJsonAsync<List<SceneLoreReference>>(path))!;
            Assert.Equal([(w.Entry, false), (w.Trash.Entry, true)], found.Select(reference => (reference.EntityId, reference.IsTrashed)));
            Assert.Equal("Ember Vale", found[0].Name);
        }

        await AssertHidden(await w.Outsider.GetAsync(path), "outsider");
        Assert.Empty((await w.Owner.GetFromJsonAsync<List<SceneLoreReference>>($"/api/universes/{w.U}/lore-references"))!);

        var malformed = await w.Owner.GetAsync($"/api/universes/{w.U}/lore-references?ids=nope");
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
        var tooMany = string.Join(',', Enumerable.Range(0, LoreReferenceEndpoints.MaxIds + 1).Select(_ => Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Owner.GetAsync($"/api/universes/{w.U}/lore-references?ids={tooMany}")).StatusCode);
    }
}
