using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.AiChangeTestClient;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Issue #61 (ADR 0007 amendment): a link field limited to a parent type accepts entries of that type and of every type nested
/// beneath it, at any depth, and still refuses unrelated types and other universes' entries - by one rule, in an entry's save,
/// an AI proposal's staging and its approval, a Lore filter and a backup. A move that would leave such a link outside the
/// branch is refused, as leaving a group is.
/// </summary>
public sealed class NestedTypeLinkTargetTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;

    /// <summary>
    /// Runes > Nature Runes > Verdant Runes, and Corrupted Runes beneath Runes; Kingdoms apart. Corrupted Runes' "Base rune"
    /// is limited to Runes. One entry of each type.
    /// </summary>
    private sealed record World(
        HttpClient Client,
        string UserId,
        Guid U,
        Guid Runes,
        Guid Nature,
        Guid Verdant,
        Guid Corrupted,
        Guid Kingdoms,
        Guid BaseRune,
        Guid OldRune,
        Guid LifeRune,
        Guid MossRune,
        Guid Arkazia);

    [Fact]
    public async Task An_entry_saves_links_to_the_parent_type_and_every_type_nested_beneath_it_and_nothing_else()
    {
        var w = await NewWorld("ntl-save");
        var elsewhere = await NewWorld("ntl-save-other");

        foreach (var (target, name) in new[] { (w.OldRune, "Iron Rune"), (w.LifeRune, "Blood Rune"), (w.MossRune, "Rot Rune") })
        {
            var saved = await Entry(w, w.Corrupted, name, Link(w.BaseRune, target));
            Assert.Equal(target, saved.Fields.Single(value => value.FieldDefinitionId == w.BaseRune).ReferencedEntityId);
        }

        var unrelated = await PostEntry(w, w.Corrupted, "Crown Rune", Link(w.BaseRune, w.Arkazia));
        Assert.Equal(HttpStatusCode.BadRequest, unrelated.StatusCode);
        Assert.Contains("type it allows", await unrelated.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // Another universe's entry of a type with the same name and place gets the missing entry's answer and says nothing.
        var foreign = await PostEntry(w, w.Corrupted, "Stolen Rune", Link(w.BaseRune, elsewhere.LifeRune));
        var missing = await PostEntry(w, w.Corrupted, "Lost Rune", Link(w.BaseRune, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.BadRequest, foreign.StatusCode);
        Assert.Equal(await ErrorOf(missing, w.BaseRune), await ErrorOf(foreign, w.BaseRune));
        var body = await foreign.Content.ReadAsStringAsync();
        Assert.DoesNotContain(elsewhere.LifeRune.ToString(), body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Life Rune", body, StringComparison.Ordinal);

        // A field limited to a nested type still takes only its own branch: not its parent, not its sibling.
        var nature = await AddField(w, w.Corrupted, "Nature source", w.Nature);
        (await PostEntry(w, w.Corrupted, "Spore Rune", Link(nature, w.MossRune))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await PostEntry(w, w.Corrupted, "Odd Rune", Link(nature, w.OldRune))).StatusCode);
    }

    [Fact]
    public async Task A_lore_filter_on_a_parent_type_field_compares_with_nested_entries_and_refuses_others()
    {
        var w = await NewWorld("ntl-filter");
        await Entry(w, w.Corrupted, "Blood Rune", Link(w.BaseRune, w.LifeRune));
        await Entry(w, w.Corrupted, "Rot Rune", Link(w.BaseRune, w.MossRune));

        Assert.Equal(["Blood Rune"], await Filtered(w, $"{w.BaseRune}:is:{w.LifeRune}"));
        Assert.Equal(["Rot Rune"], await Filtered(w, $"{w.BaseRune}:is:{w.MossRune}"));
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.GetAsync(LoreRoute(w, $"{w.BaseRune}:is:{w.Arkazia}"))).StatusCode);
    }

    [Fact]
    public async Task Narrowing_retyping_and_moving_types_each_wait_for_links_that_rely_on_the_branch()
    {
        var w = await NewWorld("ntl-tree");

        // Narrowing an open field to the parent type: fine while every link is inside its branch; refused once one is not.
        var source = await AddField(w, w.Corrupted, "Source", null);
        await Entry(w, w.Corrupted, "Blood Rune", Link(w.BaseRune, w.LifeRune), Link(source, w.MossRune));
        await UpdateField(w, w.Corrupted, source, "Source", w.Runes);
        var seal = await AddField(w, w.Corrupted, "Seal", null);
        await Entry(w, w.Corrupted, "Crown Rune", Link(seal, w.Arkazia));
        var narrowing = await w.Client.PutFieldAsync(w.U, w.Corrupted, seal, Definition("Seal", w.Runes));
        Assert.Equal(HttpStatusCode.Conflict, narrowing.StatusCode);
        Assert.Equal(EntityTypeEndpoints.TargetConflictCode, await Code(narrowing));

        // Moving Nature Runes out from under Runes would strand both links: refused, and the tree stays as it was.
        var leaving = await MoveType(w, w.Nature, "Nature Runes", null);
        Assert.Equal(HttpStatusCode.Conflict, leaving.StatusCode);
        Assert.Equal(EntityTypeEndpoints.BranchInUseCode, await Code(leaving));
        Assert.Contains("Base rune", await leaving.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal(w.Runes, (await TypesOf(w)).Single(type => type.Id == w.Nature).ParentId);

        // Moving within the branch keeps every link fitting.
        (await MoveType(w, w.Verdant, "Verdant Runes", w.Runes)).EnsureSuccessStatusCode();

        // Retyping a linked entry: within the branch is fine, outside it is refused.
        Assert.True((await Retype(w, w.LifeRune, "Life Rune", w.Verdant)).IsSuccessStatusCode);
        var outside = await Retype(w, w.LifeRune, "Life Rune", w.Kingdoms);
        Assert.Equal(HttpStatusCode.Conflict, outside.StatusCode);
        Assert.Equal(EntityEndpoints.TypeChangeLinkedCode, await Code(outside));

        // An empty branch moves freely.
        var empty = await NewType(w, "Empty Runes", w.Runes);
        (await MoveType(w, empty, "Empty Runes", null)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task A_backup_with_nested_type_links_restores_and_the_restored_field_keeps_the_rule()
    {
        var w = await NewWorld("ntl-backup");
        await Entry(w, w.Corrupted, "Blood Rune", Link(w.BaseRune, w.LifeRune));
        await Entry(w, w.Corrupted, "Rot Rune", Link(w.BaseRune, w.MossRune));

        var restored = await RestoreArchive(w.Client, await RawArchive(w.Client, w.U), "ntl-backup restored");
        var types = (await w.Client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{restored.Id}/entity-types"))!;
        var corrupted = types.Single(type => type.Name == "Corrupted Runes");
        var baseRune = corrupted.Fields.Single(field => field.Name == "Base rune").Id;
        var copy = w with { U = restored.Id };

        Assert.Equal(["Rot Rune"], await Filtered(copy with { Corrupted = corrupted.Id }, $"{baseRune}:is:{(await IdOf(copy, "Moss Rune"))}"));
        (await PostEntry(copy, corrupted.Id, "Grave Rune", Link(baseRune, await IdOf(copy, "Life Rune")))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await PostEntry(copy, corrupted.Id, "Crown Rune", Link(baseRune, await IdOf(copy, "Arkazia")))).StatusCode);
    }

    // ---------- Through an AI proposal and its approval ----------

    [Fact]
    public async Task A_proposal_stages_nested_type_links_refuses_unrelated_and_foreign_ones_and_its_approval_writes_them()
    {
        var w = await NewWorld("ntl-ai");
        var elsewhere = await NewWorld("ntl-ai-other");

        // The issue's own reproduction: Blood Rune -> Base rune -> Life Rune, an entry of Nature Runes beneath Runes.
        var staged = await Stage(
            _factory,
            w.U,
            w.UserId,
            NewLore("blood", w.Corrupted, "Blood Rune", new AiFieldInput(w.BaseRune, Entry: Id(w.LifeRune))),
            NewLore("rot", w.Corrupted, "Rot Rune", new AiFieldInput(w.BaseRune, Entry: Id(w.MossRune))),
            NewLore("iron", w.Corrupted, "Iron Rune", new AiFieldInput(w.BaseRune, Entry: Id(w.OldRune))),
            NewLore("seed", w.Verdant, "Seed Rune"),
            NewLore("sprout", w.Corrupted, "Sprout Rune", new AiFieldInput(w.BaseRune, Entry: Ref("seed"))));
        Assert.True(staged.Proposal is not null, string.Join("; ", staged.Issues.Select(issue => $"{issue.Id}: {issue.Message}")));

        var refused = await Stage(
            _factory,
            w.U,
            w.UserId,
            NewLore("crown", w.Corrupted, "Crown Rune", new AiFieldInput(w.BaseRune, Entry: Id(w.Arkazia))),
            NewLore("stolen", w.Corrupted, "Stolen Rune", new AiFieldInput(w.BaseRune, Entry: Id(elsewhere.LifeRune))),
            NewLore("realm", w.Kingdoms, "Realm"),
            NewLore("pretender", w.Corrupted, "Pretender Rune", new AiFieldInput(w.BaseRune, Entry: Ref("realm"))));
        Assert.Null(refused.Proposal);
        var issues = refused.Issues.Select(issue => (issue.Id, issue.Code)).ToList();
        Assert.Contains(("crown", AiChangeCodes.Invalid), issues);
        Assert.Contains(("stolen", AiChangeCodes.NotFound), issues);
        Assert.Contains(("pretender", AiChangeCodes.Invalid), issues);
        Assert.DoesNotContain(refused.Issues, issue => issue.Id == "stolen" && issue.Message.Contains("Life Rune", StringComparison.Ordinal));

        var receipt = await ApproveAll(w.Client, w.U, staged.Proposal!.Id);
        var made = receipt.Applied.ToDictionary(line => line.Key, line => line.ResultId!.Value);
        foreach (var (key, target) in new[] { ("blood", w.LifeRune), ("rot", w.MossRune), ("iron", w.OldRune), ("sprout", made["seed"]) })
        {
            var entry = await w.Client.GetFromJsonAsync<EntityDetail>($"/api/universes/{w.U}/entities/{made[key]}");
            Assert.Equal(target, entry!.Fields.Single(value => value.FieldDefinitionId == w.BaseRune).ReferencedEntityId);
        }
    }

    [Fact]
    public async Task An_approval_checks_the_tree_again_and_a_staged_type_move_that_strands_links_is_refused()
    {
        var w = await NewWorld("ntl-recheck");

        // Valid when staged; Nature Runes then leaves Runes (no stored link relies on it yet), so it no longer fits.
        var id = await Staged(_factory, w.U, w.UserId, NewLore("blood", w.Corrupted, "Blood Rune", new AiFieldInput(w.BaseRune, Entry: Id(w.LifeRune))));
        (await MoveType(w, w.Nature, "Nature Runes", null)).EnsureSuccessStatusCode();

        var proposal = await Read(w.Client, w.U, id);
        Assert.Contains(proposal.Operations.Single().Issues, issue => issue.Code == AiChangeCodes.Invalid);
        var approve = await Approve(w.Client, w.U, proposal, ["blood"]);
        Assert.Equal(HttpStatusCode.Conflict, approve.StatusCode);
        Assert.Equal(AiChangeCodes.CannotApprove, await Code(approve));
        await WithDb(_factory, async db => Assert.False(await db.Entities.AnyAsync(entity => entity.UniverseId == w.U && entity.Name == "Blood Rune")));

        // Back beneath Runes, a stored link relies on it: a schema change taking it out again is refused when staged.
        (await MoveType(w, w.Nature, "Nature Runes", w.Runes)).EnsureSuccessStatusCode();
        await Entry(w, w.Corrupted, "Blood Rune", Link(w.BaseRune, w.LifeRune));
        var move = await StageSchema(
            _factory,
            w.U,
            w.UserId,
            new AiChangeOperationInput("root", "update", "lore_type", w.Nature, LoreType: new AiLoreTypeInput(Root: true)));
        Assert.Null(move.Proposal);
        Assert.Contains(move.Issues, issue => issue.Id == "root" && issue.Field == "parent" && issue.Message.Contains("Base rune", StringComparison.Ordinal));
    }

    // ---------- Steps ----------

    private async Task<World> NewWorld(string tag)
    {
        var (client, userId) = await PublishingTestClient.Account(_factory, tag);
        var u = (await CreateUniverse(client, $"World {tag}")).Id;
        var w = new World(client, userId, u, default, default, default, default, default, default, default, default, default, default);

        var runes = await NewType(w, "Runes", null);
        var nature = await NewType(w, "Nature Runes", runes);
        var verdant = await NewType(w, "Verdant Runes", nature);
        var corrupted = await NewType(w, "Corrupted Runes", runes);
        var kingdoms = await NewType(w, "Kingdoms", null);
        w = w with { Runes = runes, Nature = nature, Verdant = verdant, Corrupted = corrupted, Kingdoms = kingdoms };

        return w with
        {
            BaseRune = await AddField(w, corrupted, "Base rune", runes),
            OldRune = (await Entry(w, runes, "Old Rune")).Id,
            LifeRune = (await Entry(w, nature, "Life Rune")).Id,
            MossRune = (await Entry(w, verdant, "Moss Rune")).Id,
            Arkazia = (await Entry(w, kingdoms, "Arkazia")).Id,
        };
    }

    private static async Task<Guid> NewType(World w, string name, Guid? parent) =>
        (await PostJson<EntityTypeResponse>(
            w.Client,
            $"/api/universes/{w.U}/entity-types",
            new EntityTypeRequest(name, null, null, null, null, Parent: parent is null ? null : new EntityTypeParentChoice(parent)))).Id;

    private static Task<HttpResponseMessage> MoveType(World w, Guid typeId, string name, Guid? parent) =>
        w.Client.PutAsJsonAsync(
            $"/api/universes/{w.U}/entity-types/{typeId}",
            new EntityTypeRequest(name, null, null, null, null, Parent: new EntityTypeParentChoice(parent)));

    private static async Task<List<EntityTypeResponse>> TypesOf(World w) =>
        (await w.Client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{w.U}/entity-types"))!;

    private static FieldDefinitionRequest Definition(string name, Guid? target) =>
        new(name, EntityFieldKind.EntityReference, false, null, null, null, TargetEntityTypeId: target);

    private static async Task<Guid> AddField(World w, Guid typeId, string name, Guid? target) =>
        (await Field(w.Client, w.U, typeId, Definition(name, target))).Id;

    private static async Task UpdateField(World w, Guid typeId, Guid fieldId, string name, Guid? target)
    {
        var response = await w.Client.PutFieldAsync(w.U, typeId, fieldId, Definition(name, target));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    private static FieldValueInput Link(Guid fieldId, Guid entityId) => new(fieldId, null, null, null, null, null, entityId);

    private static Task<HttpResponseMessage> PostEntry(World w, Guid typeId, string name, params FieldValueInput[] fields) =>
        w.Client.PostAsJsonAsync($"/api/universes/{w.U}/entities", new EntityRequest(typeId, name, null, CanonStatus.Canon, null, null, fields));

    private static async Task<EntityDetail> Entry(World w, Guid typeId, string name, params FieldValueInput[] fields)
    {
        var response = await PostEntry(w, typeId, name, fields);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static Task<HttpResponseMessage> Retype(World w, Guid entityId, string name, Guid typeId) =>
        w.Client.PutVersionedAsync($"/api/universes/{w.U}/entities/{entityId}", new EntityRequest(typeId, name, null, CanonStatus.Canon, null, null, null));

    private static async Task<string> ErrorOf(HttpResponseMessage response, Guid fieldId)
    {
        using var problem = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return problem.RootElement.GetProperty("errors").GetProperty(fieldId.ToString())[0].GetString()!;
    }

    private static async Task<Guid> IdOf(World w, string name) =>
        (await w.Client.GetFromJsonAsync<EntityPage>($"/api/universes/{w.U}/entities?search={Uri.EscapeDataString(name)}&pageSize=50"))!
            .Items.Single(item => item.Name == name).Id;

    private static string LoreRoute(World w, params string[] filters) =>
        $"/api/universes/{w.U}/entities?entityTypeId={w.Corrupted}&pageSize=50"
            + string.Concat(filters.Select(filter => $"&field={Uri.EscapeDataString(filter)}"));

    private static async Task<List<string>> Filtered(World w, params string[] filters)
    {
        var response = await w.Client.GetAsync(LoreRoute(w, filters));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return [.. (await response.Content.ReadFromJsonAsync<EntityPage>())!.Items.Select(item => item.Name).Order(StringComparer.Ordinal)];
    }
}
