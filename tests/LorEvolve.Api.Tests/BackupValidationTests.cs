using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.Restore;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// What validation refuses, and how it says so (ADR 0032). Every broken backup here is a real exported archive with one
/// thing changed, so each test proves that one fault - and only a fault - is what stops a restore. Every refusal names a
/// stable code and a sentence, exposes nothing internal, keeps no upload, and creates no universe.
/// </summary>
public sealed class BackupValidationTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private static readonly SemaphoreSlim Building = new(1, 1);
    private static byte[]? _archive;

    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task A_current_backup_validates_and_previews_what_it_would_create()
    {
        var (client, archive) = await Setup("valid");
        var validated = await Validated(client, archive);

        Assert.Matches("^[0-9a-f]{64}$", validated.Token);
        Assert.Equal("Validation world", validated.Preview.UniverseName);
        Assert.Equal("A drowned coast, 北の門.", validated.Preview.Description);
        Assert.Equal(BackupFormatSupport.MaxVersion, validated.Preview.FormatVersion);
        Assert.True(validated.Preview.NameAvailable);
        Assert.Equal(BackupOf(archive).GeneratedAt, validated.Preview.GeneratedAt);

        // Counted by the server from the file, not taken from anything the client could say.
        var payload = BackupOf(archive).Payload;
        Assert.Equal(payload.EntityTypes.Count, validated.Preview.Counts.EntityTypes);
        Assert.Equal(payload.Entities.Count(entity => entity.DeletedAt is null), validated.Preview.Counts.Entries);
        Assert.Equal(payload.Entities.Count(entity => entity.DeletedAt is not null), validated.Preview.Counts.EntriesInTrash);
    }

    // ---------- Not a backup, or not one this LorEvolve reads ----------

    [Fact]
    public async Task A_file_that_is_not_a_backup_is_refused_as_such()
    {
        var (client, _) = await Setup("not-backup");

        await AssertRefused(client, Encoding.UTF8.GetBytes("hello, I am a text file"), BackupIssueCodes.NotABackup);
        await AssertRefused(client, [], BackupIssueCodes.NotABackup);
        await AssertRefused(client, Encoding.UTF8.GetBytes("""{"format":"someone.elses.backup","formatVersion":1,"payload":{}}"""), BackupIssueCodes.NotABackup);
        await AssertRefused(client, Zip([new("notes.txt", Encoding.UTF8.GetBytes("no document"))]), BackupIssueCodes.Damaged);
    }

    [Fact]
    public async Task The_document_on_its_own_is_pointed_back_at_the_archive()
    {
        var (client, archive) = await Setup("bare-document");
        var refusal = await AssertRefused(client, Entries(archive)[BackupArchive.DocumentPath], BackupIssueCodes.NotABackup);
        Assert.Contains(".zip", refusal.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_backup_from_a_newer_LorEvolve_or_an_impossible_version_is_refused_as_unsupported()
    {
        var (client, archive) = await Setup("versions");

        var next = BackupFormatSupport.MaxVersion + 1;
        var newer = await AssertRefused(client, Rewrite(archive, root => root["formatVersion"] = next), BackupIssueCodes.UnsupportedVersion);
        Assert.Contains(next.ToString(System.Globalization.CultureInfo.InvariantCulture), newer.Detail, StringComparison.Ordinal);
        Assert.Contains(BackupFormatSupport.MaxVersion.ToString(System.Globalization.CultureInfo.InvariantCulture), newer.Detail, StringComparison.Ordinal);

        // A newer file is told it is newer even when its payload would not parse as anything this build knows.
        await AssertRefused(
            client,
            Rewrite(archive, root => { root["formatVersion"] = 99; Payload(root)["entities"] = "a shape from the future"; }),
            BackupIssueCodes.UnsupportedVersion);

        await AssertRefused(client, Rewrite(archive, root => root["formatVersion"] = 0), BackupIssueCodes.UnsupportedVersion);
        await AssertRefused(client, Rewrite(archive, root => root.Remove("formatVersion")), BackupIssueCodes.Damaged);

        // Versions 1 and 2 were single files, never archives.
        await AssertRefused(client, Rewrite(archive, root => root["formatVersion"] = 2), BackupIssueCodes.Damaged);
    }

    [Fact]
    public async Task A_damaged_archive_or_document_is_refused_as_damaged()
    {
        var (client, archive) = await Setup("damaged");

        await AssertRefused(client, archive[..(archive.Length - 64)], BackupIssueCodes.Damaged);
        await AssertRefused(client, archive[..(archive.Length / 2)], BackupIssueCodes.Damaged);

        var truncatedJson = Rewrite(archive, files: entries => entries[BackupArchive.DocumentPath] = entries[BackupArchive.DocumentPath][..200]);
        await AssertRefused(client, truncatedJson, BackupIssueCodes.Damaged);

        var misshapen = await AssertRefused(client, Rewrite(archive, root => EntityNamed(root, "Alenna Vance")["canonStatus"] = "Canonical"), BackupIssueCodes.Damaged);
        Assert.Contains("$.payload.entities", misshapen.Detail, StringComparison.Ordinal);

        await AssertRefused(client, Rewrite(archive, root => root["payload"] = null), BackupIssueCodes.Damaged);
    }

    // ---------- Readable, but not reconstructable ----------

    [Fact]
    public async Task Duplicate_ids_are_refused()
    {
        var (client, archive) = await Setup("duplicate-ids");
        var broken = Rewrite(archive, root => EntityNamed(root, "Corin Ash")["id"] = EntityNamed(root, "Drowned Coast")["id"]!.GetValue<string>());
        var refusal = await AssertRefused(client, broken, BackupIssueCodes.Invalid);
        Assert.Contains(BackupIssueCodes.DuplicateId, refusal.IssueCodes);
    }

    [Fact]
    public async Task Every_kind_of_dangling_reference_is_refused()
    {
        var (client, archive) = await Setup("dangling");
        var nowhere = Guid.NewGuid().ToString();

        await AssertIssue(client, Rewrite(archive, root => EntityNamed(root, "Corin Ash")["entityTypeId"] = nowhere), BackupIssueCodes.MissingReference, "entry type");
        await AssertIssue(client, Rewrite(archive, root => Payload(root)["relationships"]![0]!["targetEntityId"] = nowhere), BackupIssueCodes.MissingReference, "relationship");
        await AssertIssue(client, Rewrite(archive, root => SceneTitled(root, "The Council")["chapterId"] = nowhere), BackupIssueCodes.MissingReference, "chapter");
        await AssertIssue(client, Rewrite(archive, root => SceneTitled(root, "Cold Open")["povEntityId"] = nowhere), BackupIssueCodes.MissingReference, "point of view");
        await AssertIssue(client, Rewrite(archive, root => Payload(root)["timelineEntries"]![0]!["startEraId"] = nowhere), BackupIssueCodes.MissingReference, "date period");
        await AssertIssue(
            client,
            Rewrite(archive, root => StoryTitled(root, "The Long Winter")["plotArcs"]![0]!["beats"]!.AsArray()
                .First(beat => (string?)beat!["title"] == "Learns")!["linkedSceneIds"] = new JsonArray(nowhere)),
            BackupIssueCodes.MissingReference,
            "scene");
        await AssertIssue(
            client,
            Rewrite(archive, root => StoryTitled(root, "The Long Winter")["plotArcs"]![0]!["beats"]!.AsArray()
                .First(beat => (string?)beat!["title"] == "Learns")!["linkedEntityIds"] = new JsonArray(nowhere)),
            BackupIssueCodes.MissingReference,
            "entry");

        // A reference's kind is taken as written: an entry's id named as a scene resolves to nothing.
        await AssertIssue(
            client,
            Rewrite(archive, root =>
            {
                var idea = Payload(root)["ideas"]!.AsArray().First(node => (string?)node!["title"] == "Maybe the city floats")!;
                var entity = idea["references"]!.AsArray().First(reference => (string?)reference!["kind"] == "Entity")!;
                entity["kind"] = "Scene";
            }),
            BackupIssueCodes.MissingReference,
            "idea");
    }

    [Fact]
    public async Task Values_LorEvolve_does_not_know_and_text_too_long_to_keep_are_refused()
    {
        var (client, archive) = await Setup("values");

        await AssertIssue(client, Rewrite(archive, root => EntityNamed(root, "Corin Ash")["canonStatus"] = 99), BackupIssueCodes.InvalidValue, "Canon status");
        await AssertIssue(client, Rewrite(archive, root => EntityNamed(root, "Corin Ash")["name"] = new string('x', 161)), BackupIssueCodes.TooLong, "name");
        await AssertIssue(client, Rewrite(archive, root => EntityNamed(root, "Corin Ash")["name"] = "   "), BackupIssueCodes.MissingMember, "name");
        await AssertIssue(client, Rewrite(archive, root => Payload(root)["entityTypes"]![0]!["icon"] = "banana"), BackupIssueCodes.InvalidValue, "icon");
        await AssertIssue(client, Rewrite(archive, root => Payload(root)["universe"]!["accentColor"] = "url(javascript:alert(1))"), BackupIssueCodes.InvalidValue, "colour");

        // An article the editor could be made to run script from is refused like a save would refuse it.
        await AssertIssue(
            client,
            Rewrite(archive, root => EntityNamed(root, "Alenna Vance")["content"] =
                """{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}]}"""),
            BackupIssueCodes.InvalidValue,
            "http, https or mailto");

        // Two tags one lower-cased name apart would break the universe's tag index.
        await AssertIssue(
            client,
            Rewrite(archive, root =>
            {
                var tags = Payload(root)["tags"]!.AsArray();
                tags.Add(new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["name"] = ((string)tags[0]!["name"]!).ToUpperInvariant() });
            }),
            BackupIssueCodes.Duplicate,
            "tags");
    }

    [Fact]
    public async Task Malformed_history_and_orders_that_cannot_be_reconstructed_are_refused()
    {
        var (client, archive) = await Setup("history");

        await AssertIssue(
            client,
            Rewrite(archive, root =>
            {
                var revisions = EntityNamed(root, "Alenna Vance")["revisions"]!.AsArray();
                revisions[1]!["number"] = revisions[0]!["number"]!.GetValue<int>();
            }),
            BackupIssueCodes.Duplicate,
            "numbered");

        await AssertIssue(
            client,
            Rewrite(archive, root => EntityNamed(root, "Alenna Vance")["articleRevisions"]![0]!["content"] = "{not a document"),
            BackupIssueCodes.InvalidValue,
            "article");

        await AssertIssue(
            client,
            Rewrite(archive, root => SceneTitled(root, "The Council")["sortOrder"] = SceneTitled(root, "The Vote")["sortOrder"]!.GetValue<int>()),
            BackupIssueCodes.InvalidOrder,
            "same place");

        await AssertIssue(client, Rewrite(archive, root => Payload(root).Remove("ideas")), BackupIssueCodes.MissingMember, "ideas");
        await AssertIssue(client, Rewrite(archive, root => Payload(root).Remove("worldRules")), BackupIssueCodes.MissingMember, "world rules");
    }

    [Fact]
    public async Task A_picture_that_is_missing_unreadable_misplaced_or_unexpected_is_refused()
    {
        var (client, archive) = await Setup("pictures");
        var path = BackupOf(archive).Payload.Entities.Single(entity => entity.Image is not null).Image!.MediaPath;

        await AssertIssue(client, Rewrite(archive, files: entries => entries.Remove(path)), BackupIssueCodes.MissingMedia, "missing");

        var garbage = Encoding.UTF8.GetBytes("this is not a picture at all, though it sits where one should");
        await AssertIssue(
            client,
            Rewrite(
                archive,
                root => EntityNamed(root, "Alenna Vance")["image"]!["byteSize"] = garbage.Length,
                entries => entries[path] = garbage),
            BackupIssueCodes.InvalidImage,
            "could not be used");

        await AssertIssue(
            client,
            Rewrite(archive, root => EntityNamed(root, "Alenna Vance")["image"]!["mediaPath"] = "media/entities/../../elsewhere.png"),
            BackupIssueCodes.InvalidImage,
            "would not have put it");

        await AssertIssue(
            client,
            Rewrite(archive, files: entries => entries["media/entities/notes.txt"] = Encoding.UTF8.GetBytes("extra")),
            BackupIssueCodes.UnexpectedEntry,
            "does not name");
    }

    [Fact]
    public async Task Many_problems_are_listed_up_to_a_limit_and_the_rest_are_counted()
    {
        var (client, archive) = await Setup("many");
        var broken = Rewrite(archive, root =>
        {
            var entities = Payload(root)["entities"]!.AsArray();
            var template = entities[0]!.ToJsonString();

            for (var index = 0; index < 30; index++)
            {
                var copy = JsonNode.Parse(template)!.AsObject();
                copy["id"] = Guid.NewGuid().ToString();
                copy["name"] = $"Stray {index}";
                copy["entityTypeId"] = Guid.NewGuid().ToString();
                copy["image"] = null;
                copy["revisions"] = new JsonArray();
                copy["articleRevisions"] = new JsonArray();
                entities.Add(copy);
            }
        });

        var refusal = await AssertRefused(client, broken, BackupIssueCodes.Invalid);
        Assert.Equal(BackupRestoreLimits.MaxReportedIssues, refusal.Issues.Count);
        Assert.True(refusal.MoreIssues >= 10);
        Assert.Contains($"{refusal.Issues.Count + refusal.MoreIssues} problems", refusal.Detail, StringComparison.Ordinal);
    }

    // ---------- Helpers ----------

    /// <summary>A fresh account, and one rich exported archive shared by every test in this class.</summary>
    private async Task<(HttpClient Client, byte[] Archive)> Setup(string tag)
    {
        var client = await SignedIn(_factory, $"validate-{tag}");

        await Building.WaitAsync();
        try
        {
            if (_archive is null)
            {
                var author = await SignedIn(_factory, "validate-author");
                var world = await BuildRichWorld(author, "Validation world");
                _archive = await RawArchive(author, world.Universe.Id);
            }
        }
        finally
        {
            Building.Release();
        }

        return (client, _archive);
    }

    private async Task<Refusal> AssertRefused(HttpClient client, byte[] file, string code)
    {
        var universesBefore = (await Universes(client)).Count;
        var staging = _factory.Services.GetRequiredService<BackupRestoreStaging>();

        var refusal = await Refused(
            await Validate(client, file),
            code == BackupIssueCodes.TooLarge ? HttpStatusCode.RequestEntityTooLarge : HttpStatusCode.BadRequest);

        Assert.Equal(code, refusal.Code);
        Assert.False(string.IsNullOrWhiteSpace(refusal.Detail));
        Assert.NotEmpty(refusal.Issues);
        Assert.DoesNotContain("Exception", refusal.Raw, StringComparison.Ordinal);
        Assert.DoesNotContain(" at LorEvolve.", refusal.Raw, StringComparison.Ordinal);
        Assert.DoesNotContain(Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar), refusal.Raw.Replace("\\\\", "\\", StringComparison.Ordinal), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("universes/", refusal.Raw, StringComparison.Ordinal);
        Assert.DoesNotContain("token", refusal.Raw, StringComparison.OrdinalIgnoreCase);

        Assert.Equal(universesBefore, (await Universes(client)).Count);
        Assert.Equal(staging.Census().Waiting, staging.Census().Files);

        return refusal;
    }

    private async Task AssertIssue(HttpClient client, byte[] file, string issueCode, string wording)
    {
        var refusal = await AssertRefused(client, file, BackupIssueCodes.Invalid);
        Assert.Contains(refusal.Issues, issue => issue.Code == issueCode && issue.Message.Contains(wording, StringComparison.OrdinalIgnoreCase));
    }
}
