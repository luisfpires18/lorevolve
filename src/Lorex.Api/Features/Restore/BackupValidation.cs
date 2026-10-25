using System.Text.RegularExpressions;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Knowledge;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Maps;
using Lorex.Api.Features.Progression;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Lorex.Api.Features.WorldRules;

namespace Lorex.Api.Features.Restore;

/// <summary>
/// One picture that passed validation: what the writer needs to store it again under new ids. The
/// thumbnail is already cut, by the same gate an upload goes through; the original is read back out
/// of the archive when it is written, so it is never held here.
/// </summary>
internal sealed record ValidatedImage(
    Guid EntityId,
    string MediaPath,
    string ContentType,
    string Extension,
    int Width,
    int Height,
    long ByteSize,
    byte[] Thumbnail);

/// <summary>
/// One map's picture that passed validation (issue #52): what the writer needs to store it again under new ids, with the
/// display copy already fitted by the same gate an upload goes through. Keyed by the map's id in the file.
/// </summary>
internal sealed record ValidatedMapImage(
    Guid MapId,
    string MediaPath,
    string ContentType,
    string Extension,
    int Width,
    int Height,
    long ByteSize,
    byte[] Display);

/// <summary>
/// A backup that can be restored: the payload in the current shape (<see cref="BackupNormalization"/>),
/// every picture proven readable, and what the author is shown before they commit to it.
/// </summary>
internal sealed record RestorableBackup(
    int FormatVersion,
    DateTime GeneratedAt,
    UniverseBackupPayload Payload,
    IReadOnlyDictionary<Guid, ValidatedImage> Images,
    int RecordCount,
    BackupPreviewCounts Counts,
    ValidatedImage? Artwork = null,
    IReadOnlyDictionary<Guid, ValidatedImage>? AppearanceImages = null,
    IReadOnlyDictionary<Guid, ValidatedMapImage>? MapImages = null);

/// <summary>
/// Decides whether a parsed backup can be reconstructed, without writing anything anywhere.
///
/// <para><b>Structural, not semantic.</b> Every check here is one the destination already depends on:
/// an id is unique, a reference resolves to something of the right kind in the same file, an enum is
/// one Lorex knows, text fits its column, a unique index would not be broken, a document is one the
/// article editor may render, two live rows do not claim one place. Nothing is judged for sense - no
/// relationship read from its name, no era guessed from a label, no Canon re-decided - because a
/// fictional world that looks inconsistent is still the author's world.</para>
///
/// <para><b>Everything a reference could reach is in the file.</b> Every id the writer will translate
/// has to be listed here first, so no restored row can point at anything outside the universe being
/// created - not at the universe the backup came from, not at another account's. A reference to
/// something the file does not hold is refused rather than dropped.</para>
///
/// <para><b>Stored history is the exception, deliberately.</b> An entry version records the ids of the
/// field, option, era and entry it showed at the time, with no key behind them (ADR 0013): the field
/// may since have been deleted. Those ids are not required to resolve, and the writer gives each one
/// a fresh id of its own rather than keeping the source's, so history cannot point outside the
/// restored universe either.</para>
///
/// <para>The pictures are decoded in full - not just identified - and cut into thumbnails by
/// <see cref="ImagePreparation"/>, so a picture that would fail the restore fails the validation.</para>
/// </summary>
internal static partial class BackupValidation
{
    public static async Task<RestorableBackup> ValidateAsync(OpenedBackup opened, CancellationToken cancellationToken)
    {
        var version = opened.Backup.FormatVersion;
        var projected = BackupNormalization.Project(opened.Backup.Payload, version);

        var issues = new BackupIssueList();
        new ContentChecks(projected, version, issues, opened).Run();
        issues.ThrowIfAny();

        var payload = BackupNormalization.Normalize(projected, version);
        var records = CountRecords(payload);

        if (records > BackupRestoreLimits.MaxRecords)
        {
            throw BackupRejectedException.One(
                BackupRejection.TooLarge,
                BackupIssueCodes.TooLarge,
                $"This backup holds {records:N0} records. Lorex restores at most {BackupRestoreLimits.MaxRecords:N0} at once.");
        }

        var images = await CheckImagesAsync(payload, opened, issues, cancellationToken);
        var appearanceImages = await CheckAppearanceImagesAsync(payload, opened, issues, cancellationToken);
        var artwork = await CheckArtworkAsync(payload.Universe, opened, issues, cancellationToken);
        var mapImages = await CheckMapImagesAsync(payload, opened, issues, cancellationToken);
        issues.ThrowIfAny();

        return new RestorableBackup(
            version,
            opened.Backup.GeneratedAt,
            payload,
            images,
            records,
            BackupPreviewCounts.Of(payload, images.Count + appearanceImages.Count),
            artwork,
            appearanceImages,
            mapImages);
    }

