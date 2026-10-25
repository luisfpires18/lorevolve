using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Trash;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.FamilyTreeTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;
using static Lorex.Api.Tests.RuleValidationTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Removing a relationship or a timeline moment moves it to the Trash (ADR 0048, Issue #45): it is read nowhere while it is
/// there, it comes back exactly as it was, a restore waits for an entry in the Trash and refuses a link made again meanwhile,
/// only the owner erases it for good, and a backup carries it marked. Credentials are obviously synthetic.
/// </summary>
public sealed class RelationshipTimelineTrashTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private static string TrashOf(Guid universeId) => $"/api/universes/{universeId}/trash";

    [Fact]
    public async Task A_removed_relationship_waits_in_the_Trash_unseen_and_comes_back_whole()
    {
        var family = await NewFamily(_factory, "rtt-link");
        var bore = await Kind(family, "bore", Lorex.Api.Features.Relationships.RelationshipFamilySemantic.BiologicalParent);
        var mara = await Person(family, "Mara");
        var lia = await Person(family, "Lia");
        var link = await PostJson<RelationshipDetail>(
            family.Client,
            $"/api/universes/{family.Universe}/relationships",
            new RelationshipRequest(bore.Id, mara, lia, CanonStatus.Draft, new DateTime(1200, 1, 1, 0, 0, 0, DateTimeKind.Utc), null, "Kept notes."));

        await Unlink(family, link.Id);

        // Read nowhere: the entry, the link itself, and the family tree.
        Assert.Empty(await ListFor(family, mara));
        Assert.Equal(HttpStatusCode.NotFound, (await family.Client.GetAsync($"/api/universes/{family.Universe}/relationships/{link.Id}")).StatusCode);
        Assert.DoesNotContain(await TreeText(family, lia), "Mara");

        // Listed in the Trash, read whole, waiting for nothing.
        var row = Assert.Single((await family.Client.GetFromJsonAsync<TrashPage>(TrashOf(family.Universe)))!.Items);
        Assert.Equal((TrashItemKind.Relationship, link.Id, "Mara bore Lia", TrashRestoreBlock.None, mara), (row.Kind, row.Id, row.Name, row.BlockedBy, row.EntryId));

        // Its own edits and a second removal answer as missing.
        Assert.Equal(HttpStatusCode.NotFound, (await family.Client.DeleteAsync($"/api/universes/{family.Universe}/relationships/{link.Id}")).StatusCode);

        var restored = await PostJson<RelationshipDetail>(family.Client, $"{TrashOf(family.Universe)}/relationships/{link.Id}/restore", new { });
        Assert.Equal((link.Id, link.StartDate, "Kept notes.", CanonStatus.Draft), (restored.Id, restored.StartDate, restored.Notes, restored.CanonStatus));
        Assert.Single(await ListFor(family, mara));
        Assert.Contains("Mara", await TreeText(family, lia));
        Assert.Empty((await family.Client.GetFromJsonAsync<TrashPage>(TrashOf(family.Universe)))!.Items);
    }

    [Fact]
    public async Task A_relationship_waits_for_its_entry_and_never_restores_over_the_same_link_made_again()
    {
        var family = await NewFamily(_factory, "rtt-block");
        var rules = await Kind(family, "rules");
        var arin = await Person(family, "Arin");
        var varn = await Person(family, "Varn");
        var first = await Link(family, rules, arin, varn);

        await Unlink(family, first);
        await Trash(family, varn);

        var row = Assert.Single(
            (await family.Client.GetFromJsonAsync<TrashPage>(TrashOf(family.Universe)))!.Items,
            item => item.Kind == TrashItemKind.Relationship);
        Assert.Equal(TrashRestoreBlock.EntryInTrash, row.BlockedBy);

        var blocked = await family.Client.PostAsync($"{TrashOf(family.Universe)}/relationships/{first}/restore", null);
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Equal(RelationshipEndpoints.EndInTrashCode, await Code(blocked));

        // The entry comes back; meanwhile the author made the same link again. The old one is never laid over it.
        await Restore(family, varn);
        var again = await Link(family, rules, arin, varn);

        var duplicate = await family.Client.PostAsync($"{TrashOf(family.Universe)}/relationships/{first}/restore", null);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal(RelationshipEndpoints.DuplicateCode, await Code(duplicate));
        Assert.Equal([again], (await ListFor(family, arin)).Select(view => view.Id));
    }

    [Fact]
    public async Task A_removed_moment_leaves_every_timeline_and_comes_back_with_its_cast_and_stories()
    {
        var family = await NewFamily(_factory, "rtt-moment");
        var mara = await Person(family, "Mara");
        var story = await CreateStory(family.Client, family.Universe, "The flood");
        var moment = await CreateMoment(
            family.Client,
            family.Universe,
            Moment("The waters rise", null, CanonStatus.Draft, [mara]) with { StoryIds = [story] });

        await DeleteMoment(family.Client, family.Universe, moment.Id);

        var timeline = $"/api/universes/{family.Universe}/timeline";
        Assert.Equal(0, (await family.Client.GetFromJsonAsync<TimelineEntryPage>(timeline))!.TotalCount);
        Assert.Equal(0, (await family.Client.GetFromJsonAsync<TimelineItemPage>($"{timeline}/items"))!.TotalCount);
        Assert.Equal(HttpStatusCode.NotFound, (await family.Client.GetAsync($"{timeline}/{moment.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await family.Client.PutAsJsonAsync($"{timeline}/{moment.Id}", Moment("Edited", null))).StatusCode);

        var row = Assert.Single((await family.Client.GetFromJsonAsync<TrashPage>(TrashOf(family.Universe)))!.Items);
        Assert.Equal((TrashItemKind.TimelineEvent, "The waters rise", CanonStatus.Draft), (row.Kind, row.Name, row.CanonStatus));

        var back = await PostJson<TimelineEntryResponse>(family.Client, $"{TrashOf(family.Universe)}/timeline/{moment.Id}/restore", new { });
        Assert.Equal([mara], back.Entities.Select(entity => entity.EntityId));
        Assert.Equal([story], back.Stories!.Select(link => link.StoryId));
        Assert.Equal(1, (await family.Client.GetFromJsonAsync<TimelineEntryPage>(timeline))!.TotalCount);
    }

    [Fact]
    public async Task A_relationship_in_the_Trash_is_in_no_Canon_rule_and_restoring_it_finds_again()
    {
        var family = await NewFamily(_factory, "rtt-canon");
        var rules = await Kind(family, "rules");
        var arin = await Person(family, "Arin");
        var draft = await Person(family, "Varn", CanonStatus.Draft);
        var link = await Link(family, rules, arin, draft, CanonStatus.Canon);

        // CANON-REL-001: a Canon link resting on a draft entry.
        Assert.Contains(await Open(family), finding => finding == "CANON-REL-001");

        await Unlink(family, link);
        Assert.DoesNotContain(await Open(family), finding => finding == "CANON-REL-001");

        (await family.Client.PostAsync($"{TrashOf(family.Universe)}/relationships/{link}/restore", null)).EnsureSuccessStatusCode();
        Assert.Contains(await Open(family), finding => finding == "CANON-REL-001");
    }

    [Fact]
    public async Task Only_the_owner_erases_a_link_or_a_moment_for_good_and_a_live_one_is_never_erased()
    {
        var family = await NewFamily(_factory, "rtt-erase");
        var rules = await Kind(family, "rules");
        var link = await Link(family, rules, await Person(family, "Arin"), await Person(family, "Varn"));
        var moment = await CreateMoment(family.Client, family.Universe, Moment("A coronation", null));

        // Live: not in the Trash, so there is nothing to erase.
        Assert.Equal(HttpStatusCode.NotFound, (await family.Client.DeleteAsync($"{TrashOf(family.Universe)}/relationships/{link}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await family.Client.DeleteAsync($"{TrashOf(family.Universe)}/timeline/{moment.Id}")).StatusCode);

        await Unlink(family, link);
        await DeleteMoment(family.Client, family.Universe, moment.Id);

        var erased = await family.Client.PostAsJsonAsync($"{TrashOf(family.Universe)}/bulk-delete", new BulkTrashDeleteRequest(
        [
            new TrashSelection(TrashItemKind.Relationship, link),
            new TrashSelection(TrashItemKind.TimelineEvent, moment.Id),
        ]));
        erased.EnsureSuccessStatusCode();

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.Relationships.AnyAsync(row => row.Id == link));
            Assert.False(await db.TimelineEntries.AnyAsync(row => row.Id == moment.Id));
        });
    }

    [Fact]
    public async Task A_backup_carries_a_trashed_link_and_moment_marked_and_a_restore_puts_them_back_in_the_Trash()
    {
        var family = await NewFamily(_factory, "rtt-backup");
        var rules = await Kind(family, "rules");
        var arin = await Person(family, "Arin");
        var varn = await Person(family, "Varn");
        var kept = await Link(family, rules, arin, varn);
        var gone = await Link(family, await Kind(family, "fears"), arin, varn);
        var moment = await CreateMoment(family.Client, family.Universe, Moment("A forgotten flood", null));
        await CreateMoment(family.Client, family.Universe, Moment("A remembered flood", null));

        await Unlink(family, gone);
        await DeleteMoment(family.Client, family.Universe, moment.Id);

        var archive = await RawArchive(family.Client, family.Universe);
        var payload = BackupOf(archive).Payload;
        Assert.Equal(Lorex.Api.Features.Export.UniverseBackup.CurrentVersion, BackupOf(archive).FormatVersion);
        Assert.NotNull(payload.Relationships.Single(row => row.Id == gone).DeletedAt);
        Assert.Null(payload.Relationships.Single(row => row.Id == kept).DeletedAt);
        Assert.NotNull(payload.TimelineEntries.Single(row => row.Id == moment.Id).DeletedAt);

        var restored = await RestoreArchive(family.Client, archive, "Restored rtt");
        var trash = (await family.Client.GetFromJsonAsync<TrashPage>(TrashOf(restored.Id)))!.Items;
        Assert.Equal(
            [(TrashItemKind.Relationship, "Arin fears Varn"), (TrashItemKind.TimelineEvent, "A forgotten flood")],
            trash.Select(item => (item.Kind, item.Name)).OrderBy(item => item.Kind));
        Assert.Equal(1, (await family.Client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{restored.Id}/timeline"))!.TotalCount);

        // Restorable from the restored Trash, as from the original's.
        var link = trash.Single(item => item.Kind == TrashItemKind.Relationship);
        (await family.Client.PostAsync($"{TrashOf(restored.Id)}/relationships/{link.Id}/restore", null)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task A_version_25_file_restores_every_link_and_moment_live_even_if_it_says_otherwise()
    {
        var family = await NewFamily(_factory, "rtt-v25");
        var link = await Link(family, await Kind(family, "rules"), await Person(family, "Arin"), await Person(family, "Varn"));
        var moment = await CreateMoment(family.Client, family.Universe, Moment("A flood", null));
        await Unlink(family, link);
        await DeleteMoment(family.Client, family.Universe, moment.Id);

        // The same file as version 25 wrote it: a version 25 writer never set these, so a reader takes them as live.
        var archive = Rewrite(await RawArchive(family.Client, family.Universe), root => root["formatVersion"] = 25);
        var restored = await RestoreArchive(family.Client, archive, "Restored rtt v25");

        Assert.Empty((await family.Client.GetFromJsonAsync<TrashPage>(TrashOf(restored.Id)))!.Items);
        Assert.Equal(1, (await family.Client.GetFromJsonAsync<TimelineEntryPage>($"/api/universes/{restored.Id}/timeline"))!.TotalCount);
    }

    private static async Task<List<RelationshipView>> ListFor(Family family, Guid entityId) =>
        (await family.Client.GetFromJsonAsync<List<RelationshipView>>($"/api/universes/{family.Universe}/entities/{entityId}/relationships"))!;

    private static async Task<List<string>> Open(Family family)
    {
        (await family.Client.PostAsync($"/api/universes/{family.Universe}/canon-conflicts/evaluate", null)).EnsureSuccessStatusCode();
        var page = await family.Client.GetFromJsonAsync<JsonElement>($"/api/universes/{family.Universe}/canon-conflicts?pageSize=100&status=0");
        return [.. page.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("ruleCode").GetString()!)];
    }

    private static async Task<string?> Code(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).TryGetProperty("code", out var code) ? code.GetString() : null;
}
