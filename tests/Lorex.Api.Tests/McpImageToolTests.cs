using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Mcp;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Progression;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.McpTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A shared universe whose entry has a profile picture, a look with a picture, a form with a look and a picture of its
/// own, a form with nothing, two entries sharing an alias, a trashed entry with a picture, and a second universe with a
/// picture - and a Viewer's connection to the first universe. Made once for the class.
/// </summary>
public sealed class McpImageToolFixture : IAsyncLifetime
{
    public LorexApiFactory Api { get; } = new();

    internal SharedWorld World { get; private set; } = null!;

    internal Connection Viewer { get; private set; } = null!;

    public Guid AuraForm { get; private set; }

    public Guid ShadowForm { get; private set; }

    public Guid AuraLook { get; private set; }

    public Guid AuraPicture { get; private set; }

    public Guid Binned { get; private set; }

    public Guid BinnedImage { get; private set; }

    public Guid OtherEntry { get; private set; }

    public Guid OtherImage { get; private set; }

    public async Task InitializeAsync()
    {
        World = await NewSharedWorld(Api, "mcpimages");
        Viewer = await Connect(Api, await SignIn(Api, "user-mcpimages-viewer"), World.U);

        // Two forms, then a second look linked to one of them with a picture of its own. The shared world's look,
        // "Mourning grey", keeps its picture and is linked to nothing.
        var route = $"/api/universes/{World.U}/entities/{World.Entry}/progression";
        var current = (await World.Owner.GetFromJsonAsync<ProgressionResponse>(route))!;
        var withForms = await SaveAsync(route, new ProgressionRequest(
            null, current.Version, Forms: [Form("Aura level 2"), Form("Shadow")]));
        AuraForm = withForms.Forms!.Single(form => form.Name == "Aura level 2").Id;
        ShadowForm = withForms.Forms!.Single(form => form.Name == "Shadow").Id;
        var withLook = await SaveAsync(route, new ProgressionRequest(
            null,
            withForms.Version,
            Appearances:
            [
                new AppearanceInput(World.Appearance, "Mourning grey", null, [], [], []),
                new AppearanceInput(null, "Aura armour", "Plates that glow with the second aura.", [], [AuraForm], []),
            ]));
        AuraLook = withLook.Appearances!.Single(look => look.Label == "Aura armour").Id;
        AuraPicture = (await (await World.Owner.PutAsync(
                $"/api/universes/{World.U}/entities/{World.Entry}/appearances/{AuraLook}/images", PngForm())).EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<AppearanceImageRef>())!.Id;

        // Two entries answering to one alias, so a name can be ambiguous.
        await CreateAliasedAsync("Ash Ember", "Ember");
        await CreateAliasedAsync("Dusk Ember", "Ember");

        Binned = await CreateEntity(World.Owner, World.U, "Binned Vale");
        BinnedImage = (await UploadImage(World.Owner, World.U, Binned)).AssetId;
        (await World.Owner.DeleteAsync($"/api/universes/{World.U}/entities/{Binned}")).EnsureSuccessStatusCode();

        var other = (await CreateUniverse(World.Owner, "Elsewhere")).Id;
        OtherEntry = await CreateEntity(World.Owner, other, "Ember Vale");
        OtherImage = (await UploadImage(World.Owner, other, OtherEntry)).AssetId;
    }

    public Task DisposeAsync()
    {
        Api.Dispose();
        return Task.CompletedTask;
    }

    private static FormInput Form(string name) => new(null, name, null, null, null, null, [], []);

    private async Task<ProgressionResponse> SaveAsync(string route, ProgressionRequest request)
    {
        var response = await World.Owner.PutAsJsonAsync(route, request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ProgressionResponse>())!;
    }

    private async Task CreateAliasedAsync(string name, string alias)
    {
        var response = await World.Owner.PostAsJsonAsync(
            $"/api/universes/{World.U}/entities",
            new EntityRequest(World.CharacterType, name, null, CanonStatus.Canon, [alias], null, null));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }
}

/// <summary>
/// The picture tools (issue #56): what a listing says about an entry's own picture and its appearances' pictures, that a
/// form has only the pictures explicitly linked to it, how names resolve and when they are refused, that every variant is
/// real image content with honest metadata, the bounds, and that an id from elsewhere, the Trash, a mismatched pair or a
/// revoked connection fetches nothing.
/// </summary>
public sealed class McpImageToolTests(McpImageToolFixture fixture) : IClassFixture<McpImageToolFixture>
{
    private LorexApiFactory Api => fixture.Api;

