using System.Net.Http.Json;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Progression;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Phase 3 of issue 59 (ADR 0062): an AI stages a new era, a form, an ability and an outfit for one existing character, linked
/// to each other within the one change; approval saves them through the Progression page's own save, on the same entry, with
/// its version and history - and keeps what it left out, pictures included. Nothing is removed by an AI.
/// </summary>
public sealed class AiChangeProgressionTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private async Task<(HttpClient Owner, string OwnerId, Guid U, Guid Bilbo)> World(string tag)
    {
        var (owner, ownerId) = await PublishingTestClient.Account(_factory, tag);
        var u = (await CreateUniverse(owner, $"World {tag}")).Id;
        return (owner, ownerId, u, await CreateEntity(owner, u, "Bilbo Baggins"));
    }

    private static string Route(Guid u, Guid entry) => $"/api/universes/{u}/entities/{entry}/progression";

    private static AiChangeOperationInput Change(string key, Guid entry, AiProgressionInput progression) =>
        new(key, "update", "progression", entry, Progression: progression);

    [Fact]
    public async Task A_new_era_form_ability_and_outfit_for_one_character_are_linked_in_one_change_and_saved_on_that_entry()
    {
        var (owner, ownerId, u, bilbo) = await World("progressnew");
        var entries = await Count(u);

        var proposalId = await Staged(_factory, u, ownerId, Change("bilbo", bilbo, new AiProgressionInput(
            Eras: [new AiEraItemInput(Key: "young", Name: "Young Bilbo"), new AiEraItemInput(Key: "old", Name: "Old Bilbo")],
            Forms: [new AiFormItemInput(Key: "bearer", Name: "Ring-bearer", UnlockEra: new AiProgressionRef(Key: "young"), Eras: [new AiProgressionRef(Key: "young"), new AiProgressionRef(Key: "old")])],
            Abilities: [new AiFormItemInput(Name: "Invisibility", Forms: [new AiProgressionRef(Key: "bearer")], Eras: [new AiProgressionRef(Key: "young")])],
            Appearances: [new AiAppearanceItemInput(Label: "Travelling cloak", Eras: [new AiProgressionRef(Key: "young")], Forms: [new AiProgressionRef(Key: "bearer")])])));

        var change = (await Read(owner, u, proposalId)).Operations.Single();
        Assert.Empty(change.Issues);
        Assert.Equal("Edit the progression of Bilbo Baggins", change.Title);
        Assert.Contains(change.Lines, line => line.Label == "New form" && line.After == "Ring-bearer; in eras Young Bilbo, Old Bilbo; first in Young Bilbo");
        Assert.Contains(change.Lines, line => line.Label == "New ability" && line.After == "Invisibility; of forms Ring-bearer; in eras Young Bilbo");
        Assert.Contains(change.Lines, line => line.Label == "New appearance" && line.After == "Travelling cloak; in eras Young Bilbo; as forms Ring-bearer");
        Assert.Empty((await owner.GetFromJsonAsync<ProgressionResponse>(Route(u, bilbo)))!.Forms ?? []);

        await ApproveAll(owner, u, proposalId);

        var saved = (await owner.GetFromJsonAsync<ProgressionResponse>(Route(u, bilbo)))!;
        var young = saved.Eras.Single(era => era.Name == "Young Bilbo");
        var bearer = saved.Forms!.Single();
        Assert.Equal(["Young Bilbo", "Old Bilbo"], bearer.Eras.Select(era => era.Name));
        Assert.Equal(young.Id, bearer.Unlock.Era!.Id);
        Assert.Equal([bearer.Id], saved.Abilities!.Single().Forms.Select(form => form.Id));
        var cloak = saved.Appearances!.Single();
        Assert.Equal([young.Id], cloak.Eras.Select(era => era.Id));
        Assert.Equal([bearer.Id], cloak.Forms.Select(form => form.Id));
        Assert.Equal(1, saved.Version);

        // The same entry, not one per era, and a version in its history by the approver.
        Assert.Equal(entries, await Count(u));
        await WithDb(_factory, async db =>
            Assert.Equal(ownerId, await db.EntityProgressionRevisions.Where(revision => revision.EntityId == bilbo).Select(revision => revision.ActorUserId).SingleAsync()));
    }

    [Fact]
    public async Task An_edit_keeps_what_it_leaves_out_and_an_outfit_keeps_its_pictures()
    {
        var (owner, ownerId, u, bilbo) = await World("progresskeep");
        var current = (await owner.GetFromJsonAsync<ProgressionResponse>(Route(u, bilbo)))!;
        var stored = await PutJson<ProgressionResponse>(owner, Route(u, bilbo), new ProgressionRequest(
            [new EraInput(null, "Shire years", null, null, null, [], [], [])],
            current.Version,
            Forms: [new FormInput(null, "Burglar", null, null, null, null, [], [])],
            Appearances: [new AppearanceInput(null, "Green waistcoat", null, [], [], [])]));
        var waistcoat = stored.Appearances!.Single();
        (await owner.PutAsync($"/api/universes/{u}/entities/{bilbo}/appearances/{waistcoat.Id}/images", CollaborationTestClient.PngForm())).EnsureSuccessStatusCode();

        var proposalId = await Staged(_factory, u, ownerId, Change("notes", bilbo, new AiProgressionInput(
            Appearances: [new AiAppearanceItemInput(waistcoat.Id, Notes: "Brass buttons.", Forms: [new AiProgressionRef(stored.Forms!.Single().Id)])])));
        await ApproveAll(owner, u, proposalId);

        var after = (await owner.GetFromJsonAsync<ProgressionResponse>(Route(u, bilbo)))!;
        var look = after.Appearances!.Single();
        Assert.Equal(("Green waistcoat", "Brass buttons."), (look.Label, look.Notes));
        Assert.Single(look.Images);
        Assert.Equal(["Burglar"], look.Forms.Select(form => form.Name));
        Assert.Equal(["Shire years"], after.Eras.Select(era => era.Name));
        Assert.Equal("Burglar", after.Forms!.Single().Name);
    }

    [Fact]
    public async Task A_progression_saved_since_staging_is_never_overwritten()
    {
        var (owner, ownerId, u, bilbo) = await World("progressstale");
        var proposalId = await Staged(_factory, u, ownerId, Change("p", bilbo, new AiProgressionInput(Eras: [new AiEraItemInput(Key: "a", Name: "Adventure")])));

        var current = (await owner.GetFromJsonAsync<ProgressionResponse>(Route(u, bilbo)))!;
        await PutJson<ProgressionResponse>(owner, Route(u, bilbo), new ProgressionRequest([new EraInput(null, "By hand", null, null, null, [], [], [])], current.Version));

        var proposal = await Read(owner, u, proposalId);
        Assert.True(proposal.Operations.Single().IsConflict);
        Assert.Equal(AiChangeCodes.CannotApprove, await Code(await Approve(owner, u, proposal, ["p"])));
        Assert.Equal(["By hand"], (await owner.GetFromJsonAsync<ProgressionResponse>(Route(u, bilbo)))!.Eras.Select(era => era.Name));
    }

    [Fact]
    public async Task Links_are_this_entrys_or_this_changes_and_nothing_is_removed_by_an_ai()
    {
        var (owner, ownerId, u, bilbo) = await World("progresslinks");
        var frodo = await CreateEntity(owner, u, "Frodo");
        var frodoEra = (await PutJson<ProgressionResponse>(owner, Route(u, frodo), new ProgressionRequest([new EraInput(null, "Quest", null, null, null, [], [], [])], 0))).Eras.Single().Id;

        var refused = await Stage(
            _factory,
            u,
            ownerId,
            Change("foreign", bilbo, new AiProgressionInput(Forms: [new AiFormItemInput(Key: "f", Name: "Hero", Eras: [new AiProgressionRef(frodoEra)])])),
            Change("ghost", frodo, new AiProgressionInput(Forms: [new AiFormItemInput(Key: "g", Name: "Ghost", Eras: [new AiProgressionRef(Key: "nowhere")])])));
        Assert.Contains(refused.Issues, issue => issue.Id == "foreign" && issue.Code == AiChangeCodes.NotFound);
        Assert.Contains(refused.Issues, issue => issue.Id == "ghost" && issue.Code == AiChangeCodes.NotFound);

        var keyless = await Stage(_factory, u, ownerId, Change("k", bilbo, new AiProgressionInput(Eras: [new AiEraItemInput(Name: "Unnamed key")])));
        Assert.Contains(keyless.Issues, issue => issue.Message.Contains("key", StringComparison.Ordinal));
        Assert.Equal(AiChangeCodes.Unsupported, Assert.Single((await Stage(_factory, u, ownerId, Remove("r", "progression", bilbo))).Issues).Code);

        // A name the save itself refuses - two eras named alike - is refused here, by the save's own check.
        var twice = await Stage(_factory, u, ownerId, Change("t", bilbo, new AiProgressionInput(Eras: [new AiEraItemInput(Key: "a", Name: "Twin"), new AiEraItemInput(Key: "b", Name: "twin")])));
        Assert.NotEmpty(twice.Issues);

        // A Reviewer suggests edits to entries, stories and scenes only.
        var (_, reviewerId) = await PublishingTestClient.Account(_factory, "progresslinks-reviewer");
        await CollaborationTestClient.Join(_factory, u, reviewerId, UniverseRole.Reviewer);
        Assert.Equal(AiChangeCodes.NotAllowed, Assert.Single((await Stage(_factory, u, reviewerId, Change("p", bilbo, new AiProgressionInput(Eras: [new AiEraItemInput(Key: "a", Name: "Late")])))).Issues).Code);
    }

    [Fact]
    public async Task A_progression_change_is_content_and_shares_a_proposal_with_the_entry_it_belongs_to()
    {
        var (owner, ownerId, u, bilbo) = await World("progressmixed");
        var proposalId = await Staged(
            _factory,
            u,
            ownerId,
            EditLore("summary", bilbo, new AiLoreInput(Summary: "A hobbit of the Shire.")),
            Change("eras", bilbo, new AiProgressionInput(Eras: [new AiEraItemInput(Key: "y", Name: "Young")])));
        await ApproveAll(owner, u, proposalId);
        Assert.Equal("A hobbit of the Shire.", (await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{bilbo}"))!.Summary);
        Assert.Equal(["Young"], (await owner.GetFromJsonAsync<ProgressionResponse>(Route(u, bilbo)))!.Eras.Select(era => era.Name));

        var mixed = await StageSchema(_factory, u, ownerId, NewGroup("g", "Hobbits"), Change("eras2", bilbo, new AiProgressionInput(Eras: [new AiEraItemInput(Key: "o", Name: "Old")])));
        Assert.Contains(mixed.Issues, issue => issue.Index is null && issue.Code == AiChangeCodes.Unsupported);
    }

    [Fact]
    public async Task The_catalog_gives_one_entrys_progression_ids_when_asked()
    {
        var (owner, ownerId, u, bilbo) = await World("progresscatalog");
        var saved = await PutJson<ProgressionResponse>(owner, Route(u, bilbo), new ProgressionRequest(
            [new EraInput(null, "Shire years", null, null, null, [], [], [])], 0, Forms: [new FormInput(null, "Burglar", null, null, null, null, [], [])]));

        AiChangeOptions? options = null;
        await WithDb(_factory, async db => options = await AiChangeCatalog.ReadAsync(db, u, UniverseRole.Owner, default, progressionOf: bilbo));
        var progression = options!.Progression!;
        Assert.Equal((bilbo, "Bilbo Baggins", saved.Version), (progression.EntityId, progression.Name, progression.Version));
        Assert.Equal([saved.Eras.Single().Id], progression.Eras.Select(era => era.Id));
        Assert.Equal("Burglar", progression.Forms.Single().Name);
        Assert.Contains("update progression", options.Allowed);

        await WithDb(_factory, async db => options = await AiChangeCatalog.ReadAsync(db, u, UniverseRole.Owner, default, progressionOf: Guid.NewGuid()));
        Assert.Null(options!.Progression);
        _ = ownerId;
    }

    private async Task<int> Count(Guid u)
    {
        var count = 0;
        await WithDb(_factory, async db => count = await db.Entities.CountAsync(entity => entity.UniverseId == u));
        return count;
    }
}
