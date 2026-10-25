using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Storage;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Maps;

/// <summary>
/// Where a map's picture lives in the bucket - ids only, a new <c>{assetId}</c> for every upload (ADR 0019's rules):
///
///   universes/{universeId}/maps/{mapId}/{assetId}/original.{ext}
///   universes/{universeId}/maps/{mapId}/{assetId}/display.webp
/// </summary>
public static class MapImageKeys
{
    private static string Prefix(Guid universeId, Guid mapId, Guid assetId) =>
        $"universes/{universeId:D}/maps/{mapId:D}/{assetId:D}";

    public static string Original(Guid universeId, Guid mapId, Guid assetId, string extension) =>
        $"{Prefix(universeId, mapId, assetId)}/original.{extension}";

    public static string Display(Guid universeId, Guid mapId, Guid assetId) =>
        $"{Prefix(universeId, mapId, assetId)}/display.webp";
}

/// <summary>
/// A universe's maps and their pins (issue #52, ADR 0060): list, create with a picture, read, rename, replace the picture,
/// delete; place, move, edit and remove pins; and where an entry is pinned.
///
/// <para><b>The picture's pipeline is the entry picture's</b> (<see cref="Lore.EntityImageEndpoints"/>, ADR 0019, ADR
/// 0042): the server decides what is an image by decoding it and makes the derivative itself - here the whole picture
/// fitted within <see cref="MapLimits.DisplaySide"/> rather than a cut square - both objects are written under an asset id
/// nothing is using before the database moves, growth is held against the universe owner's storage first, and objects are
/// swept only after the row stops naming them. Reads are an authenticated LoreX route, never a URL into the bucket.</para>
///
/// <para><b>Who.</b> Members read (<see cref="UniverseCapability.Read"/>); Editors and the owner change
/// (<see cref="UniverseCapability.EditContent"/>). A map in a universe the caller cannot read answers 404,
/// indistinguishable from one that is not there. Nothing here is ever public.</para>
///
/// <para><b>A replacement is explicit about pins.</b> It names what happens to the pins placed on the picture it replaces -
/// kept, at the same fractions, each marked as waiting for review until the author saves it against the new picture; or
/// removed. Nothing is remapped by guesswork, and nothing is kept quietly.</para>
/// </summary>
public static partial class MapEndpoints
{
    /// <summary>Stable marker for a replacement that arrived after the picture had changed, or a save over a changed map.</summary>
    public const string ImageChangedCode = "map_image_changed";

    public const string DetailsChangedCode = "map_changed";

    /// <summary>Stable marker for a link to an entry another pin on the same map already stands for.</summary>
    public const string DuplicateLinkCode = "map_pin_duplicate_link";

    public const string LoggerName = "Lorex.Maps";

    private const long RequestBodyCeiling = ImagePreparation.MaxUploadBytes * 2;

    private const int InMemoryBodyThreshold = (int)ImagePreparation.MaxUploadBytes + 64 * 1024;

    public static IEndpointRouteBuilder MapMapEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/maps")
            .WithTags("Maps")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListMaps");

