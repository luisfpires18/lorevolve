using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.ArticleTestClient;
using static Lorex.Api.Tests.ManuscriptTestClient;
using static Lorex.Api.Tests.PlotTestClient;

using static Lorex.Api.Tests.VersionTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// An entry's article: long-form prose beside the structured lore, read and written on its own route.
///
/// The invariants under test: the document is stored and returned exactly as the editor wrote it; an entry with no article
/// reads as an empty one; a save written over an article that has since changed is refused and writes nothing; the article
/// is reachable only through its owner's universe and a live entry; it has a history of its own that no structured edit,
/// entry restore or older entry version can overwrite; it lives and dies with its entry and survives the Trash; and it
/// never becomes structured lore, a Canon change, a relationship, a timeline entry or part of any other payload.
/// </summary>
public sealed class EntityArticleEndpointTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    // ---------- Reading and writing ----------

    [Fact]
    public async Task An_entry_with_no_article_reads_as_an_empty_one_with_no_history()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artempty");
        var entity = await CreateEntity(client, universe.Id, "Arlen");

        Assert.Equal(new EntityArticleResponse(entity, string.Empty, null, 0), await ReadArticle(client, universe.Id, entity));
        Assert.Empty(await ArticleRevisions(client, universe.Id, entity));
        await WithDb(_factory, async db => Assert.False(await db.EntityArticles.AnyAsync(row => row.EntityId == entity)));
    }

    [Fact]
    public async Task The_first_save_creates_the_article_exactly_and_a_later_save_replaces_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artsave");
        var entity = await CreateEntity(client, universe.Id, "Alenna Vance");
        var before = await Detail(client, universe.Id, entity);

        var first = await PutArticle(client, universe.Id, entity, RichDocument, 0);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var created = (await first.Content.ReadFromJsonAsync<EntityArticleResponse>())!;
        Assert.Equal(RichDocument, created.Content, StringComparer.Ordinal);
        Assert.NotNull(created.UpdatedAt);

        // Over the wire and straight from the column: nothing trimmed, re-serialised or re-encoded on either side.
        var read = await ReadArticle(client, universe.Id, entity);
        Assert.Equal(RichDocument, read.Content, StringComparer.Ordinal);
        SameMoment(created.UpdatedAt, read.UpdatedAt);
        await WithDb(_factory, async db =>
            Assert.Equal(RichDocument, (await db.EntityArticles.SingleAsync(row => row.EntityId == entity)).Content, StringComparer.Ordinal));

        var second = await PutArticle(client, universe.Id, entity, Doc("Exiled to the salt marshes."), read.Version);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(Doc("Exiled to the salt marshes."), (await ReadArticle(client, universe.Id, entity)).Content);
        await WithDb(_factory, async db => Assert.Equal(1, await db.EntityArticles.CountAsync(row => row.EntityId == entity)));

        // The entry sorts as recently worked on; nothing structured about it moved.
        var after = await Detail(client, universe.Id, entity);
        Assert.True(after.UpdatedAt > before.UpdatedAt);
        Assert.Equal(WithoutTimestamp(before), WithoutTimestamp(after));
    }

    [Fact]
    public async Task Clearing_an_article_keeps_an_empty_one_and_clearing_nothing_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artclear");
        var entity = await CreateEntity(client, universe.Id, "Second thoughts");

        // Nothing to clear: nothing is stored and nothing is recorded.
        var nothing = await PutArticle(client, universe.Id, entity, "   ", 0);
        Assert.Equal(HttpStatusCode.OK, nothing.StatusCode);
        Assert.Equal(new EntityArticleResponse(entity, string.Empty, null, 0), await nothing.Content.ReadFromJsonAsync<EntityArticleResponse>());
        await WithDb(_factory, async db => Assert.False(await db.EntityArticles.AnyAsync(row => row.EntityId == entity)));
        Assert.Empty(await ArticleRevisions(client, universe.Id, entity));

        await WriteArticle(client, universe.Id, entity, Doc("A false start."));
        var cleared = await WriteArticle(client, universe.Id, entity, " \n ");

        // A blank document is stored as no text at all, never as whitespace.
        Assert.Equal(string.Empty, cleared.Content);
        Assert.NotNull(cleared.UpdatedAt);
        var read = await ReadArticle(client, universe.Id, entity);
        Assert.Equal(string.Empty, read.Content);
        SameMoment(cleared.UpdatedAt, read.UpdatedAt);

        var history = await ArticleRevisions(client, universe.Id, entity);
        Assert.Equal([(2, true), (1, false)], history.Select(revision => (revision.Number, revision.IsEmpty)));
    }

    [Fact]
    public async Task An_article_at_the_limit_saves_and_one_character_more_is_refused_without_writing()
    {
        // The web client mirrors this exact number, and says so before a save rather than after.
        Assert.Equal(200_000, LoreLimits.ContentMaxLength);

        var (client, universe) = await SignedInWithUniverse(_factory, "artlimit");
        var entity = await CreateEntity(client, universe.Id, "The whole war");

        var padding = LoreLimits.ContentMaxLength - Doc(string.Empty).Length;
        var full = Doc(new string('a', padding));
        Assert.Equal(LoreLimits.ContentMaxLength, full.Length);

        var saved = await WriteArticle(client, universe.Id, entity, full);
        Assert.Equal(LoreLimits.ContentMaxLength, saved.Content.Length);

        var over = await PutArticle(client, universe.Id, entity, Doc(new string('a', padding + 1)), saved.Version);
        Assert.Contains("\"content\"", await Errors(over), StringComparison.Ordinal);

        var kept = await ReadArticle(client, universe.Id, entity);
        Assert.Equal(full, kept.Content, StringComparer.Ordinal);
        SameMoment(saved.UpdatedAt, kept.UpdatedAt);
        Assert.Single(await ArticleRevisions(client, universe.Id, entity));
    }

    [Fact]
    public async Task A_save_without_an_article_or_with_one_that_is_not_a_safe_document_is_refused_and_wipes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artrefused");
        var entity = await CreateEntity(client, universe.Id, "Careful");
        var saved = await WriteArticle(client, universe.Id, entity, Doc("Keep me."));

        var missing = await client.PutAsync(
            ArticlePath(universe.Id, entity),
            JsonContent.Create(new { expectedUpdatedAt = saved.UpdatedAt }));
        Assert.Contains("\"content\"", await Errors(missing), StringComparison.Ordinal);

        string[] refused =
        [
            "not json at all",
            """{"type":123}""",
            "[]",
            """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"click","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}]}""",
        ];

        foreach (var content in refused)
        {
            var response = await PutArticle(client, universe.Id, entity, content, saved.Version);
            Assert.Contains("\"content\"", await Errors(response), StringComparison.Ordinal);
        }

        var kept = await ReadArticle(client, universe.Id, entity);
        Assert.Equal(Doc("Keep me."), kept.Content);
        SameMoment(saved.UpdatedAt, kept.UpdatedAt);
        Assert.Single(await ArticleRevisions(client, universe.Id, entity));
    }

    [Theory]
    // Every shape here is legal JSON but an odd document. Each must be answered - saved or refused - never with an
    // unhandled exception.
    [InlineData("""{"type":"doc","content":[{"type":"paragraph","marks":[{"type":42}]}]}""")]
    [InlineData("""{"type":"doc","content":[{"type":"text","marks":[{"type":"link","attrs":"nope"}]}]}""")]
    [InlineData("""{"type":"doc","content":[{"type":"text","marks":[{"type":"link","attrs":{"href":7}}]}]}""")]
    [InlineData("""{"type":"doc","content":[{"type":"text","marks":[{"type":"link","attrs":{}}]}]}""")]
    public async Task An_odd_document_is_answered_without_a_server_error(string content)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, $"artodd-{content.Length}-{(uint)content.GetHashCode()}");
        var entity = await CreateEntity(client, universe.Id, "Odd");

        var response = await PutArticle(client, universe.Id, entity, content, 0);

        Assert.True(
            response.StatusCode is HttpStatusCode.OK or HttpStatusCode.BadRequest,
            $"Expected OK or BadRequest but got {(int)response.StatusCode}.");
    }

    // ---------- Stale saves ----------

    [Fact]
    public async Task A_save_written_over_an_article_that_has_since_changed_is_refused_and_writes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artstale");
        var entity = await CreateEntity(client, universe.Id, "Two windows");

        // Both windows open the entry with no article. The first saves.
        var opened = await ReadArticle(client, universe.Id, entity);
        var first = await PutArticle(client, universe.Id, entity, Doc("From the first window."), opened.Version);
        var firstSaved = (await first.Content.ReadFromJsonAsync<EntityArticleResponse>())!;

        // The second still believes nothing was saved, and is told otherwise - with what is stored now.
        var second = await PutArticle(client, universe.Id, entity, Doc("From the second window."), opened.Version);
        var (code, current, currentVersion) = await ArticleRefusal(second);
        Assert.Equal(EntityArticleEndpoints.ChangedCode, code);
        SameMoment(firstSaved.UpdatedAt, current);
        Assert.Equal((0, 1), (opened.Version, firstSaved.Version));
        Assert.Equal(firstSaved.Version, currentVersion);
        Assert.Equal(Doc("From the first window."), (await ReadArticle(client, universe.Id, entity)).Content);
        Assert.Single(await ArticleRevisions(client, universe.Id, entity));

        // Having seen that, its author keeps their own text: naming the version stored now is a deliberate save over it.
        var kept = await PutArticle(client, universe.Id, entity, Doc("From the second window."), currentVersion);
        Assert.Equal(HttpStatusCode.OK, kept.StatusCode);
        var keptSaved = (await kept.Content.ReadFromJsonAsync<EntityArticleResponse>())!;
        Assert.Equal(firstSaved.Version + 1, keptSaved.Version);

        // A version that is no longer the latest is just as stale, even for the same words.
        var older = await PutArticle(client, universe.Id, entity, Doc("From the second window."), firstSaved.Version);
        var olderRefusal = await ArticleRefusal(older);
        SameMoment(keptSaved.UpdatedAt, olderRefusal.UpdatedAt);
        Assert.Equal(keptSaved.Version, olderRefusal.CurrentVersion);

        // A save naming no version, or one from the future, is refused the same way.
        await ArticleRefusal(await PutArticle(client, universe.Id, entity, Doc("Unnamed."), null));
        await ArticleRefusal(await PutArticle(client, universe.Id, entity, Doc("Ahead."), keptSaved.Version + 1));
        Assert.Equal(Doc("From the second window."), (await ReadArticle(client, universe.Id, entity)).Content);

        // A save naming an article that was never written is refused, saying nothing is stored.
        var other = await CreateEntity(client, universe.Id, "Untouched");
        var imagined = await PutArticle(client, universe.Id, other, Doc("Over nothing."), 1);
        Assert.Equal((EntityArticleEndpoints.ChangedCode, (DateTime?)null, 0), await ArticleRefusal(imagined));
        await WithDb(_factory, async db => Assert.False(await db.EntityArticles.AnyAsync(row => row.EntityId == other)));
    }

    // ---------- Who may reach one ----------

    [Fact]
    public async Task Someone_else_cannot_read_write_or_restore_an_article_and_is_told_nothing_about_it()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "artmine");
        var entity = await CreateEntity(owner, universe.Id, "Private");
        await WriteArticle(owner, universe.Id, entity, Doc("Only mine, first."));
        var saved = await WriteArticle(owner, universe.Id, entity, Doc("Only mine."));
        var version = (await ArticleRevisions(owner, universe.Id, entity)).Last();

        var stranger = await SignedIn(_factory, "user-artyours");
        var path = ArticlePath(universe.Id, entity);

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PutArticle(stranger, universe.Id, entity, Doc("Mine now."), saved.Version)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"{path}/revisions")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"{path}/revisions/{version.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await RestoreArticle(stranger, universe.Id, entity, version.Id, saved.Version)).StatusCode);

        // Not even the shape of a refusal: an invalid body from a stranger is the same 404, never a 400.
        Assert.Equal(HttpStatusCode.NotFound, (await PutArticle(stranger, universe.Id, entity, null, null)).StatusCode);

        var kept = await ReadArticle(owner, universe.Id, entity);
        Assert.Equal(Doc("Only mine."), kept.Content);
        SameMoment(saved.UpdatedAt, kept.UpdatedAt);
        Assert.Equal(2, (await ArticleRevisions(owner, universe.Id, entity)).Count);
    }

    [Fact]
    public async Task An_article_reached_through_another_universe_or_a_foreign_id_is_not_found()
    {
        var (client, first) = await SignedInWithUniverse(_factory, "artforeign");
        var second = await CreateUniverse(client, "World artforeign two");

        var entity = await CreateEntity(client, first.Id, "Home");
        var sibling = await CreateEntity(client, first.Id, "Sibling");
        await WriteArticle(client, first.Id, entity, Doc("Where it belongs."));
        await WriteArticle(client, first.Id, sibling, Doc("The sibling's."));
        var siblingVersion = Assert.Single(await ArticleRevisions(client, first.Id, sibling));

        var (stranger, strangerUniverse) = await SignedInWithUniverse(_factory, "artforeignother");
        var strangerEntity = await CreateEntity(stranger, strangerUniverse.Id, "Theirs");

        foreach (var (universeId, entityId) in new[]
        {
            (second.Id, entity),
            (first.Id, Guid.NewGuid()),
            (first.Id, strangerEntity),
            (strangerUniverse.Id, entity),
        })
        {
            var path = ArticlePath(universeId, entityId);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await PutArticle(client, universeId, entityId, Doc("Smuggled."), null)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{path}/revisions")).StatusCode);
        }

        // A version is reached only through the entry whose article it is.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"{ArticlePath(first.Id, entity)}/revisions/{siblingVersion.Id}")).StatusCode);
        var current = await ReadArticle(client, first.Id, entity);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await RestoreArticle(client, first.Id, entity, siblingVersion.Id, current.Version)).StatusCode);

        Assert.Equal(Doc("Where it belongs."), (await ReadArticle(client, first.Id, entity)).Content);
        Assert.Equal(string.Empty, (await ReadArticle(stranger, strangerUniverse.Id, strangerEntity)).Content);
    }

    // ---------- Prose is not structured lore ----------

    [Fact]
    public async Task An_article_save_changes_no_structured_lore_status_canon_relationship_timeline_or_entry_version()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artnotlore");
        var character = await CharacterTypeId(client, universe.Id);
        var born = await PostJson<EntityTypeResponse>(
            client,
            $"/api/universes/{universe.Id}/entity-types/{character}/fields",
            new FieldDefinitionRequest("Born", EntityFieldKind.Number, false, null, null, null, EntityFieldSemantic.BirthYear));
        var bornField = born.Fields.Single(field => field.Name == "Born");

        var arlen = await PostJson<EntityDetail>(
            client,
            $"/api/universes/{universe.Id}/entities",
            new EntityRequest(
                character, "Arlen", "A soldier of the coast.", CanonStatus.Draft, ["The Grey"], ["coast"],
                [new FieldValueInput(bornField.Id, null, 290, null, null, null, null)]));

        var entryBefore = await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{arlen.Id}");
        var versionsBefore = await EntryRevisionCount(client, universe.Id, arlen.Id);

        await WriteArticle(
            client,
            universe.Id,
            arlen.Id,
            Doc("The king died before sunrise.", "Arlen was born in 312 and died in 340, the year he married Mira. He is Canon now."));

        var entryAfter = await Detail(client, universe.Id, arlen.Id);
        Assert.Equal(WithoutTimestamp(JsonSerializer.Deserialize<EntityDetail>(entryBefore, JsonOptions)!), WithoutTimestamp(entryAfter));
        Assert.Equal(CanonStatus.Draft, entryAfter.CanonStatus);
        Assert.Equal(290, entryAfter.Fields.Single().Number);
        Assert.Equal(versionsBefore, await EntryRevisionCount(client, universe.Id, arlen.Id));

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.CanonConflicts.AnyAsync(conflict => conflict.UniverseId == universe.Id));
            Assert.False(await db.TimelineEntries.AnyAsync(entry => entry.UniverseId == universe.Id));
            Assert.False(await db.Relationships.AnyAsync(link => link.UniverseId == universe.Id));
            Assert.Equal(1, await db.Entities.CountAsync(entity => entity.UniverseId == universe.Id));
        });
    }

    [Fact]
    public async Task A_structured_edit_or_promotion_leaves_the_article_and_its_history_exactly_as_they_were()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artstructured");
        var entity = await Detail(client, universe.Id, await CreateEntity(client, universe.Id, "Warden"));
        var saved = await WriteArticle(client, universe.Id, entity.Id, RichDocument);

        var edited = await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{entity.Id}",
            new EntityRequest(entity.EntityTypeId, "Warden of the Coast", "Now with a summary.", CanonStatus.Idea, null, null, null));
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);

        var promoted = await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{entity.Id}",
            new EntityRequest(entity.EntityTypeId, "Warden of the Coast", "Now with a summary.", CanonStatus.Canon, null, null, null));
        Assert.Equal(HttpStatusCode.OK, promoted.StatusCode);

        var kept = await ReadArticle(client, universe.Id, entity.Id);
        Assert.Equal(RichDocument, kept.Content, StringComparer.Ordinal);
        SameMoment(saved.UpdatedAt, kept.UpdatedAt);
        Assert.Single(await ArticleRevisions(client, universe.Id, entity.Id));
    }

    // ---------- An entry write that still carries an article ----------

    /// <summary>
    /// A client from before the article moved still sends it with the entry. Saving the entry and dropping the article would
    /// answer 200 over lost prose, so the whole write is refused - whatever the member holds, null included, however it is
    /// cased - and nothing about the entry, its article or anything that watches them moves.
    /// </summary>
    [Fact]
    public async Task An_entry_update_that_still_carries_an_article_is_refused_whole_and_changes_nothing()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artlegacyput");
        var entity = await Detail(client, universe.Id, await CreateEntity(client, universe.Id, "Warden"));
        var saved = await WriteArticle(client, universe.Id, entity.Id, RichDocument);

        var path = $"/api/universes/{universe.Id}/entities/{entity.Id}";
        var entryBefore = await client.GetStringAsync(path);
        var versionsBefore = await EntryRevisionCount(client, universe.Id, entity.Id);

        object[] legacy =
        [
            new { entityTypeId = entity.EntityTypeId, name = "Renamed", summary = "Changed.", content = Doc("Rewritten in the old editor."), canonStatus = CanonStatus.Idea },
            new { entityTypeId = entity.EntityTypeId, name = "Renamed", summary = "Changed.", content = (string?)null, canonStatus = CanonStatus.Idea },
            new Dictionary<string, object?>
            {
                ["entityTypeId"] = entity.EntityTypeId,
                ["name"] = "Renamed",
                ["Content"] = Doc("Cased as C# would case it."),
                ["canonStatus"] = CanonStatus.Idea,
            },
            new { entityTypeId = entity.EntityTypeId, name = "Renamed", content = new { type = "doc" }, canonStatus = CanonStatus.Idea },
        ];

        foreach (var body in legacy)
        {
            await AssertArticleMoved(await client.PutAsJsonAsync(path, body));
        }

        // Not a column, a timestamp, a version or a finding moved.
        Assert.Equal(entryBefore, await client.GetStringAsync(path));
        Assert.Equal(versionsBefore, await EntryRevisionCount(client, universe.Id, entity.Id));

        var article = await ReadArticle(client, universe.Id, entity.Id);
        Assert.Equal(RichDocument, article.Content, StringComparer.Ordinal);
        SameMoment(saved.UpdatedAt, article.UpdatedAt);
        Assert.Single(await ArticleRevisions(client, universe.Id, entity.Id));

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.CanonConflicts.AnyAsync(conflict => conflict.UniverseId == universe.Id));
            Assert.False(await db.TimelineEntries.AnyAsync(entry => entry.UniverseId == universe.Id));
            Assert.False(await db.Relationships.AnyAsync(link => link.UniverseId == universe.Id));
        });
    }

    [Fact]
    public async Task A_new_entry_that_still_carries_an_article_is_refused_and_never_created()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artlegacypost");
        var character = await CharacterTypeId(client, universe.Id);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new { entityTypeId = character, name = "Written in the old editor", content = Doc("Lost if accepted."), canonStatus = CanonStatus.Idea });
        await AssertArticleMoved(response);

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.Entities.AnyAsync(entity => entity.UniverseId == universe.Id));
            Assert.False(await db.EntityArticles.AnyAsync(article => article.Entity!.UniverseId == universe.Id));
            Assert.False(await db.EntityRevisions.AnyAsync(revision => revision.Entity!.UniverseId == universe.Id));
        });
    }

    /// <summary>The refusal is about the article member and nothing else: a current write saves, and other unknown members are skipped as ever.</summary>
    [Fact]
    public async Task A_current_entry_write_still_saves_and_other_unknown_members_are_still_skipped()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artlegacycurrent");
        var entity = await Detail(client, universe.Id, await CreateEntity(client, universe.Id, "Warden"));
        var saved = await WriteArticle(client, universe.Id, entity.Id, Doc("Kept."));
        var path = $"/api/universes/{universe.Id}/entities/{entity.Id}";

        var current = await client.PutVersionedAsync(
            path, new EntityRequest(entity.EntityTypeId, "Warden of the Coast", "A summary.", CanonStatus.Draft, null, null, null));
        Assert.Equal(HttpStatusCode.OK, current.StatusCode);
        var after = await Detail(client, universe.Id, entity.Id);
        Assert.Equal(("Warden of the Coast", "A summary.", CanonStatus.Draft), (after.Name, after.Summary, after.CanonStatus));

        var unknown = await client.PutVersionedAsync(
            path,
            new { entityTypeId = entity.EntityTypeId, name = "Warden of the Coast", summary = "Another summary.", canonStatus = CanonStatus.Draft, contentType = "text/plain", notes = "Not a member." });
        Assert.Equal(HttpStatusCode.OK, unknown.StatusCode);
        Assert.Equal("Another summary.", (await Detail(client, universe.Id, entity.Id)).Summary);

        var article = await ReadArticle(client, universe.Id, entity.Id);
        Assert.Equal(Doc("Kept."), article.Content);
        SameMoment(saved.UpdatedAt, article.UpdatedAt);
    }

    [Fact]
    public async Task Someone_else_sending_an_article_with_an_entry_is_told_nothing_and_changes_nothing()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "artlegacymine");
        var entity = await Detail(owner, universe.Id, await CreateEntity(owner, universe.Id, "Private"));
        var saved = await WriteArticle(owner, universe.Id, entity.Id, Doc("Only mine."));
        var path = $"/api/universes/{universe.Id}/entities/{entity.Id}";
        var entryBefore = await owner.GetStringAsync(path);

        var stranger = await SignedIn(_factory, "user-artlegacyyours");
        var body = new { entityTypeId = entity.EntityTypeId, name = "Mine now", content = Doc("Mine now."), canonStatus = CanonStatus.Idea };

        foreach (var response in new[]
        {
            await stranger.PutAsJsonAsync(path, body),
            await stranger.PostAsJsonAsync($"/api/universes/{universe.Id}/entities", body),
        })
        {
            // The same answer as for anything that is not theirs: no refusal code, no hint that an article exists.
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            var text = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain(EntityEndpoints.ArticleMovedCode, text, StringComparison.Ordinal);
            Assert.DoesNotContain("Only mine", text, StringComparison.Ordinal);
        }

        Assert.Equal(entryBefore, await owner.GetStringAsync(path));
        var article = await ReadArticle(owner, universe.Id, entity.Id);
        Assert.Equal(Doc("Only mine."), article.Content);
        SameMoment(saved.UpdatedAt, article.UpdatedAt);
    }

    // ---------- History ----------

    [Fact]
    public async Task Each_save_that_changes_the_article_is_a_version_and_one_that_changes_nothing_is_not()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arthistory");
        var entity = await CreateEntity(client, universe.Id, "Versioned");

        await WriteArticle(client, universe.Id, entity, Doc("First."));
        var second = await WriteArticle(client, universe.Id, entity, Doc("Second."));
        var again = await WriteArticle(client, universe.Id, entity, Doc("Second."));

        SameMoment(second.UpdatedAt, again.UpdatedAt);

        var history = await ArticleRevisions(client, universe.Id, entity);
        Assert.Equal(
            [(2, EntityRevisionKind.Edited), (1, EntityRevisionKind.Created)],
            history.Select(revision => (revision.Number, revision.Kind)));

        var oldest = await ArticleRevision(client, universe.Id, entity, history[1].Id);
        Assert.Equal(Doc("First."), oldest.Content);
        Assert.Null(oldest.RestoredFromRevisionId);

        // The article's history is not the entry's: the entry still has only the version its creation wrote.
        Assert.Equal(1, await EntryRevisionCount(client, universe.Id, entity));
    }

    [Fact]
    public async Task Restoring_a_version_puts_it_back_as_the_next_version_and_moves_nothing_on_record()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artrestore");
        var entity = await CreateEntity(client, universe.Id, "Restored");

        await WriteArticle(client, universe.Id, entity, Doc("Ashfall ledger."));
        var latest = await WriteArticle(client, universe.Id, entity, Doc("Tidewater accord."));
        var history = await ArticleRevisions(client, universe.Id, entity);
        var (v2, v1) = (history[0], history[1]);

        var restored = await RestoreArticle(client, universe.Id, entity, v1.Id, latest.Version);
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        var back = (await restored.Content.ReadFromJsonAsync<EntityArticleResponse>())!;
        Assert.Equal(Doc("Ashfall ledger."), back.Content);
        Assert.Equal(Doc("Ashfall ledger."), (await ReadArticle(client, universe.Id, entity)).Content);

        history = await ArticleRevisions(client, universe.Id, entity);
        Assert.Equal([3, 2, 1], history.Select(revision => revision.Number));
        Assert.Equal(EntityRevisionKind.Restored, history[0].Kind);
        Assert.Equal(v1.Id, history[0].RestoredFromRevisionId);
        Assert.Equal(Doc("Tidewater accord."), (await ArticleRevision(client, universe.Id, entity, v2.Id)).Content);
        Assert.Equal(Doc("Ashfall ledger."), (await ArticleRevision(client, universe.Id, entity, v1.Id)).Content);

        // Search follows the restore.
        Assert.Equal([entity], await SearchIds(client, universe.Id, "Ashfall"));
        Assert.Empty(await SearchIds(client, universe.Id, "Tidewater"));

        // A restore naming an article that has moved on is refused like any stale save, and writes nothing.
        var stale = await RestoreArticle(client, universe.Id, entity, v2.Id, latest.Version);
        Assert.Equal(EntityArticleEndpoints.ChangedCode, (await ArticleRefusal(stale)).Code);

        // Restoring what the article already says records nothing.
        var same = await RestoreArticle(client, universe.Id, entity, v1.Id, back.Version);
        Assert.Equal(HttpStatusCode.OK, same.StatusCode);
        Assert.Equal(3, (await ArticleRevisions(client, universe.Id, entity)).Count);
    }

    [Fact]
    public async Task Restoring_an_entry_version_never_touches_the_article()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artentryrestore");
        var entity = await Detail(client, universe.Id, await CreateEntity(client, universe.Id, "Before"));
        var saved = await WriteArticle(client, universe.Id, entity.Id, Doc("Written after the first version."));

        (await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{entity.Id}",
            new EntityRequest(entity.EntityTypeId, "After", null, entity.CanonStatus, null, null, null))).EnsureSuccessStatusCode();

        var first = (await EntryRevisions(client, universe.Id, entity.Id)).Single(revision => revision.Number == 1);
        (await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{entity.Id}", first.Id)).EnsureSuccessStatusCode();

        Assert.Equal("Before", (await Detail(client, universe.Id, entity.Id)).Name);
        var kept = await ReadArticle(client, universe.Id, entity.Id);
        Assert.Equal(Doc("Written after the first version."), kept.Content);
        SameMoment(saved.UpdatedAt, kept.UpdatedAt);
        Assert.Single(await ArticleRevisions(client, universe.Id, entity.Id));
    }

    /// <summary>
    /// A database upgraded from before articles kept their own history holds entry versions with a copy of the article. That
    /// copy stays readable, is never compared - so the next structured edit is not an "article change" - and is never
    /// applied, so putting back an old name cannot put back, or wipe, the article written since.
    /// </summary>
    [Fact]
    public async Task An_entry_version_from_before_keeps_its_article_readable_and_never_applies_it()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artlegacy");
        var entity = await Detail(client, universe.Id, await CreateEntity(client, universe.Id, "Elder"));

        (await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{entity.Id}",
            new EntityRequest(entity.EntityTypeId, "Elder of the Coast", null, entity.CanonStatus, null, null, null))).EnsureSuccessStatusCode();

        var legacy = Doc("As the article read before the move.");
        await WithDb(_factory, db => db.EntityRevisions
            .Where(revision => revision.EntityId == entity.Id)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(revision => revision.Content, legacy)
                .SetProperty(revision => revision.Changes, revision => revision.Changes | EntityRevisionChange.Article)));

        var saved = await WriteArticle(client, universe.Id, entity.Id, Doc("The article as it stands."));

        var versions = await EntryRevisions(client, universe.Id, entity.Id);
        var first = versions.Single(revision => revision.Number == 1);
        var detail = (await client.GetFromJsonAsync<EntityRevisionDetail>(
            $"/api/universes/{universe.Id}/entities/{entity.Id}/revisions/{first.Id}"))!;
        Assert.Equal(legacy, detail.Content);

        (await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{entity.Id}",
            new EntityRequest(entity.EntityTypeId, "Elder of the Coast", "Now summarised.", entity.CanonStatus, null, null, null))).EnsureSuccessStatusCode();

        var newest = (await EntryRevisions(client, universe.Id, entity.Id)).First();
        Assert.Equal(3, newest.Number);
        Assert.Equal(EntityRevisionChange.Summary, newest.Changes);

        (await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{entity.Id}", first.Id)).EnsureSuccessStatusCode();

        var kept = await ReadArticle(client, universe.Id, entity.Id);
        Assert.Equal(Doc("The article as it stands."), kept.Content);
        SameMoment(saved.UpdatedAt, kept.UpdatedAt);
    }

    // ---------- What an article lives and dies with ----------

    [Fact]
    public async Task Trashing_an_entry_keeps_its_article_and_history_out_of_reach_and_restoring_it_brings_both_back()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "arttrash");
        var entity = await CreateEntity(client, universe.Id, "Gatewarden");
        await WriteArticle(client, universe.Id, entity, Doc("He kept the northern gate."));
        var saved = await WriteArticle(client, universe.Id, entity, Doc("He kept the Wyrmgate for forty winters."));
        var version = (await ArticleRevisions(client, universe.Id, entity)).First();

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{entity}")).EnsureSuccessStatusCode();

        var path = ArticlePath(universe.Id, entity);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PutArticle(client, universe.Id, entity, Doc("Rewritten."), saved.Version)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{path}/revisions")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{path}/revisions/{version.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await RestoreArticle(client, universe.Id, entity, version.Id, saved.Version)).StatusCode);
        Assert.Empty(await SearchIds(client, universe.Id, "Wyrmgate"));

        await WithDb(_factory, async db =>
        {
            Assert.Equal(1, await db.EntityArticles.CountAsync(row => row.EntityId == entity));
            Assert.Equal(2, await db.EntityArticleRevisions.CountAsync(row => row.EntityId == entity));
        });

        (await client.PostAsync($"/api/universes/{universe.Id}/trash/{entity}/restore", null)).EnsureSuccessStatusCode();

        var back = await ReadArticle(client, universe.Id, entity);
        Assert.Equal(Doc("He kept the Wyrmgate for forty winters."), back.Content);
        SameMoment(saved.UpdatedAt, back.UpdatedAt);
        Assert.Equal(2, (await ArticleRevisions(client, universe.Id, entity)).Count);
        Assert.Equal([entity], await SearchIds(client, universe.Id, "Wyrmgate"));
    }

    [Fact]
    public async Task Deleting_a_universe_takes_its_articles_and_their_history_and_no_other()
    {
        var (client, doomed) = await SignedInWithUniverse(_factory, "artuniverse");
        var kept = await CreateUniverse(client, "World artuniverse kept");

        var doomedEntity = await CreateEntity(client, doomed.Id, "Abandoned");
        var keptEntity = await CreateEntity(client, kept.Id, "Kept");
        await WriteArticle(client, doomed.Id, doomedEntity, Doc("Abandoned prose."));
        await WriteArticle(client, kept.Id, keptEntity, Doc("Kept prose."));

        (await client.PostAsync($"/api/universes/{doomed.Id}/archive", content: null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/universes/{doomed.Id}")).StatusCode);

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.EntityArticles.AnyAsync(row => row.EntityId == doomedEntity));
            Assert.False(await db.EntityArticleRevisions.AnyAsync(row => row.EntityId == doomedEntity));
            Assert.True(await db.EntityArticles.AnyAsync(row => row.EntityId == keptEntity));
            Assert.True(await db.EntityArticleRevisions.AnyAsync(row => row.EntityId == keptEntity));
            Assert.Equal(
                0,
                await db.Database.SqlQuery<int>($"SELECT COUNT(*) AS Value FROM EntitySearchIndex WHERE EntityId = {doomedEntity}").SingleAsync());
        });

        Assert.Equal(Doc("Kept prose."), (await ReadArticle(client, kept.Id, keptEntity)).Content);
    }

    // ---------- No article in any other payload ----------

    [Fact]
    public async Task No_listing_entry_history_or_trash_read_carries_the_article_however_long_it_is()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "artpayload");
        var entity = await CreateEntity(client, universe.Id, "Outlined");
        var binned = await CreateEntity(client, universe.Id, "Binned");
        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{binned}")).EnsureSuccessStatusCode();

        var firstVersion = Assert.Single(await EntryRevisions(client, universe.Id, entity));

        string[] reads =
        [
            $"/api/universes/{universe.Id}/entities",
            $"/api/universes/{universe.Id}/entities?search=Outlined",
            $"/api/universes/{universe.Id}/entities/{entity}",
            $"/api/universes/{universe.Id}/entities/{entity}/revisions",
            $"/api/universes/{universe.Id}/entities/{entity}/revisions/{firstVersion.Id}",
            $"/api/universes/{universe.Id}/trash",
        ];

        // A long article: well over a hundred thousand characters and still inside the bound, every paragraph marked.
        const string marker = "ZQXJ-ARTICLE-ONLY";
        var paragraphs = Enumerable.Repeat($"{marker} The hall had emptied long before Arlen understood.", 1_400).ToArray();
        Assert.InRange(Doc(paragraphs).Length, 150_000, LoreLimits.ContentMaxLength);
        await WriteArticle(client, universe.Id, entity, Doc(paragraphs));

        foreach (var path in reads)
        {
            Assert.DoesNotContain(marker, await client.GetStringAsync(path), StringComparison.Ordinal);
        }

        Assert.DoesNotContain(marker, await client.GetStringAsync($"{ArticlePath(universe.Id, entity)}/revisions"), StringComparison.Ordinal);
    }

    // ---------- Helpers ----------

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>The refusal an entry write that still carries the article is given: a 400 that names the article route.</summary>
    private static async Task AssertArticleMoved(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = problem.RootElement;
        Assert.Equal(EntityEndpoints.ArticleMovedCode, root.GetProperty("code").GetString());
        Assert.True(root.GetProperty("errors").TryGetProperty("content", out _));
        Assert.Contains("/article", root.GetProperty("detail").GetString(), StringComparison.Ordinal);
    }

    private static async Task<EntityDetail> Detail(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{universeId}/entities/{entityId}"))!;

    /// <summary>The entry as JSON with its timestamp blanked, so two readings compare on everything else.</summary>
    private static string WithoutTimestamp(EntityDetail detail) =>
        JsonSerializer.Serialize(detail with { UpdatedAt = default }, JsonOptions);

    private static async Task<List<EntityRevisionSummary>> EntryRevisions(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/universes/{universeId}/entities/{entityId}/revisions"))!;

    private static async Task<int> EntryRevisionCount(HttpClient client, Guid universeId, Guid entityId) =>
        (await EntryRevisions(client, universeId, entityId)).Count;

    private static async Task<Guid> CharacterTypeId(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!
            .First(type => type.Name == "Character").Id;

    private static async Task<List<Guid>> SearchIds(HttpClient client, Guid universeId, string search) =>
        [.. (await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universeId}/entities?pageSize=50&search={Uri.EscapeDataString(search)}"))!.Items.Select(item => item.Id)];
}
