using System.Linq.Expressions;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// Lore as a story shows it, on a scene or on a plot beat. One implementation for both, so a reference reads
/// the same wherever a story points at an entry.
///
/// The name, type, icon and picture are read from the entry on every request and never stored beside the
/// reference, so a renamed entry is renamed everywhere at once. A trashed entry is still resolved, marked
/// <see cref="SceneLoreReference.IsTrashed"/>, because the forms send their references back whole.
/// </summary>
internal static class StoryLoreReferences
{
    /// <summary>An entry as a story shows it: what it is called, what it is, whether it is in the Trash, and its picture.</summary>
    public static readonly Expression<Func<LoreEntity, SceneLoreReference>> ToReference =
        entity => new SceneLoreReference(
            entity.Id,
            entity.Name,
            entity.EntityTypeId,
            entity.EntityType!.Name,
            entity.EntityType.Icon,
            entity.EntityType.AccentColor,
            entity.DeletedAt != null,
            entity.Image == null
                ? null
                : new EntityImageRef(
                    entity.Image.AssetId,
                    entity.Image.ThumbnailId,
                    entity.Image.Width,
                    entity.Image.Height,
                    entity.Image.ContentType,
                    entity.Image.FileName,
                    entity.Image.ByteSize,
                    entity.Image.UploadedAt,
                    entity.Image.CropX == null
                        ? null
                        : new EntityImageCrop(
                            entity.Image.CropX.Value,
                            entity.Image.CropY!.Value,
                            entity.Image.CropWidth!.Value,
                            entity.Image.CropHeight!.Value)));

    /// <summary>
    /// Every entry of this universe among <paramref name="ids"/>, read once - or nothing read at all when there
    /// are no ids. An id from another universe resolves to nothing.
    /// </summary>
    public static async Task<Dictionary<Guid, SceneLoreReference>> LoadAsync(
        LorEvolveDbContext db,
        Guid universeId,
        List<Guid> ids,
        CancellationToken cancellationToken) =>
        ids.Count == 0
            ? []
            : await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && ids.Contains(entity.Id))
                .Select(ToReference)
                .ToDictionaryAsync(reference => reference.EntityId, cancellationToken);

    /// <summary>
    /// The references <paramref name="ids"/> name, by name and then id with an ordinal comparer, so the same links
    /// always read the same way. An id <paramref name="references"/> does not hold is left out.
    /// </summary>
    public static List<SceneLoreReference> Listed(
        IEnumerable<Guid> ids,
        Dictionary<Guid, SceneLoreReference> references) =>
    [
        .. ids
            .Select(id => references.GetValueOrDefault(id))
            .OfType<SceneLoreReference>()
            .OrderBy(reference => reference.Name, StringComparer.Ordinal)
            .ThenBy(reference => reference.EntityId),
    ];
}
