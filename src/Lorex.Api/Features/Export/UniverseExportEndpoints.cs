using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Universes;

namespace Lorex.Api.Features.Export;

/// <summary>
/// One route: hand the owner a portable copy of their universe.
///
/// Read-only, authenticated, and the owner's alone through <see cref="UniverseAccess"/> (ADR 0041): a member is
/// refused with 403, and a universe the caller has no access to is a 404, indistinguishable from one that does not
/// exist. Archiving does not change any of this: an archived universe
/// stays owned and readable (ADR 0006), and a backup taken just before deleting one is exactly
/// when a backup is worth most.
///
/// A backup is an archive: <c>backup.json</c> plus every entry's original image beside it. It
/// became one when entries gained pictures, because a file that only named objects in a bucket
/// would stop being a backup the moment the bucket did - see ADR 0014 and ADR 0019.
///
/// This phase exports only. Nothing here reads a file back in.
/// </summary>
public static partial class UniverseExportEndpoints
{
    /// <summary>
    /// A plain ZIP rather than a vendor type. Every operating system opens one without being
    /// told what it is, and <see cref="UniverseBackup.Format"/> inside the document is still
    /// what identifies the contents.
    /// </summary>
    private const string MediaType = "application/zip";

    /// <summary>Machine-readable marker for the one failure a backup can have of its own.</summary>
    public const string MediaMissingCode = "backup_media_missing";

    public static IEndpointRouteBuilder MapUniverseExportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/export")
            .WithTags("Universes")
            .RequireAuthorization();

        group.MapGet("/", ExportAsync).WithName("ExportUniverse");

        return endpoints;
    }

    private static async Task<IResult> ExportAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Backup, cancellationToken) is { } denied)
        {
            return denied;
        }

        var snapshot = await new UniverseBackupBuilder(db).BuildAsync(universeId, cancellationToken);

        if (snapshot is null)
        {
            // Only reachable if the universe was deleted between the ownership check and the
            // read. Answering 404 keeps that race indistinguishable from every other miss.
            return Results.NotFound();
        }

        var generatedAt = DateTime.UtcNow;
        var backup = UniverseBackup.Of(snapshot.Payload, generatedAt);

        byte[] bytes;
        try
        {
            bytes = await UniverseBackupArchiveWriter.WriteAsync(
                backup,
                snapshot.Media,
                async (key, token) => (await store.GetAsync(key, token))?.Content,
                cancellationToken);
        }
        catch (BackupMediaMissingException missing)
        {
            // A picture the document names and the store cannot produce. The archive is built
            // whole before anything is sent precisely so this can be said out loud: an author
            // is told their backup is incomplete rather than handed one that quietly is.
            return Results.Problem(
                title: "That backup could not be completed.",
                detail: (missing.EntityId is { } entityId
                        ? $"An image belonging to entry {entityId:D} could not be read"
                        : missing.MapId is { } mapId
                            ? $"The picture of map {mapId:D} could not be read"
                            : "The universe's artwork could not be read")
                    + ", so the backup would have been missing it. Nothing was downloaded.",
                statusCode: StatusCodes.Status500InternalServerError,
                extensions: new Dictionary<string, object?> { ["code"] = MediaMissingCode });
        }
        catch (MediaStorageException unavailable)
        {
            // A world with no pictures never reaches the store at all, so this is only ever the
            // case where there is media to fetch and the store is not configured, refused, or did
            // not answer. The detail is Lorex's sentence; the provider's stays in the log.
            if (unavailable is MediaStorageFailedException)
            {
                LogStorageFailure(loggerFactory.CreateLogger("Lorex.Export"), universeId, unavailable);
            }

            return Results.Problem(
                title: "That backup could not be completed.",
                detail: unavailable.Message,
                statusCode: StatusCodes.Status503ServiceUnavailable,
                extensions: new Dictionary<string, object?> { ["code"] = MediaMissingCode });
        }

        return Results.File(bytes, MediaType, FileNameFor(snapshot.Payload.Universe.Name, generatedAt));
    }

    /// <summary>
    /// A filename an author can recognise months later: the world's name and the day it was
    /// taken. The name is the author's own and carries nothing about their account, and it is
    /// reduced to lowercase ASCII so the file lands intact on any filesystem.
    /// </summary>
    internal static string FileNameFor(string universeName, DateTime generatedAt) =>
        $"lorex-{Slug(universeName)}-{generatedAt.ToString("yyyyMMdd", CultureInfo.InvariantCulture)}.zip";

    private static string Slug(string name)
    {
        const int MaxLength = 48;

        var slug = new StringBuilder(MaxLength);

        foreach (var character in name)
        {
            if (slug.Length == MaxLength)
            {
                break;
            }

            if (char.IsAsciiLetterOrDigit(character))
            {
                slug.Append(char.ToLowerInvariant(character));
            }
            else if (slug.Length > 0 && slug[^1] != '-')
            {
                slug.Append('-');
            }
        }

        // A name of nothing but punctuation or non-ASCII script leaves nothing usable behind.
        return slug.ToString().Trim('-') is { Length: > 0 } trimmed ? trimmed : "universe";
    }

    [LoggerMessage(
        Level = LogLevel.Error,
        Message = "Image storage failed while exporting universe {UniverseId}. Nothing was downloaded.")]
    private static partial void LogStorageFailure(ILogger logger, Guid universeId, Exception exception);
}

/// <summary>
/// How a backup is written. Shared with the tests, because a format the tests serialise
/// differently is not the format that ships.
/// </summary>
public static class UniverseBackupJson
{
    public static JsonSerializerOptions Options { get; } = new(JsonSerializerDefaults.Web)
    {
        // Indented, because a backup that cannot be read or diffed by a human is a backup
        // nobody can check. The cost is whitespace in a file that is already large.
        WriteIndented = true,

        // Names, not numbers. A reader of the file should not have to know that a canon
        // status of 2 means Canon, and a member added to an enum must not silently re-mean
        // an old file. Flags serialise as a comma-separated list of names.
        Converters = { new JsonStringEnumConverter() },

        // Nulls stay. "This field was never filled in" and "this field is not in the format"
        // are different facts, and only writing the null keeps them apart.
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,

        // The relaxed encoder escapes only what JSON itself requires. The default one also
        // escapes '&', '<', '>', '+', '\'' and every non-ASCII character, which is protection
        // against being pasted into HTML - and this file never is. It is written to disk,
        // served as an attachment, and read back by a parser. Paying for that protection here
        // would turn a world written in Cyrillic, or a character called Ilúvatar, into a wall
        // of \uXXXX in the one artefact an author may want to read with their own eyes.
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
}
