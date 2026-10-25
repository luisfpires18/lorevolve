using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Restore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// The steps the restore tests share: validating and restoring over HTTP, a world that holds something of every kind a
/// backup carries, rewriting a real exported archive into a broken one, and describing a backup by what it means rather
/// than by its ids. Not a test.
/// </summary>
internal static partial class RestoreTestClient
{
    public const string ValidatePath = "/api/backups/validate";
    public const string RestorePath = "/api/backups/restore";

    // ---------- HTTP ----------

    public static Task<HttpResponseMessage> Validate(HttpClient client, byte[] file)
    {
        var content = new ByteArrayContent(file);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        return client.PutAsync(ValidatePath, content);
    }

    public static async Task<BackupValidationResponse> Validated(HttpClient client, byte[] file)
    {
        var response = await Validate(client, file);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<BackupValidationResponse>())!;
    }

    public static Task<HttpResponseMessage> Restore(HttpClient client, string? token, string? name) =>
        client.PostAsJsonAsync(RestorePath, new RestoreBackupRequest(token, name));

    public static async Task<UniverseDetail> Restored(HttpClient client, string token, string name)
    {
        var response = await Restore(client, token, name);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    /// <summary>Validates and restores in one go, under a name of the test's choosing.</summary>
    public static async Task<UniverseDetail> RestoreArchive(HttpClient client, byte[] archive, string name) =>
        await Restored(client, (await Validated(client, archive)).Token, name);

    /// <summary>A refusal's top-level code, each problem's code, and its sentence.</summary>
    public static async Task<Refusal> Refused(HttpResponseMessage response, HttpStatusCode status = HttpStatusCode.BadRequest)
    {
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == status, $"{(int)response.StatusCode}: {text}");

        using var document = JsonDocument.Parse(text);
        var root = document.RootElement;

        var issues = root.TryGetProperty("issues", out var list)
            ? list.EnumerateArray().Select(issue => (issue.GetProperty("code").GetString()!, issue.GetProperty("message").GetString()!)).ToList()
            : [];

        return new Refusal(
            root.TryGetProperty("code", out var code) ? code.GetString() : null,
            root.TryGetProperty("detail", out var detail) ? detail.GetString() : null,
            issues,
            root.TryGetProperty("moreIssues", out var more) ? more.GetInt32() : 0,
            text);
    }

    public sealed record Refusal(string? Code, string? Detail, IReadOnlyList<(string Code, string Message)> Issues, int MoreIssues, string Raw)
    {
        public IReadOnlyList<string> IssueCodes => [.. Issues.Select(issue => issue.Code)];
    }

    public static async Task<List<UniverseSummary>> Universes(HttpClient client) =>
        [.. (await client.GetFromJsonAsync<UniversePage>("/api/universes?includeArchived=true&pageSize=100"))!.Items];

    // ---------- Archives ----------

    /// <summary>A real exported archive with its document rewritten and, optionally, its files changed.</summary>
    public static byte[] Rewrite(
        byte[] archive,
        Action<JsonObject>? document = null,
        Action<Dictionary<string, byte[]>>? files = null)
    {
        var entries = Entries(archive);
        var root = JsonNode.Parse(entries[BackupArchive.DocumentPath])!.AsObject();
        document?.Invoke(root);
        entries[BackupArchive.DocumentPath] = Encoding.UTF8.GetBytes(root.ToJsonString());
        files?.Invoke(entries);
        return Zip(entries);
    }

    public static Dictionary<string, byte[]> Entries(byte[] archive)
    {
        using var zip = new ZipArchive(new MemoryStream(archive, writable: false), ZipArchiveMode.Read);
        var entries = new Dictionary<string, byte[]>(StringComparer.Ordinal);

        foreach (var entry in zip.Entries)
        {
            using var reading = entry.Open();
            using var buffer = new MemoryStream();
            reading.CopyTo(buffer);
            entries[entry.FullName] = buffer.ToArray();
        }

        return entries;
    }

    /// <summary>Entries in the order given, the document first when it is there.</summary>
    public static byte[] Zip(IEnumerable<KeyValuePair<string, byte[]>> entries)
    {
        using var buffer = new MemoryStream();
        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, bytes) in entries.OrderBy(entry => entry.Key == BackupArchive.DocumentPath ? 0 : 1))
            {
                var entry = zip.CreateEntry(name, CompressionLevel.Fastest);
                using var writing = entry.Open();
                writing.Write(bytes);
            }
        }

        return buffer.ToArray();
    }

    public static JsonObject Payload(JsonObject root) => root["payload"]!.AsObject();

    public static JsonObject EntityNamed(JsonObject root, string name) =>
        Payload(root)["entities"]!.AsArray().Select(node => node!.AsObject()).First(entity => (string?)entity["name"] == name);

    public static JsonObject StoryTitled(JsonObject root, string title) =>
        Payload(root)["stories"]!.AsArray().Select(node => node!.AsObject()).First(story => (string?)story["title"] == title);

    public static JsonObject SceneTitled(JsonObject root, string title) =>
        Payload(root)["stories"]!.AsArray()
            .SelectMany(story => story!["scenes"]!.AsArray())
            .Select(node => node!.AsObject())
            .First(scene => (string?)scene["title"] == title);

    public static string DocumentOf(byte[] archive) => Encoding.UTF8.GetString(Entries(archive)[BackupArchive.DocumentPath]);

    public static UniverseBackup BackupOf(byte[] archive) =>
        JsonSerializer.Deserialize<UniverseBackup>(DocumentOf(archive), UniverseBackupJson.Options)!;

    /// <summary>Every Guid written anywhere in a document.</summary>
    public static HashSet<string> GuidsIn(string document) =>
        [.. GuidPattern().Matches(document).Select(match => match.Value.ToLowerInvariant())];

    [GeneratedRegex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")]
    private static partial Regex GuidPattern();

    /// <summary>Not a flat colour, so two pictures with different sizes produce different bytes.</summary>
    public static byte[] Png(int width, int height, byte seed = 0)
    {
        using var image = new Image<Rgba32>(width, height);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = new Rgba32((byte)((x + seed) % 251), (byte)(y % 241), (byte)((x + y) % 239));
                }
            }
        });

        using var buffer = new MemoryStream();
        image.SaveAsPng(buffer);
        return buffer.ToArray();
    }

    // ---------- A world holding every kind ----------

    public sealed record RichWorld(
        UniverseDetail Universe,
        Guid Warden,
        Guid Mentor,
        Guid Coast,
        Guid LostHeir,
        Guid Story,
        Guid AbandonedStory,
        Guid Arrival,
        Guid Departure,
        Guid ColdOpen,
        Guid Council,
        Guid Vote,
        Guid CutScene,
        Guid Arc,
        Guid Learns,
        Guid Hides,
        Guid FloatingIdea,
        Guid BinnedIdea,
        Guid AfterTheFall,
        byte[] WardenPicture);

    /// <summary>
    /// Everything a version 12 backup can carry, written through the API as an author would: two eras and years in them;
    /// a custom type and fields of several kinds with declared meanings; entries with aliases, tags, values, an edited
    /// history, an article with a restored version and a framed picture; an entry in the Trash; a relation kind with
    /// constraints and a Canon link that is flagged and dismissed beside a finding left pending; a moment across eras; a
    /// story with chapters, Unchaptered, reordered scenes, a point of view, a date, lore links, prose with saved versions;
    /// a chapter, a scene, a beat and a whole story in the Trash; an arc with beats linked to scenes and lore; an idea
    /// referring to every kind and a deleted one; a world rule saved twice and one in the Trash. Plus an unassigned idea and
    /// another universe's idea and rule, which no backup of this universe may hold.
    /// </summary>
    public static async Task<RichWorld> BuildRichWorld(HttpClient client, string name)
    {
        var universe = await PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest(name, "A drowned coast, 北の門.", "#1f8f74"));
        var u = universe.Id;

        var chronology = await PutJson<ChronologyResponse>(
            client,
            $"/api/universes/{u}/chronology",
            new ChronologyRequest(
            [
                new ChronologyEraRequest(null, "Before the Fall", "BF", ChronologyEraDirection.Descending, ChronologyLabelPosition.AfterYear),
                new ChronologyEraRequest(null, "After the Fall", "AF", ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear),
            ]));
        var beforeTheFall = chronology.Eras.First(era => era.Name == "Before the Fall").Id;
        var afterTheFall = chronology.Eras.First(era => era.Name == "After the Fall").Id;

        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var character = types.First(type => type.Name == "Character").Id;

        // Nested (version 19): Relic beneath the starter Item, and a type beneath Relic, so every round trip carries a
        // hierarchy two levels deep.
        var relic = await PostJson<EntityTypeResponse>(
            client,
            $"/api/universes/{u}/entity-types",
            new EntityTypeRequest(
                "Relic", "Things that outlast kings.", "gem", "#b3922f", 40,
                Parent: new EntityTypeParentChoice(types.First(type => type.Name == "Item").Id)));
        await PostJson<EntityTypeResponse>(
            client,
            $"/api/universes/{u}/entity-types",
            new EntityTypeRequest("Crown relic", null, null, null, null, Parent: new EntityTypeParentChoice(relic.Id)));

        var born = await AddField(client, u, character, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);
        var died = await AddField(client, u, character, "Died", EntityFieldKind.Number, EntityFieldSemantic.DeathYear);
        var title = await AddField(client, u, character, "Title", EntityFieldKind.ShortText);
        var allegiance = await AddField(client, u, character, "Allegiance", EntityFieldKind.Select, options: ["Crown", "Guild"]);
        var marks = await AddField(client, u, character, "Marks", EntityFieldKind.MultiSelect, options: ["Ash", "Salt"]);
        var mentorField = await AddField(client, u, character, "Mentor", EntityFieldKind.EntityReference);
        var forged = await AddField(client, u, relic.Id, "Forged", EntityFieldKind.Date);

        var mentor = await PostJson<EntityDetail>(
            client, $"/api/universes/{u}/entities",
            new EntityRequest(character, "Corin Ash", "Keeper of the ledger.", CanonStatus.Draft, null, null, null));
        var coast = await PostJson<EntityDetail>(
            client, $"/api/universes/{u}/entities",
            new EntityRequest(character, "Drowned Coast", null, CanonStatus.Idea, null, null, null));
        await PostJson<EntityDetail>(
            client, $"/api/universes/{u}/entities",
            new EntityRequest(relic.Id, "Salt Crown", "مرحبا, a crown of salt.", CanonStatus.Canon, ["The Brine Diadem"], ["relics"],
                [new FieldValueInput(forged.Id, null, null, null, new DateTime(2001, 2, 3, 4, 5, 6, DateTimeKind.Utc), null, null)]));

        var warden = await PostJson<EntityDetail>(
            client, $"/api/universes/{u}/entities",
            new EntityRequest(
                character, "Alenna Vance", "Warden of the drowned coast.", CanonStatus.Canon, ["The Warden", "Vance"], ["coast", "wardens"],
                [
                    new FieldValueInput(born.Id, null, 12, null, null, null, null, beforeTheFall),
                    new FieldValueInput(died.Id, null, 80, null, null, null, null, afterTheFall),
                    new FieldValueInput(title.Id, "Warden", null, null, null, null, null),
                    new FieldValueInput(allegiance.Id, null, null, null, null, [OptionId(allegiance, "Crown")], null),
                    new FieldValueInput(marks.Id, null, null, null, null, [OptionId(marks, "Ash"), OptionId(marks, "Salt")], null),
                    new FieldValueInput(mentorField.Id, null, null, null, null, null, mentor.Id),
                ]));

        // A second version of the entry, so its history has more than one line.
        await PutJson<EntityDetail>(
            client, $"/api/universes/{u}/entities/{warden.Id}",
            new EntityRequest(
                character, "Alenna Vance", "Warden of the drowned coast, sworn at the seawall.", CanonStatus.Canon, ["The Warden", "Vance"],
                ["coast", "wardens"],
                [
                    new FieldValueInput(born.Id, null, 12, null, null, null, null, beforeTheFall),
                    new FieldValueInput(died.Id, null, 80, null, null, null, null, afterTheFall),
                    new FieldValueInput(title.Id, "High Warden", null, null, null, null, null),
                    new FieldValueInput(allegiance.Id, null, null, null, null, [OptionId(allegiance, "Crown")], null),
                    new FieldValueInput(marks.Id, null, null, null, null, [OptionId(marks, "Ash"), OptionId(marks, "Salt")], null),
                    new FieldValueInput(mentorField.Id, null, null, null, null, null, mentor.Id),
                ]));

        // An article saved twice, then its first version put back.
        var first = await ArticleTestClient.WriteArticle(client, u, warden.Id, ArticleTestClient.Doc("The tide keeps its own ledger."));
        var second = await ArticleTestClient.WriteArticle(client, u, warden.Id, ArticleTestClient.Doc("The seawall remembers.", "Salt and ash."));
        var firstVersion = (await ArticleTestClient.ArticleRevisions(client, u, warden.Id)).First(revision => revision.Number == 1);
        (await ArticleTestClient.RestoreArticle(client, u, warden.Id, firstVersion.Id, second.Version)).EnsureSuccessStatusCode();
        Assert.NotNull(first);

        // A framed picture.
        var picture = Png(240, 160);
        using (var form = new MultipartFormDataContent())
        {
            var file = new ByteArrayContent(picture);
            file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            form.Add(file, "file", "alenna.png");
            form.Add(new StringContent("""{"x":0.25,"y":0,"width":0.5,"height":0.75}"""), "crop");
            (await client.PutAsync($"/api/universes/{u}/entities/{warden.Id}/image", form)).EnsureSuccessStatusCode();
        }

        var lostHeir = await PostJson<EntityDetail>(
            client, $"/api/universes/{u}/entities",
            new EntityRequest(character, "Lost Heir", "Never crowned.", CanonStatus.Draft, ["The Pretender"], ["coast"], null));
        (await client.DeleteAsync($"/api/universes/{u}/entities/{lostHeir.Id}")).EnsureSuccessStatusCode();

        var rules = await PostJson<RelationshipTypeResponse>(
            client, $"/api/universes/{u}/relationship-types",
            new RelationshipTypeRequest("rules", "ruled by", false, "Who answers to whom.", null,
                new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, 5, 90)));
        await PostJson<RelationshipTypeResponse>(
            client, $"/api/universes/{u}/relationship-types",
            new RelationshipTypeRequest("sworn to", null, true, null, null));

        // A kind with a family meaning, and a Draft link of it: a family tree reads it, and nothing else does (ADR 0035).
        var raised = await PostJson<RelationshipTypeResponse>(
            client, $"/api/universes/{u}/relationship-types",
            new RelationshipTypeRequest("raised", "raised by", false, null, null, null, RelationshipFamilySemantic.AdoptiveParent));
        (await client.PostAsJsonAsync(
            $"/api/universes/{u}/relationships",
            new RelationshipRequest(raised.Id, mentor.Id, warden.Id, CanonStatus.Draft, null, null, "Took her in after the flood.")))
            .EnsureSuccessStatusCode();

        // A Canon link onto an Idea: one finding, dismissed. The Canon entry's reference to a Draft mentor: another, left pending.
        (await client.PostAsJsonAsync(
            $"/api/universes/{u}/relationships",
            new RelationshipRequest(rules.Id, warden.Id, coast.Id, CanonStatus.Canon, null, null, "Sworn at the seawall.")))
            .EnsureSuccessStatusCode();

        (await client.PostAsync($"/api/universes/{u}/canon-conflicts/evaluate", null)).EnsureSuccessStatusCode();
        var conflicts = (await client.GetFromJsonAsync<CanonConflictPage>($"/api/universes/{u}/canon-conflicts?pageSize=100"))!;
        var linkToIdea = conflicts.Items.First(conflict => conflict.RuleCode == "CANON-REL-001");
        (await client.PostAsync($"/api/universes/{u}/canon-conflicts/{linkToIdea.Id}/dismiss", null)).EnsureSuccessStatusCode();
        Assert.Contains(conflicts.Items, conflict => conflict.RuleCode != "CANON-REL-001");

        (await client.PostAsJsonAsync(
            $"/api/universes/{u}/timeline",
            new TimelineEntryRequest("The Salt Accord", "The coast swore to the crown.", CanonStatus.Idea, TimelineDateKind.Range,
                3, 4, 5, 2, null, null, null, [coast.Id, warden.Id], beforeTheFall, afterTheFall)))
            .EnsureSuccessStatusCode();

        // A story told out of order, in chapters and Unchaptered.
        var story = await CreateStory(client, u, "The Long Winter");
        var arrival = await CreateChapter(client, u, story, "Arrival");
        var departure = await CreateChapter(client, u, story, "Departure");
        var coldOpen = (await PostJson<SceneResponse>(
            client, $"{PlotTestClient.Story(u, story)}/scenes",
            new SceneRequest("Cold Open", "Snow on the seawall.", "Keep it short.", warden.Id, new ChronologyValue(afterTheFall, 12, 3, null), [coast.Id, warden.Id]))).Id;
        var council = await CreateScene(client, u, story, "The Council", arrival);
        var vote = await CreateScene(client, u, story, "The Vote", arrival);
        (await client.PutAsJsonAsync($"{PlotTestClient.Story(u, story)}/scenes/order", new SceneOrderRequest([vote, council], arrival)))
            .EnsureSuccessStatusCode();
        var cutScene = await CreateScene(client, u, story, "Cut Scene");

        await ManuscriptTestClient.WriteManuscript(client, u, story, council, "The hall was cold.\n\n\tNobody spoke.");
        await ManuscriptTestClient.WriteManuscript(client, u, story, council, "The hall was colder than the sea.\n\n\tNobody spoke. 👩‍👩‍👧");
        await ManuscriptTestClient.WriteManuscript(client, u, story, cutScene, "Words that did not make the cut.");

        var arc = await CreateArc(client, u, story, "Fall of the King", "How the crown breaks.", "Slow.");
        var learns = await CreateBeat(client, u, story, arc.Id, "Learns", [council, cutScene], [warden.Id, coast.Id], "She learns.");
        var hides = await CreateBeat(client, u, story, arc.Id, "Hides", [vote], [mentor.Id]);
        await CreateBeat(client, u, story, arc.Id, "Returns");

        (await client.DeleteAsync($"{PlotTestClient.Story(u, story)}/scenes/{cutScene}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"{PlotTestClient.Story(u, story)}/chapters/{departure}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync(PlotTestClient.Beat(u, story, hides.Id))).EnsureSuccessStatusCode();

        var abandoned = await CreateStory(client, u, "Abandoned Draft");
        await CreateScene(client, u, abandoned, "A scene nobody kept");
        (await client.DeleteAsync(PlotTestClient.Story(u, abandoned))).EnsureSuccessStatusCode();

        var floating = await IdeaTestClient.CreateIdea(
            client,
            "Maybe the city floats",
            "  Nobody below has seen it.\n北の門 & <b>not html</b>  ",
            u,
            [
                IdeaTestClient.Ref(IdeaReferenceKind.Entity, warden.Id),
                IdeaTestClient.Ref(IdeaReferenceKind.Story, story),
                IdeaTestClient.Ref(IdeaReferenceKind.Scene, council),
                IdeaTestClient.Ref(IdeaReferenceKind.PlotArc, arc.Id),
                IdeaTestClient.Ref(IdeaReferenceKind.PlotBeat, learns.Id),
            ]);
        var binned = await IdeaTestClient.CreateIdea(client, "A binned idea", "Still recoverable.", u, [IdeaTestClient.Ref(IdeaReferenceKind.Entity, coast.Id)]);
        (await client.DeleteAsync(IdeaTestClient.Idea(binned.Id))).EnsureSuccessStatusCode();

        await IdeaTestClient.CreateIdea(client, "Unassigned thought", "Belongs to the account.");
        var elsewhere = await PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest($"{name} elsewhere", null, null));
        await IdeaTestClient.CreateIdea(client, "Another world's idea", "Belongs elsewhere.", elsewhere.Id);

        var veil = await WorldRuleTestClient.CreateRule(client, u, "Teleportation cannot cross the Veil", "  Not even the wardens.\n北の門 & <b>not html</b>  ");
        await WorldRuleTestClient.SaveRule(client, u, veil, description: "  Not even the wardens.\n\tNor the tide. 北の門 & <b>not html</b>  ");
        var binnedRule = await WorldRuleTestClient.CreateRule(client, u, "A binned rule", "Still recoverable.");
        await WorldRuleTestClient.DeleteRule(client, u, binnedRule.Id);
        await WorldRuleTestClient.CreateRule(client, elsewhere.Id, "Another world's rule", "Belongs elsewhere.");

        // A rule with a check the warden's two Canon returns break - that finding dismissed - a return with no participant it
        // cannot count, and a method nothing names.
        var returning = await RuleValidationTestClient.EventKind(client, u, "Return from the tide");
        var saltRite = await RuleValidationTestClient.Method(client, u, "Salt rite");
        await RuleValidationTestClient.Method(client, u, "Unused method 北の門");
        await RuleValidationTestClient.CreateCheckedRule(client, u, "The tide returns no one twice", RuleValidationTestClient.Limit(returning.Id, saltRite.Id, 1), "Words.");
        foreach (var (moment, year, participant) in new[] { ("Alenna walks out of the sea", 20, (Guid?)warden.Id), ("Alenna walks out of the sea again", 30, warden.Id), ("Someone walks out of the sea", 40, null) })
        {
            await RuleValidationTestClient.CreateMoment(
                client,
                u,
                new TimelineEntryRequest(moment, null, CanonStatus.Canon, TimelineDateKind.Exact, year, null, null, null, null, null, null, [], afterTheFall, null,
                    RuleValidationTestClient.Details(returning.Id, saltRite.Id, participant)));
        }

        var twice = Assert.Single(await RuleValidationTestClient.Findings(client, u));
        (await client.PostAsync($"/api/universes/{u}/canon-conflicts/{twice.Id}/dismiss", null)).EnsureSuccessStatusCode();

        return new RichWorld(
            universe, warden.Id, mentor.Id, coast.Id, lostHeir.Id, story, abandoned, arrival, departure, coldOpen, council, vote,
            cutScene, arc.Id, learns.Id, hides.Id, floating.Id, binned.Id, afterTheFall, picture);
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
        var type = await PostJson<EntityTypeResponse>(
            client,
            $"/api/universes/{universeId}/entity-types/{typeId}/fields",
            new FieldDefinitionRequest(name, kind, false, null, null, options, semantic));
        return type.Fields.First(field => field.Name == name);
    }

    // ---------- Older formats ----------

    /// <summary>
    /// A real current archive rewritten as the format version it names would have written it: every member that version
    /// did not have removed (ADR 0014), and before version 3 a single JSON document with no pictures rather than an archive.
    /// Only honest on a world that version could have held - no Trash before 10, no chapters before 6, and so on.
    /// </summary>
    public static byte[] Downgrade(byte[] archive, int version)
    {
        var entries = Entries(archive);
        var root = JsonNode.Parse(entries[BackupArchive.DocumentPath])!.AsObject();
        root["formatVersion"] = version;
        var payload = Payload(root);

        void Drop(JsonNode? node, params string[] members)
        {
            foreach (var member in members)
            {
                node?.AsObject().Remove(member);
            }
        }

        if (version < 35)
        {
            // A map's scale arrived in version 35 (issue #53, ADR 0061).
            foreach (var map in payload["maps"]?.AsArray() ?? [])
            {
                Drop(map, "calibration");
            }
        }

        if (version < 34)
        {
            // Maps arrived in version 34 (issue #52, ADR 0060).
            payload.AsObject().Remove("maps");
        }

        if (version < 33)
        {
            // Knowledge records arrived in version 33 (ADR 0057).
            payload.AsObject().Remove("knowledgeRecords");
        }

        if (version < 32)
        {
            // The owner's private note on an entry arrived in version 32 (ADR 0056).
            foreach (var entity in payload["entities"]!.AsArray())
            {
                Drop(entity, "privateNote");
            }
        }

        if (version < 31)
        {
            // A type's field sections, and a field's section, arrived in version 31.
            foreach (var type in payload["entityTypes"]!.AsArray())
            {
                Drop(type, "fieldSections");

                foreach (var field in type!["fields"]!.AsArray())
                {
                    Drop(field, "sectionId");
                }
            }
        }

        if (version < 26)
        {
            // A relationship's and a moment's Trash marker arrived in version 26 (ADR 0048).
            foreach (var relationship in payload["relationships"]!.AsArray())
            {
                Drop(relationship, "deletedAt");
            }

            foreach (var entry in payload["timelineEntries"]!.AsArray())
            {
                Drop(entry, "deletedAt");
            }
        }

        if (version < 25)
        {
            // A field's archived marker arrived in version 25.
            foreach (var type in payload["entityTypes"]!.AsArray())
            {
                foreach (var field in type!["fields"]!.AsArray())
                {
                    Drop(field, "archivedAt");
                }
            }
        }

        if (version < 24)
        {
            // A group's Family Tree switch arrived in version 24.
            foreach (var group in payload["entityTypeGroups"]?.AsArray() ?? [])
            {
                Drop(group, "familyTreeEnabled");
            }
        }

        if (version < 23)
        {
            // Type groups, and a link field's group target, arrived in version 23.
            Drop(payload, "entityTypeGroups");

            foreach (var type in payload["entityTypes"]!.AsArray())
            {
                foreach (var field in type!["fields"]!.AsArray())
                {
                    Drop(field, "targetGroupId");
                }
            }
        }

        if (version < 22)
        {
            // A custom calendar, and the month ids that name its months, arrived in version 22.
            Drop(payload, "chronologyCalendar");

            foreach (var entry in payload["timelineEntries"]!.AsArray())
            {
                Drop(entry, "startMonthId", "endMonthId");
            }

            foreach (var story in payload["stories"]?.AsArray() ?? [])
            {
                foreach (var scene in story!["scenes"]!.AsArray())
                {
                    Drop(scene!["chronology"], "monthId");
                }
            }
        }

        if (version < 21)
        {
            // A moment's stories arrived in version 21.
            foreach (var entry in payload["timelineEntries"]!.AsArray())
            {
                Drop(entry, "storyIds");
            }
        }

        if (version < 20)
        {
            // A link field's allowed type arrived in version 20.
            foreach (var type in payload["entityTypes"]!.AsArray())
            {
                foreach (var field in type!["fields"]!.AsArray())
                {
                    Drop(field, "targetEntityTypeId");
                }
            }
        }

        if (version < 19)
        {
            // A type's parent arrived in version 19.
            foreach (var type in payload["entityTypes"]!.AsArray())
            {
                Drop(type, "parentId");
            }
        }

        if (version < 18)
        {
            // A type's Family Tree eligibility arrived in version 18.
            foreach (var type in payload["entityTypes"]!.AsArray())
            {
                Drop(type, "familyTreeEligible");
            }
        }

        if (version < 17)
        {
            // A universe's attribution arrived in version 17.
            Drop(payload["universe"], "originalCreator", "originalWork");
        }

        if (version < 16)
        {
            // A story's public summary arrived in version 16.
            foreach (var story in payload["stories"]?.AsArray() ?? [])
            {
                Drop(story, "publicSummary");
            }
        }

        if (version < 15)
        {
            // A universe's public details and its artwork arrived in version 15; the artwork's original with them.
            Drop(payload["universe"], "publicSummary", "category", "genres", "artwork");

            foreach (var path in entries.Keys.Where(path => path.StartsWith("media/universe/", StringComparison.Ordinal)).ToList())
            {
                entries.Remove(path);
            }
        }

        if (version < 14)
        {
            foreach (var type in payload["relationshipTypes"]!.AsArray())
            {
                Drop(type, "familySemantic");
            }
        }

        if (version < 13)
        {
            Drop(payload, "validationTerms");

            foreach (var rule in payload["worldRules"]?.AsArray() ?? [])
            {
                Drop(rule, "validation");
            }

            foreach (var entry in payload["timelineEntries"]!.AsArray())
            {
                Drop(entry, "validation");
            }
        }

        if (version < 12)
        {
            Drop(payload, "worldRules");
        }

        if (version < 11)
        {
            Drop(payload, "ideas");
        }

        foreach (var entity in payload["entities"]!.AsArray())
        {
            if (version < 9)
            {
                Drop(entity, "articleUpdatedAt", "articleRevisions");
            }

            if (version < 4)
            {
                foreach (var value in entity!["fieldValues"]!.AsArray())
                {
                    Drop(value, "eraId");
                }

                foreach (var revision in entity["revisions"]!.AsArray())
                {
                    foreach (var value in revision!["fieldValues"]!.AsArray())
                    {
                        Drop(value, "eraId", "eraLabel");
                    }
                }
            }

            if (version < 3)
            {
                Drop(entity, "image");
            }

            if (version < 2)
            {
                Drop(entity, "deletedAt");
            }
        }

        if (version < 5)
        {
            Drop(payload, "stories");
        }
        else
        {
            foreach (var story in payload["stories"]!.AsArray())
            {
                if (version < 10)
                {
                    Drop(story, "deletedAt");
                }

                if (version < 6)
                {
                    Drop(story, "chapters");
                }

                if (version < 7)
                {
                    Drop(story, "plotArcs");
                }

                foreach (var chapter in story!["chapters"]?.AsArray() ?? [])
                {
                    if (version < 10)
                    {
                        Drop(chapter, "deletedAt");
                    }
                }

                foreach (var scene in story["scenes"]!.AsArray())
                {
                    if (version < 6)
                    {
                        Drop(scene, "chapterId");
                    }

                    if (version < 8)
                    {
                        Drop(scene, "manuscript");
                    }
                    else if (version < 10)
                    {
                        Drop(scene!["manuscript"], "revisions");
                    }

                    if (version < 10)
                    {
                        Drop(scene, "deletedAt");
                    }
                }

                foreach (var arc in story["plotArcs"]?.AsArray() ?? [])
                {
                    if (version < 10)
                    {
                        Drop(arc, "deletedAt");

                        foreach (var beat in arc!["beats"]!.AsArray())
                        {
                            Drop(beat, "deletedAt");
                        }
                    }
                }
            }
        }

        if (version < 4)
        {
            Drop(payload, "chronologyEras");

            foreach (var type in payload["relationshipTypes"]!.AsArray())
            {
                Drop(type, "ageOrder", "minAgeDifferenceYears", "maxAgeDifferenceYears");
            }

            foreach (var entry in payload["timelineEntries"]!.AsArray())
            {
                Drop(entry, "startEraId", "endEraId");
            }
        }

        var document = Encoding.UTF8.GetBytes(root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));

        if (version < 3)
        {
            return document;
        }

        entries[BackupArchive.DocumentPath] = document;
        return Zip(entries);
    }

    public sealed record PlainWorld(UniverseDetail Universe, Guid Warden, Guid Story, byte[] WardenPicture);

    /// <summary>
    /// A world every format version could have held: eras and years in them, a typed entry with an article and a picture,
    /// a constrained relation kind, a moment, and a story of Unchaptered scenes with prose, an arc, an idea and a world rule - no
    /// chapters and nothing in the Trash, so reading it as an older version loses only what that version did not carry.
    /// </summary>
    public static async Task<PlainWorld> BuildPlainWorld(HttpClient client, string name)
    {
        var universe = await PostJson<UniverseDetail>(client, "/api/universes", new CreateUniverseRequest(name, "Plain.", null));
        var u = universe.Id;

        var chronology = await PutJson<ChronologyResponse>(
            client,
            $"/api/universes/{u}/chronology",
            new ChronologyRequest([new ChronologyEraRequest(null, "Age of Salt", "AS", ChronologyEraDirection.Ascending, ChronologyLabelPosition.AfterYear)]));
        var era = chronology.Eras.Single().Id;

        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{u}/entity-types"))!;
        var character = types.First(type => type.Name == "Character").Id;
        var born = await AddField(client, u, character, "Born", EntityFieldKind.Number, EntityFieldSemantic.BirthYear);

        var warden = await PostJson<EntityDetail>(
            client, $"/api/universes/{u}/entities",
            new EntityRequest(character, "Alenna Vance", "Warden.", CanonStatus.Canon, ["The Warden"], ["coast"],
                [new FieldValueInput(born.Id, null, 40, null, null, null, null, era)]));
        var coast = await CreateEntity(client, u, "Drowned Coast");
        await ArticleTestClient.WriteArticle(client, u, warden.Id, ArticleTestClient.Doc("The tide keeps its own ledger."));
        await ArticleTestClient.WriteArticle(client, u, warden.Id, ArticleTestClient.Doc("The seawall remembers."));

        var picture = Png(64, 48, 7);
        using (var form = new MultipartFormDataContent())
        {
            var file = new ByteArrayContent(picture);
            file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            form.Add(file, "file", "plain.png");
            (await client.PutAsync($"/api/universes/{u}/entities/{warden.Id}/image", form)).EnsureSuccessStatusCode();
        }

        var rules = await PostJson<RelationshipTypeResponse>(
            client, $"/api/universes/{u}/relationship-types",
            new RelationshipTypeRequest("rules", "ruled by", false, null, null, new RelationshipTypeCanonConstraints(RelationshipAgeOrder.SourceOlder, 1, null)));

        // A kind with a family meaning and no link of its own: every version could hold the kind, and only version 14 its meaning.
        await PostJson<RelationshipTypeResponse>(
            client, $"/api/universes/{u}/relationship-types",
            new RelationshipTypeRequest("bore", "born to", false, null, null, null, RelationshipFamilySemantic.BiologicalParent));
        (await client.PostAsJsonAsync(
            $"/api/universes/{u}/relationships",
            new RelationshipRequest(rules.Id, warden.Id, coast, CanonStatus.Canon, null, null, null))).EnsureSuccessStatusCode();
        var returning = await RuleValidationTestClient.EventKind(client, u, "Return");
        var rite = await RuleValidationTestClient.Method(client, u, "Rite");
        (await client.PostAsJsonAsync(
            $"/api/universes/{u}/timeline",
            new TimelineEntryRequest("The Accord", null, CanonStatus.Canon, TimelineDateKind.Exact, 45, null, null, null, null, null, null, [warden.Id], era,
                Validation: RuleValidationTestClient.Details(returning.Id, rite.Id, warden.Id))))
            .EnsureSuccessStatusCode();

        var story = await CreateStory(client, u, "The Long Winter");
        var first = await CreateScene(client, u, story, "Cold Open");
        await CreateScene(client, u, story, "The Council");
        await ManuscriptTestClient.WriteManuscript(client, u, story, first, "Snow.");
        await ManuscriptTestClient.WriteManuscript(client, u, story, first, "Snow on the seawall.");
        var arc = await CreateArc(client, u, story, "Fall of the King");
        await CreateBeat(client, u, story, arc.Id, "Learns", [first], [warden.Id]);
        await IdeaTestClient.CreateIdea(client, "Maybe the city floats", "Nobody below.", u, [IdeaTestClient.Ref(IdeaReferenceKind.Scene, first)]);

        await WorldRuleTestClient.CreateRule(client, u, "The Veil holds", "Plain.");
        await RuleValidationTestClient.CreateCheckedRule(client, u, "Returns once", RuleValidationTestClient.Limit(returning.Id, rite.Id, 1));

        return new PlainWorld(universe, warden.Id, story, picture);
    }

    // ---------- Meaning, not ids ----------

    /// <summary>
    /// A backup written out as what it says, one line per fact, with every id replaced by the name of what it points at
    /// and every collection in an order that does not depend on ids. Two backups of the same world under different ids
    /// describe identically; any lost value, reference, order, marker, timestamp, version or picture byte shows as a line
    /// that differs. The universe's own name is left out - a restore chooses it.
    /// </summary>
    public static List<string> Describe(UniverseBackup backup, byte[] archive)
    {
        var payload = backup.Payload;
        var files = Entries(archive);
        var lines = new List<string>();

        var eras = (payload.ChronologyEras ?? []).ToDictionary(era => era.Id, era => era.Name);
        var types = payload.EntityTypes.ToDictionary(type => type.Id, type => type.Name);
        var fields = payload.EntityTypes.SelectMany(type => type.Fields.Select(field => (field.Id, Name: $"{type.Name}.{field.Name}")))
            .ToDictionary(item => item.Id, item => item.Name);
        var options = payload.EntityTypes
            .SelectMany(type => type.Fields.SelectMany(field => field.Options.Select(option => (option.Id, Name: $"{type.Name}.{field.Name}.{option.Value}"))))
            .ToDictionary(item => item.Id, item => item.Name);
        var tags = payload.Tags.ToDictionary(tag => tag.Id, tag => tag.Name);
        var entities = payload.Entities.ToDictionary(entity => entity.Id, entity => entity.Name);
        var relationKinds = payload.RelationshipTypes.ToDictionary(type => type.Id, type => type.Name);
        var stories = payload.Stories ?? [];
        var storyTitles = stories.ToDictionary(story => story.Id, story => story.Title);
        var chapters = stories.SelectMany(story => (story.Chapters ?? []).Select(chapter => (chapter.Id, Name: $"{story.Title}/{chapter.Title}")))
            .ToDictionary(item => item.Id, item => item.Name);
        var scenes = stories.SelectMany(story => story.Scenes.Select(scene => (scene.Id, Name: $"{story.Title}/{scene.Title}")))
            .ToDictionary(item => item.Id, item => item.Name);
        var arcs = stories.SelectMany(story => (story.PlotArcs ?? []).Select(arc => (arc.Id, Name: $"{story.Title}/{arc.Title}")))
            .ToDictionary(item => item.Id, item => item.Name);
        var beats = stories.SelectMany(story => (story.PlotArcs ?? []).SelectMany(arc => arc.Beats.Select(beat => (beat.Id, Name: $"{story.Title}/{arc.Title}/{beat.Title}"))))
            .ToDictionary(item => item.Id, item => item.Name);
        var terms = (payload.ValidationTerms ?? []).ToDictionary(term => term.Id, term => $"{term.Kind}:{term.Name}");

        static string N(Dictionary<Guid, string> names, Guid? id) =>
            id is not { } value ? "-" : names.TryGetValue(value, out var name) ? name : "(not in this backup)";

        static string T(DateTime? moment) => moment?.ToString("O", CultureInfo.InvariantCulture) ?? "-";

        static string L(IEnumerable<string> items) => $"[{string.Join(" | ", items.Order(StringComparer.Ordinal))}]";

        var universe = payload.Universe;
        lines.Add($"universe description={universe.Description} accent={universe.AccentColor} archived={universe.IsArchived}");
        lines.Add($"universe public summary={universe.PublicSummary} category={universe.Category} genres=[{string.Join(" | ", universe.Genres ?? [])}]");

        if (universe.Artwork is { } artwork)
        {
            lines.Add($"  artwork {artwork.ContentType} {artwork.Width}x{artwork.Height} {artwork.ByteSize} crop={artwork.Crop} file={artwork.FileName} sha={Convert.ToHexString(SHA256.HashData(files[artwork.MediaPath]))}");
        }

        foreach (var era in (payload.ChronologyEras ?? []).OrderBy(era => era.SortOrder))
        {
            lines.Add($"era {era.SortOrder} {era.Name} {era.Abbreviation} {era.Direction} {era.LabelPosition}");
        }

        foreach (var type in payload.EntityTypes.OrderBy(type => type.Name, StringComparer.Ordinal))
        {
            var parent = payload.EntityTypes.FirstOrDefault(candidate => candidate.Id == type.ParentId)?.Name;
            lines.Add($"type {type.Name} parent={parent} description={type.Description} icon={type.Icon} accent={type.AccentColor} familyTree={type.FamilyTreeEligible} order={type.DisplayOrder} {T(type.CreatedAt)} {T(type.UpdatedAt)}");

            foreach (var field in type.Fields.OrderBy(field => field.Name, StringComparer.Ordinal))
            {
                lines.Add($"  field {field.Name} {field.Kind} {field.Semantic} required={field.IsRequired} order={field.DisplayOrder} default={field.DefaultValue} options={L(field.Options.Select(option => $"{option.DisplayOrder}:{option.Value}"))}");
            }
        }

        lines.Add($"tags {L(payload.Tags.Select(tag => tag.Name))}");

        foreach (var entity in payload.Entities.OrderBy(entity => entity.Name, StringComparer.Ordinal))
        {
            lines.Add($"entry {entity.Name} type={N(types, entity.EntityTypeId)} summary={entity.Summary} canon={entity.CanonStatus} archived={entity.IsArchived} deleted={T(entity.DeletedAt)} {T(entity.CreatedAt)} {T(entity.UpdatedAt)} article@{T(entity.ArticleUpdatedAt)}={entity.Content}");
            lines.Add($"  aliases {L(entity.Aliases)} tags {L(entity.TagIds.Select(id => N(tags, id)))}");

            foreach (var value in entity.FieldValues.Select(value =>
                $"  value {N(fields, value.FieldDefinitionId)} text={value.TextValue} number={value.NumberValue} era={N(eras, value.EraId)} bool={value.BooleanValue} date={T(value.DateValue)} option={N(options, value.OptionId)} ref={N(entities, value.ReferencedEntityId)}")
                .Order(StringComparer.Ordinal))
            {
                lines.Add(value);
            }

            if (entity.Image is { } image)
            {
                var bytes = files[image.MediaPath];
                lines.Add($"  image {image.ContentType} {image.Width}x{image.Height} {image.ByteSize} crop={image.Crop} file={image.FileName} sha={Convert.ToHexString(SHA256.HashData(bytes))}");
            }

            var versionNumbers = entity.Revisions.ToDictionary(revision => revision.Id, revision => $"#{revision.Number}");
            foreach (var revision in entity.Revisions.OrderBy(revision => revision.Number))
            {
                lines.Add($"  version {revision.Number} {revision.Kind} {revision.Changes} from={N(versionNumbers, revision.RestoredFromRevisionId)} {T(revision.CreatedAt)} type={revision.EntityTypeName}/{N(types, revision.EntityTypeId)} name={revision.Name} summary={revision.Summary} canon={revision.CanonStatus} content={revision.Content} aliases={L(revision.Aliases)} tags={L(revision.Tags)}");

                foreach (var value in revision.FieldValues.Select(value =>
                    $"    {value.FieldName}/{N(fields, value.FieldDefinitionId)} {value.Kind} {value.DisplayOrder} text={value.TextValue} number={value.NumberValue} era={value.EraLabel}/{N(eras, value.EraId)} bool={value.BooleanValue} date={T(value.DateValue)} option={value.OptionValue}/{N(options, value.OptionId)} ref={value.ReferencedEntityName}/{N(entities, value.ReferencedEntityId)}")
                    .Order(StringComparer.Ordinal))
                {
                    lines.Add(value);
                }
            }

            var articleNumbers = (entity.ArticleRevisions ?? []).ToDictionary(revision => revision.Id, revision => $"#{revision.Number}");
            foreach (var revision in (entity.ArticleRevisions ?? []).OrderBy(revision => revision.Number))
            {
                lines.Add($"  article version {revision.Number} {revision.Kind} from={N(articleNumbers, revision.RestoredFromRevisionId)} {T(revision.CreatedAt)} {revision.Content}");
            }
        }

        foreach (var type in payload.RelationshipTypes.OrderBy(type => type.Name, StringComparer.Ordinal))
        {
            lines.Add($"relation kind {type.Name} inverse={type.InverseName} symmetric={type.IsSymmetric} description={type.Description} order={type.DisplayOrder} {type.AgeOrder} {type.MinAgeDifferenceYears}-{type.MaxAgeDifferenceYears} family={type.FamilySemantic} {T(type.CreatedAt)} {T(type.UpdatedAt)}");
        }

        foreach (var line in payload.Relationships.Select(relationship =>
            $"relationship {N(entities, relationship.SourceEntityId)} -{N(relationKinds, relationship.RelationshipTypeId)}-> {N(entities, relationship.TargetEntityId)} canon={relationship.CanonStatus} {T(relationship.StartDate)} {T(relationship.EndDate)} notes={relationship.Notes} {T(relationship.CreatedAt)} {T(relationship.UpdatedAt)}")
            .Order(StringComparer.Ordinal))
        {
            lines.Add(line);
        }

        foreach (var entry in payload.TimelineEntries.OrderBy(entry => entry.Title, StringComparer.Ordinal))
        {
            var details = entry.Validation is { } described
                ? $"{N(terms, described.EventKindTermId)}/{N(terms, described.MethodTermId)}/{N(entities, described.ParticipantEntityId)}"
                : "-";
            lines.Add($"moment {entry.Title} description={entry.Description} canon={entry.CanonStatus} {entry.DateKind} {N(eras, entry.StartEraId)} {entry.StartYear}/{entry.StartMonth}/{entry.StartDay} to {N(eras, entry.EndEraId)} {entry.EndYear}/{entry.EndMonth}/{entry.EndDay} label={entry.EraLabel} {T(entry.CreatedAt)} {T(entry.UpdatedAt)} participants={L(entry.ParticipantEntityIds.Select(id => N(entities, id)))} details={details}");
        }

        foreach (var term in (payload.ValidationTerms ?? []).OrderBy(term => term.Kind).ThenBy(term => term.Name, StringComparer.Ordinal))
        {
            lines.Add($"term {term.Kind} {term.Name} {T(term.CreatedAt)} {T(term.UpdatedAt)}");
        }

        foreach (var story in stories.OrderBy(story => story.Title, StringComparer.Ordinal))
        {
            lines.Add($"story {story.Title} premise={story.Premise} {story.Status} deleted={T(story.DeletedAt)} {T(story.CreatedAt)} {T(story.UpdatedAt)}");

            foreach (var chapter in (story.Chapters ?? []).OrderBy(chapter => chapter.DeletedAt is not null).ThenBy(chapter => chapter.SortOrder).ThenBy(chapter => chapter.Title, StringComparer.Ordinal))
            {
                lines.Add($"  chapter {(chapter.DeletedAt is null ? chapter.SortOrder.ToString(CultureInfo.InvariantCulture) : "trashed")} {chapter.Title} summary={chapter.Summary} notes={chapter.Notes} deleted={T(chapter.DeletedAt)} {T(chapter.CreatedAt)} {T(chapter.UpdatedAt)}");
            }

            foreach (var scene in story.Scenes.OrderBy(scene => N(chapters, scene.ChapterId), StringComparer.Ordinal).ThenBy(scene => scene.DeletedAt is not null).ThenBy(scene => scene.SortOrder).ThenBy(scene => scene.Title, StringComparer.Ordinal))
            {
                var place = scene.DeletedAt is null ? scene.SortOrder.ToString(CultureInfo.InvariantCulture) : "trashed";
                var chronology = scene.Chronology is { } date ? $"{N(eras, date.EraId)} {date.Year}/{date.Month}/{date.Day}" : "-";
                lines.Add($"  scene {N(chapters, scene.ChapterId)} {place} {scene.Title} summary={scene.Summary} notes={scene.Notes} pov={N(entities, scene.PovEntityId)} when={chronology} lore={L(scene.LinkedEntityIds.Select(id => N(entities, id)))} deleted={T(scene.DeletedAt)} {T(scene.CreatedAt)} {T(scene.UpdatedAt)}");

                if (scene.Manuscript is { } manuscript)
                {
                    lines.Add($"    manuscript {T(manuscript.UpdatedAt)} {manuscript.Content}");
                    var numbers = (manuscript.Revisions ?? []).ToDictionary(revision => revision.Id, revision => $"#{revision.Number}");
                    foreach (var revision in (manuscript.Revisions ?? []).OrderBy(revision => revision.Number))
                    {
                        lines.Add($"    manuscript version {revision.Number} {revision.Kind} from={N(numbers, revision.RestoredFromRevisionId)} {T(revision.CreatedAt)} {revision.Content}");
                    }
                }
            }

            foreach (var arc in (story.PlotArcs ?? []).OrderBy(arc => arc.DeletedAt is not null).ThenBy(arc => arc.SortOrder).ThenBy(arc => arc.Title, StringComparer.Ordinal))
            {
                lines.Add($"  arc {(arc.DeletedAt is null ? arc.SortOrder.ToString(CultureInfo.InvariantCulture) : "trashed")} {arc.Title} description={arc.Description} notes={arc.Notes} deleted={T(arc.DeletedAt)} {T(arc.CreatedAt)} {T(arc.UpdatedAt)}");

                foreach (var beat in arc.Beats.OrderBy(beat => beat.DeletedAt is not null).ThenBy(beat => beat.SortOrder).ThenBy(beat => beat.Title, StringComparer.Ordinal))
                {
                    lines.Add($"    beat {(beat.DeletedAt is null ? beat.SortOrder.ToString(CultureInfo.InvariantCulture) : "trashed")} {beat.Title} description={beat.Description} notes={beat.Notes} scenes={L(beat.LinkedSceneIds.Select(id => N(scenes, id)))} lore={L(beat.LinkedEntityIds.Select(id => N(entities, id)))} deleted={T(beat.DeletedAt)} {T(beat.CreatedAt)} {T(beat.UpdatedAt)}");
                }
            }
        }

        foreach (var idea in (payload.Ideas ?? []).OrderBy(idea => idea.Title, StringComparer.Ordinal))
        {
            var references = idea.References.Select(reference => $"{reference.Kind}:" + reference.Kind switch
            {
                IdeaReferenceKind.Entity => N(entities, reference.Id),
                IdeaReferenceKind.Story => N(storyTitles, reference.Id),
                IdeaReferenceKind.Scene => N(scenes, reference.Id),
                IdeaReferenceKind.PlotArc => N(arcs, reference.Id),
                _ => N(beats, reference.Id),
            });

            lines.Add($"idea {idea.Title} body={idea.Body} deleted={T(idea.DeletedAt)} {T(idea.CreatedAt)} {T(idea.UpdatedAt)} refs={L(references)}");
        }

        foreach (var rule in (payload.WorldRules ?? []).OrderBy(rule => rule.Title, StringComparer.Ordinal))
        {
            var check = rule.Validation is { } limit
                ? $"{limit.Kind} {N(terms, limit.EventKindTermId)} {N(terms, limit.MethodTermId)} {limit.MaxOccurrences}"
                : "-";
            lines.Add($"world rule {rule.Title} description={rule.Description} deleted={T(rule.DeletedAt)} {T(rule.CreatedAt)} {T(rule.UpdatedAt)} check={check}");
        }

        foreach (var conflict in payload.DismissedConflicts.Select(conflict => $"dismissed {conflict.RuleCode} {conflict.Severity} {T(conflict.DismissedAt)}").Order(StringComparer.Ordinal))
        {
            lines.Add(conflict);
        }

        return lines;
    }
}