    private SharedWorld W => fixture.World;

    [Fact]
    public async Task A_listing_tells_the_profile_picture_from_appearance_pictures_and_names_their_forms()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);
        var listing = await Call(client, "list_lore_images", new() { ["lore"] = W.Entry.ToString() });

        Assert.Equal(W.Entry, listing.GetProperty("lore").GetProperty("id").GetGuid());
        Assert.Equal("Ember Vale", listing.GetProperty("lore").GetProperty("name").GetString());
        Assert.EndsWith($"/app/universes/{W.U}/lore/{W.Entry}", listing.GetProperty("lore").GetProperty("url").GetString(), StringComparison.Ordinal);
        Assert.False(listing.TryGetProperty("selection", out _));
        Assert.False(listing.TryGetProperty("note", out _));

        var profile = listing.GetProperty("profileImage");
        Assert.Equal(W.Image.AssetId, profile.GetProperty("imageId").GetGuid());
        Assert.Equal("profile", profile.GetProperty("kind").GetString());
        Assert.Equal("image/png", profile.GetProperty("contentType").GetString());
        Assert.Equal(640, profile.GetProperty("width").GetInt32());
        Assert.Equal(480, profile.GetProperty("height").GetInt32());
        Assert.Equal(W.Image.ByteSize, profile.GetProperty("bytes").GetInt64());

        var looks = listing.GetProperty("appearances").EnumerateArray().ToList();
        Assert.Equal(["Mourning grey", "Aura armour"], looks.Select(look => look.GetProperty("label").GetString()));
        var grey = looks[0];
        Assert.Empty(grey.GetProperty("forms").EnumerateArray());
        var greyPicture = Assert.Single(grey.GetProperty("images").EnumerateArray());
        Assert.Equal(W.AppearanceImage, greyPicture.GetProperty("imageId").GetGuid());
        Assert.Equal("appearance", greyPicture.GetProperty("kind").GetString());
        Assert.Equal(0, greyPicture.GetProperty("position").GetInt32());
        var aura = looks[1];
        Assert.Equal(fixture.AuraLook, aura.GetProperty("id").GetGuid());
        Assert.Equal("Aura level 2", Assert.Single(aura.GetProperty("forms").EnumerateArray()).GetProperty("name").GetString());
        Assert.Equal(fixture.AuraPicture, Assert.Single(aura.GetProperty("images").EnumerateArray()).GetProperty("imageId").GetGuid());
        Assert.EndsWith($"/lore/{W.Entry}/progression", aura.GetProperty("url").GetString(), StringComparison.Ordinal);
        Assert.Equal(2, listing.GetProperty("appearancePictures").GetInt32());

        var forms = listing.GetProperty("forms").EnumerateArray().ToDictionary(form => form.GetProperty("name").GetString()!);
        Assert.Equal(1, forms["Aura level 2"].GetProperty("pictures").GetInt32());
        Assert.Equal(0, forms["Shadow"].GetProperty("pictures").GetInt32());
        Assert.Equal("Youth", Assert.Single(listing.GetProperty("eras").EnumerateArray()).GetProperty("name").GetString());
    }

    [Fact]
    public async Task A_form_without_a_linked_picture_lists_none_and_never_substitutes_the_portrait()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        foreach (var form in new[] { "shadow", fixture.ShadowForm.ToString() })
        {
            var listing = await Call(client, "list_lore_images", new() { ["lore"] = W.Entry.ToString(), ["form"] = form });

            Assert.Equal(fixture.ShadowForm, listing.GetProperty("selection").GetProperty("form").GetProperty("id").GetGuid());
            Assert.Equal("Shadow", listing.GetProperty("selection").GetProperty("form").GetProperty("name").GetString());
            Assert.Empty(listing.GetProperty("appearances").EnumerateArray());
            Assert.Equal(0, listing.GetProperty("appearancePictures").GetInt32());

            // The portrait is still there - as the portrait, said to be not this form's.
            Assert.Equal("profile", listing.GetProperty("profileImage").GetProperty("kind").GetString());
            var note = listing.GetProperty("note").GetString()!;
            Assert.Contains("No picture is explicitly linked to the form 'Shadow'", note, StringComparison.Ordinal);
            Assert.Contains("base portrait", note, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task A_form_s_pictures_are_exactly_those_of_the_appearances_linked_to_it()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var aura = await Call(client, "list_lore_images", new() { ["lore"] = W.Entry.ToString(), ["form"] = "Aura level 2" });
        var look = Assert.Single(aura.GetProperty("appearances").EnumerateArray());
        Assert.Equal("Aura armour", look.GetProperty("label").GetString());
        Assert.Equal(fixture.AuraPicture, Assert.Single(look.GetProperty("images").EnumerateArray()).GetProperty("imageId").GetGuid());
        Assert.False(aura.TryGetProperty("note", out _));

        // An era nothing was ticked for has no pictures, whatever the entry holds.
        var youth = await Call(client, "list_lore_images", new() { ["lore"] = W.Entry.ToString(), ["era"] = "Youth" });
        Assert.Empty(youth.GetProperty("appearances").EnumerateArray());
        Assert.Contains("the era 'Youth'", youth.GetProperty("note").GetString(), StringComparison.Ordinal);

        var grey = await Call(client, "list_lore_images", new() { ["lore"] = W.Entry.ToString(), ["appearance"] = "mourning grey" });
        Assert.Equal(
            W.AppearanceImage,
            Assert.Single(Assert.Single(grey.GetProperty("appearances").EnumerateArray()).GetProperty("images").EnumerateArray()).GetProperty("imageId").GetGuid());
    }

    [Fact]
    public async Task Names_resolve_exactly_and_an_ambiguous_one_is_refused_with_the_candidates()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var byName = await Call(client, "list_lore_images", new() { ["lore"] = "ember vale" });
        Assert.Equal(W.Entry, byName.GetProperty("lore").GetProperty("id").GetGuid());

        var ambiguous = await Refused(client, "list_lore_images", new() { ["lore"] = "Ember" }, "ambiguous");
        var candidates = ambiguous.GetProperty("details").GetProperty("candidates").EnumerateArray().ToList();
        Assert.Equal(["Ash Ember", "Dusk Ember"], candidates.Select(candidate => candidate.GetProperty("name").GetString()));
        Assert.All(candidates, candidate => Assert.NotEqual(Guid.Empty, candidate.GetProperty("id").GetGuid()));

        await Refused(client, "list_lore_images", new() { ["lore"] = "Nobody at all" }, "not_found");
        await Refused(client, "list_lore_images", new() { ["lore"] = " " }, "bad_arguments");

        var noForm = await Refused(client, "list_lore_images", new() { ["lore"] = W.Entry.ToString(), ["form"] = "Aura level 9" }, "form_not_found");
        Assert.Equal(
            ["Aura level 2", "Shadow"],
            noForm.GetProperty("details").GetProperty("options").EnumerateArray().Select(option => option.GetProperty("name").GetString()));
        await Refused(client, "list_lore_images", new() { ["lore"] = W.Entry.ToString(), ["appearance"] = Guid.NewGuid().ToString() }, "appearance_not_found");
    }

    [Fact]
    public async Task Every_variant_is_real_image_content_with_honest_metadata()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        // The preview: the whole picture, WebP, already within the bound so at its own size.
        var (preview, about) = await Fetch(client, W.Entry, W.Image.AssetId);
        Assert.Equal("image/webp", preview.MimeType);
        var shape = Shape(preview);
        Assert.Equal((640, 480), (shape.Width, shape.Height));
        Assert.Equal("preview", about.GetProperty("variant").GetString());
        Assert.Equal("profile", about.GetProperty("kind").GetString());
        Assert.Equal((640, 480), (about.GetProperty("width").GetInt32(), about.GetProperty("height").GetInt32()));
        Assert.Equal("Ember Vale", about.GetProperty("loreName").GetString());
        Assert.False(about.TryGetProperty("appearance", out _));
        Assert.EndsWith($"/lore/{W.Entry}", about.GetProperty("url").GetString(), StringComparison.Ordinal);

        // The thumbnail: the stored square, as it is.
        var (thumbnail, thumbnailAbout) = await Fetch(client, W.Entry, W.Image.AssetId, "thumbnail");
        Assert.Equal("image/webp", thumbnail.MimeType);
        shape = Shape(thumbnail);
        Assert.Equal((320, 320), (shape.Width, shape.Height));
        Assert.Equal((320, 320), (thumbnailAbout.GetProperty("width").GetInt32(), thumbnailAbout.GetProperty("height").GetInt32()));

        // The original: the bytes exactly as uploaded, in their own type.
        var (original, originalAbout) = await Fetch(client, W.Entry, W.Image.AssetId, "Original");
        Assert.Equal("image/png", original.MimeType);
        var bytes = original.DecodedData.ToArray();
        Assert.Equal(W.Image.ByteSize, bytes.Length);
        Assert.Equal(W.Image.ByteSize, originalAbout.GetProperty("bytes").GetInt64());
        Assert.Equal("original", originalAbout.GetProperty("variant").GetString());
        Assert.Equal("image/png", Image.DetectFormat(bytes).DefaultMimeType);

        // An appearance's picture says whose look it is and what that look is linked to.
        var (_, lookAbout) = await Fetch(client, W.Entry, fixture.AuraPicture, "thumbnail");
        Assert.Equal("appearance", lookAbout.GetProperty("kind").GetString());
        Assert.Equal("Aura armour", lookAbout.GetProperty("appearance").GetProperty("label").GetString());
        Assert.Equal("Aura level 2", Assert.Single(lookAbout.GetProperty("appearance").GetProperty("forms").EnumerateArray()).GetString());
        Assert.EndsWith("/progression", lookAbout.GetProperty("url").GetString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_large_original_is_refused_inline_and_its_preview_is_bounded()
    {
        var mural = await CreateEntity(W.Owner, W.U, "Mural of the Vale");
        var uploaded = await W.Owner.PutAsync($"/api/universes/{W.U}/entities/{mural}/image", Form(NoisePng(1500)));
        Assert.True(uploaded.IsSuccessStatusCode, await uploaded.Content.ReadAsStringAsync());
        var image = (await uploaded.Content.ReadFromJsonAsync<EntityImageRef>())!;
        Assert.True(image.ByteSize > McpLimits.ImageOriginalBytes, $"The fixture is only {image.ByteSize} bytes.");

        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var refused = await Refused(client, "get_lore_image", new() { ["loreId"] = mural.ToString(), ["imageId"] = image.AssetId.ToString(), ["variant"] = "original" }, "image_too_large");
        Assert.Equal(image.ByteSize, refused.GetProperty("details").GetProperty("bytes").GetInt64());

        var (preview, about) = await Fetch(client, mural, image.AssetId);
        var shape = Shape(preview);
        Assert.Equal((McpLimits.ImagePreviewSide, McpLimits.ImagePreviewSide), (shape.Width, shape.Height));
        Assert.True(preview.DecodedData.Length < 1024 * 1024, "The preview is not small.");
        Assert.Equal(image.ByteSize, about.GetProperty("originalBytes").GetInt64());
        Assert.Equal(1500, about.GetProperty("originalWidth").GetInt32());
    }

    [Fact]
    public async Task An_original_whose_stored_bytes_outgrow_its_recorded_size_is_refused_whole_and_never_sent_in_part()
    {
        // The row says a small picture; the store holds a larger one under the same key, as a store that stopped being
        // Lorex's might. Within the upload ceiling, so the preview and thumbnail paths still read it.
        var mirror = await CreateEntity(W.Owner, W.U, "Mirror of the Vale");
        var image = await UploadImage(W.Owner, W.U, mirror);
        Assert.True(image.ByteSize < McpLimits.ImageOriginalBytes);
        var originalKey = Assert.Single(Api.Media.Keys, key => key.Contains(image.AssetId.ToString("D"), StringComparison.Ordinal) && key.Contains("original", StringComparison.Ordinal));
        var swollen = NoisePng(1400);
        Assert.InRange(swollen.Length, McpLimits.ImageOriginalBytes + 1, ImagePreparation.MaxUploadBytes);
        using (var content = new MemoryStream(swollen, writable: false))
        {
            await Api.Media.PutAsync(originalKey, content, "image/png", CancellationToken.None);
        }

        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        var result = await client.CallToolAsync(
            "get_lore_image",
            new Dictionary<string, object?> { ["loreId"] = mirror.ToString(), ["imageId"] = image.AssetId.ToString(), ["variant"] = "original" });
        Assert.True(result.IsError, Text(result));
        Assert.DoesNotContain(result.Content, block => block is ImageContentBlock);
        using var json = JsonDocument.Parse(Text(result));
        Assert.Equal("image_too_large", json.RootElement.GetProperty("error").GetString());
        Assert.Equal(McpLimits.ImageOriginalBytes, json.RootElement.GetProperty("details").GetProperty("limit").GetInt64());

        // The same object, read for a preview or the thumbnail, is within what Lorex stores and still comes back.
        var (preview, _) = await Fetch(client, mirror, image.AssetId);
        Assert.Equal("image/webp", preview.MimeType);
        var (thumbnail, _) = await Fetch(client, mirror, image.AssetId, "thumbnail");
        Assert.Equal("image/webp", thumbnail.MimeType);
    }

    [Fact]
    public async Task Pictures_of_another_universe_the_Trash_a_mismatched_pair_or_nowhere_are_not_found()
    {
        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);

        foreach (var (lore, image) in new (Guid, Guid)[]
                 {
                     (fixture.OtherEntry, fixture.OtherImage),
                     (fixture.Binned, fixture.BinnedImage),
                     (W.Other, W.Image.AssetId),
                     (W.Other, fixture.AuraPicture),
                     (W.Entry, Guid.NewGuid()),
                     (Guid.NewGuid(), W.Image.AssetId),
                 })
        {
            await Refused(client, "get_lore_image", new() { ["loreId"] = lore.ToString(), ["imageId"] = image.ToString() }, "not_found");
        }

        await Refused(client, "get_lore_image", new() { ["loreId"] = "not-an-id", ["imageId"] = W.Image.AssetId.ToString() }, "not_found");
        await Refused(client, "get_lore_image", new() { ["loreId"] = W.Entry.ToString(), ["imageId"] = W.Image.AssetId.ToString(), ["variant"] = "huge" }, "bad_arguments");

        await Refused(client, "list_lore_images", new() { ["lore"] = fixture.OtherEntry.ToString() }, "not_found");
        await Refused(client, "list_lore_images", new() { ["lore"] = fixture.Binned.ToString() }, "not_found");
        await Refused(client, "list_lore_images", new() { ["lore"] = "Binned Vale" }, "not_found");
    }

    [Fact]
    public async Task A_picture_whose_object_the_store_lost_is_not_found_while_the_rest_still_reads()
    {
        var ghost = await CreateEntity(W.Owner, W.U, "Ghost of the Vale");
        var image = await UploadImage(W.Owner, W.U, ghost);
        var thumbnailKey = Assert.Single(Api.Media.Keys, key => key.Contains(image.AssetId.ToString("D"), StringComparison.Ordinal) && key.Contains("thumbnail", StringComparison.Ordinal));
        await Api.Media.DeleteAsync(thumbnailKey, CancellationToken.None);

        await using var client = await SdkClient(Api, W.U, fixture.Viewer.AccessToken);
        await Refused(client, "get_lore_image", new() { ["loreId"] = ghost.ToString(), ["imageId"] = image.AssetId.ToString(), ["variant"] = "thumbnail" }, "not_found");
        var (preview, _) = await Fetch(client, ghost, image.AssetId);
        Assert.Equal("image/webp", preview.MimeType);
    }

    [Fact]
    public async Task Every_member_role_fetches_a_picture_and_a_revoked_connection_no_longer_can()
    {
        foreach (var who in Members)
        {
            var connection = await Connect(Api, await SignIn(Api, $"user-mcpimages-{who.ToString().ToLowerInvariant()}"), W.U);
            await using var client = await SdkClient(Api, W.U, connection.AccessToken);
            var (thumbnail, _) = await Fetch(client, W.Entry, W.Image.AssetId, "thumbnail");
            Assert.Equal("image/webp", thumbnail.MimeType);
        }

        var browser = await SignIn(Api, "user-mcpimages-reviewer");
        var revocable = await Connect(Api, browser, W.U);
        var fetch = new
        {
            jsonrpc = "2.0",
            id = 7,
            method = "tools/call",
            @params = new { name = "get_lore_image", arguments = new { loreId = W.Entry.ToString(), imageId = W.Image.AssetId.ToString(), variant = "thumbnail" } },
        };

        var before = await Post(Api.CreateClient(), W.U, revocable.AccessToken, fetch);
        Assert.Equal(HttpStatusCode.OK, before.StatusCode);
        var content = (await Message(before)).GetProperty("result").GetProperty("content");
        Assert.Equal("image", content[0].GetProperty("type").GetString());
        Assert.Equal("image/webp", content[0].GetProperty("mimeType").GetString());
        var previewBytes = Convert.FromBase64String(content[0].GetProperty("data").GetString()!);
        Assert.NotEmpty(previewBytes);
        Assert.Equal("Webp", Image.DetectFormat(previewBytes).Name);
        var rawShape = Image.Identify(previewBytes)!;
        Assert.Equal((320, 320), (rawShape.Width, rawShape.Height));
        var viewText = content[1].GetProperty("text").GetString()!;
        Assert.Contains("[open the LoreX Lore page](", viewText, StringComparison.Ordinal);
        Assert.Contains($"/app/universes/{W.U}/lore/{W.Entry}", viewText, StringComparison.Ordinal);
        Assert.Contains("Sign-in and current access to this universe are required", viewText, StringComparison.Ordinal);
        Assert.Equal("text", content[2].GetProperty("type").GetString());

        var connections = (await browser.GetFromJsonAsync<List<ConnectedApp>>("/api/profile/connected-apps"))!;
        var target = connections.Single(app => app.CreatedAt == connections.Max(other => other.CreatedAt)).Id;
        Assert.Equal(HttpStatusCode.NoContent, (await browser.DeleteAsync($"/api/profile/connected-apps/{target}")).StatusCode);

        var after = await Post(Api.CreateClient(), W.U, revocable.AccessToken, fetch);
        Assert.Equal(HttpStatusCode.Unauthorized, after.StatusCode);
        Assert.Contains("invalid_token", after.Headers.WwwAuthenticate.ToString(), StringComparison.Ordinal);
    }

    // ---------- Helpers ----------

    private static async Task<JsonElement> Call(McpClient client, string tool, Dictionary<string, object?> arguments)
    {
        var result = await client.CallToolAsync(tool, arguments);
        Assert.False(result.IsError ?? false, Text(result));
        using var json = JsonDocument.Parse(Text(result));
        return json.RootElement.Clone();
    }

    private static async Task<JsonElement> Refused(McpClient client, string tool, Dictionary<string, object?> arguments, string code)
    {
        var result = await client.CallToolAsync(tool, arguments);
        Assert.True(result.IsError, $"{tool} was not refused: {Text(result)}");
        using var json = JsonDocument.Parse(Text(result));
        Assert.Equal(code, json.RootElement.GetProperty("error").GetString());
        return json.RootElement.Clone();
    }

    /// <summary>A picture: the image block, and the text block of metadata after it.</summary>
    private static async Task<(ImageContentBlock Image, JsonElement About)> Fetch(McpClient client, Guid lore, Guid image, string? variant = null)
    {
        Dictionary<string, object?> arguments = new() { ["loreId"] = lore.ToString(), ["imageId"] = image.ToString() };
        if (variant is not null)
        {
            arguments["variant"] = variant;
        }

        var result = await client.CallToolAsync("get_lore_image", arguments);
        Assert.False(result.IsError ?? false, Text(result));
        Assert.Equal(3, result.Content.Count);
        var picture = Assert.IsType<ImageContentBlock>(result.Content[0]);
        var fallback = Assert.IsType<TextContentBlock>(result.Content[1]).Text;
        Assert.Contains("Sign-in and current access to this universe are required", fallback, StringComparison.Ordinal);
        using var json = JsonDocument.Parse(Assert.IsType<TextContentBlock>(result.Content[2]).Text);
        return (picture, json.RootElement.Clone());
    }

    /// <summary>The text block: a listing's only block, a picture's second.</summary>
    private static string Text(CallToolResult result) => result.Content.OfType<TextContentBlock>().Last().Text;

    private static ImageInfo Shape(ImageContentBlock block) => Image.Identify(block.DecodedData.Span);

    private static MultipartFormDataContent Form(byte[] png)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "mural.png");
        return form;
    }

    /// <summary>A square of noise, which PNG cannot compress: about three bytes a pixel.</summary>
    private static byte[] NoisePng(int side)
    {
        var random = new Random(56);
        using var image = new Image<Rgb24>(side, side);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = new Rgb24((byte)random.Next(256), (byte)random.Next(256), (byte)random.Next(256));
                }
            }
        });
        using var buffer = new MemoryStream();
        image.SaveAsPng(buffer);
        return buffer.ToArray();
    }
}
