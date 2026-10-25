using System.Collections.Concurrent;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Knowledge;
using Lorex.Api.Features.WorldRules;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Progression;
using Lorex.Api.Features.Storage;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Restore;

/// <summary>
/// Every id in a backup, and the new id it becomes in the restored universe. See ADR 0032.
///
/// A restore never reuses a source id. The same backup restored twice, restored into the account that
/// exported it while the original still exists, or restored from another installation, must never
/// meet a row that is already there - and a new universe must not share an identity with the one it
/// was copied from. So every object the file holds is given a fresh id before anything is written,
/// and every reference is rewritten through this one map.
///
/// <see cref="Map"/> is for references validation proved resolve inside the file; a miss is a bug.
/// <see cref="Translate"/> is for ids a stored version merely recorded (ADR 0013) - a field since
/// deleted, say. Each such id is still given a fresh id of its own, the same one every time it
/// appears, so history stays internally consistent and can never name an object outside the restored
/// universe.
/// </summary>
internal sealed class RestoreIdentity
{
    private readonly Dictionary<Guid, Guid> _restored = [];
    private readonly Dictionary<Guid, Guid> _source = [];

    public RestoreIdentity(UniverseBackupPayload payload)
    {
        foreach (var id in KnownIds(payload))
        {
            Allocate(id);
        }
    }

    public Guid Map(Guid source) => _restored[source];

    public Guid? Map(Guid? source) => source is { } id ? Map(id) : null;

    /// <summary>The new id of something the backup holds, or null for an id it does not (a manuscript mention's, ADR 0058).</summary>
    public Guid? Known(Guid source) => _restored.TryGetValue(source, out var restored) ? restored : null;

    public Guid Translate(Guid source) => _restored.TryGetValue(source, out var restored) ? restored : Allocate(source);

    public Guid? Translate(Guid? source) => source is { } id ? Translate(id) : null;

    /// <summary>The id a restored object had in the backup - for re-deriving what the backup identified by it.</summary>
    public Guid Source(Guid restored) => _source.TryGetValue(restored, out var source) ? source : restored;

    private Guid Allocate(Guid source)
    {
        var restored = Guid.NewGuid();
        _restored[source] = restored;
        _source[restored] = source;
        return restored;
    }

    private static IEnumerable<Guid> KnownIds(UniverseBackupPayload payload)
    {
        foreach (var era in payload.ChronologyEras!)
        {
            yield return era.Id;
        }

        if (payload.ChronologyCalendar is { } calendar)
        {
            yield return calendar.Id;

            foreach (var month in calendar.Months)
            {
                yield return month.Id;
            }
        }

        foreach (var type in payload.EntityTypes)
        {
            yield return type.Id;

            foreach (var section in type.FieldSections ?? [])
            {
                yield return section.Id;
            }

            foreach (var field in type.Fields)
            {
                yield return field.Id;

                foreach (var option in field.Options)
                {
                    yield return option.Id;
                }
            }
        }

        foreach (var group in payload.EntityTypeGroups ?? [])
        {
            yield return group.Id;
        }

        foreach (var record in payload.KnowledgeRecords ?? [])
        {
            yield return record.Id;
        }

        foreach (var tag in payload.Tags)
        {
            yield return tag.Id;
        }

        foreach (var entity in payload.Entities)
        {
            yield return entity.Id;

            foreach (var revision in entity.Revisions)
            {
                yield return revision.Id;
            }

            foreach (var revision in entity.ArticleRevisions!)
            {
                yield return revision.Id;
            }

            foreach (var era in entity.Progression?.Eras ?? [])
            {
                yield return era.Id;
            }

            foreach (var revision in entity.Progression?.Revisions ?? [])
            {
                yield return revision.Id;
            }

            foreach (var form in entity.Progression?.Forms ?? [])
            {
                yield return form.Id;
            }

            foreach (var ability in entity.Progression?.Abilities ?? [])
            {
                yield return ability.Id;
            }

            foreach (var appearance in entity.Progression?.Appearances ?? [])
            {
                yield return appearance.Id;
            }
        }

        foreach (var type in payload.RelationshipTypes)
        {
            yield return type.Id;
        }

        foreach (var relationship in payload.Relationships)
        {
            yield return relationship.Id;
        }

        foreach (var entry in payload.TimelineEntries)
        {
            yield return entry.Id;
        }

        foreach (var story in payload.Stories!)
        {
            yield return story.Id;

            foreach (var chapter in story.Chapters!)
            {
                yield return chapter.Id;
            }

            foreach (var scene in story.Scenes)
            {
                yield return scene.Id;

                foreach (var revision in scene.Manuscript?.Revisions ?? [])
                {
                    yield return revision.Id;
                }
            }

            foreach (var arc in story.PlotArcs!)
            {
                yield return arc.Id;

                foreach (var beat in arc.Beats)
                {
                    yield return beat.Id;
                }
            }
        }

        foreach (var idea in payload.Ideas!)
        {
            yield return idea.Id;
        }

        foreach (var rule in payload.WorldRules!)
        {
            yield return rule.Id;
        }

        foreach (var term in payload.ValidationTerms!)
        {
            yield return term.Id;
        }
    }
}

/// <summary>The account already has a universe by the name chosen for the restore. Nothing was kept.</summary>
internal sealed class RestoreNameTakenException() : Exception("The account already has a universe with that name.");

