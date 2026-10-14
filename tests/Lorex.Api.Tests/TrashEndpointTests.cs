using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Trash;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// The Trash: what removing an entry now means, what it must not destroy, and what a restore
/// is allowed to refuse.
///
/// Five claims carry this file. Removing an entry hides it everywhere and erases nothing.
/// Everything that pointed at it is still stored and comes back with it. A trashed entry is
/// invisible to the Canon rules while it is in the Trash and answerable to them again when it
/// is not. A restore that would make the world newly self-contradictory is refused whole, and
/// leaves the entry exactly where it was. And a Trash belongs to one universe and one owner.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class TrashEndpointTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private const string Article =
        """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"He kept the northern gate."}]}]}""";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Moving an entry to the Trash ----------

    [Fact]
    public async Task An_entry_can_be_moved_to_the_trash()
    {
        var (client, universe, type) = await World("trmove");
        var entry = await Create(client, universe.Id, type, "Gatewarden");

        var response = await client.DeleteAsync(Entity(universe.Id, entry.Id));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var trash = await Trash(client, universe.Id);
        var trashed = Assert.Single(trash.Items);

        Assert.Equal(entry.Id, trashed.Id);
        Assert.Equal("Gatewarden", trashed.Name);
        Assert.Equal(type, trashed.EntityTypeId);
        Assert.NotEqual(default, trashed.TrashedAt);
    }

    [Fact]
    public async Task A_trashed_entry_leaves_browse_search_and_detail()
    {
        var (client, universe, type) = await World("trhidden");
        var entry = await Create(client, universe.Id, type, "Gatewarden", aliases: ["The Keyholder"]);

        await Trashed(client, universe.Id, entry.Id);

        // Browse, including the archived view, which is a different statement about an entry
        // and must not be a way back to a trashed one.
        Assert.Empty((await Page(client, universe.Id, string.Empty)).Items);
        Assert.Empty((await Page(client, universe.Id, string.Empty, includeArchived: true)).Items);

        // Search, by name and by alias.
        Assert.Empty((await Page(client, universe.Id, "Gatewarden")).Items);
        Assert.Empty((await Page(client, universe.Id, "Keyholder")).Items);

        // The entry's own page, and its history.
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Entity(universe.Id, entry.Id))).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"{Entity(universe.Id, entry.Id)}/revisions")).StatusCode);

        // And it is not editable while it is in the Trash.
        var edit = await client.PutVersionedAsync(
            Entity(universe.Id, entry.Id),
            new EntityRequest(type, "Renamed", null, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.NotFound, edit.StatusCode);
    }

    [Fact]
    public async Task An_owner_sees_their_own_trash()
    {
        var (client, universe, type) = await World("trown");
        var kept = await Create(client, universe.Id, type, "Kept");
        var thrown = await Create(client, universe.Id, type, "Thrown");

        await Trashed(client, universe.Id, thrown.Id);

        var trash = await Trash(client, universe.Id);

        Assert.Equal(thrown.Id, Assert.Single(trash.Items).Id);
        Assert.Equal(kept.Id, Assert.Single((await Page(client, universe.Id, string.Empty)).Items).Id);
    }

    [Fact]
    public async Task Someone_else_cannot_read_or_empty_another_universes_trash()
    {
        var (owner, universe, type) = await World("trmine");
        var entry = await Create(owner, universe.Id, type, "Gatewarden");
        await Trashed(owner, universe.Id, entry.Id);

        var stranger = await SignedInClient("user-tryours");

        var listed = await stranger.GetAsync(TrashRoute(universe.Id));
        var restored = await stranger.PostAsync(RestoreRoute(universe.Id, entry.Id), null);

        // 404 on both, not 403: someone else's universe is indistinguishable from one that is
        // not there, and nothing in either body names the lore.
        Assert.Equal(HttpStatusCode.NotFound, listed.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, restored.StatusCode);
        Assert.DoesNotContain(
            "Gatewarden", await listed.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // And the refusal changed nothing.
        Assert.Single((await Trash(owner, universe.Id)).Items);
    }

    [Fact]
    public async Task A_trash_holds_only_its_own_universe()
    {
        var client = await SignedInClient("user-trscope");
        var here = await CreateUniverse(client, "Here");
        var there = await CreateUniverse(client, "There");

        var hereType = await CharacterType(client, here.Id);
        var thereType = await CharacterType(client, there.Id);

        var mine = await Create(client, here.Id, hereType, "Mine");
        await Trashed(client, here.Id, mine.Id);
        await Trashed(client, there.Id, (await Create(client, there.Id, thereType, "Theirs")).Id);

        Assert.Equal("Mine", Assert.Single((await Trash(client, here.Id)).Items).Name);

        // An id from the other world is not restorable through this one.
        var crossed = await client.PostAsync(RestoreRoute(here.Id, mine.Id), null);
        Assert.Equal(HttpStatusCode.OK, crossed.StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PostAsync(RestoreRoute(there.Id, mine.Id), null)).StatusCode);
    }

    // ---------- Restoring ----------

    [Fact]
    public async Task A_restored_entry_returns_to_normal_access_with_everything_it_was_written_with()
    {
        var (client, universe, type) = await World("trback");
        var title = await AddField(client, universe.Id, type, "Title", EntityFieldKind.ShortText);

        var entry = await Create(
            client,
            universe.Id,
            type,
            "Gatewarden",
            summary: "Keeper of the northern gate.",
            aliases: ["The Keyholder", "Warden"],
            tags: ["gates", "north"],
            fields: [new FieldValueInput(title.Id, "Warden of the Gate", null, null, null, null, null)]);
        var saved = await ArticleTestClient.WriteArticle(client, universe.Id, entry.Id, Article);

        await Trashed(client, universe.Id, entry.Id);

        // Kept, and out of reach with its entry: the article route answers as for any entry that is not here.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(ArticleTestClient.ArticlePath(universe.Id, entry.Id))).StatusCode);

        await Restored(client, universe.Id, entry.Id);

        var back = await Detail(client, universe.Id, entry.Id);
        var article = await ArticleTestClient.ReadArticle(client, universe.Id, entry.Id);

        Assert.Equal("Gatewarden", back.Name);
        Assert.Equal("Keeper of the northern gate.", back.Summary);
        Assert.Equal(Article, article.Content);
        ManuscriptTestClient.SameMoment(saved.UpdatedAt, article.UpdatedAt);
        Assert.Equal(["The Keyholder", "Warden"], back.Aliases);
        Assert.Equal(["gates", "north"], back.Tags);
        Assert.Equal(
            "Warden of the Gate",
            back.Fields.Single(field => field.FieldDefinitionId == title.Id).Text);

        Assert.Empty((await Trash(client, universe.Id)).Items);
        Assert.Equal(entry.Id, Assert.Single((await Page(client, universe.Id, "Gatewarden")).Items).Id);
    }

    [Fact]
    public async Task History_survives_the_round_trip_and_no_version_is_written_for_it()
    {
        var (client, universe, type) = await World("trhistory");
        var entry = await Create(client, universe.Id, type, "Gatewarden");

        entry = await Save(client, universe.Id, entry with { Summary = "Keeper of the gate." });
        entry = await Save(client, universe.Id, entry with { Name = "Gatewarden of the North" });

        var before = await History(client, universe.Id, entry.Id);
        Assert.Equal(3, before.Count);

        await Trashed(client, universe.Id, entry.Id);
        await Restored(client, universe.Id, entry.Id);

        var after = await History(client, universe.Id, entry.Id);

        // Same versions, same numbers, same order. Trash and restore change no authored
        // content, so ADR 0013's "a write that changed nothing writes nothing" applies and
        // neither of them leaves a version behind - the history is not an audit log.
        Assert.Equal(before.Count, after.Count);
        Assert.Equal(
            before.Select(revision => (revision.Id, revision.Number, revision.Kind)),
            after.Select(revision => (revision.Id, revision.Number, revision.Kind)));
    }

    [Fact]
    public async Task Trashing_and_restoring_repeatedly_is_safe_and_says_so()
    {
        var (client, universe, type) = await World("trrepeat");
        var entry = await Create(client, universe.Id, type, "Gatewarden");

        for (var round = 0; round < 3; round++)
        {
            Assert.Equal(
                HttpStatusCode.NoContent,
                (await client.DeleteAsync(Entity(universe.Id, entry.Id))).StatusCode);

            // Already there: refused rather than re-stamped, so the moment it was thrown away
            // cannot be quietly moved by a repeated click.
            Assert.Equal(
                HttpStatusCode.NotFound,
                (await client.DeleteAsync(Entity(universe.Id, entry.Id))).StatusCode);

            var trashed = Assert.Single((await Trash(client, universe.Id)).Items);

            Assert.Equal(
                HttpStatusCode.OK,
                (await client.PostAsync(RestoreRoute(universe.Id, entry.Id), null)).StatusCode);

            // Already live: nothing to restore.
            Assert.Equal(
                HttpStatusCode.NotFound,
                (await client.PostAsync(RestoreRoute(universe.Id, entry.Id), null)).StatusCode);

            Assert.Empty((await Trash(client, universe.Id)).Items);
            _ = trashed;
        }

        // Three rounds later the entry is exactly what it was, and its history never grew.
        Assert.Single(await History(client, universe.Id, entry.Id));
    }

    [Fact]
    public async Task A_name_taken_while_an_entry_sat_in_the_trash_does_not_block_or_rename_it()
    {
        var (client, universe, type) = await World("trname");
        var first = await Create(client, universe.Id, type, "Gatewarden");

        await Trashed(client, universe.Id, first.Id);

        // Entry names are not unique inside a universe, so the author may write the name again
        // and both may stand. The deterministic answer is that a restore never renames and
        // never refuses on a name.
        var second = await Create(client, universe.Id, type, "Gatewarden");
        await Restored(client, universe.Id, first.Id);

        var page = await Page(client, universe.Id, "Gatewarden");

        Assert.Equal(2, page.TotalCount);
        Assert.Equal(
            new[] { first.Id, second.Id }.Order(),
            page.Items.Select(item => item.Id).Order());
        Assert.All(page.Items, item => Assert.Equal("Gatewarden", item.Name));
    }

    // ---------- What comes back with it ----------

    [Fact]
    public async Task Relationships_are_hidden_while_an_end_is_trashed_and_return_intact()
    {
        var (client, universe, type) = await World("trrel");
        var warden = await Create(client, universe.Id, type, "Gatewarden");
        var gate = await Create(client, universe.Id, type, "Northern Gate");

        var relationshipType = await RelationshipType(client, universe.Id, "keeps", "kept by");

        var created = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships",
            new RelationshipRequest(
                relationshipType, warden.Id, gate.Id, CanonStatus.Draft, null, null, "Sworn at the wall."));
        created.EnsureSuccessStatusCode();
        var relationshipId = (await created.Content.ReadFromJsonAsync<RelationshipDetail>())!.Id;

        Assert.Single(await Relationships(client, universe.Id, warden.Id));

        await Trashed(client, universe.Id, gate.Id);

        // The surviving end sees no link, and the stored row is neither editable nor
        // deletable while the other end is in the Trash - so nothing can destroy it there.
        Assert.Empty(await Relationships(client, universe.Id, warden.Id));
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.DeleteAsync($"/api/universes/{universe.Id}/relationships/{relationshipId}")).StatusCode);

        await Restored(client, universe.Id, gate.Id);

        var back = Assert.Single(await Relationships(client, universe.Id, warden.Id));

        Assert.Equal(relationshipId, back.Id);
        Assert.Equal(gate.Id, back.RelatedEntityId);
        Assert.Equal("Sworn at the wall.", back.Notes);
        Assert.Single(await Relationships(client, universe.Id, gate.Id));
    }

    [Fact]
    public async Task Timeline_participation_is_kept_marked_and_survives_an_unrelated_edit()
    {
        var (client, universe, type) = await World("trtime");
        var warden = await Create(client, universe.Id, type, "Gatewarden");
        var herald = await Create(client, universe.Id, type, "Herald");

        var moment = await Moment(client, universe.Id, "The Gate Closes", [warden.Id, herald.Id]);

        await Trashed(client, universe.Id, warden.Id);

        var marked = await Moment(client, universe.Id, moment.Id);
        var trashedLink = marked.Entities.Single(link => link.EntityId == warden.Id);

        // Shown and flagged rather than hidden. The form posts a moment's whole participant
        // set on every save, so dropping it from the response would delete the participation
        // the next time the author touched the date.
        Assert.True(trashedLink.IsTrashed);
        Assert.Equal("Gatewarden", trashedLink.Name);
        Assert.False(marked.Entities.Single(link => link.EntityId == herald.Id).IsTrashed);

        // An unrelated edit, replaying exactly what the client was handed.
        await SaveMoment(client, universe.Id, marked with { Description = "The bar came down." });

        await Restored(client, universe.Id, warden.Id);

        var back = await Moment(client, universe.Id, moment.Id);

        Assert.Equal(
            new[] { herald.Id, warden.Id }.Order(),
            back.Entities.Select(link => link.EntityId).Order());
        Assert.All(back.Entities, link => Assert.False(link.IsTrashed));
        Assert.Equal("The bar came down.", back.Description);
    }

    [Fact]
    public async Task An_entity_reference_is_kept_marked_and_survives_an_unrelated_edit()
    {
        var (client, universe, type) = await World("trref");
        var mentorField = await AddField(
            client, universe.Id, type, "Mentor", EntityFieldKind.EntityReference);

        var mentor = await Create(client, universe.Id, type, "Old Warden");
        var pupil = await Create(
            client,
            universe.Id,
            type,
            "Gatewarden",
            fields: [new FieldValueInput(mentorField.Id, null, null, null, null, null, mentor.Id)]);

        await Trashed(client, universe.Id, mentor.Id);

        var marked = await Detail(client, universe.Id, pupil.Id);
        var reference = marked.Fields.Single(field => field.FieldDefinitionId == mentorField.Id);

        Assert.Equal(mentor.Id, reference.ReferencedEntityId);
        Assert.Equal("Old Warden", reference.ReferencedEntityName);
        Assert.True(reference.ReferencedEntityIsTrashed);

        // The picker never offers it, so a new reference to it cannot be authored...
        Assert.DoesNotContain(
            (await Page(client, universe.Id, string.Empty)).Items,
            item => item.Id == mentor.Id);

        // ...but re-saving the pupil's own form, exactly as the client does, keeps it.
        var saved = await Save(client, universe.Id, marked with { Summary = "Trained at the wall." });

        Assert.Equal(
            mentor.Id,
            saved.Fields.Single(field => field.FieldDefinitionId == mentorField.Id).ReferencedEntityId);

        await Restored(client, universe.Id, mentor.Id);

        var back = await Detail(client, universe.Id, pupil.Id);
        var restored = back.Fields.Single(field => field.FieldDefinitionId == mentorField.Id);

        Assert.Equal(mentor.Id, restored.ReferencedEntityId);
        Assert.False(restored.ReferencedEntityIsTrashed);
    }

    // ---------- Canon Integrity ----------

    [Fact]
    public async Task Trashing_reconciles_the_findings_that_rested_on_the_entry()
    {
        var (client, universe, type) = await World("trcanon");

        // A Canon relationship resting on an Idea: one Medium CANON-REL-001 finding.
        var warden = await Create(client, universe.Id, type, "Gatewarden", CanonStatus.Canon);
        var gate = await Create(client, universe.Id, type, "Northern Gate", CanonStatus.Idea);
        var relationshipType = await RelationshipType(client, universe.Id, "keeps", "kept by");

        (await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationships",
            new RelationshipRequest(
                relationshipType, warden.Id, gate.Id, CanonStatus.Canon, null, null, null)))
            .EnsureSuccessStatusCode();

        var opened = await Conflicts(client, universe.Id);
        Assert.Contains(opened, conflict => conflict.RuleCode == "CANON-REL-001"
            && conflict.Status == CanonConflictStatus.Pending);

        // Removing the offending end reconciles immediately, on the trash write itself: no
        // separate evaluation is needed and no finding is left standing about lore that is
        // no longer in the world.
        await Trashed(client, universe.Id, gate.Id);

        Assert.All(
            (await Conflicts(client, universe.Id)).Where(conflict => conflict.RuleCode == "CANON-REL-001"),
            conflict => Assert.Equal(CanonConflictStatus.Resolved, conflict.Status));

        // And restoring brings the same finding back, by the same fingerprint.
        await Restored(client, universe.Id, gate.Id);

        Assert.Contains(
            await Conflicts(client, universe.Id),
            conflict => conflict.RuleCode == "CANON-REL-001"
                && conflict.Status == CanonConflictStatus.Pending);
    }

    /// <summary>
    /// A universe already carrying a High conflict must still let its author throw lore away.
    ///
    /// The contradictory character has to be planted rather than authored, exactly as
    /// <c>CanonPromotionGateTests</c> plants one: with the gate in place there is no request
    /// that will introduce a High finding, so lore this broken can only be lore promoted
    /// before the gate existed. Only the promotion happens behind the gate's back; the
    /// character itself is written through the API.
    /// </summary>
    [Fact]
    public async Task Trashing_never_introduces_a_high_finding_and_so_is_never_refused()
    {
        var (client, universe, type) = await World("trnohigh");
        var born = await AddField(
            client, universe.Id, type, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);
        var died = await AddField(
            client, universe.Id, type, "Died", EntityFieldKind.Number, EntityFieldSemantic.DeathYear);

        var warden = await Create(
            client,
            universe.Id,
            type,
            "Gatewarden",
            CanonStatus.Draft,
            fields:
            [
                new FieldValueInput(born.Id, null, 300, null, null, null, null),
                new FieldValueInput(died.Id, null, 200, null, null, null, null),
            ]);

        await PromoteBehindTheGate(warden.Id);
        await Evaluate(client, universe.Id);

        Assert.Contains(
            await Conflicts(client, universe.Id),
            conflict => conflict.RuleCode == "CANON-LIFE-001"
                && conflict.Severity == CanonConflictSeverity.High
                && conflict.Status == CanonConflictStatus.Pending);

        // The universe carries a High conflict and trashing is still allowed. Removing lore can
        // only take findings away, so the trash write is reconciled rather than gated and there
        // is nothing for a gate to refuse.
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync(Entity(universe.Id, warden.Id))).StatusCode);

        Assert.All(
            (await Conflicts(client, universe.Id)).Where(
                conflict => conflict.Severity == CanonConflictSeverity.High),
            conflict => Assert.Equal(CanonConflictStatus.Resolved, conflict.Status));

        // Putting it back is the other half: the same High is not in the baseline any more, so
        // the restore is refused and the entry stays exactly where it is.
        var refused = await client.PostAsync(RestoreRoute(universe.Id, warden.Id), null);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(warden.Id, Assert.Single((await Trash(client, universe.Id)).Items).Id);
    }

    [Fact]
    public async Task A_restore_that_would_introduce_a_high_finding_is_refused_atomically()
    {
        var (client, universe, type) = await World("trblocked");
        var born = await AddField(
            client, universe.Id, type, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);

        var warden = await Create(
            client,
            universe.Id,
            type,
            "Gatewarden",
            CanonStatus.Canon,
            summary: "Keeper of the northern gate.",
            fields: [new FieldValueInput(born.Id, null, 300, null, null, null, null)]);

        await Trashed(client, universe.Id, warden.Id);

        // Written while the warden was away: a Canon moment it takes part in, dated a century
        // before it was born. Allowed now, because a trashed entry declares no lifespan.
        var moment = await Moment(
            client, universe.Id, "The First Watch", [warden.Id], CanonStatus.Canon, year: 200);

        Assert.DoesNotContain(
            await Conflicts(client, universe.Id),
            conflict => conflict.Severity == CanonConflictSeverity.High
                && conflict.Status == CanonConflictStatus.Pending);

        var refused = await client.PostAsync(RestoreRoute(universe.Id, warden.Id), null);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);

        var problem = await refused.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.Equal(CanonPromotionGate.BlockedCode, problem!["code"].ToString());

        // Nothing moved. The entry is still in the Trash, still absent from the lore, and the
        // moment written while it was away is untouched: no partial recovery.
        var stillTrashed = Assert.Single((await Trash(client, universe.Id)).Items);
        Assert.Equal(warden.Id, stillTrashed.Id);

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(Entity(universe.Id, warden.Id))).StatusCode);
        Assert.Empty((await Page(client, universe.Id, "Gatewarden")).Items);

        Assert.All(
            await Conflicts(client, universe.Id),
            conflict => Assert.NotEqual(CanonConflictSeverity.High, conflict.Severity));

        // And once the objection is dealt with, the same restore goes through untouched.
        await SaveMoment(client, universe.Id, (await Moment(client, universe.Id, moment.Id)) with
        {
            CanonStatus = CanonStatus.Draft,
        });

        await Restored(client, universe.Id, warden.Id);

        var back = await Detail(client, universe.Id, warden.Id);
        Assert.Equal("Keeper of the northern gate.", back.Summary);
        Assert.Equal(300, back.Fields.Single(field => field.FieldDefinitionId == born.Id).Number);
    }

    // ---------- What a type deletion has to notice ----------

    [Fact]
    public async Task A_type_still_used_only_by_a_trashed_entry_cannot_be_deleted()
    {
        var (client, universe, _) = await World("trtype");

        var created = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Relic", null, null, null, null));
        created.EnsureSuccessStatusCode();
        var relic = (await created.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Id;

        var entry = await Create(client, universe.Id, relic, "The Grey Key");
        await Trashed(client, universe.Id, entry.Id);

        var refused = await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{relic}");

        // The foreign key is Restrict precisely so a type cannot be pulled out from under lore
        // that is still restorable. The wording has to say the Trash counts, or the author is
        // told to move something they cannot see.
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Contains("Trash", await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // And the entry it was protecting still restores whole.
        await Restored(client, universe.Id, entry.Id);
        Assert.Equal("The Grey Key", (await Detail(client, universe.Id, entry.Id)).Name);
    }

    [Fact]
    public async Task A_tag_worn_only_by_a_trashed_entry_is_counted_as_empty()
    {
        var (client, universe, type) = await World("trtag");
        var entry = await Create(client, universe.Id, type, "Gatewarden", tags: ["gates"]);

        await Trashed(client, universe.Id, entry.Id);

        var tags = (await client.GetFromJsonAsync<List<TagResponse>>(
            $"/api/universes/{universe.Id}/tags"))!;

        // The tag list is the browse filter, so a count that promised an entry the filter
        // would not then return would be a lie about the Trash.
        Assert.Equal(0, tags.Single(tag => tag.Name == "gates").EntityCount);

        await Restored(client, universe.Id, entry.Id);

        tags = (await client.GetFromJsonAsync<List<TagResponse>>(
            $"/api/universes/{universe.Id}/tags"))!;

        Assert.Equal(1, tags.Single(tag => tag.Name == "gates").EntityCount);
    }

    // ---------- Routes ----------

    private static string TrashRoute(Guid universeId) => $"/api/universes/{universeId}/trash";

    private static string RestoreRoute(Guid universeId, Guid entityId) =>
        $"{TrashRoute(universeId)}/{entityId}/restore";

    private static string Entity(Guid universeId, Guid entityId) =>
        $"/api/universes/{universeId}/entities/{entityId}";

    // ---------- Reading ----------

    private static async Task<TrashPage> Trash(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<TrashPage>(TrashRoute(universeId)))!;

    private static async Task<EntityPage> Page(
        HttpClient client,
        Guid universeId,
        string search,
        bool includeArchived = false)
    {
        var query = $"?page=1&pageSize=50&includeArchived={includeArchived}";
        if (search.Length > 0)
        {
            query += $"&search={Uri.EscapeDataString(search)}";
        }

        return (await client.GetFromJsonAsync<EntityPage>(
            $"/api/universes/{universeId}/entities{query}"))!;
    }

    private static async Task<EntityDetail> Detail(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>(Entity(universeId, entityId)))!;

    private static async Task<List<EntityRevisionSummary>> History(
        HttpClient client,
        Guid universeId,
        Guid entityId) =>
        (await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"{Entity(universeId, entityId)}/revisions"))!;

    private static async Task<List<RelationshipView>> Relationships(
        HttpClient client,
        Guid universeId,
        Guid entityId) =>
        (await client.GetFromJsonAsync<List<RelationshipView>>(
            $"{Entity(universeId, entityId)}/relationships"))!;

    private static async Task Evaluate(HttpClient client, Guid universeId) =>
        (await client.PostAsync($"/api/universes/{universeId}/canon-conflicts/evaluate", content: null))
            .EnsureSuccessStatusCode();

    private static async Task<List<CanonConflictResponse>> Conflicts(HttpClient client, Guid universeId)
    {
        var page = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universeId}/canon-conflicts?page=1&pageSize=50"))!;
        return [.. page.Items];
    }

    // ---------- Writing ----------

    private static async Task Trashed(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.DeleteAsync(Entity(universeId, entityId))).EnsureSuccessStatusCode();

    private static async Task<EntityDetail> Restored(HttpClient client, Guid universeId, Guid entityId)
    {
        var response = await client.PostAsync(RestoreRoute(universeId, entityId), null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<EntityDetail> Create(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        CanonStatus canonStatus = CanonStatus.Idea,
        string? summary = null,
        IReadOnlyList<string>? aliases = null,
        IReadOnlyList<string>? tags = null,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, summary, canonStatus, aliases, tags, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    /// <summary>Re-saves an entry from its own detail, which is what the client does.</summary>
    private static async Task<EntityDetail> Save(HttpClient client, Guid universeId, EntityDetail entity)
    {
        var response = await client.PutVersionedAsync(
            Entity(universeId, entity.Id),
            new EntityRequest(
                entity.EntityTypeId,
                entity.Name,
                entity.Summary,
                entity.CanonStatus,
                entity.Aliases,
                entity.Tags,
                [.. entity.Fields.Select(field => new FieldValueInput(
                    field.FieldDefinitionId,
                    field.Text,
                    field.Number,
                    field.Boolean,
                    field.Date,
                    field.OptionIds,
                    field.ReferencedEntityId))]));

        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<TimelineEntryResponse> Moment(
        HttpClient client,
        Guid universeId,
        string title,
        IReadOnlyList<Guid> participants,
        CanonStatus canonStatus = CanonStatus.Idea,
        int year = 400)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/timeline",
            new TimelineEntryRequest(
                title, null, canonStatus, TimelineDateKind.Exact,
                year, null, null, null, null, null, null, participants));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;
    }

    private static async Task<TimelineEntryResponse> Moment(
        HttpClient client,
        Guid universeId,
        Guid entryId) =>
        (await client.GetFromJsonAsync<TimelineEntryResponse>(
            $"/api/universes/{universeId}/timeline/{entryId}"))!;

    /// <summary>Replays a moment from its own response, which is what the form does.</summary>
    private static async Task SaveMoment(
        HttpClient client,
        Guid universeId,
        TimelineEntryResponse entry)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/timeline/{entry.Id}",
            new TimelineEntryRequest(
                entry.Title,
                entry.Description,
                entry.CanonStatus,
                entry.Date.Kind,
                entry.Date.StartYear,
                entry.Date.StartMonth,
                entry.Date.StartDay,
                entry.Date.EndYear,
                entry.Date.EndMonth,
                entry.Date.EndDay,
                entry.Date.EraLabel,
                [.. entry.Entities.Select(link => link.EntityId)]));

        response.EnsureSuccessStatusCode();
    }

    private static async Task<Guid> RelationshipType(
        HttpClient client,
        Guid universeId,
        string name,
        string inverseName)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest(name, inverseName, false, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!.Id;
    }

    private static async Task<FieldDefinitionResponse> AddField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        EntityFieldKind kind,
        EntityFieldSemantic? semantic = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, kind, false, null, null, null, semantic));
        response.EnsureSuccessStatusCode();

        var type = (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
        return type.Fields.First(field => field.Name == name);
    }

    // ---------- Setup ----------

    /// <summary>
    /// Promotes an entry to Canon straight against the database. The one thing here that does
    /// not go through the API, and only ever used to stand in for lore promoted before the
    /// promotion gate existed - see <c>CanonPromotionGateTests</c>, which plants one the same
    /// way and for the same reason.
    /// </summary>
    private async Task PromoteBehindTheGate(Guid entityId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        var stored = await db.Entities.FirstAsync(candidate => candidate.Id == entityId);
        stored.CanonStatus = CanonStatus.Canon;
        await db.SaveChangesAsync();
    }

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<Guid> CharacterType(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        return types.First(type => type.Name == "Character").Id;
    }

    private async Task<(HttpClient Client, UniverseDetail Universe, Guid CharacterTypeId)> World(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        var universe = await CreateUniverse(client, $"World {tag}");
        return (client, universe, await CharacterType(client, universe.Id));
    }
}
