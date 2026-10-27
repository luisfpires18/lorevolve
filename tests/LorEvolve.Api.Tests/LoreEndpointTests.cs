using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The lore surface, and the invariant that everything under a universe inherits that
/// universe's ownership. Credentials here are obviously synthetic.
/// </summary>
public sealed class LoreEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- Entity types ----------

    [Fact]
    public async Task A_new_universe_starts_with_the_default_entity_types()
    {
        var (client, universe) = await SignedInWithUniverse("defaults");

        var types = await ListTypes(client, universe.Id);

        Assert.Equal(EntityTypeDefaults.Defaults.Count, types.Count);
        Assert.Contains(types, type => type.Name == "Character");
        Assert.Contains(types, type => type.Name == "Location");
    }

    [Fact]
    public async Task Listing_types_twice_does_not_duplicate_the_defaults()
    {
        var (client, universe) = await SignedInWithUniverse("idempotent");

        var first = await ListTypes(client, universe.Id);
        var second = await ListTypes(client, universe.Id);

        Assert.Equal(first.Count, second.Count);
        Assert.Equal(
            first.Select(type => type.Id).OrderBy(id => id),
            second.Select(type => type.Id).OrderBy(id => id));
    }

    [Fact]
    public async Task Owner_can_create_a_custom_entity_type()
    {
        var (client, universe) = await SignedInWithUniverse("customtype");

        var created = await CreateType(client, universe.Id, "Starship", "Things that fly between worlds.");

        Assert.Equal("Starship", created.Name);
        Assert.Empty(created.Fields);
    }

    [Fact]
    public async Task Entity_types_cannot_share_a_name_inside_one_universe()
    {
        var (client, universe) = await SignedInWithUniverse("typedupe");
        await CreateType(client, universe.Id, "Starship");

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Starship", null, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_type_still_in_use_cannot_be_deleted()
    {
        var (client, universe) = await SignedInWithUniverse("typeinuse");
        var type = await CreateType(client, universe.Id, "Starship");
        await CreateEntity(client, universe.Id, type.Id, "The Kestrel");

        var response = await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{type.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        // The refusal counts entries in English, not in row counts.
        Assert.Contains(
            "Starship can't be deleted because 1 entry still uses it. Move it to another type first.",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_refusal_to_delete_a_used_type_counts_more_than_one_in_the_plural()
    {
        var (client, universe) = await SignedInWithUniverse("typeinuseplural");
        var type = await CreateType(client, universe.Id, "Starship");
        await CreateEntity(client, universe.Id, type.Id, "The Kestrel");
        await CreateEntity(client, universe.Id, type.Id, "The Harrier");

        var response = await client.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{type.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains(
            "Starship can't be deleted because 2 entries still use it. Move them to another type first.",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    // ---------- Type icons ----------

    [Fact]
    public async Task Every_starter_type_carries_one_of_the_built_in_icons()
    {
        var (client, universe) = await SignedInWithUniverse("typeicondefaults");

        var types = await ListTypes(client, universe.Id);

        // Written by the seed as data, so a new world's types are recognisable at a glance - and
        // every one of them is a key the client can actually draw.
        Assert.All(types, type => Assert.True(EntityTypeIcons.IsKnown(type.Icon!), $"{type.Name} has icon '{type.Icon}'."));
        Assert.All(EntityTypeDefaults.Defaults, seeded => Assert.True(EntityTypeIcons.IsKnown(seeded.Icon)));
    }

    [Fact]
    public async Task A_custom_type_has_no_icon_until_its_author_chooses_one()
    {
        var (client, universe) = await SignedInWithUniverse("typeiconnone");

        // Named like a starter type, and still given nothing: an icon is never guessed from a name.
        var kingdom = await CreateType(client, universe.Id, "Kingdom");
        Assert.Null(kingdom.Icon);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Dynasty", null, "crown", null, null));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("crown", (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!.Icon);
    }

    [Fact]
    public async Task An_icon_can_be_changed_and_taken_away_later_and_travels_with_the_types_entries()
    {
        var (client, universe) = await SignedInWithUniverse("typeiconedit");
        var type = await CreateType(client, universe.Id, "Starship");
        var entry = await CreateEntity(client, universe.Id, type.Id, "The Kestrel");

        // Trimmed like every other text input, and then it is an exact key.
        var changed = await UpdateType(client, universe.Id, type.Id, new EntityTypeRequest("Starship", null, " ship ", null, null));
        Assert.Equal("ship", changed.Icon);

        // The card and the page read the icon off the type, so they follow the change.
        Assert.Equal("ship", (await GetEntity(client, universe.Id, entry.Id)).EntityTypeIcon);
        Assert.Equal(
            "ship",
            Assert.Single((await ListEntities(client, universe.Id, "pageSize=50")).Items).EntityTypeIcon);

        // Blank is none, the same as null.
        var cleared = await UpdateType(client, universe.Id, type.Id, new EntityTypeRequest("Starship", null, "  ", null, null));
        Assert.Null(cleared.Icon);
        Assert.Null((await ListTypes(client, universe.Id)).Single(candidate => candidate.Id == type.Id).Icon);
    }

    [Theory]
    [InlineData("name", "dragon")]
    [InlineData("case", "Character")]
    [InlineData("markup", "<svg onload=alert(1)>")]
    [InlineData("url", "https://example.test/icon.png")]
    public async Task An_icon_that_is_not_a_built_in_key_is_refused_on_create_and_on_update(string tag, string icon)
    {
        var (client, universe) = await SignedInWithUniverse($"typeiconbad{tag}");
        var type = await CreateType(client, universe.Id, "Starship");

        var created = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Relic", null, icon, null, null));
        var updated = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}",
            new EntityTypeRequest("Starship", null, icon, null, null));

        await AssertIconRefused(created);
        await AssertIconRefused(updated);

        // Nothing was written by either refusal.
        var types = await ListTypes(client, universe.Id);
        Assert.DoesNotContain(types, candidate => candidate.Name == "Relic");
        Assert.Null(types.Single(candidate => candidate.Id == type.Id).Icon);
    }

    // ---------- Custom fields ----------

    [Fact]
    public async Task Custom_field_values_persist_across_every_field_kind()
    {
        var (client, universe) = await SignedInWithUniverse("fieldkinds");
        var type = await CreateType(client, universe.Id, "Dossier");

        var title = await AddField(client, universe.Id, type.Id, "Title", EntityFieldKind.ShortText);
        var notes = await AddField(client, universe.Id, type.Id, "Notes", EntityFieldKind.LongText);
        var age = await AddField(client, universe.Id, type.Id, "Age", EntityFieldKind.Number);
        var alive = await AddField(client, universe.Id, type.Id, "Alive", EntityFieldKind.Boolean);
        var born = await AddField(client, universe.Id, type.Id, "Born", EntityFieldKind.Date);
        var rank = await AddField(client, universe.Id, type.Id, "Rank", EntityFieldKind.Select,
            options: ["Captain", "Ensign"]);
        var traits = await AddField(client, universe.Id, type.Id, "Traits", EntityFieldKind.MultiSelect,
            options: ["Brave", "Cunning", "Kind"]);

        var other = await CreateEntity(client, universe.Id, type.Id, "The Mentor");
        var mentor = await AddField(client, universe.Id, type.Id, "Mentor", EntityFieldKind.EntityReference);

        var bornOn = new DateTime(1412, 4, 3, 0, 0, 0, DateTimeKind.Utc);
        var captain = rank.Options.First(option => option.Value == "Captain").Id;
        var brave = traits.Options.First(option => option.Value == "Brave").Id;
        var kind = traits.Options.First(option => option.Value == "Kind").Id;

        var created = await CreateEntity(client, universe.Id, type.Id, "Alenna Vance", fields:
        [
            new FieldValueInput(title.Id, "Warden of the Reach", null, null, null, null, null),
            new FieldValueInput(notes.Id, "Long form notes.", null, null, null, null, null),
            new FieldValueInput(age.Id, null, 41, null, null, null, null),
            new FieldValueInput(alive.Id, null, null, true, null, null, null),
            new FieldValueInput(born.Id, null, null, null, bornOn, null, null),
            new FieldValueInput(rank.Id, null, null, null, null, [captain], null),
            new FieldValueInput(traits.Id, null, null, null, null, [brave, kind], null),
            new FieldValueInput(mentor.Id, null, null, null, null, null, other.Id),
        ]);

        var fetched = await GetEntity(client, universe.Id, created.Id);
        var byName = fetched.Fields.ToDictionary(field => field.Name);

        Assert.Equal("Warden of the Reach", byName["Title"].Text);
        Assert.Equal("Long form notes.", byName["Notes"].Text);
        Assert.Equal(41, byName["Age"].Number);
        Assert.True(byName["Alive"].Boolean);
        Assert.Equal(bornOn, byName["Born"].Date);
        Assert.Equal(["Captain"], byName["Rank"].OptionValues);
        Assert.Equal(["Brave", "Kind"], byName["Traits"].OptionValues.OrderBy(value => value));
        Assert.Equal(other.Id, byName["Mentor"].ReferencedEntityId);
        Assert.Equal("The Mentor", byName["Mentor"].ReferencedEntityName);
    }

    [Fact]
    public async Task A_field_holding_values_cannot_be_deleted()
    {
        var (client, universe) = await SignedInWithUniverse("fielddelete");
        var type = await CreateType(client, universe.Id, "Dossier");
        var field = await AddField(client, universe.Id, type.Id, "Title", EntityFieldKind.ShortText);

        await CreateEntity(client, universe.Id, type.Id, "Someone", fields:
            [new FieldValueInput(field.Id, "A title", null, null, null, null, null)]);

        var response = await client.DeleteAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}/fields/{field.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains(
            "This field contains a value in 1 entry. Archive it to hide it without losing its data.",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_unused_field_can_be_deleted()
    {
        var (client, universe) = await SignedInWithUniverse("fieldfree");
        var type = await CreateType(client, universe.Id, "Dossier");
        var field = await AddField(client, universe.Id, type.Id, "Unused", EntityFieldKind.ShortText);

        var response = await client.DeleteAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}/fields/{field.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task A_field_holding_values_cannot_change_its_kind()
    {
        var (client, universe) = await SignedInWithUniverse("fieldkind");
        var type = await CreateType(client, universe.Id, "Dossier");
        var field = await AddField(client, universe.Id, type.Id, "Title", EntityFieldKind.ShortText);

        await CreateEntity(client, universe.Id, type.Id, "Someone", fields:
            [new FieldValueInput(field.Id, "A title", null, null, null, null, null)]);

        var response = await client.PutFieldAsync(universe.Id, type.Id, field.Id, new FieldDefinitionRequest("Title", EntityFieldKind.Number, false, null, null, null));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task A_required_field_must_be_supplied()
    {
        var (client, universe) = await SignedInWithUniverse("required");
        var type = await CreateType(client, universe.Id, "Dossier");
        await AddField(client, universe.Id, type.Id, "Title", EntityFieldKind.ShortText, isRequired: true);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new EntityRequest(type.Id, "Nameless", null, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---------- Entities ----------

    [Fact]
    public async Task Canon_status_aliases_and_tags_persist()
    {
        var (client, universe) = await SignedInWithUniverse("entitycore");
        var type = await FirstDefaultType(client, universe.Id);

        var created = await CreateEntity(
            client, universe.Id, type.Id, "Alenna Vance",
            summary: "Warden of the drowned coast.",
            canonStatus: CanonStatus.Draft,
            aliases: ["The Warden", "Vance"],
            tags: ["Coast", "House Vance"]);

        var fetched = await GetEntity(client, universe.Id, created.Id);

        Assert.Equal(CanonStatus.Draft, fetched.CanonStatus);
        Assert.Equal("Warden of the drowned coast.", fetched.Summary);
        Assert.Equal(["The Warden", "Vance"], fetched.Aliases);
        Assert.Equal(["Coast", "House Vance"], fetched.Tags);
        Assert.Equal("Character", fetched.EntityTypeName);
    }

    [Fact]
    public async Task An_entity_keeping_its_aliases_and_tags_can_be_updated()
    {
        var (client, universe) = await SignedInWithUniverse("resave");
        var type = await FirstDefaultType(client, universe.Id);

        var created = await CreateEntity(
            client, universe.Id, type.Id, "Alenna Vance",
            aliases: ["The Warden"],
            tags: ["Coast"]);

        // Saving the same aliases and tags again must not collide with the rows already
        // stored for this entity.
        var response = await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{created.Id}",
            new EntityRequest(type.Id, "Alenna Vance", "Now with a summary.",
                CanonStatus.Draft, ["The Warden"], ["Coast"], null));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var fetched = await GetEntity(client, universe.Id, created.Id);
        Assert.Equal(["The Warden"], fetched.Aliases);
        Assert.Equal(["Coast"], fetched.Tags);
        Assert.Equal(CanonStatus.Draft, fetched.CanonStatus);
    }

    [Fact]
    public async Task Updating_replaces_aliases_and_tags_with_the_supplied_set()
    {
        var (client, universe) = await SignedInWithUniverse("replace");
        var type = await FirstDefaultType(client, universe.Id);

        var created = await CreateEntity(
            client, universe.Id, type.Id, "Shifting Name",
            aliases: ["Old Alias"],
            tags: ["Old Tag"]);

        var response = await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{created.Id}",
            new EntityRequest(type.Id, "Shifting Name", null,
                CanonStatus.Idea, ["New Alias"], ["New Tag"], null));

        response.EnsureSuccessStatusCode();

        var fetched = await GetEntity(client, universe.Id, created.Id);
        Assert.Equal(["New Alias"], fetched.Aliases);
        Assert.Equal(["New Tag"], fetched.Tags);
    }

    [Fact]
    public async Task Canon_status_moves_from_idea_through_draft_to_canon()
    {
        var (client, universe) = await SignedInWithUniverse("canonwalk");
        var type = await FirstDefaultType(client, universe.Id);
        var created = await CreateEntity(client, universe.Id, type.Id, "Rising Star");

        Assert.Equal(CanonStatus.Idea, created.CanonStatus);

        foreach (var status in new[] { CanonStatus.Draft, CanonStatus.Canon })
        {
            var response = await client.PutVersionedAsync(
                $"/api/universes/{universe.Id}/entities/{created.Id}",
                new EntityRequest(type.Id, "Rising Star", null, status, null, null, null));

            response.EnsureSuccessStatusCode();
            Assert.Equal(status, (await response.Content.ReadFromJsonAsync<EntityDetail>())!.CanonStatus);
        }

        Assert.Equal(CanonStatus.Canon, (await GetEntity(client, universe.Id, created.Id)).CanonStatus);
    }

    /// <summary>
    /// The article has its own route (EntityArticleEndpointTests). The entry routes carry none: a detail has no
    /// <c>content</c> member, and a client still sending one - an older tab, a stale script - is refused rather than
    /// answered as saved, so a structured save can never quietly drop an article.
    /// </summary>
    [Fact]
    public async Task The_entry_routes_carry_no_article_and_refuse_one_that_is_sent()
    {
        var (client, universe) = await SignedInWithUniverse("noarticle");
        var type = await FirstDefaultType(client, universe.Id);

        const string document = """
            {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"She kept the tide's ledger."}]}]}
            """;

        var refused = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new { entityTypeId = type.Id, name = "Ledger Keeper", content = document, canonStatus = CanonStatus.Idea });
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains(EntityEndpoints.ArticleMovedCode, await refused.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var created = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new { entityTypeId = type.Id, name = "Ledger Keeper", canonStatus = CanonStatus.Idea });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        Guid id;
        using (var body = JsonDocument.Parse(await created.Content.ReadAsStringAsync()))
        {
            Assert.False(body.RootElement.TryGetProperty("content", out _));
            id = body.RootElement.GetProperty("id").GetGuid();
        }

        var edited = await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{id}",
            new { entityTypeId = type.Id, name = "Ledger Keeper", content = "not json at all", canonStatus = CanonStatus.Draft });
        Assert.Equal(HttpStatusCode.BadRequest, edited.StatusCode);
        Assert.Equal(CanonStatus.Idea, (await GetEntity(client, universe.Id, id)).CanonStatus);

        var article = await ArticleTestClient.ReadArticle(client, universe.Id, id);
        Assert.Equal(string.Empty, article.Content);
        Assert.Null(article.UpdatedAt);

        using var detail = JsonDocument.Parse(await client.GetStringAsync($"/api/universes/{universe.Id}/entities/{id}"));
        Assert.False(detail.RootElement.TryGetProperty("content", out _));
    }

    [Fact]
    public async Task Null_entries_in_aliases_and_tags_do_not_break_the_request()
    {
        var (client, universe) = await SignedInWithUniverse("nulllists");
        var type = await FirstDefaultType(client, universe.Id);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new
            {
                entityTypeId = type.Id,
                name = "Sparse Lists",
                canonStatus = CanonStatus.Idea,
                aliases = new string?[] { "Real Alias", null },
                tags = new string?[] { null, "Real Tag" },
            });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<EntityDetail>();
        Assert.Equal(["Real Alias"], created!.Aliases);
        Assert.Equal(["Real Tag"], created.Tags);
    }

    [Fact]
    public async Task Search_matches_name_alias_and_summary()
    {
        var (client, universe) = await SignedInWithUniverse("search");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "Alenna Vance", aliases: ["The Warden"]);
        await CreateEntity(client, universe.Id, type.Id, "Torrin Blake", summary: "Keeper of the drowned coast.");
        await CreateEntity(client, universe.Id, type.Id, "Unrelated Person");

        Assert.Equal(["Alenna Vance"], await SearchNames(client, universe.Id, "Alenna"));
        Assert.Equal(["Alenna Vance"], await SearchNames(client, universe.Id, "Warden"));
        Assert.Equal(["Torrin Blake"], await SearchNames(client, universe.Id, "drowned"));
    }

    [Fact]
    public async Task Filters_narrow_by_type_and_canon_status()
    {
        var (client, universe) = await SignedInWithUniverse("filters");
        var types = await ListTypes(client, universe.Id);
        var character = types.First(type => type.Name == "Character");
        var location = types.First(type => type.Name == "Location");

        await CreateEntity(client, universe.Id, character.Id, "A Person", canonStatus: CanonStatus.Canon);
        await CreateEntity(client, universe.Id, location.Id, "A Place", canonStatus: CanonStatus.Idea);

        var byType = await ListEntities(client, universe.Id, $"entityTypeId={location.Id}");
        Assert.Equal(["A Place"], byType.Items.Select(item => item.Name));

        var byStatus = await ListEntities(client, universe.Id, "canonStatus=2");
        Assert.Equal(["A Person"], byStatus.Items.Select(item => item.Name));
    }

    [Fact]
    public async Task Pagination_splits_the_list_deterministically()
    {
        var (client, universe) = await SignedInWithUniverse("paging");
        var type = await FirstDefaultType(client, universe.Id);

        for (var index = 0; index < 5; index++)
        {
            await CreateEntity(client, universe.Id, type.Id, $"Paged Person {index}");
        }

        var first = await ListEntities(client, universe.Id, "page=1&pageSize=2");
        var second = await ListEntities(client, universe.Id, "page=2&pageSize=2");

        Assert.Equal(5, first.TotalCount);
        Assert.Equal(3, first.TotalPages);
        Assert.Equal(2, first.Items.Count);
        Assert.Empty(first.Items.Select(item => item.Id).Intersect(second.Items.Select(item => item.Id)));
    }

    [Fact]
    public async Task Search_treats_wildcards_literally()
    {
        var (client, universe) = await SignedInWithUniverse("wildcard");
        var type = await FirstDefaultType(client, universe.Id);
        await CreateEntity(client, universe.Id, type.Id, "Ordinary Name");

        Assert.Empty(await SearchNames(client, universe.Id, "%"));
    }

    // ---------- Ownership ----------

    [Fact]
    public async Task Lore_endpoints_reject_anonymous_callers()
    {
        var (owner, universe) = await SignedInWithUniverse("anon");
        var type = await FirstDefaultType(owner, universe.Id);
        var entity = await CreateEntity(owner, universe.Id, type.Id, "Private Person");

        using var anonymous = _factory.CreateClient();

        foreach (var path in new[]
        {
            $"/api/universes/{universe.Id}/entity-types",
            $"/api/universes/{universe.Id}/entities",
            $"/api/universes/{universe.Id}/entities/{entity.Id}",
            $"/api/universes/{universe.Id}/tags",
        })
        {
            var response = await anonymous.GetAsync(path);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }

    [Fact]
    public async Task A_user_cannot_read_another_users_entity()
    {
        var (victim, universe) = await SignedInWithUniverse("victim-read");
        var type = await FirstDefaultType(victim, universe.Id);
        var entity = await CreateEntity(victim, universe.Id, type.Id, "Private Person");

        using var attacker = await SignedInClient("attacker-read");

        var direct = await attacker.GetAsync($"/api/universes/{universe.Id}/entities/{entity.Id}");
        var list = await attacker.GetAsync($"/api/universes/{universe.Id}/entities");

        Assert.Equal(HttpStatusCode.NotFound, direct.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, list.StatusCode);
    }

    [Fact]
    public async Task A_user_cannot_mutate_another_users_entity()
    {
        var (victim, universe) = await SignedInWithUniverse("victim-write");
        var type = await FirstDefaultType(victim, universe.Id);
        var entity = await CreateEntity(victim, universe.Id, type.Id, "Private Person");

        using var attacker = await SignedInClient("attacker-write");

        var update = await attacker.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{entity.Id}",
            new EntityRequest(type.Id, "Hijacked", null, CanonStatus.Canon, null, null, null));
        var delete = await attacker.DeleteAsync($"/api/universes/{universe.Id}/entities/{entity.Id}");
        var create = await attacker.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new EntityRequest(type.Id, "Planted", null, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.NotFound, update.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, create.StatusCode);

        var untouched = await GetEntity(victim, universe.Id, entity.Id);
        Assert.Equal("Private Person", untouched.Name);
        Assert.Equal(CanonStatus.Idea, untouched.CanonStatus);
    }

    [Fact]
    public async Task A_user_cannot_read_or_mutate_another_users_entity_types()
    {
        var (victim, universe) = await SignedInWithUniverse("victim-types");
        var type = await CreateType(victim, universe.Id, "Starship");

        using var attacker = await SignedInClient("attacker-types");

        var list = await attacker.GetAsync($"/api/universes/{universe.Id}/entity-types");
        var create = await attacker.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Planted", null, null, null, null));
        var update = await attacker.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types/{type.Id}",
            new EntityTypeRequest("Hijacked", null, null, null, null));
        var delete = await attacker.DeleteAsync($"/api/universes/{universe.Id}/entity-types/{type.Id}");

        Assert.Equal(HttpStatusCode.NotFound, list.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, create.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, update.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);

        var stillNamed = await ListTypes(victim, universe.Id);
        Assert.Contains(stillNamed, candidate => candidate.Name == "Starship");
    }

    [Fact]
    public async Task Custom_field_routes_cannot_cross_universe_ownership()
    {
        var (victim, victimUniverse) = await SignedInWithUniverse("victim-fields");
        var victimType = await CreateType(victim, victimUniverse.Id, "Dossier");
        var victimField = await AddField(victim, victimUniverse.Id, victimType.Id, "Secret", EntityFieldKind.ShortText);

        using var attacker = await SignedInClient("attacker-fields");

        var add = await attacker.PostAsJsonAsync(
            $"/api/universes/{victimUniverse.Id}/entity-types/{victimType.Id}/fields",
            new FieldDefinitionRequest("Planted", EntityFieldKind.ShortText, false, null, null, null));
        var update = await attacker.PutFieldAsync(victimUniverse.Id, victimType.Id, victimField.Id, new FieldDefinitionRequest("Hijacked", EntityFieldKind.ShortText, false, null, null, null));
        var delete = await attacker.DeleteAsync(
            $"/api/universes/{victimUniverse.Id}/entity-types/{victimType.Id}/fields/{victimField.Id}");

        Assert.Equal(HttpStatusCode.NotFound, add.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, update.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);
    }

    [Fact]
    public async Task A_type_from_another_universe_cannot_be_used_to_create_an_entity()
    {
        var (victim, victimUniverse) = await SignedInWithUniverse("cross-type-victim");
        var victimType = await CreateType(victim, victimUniverse.Id, "Starship");

        var (attacker, attackerUniverse) = await SignedInWithUniverse("cross-type-attacker");

        var response = await attacker.PostAsJsonAsync(
            $"/api/universes/{attackerUniverse.Id}/entities",
            new EntityRequest(victimType.Id, "Smuggled", null, CanonStatus.Idea, null, null, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_entity_reference_cannot_point_outside_the_universe()
    {
        var (victim, victimUniverse) = await SignedInWithUniverse("cross-ref-victim");
        var victimType = await FirstDefaultType(victim, victimUniverse.Id);
        var victimEntity = await CreateEntity(victim, victimUniverse.Id, victimType.Id, "Private Person");

        var (attacker, attackerUniverse) = await SignedInWithUniverse("cross-ref-attacker");
        var attackerType = await CreateType(attacker, attackerUniverse.Id, "Dossier");
        var reference = await AddField(
            attacker, attackerUniverse.Id, attackerType.Id, "Mentor", EntityFieldKind.EntityReference);

        var response = await attacker.PostAsJsonAsync(
            $"/api/universes/{attackerUniverse.Id}/entities",
            new EntityRequest(attackerType.Id, "Prober", null, CanonStatus.Idea, null, null,
                [new FieldValueInput(reference.Id, null, null, null, null, null, victimEntity.Id)]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Tags_are_scoped_to_one_universe()
    {
        var (alice, aliceUniverse) = await SignedInWithUniverse("tags-a");
        var aliceType = await FirstDefaultType(alice, aliceUniverse.Id);
        await CreateEntity(alice, aliceUniverse.Id, aliceType.Id, "Alice Person", tags: ["Shared Name"]);

        var (bob, bobUniverse) = await SignedInWithUniverse("tags-b");
        var bobType = await FirstDefaultType(bob, bobUniverse.Id);
        await CreateEntity(bob, bobUniverse.Id, bobType.Id, "Bob Person", tags: ["Shared Name"]);

        var aliceTags = await alice.GetFromJsonAsync<List<TagResponse>>($"/api/universes/{aliceUniverse.Id}/tags");
        var bobTags = await bob.GetFromJsonAsync<List<TagResponse>>($"/api/universes/{bobUniverse.Id}/tags");

        // Same label, separate rows, one entity each: no tag is shared across universes.
        Assert.Single(aliceTags!);
        Assert.Single(bobTags!);
        Assert.NotEqual(aliceTags![0].Id, bobTags![0].Id);
        Assert.Equal(1, aliceTags[0].EntityCount);
        Assert.Equal(1, bobTags[0].EntityCount);

        var crossRead = await bob.GetAsync($"/api/universes/{aliceUniverse.Id}/tags");
        Assert.Equal(HttpStatusCode.NotFound, crossRead.StatusCode);
    }

    [Fact]
    public async Task Ownership_and_archive_state_cannot_be_overposted()
    {
        var (client, universe) = await SignedInWithUniverse("overpost");
        var type = await FirstDefaultType(client, universe.Id);

        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entities",
            new
            {
                entityTypeId = type.Id,
                name = "Overposted",
                canonStatus = CanonStatus.Idea,
                isArchived = true,
                universeId = Guid.NewGuid(),
                id = Guid.NewGuid(),
                createdAt = new DateTime(1999, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<EntityDetail>();

        Assert.False(created!.IsArchived);
        Assert.True(created.CreatedAt > new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        var listed = await ListEntities(client, universe.Id, "pageSize=50");
        Assert.Contains(listed.Items, item => item.Id == created.Id);
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
        var response = await client.PostAsJsonAsync(
            "/api/universes",
            new CreateUniverseRequest($"World {tag}", null, null));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<UniverseDetail>())!);
    }

    private static async Task<List<EntityTypeResponse>> ListTypes(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;

    private static async Task<EntityTypeResponse> FirstDefaultType(HttpClient client, Guid universeId) =>
        (await ListTypes(client, universeId)).First(type => type.Name == "Character");

    private static async Task<EntityTypeResponse> CreateType(
        HttpClient client,
        Guid universeId,
        string name,
        string? description = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types",
            new EntityTypeRequest(name, description, null, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
    }

    private static async Task<EntityTypeResponse> UpdateType(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        EntityTypeRequest request)
    {
        var response = await client.PutAsJsonAsync($"/api/universes/{universeId}/entity-types/{typeId}", request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
    }

    private static async Task AssertIconRefused(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(problem.RootElement.GetProperty("errors").TryGetProperty("icon", out _));
    }

    private static async Task<FieldDefinitionResponse> AddField(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        EntityFieldKind kind,
        bool isRequired = false,
        IReadOnlyList<string>? options = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, kind, isRequired, null, null, options));
        response.EnsureSuccessStatusCode();
        var type = (await response.Content.ReadFromJsonAsync<EntityTypeResponse>())!;
        return type.Fields.First(field => field.Name == name);
    }

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        string? summary = null,
        CanonStatus canonStatus = CanonStatus.Idea,
        IReadOnlyList<string>? aliases = null,
        IReadOnlyList<string>? tags = null,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, summary, canonStatus, aliases, tags, fields));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<EntityDetail> GetEntity(HttpClient client, Guid universeId, Guid entityId) =>
        (await client.GetFromJsonAsync<EntityDetail>($"/api/universes/{universeId}/entities/{entityId}"))!;

    private static async Task<EntityPage> ListEntities(HttpClient client, Guid universeId, string query) =>
        (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universeId}/entities?{query}"))!;

    private static async Task<List<string>> SearchNames(HttpClient client, Guid universeId, string search)
    {
        var page = await ListEntities(
            client, universeId, $"pageSize=50&search={Uri.EscapeDataString(search)}");
        return page.Items.Select(item => item.Name).ToList();
    }
}