/// <summary>
/// Writes a validated backup as a new universe owned by the restoring account. See ADR 0032.
///
/// <para><b>Not a replay.</b> Nothing goes through the endpoints a person uses. Those would record a
/// version for every entry written, run the Canon gate on every write, close and reopen order gaps and
/// reindex search row by row - a fabricated history of an importer typing the world back in. This
/// writes the rows the backup describes, with the history the backup holds, once.</para>
///
/// <para><b>Media first, then the database, then nothing.</b> R2 and SQLite share no transaction, so the
/// order is the one ADR 0019 uses for an upload. Every picture is written under keys built from the new
/// universe's id, which nothing else can be using. Only when all of them are stored does one database
/// transaction write every row, index the lore, reconcile Canon and commit. A failure anywhere before
/// the commit rolls the database back and sweeps every key this restore tried to write - never another
/// key, so no existing picture can be touched. What cannot happen is a committed universe naming a
/// picture that is not there. A process that dies between the pictures and the commit leaves unreferenced
/// objects under a universe id that never existed; that is the same trade ADR 0019 already accepts.</para>
///
/// <para><b>Derived data is derived again.</b> Thumbnails are cut from the originals. The lore search
/// index is written from the restored entries; the story, manuscript, idea and world rule indexes are filled by their
/// triggers as the rows land (ADR 0031). Canon conflicts are evaluated afresh, and each dismissal the
/// backup recorded is re-applied to the finding it identified.</para>
/// </summary>
internal sealed partial class UniverseRestore(
    LorexDbContext db,
    IMediaObjectStore store,
    CanonIntegrityEvaluator evaluator,
    TimeProvider clock,
    ILogger logger)
{
    public async Task<Universe> RestoreAsync(
        RestorableBackup backup,
        OpenedBackup opened,
        string ownerId,
        string name,
        StorageHold? hold,
        CancellationToken cancellationToken)
    {
        var ids = new RestoreIdentity(backup.Payload);
        var universeId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var attempted = new ConcurrentQueue<string>();

        try
        {
            var images = await StoreImagesAsync(backup, opened, ids, universeId, now, attempted, cancellationToken);
            await StoreAppearanceImagesAsync(backup, opened, ids, universeId, now, attempted, cancellationToken);
            var artwork = await StoreArtworkAsync(backup, opened, universeId, now, attempted, cancellationToken);
            return await WriteAsync(backup.Payload, ids, universeId, ownerId, name, now, images, artwork, hold, cancellationToken);
        }
        catch
        {
            // Nothing references these: the transaction never committed. A key that was never written deletes as nothing.
            if (!attempted.IsEmpty)
            {
                await MediaObjectWrites.SweepAsync(store, logger, LogOrphanedObject, [.. attempted]);
            }

            throw;
        }
    }

    // ---------- Pictures ----------

    /// <summary>Appearance pictures written before the transaction, added by <see cref="AddProgression"/> with their looks.</summary>
    private readonly List<EntityAppearanceImage> _appearanceImages = [];

    /// <summary>
    /// Every appearance picture (Issue #43) under the new universe's keys: the original from the archive and the centred square
    /// validation already cut. One at a time - galleries are small and this keeps the failure path the artwork's.
    /// </summary>
    private async Task StoreAppearanceImagesAsync(
        RestorableBackup backup,
        OpenedBackup opened,
        RestoreIdentity ids,
        Guid universeId,
        DateTime now,
        ConcurrentQueue<string> attempted,
        CancellationToken cancellationToken)
    {
        foreach (var entity in backup.Payload.Entities)
        {
            foreach (var appearance in entity.Progression?.Appearances ?? [])
            {
                for (var index = 0; index < appearance.Images.Count; index++)
                {
                    var image = appearance.Images[index];
                    var validated = backup.AppearanceImages![image.Id];
                    var original = await opened.ReadMediaAsync(validated.MediaPath, cancellationToken);

                    var entityId = ids.Map(entity.Id);
                    var appearanceId = ids.Map(appearance.Id);
                    var imageId = Guid.NewGuid();
                    var originalKey = AppearanceImageKeys.Original(universeId, entityId, appearanceId, imageId, validated.Extension);
                    var thumbnailKey = AppearanceImageKeys.Thumbnail(universeId, entityId, appearanceId, imageId);

                    attempted.Enqueue(originalKey);
                    attempted.Enqueue(thumbnailKey);

                    using var originalBytes = new MemoryStream(original, writable: false);
                    using var thumbnailBytes = new MemoryStream(validated.Thumbnail, writable: false);
                    await MediaObjectWrites.PutAllAsync(
                        store,
                        cancellationToken,
                        new PendingMediaObject(originalKey, originalBytes, validated.ContentType),
                        new PendingMediaObject(thumbnailKey, thumbnailBytes, "image/webp"));

                    _appearanceImages.Add(new EntityAppearanceImage
                    {
                        Id = imageId,
                        EntityAppearanceId = appearanceId,
                        SortOrder = index,
                        OriginalKey = originalKey,
                        ThumbnailKey = thumbnailKey,
                        ContentType = validated.ContentType,
                        FileName = FileNameLabel(image.FileName),
                        Width = validated.Width,
                        Height = validated.Height,
                        ByteSize = validated.ByteSize,
                        UploadedAt = now,
                    });
                }
            }
        }
    }

    private async Task<Dictionary<Guid, EntityImage>> StoreImagesAsync(
        RestorableBackup backup,
        OpenedBackup opened,
        RestoreIdentity ids,
        Guid universeId,
        DateTime now,
        ConcurrentQueue<string> attempted,
        CancellationToken cancellationToken)
    {
        var rows = new ConcurrentDictionary<Guid, EntityImage>();
        var withImages = backup.Payload.Entities.Where(entity => entity.Image is not null).ToList();

        if (withImages.Count == 0)
        {
            return [];
        }

        using var failed = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        using var gate = new SemaphoreSlim(BackupRestoreLimits.ImageConcurrency);

        var writes = withImages.Select(async entity =>
        {
            await gate.WaitAsync(failed.Token);
            try
            {
                var image = entity.Image!;
                var validated = backup.Images[entity.Id];
                var original = await opened.ReadMediaAsync(validated.MediaPath, failed.Token);

                var entityId = ids.Map(entity.Id);
                var assetId = Guid.NewGuid();
                var thumbnailId = Guid.NewGuid();
                var originalKey = EntityImageKeys.Original(universeId, entityId, assetId, validated.Extension);
                var thumbnailKey = EntityImageKeys.Thumbnail(universeId, entityId, assetId, thumbnailId);

                attempted.Enqueue(originalKey);
                attempted.Enqueue(thumbnailKey);

                using var originalBytes = new MemoryStream(original, writable: false);
                using var thumbnailBytes = new MemoryStream(validated.Thumbnail, writable: false);

                await MediaObjectWrites.PutAllAsync(
                    store,
                    failed.Token,
                    new PendingMediaObject(originalKey, originalBytes, validated.ContentType),
                    new PendingMediaObject(thumbnailKey, thumbnailBytes, "image/webp"));

                rows[entity.Id] = new EntityImage
                {
                    EntityId = entityId,
                    AssetId = assetId,
                    OriginalKey = originalKey,
                    ThumbnailId = thumbnailId,
                    ThumbnailKey = thumbnailKey,

                    // The framing the author chose, exactly as the backup recorded it; null stays null and still means
                    // the centred square the thumbnail was just cut as.
                    CropX = image.Crop?.X,
                    CropY = image.Crop?.Y,
                    CropWidth = image.Crop?.Width,
                    CropHeight = image.Crop?.Height,
                    ContentType = validated.ContentType,
                    FileName = FileNameLabel(image.FileName),
                    Width = validated.Width,
                    Height = validated.Height,
                    ByteSize = validated.ByteSize,

                    // Not in the format: this is when the picture arrived in this installation.
                    UploadedAt = now,
                };
            }
            catch
            {
                await failed.CancelAsync();
                throw;
            }
            finally
            {
                gate.Release();
            }
        }).ToArray();

        try
        {
            await Task.WhenAll(writes);
        }
        catch
        {
            // Report what actually went wrong, not the cancellation it caused in the writes still queued behind it.
            var cause = writes
                .Where(write => write.IsFaulted)
                .Select(write => write.Exception!.InnerExceptions[0])
                .FirstOrDefault(exception => exception is not OperationCanceledException);

            if (cause is not null)
            {
                System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw(cause);
            }

            throw;
        }

        return new Dictionary<Guid, EntityImage>(rows);
    }

    /// <summary>
    /// The universe's artwork under the new universe's keys: the original from the archive and the card
    /// validation already cut from it with the recorded frame. Written with the entries' pictures, before
    /// the transaction, and swept with them if anything after fails.
    /// </summary>
    private async Task<UniverseArtwork?> StoreArtworkAsync(
        RestorableBackup backup,
        OpenedBackup opened,
        Guid universeId,
        DateTime now,
        ConcurrentQueue<string> attempted,
        CancellationToken cancellationToken)
    {
        if (backup.Artwork is not { } validated || backup.Payload.Universe.Artwork is not { } artwork)
        {
            return null;
        }

        var original = await opened.ReadMediaAsync(validated.MediaPath, cancellationToken);

        var assetId = Guid.NewGuid();
        var cardId = Guid.NewGuid();
        var originalKey = UniverseArtworkKeys.Original(universeId, assetId, validated.Extension);
        var cardKey = UniverseArtworkKeys.Card(universeId, assetId, cardId);

        attempted.Enqueue(originalKey);
        attempted.Enqueue(cardKey);

        using var originalBytes = new MemoryStream(original, writable: false);
        using var cardBytes = new MemoryStream(validated.Thumbnail, writable: false);

        await MediaObjectWrites.PutAllAsync(
            store,
            cancellationToken,
            new PendingMediaObject(originalKey, originalBytes, validated.ContentType),
            new PendingMediaObject(cardKey, cardBytes, "image/webp"));

        return new UniverseArtwork
        {
            UniverseId = universeId,
            AssetId = assetId,
            OriginalKey = originalKey,
            CardId = cardId,
            CardKey = cardKey,
            CropX = artwork.Crop.X,
            CropY = artwork.Crop.Y,
            CropWidth = artwork.Crop.Width,
            CropHeight = artwork.Crop.Height,
            ContentType = validated.ContentType,
            FileName = FileNameLabel(artwork.FileName),
            Width = validated.Width,
            Height = validated.Height,
            ByteSize = validated.ByteSize,
            UploadedAt = now,
        };
    }

    private static string? FileNameLabel(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return null;
        }

        var label = Path.GetFileName(fileName.Trim());
        return label.Length == 0 ? null : label[..Math.Min(label.Length, StoredImageLimits.FileNameMaxLength)];
    }

    // ---------- The database ----------

    /// <summary>
    /// Puts each restored type beneath its restored parent - through the same map as every other internal reference, so the
    /// copy is a tree of its own. A second write in the restore's transaction: the database checks a parent exists as a row
    /// is written, and one save does not promise to write parents first, so the parents are set once every type is there.
    /// </summary>
    private async Task NestTypesAsync(UniverseBackupPayload payload, RestoreIdentity ids, CancellationToken cancellationToken)
    {
        var nested = payload.EntityTypes.Where(type => type.ParentId is not null).ToList();
        if (nested.Count == 0)
        {
            return;
        }

        var restored = db.EntityTypes.Local.ToDictionary(type => type.Id);
        foreach (var type in nested)
        {
            restored[ids.Map(type.Id)].ParentId = ids.Map(type.ParentId);
        }

        db.ChangeTracker.DetectChanges();
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Puts each restored field in its restored section (Issue #26), through the same map as every other internal reference. A
    /// second write in the restore's transaction, as for nested types: a trigger checks the section exists as the field is
    /// written, and one save does not promise to write sections first. Validation proved each is of the field's own type.
    /// </summary>
    private async Task SectionFieldsAsync(UniverseBackupPayload payload, RestoreIdentity ids, CancellationToken cancellationToken)
    {
        var placed = payload.EntityTypes.SelectMany(type => type.Fields).Where(field => field.SectionId is not null).ToList();
        if (placed.Count == 0)
        {
            return;
        }

        var restored = db.EntityFieldDefinitions.Local.ToDictionary(field => field.Id);
        foreach (var field in placed)
        {
            restored[ids.Map(field.Id)].SectionId = ids.Map(field.SectionId);
        }

        db.ChangeTracker.DetectChanges();
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<Universe> WriteAsync(
        UniverseBackupPayload payload,
        RestoreIdentity ids,
        Guid universeId,
        string ownerId,
        string name,
        DateTime now,
        Dictionary<Guid, EntityImage> images,
        UniverseArtwork? artwork,
        StorageHold? hold,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // The pictures' room becomes stored bytes in this commit or not at all - and first, before any row of the new
        // universe counts, so a hold that lapsed is checked against storage as it stands (ADR 0042).
        await AccountStorage.ConsumeAsync(db, clock, hold, cancellationToken);

        if (await db.Universes.AnyAsync(universe => universe.OwnerId == ownerId && universe.Name == name, cancellationToken))
        {
            throw new RestoreNameTakenException();
        }

        var source = payload.Universe;
        var universe = new Universe
        {
            Id = universeId,
            OwnerId = ownerId,
            Name = name,
            Description = source.Description,
            AccentColor = source.AccentColor?.ToLowerInvariant(),
            IsArchived = source.IsArchived,

            // The universe is new in this account; everything inside it keeps the moments the backup recorded.
            CreatedAt = now,
            UpdatedAt = now,

            // Its public details as authored - and private, with no address and no publication date, whatever the
            // universe it was backed up from was. The format cannot say otherwise, and publishing is its new owner's
            // explicit act (ADR 0036).
            PublicSummary = string.IsNullOrWhiteSpace(source.PublicSummary) ? null : source.PublicSummary,
            Category = source.Category,
            Genres = (source.Genres ?? []).Aggregate(UniverseGenres.None, (all, genre) => all | genre),
            OriginalCreator = string.IsNullOrWhiteSpace(source.OriginalCreator) ? null : source.OriginalCreator,
            OriginalWork = string.IsNullOrWhiteSpace(source.OriginalCreator) || string.IsNullOrWhiteSpace(source.OriginalWork) ? null : source.OriginalWork,
        };

        var detectChanges = db.ChangeTracker.AutoDetectChangesEnabled;
        db.ChangeTracker.AutoDetectChangesEnabled = false;

        try
        {
            db.Universes.Add(universe);

            if (artwork is not null)
            {
                db.UniverseArtworks.Add(artwork);
            }

            AddLore(payload, ids, universeId, images);
            AddStories(payload, ids, universeId);
            AddIdeas(payload, ids, universeId, ownerId);
            AddWorldRules(payload, ids, universeId);
            AddRuleValidation(payload, ids, universeId);

            await db.SaveChangesAsync(cancellationToken);
            await NestTypesAsync(payload, ids, cancellationToken);
            await SectionFieldsAsync(payload, ids, cancellationToken);
        }
        catch (DbUpdateException)
        {
            // The unique index settles a universe of the same name created a moment ago; anything else is a real failure.
            db.ChangeTracker.Clear();
            await transaction.RollbackAsync(cancellationToken);

            if (await db.Universes.AnyAsync(candidate => candidate.OwnerId == ownerId && candidate.Name == name, cancellationToken))
            {
                throw new RestoreNameTakenException();
            }

            throw;
        }
        finally
        {
            // Thousands of rows need not stay tracked for what follows, which reads through queries of its own.
            db.ChangeTracker.Clear();
            db.ChangeTracker.AutoDetectChangesEnabled = detectChanges;
        }

        foreach (var entity in payload.Entities)
        {
            await EntitySearchIndex.ReindexAsync(db, ids.Map(entity.Id), cancellationToken);
        }

        await ReconcileCanonAsync(payload, ids, universeId, cancellationToken);

        await transaction.CommitAsync(cancellationToken);

        return universe;
    }

    private void AddLore(UniverseBackupPayload payload, RestoreIdentity ids, Guid universeId, Dictionary<Guid, EntityImage> images)
    {
        foreach (var era in payload.ChronologyEras!)
        {
            db.ChronologyEras.Add(new ChronologyEra
            {
                Id = ids.Map(era.Id),
                UniverseId = universeId,
                Name = era.Name,
                Abbreviation = era.Abbreviation,
                SortOrder = era.SortOrder,
                Direction = era.Direction,
                LabelPosition = era.LabelPosition,
            });
        }

        // The calendar and every month under new ids; each date below points at its month's new id.
        if (payload.ChronologyCalendar is { } calendar)
        {
            var calendarId = ids.Map(calendar.Id);
            db.ChronologyCalendars.Add(new ChronologyCalendar { Id = calendarId, UniverseId = universeId });

            foreach (var month in calendar.Months)
            {
                db.ChronologyCalendarMonths.Add(new ChronologyCalendarMonth
                {
                    Id = ids.Map(month.Id),
                    CalendarId = calendarId,
                    Name = month.Name,
                    Abbreviation = month.Abbreviation,
                    SortOrder = month.SortOrder,
                    DayCount = month.DayCount,
                });
            }
        }

        // Groups and their memberships under new ids; EF writes each after the rows it points at.
        foreach (var group in payload.EntityTypeGroups ?? [])
        {
            db.EntityTypeGroups.Add(new EntityTypeGroup
            {
                Id = ids.Map(group.Id),
                UniverseId = universeId,
                Name = group.Name,
                FamilyTreeEnabled = group.FamilyTreeEnabled,
                CreatedAt = group.CreatedAt,
                UpdatedAt = group.UpdatedAt,
            });

            foreach (var typeId in group.TypeIds)
            {
                db.EntityTypeGroupMembers.Add(new EntityTypeGroupMember { EntityTypeGroupId = ids.Map(group.Id), EntityTypeId = ids.Map(typeId) });
            }
        }

        // Knowledge records (ADR 0057) under new ids, pointing at the restored entries and scenes.
        foreach (var record in payload.KnowledgeRecords ?? [])
        {
            db.KnowledgeRecords.Add(new KnowledgeRecord
            {
                Id = ids.Map(record.Id),
                UniverseId = universeId,
                KnowerEntityId = ids.Map(record.KnowerEntityId),
                SubjectEntityId = ids.Map(record.SubjectEntityId),
                Statement = record.Statement,
                SceneId = ids.Map(record.SceneId),
                KnownFromStart = record.KnownFromStart,
                CreatedAt = record.CreatedAt,
                UpdatedAt = record.UpdatedAt,
            });
        }

        foreach (var type in payload.EntityTypes)
        {
            db.EntityTypes.Add(new EntityType
            {
                Id = ids.Map(type.Id),
                UniverseId = universeId,
                Name = type.Name,
                Description = type.Description,
                Icon = type.Icon,
                AccentColor = type.AccentColor?.ToLowerInvariant(),
                FamilyTreeEligible = type.FamilyTreeEligible,

                // Written as a root; NestTypesAsync gives it its parent once every type exists.
                DisplayOrder = type.DisplayOrder,
                CreatedAt = type.CreatedAt,
                UpdatedAt = type.UpdatedAt,
            });

            // Its fields' sections (version 31), in their order; SectionFieldsAsync puts the fields in them once they exist.
            foreach (var section in type.FieldSections ?? [])
            {
                db.EntityFieldSections.Add(new EntityFieldSection
                {
                    Id = ids.Map(section.Id),
                    EntityTypeId = ids.Map(type.Id),
                    Name = section.Name,
                    DisplayOrder = section.DisplayOrder,
                    StartsCollapsed = section.StartsCollapsed,
                });
            }

            foreach (var field in type.Fields)
            {
                db.EntityFieldDefinitions.Add(new EntityFieldDefinition
                {
                    Id = ids.Map(field.Id),
                    EntityTypeId = ids.Map(type.Id),
                    Name = field.Name,
                    Kind = field.Kind,
                    Semantic = field.Semantic,
                    IsRequired = field.IsRequired,
                    DisplayOrder = field.DisplayOrder,
                    DefaultValue = field.DefaultValue,

                    // The type it was limited to, as that type's restored id: validation proved it is a type of this file.
                    TargetEntityTypeId = ids.Map(field.TargetEntityTypeId),

                    // The group it was limited to, as that group's restored id: validation proved it is a group of this file.
                    TargetGroupId = ids.Map(field.TargetGroupId),

                    // Archived stays archived, with every value below it (Issue #39); null in a file before version 25.
                    ArchivedAt = field.ArchivedAt,
                });

                foreach (var option in field.Options)
                {
                    db.EntityFieldOptions.Add(new EntityFieldOption
                    {
                        Id = ids.Map(option.Id),
                        FieldDefinitionId = ids.Map(field.Id),
                        Value = option.Value,
                        DisplayOrder = option.DisplayOrder,
                    });
                }
            }
        }

        foreach (var tag in payload.Tags)
        {
            db.Tags.Add(new Tag
            {
                Id = ids.Map(tag.Id),
                UniverseId = universeId,
                Name = tag.Name,
                Slug = tag.Name.ToLowerInvariant(),
            });
        }

        foreach (var entity in payload.Entities)
        {
            AddEntity(entity, ids, universeId, images);
        }

        foreach (var type in payload.RelationshipTypes)
        {
            db.RelationshipTypes.Add(new RelationshipType
            {
                Id = ids.Map(type.Id),
                UniverseId = universeId,
                Name = type.Name,
                InverseName = type.InverseName,
                IsSymmetric = type.IsSymmetric,
                Description = type.Description,
                DisplayOrder = type.DisplayOrder,
                AgeOrder = type.AgeOrder,
                MinAgeDifferenceYears = type.MinAgeDifferenceYears,
                MaxAgeDifferenceYears = type.MaxAgeDifferenceYears,
                FamilySemantic = type.FamilySemantic,
                CreatedAt = type.CreatedAt,
                UpdatedAt = type.UpdatedAt,
            });
        }

        foreach (var relationship in payload.Relationships)
        {
            db.Relationships.Add(new LoreRelationship
            {
                Id = ids.Map(relationship.Id),
                UniverseId = universeId,
                RelationshipTypeId = ids.Map(relationship.RelationshipTypeId),
                SourceEntityId = ids.Map(relationship.SourceEntityId),
                TargetEntityId = ids.Map(relationship.TargetEntityId),
                CanonStatus = relationship.CanonStatus,
                StartDate = relationship.StartDate,
                EndDate = relationship.EndDate,
                Notes = relationship.Notes,
                CreatedAt = relationship.CreatedAt,
                UpdatedAt = relationship.UpdatedAt,
                DeletedAt = relationship.DeletedAt,
            });

            // When it holds (Issue #18), each era by its restored id.
            var order = 0;
            foreach (var period in relationship.Periods ?? [])
            {
                db.RelationshipPeriods.Add(new RelationshipPeriod
                {
                    Id = Guid.NewGuid(),
                    RelationshipId = ids.Map(relationship.Id),
                    SortOrder = order++,
                    EntityEraId = ids.Map(period.EntityEraId),
                    StartEraId = ids.Map(period.Start?.EraId),
                    StartYear = period.Start?.Year,
                    StartMonth = period.Start?.Month,
                    StartMonthId = ids.Map(period.Start?.MonthId),
                    StartDay = period.Start?.Day,
                    EndEraId = ids.Map(period.End?.EraId),
                    EndYear = period.End?.Year,
                    EndMonth = period.End?.Month,
                    EndMonthId = ids.Map(period.End?.MonthId),
                    EndDay = period.End?.Day,
                });
            }
        }

        foreach (var entry in payload.TimelineEntries)
        {
            var entryId = ids.Map(entry.Id);

            db.TimelineEntries.Add(new TimelineEntry
            {
                Id = entryId,
                UniverseId = universeId,
                Title = entry.Title,
                Description = entry.Description,
                CanonStatus = entry.CanonStatus,
                DateKind = entry.DateKind,
                StartYear = entry.StartYear,
                StartMonth = entry.StartMonth,
                StartMonthId = ids.Map(entry.StartMonthId),
                StartDay = entry.StartDay,
                EndYear = entry.EndYear,
                EndMonth = entry.EndMonth,
                EndMonthId = ids.Map(entry.EndMonthId),
                EndDay = entry.EndDay,
                StartEraId = ids.Map(entry.StartEraId),
                EndEraId = ids.Map(entry.EndEraId),
                EraLabel = entry.EraLabel,
                CreatedAt = entry.CreatedAt,
                UpdatedAt = entry.UpdatedAt,
                DeletedAt = entry.DeletedAt,
            });

            foreach (var participant in entry.ParticipantEntityIds)
            {
                db.TimelineEntryLinks.Add(new TimelineEntryLink { TimelineEntryId = entryId, EntityId = ids.Map(participant) });
            }

            // To the restored stories, by their new ids: validation proved each is a story of this file. One moment, however
            // many stories it names. A version 20 file has none.
            foreach (var story in entry.StoryIds ?? [])
            {
                db.TimelineEntryStories.Add(new TimelineEntryStory { TimelineEntryId = entryId, StoryId = ids.Map(story) });
            }
        }
    }

    private void AddEntity(BackupEntity entity, RestoreIdentity ids, Guid universeId, Dictionary<Guid, EntityImage> images)
    {
        var entityId = ids.Map(entity.Id);

        db.Entities.Add(new LoreEntity
        {
            Id = entityId,
            UniverseId = universeId,
            EntityTypeId = ids.Map(entity.EntityTypeId),
            Name = entity.Name,
            Summary = entity.Summary,
            CanonStatus = entity.CanonStatus,
            IsArchived = entity.IsArchived,
            DeletedAt = entity.DeletedAt,
            CreatedAt = entity.CreatedAt,
            UpdatedAt = entity.UpdatedAt,
        });

        foreach (var alias in entity.Aliases)
        {
            db.EntityAliases.Add(new EntityAlias { Id = Guid.NewGuid(), EntityId = entityId, Value = alias });
        }

        foreach (var tagId in entity.TagIds)
        {
            db.EntityTags.Add(new EntityTag { EntityId = entityId, TagId = ids.Map(tagId) });
        }

        foreach (var value in entity.FieldValues)
        {
            db.EntityFieldValues.Add(new EntityFieldValue
            {
                Id = Guid.NewGuid(),
                EntityId = entityId,
                FieldDefinitionId = ids.Map(value.FieldDefinitionId),
                TextValue = value.TextValue,
                NumberValue = value.NumberValue,
                EraId = ids.Map(value.EraId),
                BooleanValue = value.BooleanValue,
                DateValue = value.DateValue,
                OptionId = ids.Map(value.OptionId),
                ReferencedEntityId = ids.Map(value.ReferencedEntityId),
            });
        }

        // An article row exists exactly when it was ever saved; a cleared one is a row holding nothing (ADR 0028).
        if (entity.ArticleUpdatedAt is { } articleUpdatedAt)
        {
            db.EntityArticles.Add(new EntityArticle
            {
                EntityId = entityId,
                Content = entity.Content ?? string.Empty,
                UpdatedAt = articleUpdatedAt,
            });
        }

        foreach (var revision in entity.ArticleRevisions!)
        {
            db.EntityArticleRevisions.Add(new EntityArticleRevision
            {
                Id = ids.Map(revision.Id),
                EntityId = entityId,
                Number = revision.Number,
                Kind = revision.Kind,
                RestoredFromRevisionId = ids.Translate(revision.RestoredFromRevisionId),
                CreatedAt = revision.CreatedAt,
                Content = revision.Content,
            });
        }

        // The owner's private note (ADR 0056): the restoring account is the new owner, so it is theirs to read again.
        if (entity.PrivateNote is { } note)
        {
            db.EntityPrivateNotes.Add(new EntityPrivateNote
            {
                EntityId = entityId,
                Content = note.Content,
                UpdatedAt = note.UpdatedAt,
                Version = 1,
            });
        }

        if (images.TryGetValue(entity.Id, out var image))
        {
            db.EntityImages.Add(image);
        }

        foreach (var revision in entity.Revisions)
        {
            var revisionRow = new EntityRevision
            {
                Id = ids.Map(revision.Id),
                EntityId = entityId,
                Number = revision.Number,
                Kind = revision.Kind,
                Changes = revision.Changes,
                RestoredFromRevisionId = ids.Translate(revision.RestoredFromRevisionId),
                CreatedAt = revision.CreatedAt,
                EntityTypeId = ids.Translate(revision.EntityTypeId),
                EntityTypeName = revision.EntityTypeName,
                Name = revision.Name,
                Summary = revision.Summary,
                Content = revision.Content,
                CanonStatus = revision.CanonStatus,
            };

            db.EntityRevisions.Add(revisionRow);

            foreach (var alias in revision.Aliases)
            {
                db.EntityRevisionAliases.Add(new EntityRevisionAlias { Id = Guid.NewGuid(), RevisionId = revisionRow.Id, Value = alias });
            }

            foreach (var tag in revision.Tags)
            {
                db.EntityRevisionTags.Add(new EntityRevisionTag { Id = Guid.NewGuid(), RevisionId = revisionRow.Id, Name = tag });
            }

            foreach (var value in revision.FieldValues)
            {
                db.EntityRevisionFieldValues.Add(new EntityRevisionFieldValue
                {
                    Id = Guid.NewGuid(),
                    RevisionId = revisionRow.Id,
                    FieldDefinitionId = ids.Translate(value.FieldDefinitionId),
                    FieldName = value.FieldName,
                    Kind = value.Kind,
                    DisplayOrder = value.DisplayOrder,
                    TextValue = value.TextValue,
                    NumberValue = value.NumberValue,
                    EraId = ids.Translate(value.EraId),
                    EraLabel = value.EraLabel,
                    BooleanValue = value.BooleanValue,
                    DateValue = value.DateValue,
                    OptionId = ids.Translate(value.OptionId),
                    OptionValue = value.OptionValue,
                    ReferencedEntityId = ids.Translate(value.ReferencedEntityId),
                    ReferencedEntityName = value.ReferencedEntityName,
                });
            }
        }

        if (entity.Progression is { } progression)
        {
            AddProgression(entityId, progression, ids);
        }
    }

    /// <summary>
    /// An entry's eras (Issue #41) with their links and overrides, by the new ids, and its saved versions with every id inside
    /// them translated the same way - an era the history names but no longer has gets a fresh id of its own, as any id a version
    /// merely recorded does - and re-sorted, since the order they were stored in was by id.
    /// </summary>
    private void AddProgression(Guid entityId, BackupProgression progression, RestoreIdentity ids)
    {
        db.EntityProgressions.Add(new EntityProgression { EntityId = entityId, UpdatedAt = progression.UpdatedAt, Version = 1 });

        foreach (var era in progression.Eras)
        {
            var eraId = ids.Map(era.Id);

            db.EntityEras.Add(new EntityEra
            {
                Id = eraId,
                EntityId = entityId,
                Name = era.Name.Trim(),
                Description = era.Description,
                SortOrder = era.SortOrder,
                StartEraId = ids.Map(era.Start?.EraId),
                StartYear = era.Start?.Year,
                StartMonth = era.Start?.Month,
                StartMonthId = ids.Map(era.Start?.MonthId),
                StartDay = era.Start?.Day,
                EndEraId = ids.Map(era.End?.EraId),
                EndYear = era.End?.Year,
                EndMonth = era.End?.Month,
                EndMonthId = ids.Map(era.End?.MonthId),
                EndDay = era.End?.Day,
            });

            foreach (var story in era.StoryIds.Distinct())
            {
                db.EntityEraStories.Add(new EntityEraStory { EntityEraId = eraId, StoryId = ids.Map(story) });
            }

            foreach (var scene in era.SceneIds.Distinct())
            {
                db.EntityEraScenes.Add(new EntityEraScene { EntityEraId = eraId, SceneId = ids.Map(scene) });
            }

            foreach (var value in era.FieldValues)
            {
                db.EntityEraFieldValues.Add(new EntityEraFieldValue
                {
                    Id = Guid.NewGuid(),
                    EntityEraId = eraId,
                    FieldDefinitionId = ids.Map(value.FieldDefinitionId),
                    IsCleared = value.IsCleared,
                    TextValue = value.TextValue,
                    NumberValue = value.NumberValue,
                    EraId = ids.Map(value.EraId),
                    BooleanValue = value.BooleanValue,
                    DateValue = value.DateValue,
                    OptionId = ids.Map(value.OptionId),
                    ReferencedEntityId = ids.Map(value.ReferencedEntityId),
                });
            }
        }

        foreach (var form in progression.Forms ?? [])
        {
            var formId = ids.Map(form.Id);
            db.EntityForms.Add(new EntityForm
            {
                Id = formId,
                EntityId = entityId,
                Name = form.Name.Trim(),
                Description = form.Description,
                SortOrder = form.SortOrder,
                UnlockEntityEraId = ids.Map(form.UnlockEraId),
                UnlockSceneId = ids.Map(form.UnlockSceneId),
                UnlockTimelineEntryId = ids.Map(form.UnlockMomentId),
            });

            foreach (var era in form.EraIds.Distinct())
            {
                db.EntityFormEras.Add(new EntityFormEra { EntityFormId = formId, EntityEraId = ids.Map(era) });
            }

            foreach (var scene in form.SceneIds.Distinct())
            {
                db.EntityFormScenes.Add(new EntityFormScene { EntityFormId = formId, SceneId = ids.Map(scene) });
            }
        }

        foreach (var ability in progression.Abilities ?? [])
        {
            var abilityId = ids.Map(ability.Id);
            db.EntityAbilities.Add(new EntityAbility
            {
                Id = abilityId,
                EntityId = entityId,
                Name = ability.Name.Trim(),
                Description = ability.Description,
                SortOrder = ability.SortOrder,
                UnlockEntityEraId = ids.Map(ability.UnlockEraId),
                UnlockSceneId = ids.Map(ability.UnlockSceneId),
                UnlockTimelineEntryId = ids.Map(ability.UnlockMomentId),
            });

            foreach (var era in ability.EraIds.Distinct())
            {
                db.EntityAbilityEras.Add(new EntityAbilityEra { EntityAbilityId = abilityId, EntityEraId = ids.Map(era) });
            }

            foreach (var scene in ability.SceneIds.Distinct())
            {
                db.EntityAbilityScenes.Add(new EntityAbilityScene { EntityAbilityId = abilityId, SceneId = ids.Map(scene) });
            }

            foreach (var form in ability.FormIds.Distinct())
            {
                db.EntityAbilityForms.Add(new EntityAbilityForm { EntityAbilityId = abilityId, EntityFormId = ids.Map(form) });
            }
        }

        foreach (var appearance in progression.Appearances ?? [])
        {
            var appearanceId = ids.Map(appearance.Id);
            db.EntityAppearances.Add(new EntityAppearance
            {
                Id = appearanceId,
                EntityId = entityId,
                Label = appearance.Label.Trim(),
                Notes = appearance.Notes,
                SortOrder = appearance.SortOrder,
            });

            foreach (var era in appearance.EraIds.Distinct())
            {
                db.EntityAppearanceEras.Add(new EntityAppearanceEra { EntityAppearanceId = appearanceId, EntityEraId = ids.Map(era) });
            }

            foreach (var form in appearance.FormIds.Distinct())
            {
                db.EntityAppearanceForms.Add(new EntityAppearanceForm { EntityAppearanceId = appearanceId, EntityFormId = ids.Map(form) });
            }

            foreach (var scene in appearance.SceneIds.Distinct())
            {
                db.EntityAppearanceScenes.Add(new EntityAppearanceScene { EntityAppearanceId = appearanceId, SceneId = ids.Map(scene) });
            }

            db.EntityAppearanceImages.AddRange(_appearanceImages.Where(image => image.EntityAppearanceId == appearanceId));
        }

        foreach (var revision in progression.Revisions)
        {
            db.EntityProgressionRevisions.Add(new EntityProgressionRevision
            {
                Id = ids.Map(revision.Id),
                EntityId = entityId,
                Number = revision.Number,
                Kind = revision.Kind,
                RestoredFromRevisionId = ids.Translate(revision.RestoredFromRevisionId),
                CreatedAt = revision.CreatedAt,
                Snapshot = ProgressionState.Serialize(Translated(revision.Snapshot, ids)),
            });
        }
    }

    private static ProgressionSnapshot Translated(ProgressionSnapshot snapshot, RestoreIdentity ids)
    {
        ChronologyValue? Point(ChronologyValue? point) =>
            point is null ? null : point with { EraId = ids.Translate(point.EraId), MonthId = ids.Translate(point.MonthId) };

        List<Guid> Sorted(IEnumerable<Guid>? list) => [.. (list ?? []).Select(id => ids.Translate(id)).Order()];

        List<Guid>? Ids(IEnumerable<Guid>? list) => list is null ? null : Sorted(list);

        return new ProgressionSnapshot(
            [
                .. (snapshot.Eras ?? []).Select(era => era with
            {
                Id = ids.Translate(era.Id),
                Start = Point(era.Start),
                End = Point(era.End),
                StoryIds = Sorted(era.StoryIds),
                SceneIds = Sorted(era.SceneIds),
                Fields =
                [
                    .. (era.Fields ?? [])
                        .Select(field => field with
                        {
                            FieldDefinitionId = ids.Translate(field.FieldDefinitionId),
                            OptionIds = field.OptionIds is null ? null : Sorted(field.OptionIds),
                            ReferencedEntityId = ids.Translate(field.ReferencedEntityId),
                            EraId = ids.Translate(field.EraId),
                        })
                        .OrderBy(field => field.FieldDefinitionId),
                ],
            }),
            ],
            snapshot.Forms is null ? null : [
                .. snapshot.Forms.Select(form => form with
                {
                    Id = ids.Translate(form.Id),
                    UnlockEraId = ids.Translate(form.UnlockEraId),
                    UnlockSceneId = ids.Translate(form.UnlockSceneId),
                    UnlockMomentId = ids.Translate(form.UnlockMomentId),
                    EraIds = Ids(form.EraIds),
                    SceneIds = Ids(form.SceneIds),
                }),
            ],
            snapshot.Abilities is null ? null : [
                .. snapshot.Abilities.Select(ability => ability with
                {
                    Id = ids.Translate(ability.Id),
                    UnlockEraId = ids.Translate(ability.UnlockEraId),
                    UnlockSceneId = ids.Translate(ability.UnlockSceneId),
                    UnlockMomentId = ids.Translate(ability.UnlockMomentId),
                    EraIds = Ids(ability.EraIds),
                    SceneIds = Ids(ability.SceneIds),
                    FormIds = Ids(ability.FormIds),
                }),
            ],
            snapshot.Appearances is null ? null : [
                .. snapshot.Appearances.Select(appearance => appearance with
                {
                    Id = ids.Translate(appearance.Id),
                    EraIds = Ids(appearance.EraIds),
                    FormIds = Ids(appearance.FormIds),
                    SceneIds = Ids(appearance.SceneIds),
                }),
            ]);
    }

    private void AddStories(UniverseBackupPayload payload, RestoreIdentity ids, Guid universeId)
    {
        foreach (var story in payload.Stories!)
        {
            var storyId = ids.Map(story.Id);

            db.Stories.Add(new Story
            {
                Id = storyId,
                UniverseId = universeId,
                Title = story.Title,
                Premise = story.Premise,
                PublicSummary = string.IsNullOrWhiteSpace(story.PublicSummary) ? null : story.PublicSummary,
                Status = story.Status,
                CreatedAt = story.CreatedAt,
                UpdatedAt = story.UpdatedAt,
                DeletedAt = story.DeletedAt,
            });

            foreach (var chapter in story.Chapters!)
            {
                db.Chapters.Add(new Chapter
                {
                    Id = ids.Map(chapter.Id),
                    StoryId = storyId,
                    Title = chapter.Title,
                    Summary = chapter.Summary,
                    Notes = chapter.Notes,
                    SortOrder = chapter.SortOrder,
                    CreatedAt = chapter.CreatedAt,
                    UpdatedAt = chapter.UpdatedAt,
                    DeletedAt = chapter.DeletedAt,
                });
            }

            foreach (var scene in story.Scenes)
            {
                var sceneId = ids.Map(scene.Id);

                db.Scenes.Add(new Scene
                {
                    Id = sceneId,
                    StoryId = storyId,
                    Title = scene.Title,
                    Summary = scene.Summary,
                    Notes = scene.Notes,
                    ChapterId = ids.Map(scene.ChapterId),
                    SortOrder = scene.SortOrder,
                    PovEntityId = ids.Map(scene.PovEntityId),
                    EraId = ids.Map(scene.Chronology?.EraId),
                    Year = scene.Chronology?.Year,
                    Month = scene.Chronology?.Month,
                    MonthId = ids.Map(scene.Chronology?.MonthId),
                    Day = scene.Chronology?.Day,
                    CreatedAt = scene.CreatedAt,
                    UpdatedAt = scene.UpdatedAt,
                    DeletedAt = scene.DeletedAt,
                });

                foreach (var entityId in scene.LinkedEntityIds)
                {
                    db.SceneEntityLinks.Add(new SceneEntityLink { SceneId = sceneId, EntityId = ids.Map(entityId) });
                }

                if (scene.Manuscript is { } manuscript)
                {
                    db.SceneManuscripts.Add(new SceneManuscript
                    {
                        SceneId = sceneId,
                        // Mentions point at the restored entries: the one rewrite inside authored text a restore makes.
                        Content = ManuscriptMentions.Remap(manuscript.Content, ids.Known),
                        UpdatedAt = manuscript.UpdatedAt,
                    });

                    foreach (var revision in manuscript.Revisions!)
                    {
                        db.SceneManuscriptRevisions.Add(new SceneManuscriptRevision
                        {
                            Id = ids.Map(revision.Id),
                            SceneId = sceneId,
                            Number = revision.Number,
                            Kind = revision.Kind,
                            RestoredFromRevisionId = ids.Translate(revision.RestoredFromRevisionId),
                            CreatedAt = revision.CreatedAt,
                            Content = ManuscriptMentions.Remap(revision.Content, ids.Known),
                        });
                    }
                }
            }

            foreach (var arc in story.PlotArcs!)
            {
                var arcId = ids.Map(arc.Id);

                db.PlotArcs.Add(new PlotArc
                {
                    Id = arcId,
                    StoryId = storyId,
                    Title = arc.Title,
                    Description = arc.Description,
                    Notes = arc.Notes,
                    SortOrder = arc.SortOrder,
                    CreatedAt = arc.CreatedAt,
                    UpdatedAt = arc.UpdatedAt,
                    DeletedAt = arc.DeletedAt,
                });

                foreach (var beat in arc.Beats)
                {
                    var beatId = ids.Map(beat.Id);

                    db.PlotBeats.Add(new PlotBeat
                    {
                        Id = beatId,
                        PlotArcId = arcId,
                        Title = beat.Title,
                        Description = beat.Description,
                        Notes = beat.Notes,
                        SortOrder = beat.SortOrder,
                        CreatedAt = beat.CreatedAt,
                        UpdatedAt = beat.UpdatedAt,
                        DeletedAt = beat.DeletedAt,
                    });

                    foreach (var sceneId in beat.LinkedSceneIds)
                    {
                        db.PlotBeatScenes.Add(new PlotBeatScene { PlotBeatId = beatId, SceneId = ids.Map(sceneId) });
                    }

                    foreach (var entityId in beat.LinkedEntityIds)
                    {
                        db.PlotBeatEntities.Add(new PlotBeatEntity { PlotBeatId = beatId, EntityId = ids.Map(entityId) });
                    }
                }
            }
        }
    }

    /// <summary>
    /// The ideas of the backed-up universe become the restoring account's ideas about the restored one (ADR 0030).
    /// The file's association with its universe is what says they belong here; no owner id is read from it.
    /// </summary>
    private void AddIdeas(UniverseBackupPayload payload, RestoreIdentity ids, Guid universeId, string ownerId)
    {
        foreach (var idea in payload.Ideas!)
        {
            var ideaId = ids.Map(idea.Id);

            db.Ideas.Add(new Idea
            {
                Id = ideaId,
                OwnerId = ownerId,
                UniverseId = universeId,
                Title = idea.Title,
                Body = idea.Body,
                CreatedAt = idea.CreatedAt,
                UpdatedAt = idea.UpdatedAt,
                DeletedAt = idea.DeletedAt,
            });

            foreach (var reference in idea.References)
            {
                var targetId = ids.Map(reference.Id);

                switch (reference.Kind)
                {
                    case IdeaReferenceKind.Entity:
                        db.IdeaEntityReferences.Add(new IdeaEntityReference { IdeaId = ideaId, EntityId = targetId });
                        break;
                    case IdeaReferenceKind.Story:
                        db.IdeaStoryReferences.Add(new IdeaStoryReference { IdeaId = ideaId, StoryId = targetId });
                        break;
                    case IdeaReferenceKind.Scene:
                        db.IdeaSceneReferences.Add(new IdeaSceneReference { IdeaId = ideaId, SceneId = targetId });
                        break;
                    case IdeaReferenceKind.PlotArc:
                        db.IdeaPlotArcReferences.Add(new IdeaPlotArcReference { IdeaId = ideaId, PlotArcId = targetId });
                        break;
                    case IdeaReferenceKind.PlotBeat:
                        db.IdeaPlotBeatReferences.Add(new IdeaPlotBeatReference { IdeaId = ideaId, PlotBeatId = targetId });
                        break;
                }
            }
        }
    }

    /// <summary>
    /// The backed-up universe's world rules become the restored universe's (ADR 0033): a new id each, the marker and moments as
    /// the backup recorded them, the words exactly. Nothing is read into them and nothing else is written for them; their search
    /// index rows are written by its triggers as the rows land.
    /// </summary>
    private void AddWorldRules(UniverseBackupPayload payload, RestoreIdentity ids, Guid universeId)
    {
        foreach (var rule in payload.WorldRules!)
        {
            db.WorldRules.Add(new WorldRule
            {
                Id = ids.Map(rule.Id),
                UniverseId = universeId,
                Title = rule.Title,
                Description = rule.Description,
                CreatedAt = rule.CreatedAt,
                UpdatedAt = rule.UpdatedAt,
                DeletedAt = rule.DeletedAt,
            });
        }
    }

    /// <summary>
    /// The universe's event kinds and methods, each rule's check and each moment's details (ADR 0034), every id through the one map -
    /// so a check or a moment can only ever name a term, rule, moment or entry of the restored universe. What a check finds is not
    /// written: Canon, evaluated below, counts it again from the restored moments.
    /// </summary>
    private void AddRuleValidation(UniverseBackupPayload payload, RestoreIdentity ids, Guid universeId)
    {
        foreach (var term in payload.ValidationTerms!)
        {
            db.ValidationTerms.Add(new ValidationTerm
            {
                Id = ids.Map(term.Id),
                UniverseId = universeId,
                Kind = term.Kind,
                Name = term.Name,
                NormalizedName = ValidationTerm.Normalize(term.Name),
                CreatedAt = term.CreatedAt,
                UpdatedAt = term.UpdatedAt,
            });
        }

        foreach (var rule in payload.WorldRules!)
        {
            if (rule.Validation is { } check)
            {
                db.WorldRuleValidations.Add(new WorldRuleValidation
                {
                    WorldRuleId = ids.Map(rule.Id),
                    Kind = check.Kind,
                    EventKindTermId = ids.Map(check.EventKindTermId),
                    MethodTermId = ids.Map(check.MethodTermId),
                    MaxOccurrences = check.MaxOccurrences,
                });
            }
        }

        foreach (var entry in payload.TimelineEntries)
        {
            if (entry.Validation is { } details)
            {
                db.TimelineEntryValidations.Add(new TimelineEntryValidation
                {
                    TimelineEntryId = ids.Map(entry.Id),
                    EventKindTermId = ids.Map(details.EventKindTermId),
                    MethodTermId = ids.Map(details.MethodTermId),
                    ParticipantEntityId = ids.Map(details.ParticipantEntityId),
                });
            }
        }
    }

    // ---------- Canon ----------

    /// <summary>
    /// Conflicts are derived (ADR 0010), so they are found again over the restored lore rather than copied. A dismissal
    /// is not derived, and the backup identifies each one by a fingerprint of the ids it was about - ids this universe
    /// no longer uses. So each finding's fingerprint is also computed over the ids its records had in the backup, and a
    /// finding whose old fingerprint was dismissed is dismissed again, as of when it was. A dismissal whose finding no
    /// longer arises is not kept: evaluation would have resolved it in the source universe the next time it ran.
    /// </summary>
    private async Task ReconcileCanonAsync(
        UniverseBackupPayload payload,
        RestoreIdentity ids,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var findings = await evaluator.DetectAsync(universeId, cancellationToken);
        await evaluator.ReconcileAsync(universeId, findings, cancellationToken);

        if (payload.DismissedConflicts.Count == 0 || findings.Count == 0)
        {
            return;
        }

        var dismissedAt = payload.DismissedConflicts.ToDictionary(
            conflict => conflict.Fingerprint,
            conflict => conflict.DismissedAt,
            StringComparer.Ordinal);

        var dismiss = new Dictionary<string, DateTime>(StringComparer.Ordinal);

        foreach (var finding in findings.Values)
        {
            var original = CanonFingerprint.Of(finding.RuleCode, finding.FingerprintIds.Select(ids.Source), finding.UnorderedFrom);

            if (dismissedAt.TryGetValue(original, out var moment))
            {
                dismiss[finding.Fingerprint] = moment;
            }
        }

        if (dismiss.Count == 0)
        {
            return;
        }

        var conflicts = await db.CanonConflicts
            .Where(conflict => conflict.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        foreach (var conflict in conflicts)
        {
            if (dismiss.TryGetValue(conflict.Fingerprint, out var moment))
            {
                conflict.Status = CanonConflictStatus.Dismissed;
                conflict.UpdatedAt = moment;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Orphaned media object left behind at '{ObjectKey}' after a restore that did not complete. Nothing references it and it is safe to delete.")]
    private static partial void LogOrphanedObject(ILogger logger, string objectKey, Exception exception);
}
