using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Universes;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Publishing a universe's shell, and the privacy boundary around it (ADR 0036).
///
/// The claims this file carries. Every universe is private until its owner publishes it, and a private
/// one is invisible to anyone without its owner's session - absent from the listing, and the same 404 as
/// a universe that never existed. Publishing needs everything the public card shows and refuses, naming
/// what is missing, until it has it; while public, nothing it needs can be taken away. Only its owner can
/// publish or unpublish it. What anyone may read is an allow-list of eight members - no id, no account,
/// no description, nothing inside the universe - and unpublishing takes it away at the next read.
/// </summary>
public sealed class UniversePublicationTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private static readonly int[] OneGenre = [1];

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Private by default ----------

    [Fact]
    public async Task A_new_universe_is_private_and_nothing_public_can_find_it()
    {
        var (owner, _) = await Account(_factory, "pub-default");
        var universe = await CreateUniverse(owner, "Hollowmere default");
        var anonymous = Anonymous(_factory);

        var state = await State(owner, universe.Id);
        Assert.Equal(UniverseVisibility.Private, state.Visibility);
        Assert.Null(state.PublicSlug);
        Assert.Null(state.PublishedAt);
        Assert.Null(state.PublicSummary);
        Assert.Null(state.Category);
        Assert.Empty(state.Genres);
        Assert.Null(state.Artwork);

        Assert.DoesNotContain(await PublicListing(anonymous), world => world.Name == "Hollowmere default");

        // The address it would have is not an address yet, and a made-up one answers exactly the same.
        var wouldBe = await anonymous.GetAsync($"{PublicRoute}/hollowmere-default");
        var madeUp = await anonymous.GetAsync($"{PublicRoute}/no-such-world-anywhere");
        Assert.Equal(HttpStatusCode.NotFound, wouldBe.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, madeUp.StatusCode);
        Assert.Equal(await madeUp.Content.ReadAsStringAsync(), await wouldBe.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_universe_with_every_detail_is_still_private_until_it_is_published()
    {
        var (owner, _) = await Account(_factory, "pub-ready");
        var universe = await Ready(owner, "Hollowmere ready");

        var state = await State(owner, universe.Id);
        Assert.Equal(UniverseVisibility.Private, state.Visibility);
        Assert.Empty(state.Missing);
        Assert.DoesNotContain(await PublicListing(Anonymous(_factory)), world => world.Name == "Hollowmere ready");
    }

    // ---------- Publishing needs everything ----------

    [Fact]
    public async Task Publishing_an_incomplete_universe_is_refused_with_what_is_missing_and_it_stays_private()
    {
        var (owner, _) = await Account(_factory, "pub-incomplete");
        var universe = await CreateUniverse(owner, "Hollowmere incomplete");

        var refused = await Publish(owner, universe.Id);
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal(PublicationEndpoints.IncompleteCode, await ProblemCode(refused));
        Assert.Equal(
            ["artwork", "category", "genres", "publicDisplayName", "publicSummary"],
            (await ErrorKeys(refused)).Order(StringComparer.Ordinal));

        // Part of the way there: only what is still missing is named.
        await SavedDetails(owner, universe.Id, "A lake that remembers.", UniverseCategory.Original, UniverseGenres.Mystery);
        var partly = await Publish(owner, universe.Id);
        Assert.Equal(["artwork", "publicDisplayName"], (await ErrorKeys(partly)).Order(StringComparer.Ordinal));

        var state = await State(owner, universe.Id);
        Assert.Equal(UniverseVisibility.Private, state.Visibility);
        Assert.Null(state.PublicSlug);
        Assert.Equal(["artwork", "publicDisplayName"], state.Missing.Keys.Order(StringComparer.Ordinal));
        Assert.DoesNotContain(await PublicListing(Anonymous(_factory)), world => world.Name == "Hollowmere incomplete");
    }

    // ---------- Publishing, and what anyone may then read ----------

    [Fact]
    public async Task A_published_universe_is_listed_and_resolves_by_its_address_with_exactly_its_shell()
    {
        var (owner, _) = await Account(_factory, "pub-publish");
        var universe = await Ready(owner, "Hollowmere Published", author: "Mara Vell");

        var state = await Published(owner, universe.Id);
        Assert.Equal(UniverseVisibility.Public, state.Visibility);
        Assert.Equal("hollowmere-published", state.PublicSlug);
        Assert.NotNull(state.PublishedAt);

        var anonymous = Anonymous(_factory);
        var listed = Assert.Single(await PublicListing(anonymous), world => world.Slug == "hollowmere-published");
        var read = (await PublicBySlug(anonymous, "hollowmere-published"))!;

        Assert.Equal(listed, read with { Genres = listed.Genres });
        Assert.Equal("Hollowmere Published", read.Name);
        Assert.Equal("A drowned coast where the tide keeps count.", read.PublicSummary);
        Assert.Equal(UniverseCategory.Books, read.Category);
        Assert.Equal([UniverseGenres.Fantasy, UniverseGenres.Adventure], read.Genres);
        Assert.Equal("Mara Vell", read.AuthorDisplayName);
        Assert.Equal($"/api/public/universes/hollowmere-published/artwork/card/{state.Artwork!.CardId:D}", read.CardImageUrl);

        // And the card it names is really served, to anyone.
        var card = await anonymous.GetAsync(read.CardImageUrl);
        Assert.Equal(HttpStatusCode.OK, card.StatusCode);
        Assert.Equal("image/webp", card.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task What_anyone_reads_is_the_allow_list_and_nothing_else()
    {
        var (owner, userId) = await Account(_factory, "pub-allowlist");
        var universe = await Ready(owner, "Hollowmere allowlist");
        var state = await Published(owner, universe.Id);
        var anonymous = Anonymous(_factory);

        string[] allowed = ["authorDisplayName", "authorSlug", "cardImageUrl", "category", "genres", "name", "originalCreator", "originalWork", "publicSummary", "publishedAt", "slug"];

        var single = await anonymous.GetStringAsync($"{PublicRoute}/{state.PublicSlug}");
        using (var document = JsonDocument.Parse(single))
        {
            Assert.Equal(allowed, document.RootElement.EnumerateObject().Select(member => member.Name).Order(StringComparer.Ordinal));
        }

        var page = await anonymous.GetStringAsync($"{PublicRoute}?pageSize=48");
        using (var document = JsonDocument.Parse(page))
        {
            Assert.Equal(
                ["items", "page", "pageSize", "totalCount", "totalPages"],
                document.RootElement.EnumerateObject().Select(member => member.Name).Order(StringComparer.Ordinal));

            foreach (var item in document.RootElement.GetProperty("items").EnumerateArray())
            {
                Assert.Equal(allowed, item.EnumerateObject().Select(member => member.Name).Order(StringComparer.Ordinal));
            }
        }

        // Nothing private leaks into either, under any name.
        foreach (var body in new[] { single, page })
        {
            Assert.DoesNotContain(universe.Id.ToString(), body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(userId, body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("user-pub-allowlist", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("pub-allowlist@example.test", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Private notes", body, StringComparison.Ordinal);
            Assert.DoesNotContain(state.Artwork!.AssetId.ToString(), body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("universes/", body.Replace("/api/public/universes/", string.Empty, StringComparison.Ordinal), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Nothing_inside_a_public_universe_is_readable_without_its_owner()
    {
        var (owner, _) = await Account(_factory, "pub-inside");
        var universe = await Ready(owner, "Hollowmere inside");
        var u = universe.Id;

        var types = (await owner.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var entry = await owner.PostAsJsonAsync(
            $"/api/universes/{u}/entities",
            new EntityRequest(types[0].Id, "Secret heir", "Dies in book three.", CanonStatus.Canon, null, null, null));
        entry.EnsureSuccessStatusCode();
        var entryId = (await entry.Content.ReadFromJsonAsync<EntityDetail>())!.Id;
        await Published(owner, u);

        var anonymous = Anonymous(_factory);
        string[] inside =
        [
            $"/api/universes/{u}",
            $"/api/universes/{u}/publication",
            $"/api/universes/{u}/artwork",
            $"/api/universes/{u}/entities",
            $"/api/universes/{u}/entities/{entryId}",
            $"/api/universes/{u}/entities/{entryId}/article",
            $"/api/universes/{u}/entities/{entryId}/relationships",
            $"/api/universes/{u}/entity-types",
            $"/api/universes/{u}/timeline",
            $"/api/universes/{u}/stories",
            $"/api/universes/{u}/world-rules",
            $"/api/universes/{u}/canon-conflicts",
            $"/api/universes/{u}/chronology",
            $"/api/universes/{u}/trash",
            $"/api/universes/{u}/search?q=heir",
            $"/api/universes/{u}/export",
            "/api/ideas",
            "/api/profile/public-name",
        ];

        foreach (var route in inside)
        {
            var response = await anonymous.GetAsync(route);
            Assert.True(response.StatusCode == HttpStatusCode.Unauthorized, $"{route} answered {(int)response.StatusCode}");
        }

        // The public address is the shell and only the shell.
        var shell = await anonymous.GetStringAsync($"{PublicRoute}/hollowmere-inside");
        Assert.DoesNotContain("Secret heir", shell, StringComparison.Ordinal);
        Assert.DoesNotContain("book three", shell, StringComparison.Ordinal);

        // There is no public route beneath it for anything else.
        foreach (var route in new[] { "entities", "timeline", "relationships", "family-tree", "canon-conflicts", "artwork/original" })
        {
            var response = await anonymous.GetAsync($"{PublicRoute}/hollowmere-inside/{route}");
            Assert.True(response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed, $"{route} answered {(int)response.StatusCode}");
        }

        // Its published lore and stories are listed there (Task 010) - and publishing the universe published neither.
        foreach (var route in new[] { "lore", "stories" })
        {
            var listing = await anonymous.GetStringAsync($"{PublicRoute}/hollowmere-inside/{route}");
            Assert.Contains("\"totalCount\":0", listing, StringComparison.Ordinal);
            Assert.DoesNotContain("Secret heir", listing, StringComparison.Ordinal);
        }
    }

    // ---------- Unpublishing ----------

    [Fact]
    public async Task Making_it_private_takes_it_out_at_the_next_read_and_publishing_again_keeps_its_address()
    {
        var (owner, _) = await Account(_factory, "pub-unpublish");
        var universe = await Ready(owner, "Hollowmere unpublish");
        var first = await Published(owner, universe.Id);
        var anonymous = Anonymous(_factory);
        var card = (await PublicBySlug(anonymous, first.PublicSlug!))!.CardImageUrl;

        var unpublished = await Unpublish(owner, universe.Id);
        unpublished.EnsureSuccessStatusCode();
        var state = (await unpublished.Content.ReadFromJsonAsync<PublicationState>())!;

        Assert.Equal(UniverseVisibility.Private, state.Visibility);
        Assert.Null(await PublicBySlug(anonymous, first.PublicSlug!));
        Assert.DoesNotContain(await PublicListing(anonymous), world => world.Name == "Hollowmere unpublish");
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(card)).StatusCode);

        // What it had stays, for next time: the details, the address and when it was first published.
        Assert.Equal(first.PublicSlug, state.PublicSlug);
        Assert.Equal(first.PublishedAt, state.PublishedAt);
        Assert.Equal(first.PublicSummary, state.PublicSummary);

        var again = await Published(owner, universe.Id);
        Assert.Equal(first.PublicSlug, again.PublicSlug);
        Assert.Equal(first.PublishedAt, again.PublishedAt);
        Assert.NotNull(await PublicBySlug(anonymous, first.PublicSlug!));

        // Both transitions are idempotent.
        Assert.Equal(first.PublicSlug, (await Published(owner, universe.Id)).PublicSlug);
        (await Unpublish(owner, universe.Id)).EnsureSuccessStatusCode();
        (await Unpublish(owner, universe.Id)).EnsureSuccessStatusCode();
        Assert.Equal(UniverseVisibility.Private, (await State(owner, universe.Id)).Visibility);
    }

    // ---------- Who may ----------

    [Fact]
    public async Task Only_the_owner_may_prepare_publish_or_unpublish_and_nobody_else_can_tell_it_exists()
    {
        var (owner, _) = await Account(_factory, "pub-owner");
        var (stranger, _) = await Account(_factory, "pub-stranger");
        (await SetPublicName(stranger, "Someone Else")).EnsureSuccessStatusCode();
        var anonymous = Anonymous(_factory);
        var universe = await Ready(owner, "Hollowmere owned");
        var u = universe.Id;

        foreach (var attempt in new Func<HttpClient, Task<HttpResponseMessage>>[]
        {
            client => client.GetAsync($"/api/universes/{u}/publication"),
            client => SaveDetails(client, u, "Mine now.", UniverseCategory.Games, UniverseGenres.Horror),
            client => Publish(client, u),
            client => Unpublish(client, u),
            client => UploadArtwork(client, u, Png(320, 200)),
            client => client.DeleteAsync($"/api/universes/{u}/artwork"),
        })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await attempt(stranger)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await attempt(anonymous)).StatusCode);
        }

        var state = await State(owner, u);
        Assert.Equal(UniverseVisibility.Private, state.Visibility);
        Assert.Equal("A drowned coast where the tide keeps count.", state.PublicSummary);
        Assert.Equal(UniverseCategory.Books, state.Category);

        // Published by its owner, the stranger still cannot take it down.
        await Published(owner, u);
        Assert.Equal(HttpStatusCode.NotFound, (await Unpublish(stranger, u)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Unpublish(anonymous, u)).StatusCode);
        Assert.NotNull(await PublicBySlug(anonymous, "hollowmere-owned"));
    }

    // ---------- A public universe stays complete ----------

    [Fact]
    public async Task While_public_nothing_it_needs_can_be_taken_away_and_once_private_everything_can()
    {
        var (owner, _) = await Account(_factory, "pub-keep");
        var universe = await Ready(owner, "Hollowmere keep");
        var u = universe.Id;
        await Published(owner, u);

        var noSummary = await SaveDetails(owner, u, "   ", UniverseCategory.Books, UniverseGenres.Fantasy);
        var noCategory = await SaveDetails(owner, u, "Still here.", null, UniverseGenres.Fantasy);
        var noGenres = await SaveDetails(owner, u, "Still here.", UniverseCategory.Books);

        Assert.Equal(["publicSummary"], await ErrorKeys(noSummary));
        Assert.Equal(["category"], await ErrorKeys(noCategory));
        Assert.Equal(["genres"], await ErrorKeys(noGenres));
        foreach (var refused in new[] { noSummary, noCategory, noGenres })
        {
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Equal(PublicationEndpoints.RequiredWhilePublicCode, await ProblemCode(refused));
        }

        var noArtwork = await owner.DeleteAsync($"/api/universes/{u}/artwork");
        Assert.Equal(HttpStatusCode.Conflict, noArtwork.StatusCode);
        Assert.Equal(UniverseArtworkEndpoints.RequiredWhilePublicCode, await ProblemCode(noArtwork));

        var noName = await SetPublicName(owner, "  ");
        Assert.Equal(HttpStatusCode.BadRequest, noName.StatusCode);
        Assert.Equal(["publicDisplayName"], await ErrorKeys(noName));

        // Changing any of them to something else is fine, and it is public at once.
        await SavedDetails(owner, u, "A lake that remembers.", UniverseCategory.Comics, UniverseGenres.Horror);
        (await SetPublicName(owner, "M. Vell")).EnsureSuccessStatusCode();
        var read = (await PublicBySlug(Anonymous(_factory), "hollowmere-keep"))!;
        Assert.Equal(("A lake that remembers.", UniverseCategory.Comics, "M. Vell"), (read.PublicSummary, read.Category, read.AuthorDisplayName));
        Assert.Equal([UniverseGenres.Horror], read.Genres);

        // Private again, all of it can go.
        (await Unpublish(owner, u)).EnsureSuccessStatusCode();
        await SavedDetails(owner, u, null, null);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/universes/{u}/artwork")).StatusCode);
        (await SetPublicName(owner, null)).EnsureSuccessStatusCode();

        var state = await State(owner, u);
        Assert.Equal(5, state.Missing.Count);
        Assert.Null(state.AuthorDisplayName);
    }

    // ---------- What a save may and may not do ----------

    [Fact]
    public async Task Public_details_are_checked_and_stored_in_one_order()
    {
        var (owner, _) = await Account(_factory, "pub-details");
        var u = (await CreateUniverse(owner, "Hollowmere details")).Id;

        var tooLong = await SaveDetails(owner, u, new string('a', PublicationLimits.SummaryMaxLength + 1), null);
        Assert.Equal(["publicSummary"], await ErrorKeys(tooLong));

        var unknownCategory = await owner.PutAsJsonAsync($"/api/universes/{u}/publication", new { category = 99, genres = Array.Empty<int>() });
        Assert.Equal(["category"], await ErrorKeys(unknownCategory));

        foreach (var genres in new[] { new[] { 3 }, new[] { 4096 }, new[] { 0 }, new[] { 1, 2, 4, 8 } })
        {
            var refused = await owner.PutAsJsonAsync($"/api/universes/{u}/publication", new { genres });
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Equal(["genres"], await ErrorKeys(refused));
        }

        // Trimmed, and listed in the one fixed order whatever order they were chosen in.
        var saved = await SavedDetails(owner, u, "  A lake that remembers.  ", UniverseCategory.TabletopAndRpg, UniverseGenres.Mystery, UniverseGenres.Fantasy, UniverseGenres.Mystery);
        Assert.Equal("A lake that remembers.", saved.PublicSummary);
        Assert.Equal([UniverseGenres.Fantasy, UniverseGenres.Mystery], saved.Genres);

        // A blank summary is none.
        Assert.Null((await SavedDetails(owner, u, "   ", null)).PublicSummary);
    }

    [Fact]
    public async Task A_save_cannot_publish_or_choose_an_address()
    {
        var (owner, _) = await Account(_factory, "pub-overpost");
        var universe = await Ready(owner, "Hollowmere overpost");

        var response = await owner.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/publication",
            new { publicSummary = "Still private.", category = 1, genres = OneGenre, visibility = 1, publicSlug = "chosen", publishedAt = "2000-01-01T00:00:00Z" });
        response.EnsureSuccessStatusCode();

        var state = await State(owner, universe.Id);
        Assert.Equal(UniverseVisibility.Private, state.Visibility);
        Assert.Null(state.PublicSlug);
        Assert.Null(state.PublishedAt);
        Assert.Null(await PublicBySlug(Anonymous(_factory), "chosen"));
    }

    [Fact]
    public async Task The_description_is_never_published_and_the_summary_is_never_taken_from_it()
    {
        var (owner, _) = await Account(_factory, "pub-description");
        var universe = await CreateUniverse(owner, "Hollowmere description", "The heir is the villain. Do not tell anyone.");

        Assert.Null((await State(owner, universe.Id)).PublicSummary);

        await SavedDetails(owner, universe.Id, "A quiet lake.", UniverseCategory.Original, UniverseGenres.Mystery);
        await UploadedArtwork(owner, universe.Id, Png(800, 500));
        (await SetPublicName(owner, "Quiet Author")).EnsureSuccessStatusCode();
        var state = await Published(owner, universe.Id);

        var body = await Anonymous(_factory).GetStringAsync($"{PublicRoute}/{state.PublicSlug}");
        Assert.DoesNotContain("villain", body, StringComparison.Ordinal);
        Assert.Contains("A quiet lake.", body, StringComparison.Ordinal);
    }

    // ---------- The address ----------

    [Fact]
    public async Task A_rename_keeps_the_address_and_shows_the_new_name()
    {
        var (owner, _) = await Account(_factory, "pub-rename");
        var universe = await Ready(owner, "The Nail Ark rename");
        var state = await Published(owner, universe.Id);
        Assert.Equal("the-nail-ark-rename", state.PublicSlug);

        (await owner.PutAsJsonAsync($"/api/universes/{universe.Id}", new UpdateUniverseRequest("The Iron Ark", null, null)))
            .EnsureSuccessStatusCode();

        var read = (await PublicBySlug(Anonymous(_factory), "the-nail-ark-rename"))!;
        Assert.Equal("The Iron Ark", read.Name);
        Assert.Equal("the-nail-ark-rename", (await State(owner, universe.Id)).PublicSlug);
    }

    [Fact]
    public async Task Two_worlds_of_one_name_get_two_addresses_in_the_order_they_were_published()
    {
        var (first, _) = await Account(_factory, "pub-collide-a");
        var (second, _) = await Account(_factory, "pub-collide-b");
        var a = await Ready(first, "Collision Ark", author: "First Author");
        var b = await Ready(second, "Collision Ark", author: "Second Author");

        Assert.Equal("collision-ark", (await Published(second, b.Id)).PublicSlug);
        Assert.Equal("collision-ark-2", (await Published(first, a.Id)).PublicSlug);

        var anonymous = Anonymous(_factory);
        Assert.Equal("Second Author", (await PublicBySlug(anonymous, "collision-ark"))!.AuthorDisplayName);
        Assert.Equal("First Author", (await PublicBySlug(anonymous, "collision-ark-2"))!.AuthorDisplayName);
    }

    [Fact]
    public async Task A_name_in_any_script_is_shown_exactly_and_addressed_in_plain_letters()
    {
        var (owner, _) = await Account(_factory, "pub-rtl");
        var universe = await CreateUniverse(owner, "آكرون — 12 / Wright");
        await SavedDetails(owner, universe.Id, "עיר שקועה, 12 שערים (וגשר אחד).", UniverseCategory.Original, UniverseGenres.Fantasy);
        await UploadedArtwork(owner, universe.Id, Png(800, 500));
        (await SetPublicName(owner, "مارا فيل")).EnsureSuccessStatusCode();

        var state = await Published(owner, universe.Id);
        Assert.Equal("12-wright", state.PublicSlug);

        var read = (await PublicBySlug(Anonymous(_factory), "12-wright"))!;
        Assert.Equal("آكرون — 12 / Wright", read.Name);
        Assert.Equal("עיר שקועה, 12 שערים (וגשר אחד).", read.PublicSummary);
        Assert.Equal("مارا فيل", read.AuthorDisplayName);

        // A name with no Latin letter or digit at all is addressed as "world".
        var (other, _) = await Account(_factory, "pub-rtl-only");
        var arabic = await CreateUniverse(other, "عالم الظلال");
        await SavedDetails(other, arabic.Id, "ظلال.", UniverseCategory.Books, UniverseGenres.Horror);
        await UploadedArtwork(other, arabic.Id, Png(800, 500));
        (await SetPublicName(other, "Author")).EnsureSuccessStatusCode();
        Assert.StartsWith("world", (await Published(other, arabic.Id)).PublicSlug, StringComparison.Ordinal);
    }

    // ---------- The author's name ----------

    [Fact]
    public async Task The_public_name_is_chosen_checked_and_read_live_by_every_published_world()
    {
        var (owner, _) = await Account(_factory, "pub-name");

        Assert.Null((await owner.GetFromJsonAsync<PublicNameResponse>("/api/profile/public-name"))!.PublicDisplayName);

        var tooLong = await SetPublicName(owner, new string('n', PublicationLimits.DisplayNameMaxLength + 1));
        var control = await SetPublicName(owner, "Mara\u0007Vell");
        var overridden = await SetPublicName(owner, "Mara ‮evil");
        foreach (var refused in new[] { tooLong, control, overridden })
        {
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            Assert.Equal(["publicDisplayName"], await ErrorKeys(refused));
        }

        var one = await Ready(owner, "Name world one", author: "  Mara Vell  ");
        var two = await Ready(owner, "Name world two", author: "Mara Vell");
        Assert.Equal("Mara Vell", (await owner.GetFromJsonAsync<PublicNameResponse>("/api/profile/public-name"))!.PublicDisplayName);
        var slugOne = (await Published(owner, one.Id)).PublicSlug!;
        var slugTwo = (await Published(owner, two.Id)).PublicSlug!;

        (await SetPublicName(owner, "M. V.")).EnsureSuccessStatusCode();

        var anonymous = Anonymous(_factory);
        Assert.Equal("M. V.", (await PublicBySlug(anonymous, slugOne))!.AuthorDisplayName);
        Assert.Equal("M. V.", (await PublicBySlug(anonymous, slugTwo))!.AuthorDisplayName);
    }

    // ---------- Archive and delete ----------

    [Fact]
    public async Task Archiving_leaves_a_public_universe_public_and_deleting_it_takes_it_away()
    {
        var (owner, _) = await Account(_factory, "pub-delete");
        var universe = await Ready(owner, "Hollowmere delete");
        var slug = (await Published(owner, universe.Id)).PublicSlug!;
        var anonymous = Anonymous(_factory);

        (await owner.PostAsync($"/api/universes/{universe.Id}/archive", null)).EnsureSuccessStatusCode();
        Assert.NotNull(await PublicBySlug(anonymous, slug));

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/universes/{universe.Id}")).StatusCode);
        Assert.Null(await PublicBySlug(anonymous, slug));
        Assert.DoesNotContain(await PublicListing(anonymous), world => world.Slug == slug);
    }

    // ---------- The listing ----------

    [Fact]
    public async Task The_listing_is_most_recently_published_first_and_pages()
    {
        var (owner, _) = await Account(_factory, "pub-order");
        var slugs = new List<string>();
        foreach (var name in new[] { "Order first", "Order second", "Order third" })
        {
            var universe = await Ready(owner, name);
            slugs.Add((await Published(owner, universe.Id)).PublicSlug!);
        }

        var anonymous = Anonymous(_factory);
        var mine = (await PublicListing(anonymous)).Where(world => slugs.Contains(world.Slug)).Select(world => world.Slug).ToList();
        Assert.Equal(["order-third", "order-second", "order-first"], mine);

        var page = (await anonymous.GetFromJsonAsync<PublicUniversePage>($"{PublicRoute}?page=1&pageSize=1"))!;
        Assert.Single(page.Items);
        Assert.Equal(1, page.PageSize);
        Assert.True(page.TotalCount >= 3);
        Assert.Equal(page.TotalCount, page.TotalPages);

        // Out-of-range paging is clamped rather than refused.
        var clamped = (await anonymous.GetFromJsonAsync<PublicUniversePage>($"{PublicRoute}?page=-4&pageSize=5000"))!;
        Assert.Equal((1, 48), (clamped.Page, clamped.PageSize));
    }

    [Fact]
    public async Task Public_responses_ask_to_be_revalidated_and_carry_no_session()
    {
        var anonymous = Anonymous(_factory);
        var response = await anonymous.GetAsync(PublicRoute);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoCache);
        Assert.False(response.Headers.Contains("Set-Cookie"));
    }
}
