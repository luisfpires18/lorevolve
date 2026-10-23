using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.RuleValidation;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RuleValidationTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A moment's structured details for world rule checks (ADR 0034): optional part by part, stored by id, never taken from the
/// moment's words or its linked entries, of this universe only - and changing nothing about the moment's date, order or cast.
/// </summary>
public sealed class TimelineValidationDetailsTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task An_ordinary_moment_needs_no_details_and_carries_none()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "tvdplain");

        var moment = await CreateMoment(client, universe.Id, Moment("The founding", null));

        Assert.Null(moment.Validation);
        Assert.Null((await ReadMoment(client, universe.Id, moment.Id)).Validation);
        await WithDb(_factory, async db => Assert.False(await db.TimelineEntryValidations.AnyAsync(details => details.TimelineEntryId == moment.Id)));
    }

    [Fact]
    public async Task Each_part_is_optional_and_kept_by_id_with_the_names_to_show()
    {
        var world = await NewCheckedWorld(_factory, "tvdparts");
        var client = world.Client;
        var u = world.Universe;

        var onlyKind = await CreateMoment(client, u, Moment("Something returned", Details(world.Resurrection, null, null)));
        Assert.Equal(("Resurrection", null, null), (onlyKind.Validation!.EventKind?.Name, onlyKind.Validation.Method, onlyKind.Validation.Participant));

        var whole = await UpdateMoment(client, u, onlyKind.Id, Moment("Something returned", Details(world.Resurrection, world.SevenStones, world.Mira)));
        Assert.Equal((world.Resurrection, world.SevenStones, world.Mira), (whole.Validation!.EventKind!.Id, whole.Validation.Method!.Id, whole.Validation.Participant!.EntityId));
        Assert.Equal(("Seven Stones", "Mira", false), (whole.Validation.Method.Name, whole.Validation.Participant.Name, whole.Validation.Participant.IsTrashed));

        var listed = (await client.GetFromJsonAsync<Lorex.Api.Features.Timeline.TimelineEntryPage>(Timeline(u)))!.Items.Single();
        Assert.Equal(whole.Validation, listed.Validation);
    }

    [Fact]
    public async Task A_save_leaving_the_details_out_keeps_them_and_one_with_no_part_removes_them()
    {
        var world = await NewCheckedWorld(_factory, "tvdkeep");
        var client = world.Client;
        var u = world.Universe;
        var moment = await world.Occurrence("A return", world.Arlen);

        var kept = await UpdateMoment(client, u, moment.Id, Moment("A return, retitled", null));
        Assert.Equal(world.Arlen, kept.Validation!.Participant!.EntityId);

        var cleared = await UpdateMoment(client, u, moment.Id, Moment("A return, retitled", Details(null, null, null)));
        Assert.Null(cleared.Validation);
        await WithDb(_factory, async db => Assert.False(await db.TimelineEntryValidations.AnyAsync(details => details.TimelineEntryId == moment.Id)));
    }

    [Fact]
    public async Task The_participant_is_chosen_on_its_own_from_this_universe_and_never_taken_from_the_linked_entries()
    {
        var world = await NewCheckedWorld(_factory, "tvdparticipant");
        var client = world.Client;
        var u = world.Universe;

        var linked = await CreateMoment(client, u, Moment("Arlen returns", Details(world.Resurrection, world.RiteOfAsh, null), linked: [world.Arlen]));
        Assert.Null(linked.Validation!.Participant);
        Assert.Equal([world.Arlen], linked.Entities.Select(link => link.EntityId));

        var elsewhere = await CreateUniverse(client, "World tvdparticipant elsewhere");
        var stranger = await CreateEntity(client, elsewhere.Id, "Stranger");

        var foreign = await Errors(await TryCreateMoment(client, u, Moment("Wrong world", Details(null, null, stranger))));
        var guessed = await Errors(await TryCreateMoment(client, u, Moment("Wrong world", Details(null, null, Guid.NewGuid()))));
        Assert.Contains(RuleValidationInput.ParticipantKey, foreign, StringComparison.Ordinal);
        Assert.Equal(foreign, guessed);
    }

    [Fact]
    public async Task Terms_must_be_of_this_universe_and_of_the_kind_they_stand_for()
    {
        var world = await NewCheckedWorld(_factory, "tvdterms");
        var client = world.Client;
        var u = world.Universe;
        var elsewhere = await CreateUniverse(client, "World tvdterms elsewhere");
        var foreignKind = await EventKind(client, elsewhere.Id, "Resurrection");

        var swapped = await Errors(await TryCreateMoment(client, u, Moment("Swapped", Details(world.RiteOfAsh, world.Resurrection, null))));
        Assert.Contains(RuleValidationInput.EventKindKey, swapped, StringComparison.Ordinal);
        Assert.Contains(RuleValidationInput.MethodKey, swapped, StringComparison.Ordinal);

        Assert.Contains(RuleValidationInput.EventKindKey, await Errors(await TryCreateMoment(client, u, Moment("Foreign", Details(foreignKind.Id, null, null)))), StringComparison.Ordinal);

        // A refused save leaves no moment behind.
        Assert.Empty((await client.GetFromJsonAsync<Lorex.Api.Features.Timeline.TimelineEntryPage>(Timeline(u)))!.Items);
    }

    [Fact]
    public async Task A_participant_in_the_Trash_is_kept_through_other_edits_but_never_newly_chosen()
    {
        var world = await NewCheckedWorld(_factory, "tvdtrash");
        var client = world.Client;
        var u = world.Universe;
        var moment = await world.Occurrence("Arlen returns", world.Arlen);

        await TrashEntity(client, u, world.Arlen);

        var edited = await UpdateMoment(client, u, moment.Id, Moment("Arlen returns, again", Details(world.Resurrection, world.RiteOfAsh, world.Arlen)));
        Assert.Equal((world.Arlen, true), (edited.Validation!.Participant!.EntityId, edited.Validation.Participant.IsTrashed));

        var fresh = await Errors(await TryCreateMoment(client, u, Moment("Arlen returns elsewhere", Details(world.Resurrection, world.RiteOfAsh, world.Arlen))));
        Assert.Contains("in the Trash", fresh, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Details_change_nothing_about_the_date_the_order_the_cast_or_the_status()
    {
        var world = await NewCheckedWorld(_factory, "tvdchronology");
        var client = world.Client;
        var u = world.Universe;

        var early = await CreateMoment(client, u, Moment("Early", null, CanonStatus.Draft, [world.Mira], year: -40));
        var late = await CreateMoment(client, u, Moment("Late", null, CanonStatus.Idea, [world.Arlen], year: 300));

        var described = await UpdateMoment(client, u, early.Id, Moment("Early", Details(world.Resurrection, world.SevenStones, world.Arlen), CanonStatus.Draft, [world.Mira], year: -40));

        Assert.Equal(early.Date, described.Date);
        Assert.Equal(early.Entities, described.Entities);
        Assert.Equal(CanonStatus.Draft, described.CanonStatus);
        var order = (await client.GetFromJsonAsync<Lorex.Api.Features.Timeline.TimelineEntryPage>(Timeline(u)))!.Items.Select(item => item.Id);
        Assert.Equal([early.Id, late.Id], order);
    }

    [Fact]
    public async Task Deleting_a_moment_keeps_its_details_in_the_Trash_and_erasing_it_takes_them_and_leaves_the_terms_and_the_participant()
    {
        var world = await NewCheckedWorld(_factory, "tvddelete");
        var moment = await world.Occurrence("A return", world.Arlen);

        await DeleteMoment(world.Client, world.Universe, moment.Id);

        // In the Trash (ADR 0048): the moment and its details are kept, to come back whole.
        await WithDb(_factory, async db =>
        {
            Assert.True(await db.TimelineEntries.AnyAsync(entry => entry.Id == moment.Id && entry.DeletedAt != null));
            Assert.True(await db.TimelineEntryValidations.AnyAsync(details => details.TimelineEntryId == moment.Id));
        });

        (await world.Client.DeleteAsync($"/api/universes/{world.Universe}/trash/timeline/{moment.Id}")).EnsureSuccessStatusCode();

        await WithDb(_factory, async db =>
        {
            Assert.False(await db.TimelineEntryValidations.AnyAsync(details => details.TimelineEntryId == moment.Id));
            Assert.True(await db.ValidationTerms.AnyAsync(term => term.Id == world.RiteOfAsh));
            Assert.True(await db.Entities.AnyAsync(entity => entity.Id == world.Arlen && entity.DeletedAt == null));
        });
    }

    [Fact]
    public async Task Another_account_can_neither_read_nor_write_a_moments_details()
    {
        var world = await NewCheckedWorld(_factory, "tvdowner");
        var other = await SignedIn(_factory, "user-tvdowner-other");
        var moment = await world.Occurrence("A return", world.Arlen);

        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"{Timeline(world.Universe)}/{moment.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await TryUpdateMoment(other, world.Universe, moment.Id, Moment("Taken", Details(null, null, null)))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await TryCreateMoment(other, world.Universe, Moment("Planted", Details(world.Resurrection, world.RiteOfAsh, world.Arlen)))).StatusCode);

        Assert.Equal(world.Arlen, (await ReadMoment(world.Client, world.Universe, moment.Id)).Validation!.Participant!.EntityId);
        Assert.Empty(await world.Findings());
    }
}
