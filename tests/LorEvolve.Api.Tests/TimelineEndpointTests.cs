using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Timeline entries: the four date kinds, the participation join, and the invariant that
/// matters most, that nothing resolves outside the caller's own universe. Credentials here
/// are obviously synthetic.
/// </summary>
public sealed class TimelineEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Date kinds ----------

    [Fact]
    public async Task An_exact_date_keeps_its_year_month_and_day()
    {
        var (client, universe) = await SignedInWithUniverse("tlexact");

        var entry = await Create(client, universe.Id, Exact("Frodo leaves the Shire", 3018, 9, 23));

        Assert.Equal(TimelineDateKind.Exact, entry.Date.Kind);
        Assert.Equal(3018, entry.Date.StartYear);
        Assert.Equal(9, entry.Date.StartMonth);
        Assert.Equal(23, entry.Date.StartDay);
        Assert.Null(entry.Date.EndYear);
        Assert.Equal(TimelineDatePrecision.Day, entry.Date.StartPrecision);
        Assert.Equal(TimelineDatePrecision.None, entry.Date.EndPrecision);
    }

    [Fact]
    public async Task An_approximate_date_carries_a_start_and_no_end()
    {
        var (client, universe) = await SignedInWithUniverse("tlapprox");

        var entry = await Create(
            client,
            universe.Id,
            Request("The Shire is settled", TimelineDateKind.Approximate, startYear: 1601));

        Assert.Equal(TimelineDateKind.Approximate, entry.Date.Kind);
        Assert.Equal(1601, entry.Date.StartYear);
        Assert.Null(entry.Date.EndYear);
        Assert.Equal(TimelineDatePrecision.Year, entry.Date.StartPrecision);
    }

    [Fact]
    public async Task A_range_keeps_both_ends()
    {
        var (client, universe) = await SignedInWithUniverse("tlrange");

        var entry = await Create(
            client,
            universe.Id,
            Request(
                "The War of the Ring",
                TimelineDateKind.Range,
                startYear: 3018,
                startMonth: 6,
                endYear: 3019,
                endMonth: 3));

        Assert.Equal(TimelineDateKind.Range, entry.Date.Kind);
        Assert.Equal(3018, entry.Date.StartYear);
        Assert.Equal(6, entry.Date.StartMonth);
        Assert.Equal(3019, entry.Date.EndYear);
        Assert.Equal(3, entry.Date.EndMonth);
        Assert.Equal(TimelineDatePrecision.Month, entry.Date.EndPrecision);
    }

    [Fact]
    public async Task An_unknown_date_carries_no_components_at_all()
    {
        var (client, universe) = await SignedInWithUniverse("tlunknown");

        var entry = await Create(
            client,
            universe.Id,
            Request("Something happened, once", TimelineDateKind.Unknown));

        Assert.Equal(TimelineDateKind.Unknown, entry.Date.Kind);
        Assert.Null(entry.Date.StartYear);
        Assert.Null(entry.Date.StartMonth);
        Assert.Null(entry.Date.StartDay);
        Assert.Equal(TimelineDatePrecision.None, entry.Date.StartPrecision);
    }

    [Fact]
    public async Task A_year_on_its_own_is_a_complete_date()
    {
        var (client, universe) = await SignedInWithUniverse("tlyearonly");

        var entry = await Create(
            client,
            universe.Id,
            Request("The Third Age begins", TimelineDateKind.Exact, startYear: 1));

        Assert.Equal(1, entry.Date.StartYear);
        Assert.Null(entry.Date.StartMonth);
        Assert.Null(entry.Date.StartDay);
        Assert.Equal(TimelineDatePrecision.Year, entry.Date.StartPrecision);
    }

    [Fact]
    public async Task A_year_and_month_without_a_day_is_a_complete_date()
    {
        var (client, universe) = await SignedInWithUniverse("tlyearmonth");

        var entry = await Create(
            client,
            universe.Id,
            Request("Winter closes in", TimelineDateKind.Exact, startYear: 3018, startMonth: 12));

        Assert.Equal(12, entry.Date.StartMonth);
        Assert.Null(entry.Date.StartDay);
        Assert.Equal(TimelineDatePrecision.Month, entry.Date.StartPrecision);
    }

    [Fact]
    public async Task A_year_may_be_negative_so_a_calendar_can_count_down_to_its_own_zero()
    {
        var (client, universe) = await SignedInWithUniverse("tlnegative");

        var entry = await Create(
            client,
            universe.Id,
            Request("Before the reckoning", TimelineDateKind.Exact, startYear: -4200));

        Assert.Equal(-4200, entry.Date.StartYear);
    }

    [Fact]
    public async Task An_era_label_is_stored_as_written()
    {
        var (client, universe) = await SignedInWithUniverse("tlera");

        var entry = await Create(
            client,
            universe.Id,
            Request("The Last Alliance", TimelineDateKind.Exact, startYear: 3441, eraLabel: "Second Age"));

        Assert.Equal("Second Age", entry.Date.EraLabel);
    }

    // ---------- Refused dates ----------

    [Fact]
    public async Task A_range_that_ends_before_it_starts_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("tlbadrange");

        var response = await Post(
            client,
            universe.Id,
            Request("Backwards", TimelineDateKind.Range, startYear: 3019, endYear: 3018));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_range_that_ends_earlier_in_the_same_year_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("tlbadrangemonth");

        var response = await Post(
            client,
            universe.Id,
            Request(
                "Backwards within a year",
                TimelineDateKind.Range,
                startYear: 3018,
                startMonth: 9,
                endYear: 3018,
                endMonth: 3));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_range_ending_in_the_same_month_it_starts_is_allowed()
    {
        var (client, universe) = await SignedInWithUniverse("tlsamemonth");

        var entry = await Create(
            client,
            universe.Id,
            Request(
                "A short siege",
                TimelineDateKind.Range,
                startYear: 3019,
                startMonth: 3,
                endYear: 3019,
                endMonth: 3));

        Assert.Equal(3019, entry.Date.EndYear);
    }

    [Fact]
    public async Task A_range_without_an_end_year_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("tlrangenoend");

        var response = await Post(
            client,
            universe.Id,
            Request("Unfinished span", TimelineDateKind.Range, startYear: 3018));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_exact_date_with_an_end_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("tlexactend");

        var response = await Post(
            client,
            universe.Id,
            Request("Not a span", TimelineDateKind.Exact, startYear: 3018, endYear: 3019));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_exact_date_without_a_year_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("tlexactnoyear");

        var response = await Post(client, universe.Id, Request("When?", TimelineDateKind.Exact));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_date_carrying_a_year_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("tlunknownyear");

        var response = await Post(
            client,
            universe.Id,
            Request("Contradiction", TimelineDateKind.Unknown, startYear: 3018));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_day_without_a_month_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("tldaynomonth");

        var response = await Post(
            client,
            universe.Id,
            Request("The 23rd of nothing", TimelineDateKind.Exact, startYear: 3018, startDay: 23));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_month_outside_one_to_twelve_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("tlbadmonth");

        var response = await Post(
            client,
            universe.Id,
            Request("Thirteenth month", TimelineDateKind.Exact, startYear: 3018, startMonth: 13));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_entry_without_a_title_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("tlnotitle");

        var response = await Post(
            client,
            universe.Id,
            Request("   ", TimelineDateKind.Exact, startYear: 3018));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---------- Status and participants ----------

    [Fact]
    public async Task The_canon_status_survives_a_round_trip()
    {
        var (client, universe) = await SignedInWithUniverse("tlcanon");

        var created = await Create(
            client,
            universe.Id,
            Request("Canonical", TimelineDateKind.Exact, startYear: 3018, canonStatus: CanonStatus.Canon));

        var read = await Get(client, universe.Id, created.Id);

        Assert.Equal(CanonStatus.Canon, created.CanonStatus);
        Assert.Equal(CanonStatus.Canon, read.CanonStatus);
    }

    [Fact]
    public async Task An_entry_needs_no_entities_at_all()
    {
        var (client, universe) = await SignedInWithUniverse("tlnolinks");

        var entry = await Create(client, universe.Id, Exact("A quiet year", 3018));

        Assert.Empty(entry.Entities);
    }

    [Fact]
    public async Task A_linked_entity_is_stored_and_read_back_resolved()
    {
        var (client, universe) = await SignedInWithUniverse("tlonelink");
        var frodo = await CreateEntity(client, universe.Id, "Frodo");

        var entry = await Create(
            client,
            universe.Id,
            Exact("Frodo leaves the Shire", 3018) with { EntityIds = [frodo.Id] });

        var link = Assert.Single(entry.Entities);
        Assert.Equal(frodo.Id, link.EntityId);
        Assert.Equal("Frodo", link.Name);
        Assert.Equal("Character", link.EntityTypeName);
    }

    [Fact]
    public async Task Several_entities_can_take_part_in_one_moment()
    {
        var (client, universe) = await SignedInWithUniverse("tlmanylinks");
        var frodo = await CreateEntity(client, universe.Id, "Frodo");
        var shire = await CreateEntity(client, universe.Id, "The Shire");
        var ring = await CreateEntity(client, universe.Id, "One Ring");

        var entry = await Create(
            client,
            universe.Id,
            Exact("Frodo leaves the Shire", 3018) with { EntityIds = [frodo.Id, shire.Id, ring.Id] });

        Assert.Equal(3, entry.Entities.Count);
        Assert.Equal(
            ["Frodo", "One Ring", "The Shire"],
            entry.Entities.Select(link => link.Name).ToArray());
    }

    [Fact]
    public async Task Updating_an_entry_replaces_its_participants()
    {
        var (client, universe) = await SignedInWithUniverse("tlrelink");
        var frodo = await CreateEntity(client, universe.Id, "Frodo");
        var sam = await CreateEntity(client, universe.Id, "Sam");
        var entry = await Create(
            client,
            universe.Id,
            Exact("They set out", 3018) with { EntityIds = [frodo.Id] });

        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/timeline/{entry.Id}",
            Exact("They set out", 3018) with { EntityIds = [frodo.Id, sam.Id] });
        response.EnsureSuccessStatusCode();

        var updated = (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;

        Assert.Equal(["Frodo", "Sam"], updated.Entities.Select(link => link.Name).ToArray());
    }

    /// <summary>
    /// Trashing a participant leaves the moment standing, and leaves the participation stored.
    ///
    /// Since Phase 019 an entry is not destroyed by the author removing it, so the link is not
    /// destroyed either. It is reported and marked rather than dropped: the form posts a
    /// moment's whole participant set on every save, so hiding a participant here would delete
    /// the participation the next time the author touched the date. Restoring the entry makes
    /// the moment read exactly as it did before.
    /// </summary>
    [Fact]
    public async Task Trashing_a_participant_leaves_the_moment_standing_and_the_participation_stored()
    {
        var (client, universe) = await SignedInWithUniverse("tldelparticipant");
        var frodo = await CreateEntity(client, universe.Id, "Frodo");
        var sam = await CreateEntity(client, universe.Id, "Sam");
        var entry = await Create(
            client,
            universe.Id,
            Exact("They set out", 3018) with { EntityIds = [frodo.Id, sam.Id] });

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{sam.Id}"))
            .EnsureSuccessStatusCode();

        var read = await Get(client, universe.Id, entry.Id);

        Assert.Equal("They set out", read.Title);
        Assert.Equal(["Frodo", "Sam"], read.Entities.Select(link => link.Name).ToArray());
        Assert.False(read.Entities.Single(link => link.EntityId == frodo.Id).IsTrashed);
        Assert.True(read.Entities.Single(link => link.EntityId == sam.Id).IsTrashed);

        (await client.PostAsync($"/api/universes/{universe.Id}/trash/{sam.Id}/restore", null))
            .EnsureSuccessStatusCode();

        var back = await Get(client, universe.Id, entry.Id);

        Assert.Equal(["Frodo", "Sam"], back.Entities.Select(link => link.Name).ToArray());
        Assert.All(back.Entities, link => Assert.False(link.IsTrashed));
    }

    [Fact]
    public async Task An_entry_can_be_deleted()
    {
        var (client, universe) = await SignedInWithUniverse("tldelete");
        var entry = await Create(client, universe.Id, Exact("Briefly", 3018));

        var deleted = await client.DeleteAsync($"/api/universes/{universe.Id}/timeline/{entry.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var read = await client.GetAsync($"/api/universes/{universe.Id}/timeline/{entry.Id}");
        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);
    }

    // ---------- Ordering, paging and filters ----------

    [Fact]
    public async Task The_listing_runs_in_chronological_order_with_unknown_dates_last()
    {
        var (client, universe) = await SignedInWithUniverse("tlorder");
        await Create(client, universe.Id, Request("Unplaced", TimelineDateKind.Unknown));
        await Create(client, universe.Id, Exact("Third", 3019, 3, 25));
        await Create(client, universe.Id, Exact("First", -100));
        await Create(client, universe.Id, Exact("Second", 3018, 9, 23));

        var page = await List(client, universe.Id);

        Assert.Equal(
            ["First", "Second", "Third", "Unplaced"],
            page.Items.Select(entry => entry.Title).ToArray());
    }

    [Fact]
    public async Task A_bare_year_sorts_before_a_dated_moment_inside_it()
    {
        var (client, universe) = await SignedInWithUniverse("tlprecision");
        await Create(client, universe.Id, Exact("In September", 3018, 9));
        await Create(client, universe.Id, Exact("Sometime that year", 3018));
        await Create(client, universe.Id, Exact("On the 23rd", 3018, 9, 23));

        var page = await List(client, universe.Id);

        Assert.Equal(
            ["Sometime that year", "In September", "On the 23rd"],
            page.Items.Select(entry => entry.Title).ToArray());
    }

    [Fact]
    public async Task Entries_sharing_a_date_break_the_tie_by_title()
    {
        var (client, universe) = await SignedInWithUniverse("tltiebreak");
        await Create(client, universe.Id, Exact("Camellia", 3018));
        await Create(client, universe.Id, Exact("Aster", 3018));
        await Create(client, universe.Id, Exact("Bluebell", 3018));

        var page = await List(client, universe.Id);

        Assert.Equal(
            ["Aster", "Bluebell", "Camellia"],
            page.Items.Select(entry => entry.Title).ToArray());
    }

    [Fact]
    public async Task Several_unknown_dates_keep_a_deterministic_order_among_themselves()
    {
        var (client, universe) = await SignedInWithUniverse("tlunknownorder");
        await Create(client, universe.Id, Request("Gamma", TimelineDateKind.Unknown));
        await Create(client, universe.Id, Request("Alpha", TimelineDateKind.Unknown));
        await Create(client, universe.Id, Exact("Dated", 3018));
        await Create(client, universe.Id, Request("Beta", TimelineDateKind.Unknown));

        var page = await List(client, universe.Id);

        Assert.Equal(
            ["Dated", "Alpha", "Beta", "Gamma"],
            page.Items.Select(entry => entry.Title).ToArray());
    }

    [Fact]
    public async Task Paging_walks_the_same_order_without_repeating_or_dropping_an_entry()
    {
        var (client, universe) = await SignedInWithUniverse("tlpaging");

        for (var year = 1; year <= 5; year++)
        {
            await Create(client, universe.Id, Exact($"Year {year}", year));
        }

        var first = await List(client, universe.Id, page: 1, pageSize: 2);
        var second = await List(client, universe.Id, page: 2, pageSize: 2);
        var third = await List(client, universe.Id, page: 3, pageSize: 2);

        Assert.Equal(5, first.TotalCount);
        Assert.Equal(3, first.TotalPages);
        Assert.Equal(["Year 1", "Year 2"], first.Items.Select(entry => entry.Title).ToArray());
        Assert.Equal(["Year 3", "Year 4"], second.Items.Select(entry => entry.Title).ToArray());
        Assert.Equal(["Year 5"], third.Items.Select(entry => entry.Title).ToArray());
    }

    [Fact]
    public async Task The_listing_can_be_filtered_by_canon_status()
    {
        var (client, universe) = await SignedInWithUniverse("tlfilterstatus");
        await Create(
            client,
            universe.Id,
            Exact("Settled", 3018) with { CanonStatus = CanonStatus.Canon });
        await Create(client, universe.Id, Exact("Speculation", 3019));

        var page = await List(client, universe.Id, canonStatus: CanonStatus.Canon);

        var only = Assert.Single(page.Items);
        Assert.Equal("Settled", only.Title);
    }

    [Fact]
    public async Task The_listing_can_be_filtered_by_a_participating_entity()
    {
        var (client, universe) = await SignedInWithUniverse("tlfilterentity");
        var frodo = await CreateEntity(client, universe.Id, "Frodo");
        var sam = await CreateEntity(client, universe.Id, "Sam");
        await Create(client, universe.Id, Exact("Frodo alone", 3018) with { EntityIds = [frodo.Id] });
        await Create(client, universe.Id, Exact("Sam alone", 3019) with { EntityIds = [sam.Id] });
        await Create(client, universe.Id, Exact("Neither", 3020));

        var page = await List(client, universe.Id, entityId: frodo.Id);

        var only = Assert.Single(page.Items);
        Assert.Equal("Frodo alone", only.Title);
    }

    // ---------- Ownership ----------

    [Fact]
    public async Task The_listing_shows_only_the_universe_it_was_asked_for()
    {
        var client = await SignedInClient("user-tlscope");
        var first = await CreateUniverse(client, "World tlscope one");
        var second = await CreateUniverse(client, "World tlscope two");
        await Create(client, first.Id, Exact("In the first world", 3018));
        await Create(client, second.Id, Exact("In the second world", 3018));

        var page = await List(client, first.Id);

        var only = Assert.Single(page.Items);
        Assert.Equal("In the first world", only.Title);
    }

    [Fact]
    public async Task Another_owners_entry_cannot_be_read()
    {
        var (owner, universe) = await SignedInWithUniverse("tlownerread");
        var entry = await Create(client: owner, universe.Id, Exact("Private history", 3018));
        var stranger = await SignedInClient("user-tlstrangerread");

        var response = await stranger.GetAsync($"/api/universes/{universe.Id}/timeline/{entry.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain(
            "Private history",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task Another_owners_timeline_cannot_be_listed()
    {
        var (owner, universe) = await SignedInWithUniverse("tlownerlist");
        await Create(owner, universe.Id, Exact("Private history", 3018));
        var stranger = await SignedInClient("user-tlstrangerlist");

        var response = await stranger.GetAsync($"/api/universes/{universe.Id}/timeline");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Another_owners_entry_cannot_be_updated()
    {
        var (owner, universe) = await SignedInWithUniverse("tlownerupdate");
        var entry = await Create(owner, universe.Id, Exact("Private history", 3018));
        var stranger = await SignedInClient("user-tlstrangerupdate");

        var response = await stranger.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/timeline/{entry.Id}",
            Exact("Rewritten", 3019));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var unchanged = await Get(owner, universe.Id, entry.Id);
        Assert.Equal("Private history", unchanged.Title);
    }

    [Fact]
    public async Task Another_owners_entry_cannot_be_deleted()
    {
        var (owner, universe) = await SignedInWithUniverse("tlownerdelete");
        var entry = await Create(owner, universe.Id, Exact("Private history", 3018));
        var stranger = await SignedInClient("user-tlstrangerdelete");

        var response = await stranger.DeleteAsync(
            $"/api/universes/{universe.Id}/timeline/{entry.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var survivor = await Get(owner, universe.Id, entry.Id);
        Assert.Equal("Private history", survivor.Title);
    }

    [Fact]
    public async Task Another_owners_entry_cannot_be_created_in_their_universe()
    {
        var (_, universe) = await SignedInWithUniverse("tlownercreate");
        var stranger = await SignedInClient("user-tlstrangercreate");

        var response = await Post(stranger, universe.Id, Exact("Trespass", 3018));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task An_entity_from_another_universe_cannot_be_linked()
    {
        var client = await SignedInClient("user-tlcrossuniverse");
        var first = await CreateUniverse(client, "World tlcross one");
        var second = await CreateUniverse(client, "World tlcross two");
        var outsider = await CreateEntity(client, second.Id, "Outsider");

        var response = await Post(
            client,
            first.Id,
            Exact("Borrowed cast", 3018) with { EntityIds = [outsider.Id] });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_entity_from_another_owners_universe_cannot_be_linked()
    {
        var (owner, ownersUniverse) = await SignedInWithUniverse("tlcrossowner");
        var secret = await CreateEntity(owner, ownersUniverse.Id, "Secret character");

        var stranger = await SignedInClient("user-tlcrossownerstranger");
        var theirs = await CreateUniverse(stranger, "World tlcrossowner stranger");

        var response = await Post(
            stranger,
            theirs.Id,
            Exact("Borrowed cast", 3018) with { EntityIds = [secret.Id] });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.DoesNotContain(
            "Secret character",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_foreign_entity_cannot_be_slipped_in_through_an_update()
    {
        var (owner, ownersUniverse) = await SignedInWithUniverse("tlcrossupdate");
        var secret = await CreateEntity(owner, ownersUniverse.Id, "Secret character");

        var stranger = await SignedInClient("user-tlcrossupdatestranger");
        var theirs = await CreateUniverse(stranger, "World tlcrossupdate stranger");
        var entry = await Create(stranger, theirs.Id, Exact("Their own moment", 3018));

        var response = await stranger.PutAsJsonAsync(
            $"/api/universes/{theirs.Id}/timeline/{entry.Id}",
            Exact("Their own moment", 3018) with { EntityIds = [secret.Id] });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var unchanged = await Get(stranger, theirs.Id, entry.Id);
        Assert.Empty(unchanged.Entities);
    }

    [Fact]
    public async Task An_entry_id_from_another_universe_does_not_resolve()
    {
        var client = await SignedInClient("user-tlwronguniverse");
        var first = await CreateUniverse(client, "World tlwrong one");
        var second = await CreateUniverse(client, "World tlwrong two");
        var entry = await Create(client, second.Id, Exact("Elsewhere", 3018));

        var response = await client.GetAsync($"/api/universes/{first.Id}/timeline/{entry.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task The_timeline_needs_a_signed_in_caller()
    {
        var (_, universe) = await SignedInWithUniverse("tlanon");
        var anonymous = _factory.CreateClient();

        var response = await anonymous.GetAsync($"/api/universes/{universe.Id}/timeline");

        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
    }

    // ---------- Helpers ----------

    private static TimelineEntryRequest Request(
        string? title,
        TimelineDateKind dateKind,
        int? startYear = null,
        int? startMonth = null,
        int? startDay = null,
        int? endYear = null,
        int? endMonth = null,
        int? endDay = null,
        string? eraLabel = null,
        CanonStatus canonStatus = CanonStatus.Idea,
        IReadOnlyList<Guid>? entityIds = null) =>
        new(
            title,
            null,
            canonStatus,
            dateKind,
            startYear,
            startMonth,
            startDay,
            endYear,
            endMonth,
            endDay,
            eraLabel,
            entityIds);

    private static TimelineEntryRequest Exact(
        string title,
        int year,
        int? month = null,
        int? day = null) =>
        Request(title, TimelineDateKind.Exact, year, month, day);

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(string tag)
    {
        var client = await SignedInClient($"user-{tag}");
        return (client, await CreateUniverse(client, $"World {tag}"));
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<EntityDetail> CreateEntity(HttpClient client, Guid universeId, string name)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        var type = types.First(candidate => candidate.Name == "Character");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(type.Id, name, null, CanonStatus.Idea, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static Task<HttpResponseMessage> Post(
        HttpClient client,
        Guid universeId,
        TimelineEntryRequest request) =>
        client.PostAsJsonAsync($"/api/universes/{universeId}/timeline", request);

    private static async Task<TimelineEntryResponse> Create(
        HttpClient client,
        Guid universeId,
        TimelineEntryRequest request)
    {
        var response = await Post(client, universeId, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TimelineEntryResponse>())!;
    }

    private static async Task<TimelineEntryResponse> Get(
        HttpClient client,
        Guid universeId,
        Guid entryId) =>
        (await client.GetFromJsonAsync<TimelineEntryResponse>(
            $"/api/universes/{universeId}/timeline/{entryId}"))!;

    private static async Task<TimelineEntryPage> List(
        HttpClient client,
        Guid universeId,
        CanonStatus? canonStatus = null,
        Guid? entityId = null,
        int page = 1,
        int pageSize = 25)
    {
        var query = $"?page={page}&pageSize={pageSize}";

        if (canonStatus is { } status)
        {
            query += $"&canonStatus={status}";
        }

        if (entityId is { } participant)
        {
            query += $"&entityId={participant}";
        }

        return (await client.GetFromJsonAsync<TimelineEntryPage>(
            $"/api/universes/{universeId}/timeline{query}"))!;
    }
}
