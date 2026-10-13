using System.Globalization;
using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// Turns an accepted entity write into a version the author can read back.
///
/// Capture runs inside the caller's transaction, after the write has been saved and before
/// anything is committed. That placement is the whole atomicity story: a write refused by
/// validation, by an unresolvable id or by the Canon promotion gate is rolled back with its
/// revision inside it, so history can only ever contain state that was actually stored.
///
/// It reads the entry back from the database rather than from the change tracker, because
/// the database is what was written - trimmed, normalised, and with the child rows the
/// handler replaced wholesale already in place.
///
/// A write that changed nothing writes nothing. The comparison is against the previous
/// revision's snapshot, field by field, so a re-save of an untouched form, a rename of a
/// field definition, or a second press of the status the entry already has all leave the
/// history exactly as long as it was.
/// </summary>
internal static class EntityRevisions
{
    /// <summary>Unit separator: cannot occur in an authored value, so parts never run together.</summary>
    private const char Separator = '\u001f';

    /// <summary>
    /// Records the entry's current state as its next version, unless that state is identical
    /// to the version before it. Saves through the caller's context and transaction.
    ///
    /// <paramref name="also"/> is for a change the snapshot cannot see. Today that is exactly
    /// one thing - the primary image, which is author-visible state that no revision holds a
    /// copy of (ADR 0019) - and without it an image-only write would compare equal to the
    /// version before it and record nothing at all, leaving a history that quietly omitted
    /// something the author did.
    ///
    /// <paramref name="actorUserId"/> is the signed-in account whose write this is, recorded on the version it produces.
    /// </summary>
    internal static async Task CaptureAsync(
        LorexDbContext db,
        Guid entityId,
        EntityRevisionKind kind,
        Guid? restoredFromRevisionId,
        string actorUserId,
        CancellationToken cancellationToken,
        EntityRevisionChange also = EntityRevisionChange.None)
    {
        var current = await ReadEntityAsync(db, entityId, cancellationToken);

        if (current is null)
        {
            return;
        }

        var previous = await db.EntityRevisions.AsNoTracking()
            .Include(revision => revision.Aliases)
            .Include(revision => revision.Tags)
            .Include(revision => revision.FieldValues)
            .Where(revision => revision.EntityId == entityId)
            .OrderByDescending(revision => revision.Number)
            .FirstOrDefaultAsync(cancellationToken);

        // Nothing on record to compare against: this is the entry's baseline, whether it was
        // created a moment ago or predates the feature. Changes stays None because "what
        // changed" has no answer, and the reader shows it as the first recorded version.
        var changes = previous is null
            ? EntityRevisionChange.None
            : Difference(Snapshot.From(previous), current);

        changes |= also;

        if (previous is not null && changes == EntityRevisionChange.None)
        {
            return;
        }

        db.EntityRevisions.Add(Build(
            entityId,
            (previous?.Number ?? 0) + 1,
            kind,
            changes,
            restoredFromRevisionId,
            actorUserId,
            current));

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>The entry as stored, in the shape a revision records it.</summary>
    internal sealed record Snapshot(
        Guid EntityTypeId,
        string EntityTypeName,
        string Name,
        string? Summary,
        CanonStatus CanonStatus,
        IReadOnlyList<string> Aliases,
        IReadOnlyList<string> Tags,
        IReadOnlyList<SnapshotField> Fields)
    {
        internal static Snapshot From(EntityRevision revision) =>
            new(
                revision.EntityTypeId,
                revision.EntityTypeName,
                revision.Name,
                revision.Summary,
                revision.CanonStatus,
                [.. revision.Aliases.Select(alias => alias.Value)],
                [.. revision.Tags.Select(tag => tag.Name)],
                [.. revision.FieldValues.Select(value => new SnapshotField(
                    value.FieldDefinitionId,
                    value.FieldName,
                    value.Kind,
                    value.DisplayOrder,
                    value.TextValue,
                    value.NumberValue,
                    value.EraId,
                    value.EraLabel,
                    value.BooleanValue,
                    value.DateValue,
                    value.OptionId,
                    value.OptionValue,
                    value.ReferencedEntityId,
                    value.ReferencedEntityName))]);
    }

    /// <summary>One stored value. One row per chosen option, as the live table stores it.</summary>
    internal sealed record SnapshotField(
        Guid FieldDefinitionId,
        string FieldName,
        EntityFieldKind Kind,
        int DisplayOrder,
        string? TextValue,
        double? NumberValue,
        Guid? EraId,
        string? EraLabel,
        bool? BooleanValue,
        DateTime? DateValue,
        Guid? OptionId,
        string? OptionValue,
        Guid? ReferencedEntityId,
        string? ReferencedEntityName);

    /// <summary>
    /// The entry exactly as the database holds it, with the display text every reference
    /// carried at this moment. Read once and used both to compare and to store.
    /// </summary>
    internal static async Task<Snapshot?> ReadEntityAsync(
        LorexDbContext db,
        Guid entityId,
        CancellationToken cancellationToken)
    {
        var row = await db.Entities.AsNoTracking()
            .Where(entity => entity.Id == entityId)
            .Select(entity => new
            {
                entity.EntityTypeId,
                EntityTypeName = entity.EntityType!.Name,
                entity.Name,
                entity.Summary,
                entity.CanonStatus,
                Aliases = entity.Aliases.Select(alias => alias.Value).ToList(),
                Tags = entity.EntityTags.Select(link => link.Tag!.Name).ToList(),
                Fields = entity.FieldValues.Select(value => new SnapshotField(
                    value.FieldDefinitionId,
                    value.FieldDefinition!.Name,
                    value.FieldDefinition.Kind,
                    value.FieldDefinition.DisplayOrder,
                    value.TextValue,
                    value.NumberValue,
                    value.EraId,
                    value.Era != null ? value.Era.Abbreviation ?? value.Era.Name : null,
                    value.BooleanValue,
                    value.DateValue,
                    value.OptionId,
                    value.Option != null ? value.Option.Value : null,
                    value.ReferencedEntityId,
                    value.ReferencedEntity != null ? value.ReferencedEntity.Name : null)).ToList(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? null
            : new Snapshot(
                row.EntityTypeId,
                row.EntityTypeName,
                row.Name,
                row.Summary,
                row.CanonStatus,
                row.Aliases,
                row.Tags,
                row.Fields);
    }

    /// <summary>
    /// Which parts differ. Deliberately blind to anything that is not authored lore: a field
    /// definition's name, kind or position can move under a snapshot without that being a
    /// change to the entry, and a referenced entity being renamed is that entity's history,
    /// not this one's.
    ///
    /// Blind to the article too. It is not part of the snapshot: an article keeps its own
    /// history (ADR 0028), and a version recorded before that still holding a copy must not
    /// make the next structured edit look like an article change.
    /// </summary>
    private static EntityRevisionChange Difference(Snapshot before, Snapshot after)
    {
        var changes = EntityRevisionChange.None;

        if (!string.Equals(before.Name, after.Name, StringComparison.Ordinal))
        {
            changes |= EntityRevisionChange.Name;
        }

        if (!string.Equals(before.Summary, after.Summary, StringComparison.Ordinal))
        {
            changes |= EntityRevisionChange.Summary;
        }

        if (before.CanonStatus != after.CanonStatus)
        {
            changes |= EntityRevisionChange.CanonStatus;
        }

        if (before.EntityTypeId != after.EntityTypeId)
        {
            changes |= EntityRevisionChange.EntityType;
        }

        if (!SameSet(before.Aliases, after.Aliases))
        {
            changes |= EntityRevisionChange.Aliases;
        }

        if (!SameSet(before.Tags, after.Tags))
        {
            changes |= EntityRevisionChange.Tags;
        }

        if (!SameSet(before.Fields.Select(ValueKey), after.Fields.Select(ValueKey)))
        {
            changes |= EntityRevisionChange.Fields;
        }

        return changes;
    }

    /// <summary>
    /// Everything about one stored value that is authored, in one comparable string. Culture
    /// invariant and round-trippable, so the same value never compares unequal to itself. The
    /// era is its id alone: moving a year to another era is an edit to the entry, renaming the
    /// era is not.
    /// </summary>
    private static string ValueKey(SnapshotField field) => string.Join(
        Separator,
        Key(field.FieldDefinitionId),
        field.TextValue,
        field.NumberValue?.ToString("R", CultureInfo.InvariantCulture),
        Key(field.EraId),
        field.BooleanValue?.ToString(CultureInfo.InvariantCulture),
        field.DateValue?.ToString("O", CultureInfo.InvariantCulture),
        Key(field.OptionId),
        Key(field.ReferencedEntityId));

    private static string Key(Guid? id) =>
        id?.ToString("N", CultureInfo.InvariantCulture) ?? string.Empty;

    /// <summary>
    /// Same contents, order ignored. Aliases, tags and values are all unordered sets that the
    /// API happens to return sorted; sorting here rather than trusting that keeps the
    /// comparison correct whatever a query orders by.
    /// </summary>
    private static bool SameSet(IEnumerable<string> before, IEnumerable<string> after) =>
        before.Order(StringComparer.Ordinal).SequenceEqual(after.Order(StringComparer.Ordinal), StringComparer.Ordinal);

    private static EntityRevision Build(
        Guid entityId,
        int number,
        EntityRevisionKind kind,
        EntityRevisionChange changes,
        Guid? restoredFromRevisionId,
        string actorUserId,
        Snapshot snapshot)
    {
        var revision = new EntityRevision
        {
            Id = Guid.NewGuid(),
            EntityId = entityId,
            Number = number,
            Kind = kind,
            Changes = changes,
            RestoredFromRevisionId = restoredFromRevisionId,
            CreatedAt = DateTime.UtcNow,
            ActorUserId = actorUserId,
            EntityTypeId = snapshot.EntityTypeId,
            EntityTypeName = snapshot.EntityTypeName,
            Name = snapshot.Name,
            Summary = snapshot.Summary,
            CanonStatus = snapshot.CanonStatus,
        };

        foreach (var alias in snapshot.Aliases)
        {
            revision.Aliases.Add(new EntityRevisionAlias
            {
                Id = Guid.NewGuid(),
                RevisionId = revision.Id,
                Value = alias,
            });
        }

        foreach (var tag in snapshot.Tags)
        {
            revision.Tags.Add(new EntityRevisionTag
            {
                Id = Guid.NewGuid(),
                RevisionId = revision.Id,
                Name = tag,
            });
        }

        foreach (var field in snapshot.Fields)
        {
            revision.FieldValues.Add(new EntityRevisionFieldValue
            {
                Id = Guid.NewGuid(),
                RevisionId = revision.Id,
                FieldDefinitionId = field.FieldDefinitionId,
                FieldName = field.FieldName,
                Kind = field.Kind,
                DisplayOrder = field.DisplayOrder,
                TextValue = field.TextValue,
                NumberValue = field.NumberValue,
                EraId = field.EraId,
                EraLabel = field.EraLabel,
                BooleanValue = field.BooleanValue,
                DateValue = field.DateValue,
                OptionId = field.OptionId,
                OptionValue = field.OptionValue,
                ReferencedEntityId = field.ReferencedEntityId,
                ReferencedEntityName = field.ReferencedEntityName,
            });
        }

        return revision;
    }
}
