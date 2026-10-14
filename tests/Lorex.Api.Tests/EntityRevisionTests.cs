using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;

using static Lorex.Api.Tests.VersionTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Entry history: what makes a version, what deliberately does not, what a version keeps,
/// and what putting one back is allowed to do.
///
/// Two claims carry most of this. A version exists only for lore that was actually stored,
/// so anything refused - by validation or by the Canon promotion gate - leaves the history
/// exactly as long as it was. And a restore is an ordinary edit: it passes the same gate,
/// becomes the next version, and never touches the version it came from.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class EntityRevisionTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private const string Article =
        """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"She kept the tide's ledger."}]}]}""";

    private readonly LorexApiFactory _factory = factory;

    // ---------- What makes a version ----------

    [Fact]
    public async Task Creating_an_entry_records_its_first_version()
    {
        var (client, universe) = await SignedInWithUniverse("revcreate");
        var entity = await CreateEntity(client, universe.Id, "Tuor");

        var revision = Assert.Single(await Revisions(client, universe.Id, entity.Id));

        Assert.Equal(1, revision.Number);
        Assert.Equal(EntityRevisionKind.Created, revision.Kind);
        Assert.Equal("Tuor", revision.Name);
        Assert.Null(revision.RestoredFromRevisionId);
    }

    [Fact]
    public async Task Each_meaningful_edit_adds_a_version_and_they_read_newest_first()
    {
        var (client, universe) = await SignedInWithUniverse("revorder");
        var entity = await CreateEntity(client, universe.Id, "Idril");

        await Put(client, universe.Id, entity with { Name = "Idril Celebrindal" });
        await Put(client, universe.Id, entity with { Name = "Idril Celebrindal", Summary = "Of Gondolin." });

        var revisions = await Revisions(client, universe.Id, entity.Id);

        Assert.Equal([3, 2, 1], revisions.Select(revision => revision.Number));
        Assert.Equal("Idril Celebrindal", revisions[0].Name);
        Assert.Equal("Idril", revisions[2].Name);
        Assert.True(revisions[0].CreatedAt >= revisions[2].CreatedAt);
    }

    [Fact]
    public async Task A_version_says_which_parts_of_the_entry_moved()
    {
        var (client, universe) = await SignedInWithUniverse("revchanges");
        var entity = await CreateEntity(client, universe.Id, "Ecthelion");

        await Put(client, universe.Id, entity with
        {
            Name = "Ecthelion of the Fountain",
            CanonStatus = CanonStatus.Draft,
            Tags = ["gondolin"],
        });

        var latest = (await Revisions(client, universe.Id, entity.Id))[0];

        Assert.Equal(EntityRevisionKind.Edited, latest.Kind);
        Assert.Equal(
            EntityRevisionChange.Name | EntityRevisionChange.CanonStatus | EntityRevisionChange.Tags,
            latest.Changes);
    }

    [Fact]
    public async Task Re_saving_an_unchanged_entry_records_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("revnoop");
        var entity = await CreateEntity(
            client, universe.Id, "Glorfindel", summary: "A lord of the house.", aliases: ["Golden Flower"]);

        await Put(client, universe.Id, entity);
        await Put(client, universe.Id, entity);

        Assert.Single(await Revisions(client, universe.Id, entity.Id));
    }

    [Fact]
    public async Task A_refused_edit_records_no_version()
    {
        var (client, universe) = await SignedInWithUniverse("revrefused");
        var entity = await CreateEntity(client, universe.Id, "Salgant");

        var response = await Put(client, universe.Id, entity with { Name = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Single(await Revisions(client, universe.Id, entity.Id));
    }

    /// <summary>
    /// The gate rolls back the lore; the version it would have produced has to go back with
    /// it, or history would claim a state the author was never allowed to save.
    /// </summary>
    [Fact]
    public async Task A_write_the_canon_gate_refuses_records_no_version()
    {
        var (client, universe) = await SignedInWithUniverse("revgated");
        var (birth, death) = await LifespanFields(client, universe.Id);
        var entity = await CreateEntity(
            client, universe.Id, "Maeglin", canonStatus: CanonStatus.Canon, fields: [Number(birth, 316)]);

        var response = await Put(
            client, universe.Id, entity, fields: [Number(birth, 316), Number(death, 300)]);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Single(await Revisions(client, universe.Id, entity.Id));
    }

    /// <summary>
    /// A field definition's name is not lore. Renaming one changes what every snapshot of it
    /// would say, and must still not make a version out of an edit the author never made.
    /// </summary>
    [Fact]
    public async Task Renaming_a_field_definition_records_no_version()
    {
        var (client, universe) = await SignedInWithUniverse("revfieldrename");
        var type = await CharacterType(client, universe.Id);
        var field = await AddField(client, universe.Id, type.Id, "Born", EntityFieldKind.Number);
        var entity = await CreateEntity(client, universe.Id, "Turgon", fields: [Number(field, 100)]);

        var renamed = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}/fields/{field.Id}",
            new FieldDefinitionRequest("Year of birth", EntityFieldKind.Number, false, null, null, null));
        renamed.EnsureSuccessStatusCode();

        await Put(client, universe.Id, entity, fields: [Number(field, 100)]);

        Assert.Single(await Revisions(client, universe.Id, entity.Id));
    }

    /// <summary>
    /// Trashing an entry hides its history without touching it.
    ///
    /// ADR 0013 made <c>EntityId</c> a cascading key so history dies with the entry, and said
    /// Trash was a later concern. It is this one: since Phase 019 the author's own removal no
    /// longer deletes the row, so the cascade never fires and the versions are simply out of
    /// reach until the entry comes back. Only deleting the whole universe still takes them.
    /// </summary>
    [Fact]
    public async Task Trashing_an_entry_hides_its_history_and_restoring_gives_it_back()
    {
        var (client, universe) = await SignedInWithUniverse("revdelete");
        var entity = await CreateEntity(client, universe.Id, "Duilin");
        await Put(client, universe.Id, entity with { Name = "Duilin of the Swallow" });

        var before = await Revisions(client, universe.Id, entity.Id);
        Assert.Equal(2, before.Count);

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{entity.Id}"))
            .EnsureSuccessStatusCode();

        var response = await client.GetAsync(
            $"/api/universes/{universe.Id}/entities/{entity.Id}/revisions");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        (await client.PostAsync($"/api/universes/{universe.Id}/trash/{entity.Id}/restore", null))
            .EnsureSuccessStatusCode();

        var after = await Revisions(client, universe.Id, entity.Id);

        // The same versions, unchanged and un-added-to: neither trashing nor restoring is an
        // edit to the entry, so neither writes one.
        Assert.Equal(
            before.Select(revision => (revision.Id, revision.Number)),
            after.Select(revision => (revision.Id, revision.Number)));
    }

    // ---------- What a version keeps ----------

    /// <summary>
    /// A version is the structured entry. The article keeps a history of its own (ADR 0028), so a version recorded now
    /// holds no copy of it - and saving the article is not an edit to the entry, so it records no version here.
    /// </summary>
    [Fact]
    public async Task A_version_keeps_the_aliases_the_tags_and_the_status_and_no_copy_of_the_article()
    {
        var (client, universe) = await SignedInWithUniverse("revkeeps");
        var entity = await CreateEntity(
            client,
            universe.Id,
            "Voronwe",
            summary: "The one mariner who came back.",
            canonStatus: CanonStatus.Canon,
            aliases: ["Bronweg", "The Steadfast"],
            tags: ["mariner", "gondolin"]);

        await ArticleTestClient.WriteArticle(client, universe.Id, entity.Id, Article);
        Assert.Single(await Revisions(client, universe.Id, entity.Id));

        await Put(client, universe.Id, entity with { Name = "Voronwe the Steadfast" });

        var first = await Revision(client, universe.Id, entity.Id, 1);
        var second = await Revision(client, universe.Id, entity.Id, 2);

        Assert.Equal("Voronwe", first.Name);
        Assert.Equal("The one mariner who came back.", first.Summary);
        Assert.Null(first.Content);
        Assert.Null(second.Content);
        Assert.Equal(EntityRevisionChange.Name, second.Changes);
        Assert.Equal(CanonStatus.Canon, first.CanonStatus);
        Assert.Equal(["Bronweg", "The Steadfast"], first.Aliases);
        Assert.Equal(["gondolin", "mariner"], first.Tags);
        Assert.Equal("Character", first.EntityTypeName);
    }

    [Fact]
    public async Task A_version_keeps_every_kind_of_structured_value()
    {
        var (client, universe) = await SignedInWithUniverse("revfields");
        var type = await CharacterType(client, universe.Id);
        var born = await AddField(client, universe.Id, type.Id, "Born", EntityFieldKind.Number);
        var motto = await AddField(client, universe.Id, type.Id, "Motto", EntityFieldKind.ShortText);
        var living = await AddField(client, universe.Id, type.Id, "Living", EntityFieldKind.Boolean);
        var sworn = await AddField(client, universe.Id, type.Id, "Sworn", EntityFieldKind.Date);
        var houses = await AddField(
            client, universe.Id, type.Id, "Houses", EntityFieldKind.MultiSelect,
            options: ["Fountain", "Swallow", "Harp"]);
        var mentor = await AddField(client, universe.Id, type.Id, "Mentor", EntityFieldKind.EntityReference);

        var elder = await CreateEntity(client, universe.Id, "Turgon");
        var sworeOn = new DateTime(2026, 3, 4, 0, 0, 0, DateTimeKind.Utc);

        var entity = await CreateEntity(client, universe.Id, "Egalmoth", fields:
        [
            Number(born, 210),
            new FieldValueInput(motto.Id, "Under the arrow", null, null, null, null, null),
            new FieldValueInput(living.Id, null, null, true, null, null, null),
            new FieldValueInput(sworn.Id, null, null, null, sworeOn, null, null),
            new FieldValueInput(
                houses.Id, null, null, null, null,
                [Option(houses, "Fountain"), Option(houses, "Harp")], null),
            new FieldValueInput(mentor.Id, null, null, null, null, null, elder.Id),
        ]);

        // Move the entry on, so the version under test is genuinely history rather than
        // whatever the live row happens to hold.
        await Put(client, universe.Id, entity with { Name = "Egalmoth of the Heavenly Arch" });

        var first = await Revision(client, universe.Id, entity.Id, 1);

        Assert.Equal(210, Field(first, born).Number);
        Assert.Equal("Under the arrow", Field(first, motto).Text);
        Assert.True(Field(first, living).Boolean);
        Assert.Equal(sworeOn, Field(first, sworn).Date);
        Assert.Equal(["Fountain", "Harp"], Field(first, houses).OptionValues);
        Assert.Equal("Turgon", Field(first, mentor).ReferencedEntityName);
    }

    /// <summary>
    /// A snapshot carries the text it displayed, not a join. The entry it pointed at can be
    /// renamed afterwards and the version still reads as it did when it was written.
    /// </summary>
    [Fact]
    public async Task A_version_keeps_the_name_a_reference_had_at_the_time()
    {
        var (client, universe) = await SignedInWithUniverse("revrefname");
        var type = await CharacterType(client, universe.Id);
        var mentor = await AddField(client, universe.Id, type.Id, "Mentor", EntityFieldKind.EntityReference);

        var elder = await CreateEntity(client, universe.Id, "Turgon");
        var entity = await CreateEntity(
            client, universe.Id, "Egalmoth",
            fields: [new FieldValueInput(mentor.Id, null, null, null, null, null, elder.Id)]);

        await Put(client, universe.Id, elder with { Name = "Turgon the King" });

        var first = await Revision(client, universe.Id, entity.Id, 1);

        Assert.Equal("Turgon", Field(first, mentor).ReferencedEntityName);
    }

    // ---------- Ownership ----------

    [Fact]
    public async Task History_is_not_reachable_by_another_owner()
    {
        var (owner, universe) = await SignedInWithUniverse("revownera");
        var entity = await CreateEntity(owner, universe.Id, "Rog");

        var intruder = await SignedInClient("user-revownerb");

        var list = await intruder.GetAsync($"/api/universes/{universe.Id}/entities/{entity.Id}/revisions");
        var revisionId = (await Revisions(owner, universe.Id, entity.Id))[0].Id;
        var one = await intruder.GetAsync(
            $"/api/universes/{universe.Id}/entities/{entity.Id}/revisions/{revisionId}");
        var restore = await intruder.PostAsJsonAsync($"/api/universes/{universe.Id}/entities/{entity.Id}/revisions/{revisionId}/restore", new EntityRevisionRestoreRequest(1));

        Assert.Equal(HttpStatusCode.NotFound, list.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, one.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, restore.StatusCode);
    }

    [Fact]
    public async Task History_is_not_reachable_through_another_universe_of_the_same_owner()
    {
        var (client, universe) = await SignedInWithUniverse("revcrossuni");
        var other = await CreateUniverse(client, "World revcrossuni other");
        var entity = await CreateEntity(client, universe.Id, "Penlod");
        var revisionId = (await Revisions(client, universe.Id, entity.Id))[0].Id;

        var response = await client.GetAsync(
            $"/api/universes/{other.Id}/entities/{entity.Id}/revisions/{revisionId}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------- Restoring ----------

    [Fact]
    public async Task Restoring_puts_the_older_version_back_as_a_new_version()
    {
        var (client, universe) = await SignedInWithUniverse("revrestore");
        var entity = await CreateEntity(
            client, universe.Id, "Legolas", summary: "Of the green leaves.",
            aliases: ["Greenleaf"], tags: ["woodland"]);

        await Put(client, universe.Id, entity with
        {
            Name = "Legolas Thranduilion",
            Summary = null,
            Aliases = [],
            Tags = [],
        });

        var first = (await Revisions(client, universe.Id, entity.Id)).Single(r => r.Number == 1);
        var response = await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{entity.Id}", first.Id);
        response.EnsureSuccessStatusCode();

        var restored = (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
        Assert.Equal("Legolas", restored.Name);
        Assert.Equal("Of the green leaves.", restored.Summary);
        Assert.Equal(["Greenleaf"], restored.Aliases);
        Assert.Equal(["woodland"], restored.Tags);

        var revisions = await Revisions(client, universe.Id, entity.Id);
        Assert.Equal([3, 2, 1], revisions.Select(revision => revision.Number));
        Assert.Equal(EntityRevisionKind.Restored, revisions[0].Kind);
        Assert.Equal(first.Id, revisions[0].RestoredFromRevisionId);
    }

    /// <summary>
    /// History is append-only. A restore reaches back through it and must leave every version
    /// it passes exactly where it was, including the one it copied.
    /// </summary>
    [Fact]
    public async Task Restoring_leaves_every_earlier_version_untouched()
    {
        var (client, universe) = await SignedInWithUniverse("revappend");
        var entity = await CreateEntity(client, universe.Id, "Gwindor");
        await Put(client, universe.Id, entity with { Name = "Gwindor of Nargothrond" });

        var before = await Revisions(client, universe.Id, entity.Id);
        var first = before.Single(revision => revision.Number == 1);

        var response = await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{entity.Id}", first.Id);
        response.EnsureSuccessStatusCode();

        var after = await Revisions(client, universe.Id, entity.Id);

        Assert.Equal(
            before.Select(revision => (revision.Id, revision.Number, revision.Name, revision.CreatedAt)),
            after.Where(revision => revision.Number <= 2)
                .Select(revision => (revision.Id, revision.Number, revision.Name, revision.CreatedAt)));
    }

    [Fact]
    public async Task Restoring_the_version_the_entry_already_matches_records_nothing()
    {
        var (client, universe) = await SignedInWithUniverse("revrestorenoop");
        var entity = await CreateEntity(client, universe.Id, "Galdor");
        var first = (await Revisions(client, universe.Id, entity.Id))[0];

        var response = await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{entity.Id}", first.Id);
        response.EnsureSuccessStatusCode();

        Assert.Single(await Revisions(client, universe.Id, entity.Id));
    }

    /// <summary>
    /// The restore is a gated write like any other. An old version that was true when it was
    /// written can contradict lore added since, and putting it back must be refused for the
    /// same reason authoring it directly would be.
    /// </summary>
    [Fact]
    public async Task A_restore_that_would_introduce_a_high_conflict_is_refused()
    {
        var (client, universe) = await SignedInWithUniverse("revrestoregated");
        var (birth, death) = await LifespanFields(client, universe.Id);

        var entity = await CreateEntity(
            client, universe.Id, "Fingon", canonStatus: CanonStatus.Canon,
            fields: [Number(birth, 100), Number(death, 200)]);

        await Put(
            client, universe.Id, entity with { CanonStatus = CanonStatus.Canon },
            fields: [Number(birth, 100), Number(death, 900)]);

        var moment = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/timeline",
            new TimelineEntryRequest(
                "The Long Siege", null, CanonStatus.Canon, TimelineDateKind.Exact, 800,
                null, null, null, null, null, null, [entity.Id]));
        moment.EnsureSuccessStatusCode();

        var first = (await Revisions(client, universe.Id, entity.Id)).Single(r => r.Number == 1);
        var response = await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{entity.Id}", first.Id);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var blocked = (await response.Content.ReadFromJsonAsync<CanonPromotionBlockedResponse>())!;
        Assert.Equal(CanonPromotionGate.BlockedCode, blocked.Code);
        Assert.Equal("CANON-LIFE-003", Assert.Single(blocked.BlockingFindings).RuleCode);

        // Refused means nothing moved: not the lore, and not the history either.
        var stored = await Entity(client, universe.Id, entity.Id);
        Assert.Equal(900, stored.Fields.First(field => field.FieldDefinitionId == death.Id).Number);
        Assert.Equal(2, (await Revisions(client, universe.Id, entity.Id)).Count);
    }

    /// <summary>
    /// A version that names lore since deleted cannot be put back as it was. Dropping the
    /// dangling part quietly would restore something the author never wrote, so the whole
    /// restore is refused and says what is missing.
    ///
    /// The dangling part is a removed *choice*. Since Phase 019 an entry the author removes is
    /// not deleted, so a snapshot's entity reference can no longer dangle by that route - the
    /// case below covers what happens instead. An option is still genuinely removable once
    /// nothing holds it, so it is what this refusal is now proved with.
    /// </summary>
    [Fact]
    public async Task A_restore_naming_lore_that_is_gone_is_refused_rather_than_partly_applied()
    {
        var (client, universe) = await SignedInWithUniverse("revrestoregone");
        var type = await CharacterType(client, universe.Id);
        var house = await AddField(
            client, universe.Id, type.Id, "House", EntityFieldKind.Select, options: ["Swallow", "Arch"]);

        var entity = await CreateEntity(
            client, universe.Id, "Egalmoth",
            fields: [new FieldValueInput(house.Id, null, null, null, null, [Option(house, "Swallow")], null)]);

        // Move off the choice, then take the choice away. Removing it is only allowed because
        // nothing holds it any more - but version 1 still names it.
        await Put(
            client, universe.Id, entity with { Name = "Egalmoth of the Arch" },
            fields: [new FieldValueInput(house.Id, null, null, null, null, [Option(house, "Arch")], null)]);

        (await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}/fields/{house.Id}",
            new FieldDefinitionRequest("House", EntityFieldKind.Select, false, null, null, ["Arch"])))
            .EnsureSuccessStatusCode();

        var first = (await Revisions(client, universe.Id, entity.Id)).Single(r => r.Number == 1);
        var response = await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{entity.Id}", first.Id);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.Content.ReadAsStringAsync();
        Assert.Contains(RevisionEndpoints.NotRestorableCode, problem, StringComparison.Ordinal);
        Assert.Contains("Swallow", problem, StringComparison.Ordinal);

        Assert.Equal("Egalmoth of the Arch", (await Entity(client, universe.Id, entity.Id)).Name);
        Assert.Equal(2, (await Revisions(client, universe.Id, entity.Id)).Count);
    }

    /// <summary>
    /// A version naming an entry that is merely in the Trash is restorable, and putting it back
    /// reconnects the reference rather than dropping it. The entry it names still exists - that
    /// is what the Trash means - so there is nothing dangling to refuse.
    /// </summary>
    [Fact]
    public async Task A_restore_naming_an_entry_in_the_trash_puts_the_reference_back()
    {
        var (client, universe) = await SignedInWithUniverse("revrestoretrashed");
        var type = await CharacterType(client, universe.Id);
        var mentor = await AddField(client, universe.Id, type.Id, "Mentor", EntityFieldKind.EntityReference);

        var elder = await CreateEntity(client, universe.Id, "Turgon");
        var entity = await CreateEntity(
            client, universe.Id, "Egalmoth",
            fields: [new FieldValueInput(mentor.Id, null, null, null, null, null, elder.Id)]);

        // Clear the reference, then trash the entry it used to name.
        await Put(client, universe.Id, entity with { Name = "Egalmoth of the Arch" }, fields: []);
        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{elder.Id}"))
            .EnsureSuccessStatusCode();

        var first = (await Revisions(client, universe.Id, entity.Id)).Single(r => r.Number == 1);
        var response = await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{entity.Id}", first.Id);

        response.EnsureSuccessStatusCode();

        var restored = await Entity(client, universe.Id, entity.Id);
        var reference = restored.Fields.Single(field => field.FieldDefinitionId == mentor.Id);

        Assert.Equal(elder.Id, reference.ReferencedEntityId);
        Assert.True(reference.ReferencedEntityIsTrashed);
    }

    // ---------- Helpers ----------

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

    private static async Task<EntityTypeResponse> CharacterType(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        return types.First(type => type.Name == "Character");
    }

    private static async Task<FieldDefinitionResponse> AddField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        EntityFieldKind kind,
        EntityFieldSemantic? semantic = null,
        IReadOnlyList<string>? options = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, kind, false, null, null, options, semantic));
        response.EnsureSuccessStatusCode();

        var type = (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
        return type.Fields.First(field => field.Name == name);
    }

    private static async Task<(FieldDefinitionResponse Birth, FieldDefinitionResponse Death)>
        LifespanFields(HttpClient client, Guid universeId)
    {
        var type = await CharacterType(client, universeId);
        return (
            await AddField(
                client, universeId, type.Id, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear),
            await AddField(
                client, universeId, type.Id, "Died", EntityFieldKind.Number, EntityFieldSemantic.DeathYear));
    }

    private static FieldValueInput Number(FieldDefinitionResponse field, double value) =>
        new(field.Id, null, value, null, null, null, null);

    private static Guid Option(FieldDefinitionResponse field, string value) =>
        field.Options.First(option => option.Value == value).Id;

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        string name,
        string? summary = null,
        CanonStatus canonStatus = CanonStatus.Idea,
        IReadOnlyList<string>? aliases = null,
        IReadOnlyList<string>? tags = null,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var type = await CharacterType(client, universeId);
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(type.Id, name, summary, canonStatus, aliases, tags, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    /// <summary>Re-saves an entry from its own detail, which is what the client does.</summary>
    private static Task<HttpResponseMessage> Put(
        HttpClient client,
        Guid universeId,
        EntityDetail entity,
        IReadOnlyList<FieldValueInput>? fields = null) =>
        client.PutVersionedAsync(
            $"/api/universes/{universeId}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId,
                entity.Name,
                entity.Summary,
                entity.CanonStatus,
                entity.Aliases,
                entity.Tags,
                fields ?? [.. entity.Fields.Select(field => new FieldValueInput(
                    field.FieldDefinitionId,
                    field.Text,
                    field.Number,
                    field.Boolean,
                    field.Date,
                    field.OptionIds,
                    field.ReferencedEntityId))]));

    private static async Task<EntityDetail> Entity(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>(
            $"/api/universes/{universeId}/entities/{entityId}"))!;

    private static async Task<List<EntityRevisionSummary>> Revisions(
        HttpClient client,
        Guid universeId,
        Guid entityId) =>
        (await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/universes/{universeId}/entities/{entityId}/revisions"))!;

    private static async Task<EntityRevisionDetail> Revision(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        int number)
    {
        var summary = (await Revisions(client, universeId, entityId))
            .Single(revision => revision.Number == number);

        return (await client.GetFromJsonAsync<EntityRevisionDetail>(
            $"/api/universes/{universeId}/entities/{entityId}/revisions/{summary.Id}"))!;
    }

    private static EntityRevisionFieldResponse Field(
        EntityRevisionDetail revision,
        FieldDefinitionResponse field) =>
        revision.Fields.First(value => value.FieldDefinitionId == field.Id);
}
