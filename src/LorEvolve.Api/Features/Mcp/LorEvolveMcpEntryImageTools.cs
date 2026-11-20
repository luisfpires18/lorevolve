using System.ComponentModel;
using System.Text;
using System.Text.Json.Serialization;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using static LorEvolve.Api.Features.Mcp.McpResults;

namespace LorEvolve.Api.Features.Mcp;

/// <summary>A file ChatGPT hands a tool through <c>openai/fileParams</c>: a short-lived link to the file, never the bytes.</summary>
public sealed record McpFileInput(
    [property: JsonPropertyName("download_url"), Description("The file's download link.")] string? DownloadUrl = null,
    [property: JsonPropertyName("file_id"), Description("The file's id.")] string? FileId = null,
    [property: JsonPropertyName("mime_type"), Description("The file's type, such as image/png.")] string? MimeType = null,
    [property: JsonPropertyName("file_name"), Description("The file's name.")] string? FileName = null);

/// <summary>
/// The AI hands over the picture itself for an entry (#441, ADR 0062 amended): a lore entry, or a project's entry such as a
/// game's unit. One picture change is staged, as propose_changes stages it, and the file is quarantined on the media store
/// (R2) exactly as the review page's upload holds it, so the person only reviews and approves. Nothing is attached before.
///
/// <para>The file comes as base64, from a client that can read it, or as a ChatGPT file link. A link is fetched once, over
/// HTTPS, from an allowed host only, never following a redirect and never to a private address; the link is not kept.</para>
/// </summary>
[McpServerToolType]
public sealed class LorEvolveMcpEntryImageTools(
    LorEvolveDbContext db,
    McpCaller caller,
    McpSite site,
    TimeProvider clock,
    IMediaObjectStore store,
    IHttpClientFactory http,
    IConfiguration configuration,
    ILoggerFactory loggerFactory)
{
    public const string ProposeImageTool = "propose_entry_image";

    public const string HttpClientName = "LorEvolve.McpImageDownload";

    public static readonly TimeSpan DownloadTimeout = TimeSpan.FromSeconds(20);

    /// <summary>Hosts a file link may point at, unless configuration names others. ChatGPT serves conversation files here.</summary>
    public static readonly string[] DefaultDownloadHosts = ["oaiusercontent.com"];

    public static readonly string[] ProposeGated = [ProposeImageTool];

    [McpServerTool(Name = ProposeImageTool, Title = "Propose a picture for an entry", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [McpMeta("openai/fileParams", JsonValue = """["image_file"]""")]
    [Description("Send a picture for one entry - a lore entry, or a project's entry such as a game's unit - for the person to review in LorEvolve. "
        + "Only when the person asked for it. It becomes the entry's profile picture, replacing the current one once approved, or one more picture in an appearance "
        + "(appearance ids from get_change_options with loreId). Send the file as image_file, or as image_base64 if you can read its bytes. "
        + "For an entry you are creating, don't wait for it to be approved: in propose_changes, add an image change with entryRef set to the entry's change id, "
        + "then call this with proposal and change (that image change's id) instead of entry, and one approval creates the entry with its picture. "
        + "PNG, JPEG or WebP, up to 8 MB. LorEvolve names the file after the entry, such as wolf.png. Nothing changes until the person approves it.")]
    public async Task<CallToolResult> ProposeEntryImageAsync(
        [Description("The entry's id, for an entry that exists. Leave it out when you give proposal and change.")] string? entry = null,
        [Description("Optional: an appearance of that entry, by id. Leave it out for the profile picture.")] string? appearance = null,
        [Description("Optional: one short line for the reviewer, such as \"Wolf, front view\".")] string? note = null,
        [Description("The picture, as a file.")] McpFileInput? image_file = null,
        [Description("The picture's bytes in base64, when no file can be sent.")] string? image_base64 = null,
        [Description("Optional: a pending proposal's id, from propose_changes, that holds an image change for this picture.")] string? proposal = null,
        [Description("With proposal: the image change's own id, as you gave it in propose_changes.")] string? change = null,
        CancellationToken cancellationToken = default)
    {
        if (await RoleAsync(db, caller, cancellationToken) is not { } role)
        {
            return Error("not_allowed", "Your role in this universe can only read, or this connection can't propose changes. Nothing was staged.");
        }

        if (!string.IsNullOrWhiteSpace(proposal))
        {
            return await HoldForChangeAsync(role, proposal, change, image_file, image_base64, cancellationToken);
        }

        if (!Guid.TryParse(entry, out var entityId))
        {
            return Error("invalid_input", "Give the entry's id, exactly as a read tool gave it, or a proposal and its image change.");
        }

        Guid? appearanceId = null;
        if (!string.IsNullOrWhiteSpace(appearance))
        {
            if (!Guid.TryParse(appearance, out var parsed))
            {
                return Error("invalid_input", "Give the appearance's id, exactly as get_change_options gave it, or leave it out.");
            }

            appearanceId = parsed;
        }

        // Project entries sit behind the lore filter; an explicit, universe-scoped read is the one that may see them.
        var name = await db.Entities.IgnoreQueryFilters().AsNoTracking()
            .Where(candidate => candidate.Id == entityId && candidate.UniverseId == caller.UniverseId && candidate.DeletedAt == null)
            .Select(candidate => candidate.Name)
            .FirstOrDefaultAsync(cancellationToken);
        if (name is null)
        {
            return Error("not_found", "That entry isn't in this universe, or it is in the Trash. Nothing was staged.");
        }

        var (bytes, prepared, problem) = await ReadPictureAsync(image_file, image_base64, cancellationToken);
        if (problem is not null)
        {
            return problem;
        }

        using var _ = bytes;
        var staged = await AiChangeStaging.StageAsync(
            db,
            clock,
            caller.UniverseId,
            caller.UserId,
            new AiChangeOrigin(AiChangeSource.Mcp, caller.ConnectionId, caller.ClientName, caller.CanProposeSchema),
            new AiChangeSubmission(
                string.IsNullOrWhiteSpace(note) ? $"A picture for {name}" : note,
                [new AiChangeOperationInput("image", "create", "image", Image: new AiImageInput(entityId, appearanceId, note))]),
            cancellationToken);
        if (staged.Proposal is not { } made)
        {
            return Error("invalid_proposal", "Nothing was staged: " + string.Join(" ", staged.Issues.Select(issue => issue.Message)));
        }

        return await HoldAsync(role, made.Id, made.Operations.Single().Id, new MediaValues(entityId, appearanceId, note), name, bytes!, prepared!, cancellationToken);
    }

    /// <summary>
    /// The file for an image change already staged (#466), most often one for an entry the same proposal creates, so the entry
    /// and its picture are approved together. The change must be pending and the caller's to hand a picture to, as on the review page.
    /// </summary>
    private async Task<CallToolResult> HoldForChangeAsync(
        UniverseRole role, string proposal, string? change, McpFileInput? file, string? base64, CancellationToken cancellationToken)
    {
        var key = change?.Trim();
        if (!Guid.TryParse(proposal, out var proposalId) || string.IsNullOrEmpty(key))
        {
            return Error("invalid_input", "Give the proposal's id, as propose_changes gave it, and the image change's own id. Nothing was held.");
        }

        var operations = await db.AiChangeOperations.AsNoTracking()
            .Where(operation => operation.ProposalId == proposalId && operation.Proposal!.UniverseId == caller.UniverseId)
            .Select(operation => new { operation.Id, operation.Key, operation.Resource, operation.Proposed })
            .ToListAsync(cancellationToken);
        var picked = operations.FirstOrDefault(operation => operation.Key == key && operation.Resource == AiChangeResource.Media);
        if (picked is null || await AiChangeMediaEndpoints.PendingAsync(db, caller.UniverseId, proposalId, picked.Id, caller.UserId, role, cancellationToken) is not { } media)
        {
            return Error("not_found", "That proposal has no pending image change with that id that you can send a picture for. Nothing was held.");
        }

        // The entry's name for the file: the stored entry, or the one its create change in this proposal will make.
        var creator = media.EntryRef is { } entryRef ? operations.FirstOrDefault(operation => operation.Key == entryRef) : null;
        var name = await db.Entities.IgnoreQueryFilters().AsNoTracking()
            .Where(candidate => candidate.Id == media.EntityId && candidate.UniverseId == caller.UniverseId)
            .Select(candidate => candidate.Name)
            .FirstOrDefaultAsync(cancellationToken)
            ?? (creator is null ? null : AiChangeJson.ReadProposed(creator.Resource, AiChangeAction.Create, creator.Proposed) switch
            {
                LoreValues lore => lore.Name,
                ProjectEntryValues entry => entry.Name,
                _ => null,
            })
            ?? string.Empty;

        var (bytes, prepared, problem) = await ReadPictureAsync(file, base64, cancellationToken);
        if (problem is not null)
        {
            return problem;
        }

        using var _ = bytes;
        return await HoldAsync(role, proposalId, picked.Id, media, name, bytes!, prepared!, cancellationToken);
    }

    private async Task<(MemoryStream? Bytes, PreparedImage? Prepared, CallToolResult? Problem)> ReadPictureAsync(
        McpFileInput? file, string? base64, CancellationToken cancellationToken)
    {
        var (bytes, problem) = file is not null ? await DownloadAsync(file, cancellationToken) : Decode(base64);
        if (bytes is null)
        {
            return (null, null, Error("invalid_image", problem!));
        }

        var (prepared, rejection) = await ImagePreparation.PrepareAsync(bytes, bytes.Length, null, cancellationToken);
        if (prepared is null)
        {
            await bytes.DisposeAsync();
            return (null, null, Error("invalid_image", rejection!.Message + " Nothing was staged."));
        }

        return (bytes, prepared, null);
    }

    private async Task<CallToolResult> HoldAsync(
        UniverseRole role, Guid proposalId, Guid operationId, MediaValues media, string name, MemoryStream bytes, PreparedImage prepared, CancellationToken cancellationToken)
    {
        var reviewUrl = $"{site.Base}/app/universes/{caller.UniverseId:D}/ai-changes/{proposalId:D}";
        var refusal = await AiChangeMediaEndpoints.HoldAsync(
            db, store, clock, loggerFactory.CreateLogger(AiChangeMediaEndpoints.LoggerName), caller.UniverseId, proposalId, operationId,
            caller.UserId, role, media, bytes, prepared, FileName(name, prepared.Extension), cancellationToken);

        return Result(new
        {
            proposalId,
            status = "waiting_for_review",
            reviewUrl,
            uploaded = refusal is null,
            message = refusal is null
                ? "Staged for review with the picture. Nothing in the universe has changed: tell the person to approve or reject it on the review page."
                : $"Staged for review, but the picture could not be held: {refusal.Message} Tell the person to upload it on the review page. Don't say the picture was added.",
        });
    }

    /// <summary>"Wolf" gives <c>wolf.png</c>; a name with nothing usable in it gives <c>picture.png</c>.</summary>
    internal static string FileName(string name, string extension)
    {
        var slug = new StringBuilder();
        // shortcut: non-ASCII letters are dropped, not transliterated (InvariantGlobalization makes Normalize a no-op).
        foreach (var character in name.ToLowerInvariant())
        {
            if (char.IsAsciiLetterOrDigit(character))
            {
                slug.Append(character);
            }
            else if (slug.Length > 0 && slug[^1] != '-' && (char.IsWhiteSpace(character) || character is '-' or '_' or '.'))
            {
                slug.Append('-');
            }
        }

        var stem = slug.ToString().Trim('-');
        stem = stem.Length > 60 ? stem[..60].TrimEnd('-') : stem;
        return $"{(stem.Length == 0 ? "picture" : stem)}.{extension.TrimStart('.')}";
    }

    private static (MemoryStream? Bytes, string? Problem) Decode(string? base64)
    {
        if (string.IsNullOrWhiteSpace(base64))
        {
            return (null, "Send the picture as image_file or image_base64. Nothing was staged.");
        }

        var data = base64.Trim();
        if (data.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && data.IndexOf(',') is var comma and > 0)
        {
            data = data[(comma + 1)..];
        }

        if (data.Length > (ImagePreparation.MaxUploadBytes + 2) / 3 * 4)
        {
            return (null, TooLarge);
        }

        var buffer = new byte[data.Length * 3 / 4 + 3];
        return Convert.TryFromBase64String(data, buffer, out var written)
            ? (new MemoryStream(buffer, 0, written, writable: false), null)
            : (null, "image_base64 isn't valid base64. Nothing was staged.");
    }

    private async Task<(MemoryStream? Bytes, string? Problem)> DownloadAsync(McpFileInput file, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(file.DownloadUrl, UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttps || !IsAllowedHost(url.Host))
        {
            return (null, "That file link isn't one LorEvolve may download from. Nothing was staged.");
        }

        try
        {
            using var response = await http.CreateClient(HttpClientName).GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return (null, "The file link didn't give a file. It may have expired; send the picture again. Nothing was staged.");
            }

            if (response.Content.Headers.ContentLength > ImagePreparation.MaxUploadBytes)
            {
                return (null, TooLarge);
            }

            await using var body = await response.Content.ReadAsStreamAsync(cancellationToken);
            var bytes = new MemoryStream();
            var chunk = new byte[81920];
            int read;
            while ((read = await body.ReadAsync(chunk, cancellationToken)) > 0)
            {
                if (bytes.Length + read > ImagePreparation.MaxUploadBytes)
                {
                    await bytes.DisposeAsync();
                    return (null, TooLarge);
                }

                bytes.Write(chunk, 0, read);
            }

            bytes.Position = 0;
            return (bytes, null);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            return (null, "The file couldn't be downloaded. Send the picture again. Nothing was staged.");
        }
    }

    private bool IsAllowedHost(string host)
    {
        var allowed = configuration.GetSection("Mcp:ImageDownloadHosts").Get<string[]>() is { Length: > 0 } configured ? configured : DefaultDownloadHosts;
        return allowed.Any(suffix => host.Equals(suffix, StringComparison.OrdinalIgnoreCase)
            || host.EndsWith("." + suffix, StringComparison.OrdinalIgnoreCase));
    }

    private static readonly string TooLarge = $"The picture is over {ImagePreparation.Megabytes(ImagePreparation.MaxUploadBytes)} MB. Nothing was staged.";
}
