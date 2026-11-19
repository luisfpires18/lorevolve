using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Reading;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using static LorEvolve.Api.Features.Mcp.McpResults;

namespace LorEvolve.Api.Features.Mcp;

/// <summary>
/// The MCP picture tools (issue #56, ADR 0046 amendment): what pictures a lore entry has, and one of them as viewable image
/// content. Read-only, over the same rows and the same object store the app itself reads - the entry's primary image (ADR
/// 0019) and the galleries of its appearances (ADR 0053) - and nothing else: no second index, no new identifier.
///
/// <para><b>Explicit associations only.</b> A picture belongs to a form or an era only because the author ticked that form
/// or era on the appearance holding it. A form nothing was ticked for has no pictures, and the tools say so; the entry's own
/// portrait is reported apart, as the base picture, and never stands in for a form's.</para>
///
/// <para><b>The universe is the caller's.</b> Every lookup is scoped to the universe the gate set from the token and to live
/// entries: an id from another universe, from the Trash or from nowhere is not found alike. Bytes are handed over inline, as
/// an MCP image block, so no URL ever outlives the authorization that produced it; the only link returned is to the entry's
/// own page in LorEvolve, behind its sign-in.</para>
///
/// <para><b>Bounded.</b> A listing names at most <see cref="McpLimits.ImageListLimit"/> appearance pictures; the default
/// variant is the whole picture fitted within <see cref="McpLimits.ImagePreviewSide"/> pixels; the original is handed over
/// only when asked for and only up to <see cref="McpLimits.ImageOriginalBytes"/>.</para>
/// </summary>
[McpServerToolType]
public sealed partial class LorEvolveMcpImageTools(
    LorEvolveDbContext db,
    McpCaller caller,
    McpSite site,
    IMediaObjectStore store,
    ILogger<LorEvolveMcpImageTools> logger)
{
    public const string ListTool = "list_lore_images";
    public const string GetTool = "get_lore_image";

    public const string PreviewVariant = "preview";
    public const string ThumbnailVariant = "thumbnail";
    public const string OriginalVariant = "original";

    public const string WebpFormat = "webp";
    public const string PngFormat = "png";

    /// <summary>The entry's own picture (ADR 0019): its portrait on cards and at the head of its page.</summary>
    public const string ProfileKind = "profile";

    /// <summary>A picture in an appearance's gallery (ADR 0053).</summary>
    public const string AppearanceKind = "appearance";

    /// <summary>The picture of one of the entry's image fields (Issue #238).</summary>
    public const string FieldKind = "field";

    /// <summary>An appearance's notes, cut for a listing.</summary>
    private const int NotesLength = 300;

    /// <summary>Longer than any entry name or alias LorEvolve stores: anything past it names nothing.</summary>
    private const int NameLength = 200;

    /// <summary>A live entry: a lore entry, or one of a project's own entries when <paramref name="ProjectId"/> is set.</summary>
    private sealed record Head(Guid Id, string Name, string TypeName, Guid? ProjectId = null);

    private sealed record Named(Guid Id, string Name);

    private sealed record Picture(Guid Id, string ContentType, int Width, int Height, long ByteSize, string? FileName, DateTime UploadedAt);

    private sealed record Look(Guid Id, string Label, string? Notes, List<Guid> Forms, List<Guid> Eras, List<Picture> Images);

    /// <summary>One picture found for a fetch, with where it came from.</summary>
    private sealed record Found(
        Head Entry,
        string Kind,
        Picture Picture,
        string OriginalKey,
        string ThumbnailKey,
        Named? Appearance,
        IReadOnlyList<string> Forms,
        IReadOnlyList<string> Eras,
        Named? Field = null);

    [McpServerTool(Name = ListTool, Title = "List a lore entry's pictures", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("List the pictures a lore entry has: its profile picture (the entry's own portrait, on its cards and page) and "
        + "the pictures of its appearances - outfits and looks - each with the forms and eras the author explicitly linked it to. "
        + "Give the entry by id, or by its exact name or alias; an ambiguous name is refused with the candidates. Optionally "
        + "narrow to one form, era or appearance (by id or exact name): then only pictures explicitly linked to it are listed, "
        + "and the profile picture is still reported apart as the base portrait, never as that form's. Nothing is inferred: a "
        + "form with no linked picture lists none, and the answer says so. The pictures of the entry's image fields are listed "
        + "too. A project's own entry (from list_project_entries) is given by its id. Fetch a picture with get_lore_image.")]
    public async Task<CallToolResult> ListLoreImagesAsync(
        [Description("The lore entry: its id, or its exact name or alias. A project's entry: its id.")] string lore,
        [Description("Optional form: its id or exact name. Only pictures of appearances linked to this form.")] string? form = null,
        [Description("Optional era: its id or exact name. Only pictures of appearances linked to this era.")] string? era = null,
        [Description("Optional appearance: its id or exact label. Only that appearance's pictures.")] string? appearance = null,
        CancellationToken cancellationToken = default)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }

        var (entry, refusal) = await ResolveEntryAsync(lore, cancellationToken);
        if (entry is null)
        {
            return refusal!;
        }

        var profile = await db.EntityImages.AsNoTracking()
            .Where(image => image.EntityId == entry.Id)
            .Select(image => new Picture(image.AssetId, image.ContentType, image.Width, image.Height, image.ByteSize, image.FileName, image.UploadedAt))
            .FirstOrDefaultAsync(cancellationToken);

        var fieldPictures = await FieldPicturesAsync(entry.Id, cancellationToken);

        var forms = await db.EntityForms.AsNoTracking()
            .Where(candidate => candidate.EntityId == entry.Id)
            .OrderBy(candidate => candidate.SortOrder)
            .Select(candidate => new Named(candidate.Id, candidate.Name))
            .ToListAsync(cancellationToken);

        var eras = await db.EntityEras.AsNoTracking()
            .Where(candidate => candidate.EntityId == entry.Id)
            .OrderBy(candidate => candidate.SortOrder)
            .Select(candidate => new Named(candidate.Id, candidate.Name))
            .ToListAsync(cancellationToken);

        var stored = await db.EntityAppearances.AsNoTracking()
            .Where(candidate => candidate.EntityId == entry.Id)
            .OrderBy(candidate => candidate.SortOrder)
            .Select(candidate => new
            {
                candidate.Id,
                candidate.Label,
                candidate.Notes,
                Forms = candidate.Forms.Select(link => link.EntityFormId).ToList(),
                Eras = candidate.Eras.Select(link => link.EntityEraId).ToList(),
                Images = candidate.Images
                    .OrderBy(image => image.SortOrder)
                    .Select(image => new Picture(image.Id, image.ContentType, image.Width, image.Height, image.ByteSize, image.FileName, image.UploadedAt))
                    .ToList(),
            })
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        var looks = stored.Select(look => new Look(look.Id, look.Label, look.Notes, look.Forms, look.Eras, look.Images)).ToList();

        var (chosenForm, formRefused) = Pick(form, forms, "form");
        if (formRefused is not null)
        {
            return formRefused;
        }

        var (chosenEra, eraRefused) = Pick(era, eras, "era");
        if (eraRefused is not null)
        {
            return eraRefused;
        }

        var (chosenLook, lookRefused) = Pick(appearance, [.. looks.Select(look => new Named(look.Id, look.Label))], "appearance");
        if (lookRefused is not null)
        {
            return lookRefused;
        }

        var narrowed = chosenForm is not null || chosenEra is not null || chosenLook is not null;
        var selected = looks
            .Where(look => (chosenForm is null || look.Forms.Contains(chosenForm.Id))
                && (chosenEra is null || look.Eras.Contains(chosenEra.Id))
                && (chosenLook is null || look.Id == chosenLook.Id))
            .ToList();

        // List, then fetch on demand: the listing itself stays small whatever the galleries hold.
        var budget = McpLimits.ImageListLimit;
        var more = false;
        List<object> listed = [];
        foreach (var look in selected)
        {
            var take = Math.Min(look.Images.Count, budget);
            more |= take < look.Images.Count;
            budget -= take;
            listed.Add(new
            {
                id = look.Id,
                label = look.Label,
                notes = ReadingText.Cut(look.Notes, NotesLength),
                forms = Names(look.Forms, forms),
                eras = Names(look.Eras, eras),
                url = ProgressionUrl(entry),
                images = look.Images.Take(take).Select((picture, position) => Describe(picture, AppearanceKind, position)),
            });
        }

        var what = chosenLook is not null ? $"the appearance '{chosenLook.Name}'"
            : chosenForm is not null && chosenEra is not null ? $"the form '{chosenForm.Name}' in the era '{chosenEra.Name}'"
            : chosenForm is not null ? $"the form '{chosenForm.Name}'"
            : chosenEra is not null ? $"the era '{chosenEra.Name}'"
            : null;
        var pictures = selected.Sum(look => look.Images.Count);
        var note = narrowed
            ? pictures == 0
                ? $"No picture is explicitly linked to {what}. "
                    + (profile is null
                        ? "The entry has no profile picture either."
                        : $"The profile picture is the entry's base portrait, not a picture of {what}; do not show it as one.")
                : null
            : profile is null && pictures == 0 && fieldPictures.Count == 0 ? "This entry has no pictures." : null;

        return Result(new
        {
            lore = new { id = entry.Id, name = entry.Name, type = entry.TypeName, projectId = entry.ProjectId, url = EntryUrl(entry) },
            selection = narrowed
                ? new
                {
                    form = chosenForm is null ? null : new { id = chosenForm.Id, name = chosenForm.Name },
                    era = chosenEra is null ? null : new { id = chosenEra.Id, name = chosenEra.Name },
                    appearance = chosenLook is null ? null : new { id = chosenLook.Id, label = chosenLook.Name },
                }
                : null,
            profileImage = profile is null ? null : Describe(profile, ProfileKind, null),
            appearances = listed,
            appearancePictures = pictures,
            fieldImages = fieldPictures.Select(field => new
            {
                fieldId = field.Field.Id,
                field = field.Field.Name,
                image = Describe(field.Picture, FieldKind, null),
            }),
            more = more ? true : (bool?)null,
            forms = forms.Select(candidate => new
            {
                id = candidate.Id,
                name = candidate.Name,
                appearances = looks.Count(look => look.Forms.Contains(candidate.Id)),
                pictures = looks.Where(look => look.Forms.Contains(candidate.Id)).Sum(look => look.Images.Count),
            }),
            eras = eras.Select(candidate => new
            {
                id = candidate.Id,
                name = candidate.Name,
                appearances = looks.Count(look => look.Eras.Contains(candidate.Id)),
                pictures = looks.Where(look => look.Eras.Contains(candidate.Id)).Sum(look => look.Images.Count),
            }),
            note,
        });
    }

    [McpServerTool(Name = GetTool, Title = "Fetch a lore picture", ReadOnly = true, Destructive = false, Idempotent = true, OpenWorld = false)]
    [Description("Fetch one of a lore entry's pictures as viewable image content, by the entry's id and the imageId "
        + "list_lore_images or get_project_entry gave - a profile, appearance or image field picture, of a lore entry or of a "
        + "project's own entry. variant: \"preview\" (default) is the whole picture fitted within 1024 pixels, as WebP - "
        + "enough to look at; \"thumbnail\" is the small square the author framed for cards (WebP, 320 pixels); \"original\" is "
        + "the file exactly as uploaded, only when asked for and only up to 4 MB - a larger original is refused and the preview "
        + "stands in. format: \"webp\" (default) or \"png\" re-encodes the preview as PNG, for a client that shows a blank "
        + "tile for WebP; the thumbnail and original keep their stored type. The result includes an image block, an explicit LorEvolve page link that requires sign-in and current "
        + "universe access, and a text block with metadata. Client rendering varies: if the person cannot see the inline image, "
        + "show them the LorEvolve link; do not claim that the image was displayed unless it is visibly present in the client.")]
    public async Task<CallToolResult> GetLoreImageAsync(
        [Description("The entry's id, exactly as a result gave it: a lore entry's or a project entry's.")] string loreId,
        [Description("The picture's imageId, exactly as list_lore_images or get_project_entry gave it.")] string imageId,
        [Description("preview (default), thumbnail or original.")] string? variant = null,
        [Description("The preview's encoding: webp (default) or png.")] string? format = null,
        CancellationToken cancellationToken = default)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }

        var which = (variant ?? PreviewVariant).Trim().ToLowerInvariant();
        if (which is not (PreviewVariant or ThumbnailVariant or OriginalVariant))
        {
            return Error("bad_arguments", $"variant must be {PreviewVariant}, {ThumbnailVariant} or {OriginalVariant}.");
        }

        var encoding = (format ?? WebpFormat).Trim().ToLowerInvariant();
        if (encoding is not (WebpFormat or PngFormat) || (encoding == PngFormat && which != PreviewVariant))
        {
            return Error("bad_arguments", $"format must be {WebpFormat} or {PngFormat}, and only the {PreviewVariant} is re-encoded.");
        }

        if (!Guid.TryParse(loreId, out var entryId) || !Guid.TryParse(imageId, out var pictureId)
            || await FindAsync(entryId, pictureId, cancellationToken) is not { } found)
        {
            return NotFound();
        }

        if (which == OriginalVariant && found.Picture.ByteSize > McpLimits.ImageOriginalBytes)
        {
            return Error(
                "image_too_large",
                $"The original is {ImagePreparation.Megabytes(found.Picture.ByteSize)} MB, over the {ImagePreparation.Megabytes(McpLimits.ImageOriginalBytes)} MB handed over inline. "
                + $"Ask for the {PreviewVariant} instead.",
                new { bytes = found.Picture.ByteSize, limit = McpLimits.ImageOriginalBytes });
        }

        byte[] bytes;
        try
        {
            await using var stored = await store.GetAsync(which == ThumbnailVariant ? found.ThumbnailKey : found.OriginalKey, cancellationToken);
            if (stored is null)
            {
                // The row names an object the store does not hold: not found, as the app answers it, and nothing said
                // about which store was missing it.
                return NotFound();
            }

            // The bytes are bounded as they stream, not only as the row describes them: an original is cut off at the
            // limit this tool promises, and a preview's or thumbnail's source at the upload ceiling. LorEvolve wrote every
            // object it reads here, so a stream past its bound is a store that stopped being LorEvolve's, and the answer is a
            // refusal with nothing of the picture in it - never a partial picture.
            var bound = which == OriginalVariant ? McpLimits.ImageOriginalBytes : ImagePreparation.MaxUploadBytes;
            var read = await ReadBoundedAsync(stored.Content, bound, cancellationToken);
            if (read is null)
            {
                return which == OriginalVariant
                    ? Error(
                        "image_too_large",
                        $"The original is over the {ImagePreparation.Megabytes(McpLimits.ImageOriginalBytes)} MB handed over inline. Ask for the {PreviewVariant} instead.",
                        new { limit = McpLimits.ImageOriginalBytes })
                    : Error("image_too_large", "This picture is larger than LorEvolve stores.");
            }

            bytes = read;
        }
        catch (MediaStorageException exception)
        {
            if (exception is MediaStorageFailedException)
            {
                LogStorageFailure(logger, entryId, exception);
            }

            return Error("storage_unavailable", exception.Message);
        }

        string contentType;
        int width;
        int height;
        switch (which)
        {
            case PreviewVariant:
            {
                using var source = new MemoryStream(bytes, writable: false);
                if (await ImagePreparation.PreviewAsync(source, McpLimits.ImagePreviewSide, encoding == PngFormat, cancellationToken) is not { } preview)
                {
                    return Error("image_unreadable", "This picture could not be decoded for a preview.");
                }

                (bytes, contentType, width, height) = (preview.Bytes, encoding == PngFormat ? "image/png" : "image/webp", preview.Width, preview.Height);
                break;
            }

            case ThumbnailVariant:
            {
                using var source = new MemoryStream(bytes, writable: false);
                var measured = await ImagePreparation.MeasureAsync(source, cancellationToken);
                (contentType, width, height) = ("image/webp", measured?.Width ?? 0, measured?.Height ?? 0);
                break;
            }

            default:
                (contentType, width, height) = (found.Picture.ContentType, found.Picture.Width, found.Picture.Height);
                break;
        }

        var viewUrl = found.Kind == AppearanceKind ? ProgressionUrl(found.Entry) : EntryUrl(found.Entry);
        var pageLabel = found.Entry.ProjectId is not null ? "project page" : found.Kind == AppearanceKind ? "progression page" : "Lore page";
        var about = new
        {
            loreId = entryId,
            loreName = found.Entry.Name,
            loreType = found.Entry.TypeName,
            imageId = pictureId,
            kind = found.Kind,
            projectId = found.Entry.ProjectId,
            role = found.Kind switch
            {
                ProfileKind => "The entry's own portrait: its base picture, not a form's or an era's.",
                FieldKind => "The picture of one of the entry's image fields.",
                _ => "A picture of one appearance of the entry, linked to exactly the forms and eras listed.",
            },
            variant = which,
            contentType,
            width,
            height,
            bytes = bytes.Length,
            originalBytes = found.Picture.ByteSize,
            originalWidth = found.Picture.Width,
            originalHeight = found.Picture.Height,
            fileName = found.Picture.FileName,
            uploadedAt = found.Picture.UploadedAt,
            appearance = found.Appearance is null
                ? null
                : new { id = found.Appearance.Id, label = found.Appearance.Name, forms = found.Forms, eras = found.Eras },
            field = found.Field is null ? null : new { id = found.Field.Id, name = found.Field.Name },
            url = viewUrl,
        };
        var viewText = $"If the inline picture is not visible in this client, [open the LorEvolve {pageLabel}]({viewUrl}). Sign-in and current access to this universe are required. LorEvolve cannot tell whether this client rendered the inline picture.";

        return new CallToolResult
        {
            Content =
            [
                ImageContentBlock.FromBytes(bytes, contentType),
                new TextContentBlock { Text = viewText },
                new TextContentBlock { Text = JsonSerializer.Serialize(about, McpResults.Json) },
            ],
        };
    }

    // ---------- Reading ----------

    /// <summary>
    /// The live entry of this universe the text names: by id, or by its exact name or alias (case folded). A name shared
    /// by two live entries is refused with the candidates, never guessed.
    /// </summary>
    private async Task<(Head? Entry, CallToolResult? Refused)> ResolveEntryAsync(string? text, CancellationToken cancellationToken)
    {
        var wanted = text?.Trim();
        if (string.IsNullOrEmpty(wanted))
        {
            return (null, Error("bad_arguments", "Give the lore entry's id, or its exact name or alias."));
        }

        if (Guid.TryParse(wanted, out var id))
        {
            // Past the filter that keeps a project's entries out of the lore: the universe and the Trash are checked here.
            var head = await db.Entities.AsNoTracking().IgnoreQueryFilters()
                .Where(entity => entity.Id == id && entity.UniverseId == caller.UniverseId && entity.DeletedAt == null)
                .Select(entity => new Head(entity.Id, entity.Name, entity.EntityType!.Name, entity.ProjectId))
                .FirstOrDefaultAsync(cancellationToken);
            return (head, head is null ? NotFound() : null);
        }

        if (wanted.Length > NameLength)
        {
            return (null, NotFound());
        }

        var folded = wanted.ToLowerInvariant();
#pragma warning disable CA1862 // ToLower() is what EF Core translates to SQLite's lower(); a StringComparison overload is not translated.
        var matches = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == caller.UniverseId
                && entity.DeletedAt == null
                && (entity.Name.ToLower() == folded || entity.Aliases.Any(alias => alias.Value.ToLower() == folded)))
            .OrderBy(entity => entity.Name)
            .ThenBy(entity => entity.Id)
            .Select(entity => new Head(entity.Id, entity.Name, entity.EntityType!.Name))
            .Take(11)
            .ToListAsync(cancellationToken);
