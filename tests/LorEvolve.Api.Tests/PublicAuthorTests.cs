using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Profile;
using LorEvolve.Api.Features.Publishing;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.PublishingTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// An author's public identity (ADR 0037).
///
/// The claims this file carries. An author address is minted once, from the public name, when the account first
/// publishes; it survives renames and collides into <c>-2</c>, never into an id, username or email. It resolves only while
/// the account has a public universe - registering, or having only private worlds, makes no one findable. What it reads
/// is an allow-list of three members. The account's photo is never public until its owner chooses, only its square is
/// ever served, a replacement is private again, and hiding or removing it takes the address down at the next read.
/// </summary>
public sealed class PublicAuthorTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private static readonly string[] AuthorKeys = ["avatarUrl", "displayName", "slug"];

    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task An_author_address_is_minted_at_first_publication_kept_through_renames_and_holds_only_the_allow_list()
    {
        var (owner, userId) = await Account(_factory, "author-mint");
        var universe = await Ready(owner, "Author mint world", author: "Ione Marsh Mint");
        var anonymous = Anonymous(_factory);

        // Not before publishing: nothing to be the author of.
        Assert.Null((await Settings(owner)).AuthorSlug);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/public/authors/ione-marsh-mint")).StatusCode);

        await Published(owner, universe.Id);
        var settings = await Settings(owner);
        Assert.Equal(("ione-marsh-mint", true, false, false), (settings.AuthorSlug, settings.HasPublicWorld, settings.HasPhoto, settings.PhotoIsPublic));

        var body = await anonymous.GetStringAsync("/api/public/authors/ione-marsh-mint");
        using (var document = JsonDocument.Parse(body))
        {
            Assert.Equal(AuthorKeys, document.RootElement.EnumerateObject().Select(member => member.Name).Order(StringComparer.Ordinal));
            Assert.Equal("Ione Marsh Mint", document.RootElement.GetProperty("displayName").GetString());
            Assert.Equal(JsonValueKind.Null, document.RootElement.GetProperty("avatarUrl").ValueKind);
        }

        foreach (var secret in new[] { userId, "user-author-mint", "author-mint@example.test", universe.Id.ToString() })
        {
            Assert.DoesNotContain(secret, body, StringComparison.OrdinalIgnoreCase);
        }

        // Every public world names it.
        Assert.Equal("ione-marsh-mint", (await PublicBySlug(anonymous, "author-mint-world"))!.AuthorSlug);

        // A new public name is shown; the address stays.
        (await SetPublicName(owner, "Ione Marsh-Vell")).EnsureSuccessStatusCode();
        var renamed = (await anonymous.GetFromJsonAsync<PublicAuthor>("/api/public/authors/ione-marsh-mint"))!;
        Assert.Equal("Ione Marsh-Vell", renamed.DisplayName);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/public/authors/ione-marsh-vell")).StatusCode);
    }

    [Fact]
    public async Task Two_authors_of_one_name_get_two_addresses_and_a_name_with_no_plain_letters_falls_back()
    {
        var (first, _) = await Account(_factory, "author-twin-a");
        var (second, _) = await Account(_factory, "author-twin-b");
        var (arabic, _) = await Account(_factory, "author-arabic");

        await Published(first, (await Ready(first, "Author twin a world", author: "Ada Twinning")).Id);
        await Published(second, (await Ready(second, "Author twin b world", author: "Ada Twinning")).Id);
        await Published(arabic, (await Ready(arabic, "Author arabic world", author: "مارا فيل")).Id);

        Assert.Equal("ada-twinning", (await Settings(first)).AuthorSlug);
        Assert.Equal("ada-twinning-2", (await Settings(second)).AuthorSlug);
        var fallback = (await Settings(arabic)).AuthorSlug!;
        Assert.Matches("^author(-[0-9]+)?$", fallback);
        Assert.Equal("مارا فيل", (await Anonymous(_factory).GetFromJsonAsync<PublicAuthor>($"/api/public/authors/{fallback}"))!.DisplayName);
    }

    [Fact]
    public async Task An_author_page_answers_only_while_the_author_has_a_public_universe_and_lists_only_those()
    {
        var (owner, _) = await Account(_factory, "author-worlds");
        var shown = await Ready(owner, "Author worlds shown", author: "Wren Holloway");
        var hidden = await Ready(owner, "Author worlds hidden", author: "Wren Holloway");
        await Published(owner, shown.Id);
        var anonymous = Anonymous(_factory);
        var nobody = await (await anonymous.GetAsync("/api/public/authors/nobody-at-all")).Content.ReadAsStringAsync();

        var page = (await anonymous.GetFromJsonAsync<PublicUniversePage>($"{PublicRoute}?author=wren-holloway"))!;
        Assert.Equal(["Author worlds shown"], page.Items.Select(world => world.Name));
        Assert.Equal(0, (await anonymous.GetFromJsonAsync<PublicUniversePage>($"{PublicRoute}?author=nobody-at-all"))!.TotalCount);
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.GetAsync($"{PublicRoute}?author=NOT_AN_ADDRESS")).StatusCode);

        // Every world private again: the author is gone, indistinguishable from an address nobody holds.
        (await Unpublish(owner, shown.Id)).EnsureSuccessStatusCode();
        var gone = await anonymous.GetAsync("/api/public/authors/wren-holloway");
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
        Assert.Equal(nobody, await gone.Content.ReadAsStringAsync());

        // And back, at the same address.
        await Published(owner, hidden.Id);
        Assert.Equal("Wren Holloway", (await anonymous.GetFromJsonAsync<PublicAuthor>("/api/public/authors/wren-holloway"))!.DisplayName);
    }

    [Fact]
    public async Task An_account_that_never_published_is_not_findable()
    {
        var (owner, _) = await Account(_factory, "author-quiet");
        await Ready(owner, "Author quiet world", author: "Quiet Author");
        await UploadPhoto(owner);
        await PlotTestClient.WithDb(_factory, async db =>
            Assert.Null(await db.Users.Where(user => user.PublicDisplayName == "Quiet Author").Select(user => user.PublicAuthorSlug).SingleAsync()));

        Assert.Equal(HttpStatusCode.NotFound, (await Anonymous(_factory).GetAsync("/api/public/authors/quiet-author")).StatusCode);
    }

    [Fact]
    public async Task A_profile_photo_is_public_only_by_choice_only_as_its_square_and_a_replacement_is_private_again()
    {
        var (owner, _) = await Account(_factory, "author-photo");
        await Published(owner, (await Ready(owner, "Author photo world", author: "Pell Aster")).Id);
        var anonymous = Anonymous(_factory);

        // A photo on the account is not a public photo.
        var photo = await UploadPhoto(owner);
        Assert.Null((await anonymous.GetFromJsonAsync<PublicAuthor>("/api/public/authors/pell-aster"))!.AvatarUrl);
        var wouldBe = PublicAuthorEndpoints.AvatarUrl("pell-aster", photo.ThumbnailId);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(wouldBe)).StatusCode);
        Assert.False((await Settings(owner)).PhotoIsPublic);

        // Shown by choice: the square, as WebP, revalidated, and nothing else of the photo.
        Assert.True((await SetPhoto(owner, true)).PhotoIsPublic);
        var author = (await anonymous.GetFromJsonAsync<PublicAuthor>("/api/public/authors/pell-aster"))!;
        Assert.Equal(wouldBe, author.AvatarUrl);
        var served = await anonymous.GetAsync(author.AvatarUrl);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/webp", served.Content.Headers.ContentType!.MediaType);
        Assert.Equal("no-cache", served.Headers.CacheControl!.ToString());
        var body = await anonymous.GetStringAsync("/api/public/authors/pell-aster");
        Assert.DoesNotContain(photo.AssetId.ToString(), body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("users/", body, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/public/authors/pell-aster/avatar/{photo.AssetId}")).StatusCode);

        // Replaced: the new picture is private until chosen again, and the old address is gone.
        var replacement = await UploadPhoto(owner);
        Assert.False((await Settings(owner)).PhotoIsPublic);
        Assert.Null((await anonymous.GetFromJsonAsync<PublicAuthor>("/api/public/authors/pell-aster"))!.AvatarUrl);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(wouldBe)).StatusCode);

        // Hidden, and removed: gone at the next read, revalidation included.
        await SetPhoto(owner, true);
        var current = PublicAuthorEndpoints.AvatarUrl("pell-aster", replacement.ThumbnailId);
        var tag = (await anonymous.GetAsync(current)).Headers.ETag!;
        await SetPhoto(owner, false);
        Assert.Equal(HttpStatusCode.NotFound, (await Conditional(anonymous, current, tag)).StatusCode);
        await SetPhoto(owner, true);
        (await owner.DeleteAsync("/api/profile/image")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(current)).StatusCode);
        Assert.Equal((false, false), ((await Settings(owner)).HasPhoto, (await Settings(owner)).PhotoIsPublic));

        // Showing a photo needs one.
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync("/api/profile/public-author/photo", new PublicAuthorPhotoRequest(true))).StatusCode);
    }

    [Fact]
    public async Task A_shown_photo_is_not_served_while_its_author_has_no_public_universe()
    {
        var (owner, _) = await Account(_factory, "author-photo-private");
        var universe = await Ready(owner, "Author photo private world", author: "Nell Private");
        await Published(owner, universe.Id);
        var photo = await UploadPhoto(owner);
        await SetPhoto(owner, true);
        var address = PublicAuthorEndpoints.AvatarUrl("nell-private", photo.ThumbnailId);
        Assert.Equal(HttpStatusCode.OK, (await Anonymous(_factory).GetAsync(address)).StatusCode);

        (await Unpublish(owner, universe.Id)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await Anonymous(_factory).GetAsync(address)).StatusCode);
    }

    [Fact]
    public async Task The_public_author_settings_are_the_sessions_own()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Anonymous(_factory).GetAsync("/api/profile/public-author")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await Anonymous(_factory).PutAsJsonAsync("/api/profile/public-author/photo", new PublicAuthorPhotoRequest(true))).StatusCode);
    }

    [Fact]
    public async Task Accounts_already_public_before_author_addresses_get_one_at_startup_from_their_public_name()
    {
        var (owner, _) = await Account(_factory, "author-backfill");
        var universe = await Ready(owner, "Author backfill world", author: "Orla Backfill");
        await Published(owner, universe.Id);

        // As Task 010 left such an account: public, with no author address - so its world is not public either.
        await PlotTestClient.WithDb(_factory, async db =>
        {
            var user = await db.Users.SingleAsync(candidate => candidate.PublicDisplayName == "Orla Backfill");
            user.PublicAuthorSlug = null;
            await db.SaveChangesAsync();
        });
        Assert.Null(await PublicBySlug(Anonymous(_factory), "author-backfill-world"));

        await PlotTestClient.WithDb(_factory, db => PublicAuthorBackfill.BackfillAsync(db, CancellationToken.None));

        Assert.Equal("orla-backfill", (await PublicBySlug(Anonymous(_factory), "author-backfill-world"))!.AuthorSlug);
    }

    // ---------- Helpers ----------

    private static async Task<PublicAuthorSettings> Settings(HttpClient client) =>
        (await client.GetFromJsonAsync<PublicAuthorSettings>("/api/profile/public-author"))!;

    private static async Task<PublicAuthorSettings> SetPhoto(HttpClient client, bool isPublic)
    {
        var response = await client.PutAsJsonAsync("/api/profile/public-author/photo", new PublicAuthorPhotoRequest(isPublic));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<PublicAuthorSettings>())!;
    }

    private static async Task<ProfileImageRef> UploadPhoto(HttpClient client)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Png(600, 400));
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "me.png");
        var response = await client.PutAsync("/api/profile/image", form);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProfileImageRef>())!;
    }

    private static Task<HttpResponseMessage> Conditional(HttpClient client, string address, EntityTagHeaderValue tag)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, address);
        request.Headers.IfNoneMatch.Add(tag);
        return client.SendAsync(request);
    }
}
