using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Schema proposals (issue #59, ADR 0062): an AI stages lore types, field definitions and semantic groups; a person reviews
/// and approves them; only then can entries use the ids they got. Each definition goes through the Types screen's own write
/// path and is held to its rules, plus a batch's: names unique across the universe and the proposal, no orphans from a
/// partial approval, nothing stale applied, nothing deleted, no meaning set by an AI.
/// </summary>
public sealed class AiChangeSchemaTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    private async Task<(HttpClient Owner, string OwnerId, Guid U, Guid Character)> World(string tag)
    {
        var (owner, ownerId) = await PublishingTestClient.Account(_factory, tag);
        var u = (await CreateUniverse(owner, $"World {tag}")).Id;
        return (owner, ownerId, u, await TypeId(owner, u, "Character"));
    }

    private static async Task<List<EntityTypeResponse>> Types(HttpClient client, Guid u) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;

    private static async Task<List<EntityTypeGroupResponse>> Groups(HttpClient client, Guid u) =>
        (await client.GetFromJsonAsync<List<EntityTypeGroupResponse>>($"/api/universes/{u}/entity-type-groups"))!;

    /// <summary>The issue's own example: WEAPON OF ORDER with AURA, POWER and WIELDER, then a weapon that uses them.</summary>
    private static AiChangeOperationInput[] WeaponOfOrder(Guid character) =>
    [
        NewGroup("arms", "Arms"),
        NewType("weapon", new AiLoreTypeInput("WEAPON OF ORDER", "Blades that keep an oath.", Groups: [Ref("arms")])),
        NewField("aura", new AiLoreFieldInput(Ref("weapon"), "AURA", "one_choice", Options: ["Gold", "Silver", "Ash"])),
        NewField("power", new AiLoreFieldInput(Ref("weapon"), "POWER", "number", Required: true)),
        NewField("wielder", new AiLoreFieldInput(Ref("weapon"), "WIELDER", "link", LinksToType: Id(character))),
    ];

    [Fact]
    public async Task A_new_type_with_its_fields_and_group_is_approved_and_then_entries_use_its_ids()
    {
        var (owner, ownerId, u, character) = await World("schemaweapon");

        var proposalId = await StagedSchema(_factory, u, ownerId, WeaponOfOrder(character));

        // Staged is not made: nothing in the schema yet, and the review describes each definition with what it needs.
        Assert.DoesNotContain(await Types(owner, u), type => type.Name == "WEAPON OF ORDER");
        var review = await Read(owner, u, proposalId);
        Assert.All(review.Operations, operation => Assert.Empty(operation.Issues));
        Assert.Equal("New lore type: WEAPON OF ORDER", review.Operations.Single(operation => operation.Key == "weapon").Title);
        var wielder = review.Operations.Single(operation => operation.Key == "wielder");
        Assert.Equal("New field on WEAPON OF ORDER (new): WIELDER", wielder.Title);
        Assert.Contains(wielder.Lines, line => line.Label == "Links to" && line.After == "Entries of type Character");
        Assert.Equal(["weapon"], wielder.DependsOn);
        Assert.Equal(["weapon"], review.Operations.Single(operation => operation.Key == "aura").DependsOn);
        Assert.Contains(review.Operations.Single(operation => operation.Key == "aura").Lines, line => line.Label == "Choices" && line.After == "Gold, Silver, Ash");
        Assert.Equal(["arms"], review.Operations.Single(operation => operation.Key == "weapon").DependsOn);

        var receipt = await ApproveAll(owner, u, proposalId);
        Assert.Equal(["arms", "weapon", "aura", "power", "wielder"], receipt.Applied.Select(line => line.Key));

        // In Types -> WEAPON OF ORDER -> Fields, as if added there by hand, and still editable there.
        var weapon = (await Types(owner, u)).Single(type => type.Name == "WEAPON OF ORDER");
        Assert.Equal(receipt.Applied.Single(line => line.Key == "weapon").ResultId, weapon.Id);
        Assert.Equal(["AURA", "POWER", "WIELDER"], weapon.Fields.Select(field => field.Name));
        var aura = weapon.Fields.Single(field => field.Name == "AURA");
        Assert.Equal(EntityFieldKind.Select, aura.Kind);
        Assert.Equal(["Gold", "Silver", "Ash"], aura.Options.Select(option => option.Value));
        var power = weapon.Fields.Single(field => field.Name == "POWER");
        Assert.True(power.IsRequired);
        var wielderField = weapon.Fields.Single(field => field.Name == "WIELDER");
        Assert.Equal(character, wielderField.TargetEntityTypeId);
        Assert.Null(wielderField.Semantic);
        var arms = (await Groups(owner, u)).Single(group => group.Name == "Arms");
        Assert.Equal([weapon.Id], arms.TypeIds);
        var edited = await owner.PutAsJsonAsync(
            $"/api/universes/{u}/entity-types/{weapon.Id}/fields/{power.Id}",
            new FieldDefinitionRequest("POWER", EntityFieldKind.Number, true, null, "1", null, ExpectedVersion: power.Version));
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);

        // The second stage: a weapon with valid values and a WIELDER link, by the ids the approval made.
        var hero = await CreateEntity(owner, u, "Aldric");
        var catalog = await CatalogAsync(u, ownerId);
        var listed = catalog.LoreTypes.Single(type => type.Name == "WEAPON OF ORDER");
        Assert.Equal(weapon.Id, listed.Id);
        Assert.Equal([arms.Id], listed.GroupIds);
        var entry = await Staged(_factory, u, ownerId, NewLore(
            "oathkeeper",
            weapon.Id,
            "Oathkeeper",
            new AiFieldInput(aura.Id, OptionIds: [aura.Options[1].Id]),
            new AiFieldInput(power.Id, Number: 9),
            new AiFieldInput(wielderField.Id, Entry: Id(hero))));
        var made = (await ApproveAll(owner, u, entry)).Applied.Single().ResultId!.Value;

        var saved = (await owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{u}/entities/{made}"))!;
        Assert.Equal("WEAPON OF ORDER", saved.EntityTypeName);
        Assert.Equal(["Silver"], saved.Fields.Single(field => field.Name == "AURA").OptionValues);
        Assert.Equal(9, saved.Fields.Single(field => field.Name == "POWER").Number);
        Assert.Equal(hero, saved.Fields.Single(field => field.Name == "WIELDER").ReferencedEntityId);

        // A wielder of the wrong type is refused as the save would refuse it.
        var place = await Staged(_factory, u, ownerId, NewLore("vale", await TypeId(owner, u, "Location"), "Vale"));
        var valeId = (await ApproveAll(owner, u, place)).Applied.Single().ResultId!.Value;
        var wrong = await Stage(_factory, u, ownerId, NewLore("bad", weapon.Id, "Bad blade", new AiFieldInput(power.Id, Number: 1), new AiFieldInput(wielderField.Id, Entry: Id(valeId))));
        Assert.Contains(wrong.Issues, issue => issue.Code == AiChangeCodes.Invalid && issue.Message.Contains("WIELDER", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Schema_and_content_never_share_a_proposal_and_need_schema_permission_and_an_editing_role()
    {
        var (_, ownerId, u, character) = await World("schemagate");

        var mixed = await StageSchema(_factory, u, ownerId, NewGroup("g", "Realms of men"), NewLore("e", character, "Someone"));
        Assert.Null(mixed.Proposal);
        Assert.Contains(mixed.Issues, issue => issue.Index is null && issue.Code == AiChangeCodes.Unsupported);

        // An entry point not allowed schema (an app without the tick) stages none, whatever the role.
        var notAllowed = await Stage(_factory, u, ownerId, NewGroup("g", "Realms of men"));
        Assert.Null(notAllowed.Proposal);
        Assert.Equal(AiChangeCodes.NotAllowed, Assert.Single(notAllowed.Issues).Code);

        // A Reviewer suggests content edits; schema is never a suggestion. An Editor may.
        var (_, reviewerId) = await PublishingTestClient.Account(_factory, "schemagate-reviewer");
        await CollaborationTestClient.Join(_factory, u, reviewerId, UniverseRole.Reviewer);
        Assert.Equal(AiChangeCodes.NotAllowed, Assert.Single((await StageSchema(_factory, u, reviewerId, NewGroup("g", "Realms of men"))).Issues).Code);
        var (_, editorId) = await PublishingTestClient.Account(_factory, "schemagate-editor");
        await CollaborationTestClient.Join(_factory, u, editorId, UniverseRole.Editor);
        var byEditor = await StageSchema(_factory, u, editorId, NewGroup("g", "Realms of men"));
        Assert.True(byEditor.Proposal is not null, string.Join("; ", byEditor.Issues.Select(issue => issue.Message)));

        // A Viewer stages nothing at all.
        var (_, viewerId) = await PublishingTestClient.Account(_factory, "schemagate-viewer");
        await CollaborationTestClient.Join(_factory, u, viewerId, UniverseRole.Viewer);
        Assert.Equal(AiChangeCodes.NotAllowed, Assert.Single((await StageSchema(_factory, u, viewerId, NewGroup("g", "Realms of men"))).Issues).Code);

        // Types and groups are never removed, and a field's meaning is not the AI's to set (no member for it at all).
        var removeType = await StageSchema(_factory, u, ownerId, Remove("x", "lore_type", character));
        Assert.Equal(AiChangeCodes.Unsupported, Assert.Single(removeType.Issues).Code);
        Assert.DoesNotContain(typeof(AiLoreFieldInput).GetProperties(), property => property.Name.Contains("Semantic", StringComparison.Ordinal) || property.Name.Contains("Meaning", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Selective_approval_and_rejection_never_leave_an_orphan_definition()
    {
        var (owner, ownerId, u, character) = await World("schemaorphan");
        var proposalId = await StagedSchema(_factory, u, ownerId, WeaponOfOrder(character));
        var proposal = await Read(owner, u, proposalId);

        // A field without its new type is refused whole.
        var alone = await Approve(owner, u, proposal, ["aura"]);
        Assert.Equal(HttpStatusCode.Conflict, alone.StatusCode);
        Assert.Equal(AiChangeCodes.MissingDependency, await Code(alone));

        // Rejecting the type takes every field that needs it; the group alone may still be approved.
        (await Reject(owner, u, proposalId, [Op(proposal, "weapon")])).EnsureSuccessStatusCode();
        proposal = await Read(owner, u, proposalId);
        Assert.All(proposal.Operations.Where(operation => operation.Key is "aura" or "power" or "wielder"), operation =>
        {
            Assert.Equal(AiChangeOperationStatus.Rejected, operation.Status);
            Assert.Equal("needs_rejected", operation.ResolutionNote);
        });
        (await Approve(owner, u, proposal, ["arms"])).EnsureSuccessStatusCode();

        Assert.Equal(AiChangeProposalStatus.PartiallyApproved, (await Read(owner, u, proposalId)).Proposal.Status);
        Assert.DoesNotContain(await Types(owner, u), type => type.Name == "WEAPON OF ORDER");
        Assert.Empty((await Groups(owner, u)).Single(group => group.Name == "Arms").TypeIds);
        await WithDb(_factory, async db => Assert.False(await db.EntityFieldDefinitions.AnyAsync(field => field.Name == "AURA" && field.EntityType!.UniverseId == u)));
    }

    [Fact]
    public async Task Names_are_unique_across_the_universe_and_the_proposal_and_no_type_sits_inside_itself()
    {
        var (owner, ownerId, u, character) = await World("schemanames");
        var archived = await Field(owner, u, character, new FieldDefinitionRequest("Oath", EntityFieldKind.ShortText, false, null, null, null));
        (await owner.PostAsync($"/api/universes/{u}/entity-types/{character}/fields/{archived.Id}/archive", null)).EnsureSuccessStatusCode();

        var staged = await StageSchema(
            _factory,
            u,
            ownerId,
            NewType("dup", new AiLoreTypeInput("Character")),
            NewGroup("g1", "Realms"),
            NewGroup("g2", "Realms"),
            NewField("oath", new AiLoreFieldInput(Id(character), "Oath", "short_text")),
            NewField("f1", new AiLoreFieldInput(Id(character), "Title", "short_text")),
            NewField("f2", new AiLoreFieldInput(Id(character), "Title", "long_text")),
            NewField("odd", new AiLoreFieldInput(Id(character), "Mood", "feelings")),
            NewField("empty", new AiLoreFieldInput(Id(character), "House", "one_choice")));

        Assert.Null(staged.Proposal);
        var codes = staged.Issues.Select(issue => (issue.Id, issue.Code)).ToList();
        Assert.Contains(("dup", AiChangeCodes.Duplicate), codes);
        Assert.Contains(("g2", AiChangeCodes.Duplicate), codes);
        Assert.DoesNotContain(("g1", AiChangeCodes.Duplicate), codes);
        Assert.Contains(staged.Issues, issue => issue.Id == "oath" && issue.Message.Contains("archived", StringComparison.Ordinal));
        Assert.Contains(("f2", AiChangeCodes.Duplicate), codes);
        Assert.Contains(("odd", AiChangeCodes.Invalid), codes);
        Assert.Contains(staged.Issues, issue => issue.Id == "empty" && issue.Message.Contains("option", StringComparison.OrdinalIgnoreCase));

        // A new type beneath Character, and Character beneath it, is a ring of parents.
        var ring = await StageSchema(
            _factory,
            u,
            ownerId,
            NewType("child", new AiLoreTypeInput("Squire", Parent: Id(character))),
            new AiChangeOperationInput("up", "update", "lore_type", character, LoreType: new AiLoreTypeInput(Parent: Ref("child"))));
        Assert.Contains(ring.Issues, issue => issue.Id == "up" && issue.Field == "parent");
    }

    [Fact]
    public async Task A_nested_type_never_inherits_its_parents_fields_and_the_refusal_says_so()
    {
        var (owner, ownerId, u, character) = await World("schemanested");
        var title = await Field(owner, u, character, new FieldDefinitionRequest("Title", EntityFieldKind.ShortText, false, null, null, null));
        var squire = (await ApproveAll(owner, u, await StagedSchema(_factory, u, ownerId, NewType("squire", new AiLoreTypeInput("Squire", Parent: Id(character))))))
            .Applied.Single().ResultId!.Value;

        // The catalog tells the AI before it tries.
        var catalog = await CatalogAsync(u, ownerId);
        Assert.Contains("never inherits its parent's fields", catalog.Notes, StringComparison.Ordinal);
        Assert.Contains("never its parent's", catalog.Schema!.Notes, StringComparison.Ordinal);

        // A Squire using Character's field is refused with the owning type named.
        var staged = await Stage(_factory, u, ownerId, NewLore("pip", squire, "Pip", new AiFieldInput(title.Id, Text: "Sir")));
        Assert.Null(staged.Proposal);
        var issue = Assert.Single(staged.Issues);
        Assert.Equal(AiChangeCodes.NotFound, issue.Code);
        Assert.Contains("belongs to Character, not Squire", issue.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_field_edit_is_held_to_the_types_screen_rules_and_keeps_the_meaning_the_author_gave_it()
    {
        var (owner, ownerId, u, character) = await World("schemaedit");
        var born = await Field(owner, u, character, new FieldDefinitionRequest("Born", EntityFieldKind.Number, false, null, null, null, EntityFieldSemantic.BirthYear));
        var height = await Field(owner, u, character, new FieldDefinitionRequest("Height", EntityFieldKind.Number, false, null, null, null));
        var house = await Field(owner, u, character, new FieldDefinitionRequest("House", EntityFieldKind.Select, false, null, null, ["Ash", "Oak"]));
        await PostJson<EntityDetail>(owner, $"/api/universes/{u}/entities", new EntityRequest(
            character, "Ivo", null, CanonStatus.Draft, null, null,
            [new FieldValueInput(born.Id, null, 300, null, null, null, null), new FieldValueInput(height.Id, null, 180, null, null, null, null), new FieldValueInput(house.Id, null, null, null, null, [house.Options[0].Id], null)]));

        var refused = await StageSchema(
            _factory,
            u,
            ownerId,
            new AiChangeOperationInput("kind", "update", "lore_field", height.Id, Field: new AiLoreFieldInput(Kind: "short_text")),
            new AiChangeOperationInput("meaning", "update", "lore_field", born.Id, Field: new AiLoreFieldInput(Kind: "short_text")),
            new AiChangeOperationInput("choice", "update", "lore_field", house.Id, Field: new AiLoreFieldInput(Options: ["Oak", "Elm"])));
        Assert.Null(refused.Proposal);
        Assert.Contains(refused.Issues, issue => issue.Id == "kind" && issue.Message.Contains("values", StringComparison.Ordinal));
        Assert.Contains(refused.Issues, issue => issue.Id == "meaning" && issue.Message.Contains("birth year", StringComparison.Ordinal));
        Assert.Contains(refused.Issues, issue => issue.Id == "choice" && issue.Message.Contains("Ash", StringComparison.Ordinal));

        var renamed = await StagedSchema(
            _factory,
            u,
            ownerId,
            new AiChangeOperationInput("rename", "update", "lore_field", born.Id, Field: new AiLoreFieldInput(Name: "Year of birth")),
            new AiChangeOperationInput("more", "update", "lore_field", house.Id, Field: new AiLoreFieldInput(Options: ["Ash", "Oak", "Elm"])));
        await ApproveAll(owner, u, renamed);

        var fields = (await Types(owner, u)).Single(type => type.Id == character).Fields;
        var after = fields.Single(field => field.Id == born.Id);
        Assert.Equal(("Year of birth", EntityFieldSemantic.BirthYear), (after.Name, after.Semantic));
        Assert.Equal(["Ash", "Oak", "Elm"], fields.Single(field => field.Id == house.Id).Options.Select(option => option.Value));
    }

    [Fact]
    public async Task A_schema_change_staged_over_something_since_changed_can_only_be_rejected()
    {
        var (owner, ownerId, u, character) = await World("schemastale");
        var title = await Field(owner, u, character, new FieldDefinitionRequest("Title", EntityFieldKind.ShortText, false, null, null, null));
        var proposalId = await StagedSchema(
            _factory,
            u,
            ownerId,
            new AiChangeOperationInput("type", "update", "lore_type", character, LoreType: new AiLoreTypeInput(Description: "People of the realm.")),
            new AiChangeOperationInput("field", "update", "lore_field", title.Id, Field: new AiLoreFieldInput(Required: true)));

        // By hand, meanwhile: the type's icon and the field's name.
        var type = (await Types(owner, u)).Single(row => row.Id == character);
        (await owner.PutAsJsonAsync($"/api/universes/{u}/entity-types/{character}", new EntityTypeRequest(type.Name, type.Description, "sword", type.AccentColor, null))).EnsureSuccessStatusCode();
        (await owner.PutAsJsonAsync(
            $"/api/universes/{u}/entity-types/{character}/fields/{title.Id}",
            new FieldDefinitionRequest("Rank", EntityFieldKind.ShortText, false, null, null, null, ExpectedVersion: title.Version))).EnsureSuccessStatusCode();

        var proposal = await Read(owner, u, proposalId);
        Assert.All(proposal.Operations, operation => Assert.True(operation.IsConflict, operation.Key));
        var approved = await Approve(owner, u, proposal, ["type", "field"]);
        Assert.Equal(AiChangeCodes.CannotApprove, await Code(approved));
        var now = (await Types(owner, u)).Single(row => row.Id == character);
        Assert.Equal("sword", now.Icon);
        Assert.False(now.Fields.Single(field => field.Id == title.Id).IsRequired);
    }

    [Fact]
    public async Task Removing_a_field_archives_it_with_its_values()
    {
        var (owner, ownerId, u, character) = await World("schemaarchive");
        var motto = await Field(owner, u, character, new FieldDefinitionRequest("Motto", EntityFieldKind.ShortText, false, null, null, null));
        var ivo = await PostJson<EntityDetail>(owner, $"/api/universes/{u}/entities", new EntityRequest(
            character, "Ivo", null, CanonStatus.Draft, null, null, [new FieldValueInput(motto.Id, "Onward", null, null, null, null, null)]));

        var proposalId = await StagedSchema(_factory, u, ownerId, Remove("gone", "lore_field", motto.Id));
        var change = (await Read(owner, u, proposalId)).Operations.Single();
        Assert.Equal("Archive the field Motto on Character", change.Title);
        Assert.Contains(change.Impact!.Notes, note => note.Contains("1 entry keeps its value", StringComparison.Ordinal));
        await ApproveAll(owner, u, proposalId);

        var type = (await Types(owner, u)).Single(row => row.Id == character);
        Assert.DoesNotContain(type.Fields, field => field.Id == motto.Id);
        Assert.Contains(type.ArchivedFields!, field => field.Id == motto.Id);
        await WithDb(_factory, async db => Assert.True(await db.EntityFieldValues.AnyAsync(value => value.FieldDefinitionId == motto.Id && value.EntityId == ivo.Id && value.TextValue == "Onward")));

        // Archived once is archived: a second removal finds nothing to archive.
        Assert.Equal(AiChangeCodes.Unsupported, Assert.Single((await StageSchema(_factory, u, ownerId, Remove("again", "lore_field", motto.Id))).Issues).Code);
    }

    [Fact]
    public async Task An_approval_refused_at_its_last_check_applies_nothing_of_the_batch()
    {
        var (owner, ownerId, u, _) = await World("schemaatomic");
        var proposalId = await StagedSchema(
            _factory,
            u,
            ownerId,
            NewGroup("places", "Realms of men"),
            NewType("kingdom", new AiLoreTypeInput("Kingdom", Groups: [Ref("places")])),
            NewType("city", new AiLoreTypeInput("City", Groups: [Ref("places")])));

        // Someone makes a City by hand after the proposal was staged.
        (await owner.PostAsJsonAsync($"/api/universes/{u}/entity-types", new EntityTypeRequest("City", null, null, null, null))).EnsureSuccessStatusCode();

        var proposal = await Read(owner, u, proposalId);
        Assert.Contains(proposal.Operations.Single(operation => operation.Key == "city").Issues, issue => issue.Code == AiChangeCodes.Duplicate);
        var approved = await Approve(owner, u, proposal, ["places", "kingdom", "city"]);
        Assert.Equal(AiChangeCodes.CannotApprove, await Code(approved));
        Assert.DoesNotContain(await Groups(owner, u), group => group.Name == "Realms of men");
        Assert.DoesNotContain(await Types(owner, u), type => type.Name == "Kingdom");

        // What still applies can be approved on its own, together.
        var partly = await Approve(owner, u, proposal, ["places", "kingdom"]);
        Assert.True(partly.IsSuccessStatusCode, await partly.Content.ReadAsStringAsync());
        var places = (await Groups(owner, u)).Single(group => group.Name == "Realms of men");
        Assert.Equal([(await Types(owner, u)).Single(type => type.Name == "Kingdom").Id], places.TypeIds);
    }

    private async Task<AiChangeOptions> CatalogAsync(Guid u, string userId)
    {
        AiChangeOptions? options = null;
        await WithDb(_factory, async db => options = await AiChangeCatalog.ReadAsync(db, u, (await UniverseAccess.RoleAsync(db, u, userId, default))!.Value, default, schemaAllowed: true));
        return options!;
    }
}