#pragma warning restore CA1862

        return matches.Count switch
        {
            0 => (null, Error("not_found", "No live lore entry has that name or alias in this universe. Try search_universe.")),
            1 => (matches[0], null),
            _ => (null, Error(
                "ambiguous",
                $"'{wanted}' names more than one lore entry. Call again with one of their ids.",
                new { candidates = matches.Take(10).Select(match => new { id = match.Id, name = match.Name, type = match.TypeName }) })),
        };
    }

    /// <summary>
    /// One of an entry's forms, eras or appearances by id or exact name (case folded; unique within an entry, so never
    /// ambiguous). Nothing asked for is nothing chosen; something asked for and not there is refused with what there is.
    /// </summary>
    private static (Named? Chosen, CallToolResult? Refused) Pick(string? text, List<Named> options, string noun)
    {
        var wanted = text?.Trim();
        if (string.IsNullOrEmpty(wanted))
        {
            return (null, null);
        }

        var chosen = Guid.TryParse(wanted, out var id)
            ? options.FirstOrDefault(option => option.Id == id)
            : options.FirstOrDefault(option => string.Equals(option.Name, wanted, StringComparison.OrdinalIgnoreCase));

        return chosen is not null
            ? (chosen, null)
            : (null, Error(
                $"{noun}_not_found",
                options.Count == 0 ? $"This entry has no {noun}s." : $"This entry has no {noun} '{wanted}'. Its {noun}s are listed.",
                new { options = options.Select(option => new { id = option.Id, name = option.Name }) }));
    }

    /// <summary>
    /// The picture, if this live entry of this universe holds it: its own, one of an appearance's, or an image field's. A
    /// project's own entry counts: the filter that keeps those out of the lore is ignored, and the universe and the Trash are
    /// checked explicitly instead.
    /// </summary>
    private async Task<Found?> FindAsync(Guid entryId, Guid pictureId, CancellationToken cancellationToken)
    {
        var own = await db.EntityImages.AsNoTracking().IgnoreQueryFilters()
            .Where(image => image.EntityId == entryId
                && image.AssetId == pictureId
                && image.Entity!.UniverseId == caller.UniverseId
                && image.Entity.DeletedAt == null)
            .Select(image => new
            {
                image.Entity!.Name,
                Type = image.Entity.EntityType!.Name,
                image.Entity.ProjectId,
                image.OriginalKey,
                image.ThumbnailKey,
                Picture = new Picture(image.AssetId, image.ContentType, image.Width, image.Height, image.ByteSize, image.FileName, image.UploadedAt),
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (own is not null)
        {
            return new Found(new Head(entryId, own.Name, own.Type, own.ProjectId), ProfileKind, own.Picture, own.OriginalKey, own.ThumbnailKey, null, [], []);
        }

        var look = await db.EntityAppearanceImages.AsNoTracking().IgnoreQueryFilters()
            .Where(image => image.Id == pictureId
                && image.Appearance!.EntityId == entryId
                && image.Appearance.Entity!.UniverseId == caller.UniverseId
                && image.Appearance.Entity.DeletedAt == null)
            .Select(image => new
            {
                image.Appearance!.Entity!.Name,
                Type = image.Appearance.Entity.EntityType!.Name,
                image.Appearance.Entity.ProjectId,
                image.OriginalKey,
                image.ThumbnailKey,
                Picture = new Picture(image.Id, image.ContentType, image.Width, image.Height, image.ByteSize, image.FileName, image.UploadedAt),
                AppearanceId = image.Appearance.Id,
                image.Appearance.Label,
                Forms = image.Appearance.Forms.Select(link => link.Form!.Name).ToList(),
                Eras = image.Appearance.Eras.Select(link => link.Era!.Name).ToList(),
            })
            .AsSplitQuery()
            .FirstOrDefaultAsync(cancellationToken);

        if (look is not null)
        {
            return new Found(
                new Head(entryId, look.Name, look.Type, look.ProjectId),
                AppearanceKind,
                look.Picture,
                look.OriginalKey,
                look.ThumbnailKey,
                new Named(look.AppearanceId, look.Label),
                look.Forms,
                look.Eras);
        }

        // An image field's picture: its original, and the crop the field frames it to as the thumbnail (always WebP).
        var field = await db.EntityFieldImages.AsNoTracking().IgnoreQueryFilters()
            .Where(image => image.EntityId == entryId
                && image.AssetId == pictureId
                && image.FieldDefinition!.ArchivedAt == null
                && image.Entity!.UniverseId == caller.UniverseId
                && image.Entity.DeletedAt == null)
            .Select(image => new
            {
                image.Entity!.Name,
                Type = image.Entity.EntityType!.Name,
                image.Entity.ProjectId,
                image.OriginalKey,
                image.CropKey,
                FieldId = image.FieldDefinitionId,
                FieldName = image.FieldDefinition!.Name,
                Picture = new Picture(image.AssetId, image.ContentType, image.Width, image.Height, image.ByteSize, image.FileName, image.UploadedAt),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return field is null
            ? null
            : new Found(
                new Head(entryId, field.Name, field.Type, field.ProjectId),
                FieldKind,
                field.Picture,
                field.OriginalKey,
                field.CropKey,
                null,
                [],
                [],
                new Named(field.FieldId, field.FieldName));
    }

    /// <summary>The pictures of the entry's image fields that are still on its type, in the type's field order.</summary>
    private async Task<List<(Named Field, Picture Picture)>> FieldPicturesAsync(Guid entryId, CancellationToken cancellationToken)
    {
        var rows = await db.EntityFieldImages.AsNoTracking().IgnoreQueryFilters()
            .Where(image => image.EntityId == entryId && image.FieldDefinition!.ArchivedAt == null)
            .OrderBy(image => image.FieldDefinition!.DisplayOrder)
            .Select(image => new
            {
                image.FieldDefinitionId,
                image.FieldDefinition!.Name,
                Picture = new Picture(image.AssetId, image.ContentType, image.Width, image.Height, image.ByteSize, image.FileName, image.UploadedAt),
            })
            .ToListAsync(cancellationToken);
        return [.. rows.Select(row => (new Named(row.FieldDefinitionId, row.Name), row.Picture))];
    }

    /// <summary>The whole stream, or null once it has run past <paramref name="limit"/> bytes.</summary>
    private static async Task<byte[]?> ReadBoundedAsync(Stream content, long limit, CancellationToken cancellationToken)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[64 * 1024];
        int read;
        while ((read = await content.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > limit)
            {
                return null;
            }

            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    // ---------- Shaping ----------

    private static object Describe(Picture picture, string kind, int? position) => new
    {
        imageId = picture.Id,
        kind,
        position,
        contentType = picture.ContentType,
        width = picture.Width,
        height = picture.Height,
        bytes = picture.ByteSize,
        fileName = picture.FileName,
        uploadedAt = picture.UploadedAt,
    };

    private static IEnumerable<object> Names(IEnumerable<Guid> ids, List<Named> options) =>
        ids.Select(id => options.FirstOrDefault(option => option.Id == id))
            .OfType<Named>()
            .Select(option => new { id = option.Id, name = option.Name });

    private string EntryUrl(Head entry) => entry.ProjectId is { } projectId
        ? $"{site.Base}/app/universes/{caller.UniverseId:D}/projects/{projectId:D}"
        : $"{site.Base}/app/universes/{caller.UniverseId:D}/lore/{entry.Id:D}";

    private string ProgressionUrl(Head entry) => entry.ProjectId is null ? $"{EntryUrl(entry)}/progression" : EntryUrl(entry);

    [LoggerMessage(Level = LogLevel.Error, Message = "Image storage failed reading a picture of entry {EntityId} for an MCP client.")]
    private static partial void LogStorageFailure(ILogger logger, Guid entityId, Exception exception);
}