    /// <summary>
    /// The universe's artwork, decoded in full and cut into its card by the same gate an upload goes through,
    /// with the 16:10 frame the backup recorded - so artwork that would fail the restore fails here.
    /// </summary>
    private static async Task<ValidatedImage?> CheckArtworkAsync(
        BackupUniverse universe,
        OpenedBackup opened,
        BackupIssueList issues,
        CancellationToken cancellationToken)
    {
        if (universe.Artwork is not { } artwork)
        {
            return null;
        }

        var bytes = await opened.ReadMediaAsync(artwork.MediaPath, cancellationToken);
        var crop = new ImageCrop(artwork.Crop.X, artwork.Crop.Y, artwork.Crop.Width, artwork.Crop.Height);

        using var stream = new MemoryStream(bytes, writable: false);
        PreparedImage? prepared;
        ImageRejection? rejection;

        try
        {
            (prepared, rejection) = await ImagePreparation.PrepareAsync(stream, bytes.Length, crop, ImageFrame.Card, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            (prepared, rejection) = (null, new ImageRejection(ImagePreparation.FileField, "That image could not be read."));
        }

        if (prepared is null)
        {
            issues.Add(BackupIssueCodes.InvalidImage, $"The universe's artwork could not be used: {rejection!.Message}");
            return null;
        }

        if (!string.Equals(prepared.ContentType, artwork.ContentType, StringComparison.Ordinal))
        {
            issues.Add(BackupIssueCodes.InvalidImage, "The universe's artwork is not the kind of image the backup says it is.");
            return null;
        }

        if (bytes.Length != artwork.ByteSize)
        {
            issues.Add(BackupIssueCodes.InvalidImage, "The universe's artwork is not the size the backup says it is.");
            return null;
        }

        return new ValidatedImage(
            universe.Id,
            artwork.MediaPath,
            prepared.ContentType,
            prepared.Extension,
            prepared.Width,
            prepared.Height,
            bytes.Length,
            prepared.Thumbnail);
    }

    // ---------- Pictures ----------

    private static async Task<Dictionary<Guid, ValidatedImage>> CheckImagesAsync(
        UniverseBackupPayload payload,
        OpenedBackup opened,
        BackupIssueList issues,
        CancellationToken cancellationToken)
    {
        var withImages = payload.Entities.Where(entity => entity.Image is not null).ToList();
        var results = new Dictionary<Guid, ValidatedImage>();
        using var gate = new SemaphoreSlim(BackupRestoreLimits.ImageConcurrency);

        await Task.WhenAll(withImages.Select(async entity =>
        {
            await gate.WaitAsync(cancellationToken);
            try
            {
                var image = entity.Image!;
                var bytes = await opened.ReadMediaAsync(image.MediaPath, cancellationToken);
                var crop = image.Crop is { } stored ? new ImageCrop(stored.X, stored.Y, stored.Width, stored.Height) : null;

                using var stream = new MemoryStream(bytes, writable: false);
                PreparedImage? prepared;
                ImageRejection? rejection;

                try
                {
                    (prepared, rejection) = await ImagePreparation.PrepareAsync(stream, bytes.Length, crop, cancellationToken);
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    // The upload gate names the failures an author's own file produces; bytes built to break a decoder
                    // can fail in ways it does not, and those are a picture that cannot be used all the same.
                    (prepared, rejection) = (null, new ImageRejection(ImagePreparation.FileField, "That image could not be read."));
                }

                lock (results)
                {
                    if (prepared is null)
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"The picture of {Entry(entity)} could not be used: {rejection!.Message}");
                    }
                    else if (!string.Equals(prepared.ContentType, image.ContentType, StringComparison.Ordinal))
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"The picture of {Entry(entity)} is not the kind of image the backup says it is.");
                    }
                    else if (bytes.Length != image.ByteSize)
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"The picture of {Entry(entity)} is not the size the backup says it is.");
                    }
                    else
                    {
                        results[entity.Id] = new ValidatedImage(
                            entity.Id,
                            image.MediaPath,
                            prepared.ContentType,
                            prepared.Extension,
                            prepared.Width,
                            prepared.Height,
                            bytes.Length,
                            prepared.Thumbnail);
                    }
                }
            }
            finally
            {
                gate.Release();
            }
        }));

        return results;
    }

    /// <summary>
    /// Every appearance picture (since version 30), decoded in full and cut into its centred square by the same gate an upload
    /// goes through. Keyed by the picture's id in the file.
    /// </summary>
    private static async Task<Dictionary<Guid, ValidatedImage>> CheckAppearanceImagesAsync(
        UniverseBackupPayload payload,
        OpenedBackup opened,
        BackupIssueList issues,
        CancellationToken cancellationToken)
    {
        var pictures = payload.Entities
            .SelectMany(entity => (entity.Progression?.Appearances ?? [])
                .SelectMany(appearance => appearance.Images.Select(image => (Entity: entity, Appearance: appearance, Image: image))))
            .ToList();
        var results = new Dictionary<Guid, ValidatedImage>();
        using var gate = new SemaphoreSlim(BackupRestoreLimits.ImageConcurrency);

        await Task.WhenAll(pictures.Select(async picture =>
        {
            await gate.WaitAsync(cancellationToken);
            try
            {
                var bytes = await opened.ReadMediaAsync(picture.Image.MediaPath, cancellationToken);
                using var stream = new MemoryStream(bytes, writable: false);
                PreparedImage? prepared;
                ImageRejection? rejection;

                try
                {
                    (prepared, rejection) = await ImagePreparation.PrepareAsync(stream, bytes.Length, null, cancellationToken);
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    (prepared, rejection) = (null, new ImageRejection(ImagePreparation.FileField, "That image could not be read."));
                }

                var what = $"A picture of the appearance {Quote(picture.Appearance.Label)} of {Entry(picture.Entity)}";
                lock (results)
                {
                    if (prepared is null)
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"{what} could not be used: {rejection!.Message}");
                    }
                    else if (!string.Equals(prepared.ContentType, picture.Image.ContentType, StringComparison.Ordinal))
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"{what} is not the kind of image the backup says it is.");
                    }
                    else if (bytes.Length != picture.Image.ByteSize)
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"{what} is not the size the backup says it is.");
                    }
                    else
                    {
                        results[picture.Image.Id] = new ValidatedImage(
                            picture.Entity.Id,
                            picture.Image.MediaPath,
                            prepared.ContentType,
                            prepared.Extension,
                            prepared.Width,
                            prepared.Height,
                            bytes.Length,
                            prepared.Thumbnail);
                    }
                }
            }
            finally
            {
                gate.Release();
            }
        }));

        return results;
    }

    /// <summary>
    /// Every map's picture (since version 34), decoded in full and fitted into its display copy by the same gate an upload
    /// goes through - so a picture that would fail the restore fails here. Keyed by the map's id in the file.
    /// </summary>
    private static async Task<Dictionary<Guid, ValidatedMapImage>> CheckMapImagesAsync(
        UniverseBackupPayload payload,
        OpenedBackup opened,
        BackupIssueList issues,
        CancellationToken cancellationToken)
    {
        var results = new Dictionary<Guid, ValidatedMapImage>();
        using var gate = new SemaphoreSlim(BackupRestoreLimits.ImageConcurrency);

        await Task.WhenAll((payload.Maps ?? []).Select(async map =>
        {
            await gate.WaitAsync(cancellationToken);
            try
            {
                var bytes = await opened.ReadMediaAsync(map.Image.MediaPath, cancellationToken);
                using var stream = new MemoryStream(bytes, writable: false);
                PreparedFit? prepared;
                ImageRejection? rejection;

                try
                {
                    (prepared, rejection) = await ImagePreparation.FitAsync(stream, bytes.Length, MapLimits.DisplaySide, cancellationToken);
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    (prepared, rejection) = (null, new ImageRejection(ImagePreparation.FileField, "That image could not be read."));
                }

                var what = $"The picture of the map {Quote(map.Name)}";
                lock (results)
                {
                    if (prepared is null)
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"{what} could not be used: {rejection!.Message}");
                    }
                    else if (!string.Equals(prepared.ContentType, map.Image.ContentType, StringComparison.Ordinal))
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"{what} is not the kind of image the backup says it is.");
                    }
                    else if (bytes.Length != map.Image.ByteSize)
                    {
                        issues.Add(BackupIssueCodes.InvalidImage, $"{what} is not the size the backup says it is.");
                    }
                    else if (prepared.Width != map.Image.Width || prepared.Height != map.Image.Height)
                    {
                        // The pins' fractions were measured against the size the file states; a picture of another size would
                        // put every pin somewhere else.
                        issues.Add(BackupIssueCodes.InvalidImage, $"{what} is not the size in pixels the backup says it is.");
                    }
                    else
                    {
                        results[map.Id] = new ValidatedMapImage(
                            map.Id,
                            map.Image.MediaPath,
                            prepared.ContentType,
                            prepared.Extension,
                            prepared.Width,
                            prepared.Height,
                            bytes.Length,
                            prepared.Display.Bytes);
                    }
                }
            }
            finally
            {
                gate.Release();
            }
        }));

        return results;
    }

    private static int CountRecords(UniverseBackupPayload payload)
    {
        long count = 1 + payload.ChronologyEras!.Count + (payload.ChronologyCalendar is { } calendar ? 1 + calendar.Months.Count : 0) + payload.Tags.Count + payload.RelationshipTypes.Count
            + payload.DismissedConflicts.Count + (payload.KnowledgeRecords?.Count ?? 0)
            + (payload.Maps ?? []).Sum(map => map is null ? 0L : 1L + (map.Pins?.Count ?? 0));

        foreach (var type in payload.EntityTypes)
        {
            count += 1 + (type.FieldSections?.Count ?? 0) + type.Fields.Count + type.Fields.Sum(field => (long)field.Options.Count);
        }

        foreach (var entity in payload.Entities)
        {
            count += 2 + entity.Aliases.Count + entity.TagIds.Count + entity.FieldValues.Count + (entity.Image is null ? 0 : 1)
                + entity.ArticleRevisions!.Count;

            if (entity.Progression is { } progression)
            {
                count += (progression.Appearances ?? []).Sum(appearance => appearance is null ? 0L
                    : 1L + (appearance.EraIds?.Count ?? 0) + (appearance.FormIds?.Count ?? 0) + (appearance.SceneIds?.Count ?? 0) + (appearance.Images?.Count ?? 0));
                count += (progression.Forms ?? []).Sum(form => form is null ? 0L : 1L + (form.EraIds?.Count ?? 0) + (form.SceneIds?.Count ?? 0))
                    + (progression.Abilities ?? []).Sum(ability => ability is null ? 0L
                        : 1L + (ability.EraIds?.Count ?? 0) + (ability.SceneIds?.Count ?? 0) + (ability.FormIds?.Count ?? 0));
                count += 1 + (progression.Revisions?.Count ?? 0)
                    + (progression.Eras ?? []).Sum(era => era is null ? 0L
                        : 1L + (era.StoryIds?.Count ?? 0) + (era.SceneIds?.Count ?? 0) + (era.FieldValues?.Count ?? 0));
            }

            foreach (var revision in entity.Revisions)
            {
                count += 1 + revision.Aliases.Count + revision.Tags.Count + revision.FieldValues.Count;
            }
        }

        count += payload.Relationships.Sum(relationship => 1L + (relationship?.Periods?.Count ?? 0));
        count += payload.TimelineEntries.Sum(entry => 1L + entry.ParticipantEntityIds.Count + (entry.StoryIds?.Count ?? 0));

        foreach (var story in payload.Stories!)
        {
            count += 1 + story.Chapters!.Count;
            count += story.Scenes.Sum(scene => 1L + scene.LinkedEntityIds.Count
                + (scene.Manuscript is null ? 0 : 1 + scene.Manuscript.Revisions!.Count));
            count += story.PlotArcs!.Sum(arc => 1L + arc.Beats.Sum(beat => 1L + beat.LinkedSceneIds.Count + beat.LinkedEntityIds.Count));
        }

        count += payload.Ideas!.Sum(idea => 1L + idea.References.Count);
        count += payload.WorldRules!.Sum(rule => rule.Validation is null ? 1L : 2L);
        count += payload.ValidationTerms!.Count;
        count += payload.TimelineEntries.Count(entry => entry.Validation is not null);

        return (int)Math.Min(count, int.MaxValue);
    }

    internal static string Entry(BackupEntity entity) => $"the entry {Quote(entity.Name)}";

    internal static string Quote(string? text) =>
        text is null ? "(unnamed)" : text.Length <= 60 ? $"\"{text}\"" : $"\"{text[..57]}...\"";

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    internal static partial Regex AccentColorPattern();

    [GeneratedRegex("^[0-9a-f]{64}$")]
    internal static partial Regex FingerprintPattern();

    /// <summary>One walk over a projected payload, adding every problem it finds to one list.</summary>
    private sealed class ContentChecks(UniverseBackupPayload payload, int version, BackupIssueList issues, OpenedBackup opened)
    {
        private readonly HashSet<Guid> _ids = [];
        private readonly Dictionary<Guid, BackupEntityType> _types = [];
        private readonly Dictionary<Guid, Guid> _fieldOwner = [];
        private readonly HashSet<Guid> _requiredFields = [];
        private readonly Dictionary<Guid, Guid> _eraOwner = [];
        private HashSet<Guid>? _momentIds;
        private UniverseChronology? _reckoning;
        private readonly Dictionary<Guid, (BackupFieldDefinition Field, string What)> _fieldTargets = [];
        private readonly Dictionary<Guid, HashSet<Guid>> _groupMembers = [];
        private readonly HashSet<Guid> _options = [];
        private readonly HashSet<Guid> _tags = [];
        private readonly Dictionary<Guid, BackupEntity> _entities = [];
        private readonly HashSet<Guid> _eras = [];
        private readonly Dictionary<Guid, int> _monthDays = [];
        private bool _hasCalendar;
        private readonly HashSet<Guid> _relationshipTypes = [];
        private readonly HashSet<Guid> _stories = [];
        private readonly Dictionary<Guid, Guid> _sceneStory = [];
        private readonly HashSet<Guid> _arcs = [];
        private readonly HashSet<Guid> _beats = [];
        private readonly Dictionary<Guid, ValidationTermKind> _terms = [];
        private readonly HashSet<string> _referencedMedia = new(StringComparer.Ordinal);

        public void Run()
        {
            if (payload.Universe is null)
            {
                Missing("the universe itself");
                return;
            }

            CheckUniverse(payload.Universe);

            var eras = Required(payload.ChronologyEras, "the list of date periods", since: 4);
            var types = Required(payload.EntityTypes, "the list of entry types");
            var tags = Required(payload.Tags, "the list of tags");
            var entities = Required(payload.Entities, "the list of entries");
            var relationshipTypes = Required(payload.RelationshipTypes, "the list of relation kinds");
            var relationships = Required(payload.Relationships, "the list of relationships");
            var timeline = Required(payload.TimelineEntries, "the timeline");
            var stories = Required(payload.Stories, "the list of stories", since: 5);
            var dismissed = Required(payload.DismissedConflicts, "the dismissed Canon conflicts");
            var ideas = Required(payload.Ideas, "the list of ideas", since: 11);
            var worldRules = Required(payload.WorldRules, "the list of world rules", since: 12);
            var terms = Required(payload.ValidationTerms, "the list of event kinds and methods", since: 13);
            var groups = Required(payload.EntityTypeGroups, "the list of type groups", since: 23);
            var knowledge = Required(payload.KnowledgeRecords, "the list of knowledge records", since: 33);
            var maps = Required(payload.Maps, "the list of maps", since: 34);

            // Everything that can be referenced is listed first, so a reference checked below can
            // point anywhere in the file regardless of order.
            RegisterEras(eras);
            RegisterCalendar(payload.ChronologyCalendar);
            RegisterTypes(types);
            CheckTypeHierarchy(types);
            RegisterGroups(groups);
            CheckFieldTargets();
            RegisterTags(tags);
            RegisterEntities(entities);
            RegisterRelationshipTypes(relationshipTypes);
            RegisterStories(stories);
            RegisterValidationTerms(terms);
            CheckKnowledge(knowledge, stories);
            CheckMaps(maps);

            foreach (var entity in entities)
            {
                if (entity is not null)
                {
                    CheckEntity(entity);
                }
            }

            foreach (var relationship in relationships)
            {
                CheckRelationship(relationship);
            }

            foreach (var entry in timeline)
            {
                CheckTimelineEntry(entry);
            }

            foreach (var story in stories)
            {
                if (story is not null)
                {
                    CheckStory(story);
                }
            }

            foreach (var idea in ideas)
            {
                CheckIdea(idea);
            }

            foreach (var rule in worldRules)
            {
                CheckWorldRule(rule);
            }

            foreach (var conflict in dismissed)
            {
                CheckDismissedConflict(conflict);
            }

            CheckArchiveHoldsOnlyPictures();
        }

        // ---------- Universe ----------

        private void CheckUniverse(BackupUniverse universe)
        {
            // The universe's own id is never used - a restore is a new universe - so it is not registered.
            Text(universe.Name, UniverseConfiguration.NameMaxLength, "The universe's name", required: true);
            Text(universe.Description, UniverseConfiguration.DescriptionMaxLength, "The universe's description");
            Accent(universe.AccentColor, "The universe's colour");

            // Its public details (version 15). Only their shape: nothing here decides anything is public.
            Text(universe.PublicSummary, PublicationLimits.SummaryMaxLength, "The universe's public summary");

            // Its attribution (version 17): a work is only ever named beside the creator it is by.
            Text(universe.OriginalCreator, PublicationLimits.OriginalCreatorMaxLength, "The universe's original creator");
            Text(universe.OriginalWork, PublicationLimits.OriginalWorkMaxLength, "The universe's original work");
            if (string.IsNullOrWhiteSpace(universe.OriginalCreator) && !string.IsNullOrWhiteSpace(universe.OriginalWork))
            {
                Add(BackupIssueCodes.InvalidValue, "The universe names an original work without its original creator.");
            }

            if (universe.Category is { } category)
            {
                Defined(category, "The universe's category");
            }

            if (universe.Genres is { } genres)
            {
                if (genres.Any(genre => !PublicationRules.IsOneGenre(genre)))
                {
                    Add(BackupIssueCodes.InvalidValue, "The universe's genres include one Lorex does not know.");
                }
                else if (genres.Distinct().Count() != genres.Count)
                {
                    Add(BackupIssueCodes.InvalidValue, "The universe names one genre twice.");
                }
                else if (genres.Count > PublicationLimits.MaxGenres)
                {
                    Add(BackupIssueCodes.InvalidValue, $"The universe names {genres.Count} genres. A universe can have at most {PublicationLimits.MaxGenres}.");
                }
            }

            if (universe.Artwork is { } artwork)
            {
                CheckArtwork(artwork);
            }
        }

        private void CheckArtwork(BackupUniverseArtwork artwork)
        {
            if (artwork.ContentType is not ("image/jpeg" or "image/png" or "image/webp"))
            {
                Add(BackupIssueCodes.InvalidImage, "The universe's artwork is a picture of a kind Lorex does not store.");
                return;
            }

            // As for an entry's picture: the path must be exactly the one Lorex would have built.
            var expected = BackupArchive.ArtworkPathFor(artwork.ContentType);

            if (!string.Equals(artwork.MediaPath, expected, StringComparison.Ordinal))
            {
                Add(BackupIssueCodes.InvalidImage, "The universe's artwork is named at a place Lorex would not have put it.");
                return;
            }

            _referencedMedia.Add(expected);

            if (opened.MediaLength(expected) is not { } length)
            {
                Add(BackupIssueCodes.MissingMedia, "The universe's artwork is missing from the archive.");
                return;
            }

            if (length != artwork.ByteSize || artwork.ByteSize <= 0 || artwork.ByteSize > BackupRestoreLimits.MaxMediaBytes)
            {
                Add(BackupIssueCodes.InvalidImage, "The universe's artwork is not the size the backup says it is.");
            }

            if (artwork.Width <= 0 || artwork.Height <= 0 || artwork.Width > ImagePreparation.MaxSide || artwork.Height > ImagePreparation.MaxSide)
            {
                Add(BackupIssueCodes.InvalidImage, "The universe's artwork has dimensions Lorex does not accept.");
            }

            Text(artwork.FileName, StoredImageLimits.FileNameMaxLength, "The file name of the universe's artwork");

            if (artwork.Crop is null)
            {
                Missing("the framing of the universe's artwork");
            }
            else if (ImagePreparation.CheckCrop(new ImageCrop(artwork.Crop.X, artwork.Crop.Y, artwork.Crop.Width, artwork.Crop.Height), ImageFrame.Card) is { } badCrop)
            {
                Add(BackupIssueCodes.InvalidImage, $"The card framing of the universe's artwork cannot be used: {badCrop}");
            }
        }

        // ---------- Eras ----------

        private void RegisterEras(IReadOnlyList<BackupChronologyEra> eras)
        {
            if (eras.Count > ChronologyLimits.MaxEras)
            {
                Add(BackupIssueCodes.InvalidValue, $"The backup has {eras.Count} date periods. A universe can have at most {ChronologyLimits.MaxEras}.");
            }

            var places = new HashSet<int>();

            foreach (var era in eras)
            {
                if (era is null)
                {
                    Missing("a date period");
                    continue;
                }

                var what = $"The date period {Quote(era.Name)}";
                Register(era.Id, what);
                _eras.Add(era.Id);
                Text(era.Name, ChronologyLimits.NameMaxLength, $"{what}'s name", required: true);
                Text(era.Abbreviation, ChronologyLimits.AbbreviationMaxLength, $"{what}'s short label");
                Defined(era.Direction, $"{what}'s direction");
                Defined(era.LabelPosition, $"{what}'s label position");

                if (!places.Add(era.SortOrder))
                {
                    Add(BackupIssueCodes.InvalidOrder, $"{what} claims the same place in the order as another date period.");
                }
            }
        }

        // ---------- Calendar ----------

        /// <summary>
        /// The custom calendar (version 22): at least one month, each with its own id, a unique name ignoring case, a length
        /// within the bound and its own place. Its months are what custom dates are checked against.
        /// </summary>
        private void RegisterCalendar(BackupChronologyCalendar? calendar)
        {
            if (calendar is null)
            {
                return;
            }

            _hasCalendar = true;
            Register(calendar.Id, "The calendar");

            var months = Required(calendar.Months, "the calendar's months");
            if (months.Count is 0 or > ChronologyLimits.MaxMonths)
            {
                Add(BackupIssueCodes.InvalidValue, $"The calendar has {months.Count} months. A calendar has from 1 to {ChronologyLimits.MaxMonths}.");
            }

            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var places = new HashSet<int>();

            foreach (var month in months)
            {
                if (month is null)
                {
                    Missing("a month of the calendar");
                    continue;
                }

                var what = $"The month {Quote(month.Name)}";
                Register(month.Id, what);
                _monthDays[month.Id] = month.DayCount;

                if (Text(month.Name, ChronologyLimits.NameMaxLength, $"{what}'s name", required: true) && !names.Add(month.Name.Trim()))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} has the same name as another month.");
                }

                Text(month.Abbreviation, ChronologyLimits.AbbreviationMaxLength, $"{what}'s short name");

                if (month.DayCount < 1 || month.DayCount > ChronologyLimits.MaxDaysInMonth)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has {month.DayCount} days. A month has from 1 to {ChronologyLimits.MaxDaysInMonth}.");
                }

                if (!places.Add(month.SortOrder))
                {
                    Add(BackupIssueCodes.InvalidOrder, $"{what} claims the same place in the year as another month.");
                }
            }
        }

        // ---------- Types and fields ----------

        /// <summary>
        /// Every parent is a type of this file and not the type itself, and following parents always ends at a root: the
        /// types are a forest, or nothing is written. Places among siblings are restored as stored - ties are ordered by
        /// name, as the app orders them - so a valid file is never rearranged.
        /// </summary>
        private void CheckTypeHierarchy(IReadOnlyList<BackupEntityType> types)
        {
            var parentOf = new Dictionary<Guid, Guid?>();
            var sound = true;

            foreach (var type in types)
            {
                if (type is null || !parentOf.TryAdd(type.Id, type.ParentId) || type.ParentId is not { } parent)
                {
                    continue;
                }

                var what = $"The entry type {Quote(type.Name)}";
                if (parent == type.Id)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} is nested inside itself.");
                    sound = false;
                }
                else if (!_types.ContainsKey(parent))
                {
                    Reference(false, $"{what} is nested inside an entry type the backup does not hold.");
                    sound = false;
                }
            }

            if (sound && !EntityTypeHierarchy.IsForest(parentOf))
            {
                Add(BackupIssueCodes.InvalidValue, "The entry types are nested in a loop: a type ends up inside itself.");
            }
        }

        /// <summary>
        /// The semantic groups (version 23), once every type is known: each with its own id, a unique name, and members that
        /// are types of this file, each once. Membership is carried as written and never inferred from a name.
        /// </summary>
        /// <summary>
        /// Knowledge records (ADR 0057): each names a knower the file holds, a subject it holds or none, a statement, and a
        /// scene the file holds or known from the start - never both, never neither.
        /// </summary>
        private void CheckKnowledge(IReadOnlyList<BackupKnowledgeRecord> records, IReadOnlyList<BackupStory> stories)
        {
            if (version < 33)
            {
                return;
            }

            var scenes = new HashSet<Guid>(stories
                .Where(story => story is not null)
                .SelectMany(story => story.Scenes ?? [])
                .Where(scene => scene is not null)
                .Select(scene => scene.Id));

            foreach (var record in records)
            {
                if (record is null)
                {
                    Missing("a knowledge record");
                    continue;
                }

                var what = $"The knowledge record {Quote(record.Statement ?? string.Empty)}";
                Register(record.Id, what);
                Text(record.Statement, KnowledgeLimits.StatementMaxLength, $"{what}'s statement", required: true);
                Reference(_entities.ContainsKey(record.KnowerEntityId), $"{what} names a knower the backup does not hold.");

                if (record.SubjectEntityId is { } subject)
                {
                    Reference(_entities.ContainsKey(subject), $"{what} is about an entry the backup does not hold.");
                    if (subject == record.KnowerEntityId)
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{what} has its knower as its own subject.");
                    }
                }

                if (record.KnownFromStart == (record.SceneId is not null))
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} must name the scene it is learnt in or be known from the start, not both or neither.");
                }
                else if (record.SceneId is { } scene)
                {
                    Reference(scenes.Contains(scene), $"{what} names a scene the backup does not hold.");
                }
            }
        }

        private void RegisterGroups(IReadOnlyList<BackupEntityTypeGroup> groups)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);

            foreach (var group in groups)
            {
                if (group is null)
                {
                    Missing("a type group");
                    continue;
                }

                var what = $"The type group {Quote(group.Name)}";
                Register(group.Id, what);

                if (Text(group.Name, LoreLimits.NameMaxLength, $"{what}'s name", required: true) && !names.Add(group.Name))
                {
                    Add(BackupIssueCodes.Duplicate, $"Two type groups are both called {Quote(group.Name)}.");
                }

                var members = new HashSet<Guid>();
                foreach (var typeId in Required(group.TypeIds, $"{what}'s types"))
                {
                    Reference(_types.ContainsKey(typeId), $"{what} holds an entry type the backup does not hold.");
                    if (!members.Add(typeId))
                    {
                        Add(BackupIssueCodes.Duplicate, $"{what} lists the same entry type twice.");
                    }
                }

                _groupMembers[group.Id] = members;
            }
        }

        /// <summary>
        /// A link field's type limit (version 20) or group limit (version 23), once every type and group is known: one of this
        /// file, on a link field, never both, in a file new enough to say it. The restore maps it to the new id, so anything
        /// else would name nothing - and a group target is never read as open to any type.
        /// </summary>
        private void CheckFieldTargets()
        {
            foreach (var (field, what) in _fieldTargets.Values)
            {
                if (field.TargetGroupId is { } group)
                {
                    if (version < 23)
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{what} is limited to a type group, which a backup this old cannot say. It was not written by Lorex.");
                    }
                    else if (field.Kind != EntityFieldKind.EntityReference)
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{what} is limited to a type group but does not link to an entry.");
                    }
                    else if (field.TargetEntityTypeId is not null)
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{what} is limited to both one type and a type group.");
                    }
                    else
                    {
                        Reference(_groupMembers.ContainsKey(group), $"{what} is limited to a type group the backup does not hold.");
                    }

                    continue;
                }

                if (version < 20)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} is limited to one type, which a backup this old cannot say. It was not written by Lorex.");
                }
                else if (field.Kind != EntityFieldKind.EntityReference)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} is limited to one type but does not link to an entry.");
                }
                else
                {
                    Reference(_types.ContainsKey(field.TargetEntityTypeId!.Value), $"{what} is limited to an entry type the backup does not hold.");
                }
            }
        }

        private void RegisterTypes(IReadOnlyList<BackupEntityType> types)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);

            foreach (var type in types)
            {
                if (type is null)
                {
                    Missing("an entry type");
                    continue;
                }

                var what = $"The entry type {Quote(type.Name)}";
                Register(type.Id, what);
                _types[type.Id] = type;

                if (Text(type.Name, LoreLimits.NameMaxLength, $"{what}'s name", required: true) && !names.Add(type.Name))
                {
                    Add(BackupIssueCodes.Duplicate, $"Two entry types are both called {Quote(type.Name)}.");
                }

                Text(type.Description, LoreLimits.DescriptionMaxLength, $"{what}'s description");
                Accent(type.AccentColor, $"{what}'s colour");

                // Before version 4 an icon is brought inside the set by normalization, as the migration did.
                if (version >= 4 && type.Icon is not null && !EntityTypeIcons.IsKnown(type.Icon))
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has an icon Lorex does not have.");
                }

                // Its fields' sections (version 31): ids of this file, names unique within the type as the API keeps them.
                var sections = Required(type.FieldSections, $"{what}'s field sections", since: 31);
                var sectionIds = new HashSet<Guid>();
                var sectionNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                if (sections.Count > LoreLimits.MaxFieldSections)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has {sections.Count} field sections. A type can have at most {LoreLimits.MaxFieldSections}.");
                }

                foreach (var section in sections)
                {
                    if (section is null)
                    {
                        Missing($"a field section of {what.ToLowerInvariant()}");
                        continue;
                    }

                    var sectionWhat = $"The field section {Quote(section.Name)} of {Quote(type.Name)}";
                    Register(section.Id, sectionWhat);
                    sectionIds.Add(section.Id);

                    if (Text(section.Name, LoreLimits.NameMaxLength, $"{sectionWhat}'s name", required: true) && !sectionNames.Add(section.Name))
                    {
                        Add(BackupIssueCodes.Duplicate, $"The entry type {Quote(type.Name)} has two field sections called {Quote(section.Name)}.");
                    }
                }

                var fields = Required(type.Fields, $"{what}'s fields");
                var fieldNames = new HashSet<string>(StringComparer.Ordinal);
                var semantics = new HashSet<EntityFieldSemantic>();

                foreach (var field in fields)
                {
                    if (field is null)
                    {
                        Missing($"a field of {what.ToLowerInvariant()}");
                        continue;
                    }

                    var fieldWhat = $"The field {Quote(field.Name)} of {Quote(type.Name)}";
                    Register(field.Id, fieldWhat);
                    _fieldOwner[field.Id] = type.Id;

                    if (field.IsRequired)
                    {
                        _requiredFields.Add(field.Id);
                    }

                    if (Text(field.Name, LoreLimits.NameMaxLength, $"{fieldWhat}'s name", required: true) && !fieldNames.Add(field.Name))
                    {
                        Add(BackupIssueCodes.Duplicate, $"The entry type {Quote(type.Name)} has two fields called {Quote(field.Name)}.");
                    }

                    Defined(field.Kind, $"{fieldWhat}'s kind");
                    Text(field.DefaultValue, LoreLimits.TextValueMaxLength, $"{fieldWhat}'s default value");

                    // A section of its own type only: the restore maps it to that section's new id.
                    if (field.SectionId is { } sectionId)
                    {
                        Reference(sectionIds.Contains(sectionId), $"{fieldWhat} is in a field section its type does not hold.");
                    }

                    if (field.TargetEntityTypeId is not null || field.TargetGroupId is not null)
                    {
                        _fieldTargets[field.Id] = (field, fieldWhat);
                    }

                    if (field.Semantic is { } semantic)
                    {
                        if (!Enum.IsDefined(semantic))
                        {
                            Add(BackupIssueCodes.InvalidValue, $"{fieldWhat} declares a meaning Lorex does not know.");
                        }
                        else if (!LoreValidation.IsSemanticCompatible(semantic, field.Kind))
                        {
                            Add(BackupIssueCodes.InvalidValue, $"{fieldWhat} means {LoreValidation.SemanticWord(semantic)} but is not a Number field.");
                        }
                        else if (!semantics.Add(semantic))
                        {
                            Add(BackupIssueCodes.Duplicate, $"The entry type {Quote(type.Name)} has two fields that mean {LoreValidation.SemanticWord(semantic)}.");
                        }
                    }

                    var optionValues = new HashSet<string>(StringComparer.Ordinal);

                    foreach (var option in Required(field.Options, $"{fieldWhat}'s options"))
                    {
                        if (option is null)
                        {
                            Missing($"an option of {fieldWhat.ToLowerInvariant()}");
                            continue;
                        }

                        Register(option.Id, $"An option of {fieldWhat.ToLowerInvariant()}");
                        _options.Add(option.Id);

                        if (Text(option.Value, LoreLimits.OptionMaxLength, $"An option of {fieldWhat.ToLowerInvariant()}", required: true)
                            && !optionValues.Add(option.Value))
                        {
                            Add(BackupIssueCodes.Duplicate, $"{fieldWhat} lists the option {Quote(option.Value)} twice.");
                        }
                    }
                }
            }
        }

        private void RegisterTags(IReadOnlyList<BackupTag> tags)
        {
            var slugs = new HashSet<string>(StringComparer.Ordinal);

            foreach (var tag in tags)
            {
                if (tag is null)
                {
                    Missing("a tag");
                    continue;
                }

                Register(tag.Id, $"The tag {Quote(tag.Name)}");
                _tags.Add(tag.Id);

                // A tag is found by its lower-cased name, and that is unique per universe.
                if (Text(tag.Name, LoreLimits.TagMaxLength, $"The tag {Quote(tag.Name)}", required: true)
                    && !slugs.Add(tag.Name.ToLowerInvariant()))
                {
                    Add(BackupIssueCodes.Duplicate, $"Two tags are both called {Quote(tag.Name)}, apart from capital letters.");
                }
            }
        }

        // ---------- Entries ----------

        private void RegisterEntities(IReadOnlyList<BackupEntity> entities)
        {
            foreach (var entity in entities)
            {
                if (entity is null)
                {
                    Missing("an entry");
                    continue;
                }

                Register(entity.Id, $"The entry {Quote(entity.Name)}");
                _entities[entity.Id] = entity;

                foreach (var revision in entity.Revisions ?? [])
                {
                    if (revision is not null)
                    {
                        Register(revision.Id, $"A saved version of {Entry(entity)}");
                    }
                }

                foreach (var revision in entity.ArticleRevisions ?? [])
                {
                    if (revision is not null)
                    {
                        Register(revision.Id, $"A saved version of the article of {Entry(entity)}");
                    }
                }

                foreach (var era in entity.Progression?.Eras ?? [])
                {
                    if (era is not null)
                    {
                        Register(era.Id, $"The era {Quote(era.Name)} of {Entry(entity)}");
                        _eraOwner[era.Id] = entity.Id;
                    }
                }

                foreach (var revision in entity.Progression?.Revisions ?? [])
                {
                    if (revision is not null)
                    {
                        Register(revision.Id, $"A saved version of the eras of {Entry(entity)}");
                    }
                }

                foreach (var form in entity.Progression?.Forms ?? [])
                {
                    if (form is not null)
                    {
                        Register(form.Id, $"The form {Quote(form.Name)} of {Entry(entity)}");
                    }
                }

                foreach (var ability in entity.Progression?.Abilities ?? [])
                {
                    if (ability is not null)
                    {
                        Register(ability.Id, $"The ability {Quote(ability.Name)} of {Entry(entity)}");
                    }
                }

                foreach (var appearance in entity.Progression?.Appearances ?? [])
                {
                    if (appearance is not null)
                    {
                        Register(appearance.Id, $"The appearance {Quote(appearance.Label)} of {Entry(entity)}");

                        foreach (var image in appearance.Images ?? [])
                        {
                            if (image is not null)
                            {
                                Register(image.Id, $"A picture of the appearance {Quote(appearance.Label)} of {Entry(entity)}");
                            }
                        }
                    }
                }
            }
        }

        private void CheckEntity(BackupEntity entity)
        {
            var what = char.ToUpperInvariant(Entry(entity)[0]) + Entry(entity)[1..];

            Text(entity.Name, LoreLimits.NameMaxLength, $"{what}'s name", required: true);
            Text(entity.Summary, LoreLimits.SummaryMaxLength, $"{what}'s summary");
            Defined(entity.CanonStatus, $"{what}'s Canon status");
            Reference(_types.ContainsKey(entity.EntityTypeId), $"{what} is of an entry type the backup does not hold.");
            Article(entity.Content, $"{what}'s article");

            if (version >= 9 && entity.Content is not null && entity.ArticleUpdatedAt is null)
            {
                Add(BackupIssueCodes.MissingMember, $"{what} has an article but no record of when it was saved.");
            }

            if (version >= 32 && entity.PrivateNote is { } note)
            {
                if (note.Content is null)
                {
                    Missing($"the text of {Entry(entity)}'s private note");
                }
                else
                {
                    Text(note.Content, PrivateNoteLimits.ContentMaxLength, $"{what}'s private note");
                }
            }

            var aliases = new HashSet<string>(StringComparer.Ordinal);
            foreach (var alias in Required(entity.Aliases, $"{what}'s aliases"))
            {
                if (Text(alias, LoreLimits.NameMaxLength, $"An alias of {Entry(entity)}", required: true) && !aliases.Add(alias))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} lists the alias {Quote(alias)} twice.");
                }
            }

            var tags = new HashSet<Guid>();
            foreach (var tagId in Required(entity.TagIds, $"{what}'s tags"))
            {
                Reference(_tags.Contains(tagId), $"{what} is tagged with a tag the backup does not hold.");

                if (!tags.Add(tagId))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} lists the same tag twice.");
                }
            }

            foreach (var value in Required(entity.FieldValues, $"{what}'s field values"))
            {
                if (value is null)
                {
                    Missing($"a field value of {Entry(entity)}");
                    continue;
                }

                Reference(_fieldOwner.ContainsKey(value.FieldDefinitionId), $"{what} has a value for a field the backup does not hold.");
                Text(value.TextValue, LoreLimits.TextValueMaxLength, $"A value of {Entry(entity)}");

                if (value.OptionId is { } option)
                {
                    Reference(_options.Contains(option), $"{what} has a value naming an option the backup does not hold.");
                }

                if (value.ReferencedEntityId is { } referenced)
                {
                    Reference(_entities.ContainsKey(referenced), $"{what} has a value pointing at an entry the backup does not hold.");

                    // The limit holds in the file as it does in the app: a restore would otherwise write a link the field refuses.
                    if (_fieldTargets.TryGetValue(value.FieldDefinitionId, out var limited)
                        && _entities.TryGetValue(referenced, out var linked)
                        && (limited.Field.TargetGroupId is { } group
                            ? _groupMembers.TryGetValue(group, out var members) && !members.Contains(linked.EntityTypeId)
                            : linked.EntityTypeId != limited.Field.TargetEntityTypeId))
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{what} links its field {Quote(limited.Field.Name)} to an entry of a type that field does not allow.");
                    }
                }

                if (value.EraId is { } era)
                {
                    Reference(_eras.Contains(era), $"{what} has a year counted in a date period the backup does not have.");
                }
            }

            if (entity.Image is { } image)
            {
                CheckImage(entity, image, what);
            }

            CheckRevisions(entity, what);
            CheckArticleRevisions(entity, what);
            CheckProgression(entity, what);
        }

        /// <summary>
        /// An entry's eras (since version 27) held to what a save allows: named, each name once, their places distinct, dates on
        /// the file's chronology, stories and scenes of this file, and overrides of this entry's own type's fields only - with
        /// options, links and years the file holds, a link within its field's limit, and nothing set beside "left empty".
        /// </summary>
        private void CheckProgression(BackupEntity entity, string what)
        {
            if (entity.Progression is not { } progression)
            {
                return;
            }

            var eras = Required(progression.Eras, $"{what}'s eras");

            if (eras.Count > ProgressionLimits.MaxEras)
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} has more eras than Lorex keeps ({ProgressionLimits.MaxEras}).");
            }

            var names = new HashSet<string>(StringComparer.CurrentCultureIgnoreCase);
            var places = new HashSet<int>();

            foreach (var era in eras)
            {
                if (era is null)
                {
                    Missing($"an era of {Entry(entity)}");
                    continue;
                }

                var label = $"The era {Quote(era.Name)} of {Entry(entity)}";

                if (Text(era.Name, ProgressionLimits.NameMaxLength, $"{label}'s name", required: true) && !names.Add(era.Name.Trim()))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} has two eras named {Quote(era.Name)}.");
                }

                Text(era.Description, ProgressionLimits.DescriptionMaxLength, $"{label}'s description");

                if (era.SortOrder < 0 || !places.Add(era.SortOrder))
                {
                    Add(BackupIssueCodes.InvalidOrder, $"{label} has a place another era of the entry also has.");
                }

                if (era.Start is { } start)
                {
                    Point(start.EraId, start.Year, start.Month, start.MonthId, start.Day, $"{label}'s start");
                }

                if (era.End is { } end)
                {
                    Point(end.EraId, end.Year, end.Month, end.MonthId, end.Day, $"{label}'s end");
                }

                // The span is read on the file's own chronology, as a save reads it on the universe's: one that ends before
                // it starts would refuse every later save of the entry's eras.
                if (era.Start is { } from && era.End is { } to
                    && ChronologySpans.Lower(Value(from), Reckoning()) is { } lower
                    && ChronologySpans.Upper(Value(to), Reckoning()) is { } upper
                    && upper < lower)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{label} ends before it starts.");
                }

                var stories = Required(era.StoryIds, $"{label}'s stories");
                var scenes = Required(era.SceneIds, $"{label}'s scenes");

                if (stories.Count > ProgressionLimits.MaxStoriesPerEra || scenes.Count > ProgressionLimits.MaxScenesPerEra)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{label} covers more stories or scenes than Lorex keeps.");
                }

                foreach (var story in stories)
                {
                    Reference(_stories.Contains(story), $"{label} covers a story the backup does not hold.");
                }

                foreach (var scene in scenes)
                {
                    Reference(_sceneStory.ContainsKey(scene), $"{label} covers a scene the backup does not hold.");
                }

                if (stories.Distinct().Count() != stories.Count || scenes.Distinct().Count() != scenes.Count)
                {
                    Add(BackupIssueCodes.Duplicate, $"{label} lists the same story or scene twice.");
                }

                foreach (var value in Required(era.FieldValues, $"{label}'s fields"))
                {
                    if (value is null)
                    {
                        Missing($"a field of {label.ToLowerInvariant()}");
                        continue;
                    }

                    Reference(
                        _fieldOwner.TryGetValue(value.FieldDefinitionId, out var owner) && owner == entity.EntityTypeId,
                        $"{label} sets a field its entry's type does not have.");
                    Text(value.TextValue, LoreLimits.TextValueMaxLength, $"A value of {label.ToLowerInvariant()}");

                    var holdsValue = value.TextValue is not null || value.NumberValue is not null || value.BooleanValue is not null
                        || value.DateValue is not null || value.OptionId is not null || value.ReferencedEntityId is not null;

                    if (value.IsCleared && (holdsValue || value.EraId is not null))
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{label} both leaves a field empty and sets it.");
                    }
                    else if (value.IsCleared && _requiredFields.Contains(value.FieldDefinitionId))
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{label} leaves a required field empty.");
                    }
                    else if (!value.IsCleared && !holdsValue)
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{label} sets a field to nothing.");
                    }

                    if (value.OptionId is { } option)
                    {
                        Reference(_options.Contains(option), $"{label} names an option the backup does not hold.");
                    }

                    if (value.ReferencedEntityId is { } referenced)
                    {
                        Reference(_entities.ContainsKey(referenced), $"{label} links to an entry the backup does not hold.");

                        if (_fieldTargets.TryGetValue(value.FieldDefinitionId, out var limited)
                            && _entities.TryGetValue(referenced, out var linked)
                            && (limited.Field.TargetGroupId is { } group
                                ? _groupMembers.TryGetValue(group, out var members) && !members.Contains(linked.EntityTypeId)
                                : linked.EntityTypeId != limited.Field.TargetEntityTypeId))
                        {
                            Add(BackupIssueCodes.InvalidValue, $"{label} links its field {Quote(limited.Field.Name)} to an entry of a type that field does not allow.");
                        }
                    }

                    if (value.EraId is { } year)
                    {
                        Reference(_eras.Contains(year), $"{label} has a year counted in a date period the backup does not have.");
                    }
                }
            }

            CheckForms(entity, progression, what);
            CheckAppearances(entity, progression, what);

            var numbers = new HashSet<int>();
            foreach (var revision in Required(progression.Revisions, $"{what}'s saved versions of its eras"))
            {
                if (revision is null)
                {
                    Missing($"a saved version of the eras of {Entry(entity)}");
                    continue;
                }

                if (!numbers.Add(revision.Number))
                {
                    Add(BackupIssueCodes.Duplicate, $"The eras of {Entry(entity)} have two saved versions numbered {revision.Number}.");
                }

                Defined(revision.Kind, $"Version {revision.Number} of the eras of {Entry(entity)}");

                if (revision.Snapshot?.Eras is null)
                {
                    Missing($"what version {revision.Number} of the eras of {Entry(entity)} held");
                }
            }
        }

        private void CheckImage(BackupEntity entity, BackupEntityImage image, string what)
        {
            if (image.ContentType is not ("image/jpeg" or "image/png" or "image/webp"))
            {
                Add(BackupIssueCodes.InvalidImage, $"{what} has a picture of a kind Lorex does not store.");
                return;
            }

            // The path is not trusted as written: it has to be exactly the one Lorex would have built from the
            // entry's own id and the picture's kind, which also keeps every read inside the archive's media folder.
            var expected = BackupArchive.MediaPathFor(entity.Id, image.ContentType);

            if (!string.Equals(image.MediaPath, expected, StringComparison.Ordinal))
            {
                Add(BackupIssueCodes.InvalidImage, $"{what} names its picture at a place Lorex would not have put it.");
                return;
            }

            _referencedMedia.Add(expected);

            if (opened.MediaLength(expected) is not { } length)
            {
                Add(BackupIssueCodes.MissingMedia, $"The picture of {Entry(entity)} is missing from the archive.");
                return;
            }

            if (length != image.ByteSize || image.ByteSize <= 0 || image.ByteSize > BackupRestoreLimits.MaxMediaBytes)
            {
                Add(BackupIssueCodes.InvalidImage, $"The picture of {Entry(entity)} is not the size the backup says it is.");
            }

            if (image.Width <= 0 || image.Height <= 0 || image.Width > ImagePreparation.MaxSide || image.Height > ImagePreparation.MaxSide)
            {
                Add(BackupIssueCodes.InvalidImage, $"The picture of {Entry(entity)} has dimensions Lorex does not accept.");
            }

            Text(image.FileName, StoredImageLimits.FileNameMaxLength, $"The file name of the picture of {Entry(entity)}");

            if (image.Crop is { } crop && ImagePreparation.CheckCrop(new ImageCrop(crop.X, crop.Y, crop.Width, crop.Height)) is { } badCrop)
            {
                Add(BackupIssueCodes.InvalidImage, $"The thumbnail framing of {Entry(entity)} cannot be used: {badCrop}");
            }
        }

        private void CheckRevisions(BackupEntity entity, string what)
        {
            var numbers = new HashSet<int>();

            foreach (var revision in Required(entity.Revisions, $"{what}'s saved versions"))
            {
                if (revision is null)
                {
                    Missing($"a saved version of {Entry(entity)}");
                    continue;
                }

                var label = $"Version {revision.Number} of {Entry(entity)}";

                if (!numbers.Add(revision.Number))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} has two saved versions numbered {revision.Number}.");
                }

                Defined(revision.Kind, $"{label}'s kind");
                Flags(revision.Changes, $"{label}'s changes");
                Defined(revision.CanonStatus, $"{label}'s Canon status");
                Text(revision.EntityTypeName, LoreLimits.NameMaxLength, $"{label}'s type name", required: true);
                Text(revision.Name, LoreLimits.NameMaxLength, $"{label}'s name", required: true);
                Text(revision.Summary, LoreLimits.SummaryMaxLength, $"{label}'s summary");

                // A version from before articles had their own history holds the article as it read then, and it is
                // still shown - so it has to be a document the editor may render, like any article.
                Article(revision.Content, $"{label}'s copy of the article");

                foreach (var alias in Required(revision.Aliases, $"{label}'s aliases"))
                {
                    Text(alias, LoreLimits.NameMaxLength, $"An alias in {label.ToLowerInvariant()}", required: true);
                }

                foreach (var tag in Required(revision.Tags, $"{label}'s tags"))
                {
                    Text(tag, LoreLimits.TagMaxLength, $"A tag in {label.ToLowerInvariant()}", required: true);
                }

                foreach (var value in Required(revision.FieldValues, $"{label}'s field values"))
                {
                    if (value is null)
                    {
                        Missing($"a field value in {label.ToLowerInvariant()}");
                        continue;
                    }

                    Text(value.FieldName, LoreLimits.NameMaxLength, $"A field name in {label.ToLowerInvariant()}", required: true);
                    Defined(value.Kind, $"A field kind in {label.ToLowerInvariant()}");
                    Text(value.TextValue, LoreLimits.TextValueMaxLength, $"A value in {label.ToLowerInvariant()}");
                    Text(value.OptionValue, LoreLimits.OptionMaxLength, $"An option in {label.ToLowerInvariant()}");
                    Text(value.ReferencedEntityName, LoreLimits.NameMaxLength, $"An entry name in {label.ToLowerInvariant()}");
                    Text(value.EraLabel, ChronologyLimits.NameMaxLength, $"A date period label in {label.ToLowerInvariant()}");
                }
            }
        }

        private void CheckArticleRevisions(BackupEntity entity, string what)
        {
            if (version < 9)
            {
                return;
            }

            var numbers = new HashSet<int>();

            foreach (var revision in Required(entity.ArticleRevisions, $"{what}'s saved article versions", since: 9))
            {
                if (revision is null)
                {
                    Missing($"a saved version of the article of {Entry(entity)}");
                    continue;
                }

                if (!numbers.Add(revision.Number))
                {
                    Add(BackupIssueCodes.Duplicate, $"The article of {Entry(entity)} has two saved versions numbered {revision.Number}.");
                }

                Defined(revision.Kind, $"Version {revision.Number} of the article of {Entry(entity)}");

                if (revision.Content is null)
                {
                    Missing($"the text of version {revision.Number} of the article of {Entry(entity)}");
                }
                else
                {
                    Article(revision.Content, $"Version {revision.Number} of the article of {Entry(entity)}");
                }
            }
        }

        // ---------- Relationships ----------

        private void RegisterRelationshipTypes(IReadOnlyList<BackupRelationshipType> types)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);

            foreach (var type in types)
            {
                if (type is null)
                {
                    Missing("a relation kind");
                    continue;
                }

                var what = $"The relation kind {Quote(type.Name)}";
                Register(type.Id, what);
                _relationshipTypes.Add(type.Id);

                if (Text(type.Name, RelationshipLimits.NameMaxLength, $"{what}'s name", required: true) && !names.Add(type.Name))
                {
                    Add(BackupIssueCodes.Duplicate, $"Two relation kinds are both called {Quote(type.Name)}.");
                }

                Text(type.InverseName, RelationshipLimits.NameMaxLength, $"{what}'s other reading");
                Text(type.Description, RelationshipLimits.DescriptionMaxLength, $"{what}'s description");

                if (Defined(type.AgeOrder, $"{what}'s age rule") && type.IsSymmetric && type.AgeOrder != RelationshipAgeOrder.None)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} reads the same from both sides, so it cannot name an older side.");
                }

                if (Defined(type.FamilySemantic, $"{what}'s family meaning"))
                {
                    if (version < 18 && type.FamilySemantic == RelationshipFamilySemantic.NonStructuralFamily)
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{what}'s family meaning did not exist in format version {version}.");
                    }
                    else if (type.IsSymmetric && type.FamilySemantic.IsParent())
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{what} reads the same from both sides, so it cannot name a parent side.");
                    }
                }

                if (type.MinAgeDifferenceYears is < 0 || type.MaxAgeDifferenceYears is < 0)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has a negative age gap.");
                }
                else if (type.MinAgeDifferenceYears > type.MaxAgeDifferenceYears)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what}'s smallest age gap is larger than its largest.");
                }
            }
        }

        private void CheckRelationship(BackupRelationship relationship)
        {
            if (relationship is null)
            {
                Missing("a relationship");
                return;
            }

            Register(relationship.Id, "A relationship");
            Defined(relationship.CanonStatus, "A relationship's Canon status");
            Text(relationship.Notes, RelationshipLimits.NotesMaxLength, "A relationship's notes");
            Reference(_relationshipTypes.Contains(relationship.RelationshipTypeId), "A relationship is of a relation kind the backup does not hold.");

            var source = _entities.GetValueOrDefault(relationship.SourceEntityId);
            var target = _entities.GetValueOrDefault(relationship.TargetEntityId);

            Reference(source is not null && target is not null, "A relationship connects an entry the backup does not hold.");

            if (relationship.SourceEntityId == relationship.TargetEntityId)
            {
                Add(BackupIssueCodes.InvalidValue, $"A relationship connects {(source is null ? "an entry" : Entry(source))} to itself.");
            }

            var periods = relationship.Periods ?? [];
            if (periods.Count > Relationships.RelationshipPeriods.MaxPeriods)
            {
                Add(BackupIssueCodes.InvalidValue, $"A relationship has more periods than Lorex keeps ({Relationships.RelationshipPeriods.MaxPeriods}).");
            }

            // Each period as a save allows it (Issue #18): an era of either end, or a dated span that does not end before it starts.
            foreach (var period in periods)
            {
                if (period is null)
                {
                    Missing("a period of a relationship");
                    continue;
                }

                if (period.EntityEraId is { } eraId)
                {
                    if (period.Start is not null || period.End is not null)
                    {
                        Add(BackupIssueCodes.InvalidValue, "A relationship's period is both dates and an era.");
                    }

                    Reference(
                        _eraOwner.TryGetValue(eraId, out var owner) && (owner == relationship.SourceEntityId || owner == relationship.TargetEntityId),
                        "A relationship's period names an era that is not one of its two entries'.");
                    continue;
                }

                if (period.Start is null && period.End is null)
                {
                    Add(BackupIssueCodes.InvalidValue, "A relationship's period has neither a start nor an end.");
                    continue;
                }

                if (period.Start is { } start)
                {
                    Point(start.EraId, start.Year, start.Month, start.MonthId, start.Day, "A relationship period's start");
                }

                if (period.End is { } end)
                {
                    Point(end.EraId, end.Year, end.Month, end.MonthId, end.Day, "A relationship period's end");
                }

                if (period.Start is { } from && period.End is { } to
                    && ChronologySpans.Lower(Value(from), Reckoning()) is { } lower
                    && ChronologySpans.Upper(Value(to), Reckoning()) is { } upper
                    && upper < lower)
                {
                    Add(BackupIssueCodes.InvalidValue, "A relationship's period ends before it starts.");
                }
            }
        }

        // ---------- Timeline ----------

        private void CheckTimelineEntry(BackupTimelineEntry entry)
        {
            if (entry is null)
            {
                Missing("a timeline entry");
                return;
            }

            var what = $"The moment {Quote(entry.Title)}";
            Register(entry.Id, what);
            Text(entry.Title, TimelineLimits.TitleMaxLength, $"{what}'s title", required: true);
            Text(entry.Description, TimelineLimits.DescriptionMaxLength, $"{what}'s description");
            Text(entry.EraLabel, TimelineLimits.EraLabelMaxLength, $"{what}'s year label");
            Defined(entry.CanonStatus, $"{what}'s Canon status");
            Defined(entry.DateKind, $"{what}'s kind of date");
            Point(entry.StartEraId, entry.StartYear, entry.StartMonth, entry.StartMonthId, entry.StartDay, $"{what}'s start");
            Point(entry.EndEraId, entry.EndYear, entry.EndMonth, entry.EndMonthId, entry.EndDay, $"{what}'s end");

            var participants = new HashSet<Guid>();
            foreach (var participant in Required(entry.ParticipantEntityIds, $"{what}'s participants"))
            {
                Reference(_entities.ContainsKey(participant), $"{what} names a participant the backup does not hold.");

                if (!participants.Add(participant))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} names the same participant twice.");
                }
            }

            if (entry.StoryIds is { } storyIds)
            {
                if (version < 21)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} is linked to stories, which a backup this old cannot say. It was not written by Lorex.");
                }

                var linked = new HashSet<Guid>();
                foreach (var story in storyIds)
                {
                    Reference(_stories.Contains(story), $"{what} is linked to a story the backup does not hold.");

                    if (!linked.Add(story))
                    {
                        Add(BackupIssueCodes.Duplicate, $"{what} is linked to the same story twice.");
                    }
                }
            }

            if (entry.Validation is { } details)
            {
                Term(details.EventKindTermId, ValidationTermKind.EventKind, $"{what} is described with an event kind the backup does not hold.");
                Term(details.MethodTermId, ValidationTermKind.Method, $"{what} is described with a method the backup does not hold.");

                if (details.ParticipantEntityId is { } participant)
                {
                    Reference(_entities.ContainsKey(participant), $"{what} is described with a participant the backup does not hold.");
                }
            }
        }

        // ---------- Stories ----------

        private void RegisterStories(IReadOnlyList<BackupStory> stories)
        {
            foreach (var story in stories)
            {
                if (story is null)
                {
                    Missing("a story");
                    continue;
                }

                Register(story.Id, $"The story {Quote(story.Title)}");
                _stories.Add(story.Id);

                foreach (var scene in story.Scenes ?? [])
                {
                    if (scene is not null)
                    {
                        Register(scene.Id, $"The scene {Quote(scene.Title)}");
                        _sceneStory[scene.Id] = story.Id;

                        foreach (var revision in scene.Manuscript?.Revisions ?? [])
                        {
                            if (revision is not null)
                            {
                                Register(revision.Id, $"A saved version of the manuscript of the scene {Quote(scene.Title)}");
                            }
                        }
                    }
                }

                foreach (var arc in story.PlotArcs ?? [])
                {
                    if (arc is not null)
                    {
                        Register(arc.Id, $"The arc {Quote(arc.Title)}");
                        _arcs.Add(arc.Id);

                        foreach (var beat in arc.Beats ?? [])
                        {
                            if (beat is not null)
                            {
                                Register(beat.Id, $"The beat {Quote(beat.Title)}");
                                _beats.Add(beat.Id);
                            }
                        }
                    }
                }
            }
        }

        private void CheckStory(BackupStory story)
        {
            var what = $"The story {Quote(story.Title)}";
            Text(story.Title, StoryLimits.TitleMaxLength, $"{what}'s title", required: true);
            Text(story.Premise, StoryLimits.PremiseMaxLength, $"{what}'s premise");
            Text(story.PublicSummary, PublicationLimits.SummaryMaxLength, $"{what}'s public summary");
            Defined(story.Status, $"{what}'s status");

            var chapters = new HashSet<Guid>();
            var chapterPlaces = new HashSet<int>();

            foreach (var chapter in Required(story.Chapters, $"{what}'s chapters", since: 6))
            {
                if (chapter is null)
                {
                    Missing($"a chapter of {what.ToLowerInvariant()}");
                    continue;
                }

                var chapterWhat = $"The chapter {Quote(chapter.Title)}";
                Register(chapter.Id, chapterWhat);
                chapters.Add(chapter.Id);
                Text(chapter.Title, StoryLimits.TitleMaxLength, $"{chapterWhat}'s title", required: true);
                Text(chapter.Summary, StoryLimits.ChapterSummaryMaxLength, $"{chapterWhat}'s summary");
                Text(chapter.Notes, StoryLimits.ChapterNotesMaxLength, $"{chapterWhat}'s notes");

                if (chapter.DeletedAt is null && !chapterPlaces.Add(chapter.SortOrder))
                {
                    Add(BackupIssueCodes.InvalidOrder, $"Two chapters of {Quote(story.Title)} claim the same place.");
                }
            }

            var scenePlaces = new HashSet<(Guid?, int)>();

            foreach (var scene in Required(story.Scenes, $"{what}'s scenes"))
            {
                if (scene is null)
                {
                    Missing($"a scene of {what.ToLowerInvariant()}");
                    continue;
                }

                var sceneWhat = $"The scene {Quote(scene.Title)}";
                Text(scene.Title, StoryLimits.TitleMaxLength, $"{sceneWhat}'s title", required: true);
                Text(scene.Summary, StoryLimits.SceneSummaryMaxLength, $"{sceneWhat}'s summary");
                Text(scene.Notes, StoryLimits.SceneNotesMaxLength, $"{sceneWhat}'s notes");

                if (scene.ChapterId is { } chapterId)
                {
                    Reference(chapters.Contains(chapterId), $"{sceneWhat} is in a chapter its story does not hold.");
                }

                if (scene.DeletedAt is null && !scenePlaces.Add((scene.ChapterId, scene.SortOrder)))
                {
                    Add(BackupIssueCodes.InvalidOrder, $"Two scenes of {Quote(story.Title)} claim the same place.");
                }

                if (scene.PovEntityId is { } pov)
                {
                    Reference(_entities.ContainsKey(pov), $"{sceneWhat} is told from the point of view of an entry the backup does not hold.");
                }

                if (scene.Chronology is { } chronology)
                {
                    Point(chronology.EraId, chronology.Year, chronology.Month, chronology.MonthId, chronology.Day, $"{sceneWhat}'s date");
                }

                var linked = new HashSet<Guid>();
                foreach (var entityId in Required(scene.LinkedEntityIds, $"{sceneWhat}'s lore"))
                {
                    Reference(_entities.ContainsKey(entityId), $"{sceneWhat} links an entry the backup does not hold.");

                    if (!linked.Add(entityId))
                    {
                        Add(BackupIssueCodes.Duplicate, $"{sceneWhat} links the same entry twice.");
                    }
                }

                if (scene.Manuscript is { } manuscript)
                {
                    CheckManuscript(manuscript, sceneWhat);
                }
            }

            var arcPlaces = new HashSet<int>();

            foreach (var arc in Required(story.PlotArcs, $"{what}'s plot", since: 7))
            {
                if (arc is null)
                {
                    Missing($"an arc of {what.ToLowerInvariant()}");
                    continue;
                }

                var arcWhat = $"The arc {Quote(arc.Title)}";
                Text(arc.Title, StoryLimits.TitleMaxLength, $"{arcWhat}'s title", required: true);
                Text(arc.Description, StoryLimits.PlotDescriptionMaxLength, $"{arcWhat}'s description");
                Text(arc.Notes, StoryLimits.PlotNotesMaxLength, $"{arcWhat}'s notes");

                if (arc.DeletedAt is null && !arcPlaces.Add(arc.SortOrder))
                {
                    Add(BackupIssueCodes.InvalidOrder, $"Two arcs of {Quote(story.Title)} claim the same place.");
                }

                var beatPlaces = new HashSet<int>();

                foreach (var beat in Required(arc.Beats, $"{arcWhat}'s beats"))
                {
                    if (beat is null)
                    {
                        Missing($"a beat of {arcWhat.ToLowerInvariant()}");
                        continue;
                    }

                    var beatWhat = $"The beat {Quote(beat.Title)}";
                    Text(beat.Title, StoryLimits.TitleMaxLength, $"{beatWhat}'s title", required: true);
                    Text(beat.Description, StoryLimits.PlotDescriptionMaxLength, $"{beatWhat}'s description");
                    Text(beat.Notes, StoryLimits.PlotNotesMaxLength, $"{beatWhat}'s notes");

                    if (beat.DeletedAt is null && !beatPlaces.Add(beat.SortOrder))
                    {
                        Add(BackupIssueCodes.InvalidOrder, $"Two beats of {Quote(arc.Title)} claim the same place.");
                    }

                    var scenes = new HashSet<Guid>();
                    foreach (var sceneId in Required(beat.LinkedSceneIds, $"{beatWhat}'s scenes"))
                    {
                        // A beat plays out in scenes of its own story, never another's (ADR 0026).
                        Reference(
                            _sceneStory.TryGetValue(sceneId, out var sceneStory) && sceneStory == story.Id,
                            $"{beatWhat} links a scene its story does not hold.");

                        if (!scenes.Add(sceneId))
                        {
                            Add(BackupIssueCodes.Duplicate, $"{beatWhat} links the same scene twice.");
                        }
                    }

                    var entities = new HashSet<Guid>();
                    foreach (var entityId in Required(beat.LinkedEntityIds, $"{beatWhat}'s lore"))
                    {
                        Reference(_entities.ContainsKey(entityId), $"{beatWhat} links an entry the backup does not hold.");

                        if (!entities.Add(entityId))
                        {
                            Add(BackupIssueCodes.Duplicate, $"{beatWhat} links the same entry twice.");
                        }
                    }
                }
            }
        }

        private void CheckManuscript(BackupSceneManuscript manuscript, string sceneWhat)
        {
            if (manuscript.Content is null)
            {
                Missing($"the text of the manuscript of {sceneWhat.ToLowerInvariant()}");
            }
            else
            {
                Text(manuscript.Content, StoryLimits.ManuscriptMaxLength, $"The manuscript of {sceneWhat.ToLowerInvariant()}");
            }

            var numbers = new HashSet<int>();

            foreach (var revision in Required(manuscript.Revisions, $"the saved versions of the manuscript of {sceneWhat.ToLowerInvariant()}", since: 10))
            {
                if (revision is null)
                {
                    Missing($"a saved version of the manuscript of {sceneWhat.ToLowerInvariant()}");
                    continue;
                }

                var revisionWhat = $"Version {revision.Number} of the manuscript of {sceneWhat.ToLowerInvariant()}";

                if (!numbers.Add(revision.Number))
                {
                    Add(BackupIssueCodes.Duplicate, $"The manuscript of {sceneWhat.ToLowerInvariant()} has two saved versions numbered {revision.Number}.");
                }

                Defined(revision.Kind, $"{revisionWhat}'s kind");

                if (revision.Content is null)
                {
                    Missing($"the text of {revisionWhat.ToLowerInvariant()}");
                }
                else
                {
                    Text(revision.Content, StoryLimits.ManuscriptMaxLength, revisionWhat);
                }
            }
        }

        // ---------- Ideas ----------

        private void CheckIdea(BackupIdea idea)
        {
            if (idea is null)
            {
                Missing("an idea");
                return;
            }

            var what = $"The idea {Quote(idea.Title)}";
            Register(idea.Id, what);
            Text(idea.Title, IdeaLimits.TitleMaxLength, $"{what}'s title", required: true);

            if (idea.Body is null)
            {
                Missing($"the body of {what.ToLowerInvariant()}");
            }
            else
            {
                Text(idea.Body, IdeaLimits.BodyMaxLength, $"{what}'s body");
            }

            var references = new HashSet<(IdeaReferenceKind, Guid)>();

            foreach (var reference in Required(idea.References, $"{what}'s references"))
            {
                if (reference is null)
                {
                    Missing($"a reference of {what.ToLowerInvariant()}");
                    continue;
                }

                // The kind is read as written and never inferred: an id that is an entry is still refused as a scene.
                var resolves = reference.Kind switch
                {
                    IdeaReferenceKind.Entity => _entities.ContainsKey(reference.Id),
                    IdeaReferenceKind.Story => _stories.Contains(reference.Id),
                    IdeaReferenceKind.Scene => _sceneStory.ContainsKey(reference.Id),
                    IdeaReferenceKind.PlotArc => _arcs.Contains(reference.Id),
                    IdeaReferenceKind.PlotBeat => _beats.Contains(reference.Id),
                    _ => false,
                };

                if (!Enum.IsDefined(reference.Kind))
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has a reference of a kind Lorex does not know.");
                }
                else
                {
                    Reference(resolves, $"{what} refers to something the backup does not hold.");
                }

                if (!references.Add((reference.Kind, reference.Id)))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} lists the same reference twice.");
                }
            }
        }

        // ---------- World rules ----------

        /// <summary>A rule's shape only: an id, a title, a description that is there and fits. What it says is never judged.</summary>
        private void CheckWorldRule(BackupWorldRule rule)
        {
            if (rule is null)
            {
                Missing("a world rule");
                return;
            }

            var what = $"The world rule {Quote(rule.Title)}";
            Register(rule.Id, what);
            Text(rule.Title, WorldRuleLimits.TitleMaxLength, $"{what}'s title", required: true);

            if (rule.Description is null)
            {
                Missing($"the description of {what.ToLowerInvariant()}");
            }
            else
            {
                Text(rule.Description, WorldRuleLimits.DescriptionMaxLength, $"{what}'s description");
            }

            // A check's shape only: a pattern Lorex knows, terms of the right kind in the file, a limit it can count to.
            if (rule.Validation is { } check
                && Defined(check.Kind, $"{what}'s check")
                && check.Kind != WorldRuleValidationKind.None)
            {
                Term(check.EventKindTermId, ValidationTermKind.EventKind, $"{what}'s check limits an event kind the backup does not hold.");
                Term(check.MethodTermId, ValidationTermKind.Method, $"{what}'s check limits a method the backup does not hold.");

                if (check.MaxOccurrences is < 1 or > RuleValidationLimits.MaxOccurrencesCeiling)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what}'s check has a limit that is not a whole number from 1 to {RuleValidationLimits.MaxOccurrencesCeiling:N0}.");
                }
            }
        }

        // ---------- Event kinds and methods ----------

        /// <summary>Each term's id, kind and name, and no two of one kind an author could not tell apart. Nothing a name says is judged.</summary>
        private void RegisterValidationTerms(IReadOnlyList<BackupValidationTerm> terms)
        {
            var names = new HashSet<(ValidationTermKind, string)>();

            foreach (var term in terms)
            {
                if (term is null)
                {
                    Missing("an event kind or method");
                    continue;
                }

                var what = $"The event kind or method {Quote(term.Name)}";
                Register(term.Id, what);
                var named = Text(term.Name, RuleValidationLimits.TermNameMaxLength, $"{what}'s name", required: true);

                if (!Defined(term.Kind, $"{what}'s kind"))
                {
                    continue;
                }

                _terms[term.Id] = term.Kind;

                if (named && !names.Add((term.Kind, ValidationTerm.Normalize(term.Name))))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} has the same name as another {ValidationTermEndpoints.Word(term.Kind)}.");
                }
            }
        }

        /// <summary>A reference to a term in the file, of exactly the kind named. Absent is allowed; a term of the other kind is not there.</summary>
        private void Term(Guid? termId, ValidationTermKind kind, string message)
        {
            if (termId is { } id)
            {
                Reference(_terms.TryGetValue(id, out var found) && found == kind, message);
            }
        }

        // ---------- Canon ----------

        private void CheckDismissedConflict(BackupDismissedConflict conflict)
        {
            if (conflict is null)
            {
                Missing("a dismissed Canon conflict");
                return;
            }

            Text(conflict.RuleCode, CanonIntegrityLimits.RuleCodeMaxLength, "A dismissed Canon conflict's rule", required: true);
            Defined(conflict.Severity, "A dismissed Canon conflict's severity");

            if (conflict.Fingerprint is null || !FingerprintPattern().IsMatch(conflict.Fingerprint))
            {
                Add(BackupIssueCodes.InvalidValue, "A dismissed Canon conflict does not carry a fingerprint Lorex wrote.");
            }
        }

        // ---------- Maps ----------

        /// <summary>
        /// Maps (issue #52, since version 34): each named once per universe within bounds, its picture at the place Lorex would
        /// have written it and of a kind it stores, and every pin titled, within bounds, on the map (finite fractions from 0 to
        /// 1), standing for an entry the file holds or for none, and no entry pinned twice on one map.
        /// </summary>
        private void CheckMaps(IReadOnlyList<BackupMap> maps)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);

            if (maps.Count > MapLimits.MaxMapsPerUniverse)
            {
                Add(BackupIssueCodes.InvalidValue, "The backup holds more maps than a universe keeps.");
            }

            foreach (var map in maps)
            {
                if (map is null)
                {
                    Missing("a map");
                    continue;
                }

                var what = $"The map {Quote(map.Name)}";
                Register(map.Id, what);

                if (Text(map.Name, MapLimits.NameMaxLength, $"{what}'s name", required: true) && !names.Add(map.Name.Trim()))
                {
                    Add(BackupIssueCodes.Duplicate, $"Two maps are both called {Quote(map.Name)}.");
                }

                Text(map.Description, MapLimits.DescriptionMaxLength, $"{what}'s description");

                if (map.Image is null)
                {
                    Missing($"the picture of {what}");
                }
                else
                {
                    CheckMapImage(map, what);
                }

                if (map.Calibration is { } calibration)
                {
                    CheckCalibration(map, calibration, what);
                }

                var pins = Required(map.Pins, $"{what}'s pins");
                if (pins.Count > MapLimits.MaxPinsPerMap)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has more pins than a map holds.");
                }

                var pinned = new HashSet<Guid>();
                foreach (var pin in pins)
                {
                    if (pin is null)
                    {
                        Missing($"a pin of {what}");
                        continue;
                    }

                    var label = $"The pin {Quote(pin.Title)} on {what}";
                    Register(pin.Id, label);
                    Text(pin.Title, MapLimits.NameMaxLength, $"{label}'s title", required: true);
                    Text(pin.Note, MapLimits.NoteMaxLength, $"{label}'s note");

                    if (!double.IsFinite(pin.X) || !double.IsFinite(pin.Y) || pin.X < 0 || pin.X > 1 || pin.Y < 0 || pin.Y > 1)
                    {
                        Add(BackupIssueCodes.InvalidValue, $"{label} is not on the map.");
                    }

                    if (pin.EntityId is { } entityId)
                    {
                        Reference(_entities.ContainsKey(entityId), $"{label} stands for an entry the backup does not hold.");

                        if (!pinned.Add(entityId))
                        {
                            Add(BackupIssueCodes.Duplicate, $"{what} pins the same entry twice.");
                        }
                    }
                }
            }
        }

        /// <summary>A map's scale (since version 35): two points on the picture at least a pixel apart, a distance above zero, a named unit.</summary>
        private void CheckCalibration(BackupMap map, BackupMapCalibration calibration, string what)
        {
            var points = new[] { calibration.X1, calibration.Y1, calibration.X2, calibration.Y2 };
            if (points.Any(point => !double.IsFinite(point) || point < 0 || point > 1))
            {
                Add(BackupIssueCodes.InvalidValue, $"{what}'s scale names a point off the map.");
            }
            else if (map.Image is not null
                && MapGeography.PixelDistance(calibration.X1, calibration.Y1, calibration.X2, calibration.Y2, map.Image.Width, map.Image.Height) < MapCalibrationLimits.MinPointSeparationPixels)
            {
                Add(BackupIssueCodes.InvalidValue, $"{what}'s scale names two points that are one point.");
            }

            if (!double.IsFinite(calibration.Distance) || calibration.Distance <= 0)
            {
                Add(BackupIssueCodes.InvalidValue, $"{what}'s scale has no distance above zero.");
            }

            if (Text(calibration.Unit, MapCalibrationLimits.UnitMaxLength, $"{what}'s unit of distance", required: true)
                && calibration.Unit.Any(char.IsControl))
            {
                Add(BackupIssueCodes.InvalidValue, $"{what}'s unit of distance holds control characters.");
            }
        }

        private void CheckMapImage(BackupMap map, string what)
        {
            var image = map.Image;
            if (image.ContentType is not ("image/jpeg" or "image/png" or "image/webp"))
            {
                Add(BackupIssueCodes.InvalidImage, $"{what} has a picture of a kind Lorex does not store.");
                return;
            }

            var expected = BackupArchive.MapMediaPathFor(map.Id, image.ContentType);
            if (!string.Equals(image.MediaPath, expected, StringComparison.Ordinal))
            {
                Add(BackupIssueCodes.InvalidImage, $"{what} names a picture at a place Lorex would not have put it.");
                return;
            }

            _referencedMedia.Add(expected);

            if (opened.MediaLength(expected) is not { } length)
            {
                Add(BackupIssueCodes.MissingMedia, $"The picture of {what} is missing from the archive.");
                return;
            }

            if (length != image.ByteSize || image.ByteSize <= 0 || image.ByteSize > BackupRestoreLimits.MaxMediaBytes)
            {
                Add(BackupIssueCodes.InvalidImage, $"The picture of {what} is not the size the backup says it is.");
            }

            if (image.Width <= 0 || image.Height <= 0 || image.Width > ImagePreparation.MaxSide || image.Height > ImagePreparation.MaxSide)
            {
                Add(BackupIssueCodes.InvalidImage, $"The picture of {what} has dimensions Lorex does not accept.");
            }

            Text(image.FileName, StoredImageLimits.FileNameMaxLength, $"The file name of the picture of {what}");
        }

        // ---------- The archive ----------

        /// <summary>
        /// A Lorex archive is the document and the pictures the document names. Anything else was put there by
        /// something other than Lorex, and is refused rather than silently skipped.
        /// </summary>
        private void CheckArchiveHoldsOnlyPictures()
        {
            foreach (var path in opened.MediaPaths)
            {
                if (!_referencedMedia.Contains(path))
                {
                    Add(BackupIssueCodes.UnexpectedEntry, "The archive holds a file the backup does not name. Lorex writes only backup.json and the pictures it names.");
                    return;
                }
            }
        }

        // ---------- Shared checks ----------

        private void Register(Guid id, string what)
        {
            if (id == Guid.Empty)
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} has no id.");
            }
            else if (!_ids.Add(id))
            {
                Add(BackupIssueCodes.DuplicateId, $"{what} has the same id as something else in the backup.");
            }
        }

        private IReadOnlyList<T> Required<T>(IReadOnlyList<T>? list, string what, int since = 1)
        {
            if (list is null)
            {
                if (version >= since)
                {
                    Missing(what);
                }

                return [];
            }

            return list;
        }

        private void Missing(string what) =>
            Add(BackupIssueCodes.MissingMember, $"The backup is incomplete: {what} is missing.");

        /// <summary>Text within its column's bound; when <paramref name="required"/>, present and not blank. True when it passed.</summary>
        private bool Text(string? value, int max, string what, bool required = false)
        {
            if (value is null || (required && string.IsNullOrWhiteSpace(value)))
            {
                if (required)
                {
                    Add(BackupIssueCodes.MissingMember, $"{what} is missing.");
                    return false;
                }

                return true;
            }

            if (value.Length > max)
            {
                Add(BackupIssueCodes.TooLong, $"{what} is longer than Lorex keeps ({max:N0} characters).");
                return false;
            }

            return true;
        }

        private void Article(string? content, string what)
        {
            if (!LoreContent.TryValidate(content, out var error))
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} cannot be restored: {error}");
            }
        }

        private void Accent(string? color, string what)
        {
            if (color is not null && !AccentColorPattern().IsMatch(color))
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} is not a colour like #4f6bd6.");
            }
        }

        private bool Defined<TEnum>(TEnum value, string what)
            where TEnum : struct, Enum
        {
            if (Enum.IsDefined(value))
            {
                return true;
            }

            Add(BackupIssueCodes.InvalidValue, $"{what} is not a value Lorex knows.");
            return false;
        }

        private void Flags(EntityRevisionChange changes, string what)
        {
            var known = Enum.GetValues<EntityRevisionChange>().Aggregate(EntityRevisionChange.None, (all, flag) => all | flag);

            if ((changes & ~known) != 0)
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} is not a value Lorex knows.");
            }
        }

        /// <summary>A stored date's shape: an era the file names, a year from 1 inside one, a month and a day in range.</summary>
        private void Point(Guid? eraId, int? year, int? month, Guid? monthId, int? day, string what)
        {
            if (eraId is { } era)
            {
                Reference(_eras.Contains(era), $"{what} is counted in a date period the backup does not have.");

                if (year is { } value && !ChronologyPoint.IsEraYear(value))
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} is a year inside a date period that is not counted from 1.");
                }
            }

            if (monthId is { } custom)
            {
                // Before version 22 there is no calendar, so any month id names one the backup does not have.
                if (!_monthDays.TryGetValue(custom, out var length))
                {
                    Reference(false, $"{what} is in a month the backup's calendar does not have.");
                }
                else if (day is < 1 || day > length)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has a day past the end of its month.");
                }

                if (month is not null)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} names its month twice, by number and from the calendar.");
                }
            }
            else
            {
                if (month is not null && _hasCalendar)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has a numeric month, but the universe uses a custom calendar.");
                }

                if (month is < 1 or > ChronologyLimits.SimpleMonths || day is < 1 or > ChronologyLimits.SimpleDays)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{what} has a month or a day out of range.");
                }
            }
        }

        /// <summary>
        /// An entry's forms and abilities (since version 29) held to what a save allows: named, each name once in its list,
        /// places distinct, and every era, scene, moment and form they name one of this file's - eras and forms of this entry.
        /// </summary>
        private void CheckForms(BackupEntity entity, BackupProgression progression, string what)
        {
            var eras = (progression.Eras ?? []).OfType<BackupEntityEra>().Select(era => era.Id).ToHashSet();
            var forms = (progression.Forms ?? []).OfType<BackupForm>().Select(form => form.Id).ToHashSet();
            _momentIds ??= [.. (payload.TimelineEntries ?? []).OfType<BackupTimelineEntry>().Select(moment => moment.Id)];

            void Common(string label, string? name, string? description, Guid? unlockEra, Guid? unlockScene, Guid? unlockMoment,
                IReadOnlyList<Guid>? eraIds, IReadOnlyList<Guid>? sceneIds, HashSet<string> names)
            {
                if (Text(name, ProgressionLimits.NameMaxLength, $"{label}'s name", required: true) && !names.Add(name!.Trim()))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} has two of these named {Quote(name)}.");
                }

                Text(description, ProgressionLimits.DescriptionMaxLength, $"{label}'s description");

                if (unlockEra is { } era)
                {
                    Reference(eras.Contains(era), $"{label} was first unlocked in an era its entry does not have.");
                }

                if (unlockScene is { } scene)
                {
                    Reference(_sceneStory.ContainsKey(scene), $"{label} was first unlocked in a scene the backup does not hold.");
                }

                if (unlockMoment is { } moment)
                {
                    Reference(_momentIds.Contains(moment), $"{label} was first unlocked at a moment the backup does not hold.");
                }

                foreach (var available in Required(eraIds, $"{label}'s eras"))
                {
                    Reference(eras.Contains(available), $"{label} is available in an era its entry does not have.");
                }

                foreach (var used in Required(sceneIds, $"{label}'s scenes"))
                {
                    Reference(_sceneStory.ContainsKey(used), $"{label} is used in a scene the backup does not hold.");
                }
            }

            var formNames = new HashSet<string>(StringComparer.CurrentCultureIgnoreCase);
            var formPlaces = new HashSet<int>();
            foreach (var form in progression.Forms ?? [])
            {
                if (form is null)
                {
                    Missing($"a form of {Entry(entity)}");
                    continue;
                }

                if (form.SortOrder < 0 || !formPlaces.Add(form.SortOrder))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} has two forms in one place, or one in no place.");
                }

                Common($"The form {Quote(form.Name)} of {Entry(entity)}", form.Name, form.Description, form.UnlockEraId, form.UnlockSceneId,
                    form.UnlockMomentId, form.EraIds, form.SceneIds, formNames);
            }

            var abilityNames = new HashSet<string>(StringComparer.CurrentCultureIgnoreCase);
            var abilityPlaces = new HashSet<int>();
            foreach (var ability in progression.Abilities ?? [])
            {
                if (ability is null)
                {
                    Missing($"an ability of {Entry(entity)}");
                    continue;
                }

                if (ability.SortOrder < 0 || !abilityPlaces.Add(ability.SortOrder))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} has two abilities in one place, or one in no place.");
                }

                var label = $"The ability {Quote(ability.Name)} of {Entry(entity)}";
                Common(label, ability.Name, ability.Description, ability.UnlockEraId, ability.UnlockSceneId, ability.UnlockMomentId,
                    ability.EraIds, ability.SceneIds, abilityNames);

                foreach (var form in Required(ability.FormIds, $"{label}'s forms"))
                {
                    Reference(forms.Contains(form), $"{label} belongs to a form its entry does not have.");
                }
            }

            if ((progression.Forms?.Count ?? 0) > ProgressionLimits.MaxForms || (progression.Abilities?.Count ?? 0) > ProgressionLimits.MaxAbilities)
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} has more forms or abilities than Lorex keeps.");
            }
        }

        /// <summary>
        /// An entry's appearances (since version 30) held to what a save allows - labelled, each label once, eras and forms of
        /// this entry, scenes of this file - and each picture to what an upload allows, at exactly the path Lorex would write.
        /// </summary>
        private void CheckAppearances(BackupEntity entity, BackupProgression progression, string what)
        {
            var eras = (progression.Eras ?? []).OfType<BackupEntityEra>().Select(era => era.Id).ToHashSet();
            var forms = (progression.Forms ?? []).OfType<BackupForm>().Select(form => form.Id).ToHashSet();
            var labels = new HashSet<string>(StringComparer.CurrentCultureIgnoreCase);

            foreach (var appearance in progression.Appearances ?? [])
            {
                if (appearance is null)
                {
                    Missing($"an appearance of {Entry(entity)}");
                    continue;
                }

                var label = $"The appearance {Quote(appearance.Label)} of {Entry(entity)}";
                if (Text(appearance.Label, ProgressionLimits.NameMaxLength, $"{label}'s label", required: true) && !labels.Add(appearance.Label!.Trim()))
                {
                    Add(BackupIssueCodes.Duplicate, $"{what} has two appearances labelled {Quote(appearance.Label)}.");
                }

                Text(appearance.Notes, ProgressionLimits.DescriptionMaxLength, $"{label}'s notes");

                foreach (var era in Required(appearance.EraIds, $"{label}'s eras"))
                {
                    Reference(eras.Contains(era), $"{label} belongs to an era its entry does not have.");
                }

                foreach (var form in Required(appearance.FormIds, $"{label}'s forms"))
                {
                    Reference(forms.Contains(form), $"{label} is a look of a form its entry does not have.");
                }

                foreach (var scene in Required(appearance.SceneIds, $"{label}'s scenes"))
                {
                    Reference(_sceneStory.ContainsKey(scene), $"{label} is seen in a scene the backup does not hold.");
                }

                var images = Required(appearance.Images, $"{label}'s pictures").ToList();
                if (images.Count > ProgressionLimits.MaxImagesPerAppearance)
                {
                    Add(BackupIssueCodes.InvalidValue, $"{label} holds more pictures than Lorex keeps.");
                }

                foreach (var image in images)
                {
                    if (image is null)
                    {
                        Missing($"a picture of {label}");
                        continue;
                    }

                    CheckAppearanceImage(entity, image, label);
                }
            }

            if ((progression.Appearances?.Count ?? 0) > ProgressionLimits.MaxAppearances)
            {
                Add(BackupIssueCodes.InvalidValue, $"{what} has more appearances than Lorex keeps.");
            }
        }

        private void CheckAppearanceImage(BackupEntity entity, BackupAppearanceImage image, string label)
        {
            if (image.ContentType is not ("image/jpeg" or "image/png" or "image/webp"))
            {
                Add(BackupIssueCodes.InvalidImage, $"{label} has a picture of a kind Lorex does not store.");
                return;
            }

            var expected = BackupArchive.AppearanceMediaPathFor(entity.Id, image.Id, image.ContentType);
            if (!string.Equals(image.MediaPath, expected, StringComparison.Ordinal))
            {
                Add(BackupIssueCodes.InvalidImage, $"{label} names a picture at a place Lorex would not have put it.");
                return;
            }

            _referencedMedia.Add(expected);

            if (opened.MediaLength(expected) is not { } length)
            {
                Add(BackupIssueCodes.MissingMedia, $"A picture of {label} is missing from the archive.");
                return;
            }

            if (length != image.ByteSize || image.ByteSize <= 0 || image.ByteSize > BackupRestoreLimits.MaxMediaBytes)
            {
                Add(BackupIssueCodes.InvalidImage, $"A picture of {label} is not the size the backup says it is.");
            }

            if (image.Width <= 0 || image.Height <= 0 || image.Width > ImagePreparation.MaxSide || image.Height > ImagePreparation.MaxSide)
            {
                Add(BackupIssueCodes.InvalidImage, $"A picture of {label} has dimensions Lorex does not accept.");
            }

            Text(image.FileName, StoredImageLimits.FileNameMaxLength, $"The file name of a picture of {label}");
        }

        private static ChronologyValue Value(BackupChronologyValue point) =>
            new(point.EraId, point.Year, point.Month, point.Day, point.MonthId);

        /// <summary>The file's own reckoning - its date periods and calendar - built once, the first time a span needs it.</summary>
        private UniverseChronology Reckoning() =>
            _reckoning ??= UniverseChronology.Of(
                (payload.ChronologyEras ?? []).OfType<BackupChronologyEra>().Select(era => new ChronologyEra
                {
                    Id = era.Id,
                    Name = era.Name ?? string.Empty,
                    SortOrder = era.SortOrder,
                    Direction = era.Direction,
                    LabelPosition = era.LabelPosition,
                }),
                payload.ChronologyCalendar?.Months?.OfType<BackupChronologyCalendarMonth>().Select(month => new ChronologyCalendarMonth
                {
                    Id = month.Id,
                    Name = month.Name ?? string.Empty,
                    SortOrder = month.SortOrder,
                    DayCount = month.DayCount,
                }));

        private void Reference(bool resolves, string message)
        {
            if (!resolves)
            {
                Add(BackupIssueCodes.MissingReference, message);
            }
        }

        private void Add(string code, string message) => issues.Add(code, message);
    }
}