        // Multipart: the picture and the details in one request, so a map never exists without a picture. The session
        // cookie is SameSite=Strict, so a cross-site form cannot carry it; antiforgery has no token to check on an API
        // called by fetch, exactly as the entry picture's upload reasons.
        group.MapPost("/", CreateAsync)
            .WithName("CreateMap")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling))
            .WithMetadata(new RequestFormLimitsAttribute { MemoryBufferThreshold = InMemoryBodyThreshold });

        group.MapGet("/{mapId:guid}", GetAsync).WithName("GetMap");
        group.MapPut("/{mapId:guid}", UpdateDetailsAsync).WithName("UpdateMapDetails");
        group.MapDelete("/{mapId:guid}", DeleteAsync).WithName("DeleteMap");

        group.MapPut("/{mapId:guid}/image", ReplaceImageAsync)
            .WithName("ReplaceMapImage")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(RequestBodyCeiling))
            .WithMetadata(new RequestFormLimitsAttribute { MemoryBufferThreshold = InMemoryBodyThreshold });

        group.MapGet("/{mapId:guid}/image/{assetId:guid}/original", (Guid universeId, Guid mapId, Guid assetId, ClaimsPrincipal principal,
                LorexDbContext db, IMediaObjectStore store, ILoggerFactory loggerFactory, HttpContext context, CancellationToken cancellationToken) =>
                ReadImageAsync(universeId, mapId, assetId, display: false, principal, db, store, loggerFactory, context, cancellationToken))
            .WithName("ReadMapImageOriginal");
        group.MapGet("/{mapId:guid}/image/{assetId:guid}/display", (Guid universeId, Guid mapId, Guid assetId, ClaimsPrincipal principal,
                LorexDbContext db, IMediaObjectStore store, ILoggerFactory loggerFactory, HttpContext context, CancellationToken cancellationToken) =>
                ReadImageAsync(universeId, mapId, assetId, display: true, principal, db, store, loggerFactory, context, cancellationToken))
            .WithName("ReadMapImageDisplay");

        group.MapPost("/{mapId:guid}/pins", CreatePinAsync).WithName("CreateMapPin");
        group.MapPut("/{mapId:guid}/pins/{pinId:guid}", UpdatePinAsync).WithName("UpdateMapPin");
        group.MapDelete("/{mapId:guid}/pins/{pinId:guid}", DeletePinAsync).WithName("DeleteMapPin");

        // From an entry to its places: every live map it is pinned on, for the entry's own page.
        endpoints.MapGet("/api/universes/{universeId:guid}/entities/{entityId:guid}/map-pins", EntityPinsAsync)
            .WithTags("Maps")
            .WithName("ListEntityMapPins")
            .RequireAuthorization();

        return endpoints;
    }

    // ---------- Reading ----------

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var maps = await db.Set<UniverseMap>().AsNoTracking()
            .Where(map => map.UniverseId == universeId)
            .OrderBy(map => map.Name)
            .ThenBy(map => map.Id)
            .Select(map => new MapSummary(
                map.Id,
                map.Name,
                map.Description,
                new MapImageRef(map.AssetId, map.Width, map.Height, map.ContentType, map.FileName, map.ByteSize, map.UploadedAt),
                map.Pins.Count,
                map.CreatedAt,
                map.UpdatedAt))
            .ToListAsync(cancellationToken);

        return Results.Ok(maps);
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid mapId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var detail = await LoadDetailAsync(db, universeId, mapId, cancellationToken);
        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    /// <summary>One map of this universe with every pin, or null. Shared with the geography reader (#53).</summary>
    internal static async Task<MapDetail?> LoadDetailAsync(LorexDbContext db, Guid universeId, Guid mapId, CancellationToken cancellationToken)
    {
        var map = await db.Set<UniverseMap>().AsNoTracking()
            .Where(candidate => candidate.Id == mapId && candidate.UniverseId == universeId)
            .FirstOrDefaultAsync(cancellationToken);

        if (map is null)
        {
            return null;
        }

        var pins = await PinsOf(db, mapId).ToListAsync(cancellationToken);
        return new MapDetail(
            map.Id,
            map.Name,
            map.Description,
            MapImageRef.Of(map),
            [.. pins.Select(pin => Describe(pin, map.AssetId))],
            pins.Count(pin => pin.PlacedOnAssetId != map.AssetId),
            map.Version,
            map.CreatedAt,
            map.UpdatedAt);
    }

    /// <summary>A pin as read, with its entry's facts only while that entry is live: the Trash is not every member's to see.</summary>
    internal sealed record StoredPin(
        Guid Id,
        string Title,
        string? Note,
        double X,
        double Y,
        Guid PlacedOnAssetId,
        DateTime CreatedAt,
        DateTime UpdatedAt,
        Guid? EntityId,
        string? EntityName,
        string? TypeName,
        string? TypeIcon,
        string? TypeAccentColor,
        bool EntityTrashed);

    /// <summary>A map's pins by title, or the one pin <paramref name="pinId"/> names. The filter sits on the row, before the projection.</summary>
    internal static IQueryable<StoredPin> PinsOf(LorexDbContext db, Guid mapId, Guid? pinId = null) =>
        db.Set<MapPin>().AsNoTracking()
            .Where(pin => pin.MapId == mapId && (pinId == null || pin.Id == pinId))
            .OrderBy(pin => pin.Title)
            .ThenBy(pin => pin.Id)
            .Select(pin => new StoredPin(
                pin.Id,
                pin.Title,
                pin.Note,
                pin.X,
                pin.Y,
                pin.PlacedOnAssetId,
                pin.CreatedAt,
                pin.UpdatedAt,
                pin.EntityId,
                pin.Entity != null && pin.Entity.DeletedAt == null ? pin.Entity.Name : null,
                pin.Entity != null && pin.Entity.DeletedAt == null ? pin.Entity.EntityType!.Name : null,
                pin.Entity != null && pin.Entity.DeletedAt == null ? pin.Entity.EntityType!.Icon : null,
                pin.Entity != null && pin.Entity.DeletedAt == null ? pin.Entity.EntityType!.AccentColor : null,
                pin.Entity != null && pin.Entity.DeletedAt != null));

    internal static MapPinResponse Describe(StoredPin pin, Guid currentAssetId) => new(
        pin.Id,
        pin.Title,
        pin.Note,
        pin.X,
        pin.Y,
        pin.EntityId is { } entityId
            ? new MapPinLore(entityId, pin.EntityName, pin.TypeName, pin.TypeIcon, pin.TypeAccentColor, pin.EntityTrashed)
            : null,
        pin.PlacedOnAssetId == currentAssetId,
        pin.CreatedAt,
        pin.UpdatedAt);

    private static async Task<IResult> EntityPinsAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await db.Entities.AnyAsync(entity => entity.Id == entityId && entity.UniverseId == universeId, cancellationToken))
        {
            return Results.NotFound();
        }

        return Results.Ok(await EntityPinsOf(db, universeId, entityId).ToListAsync(cancellationToken));
    }

    /// <summary>Every place one entry is pinned, by map name. Shared with the geography reader (#53).</summary>
    internal static IQueryable<EntityMapPin> EntityPinsOf(LorexDbContext db, Guid universeId, Guid entityId) =>
        db.Set<MapPin>().AsNoTracking()
            .Where(pin => pin.EntityId == entityId && pin.Map!.UniverseId == universeId)
            .OrderBy(pin => pin.Map!.Name)
            .ThenBy(pin => pin.MapId)
            .Select(pin => new EntityMapPin(pin.MapId, pin.Map!.Name, pin.Id, pin.Title, pin.X, pin.Y));

    // ---------- Create ----------

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        IFormFile? file,
        [FromForm(Name = "name")] string? name,
        [FromForm(Name = "description")] string? description,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        TimeProvider clock,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var errors = new Dictionary<string, string[]>();
        var cleanName = CheckName(name, errors);
        var cleanDescription = CheckDescription(description, errors);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        if (file is null || file.Length == 0)
        {
            return Invalid(ImagePreparation.FileField, "Choose a map image to upload.");
        }

        var ownerId = await db.Universes.AsNoTracking()
            .Where(universe => universe.Id == universeId)
            .Select(universe => universe.OwnerId)
            .FirstOrDefaultAsync(cancellationToken);
        if (ownerId is null)
        {
            return Results.NotFound();
        }

        if (await db.Set<UniverseMap>().CountAsync(map => map.UniverseId == universeId, cancellationToken) >= MapLimits.MaxMapsPerUniverse)
        {
            return Invalid("name", $"A universe can hold at most {MapLimits.MaxMapsPerUniverse} maps.");
        }

        if (await db.Set<UniverseMap>().AnyAsync(map => map.UniverseId == universeId && map.Name == cleanName, cancellationToken))
        {
            return Invalid("name", "A map with that name already exists in this universe.");
        }

        await using var upload = file.OpenReadStream();
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.FitAsync(bytes, bytes.Length, MapLimits.DisplaySide, cancellationToken);
        if (prepared is null)
        {
            return Invalid(rejection!.Field, rejection.Message);
        }

        var logger = loggerFactory.CreateLogger(LoggerName);

        // A new map adds all its bytes: held against the universe owner before the bucket is touched (ADR 0042).
        var hold = await AccountStorage.ReserveAsync(db, clock, ownerId, bytes.Length, cancellationToken);
        if (hold is null)
        {
            return StorageQuota.Exceeded(isOwner: ownerId == principal.RequireUserId());
        }

        var committed = false;
        try
        {
            var mapId = Guid.NewGuid();
            var assetId = Guid.NewGuid();
            var originalKey = MapImageKeys.Original(universeId, mapId, assetId, prepared.Extension);
            var displayKey = MapImageKeys.Display(universeId, mapId, assetId);

            if (await PutPairAsync(store, logger, bytes, prepared, originalKey, displayKey, mapId, "create", cancellationToken) is { } failed)
            {
                return failed;
            }

            var now = DateTime.UtcNow;
            var map = new UniverseMap
            {
                Id = mapId,
                UniverseId = universeId,
                Name = cleanName!,
                Description = cleanDescription,
                AssetId = assetId,
                OriginalKey = originalKey,
                DisplayKey = displayKey,
                ContentType = prepared.ContentType,
                FileName = FileNameLabel(file.FileName),
                Width = prepared.Width,
                Height = prepared.Height,
                ByteSize = bytes.Length,
                UploadedAt = now,
                CreatedAt = now,
                UpdatedAt = now,
            };

            IResult? refused = null;
            try
            {
                await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

                // Under the writer lock: the universe is still there, with room, and the name is still free.
                if (!await db.Universes.AnyAsync(universe => universe.Id == universeId, cancellationToken))
                {
                    refused = Results.NotFound();
                }
                else if (await db.Set<UniverseMap>().CountAsync(candidate => candidate.UniverseId == universeId, cancellationToken) >= MapLimits.MaxMapsPerUniverse)
                {
                    refused = Invalid("name", $"A universe can hold at most {MapLimits.MaxMapsPerUniverse} maps.");
                }
                else if (await db.Set<UniverseMap>().AnyAsync(candidate => candidate.UniverseId == universeId && candidate.Name == cleanName, cancellationToken))
                {
                    refused = Invalid("name", "A map with that name already exists in this universe.");
                }
                else
                {
                    await AccountStorage.ConsumeAsync(db, clock, hold, cancellationToken);
                    db.Set<UniverseMap>().Add(map);
                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    committed = true;
                }
            }
            catch (StorageQuotaExceededException)
            {
                await SweepAsync(store, logger, originalKey, displayKey);
                return StorageQuota.Exceeded(isOwner: ownerId == principal.RequireUserId());
            }
            catch (Exception)
            {
                await SweepAsync(store, logger, originalKey, displayKey);
                throw;
            }

            if (refused is not null)
            {
                await SweepAsync(store, logger, originalKey, displayKey);
                return refused;
            }

            return Results.Created(
                $"/api/universes/{universeId}/maps/{mapId}",
                new MapDetail(map.Id, map.Name, map.Description, MapImageRef.Of(map), [], 0, map.Version, map.CreatedAt, map.UpdatedAt));
        }
        finally
        {
            if (!committed)
            {
                await AccountStorage.ReleaseAsync(db, hold, logger);
            }
        }
    }

    // ---------- Details ----------

    private static async Task<IResult> UpdateDetailsAsync(
        Guid universeId,
        Guid mapId,
        MapDetailsRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var errors = new Dictionary<string, string[]>();
        var cleanName = CheckName(request.Name, errors);
        var cleanDescription = CheckDescription(request.Description, errors);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var map = await db.Set<UniverseMap>()
            .FirstOrDefaultAsync(candidate => candidate.Id == mapId && candidate.UniverseId == universeId, cancellationToken);
        if (map is null)
        {
            return Results.NotFound();
        }

        if (!EditVersion.Matches(map.Version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                DetailsChangedCode,
                "The map changed while you were editing.",
                "This map was changed somewhere else. Open it again to see the latest.",
                map.Version);
        }

        if (map.Name != cleanName
            && await db.Set<UniverseMap>().AnyAsync(candidate => candidate.UniverseId == universeId && candidate.Id != mapId && candidate.Name == cleanName, cancellationToken))
        {
            return Invalid("name", "A map with that name already exists in this universe.");
        }

        if (map.Name != cleanName || map.Description != cleanDescription)
        {
            map.Name = cleanName!;
            map.Description = cleanDescription;
            map.Version++;
            map.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(await LoadDetailAsync(db, universeId, mapId, cancellationToken));
    }

    // ---------- Replace the picture ----------

    /// <summary>
    /// A new picture under a new asset id, with the author's explicit decision about the pins placed on the old one:
    /// <see cref="MapLimits.KeepPins"/> keeps every pin at its fractions and marks it as waiting for review (its
    /// <see cref="MapPin.PlacedOnAssetId"/> stays the old picture's); <see cref="MapLimits.RemovePins"/> deletes them. The
    /// order is the entry picture's: both new objects first, then the row moves, then the old pair is swept.
    /// </summary>
    private static async Task<IResult> ReplaceImageAsync(
        Guid universeId,
        Guid mapId,
        IFormFile? file,
        [FromForm(Name = "pins")] string? pins,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        TimeProvider clock,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var policy = pins?.Trim().ToLowerInvariant();
        if (policy is not (MapLimits.KeepPins or MapLimits.RemovePins))
        {
            return Invalid("pins", $"Say what happens to the pins: \"{MapLimits.KeepPins}\" or \"{MapLimits.RemovePins}\".");
        }

        var existing = await db.Set<UniverseMap>().AsNoTracking()
            .Where(candidate => candidate.Id == mapId && candidate.UniverseId == universeId)
            .Select(candidate => new { candidate.AssetId, candidate.ByteSize, candidate.Universe!.OwnerId })
            .FirstOrDefaultAsync(cancellationToken);
        if (existing is null)
        {
            return Results.NotFound();
        }

        if (file is null || file.Length == 0)
        {
            return Invalid(ImagePreparation.FileField, "Choose a map image to upload.");
        }

        await using var upload = file.OpenReadStream();
        using var bytes = new MemoryStream();
        await upload.CopyToAsync(bytes, cancellationToken);
        bytes.Position = 0;

        var (prepared, rejection) = await ImagePreparation.FitAsync(bytes, bytes.Length, MapLimits.DisplaySide, cancellationToken);
        if (prepared is null)
        {
            return Invalid(rejection!.Field, rejection.Message);
        }

        var logger = loggerFactory.CreateLogger(LoggerName);
        var ownerId = existing.OwnerId;

        // Only growth is held: the bytes received less the original this one replaces (ADR 0042).
        var growth = bytes.Length - existing.ByteSize;
        StorageHold? hold = null;
        if (growth > 0)
        {
            hold = await AccountStorage.ReserveAsync(db, clock, ownerId, growth, cancellationToken);
            if (hold is null)
            {
                return StorageQuota.Exceeded(isOwner: ownerId == principal.RequireUserId());
            }
        }

        var committed = false;
        try
        {
            var assetId = Guid.NewGuid();
            var originalKey = MapImageKeys.Original(universeId, mapId, assetId, prepared.Extension);
            var displayKey = MapImageKeys.Display(universeId, mapId, assetId);

            if (await PutPairAsync(store, logger, bytes, prepared, originalKey, displayKey, mapId, "replace", cancellationToken) is { } failed)
            {
                return failed;
            }

            string? supersededOriginal = null;
            string? supersededDisplay = null;
            IResult? refused = null;

            try
            {
                await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

                var map = await db.Set<UniverseMap>()
                    .FirstOrDefaultAsync(candidate => candidate.Id == mapId && candidate.UniverseId == universeId, cancellationToken);

                if (map is null)
                {
                    refused = Results.NotFound();
                }
                else if (map.AssetId != existing.AssetId)
                {
                    // The picture this upload was measured against is no longer the map's: another replacement won.
                    refused = ReplacedMeanwhile();
                }
                else
                {
                    supersededOriginal = map.OriginalKey;
                    supersededDisplay = map.DisplayKey;

                    await AccountStorage.ConsumeAsync(db, clock, hold, cancellationToken);

                    var now = DateTime.UtcNow;
                    map.AssetId = assetId;
                    map.OriginalKey = originalKey;
                    map.DisplayKey = displayKey;
                    map.ContentType = prepared.ContentType;
                    map.FileName = FileNameLabel(file.FileName);
                    map.Width = prepared.Width;
                    map.Height = prepared.Height;
                    map.ByteSize = bytes.Length;
                    map.UploadedAt = now;
                    map.UpdatedAt = now;

                    if (policy == MapLimits.RemovePins)
                    {
                        await db.Set<MapPin>().Where(pin => pin.MapId == mapId).ExecuteDeleteAsync(cancellationToken);
                    }

                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    committed = true;
                }
            }
            catch (StorageQuotaExceededException)
            {
                await SweepAsync(store, logger, originalKey, displayKey);
                return StorageQuota.Exceeded(isOwner: ownerId == principal.RequireUserId());
            }
            catch (Exception)
            {
                await SweepAsync(store, logger, originalKey, displayKey);
                throw;
            }

            if (refused is not null)
            {
                await SweepAsync(store, logger, originalKey, displayKey);
                return refused;
            }

            // Past the commit: the new picture is the map's whatever happens next.
            await SweepAsync(store, logger, supersededOriginal!, supersededDisplay!);

            return Results.Ok(await LoadDetailAsync(db, universeId, mapId, cancellationToken));
        }
        finally
        {
            if (!committed)
            {
                await AccountStorage.ReleaseAsync(db, hold, logger);
            }
        }
    }

    // ---------- Delete ----------

    /// <summary>
    /// Deletes the map and its pins for good, after the author confirmed it on screen. A map is not Lore and does not
    /// enter the Trash (ADR 0060): the original is the author's own file, and pins are small. The row goes first, the
    /// objects after the commit.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid mapId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var map = await db.Set<UniverseMap>()
            .FirstOrDefaultAsync(candidate => candidate.Id == mapId && candidate.UniverseId == universeId, cancellationToken);
        if (map is null)
        {
            return Results.NotFound();
        }

        var keys = new[] { map.OriginalKey, map.DisplayKey };
        db.Set<UniverseMap>().Remove(map);
        await db.SaveChangesAsync(cancellationToken);

        await SweepAsync(store, loggerFactory.CreateLogger(LoggerName), keys);
        return Results.NoContent();
    }

    // ---------- Read the picture ----------

    private static async Task<IResult> ReadImageAsync(
        Guid universeId,
        Guid mapId,
        Guid assetId,
        bool display,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IMediaObjectStore store,
        ILoggerFactory loggerFactory,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        // Both ids are checked against the row, so an address stops resolving the moment the picture is replaced.
        var image = await db.Set<UniverseMap>().AsNoTracking()
            .Where(candidate => candidate.Id == mapId && candidate.UniverseId == universeId && candidate.AssetId == assetId)
            .Select(candidate => new { candidate.OriginalKey, candidate.DisplayKey, candidate.ContentType })
            .FirstOrDefaultAsync(cancellationToken);
        if (image is null)
        {
            return Results.NotFound();
        }

        StoredMediaObject? stored;
        try
        {
            stored = await store.GetAsync(display ? image.DisplayKey : image.OriginalKey, cancellationToken);
        }
        catch (MediaStorageException exception)
        {
            if (exception is MediaStorageFailedException)
            {
                LogStorageFailure(loggerFactory.CreateLogger(LoggerName), "read", mapId, exception);
            }

            return Unavailable(exception);
        }

        if (stored is null)
        {
            return Results.NotFound();
        }

        // Private and immutable: the asset id is in the path and never reused (ADR 0019).
        context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        context.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.Stream(stored.Content, display ? "image/webp" : image.ContentType, enableRangeProcessing: false);
    }

    // ---------- Pins ----------

    private static async Task<IResult> CreatePinAsync(
        Guid universeId,
        Guid mapId,
        MapPinRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var (clean, invalid) = CheckPin(request);
        if (invalid is not null)
        {
            return invalid;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var map = await db.Set<UniverseMap>().AsNoTracking()
            .Where(candidate => candidate.Id == mapId && candidate.UniverseId == universeId)
            .Select(candidate => new { candidate.AssetId, Count = candidate.Pins.Count })
            .FirstOrDefaultAsync(cancellationToken);
        if (map is null)
        {
            return Results.NotFound();
        }

        if (map.Count >= MapLimits.MaxPinsPerMap)
        {
            return Invalid("title", $"A map can hold at most {MapLimits.MaxPinsPerMap} pins.");
        }

        if (await CheckLinkAsync(db, universeId, mapId, pinId: null, clean.EntityId, cancellationToken) is { } refused)
        {
            return refused;
        }

        var now = DateTime.UtcNow;
        var pin = new MapPin
        {
            Id = Guid.NewGuid(),
            MapId = mapId,
            EntityId = clean.EntityId,
            Title = clean.Title,
            Note = clean.Note,
            X = clean.X,
            Y = clean.Y,
            PlacedOnAssetId = map.AssetId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Set<MapPin>().Add(pin);
        await db.Set<UniverseMap>().Where(candidate => candidate.Id == mapId)
            .ExecuteUpdateAsync(update => update.SetProperty(candidate => candidate.UpdatedAt, now), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var stored = await PinsOf(db, mapId, pin.Id).FirstAsync(cancellationToken);
        return Results.Created($"/api/universes/{universeId}/maps/{mapId}/pins/{pin.Id}", Describe(stored, map.AssetId));
    }

    /// <summary>
    /// Saves a pin whole. Saving confirms its position against the picture the map shows now, whether or not it moved:
    /// the form shows the position, and saving it is the author's review.
    /// </summary>
    private static async Task<IResult> UpdatePinAsync(
        Guid universeId,
        Guid mapId,
        Guid pinId,
        MapPinRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var (clean, invalid) = CheckPin(request);
        if (invalid is not null)
        {
            return invalid;
        }

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        var pin = await db.Set<MapPin>()
            .Where(candidate => candidate.Id == pinId && candidate.MapId == mapId && candidate.Map!.UniverseId == universeId)
            .FirstOrDefaultAsync(cancellationToken);
        if (pin is null)
        {
            return Results.NotFound();
        }

        if (await CheckLinkAsync(db, universeId, mapId, pinId, clean.EntityId, cancellationToken) is { } refused)
        {
            return refused;
        }

        var assetId = await db.Set<UniverseMap>().Where(candidate => candidate.Id == mapId).Select(candidate => candidate.AssetId).FirstAsync(cancellationToken);
        var now = DateTime.UtcNow;
        pin.EntityId = clean.EntityId;
        pin.Title = clean.Title;
        pin.Note = clean.Note;
        pin.X = clean.X;
        pin.Y = clean.Y;
        pin.PlacedOnAssetId = assetId;
        pin.UpdatedAt = now;
        await db.Set<UniverseMap>().Where(candidate => candidate.Id == mapId)
            .ExecuteUpdateAsync(update => update.SetProperty(candidate => candidate.UpdatedAt, now), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var stored = await PinsOf(db, mapId, pinId).FirstAsync(cancellationToken);
        return Results.Ok(Describe(stored, assetId));
    }

    private static async Task<IResult> DeletePinAsync(
        Guid universeId,
        Guid mapId,
        Guid pinId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await db.Set<UniverseMap>().AnyAsync(candidate => candidate.Id == mapId && candidate.UniverseId == universeId, cancellationToken))
        {
            return Results.NotFound();
        }

        var removed = await db.Set<MapPin>()
            .Where(candidate => candidate.Id == pinId && candidate.MapId == mapId)
            .ExecuteDeleteAsync(cancellationToken);
        if (removed > 0)
        {
            await db.Set<UniverseMap>().Where(candidate => candidate.Id == mapId)
                .ExecuteUpdateAsync(update => update.SetProperty(candidate => candidate.UpdatedAt, DateTime.UtcNow), cancellationToken);
        }

        // Gone already is what was asked for.
        return Results.NoContent();
    }

    private sealed record CleanPin(string Title, string? Note, double X, double Y, Guid? EntityId);

    /// <summary>A pin's own fields: a title, a note within bounds, and a position that is two finite fractions on the map.</summary>
    private static (CleanPin Pin, IResult? Invalid) CheckPin(MapPinRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        var title = request.Title?.Trim();
        if (string.IsNullOrEmpty(title))
        {
            errors["title"] = ["Give the pin a title."];
        }
        else if (title.Length > MapLimits.NameMaxLength)
        {
            errors["title"] = [$"A title is at most {MapLimits.NameMaxLength} characters."];
        }

        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        if (note is { Length: > MapLimits.NoteMaxLength })
        {
            errors["note"] = [$"A note is at most {MapLimits.NoteMaxLength} characters."];
        }

        if (request.X is not { } x || !double.IsFinite(x) || x < 0 || x > 1)
        {
            errors["x"] = ["The position must be on the map."];
        }

        if (request.Y is not { } y || !double.IsFinite(y) || y < 0 || y > 1)
        {
            errors["y"] = ["The position must be on the map."];
        }

        return errors.Count > 0
            ? (default!, Results.ValidationProblem(errors))
            : (new CleanPin(title!, note, request.X!.Value, request.Y!.Value, request.EntityId), null);
    }

    /// <summary>
    /// The link a pin asks for: a live entry of this universe, not already pinned on this map by another pin. Refused with
    /// the existing pin's id, so a client can offer to open it rather than make a second.
    /// </summary>
    private static async Task<IResult?> CheckLinkAsync(LorexDbContext db, Guid universeId, Guid mapId, Guid? pinId, Guid? entityId, CancellationToken cancellationToken)
    {
        if (entityId is not { } linked)
        {
            return null;
        }

        var entity = await db.Entities.AsNoTracking()
            .Where(candidate => candidate.Id == linked && candidate.UniverseId == universeId)
            .Select(candidate => new { candidate.DeletedAt })
            .FirstOrDefaultAsync(cancellationToken);
        if (entity is null)
        {
            return Invalid("entityId", "That entry is not in this universe.");
        }

        if (entity.DeletedAt is not null)
        {
            return Invalid("entityId", "That entry is in the Trash. Restore it before pinning it.");
        }

        var duplicate = await db.Set<MapPin>().AsNoTracking()
            .Where(candidate => candidate.MapId == mapId && candidate.EntityId == linked && candidate.Id != pinId)
            .Select(candidate => new { candidate.Id, candidate.Title })
            .FirstOrDefaultAsync(cancellationToken);
        if (duplicate is not null)
        {
            return Results.Problem(
                title: "This entry is already on the map.",
                detail: $"The pin “{duplicate.Title}” already stands for it. Move that pin instead, or pin the entry on another map.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["code"] = DuplicateLinkCode, ["pinId"] = duplicate.Id });
        }

        return null;
    }

    // ---------- Shared ----------

    /// <summary>Writes the original and the fitted display at once; null when both landed, else the answer to send.</summary>
    private static async Task<IResult?> PutPairAsync(
        IMediaObjectStore store,
        ILogger logger,
        MemoryStream bytes,
        PreparedFit prepared,
        string originalKey,
        string displayKey,
        Guid mapId,
        string operation,
        CancellationToken cancellationToken)
    {
        try
        {
            bytes.Position = 0;
            using var display = new MemoryStream(prepared.Display.Bytes, writable: false);
            await MediaObjectWrites.PutAllAsync(
                store,
                cancellationToken,
                new PendingMediaObject(originalKey, bytes, prepared.ContentType),
                new PendingMediaObject(displayKey, display, "image/webp"));
            return null;
        }
        catch (MediaStorageUnavailableException exception)
        {
            return Unavailable(exception);
        }
        catch (MediaStorageFailedException exception)
        {
            LogStorageFailure(logger, operation, mapId, exception);
            await SweepAsync(store, logger, originalKey, displayKey);
            return Unavailable(exception);
        }
        catch (Exception)
        {
            await SweepAsync(store, logger, originalKey, displayKey);
            throw;
        }
    }

    private static string? CheckName(string? name, Dictionary<string, string[]> errors)
    {
        var clean = name?.Trim();
        if (string.IsNullOrEmpty(clean))
        {
            errors["name"] = ["Give the map a name."];
        }
        else if (clean.Length > MapLimits.NameMaxLength)
        {
            errors["name"] = [$"A name is at most {MapLimits.NameMaxLength} characters."];
        }

        return clean;
    }

    private static string? CheckDescription(string? description, Dictionary<string, string[]> errors)
    {
        var clean = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        if (clean is { Length: > MapLimits.DescriptionMaxLength })
        {
            errors["description"] = [$"A description is at most {MapLimits.DescriptionMaxLength} characters."];
        }

        return clean;
    }

    internal static Task SweepAsync(IMediaObjectStore store, ILogger logger, params string[] keys) =>
        MediaObjectWrites.SweepAsync(store, logger, LogOrphanedObject, keys);

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Orphaned media object left behind at '{ObjectKey}'. Nothing references it and it is safe to delete.")]
    private static partial void LogOrphanedObject(ILogger logger, string objectKey, Exception exception);

    [LoggerMessage(
        Level = LogLevel.Error,
        Message = "Image storage failed during {Operation} for map {MapId}. Nothing was changed.")]
    private static partial void LogStorageFailure(ILogger logger, string operation, Guid mapId, Exception exception);

    private static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    private static IResult Unavailable(MediaStorageException exception) =>
        Results.Problem(
            title: "Image storage is unavailable.",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);

    private static IResult ReplacedMeanwhile() =>
        Results.Problem(
            title: "The map's picture changed while this one was uploading.",
            detail: "Its picture was replaced somewhere else, so this one was not kept. Open the map again and choose the picture.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = ImageChangedCode });

    private static string? FileNameLabel(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return null;
        }

        var name = Path.GetFileName(fileName.Trim());
        return name.Length switch
        {
            0 => null,
            > StoredImageLimits.FileNameMaxLength => name[..StoredImageLimits.FileNameMaxLength],
            _ => name,
        };
    }
}
