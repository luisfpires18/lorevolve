using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

using static Lorex.Api.Tests.VersionTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// The backup a universe hands back.
///
/// Five claims carry this file. A backup holds everything the author wrote and nothing the
/// installation owns - no account, no configuration, no path, and nothing about the bucket its
/// pictures happen to live in. It carries the pictures themselves, so it does not stop being a
/// backup the day the bucket does. It is internally coherent, so
/// every id in it resolves inside the same file. It is deterministic, so two exports of
/// unchanged lore differ only in the moment stamped on the envelope. And it is reachable
/// only by the one person who owns the universe.
///
/// Credentials are obviously synthetic.
/// </summary>
public sealed class UniverseExportTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private const string Article =
        """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"She kept the tide's ledger."}]}]}""";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Who may take one ----------

    [Fact]
    public async Task An_owner_can_export_their_own_universe()
    {
        var (client, universe) = await SignedInWithUniverse("expown");

        var response = await client.GetAsync(Route(universe.Id));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/zip", response.Content.Headers.ContentType?.MediaType);

        var backup = await Read(response);

        Assert.Equal(UniverseBackup.FormatName, backup.Format);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);
        Assert.Equal(universe.Id, backup.Payload.Universe.Id);
        Assert.Equal(universe.Name, backup.Payload.Universe.Name);
    }

    [Fact]
    public async Task Someone_else_cannot_export_or_discover_a_universe()
    {
        var (owner, universe) = await SignedInWithUniverse("expmine");
        await BuildRichUniverse(owner, universe.Id);

        var stranger = await SignedInClient("user-expyours");

        var response = await stranger.GetAsync(Route(universe.Id));

        // 404, not 403: someone else's universe is indistinguishable from one that is not there.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain("Alenna", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_anonymous_caller_is_challenged_rather_than_answered()
    {
        var (owner, universe) = await SignedInWithUniverse("expanon");
        var anonymous = _factory.CreateClient();

        var response = await anonymous.GetAsync(Route(universe.Id));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        _ = owner;
    }

    [Fact]
    public async Task A_universe_that_is_not_there_and_an_id_that_is_not_one_both_answer_not_found()
    {
        var client = await SignedInClient("user-expmissing");

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync(Route(Guid.NewGuid()))).StatusCode);

        // The route constraint refuses a malformed id before any handler sees it.
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync("/api/universes/not-a-guid/export")).StatusCode);
    }

    [Fact]
    public async Task An_archived_universe_still_exports()
    {
        var (client, universe) = await SignedInWithUniverse("exparchived");
        await BuildRichUniverse(client, universe.Id);

        (await client.PostAsync($"/api/universes/{universe.Id}/archive", null)).EnsureSuccessStatusCode();

        var backup = await Backup(client, universe.Id);

        // Archiving takes a universe out of a list, not out of the owner's hands - and a backup
        // taken just before deleting one is when a backup is worth most.
        Assert.True(backup.Payload.Universe.IsArchived);
        Assert.NotEmpty(backup.Payload.Entities);
    }

    // ---------- The file itself ----------

    [Fact]
    public async Task An_empty_universe_exports_a_valid_file()
    {
        var (client, universe) = await SignedInWithUniverse("expempty");

        var backup = await Backup(client, universe.Id);

        Assert.Equal(UniverseBackup.FormatName, backup.Format);
        Assert.Equal(universe.Id, backup.Payload.Universe.Id);
        Assert.Empty(backup.Payload.Entities);
        Assert.Empty(backup.Payload.Tags);
        Assert.Empty(backup.Payload.Relationships);
        Assert.Empty(backup.Payload.RelationshipTypes);
        Assert.Empty(backup.Payload.TimelineEntries);
        Assert.Empty(backup.Payload.DismissedConflicts);

        // The starter types are lore the author now owns and may rename, so they travel too.
        Assert.NotEmpty(backup.Payload.EntityTypes);
    }

    [Fact]
    public async Task The_download_is_named_for_the_universe_and_the_day()
    {
        var client = await SignedInClient("user-expname");
        var universe = await CreateUniverse(client, "Tide & Ash: the Drowned Coast!");

        var response = await client.GetAsync(Route(universe.Id));
        var disposition = response.Content.Headers.ContentDisposition;

        Assert.Equal("attachment", disposition?.DispositionType);
        Assert.StartsWith("lorex-tide-ash-the-drowned-coast-", disposition?.FileName?.Trim('"'), StringComparison.Ordinal);
        Assert.EndsWith(".zip", disposition?.FileName?.Trim('"'), StringComparison.Ordinal);
    }

    [Fact]
    public void A_universe_named_in_a_script_without_ascii_still_gets_a_usable_filename()
    {
        var moment = new DateTime(2026, 9, 9, 12, 0, 0, DateTimeKind.Utc);

        Assert.Equal("lorex-universe-20260909.zip", UniverseExportEndpoints.FileNameFor("世界", moment));
        Assert.Equal("lorex-universe-20260909.zip", UniverseExportEndpoints.FileNameFor("...", moment));
    }

    [Fact]
    public async Task No_account_or_installation_data_reaches_the_file()
    {
        var client = await SignedInClient("user-expsecrets");
        var universe = await CreateUniverse(client, "Quiet World");
        await BuildRichUniverse(client, universe.Id);

        var raw = await RawExport(client, universe.Id);

        foreach (var forbidden in (string[])
        [
            "ownerId", "user-expsecrets", "@example.test", Password,
            "passwordHash", "securityStamp", "normalizedEmail", "connectionString",
            "AspNetUsers", "D:\\", "/home/",
        ])
        {
            Assert.DoesNotContain(forbidden, raw, StringComparison.OrdinalIgnoreCase);
        }

        // And structurally, not only by string search: the universe object has no owner at all.
        using var document = JsonDocument.Parse(raw);
        var properties = document.RootElement.GetProperty("payload").GetProperty("universe")
            .EnumerateObject().Select(property => property.Name);

        Assert.DoesNotContain(properties, name => name.Contains("owner", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Unchanged_lore_exports_the_same_bytes_apart_from_when_it_was_taken()
    {
        var (client, universe) = await SignedInWithUniverse("expstable");
        await BuildRichUniverse(client, universe.Id);

        var first = await RawExport(client, universe.Id);
        var second = await RawExport(client, universe.Id);

        // The payload is the deterministic half. Byte for byte, on unchanged lore.
        Assert.Equal(PayloadText(first), PayloadText(second));

        // The envelope is the volatile half, and carries exactly one volatile member.
        using var document = JsonDocument.Parse(first);
        var envelope = document.RootElement.EnumerateObject().Select(property => property.Name).ToList();
        Assert.Equal(["format", "formatVersion", "generatedAt", "payload"], envelope);
    }

    [Fact]
    public async Task A_change_to_the_lore_does_change_the_payload()
    {
        var (client, universe) = await SignedInWithUniverse("expmoves");
        var built = await BuildRichUniverse(client, universe.Id);

        var before = PayloadText(await RawExport(client, universe.Id));

        await Save(client, universe.Id, built.Warden with { Summary = "Warden of the drowned coast." });

        Assert.NotEqual(before, PayloadText(await RawExport(client, universe.Id)));
    }

    // ---------- What a backup holds ----------

    [Fact]
    public async Task A_rich_universe_exports_every_kind_of_authored_data()
    {
        var (client, universe) = await SignedInWithUniverse("exprich");
        var built = await BuildRichUniverse(client, universe.Id);

        var payload = (await Backup(client, universe.Id)).Payload;

        Assert.Equal("World exprich", payload.Universe.Name);

        var character = payload.EntityTypes.Single(type => type.Id == built.CharacterTypeId);
        Assert.Contains(character.Fields, field => field.Name == "Title" && field.Kind == EntityFieldKind.ShortText);
        Assert.Contains(character.Fields, field => field.Name == "Notes" && field.Kind == EntityFieldKind.LongText);

        var warden = payload.Entities.Single(entity => entity.Id == built.Warden.Id);
        Assert.Equal(CanonStatus.Canon, warden.CanonStatus);
        Assert.Equal(Article, warden.Content);
        Assert.NotNull(warden.ArticleUpdatedAt);
        Assert.Equal(Article, Assert.Single(warden.ArticleRevisions!).Content);
        Assert.Equal(["The Warden", "Vance"], warden.Aliases);
        Assert.Equal(2, warden.TagIds.Count);

        Assert.Equal(
            ["coast", "wardens"],
            warden.TagIds.Select(id => payload.Tags.Single(tag => tag.Id == id).Name).Order(StringComparer.Ordinal));

        Assert.Equal("Warden", Value(warden, built.TitleFieldId).TextValue);
        Assert.Equal("A ledger of tides.", Value(warden, built.NotesFieldId).TextValue);
        Assert.False(Value(warden, built.AliveFieldId).BooleanValue);
        Assert.Equal(new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc), Value(warden, built.SwornFieldId).DateValue);
        Assert.Equal(built.CrownOptionId, Value(warden, built.AllegianceFieldId).OptionId);

        // A multi-select is one row per chosen option, exactly as it is stored.
        Assert.Equal(2, warden.FieldValues.Count(value => value.FieldDefinitionId == built.MarksFieldId));

        // An entry the author has not touched since creating it is still whole.
        var coast = payload.Entities.Single(entity => entity.Id == built.Coast.Id);
        Assert.Empty(coast.Aliases);
        Assert.Empty(coast.TagIds);
        Assert.Null(coast.Content);
        Assert.Null(coast.ArticleUpdatedAt);
        Assert.Empty(coast.ArticleRevisions!);
    }

    /// <summary>
    /// The Trash is authored lore the owner has not thrown away irrecoverably, so a backup that
    /// omitted it would turn a recoverable mistake into a permanent one the moment the file was
    /// read back. It travels whole, and it travels marked: <c>deletedAt</c> is what tells a
    /// reader which entries are live, and it is why the format is at version 2.
    /// </summary>
    [Fact]
    public async Task A_trashed_entry_is_carried_whole_and_marked_as_trashed()
    {
        var (client, universe) = await SignedInWithUniverse("exptrash");
        var built = await BuildRichUniverse(client, universe.Id);

        (await client.DeleteAsync(
            $"/api/universes/{universe.Id}/entities/{built.Coast.Id}")).EnsureSuccessStatusCode();

        var backup = await Backup(client, universe.Id);

        // Since version 2 the entities collection no longer means "everything here is live", and
        // every version after it inherits that.
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);
        Assert.True(backup.FormatVersion >= 2);

        var coast = backup.Payload.Entities.Single(entity => entity.Id == built.Coast.Id);

        Assert.NotNull(coast.DeletedAt);
        Assert.Equal(DateTimeKind.Utc, coast.DeletedAt!.Value.Kind);
        Assert.Equal("Drowned Coast", coast.Name);
        Assert.Equal(built.CharacterTypeId, coast.EntityTypeId);
        Assert.NotEmpty(coast.Revisions);

        // Everything that pointed at it is still stored, so the backup still carries it: a
        // backup taken while an entry is in the Trash is a backup of a restorable world.
        Assert.Contains(
            backup.Payload.Relationships,
            relationship => relationship.TargetEntityId == built.Coast.Id);
        Assert.Contains(
            backup.Payload.TimelineEntries,
            entry => entry.ParticipantEntityIds.Contains(built.Coast.Id));

        // A live entry says so by carrying nothing.
        Assert.Null(backup.Payload.Entities.Single(entity => entity.Id == built.Warden.Id).DeletedAt);
    }

    [Fact]
    public async Task A_null_value_stays_a_null_and_never_becomes_an_empty_one()
    {
        var (client, universe) = await SignedInWithUniverse("expnulls");
        var built = await BuildRichUniverse(client, universe.Id);

        var payload = (await Backup(client, universe.Id)).Payload;
        var warden = payload.Entities.Single(entity => entity.Id == built.Warden.Id);

        var title = Value(warden, built.TitleFieldId);
        Assert.Null(title.NumberValue);
        Assert.Null(title.BooleanValue);
        Assert.Null(title.DateValue);
        Assert.Null(title.OptionId);
        Assert.Null(title.ReferencedEntityId);

        Assert.Null(payload.Universe.Description);
        Assert.Null(payload.Entities.Single(entity => entity.Id == built.Coast.Id).Summary);

        // Written out, not omitted: "never filled in" and "not in the format" are different facts.
        var raw = await RawExport(client, universe.Id);
        Assert.Contains("\"description\": null", raw, StringComparison.Ordinal);
    }

    [Fact]
    public async Task What_a_field_means_survives_the_trip()
    {
        var (client, universe) = await SignedInWithUniverse("expsemantic");
        var built = await BuildRichUniverse(client, universe.Id);

        var fields = (await Backup(client, universe.Id)).Payload
            .EntityTypes.Single(type => type.Id == built.CharacterTypeId).Fields;

        Assert.Equal(
            EntityFieldSemantic.BirthYear,
            fields.Single(field => field.Id == built.BornFieldId).Semantic);
        Assert.Equal(
            EntityFieldSemantic.DeathYear,
            fields.Single(field => field.Id == built.DiedFieldId).Semantic);

        // Declared meaning is authored and never inferred (ADR 0011), so the normal case is null.
        Assert.Null(fields.Single(field => field.Id == built.TitleFieldId).Semantic);

        // The options an author invented travel with the field that offers them.
        var allegiance = fields.Single(field => field.Id == built.AllegianceFieldId);
        Assert.Equal(["Crown", "Guild"], allegiance.Options.Select(option => option.Value));
    }

    [Fact]
    public async Task Relationships_keep_their_type_their_direction_and_their_wording()
    {
        var (client, universe) = await SignedInWithUniverse("exprel");
        var built = await BuildRichUniverse(client, universe.Id);

        var payload = (await Backup(client, universe.Id)).Payload;

        var type = payload.RelationshipTypes.Single(candidate => candidate.Id == built.RelationshipTypeId);
        Assert.Equal("rules", type.Name);
        Assert.Equal("ruled by", type.InverseName);
        Assert.False(type.IsSymmetric);

        var relationship = Assert.Single(payload.Relationships);
        Assert.Equal(built.RelationshipTypeId, relationship.RelationshipTypeId);
        Assert.Equal(built.Warden.Id, relationship.SourceEntityId);
        Assert.Equal(built.Coast.Id, relationship.TargetEntityId);
        Assert.Equal(CanonStatus.Canon, relationship.CanonStatus);
        Assert.Equal("Sworn at the seawall.", relationship.Notes);
    }

    [Fact]
    public async Task A_relationship_types_canon_constraints_travel_with_it_and_an_unconstrained_type_says_so()
    {
        var (client, universe) = await SignedInWithUniverse("expconstraints");

        (await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types",
            new RelationshipTypeRequest(
                "parent of", "child of", false, null, 1,
                new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, 12, 60))))
            .EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/relationship-types",
            new RelationshipTypeRequest("rules", "ruled by", false, null, 2)))
            .EnsureSuccessStatusCode();

        var backup = await Backup(client, universe.Id);

        // Authored configuration, added within version 4: no fact changes meaning without it. The file
        // is at its current version because of everything since (ADR 0024-0035), not because of these.
        Assert.Equal(25, backup.FormatVersion);

        var parent = backup.Payload.RelationshipTypes.Single(type => type.Name == "parent of");
        Assert.Equal(RelationshipAgeOrder.SourceOlder, parent.AgeOrder);
        Assert.Equal(12, parent.MinAgeDifferenceYears);
        Assert.Equal(60, parent.MaxAgeDifferenceYears);

        var rules = backup.Payload.RelationshipTypes.Single(type => type.Name == "rules");
        Assert.Equal(RelationshipAgeOrder.None, rules.AgeOrder);
        Assert.Null(rules.MinAgeDifferenceYears);
        Assert.Null(rules.MaxAgeDifferenceYears);

        // Written out by name, with the nulls present rather than omitted, and the same bytes twice.
        var first = await RawExport(client, universe.Id);
        Assert.Equal(PayloadText(first), PayloadText(await RawExport(client, universe.Id)));

        using var document = JsonDocument.Parse(first);
        var written = document.RootElement.GetProperty("payload").GetProperty("relationshipTypes")
            .EnumerateArray()
            .Single(type => type.GetProperty("name").GetString() == "rules");

        Assert.Equal("None", written.GetProperty("ageOrder").GetString());
        Assert.Equal(JsonValueKind.Null, written.GetProperty("minAgeDifferenceYears").ValueKind);
        Assert.Equal(JsonValueKind.Null, written.GetProperty("maxAgeDifferenceYears").ValueKind);

        // A kind called "parent of" whose author gave it no family meaning is written as having none (ADR 0035).
        Assert.Equal("None", written.GetProperty("familySemantic").GetString());
        Assert.All(backup.Payload.RelationshipTypes, type => Assert.Equal(RelationshipFamilySemantic.None, type.FamilySemantic));
    }

    [Fact]
    public void A_relationship_type_written_before_constraints_existed_reads_as_unconstrained()
    {
        const string written = """
            {
              "id": "5b0f2a31-6d7e-4c1b-9a44-7f0c2e9d1a10", "name": "parent of", "inverseName": "child of",
              "isSymmetric": false, "description": null, "displayOrder": 1,
              "createdAt": "2026-09-01T00:00:00Z", "updatedAt": "2026-09-01T00:00:00Z"
            }
            """;

        var type = JsonSerializer.Deserialize<BackupRelationshipType>(written, UniverseBackupJson.Options)!;

        Assert.Equal("parent of", type.Name);
        Assert.Equal(RelationshipAgeOrder.None, type.AgeOrder);
        Assert.Null(type.MinAgeDifferenceYears);
        Assert.Null(type.MaxAgeDifferenceYears);

        // Nor does a file written before family meanings existed acquire one from the words "parent of" (ADR 0035).
        Assert.Equal(RelationshipFamilySemantic.None, type.FamilySemantic);
    }

    [Fact]
    public async Task The_timeline_keeps_its_signed_years_its_precision_and_who_took_part()
    {
        var (client, universe) = await SignedInWithUniverse("exptimeline");
        var built = await BuildRichUniverse(client, universe.Id);

        var entry = Assert.Single((await Backup(client, universe.Id)).Payload.TimelineEntries);

        Assert.Equal("The Salt Accord", entry.Title);
        Assert.Equal(TimelineDateKind.Range, entry.DateKind);

        // A year before a universe's own zero is a negative number, not a Gregorian date.
        Assert.Equal(-312, entry.StartYear);
        Assert.Equal(3, entry.StartMonth);
        Assert.Equal(4, entry.StartDay);
        Assert.Equal(-300, entry.EndYear);

        // An unspecified component is null, which is a different claim from zero.
        Assert.Null(entry.EndMonth);
        Assert.Null(entry.EndDay);

        Assert.Equal("Before the Drowning", entry.EraLabel);
        Assert.Equal([built.Coast.Id], entry.ParticipantEntityIds);
    }

    // ---------- Chronology ----------

    [Fact]
    public async Task A_backup_carries_the_chronology_and_the_era_every_year_is_counted_in()
    {
        var (client, universe) = await SignedInWithUniverse("expchronology");
        var eras = await TheFall(client, universe.Id);

        var character = await CharacterType(client, universe.Id);
        var born = await AddField(client, universe.Id, character, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);
        var aranel = await Create(
            client, universe.Id, character, "Aranel", CanonStatus.Idea,
            fields: [new FieldValueInput(born.Id, null, 5, null, null, null, null, eras[0].Id)]);
        await Save(client, universe.Id, aranel with { Name = "Aranel the Elder" });

        (await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/timeline",
            new TimelineEntryRequest(
                "Across the fall", null, CanonStatus.Idea, TimelineDateKind.Range, 3, null, null, 2, null, null,
                null, [aranel.Id], StartEraId: eras[0].Id, EndEraId: eras[1].Id)))
            .EnsureSuccessStatusCode();

        var backup = await Backup(client, universe.Id);
        var payload = backup.Payload;

        // Eras arrived in version 4; stories took the file to 5, chapters to 6, plot to 7 and prose to 8 without
        // changing how eras travel.
        Assert.Equal(25, backup.FormatVersion);
        Assert.Equal(
            [
                new BackupChronologyEra(
                    eras[0].Id, "Before the Fall", "BF", 0, ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new BackupChronologyEra(
                    eras[1].Id, "After the Fall", null, 1, ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear),
            ],
            payload.ChronologyEras!);

        var entry = Assert.Single(payload.TimelineEntries);
        Assert.Equal(3, entry.StartYear);
        Assert.Equal(eras[0].Id, entry.StartEraId);
        Assert.Equal(eras[1].Id, entry.EndEraId);
        Assert.Null(entry.EraLabel);

        var entity = Assert.Single(payload.Entities);
        Assert.Equal(eras[0].Id, Value(entity, born.Id).EraId);

        // Every version keeps the era's id and what was written beside the year then.
        Assert.Equal(2, entity.Revisions.Count);
        Assert.All(entity.Revisions, revision =>
        {
            var value = Assert.Single(revision.FieldValues, candidate => candidate.FieldDefinitionId == born.Id);
            Assert.Equal(eras[0].Id, value.EraId);
            Assert.Equal("BF", value.EraLabel);
        });

        // And every era a year names is one the same file defines.
        var eraIds = payload.ChronologyEras!.Select(era => era.Id).ToHashSet();
        Assert.All(
            payload.TimelineEntries.SelectMany(moment => new[] { moment.StartEraId, moment.EndEraId }).OfType<Guid>(),
            id => Assert.Contains(id, eraIds));
        Assert.All(
            payload.Entities.SelectMany(one => one.FieldValues).Select(value => value.EraId).OfType<Guid>(),
            id => Assert.Contains(id, eraIds));
    }

    [Fact]
    public async Task A_universe_without_eras_carries_an_empty_chronology_and_plain_years()
    {
        var (client, universe) = await SignedInWithUniverse("expplainchronology");
        var built = await BuildRichUniverse(client, universe.Id);

        var payload = (await Backup(client, universe.Id)).Payload;

        Assert.NotNull(payload.ChronologyEras);
        Assert.Empty(payload.ChronologyEras);

        var entry = Assert.Single(payload.TimelineEntries);
        Assert.Null(entry.StartEraId);
        Assert.Null(entry.EndEraId);
        Assert.Null(Value(payload.Entities.Single(entity => entity.Id == built.Warden.Id), built.BornFieldId).EraId);
    }

    [Fact]
    public async Task Unchanged_lore_counted_in_eras_exports_the_same_payload()
    {
        var (client, universe) = await SignedInWithUniverse("expchronologysame");
        var eras = await TheFall(client, universe.Id);
        var character = await CharacterType(client, universe.Id);
        var born = await AddField(client, universe.Id, character, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);
        await Create(
            client, universe.Id, character, "Aranel", CanonStatus.Idea,
            fields: [new FieldValueInput(born.Id, null, 5, null, null, null, null, eras[1].Id)]);

        var first = PayloadText(await RawExport(client, universe.Id));
        var second = PayloadText(await RawExport(client, universe.Id));

        Assert.Equal(first, second);
    }

    /// <summary>
    /// Nothing reads a backup back in yet, so what a reader of an older file gets is exactly what
    /// the records make of it. A version 3 document names no eras, and must come out as plain
    /// signed years - nulls where the eras would be, never a guess.
    /// </summary>
    [Fact]
    public void A_version_three_document_still_reads_as_plain_signed_years()
    {
        const string document = """
            {
              "format": "lorex.universe.backup",
              "formatVersion": 3,
              "generatedAt": "2026-09-10T12:00:00Z",
              "payload": {
                "universe": {
                  "id": "5b0f2a31-6d7e-4c1b-9a44-7f0c2e9d1a01", "name": "An older world", "description": null,
                  "accentColor": null, "isArchived": false,
                  "createdAt": "2026-09-01T00:00:00Z", "updatedAt": "2026-09-01T00:00:00Z"
                },
                "entityTypes": [],
                "tags": [],
                "entities": [
                  {
                    "id": "5b0f2a31-6d7e-4c1b-9a44-7f0c2e9d1a02", "entityTypeId": "5b0f2a31-6d7e-4c1b-9a44-7f0c2e9d1a03",
                    "name": "Elendil", "summary": null, "content": null, "canonStatus": "Canon", "isArchived": false,
                    "deletedAt": null, "createdAt": "2026-09-01T00:00:00Z", "updatedAt": "2026-09-01T00:00:00Z",
                    "aliases": [], "tagIds": [],
                    "fieldValues": [
                      {
                        "fieldDefinitionId": "5b0f2a31-6d7e-4c1b-9a44-7f0c2e9d1a04", "textValue": null, "numberValue": 3119,
                        "booleanValue": null, "dateValue": null, "optionId": null, "referencedEntityId": null
                      }
                    ],
                    "image": null,
                    "revisions": [
                      {
                        "id": "5b0f2a31-6d7e-4c1b-9a44-7f0c2e9d1a05", "number": 1, "kind": "Created", "changes": "None",
                        "restoredFromRevisionId": null, "createdAt": "2026-09-01T00:00:00Z",
                        "entityTypeId": "5b0f2a31-6d7e-4c1b-9a44-7f0c2e9d1a03", "entityTypeName": "Character",
                        "name": "Elendil", "summary": null, "content": null, "canonStatus": "Canon", "aliases": [], "tags": [],
                        "fieldValues": [
                          {
                            "fieldDefinitionId": "5b0f2a31-6d7e-4c1b-9a44-7f0c2e9d1a04", "fieldName": "Born", "kind": "Number",
                            "displayOrder": 1, "textValue": null, "numberValue": 3119, "booleanValue": null,
                            "dateValue": null, "optionId": null, "optionValue": null, "referencedEntityId": null,
                            "referencedEntityName": null
                          }
                        ]
                      }
                    ]
                  }
                ],
                "relationshipTypes": [],
                "relationships": [],
                "timelineEntries": [
                  {
                    "id": "5b0f2a31-6d7e-4c1b-9a44-7f0c2e9d1a06", "title": "The Salt Accord", "description": null,
                    "canonStatus": "Idea", "dateKind": "Range", "startYear": -312, "startMonth": 3, "startDay": 4,
                    "endYear": -300, "endMonth": null, "endDay": null, "eraLabel": "Before the Drowning",
                    "createdAt": "2026-09-01T00:00:00Z", "updatedAt": "2026-09-01T00:00:00Z", "participantEntityIds": []
                  }
                ],
                "dismissedConflicts": []
              }
            }
            """;

        var backup = JsonSerializer.Deserialize<UniverseBackup>(document, UniverseBackupJson.Options)!;

        Assert.Equal(3, backup.FormatVersion);
        Assert.Null(backup.Payload.ChronologyEras);

        var entry = Assert.Single(backup.Payload.TimelineEntries);
        Assert.Equal(-312, entry.StartYear);
        Assert.Null(entry.StartEraId);
        Assert.Null(entry.EndEraId);
        Assert.Equal("Before the Drowning", entry.EraLabel);

        var entity = Assert.Single(backup.Payload.Entities);
        var value = Assert.Single(entity.FieldValues);
        Assert.Equal(3119, value.NumberValue);
        Assert.Null(value.EraId);

        var remembered = Assert.Single(Assert.Single(entity.Revisions).FieldValues);
        Assert.Null(remembered.EraId);
        Assert.Null(remembered.EraLabel);
    }

    private static async Task<IReadOnlyList<ChronologyEraResponse>> TheFall(HttpClient client, Guid universeId)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(
                    null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.BeforeYear),
                new ChronologyEraRequest(
                    null, "After the Fall", null, ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear),
            ]));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ChronologyResponse>())!.Eras;
    }

    [Fact]
    public async Task Every_version_of_every_entry_travels_with_it()
    {
        var (client, universe) = await SignedInWithUniverse("exphistory");
        var built = await BuildRichUniverse(client, universe.Id);

        var edited = await Save(client, universe.Id, built.Warden with { Name = "Alenna Vance the Elder" });
        await Save(client, universe.Id, edited with { Summary = "Keeper of the ledger." });

        var revisions = (await Backup(client, universe.Id)).Payload
            .Entities.Single(entity => entity.Id == built.Warden.Id).Revisions;

        // Oldest first, which is the order they were written in.
        Assert.Equal([1, 2, 3], revisions.Select(revision => revision.Number));
        Assert.Equal(EntityRevisionKind.Created, revisions[0].Kind);
        Assert.Equal("Alenna Vance", revisions[0].Name);
        Assert.Equal("Alenna Vance the Elder", revisions[2].Name);
        Assert.Equal(EntityRevisionChange.Summary, revisions[2].Changes);

        // A snapshot carries both halves of every reference (ADR 0013): the id, and the text
        // that reference displayed at the time.
        var first = revisions[0];

        // No copy of the article: it travels once, with its own history (ADR 0028).
        Assert.Null(first.Content);
        Assert.Equal(["The Warden", "Vance"], first.Aliases);
        Assert.Equal(["coast", "wardens"], first.Tags);

        var allegiance = first.FieldValues.Single(value => value.FieldDefinitionId == built.AllegianceFieldId);
        Assert.Equal("Allegiance", allegiance.FieldName);
        Assert.Equal("Crown", allegiance.OptionValue);
        Assert.Equal(built.CrownOptionId, allegiance.OptionId);

        var mentor = first.FieldValues.Single(value => value.FieldDefinitionId == built.MentorFieldId);
        Assert.Equal(built.Mentor.Id, mentor.ReferencedEntityId);
        Assert.Equal("Corin Ash", mentor.ReferencedEntityName);
    }

    [Fact]
    public async Task A_restore_and_what_it_came_from_are_both_preserved()
    {
        var (client, universe) = await SignedInWithUniverse("exprestore");
        var built = await BuildRichUniverse(client, universe.Id);

        await Save(client, universe.Id, built.Warden with { Name = "Alenna the Drowned" });

        var history = (await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/universes/{universe.Id}/entities/{built.Warden.Id}/revisions"))!;
        var original = history.Single(revision => revision.Number == 1);

        (await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{built.Warden.Id}", original.Id)).EnsureSuccessStatusCode();

        var revisions = (await Backup(client, universe.Id)).Payload
            .Entities.Single(entity => entity.Id == built.Warden.Id).Revisions;

        var restore = revisions.Single(revision => revision.Number == 3);
        Assert.Equal(EntityRevisionKind.Restored, restore.Kind);
        Assert.Equal(original.Id, restore.RestoredFromRevisionId);

        // And what it points at is in the same file, under the same entry.
        Assert.Contains(revisions, revision => revision.Id == restore.RestoredFromRevisionId);
    }

    // ---------- Canon lifecycle ----------

    [Fact]
    public async Task Only_the_dismissals_are_carried_because_only_they_are_authored()
    {
        var (client, universe) = await SignedInWithUniverse("expcanon");
        await BuildRichUniverse(client, universe.Id);

        (await client.PostAsync($"/api/universes/{universe.Id}/canon-conflicts/evaluate", null))
            .EnsureSuccessStatusCode();

        var conflicts = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universe.Id}/canon-conflicts"))!;

        // The lore is deliberately built to produce more than one finding, so leaving one
        // pending proves the filter is a filter and not an empty table.
        Assert.True(conflicts.Items.Count > 1);

        var chosen = conflicts.Items.OrderBy(conflict => conflict.RuleCode, StringComparer.Ordinal).First();
        (await client.PostAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/{chosen.Id}/dismiss", null))
            .EnsureSuccessStatusCode();

        var payload = (await Backup(client, universe.Id)).Payload;

        // A conflict is a derived finding and regenerates from the lore in this same file
        // (ADR 0010). A dismissal is the author's own judgement and nothing re-derives it.
        var dismissed = Assert.Single(payload.DismissedConflicts);
        Assert.Equal(chosen.RuleCode, dismissed.RuleCode);
        Assert.Equal(chosen.Severity, dismissed.Severity);
        Assert.NotEmpty(dismissed.Fingerprint);
        Assert.NotEqual(default, dismissed.DismissedAt);

        // Nothing pending or resolved leaked in alongside it, and no conflict wording either:
        // both are rebuilt, and carrying them would let a backup disagree with the lore in it.
        var raw = await RawExport(client, universe.Id);
        Assert.DoesNotContain(chosen.Explanation, raw, StringComparison.Ordinal);
        Assert.DoesNotContain("\"Pending\"", raw, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_dismissal_can_be_matched_back_to_the_finding_it_suppressed()
    {
        var (client, universe) = await SignedInWithUniverse("expcanonkey");
        await BuildRichUniverse(client, universe.Id);

        (await client.PostAsync($"/api/universes/{universe.Id}/canon-conflicts/evaluate", null))
            .EnsureSuccessStatusCode();

        var conflicts = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universe.Id}/canon-conflicts"))!;
        var chosen = conflicts.Items[0];

        (await client.PostAsync(
            $"/api/universes/{universe.Id}/canon-conflicts/{chosen.Id}/dismiss", null))
            .EnsureSuccessStatusCode();

        var dismissed = Assert.Single((await Backup(client, universe.Id)).Payload.DismissedConflicts);

        // The fingerprint hashes the rule code and the ids of the records at fault, and this
        // backup preserves those ids - so a reader can recompute it and re-apply the dismissal.
        // Re-evaluating changes nothing about it, which is the property that makes it a key.
        (await client.PostAsync($"/api/universes/{universe.Id}/canon-conflicts/evaluate", null))
            .EnsureSuccessStatusCode();

        var again = Assert.Single((await Backup(client, universe.Id)).Payload.DismissedConflicts);
        Assert.Equal(dismissed.Fingerprint, again.Fingerprint);
        Assert.Equal(dismissed.DismissedAt, again.DismissedAt);
    }

    // ---------- Coherence ----------

    [Fact]
    public async Task Every_id_in_a_backup_resolves_inside_the_same_backup()
    {
        var (client, universe) = await SignedInWithUniverse("expcoherent");
        var built = await BuildRichUniverse(client, universe.Id);
        await Save(client, universe.Id, built.Warden with { Name = "Alenna Vance the Elder" });

        var payload = (await Backup(client, universe.Id)).Payload;

        var typeIds = payload.EntityTypes.Select(type => type.Id).ToHashSet();
        var fieldIds = payload.EntityTypes.SelectMany(type => type.Fields).Select(field => field.Id).ToHashSet();
        var optionIds = payload.EntityTypes
            .SelectMany(type => type.Fields).SelectMany(field => field.Options)
            .Select(option => option.Id).ToHashSet();
        var entityIds = payload.Entities.Select(entity => entity.Id).ToHashSet();
        var tagIds = payload.Tags.Select(tag => tag.Id).ToHashSet();

        foreach (var entity in payload.Entities)
        {
            Assert.Contains(entity.EntityTypeId, typeIds);
            Assert.All(entity.TagIds, id => Assert.Contains(id, tagIds));

            foreach (var value in entity.FieldValues)
            {
                Assert.Contains(value.FieldDefinitionId, fieldIds);

                if (value.OptionId is { } optionId)
                {
                    Assert.Contains(optionId, optionIds);
                }

                if (value.ReferencedEntityId is { } referencedId)
                {
                    Assert.Contains(referencedId, entityIds);
                }
            }

            // A revision's ids are raw and deliberately unkeyed (ADR 0013), so they may point
            // at lore since deleted - but nothing here has been deleted, so they all resolve.
            foreach (var revision in entity.Revisions)
            {
                Assert.Contains(revision.EntityTypeId, typeIds);
                Assert.All(revision.FieldValues, value => Assert.Contains(value.FieldDefinitionId, fieldIds));

                if (revision.RestoredFromRevisionId is { } source)
                {
                    Assert.Contains(entity.Revisions, candidate => candidate.Id == source);
                }
            }
        }

        foreach (var relationship in payload.Relationships)
        {
            Assert.Contains(
                relationship.RelationshipTypeId,
                payload.RelationshipTypes.Select(type => type.Id));
            Assert.Contains(relationship.SourceEntityId, entityIds);
            Assert.Contains(relationship.TargetEntityId, entityIds);
        }

        foreach (var entry in payload.TimelineEntries)
        {
            Assert.All(entry.ParticipantEntityIds, id => Assert.Contains(id, entityIds));
        }
    }

    [Fact]
    public async Task A_backup_holds_one_universe_and_never_reaches_into_another()
    {
        var client = await SignedInClient("user-exponly");
        var kept = await CreateUniverse(client, "Kept World");
        var other = await CreateUniverse(client, "Other World");

        await BuildRichUniverse(client, kept.Id);
        await BuildRichUniverse(client, other.Id);

        var payload = (await Backup(client, kept.Id)).Payload;
        var raw = await RawExport(client, kept.Id);

        Assert.Equal(kept.Id, payload.Universe.Id);
        Assert.DoesNotContain(other.Id.ToString(), raw, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(3, payload.Entities.Count);
    }

    // ---------- The media beside the document ----------

    [Fact]
    public async Task An_archive_holds_the_document_first_and_the_original_of_every_picture()
    {
        var (client, universe) = await SignedInWithUniverse("expmedia");
        var character = await CharacterType(client, universe.Id);

        var warden = await Create(client, universe.Id, character, "Alenna Vance", CanonStatus.Canon);
        var uploaded = await Upload(client, universe.Id, warden.Id, Png(320, 200), "portrait.png");

        var archive = await RawArchive(client, universe.Id);
        var names = EntryNames(archive);

        // The document is the first entry, so a reader finds it without scanning the whole file.
        Assert.Equal(BackupArchive.DocumentPath, names[0]);

        var mediaPath = $"media/entities/{warden.Id:D}/original.png";
        Assert.Contains(mediaPath, names);

        // The bytes are the ones that were uploaded, not a re-encoding of them.
        Assert.Equal(
            _factory.Media.Bytes(OriginalKey(universe.Id, warden.Id, uploaded.AssetId, "png")),
            EntryBytes(archive, mediaPath));

        // And the document says where to look, with the shape and identity a reader needs.
        var backup = JsonSerializer.Deserialize<UniverseBackup>(
            DocumentText(archive), UniverseBackupJson.Options)!;

        var image = backup.Payload.Entities.Single(entity => entity.Id == warden.Id).Image!;

        Assert.Equal(uploaded.AssetId, image.AssetId);
        Assert.Equal(mediaPath, image.MediaPath);
        Assert.Equal("image/png", image.ContentType);
        Assert.Equal("portrait.png", image.FileName);
        Assert.Equal(320, image.Width);
        Assert.Equal(200, image.Height);
        Assert.True(image.ByteSize > 0);
        Assert.Equal(new BackupImageCrop(0.1875, 0, 0.625, 1), image.Crop);

        // One framing exists, so the document says nothing about which one.
        Assert.DoesNotContain("\"framing\"", DocumentText(archive), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Crop", """{ "x": 0.5, "y": 0, "width": 0.5, "height": 1 }""")]
    [InlineData("Fit", "null")]
    public void A_version_3_image_written_while_a_fit_framing_existed_still_reads(string framing, string crop)
    {
        // For a short while a version 3 image also carried `framing`: "Crop", or "Fit" with no crop.
        // The member is gone from the format, and a file that still has it reads exactly like one
        // that never did - the crop is kept, and a fit has none, so its thumbnail is regenerated as
        // the centred square.
        var written = $$"""
            {
              "assetId": "6f1c1d3e-8f51-4a0e-9e0e-0f7cbd0f0a01",
              "fileName": "portrait.png",
              "contentType": "image/png",
              "width": 400,
              "height": 200,
              "byteSize": 1234,
              "mediaPath": "media/entities/6f1c1d3e-8f51-4a0e-9e0e-0f7cbd0f0a02/original.png",
              "framing": "{{framing}}",
              "crop": {{crop}}
            }
            """;

        var image = JsonSerializer.Deserialize<BackupEntityImage>(written, UniverseBackupJson.Options)!;

        Assert.Equal("media/entities/6f1c1d3e-8f51-4a0e-9e0e-0f7cbd0f0a02/original.png", image.MediaPath);
        Assert.Equal(framing == "Crop" ? new BackupImageCrop(0.5, 0, 0.5, 1) : null, image.Crop);
    }

    [Fact]
    public async Task A_backup_carries_each_types_icon_key()
    {
        var (client, universe) = await SignedInWithUniverse("expicon");

        var created = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Dynasty", null, "crown", null, null));
        created.EnsureSuccessStatusCode();
        var dynasty = (await created.Content.ReadFromJsonAsync<EntityTypeResponse>())!;

        var bare = await client.PostAsJsonAsync(
            $"/api/universes/{universe.Id}/entity-types",
            new EntityTypeRequest("Rumour", null, null, null, null));
        bare.EnsureSuccessStatusCode();
        var rumour = (await bare.Content.ReadFromJsonAsync<EntityTypeResponse>())!;

        var types = (await Backup(client, universe.Id)).Payload.EntityTypes;

        // Chosen, and chosen as none - both are the author's, so both survive.
        Assert.Equal("crown", types.Single(type => type.Id == dynasty.Id).Icon);
        Assert.Null(types.Single(type => type.Id == rumour.Id).Icon);
        Assert.Equal("character", types.Single(type => type.Name == "Character").Icon);
    }

    [Fact]
    public async Task A_backup_carries_the_chosen_framing_so_a_reader_can_cut_the_same_thumbnail_again()
    {
        var (client, universe) = await SignedInWithUniverse("expframe");
        var character = await CharacterType(client, universe.Id);

        var warden = await Create(client, universe.Id, character, "Alenna Vance", CanonStatus.Canon);
        var uploaded = await Upload(client, universe.Id, warden.Id, Png(400, 200), "portrait.png");

        // Framed after the upload, off-centre, so the backup has to carry a choice rather than
        // the default a reader could have guessed.
        var reframe = await client.PutAsJsonAsync(
            $"/api/universes/{universe.Id}/entities/{warden.Id}/image/thumbnail",
            new EntityThumbnailRequest(uploaded.AssetId, new EntityImageCrop(0.5, 0, 0.5, 1)));
        reframe.EnsureSuccessStatusCode();
        var framed = (await reframe.Content.ReadFromJsonAsync<EntityImageRef>())!;

        var archive = await RawArchive(client, universe.Id);
        var backup = JsonSerializer.Deserialize<UniverseBackup>(DocumentText(archive), UniverseBackupJson.Options)!;
        var image = backup.Payload.Entities.Single(entity => entity.Id == warden.Id).Image!;

        Assert.Equal(new BackupImageCrop(0.5, 0, 0.5, 1), image.Crop);

        // What an importer would do: the original from the archive, the framing from the
        // document, and nothing from the bucket. It has to come out as the very thumbnail the
        // author approved - byte for byte, because the recipe is deterministic - which is why the
        // archive can leave thumbnails out.
        var original = EntryBytes(archive, image.MediaPath);
        using var stream = new MemoryStream(original, writable: false);

        var (regenerated, rejection) = await ImagePreparation.PrepareAsync(
            stream,
            original.Length,
            new ImageCrop(image.Crop!.X, image.Crop.Y, image.Crop.Width, image.Crop.Height),
            CancellationToken.None);

        Assert.Null(rejection);
        Assert.Equal(
            _factory.Media.Bytes(
                $"universes/{universe.Id:D}/entities/{warden.Id:D}/primary/{framed.AssetId:D}/thumbnail-{framed.ThumbnailId:D}.webp"),
            regenerated!.Thumbnail);
    }

    [Fact]
    public async Task A_thumbnail_is_never_carried_because_a_reader_can_make_one()
    {
        var (client, universe) = await SignedInWithUniverse("expthumb");
        var character = await CharacterType(client, universe.Id);

        var warden = await Create(client, universe.Id, character, "Alenna Vance", CanonStatus.Canon);
        await Upload(client, universe.Id, warden.Id, Png(320, 200), "portrait.png");

        var archive = await RawArchive(client, universe.Id);
        var document = DocumentText(archive);

        // It exists in the bucket - it is simply derived, so a reader regenerates it rather
        // than being handed a second copy of every picture to keep in step.
        Assert.Equal(
            2,
            _factory.Media.Keys.Count(key => key.Contains(warden.Id.ToString("D"), StringComparison.Ordinal)));

        Assert.DoesNotContain(
            EntryNames(archive),
            name => name.Contains("thumbnail", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain("thumbnail", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("webp", document, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task An_entry_without_a_picture_carries_no_image_and_no_media()
    {
        var (client, universe) = await SignedInWithUniverse("expnopic");
        var character = await CharacterType(client, universe.Id);

        var warden = await Create(client, universe.Id, character, "Alenna Vance", CanonStatus.Canon);

        var archive = await RawArchive(client, universe.Id);
        var backup = JsonSerializer.Deserialize<UniverseBackup>(
            DocumentText(archive), UniverseBackupJson.Options)!;

        Assert.Null(backup.Payload.Entities.Single(entity => entity.Id == warden.Id).Image);

        // A world with no pictures never reaches the object store at all, so a backup of one
        // works whether or not media storage is configured.
        Assert.Equal([BackupArchive.DocumentPath], EntryNames(archive));
    }

    [Fact]
    public async Task Several_pictures_are_written_in_one_order_whatever_the_world_looks_like()
    {
        var (client, universe) = await SignedInWithUniverse("exporder");
        var character = await CharacterType(client, universe.Id);

        var entries = new List<Guid>();
        foreach (var name in new[] { "Zenna Marr", "Alenna Vance", "Corin Ash" })
        {
            var entry = await Create(client, universe.Id, character, name, CanonStatus.Canon);
            await Upload(client, universe.Id, entry.Id, Png(120 + entries.Count, 100), $"{name}.png");
            entries.Add(entry.Id);
        }

        var media = EntryNames(await RawArchive(client, universe.Id)).Skip(1).ToList();

        // Ordered by the archive path, which is built from ids - so the order does not move when
        // an author renames a character, and two backups of unchanged lore stay comparable.
        Assert.Equal(media.Order(StringComparer.Ordinal), media);
        Assert.Equal(3, media.Count);
        Assert.All(
            entries,
            id => Assert.Contains(media, path => path.Contains(id.ToString("D"), StringComparison.Ordinal)));
    }

    [Fact]
    public async Task A_trashed_entrys_picture_is_carried_with_it()
    {
        var (client, universe) = await SignedInWithUniverse("exptrashpic");
        var character = await CharacterType(client, universe.Id);

        var warden = await Create(client, universe.Id, character, "Alenna Vance", CanonStatus.Canon);
        var uploaded = await Upload(client, universe.Id, warden.Id, Png(200, 200), "portrait.png");

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{warden.Id}"))
            .EnsureSuccessStatusCode();

        var archive = await RawArchive(client, universe.Id);
        var backup = JsonSerializer.Deserialize<UniverseBackup>(
            DocumentText(archive), UniverseBackupJson.Options)!;
        var entry = backup.Payload.Entities.Single(candidate => candidate.Id == warden.Id);

        // The entry is in the Trash and travels whole (ADR 0015). Its picture is part of "whole".
        Assert.NotNull(entry.DeletedAt);
        Assert.Equal(uploaded.AssetId, entry.Image!.AssetId);
        Assert.NotEmpty(EntryBytes(archive, entry.Image.MediaPath));
    }

    [Fact]
    public async Task A_backup_never_reaches_into_another_universes_media()
    {
        var client = await SignedInClient("user-expmediacross");
        var mine = await CreateUniverse(client, "World expmediacross-mine");
        var theirs = await CreateUniverse(client, "World expmediacross-other");

        var here = await Create(
            client, mine.Id, await CharacterType(client, mine.Id), "Alenna Vance", CanonStatus.Canon);
        var there = await Create(
            client, theirs.Id, await CharacterType(client, theirs.Id), "Corin Ash", CanonStatus.Canon);

        await Upload(client, mine.Id, here.Id, Png(200, 200), "here.png");
        await Upload(client, theirs.Id, there.Id, Png(200, 200), "there.png");

        var archive = await RawArchive(client, mine.Id);
        var names = EntryNames(archive);

        Assert.Contains(names, path => path.Contains(here.Id.ToString("D"), StringComparison.Ordinal));
        Assert.DoesNotContain(names, path => path.Contains(there.Id.ToString("D"), StringComparison.Ordinal));
        Assert.DoesNotContain(there.Id.ToString("D"), DocumentText(archive), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_picture_the_store_cannot_produce_fails_the_backup_rather_than_thinning_it()
    {
        var (client, universe) = await SignedInWithUniverse("expmediagone");
        var character = await CharacterType(client, universe.Id);

        var warden = await Create(client, universe.Id, character, "Alenna Vance", CanonStatus.Canon);
        var uploaded = await Upload(client, universe.Id, warden.Id, Png(200, 200), "portrait.png");

        // The row still names it; the bucket has lost it. A backup is a promise about
        // completeness, so this is a refusal and not a smaller archive.
        _factory.Media.Evict(OriginalKey(universe.Id, warden.Id, uploaded.AssetId, "png"));

        var response = await client.GetAsync(Route(universe.Id));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(UniverseExportEndpoints.MediaMissingCode, problem.GetProperty("code").GetString());
        Assert.Contains(
            warden.Id.ToString("D"), problem.GetProperty("detail").GetString()!, StringComparison.Ordinal);

        // Nothing that looks like a usable file was handed over.
        Assert.NotEqual("application/zip", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Nothing_about_the_bucket_reaches_the_portable_file()
    {
        var (client, universe) = await SignedInWithUniverse("expmedialeak");
        var character = await CharacterType(client, universe.Id);

        var warden = await Create(client, universe.Id, character, "Alenna Vance", CanonStatus.Canon);
        await Upload(client, universe.Id, warden.Id, Png(200, 200), "portrait.png");

        var document = DocumentText(await RawArchive(client, universe.Id));

        // The object key is how this installation reaches the bytes. It is not the picture's
        // identity, it means nothing on another machine, and a restore does not need it - so it
        // is not in the file, and neither is anything else about where the bucket is.
        Assert.DoesNotContain("universes/", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("originalKey", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("thumbnailKey", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("objectKey", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("cloudflare", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("bucket", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("accesskey", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("https://", document, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Unchanged_lore_and_unchanged_pictures_produce_the_same_archive()
    {
        var (client, universe) = await SignedInWithUniverse("expmediastable");
        var character = await CharacterType(client, universe.Id);

        foreach (var name in new[] { "Alenna Vance", "Corin Ash" })
        {
            var entry = await Create(client, universe.Id, character, name, CanonStatus.Canon);
            await Upload(client, universe.Id, entry.Id, Png(200, 160), $"{name}.png");
        }

        var first = await RawArchive(client, universe.Id);
        var second = await RawArchive(client, universe.Id);

        // Same entries, same order.
        Assert.Equal(EntryNames(first), EntryNames(second));

        // Same media, byte for byte.
        foreach (var name in EntryNames(first).Where(path => path != BackupArchive.DocumentPath))
        {
            Assert.Equal(EntryBytes(first, name), EntryBytes(second, name));
        }

        // Same document, apart from the one volatile member the envelope is allowed to carry.
        Assert.Equal(PayloadText(DocumentText(first)), PayloadText(DocumentText(second)));

        // And no clock reached the archive itself: every entry carries the same fixed stamp,
        // so two exports cannot differ over when they were taken.
        using var zip = new ZipArchive(new MemoryStream(first, writable: false), ZipArchiveMode.Read);
        Assert.All(zip.Entries, entry => Assert.Equal(BackupArchive.Timestamp, entry.LastWriteTime));
    }

    // ---------- Helpers ----------

    private static string Route(Guid universeId) => $"/api/universes/{universeId}/export";

    private static async Task<UniverseBackup> Read(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return JsonSerializer.Deserialize<UniverseBackup>(
            DocumentText(await response.Content.ReadAsByteArrayAsync()),
            UniverseBackupJson.Options)!;
    }

    private static async Task<UniverseBackup> Backup(HttpClient client, Guid universeId) =>
        await Read(await client.GetAsync(Route(universeId)));

    /// <summary>The downloaded archive, whole.</summary>
    private static async Task<byte[]> RawArchive(HttpClient client, Guid universeId)
    {
        var response = await client.GetAsync(Route(universeId));
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync();
    }

    /// <summary>The document inside the archive, as text.</summary>
    private static async Task<string> RawExport(HttpClient client, Guid universeId) =>
        DocumentText(await RawArchive(client, universeId));

    private static string DocumentText(byte[] archive) =>
        Encoding.UTF8.GetString(EntryBytes(archive, BackupArchive.DocumentPath));

    /// <summary>Entry names in the order the archive stores them, which is the order they were written.</summary>
    private static IReadOnlyList<string> EntryNames(byte[] archive)
    {
        using var zip = new ZipArchive(new MemoryStream(archive, writable: false), ZipArchiveMode.Read);
        return [.. zip.Entries.Select(entry => entry.FullName)];
    }

    private static byte[] EntryBytes(byte[] archive, string path)
    {
        using var zip = new ZipArchive(new MemoryStream(archive, writable: false), ZipArchiveMode.Read);
        var entry = zip.GetEntry(path) ?? throw new InvalidOperationException($"No '{path}' in the archive.");

        using var reading = entry.Open();
        using var buffer = new MemoryStream();
        reading.CopyTo(buffer);
        return buffer.ToArray();
    }

    /// <summary>The deterministic half of the file, as text, so two exports can be compared.</summary>
    private static string PayloadText(string raw)
    {
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.GetProperty("payload").GetRawText();
    }

    private static BackupFieldValue Value(BackupEntity entity, Guid fieldId) =>
        entity.FieldValues.First(value => value.FieldDefinitionId == fieldId);

    // ---------- Pictures ----------

    private static async Task<Guid> CharacterType(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        return types.First(type => type.Name == "Character").Id;
    }

    private static async Task<EntityImageRef> Upload(
        HttpClient client,
        Guid universeId,
        Guid entityId,
        byte[] bytes,
        string fileName)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", fileName);

        var response = await client.PutAsync($"/api/universes/{universeId}/entities/{entityId}/image", form);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityImageRef>())!;
    }

    /// <summary>Where the original sits in the bucket - an internal address, never in the file.</summary>
    private static string OriginalKey(Guid universeId, Guid entityId, Guid assetId, string extension) =>
        $"universes/{universeId:D}/entities/{entityId:D}/primary/{assetId:D}/original.{extension}";

    /// <summary>Not a flat colour: two entries whose pictures differ must produce different bytes.</summary>
    private static byte[] Png(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = new Rgba32((byte)(x % 251), (byte)(y % 241), (byte)((x + y) % 239));
                }
            }
        });

        using var buffer = new MemoryStream();
        image.SaveAsPng(buffer);
        return buffer.ToArray();
    }

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

    /// <summary>
    /// Everything a universe can currently hold, in one world: a type with a field of every
    /// kind including two declared meanings, three entries with aliases, tags, an article and
    /// values, a relationship, a timeline entry with a negative year and a participant, and
    /// enough disagreement in the lore to produce more than one Canon finding.
    ///
    /// Deliberately no impossible lifespan and no moment before a birth, so nothing here is a
    /// High finding and the promotion gate has nothing to refuse.
    /// </summary>
    private static async Task<RichUniverse> BuildRichUniverse(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;
        var character = types.First(type => type.Name == "Character");

        var born = await AddField(client, universeId, character.Id, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);
        var died = await AddField(client, universeId, character.Id, "Died", EntityFieldKind.Number, EntityFieldSemantic.DeathYear);
        var title = await AddField(client, universeId, character.Id, "Title", EntityFieldKind.ShortText);
        var notes = await AddField(client, universeId, character.Id, "Notes", EntityFieldKind.LongText);
        var alive = await AddField(client, universeId, character.Id, "Alive", EntityFieldKind.Boolean);
        var sworn = await AddField(client, universeId, character.Id, "Sworn On", EntityFieldKind.Date);
        var allegiance = await AddField(
            client, universeId, character.Id, "Allegiance", EntityFieldKind.Select, options: ["Crown", "Guild"]);
        var marks = await AddField(
            client, universeId, character.Id, "Marks", EntityFieldKind.MultiSelect, options: ["Ash", "Salt"]);
        var mentor = await AddField(client, universeId, character.Id, "Mentor", EntityFieldKind.EntityReference);

        // A Draft the Canon warden will point at, which is one CANON-FIELD-001 finding.
        var mentorEntity = await Create(client, universeId, character.Id, "Corin Ash", CanonStatus.Draft);

        // An Idea the Canon relationship will land on, which is one CANON-REL-001 finding.
        var coast = await Create(client, universeId, character.Id, "Drowned Coast", CanonStatus.Idea);

        var warden = await Create(
            client,
            universeId,
            character.Id,
            "Alenna Vance",
            CanonStatus.Canon,
            article: Article,
            aliases: ["The Warden", "Vance"],
            tags: ["coast", "wardens"],
            fields:
            [
                new FieldValueInput(born.Id, null, 100, null, null, null, null),
                new FieldValueInput(died.Id, null, 200, null, null, null, null),
                new FieldValueInput(title.Id, "Warden", null, null, null, null, null),
                new FieldValueInput(notes.Id, "A ledger of tides.", null, null, null, null, null),
                new FieldValueInput(alive.Id, null, null, false, null, null, null),
                new FieldValueInput(
                    sworn.Id, null, null, null, new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc), null, null),
                new FieldValueInput(allegiance.Id, null, null, null, null, [OptionId(allegiance, "Crown")], null),
                new FieldValueInput(
                    marks.Id, null, null, null, null, [OptionId(marks, "Ash"), OptionId(marks, "Salt")], null),
                new FieldValueInput(mentor.Id, null, null, null, null, null, mentorEntity.Id),
            ]);

        var relationshipType = (await (await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationship-types",
            new RelationshipTypeRequest("rules", "ruled by", false, "Who answers to whom.", null)))
            .Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;

        (await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/relationships",
            new RelationshipRequest(
                relationshipType.Id, warden.Id, coast.Id, CanonStatus.Canon, null, null, "Sworn at the seawall.")))
            .EnsureSuccessStatusCode();

        (await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/timeline",
            new TimelineEntryRequest(
                "The Salt Accord",
                "The coast swore to the crown.",
                CanonStatus.Idea,
                TimelineDateKind.Range,
                -312, 3, 4,
                -300, null, null,
                "Before the Drowning",
                [coast.Id])))
            .EnsureSuccessStatusCode();

        return new RichUniverse(
            character.Id, born.Id, died.Id, title.Id, notes.Id, alive.Id, sworn.Id,
            allegiance.Id, OptionId(allegiance, "Crown"), marks.Id, mentor.Id,
            relationshipType.Id, warden, mentorEntity, coast);
    }

    private static Guid OptionId(FieldDefinitionResponse field, string value) =>
        field.Options.First(option => option.Value == value).Id;

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

    private static async Task<EntityDetail> Create(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        CanonStatus canonStatus,
        string? article = null,
        IReadOnlyList<string>? aliases = null,
        IReadOnlyList<string>? tags = null,
        IReadOnlyList<FieldValueInput>? fields = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, null, canonStatus, aliases, tags, fields));
        response.EnsureSuccessStatusCode();
        var created = (await response.Content.ReadFromJsonAsync<EntityDetail>())!;

        // The article is saved on its own route, as the editor saves it.
        if (article is not null)
        {
            await ArticleTestClient.WriteArticle(client, universeId, created.Id, article);
        }

        return created;
    }

    /// <summary>Re-saves an entry from its own detail, which is what the client does.</summary>
    private static async Task<EntityDetail> Save(HttpClient client, Guid universeId, EntityDetail entity)
    {
        var response = await client.PutVersionedAsync(
            $"/api/universes/{universeId}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId,
                entity.Name,
                entity.Summary,
                entity.CanonStatus,
                entity.Aliases,
                entity.Tags,
                [.. entity.Fields.Select(field => new FieldValueInput(
                    field.FieldDefinitionId,
                    field.Text,
                    field.Number,
                    field.Boolean,
                    field.Date,
                    field.OptionIds,
                    field.ReferencedEntityId,
                    field.EraId))]));

        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private sealed record RichUniverse(
        Guid CharacterTypeId,
        Guid BornFieldId,
        Guid DiedFieldId,
        Guid TitleFieldId,
        Guid NotesFieldId,
        Guid AliveFieldId,
        Guid SwornFieldId,
        Guid AllegianceFieldId,
        Guid CrownOptionId,
        Guid MarksFieldId,
        Guid MentorFieldId,
        Guid RelationshipTypeId,
        EntityDetail Warden,
        EntityDetail Mentor,
        EntityDetail Coast);
}
