using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Universes;
using static Lorex.Api.Tests.PublishingTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// A universe based on someone else's work (Product refinement 015, ADR 0039).
///
/// The claims this file carries. An author may say their universe is based on another creator's work; the original creator
/// is then required, trimmed, bounded and free of invisible controls, and the public universe names that creator and the
/// work beside its own author, who is its curator on Lorex. The creator is only a name: no author page answers for it.
/// Saying the world is one's own clears the attribution, and a client that leaves attribution out keeps it. A backup
/// carries it from format 17; a version 16 file restores as an original world, and every restored story part is private.
/// Names are invented.
/// </summary>
public sealed class UniverseAttributionTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task An_original_world_names_no_one_but_its_author()
    {
        var (owner, _) = await Account(_factory, "attr-original");
        var universe = await Ready(owner, "Attribution original", author: "Wren Tallow");
        var state = await Published(owner, universe.Id);

        Assert.Null(state.OriginalCreator);
        var world = (await PublicBySlug(Anonymous(_factory), state.PublicSlug!))!;
        Assert.Equal(("Wren Tallow", null, null), (world.AuthorDisplayName, world.OriginalCreator, world.OriginalWork));
    }

    [Fact]
    public async Task A_world_based_on_another_work_credits_its_creator_and_keeps_its_author_as_curator()
    {
        var (owner, _) = await Account(_factory, "attr-external");
        var universe = await Ready(owner, "Attribution external", author: "Ivo Marsh");

        var saved = await Attribute(owner, universe.Id, true, "  Odile Varnas  ", "  The Salt Cycle ");
        Assert.Equal(("Odile Varnas", "The Salt Cycle"), (saved.OriginalCreator, saved.OriginalWork));

        var state = await Published(owner, universe.Id);
        var anonymous = Anonymous(_factory);
        var world = (await PublicBySlug(anonymous, state.PublicSlug!))!;
        Assert.Equal(("Ivo Marsh", "ivo-marsh", "Odile Varnas", "The Salt Cycle"), (world.AuthorDisplayName, world.AuthorSlug, world.OriginalCreator, world.OriginalWork));

        // The curator is the Lorex author with a page; the original creator is a name and nothing else.
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/public/authors/ivo-marsh")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/public/authors/odile-varnas")).StatusCode);
        Assert.Empty((await anonymous.GetFromJsonAsync<PublicUniversePage>($"{PublicRoute}?author=odile-varnas"))!.Items);

        // Explore finds the world by who created the original, and by its title.
        Assert.Contains(state.PublicSlug, (await anonymous.GetFromJsonAsync<PublicUniversePage>($"{PublicRoute}?q=varnas"))!.Items.Select(item => item.Slug));
        Assert.Contains(state.PublicSlug, (await anonymous.GetFromJsonAsync<PublicUniversePage>($"{PublicRoute}?q=salt%20cycle"))!.Items.Select(item => item.Slug));

        // A save that leaves attribution out keeps it; one that says the world is its author's own clears it everywhere.
        await SavedDetails(owner, universe.Id, "A drowned coast where the tide keeps count.", UniverseCategory.Books, UniverseGenres.Fantasy);
        Assert.Equal("Odile Varnas", (await State(owner, universe.Id)).OriginalCreator);

        var own = await Attribute(owner, universe.Id, false, "Odile Varnas", "The Salt Cycle");
        Assert.Equal((null, null), (own.OriginalCreator, own.OriginalWork));
        var body = await anonymous.GetStringAsync($"{PublicRoute}/{state.PublicSlug}");
        Assert.DoesNotContain("Varnas", body, StringComparison.Ordinal);
        Assert.DoesNotContain("Salt Cycle", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Attribution_needs_an_original_creator_and_is_checked_like_every_public_name()
    {
        var (owner, _) = await Account(_factory, "attr-validate");
        var universe = await CreateUniverse(owner, "Attribution checks");
        var u = universe.Id;

        async Task<string[]> Refused(bool based, string? creator, string? work = null)
        {
            var response = await owner.PutAsJsonAsync($"/api/universes/{u}/publication", Request(based, creator, work));
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return [.. document.RootElement.GetProperty("errors").EnumerateObject().Select(error => error.Name)];
        }

        Assert.Equal(["originalCreator"], await Refused(true, null));
        Assert.Equal(["originalCreator"], await Refused(true, "   ", "A work with no creator"));
        Assert.Equal(["originalCreator"], await Refused(true, new string('c', PublicationLimits.OriginalCreatorMaxLength + 1)));
        Assert.Equal(["originalCreator"], await Refused(true, "Odile‮Varnas"));
        Assert.Equal(["originalWork"], await Refused(true, "Odile Varnas", new string('w', PublicationLimits.OriginalWorkMaxLength + 1)));

        // Nothing was stored by any of them; the longest allowed values are.
        Assert.Null((await State(owner, u)).OriginalCreator);
        var longest = await Attribute(owner, u, true, new string('c', PublicationLimits.OriginalCreatorMaxLength), null);
        Assert.Equal((PublicationLimits.OriginalCreatorMaxLength, null), (longest.OriginalCreator!.Length, longest.OriginalWork));
    }

    [Fact]
    public async Task A_backup_carries_attribution_and_a_restore_publishes_nothing_inside_a_story()
    {
        var (owner, _) = await Account(_factory, "attr-backup");
        var universe = await Ready(owner, "Attribution backup");
        var u = universe.Id;
        await Attribute(owner, u, true, "Odile Varnas", "The Salt Cycle");

        var story = (await PlotTestClient.PostJson<StoryDetail>(owner, PlotTestClient.Stories(u), new StoryRequest("Backed tale", null, StoryStatus.Drafting))).Id;
        var scene = await PlotTestClient.CreateScene(owner, u, story, "Backed scene");
        var arc = await PlotTestClient.CreateArc(owner, u, story, "Backed arc");
        (await owner.PostAsync($"{PlotTestClient.Story(u, story)}/scenes/{scene}/publish", null)).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{PlotTestClient.Story(u, story)}/scenes/{scene}/manuscript/publish", null)).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{PlotTestClient.Arc(u, story, arc.Id)}/publish", null)).EnsureSuccessStatusCode();

        var archive = await PlotTestClient.RawArchive(owner, u);
        var backup = BackupOf(archive);
        Assert.Equal(Lorex.Api.Features.Export.UniverseBackup.CurrentVersion, backup.FormatVersion);
        Assert.Equal(("Odile Varnas", "The Salt Cycle"), (backup.Payload.Universe.OriginalCreator, backup.Payload.Universe.OriginalWork));
        Assert.DoesNotContain("visibility", DocumentOf(archive), StringComparison.OrdinalIgnoreCase);

        var restored = await RestoreArchive(owner, archive, "Attribution restored");
        var state = await State(owner, restored.Id);
        Assert.Equal((UniverseVisibility.Private, "Odile Varnas", "The Salt Cycle"), (state.Visibility, state.OriginalCreator, state.OriginalWork));

        var restoredStory = Assert.Single((await owner.GetFromJsonAsync<List<StorySummary>>(PlotTestClient.Stories(restored.Id)))!);
        var restoredScene = Assert.Single((await PlotTestClient.ReadStory(owner, restored.Id, restoredStory.Id)).Scenes);
        Assert.Equal((ContentVisibility.Private, ContentVisibility.Private), (restoredScene.Visibility, restoredScene.ManuscriptVisibility));
        Assert.Equal(ContentVisibility.Private, Assert.Single(await PlotTestClient.Plot(owner, restored.Id, restoredStory.Id)).Visibility);

        // A version 16 file knew nothing of attribution: the world restores as its restorer's own, whatever the file carries.
        var older = Rewrite(Downgrade(archive, 16), root => Payload(root)["universe"]!.AsObject()["originalCreator"] = "Smuggled");
        var fromOlder = await RestoreArchive(owner, older, "Attribution from 16");
        Assert.Null((await State(owner, fromOlder.Id)).OriginalCreator);
    }

    [Fact]
    public async Task A_restore_refuses_a_work_named_without_its_creator()
    {
        var (owner, _) = await Account(_factory, "attr-restore-check");
        var universe = await Ready(owner, "Attribution refused");
        await Attribute(owner, universe.Id, true, "Odile Varnas", "The Salt Cycle");
        var archive = Rewrite(await PlotTestClient.RawArchive(owner, universe.Id), root => Payload(root)["universe"]!.AsObject().Remove("originalCreator"));

        Assert.Equal(HttpStatusCode.BadRequest, (await Validate(owner, archive)).StatusCode);
    }

    private static PublicationDetailsRequest Request(bool based, string? creator, string? work) =>
        new("A drowned coast where the tide keeps count.", UniverseCategory.Books, [UniverseGenres.Fantasy], based, creator, work);

    private static async Task<PublicationState> Attribute(HttpClient client, Guid universeId, bool based, string? creator, string? work)
    {
        var response = await client.PutAsJsonAsync($"/api/universes/{universeId}/publication", Request(based, creator, work));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<PublicationState>())!;
    }
}
